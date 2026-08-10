import type { ImageGenerationQueueTask, QueueTask } from "../types.js";

export function isImageGenerationQueueTask(
  task: QueueTask
): task is ImageGenerationQueueTask {
  return task.taskType === "image-generation";
}

export function moveWaitingTask(
  queue: QueueTask[],
  taskId: string,
  direction: -1 | 1
): QueueTask[] {
  const next = [...queue];
  const index = next.findIndex((task) => task.id === taskId);
  if (index < 0 || next[index]?.status !== "waiting") return next;
  let target = index + direction;
  while (target >= 0 && target < next.length && next[target]?.status !== "waiting") {
    target += direction;
  }
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}
