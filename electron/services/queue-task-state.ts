import type {
  AppState,
  QueueLifecycle,
  QueueTask,
  QueueTaskProgressUpdate,
  QueueWorkProgress,
  SeedVr2UpscaleProgress
} from "../../src/types.js";
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
  sendProgress(update: QueueTaskProgressUpdate): void;
  stageStartedAt: Map<string, { stage: string; startedAt: number }>;
  progressEventIntervalMs?: number;
  progressPersistIntervalMs?: number;
}

export interface QueueTaskProgressPatch {
  progress?: number;
  stage?: string;
  workProgress?: QueueWorkProgress;
  seedVr2Progress?: SeedVr2UpscaleProgress;
}

export class QueueTaskStateService {
  private readonly pendingProgress = new Map<string, QueueTaskProgressUpdate>();
  private progressEventTimer: ReturnType<typeof setTimeout> | undefined;
  private progressPersistTimer: ReturnType<typeof setTimeout> | undefined;
  private progressPersistDirty = false;
  private progressRevision = 0;
  private progressPersistInFlight: Promise<void> | null = null;

  constructor(private readonly deps: QueueTaskStateDependencies) {}

  async updateTaskProgress(
    taskId: string,
    patch: QueueTaskProgressPatch
  ): Promise<void> {
    const updatedAt = new Date().toISOString();
    let applied = false;
    const mutate = (state: AppState): void => {
      const task = state.queue.find((item) => item.id === taskId);
      if (!task || task.status !== "running") return;
      const changed =
        (Object.prototype.hasOwnProperty.call(patch, "progress") && patch.progress !== task.progress) ||
        (Object.prototype.hasOwnProperty.call(patch, "stage") && patch.stage !== task.stage) ||
        (Object.prototype.hasOwnProperty.call(patch, "workProgress") &&
          JSON.stringify(patch.workProgress) !== JSON.stringify(task.workProgress)) ||
        (Object.prototype.hasOwnProperty.call(patch, "seedVr2Progress") &&
          JSON.stringify(patch.seedVr2Progress) !== JSON.stringify(
            task.taskType === "upscale" ? task.seedVr2Progress : undefined
          ));
      if (!changed) return;
      Object.assign(task, patch, { updatedAt });
      applied = true;
    };
    if (this.deps.store.mutateTransient) {
      this.deps.store.mutateTransient(mutate);
    } else if (this.deps.store.updateWithoutSnapshot) {
      await this.deps.store.updateWithoutSnapshot(mutate);
    } else {
      await this.deps.store.update(mutate);
    }
    if (!applied) return;

    const previous = this.pendingProgress.get(taskId);
    const eventPatch = {
      ...patch,
      ...(Object.prototype.hasOwnProperty.call(patch, "workProgress")
        ? { workProgress: patch.workProgress ?? null }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, "seedVr2Progress")
        ? { seedVr2Progress: patch.seedVr2Progress ?? null }
        : {})
    };
    this.pendingProgress.set(taskId, {
      ...previous,
      ...eventPatch,
      taskId,
      revision: ++this.progressRevision,
      updatedAt
    });
    this.scheduleProgressEvent();
    if (this.deps.store.mutateTransient) this.scheduleProgressPersist();
  }

  async updateTask(taskId: string, patch: Partial<QueueTask>): Promise<AppState> {
    const { store, logger, sendState, stageStartedAt } = this.deps;
    this.discardPendingProgress(taskId);
    await this.prepareDurableUpdate();
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
    await this.prepareDurableUpdate();
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

  async flushProgress(): Promise<void> {
    this.flushProgressEvents();
    await this.flushProgressPersistence();
  }

  private scheduleProgressEvent(): void {
    if (this.progressEventTimer) return;
    this.progressEventTimer = setTimeout(
      () => this.flushProgressEvents(),
      this.deps.progressEventIntervalMs ?? 100
    );
  }

  private flushProgressEvents(): void {
    if (this.progressEventTimer) clearTimeout(this.progressEventTimer);
    this.progressEventTimer = undefined;
    for (const update of this.pendingProgress.values()) this.deps.sendProgress(update);
    this.pendingProgress.clear();
  }

  private scheduleProgressPersist(): void {
    this.progressPersistDirty = true;
    if (this.progressPersistTimer) return;
    this.progressPersistTimer = setTimeout(
      () => void this.flushProgressPersistence(),
      this.deps.progressPersistIntervalMs ?? 1_000
    );
  }

  private async flushProgressPersistence(): Promise<void> {
    if (this.progressPersistTimer) clearTimeout(this.progressPersistTimer);
    this.progressPersistTimer = undefined;
    if (!this.progressPersistDirty || !this.deps.store.flush) {
      if (!this.deps.store.flush) this.progressPersistDirty = false;
      return;
    }
    if (this.progressPersistInFlight) {
      await this.progressPersistInFlight;
      if (!this.progressPersistDirty) return;
    }
    this.progressPersistDirty = false;
    const operation = this.deps.store.flush().catch((error) => {
      this.progressPersistDirty = true;
      this.deps.logger.error("queue", "progress-persist-failed", "Failed to persist queue progress checkpoint", {
        error: error instanceof Error ? error.message : String(error)
      });
    });
    this.progressPersistInFlight = operation;
    try {
      await operation;
    } finally {
      if (this.progressPersistInFlight === operation) this.progressPersistInFlight = null;
    }
  }

  private async prepareDurableUpdate(): Promise<void> {
    if (this.progressPersistTimer) clearTimeout(this.progressPersistTimer);
    this.progressPersistTimer = undefined;
    // The durable mutation that follows persists the latest live progress too.
    this.progressPersistDirty = false;
    if (this.progressPersistInFlight) await this.progressPersistInFlight;
  }

  private discardPendingProgress(taskId: string): void {
    this.pendingProgress.delete(taskId);
    if (!this.pendingProgress.size && this.progressEventTimer) {
      clearTimeout(this.progressEventTimer);
      this.progressEventTimer = undefined;
    }
  }
}
