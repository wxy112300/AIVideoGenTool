import type {
  ConnectionKind,
  ConnectionResult,
  EnvironmentScanResult,
  EnvironmentScanScope,
  Settings
} from "../../src/types.js";
import { testComfyUi } from "./comfy-ui.js";
import { scanEnvironment } from "./environment.js";
import { AppLogger, safeLogErrorMessage } from "../../src/infrastructure/app-logger.js";

export interface EnvironmentQueryServiceDependencies {
  logger: AppLogger;
  errorMeta: (error: unknown) => Record<string, unknown>;
  testComfyUi?: (settings: Settings) => Promise<string>;
  scanEnvironment?: (
    settings: Settings,
    scope: EnvironmentScanScope
  ) => Promise<EnvironmentScanResult>;
}

function normalizeScope(requestedScope: unknown): EnvironmentScanScope {
  return requestedScope === "runtime" || requestedScope === "dependencies"
    ? requestedScope
    : "full";
}

export class EnvironmentQueryService {
  private readonly logger: AppLogger;
  private readonly errorMeta: (error: unknown) => Record<string, unknown>;
  private readonly testService: (settings: Settings) => Promise<string>;
  private readonly scanService: (
    settings: Settings,
    scope: EnvironmentScanScope
  ) => Promise<EnvironmentScanResult>;

  constructor(deps: EnvironmentQueryServiceDependencies) {
    this.logger = deps.logger;
    this.errorMeta = deps.errorMeta;
    this.testService = deps.testComfyUi ?? testComfyUi;
    this.scanService = deps.scanEnvironment ?? scanEnvironment;
  }

  async testConnection(
    kind: ConnectionKind,
    settings: Settings
  ): Promise<ConnectionResult> {
    const startedAt = Date.now();
    this.logger.info(
      "service",
      "connection-test-started",
      "Service connection test started",
      { kind }
    );
    try {
      const message = await this.testService(settings);
      this.logger.info(
        "service",
        "connection-test-succeeded",
        "Service connection test succeeded",
        { kind, durationMs: Date.now() - startedAt }
      );
      return { ok: true, message };
    } catch (error) {
      this.logger.warn(
        "service",
        "connection-test-failed",
        "Service connection test failed",
        {
          kind,
          durationMs: Date.now() - startedAt,
          error: safeLogErrorMessage(error)
        }
      );
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async scan(
    settings: Settings,
    requestedScope: unknown
  ): Promise<EnvironmentScanResult> {
    const scope = normalizeScope(requestedScope);
    const startedAt = Date.now();
    this.logger.info(
      "environment",
      "scan-started",
      "Environment scan started",
      { requestedScope: scope }
    );
    try {
      const result = await this.scanService(settings, scope);
      this.logger.info(
        "environment",
        "scan-finished",
        "Environment scan finished",
        {
          durationMs: Date.now() - startedAt,
          requestedScope: scope,
          checkedFrom: result.comfyCompatibility.checkedFrom,
          gpuCount: result.gpus.length,
          modelProfiles: result.modelProfiles.length,
          availableModels: result.modelProfiles.filter((profile) => profile.available).length,
          customNodes: result.customNodes.length,
          installedCustomNodes: result.customNodes.filter(
            (node) => node.installed && !node.loadError
          ).length,
          issueCount: result.issues.length
        }
      );
      return result;
    } catch (error) {
      this.logger.error(
        "environment",
        "scan-failed",
        safeLogErrorMessage(error),
        {
          durationMs: Date.now() - startedAt,
          ...this.errorMeta(error)
        }
      );
      throw error;
    }
  }
}
