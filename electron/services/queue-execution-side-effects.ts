import type {
  AppState,
  ExtensionQueueTask,
  H3MemoryRuntimeEvidence,
  H3VideoVaeBackend,
  HistoryFile,
  ImageGenerationQueueTask,
  ImageGenerationRun,
  NativeAvContinuationData,
  QueueTask,
  Settings,
  TaskPerformanceStats
} from "../../src/types.js";
import {
  isImageGenerationQueueTask,
  nextQueueWaitingTask,
  queuePauseBoundaryAfterTaskCompletion
} from "../../src/core/queue.js";
import { hashImageFile } from "../../src/infrastructure/image-asset-library.js";
import { finalizeExtensionOutput } from "./extension-media.js";
import { cleanupNativeSeedVr2Intermediates } from "./seedvr2-upscale.js";
import { freeMemory } from "./comfy-ui.js";
import type { StateRepository } from "../ports/state-repository.js";
import type { AppLogger } from "../../src/infrastructure/app-logger.js";
import { safeLogErrorMessage } from "../../src/infrastructure/app-logger.js";
import { persistImageHistoryResult, persistVideoHistoryResult } from "../queue-history.js";
import { recoverQueueFailure } from "../queue-recovery.js";

export type QueueIsolationReason = "lora" | "model-change" | "always";
type VideoQueueTask = Exclude<QueueTask, ImageGenerationQueueTask>;

export interface QueueExecutionSideEffectsDependencies {
  store: StateRepository;
  logger: AppLogger;
  sendState(state: AppState): void;
  updateTask(taskId: string, patch: Partial<QueueTask>): Promise<AppState>;
  resolveTaskOutputDirectory(): Promise<string>;
  requireExistingImageOutput(
    result: unknown,
    outputRoot: string,
    alternateRoots?: string[]
  ): Promise<HistoryFile[]>;
  requireExistingVideoOutput(result: unknown, alternateRoots?: string[]): Promise<HistoryFile[]>;
  prepareQueueRuntimeForTask(
    taskId: string,
    modelId: string,
    settings: Settings,
    reason: QueueIsolationReason
  ): Promise<boolean>;
  stabilizeH3RuntimeBetweenTasks(
    taskId: string,
    modelId: string,
    settings: Settings,
    hasVideoLoras: boolean,
    queueWillContinue: boolean
  ): Promise<boolean>;
  stopQueueRuntime(settings: Settings): Promise<boolean>;
  restartQueueRuntime(settings: Settings): Promise<{ ok: boolean; message: string }>;
  settingsForTask(task: QueueTask | undefined, settings: Settings): Settings;
  errorMeta(error: unknown): Record<string, unknown>;
}

export interface ImageRunCompletion {
  taskId: string;
  run: ImageGenerationRun;
  startedAt: string;
  completedAt: string;
  versionId: string;
  file: HistoryFile;
  promptId: string;
  comfyOutputs: unknown;
  performanceStats: TaskPerformanceStats;
}

export interface VideoTaskCompletion {
  task: VideoQueueTask;
  completedAt: string;
  promptId: string;
  comfyOutputs: unknown;
  files: HistoryFile[];
  performanceStats?: TaskPerformanceStats;
  h3MemoryRuntimeEvidence?: H3MemoryRuntimeEvidence;
  h3ContinuationData?: NativeAvContinuationData;
}

export interface QueueTaskClaim {
  state: AppState;
  claimed: boolean;
  settingsAtClaim?: Settings;
}

export class QueueExecutionSideEffects {
  private runtimeModelId: string | undefined;
  private runtimeHadH3VideoLoras = false;

  constructor(private readonly deps: QueueExecutionSideEffectsDependencies) {}

  async prepareTaskRuntime(
    task: QueueTask,
    signal: AbortSignal,
    hasH3VideoLoras: boolean
  ): Promise<void> {
    const { store, updateTask } = this.deps;
    const isolationMode = store.get().settings.queueIsolationMode;
    const reason: QueueIsolationReason | undefined = isolationMode === "always"
      ? "always"
      : isolationMode === "lora" && (hasH3VideoLoras || this.runtimeHadH3VideoLoras)
        ? "lora"
        : isolationMode === "model-change" && this.runtimeModelId !== undefined && this.runtimeModelId !== task.modelId
          ? "model-change"
          : undefined;
    if (!reason) return;
    await updateTask(task.id, {
      progress: 1,
      stage: "准备队列运行时隔离"
    });
    const prepared = await this.deps.prepareQueueRuntimeForTask(
      task.id,
      task.modelId,
      this.deps.settingsForTask(task, store.get().settings),
      reason
    );
    if (!prepared) {
      throw new Error("ComfyUI 无法建立请求的队列运行时隔离边界");
    }
    this.resetRuntime();
    if (signal.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new Error("队列任务已取消");
    }
  }

  markTaskSubmitted(task: QueueTask, hasH3VideoLoras: boolean): void {
    this.runtimeModelId = task.modelId;
    this.runtimeHadH3VideoLoras = hasH3VideoLoras;
  }

  resetRuntime(): void {
    this.runtimeModelId = undefined;
    this.runtimeHadH3VideoLoras = false;
  }

  async claimTask(taskId: string): Promise<QueueTaskClaim> {
    const { store, sendState } = this.deps;
    let claimed = false;
    let settingsAtClaim: Settings | undefined;
    const state = await store.update((next) => {
      const candidate = next.queue.find((item) => item.id === taskId);
      if (
        !next.queueRunning ||
        candidate?.status !== "waiting" ||
        nextQueueWaitingTask(next.queue, next.queuePauseBoundary)?.id !== taskId
      ) return;
      candidate.status = "running";
      candidate.progress = 1;
      candidate.stage = "准备任务";
      candidate.startedAt = new Date().toISOString();
      candidate.error = undefined;
      candidate.updatedAt = new Date().toISOString();
      settingsAtClaim = structuredClone(next.settings);
      claimed = true;
    });
    sendState(state);
    return { state, claimed, settingsAtClaim };
  }

  async stabilizeRuntime(
    taskId: string,
    modelId: string,
    settings: Settings,
    hasVideoLoras: boolean,
    queueWillContinue: boolean
  ): Promise<boolean> {
    return this.deps.stabilizeH3RuntimeBetweenTasks(
      taskId,
      modelId,
      settings,
      hasVideoLoras,
      queueWillContinue
    );
  }

  async stopRuntime(settings: Settings): Promise<boolean> {
    const stopped = await this.deps.stopQueueRuntime(settings);
    if (stopped) this.resetRuntime();
    return stopped;
  }

  async trackImageOutput(
    result: unknown,
    task: ImageGenerationQueueTask
  ): Promise<HistoryFile[]> {
    return this.deps.requireExistingImageOutput(
      result,
      task.imageOutputRoot ?? await this.deps.resolveTaskOutputDirectory(),
      [this.deps.store.get().settings.outputDirectory]
    );
  }

  async trackVideoOutput(result: unknown): Promise<HistoryFile[]> {
    return this.deps.requireExistingVideoOutput(
      result,
      [this.deps.store.get().settings.outputDirectory]
    );
  }

  async finalizeExtension(
    task: ExtensionQueueTask,
    generatedPath: string,
    signal: AbortSignal
  ): Promise<void> {
    await finalizeExtensionOutput(task, generatedPath, signal);
  }

  async cleanupSeedVr2Intermediates(paths: string[]): Promise<{ removed: number; failed: number }> {
    return cleanupNativeSeedVr2Intermediates(paths);
  }

  async releaseImageRuntime(settings: Settings): Promise<void> {
    return freeMemory(settings);
  }

  async beginImageRun(
    taskId: string,
    runId: string,
    runStartedAt: string,
    totalRuns: number
  ): Promise<AppState> {
    const { store, sendState } = this.deps;
    const next = await store.update((state) => {
      const queued = state.queue.find((item) => item.id === taskId);
      if (!queued || !isImageGenerationQueueTask(queued)) return;
      const run = queued.runs.find((item) => item.id === runId);
      if (!run) return;
      run.status = "running";
      run.startedAt = runStartedAt;
      run.progress = 1;
      queued.stage = `生成第 ${run.index + 1} / ${totalRuns} 张`;
    });
    sendState(next);
    return next;
  }

  async recordImageRun(completion: ImageRunCompletion): Promise<AppState> {
    const { store, sendState } = this.deps;
    const outputContentHash = completion.file.absolutePath
      ? await hashImageFile(completion.file.absolutePath).catch(() => undefined)
      : undefined;
    const next = await store.update((state) => {
      persistImageHistoryResult(state, {
        taskId: completion.taskId,
        run: completion.run,
        startedAt: completion.startedAt,
        completedAt: completion.completedAt,
        versionId: completion.versionId,
        file: completion.file,
        outputContentHash,
        promptId: completion.promptId,
        comfyOutputs: completion.comfyOutputs,
        performanceStats: completion.performanceStats
      });
    });
    sendState(next);
    return next;
  }

  async failImageRun(
    taskId: string,
    runId: string,
    aborted: boolean,
    error: unknown,
    performanceStats: TaskPerformanceStats
  ): Promise<AppState> {
    const { store } = this.deps;
    return store.update((state) => {
      const queued = state.queue.find((item) => item.id === taskId);
      if (!queued || !isImageGenerationQueueTask(queued)) return;
      const run = queued.runs.find((item) => item.id === runId);
      if (!run) return;
      run.status = aborted ? "cancelled" : "failed";
      run.error = error instanceof Error ? error.message : String(error);
      run.performanceStats = performanceStats;
      queued.error = run.error;
    });
  }

  async completeImageTask(
    task: ImageGenerationQueueTask,
    taskStartedAt: number
  ): Promise<AppState> {
    const { store, logger, sendState } = this.deps;
    const next = await store.update((state) => {
      const previousQueue = state.queue.map((item) => ({ ...item }));
      state.queue = state.queue.filter((item) => item.id !== task.id);
      const boundaryTransition = queuePauseBoundaryAfterTaskCompletion(
        previousQueue,
        state.queuePauseBoundary,
        task.id,
        state.queue
      );
      state.queuePauseBoundary = boundaryTransition.boundary;
      if (boundaryTransition.reached) {
        state.queueRunning = false;
      }
    });
    logger.info("queue", "task-finished", "Image batch task finished successfully", {
      taskId: task.id,
      taskType: task.taskType,
      modelId: task.modelId,
      runCount: task.runs.length,
      durationSeconds: Math.round((Date.now() - taskStartedAt) / 1000)
    });
    sendState(next);
    return next;
  }

  async completeVideoTask(completion: VideoTaskCompletion): Promise<AppState> {
    const { store, sendState } = this.deps;
    const next = await store.update((state) => {
      const previousQueue = state.queue.map((item) => ({ ...item }));
      persistVideoHistoryResult(state, {
        task: completion.task,
        completedAt: completion.completedAt,
        promptId: completion.promptId,
        comfyOutputs: completion.comfyOutputs,
        files: completion.files,
        performanceStats: completion.performanceStats,
        h3MemoryRuntimeEvidence: completion.h3MemoryRuntimeEvidence,
        h3ContinuationData: completion.h3ContinuationData,
        id: () => crypto.randomUUID()
      });
      const boundaryTransition = queuePauseBoundaryAfterTaskCompletion(
        previousQueue,
        state.queuePauseBoundary,
        completion.task.id,
        state.queue
      );
      state.queuePauseBoundary = boundaryTransition.boundary;
      if (boundaryTransition.reached) {
        state.queueRunning = false;
      }
    });
    sendState(next);
    return next;
  }

  async recoverFailure(
    task: VideoQueueTask,
    error: unknown,
    aborted: boolean,
    stalled: boolean,
    performanceStats?: TaskPerformanceStats
  ): Promise<void> {
    const { store, logger, sendState, updateTask } = this.deps;
    await recoverQueueFailure({
      store,
      logger,
      sendState,
      updateTask,
      settingsForTask: this.deps.settingsForTask,
      restartComfyUi: (_kind, settings) => this.deps.restartQueueRuntime(settings),
      onRuntimeRestarted: () => this.resetRuntime(),
      errorMeta: this.deps.errorMeta
    }, {
      task,
      error,
      aborted,
      stalled,
      performanceStats
    });
  }
}
