import type { AppState, QueueLifecycle, QueueTask, Settings } from "../src/types.js";
import {
  adjustQueuePauseBoundary,
  nextQueueWaitingTask,
  queuePauseBoundaryAfterCurrent,
  queuePauseBoundaryReached
} from "../src/core/queue.js";
import type { StateRepository } from "./ports/state-repository.js";
import type { AppLogger } from "../src/infrastructure/app-logger.js";
import type { QueueWorkerController } from "./queue-worker.js";

export interface QueueControlServiceDependencies {
  store: StateRepository;
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

export class QueueControlService {
  private readonly deps: QueueControlServiceDependencies;

  constructor(deps: QueueControlServiceDependencies) {
    this.deps = deps;
  }

  private async setQueueLifecycle(
    lifecycle: QueueLifecycle,
    taskId?: string
  ): Promise<AppState> {
    const { store, sendState } = this.deps;
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
  }

  async resumeQueue(clearPauseBoundary = true): Promise<AppState> {
    const { store, logger, worker, sendState, executeQueue } = this.deps;
    if (this.deps.nativePromptBusy()) {
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
      worker.resume(executeQueue, () => {
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
    worker.start(executeQueue);
    return next;
  }

  async pauseQueue(): Promise<AppState> {
    const { store, logger, worker, sendState } = this.deps;
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
  }

  async cancelTask(taskId: string): Promise<AppState> {
    const { store, logger, worker, sendState } = this.deps;
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
      const settings = this.deps.settingsForTask(task, store.get().settings);
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
          await this.setQueueLifecycle("cleaning", taskId);
          await this.deps.cleanupCancelledTask(taskId, settings, runningWorker);
          const current = store.get();
          if (
            current.queueLifecycle === "cleaning" &&
            current.queueLifecycleTaskId === taskId
          ) {
            await this.setQueueLifecycle("idle");
          }
        } catch (error) {
          logger.error("queue", "cancel-cleanup-lifecycle-failed", "Queue cancellation lifecycle cleanup failed", {
            taskId,
            error: error instanceof Error ? error.message : String(error)
          });
          await this.setQueueLifecycle("error", taskId).catch(() => undefined);
        }
      })();
      worker.trackCleanup(cleanup);
      void cleanup;
      return next;
    }
    return this.deps.updateTask(taskId, {
      status: "cancelled",
      error: "任务在开始前被取消"
    });
  }
}
