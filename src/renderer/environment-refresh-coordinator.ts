import type {
  EnvironmentScanOptions,
  EnvironmentScanProgress,
  EnvironmentScanResult,
  EnvironmentScanScope,
  Settings
} from "../types";
import type { RendererNotifyOptions } from "./contracts";

export type EnvironmentRefreshReason =
  | "startup"
  | "manual"
  | "settings-change"
  | "service-change"
  | "dependency-change"
  | "runtime-verification";

export interface EnvironmentRefreshCoordinatorDependencies {
  scan(
    settings: Settings,
    scope: EnvironmentScanScope,
    options?: EnvironmentScanOptions,
    onProgress?: (progress: EnvironmentScanProgress) => void
  ): Promise<EnvironmentScanResult>;
  setScanning(scanning: boolean): void;
  setError(message: string): void;
  commit(scan: EnvironmentScanResult): void;
  afterCommit(scan: EnvironmentScanResult): void;
  notify(message: string, options?: RendererNotifyOptions): void;
  scanningMessage(): string;
  progressMessage?(progress: EnvironmentScanProgress): string;
  completedMessage(): string;
  failedMessage(error: unknown, reason: EnvironmentRefreshReason): string;
  requestRender(): void;
  reportScan(reason: EnvironmentRefreshReason): void;
}

export function environmentScanScopeForReason(
  reason: EnvironmentRefreshReason
): EnvironmentScanScope {
  if (reason === "service-change") return "runtime";
  if (reason === "runtime-verification") return "dependencies";
  if (reason === "dependency-change") return "dependencies";
  return "full";
}

export function environmentScanOptionsForReason(
  reason: EnvironmentRefreshReason
): EnvironmentScanOptions | undefined {
  return reason === "runtime-verification" ? { forcePythonProbe: true }
    : reason === "manual" ? { refreshReleaseVersions: true } : undefined;
}

export class EnvironmentRefreshCoordinator {
  private latestRequestId = 0;
  private lastScan: EnvironmentScanResult | null = null;

  constructor(private readonly dependencies: EnvironmentRefreshCoordinatorDependencies) {}

  async refresh(
    settings: Settings,
    reason: EnvironmentRefreshReason = "manual"
  ): Promise<EnvironmentScanResult | null> {
    const requestId = ++this.latestRequestId;
    let active = true;
    this.dependencies.reportScan(reason);
    this.dependencies.setScanning(true);
    this.dependencies.setError("");
    this.dependencies.notify(this.dependencies.progressMessage?.({ stage: "environment", completed: 0, total: 4 }) ?? this.dependencies.scanningMessage(), {
      key: "environment-scan", durationMs: 300_000,
      ...(this.dependencies.progressMessage ? { progress: { completed: 0, total: 4 } } : {})
    });
    this.dependencies.requestRender();

    try {
      // Runtime-only scans intentionally reuse Python evidence. A failed native
      // probe needs a dependency scan when the service changes so it can recover.
      const scope = reason === "service-change" && this.lastScan?.attentionAcceleration?.probeState === "failed"
        ? "dependencies"
        : environmentScanScopeForReason(reason);
      const options = environmentScanOptionsForReason(reason);
      const scan = this.dependencies.progressMessage
        ? await this.dependencies.scan(settings, scope, options, (progress) => {
          if (!active || requestId !== this.latestRequestId) return;
          this.dependencies.notify(this.dependencies.progressMessage!(progress), {
            key: "environment-scan", durationMs: 300_000, progress, renderPage: false
          });
        })
        : options
        ? await this.dependencies.scan(settings, scope, options)
        : await this.dependencies.scan(settings, scope);
      if (requestId === this.latestRequestId) {
        this.lastScan = scan;
        this.dependencies.commit(scan);
        this.dependencies.afterCommit(scan);
        this.dependencies.notify(this.dependencies.completedMessage(), { key: "environment-scan" });
      }
      return scan;
    } catch (error) {
      if (requestId === this.latestRequestId) {
        const message = this.dependencies.failedMessage(error, reason);
        this.dependencies.setError(message);
        this.dependencies.notify(message, { key: "environment-scan", kind: "error" });
      }
      return null;
    } finally {
      active = false;
      if (requestId === this.latestRequestId) {
        this.dependencies.setScanning(false);
        this.dependencies.requestRender();
      }
    }
  }
}
