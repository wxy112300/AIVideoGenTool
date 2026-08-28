import type { IpcMain } from "electron";
import type { AppState, QueueLifecycle, QueueTask, Settings } from "../src/types.js";
import {
  adjustQueuePauseBoundary,
  nextQueueWaitingTask,
  queuePauseBoundaryReached,
  queuePauseBoundaryAfterCurrent
} from "../src/core/queue.js";
import type { JsonStore } from "./store.js";
import type { AppLogger } from "./services/app-logger.js";

export class QueueWorkerController {
  private worker: Promise<void> | null = null;
  private controller: AbortController | null = null;
  private cleanup: Promise<void> | null = null;
  private pendingResume: {
    execute: () => Promise<void>;
    shouldRestart: () => boolean;
  } | null = null;

  get runningWorker(): Promise<void> | null {
    return this.worker;
  }

  get activeController(): AbortController | null {
    return this.controller;
  }

  get cleanupWorker(): Promise<void> | null {
    return this.cleanup;
  }

  trackCleanup(cleanup: Promise<void>): void {
    this.cleanup = cleanup;
    void cleanup.finally(() => {
      if (this.cleanup === cleanup) this.cleanup = null;
    }).catch(() => undefined);
  }

  beginTask(): AbortController {
    const controller = new AbortController();
    this.controller = controller;
    return controller;
  }

  endTask(controller?: AbortController): void {
    if (!controller || this.controller === controller) this.controller = null;
  }

  abort(reason: Error): void {
    this.controller?.abort(reason);
  }

  cancelPendingResume(): void {
    this.pendingResume = null;
  }

  resume(
    execute: () => Promise<void>,
    shouldRestart: () => boolean = () => true
  ): void {
    if (this.worker) {
      this.pendingResume = { execute, shouldRestart };
      return;
    }
    this.start(execute);
  }

  start(execute: () => Promise<void>): void {
    if (this.worker) return;
    this.pendingResume = null;
    this.worker = execute().finally(() => {
      this.worker = null;
      this.controller = null;
      const pendingResume = this.pendingResume;
      this.pendingResume = null;
      if (pendingResume?.shouldRestart()) {
        this.start(pendingResume.execute);
      }
    });
  }
}

export interface QueueControlIpcDependencies {
  ipc: IpcMain;
  store: JsonStore;
  logger: AppLogger;
  worker: QueueWorkerController;
  sendState(state: AppState): void;
  executeQueue(): Promise<void>;
  nativePromptBusy(): boolean;
  settingsForTask(task: QueueTask, settings: Settings): Settings;
  cleanupCancelledTask(
    taskId: string,
    settings: Settings,
    worker: Promise<void> | null
  ): Promise<void>;
  updateTask(taskId: string, patch: Partial<QueueTask>): Promise<AppState>;
}

export function registerQueueControlIpc(deps: QueueControlIpcDependencies): {
  resumeQueue(clearPauseBoundary?: boolean): Promise<AppState>;
} {
  const { ipc, store, logger, worker, sendState } = deps;
  const setQueueLifecycle = async (
    lifecycle: QueueLifecycle,
    taskId?: string
  ): Promise<AppState> => {
    const next = await store.update((state) => {
      const changed = state.queueLifecycle !== lifecycle || state.queueLifecycleTaskId !== taskId;
      state.queueLifecycle = lifecycle;
      state.queueLifecycleTaskId = taskId;
      if (lifecycle === "idle") {
        state.queueLifecycleStartedAt = undefined;
      } else if (changed || !state.queueLifecycleStartedAt) {
        state.queueLifecycleStartedAt = new Date().toISOString();
      }
    });
    sendState(next);
    return next;
  };

  const resumeQueue = async (clearPauseBoundary = true): Promise<AppState> => {
    if (deps.nativePromptBusy()) {
      throw new Error("当前正在生成提示词，请等待扩写完成后再开始视频任务。 ");
    }
    const current = store.get();
    if (["cancelling", "cleaning", "error"].includes(current.queueLifecycle)) {
      logger.info("queue", "start-blocked", "Queue start was ignored while a previous queue operation is active", {
        queueLifecycle: current.queueLifecycle,
        queueLifecycleTaskId: current.queueLifecycleTaskId,
        queueLifecycleStartedAt: current.queueLifecycleStartedAt ?? "",
        workerActive: Boolean(worker.runningWorker)
      });
      sendState(current);
      return current;
    }

    const hasRunningTask = current.queue.some((task) => task.status === "running");
    const hasExistingWorkerSession = Boolean(worker.runningWorker) ||
      current.queueLifecycle === "pausing" ||
      hasRunningTask;
    if (hasExistingWorkerSession) {
      const next = await store.update((state) => {
        if (clearPauseBoundary) state.queuePauseBoundary = undefined;
        state.queueRunning = true;
        state.queueStartedAt ??= new Date().toISOString();
        const running = state.queue.find((task) => task.status === "running");
        state.queueLifecycle = running ? "running" : "starting";
        state.queueLifecycleTaskId = running?.id;
        state.queueLifecycleStartedAt = new Date().toISOString();
      });
      logger.info("queue", "resumed", "Queue processing resumed without starting a second worker", {
        clearPauseBoundary,
        workerActive: Boolean(worker.runningWorker),
        runningTaskId: next.queue.find((task) => task.status === "running")?.id ?? ""
      });
      sendState(next);
      worker.resume(deps.executeQueue, () => {
        const latest = store.get();
        return latest.queueRunning && Boolean(
          nextQueueWaitingTask(latest.queue, latest.queuePauseBoundary)
        );
      });
      return next;
    }

    const waitingTask = nextQueueWaitingTask(
      current.queue,
      clearPauseBoundary ? undefined : current.queuePauseBoundary
    );
    if (!waitingTask) {
      const next = await store.update((state) => {
        state.queueRunning = false;
        state.queueStartedAt = undefined;
        if (clearPauseBoundary) state.queuePauseBoundary = undefined;
        state.queueLifecycle = "idle";
        state.queueLifecycleTaskId = undefined;
        state.queueLifecycleStartedAt = undefined;
      });
      sendState(next);
      return next;
    }
    const next = await store.update((state) => {
      if (clearPauseBoundary) state.queuePauseBoundary = undefined;
      state.queueRunning = true;
      // Keep the timestamp while resuming a paused queue; a new timestamp is
      // created only after the previous queue session has fully ended.
      state.queueStartedAt ??= new Date().toISOString();
      state.queueLifecycle = "starting";
      state.queueLifecycleTaskId = undefined;
      state.queueLifecycleStartedAt = new Date().toISOString();
    });
    logger.info("queue", "started", "Queue processing started", {
      waitingTasks: next.queue.filter((task) => task.status === "waiting").length
    });
    sendState(next);
    worker.start(deps.executeQueue);
    return next;
  };

  // Starting the queue honors a divider that the user placed before starting
  // or while paused. Only the explicit continue action clears that batch
  // boundary and releases the deferred tasks below it.
  ipc.handle("queue:start", async () => resumeQueue(false));

  ipc.handle("queue:continue", async () => resumeQueue(true));

  ipc.handle("queue:pause", async () => {
    const current = store.get();
    if (["cancelling", "cleaning"].includes(current.queueLifecycle)) return current;
    worker.cancelPendingResume();
    const next = await store.update((state) => {
      const wasRunning = state.queueRunning;
      state.queueRunning = false;
      const running = state.queue.find((task) => task.status === "running");
      if (running || wasRunning) {
        state.queuePauseBoundary = queuePauseBoundaryAfterCurrent(state.queue);
      }
      state.queueLifecycle = running ? "pausing" : "idle";
      state.queueLifecycleTaskId = running?.id;
      state.queueLifecycleStartedAt = running ? new Date().toISOString() : undefined;
    });
    logger.info("queue", "paused", "Queue processing paused");
    sendState(next);
    return next;
  });

  ipc.handle("queue:cancel", async (_event, taskId: string) => {
    const task = store.get().queue.find((item) => item.id === taskId);
    if (!task) return store.get();
    const current = store.get();
    if (
      current.queueLifecycleTaskId === taskId &&
      ["cancelling", "cleaning"].includes(current.queueLifecycle)
    ) {
      return current;
    }
    if (task.status === "running") {
      worker.cancelPendingResume();
      const settings = deps.settingsForTask(task, store.get().settings);
      const runningWorker = worker.runningWorker;
      const next = await store.update((state) => {
        const previousQueue = state.queue.map((item) => ({ ...item }));
        state.queueRunning = false;
        state.queueLifecycle = "cancelling";
        state.queueLifecycleTaskId = taskId;
        state.queueLifecycleStartedAt = new Date().toISOString();
        const current = state.queue.find((item) => item.id === taskId);
        if (current && current.status === "running") {
          current.status = "cancelled";
          current.stage = "正在取消任务，等待 ComfyUI 清理";
          current.error = "正在取消任务，等待 ComfyUI 清理。";
          current.updatedAt = new Date().toISOString();
        }
        state.queuePauseBoundary = queuePauseBoundaryReached(
          previousQueue,
          state.queuePauseBoundary,
          state.queue
        ) ? undefined : adjustQueuePauseBoundary(
          previousQueue,
          state.queuePauseBoundary,
          state.queue
        );
      });
      sendState(next);
      worker.abort(new Error("用户取消任务"));
      const cleanup = (async () => {
        try {
          await setQueueLifecycle("cleaning", taskId);
          await deps.cleanupCancelledTask(taskId, settings, runningWorker);
          const current = store.get();
          if (
            current.queueLifecycle === "cleaning" &&
            current.queueLifecycleTaskId === taskId
          ) {
            await setQueueLifecycle("idle");
          }
        } catch (error) {
          logger.error("queue", "cancel-cleanup-lifecycle-failed", "Queue cancellation lifecycle cleanup failed", {
            taskId,
            error: error instanceof Error ? error.message : String(error)
          });
          await setQueueLifecycle("error", taskId).catch(() => undefined);
        }
      })();
      worker.trackCleanup(cleanup);
      void cleanup;
      return next;
    }
    return deps.updateTask(taskId, {
      status: "cancelled",
      error: "任务在开始前被取消"
    });
  });

  return { resumeQueue };
}
