import { describe, expect, it, vi } from "vitest";
import { createDefaultDraft, createDefaultState } from "../src/core/defaults";
import { queueTaskFromDraft } from "../src/core/queue-task-factory";
import type { AppState, QueueTask } from "../src/types";
import type { StateRepository } from "../electron/ports/state-repository";
import { QueueControlService } from "../electron/queue-control-service";
import { QueueMutationService } from "../electron/queue-mutation-service";
import { QueueWorkerController } from "../electron/queue-worker";
import { QueueEnqueueService } from "../electron/queue-enqueue";
import { QueueService, type QueueServiceDependencies } from "../electron/services/queue-service";
import { QueueExecutionSideEffects } from "../electron/services/queue-execution-side-effects";
import type { QueueRuntimeCapability } from "../electron/ports/queue-runtime";

function repository(initial: AppState): StateRepository {
  let state = structuredClone(initial);
  return {
    load: async () => structuredClone(state),
    get: () => structuredClone(state),
    getSettings: () => structuredClone(state.settings),
    update: async (mutator) => {
      mutator(state);
      return structuredClone(state);
    }
  };
}

function task(state: AppState): QueueTask {
  return queueTaskFromDraft(
    { ...createDefaultDraft(), workflowPath: "workflow.json" },
    state,
    { now: () => new Date("2026-08-31T00:00:00.000Z"), id: () => "queue-service-task", random: () => 0.5 }
  );
}

function logger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;
}

function baseQueueServiceDependencies(state: AppState): QueueServiceDependencies {
  return {
    store: repository(state),
    logger: logger(),
    sendState: vi.fn(),
    sendPreview: vi.fn(),
    resolveTaskOutputDirectory: async () => "C:/ComfyUI/output",
    requireExistingImageOutput: async () => [],
    requireExistingVideoOutput: async () => [],
    releasePromptRuntime: async () => 0,
    queueRuntime: {
      ensureComfyUiReady: async () => undefined,
      prepareQueueRuntimeForTask: async () => true,
      stabilizeH3RuntimeBetweenTasks: async () => true,
      stopQueueRuntime: async () => true,
      restartQueueRuntime: async () => ({ ok: true, message: "restarted" }),
      resolveH3VideoVaeModeForTask: async (queuedTask) =>
        "h3VideoVaeMode" in queuedTask ? queuedTask.h3VideoVaeMode ?? "fp16" : "fp16",
      settingsForTask: (_task, settings) => settings,
      cleanupCancelledTask: async () => undefined
    },
    errorMeta: () => ({}),
    taskStageStartedAt: new Map(),
    nativePromptBusy: () => false,
    effectiveImageInputLibraryDirectory: async () => "C:/ComfyUI/input/library",
    imageInspection: { readDimensions: () => ({ width: 640, height: 360 }) }
  };
}

describe("queue command services", () => {
  it("persists the H3 live-preview preference through the queue mutation service", async () => {
    const state = createDefaultState();
    const service = new QueueMutationService({
      store: repository(state),
      logger: logger(),
      sendState: vi.fn()
    });

    const next = await service.setH3LivePreview(true);

    expect(next.settings.h3LivePreview).toBe(true);
  });

  it("starts a queue through the control service without an IPC transport", async () => {
    const state = createDefaultState();
    state.queue = [task(state)];
    const worker = new QueueWorkerController();
    const executeQueue = vi.fn(async () => undefined);
    const service = new QueueControlService({
      store: repository(state),
      logger: logger(),
      worker,
      sendState: vi.fn(),
      executeQueue,
      nativePromptBusy: () => false,
      settingsForTask: (_task, settings) => settings,
      cleanupCancelledTask: async () => undefined,
      updateTask: async () => state
    });

    const next = await service.resumeQueue();
    expect(next.queueRunning).toBe(true);
    expect(executeQueue).toHaveBeenCalledOnce();
    await worker.runningWorker;
  });

  it("applies queue mutations directly and keeps the state snapshot contract", async () => {
    const state = createDefaultState();
    state.queue = [task(state)];
    state.queuePauseBoundary = 1;
    const service = new QueueMutationService({
      store: repository(state),
      logger: logger(),
      sendState: vi.fn()
    });

    const next = await service.clearPauseBoundary();
    expect(next.queuePauseBoundary).toBeUndefined();
  });

  it("keeps enqueue validation callable without Electron native image state", async () => {
    const state = createDefaultState();
    const service = new QueueEnqueueService({
      store: repository(state),
      logger: logger(),
      sendState: vi.fn(),
      effectiveImageInputLibraryDirectory: async () => "C:/ComfyUI/input/library",
      resolveTaskOutputDirectory: async () => "C:/ComfyUI/output",
      imageInspection: { readDimensions: () => ({ width: 640, height: 360 }) }
    });

    await expect(service.enqueue({ ...createDefaultDraft(), inputMode: "video" }))
      .rejects.toThrow("视频续写必须使用独立的 extension 队列任务");
  });
});

describe("queue service facade", () => {
  it("assembles one worker, state service, command services, and executor", () => {
    const state = createDefaultState();
    const service = new QueueService(baseQueueServiceDependencies(state));

    expect(service.worker).toBeDefined();
    expect(service.state).toBeDefined();
    expect(service.sideEffects).toBeDefined();
    expect(service.control).toBeDefined();
    expect(service.mutation).toBeDefined();
    expect(service.enqueue).toBeDefined();
    expect(service.runningWorker).toBeNull();
    expect(service.activeController).toBeNull();
    expect(service.cleanupWorker).toBeNull();
  });

  it("preserves prototype runtime method receivers during H3 execution", async () => {
    const state = createDefaultState();
    state.queue = [{ ...task(state), modelId: "minimax_h3_fl2va" }];
    state.queueRunning = true;
    const dependencies = baseQueueServiceDependencies(state);
    const receiver = { marker: "production-runtime", resolveCalls: 0 };
    const runtimePrototype = {
      assertReceiver(this: typeof receiver): void {
        expect(this.marker).toBe("production-runtime");
      },
      ensureComfyUiReady(this: typeof receiver): Promise<void> {
        this.marker = "production-runtime";
        return Promise.resolve();
      },
      prepareQueueRuntimeForTask(this: typeof receiver): Promise<boolean> {
        runtimePrototype.assertReceiver.call(this);
        return Promise.resolve(true);
      },
      stabilizeH3RuntimeBetweenTasks(this: typeof receiver): Promise<boolean> {
        runtimePrototype.assertReceiver.call(this);
        return Promise.resolve(true);
      },
      stopQueueRuntime(this: typeof receiver): Promise<boolean> {
        runtimePrototype.assertReceiver.call(this);
        return Promise.resolve(true);
      },
      restartQueueRuntime(this: typeof receiver): Promise<{ ok: boolean; message: string }> {
        runtimePrototype.assertReceiver.call(this);
        return Promise.resolve({ ok: true, message: "restarted" });
      },
      resolveH3VideoVaeModeForTask(this: typeof receiver): Promise<null> {
        runtimePrototype.assertReceiver.call(this);
        this.resolveCalls += 1;
        return Promise.resolve(null);
      },
      settingsForTask(this: typeof receiver, _task: unknown, settings: AppState["settings"]): AppState["settings"] {
        runtimePrototype.assertReceiver.call(this);
        return settings;
      },
      cleanupCancelledTask(this: typeof receiver): Promise<void> {
        runtimePrototype.assertReceiver.call(this);
        return Promise.resolve();
      }
    };
    const runtime = Object.assign(
      Object.create(runtimePrototype) as object,
      receiver
    ) as QueueRuntimeCapability & typeof receiver;
    dependencies.queueRuntime = runtime;
    const service = new QueueService(dependencies);

    await service.execute();

    expect(runtime.resolveCalls).toBe(1);
    expect(dependencies.store.get().queue[0]?.error).toContain("H3 视频 VAE 未找到");
    expect(dependencies.store.get().queueRunning).toBe(false);
  });

  it("records a completed task and history output in one state update", async () => {
    const state = createDefaultState();
    const queued = task(state);
    state.queue = [queued];
    const deps = baseQueueServiceDependencies(state);
    const sideEffects = new QueueExecutionSideEffects({
      store: deps.store,
      logger: deps.logger,
      sendState: deps.sendState,
      updateTask: async () => state,
      resolveTaskOutputDirectory: deps.resolveTaskOutputDirectory,
      requireExistingImageOutput: deps.requireExistingImageOutput,
      requireExistingVideoOutput: deps.requireExistingVideoOutput,
      prepareQueueRuntimeForTask: deps.queueRuntime.prepareQueueRuntimeForTask,
      stabilizeH3RuntimeBetweenTasks: deps.queueRuntime.stabilizeH3RuntimeBetweenTasks,
      stopQueueRuntime: deps.queueRuntime.stopQueueRuntime,
      restartQueueRuntime: deps.queueRuntime.restartQueueRuntime,
      settingsForTask: deps.queueRuntime.settingsForTask,
      errorMeta: deps.errorMeta
    });

    const next = await sideEffects.completeVideoTask({
      task: queued as Exclude<QueueTask, { taskType: "image-generation" }>,
      completedAt: "2026-08-31T00:01:00.000Z",
      promptId: "prompt-service",
      comfyOutputs: { fixture: true },
      files: []
    });

    expect(next.queue).toHaveLength(0);
    expect(next.history).toHaveLength(1);
    expect(next.history[0]?.comfyPromptId).toBe("prompt-service");
  });
});
