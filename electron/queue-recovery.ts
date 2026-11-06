import { createNativeTranslator } from "./ui-translator.js";
import { uiKeys } from "../src/core/i18n-keys.js";
import type { AppState, ComfyRuntimeState, QueueTask, Settings, TaskPerformanceStats } from "../src/types.js";
import {
  classifyFailureForRecovery,
  nextAutomaticRetryAttempt,
  nextH3AttentionModeAfterCudaFailure
} from "../src/core/recovery.js";
import { h3ExecutionPolicySnapshotFor } from "../src/core/h3-execution-policy.js";
import { adjustQueuePauseBoundary } from "../src/core/queue.js";
import { isMiniMaxH3Model } from "../src/core/workflow.js";
import type { StateRepository } from "./ports/state-repository.js";
import { forceStopComfyProcesses, restartLocalService } from "./services/environment.js";
import { freeMemory, interrupt, waitForPromptToLeaveQueue } from "./services/comfy-ui.js";
import type { AppLogger } from "../src/infrastructure/app-logger.js";
import { safeLogErrorMessage } from "../src/infrastructure/app-logger.js";
import { isLocalComfyUrl } from "./services/comfy-endpoint.js";

async function waitWithTimeout(promise: Promise<unknown> | null, timeoutMs: number): Promise<boolean> {
  if (!promise) return true;
  return Promise.race([
    promise.then(() => true, () => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs))
  ]);
}

export async function cleanupCancelledQueueTask(
  deps: Pick<
    QueueRecoveryDependencies,
    "logger" | "updateTask" | "getComfyRuntimeState" |
    "waitForComfyRuntimeSettled" | "hasSubmittedPrompt" | "getSubmittedPromptId" |
    "waitForSubmittedPromptToStop" | "interruptComfyUi" | "freeComfyMemory" |
    "restartComfyUi" | "stopComfyRuntime" | "isCancellationCurrent" |
    "isAetherScaleTask" | "terminateAetherScaleWorker"
  >,
  taskId: string,
  settings: Settings,
  worker: Promise<void> | null
): Promise<void> {
  const t = createNativeTranslator(settings.uiLocale).t;
  const cancellationIsCurrent = (): boolean =>
    deps.isCancellationCurrent?.(taskId) ?? true;
  const updateCancelledTask = async (patch: Partial<QueueTask>): Promise<boolean> => {
    if (!cancellationIsCurrent()) return false;
    await deps.updateTask(taskId, patch);
    return true;
  };
  const isAetherScaleTask = deps.isAetherScaleTask?.(taskId) ?? false;
  try {
    // Let AetherScale's task-owned carrier worker receive the cooperative
    // interrupt first. Other providers retain the established stop order.
    const runtimeStopped = isAetherScaleTask
      ? false
      : await deps.stopComfyRuntime?.(settings) ?? false;
    if (runtimeStopped) {
      await waitWithTimeout(worker, 15_000);
      await updateCancelledTask({
        status: "cancelled",
        stage: t(uiKeys.queueRecovery.cancelStopped),
        error: t(uiKeys.queueRecovery.cancelled)
      });
      return;
    }
    let runtime = deps.getComfyRuntimeState?.();
    if (runtime && ["starting", "restarting", "stopping"].includes(runtime.phase)) {
      runtime = await deps.waitForComfyRuntimeSettled?.(125_000) ?? runtime;
    }
    if (!cancellationIsCurrent()) return;
    if (runtime && runtime.phase !== "ready") {
      await waitWithTimeout(worker, 15_000);
      await updateCancelledTask({
        status: "cancelled",
        stage: runtime.phase === "error"
          ? t(uiKeys.queueRecovery.cancelUnavailable)
          : t(uiKeys.queueRecovery.cancelDisconnected),
        error: t(uiKeys.queueRecovery.cancelled)
      });
      return;
    }
    const promptId = deps.getSubmittedPromptId?.(taskId);
    const hasSubmittedPrompt = Boolean(promptId) || (deps.hasSubmittedPrompt?.(taskId) ?? true);
    if (settings.safeCancel && hasSubmittedPrompt) {
      await (deps.interruptComfyUi ?? interrupt)(settings).catch((error) => {
        deps.logger.warn("comfy", "cancel-interrupt-failed", "ComfyUI interrupt request failed during background cancellation cleanup", {
          taskId, error: safeLogErrorMessage(error)
        });
      });
    }
    const workerSettled = await waitWithTimeout(worker, 15_000);
    if (!hasSubmittedPrompt && workerSettled) {
      await updateCancelledTask({
        status: "cancelled",
        stage: t(uiKeys.queueRecovery.cancelUnsubmitted),
        error: t(uiKeys.queueRecovery.cancelled)
      });
      return;
    }
    const promptStopped = promptId
      ? await (deps.waitForSubmittedPromptToStop ?? waitForPromptToLeaveQueue)(settings, promptId, 15_000)
      : workerSettled;
    let promptStoppedAfterWorkerCleanup = promptStopped;
    if (
      isAetherScaleTask &&
      settings.safeCancel &&
      !promptStopped &&
      deps.terminateAetherScaleWorker
    ) {
      const workerCleanup = await deps.terminateAetherScaleWorker(taskId, settings).catch((error) => ({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        processId: undefined,
        verified: false
      }));
      if (workerCleanup.ok) {
        deps.logger.info("comfy", "aetherscale-worker-terminated", "Verified AetherScale carrier worker cleanup completed after cancellation", {
          taskId,
          promptId: promptId ?? "",
          processId: workerCleanup.processId ?? null,
          verified: workerCleanup.verified ?? false
        });
        promptStoppedAfterWorkerCleanup = promptId
          ? await (deps.waitForSubmittedPromptToStop ?? waitForPromptToLeaveQueue)(settings, promptId, 5_000)
          : workerSettled;
      } else {
        deps.logger.warn("comfy", "aetherscale-worker-cleanup-failed", "AetherScale carrier worker could not be safely terminated after cancellation", {
          taskId,
          promptId: promptId ?? "",
          processId: workerCleanup.processId ?? null,
          verified: workerCleanup.verified ?? false,
          error: workerCleanup.message
        });
      }
    }
    if (!promptStoppedAfterWorkerCleanup) {
      deps.logger.warn("comfy", "cancel-prompt-still-running", "ComfyUI prompt remained active after interruption; restarting the owned runtime", {
        taskId,
        promptId: promptId ?? "",
        workerSettled
      });
    }
    if (settings.safeCancel && workerSettled && promptStoppedAfterWorkerCleanup) {
      try {
        await (deps.freeComfyMemory ?? freeMemory)(settings);
        await updateCancelledTask({
          status: "cancelled",
          stage: t(uiKeys.queueRecovery.cancelFreed),
          error: t(uiKeys.queueRecovery.cancelled)
        });
        return;
      } catch (error) {
        deps.logger.warn("comfy", "cancel-free-memory-failed", "ComfyUI memory release failed after task cancellation; falling back to restart", {
          taskId, error: safeLogErrorMessage(error)
        });
      }
    }
    if (!cancellationIsCurrent()) return;
    const recovery = await (deps.restartComfyUi ?? restartLocalService)("comfy", settings);
    await updateCancelledTask({
      status: "cancelled",
      stage: recovery.ok ? t(uiKeys.queueRecovery.cancelRestarted) : t(uiKeys.queueRecovery.cancelCleanupFailed),
      error: recovery.ok ? t(uiKeys.queueRecovery.cancelled) : t(uiKeys.queueRecovery.cancelCleanupDetail, { detail: recovery.message })
    });
  } catch (error) {
    deps.logger.error("comfy", "cancel-cleanup-failed", "Background cancellation cleanup failed", {
      taskId, error: safeLogErrorMessage(error)
    });
    await updateCancelledTask({
      status: "cancelled",
      stage: t(uiKeys.queueRecovery.cancelCleanupFailed),
      error: t(uiKeys.queueRecovery.cancelCleanupDetail, { detail: safeLogErrorMessage(error) })
    }).catch(() => undefined);
  }
}

export interface QueueRecoveryDependencies {
  store: StateRepository;
  logger: AppLogger;
  sendState(state: AppState): void;
  updateTask(taskId: string, patch: Partial<QueueTask>): Promise<AppState>;
  getComfyRuntimeState?(): ComfyRuntimeState;
  waitForComfyRuntimeSettled?(timeoutMs: number): Promise<ComfyRuntimeState>;
  hasSubmittedPrompt?(taskId: string): boolean;
  getSubmittedPromptId?(taskId: string): string | undefined;
  waitForSubmittedPromptToStop?(settings: Settings, promptId: string, timeoutMs: number): Promise<boolean>;
  interruptComfyUi?(settings: Settings): Promise<void>;
  freeComfyMemory?(settings: Settings): Promise<void>;
  restartComfyUi?(kind: "comfy", settings: Settings): Promise<{ ok: boolean; message: string }>;
  stopComfyRuntime?(settings: Settings): Promise<boolean>;
  onRuntimeRestarted?(): void;
  isCancellationCurrent?(taskId: string): boolean;
  isAetherScaleTask?(taskId: string): boolean;
  terminateAetherScaleWorker?(
    taskId: string,
    settings: Settings
  ): Promise<{
    ok: boolean;
    message: string;
    processId?: number;
    verified?: boolean;
  }>;
  settingsForTask(task: QueueTask, settings: AppState["settings"]): AppState["settings"];
  errorMeta(error: unknown): Record<string, unknown>;
}

export interface QueueFailureContext {
  task: QueueTask;
  error: unknown;
  aborted: boolean;
  stalled: boolean;
  performanceStats?: TaskPerformanceStats;
}

export async function recoverQueueFailure(
  deps: QueueRecoveryDependencies,
  context: QueueFailureContext
): Promise<void> {
  const { store, logger, sendState, updateTask } = deps;
  const { task, error, aborted, stalled, performanceStats } = context;
  const recoveryDecision = classifyFailureForRecovery(error, stalled);
  const memoryFailure = recoveryDecision.kind === "cuda-context" ||
    recoveryDecision.kind === "gpu-memory" ||
    recoveryDecision.kind === "memory-pressure-stall";
  const cudaContextFailure = recoveryDecision.kind === "cuda-context";
  const memoryPressureStall = recoveryDecision.kind === "memory-pressure-stall";
  const recoverySettings = deps.settingsForTask(task, store.get().settings);
  const t = createNativeTranslator(recoverySettings.uiLocale).t;
  const runtimeState = deps.getComfyRuntimeState?.();
  const memoryPressureRecoveryAllowed = !memoryPressureStall || (
    isLocalComfyUrl(recoverySettings.comfyUrl) &&
    (runtimeState === undefined || runtimeState.ownership === "app")
  );
  logger.error("queue", "task-failed", safeLogErrorMessage(error), {
    taskId: task.id,
    taskType: task.taskType,
    modelId: task.modelId,
    stalled,
    memoryFailure,
    cudaContextFailure,
    recoveryKind: recoveryDecision.kind,
    recoverable: recoveryDecision.recoverable,
    automaticRetryAttempt: task.automaticRetryAttempt ?? 0,
    attentionMode: task.taskType === "upscale" || task.taskType === "image-generation"
      ? "not-applicable"
      : task.attentionMode ?? "sage",
    spectrumMode: task.taskType === "upscale" || task.taskType === "image-generation"
      ? "not-applicable"
      : task.spectrumMode ?? "off",
    ...deps.errorMeta(error)
  });

  if (memoryPressureStall && !memoryPressureRecoveryAllowed) {
    logger.error("comfy", "memory-pressure-recovery-skipped-unmanaged", "VRAM stall watchdog recovery stayed fail-open because the endpoint is not an app-managed local ComfyUI", {
      taskId: task.id,
      modelId: task.modelId,
      endpoint: recoverySettings.comfyUrl,
      runtimePhase: runtimeState?.phase ?? "unknown",
      runtimeOwnership: runtimeState?.ownership ?? "unknown"
    });
  }

  if (!aborted && recoveryDecision.forceStop && memoryPressureRecoveryAllowed) {
    logger.warn(
      "comfy",
      memoryPressureStall ? "memory-pressure-force-stop" : "cuda-context-force-stop",
      memoryPressureStall
        ? "持续显存/系统内存压力下跳过 HTTP 清理，精确强制停止并重启应用管理的 ComfyUI"
        : "CUDA context is invalid; skipping HTTP cleanup and force-stopping ComfyUI",
      {
        taskId: task.id,
        modelId: task.modelId
      }
    );
    const forced = await forceStopComfyProcesses(recoverySettings);
    logger.info("comfy", forced.ok
      ? memoryPressureStall ? "memory-pressure-force-stop-succeeded" : "cuda-context-force-stop-succeeded"
      : memoryPressureStall ? "memory-pressure-force-stop-failed" : "cuda-context-force-stop-failed", forced.message, {
      taskId: task.id, modelId: task.modelId, forceStopOk: forced.ok
    });
  } else if (!aborted && recoveryDecision.kind === "gpu-memory") {
    await (deps.interruptComfyUi ?? interrupt)(store.get().settings).catch((interruptError) => {
      logger.warn("comfy", "interrupt-failed", "ComfyUI interrupt request failed", {
        taskId: task.id, error: safeLogErrorMessage(interruptError)
      });
    });
    await (deps.freeComfyMemory ?? freeMemory)(store.get().settings).catch((freeMemoryError) => {
      logger.warn("comfy", "free-memory-failed", "ComfyUI memory release request failed", {
        taskId: task.id, error: safeLogErrorMessage(freeMemoryError)
      });
    });
  }

  const failedState = await updateTask(task.id, {
    status: aborted ? "cancelled" : "failed",
    error: aborted
      ? t(uiKeys.queueRecovery.interrupted)
      : memoryPressureStall
        ? memoryPressureRecoveryAllowed
          ? t(uiKeys.queueRecovery.pressureRestart)
          : t(uiKeys.queueRecovery.pressureExternal)
        : cudaContextFailure
          ? t(uiKeys.queueRecovery.cudaRestart, { detail: error instanceof Error ? error.message : String(error) })
          : error instanceof Error ? error.message : String(error),
    performanceStats
  });
  if (aborted || !recoveryDecision.requiresRestart || !memoryPressureRecoveryAllowed) return;

  logger.warn("queue", "recovery-required", "Task failure requires ComfyUI recovery", {
    taskId: task.id, stalled, memoryFailure, cudaContextFailure,
    recoveryKind: recoveryDecision.kind
  });
  const recovery = await (deps.restartComfyUi ?? restartLocalService)(
    "comfy",
    deps.settingsForTask(task, failedState.settings)
  );
  logger.info("comfy", recovery.ok ? "recovery-succeeded" : "recovery-failed", recovery.message, {
    taskId: task.id, recoveryOk: recovery.ok
  });
  const originalError = error instanceof Error ? error.message : String(error);
  if (!recovery.ok) {
    const stopped = await store.update((state) => {
      state.queueRunning = false;
      const failedTask = state.queue.find((item) => item.id === task.id);
      if (failedTask) {
        failedTask.error = t(uiKeys.queueRecovery.recoveryFailed, { detail: originalError, recovery: recovery.message });
        failedTask.updatedAt = new Date().toISOString();
      }
    });
    sendState(stopped);
    logger.error("queue", "recovery-stopped-queue", "Queue stopped because ComfyUI recovery failed", {
      taskId: task.id, modelId: task.modelId, recoveryKind: recoveryDecision.kind
    });
    return;
  }
  deps.onRuntimeRestarted?.();

  const shouldFallbackAttention = recoveryDecision.kind === "cuda-context";
  const attentionFallback = shouldFallbackAttention &&
    task.taskType !== "upscale" && task.taskType !== "image-generation" &&
    isMiniMaxH3Model(task.modelId)
    ? nextH3AttentionModeAfterCudaFailure(task.attentionMode)
    : null;
  let recoveredState = failedState;
  if (attentionFallback) {
    const attentionFrom = task.taskType === "upscale" || task.taskType === "image-generation"
      ? "not-applicable"
      : task.attentionMode ?? "sage";
    let affectedTaskCount = 0;
    recoveredState = await store.update((state) => {
      for (const queuedTask of state.queue) {
        if (queuedTask.taskType === "upscale" || queuedTask.taskType === "image-generation" || !isMiniMaxH3Model(queuedTask.modelId)) continue;
        const currentMode = queuedTask.attentionMode ?? "sage";
        const shouldFallback = attentionFallback === "pytorch"
          ? currentMode !== "pytorch"
          : currentMode === attentionFrom;
        if (!shouldFallback) continue;
        queuedTask.attentionMode = attentionFallback;
        const fallbackPolicy = h3ExecutionPolicySnapshotFor({
          modelId: queuedTask.modelId,
          inputMode: queuedTask.taskType === "extension" ? "video" : "image",
          attentionMode: attentionFallback,
          sparseAttentionMode: queuedTask.h3SparseAttentionMode,
          runtimeMode: queuedTask.h3RuntimeMode,
          comfyCompilerMode: queuedTask.h3ComfyCompilerMode,
          spectrumMode: queuedTask.spectrumMode,
          videoLoras: queuedTask.videoLoras,
          h3LivePreview: queuedTask.h3LivePreview
        });
        queuedTask.h3ExecutionPolicy = {
          ...fallbackPolicy,
          reasons: [
            ...fallbackPolicy.reasons,
            `attention-fallback:${currentMode}->${attentionFallback}`
          ]
        };
        queuedTask.updatedAt = new Date().toISOString();
        affectedTaskCount += 1;
      }
    });
    sendState(recoveredState);
    logger.warn("queue", "h3-attention-fallback-applied", "H3 Attention mode was downgraded after a deterministic CUDA kernel failure", {
      taskId: task.id, modelId: task.modelId,
      attentionFrom, attentionTo: attentionFallback,
      affectedTaskCount
    });
  }

  const retryAttempt = task.automaticRetryAttempt ?? 0;
  const retryLimit = recoveredState.settings.autoRetryCount;
  const nextAttempt = nextAutomaticRetryAttempt({
    enabled: memoryPressureStall || recoveredState.settings.autoRetryFailedTasks,
    recoverable: recoveryDecision.recoverable,
    currentAttempt: retryAttempt,
    retryLimit
  });
  if (nextAttempt !== null) {
    const retryState = await store.update((state) => {
      const previousQueue = state.queue.map((item) => ({ ...item }));
      const previousBoundary = state.queuePauseBoundary;
      const failedTask = state.queue.find((item) => item.id === task.id);
      if (!failedTask) return;
      Object.assign(failedTask, {
        status: "waiting" as const,
        updatedAt: new Date().toISOString(),
        comfyPromptId: undefined,
        progress: 0,
        stage: t(uiKeys.queueRecovery.retryStage, { attempt: nextAttempt, limit: retryLimit, attention: attentionFallback ? ` · Attention ${attentionFallback}` : "" }),
        error: t(uiKeys.queueRecovery.retryDetail, { detail: originalError, attempt: nextAttempt, limit: retryLimit, attention: attentionFallback ? t(uiKeys.queueRecovery.attentionFallback, { mode: attentionFallback }) : "" }),
        automaticRetryAttempt: nextAttempt
      });
      state.queuePauseBoundary = adjustQueuePauseBoundary(
        previousQueue,
        previousBoundary,
        state.queue
      );
    });
    sendState(retryState);
    logger.warn("queue", "automatic-retry-scheduled", "Recoverable task was returned to the queue after ComfyUI recovery", {
      taskId: task.id, taskType: task.taskType, modelId: task.modelId,
      recoveryKind: recoveryDecision.kind, retryAttempt: nextAttempt, retryLimit
    });
    return;
  }
  const exhaustedError = memoryPressureStall
    ? t(uiKeys.queueRecovery.pressureExhausted, { detail: originalError, attempts: retryAttempt })
    : t(uiKeys.queueRecovery.recoveredDetail, { detail: originalError, retry: recoveredState.settings.autoRetryFailedTasks
      ? t(uiKeys.queueRecovery.retryLimit, { limit: retryLimit })
      : t(uiKeys.queueRecovery.retryDisabled) });
  await updateTask(task.id, {
    error: exhaustedError
  });
  logger.warn("queue", "automatic-retry-skipped", "Recovered task remains failed and the queue will continue", {
    taskId: task.id, taskType: task.taskType, modelId: task.modelId,
    recoveryKind: recoveryDecision.kind, retryAttempt, retryLimit,
    retryEnabled: memoryPressureStall || recoveredState.settings.autoRetryFailedTasks,
    attentionFallback: attentionFallback ?? "none"
  });
}
