import type { AppState, Settings } from "../../src/types.js";
import type { StateRepository } from "../ports/state-repository.js";
import type { AppLogger } from "../../src/infrastructure/app-logger.js";
import { safeLogErrorMessage } from "../../src/infrastructure/app-logger.js";
import { localEndpoint } from "./local-service-process.js";
import type { ComfyRuntimeStateController } from "../../src/infrastructure/comfy-runtime-state.js";

export interface LifecycleQueuePort {
  readonly cleanupWorker: Promise<unknown> | null;
  readonly runningWorker: Promise<unknown> | null;
  abort(reason: Error): void;
}

export interface LifecyclePromptPort {
  readonly runningWorker: Promise<unknown> | null;
  abort(reason: Error): void;
  handleComfyRuntimeFailure(message: string): void;
  releaseRuntime(settings: Settings): Promise<unknown>;
}

export interface LifecycleRuntimeProfileResult {
  ok: boolean;
  restarted: boolean;
  desiredProfile: string;
  previousProfile: string;
  message: string;
}

export interface LifecycleCoordinatorDependencies {
  store: StateRepository;
  logger: AppLogger;
  runtimeState: ComfyRuntimeStateController;
  getQueue(): LifecycleQueuePort;
  prompt: LifecyclePromptPort;
  strata?: { abort(reason: Error): void; shutdown(): Promise<unknown> };
  sendState(state: AppState): void;
  interruptComfy(settings: Settings): Promise<unknown>;
  freeMemory(settings: Settings): Promise<unknown>;
  forceStopComfyProcesses(settings: Settings): Promise<{ ok: boolean; message: string }>;
  alignRuntimeProfile(settings: Settings): Promise<LifecycleRuntimeProfileResult>;
  isLocalComfyUrl(value: string): boolean;
}

export interface OwnedComfyProcessExit {
  processId: number;
  code: number | null;
  signal: NodeJS.Signals | null;
}

export interface ExitInterruptionResult {
  interrupted: boolean;
  workerSettled: boolean;
}

const workerShutdownTimeoutMs = 15_000;
const forcedInterruptTimeoutMs = 2_500;

function waitWithTimeout(
  promise: Promise<unknown> | null,
  timeoutMs: number
): Promise<boolean> {
  if (!promise) return Promise.resolve(true);
  return new Promise<boolean>(resolve => {
    const finish = (settled: boolean) => { clearTimeout(timer); resolve(settled); };
    const timer = setTimeout(() => finish(false), timeoutMs);
    void promise.then(() => finish(true), () => finish(true));
  });
}

/**
 * Owns process-local startup and shutdown coordination without depending on
 * Electron. The shell decides whether a close is allowed; this service only
 * executes the already-selected cleanup policy.
 */
export class LifecycleCoordinator {
  private startupPromise: Promise<LifecycleRuntimeProfileResult | null> | null = null;
  private ownedRuntimeStopPromise: Promise<{ ok: boolean; message: string }> | null = null;

  constructor(private readonly deps: LifecycleCoordinatorDependencies) {}

  async start(settings: Settings): Promise<LifecycleRuntimeProfileResult | null> {
    if (this.startupPromise) return this.startupPromise;
    const operation = this.startImpl(settings);
    this.startupPromise = operation;
    try {
      return await operation;
    } finally {
      if (this.startupPromise === operation) this.startupPromise = null;
    }
  }

  async interruptForExit(
    waitForWorker: boolean,
    queueCleanupOnly = false
  ): Promise<ExitInterruptionResult> {
    const settings = this.deps.store.get().settings;
    if (queueCleanupOnly) {
      const cleanupWorker = this.deps.getQueue().cleanupWorker;
      if (!waitForWorker) {
        const forced = await this.stopOwnedComfyProcesses(settings);
        this.deps.logger.info(
          "service",
          forced.ok ? "cleanup-force-stop-succeeded" : "cleanup-force-stop-failed",
          forced.message,
          { ok: forced.ok }
        );
        return { interrupted: forced.ok, workerSettled: false };
      }
      const [cleanupSettled, workerSettled] = await Promise.all([
        waitWithTimeout(cleanupWorker, workerShutdownTimeoutMs),
        waitWithTimeout(this.deps.getQueue().runningWorker, workerShutdownTimeoutMs)
      ]);
      return {
        interrupted: true,
        workerSettled: cleanupSettled && workerSettled
      };
    }

    const hadNativePrompt = Boolean(this.deps.prompt.runningWorker);
    const next = await this.deps.store.update((state) => {
      state.queueRunning = false;
    });
    this.deps.sendState(next);
    this.deps.getQueue().abort(new Error("应用退出，任务已中止"));
    this.deps.prompt.abort(new Error("应用退出，提示词扩写已中止"));
    this.deps.strata?.abort(new Error("应用退出，Strata 操作已中止"));

    const workers = waitForWorker ? Promise.all([
      waitWithTimeout(this.deps.getQueue().runningWorker, workerShutdownTimeoutMs),
      waitWithTimeout(this.deps.prompt.runningWorker, workerShutdownTimeoutMs)
    ]) : Promise.resolve([false, false]);

    const interruptPromise = this.deps.interruptComfy(settings).then(
      async () => {
        this.deps.logger.info(
          "comfy",
          "shutdown-interrupt-succeeded",
          "ComfyUI interruption requested during shutdown"
        );
        await this.deps.freeMemory(settings).catch(() => undefined);
        return true;
      },
      (error) => {
        this.deps.logger.warn(
          "comfy",
          "shutdown-interrupt-failed",
          "ComfyUI interruption failed during shutdown",
          { error: safeLogErrorMessage(error) }
        );
        return false;
      }
    );
    const interruptSettled = await waitWithTimeout(interruptPromise,
      waitForWorker ? workerShutdownTimeoutMs : forcedInterruptTimeoutMs);
    const interrupted = interruptSettled ? await interruptPromise : false;
    const [workerSettled, promptSettled] = await workers;
    return {
      interrupted: interrupted || (hadNativePrompt && promptSettled),
      workerSettled: workerSettled && promptSettled
    };
  }

  async stopOwnedRuntime(settings: Settings): Promise<{ ok: boolean; message: string }> {
    if (this.ownedRuntimeStopPromise) return this.ownedRuntimeStopPromise;
    const operation = this.stopOwnedRuntimeImpl(settings).then((result) => {
      if (!result.ok && this.ownedRuntimeStopPromise === operation) this.ownedRuntimeStopPromise = null;
      return result;
    });
    this.ownedRuntimeStopPromise = operation;
    return operation;
  }

  handleOwnedComfyProcessExit(event: OwnedComfyProcessExit): void {
    const runtime = this.deps.runtimeState.snapshot();
    if (runtime.phase === "restarting" || runtime.phase === "stopping") {
      this.deps.logger.info(
        "comfy",
        "owned-process-exit-expected",
        "Ignored the expected exit of a ComfyUI process during an explicit lifecycle operation",
        {
          childProcessId: event.processId,
          phase: runtime.phase,
          operationId: runtime.operationId
        }
      );
      return;
    }
    this.deps.prompt.handleComfyRuntimeFailure("ComfyUI 已退出。");
    this.deps.runtimeState.markStopped(
      runtime.endpoint,
      `ComfyUI 进程已退出（PID ${event.processId}${event.code === null ? "" : `，退出码 ${event.code}`}${event.signal ? `，信号 ${event.signal}` : ""}）。`,
      "none"
    );
  }

  private async startImpl(settings: Settings): Promise<LifecycleRuntimeProfileResult | null> {
    try {
      const result = await this.deps.alignRuntimeProfile(settings);
      this.deps.logger.info(
        "comfy",
        result.ok ? "startup-runtime-takeover-succeeded" : "startup-runtime-takeover-failed",
        result.message,
        {
          ok: result.ok,
          restarted: result.restarted,
          previousProfile: result.previousProfile,
          desiredProfile: result.desiredProfile
        }
      );
      return result;
    } catch (error) {
      this.deps.logger.error(
        "comfy",
        "startup-runtime-takeover-failed",
        safeLogErrorMessage(error)
      );
      return null;
    }
  }

  private async stopOwnedRuntimeImpl(
    settings: Settings
  ): Promise<{ ok: boolean; message: string }> {
    const strataStopped = this.deps.strata?.shutdown().then(
      () => ({ ok: true, message: "Strata 自有服务已停止。" }),
      () => ({ ok: false, message: "Strata 清理未完成，请重试停止；自有进程仍可能占用资源。" })
    );
    const promptReleased = (async () => {
      try {
        await this.deps.prompt.releaseRuntime(settings);
      } catch (error) {
        this.deps.logger.warn("prompt", "runtime-release-failed",
          "提示词模型 lease 释放失败，继续执行 ComfyUI owned-process 清理",
          { error: safeLogErrorMessage(error) });
      }
    })();
    const stopped = await this.stopOwnedComfyProcesses(settings).catch((error) => ({
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    }));
    this.deps.logger.info(
      "app",
      stopped.ok ? "owned-comfy-stopped" : "owned-comfy-stop-skipped",
      stopped.message
    );
    const strata = await strataStopped;
    if (!await waitWithTimeout(promptReleased, forcedInterruptTimeoutMs)) {
      this.deps.logger.warn("prompt", "runtime-release-timeout", "提示词释放未完成；自有服务停止检查已结束。");
    }
    if (strata) this.deps.logger.info("app", strata.ok ? "owned-strata-stopped" : "owned-strata-stop-failed", strata.message);
    return strata && !strata.ok ? { ok: false, message: `${stopped.message} ${strata.message}` }
      : !this.isManagedLocalEndpoint(settings) ? { ...stopped, ok: true } : stopped;
  }

  private isManagedLocalEndpoint(settings: Settings): boolean {
    return this.deps.isLocalComfyUrl(settings.comfyUrl) && localEndpoint(settings.comfyUrl, 8188) !== null;
  }

  private async stopOwnedComfyProcesses(
    settings: Settings
  ): Promise<{ ok: boolean; message: string }> {
    if (!this.isManagedLocalEndpoint(settings)) {
      return {
        ok: false,
        message: "远程 ComfyUI 仅支持连接，应用不会终止远程或本机进程。"
      };
    }
    return this.deps.forceStopComfyProcesses(settings);
  }
}
