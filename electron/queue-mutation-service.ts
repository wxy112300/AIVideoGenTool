import type { AppState, UpscaleQueueTask } from "../src/types.js";
import {
  activeQueueTaskIds,
  adjustQueuePauseBoundary,
  duplicateQueueTask,
  moveWaitingTaskWithPauseBoundary,
  normalizeQueuePauseBoundary,
  randomizeQueuedTaskSeed,
  queuePauseBoundaryReached,
  queueTaskIsDeferred,
  removeQueueTaskWithPauseBoundary,
  reorderWaitingTaskWithPauseBoundary,
  resetQueueTask,
  updateQueuedUpscaleTask
} from "../src/core/queue.js";
import type { StateRepository } from "./ports/state-repository.js";
import type { AppLogger } from "../src/infrastructure/app-logger.js";
import { fileURLToPath } from "node:url";

export interface QueueMutationServiceDependencies {
  store: StateRepository;
  logger: AppLogger;
  sendState(state: AppState): void;
  isQueueCleanupActive?: (taskId: string) => boolean;
  resumeQueue?: (clearPauseBoundary?: boolean) => Promise<AppState>;
}

export class QueueMutationService {
  constructor(private readonly deps: QueueMutationServiceDependencies) {}

  async setH3LivePreview(enabled: boolean): Promise<AppState> {
    const value = enabled === true;
    const { store, logger, sendState } = this.deps;
    const next = await store.update((state) => {
      state.settings.h3LivePreview = value;
    });
    logger.info("queue", "h3-live-preview-setting-changed", "H3 live preview queue preference changed", {
      enabled: value
    });
    sendState(next);
    return next;
  }

  async updateUpscale(
    taskId: string,
    patch: Pick<
      UpscaleQueueTask,
      "upscaleMode" | "targetWidth" | "targetHeight" | "targetOutputHeight" |
      "modelId" | "workflowPath" |
      "tileMode" | "faceRestore" | "outputFilename"
    >
  ): Promise<AppState> {
    const { store, sendState } = this.deps;
    const current = store.get().queue.find((task) => task.id === taskId);
    if (!current || current.taskType !== "upscale") {
      throw new Error("待编辑的 Upscale 任务不存在。");
    }
    const currentMode = current.upscaleMode ?? "pixel";
    if (patch.upscaleMode !== currentMode) {
      throw new Error("已排队的 Upscale 任务不能切换提升方案，请新建任务。");
    }
    if (currentMode === "h3-native") {
      const currentProvider = current.h3NativeInput?.provider ?? "bilinear";
      const requestedProvider = patch.targetHeight >= 1080 ? "learned-3d" : "bilinear";
      if (requestedProvider !== currentProvider) {
        throw new Error("已排队的 H3 Upscale 任务不能跨 bilinear/learned provider 修改分辨率，请新建任务。");
      }
    }
    const safePatch = currentMode === "h3-native"
      ? (() => {
          const input = current.h3NativeInput!;
          const workflowFilename = patch.targetHeight === 1440
            ? "minimax_h3_fl2va_ultimate_tiled_second_sample_av_api.json"
            : "minimax_h3_fl2va_learned_3d_second_sample_av_api.json";
          const workflowPath = fileURLToPath(new URL(`../workflows/${workflowFilename}`, import.meta.url));
          return {
            ...patch,
            modelId: current.modelId,
            workflowPath,
            h3NativeInput: {
              ...input,
              workflowPath,
              scaleBy: patch.targetHeight / Math.min(input.artifact.width, input.artifact.height)
            }
          };
        })()
      : patch;
    const next = await store.update((state) => {
      const previousQueue = state.queue.map((item) => ({ ...item }));
      state.queue = updateQueuedUpscaleTask(state.queue, taskId, safePatch);
      state.queuePauseBoundary = adjustQueuePauseBoundary(
        previousQueue,
        state.queuePauseBoundary,
        state.queue
      );
    });
    sendState(next);
    return next;
  }

  async remove(taskId: string): Promise<AppState> {
    const { store, sendState } = this.deps;
    const next = await store.update((state) => {
      const previousQueue = state.queue.map((item) => ({ ...item }));
      const result = removeQueueTaskWithPauseBoundary(
        state.queue,
        state.queuePauseBoundary,
        taskId
      );
      state.queue = result.queue;
      const boundaryReached = queuePauseBoundaryReached(
        previousQueue,
        state.queuePauseBoundary,
        state.queue
      );
      state.queuePauseBoundary = boundaryReached ? undefined : result.boundary;
      if (boundaryReached) state.queueRunning = false;
    });
    sendState(next);
    return next;
  }

  async move(taskId: string, direction: -1 | 1): Promise<AppState> {
    const { store, sendState, resumeQueue } = this.deps;
    const current = store.get();
    const wasDeferred = !current.queueRunning &&
      queueTaskIsDeferred(current.queue, current.queuePauseBoundary, taskId);
    const next = await store.update((state) => {
      const result = moveWaitingTaskWithPauseBoundary(
        state.queue,
        state.queuePauseBoundary,
        taskId,
        direction
      );
      state.queue = result.queue;
      state.queuePauseBoundary = result.boundary;
    });
    sendState(next);
    if (
      wasDeferred &&
      !queueTaskIsDeferred(next.queue, next.queuePauseBoundary, taskId) &&
      resumeQueue
    ) {
      return resumeQueue(false);
    }
    return next;
  }

  async reorder(
    taskId: string,
    targetWaitingIndex: number,
    pauseBoundaryTarget?: number
  ): Promise<AppState> {
    if (typeof taskId !== "string" || !Number.isInteger(targetWaitingIndex)) {
      throw new Error("无效的队列排序位置。");
    }
    if (pauseBoundaryTarget !== undefined &&
      (!Number.isInteger(pauseBoundaryTarget) || pauseBoundaryTarget < 1)) {
      throw new Error("无效的队列分割位置。");
    }
    const { store, sendState, resumeQueue } = this.deps;
    const current = store.get();
    const wasDeferred = !current.queueRunning &&
      queueTaskIsDeferred(current.queue, current.queuePauseBoundary, taskId);
    const next = await store.update((state) => {
      const result = reorderWaitingTaskWithPauseBoundary(
        state.queue,
        state.queuePauseBoundary,
        taskId,
        targetWaitingIndex
      );
      state.queue = result.queue;
      state.queuePauseBoundary = pauseBoundaryTarget === undefined
        ? result.boundary
        : normalizeQueuePauseBoundary(state.queue, pauseBoundaryTarget);
    });
    sendState(next);
    if (
      wasDeferred &&
      !queueTaskIsDeferred(next.queue, next.queuePauseBoundary, taskId) &&
      resumeQueue
    ) {
      return resumeQueue(false);
    }
    return next;
  }

  async duplicate(taskId: string): Promise<AppState> {
    const { store, sendState } = this.deps;
    const next = await store.update((state) => {
      state.queue = duplicateQueueTask(state, taskId);
    });
    sendState(next);
    return next;
  }

  async randomizeSeed(taskId: string): Promise<AppState> {
    if (typeof taskId !== "string" || !taskId.trim()) {
      throw new Error("无效的任务。 ");
    }
    const { store, sendState } = this.deps;
    const next = await store.update((state) => {
      state.queue = randomizeQueuedTaskSeed(state.queue, taskId);
    });
    sendState(next);
    return next;
  }

  async setPauseBoundaryAfterTask(taskId: string): Promise<AppState> {
    if (typeof taskId !== "string" || !taskId.trim()) {
      throw new Error("无效的队列任务。 ");
    }
    const { store, sendState } = this.deps;
    const next = await store.update((state) => {
      const task = state.queue.find((candidate) => candidate.id === taskId);
      const activeIndex = activeQueueTaskIds(state.queue).indexOf(taskId);
      if (activeIndex < 0) throw new Error("只能将分割线放在等待或运行中的任务之后。 ");
      const activeCount = state.queue.filter((task) =>
        task.status === "waiting" || task.status === "running"
      ).length;
      state.queuePauseBoundary = Math.max(
        1,
        Math.min(activeCount, activeIndex + 1)
      );
      if (task?.status === "running" && state.queueRunning) {
        state.queueRunning = false;
        state.queueLifecycle = "pausing";
        state.queueLifecycleTaskId = task.id;
        state.queueLifecycleStartedAt = new Date().toISOString();
      }
    });
    sendState(next);
    return next;
  }

  async setPauseBoundary(waitingTaskCount: number): Promise<AppState> {
    if (!Number.isInteger(waitingTaskCount) || waitingTaskCount < 0) {
      throw new Error("无效的队列分割位置。 ");
    }
    const { store, sendState } = this.deps;
    const next = await store.update((state) => {
      const activeCount = state.queue.filter((task) =>
        task.status === "waiting" || task.status === "running"
      ).length;
      if (activeCount === 0) {
        state.queuePauseBoundary = undefined;
        return;
      }
      const running = state.queue.some((task) => task.status === "running");
      state.queuePauseBoundary = Math.max(
        1,
        Math.min(activeCount, waitingTaskCount + (running ? 1 : 0))
      );
      if (running && state.queueRunning && waitingTaskCount === 0) {
        const runningTask = state.queue.find((task) => task.status === "running");
        state.queueRunning = false;
        state.queueLifecycle = runningTask ? "pausing" : state.queueLifecycle;
        state.queueLifecycleTaskId = runningTask?.id;
        state.queueLifecycleStartedAt = runningTask ? new Date().toISOString() : undefined;
      }
    });
    sendState(next);
    return next;
  }

  async clearPauseBoundary(): Promise<AppState> {
    const { store, sendState } = this.deps;
    const next = await store.update((state) => {
      state.queuePauseBoundary = undefined;
    });
    sendState(next);
    // Removing the divider is an editing action. It must not implicitly
    // start a paused queue; the user can press Continue when ready.
    return next;
  }

  async reset(taskId: string): Promise<AppState> {
    const { store, logger, sendState } = this.deps;
    const current = store.get();
    const cleanupActive = this.deps.isQueueCleanupActive?.(taskId) ?? true;
    if (
      current.queueLifecycleTaskId === taskId &&
      cleanupActive
    ) {
      throw new Error("任务仍在清理中，请等待取消操作完成后再重置。 ");
    }
    let reset = false;
    const next = await store.update((state) => {
      const previousQueue = state.queue.map((item) => ({ ...item }));
      const result = resetQueueTask(state.queue, taskId);
      state.queue = result.queue;
      reset = result.reset;
      state.queuePauseBoundary = adjustQueuePauseBoundary(
        previousQueue,
        state.queuePauseBoundary,
        state.queue
      );
      if (
        reset &&
        state.queueLifecycleTaskId === taskId &&
        !cleanupActive
      ) {
        state.queueRunning = false;
        state.queueLifecycle = "idle";
        state.queueLifecycleTaskId = undefined;
        state.queueLifecycleStartedAt = undefined;
      }
    });
    if (reset) {
      logger.info(
        "queue",
        "task-reset-to-waiting",
        "Failed or cancelled task was reset to the waiting queue without starting it",
        { taskId, queueRunning: next.queueRunning }
      );
    }
    sendState(next);
    return next;
  }
}
