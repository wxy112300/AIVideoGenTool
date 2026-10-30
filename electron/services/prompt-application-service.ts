import { createNativeTranslator } from "../ui-translator.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
import type { TranslationParams } from "../../src/core/i18n.js";
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
  inspectLlamaCppPythonRuntime,
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
  validateH3PromptWriterDuration,
  releaseH3PromptWriter,
  warmH3PromptWriter
} from "./h3-prompt-writer.js";
import { withPromptExtensionMedia } from "./prompt-extension-media.js";
import { getPerformanceMetrics } from "./performance.js";
import { captureComfyUiLogFailure } from "./comfy-log-bridge.js";
import type { AppLogger } from "../../src/infrastructure/app-logger.js";
import { safeLogErrorMessage } from "../../src/infrastructure/app-logger.js";
import { PromptRuntimeManager } from "./prompt-runtime-manager.js";
import { enhancePromptWithStrata, strataPromptPolicy, StrataPromptValidationError } from "./strata-prompt.js";
import type { StrataChatRequest } from "./strata-service.js";
import type { StrataRuntimeOwner } from "./strata-runtime-owner.js";
import { enhanceLongVideoWithStrata } from "./long-video-prompt.js";
import { assertLongVideoPromptRequest } from "../../src/core/long-video/enhancement.js";

type PromptBackend = Exclude<ReturnType<typeof promptModelBackend>, null>;
type PromptWorker = Promise<unknown>;
type PromptCancellation = { recovered: boolean; settled: boolean };

export interface PromptApplicationServiceDependencies {
  acquireGpu?(): Promise<void>;
  store: StateRepository;
  logger: AppLogger;
  promptRuntimeManager: PromptRuntimeManager;
  /** Queue state is owned by QueueService and intentionally queried lazily. */
  isQueueBusy(): boolean;
  sendProgress(progress: PromptProgress): void;
  errorMeta(error: unknown): Record<string, unknown>;
  externalRuntime?: {
    readonly runningWorker: Promise<unknown> | null;
    isBusy(): boolean;
    stop(): Promise<unknown>;
  };
  strata?: Pick<StrataRuntimeOwner, "ensurePromptReady" | "chat" | "stop" | "snapshot">;
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
  private activeBackend: PromptBackend | null = null;
  private retainedPromptRuntime: {
    backend: ReturnType<typeof promptModelBackend>;
    modelId: string;
  } | null = null;

  constructor(private readonly deps: PromptApplicationServiceDependencies) {}

  private message(settings: Settings, key: string, params?: TranslationParams): string {
    return createNativeTranslator(settings.uiLocale).t(key, params);
  }

  get activeController(): AbortController | null {
    return this.nativePromptController;
  }

  get runningWorker(): PromptWorker | null {
    return this.nativePromptWorker ?? this.deps.externalRuntime?.runningWorker ?? null;
  }

  get cancellationWorker(): Promise<PromptCancellation> | null {
    return this.promptCancellationWorker;
  }

  /** Active work/cleanup blocks queue start; idle residency is released by the queue handoff. */
  isWorkerBusy(): boolean {
    return Boolean(this.nativePromptWorker || this.nativePromptController || this.deps.externalRuntime?.isBusy());
  }

  /** Includes cancellation cleanup for settings/runtime admin operations. */
  isPromptBusy(): boolean {
    return this.isWorkerBusy() || Boolean(this.promptCancellationWorker);
  }

  abort(reason: Error): void {
    this.nativePromptController?.abort(reason);
  }

  handleComfyRuntimeFailure(message: string): void {
    if (this.activeBackend === "strata" || this.retainedPromptRuntime?.backend === "strata") return;
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
      return { ok: false, message: this.message(settings, uiKeys.promptService.startBlockedQueue) };
    }
    if (this.isPromptBusy()) {
      return { ok: false, message: this.message(settings, uiKeys.promptService.busy) };
    }
    if (this.retainedPromptRuntime !== null) {
      await this.releaseRuntime(settings);
    }
    this.activeBackend = promptBackend;
    this.deps.promptRuntimeManager.selectBackend(runtime, settings.strataPort);
    if (promptBackend === "strata") this.deps.promptRuntimeManager.strataService("starting", settings.strataPort, this.message(settings, uiKeys.promptService.strataPreparing));
    const startup = promptBackend === "strata" ? this.deps.promptRuntimeManager.beginOperation("image-to-video", true) : null;
    const controller = startup?.controller ?? new AbortController();
    const progress = startup ? this.createPromptProgressController(settings.promptModelId, startedAt, startup.operationId, "image-to-video") : null;
    this.nativePromptController = controller;
    this.deps.promptRuntimeManager.setModel("warming", settings.promptModelId);
    const worker = this.warmSelectedPromptRuntime(
      settings,
      promptBackend,
      controller.signal,
      allowCpuFallback === true,
      progress?.update
    );
    this.nativePromptWorker = worker;
    try {
      await worker;
      this.retainedPromptRuntime = {
        backend: promptBackend,
        modelId: settings.promptModelId
      };
      this.deps.promptRuntimeManager.setModel("resident", settings.promptModelId);
      if (startup) this.deps.promptRuntimeManager.finishOperation(startup.operationId, "completed");
      progress?.finish("completed", "loading-model");
      this.deps.logger.info("prompt", "service-ready", "Prompt service ready", {
        runtime,
        durationMs: Date.now() - startedAt
      });
      return {
        ok: true,
        message: promptBackend === "strata"
          ? this.message(settings, uiKeys.promptService.loadedStrata)
          : promptBackend === "h3-prompt-writer"
          ? this.message(settings, uiKeys.promptService.loadedWriter)
          : promptBackend === "comfyui-multimodal"
            ? this.message(settings, uiKeys.promptService.loadedMultimodal)
          : promptBackend === "comfyui-qwenvl-lora"
            ? this.message(settings, uiKeys.promptService.loadedQwenLora)
          : this.message(settings, uiKeys.promptService.loadedQwen)
      };
    } catch (error) {
      this.retainedPromptRuntime = null;
      if (promptBackend === "strata") {
        const stopped = await this.deps.strata?.stop().then(() => true, () => false);
        this.publishStrataState(settings, Boolean(stopped), startup?.operationId);
        if (startup && !stopped) this.deps.promptRuntimeManager.finishOperation(startup.operationId, "failed", "Strata cleanup unconfirmed");
        progress?.finish(controller.signal.aborted && stopped ? "cancelled" : "failed", "loading-model", error instanceof Error ? error.message : String(error));
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
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
      this.activeBackend = null;
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
    validateH3ReferenceAutoPrompt(request, settings.uiLocale);
    if (request.longVideo) {
      assertLongVideoPromptRequest(request.longVideo);
      if (promptBackend !== "strata" || request.mode !== "h3-vision" || request.modelId !== "minimax_h3_fl2va" ||
          request.h3PromptMode !== "I2VA" || !request.imagePath || request.extensionSource || (request.imagePaths?.length ?? 1) !== 1) throw new Error(this.message(settings, uiKeys.promptService.longVideoRoute));
    }
    if (!request.prompt.trim() && !isH3ReferenceAutoPrompt(request) && !request.longVideo) {
      throw new Error(this.message(settings, uiKeys.promptService.promptRequired));
    }
    if (this.deps.isQueueBusy()) {
      throw new Error(this.message(settings, uiKeys.promptService.enhanceBlockedQueue));
    }
    if (this.isPromptBusy()) {
      throw new Error(this.message(settings, uiKeys.promptService.operationBusy));
    }
    if (!promptBackend) {
      throw new Error(this.message(settings, uiKeys.promptService.adapterMissing));
    }
    if (promptBackend === "h3-prompt-writer") validateH3PromptWriterDuration(request, settings);
    this.deps.promptRuntimeManager.selectBackend(runtime, settings.strataPort);
    if (promptBackend === "strata") this.deps.promptRuntimeManager.strataService("starting", settings.strataPort, this.message(settings, uiKeys.promptService.strataPreparing));
    const operation = this.deps.promptRuntimeManager.beginOperation(promptOrigin, true);
    const operationId = operation.operationId;
    const controller = operation.controller;
    this.nativePromptController = controller;
    this.activeBackend = promptBackend;
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
      controller.signal.throwIfAborted();
      if (promptBackend === "strata") this.deps.promptRuntimeManager.strataService("ready", settings.strataPort,
        this.deps.strata?.snapshot().message || this.message(settings, uiKeys.promptService.strataLoaded));
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
      if (promptBackend === "strata") {
        const live = this.deps.strata?.snapshot();
        if (error instanceof StrataPromptValidationError && !controller.signal.aborted && live?.phase === "ready" && live.modelLoaded && live.pid !== null) {
          this.retainedPromptRuntime = { backend: "strata", modelId: settings.promptModelId };
          this.deps.promptRuntimeManager.strataService("ready", settings.strataPort, live.message);
          this.deps.promptRuntimeManager.setModel("resident", settings.promptModelId, operationId);
          this.deps.logger.info("prompt", "strata-validation-retained", "Strata output rejected; healthy model retained", {
            operationId, strataPid: live.pid, hostMemoryMode: live.hostMemoryMode ?? "unknown"
          });
        } else {
          const stopped = await this.deps.strata?.stop().then(() => true, () => false);
          this.retainedPromptRuntime = null;
          this.publishStrataState(settings, Boolean(stopped), operationId);
          if (!stopped) {
            this.deps.promptRuntimeManager.finishOperation(operationId, "failed", "Strata cleanup unconfirmed");
            promptProgress.finish("failed", "unloading", this.message(settings, uiKeys.promptService.cleanupIncomplete));
            throw new Error(this.message(settings, uiKeys.promptService.cleanupIncomplete));
          }
        }
      }
      if (controller.signal.aborted) {
        promptProgress.update("validating", null, this.message(settings, uiKeys.promptService.cancelling));
        if (await this.waitForPromptCancellation()) {
          this.deps.promptRuntimeManager.finishOperation(operationId, "cancelled", "user-requested");
          promptProgress.finish("cancelled", "validating", this.message(settings, uiKeys.promptService.cancelled));
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
      if (!leaseAlreadyRetained && promptBackend !== "strata") await this.releaseRuntime(settings);
      if (promptBackend !== "strata") await captureComfyUiLogFailure(
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
      this.activeBackend = null;
    }
  }

  async cancel(): Promise<ConnectionResult> {
    const settings = this.deps.store.get().settings;
    try {
      const strata = this.activeBackend === "strata";
      if (strata && ["idle", "terminal"].includes(this.deps.promptRuntimeManager.snapshot().operation.phase) && this.nativePromptWorker) {
        this.nativePromptController?.abort(new Error(this.message(settings, uiKeys.promptService.startupCancelled)));
        await this.deps.strata?.stop();
        await this.nativePromptWorker.catch(() => undefined);
        return { ok: true, message: this.message(settings, uiKeys.promptService.strataStartupCancelled) };
      }
      const result = await this.cancelActivePromptRuntime(settings);
      return {
        ok: true,
        message: strata && result.settled ? this.message(settings, uiKeys.promptService.strataCancelled)
          : result.settled
          ? this.message(settings, uiKeys.promptService.cancelledResident)
          : this.message(settings, uiKeys.promptService.cancelRequested)
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
    if (this.deps.externalRuntime?.isBusy() && !this.nativePromptWorker) {
      return { ok: false, message: this.message(settings, uiKeys.promptService.strataOperationBusy) };
    }
    if (this.deps.isQueueBusy()) {
      return { ok: false, message: this.message(settings, uiKeys.promptService.releaseBlockedQueue) };
    }
    if (this.nativePromptWorker && this.activeBackend === "strata" &&
      ["idle", "terminal"].includes(this.deps.promptRuntimeManager.snapshot().operation.phase)) {
      const cancelled = await this.cancel();
      if (!cancelled.ok) return cancelled;
    } else if (this.nativePromptWorker || this.promptCancellationWorker) {
      const cancellation = await this.cancelActivePromptRuntime(settings);
      if (!cancellation.settled) {
        return { ok: false, message: this.message(settings, uiKeys.promptService.cancellationPending) };
      }
    }
    try {
      const released = await this.releaseRuntime(settings);
      return {
        ok: true,
        message: released
          ? this.message(settings, uiKeys.promptService.released)
          : this.message(settings, uiKeys.promptService.notLoaded)
      };
    } catch (error) {
      if (this.deps.externalRuntime) {
        return { ok: false, message: error instanceof Error ? error.message : this.message(settings, uiKeys.promptService.releaseFailed) };
      }
      this.deps.promptRuntimeManager.setModel("unloaded");
      return { ok: true, message: this.message(settings, uiKeys.promptService.comfyStopped) };
    }
  }

  async releaseRuntime(settings: Settings): Promise<number> {
    if (this.retainedPromptRuntime?.backend === "strata" || (!this.retainedPromptRuntime && this.deps.promptRuntimeManager.snapshot().service.backend === "strata")) {
      const occupied = this.deps.strata ? this.deps.strata.snapshot().pid !== null : false;
      try { await this.deps.externalRuntime?.stop(); }
      catch (error) { this.publishStrataState(settings, false); throw error; }
      this.retainedPromptRuntime = null;
      this.deps.promptRuntimeManager.setModel("unloaded");
      this.deps.promptRuntimeManager.strataService("stopped", settings.strataPort, this.message(settings, uiKeys.promptService.strataServiceStopped));
      return occupied ? 1 : 0;
    }
    await this.deps.externalRuntime?.stop();
    return this.releaseComfyRuntime(settings);
  }

  /** Internal resource handoff: does not stop the external owner currently acquiring the lease. */
  async releaseComfyRuntime(settings: Settings): Promise<number> {
    const retained = this.retainedPromptRuntime;
    const backend = retained?.backend ?? promptModelBackend(settings.promptModelId);
    const modelId = retained?.modelId ?? settings.promptModelId;
    if (backend === "strata") return 0;
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
    let lastDetail: string | undefined;
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
      const strata = modelId.startsWith("strata/") ? this.deps.strata?.snapshot() : undefined;
      this.deps.logger.info("prompt", "progress", "Prompt enhancement progress", {
        operationId,
        modelId,
        stage,
        status,
        progress,
        elapsedMs,
        ...(strata ? { strataPid: strata.pid, strataPhase: strata.phase, modelLoaded: strata.modelLoaded,
          strataUncensored: strata.uncensored, strataHostMemoryMode: strata.hostMemoryMode ?? "unknown" } : {}),
        ...(modelId.startsWith("strata/") && detail && ["checking", "preparing", "loading-model"].includes(stage)
          ? { detail: safeLogErrorMessage(detail) } : {})
      });
    };
    const update: PromptProgressReporter = (stage, progress = null, detail) => {
      const now = Date.now();
      const startupDetailChanged = modelId.startsWith("strata/") && ["checking", "preparing", "loading-model"].includes(stage) && detail !== lastDetail;
      if (now - lastSentAt < 250 && stage === lastStage && !startupDetailChanged) return;
      lastSentAt = now;
      lastStage = stage;
      lastDetail = detail;
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
    await this.deps.acquireGpu?.();
    throwIfCancelled();
    const serviceSettings = comfyUiSettingsForPromptRuntime(settings);
    const profile = await alignLocalComfyUiRuntimeProfile(serviceSettings);
    throwIfCancelled();
    if (!profile.ok) {
      throw new Error(this.message(settings, uiKeys.promptService.profileFailed, { message: profile.message }));
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
          this.message(settings, uiKeys.runtimeService.connectionFailed, {
            url: settings.comfyUrl,
            message: connectionError instanceof Error ? connectionError.message : String(connectionError)
          })
        );
      }
    }
    throwIfCancelled();
    const started = await startLocalService("comfy", serviceSettings);
    throwIfCancelled();
    if (!started.ok) throw new Error(this.message(settings, uiKeys.runtimeService.autoStartFailed, { message: started.message }));
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
      throw new Error(this.message(settings, uiKeys.promptService.runtimeRefresh, { message: error.message }));
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
        .join(settings.uiLocale === "en-US" ? ", " : "、");
      throw new Error(
        this.message(settings, uiKeys.promptService.modelNotReady, {
          missing: missing ? this.message(settings, uiKeys.promptService.missingFiles, { files: missing }) : "",
          directory: isQwenVlPeftPromptModel(settings.promptModelId)
            ? "ComfyUI/models/LLM/Qwen-VL/qwen3-vl-8b-instruct / ComfyUI/models/LLM/Qwen-VL-LoRA/minimax-h3-prompt-rewriter-8b"
            : isComfyMultimodalPromptModel(settings.promptModelId)
              ? this.message(settings, uiKeys.promptService.multimodalDirectory)
              : "ComfyUI/models/text_encoders"
        })
      );
    }
    if (isGemmaPromptModel(settings.promptModelId)) {
      const selectedPython = scan.pythonRuntimes.find((item) => item.selected) ?? scan.pythonRuntimes[0];
      const pythonPath = scan.llamaCppPython.pythonPath || selectedPython?.path || "";
      // Gemma performs a native llama import/model self-check immediately
      // before use. Runtime-scoped scans may project the previous snapshot,
      // but queue execution must never rely on that projection for this path.
      const runtime = pythonPath
        ? await inspectLlamaCppPythonRuntime(pythonPath, settings.uiLocale)
        : scan.llamaCppPython;
      if (!runtime.ready) {
        const detail = runtime.detail || runtime.error || this.message(settings, uiKeys.promptService.cudaCheckFailed);
        throw new Error(
          this.message(settings, uiKeys.promptService.writerRuntimeMissing, { detail })
        );
      }
    }
    if (isComfyMultimodalPromptModel(settings.promptModelId)) {
      if (profile.missingCustomNodeIds?.length) {
        throw new Error(
          this.message(settings, uiKeys.promptService.multimodalNodesMissing, {
            nodes: (profile.missingCustomNodeNames?.length ? profile.missingCustomNodeNames : profile.missingCustomNodeIds).join(settings.uiLocale === "en-US" ? ", " : "、")
          })
        );
      }
      if (profile.runtimeVerified && profile.runtimeReady === false) {
        throw new Error(
          this.message(settings, uiKeys.promptService.multimodalNodesUnloaded, { nodes: profile.runtimeMissingNodes?.join(settings.uiLocale === "en-US" ? ", " : "、") || "VisionLLMNode" })
        );
      }
      return;
    }
    if (isQwenVlPeftPromptModel(settings.promptModelId)) {
      if (profile.missingCustomNodeIds?.length) {
        throw new Error(
          this.message(settings, uiKeys.promptService.qwenNodesMissing, {
            nodes: (profile.missingCustomNodeNames?.length ? profile.missingCustomNodeNames : profile.missingCustomNodeIds).join(settings.uiLocale === "en-US" ? ", " : "、")
          })
        );
      }
      if (profile.runtimeVerified && profile.runtimeReady === false) {
        throw new Error(
          this.message(settings, uiKeys.promptService.qwenNodesUnloaded, { nodes: profile.runtimeMissingNodes?.join(settings.uiLocale === "en-US" ? ", " : "、") || "QwenVLModelLoader / QwenVLLoRALoader / QwenVLCaption" })
        );
      }
      await this.validateQwenVlPromptNodeRuntime(settings);
      return;
    }
    if (!scan.comfyCompatibility.promptCoreSupported) {
      const missing = scan.comfyCompatibility.promptCoreNodes
        .filter((node) => !node.available)
        .map((node) => node.id)
        .join(settings.uiLocale === "en-US" ? ", " : "、");
      throw new Error(
        this.message(settings, uiKeys.promptService.coreNodesMissing, { nodes: missing || "TextGenerate" })
      );
    }
  }

  private async warmSelectedPromptRuntime(
    settings: Settings,
    promptBackend: ReturnType<typeof promptModelBackend>,
    signal: AbortSignal,
    allowCpuFallback = false,
    onProgress?: PromptProgressReporter
  ): Promise<void> {
    if (promptBackend === "strata") {
      await this.ensureStrataReady(settings, signal, onProgress);
      return;
    }
    await this.deps.externalRuntime?.stop();
    signal.throwIfAborted();
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
      throw new Error(this.message(settings, uiKeys.promptService.adapterMissing));
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
    if (promptBackend === "strata") {
      const leaseAlreadyRetained = this.promptRuntimeLeaseMatches(promptBackend, settings.promptModelId);
      if (this.retainedPromptRuntime && !leaseAlreadyRetained) await this.releaseRuntime(settings);
      this.deps.promptRuntimeManager.setOperationPhase(operationId, "warming-model");
      // Strata has no ComfyUI prompt ID. Keep it null, with running feedback in PromptProgress.
      const result = await withPromptExtensionMedia(request, operationId, controller.signal, (prepared) =>
        (prepared.longVideo ? enhanceLongVideoWithStrata : enhancePromptWithStrata)(prepared, settings, this.deps.strata!, controller.signal, onProgress, async (chat) => {
          await this.ensureStrataReady(settings, controller.signal, onProgress, chat);
          this.retainedPromptRuntime = { backend: promptBackend, modelId: settings.promptModelId };
          this.deps.promptRuntimeManager.setOperationPhase(operationId, "submitting");
        }));
      return { result, leaseAlreadyRetained };
    }
    await this.deps.externalRuntime?.stop();
    controller.signal.throwIfAborted();
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
    if (!worker) throw new Error(this.message(settings, uiKeys.promptService.noActiveTask));
    const promptBackend = this.activeBackend ?? promptModelBackend(settings.promptModelId);
    const cancellation = this.deps.promptRuntimeManager.requestCancellation();
    this.promptCancellationWorker = (async () => {
      if (promptBackend === "strata") {
        // Do not wait on the outer Prompt promise: it is awaiting this cancellation acknowledgement.
        await this.deps.strata?.stop();
        this.retainedPromptRuntime = null;
        this.deps.promptRuntimeManager.setModel("unloaded");
        return { recovered: false, settled: true };
      }
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

  private async ensureStrataReady(settings: Settings, signal: AbortSignal, onProgress?: PromptProgressReporter, request?: StrataChatRequest): Promise<void> {
    if (!this.deps.strata) throw new Error(this.message(settings, uiKeys.promptService.strataUnavailable));
    onProgress?.("checking", null, this.message(settings, uiKeys.promptService.strataChecking));
    const scan = await scanEnvironment(settings, "runtime");
    signal.throwIfAborted();
    if (!scan.strataPreparation?.managedInstalled) throw new Error(this.message(settings, uiKeys.promptService.strataNotInstalled));
    if (scan.gpus?.length && !scan.gpus.some((gpu) =>
      Number.parseInt(gpu.driverVersion, 10) >= 580 && gpu.vramTotalBytes >= 22 * 1024 ** 3)) {
      throw new Error(this.message(settings, uiKeys.promptService.strataHardware));
    }
    let stage: "checking" | "preparing" | "loading-model" = "checking";
    await this.deps.strata.ensurePromptReady(settings, strataPromptPolicy(settings), {
      resolvedModelDirectory: scan.modelDirectory, signal, request,
      onStage: (next) => { stage = next; },
      onLog: (message) => onProgress?.(stage, null, message)
    });
    signal.throwIfAborted();
    this.deps.promptRuntimeManager.strataService("ready", settings.strataPort,
      this.deps.strata.snapshot().message || this.message(settings, uiKeys.promptService.strataLoaded));
    this.deps.promptRuntimeManager.setModel("resident", settings.promptModelId);
  }

  private publishStrataState(settings: Settings, stopped: boolean, operationId?: string): void {
    if (operationId && stopped) this.deps.promptRuntimeManager.finishOperation(operationId,
      this.nativePromptController?.signal.aborted ? "cancelled" : "failed", "Strata request stopped");
    // degraded preserves unknown GPU occupancy; stopped is published only with confirmed cleanup.
    this.deps.promptRuntimeManager.strataService(stopped ? "stopped" : "degraded", settings.strataPort,
      stopped ? this.message(settings, uiKeys.promptService.strataStopped) : this.message(settings, uiKeys.promptService.strataCleanupIncomplete));
    this.deps.promptRuntimeManager.setModel(stopped ? "unloaded" : "unknown", settings.promptModelId, operationId);
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
