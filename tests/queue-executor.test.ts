import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppState, HistoryFile, QueueTask, TaskPerformanceStats, TaskPreview } from "../src/types";
import { createDefaultDraft, createDefaultState } from "../src/core/defaults";
import { queueTaskFromDraft } from "../src/core/queue-task-factory";
import { H3_TURBO_V4_LORA } from "../src/core/video-loras";
import { createQueueExecutor, type QueueExecutorDependencies } from "../electron/queue-executor";
import { QueueWorkerController } from "../electron/queue-worker";

const mocks = vi.hoisted(() => ({
  freeMemory: vi.fn(async () => 0),
  submitTask: vi.fn(),
  submitImageTask: vi.fn(),
  waitForTask: vi.fn(),
  hashImageFile: vi.fn(async () => "fixture-hash"),
  finalizeExtensionOutput: vi.fn(async () => undefined),
  startTaskPerformanceMonitor: vi.fn(),
  startAdaptiveVramWatchdog: vi.fn(),
  recoverQueueFailure: vi.fn()
}));

vi.mock("../electron/services/comfy-ui.js", () => ({
  freeMemory: mocks.freeMemory,
  submitTask: mocks.submitTask,
  submitImageTask: mocks.submitImageTask,
  waitForTask: mocks.waitForTask,
  TaskStalledError: class TaskStalledError extends Error {}
}));
vi.mock("../electron/services/image-asset-library.js", () => ({
  hashImageFile: mocks.hashImageFile
}));
vi.mock("../electron/services/extension-media.js", () => ({
  finalizeExtensionOutput: mocks.finalizeExtensionOutput
}));
vi.mock("../electron/services/performance.js", () => ({
  startTaskPerformanceMonitor: mocks.startTaskPerformanceMonitor
}));
vi.mock("../electron/services/vram-watchdog.js", () => ({
  startAdaptiveVramWatchdog: mocks.startAdaptiveVramWatchdog
}));
vi.mock("../electron/queue-recovery.js", () => ({
  recoverQueueFailure: mocks.recoverQueueFailure
}));

const performanceStats: TaskPerformanceStats = {
  durationSeconds: 1,
  sampleCount: 1,
  gpuSampleCount: 0,
  cpuAveragePercent: 10,
  cpuPeakPercent: 10,
  memoryAverageBytes: 1,
  memoryPeakBytes: 1,
  memoryTotalBytes: 2,
  gpuAveragePercent: null,
  gpuPeakPercent: null,
  gpuTemperaturePeak: null,
  vramBaselineBytes: null,
  vramAverageBytes: null,
  vramPeakBytes: null,
  vramTotalBytes: null,
  sharedGpuMemoryPeakBytes: null
};

const outputFile: HistoryFile = {
  filename: "fixture.mp4",
  subfolder: "",
  type: "output",
  absolutePath: "C:/ComfyUI/output/fixture.mp4"
};

type LiveStore = {
  get(): AppState;
  update(mutator: (state: AppState) => void): Promise<AppState>;
  live(): AppState;
};

function fixtureTask(state: AppState): QueueTask {
  return queueTaskFromDraft(
    {
      ...createDefaultDraft(),
      workflowPath: "C:/ComfyUI/workflows/fixture.json",
      duration: 1,
      resolution: 480,
      fps: 24
    },
    state,
    {
      now: () => new Date("2026-08-20T12:00:00.000Z"),
      id: () => "queue-runtime-task",
      random: () => 0.5
    }
  );
}

function createStore(
  state: AppState,
  beforeUpdate?: (state: AppState, updateNumber: number) => void
): LiveStore {
  let updateNumber = 0;
  return {
    get: () => structuredClone(state),
    live: () => state,
    update: async (mutator) => {
      updateNumber += 1;
      beforeUpdate?.(state, updateNumber);
      mutator(state);
      return structuredClone(state);
    }
  };
}

function configureMocks(): void {
  vi.clearAllMocks();
  mocks.startTaskPerformanceMonitor.mockReturnValue({
    recordGpuSample: vi.fn(),
    snapshot: vi.fn(async () => ({
      elapsedSeconds: 0,
      cpuPercent: 10,
      memoryUsedBytes: 1,
      memoryTotalBytes: 2,
      gpuPercent: null,
      vramUsedBytes: null,
      vramTotalBytes: null,
      sharedGpuMemoryBytes: null,
      sharedGpuMemoryPeakBytes: null,
      gpuTemperatureC: null
    })),
    stop: vi.fn(() => performanceStats)
  });
  mocks.startAdaptiveVramWatchdog.mockReturnValue({
    stop: vi.fn(),
    peakUsedMiB: vi.fn(() => 0)
  });
  mocks.submitTask.mockResolvedValue({
    promptId: "prompt-fixture",
    clientId: "client-fixture",
    nodeTypes: { "1": "FixtureNode" },
    h3LivePreviewRequested: false,
    h3LivePreviewActive: false
  });
  mocks.waitForTask.mockImplementation(async (...args: unknown[]) => {
    const onProgress = args[6] as ((progress: number, stage: string, determinate: boolean) => void);
    const onPreview = args[7] as ((dataUrl: string, source: "h3-tae" | "comfy", metadata?: { sequence?: number }) => void);
    onProgress(42, "生成中", true);
    onPreview("data:image/png;base64,fixture", "comfy", { sequence: 1 });
    return { outputs: { fixture: true } };
  });
  mocks.recoverQueueFailure.mockImplementation(async (
    deps: { updateTask(taskId: string, patch: Partial<QueueTask>): Promise<AppState> },
    context: { task: QueueTask; error: unknown; aborted: boolean }
  ) => {
    await deps.updateTask(context.task.id, {
      status: context.aborted ? "cancelled" : "failed",
      error: context.error instanceof Error ? context.error.message : String(context.error)
    });
  });
}

function createHarness(
  state: AppState,
  options: {
    beforeUpdate?: (state: AppState, updateNumber: number) => void;
    ensureComfyUiReady?: (taskId: string, signal?: AbortSignal) => Promise<void>;
    prepareQueueRuntimeForTask?: QueueExecutorDependencies["prepareQueueRuntimeForTask"];
    stabilizeH3RuntimeBetweenTasks?: QueueExecutorDependencies["stabilizeH3RuntimeBetweenTasks"];
    stopQueueRuntime?: QueueExecutorDependencies["stopQueueRuntime"];
    restartQueueRuntime?: QueueExecutorDependencies["restartQueueRuntime"];
  } = {}
): {
  deps: QueueExecutorDependencies;
  store: LiveStore;
  worker: QueueWorkerController;
  snapshots: AppState[];
  previews: TaskPreview[];
  lifecycle: string[];
} {
  const store = createStore(state, options.beforeUpdate);
  const worker = new QueueWorkerController();
  const snapshots: AppState[] = [];
  const previews: TaskPreview[] = [];
  const lifecycle: string[] = [];
  const updateTask = async (taskId: string, patch: Partial<QueueTask>): Promise<AppState> => {
    const next = await store.update((current) => {
      const task = current.queue.find((item) => item.id === taskId);
      if (task) Object.assign(task, patch, { updatedAt: new Date().toISOString() });
    });
    snapshots.push(next);
    return next;
  };
  const setQueueLifecycle = async (
    nextLifecycle: "idle" | "starting" | "running" | "pausing" | "cancelling" | "cleaning" | "error",
    taskId?: string
  ): Promise<AppState> => {
    lifecycle.push(nextLifecycle);
    const next = await store.update((current) => {
      current.queueLifecycle = nextLifecycle;
      current.queueLifecycleTaskId = taskId;
    });
    snapshots.push(next);
    return next;
  };
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  } as never;
  const deps: QueueExecutorDependencies = {
    store: store as never,
    logger,
    worker,
    sendState: (next) => snapshots.push(next),
    sendPreview: (preview) => previews.push(preview),
    setQueueLifecycle,
    updateTask,
    ensureComfyUiReady: options.ensureComfyUiReady ?? (async () => undefined),
    resolveTaskOutputDirectory: async () => "C:/ComfyUI/output",
    requireExistingImageOutput: async () => [],
    requireExistingVideoOutput: async () => [outputFile],
    releasePromptRuntime: async () => 0,
    prepareQueueRuntimeForTask: options.prepareQueueRuntimeForTask ?? (async () => true),
    stabilizeH3RuntimeBetweenTasks: options.stabilizeH3RuntimeBetweenTasks ?? (async () => true),
    stopQueueRuntime: options.stopQueueRuntime ?? (async () => true),
    restartQueueRuntime: options.restartQueueRuntime ?? (async () => ({ ok: true, message: "restarted" })),
    settingsForTask: (_task, settings) => settings,
    errorMeta: () => ({}),
    taskStageStartedAt: new Map()
  };
  return { deps, store, worker, snapshots, previews, lifecycle };
}

describe("queue executor runtime gate", () => {
  beforeEach(() => {
    configureMocks();
  });

  it("completes one task, records history, and closes the queue lifecycle", async () => {
    const state = createDefaultState();
    const task = fixtureTask(state);
    state.queue = [task];
    state.queueRunning = true;
    state.queueLifecycle = "starting";
    const stopQueueRuntime = vi.fn(async () => true);
    const harness = createHarness(state, { stopQueueRuntime });

    await createQueueExecutor(harness.deps)();

    const final = harness.store.get();
    expect(final.queue).toHaveLength(0);
    expect(final.history).toHaveLength(1);
    expect(final.history[0]).toMatchObject({
      taskId: task.id,
      comfyPromptId: "prompt-fixture"
    });
    expect(final.queueRunning).toBe(false);
    expect(final.queueLifecycle).toBe("idle");
    expect(mocks.submitTask).toHaveBeenCalledOnce();
    expect(mocks.waitForTask).toHaveBeenCalledOnce();
    expect(stopQueueRuntime).toHaveBeenCalledOnce();
    expect(harness.previews).toEqual([
      expect.objectContaining({ taskId: task.id, source: "comfy", sequence: 1 })
    ]);
    expect(harness.snapshots.some((snapshot) =>
      snapshot.queue.some((queued) => queued.id === task.id && queued.status === "running")
    )).toBe(true);
  });

  it("keeps an H3 task without LoRAs on the normal release path", async () => {
    const state = createDefaultState();
    const task = fixtureTask(state);
    state.queue = [task];
    state.queueRunning = true;
    const prepare = vi.fn(async () => true);
    const stabilize = vi.fn(async () => true);
    const harness = createHarness(state, {
      prepareQueueRuntimeForTask: prepare,
      stabilizeH3RuntimeBetweenTasks: stabilize
    });

    await createQueueExecutor(harness.deps)();

    expect(prepare).not.toHaveBeenCalled();
    expect(stabilize).toHaveBeenCalledWith(
      task.id,
      task.modelId,
      expect.any(Object),
      false,
      false
    );
  });

  it("isolates an H3 LoRA task before submission", async () => {
    const state = createDefaultState();
    const task = fixtureTask(state);
    if (task.taskType !== "generation") throw new Error("Expected a generation fixture");
    task.videoLoras = [H3_TURBO_V4_LORA];
    state.queue = [task];
    state.queueRunning = true;
    const prepare = vi.fn(async () => true);
    const ensureReady = vi.fn(async () => undefined);
    const stabilize = vi.fn(async () => true);
    const harness = createHarness(state, {
      ensureComfyUiReady: ensureReady,
      prepareQueueRuntimeForTask: prepare,
      stabilizeH3RuntimeBetweenTasks: stabilize
    });

    await createQueueExecutor(harness.deps)();

    expect(prepare).toHaveBeenCalledWith(
      task.id,
      task.modelId,
      expect.any(Object),
      "lora"
    );
    expect(prepare.mock.invocationCallOrder[0]).toBeLessThan(ensureReady.mock.invocationCallOrder[0]!);
    expect(ensureReady.mock.invocationCallOrder[0]).toBeLessThan(mocks.submitTask.mock.invocationCallOrder[0]!);
    expect(stabilize).toHaveBeenCalledWith(
      task.id,
      task.modelId,
      expect.any(Object),
      true,
      false
    );
    expect(mocks.submitTask.mock.invocationCallOrder[0]).toBeLessThan(stabilize.mock.invocationCallOrder[0]!);
  });

  it("carries the dirty LoRA runtime state into the next consecutive preflight", async () => {
    const state = createDefaultState();
    const first = fixtureTask(state);
    const second = fixtureTask(state);
    if (first.taskType !== "generation" || second.taskType !== "generation") {
      throw new Error("Expected generation fixtures");
    }
    first.videoLoras = [H3_TURBO_V4_LORA];
    second.id = "queue-runtime-task-2";
    second.videoLoras = [H3_TURBO_V4_LORA];
    state.queue = [first, second];
    state.queueRunning = true;
    const prepare = vi.fn(async () => true);
    const stabilize = vi.fn(async () => true);
    const harness = createHarness(state, {
      prepareQueueRuntimeForTask: prepare,
      stabilizeH3RuntimeBetweenTasks: stabilize
    });

    await createQueueExecutor(harness.deps)();

    expect(prepare).toHaveBeenCalledTimes(2);
    expect(prepare).toHaveBeenNthCalledWith(
      1,
      first.id,
      first.modelId,
      expect.any(Object),
      "lora"
    );
    expect(prepare).toHaveBeenNthCalledWith(
      2,
      second.id,
      second.modelId,
      expect.any(Object),
      "lora"
    );
    expect(stabilize).toHaveBeenNthCalledWith(
      1,
      first.id,
      first.modelId,
      expect.any(Object),
      true,
      true
    );
    expect(stabilize).toHaveBeenNthCalledWith(
      2,
      second.id,
      second.modelId,
      expect.any(Object),
      true,
      false
    );
  });

  it("isolates the first non-LoRA task after an H3 LoRA task", async () => {
    const state = createDefaultState();
    const first = fixtureTask(state);
    const second = fixtureTask(state);
    if (first.taskType !== "generation" || second.taskType !== "generation") {
      throw new Error("Expected generation fixtures");
    }
    first.videoLoras = [H3_TURBO_V4_LORA];
    second.id = "queue-runtime-task-2";
    state.queue = [first, second];
    state.queueRunning = true;
    const prepare = vi.fn(async () => true);
    const harness = createHarness(state, { prepareQueueRuntimeForTask: prepare });

    await createQueueExecutor(harness.deps)();

    expect(prepare).toHaveBeenNthCalledWith(
      1,
      first.id,
      first.modelId,
      expect.any(Object),
      "lora"
    );
    expect(prepare).toHaveBeenNthCalledWith(
      2,
      second.id,
      second.modelId,
      expect.any(Object),
      "lora"
    );
  });

  it("does not restart between tasks when queue isolation is disabled", async () => {
    const state = createDefaultState();
    state.settings.queueIsolationMode = "never";
    const first = fixtureTask(state);
    const second = fixtureTask(state);
    if (first.taskType !== "generation") throw new Error("Expected a generation fixture");
    first.videoLoras = [H3_TURBO_V4_LORA];
    second.id = "queue-runtime-task-2";
    second.modelId = "z-image-turbo";
    state.queue = [first, second];
    state.queueRunning = true;
    const prepare = vi.fn(async () => true);
    const harness = createHarness(state, { prepareQueueRuntimeForTask: prepare });

    await createQueueExecutor(harness.deps)();

    expect(prepare).not.toHaveBeenCalled();
    expect(mocks.submitTask).toHaveBeenCalledTimes(2);
  });

  it("restarts only when the submitted task model changes", async () => {
    const state = createDefaultState();
    state.settings.queueIsolationMode = "model-change";
    const first = fixtureTask(state);
    const second = fixtureTask(state);
    const third = fixtureTask(state);
    second.id = "queue-runtime-task-2";
    third.id = "queue-runtime-task-3";
    third.modelId = "z-image-turbo";
    state.queue = [first, second, third];
    state.queueRunning = true;
    const prepare = vi.fn(async () => true);
    const harness = createHarness(state, { prepareQueueRuntimeForTask: prepare });

    await createQueueExecutor(harness.deps)();

    expect(prepare).toHaveBeenCalledOnce();
    expect(prepare).toHaveBeenCalledWith(
      third.id,
      third.modelId,
      expect.any(Object),
      "model-change"
    );
  });

  it("restarts before every claimed task in always mode, including the first", async () => {
    const state = createDefaultState();
    state.settings.queueIsolationMode = "always";
    const first = fixtureTask(state);
    const second = fixtureTask(state);
    second.id = "queue-runtime-task-2";
    state.queue = [first, second];
    state.queueRunning = true;
    const prepare = vi.fn(async () => true);
    const harness = createHarness(state, { prepareQueueRuntimeForTask: prepare });

    await createQueueExecutor(harness.deps)();

    expect(prepare).toHaveBeenCalledTimes(2);
    expect(prepare).toHaveBeenNthCalledWith(
      1,
      first.id,
      first.modelId,
      expect.any(Object),
      "always"
    );
    expect(prepare).toHaveBeenNthCalledWith(
      2,
      second.id,
      second.modelId,
      expect.any(Object),
      "always"
    );
  });

  it("stops after the current task when a paused queue has a waiting H3 LoRA task", async () => {
    const state = createDefaultState();
    const current = fixtureTask(state);
    const waiting = fixtureTask(state);
    if (waiting.taskType !== "generation") throw new Error("Expected a generation fixture");
    waiting.id = "waiting-lora-task";
    waiting.videoLoras = [H3_TURBO_V4_LORA];
    state.queue = [current, waiting];
    state.queueRunning = true;
    state.queueLifecycle = "running";
    mocks.waitForTask.mockImplementationOnce(async () => {
      state.queueRunning = false;
      state.queueLifecycle = "pausing";
      state.queueLifecycleTaskId = current.id;
      return { outputs: { fixture: true } };
    });
    const prepare = vi.fn(async () => true);
    const stabilize = vi.fn(async () => true);
    const stopQueueRuntime = vi.fn(async () => true);
    const harness = createHarness(state, {
      prepareQueueRuntimeForTask: prepare,
      stabilizeH3RuntimeBetweenTasks: stabilize,
      stopQueueRuntime
    });

    await createQueueExecutor(harness.deps)();

    expect(mocks.submitTask).toHaveBeenCalledOnce();
    expect(prepare).not.toHaveBeenCalled();
    expect(stabilize).toHaveBeenCalledWith(
      current.id,
      current.modelId,
      expect.any(Object),
      false,
      false
    );
    expect(stopQueueRuntime).toHaveBeenCalledOnce();
    expect(harness.store.get().queue).toEqual([
      expect.objectContaining({ id: waiting.id, status: "waiting" })
    ]);
    expect(harness.store.get().queueLifecycle).toBe("idle");
  });

  it("clears the divider and stops before the first task below it", async () => {
    const state = createDefaultState();
    const current = fixtureTask(state);
    const waiting = fixtureTask(state);
    waiting.id = "waiting-below-divider";
    state.queue = [current, waiting];
    state.queuePauseBoundary = 1;
    state.queueRunning = true;
    state.queueLifecycle = "running";
    const stopQueueRuntime = vi.fn(async () => true);
    const harness = createHarness(state, { stopQueueRuntime });

    await createQueueExecutor(harness.deps)();

    const final = harness.store.get();
    expect(mocks.submitTask).toHaveBeenCalledOnce();
    expect(final.queue).toEqual([
      expect.objectContaining({ id: waiting.id, status: "waiting" })
    ]);
    expect(final.queuePauseBoundary).toBeUndefined();
    expect(final.queueRunning).toBe(false);
    expect(final.queueLifecycle).toBe("idle");
    expect(stopQueueRuntime).toHaveBeenCalledOnce();
  });

  it("retains dirty LoRA state across pause when runtime shutdown fails", async () => {
    const state = createDefaultState();
    const current = fixtureTask(state);
    const waiting = fixtureTask(state);
    if (current.taskType !== "generation" || waiting.taskType !== "generation") {
      throw new Error("Expected generation fixtures");
    }
    current.videoLoras = [H3_TURBO_V4_LORA];
    waiting.id = "waiting-non-lora-task";
    state.queue = [current, waiting];
    state.queueRunning = true;
    state.queueLifecycle = "running";
    mocks.waitForTask.mockImplementationOnce(async () => {
      state.queueRunning = false;
      state.queueLifecycle = "pausing";
      state.queueLifecycleTaskId = current.id;
      return { outputs: { fixture: true } };
    });
    const prepare = vi.fn(async () => true);
    const stopQueueRuntime = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const harness = createHarness(state, {
      prepareQueueRuntimeForTask: prepare,
      stopQueueRuntime
    });
    const execute = createQueueExecutor(harness.deps);

    await execute();
    state.queueRunning = true;
    state.queueLifecycle = "starting";
    state.queueLifecycleTaskId = undefined;
    await execute();

    expect(prepare).toHaveBeenNthCalledWith(
      1,
      current.id,
      current.modelId,
      expect.any(Object),
      "lora"
    );
    expect(prepare).toHaveBeenNthCalledWith(
      2,
      waiting.id,
      waiting.modelId,
      expect.any(Object),
      "lora"
    );
    expect(stopQueueRuntime).toHaveBeenCalledTimes(2);
  });

  it("does not claim a task cancelled between selection and the conditional claim", async () => {
    const state = createDefaultState();
    const task = fixtureTask(state);
    state.queue = [task];
    state.queueRunning = true;
    const harness = createHarness(state, {
      beforeUpdate: (current, updateNumber) => {
        if (updateNumber !== 2) return;
        current.queueRunning = false;
        const candidate = current.queue[0];
        if (candidate) {
          candidate.status = "cancelled";
          candidate.error = "任务已取消";
        }
      }
    });

    await createQueueExecutor(harness.deps)();

    const final = harness.store.get();
    expect(final.queue[0]).toMatchObject({ id: task.id, status: "cancelled" });
    expect(final.queueRunning).toBe(false);
    expect(final.queueLifecycle).toBe("idle");
    expect(mocks.submitTask).not.toHaveBeenCalled();
    expect(mocks.waitForTask).not.toHaveBeenCalled();
  });

  it("propagates an abort before ComfyUI readiness without submitting a workflow", async () => {
    const state = createDefaultState();
    const task = fixtureTask(state);
    state.queue = [task];
    state.queueRunning = true;
    const stopQueueRuntime = vi.fn(async () => true);
    const harness = createHarness(state, {
      ensureComfyUiReady: (_taskId, signal) => new Promise<void>((_resolve, reject) => {
        if (signal?.aborted) {
          reject(signal.reason);
          return;
        }
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
      stopQueueRuntime
    });
    const run = createQueueExecutor(harness.deps)();

    await vi.waitFor(() => expect(harness.worker.activeController).not.toBeNull());
    const current = harness.store.live();
    current.queueRunning = false;
    current.queueLifecycle = "cancelling";
    current.queueLifecycleTaskId = task.id;
    current.queue[0]!.status = "cancelled";
    harness.worker.abort(new Error("用户取消任务"));
    await run;

    const final = harness.store.get();
    expect(final.queue[0]).toMatchObject({ id: task.id, status: "cancelled" });
    expect(final.queueRunning).toBe(false);
    expect(final.queueLifecycle).toBe("cancelling");
    expect(mocks.submitTask).not.toHaveBeenCalled();
    expect(stopQueueRuntime).not.toHaveBeenCalled();
    expect(harness.worker.activeController).toBeNull();
  });
});
