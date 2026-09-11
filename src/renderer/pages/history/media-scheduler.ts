export type HistoryMediaTaskPriority = "interactive" | "viewport" | "prefetch";

export type HistoryMediaTask = (
  signal: AbortSignal
) => Promise<boolean | void> | boolean | void;

export interface HistoryMediaScheduler {
  enqueue(key: string, task: HistoryMediaTask, priority?: HistoryMediaTaskPriority): void;
  reprioritize(key: string, priority: HistoryMediaTaskPriority): void;
  cancel(key: string): void;
  clear(): void;
  dispose(): void;
}

export function scheduleHistoryBatches<T>(
  items: ReadonlyArray<T>,
  process: (item: T) => void,
  batchSize = 16
): () => void {
  const limit = Math.max(1, Math.floor(batchSize));
  let index = 0;
  let frame: number | null = null;
  let disposed = false;

  const pump = () => {
    frame = null;
    if (disposed) return;
    const end = Math.min(items.length, index + limit);
    for (; index < end; index += 1) {
      const item = items[index];
      if (item !== undefined) process(item);
    }
    if (index < items.length) frame = window.requestAnimationFrame(pump);
  };

  frame = window.requestAnimationFrame(pump);
  return () => {
    disposed = true;
    if (frame !== null) {
      window.cancelAnimationFrame(frame);
      frame = null;
    }
  };
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
        .then(() => undefined)
        .catch(() => undefined)
        .finally(() => {
          if (running.get(task.key) === task) running.delete(task.key);
          pump();
        });
    }
  };

  const preemptFor = (priority: HistoryMediaTaskPriority): void => {
    if (running.size < limit) return;
    const candidate = [...running.values()]
      .filter((task) => !task.controller?.signal.aborted)
      .sort((left, right) =>
        priorityOrder[right.priority] - priorityOrder[left.priority] ||
        right.sequence - left.sequence
      )[0];
    if (candidate && priorityOrder[priority] < priorityOrder[candidate.priority]) {
      candidate.controller?.abort();
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
      if (disposed || !key) return;
      const existing = pending.get(key);
      if (existing) {
        if (priorityOrder[priority] < priorityOrder[existing.priority]) {
          existing.priority = priority;
        }
        return;
      }
      const activeTask = running.get(key);
      if (activeTask) {
        if (priorityOrder[priority] < priorityOrder[activeTask.priority]) {
          activeTask.priority = priority;
        }
        if (activeTask.controller?.signal.aborted) {
          pending.set(key, { key, task, priority, sequence: sequence++ });
        }
        return;
      }
      pending.set(key, { key, task, priority, sequence: sequence++ });
      preemptFor(priority);
      pump();
    },
    reprioritize: (key, priority) => {
      if (disposed) return;
      const pendingTask = pending.get(key);
      if (pendingTask) pendingTask.priority = priority;
      const runningTask = running.get(key);
      if (runningTask) runningTask.priority = priority;
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
