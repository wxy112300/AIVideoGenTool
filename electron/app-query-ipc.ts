import type { IpcMain } from "electron";
import type {
  AppState,
  AppLogSnapshot,
  ComfyRuntimeOwnership,
  ComfyRuntimeState,
  NotificationKind,
  PerformanceMetrics,
  Settings
} from "../src/types.js";
import type { PromptRuntimeState } from "../src/core/prompt-runtime-state.js";
import type { AppLogger } from "../src/infrastructure/app-logger.js";
import type { StateRepository } from "./ports/state-repository.js";

interface RuntimeStatePort {
  snapshot(): ComfyRuntimeState;
  observeReachability(
    reachable: boolean,
    endpoint: string,
    ownership?: ComfyRuntimeOwnership,
    taskActive?: boolean
  ): ComfyRuntimeState;
}

export interface AppQueryIpcDependencies {
  ipc: IpcMain;
  store: Pick<StateRepository, "get">;
  waitForInitialState: () => Promise<void>;
  getComfyRuntimeState: () => ComfyRuntimeState;
  getPromptRuntimeState: () => PromptRuntimeState;
  getAppVersion: () => string;
  logger: Pick<AppLogger, "recent" | "error" | "info" | "warn">;
  getCrashDumpsDirectory: () => string;
  performance: (settings: Settings) => Promise<PerformanceMetrics>;
  reconcileConfiguredComfyListenerOwnership: (settings: Settings) => Promise<boolean>;
  runtimeState: RuntimeStatePort;
  hasRunningTask: () => boolean;
}

function appLogSnapshot(
  deps: AppQueryIpcDependencies,
  limit?: number
): AppLogSnapshot {
  let crashDirectory = "";
  try {
    crashDirectory = deps.getCrashDumpsDirectory();
  } catch {
    // CrashReporter is initialized after Electron is ready.
  }
  return {
    ...deps.logger.recent(limit),
    ...(crashDirectory ? { crashDirectory } : {})
  };
}

export function registerAppQueryIpc(deps: AppQueryIpcDependencies): void {
  deps.ipc.handle("state:get", async () => {
    await deps.waitForInitialState();
    return deps.store.get() as AppState;
  });
  deps.ipc.handle("comfy-runtime:get", () => deps.getComfyRuntimeState());
  deps.ipc.handle("prompt-runtime:get", () => deps.getPromptRuntimeState());
  deps.ipc.handle("app:version", () => deps.getAppVersion());
  deps.ipc.handle("logs:read", (_event, limit?: number) =>
    appLogSnapshot(deps, typeof limit === "number" ? limit : undefined)
  );
  deps.ipc.handle(
    "logs:renderer-error",
    (_event, message: string, meta?: Record<string, unknown>) => {
      deps.logger.error("renderer", "client-error", message, meta);
    }
  );
  deps.ipc.handle("logs:user-action", () => undefined);
  deps.ipc.handle(
    "logs:notification",
    (_event, kind: NotificationKind, message: string) => {
      const event = kind.replaceAll("-", "_");
      const meta = { notificationKind: kind };
      if (kind === "error") {
        deps.logger.error("ui", event, message, meta);
      } else if (kind === "warning") {
        deps.logger.warn("ui", event, message, meta);
      } else {
        deps.logger.info("ui", event, message, meta);
      }
    }
  );
  deps.ipc.handle("performance:get", async (_event, settings: Settings) => {
    const metrics = await deps.performance(settings);
    const currentOwnership = deps.runtimeState.snapshot().ownership;
    const ownership = metrics.comfyConnected && currentOwnership === "unknown" &&
      await deps.reconcileConfiguredComfyListenerOwnership(settings)
      ? "app"
      : currentOwnership;
    deps.runtimeState.observeReachability(
      metrics.comfyConnected,
      settings.comfyUrl.replace(/\/+$/, ""),
      ownership,
      deps.hasRunningTask()
    );
    return metrics;
  });
}
