import type { AppState, QueueLifecycle, QueueTask } from "../../src/types.js";
import {
  QueueControlService,
  type QueueControlServiceDependencies
} from "../queue-control-service.js";
import {
  QueueEnqueueService,
  type QueueEnqueueServiceDependencies
} from "../queue-enqueue.js";
import { QueueMutationService } from "../queue-mutation-service.js";
import {
  createQueueExecutor,
  type QueueExecutorDependencies
} from "../queue-executor.js";
import { QueueWorkerController } from "../queue-worker.js";
import { QueueTaskStateService } from "./queue-task-state.js";
import { QueueExecutionSideEffects } from "./queue-execution-side-effects.js";
import type { QueueRuntimeCapability } from "../ports/queue-runtime.js";

export interface QueueServiceDependencies
  extends Omit<
      QueueExecutorDependencies,
      "worker" | "sideEffects" | "setQueueLifecycle" | "updateTask" | keyof QueueRuntimeCapability
    >,
    Pick<QueueControlServiceDependencies, "nativePromptBusy">,
    Pick<QueueEnqueueServiceDependencies, "effectiveImageInputLibraryDirectory" | "resolveTaskOutputDirectory" | "imageInspection"> {
  queueRuntime: QueueRuntimeCapability;
}

export class QueueService {
  readonly worker = new QueueWorkerController();
  readonly state: QueueTaskStateService;
  readonly sideEffects: QueueExecutionSideEffects;
  readonly control: QueueControlService;
  readonly mutation: QueueMutationService;
  readonly enqueue: QueueEnqueueService;
  private readonly executor: () => Promise<void>;

  constructor(deps: QueueServiceDependencies) {
    const runtime = deps.queueRuntime;
    this.state = new QueueTaskStateService({
      store: deps.store,
      logger: deps.logger,
      sendState: deps.sendState,
      stageStartedAt: deps.taskStageStartedAt
    });
    const updateTask = (taskId: string, patch: Partial<QueueTask>): Promise<AppState> =>
      this.state.updateTask(taskId, patch);
    const setQueueLifecycle = (
      lifecycle: QueueLifecycle,
      taskId?: string
    ): Promise<AppState> => this.state.setQueueLifecycle(lifecycle, taskId);

    this.sideEffects = new QueueExecutionSideEffects({
      store: deps.store,
      logger: deps.logger,
      sendState: deps.sendState,
      updateTask,
      resolveTaskOutputDirectory: deps.resolveTaskOutputDirectory,
      requireExistingImageOutput: deps.requireExistingImageOutput,
      requireExistingVideoOutput: deps.requireExistingVideoOutput,
      prepareQueueRuntimeForTask: runtime.prepareQueueRuntimeForTask,
      stabilizeH3RuntimeBetweenTasks: runtime.stabilizeH3RuntimeBetweenTasks,
      stopQueueRuntime: runtime.stopQueueRuntime,
      restartQueueRuntime: runtime.restartQueueRuntime,
      settingsForTask: runtime.settingsForTask,
      errorMeta: deps.errorMeta
    });
    this.executor = createQueueExecutor({
      ...deps,
      ...runtime,
      worker: this.worker,
      setQueueLifecycle,
      updateTask,
      sideEffects: this.sideEffects
    });
    this.control = new QueueControlService({
      store: deps.store,
      logger: deps.logger,
      worker: this.worker,
      sendState: deps.sendState,
      executeQueue: () => this.execute(),
      nativePromptBusy: deps.nativePromptBusy,
      settingsForTask: runtime.settingsForTask,
      cleanupCancelledTask: runtime.cleanupCancelledTask,
      updateTask
    });
    this.mutation = new QueueMutationService({
      store: deps.store,
      logger: deps.logger,
      sendState: deps.sendState,
      isQueueCleanupActive: () => Boolean(
        this.worker.cleanupWorker ||
        this.worker.runningWorker ||
        this.worker.activeController
      ),
      resumeQueue: (clearPauseBoundary = true) =>
        this.control.resumeQueue(clearPauseBoundary)
    });
    this.enqueue = new QueueEnqueueService({
      store: deps.store,
      logger: deps.logger,
      sendState: deps.sendState,
      effectiveImageInputLibraryDirectory: deps.effectiveImageInputLibraryDirectory,
      resolveTaskOutputDirectory: deps.resolveTaskOutputDirectory,
      imageInspection: deps.imageInspection
    });
  }

  execute(): Promise<void> {
    return this.executor();
  }

  updateTask(taskId: string, patch: Partial<QueueTask>): Promise<AppState> {
    return this.state.updateTask(taskId, patch);
  }

  setQueueLifecycle(
    lifecycle: Parameters<QueueTaskStateService["setQueueLifecycle"]>[0],
    taskId?: string
  ): Promise<AppState> {
    return this.state.setQueueLifecycle(lifecycle, taskId);
  }

  get runningWorker(): Promise<void> | null {
    return this.worker.runningWorker;
  }

  get activeController(): AbortController | null {
    return this.worker.activeController;
  }

  get cleanupWorker(): Promise<void> | null {
    return this.worker.cleanupWorker;
  }

  abort(reason: Error): void {
    this.worker.abort(reason);
  }
}
