import type { AppState, HistoryAsset, QueueTask } from "../../../types";
import { historyRenderSeconds } from "../history/helpers";

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
  "performanceStats"
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
    h3LivePreview: state.settings.h3LivePreview,
    uiLocale: state.settings.uiLocale,
    queue: state.queue.map(queueTaskLayoutSnapshot)
  });
}

export function queueHistoryEstimateSeconds(
  task: QueueTask,
  history: ReadonlyArray<HistoryAsset>
): number | null {
  const candidates = history
    .flatMap((asset) => asset.versions)
    .filter((version) => version.modelId === task.modelId)
    .map(historyRenderSeconds)
    .filter((value): value is number => value != null && value > 0);
  if (!candidates.length) return null;
  return candidates.reduce((total, value) => total + value, 0) / candidates.length;
}

export function queueTaskRemainingSeconds(
  task: QueueTask,
  history: ReadonlyArray<HistoryAsset>
): number | null {
  const historyEstimate = queueHistoryEstimateSeconds(task, history);
  if (task.status !== "running") return historyEstimate;
  const progress = Math.max(0, Math.min(100, task.progress ?? 0));
  const startedAt = task.startedAt ? Date.parse(task.startedAt) : Number.NaN;
  const elapsed = Number.isFinite(startedAt)
    ? Math.max(0, (Date.now() - startedAt) / 1000)
    : 0;
  if (progress >= 2 && elapsed > 0) {
    return elapsed * (100 - progress) / progress;
  }
  return historyEstimate;
}

export function queueRemainingSeconds(
  tasks: ReadonlyArray<QueueTask>,
  history: ReadonlyArray<HistoryAsset>
): number | null {
  const activeTasks = tasks.filter((task) => task.status === "waiting" || task.status === "running");
  const estimates = activeTasks.map((task) => queueTaskRemainingSeconds(task, history));
  if (estimates.some((value) => value == null)) return null;
  return estimates.reduce((total: number, value) => total + (value ?? 0), 0);
}
