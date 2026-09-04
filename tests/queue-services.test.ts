import { describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDefaultDraft, createDefaultImageEditDraft, createDefaultState } from "../src/core/defaults";
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
import { DEFAULT_DLSS5_UPSCALE_OPTIONS } from "../src/core/dlss5";

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
    await expect(service.enqueue({
      ...createDefaultDraft(),
      modelId: "minimax_h3_fl2va",
      resolution: 1080,
      h3SaveJointAv: false,
      workflowPath: "workflow.json"
    }))
      .rejects.toThrow("需要开启 JointAV 输出");
  });

  it("enqueues an image task without starting a fresh environment scan", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-lama-enqueue-"));
    const outputRoot = path.join(root, "output");
    const sourcePath = path.join(root, "source.png");
    const maskPath = path.join(root, "mask.png");
    await Promise.all([
      fs.mkdir(outputRoot, { recursive: true }),
      fs.writeFile(sourcePath, "source"),
      fs.writeFile(maskPath, "mask")
    ]);
    const state = createDefaultState();
    state.settings.outputDirectory = path.join(outputRoot, "Videos");
    state.settings.imageOutputDirectory = path.join(outputRoot, "Images");
    const enqueueInfo = vi.fn();
    const enqueueLogger = {
      debug: vi.fn(), info: enqueueInfo, warn: vi.fn(), error: vi.fn()
    } as never;
    const getCachedEnvironmentScanForQueue = vi.fn(() => undefined);
    const service = new QueueEnqueueService({
      store: repository(state),
      logger: enqueueLogger,
      sendState: vi.fn(),
      getCachedEnvironmentScanForQueue,
      effectiveImageInputLibraryDirectory: async () => path.join(root, "library"),
      resolveTaskOutputDirectory: async () => outputRoot,
      imageInspection: { readDimensions: () => ({ width: 640, height: 360 }) }
    });
    const draft = {
      ...createDefaultImageEditDraft(),
      modelId: "lama-inpaint",
      qualityProfile: "native",
      pictures: [{
        id: "picture-1",
        pictureNumber: 1,
        absolutePath: sourcePath,
        width: 640,
        height: 360,
        mask: {
          documentPath: path.join(root, "mask.json"),
          maskPath,
          revision: 1,
          regionCount: 1,
          updatedAt: "2026-09-05T00:00:00.000Z"
        }
      }],
      nextPictureNumber: 2
    };

    const lamaState = await service.enqueueImage(draft);
    const qwenDraft = {
      ...createDefaultImageEditDraft(),
      pictures: [{
        id: "picture-1",
        pictureNumber: 1,
        absolutePath: sourcePath,
        width: 640,
        height: 360
      }],
      nextPictureNumber: 2
    };
    qwenDraft.promptVersions[0]!.text = "Remove the object.";
    const next = await service.enqueueImage(qwenDraft);

    expect(getCachedEnvironmentScanForQueue).toHaveBeenCalledTimes(2);
    expect(lamaState.queue[0]).toMatchObject({
      taskType: "image-generation",
      modelId: "lama-inpaint",
      outputCount: 1
    });
    expect(next.queue[1]).toMatchObject({
      taskType: "image-generation",
      modelId: "qwen-image-edit-2511"
    });
    expect(next.queue[1]).not.toHaveProperty("diffusionModelFilename");
    expect(enqueueInfo).toHaveBeenCalledWith(
      "queue",
      "image-enqueue-environment-preflight-deferred",
      expect.any(String),
      { taskType: "image-generation", modelId: "lama-inpaint" }
    );
  });

  it("enqueues a DLSS task from a successful History version with a frozen snapshot", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-dlss-upscale-enqueue-"));
    const videoPath = path.join(root, "source.mp4");
    await fs.writeFile(videoPath, "video");
    const state = createDefaultState();
    state.history = [{
      mediaKind: "video",
      id: "asset-dlss",
      taskId: "source-task",
      title: "source",
      outputFilename: "source.mp4",
      createdAt: "2026-09-03T00:00:00.000Z",
      updatedAt: "2026-09-03T00:00:00.000Z",
      modelId: "realesrgan",
      favorite: false,
      rating: null,
      tags: [],
      duration: 2,
      resolution: 480,
      prompt: "source",
      seed: 1,
      comfyPromptId: "source-prompt",
      comfyOutputs: {},
      files: [],
      versions: [{
        id: "source-version",
        kind: "original",
        createdAt: "2026-09-03T00:00:00.000Z",
        outputFilename: "source.mp4",
        modelId: "realesrgan",
        width: 832,
        height: 480,
        duration: 2,
        fps: 24,
        workflowPath: "source-workflow.json",
        comfyPromptId: "source-prompt",
        comfyOutputs: {},
        files: []
      }]
    }];
    const cachedEnvironment = {
      customNodes: [{ id: "comfyui-dlss5", installed: true, loaded: false, loadError: "" }],
      dlss5Runtime: {
        srReady: true,
        error: "",
        missingFiles: [],
        source: "app-managed",
        nodeRevision: DEFAULT_DLSS5_UPSCALE_OPTIONS.nodeRevision,
        bundleId: DEFAULT_DLSS5_UPSCALE_OPTIONS.runtimeBundleId
      },
      depthAnything: { available: true, error: "", missingFiles: [] }
    } as never;
    const service = new QueueEnqueueService({
      store: repository(state),
      logger: logger(),
      sendState: vi.fn(),
      getCachedEnvironmentScanForQueue: () => cachedEnvironment,
      effectiveImageInputLibraryDirectory: async () => path.join(root, "library"),
      resolveTaskOutputDirectory: async () => root,
      imageInspection: { readDimensions: () => ({ width: 640, height: 360 }) }
    });

    const next = await service.enqueueUpscale({
      sourceAssetId: "asset-dlss",
      sourceVersionId: "source-version",
      sourceFilePath: videoPath,
      sourceFilename: "source.mp4",
      sourceWidth: 832,
      sourceHeight: 480,
      duration: 2,
      fps: 24,
      targetScale: 3,
      dlss5: { ...DEFAULT_DLSS5_UPSCALE_OPTIONS, scale: 3, quality: "balanced" },
      modelId: "dlss5-sr",
      tileMode: "safe",
      faceRestore: true
    });

    expect(next.queue[0]).toMatchObject({
      modelId: "dlss5-sr",
      targetScale: 3,
      targetWidth: 2496,
      targetOutputHeight: 1440,
      outputFilename: "source-dlss-3x-v01.mp4",
      tileMode: "auto",
      faceRestore: false,
      dlss5: { scale: 3, quality: "balanced" }
    });
    expect(next.queue[0]).not.toHaveProperty("targetHeight");
  });

  it("enqueues H3 native upscale from authoritative History JointAV files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-h3-upscale-enqueue-"));
    const videoPath = path.join(root, "source.mp4");
    const startImagePath = path.join(root, "start.png");
    const payloadPath = path.join(root, "source.safetensors");
    const manifestPath = path.join(root, "source.json");
    await Promise.all([
      fs.writeFile(videoPath, "video"),
      fs.writeFile(startImagePath, "image"),
      fs.writeFile(payloadPath, "payload"),
      fs.writeFile(manifestPath, "manifest")
    ]);
    const state = createDefaultState();
    state.history = [{
      id: "asset-h3",
      outputFilename: "source.mp4",
      prompt: "source prompt",
      startImagePath,
      versions: [{
        id: "version-h3",
        outputFilename: "source.mp4",
        width: 864,
        height: 480,
        steps: 20,
        attentionMode: "pytorch",
        h3VideoVaeMode: "int8-convrot",
        h3ContinuationData: {
          status: "available",
          artifact: {
            artifactId: "artifact-h3",
            lineageId: "lineage-h3",
            executionModelId: "minimax_h3_fl2va",
            contextFrames: 0,
            width: 864,
            height: 480,
            frameCount: 124,
            fps: 24,
            videoVaeFilename: "minimax_h3_video_vae_int8_convrot.safetensors",
            payload: { filename: "source.safetensors", subfolder: "h3-native-av", type: "output", absolutePath: payloadPath },
            manifest: { filename: "source.json", subfolder: "h3-native-av", type: "output", absolutePath: manifestPath }
          }
        }
      }]
    } as unknown as AppState["history"][number]];
    const learnedProfile = {
      id: "minimax_h3_latent_upscaler",
      integrated: true,
      available: true,
      components: [],
      missingCustomNodeIds: [] as string[],
      missingCustomNodeNames: [] as string[],
      customNodeCompatibility: "unknown",
      runtimeVerified: false,
      runtimeReady: false
    };
    let cachedEnvironment = ({
      modelProfiles: [learnedProfile],
      customNodes: [{
        id: "mmh3-ultimate-upscale",
        installed: true,
        compatibilityState: "supported"
      }]
    }) as unknown as ReturnType<typeof import("../electron/services/environment").getCachedEnvironmentScan>;
    const enqueueInfo = vi.fn();
    const enqueueLogger = {
      debug: vi.fn(), info: enqueueInfo, warn: vi.fn(), error: vi.fn()
    } as never;
    const enqueueStore = repository(state);
    const service = new QueueEnqueueService({
      store: enqueueStore, logger: enqueueLogger, sendState: vi.fn(),
      getCachedEnvironmentScanForQueue: () => cachedEnvironment,
      effectiveImageInputLibraryDirectory: async () => "C:/ComfyUI/input/library",
      resolveTaskOutputDirectory: async () => root,
      imageInspection: { readDimensions: () => ({ width: 640, height: 360 }) }
    });

    const next = await service.enqueueUpscale({
      upscaleMode: "h3-native",
      sourceAssetId: "asset-h3",
      sourceVersionId: "version-h3",
      sourceFilePath: videoPath,
      sourceFilename: "source.mp4",
      sourceWidth: 1,
      sourceHeight: 1,
      duration: 1,
      fps: 1,
      targetHeight: 720,
      modelId: "untrusted-renderer-value",
      tileMode: "auto",
      faceRestore: false
    });

    expect(next.queue[0]).toMatchObject({
      taskType: "upscale",
      upscaleMode: "h3-native",
      modelId: "minimax_h3_fl2va",
      sourceWidth: 864,
      sourceHeight: 480,
      targetWidth: 1312,
      targetOutputHeight: 736,
      fps: 24,
      h3NativeInput: {
        prompt: "source prompt",
        scaleBy: 1.5,
        artifact: { artifactId: "artifact-h3" }
      }
    });

    const learned = await service.enqueueUpscale({
      upscaleMode: "h3-native",
      sourceAssetId: "asset-h3",
      sourceVersionId: "version-h3",
      sourceFilePath: videoPath,
      sourceFilename: "source.mp4",
      sourceWidth: 1,
      sourceHeight: 1,
      duration: 1,
      fps: 1,
      targetHeight: 1080,
      modelId: "untrusted-renderer-value",
      tileMode: "auto",
      faceRestore: false
    });

    expect(learned.queue[1]).toMatchObject({
      taskType: "upscale",
      upscaleMode: "h3-native",
      modelId: "minimax_h3_fl2va",
      targetWidth: 1952,
      targetOutputHeight: 1088,
      h3NativeInput: {
        provider: "learned-3d",
        learnedModelFilename: "minimax_h3_latent_upscaler_3d_bf16.safetensors",
        scaleBy: 2.25
      }
    });

    const tiled = await service.enqueueUpscale({
      upscaleMode: "h3-native",
      sourceAssetId: "asset-h3",
      sourceVersionId: "version-h3",
      sourceFilePath: videoPath,
      sourceFilename: "source.mp4",
      sourceWidth: 864,
      sourceHeight: 480,
      duration: 5,
      fps: 24,
      targetHeight: 1440,
      modelId: "minimax_h3_fl2va",
      tileMode: "auto",
      faceRestore: false
    });
    expect(tiled.queue[2]).toMatchObject({
      taskType: "upscale",
      upscaleMode: "h3-native",
      modelId: "minimax_h3_fl2va",
      targetWidth: 2592,
      targetOutputHeight: 1440,
      h3NativeInput: {
        provider: "learned-3d",
        learnedModelFilename: "minimax_h3_latent_upscaler_3d_bf16.safetensors",
        scaleBy: 3
      }
    });
    expect(tiled.queue[2]?.workflowPath).toContain(
      "minimax_h3_fl2va_ultimate_tiled_second_sample_av_api.json"
    );

    const mutationService = new QueueMutationService({
      store: enqueueStore,
      logger: logger(),
      sendState: vi.fn()
    });
    const edited = await mutationService.updateUpscale(tiled.queue[2]!.id, {
      upscaleMode: "h3-native",
      targetWidth: 1952,
      targetHeight: 1080,
      targetOutputHeight: 1088,
      modelId: "minimax_h3_fl2va",
      workflowPath: "builtin:upscale/h3-native-second-sample",
      tileMode: "safe",
      faceRestore: false,
      outputFilename: "source-1080p-v01.mp4"
    });
    expect(edited.queue[2]).toMatchObject({
      targetWidth: 1952,
      targetHeight: 1080,
      targetOutputHeight: 1088,
      workflowPath: expect.stringContaining("minimax_h3_fl2va_learned_3d_second_sample_av_api.json"),
      h3NativeInput: {
        provider: "learned-3d",
        scaleBy: 2.25,
        workflowPath: expect.stringContaining("minimax_h3_fl2va_learned_3d_second_sample_av_api.json")
      }
    });
    const editedBack = await mutationService.updateUpscale(edited.queue[2]!.id, {
      upscaleMode: "h3-native",
      targetWidth: 2592,
      targetHeight: 1440,
      targetOutputHeight: 1440,
      modelId: "minimax_h3_fl2va",
      workflowPath: "builtin:upscale/h3-native-second-sample",
      tileMode: "safe",
      faceRestore: false,
      outputFilename: "source-1440p-v01.mp4"
    });
    expect(editedBack.queue[2]).toMatchObject({
      targetWidth: 2592,
      targetHeight: 1440,
      targetOutputHeight: 1440,
      workflowPath: expect.stringContaining("minimax_h3_fl2va_ultimate_tiled_second_sample_av_api.json"),
      h3NativeInput: {
        provider: "learned-3d",
        scaleBy: 3,
        workflowPath: expect.stringContaining("minimax_h3_fl2va_ultimate_tiled_second_sample_av_api.json")
      }
    });

    cachedEnvironment = ({
      modelProfiles: [learnedProfile],
      customNodes: [{
        id: "mmh3-ultimate-upscale",
        installed: false,
        compatibilityState: "unknown"
      }]
    }) as unknown as ReturnType<typeof import("../electron/services/environment").getCachedEnvironmentScan>;
    await expect(service.enqueueUpscale({
      upscaleMode: "h3-native",
      sourceAssetId: "asset-h3",
      sourceVersionId: "version-h3",
      sourceFilePath: videoPath,
      sourceFilename: "source.mp4",
      sourceWidth: 864,
      sourceHeight: 480,
      duration: 5,
      fps: 24,
      targetHeight: 1440,
      modelId: "minimax_h3_fl2va",
      tileMode: "auto",
      faceRestore: false
    })).rejects.toThrow("需要 MMH3 Ultimate Upscale");

    cachedEnvironment = undefined;
    const deferred = await service.enqueueUpscale({
      upscaleMode: "h3-native",
      sourceAssetId: "asset-h3",
      sourceVersionId: "version-h3",
      sourceFilePath: videoPath,
      sourceFilename: "source.mp4",
      sourceWidth: 864,
      sourceHeight: 480,
      duration: 5,
      fps: 24,
      targetHeight: 1080,
      modelId: "minimax_h3_fl2va",
      tileMode: "auto",
      faceRestore: false
    });
    expect(deferred.queue[3]).toMatchObject({
      targetOutputHeight: 1088,
      h3NativeInput: { provider: "learned-3d", scaleBy: 2.25 }
    });
    expect(enqueueInfo).toHaveBeenCalledWith(
      "queue",
      "upscale-enqueue-environment-preflight-deferred",
      expect.any(String),
      expect.objectContaining({ taskType: "upscale", targetHeight: 1080 })
    );
    await fs.rm(root, { recursive: true, force: true });
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
