import type { AppState, NotificationKind } from "../types";

export interface AppNotification {
  id: number;
  message: string;
  kind: NotificationKind;
  durationMs: number;
}

export const notificationDuration: Record<NotificationKind, number> = {
  info: 6_000,
  warning: 7_500,
  error: 10_000,
  "task-complete": 8_000,
  "queue-complete": 9_000
};

export interface QueueCompletionChange {
  completedTasks: Array<{ taskId: string; title: string }>;
  failedTasks: Array<{ taskId: string; title: string; error: string }>;
  queueCompleted: boolean;
}

function completedHistoryTasks(state: AppState): Map<string, string> {
  const completed = new Map<string, string>();
  for (const asset of state.history) {
    if (asset.taskId) completed.set(asset.taskId, asset.title || asset.outputFilename);
    for (const version of asset.versions) {
      if (version.taskId) completed.set(version.taskId, asset.title || version.outputFilename);
    }
  }
  for (const project of state.imageHistory) {
    for (const version of project.versions) {
      if (version.taskId) completed.set(version.taskId, project.title || version.file.filename);
    }
  }
  return completed;
}

export function queueCompletionChange(
  previous: AppState | undefined,
  next: AppState
): QueueCompletionChange {
  if (!previous) return { completedTasks: [], failedTasks: [], queueCompleted: false };
  const before = completedHistoryTasks(previous);
  const after = completedHistoryTasks(next);
  const completedTasks = [...after.entries()]
    .filter(([taskId]) => !before.has(taskId))
    .map(([taskId, title]) => ({ taskId, title }));
  const previousTasks = new Map(previous.queue.map((task) => [task.id, task]));
  const failedTasks = next.queue
    .filter((task) => task.status === "failed" && previousTasks.get(task.id)?.status !== "failed")
    .map((task) => ({
      taskId: task.id,
      title: task.outputFilename,
      error: task.error?.trim() || "未知运行错误"
    }));
  const queueCompleted = previous.queueRunning &&
    !next.queueRunning &&
    next.queue.length === 0;
  return { completedTasks, failedTasks, queueCompleted };
}
