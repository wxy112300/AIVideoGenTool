import type { AppState, HistoryAsset, ImageHistoryProject, QueueTask } from "../../../types";
import {
  estimateQueueRemainingSeconds,
  estimateQueueTaskRemainingSeconds,
  estimateQueueTaskSeconds,
  type QueueEstimateHistory
} from "../../../core/queue-estimator";

/**
 * Fields that change frequently while a task is running but never alter the
 * queue card's structure. Excluding them lets the renderer patch progress in
 * place instead of replacing the entire queue DOM for every step.
 */
const volatileTaskFields = new Set([
  "progress",
  "stage",
  "stageStartedAt",
  "updatedAt",
  "comfyPromptId",
  "performanceStats",
  "seedVr2Checkpoint",
  "seedVr2Progress"
]);

function queueTaskLayoutSnapshot(task: QueueTask): unknown {
  const snapshot: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(task)) {
    if (volatileTaskFields.has(key)) continue;
    if (key === "runs" && Array.isArray(value)) {
      snapshot[key] = value.map((run) => {
        if (!run || typeof run !== "object") return run;
        const stableRun: Record<string, unknown> = {};
        for (const [runKey, runValue] of Object.entries(run)) {
          if (volatileTaskFields.has(runKey) || ["status", "startedAt", "completedAt", "error", "outputVersionId"].includes(runKey)) continue;
          stableRun[runKey] = runValue;
        }
        return stableRun;
      });
      continue;
    }
    snapshot[key] = value;
  }
  return snapshot;
}

/**
 * Returns a stable signature for fields that require a queue re-render. Task
 * progress/stage and other volatile execution telemetry are intentionally
 * omitted; those are updated by patchQueueLiveDom.
 */
export function queueLayoutSignature(state: AppState): string {
  return JSON.stringify({
    queueRunning: state.queueRunning,
    queueLifecycle: state.queueLifecycle,
    queueLifecycleTaskId: state.queueLifecycleTaskId,
    h3LivePreview: state.settings.h3LivePreview,
    uiLocale: state.settings.uiLocale,
    queue: state.queue.map(queueTaskLayoutSnapshot)
  });
}

export function queueHistoryEstimateSeconds(
  task: QueueTask,
  history: ReadonlyArray<HistoryAsset>,
  imageHistory: ReadonlyArray<ImageHistoryProject> = []
): number | null {
  return estimateQueueTaskSeconds(task, {
    video: history,
    image: imageHistory
  });
}

export function queueTaskRemainingSeconds(
  task: QueueTask,
  history: ReadonlyArray<HistoryAsset>,
  imageHistory: ReadonlyArray<ImageHistoryProject> = []
): number | null {
  return estimateQueueTaskRemainingSeconds(task, {
    video: history,
    image: imageHistory
  });
}

export function queueRemainingSeconds(
  tasks: ReadonlyArray<QueueTask>,
  history: ReadonlyArray<HistoryAsset>,
  imageHistory: ReadonlyArray<ImageHistoryProject> = []
): number | null {
  const context: QueueEstimateHistory = { video: history, image: imageHistory };
  return estimateQueueRemainingSeconds(tasks, context);
}
