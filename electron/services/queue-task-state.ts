import type { AppState, QueueLifecycle, QueueTask } from "../../src/types.js";
import {
  adjustQueuePauseBoundary,
  queuePauseBoundaryReached
} from "../../src/core/queue.js";
import type { StateRepository } from "../ports/state-repository.js";
import type { AppLogger } from "../../src/infrastructure/app-logger.js";

export interface QueueTaskStateDependencies {
  store: StateRepository;
  logger: AppLogger;
  sendState(state: AppState): void;
  stageStartedAt: Map<string, { stage: string; startedAt: number }>;
}

export class QueueTaskStateService {
  constructor(private readonly deps: QueueTaskStateDependencies) {}

  async updateTask(taskId: string, patch: Partial<QueueTask>): Promise<AppState> {
    const { store, logger, sendState, stageStartedAt } = this.deps;
    const next = await store.update((state) => {
      const task = state.queue.find((item) => item.id === taskId);
      if (!task) return;
      const previousQueue = state.queue.map((item) => ({ ...item }));
      const previousBoundary = state.queuePauseBoundary;
      if (patch.status && patch.status !== task.status) {
        logger.info("queue", "task-status", "Queue task status changed", {
          taskId,
          taskType: task.taskType,
          modelId: task.modelId,
          status: patch.status
        });
      }
      if (patch.stage && patch.stage !== task.stage) {
        const previousStage = stageStartedAt.get(taskId);
        if (previousStage) {
          logger.info("queue", "stage-duration", "Queue task stage finished", {
            taskId,
            taskType: task.taskType,
            modelId: task.modelId,
            stage: previousStage.stage,
            durationSeconds: Math.round((Date.now() - previousStage.startedAt) / 1000)
          });
        }
        stageStartedAt.set(taskId, { stage: patch.stage, startedAt: Date.now() });
        patch.stageStartedAt = new Date().toISOString();
        logger.info("queue", "task-stage", "Queue task stage changed", {
          taskId,
          taskType: task.taskType,
          modelId: task.modelId,
          progress: patch.progress ?? task.progress ?? 0,
          stage: patch.stage
        });
      }
      Object.assign(task, patch, { updatedAt: new Date().toISOString() });
      const boundaryReached = queuePauseBoundaryReached(
        previousQueue,
        previousBoundary,
        state.queue
      );
      state.queuePauseBoundary = boundaryReached
        ? undefined
        : adjustQueuePauseBoundary(
          previousQueue,
          previousBoundary,
          state.queue
        );
      if (boundaryReached) state.queueRunning = false;
    });
    sendState(next);
    return next;
  }

  async setQueueLifecycle(
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
}
