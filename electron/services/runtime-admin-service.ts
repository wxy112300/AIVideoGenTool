import type {
  AppState,
  ConnectionResult,
  CustomNodeInstallMode,
  EnvironmentIssue,
  LocalServiceKind,
  Settings
} from "../../src/types.js";
import {
  forceStopComfyProcesses,
  installDepthAnything,
  installAttentionAcceleration,
  installCustomNode,
  installLlamaCppPython,
  repairEnvironmentIssue,
  repairOperationForIssue,
  restartLocalService,
  startLocalService,
  uninstallCustomNode,
  uninstallLlamaCppPython,
  updateComfyUi
} from "./environment.js";
import { AppLogger, safeLogErrorMessage } from "../../src/infrastructure/app-logger.js";
import { ComfyRuntimeStateController } from "../../src/infrastructure/comfy-runtime-state.js";
import type { StateRepository } from "../ports/state-repository.js";

type ProgressListener = (message: string) => void;

export interface RuntimeAdminServiceDependencies {
  store: StateRepository;
  logger: AppLogger;
  runtimeState: ComfyRuntimeStateController;
  isGenerationBusy: () => boolean;
  isQueueWorkerRunning: () => boolean;
  isPromptControllerActive: () => boolean;
  isPromptBusy: () => boolean;
  getQueueWorker: () => Promise<unknown> | null;
  abortQueue: (reason: Error) => void;
  abortPrompt: (reason: Error) => void;
  interruptComfy: (settings: Settings) => Promise<unknown>;
  sendState: (state: AppState) => void;
  waitForWorker: (worker: Promise<unknown> | null, timeoutMs: number) => Promise<boolean>;
  errorMeta: (error: unknown) => Record<string, unknown>;
  startLocalService?: typeof startLocalService;
  forceStopComfyProcesses?: typeof forceStopComfyProcesses;
  restartLocalService?: typeof restartLocalService;
  updateComfyUi?: typeof updateComfyUi;
  repairEnvironmentIssue?: typeof repairEnvironmentIssue;
  installCustomNode?: typeof installCustomNode;
  uninstallCustomNode?: typeof uninstallCustomNode;
  installLlamaCppPython?: typeof installLlamaCppPython;
  uninstallLlamaCppPython?: typeof uninstallLlamaCppPython;
  installAttentionAcceleration?: typeof installAttentionAcceleration;
  installDepthAnything?: typeof installDepthAnything;
}

export class RuntimeAdminService {
  private readonly store: StateRepository;
  private readonly logger: AppLogger;
  private readonly runtimeState: ComfyRuntimeStateController;
  private readonly deps: RuntimeAdminServiceDependencies;
  private readonly startService: typeof startLocalService;
  private readonly forceStopService: typeof forceStopComfyProcesses;
  private readonly restartService: typeof restartLocalService;
  private readonly updateService: typeof updateComfyUi;
  private readonly repairService: typeof repairEnvironmentIssue;
  private readonly installNode: typeof installCustomNode;
  private readonly uninstallNode: typeof uninstallCustomNode;
  private readonly installLlama: typeof installLlamaCppPython;
  private readonly uninstallLlama: typeof uninstallLlamaCppPython;
  private readonly installAttention: typeof installAttentionAcceleration;
  private readonly installDepth: typeof installDepthAnything;

  constructor(deps: RuntimeAdminServiceDependencies) {
    this.store = deps.store;
    this.logger = deps.logger;
    this.runtimeState = deps.runtimeState;
    this.deps = deps;
    this.startService = deps.startLocalService ?? startLocalService;
    this.forceStopService = deps.forceStopComfyProcesses ?? forceStopComfyProcesses;
    this.restartService = deps.restartLocalService ?? restartLocalService;
    this.updateService = deps.updateComfyUi ?? updateComfyUi;
    this.repairService = deps.repairEnvironmentIssue ?? repairEnvironmentIssue;
    this.installNode = deps.installCustomNode ?? installCustomNode;
    this.uninstallNode = deps.uninstallCustomNode ?? uninstallCustomNode;
    this.installLlama = deps.installLlamaCppPython ?? installLlamaCppPython;
    this.uninstallLlama = deps.uninstallLlamaCppPython ?? uninstallLlamaCppPython;
    this.installAttention = deps.installAttentionAcceleration ?? installAttentionAcceleration;
    this.installDepth = deps.installDepthAnything ?? installDepthAnything;
  }

  start(kind: LocalServiceKind, settings: Settings): Promise<ConnectionResult> {
    return this.loggedOperation(
      "service",
      "start",
      "Local service start requested",
      () => this.startService(kind, settings),
      { kind }
    );
  }

  async forceStopComfy(settings: Settings): Promise<ConnectionResult> {
    const runtimeOperationId = this.runtimeState.begin(
      "stopping",
      settings.comfyUrl.replace(/\/+$/, ""),
      "正在终止本地 ComfyUI。"
    );
    this.logger.warn(
      "service",
      "force-stop-requested",
      "ComfyUI force-stop requested"
    );
    this.deps.abortPrompt(new Error("ComfyUI 已被强制终止，提示词扩写已中止"));
    const worker = this.deps.getQueueWorker();
    if (worker) {
      const stopped = await this.store.update((state) => {
        state.queueRunning = false;
      });
      this.deps.sendState(stopped);
      this.deps.abortQueue(new Error("用户强制终止 ComfyUI"));
      await this.deps.interruptComfy(settings).catch(() => undefined);
    }
    const result = await this.forceStopService(settings);
    this.runtimeState.finish(
      runtimeOperationId,
      result.ok ? "stopped" : "error",
      result.message,
      result.ok ? "none" : this.runtimeState.snapshot().ownership
    );
    this.logger.info(
      "service",
      result.ok ? "force-stop-succeeded" : "force-stop-failed",
      result.message,
      { ok: result.ok }
    );
    await this.deps.waitForWorker(worker, 15_000);
    return result;
  }

  restart(kind: LocalServiceKind, settings: Settings): Promise<ConnectionResult> {
    if (this.deps.isQueueWorkerRunning() || this.deps.isPromptControllerActive()) {
      return Promise.resolve({
        ok: false,
        message: "当前仍有队列或提示词任务占用 ComfyUI，请先完成或取消任务。"
      });
    }
    return this.loggedOperation(
      "service",
      "restart",
      "Local service restart requested",
      () => this.restartService(kind, settings),
      { kind }
    );
  }

  update(settings: Settings): Promise<ConnectionResult> {
    return this.loggedOperation(
      "service",
      "comfy-update",
      "ComfyUI update started",
      () => this.updateService(settings)
    );
  }

  repair(
    issueId: EnvironmentIssue["id"],
    settings: Settings
  ): Promise<ConnectionResult> {
    return this.loggedOperation(
      "environment",
      "repair",
      "Environment repair started",
      () => {
        if (issueId === "comfy-database" && (
          this.store.get().queueRunning ||
          this.deps.isQueueWorkerRunning() ||
          this.deps.isPromptControllerActive()
        )) {
          return Promise.resolve({
            ok: false,
            message: "当前仍有队列或提示词任务占用 ComfyUI，请先完成或取消任务后再修复数据库。"
          });
        }
        return this.repairService(issueId, settings);
      },
      { issueId, operation: repairOperationForIssue(issueId) }
    );
  }

  installCustomNode(
    nodeId: string,
    settings: Settings,
    mode: CustomNodeInstallMode | undefined,
    onProgress?: ProgressListener
  ): Promise<ConnectionResult> {
    const resolvedMode = mode ?? "install";
    return this.loggedOperation(
      "environment",
      "custom-node-install",
      "Custom node installation started",
      () => this.installNode(
        nodeId,
        settings,
        (message) => {
          this.logger.info(
            "environment",
            "custom-node-install-progress",
            message,
            { nodeId }
          );
          onProgress?.(message);
        },
        resolvedMode
      ),
      { nodeId, mode: resolvedMode }
    );
  }

  uninstallCustomNode(
    nodeId: string,
    settings: Settings,
    onProgress?: ProgressListener
  ): Promise<ConnectionResult> {
    return this.loggedOperation(
      "environment",
      "custom-node-uninstall",
      "Custom node uninstallation started",
      () => this.uninstallNode(nodeId, settings, (message) => {
        this.logger.info(
          "environment",
          "custom-node-uninstall-progress",
          message,
          { nodeId }
        );
        onProgress?.(message);
      }),
      { nodeId }
    );
  }

  installLlamaCppPython(
    settings: Settings,
    onProgress?: ProgressListener
  ): Promise<ConnectionResult> {
    return this.loggedOperation(
      "environment",
      "llama-cpp-python-install",
      "llama-cpp-python installation started",
      () => this.installLlama(settings, (message) => {
        this.logger.info(
          "environment",
          "llama-cpp-python-install-progress",
          message
        );
        onProgress?.(message);
      })
    );
  }

  uninstallLlamaCppPython(
    settings: Settings,
    onProgress?: ProgressListener
  ): Promise<ConnectionResult> {
    return this.loggedOperation(
      "environment",
      "llama-cpp-python-uninstall",
      "llama-cpp-python uninstallation started",
      () => this.uninstallLlama(settings, (message) => {
        this.logger.info(
          "environment",
          "llama-cpp-python-uninstall-progress",
          message
        );
        onProgress?.(message);
      })
    );
  }

  installAttentionAcceleration(
    settings: Settings,
    onProgress?: ProgressListener
  ): Promise<ConnectionResult> {
    if (this.deps.isGenerationBusy() || this.deps.isPromptBusy()) {
      return Promise.resolve({
        ok: false,
        message: "当前有生成或提示词任务正在运行，停止任务后才能升级 H3 运行环境。"
      });
    }
    return this.loggedOperation(
      "environment",
      "attention-install",
      "Attention acceleration installation started",
      () => this.installAttention(settings, (message) => {
        onProgress?.(message);
      })
    );
  }

  installDepthAnything(
    settings: Settings,
    onProgress?: ProgressListener
  ): Promise<ConnectionResult> {
    if (this.deps.isGenerationBusy() || this.deps.isPromptBusy()) {
      return Promise.resolve({
        ok: false,
        message: "当前有生成或提示词任务正在运行，停止任务后才能安装 Depth Anything。"
      });
    }
    return this.loggedOperation(
      "environment",
      "depth-anything-install",
      "Depth Anything installation started",
      () => this.installDepth(settings, (message) => {
        this.logger.info(
          "environment",
          "depth-anything-install-progress",
          message
        );
        onProgress?.(message);
      })
    );
  }

  private async loggedOperation<T extends ConnectionResult>(
    scope: string,
    event: string,
    startedMessage: string,
    operation: () => Promise<T>,
    meta: Record<string, unknown> = {}
  ): Promise<T> {
    const startedAt = Date.now();
    this.logger.info(scope, `${event}-started`, startedMessage, meta);
    try {
      const result = await operation();
      this.logger.info(
        scope,
        result.ok ? `${event}-succeeded` : `${event}-failed`,
        result.message,
        { ...meta, ok: result.ok, durationMs: Date.now() - startedAt }
      );
      return result;
    } catch (error) {
      this.logger.error(
        scope,
        `${event}-failed`,
        safeLogErrorMessage(error),
        {
          ...meta,
          durationMs: Date.now() - startedAt,
          ...this.deps.errorMeta(error)
        }
      );
      throw error;
    }
  }
}
