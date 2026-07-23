import type { QueueTask } from "../types.js";

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

export function optimizeWaitingTasks(queue: QueueTask[]): QueueTask[] {
  const waiting = queue
    .filter((task) => task.status === "waiting")
    .map((task, index) => ({ task, index }))
    .sort((left, right) => {
      const leftKey = `${left.task.modelId}\0${left.task.workflowPath}`;
      const rightKey = `${right.task.modelId}\0${right.task.workflowPath}`;
      return leftKey.localeCompare(rightKey) || left.index - right.index;
    })
    .map(({ task }) => task);

  let waitingIndex = 0;
  return queue.map((task) =>
    task.status === "waiting" ? waiting[waitingIndex++]! : task
  );
}
