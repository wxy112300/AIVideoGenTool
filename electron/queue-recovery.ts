import type { AppState, ComfyRuntimeState, QueueTask, Settings, TaskPerformanceStats } from "../src/types.js";
import {
  classifyFailureForRecovery,
  nextAutomaticRetryAttempt,
  nextH3AttentionModeAfterCudaFailure
} from "../src/core/recovery.js";
import { isMiniMaxH3Model } from "../src/core/workflow.js";
import type { JsonStore } from "./store.js";
import { forceStopComfyProcesses, restartLocalService } from "./services/environment.js";
import { freeMemory, interrupt, waitForPromptToLeaveQueue } from "./services/comfy-ui.js";
import type { AppLogger } from "./services/app-logger.js";
import { safeLogErrorMessage } from "./services/app-logger.js";

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
    "restartComfyUi" | "isCancellationCurrent"
  >,
  taskId: string,
  settings: Settings,
  worker: Promise<void> | null
): Promise<void> {
  const cancellationIsCurrent = (): boolean =>
    deps.isCancellationCurrent?.(taskId) ?? true;
  const updateCancelledTask = async (patch: Partial<QueueTask>): Promise<boolean> => {
    if (!cancellationIsCurrent()) return false;
    await deps.updateTask(taskId, patch);
    return true;
  };
  try {
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
          ? "任务已取消，ComfyUI 当前不可用"
          : "任务已取消，ComfyUI 未连接",
        error: "任务已取消"
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
        stage: "任务已取消，尚未提交到 ComfyUI",
        error: "任务已取消"
      });
      return;
    }
    const promptStopped = promptId
      ? await (deps.waitForSubmittedPromptToStop ?? waitForPromptToLeaveQueue)(settings, promptId, 15_000)
      : workerSettled;
    if (!promptStopped) {
      deps.logger.warn("comfy", "cancel-prompt-still-running", "ComfyUI prompt remained active after interruption; restarting the owned runtime", {
        taskId,
        promptId: promptId ?? "",
        workerSettled
      });
    }
    if (settings.safeCancel && workerSettled && promptStopped) {
      try {
        await (deps.freeComfyMemory ?? freeMemory)(settings);
        await updateCancelledTask({
          status: "cancelled",
          stage: "任务已取消，显存已释放",
          error: "任务已取消"
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
      stage: recovery.ok ? "任务已取消，ComfyUI 已后台重启" : "任务已取消，但 ComfyUI 清理失败",
      error: recovery.ok ? "任务已取消" : `任务已取消；ComfyUI 清理失败：${recovery.message}`
    });
  } catch (error) {
    deps.logger.error("comfy", "cancel-cleanup-failed", "Background cancellation cleanup failed", {
      taskId, error: safeLogErrorMessage(error)
    });
    await updateCancelledTask({
      status: "cancelled",
      stage: "任务已取消，但 ComfyUI 清理失败",
      error: `任务已取消；ComfyUI 清理失败：${safeLogErrorMessage(error)}`
    }).catch(() => undefined);
  }
}

export interface QueueRecoveryDependencies {
  store: JsonStore;
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
  isCancellationCurrent?(taskId: string): boolean;
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
  const memoryFailure = recoveryDecision.kind === "cuda-context" || recoveryDecision.kind === "gpu-memory";
  const cudaContextFailure = recoveryDecision.forceStop;
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

  if (!aborted && recoveryDecision.forceStop) {
    logger.warn("comfy", "cuda-context-force-stop", "CUDA context is invalid; skipping HTTP cleanup and force-stopping ComfyUI", {
      taskId: task.id, modelId: task.modelId
    });
    const forced = await forceStopComfyProcesses(store.get().settings);
    logger.info("comfy", forced.ok ? "cuda-context-force-stop-succeeded" : "cuda-context-force-stop-failed", forced.message, {
      taskId: task.id, modelId: task.modelId, forceStopOk: forced.ok
    });
  } else if (!aborted && recoveryDecision.kind === "gpu-memory") {
    await interrupt(store.get().settings).catch((interruptError) => {
      logger.warn("comfy", "interrupt-failed", "ComfyUI interrupt request failed", {
        taskId: task.id, error: safeLogErrorMessage(interruptError)
      });
    });
    await freeMemory(store.get().settings).catch((freeMemoryError) => {
      logger.warn("comfy", "free-memory-failed", "ComfyUI memory release request failed", {
        taskId: task.id, error: safeLogErrorMessage(freeMemoryError)
      });
    });
  }

  const failedState = await updateTask(task.id, {
    status: aborted ? "cancelled" : "failed",
    error: aborted
      ? "任务已中止，ComfyUI 已停止当前采样。"
      : cudaContextFailure
        ? `${error instanceof Error ? error.message : String(error)} CUDA 上下文已失效，正在重启 ComfyUI。`
        : error instanceof Error ? error.message : String(error),
    performanceStats
  });
  if (aborted || !recoveryDecision.requiresRestart) return;

  logger.warn("queue", "recovery-required", "Task failure requires ComfyUI recovery", {
    taskId: task.id, stalled, memoryFailure, cudaContextFailure,
    recoveryKind: recoveryDecision.kind
  });
  const recovery = await restartLocalService(
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
        failedTask.error = `${originalError} 自动恢复失败：${recovery.message}`;
        failedTask.updatedAt = new Date().toISOString();
      }
    });
    sendState(stopped);
    logger.error("queue", "recovery-stopped-queue", "Queue stopped because ComfyUI recovery failed", {
      taskId: task.id, modelId: task.modelId, recoveryKind: recoveryDecision.kind
    });
    return;
  }

  const attentionFallback = recoveryDecision.kind === "cuda-context" &&
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
          : currentMode === "sage";
        if (!shouldFallback) continue;
        queuedTask.attentionMode = attentionFallback;
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
    enabled: recoveredState.settings.autoRetryFailedTasks,
    recoverable: recoveryDecision.recoverable,
    currentAttempt: retryAttempt,
    retryLimit
  });
  if (nextAttempt !== null) {
    const retryState = await store.update((state) => {
      const failedTask = state.queue.find((item) => item.id === task.id);
      if (!failedTask) return;
      Object.assign(failedTask, {
        status: "waiting" as const,
        updatedAt: new Date().toISOString(),
        comfyPromptId: undefined,
        progress: 0,
        stage: `自动重试 ${nextAttempt}/${retryLimit}${attentionFallback ? ` · Attention ${attentionFallback}` : ""}`,
        error: `${originalError} ComfyUI 已恢复，准备自动重试 ${nextAttempt}/${retryLimit}。${attentionFallback ? ` H3 Attention 已切换为 ${attentionFallback}。` : ""}`,
        automaticRetryAttempt: nextAttempt
      });
      state.queueRunning = true;
    });
    sendState(retryState);
    logger.warn("queue", "automatic-retry-scheduled", "Recoverable task was returned to the queue after ComfyUI recovery", {
      taskId: task.id, taskType: task.taskType, modelId: task.modelId,
      recoveryKind: recoveryDecision.kind, retryAttempt: nextAttempt, retryLimit
    });
    return;
  }
  await updateTask(task.id, {
    error: `${originalError} ComfyUI 已恢复就绪。${recoveredState.settings.autoRetryFailedTasks
      ? `自动重试已达到上限（${retryLimit} 次），已跳过此任务。`
      : "自动重试未开启，已跳过此任务。"}`
  });
  logger.warn("queue", "automatic-retry-skipped", "Recovered task remains failed and the queue will continue", {
    taskId: task.id, taskType: task.taskType, modelId: task.modelId,
    recoveryKind: recoveryDecision.kind, retryAttempt, retryLimit,
    retryEnabled: recoveredState.settings.autoRetryFailedTasks,
    attentionFallback: attentionFallback ?? "none"
  });
}
