import type {
  ConnectionResult,
  CustomNodeStatus,
  EnvironmentScanResult,
  Settings
} from "../../../types";

export type CustomNodeInstallPhase = "idle" | "installing" | "restarting" | "scanning";

export interface CustomNodeInstallQueueSnapshot {
  phase: CustomNodeInstallPhase;
  activeNodeId: string;
  queuedNodeIds: string[];
  batchNodeIds: string[];
}

export interface CustomNodeInstallQueueMessages {
  queued(name: string, position: number): string;
  processing: string;
  restartLog(message: string): string;
  installFailed(name: string, message: string): string;
  restartFailed(message: string): string;
  manualRestartRequired(message: string): string;
  readyCheckFailed(name: string, detail?: string): string;
  completed(successCount: number, failureCount: number): string;
}

export interface CustomNodeInstallQueueDependencies {
  install(nodeId: string, settings: Settings): Promise<ConnectionResult>;
  restart(settings: Settings): Promise<ConnectionResult>;
  scan(settings: Settings): Promise<EnvironmentScanResult>;
  nodeName(nodeId: string): string;
  getLog(nodeId: string): string;
  setLog(nodeId: string, log: string): void;
  setEnvironmentScan(scan: EnvironmentScanResult): void;
  notify(message: string, kind: "info" | "warning" | "error"): void;
  onSnapshot(snapshot: CustomNodeInstallQueueSnapshot): void;
  messages: CustomNodeInstallQueueMessages;
}

export function customNodeIdsForBulkAction(nodes: readonly CustomNodeStatus[]): string[] {
  const eligible = nodes.filter((node) => node.bulkInstall !== false);
  const actionable = eligible.filter((node) =>
    !node.installed || node.updateAvailable
  );
  return actionable.map((node) => node.id);
}

function cloneSettings(settings: Settings): Settings {
  return structuredClone(settings);
}

export class CustomNodeInstallQueue {
  private readonly queuedNodeIds: string[] = [];
  private activeNodeId = "";
  private phase: CustomNodeInstallPhase = "idle";
  private readonly batchNodeIds: string[] = [];
  private batchSettings: Settings | null = null;
  private worker: Promise<void> | null = null;

  constructor(private readonly dependencies: CustomNodeInstallQueueDependencies) {}

  snapshot(): CustomNodeInstallQueueSnapshot {
    return {
      phase: this.phase,
      activeNodeId: this.activeNodeId,
      queuedNodeIds: [...this.queuedNodeIds],
      batchNodeIds: [...this.batchNodeIds]
    };
  }

  enqueue(nodeId: string, settings: Settings): { accepted: boolean; position: number } {
    if (!nodeId || this.batchNodeIds.includes(nodeId)) {
      return { accepted: false, position: 0 };
    }
    if (this.phase === "restarting" || this.phase === "scanning") {
      return { accepted: false, position: 0 };
    }
    if (!this.batchSettings) this.batchSettings = cloneSettings(settings);
    this.queuedNodeIds.push(nodeId);
    this.batchNodeIds.push(nodeId);
    const position = (this.activeNodeId ? 1 : 0) + this.queuedNodeIds.length;
    this.appendLog(nodeId, this.dependencies.messages.queued(
      this.dependencies.nodeName(nodeId),
      position
    ));
    this.emit();
    if (!this.worker) {
      this.worker = this.run().finally(() => {
        this.worker = null;
      });
    }
    return { accepted: true, position };
  }

  async waitForIdle(): Promise<void> {
    await this.worker;
  }

  private appendLog(nodeId: string, message: string): void {
    this.dependencies.setLog(
      nodeId,
      [this.dependencies.getLog(nodeId), message].filter(Boolean).join("\n\n")
    );
  }

  private emit(): void {
    this.dependencies.onSnapshot(this.snapshot());
  }

  private async run(): Promise<void> {
    const successfulNodeIds: string[] = [];
    const failedNodeIds = new Set<string>();
    const settings = this.batchSettings!;
    this.phase = "installing";
    this.emit();

    while (this.queuedNodeIds.length) {
      const nodeId = this.queuedNodeIds.shift()!;
      const name = this.dependencies.nodeName(nodeId);
      this.activeNodeId = nodeId;
      this.appendLog(nodeId, this.dependencies.messages.processing);
      this.emit();
      try {
        const result = await this.dependencies.install(nodeId, settings);
        this.appendLog(nodeId, result.log || result.message);
        if (!result.ok) throw new Error(result.message);
        successfulNodeIds.push(nodeId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failedNodeIds.add(nodeId);
        this.appendLog(nodeId, message);
        this.dependencies.notify(
          this.dependencies.messages.installFailed(name, message),
          "error"
        );
      }
    }

    this.activeNodeId = "";
    if (successfulNodeIds.length) {
      this.phase = "restarting";
      this.emit();
      const restarted: ConnectionResult = await this.dependencies.restart(settings).catch((error) => ({
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      }));
      for (const nodeId of successfulNodeIds) {
        this.appendLog(nodeId, this.dependencies.messages.restartLog(restarted.message));
      }
      if (!restarted.ok) {
        if (restarted.manualRestartRequired) {
          this.dependencies.notify(
            this.dependencies.messages.manualRestartRequired(restarted.message),
            "warning"
          );
        } else {
          successfulNodeIds.forEach((nodeId) => failedNodeIds.add(nodeId));
          this.dependencies.notify(
            this.dependencies.messages.restartFailed(restarted.message),
            "error"
          );
        }
      } else {
        this.phase = "scanning";
        this.emit();
        try {
          const scan = await this.dependencies.scan(settings);
          this.dependencies.setEnvironmentScan(scan);
          for (const nodeId of successfulNodeIds) {
            const nodeStatus = scan.customNodes.find((node) => node.id === nodeId);
            if (nodeStatus?.loaded) continue;
            const detail = nodeStatus?.loadError || nodeStatus?.compatibilityNotice || "";
            const message = this.dependencies.messages.readyCheckFailed(
              this.dependencies.nodeName(nodeId),
              detail
            );
            this.appendLog(nodeId, message);
            this.dependencies.notify(message, "warning");
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          successfulNodeIds.forEach((nodeId) => failedNodeIds.add(nodeId));
          this.dependencies.notify(message, "error");
        }
      }
    }

    const successCount = successfulNodeIds.filter((nodeId) => !failedNodeIds.has(nodeId)).length;
    const failureCount = failedNodeIds.size;
    this.dependencies.notify(
      this.dependencies.messages.completed(successCount, failureCount),
      failureCount ? "warning" : "info"
    );
    this.phase = "idle";
    this.batchSettings = null;
    this.batchNodeIds.length = 0;
    this.emit();
  }
}
