import type { HistoryAsset, QueueTask } from "../../../types";
import { historyRenderSeconds } from "../history/helpers";

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
