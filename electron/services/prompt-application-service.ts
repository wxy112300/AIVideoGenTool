import type {
  ConnectionResult,
  EnhanceRequest,
  PromptExecutionPreflight,
  PromptProgress,
  PromptProgressReporter,
  PromptProgressStage,
  Settings
} from "../../src/types.js";
import {
  isH3ReferenceAutoPrompt,
  validateH3ReferenceAutoPrompt
} from "../../src/core/h3-auto-prompter.js";
import {
  comfyPromptQueueLocation,
  comfyQueueContainsAnyPromptId
} from "../../src/core/comfy-queue.js";
import {
  promptEnhanceLogContext
} from "../../src/core/prompt-enhance-log.js";
import {
  isComfyMultimodalPromptModel,
  isGemmaPromptModel,
  isQwenVlPeftPromptModel,
  promptModelBackend,
  promptRuntimeForSettings
} from "../../src/core/prompt-models.js";
import type { PromptOperationOrigin } from "../../src/core/prompt-runtime-state.js";
import type { StateRepository } from "../ports/state-repository.js";
import {
  alignLocalComfyUiRuntimeProfile,
  scanEnvironment,
  startLocalService
} from "./environment.js";
import {
  freeMemory,
  enhancePromptWithComfyUi,
  interrupt,
  jsonRequest,
  testComfyUi,
  warmNativePromptModel
} from "./comfy-ui.js";
import {
  comfyUiSettingsForPromptRuntime
} from "../../src/infrastructure/comfy-runtime-policy.js";
import {
  enhancePromptWithMultimodalComfyUi,
  multimodalExecutionPreflight,
  retainedMultimodalDeviceFor,
  releaseMultimodalPromptModel,
  warmMultimodalPromptModel
} from "./multimodal-prompt.js";
import {
  enhancePromptWithQwenVlPeft,
  QwenVlRuntimeValidationError,
  validateQwenVlRuntimeChoices,
  warmQwenVlPeftPromptModel
} from "./qwenvl-prompt.js";
import { ensureQwenVlManagedMetadata } from "./qwenvl-model-assets.js";
import {
  enhancePromptWithH3PromptWriter,
  releaseH3PromptWriter,
  warmH3PromptWriter
} from "./h3-prompt-writer.js";
import { withPromptExtensionMedia } from "./prompt-extension-media.js";
import { getPerformanceMetrics } from "./performance.js";
import { captureComfyUiLogFailure } from "./comfy-log-bridge.js";
import type { AppLogger } from "../../src/infrastructure/app-logger.js";
import { safeLogErrorMessage } from "../../src/infrastructure/app-logger.js";
import { PromptRuntimeManager } from "./prompt-runtime-manager.js";

type PromptBackend = Exclude<ReturnType<typeof promptModelBackend>, null>;
type PromptWorker = Promise<unknown>;
type PromptCancellation = { recovered: boolean; settled: boolean };

export interface PromptApplicationServiceDependencies {
  store: StateRepository;
  logger: AppLogger;
  promptRuntimeManager: PromptRuntimeManager;
  /** Queue state is owned by QueueService and intentionally queried lazily. */
  isQueueBusy(): boolean;
  sendProgress(progress: PromptProgress): void;
  errorMeta(error: unknown): Record<string, unknown>;
}

/**
 * Application orchestration for all local prompt backends.
 *
 * Backend modules still own workflow construction, uploads and ComfyUI node
 * contracts. This service owns the process-local lease, operation identity,
 * cancellation, progress and cleanup rules that must be shared by every
 * backend and every Create mode.
 */
export class PromptApplicationService {
  private nativePromptController: AbortController | null = null;
  private nativePromptWorker: PromptWorker | null = null;
  private promptCancellationWorker: Promise<PromptCancellation> | null = null;
  private retainedPromptRuntime: {
    backend: ReturnType<typeof promptModelBackend>;
    modelId: string;
  } | null = null;

  constructor(private readonly deps: PromptApplicationServiceDependencies) {}

  get activeController(): AbortController | null {
    return this.nativePromptController;
  }

  get runningWorker(): PromptWorker | null {
    return this.nativePromptWorker;
  }

  get cancellationWorker(): Promise<PromptCancellation> | null {
    return this.promptCancellationWorker;
  }

  /** Matches the old queue gate: only an actively running prompt worker blocks queue start. */
  isWorkerBusy(): boolean {
    return Boolean(this.nativePromptWorker);
  }

  /** Includes cancellation cleanup for settings/runtime admin operations. */
  isPromptBusy(): boolean {
    return Boolean(this.nativePromptWorker || this.promptCancellationWorker);
  }

  abort(reason: Error): void {
    this.nativePromptController?.abort(reason);
  }

  handleComfyRuntimeFailure(message: string): void {
    this.retainedPromptRuntime = null;
    this.nativePromptController?.abort(new Error(message));
  }

  async preflight(): Promise<PromptExecutionPreflight> {
    const settings = this.deps.store.get().settings;
    if (!isComfyMultimodalPromptModel(settings.promptModelId)) {
      return multimodalExecutionPreflight(settings.promptModelId, null, null);
    }
    const retainedDevice = retainedMultimodalDeviceFor(settings.promptModelId);
    if (retainedDevice === "GPU") {
      return {
        ...multimodalExecutionPreflight(settings.promptModelId, null, null),
        requiresCpuConfirmation: false
      };
    }
    if (!retainedDevice) await freeMemory(settings).catch(() => undefined);
    const metrics = await getPerformanceMetrics(settings).catch(() => null);
    const preflight = multimodalExecutionPreflight(
      settings.promptModelId,
      metrics?.vramUsedBytes ?? null,
      metrics?.vramTotalBytes ?? null
    );
    return retainedDevice === "CPU"
      ? { ...preflight, requiresCpuConfirmation: true }
      : preflight;
  }

  async start(allowCpuFallback = false): Promise<ConnectionResult> {
    const settings = this.deps.store.get().settings;
    const runtime = promptRuntimeForSettings(settings);
    const promptBackend = promptModelBackend(settings.promptModelId);
    const startedAt = Date.now();
    this.deps.logger.info("prompt", "service-start-requested", "Prompt service start requested", {
      runtime,
      promptModelId: settings.promptModelId,
      promptBackend
    });
    if (this.deps.isQueueBusy()) {
      return { ok: false, message: "当前有视频任务正在运行，暂不能启动提示词模型。" };
    }
    if (this.isPromptBusy()) {
      return { ok: false, message: "提示词模型正在启动或使用中。" };
    }
    if (this.retainedPromptRuntime !== null) {
      await this.releaseRuntime(settings);
    }
    const controller = new AbortController();
    this.nativePromptController = controller;
    this.deps.promptRuntimeManager.setModel("warming", settings.promptModelId);
    const worker = this.warmSelectedPromptRuntime(
      settings,
      promptBackend,
      controller.signal,
      allowCpuFallback === true
    );
    this.nativePromptWorker = worker;
    try {
      await worker;
      this.retainedPromptRuntime = {
        backend: promptBackend,
        modelId: settings.promptModelId
      };
      this.deps.promptRuntimeManager.setModel("resident", settings.promptModelId);
      this.deps.logger.info("prompt", "service-ready", "Prompt service ready", {
        runtime,
        durationMs: Date.now() - startedAt
      });
      return {
        ok: true,
        message: promptBackend === "h3-prompt-writer"
          ? "ComfyUI H3 Prompt Writer 已加载并保持驻留；手动退出或开始队列时释放。"
          : promptBackend === "comfyui-multimodal"
            ? "ComfyUI 多模态提示词模型已加载并保持驻留；手动退出或开始队列时释放。"
          : promptBackend === "comfyui-qwenvl-lora"
            ? "Qwen3-VL 8B + H3 Prompt Rewriter LoRA 已加载并保持驻留；手动退出或开始队列时释放。"
          : "Qwen 提示词模型已启动并加载到 ComfyUI。"
      };
    } catch (error) {
      this.retainedPromptRuntime = null;
      this.deps.promptRuntimeManager.setModel("unloaded");
      if (promptBackend === "h3-prompt-writer") {
        await releaseH3PromptWriter(settings).catch(() => undefined);
      } else if (promptBackend === "comfyui-multimodal") {
        await releaseMultimodalPromptModel(settings).catch(() => undefined);
        await freeMemory(settings).catch(() => undefined);
      } else {
        await freeMemory(settings).catch(() => undefined);
      }
      await captureComfyUiLogFailure(
        this.deps.logger,
        settings,
        "prompt_service_start_failed",
        { modelId: settings.promptModelId }
      ).catch(() => undefined);
      this.deps.logger.error("prompt", "service-start-failed", safeLogErrorMessage(error), {
        runtime,
        promptModelId: settings.promptModelId,
        promptBackend,
        durationMs: Date.now() - startedAt,
        ...this.deps.errorMeta(error)
      });
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    } finally {
      if (this.nativePromptWorker === worker) this.nativePromptWorker = null;
      if (this.nativePromptController === controller) this.nativePromptController = null;
    }
  }

  async enhance(request: EnhanceRequest): Promise<string> {
    const settings = this.deps.store.get().settings;
    const runtime = promptRuntimeForSettings(settings);
    const promptBackend = promptModelBackend(settings.promptModelId);
    const startedAt = Date.now();
    const promptOrigin: PromptOperationOrigin = request.origin ?? (
      request.mode === "image-edit"
        ? "image-edit"
        : request.extensionSource
          ? "video-extension"
          : "image-to-video"
    );
    validateH3ReferenceAutoPrompt(request);
    if (!request.prompt.trim() && !isH3ReferenceAutoPrompt(request)) {
      throw new Error("请先输入需要扩写的提示词");
    }
    if (this.deps.isQueueBusy()) {
      throw new Error("当前有视频任务正在运行，暂不能启动提示词模型。请等待任务结束或先暂停队列。");
    }
    if (this.isPromptBusy()) {
      throw new Error("当前提示词任务正在运行或取消中，请稍候。");
    }
    if (!promptBackend) {
      throw new Error("当前选择的提示词模型没有可用的本地运行适配器，请重新扫描设置中的模型列表。");
    }
    const operation = this.deps.promptRuntimeManager.beginOperation(promptOrigin, true);
    const operationId = operation.operationId;
    const controller = operation.controller;
    this.nativePromptController = controller;
    const promptLogContext = {
      operationId,
      runtime,
      promptModelId: settings.promptModelId,
      promptBackend,
      modelId: request.modelId,
      mode: request.mode ?? "video",
      h3PromptMode: request.h3PromptMode ?? "auto",
      promptProvided: Boolean(request.prompt.trim()),
      promptLength: request.prompt.length,
      referenceImageCount: request.imagePaths?.length ?? (request.imagePath ? 1 : 0),
      durationSeconds: request.h3DurationSeconds ?? null,
      ...promptEnhanceLogContext(request)
    };
    this.deps.logger.info("prompt", "enhance-started", "Prompt enhancement started", {
      ...promptLogContext
    });
    const promptProgress = this.createPromptProgressController(
      settings.promptModelId,
      startedAt,
      operationId,
      promptOrigin
    );
    promptProgress.update("preparing", 0);
    let leaseAlreadyRetained = false;
    const worker = (async () => {
      const outcome = await this.runEnhancement(
        request,
        settings,
        promptBackend,
        controller,
        operationId,
        promptProgress.update
      );
      leaseAlreadyRetained = outcome.leaseAlreadyRetained;
      return outcome.result;
    })();
    this.nativePromptWorker = worker;
    try {
      const result = await worker;
      this.deps.promptRuntimeManager.setModel("resident", settings.promptModelId, operationId);
      this.deps.promptRuntimeManager.finishOperation(operationId, "completed");
      promptProgress.finish(
        "completed",
        promptRuntimeLeaseMatches(this.retainedPromptRuntime, promptBackend, settings.promptModelId)
          ? "validating"
          : "unloading"
      );
      this.deps.logger.info("prompt", "enhance-finished", "Prompt enhancement finished", {
        ...promptLogContext,
        durationMs: Date.now() - startedAt,
        outputLength: result.length
      });
      return result;
    } catch (error) {
      if (controller.signal.aborted) {
        promptProgress.update("validating", null, "正在取消提示词任务");
        if (await this.waitForPromptCancellation()) {
          this.deps.promptRuntimeManager.finishOperation(operationId, "cancelled", "user-requested");
          promptProgress.finish("cancelled", "validating", "提示词任务已取消");
        }
        this.deps.logger.info("prompt", "enhance-cancelled", "Prompt enhancement cancelled", {
          ...promptLogContext,
          durationMs: Date.now() - startedAt
        });
        throw error;
      }
      promptProgress.finish(
        "failed",
        "validating",
        error instanceof Error ? error.message : String(error)
      );
      this.deps.promptRuntimeManager.finishOperation(
        operationId,
        "failed",
        error instanceof Error ? error.message : String(error)
      );
      if (!leaseAlreadyRetained) await this.releaseRuntime(settings);
      await captureComfyUiLogFailure(
        this.deps.logger,
        settings,
        "prompt_enhance_failed",
        { modelId: settings.promptModelId, operationId }
      ).catch(() => undefined);
      this.deps.logger.error("prompt", "enhance-failed", safeLogErrorMessage(error), {
        ...promptLogContext,
        durationMs: Date.now() - startedAt,
        ...this.deps.errorMeta(error)
      });
      throw error;
    } finally {
      if (this.nativePromptWorker === worker) this.nativePromptWorker = null;
      if (this.nativePromptController === controller) this.nativePromptController = null;
    }
  }

  async cancel(): Promise<ConnectionResult> {
    const settings = this.deps.store.get().settings;
    try {
      const result = await this.cancelActivePromptRuntime(settings);
      return {
        ok: true,
        message: result.settled
          ? "提示词任务已取消，模型保持运行。"
          : "已请求取消提示词任务；模型会在任务确认中止后保持运行。"
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async releaseForUser(): Promise<ConnectionResult> {
    const settings = this.deps.store.get().settings;
    if (this.deps.isQueueBusy()) {
      return { ok: false, message: "当前有视频任务正在运行，暂不能释放提示词模型。" };
    }
    if (this.nativePromptWorker || this.promptCancellationWorker) {
      const cancellation = await this.cancelActivePromptRuntime(settings);
      if (!cancellation.settled) {
        return { ok: false, message: "提示词任务仍在中止中；确认停止后才能卸载模型。" };
      }
    }
    try {
      const released = await this.releaseRuntime(settings);
      return {
        ok: true,
        message: released
          ? "已停止提示词模型并释放显存。"
          : "当前没有已加载的提示词模型。"
      };
    } catch {
      this.deps.promptRuntimeManager.setModel("unloaded");
      return { ok: true, message: "ComfyUI 当前未运行，无需释放提示词模型。" };
    }
  }

  async releaseRuntime(settings: Settings): Promise<number> {
    const retained = this.retainedPromptRuntime;
    const backend = retained?.backend ?? promptModelBackend(settings.promptModelId);
    const modelId = retained?.modelId ?? settings.promptModelId;
    this.retainedPromptRuntime = null;
    return this.deps.promptRuntimeManager.releaseModel(modelId, async () => {
      if (backend === "h3-prompt-writer") {
        try {
          return await releaseH3PromptWriter(settings) ? 1 : 0;
        } catch {
          return 0;
        }
      }
      if (backend === "comfyui-multimodal") {
        let released = 0;
        try {
          released = await releaseMultimodalPromptModel(settings) ? 1 : 0;
        } catch {
          // Older node installs do not expose the app-owned cleanup route yet.
        }
        await freeMemory(settings).catch(() => undefined);
        return released;
      }
      try {
        await freeMemory(settings);
        return 1;
      } catch {
        // An offline ComfyUI instance cannot be holding the native prompt model.
        return 0;
      }
    });
  }

  private createPromptProgressController(
    modelId: string,
    startedAt: number,
    operationId: string,
    origin: PromptOperationOrigin
  ): {
    update: PromptProgressReporter;
    finish(status: PromptProgress["status"], stage: PromptProgressStage, error?: string): void;
  } {
    let lastProgress = 0;
    let lastSentAt = 0;
    let lastStage: PromptProgressStage = "preparing";
    const send = (
      status: PromptProgress["status"],
      stage: PromptProgressStage,
      progress: number | null,
      detail?: string,
      error?: string
    ): void => {
      const elapsedMs = Date.now() - startedAt;
      const payload: PromptProgress = {
        operationId,
        origin,
        status,
        stage,
        progress,
        startedAt,
        elapsedMs,
        modelId,
        ...(detail ? { detail } : {}),
        ...(error ? { error } : {})
      };
      this.deps.sendProgress(payload);
      this.deps.logger.info("prompt", "progress", "Prompt enhancement progress", {
        operationId,
        modelId,
        stage,
        status,
        progress,
        elapsedMs
      });
    };
    const update: PromptProgressReporter = (stage, progress = null, detail) => {
      const now = Date.now();
      if (now - lastSentAt < 250 && stage === lastStage) return;
      lastSentAt = now;
      lastStage = stage;
      const normalized = progress == null
        ? null
        : Math.min(99, Math.max(lastProgress, Math.max(0, progress)));
      if (normalized != null) lastProgress = normalized;
      send("running", stage, normalized, detail);
    };
    return {
      update,
      finish(status, stage, error) {
        send(status, stage, status === "completed" ? 100 : lastProgress, undefined, error);
      }
    };
  }

  private promptRuntimeLeaseMatches(backend: PromptBackend, modelId: string): boolean {
    return promptRuntimeLeaseMatches(this.retainedPromptRuntime, backend, modelId);
  }

  private async beginPromptRuntimeLease(
    settings: Settings,
    backend: PromptBackend,
    modelId: string
  ): Promise<boolean> {
    if (this.promptRuntimeLeaseMatches(backend, modelId)) return true;
    if (this.retainedPromptRuntime !== null) await this.releaseRuntime(settings);
    this.retainedPromptRuntime = { backend, modelId };
    return false;
  }

  private async ensureComfyUiReadyForPrompt(
    settings: Settings,
    signal?: AbortSignal
  ): Promise<void> {
    const throwIfCancelled = (): void => {
      if (signal?.aborted) throw signal.reason;
    };
    throwIfCancelled();
    const serviceSettings = comfyUiSettingsForPromptRuntime(settings);
    const profile = await alignLocalComfyUiRuntimeProfile(serviceSettings);
    throwIfCancelled();
    if (!profile.ok) {
      throw new Error(`ComfyUI 提示词运行配置切换失败：${profile.message}`);
    }
    if (profile.restarted) {
      this.deps.logger.info("service", "prompt-runtime-profile-aligned", "ComfyUI runtime profile was aligned for prompt model residency", {
        previousProfile: profile.previousProfile,
        desiredProfile: profile.desiredProfile
      });
    }
    try {
      await testComfyUi(serviceSettings);
      throwIfCancelled();
      return;
    } catch (connectionError) {
      this.deps.logger.warn("service", "prompt-connection-unavailable", "ComfyUI was not ready for prompt runtime", {
        local: this.isLocalComfyUrl(settings.comfyUrl),
        error: safeLogErrorMessage(connectionError)
      });
      if (!this.isLocalComfyUrl(settings.comfyUrl)) {
        throw new Error(
          `无法连接 ComfyUI（${settings.comfyUrl}）：${
            connectionError instanceof Error ? connectionError.message : String(connectionError)
          }`
        );
      }
    }
    throwIfCancelled();
    const started = await startLocalService("comfy", serviceSettings);
    throwIfCancelled();
    if (!started.ok) throw new Error(`ComfyUI 自动启动失败：${started.message}`);
    await testComfyUi(serviceSettings);
    throwIfCancelled();
  }

  private async validateQwenVlPromptNodeRuntime(settings: Settings): Promise<void> {
    const baseUrl = settings.comfyUrl.replace(/\/+$/u, "");
    const objectInfo = await jsonRequest<Record<string, unknown>>(
      `${baseUrl}/object_info`,
      { signal: AbortSignal.timeout(15_000) }
    );
    try {
      validateQwenVlRuntimeChoices(objectInfo, settings);
      return;
    } catch (error) {
      if (!(error instanceof QwenVlRuntimeValidationError) || !error.needsRuntimeRefresh) {
        throw error;
      }
      this.deps.logger.warn("prompt", "qwenvl-runtime-enum-stale", error.message, {
        nodeType: error.nodeType,
        inputName: error.inputName,
        expected: error.expected,
        choices: error.choices
      });
      throw new Error(`${error.message} 节点或模型刚更新后，请在设置中显式重启 ComfyUI；提示词任务不会自动重启服务。`);
    }
  }

  private async validateNativePromptRuntime(settings: Settings): Promise<void> {
    const scan = await scanEnvironment(settings, "runtime");
    const profile = scan.modelProfiles.find(
      (item) => item.id === settings.promptModelId && item.category === "prompt"
    );
    if (!profile?.available) {
      const missing = profile?.components
        .filter((component) => !component.found)
        .map((component) => component.expected)
        .join("、");
      throw new Error(
        `提示词模型尚未就绪${missing ? `，缺少：${missing}` : ""}。请把模型放入 ${isQwenVlPeftPromptModel(settings.promptModelId) ? "ComfyUI/models/LLM/Qwen-VL/qwen3-vl-8b-instruct 与 ComfyUI/models/LLM/Qwen-VL-LoRA/minimax-h3-prompt-rewriter-8b" : isComfyMultimodalPromptModel(settings.promptModelId) ? "ComfyUI/models/LLM 的对应子目录" : "ComfyUI/models/text_encoders"} 后重新扫描。`
      );
    }
    if (isGemmaPromptModel(settings.promptModelId) && !scan.llamaCppPython.ready) {
      const runtime = scan.llamaCppPython;
      const detail = runtime.detail || runtime.error || "未通过 CUDA/导入自检";
      throw new Error(
        `Gemma H3 Prompt Writer 的 llama-cpp-python 尚未就绪：${detail}。请在设置 → 节点与依赖中对当前选中的 ComfyUI Python 执行“重新安装/修复”，然后重启 ComfyUI。`
      );
    }
    if (isComfyMultimodalPromptModel(settings.promptModelId)) {
      if (profile.missingCustomNodeIds?.length) {
        throw new Error(
          `多模态提示词模型缺少 ComfyUI 节点：${profile.missingCustomNodeNames?.join("、") || profile.missingCustomNodeIds.join("、")}。请先在设置 → 节点与依赖中安装。`
        );
      }
      if (profile.runtimeVerified && profile.runtimeReady === false) {
        throw new Error(
          `多模态提示词节点尚未被当前 ComfyUI 加载：${profile.runtimeMissingNodes?.join("、") || "VisionLLMNode"}。请重启 ComfyUI 后重新扫描。`
        );
      }
      return;
    }
    if (isQwenVlPeftPromptModel(settings.promptModelId)) {
      if (profile.missingCustomNodeIds?.length) {
        throw new Error(
          `Qwen3-VL Prompt LoRA 缺少 ComfyUI 节点：${profile.missingCustomNodeNames?.join("、") || profile.missingCustomNodeIds.join("、")}。请先在设置 → 节点与依赖中安装。`
        );
      }
      if (profile.runtimeVerified && profile.runtimeReady === false) {
        throw new Error(
          `Qwen3-VL Prompt LoRA 节点尚未被当前 ComfyUI 加载：${profile.runtimeMissingNodes?.join("、") || "QwenVLModelLoader / QwenVLLoRALoader / QwenVLCaption"}。请重启 ComfyUI 后重新扫描。`
        );
      }
      await this.validateQwenVlPromptNodeRuntime(settings);
      return;
    }
    if (!scan.comfyCompatibility.promptCoreSupported) {
      const missing = scan.comfyCompatibility.promptCoreNodes
        .filter((node) => !node.available)
        .map((node) => node.id)
        .join("、");
      throw new Error(
        `当前 ComfyUI 核心缺少提示词节点：${missing || "TextGenerate"}。请更新 ComfyUI、重启服务后重试。`
      );
    }
  }

  private async warmSelectedPromptRuntime(
    settings: Settings,
    promptBackend: ReturnType<typeof promptModelBackend>,
    signal: AbortSignal,
    allowCpuFallback = false
  ): Promise<void> {
    const prepareRuntime = async (): Promise<void> => {
      await this.ensureComfyUiReadyForPrompt(settings, signal);
      // Re-publish warming after service startup so the renderer does not
      // treat a stopped-service transition as a completed warmup.
      this.deps.promptRuntimeManager.setModel("warming", settings.promptModelId);
      await this.validateNativePromptRuntime(settings);
    };
    if (promptBackend === "h3-prompt-writer") {
      await prepareRuntime();
      await warmH3PromptWriter(settings, signal);
      return;
    }
    if (promptBackend === "comfyui-multimodal") {
      await prepareRuntime();
      await warmMultimodalPromptModel(settings, signal, allowCpuFallback);
      return;
    }
    if (promptBackend === "comfyui-qwenvl-lora") {
      await ensureQwenVlManagedMetadata(settings, signal);
      await prepareRuntime();
      await warmQwenVlPeftPromptModel(settings, signal);
      return;
    }
    if (promptBackend !== "native-text-generate") {
      throw new Error("当前选择的提示词模型没有可用的本地运行适配器，请重新扫描设置中的模型列表。");
    }
    await prepareRuntime();
    await warmNativePromptModel(settings, signal);
  }

  private async runEnhancement(
    request: EnhanceRequest,
    settings: Settings,
    promptBackend: PromptBackend,
    controller: AbortController,
    operationId: string,
    onProgress: PromptProgressReporter
  ): Promise<{ result: string; leaseAlreadyRetained: boolean }> {
    const leaseAlreadyRetained = await this.beginPromptRuntimeLease(
      settings,
      promptBackend,
      settings.promptModelId
    );
    onProgress("checking", 5);
    if (promptBackend === "comfyui-qwenvl-lora") {
      await ensureQwenVlManagedMetadata(settings, controller.signal, onProgress);
    }
    await this.ensureComfyUiReadyForPrompt(settings, controller.signal);
    this.deps.promptRuntimeManager.setOperationPhase(operationId, "warming-model");
    await this.validateNativePromptRuntime(settings);
    this.deps.promptRuntimeManager.setOperationPhase(operationId, "submitting");
    const retainModel = this.promptRuntimeLeaseMatches(
      promptBackend,
      settings.promptModelId
    );
    const result = await withPromptExtensionMedia(
      request,
      operationId,
      controller.signal,
      (preparedRequest) => {
        if (promptBackend === "h3-prompt-writer") {
          return enhancePromptWithH3PromptWriter(
            preparedRequest,
            settings,
            controller.signal,
            onProgress,
            !retainModel
          );
        }
        if (promptBackend === "comfyui-multimodal") {
          return enhancePromptWithMultimodalComfyUi(
            preparedRequest,
            settings,
            controller.signal,
            false,
            onProgress,
            operationId,
            retainModel,
            (promptId) => this.deps.promptRuntimeManager.markSubmitted(operationId, promptId)
          );
        }
        if (promptBackend === "comfyui-qwenvl-lora") {
          return enhancePromptWithQwenVlPeft(
            preparedRequest,
            settings,
            controller.signal,
            false,
            onProgress,
            operationId,
            retainModel,
            (promptId) => this.deps.promptRuntimeManager.markSubmitted(operationId, promptId)
          );
        }
        return enhancePromptWithComfyUi(
          preparedRequest,
          settings,
          controller.signal,
          false,
          onProgress,
          (promptId) => this.deps.promptRuntimeManager.markSubmitted(operationId, promptId)
        );
      }
    );
    return { result, leaseAlreadyRetained };
  }

  private async appPromptQueueSnapshot(settings: Settings): Promise<unknown> {
    return jsonRequest(`${settings.comfyUrl.replace(/\/+$/, "")}/queue`, {
      signal: AbortSignal.timeout(5_000)
    });
  }

  private async waitForPromptIdsToStop(
    settings: Settings,
    promptIds: ReadonlySet<string>,
    timeoutMs: number
  ): Promise<boolean> {
    if (!promptIds.size) return false;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const snapshot = await this.appPromptQueueSnapshot(settings).catch(() => null);
      if (snapshot && !comfyQueueContainsAnyPromptId(snapshot, promptIds)) return true;
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
    }
    return false;
  }

  private async waitForWorkerToStop(worker: PromptWorker, timeoutMs: number): Promise<boolean> {
    return Promise.race([
      worker.then(() => true, () => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), timeoutMs))
    ]);
  }

  private async waitForPromptCancellation(): Promise<boolean> {
    const cancellation = this.promptCancellationWorker;
    if (!cancellation) return true;
    return cancellation.then((result) => result.settled, () => false);
  }

  private async deleteQueuedPrompt(settings: Settings, promptId: string): Promise<void> {
    await jsonRequest(`${settings.comfyUrl.replace(/\/+$/, "")}/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delete: [promptId] }),
      signal: AbortSignal.timeout(10_000)
    });
  }

  private async cancelActivePromptRuntime(settings: Settings): Promise<PromptCancellation> {
    if (this.promptCancellationWorker) return this.promptCancellationWorker;
    const worker = this.nativePromptWorker;
    if (!worker) throw new Error("当前没有正在运行的提示词任务。");
    const promptBackend = promptModelBackend(settings.promptModelId);
    const cancellation = this.deps.promptRuntimeManager.requestCancellation();
    this.promptCancellationWorker = (async () => {
      if (promptBackend === "h3-prompt-writer" || !cancellation.promptId) {
        const settled = await this.waitForWorkerToStop(worker, 10_000);
        return { recovered: false, settled };
      }
      const snapshot = await this.appPromptQueueSnapshot(settings).catch(() => null);
      const location = comfyPromptQueueLocation(snapshot, cancellation.promptId);
      if (location === "pending") {
        await this.deleteQueuedPrompt(settings, cancellation.promptId);
      } else if (location === "running") {
        await interrupt(settings);
      }
      const stopped = location === "absent" || await this.waitForPromptIdsToStop(
        settings,
        new Set([cancellation.promptId]),
        15_000
      );
      if (!stopped) {
        this.deps.logger.warn("prompt", "cancel-pending", "Prompt cancellation is still pending; ComfyUI was left running", {
          operationId: cancellation.operationId,
          promptId: cancellation.promptId,
          promptBackend
        });
        void this.waitForPromptIdsToStop(
          settings,
          new Set([cancellation.promptId]),
          120_000
        ).then((eventuallyStopped) => {
          if (eventuallyStopped) {
            this.deps.promptRuntimeManager.finishOperation(
              cancellation.operationId,
              "cancelled",
              "user-requested"
            );
          }
        });
      }
      return { recovered: false, settled: stopped };
    })();
    try {
      return await this.promptCancellationWorker;
    } finally {
      this.promptCancellationWorker = null;
    }
  }

  private isLocalComfyUrl(value: string): boolean {
    try {
      const hostname = new URL(value).hostname.toLowerCase();
      return hostname === "127.0.0.1" ||
        hostname === "localhost" ||
        hostname === "::1" ||
        hostname === "[::1]";
    } catch {
      return false;
    }
  }
}

function promptRuntimeLeaseMatches(
  retained: {
    backend: ReturnType<typeof promptModelBackend>;
    modelId: string;
  } | null,
  backend: PromptBackend,
  modelId: string
): boolean {
  return retained?.backend === backend && retained.modelId === modelId;
}
