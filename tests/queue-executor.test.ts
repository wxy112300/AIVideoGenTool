import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppState, ExtensionQueueTask, HistoryFile, NativeAvContinuationArtifact, QueueTask, TaskPerformanceStats, TaskPreview } from "../src/types";
import { createDefaultDraft, createDefaultState } from "../src/core/defaults";
import { queueTaskFromDraft } from "../src/core/queue-task-factory";
import { H3_TURBO_V4_LORA } from "../src/core/video-loras";
import { createQueueExecutor, type QueueExecutorDependencies } from "../electron/queue-executor";
import { QueueWorkerController } from "../electron/queue-worker";
import { QueueExecutionSideEffects } from "../electron/services/queue-execution-side-effects";
import { attachH3JointAvSerializer, renderWorkflow } from "../src/core/workflow";

const mocks = vi.hoisted(() => ({
  freeMemory: vi.fn(async () => 0),
  submitTask: vi.fn(),
  submitImageTask: vi.fn(),
  waitForTask: vi.fn(),
  hashImageFile: vi.fn(async () => "fixture-hash"),
  finalizeExtensionOutput: vi.fn(async () => undefined),
  startTaskPerformanceMonitor: vi.fn(),
  startAdaptiveVramWatchdog: vi.fn(),
  recoverQueueFailure: vi.fn(),
  unlink: vi.fn(async () => undefined)
}));

vi.mock("node:fs", () => ({
  promises: { unlink: mocks.unlink }
}));

vi.mock("../electron/services/comfy-ui.js", () => ({
  freeMemory: mocks.freeMemory,
  submitTask: mocks.submitTask,
  submitImageTask: mocks.submitImageTask,
  waitForTask: mocks.waitForTask,
  TaskStalledError: class TaskStalledError extends Error {}
}));
vi.mock("../src/infrastructure/image-asset-library.js", () => ({
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

function h3Artifact(role: NativeAvContinuationArtifact["role"]): NativeAvContinuationArtifact {
  return {
    schemaVersion: 1,
    artifactId: `${role}-artifact`,
    role,
    lineageId: "queue-runtime-task",
    manifest: { filename: `h3av_${role}-artifact.json`, subfolder: "h3-native-av", type: "output", absolutePath: `C:/ComfyUI/output/h3-native-av/h3av_${role}-artifact.json` },
    payload: { filename: `h3av_${role}-artifact.safetensors`, subfolder: "h3-native-av", type: "output", absolutePath: `C:/ComfyUI/output/h3-native-av/h3av_${role}-artifact.safetensors` },
    payloadSha256: "a".repeat(64), payloadBytes: 1024, modelFamily: "minimax-h3",
    executionModelId: "minimax_h3_fl2va", providerId: "comfyui", providerRevision: "fixture",
    diffusionModelFilename: "diffusion.safetensors", textEncoderFilename: "encoder.safetensors",
    videoVaeFilename: "vae.safetensors", audioVaeFilename: "audio-vae.safetensors",
    width: role === "final-clean-av" ? 1920 : 1280,
    height: role === "final-clean-av" ? 1088 : 720,
    fps: 24, frameCount: 124,
    videoShape: [1, 24, 37, (role === "final-clean-av" ? 1088 : 720) / 16, (role === "final-clean-av" ? 1920 : 1280) / 16],
    videoDtype: "BF16",
    audioSampleRate: 32000, audioChannels: 2, audioLatentRate: 40,
    audioShape: [1, 32, 2, 207], audioDtype: "F32", contextFrames: 0,
    workflowRevision: "fixture", sourceTaskId: "queue-runtime-task",
    createdAt: "2026-09-03T00:00:00.000Z"
  };
}

function h3CanonicalAsset(artifact: NativeAvContinuationArtifact) {
  return {
    schemaVersion: 1 as const,
    assetId: `h3av_${artifact.artifactId}`,
    storageKind: "app-canonical" as const,
    ownerPath: artifact.payload,
    payloadBytes: artifact.payloadBytes,
    payloadSha256: artifact.payloadSha256,
    videoTensorSha256: "b".repeat(64),
    audioTensorSha256: "c".repeat(64),
    videoShape: [1, 24, 37, artifact.height / 16, artifact.width / 16],
    videoDtype: "BF16",
    audioShape: [1, 32, 2, 207],
    audioDtype: "F32",
    width: artifact.width,
    height: artifact.height,
    fps: 24 as const,
    frameCount: artifact.frameCount,
    sampleScope: "generated-clip" as const,
    artifactRole: artifact.role,
    contextFrames: artifact.contextFrames,
    producer: {
      workflowId: artifact.workflowId ?? "workflow.json",
      workflowRevision: artifact.workflowRevision,
      producerNodeId: artifact.producerNodeId ?? "LocalVideoStudioH3SaveJointAV",
      producerNodeVersion: artifact.producerNodeVersion ?? "0.3.4",
      executionModelId: artifact.executionModelId,
      diffusionModelFilename: artifact.diffusionModelFilename,
      textEncoderFilename: artifact.textEncoderFilename,
      videoVaeFilename: artifact.videoVaeFilename,
      audioVaeFilename: artifact.audioVaeFilename,
      loraFilenames: [],
      width: artifact.width,
      height: artifact.height,
      fps: 24 as const,
      frameCount: artifact.frameCount,
      sourceTaskId: artifact.sourceTaskId
    },
    capabilities: ["native-av" as const],
    createdAt: artifact.createdAt
  };
}

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
    const onProgress = args[6] as ((
      progress: number,
      stage: string,
      determinate: boolean,
      workProgress?: QueueTask["workProgress"]
    ) => void);
    const onPreview = args[7] as ((dataUrl: string, source: "h3-tae" | "comfy", metadata?: { sequence?: number }) => void);
    onProgress(42, "生成中", true, {
      value: 4,
      max: 20,
      unit: "step",
      startedAt: "2026-09-03T00:00:00.000Z",
      sampledAt: "2026-09-03T00:04:20.000Z"
    });
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
    resolveH3VideoVaeModeForTask?: QueueExecutorDependencies["resolveH3VideoVaeModeForTask"];
    commitH3NativeAvOutput?: QueueExecutorDependencies["commitH3NativeAvOutput"];
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
    updateTaskProgress: async (taskId, patch) => {
      await updateTask(taskId, patch);
    },
    ensureComfyUiReady: options.ensureComfyUiReady ?? (async () => undefined),
    resolveTaskOutputDirectory: async () => "C:/ComfyUI/output",
    requireExistingImageOutput: async () => [],
    requireExistingVideoOutput: async () => [outputFile],
    releasePromptRuntime: async () => 0,
    prepareQueueRuntimeForTask: options.prepareQueueRuntimeForTask ?? (async () => true),
    stabilizeH3RuntimeBetweenTasks: options.stabilizeH3RuntimeBetweenTasks ?? (async () => true),
    stopQueueRuntime: options.stopQueueRuntime ?? (async () => true),
    restartQueueRuntime: options.restartQueueRuntime ?? (async () => ({ ok: true, message: "restarted" })),
    resolveH3VideoVaeModeForTask: options.resolveH3VideoVaeModeForTask ?? (async (task) => task.h3VideoVaeMode ?? "fp16"),
    commitH3NativeAvOutput: options.commitH3NativeAvOutput ?? (async () => ({
      status: "missing",
      reason: "serializer was not attached"
    })),
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
    expect(harness.snapshots.some((snapshot) =>
      snapshot.queue.some((queued) => queued.id === task.id && queued.workProgress?.value === 4)
    )).toBe(true);
  });

  it("forwards progress context and clears stale work progress", async () => {
    const state = createDefaultState();
    const task = fixtureTask(state);
    state.queue = [task];
    state.queueRunning = true;
    state.queueLifecycle = "starting";
    const progressContext = { spectrumOuterSteps: 20 };
    mocks.submitTask.mockResolvedValueOnce({
      promptId: "prompt-fixture",
      clientId: "client-fixture",
      nodeTypes: { "1": "FixtureNode" },
      h3LivePreviewRequested: false,
      h3LivePreviewActive: false,
      progressContext
    });
    mocks.waitForTask.mockImplementationOnce(async (...args: unknown[]) => {
      const onProgress = args[6] as (
        progress: number,
        stage: string,
        determinate: boolean,
        workProgress?: QueueTask["workProgress"]
      ) => void;
      const workProgress = {
        value: 4,
        max: 20,
        unit: "step" as const,
        startedAt: "2026-09-03T00:00:00.000Z",
        sampledAt: "2026-09-03T00:04:20.000Z"
      };
      onProgress(42, "扩散采样 4/20", true, workProgress);
      onProgress(42, "扩散采样 4/20", true, undefined);
      return { outputs: { fixture: true } };
    });
    const harness = createHarness(state);

    await createQueueExecutor(harness.deps)();

    expect(mocks.waitForTask.mock.calls[0]?.[11]).toEqual(progressContext);
    const progressSnapshots = harness.snapshots
      .map((snapshot) => snapshot.queue.find((queued) => queued.id === task.id))
      .filter((queued): queued is QueueTask =>
        Boolean(queued) && Object.prototype.hasOwnProperty.call(queued, "workProgress")
      );
    expect(progressSnapshots.some((queued) => queued.workProgress?.value === 4)).toBe(true);
    expect(progressSnapshots.some((queued) => queued.workProgress === undefined)).toBe(true);
  });

  it("persists the H3 token count resolved during submission", async () => {
    const state = createDefaultState();
    const task = fixtureTask(state);
    state.queue = [task];
    state.queueRunning = true;
    state.queueLifecycle = "starting";
    mocks.submitTask.mockResolvedValueOnce({
      promptId: "prompt-fixture",
      clientId: "client-fixture",
      nodeTypes: { "1": "FixtureNode" },
      h3LivePreviewRequested: false,
      h3LivePreviewActive: false,
      h3TokenCount: 1234
    });
    const harness = createHarness(state);

    await createQueueExecutor(harness.deps)();

    expect(harness.store.get().history[0]?.versions[0]?.performanceStats?.h3TokenCount)
      .toBe(1234);
  });

  it("persists shared AV saving before submitting a legacy save-all H3 task", async () => {
    const state = createDefaultState();
    const task = fixtureTask(state);
    if (task.taskType !== "generation") throw new Error("Expected a generation fixture");
    delete task.h3AvOutputPolicy;
    task.h3LatentSaveMode = "all";
    task.h3SaveJointAv = true;
    const original = structuredClone(task);
    const originalDraft = structuredClone(state.draft);
    state.queue = [task];
    state.queueRunning = true;
    mocks.submitTask.mockResolvedValueOnce({
      promptId: "prompt-fixture", clientId: "client-fixture",
      nodeTypes: { "31": "LocalVideoStudioH3SaveJointAV" },
      h3LivePreviewRequested: false, h3LivePreviewActive: false,
      h3AvSerializerNodeId: "31"
    });
    const artifact: NativeAvContinuationArtifact = {
      ...h3Artifact("first-pass-clean-av"), width: 864, height: 480, frameCount: 39,
      videoShape: [1, 24, 12, 30, 54], audioShape: [1, 32, 2, 65]
    };
    const asset = { ...h3CanonicalAsset(artifact), videoShape: artifact.videoShape, audioShape: artifact.audioShape };
    const commitH3NativeAvOutput = vi.fn(async () => ({
      status: "available" as const, artifact, asset
    }));
    const harness = createHarness(state, { commitH3NativeAvOutput });

    await createQueueExecutor(harness.deps)();

    const claimed = harness.snapshots
      .flatMap((snapshot) => snapshot.queue)
      .find((queued) => queued.id === task.id && queued.status === "running");
    expect(claimed).toMatchObject({
      ...original,
      status: "running",
      progress: 1,
      stage: "准备任务",
      startedAt: expect.any(String),
      updatedAt: expect.any(String),
      error: undefined,
      h3AvOutputPolicy: "shared"
    });
    expect(mocks.submitTask.mock.calls[0]?.[0]).toMatchObject({
      id: original.id,
      prompt: original.prompt,
      seed: original.seed,
      workflowPath: original.workflowPath,
      duration: original.duration,
      resolution: original.resolution,
      h3AvOutputPolicy: "shared",
      h3LatentSaveMode: "all",
      h3SaveJointAv: true
    });
    expect(commitH3NativeAvOutput).toHaveBeenCalledWith(
      expect.anything(), "31", expect.objectContaining({ id: original.id, h3AvOutputPolicy: "shared" }), expect.any(String)
    );
    expect(harness.store.get().history[0]?.versions[0]).toMatchObject({
      h3AvOutputPolicy: "shared",
      h3ContinuationData: { status: "available", artifact, asset },
      h3AvAsset: asset
    });
    expect(harness.store.get().draft).toEqual(originalDraft);
    expect(harness.deps.logger.info).toHaveBeenCalledWith(
      "queue", "h3-av-output-upgraded", expect.any(String),
      { taskId: original.id, h3AvOutputPolicy: "shared" }
    );
  });

  it.each([
    ["generation", "minimax_h3_fl2va", "minimax_h3_i2v_api.json"],
    ["generation", "minimax_h3_ref2va", "minimax_h3_r2v_api.json"],
    ["extension", "minimax_h3_ref2va", "minimax_h3_r2v_extend_api.json"],
    ["extension", "minimax_h3_continuum", "minimax_h3_continuum_v38_extend_api.json"]
  ] as const)("upgrades legacy %s %s output before assembling %s", async (taskType, modelId, filename) => {
    const state = createDefaultState();
    const generation = fixtureTask(state);
    if (generation.taskType !== "generation") throw new Error("Expected a generation fixture");
    const task: typeof generation | ExtensionQueueTask = taskType === "generation" ? generation : {
      ...generation,
      taskType: "extension",
      sourceVideoPath: "C:/source.mp4",
      sourceVideoDuration: 5,
      trimStartSeconds: 0,
      trimEndSeconds: 5,
      sourceWidth: 864,
      sourceHeight: 480,
      modelProfile: "q4_k_m",
      maxGeneratedFrames: 362,
      overlapFrames: 22,
      unloadBetweenStages: true
    };
    task.modelId = modelId;
    task.workflowPath = filename;
    delete task.h3AvOutputPolicy;
    delete task.h3LatentSaveMode;
    task.h3SaveJointAv = true;
    state.queue = [task];
    state.queueRunning = true;
    const harness = createHarness(state);
    const sideEffects = new QueueExecutionSideEffects(harness.deps);

    const claim = await sideEffects.claimTask(task.id);

    expect(claim.claimed).toBe(true);
    const claimed = claim.state.queue[0]!;
    if (claimed.taskType !== "generation" && claimed.taskType !== "extension") throw new Error("Expected an H3 task");
    expect(claimed).toMatchObject({ h3AvOutputPolicy: "shared", h3LatentSaveMode: "all", h3SaveJointAv: true });
    const actualFs = await vi.importActual<typeof import("node:fs")>("node:fs");
    const source = JSON.parse(actualFs.readFileSync(new URL(`../workflows/${filename}`, import.meta.url), "utf8"));
    const graph = renderWorkflow(source, claimed) as Record<string, { class_type: string }>;
    if (!Object.values(graph).some((node) => node.class_type === "LocalVideoStudioH3SaveJointAV")) {
      attachH3JointAvSerializer(graph, `h3-native-av/h3av_${claimed.id}`);
    }
    const classes = Object.values(graph).map((node) => node.class_type);
    expect(classes.filter((classType) => classType === "LocalVideoStudioH3SaveJointAV")).toHaveLength(1);
    expect(classes).not.toContain("MiniMaxH3MotionContextSaveLatent");
    expect((await sideEffects.claimTask(task.id)).claimed).toBe(false);
    expect(harness.deps.logger.info).toHaveBeenCalledTimes(1);
  });

  it.each([
    { name: "do not save", patch: { h3LatentSaveMode: "none", h3SaveJointAv: false } },
    { name: "JointAV only", patch: { h3LatentSaveMode: "joint-av" } },
    { name: "Motion only", patch: { h3LatentSaveMode: "motion-context" } },
    { name: "legacy disabled", patch: { h3LatentSaveMode: undefined, h3SaveJointAv: false } },
    { name: "conflicting legacy disabled", patch: { h3LatentSaveMode: "all", h3SaveJointAv: false } },
    { name: "already shared", patch: { h3AvOutputPolicy: "shared" } },
    { name: "unknown policy", patch: { h3AvOutputPolicy: "future", h3AvOutputPolicyError: "unsupported policy" } },
    { name: "migrated policy error", patch: { h3AvOutputPolicyError: "unsupported policy" } },
    { name: "another model", patch: { modelId: "ltx23_22b_distilled" } },
    { name: "first-pass checkpoint", patch: { h3FirstPassCheckpoint: { promptId: "first-pass", outputFile, artifact: h3Artifact("first-pass-clean-av") } } },
    { name: "managed sequence", patch: { h3ContinuumSequence: {
      schemaVersion: 1, sequenceId: "sequence-1", projectId: "project-1", runName: "run-1",
      packageVersion: "3.8.2", runStorageSchemaVersion: 1, workflowRevision: "fixture",
      status: "in-progress", chunkSeconds: 15, fps: 24, width: 864, height: 480, baseSeed: 42,
      promptFormat: "Timeline", targetChunks: 2, acceptedChunks: 1,
      canonicalHead: { revisionId: "revision-1" }, chunks: [], updatedAt: "2026-09-19T00:00:00.000Z"
    } } }
  ])("does not upgrade $name when claiming a task", async ({ patch }) => {
    const state = createDefaultState();
    const task = fixtureTask(state);
    if (task.taskType !== "generation") throw new Error("Expected a generation fixture");
    delete task.h3AvOutputPolicy;
    Object.assign(task, patch);
    const original = structuredClone(task);
    state.queue = [task];
    state.queueRunning = true;
    const harness = createHarness(state);

    await new QueueExecutionSideEffects(harness.deps).claimTask(task.id);

    const claimed = harness.store.get().queue[0]!;
    if (claimed.taskType !== "generation") throw new Error("Expected a generation fixture");
    expect(claimed.h3AvOutputPolicy).toBe(original.h3AvOutputPolicy);
    expect(claimed.h3LatentSaveMode).toBe(original.h3LatentSaveMode);
    expect(claimed.h3SaveJointAv).toBe(original.h3SaveJointAv);
    expect(claimed.h3FirstPassCheckpoint).toEqual(original.h3FirstPassCheckpoint);
    expect(claimed.h3ContinuumSequence).toEqual(original.h3ContinuumSequence);
    expect(harness.deps.logger.info).not.toHaveBeenCalled();
  });

  it("upgrades only the next waiting task, including legacy implicit save-all", async () => {
    const state = createDefaultState();
    const first = fixtureTask(state);
    const second = fixtureTask(state);
    if (first.taskType !== "generation" || second.taskType !== "generation") throw new Error("Expected generation fixtures");
    delete first.h3AvOutputPolicy;
    delete first.h3LatentSaveMode;
    delete first.h3SaveJointAv;
    delete second.h3AvOutputPolicy;
    second.id = "queue-runtime-task-2";
    state.queue = [first, second];
    state.queueRunning = true;
    const originalSecond = structuredClone(second);
    const harness = createHarness(state);
    const sideEffects = new QueueExecutionSideEffects(harness.deps);

    expect((await sideEffects.claimTask(second.id)).claimed).toBe(false);
    expect((await sideEffects.claimTask(first.id)).claimed).toBe(true);
    expect(harness.store.get().queue[0]).toMatchObject({ h3AvOutputPolicy: "shared", h3LatentSaveMode: "all", h3SaveJointAv: true });
    expect(harness.store.get().queue[1]).toEqual(originalSecond);
    await harness.store.update((next) => { next.queue = next.queue.filter((task) => task.id !== first.id); });
    expect((await sideEffects.claimTask(second.id)).claimed).toBe(true);
    expect(harness.store.get().queue[0]).toMatchObject({ id: second.id, h3AvOutputPolicy: "shared" });
    expect(harness.deps.logger.info).toHaveBeenCalledTimes(2);
  });

  it.each(["paused", "cancelled", "running", "failed"] as const)("does not rewrite a %s task while claiming", async (status) => {
    const state = createDefaultState();
    const task = fixtureTask(state);
    if (task.taskType !== "generation") throw new Error("Expected a generation fixture");
    delete task.h3AvOutputPolicy;
    task.status = status === "paused" ? "waiting" : status;
    state.queue = [task];
    state.queueRunning = status !== "paused";
    const original = structuredClone(state);
    const harness = createHarness(state);

    expect((await new QueueExecutionSideEffects(harness.deps).claimTask(task.id)).claimed).toBe(false);
    expect(harness.store.get()).toEqual(original);
  });

  it("resolves the current H3 VAE setting when each task is claimed", async () => {
    const state = createDefaultState();
    const first = fixtureTask(state);
    const second = fixtureTask(state);
    second.id = "queue-runtime-task-2";
    state.queue = [first, second];
    state.queueRunning = true;
    const resolveH3VideoVaeModeForTask = vi.fn(async (
      _task: QueueTask,
      settings: AppState["settings"]
    ) => settings.h3VideoVaeMode === "int8-convrot" ? "int8-convrot" as const : "fp16" as const);
    mocks.waitForTask
      .mockImplementationOnce(async () => {
        // Change the setting while the first task is still computing. The
        // second claim must see it; the first submitted task must not change.
        state.settings.h3VideoVaeMode = "int8-convrot";
        return { outputs: { fixture: true } };
      })
      .mockImplementationOnce(async () => ({ outputs: { fixture: true } }));
    const harness = createHarness(state, { resolveH3VideoVaeModeForTask });

    await createQueueExecutor(harness.deps)();

    expect(resolveH3VideoVaeModeForTask).toHaveBeenCalledTimes(2);
    expect(mocks.submitTask.mock.calls.map(([task]) => (task as QueueTask).h3VideoVaeMode))
      .toEqual(["fp16", "int8-convrot"]);
    const historyModes = new Map(
      harness.store.get().history.map((asset) => [asset.taskId, asset.h3VideoVaeMode])
    );
    expect(historyModes.get(first.id)).toBe("fp16");
    expect(historyModes.get(second.id)).toBe("int8-convrot");
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

  it("commits JointAV only when the submitted H3 graph includes the serializer", async () => {
    const state = createDefaultState();
    const task = fixtureTask(state);
    task.modelId = "minimax_h3_fl2va";
    state.queue = [task];
    state.queueRunning = true;
    const commitH3NativeAvOutput = vi.fn(async () => ({
      status: "missing" as const,
      reason: "fixture serializer output missing"
    }));
    mocks.submitTask.mockResolvedValueOnce({
      promptId: "prompt-fixture",
      clientId: "client-fixture",
      nodeTypes: { "1": "FixtureNode", "23": "LocalVideoStudioH3SaveJointAV" },
      h3LivePreviewRequested: false,
      h3LivePreviewActive: false,
      h3AvSerializerNodeId: "23"
    });
    const harness = createHarness(state, { commitH3NativeAvOutput });

    await createQueueExecutor(harness.deps)();

    expect(commitH3NativeAvOutput).toHaveBeenCalledWith(
      { outputs: { fixture: true } },
      "23",
      expect.objectContaining({ id: task.id, h3VideoVaeMode: "fp16" }),
      expect.any(String)
    );
    expect(harness.store.get().history[0]?.versions?.[0]?.h3ContinuationData).toEqual({
      status: "missing",
      reason: "fixture serializer output missing"
    });
  });

  it("runs Create H3 1080 as one recoverable two-pass queue task", async () => {
    const state = createDefaultState();
    const task = queueTaskFromDraft({
      ...createDefaultDraft(),
      startImagePath: "C:/input/start.png",
      workflowPath: "C:/ComfyUI/workflows/fixture.json",
      duration: 1,
      resolution: 1080,
      h3SaveJointAv: true
    }, state, {
      now: () => new Date("2026-09-03T00:00:00.000Z"),
      id: () => "queue-runtime-task",
      random: () => 0.5
    });
    state.queue = [task];
    state.queueRunning = true;
    mocks.submitTask
      .mockResolvedValueOnce({
        promptId: "first-pass-prompt", clientId: "client-first",
        nodeTypes: { "20": "LocalVideoStudioH3SaveJointAV" },
        h3LivePreviewRequested: false, h3LivePreviewActive: false,
        h3AvSerializerNodeId: "20"
      })
      .mockResolvedValueOnce({
        promptId: "second-pass-prompt", clientId: "client-second",
        nodeTypes: { "31": "LocalVideoStudioH3SaveJointAV" },
        h3LivePreviewRequested: false, h3LivePreviewActive: false,
        h3AvSerializerNodeId: "31"
      });
    const finalArtifact = h3Artifact("final-clean-av");
    const commitH3NativeAvOutput = vi.fn()
      .mockResolvedValueOnce({ status: "available", artifact: h3Artifact("first-pass-clean-av") })
      .mockResolvedValueOnce({
        status: "available",
        artifact: finalArtifact,
        asset: h3CanonicalAsset(finalArtifact)
      });
    const harness = createHarness(state, { commitH3NativeAvOutput });

    await createQueueExecutor(harness.deps)();

    expect(mocks.submitTask).toHaveBeenCalledTimes(2);
    expect(mocks.submitTask.mock.calls[0]?.[0]).toMatchObject({
      taskType: "generation", resolution: 720,
      workflowPath: expect.stringContaining("minimax_h3_fl2va_first_pass_av_api.json")
    });
    expect(mocks.submitTask.mock.calls[1]?.[0]).toMatchObject({
      taskType: "upscale", upscaleMode: "h3-native", targetHeight: 1080,
      h3NativeInput: { provider: "learned-3d" },
      h3AvOutputPolicy: "shared"
    });
    expect(harness.snapshots.some((snapshot) => snapshot.queue.some((queued) =>
      queued.id === task.id && queued.taskType === "generation" &&
      queued.h3FirstPassCheckpoint?.artifact.artifactId === "first-pass-clean-av-artifact"
    ))).toBe(true);
    expect(harness.store.get().history).toHaveLength(1);
    expect(harness.store.get().history[0]).toMatchObject({
      taskId: task.id, resolution: 1080,
      versions: [expect.objectContaining({
        width: 1920,
        height: 1088,
        comfyPromptId: "second-pass-prompt",
        h3AvAsset: expect.objectContaining({
          assetId: `h3av_${finalArtifact.artifactId}`,
          artifactRole: "final-clean-av"
        })
      })]
    });
  });

  it("resumes Create H3 1080 from its first-pass checkpoint and cleans temporary files", async () => {
    const state = createDefaultState();
    const artifact = h3Artifact("first-pass-clean-av");
    const checkpointOutput: HistoryFile = {
      filename: "first-pass.mp4",
      subfolder: "h3-native-av",
      type: "output",
      absolutePath: "C:/ComfyUI/output/h3-native-av/first-pass.mp4"
    };
    const task = queueTaskFromDraft({
      ...createDefaultDraft(),
      startImagePath: "C:/input/start.png",
      workflowPath: "C:/ComfyUI/workflows/fixture.json",
      duration: 1,
      resolution: 1080,
      h3SaveJointAv: true
    }, state, {
      now: () => new Date("2026-09-03T00:00:00.000Z"),
      id: () => "queue-runtime-task",
      random: () => 0.5
    });
    task.h3FirstPassCheckpoint = {
      promptId: "persisted-first-pass-prompt",
      outputFile: checkpointOutput,
      artifact
    };
    state.queue = [task];
    state.queueRunning = true;
    mocks.submitTask.mockResolvedValueOnce({
      promptId: "resumed-second-pass-prompt", clientId: "client-second",
      nodeTypes: { "31": "LocalVideoStudioH3SaveJointAV" },
      h3LivePreviewRequested: false, h3LivePreviewActive: false,
      h3AvSerializerNodeId: "31"
    });
    const finalArtifact = h3Artifact("final-clean-av");
    const commitH3NativeAvOutput = vi.fn(async () => ({
      status: "available" as const,
      artifact: finalArtifact,
      asset: h3CanonicalAsset(finalArtifact)
    }));
    const harness = createHarness(state, { commitH3NativeAvOutput });

    await createQueueExecutor(harness.deps)();

    expect(mocks.submitTask).toHaveBeenCalledTimes(1);
    expect(mocks.submitTask.mock.calls[0]?.[0]).toMatchObject({
      taskType: "upscale", upscaleMode: "h3-native", targetHeight: 1080,
      sourceFilePath: checkpointOutput.absolutePath,
      h3NativeInput: { artifact: { artifactId: artifact.artifactId } }
    });
    expect(commitH3NativeAvOutput).toHaveBeenCalledTimes(1);
    expect(mocks.unlink).toHaveBeenCalledTimes(3);
    expect(mocks.unlink).toHaveBeenCalledWith(checkpointOutput.absolutePath);
    expect(mocks.unlink).toHaveBeenCalledWith(artifact.payload.absolutePath);
    expect(mocks.unlink).toHaveBeenCalledWith(artifact.manifest.absolutePath);
    expect(harness.store.get().queue).toHaveLength(0);
    expect(harness.store.get().history).toEqual([
      expect.objectContaining({
        taskId: task.id,
        resolution: 1080,
        versions: [expect.objectContaining({
          comfyPromptId: "resumed-second-pass-prompt",
          h3AvAsset: expect.objectContaining({
            assetId: `h3av_${h3Artifact("final-clean-av").artifactId}`,
            artifactRole: "final-clean-av",
            ownerPath: expect.objectContaining({
              absolutePath: "C:/ComfyUI/output/h3-native-av/h3av_final-clean-av-artifact.safetensors"
            })
          })
        })]
      })
    ]);
  });

  it("executes every task above a divider before treating it as the stop line", async () => {
    const state = createDefaultState();
    const first = fixtureTask(state);
    const second = fixtureTask(state);
    const third = fixtureTask(state);
    const deferred = fixtureTask(state);
    first.id = "divider-first";
    second.id = "divider-second";
    third.id = "divider-third";
    deferred.id = "divider-deferred";
    state.queue = [first, second, third, deferred];
    state.queuePauseBoundary = 3;
    state.queueRunning = true;
    state.queueLifecycle = "running";
    const submittedIds: string[] = [];
    mocks.submitTask.mockImplementation(async (task: QueueTask) => {
      submittedIds.push(task.id);
      return {
        promptId: `prompt-${task.id}`,
        clientId: "client-fixture",
        nodeTypes: { "1": "FixtureNode" },
        h3LivePreviewRequested: false,
        h3LivePreviewActive: false
      };
    });
    const harness = createHarness(state);

    await createQueueExecutor(harness.deps)();

    const final = harness.store.get();
    expect(submittedIds).toEqual([first.id, second.id, third.id]);
    expect(final.queue).toEqual([
      expect.objectContaining({ id: deferred.id, status: "waiting" })
    ]);
    expect(final.queuePauseBoundary).toBeUndefined();
    expect(final.queueRunning).toBe(false);
    expect(final.queueLifecycle).toBe("idle");
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
