export type HistoryMediaTaskPriority = "interactive" | "viewport" | "prefetch";

export type HistoryMediaTask = (
  signal: AbortSignal
) => Promise<boolean | void> | boolean | void;

export interface HistoryMediaScheduler {
  enqueue(key: string, task: HistoryMediaTask, priority?: HistoryMediaTaskPriority): void;
  cancel(key: string): void;
  clear(): void;
  dispose(): void;
}

interface ScheduledTask {
  key: string;
  task: HistoryMediaTask;
  priority: HistoryMediaTaskPriority;
  sequence: number;
  controller?: AbortController;
}

const priorityOrder: Record<HistoryMediaTaskPriority, number> = {
  interactive: 0,
  viewport: 1,
  prefetch: 2
};

export function createHistoryMediaScheduler(concurrency: number): HistoryMediaScheduler {
  const limit = Math.max(1, Math.floor(concurrency));
  const pending = new Map<string, ScheduledTask>();
  const running = new Map<string, ScheduledTask>();
  const completed = new Set<string>();
  let sequence = 0;
  let disposed = false;

  const nextTask = (): ScheduledTask | undefined => [...pending.values()].sort((left, right) =>
    priorityOrder[left.priority] - priorityOrder[right.priority] || left.sequence - right.sequence
  ).find((task) => !running.has(task.key));

  const pump = (): void => {
    if (disposed) return;
    while (running.size < limit) {
      const task = nextTask();
      if (!task) return;
      pending.delete(task.key);
      const controller = new AbortController();
      task.controller = controller;
      running.set(task.key, task);
      Promise.resolve()
        .then(() => task.task(controller.signal))
        .then((success) => {
          if (success === true && !controller.signal.aborted) completed.add(task.key);
        })
        .catch(() => undefined)
        .finally(() => {
          if (running.get(task.key) === task) running.delete(task.key);
          pump();
        });
    }
  };

  const cancel = (key: string): void => {
    pending.delete(key);
    const task = running.get(key);
    if (!task) return;
    task.controller?.abort();
  };

  return {
    enqueue: (key, task, priority = "prefetch") => {
      if (disposed || !key || completed.has(key)) return;
      const existing = pending.get(key);
      if (existing) {
        if (priorityOrder[priority] < priorityOrder[existing.priority]) {
          existing.priority = priority;
        }
        return;
      }
      const activeTask = running.get(key);
      if (activeTask) {
        if (activeTask.controller?.signal.aborted) {
          pending.set(key, { key, task, priority, sequence: sequence++ });
        }
        return;
      }
      pending.set(key, { key, task, priority, sequence: sequence++ });
      pump();
    },
    cancel,
    clear: () => {
      pending.clear();
      [...running.keys()].forEach(cancel);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      pending.clear();
      [...running.keys()].forEach(cancel);
    }
  };
}