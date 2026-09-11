import type {
  EnvironmentScanOptions,
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
    options?: EnvironmentScanOptions
  ): Promise<EnvironmentScanResult>;
  setScanning(scanning: boolean): void;
  setError(message: string): void;
  commit(scan: EnvironmentScanResult): void;
  afterCommit(scan: EnvironmentScanResult): void;
  notify(message: string, options?: RendererNotifyOptions): void;
  scanningMessage(): string;
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
  return reason === "runtime-verification" ? { forcePythonProbe: true } : undefined;
}

export class EnvironmentRefreshCoordinator {
  private latestRequestId = 0;

  constructor(private readonly dependencies: EnvironmentRefreshCoordinatorDependencies) {}

  async refresh(
    settings: Settings,
    reason: EnvironmentRefreshReason = "manual"
  ): Promise<EnvironmentScanResult | null> {
    const requestId = ++this.latestRequestId;
    this.dependencies.reportScan(reason);
    this.dependencies.setScanning(true);
    this.dependencies.setError("");
    this.dependencies.notify(this.dependencies.scanningMessage(), { durationMs: 300_000 });
    this.dependencies.requestRender();

    try {
      const scope = environmentScanScopeForReason(reason);
      const options = environmentScanOptionsForReason(reason);
      const scan = options
        ? await this.dependencies.scan(settings, scope, options)
        : await this.dependencies.scan(settings, scope);
      if (requestId === this.latestRequestId) {
        this.dependencies.commit(scan);
        this.dependencies.afterCommit(scan);
        this.dependencies.notify(this.dependencies.completedMessage());
      }
      return scan;
    } catch (error) {
      if (requestId === this.latestRequestId) {
        const message = this.dependencies.failedMessage(error, reason);
        this.dependencies.setError(message);
        this.dependencies.notify(message, { kind: "error" });
      }
      return null;
    } finally {
      if (requestId === this.latestRequestId) {
        this.dependencies.setScanning(false);
        this.dependencies.requestRender();
      }
    }
  }
}
