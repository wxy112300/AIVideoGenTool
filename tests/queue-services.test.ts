import { describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDefaultDraft, createDefaultImageEditDraft, createDefaultState } from "../src/core/defaults";
import { queueTaskFromDraft } from "../src/core/queue-task-factory";
import type { AppState, Draft, QueueTask } from "../src/types";
import type { StateRepository } from "../electron/ports/state-repository";
import { QueueControlService } from "../electron/queue-control-service";
import { QueueMutationService } from "../electron/queue-mutation-service";
import { QueueWorkerController } from "../electron/queue-worker";
import { QueueEnqueueService } from "../electron/queue-enqueue";
import { QueueService, type QueueServiceDependencies } from "../electron/services/queue-service";
import { QueueExecutionSideEffects } from "../electron/services/queue-execution-side-effects";
import { QueueTaskStateService } from "../electron/services/queue-task-state";
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
    },
    mutateTransient: (mutator) => mutator(state),
    flush: async () => undefined
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
    sendProgress: vi.fn(),
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
  it("coalesces live progress without broadcasting full state and checkpoints it later", async () => {
    vi.useFakeTimers();
    try {
      const state = createDefaultState();
      const queued = task(state);
      queued.status = "running";
      state.queue = [queued];
      const store = repository(state);
      const flush = vi.spyOn(store, "flush");
      const sendState = vi.fn();
      const sendProgress = vi.fn();
      const service = new QueueTaskStateService({
        store,
        logger: logger(),
        sendState,
        sendProgress,
        stageStartedAt: new Map(),
        progressEventIntervalMs: 100,
        progressPersistIntervalMs: 1_000
      });

      await service.updateTaskProgress(queued.id, { progress: 10, stage: "sampling" });
      await service.updateTaskProgress(queued.id, { progress: 11, stage: "sampling" });

      expect(sendState).not.toHaveBeenCalled();
      expect(sendProgress).not.toHaveBeenCalled();
      expect(store.get().queue[0]).toMatchObject({ progress: 11, stage: "sampling" });

      await vi.advanceTimersByTimeAsync(100);
      expect(sendProgress).toHaveBeenCalledTimes(1);
      expect(sendProgress).toHaveBeenCalledWith(expect.objectContaining({
        taskId: queued.id,
        progress: 11,
        stage: "sampling"
      }));
      expect(flush).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(900);
      expect(flush).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

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

  it("keeps an empty managed Continuum seed empty in the creation draft", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-managed-seed-draft-"));
    try {
      const outputRoot = path.join(root, "output");
      const sourcePath = path.join(root, "source.mp4");
      await Promise.all([
        fs.mkdir(outputRoot, { recursive: true }),
        fs.writeFile(sourcePath, "video")
      ]);
      const state = createDefaultState();
      const service = new QueueEnqueueService({
        store: repository(state),
        logger: logger(),
        sendState: vi.fn(),
        effectiveImageInputLibraryDirectory: async () => path.join(root, "library"),
        resolveTaskOutputDirectory: async () => outputRoot,
        imageInspection: { readDimensions: () => ({ width: 1280, height: 720 }) }
      });
      const workflowPath = fileURLToPath(new URL(
        "../workflows/minimax_h3_continuum_v38_managed_extend_api.json",
        import.meta.url
      ));
      const draft = {
        ...createDefaultDraft(),
        inputMode: "video" as const,
        modelId: "minimax_h3_continuum",
        sourceVideoPath: sourcePath,
        sourceVideoDuration: 5,
        trimStartSeconds: 0,
        trimEndSeconds: 5,
        sourceWidth: 1280,
        sourceHeight: 720,
        workflowPath,
        h3ContinuumMode: "managed" as const,
        seed: null
      };

      const next = await service.enqueueExtension(draft);
      const queued = next.queue[0];

      expect(next.draft.seed).toBeNull();
      expect(queued?.seed).toBe(next.draft.h3ContinuumSequence?.baseSeed);
      expect(queued?.seed).toEqual(expect.any(Number));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("selects the bundled Motion Extend workflow when an old draft has no workflow", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-motion-workflow-fallback-"));
    try {
      const sourcePath = path.join(root, "source.mp4");
      await fs.writeFile(sourcePath, "video");
      const state = createDefaultState();
      const service = new QueueEnqueueService({
        store: repository(state),
        logger: logger(),
        sendState: vi.fn(),
        effectiveImageInputLibraryDirectory: async () => path.join(root, "library"),
        resolveTaskOutputDirectory: async () => path.join(root, "output"),
        imageInspection: { readDimensions: () => ({ width: 864, height: 480 }) }
      });
      const draft = {
        ...createDefaultDraft(),
        inputMode: "video" as const,
        modelId: "minimax_h3_ref2va",
        workflowPath: "",
        sourceVideoPath: sourcePath,
        sourceVideoDuration: 5,
        trimStartSeconds: 0,
        trimEndSeconds: 5,
        sourceWidth: 864,
        sourceHeight: 480,
        h3ReferenceSlots: [{
          id: "source-slot",
          mediaType: "video" as const,
          mediaPath: sourcePath,
          role: "motion" as const,
          note: ""
        }]
      };

      const next = await service.enqueueExtension(draft);
      expect(next.queue[0]).toMatchObject({
        modelId: "minimax_h3_ref2va",
        workflowPath: expect.stringContaining("minimax_h3_r2v_extend_api.json")
      });
      expect(next.draft.workflowPath).toContain("minimax_h3_r2v_extend_api.json");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("normalizes a stale global sparse setting in the Motion queue snapshot", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-motion-sparse-settings-"));
    try {
      const sourcePath = path.join(root, "source.mp4");
      await fs.writeFile(sourcePath, "video");
      const state = createDefaultState();
      state.settings.h3SparseAttentionMode = "sol-attn";
      const service = new QueueEnqueueService({
        store: repository(state),
        logger: logger(),
        sendState: vi.fn(),
        effectiveImageInputLibraryDirectory: async () => path.join(root, "library"),
        resolveTaskOutputDirectory: async () => path.join(root, "output"),
        imageInspection: { readDimensions: () => ({ width: 864, height: 480 }) }
      });

      const next = await service.enqueueExtension({
        ...createDefaultDraft(),
        inputMode: "video",
        modelId: "minimax_h3_ref2va",
        workflowPath: "",
        sourceVideoPath: sourcePath,
        sourceVideoDuration: 5,
        trimStartSeconds: 0,
        trimEndSeconds: 5,
        sourceWidth: 864,
        sourceHeight: 480,
        h3ReferenceSlots: [{
          id: "source-slot",
          mediaType: "video" as const,
          mediaPath: sourcePath,
          role: "motion" as const,
          note: ""
        }]
      });
      const queued = next.queue[0];

      expect(queued).toMatchObject({
        h3SparseAttentionMode: "off",
        h3ExecutionPolicy: expect.objectContaining({
          sparseAttentionMode: "off",
          allowed: true
        })
      });
      expect(next.settings.h3SparseAttentionMode).toBe("sol-attn");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("keeps an existing custom workflow even when its filename matches a bundled generation workflow", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-custom-same-name-workflow-"));
    try {
      const sourcePath = path.join(root, "source.mp4");
      const customWorkflowPath = path.join(root, "custom", "minimax_h3_i2v_api.json");
      await fs.mkdir(path.dirname(customWorkflowPath), { recursive: true });
      await fs.writeFile(sourcePath, "video");
      await fs.copyFile(
        fileURLToPath(new URL("../workflows/minimax_h3_r2v_extend_api.json", import.meta.url)),
        customWorkflowPath
      );
      const state = createDefaultState();
      const service = new QueueEnqueueService({
        store: repository(state),
        logger: logger(),
        sendState: vi.fn(),
        effectiveImageInputLibraryDirectory: async () => path.join(root, "library"),
        resolveTaskOutputDirectory: async () => path.join(root, "output"),
        imageInspection: { readDimensions: () => ({ width: 864, height: 480 }) }
      });

      const next = await service.enqueueExtension({
        ...createDefaultDraft(),
        inputMode: "video",
        modelId: "minimax_h3_ref2va",
        workflowPath: customWorkflowPath,
        sourceVideoPath: sourcePath,
        sourceVideoDuration: 5,
        trimStartSeconds: 0,
        trimEndSeconds: 5,
        sourceWidth: 864,
        sourceHeight: 480,
        h3ReferenceSlots: [{
          id: "source-slot",
          mediaType: "video" as const,
          mediaPath: sourcePath,
          role: "motion" as const,
          note: ""
        }]
      });

      expect(next.queue[0]?.workflowPath).toBe(customWorkflowPath);
      expect(next.draft.workflowPath).toBe(customWorkflowPath);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a Motion latent when the selected trim does not end at the source video", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-motion-trim-contract-"));
    try {
      const sourcePath = path.join(root, "source.mp4");
      const latentPath = path.join(root, "clip.safetensors");
      await fs.writeFile(sourcePath, "video");
      await fs.writeFile(latentPath, "latent");
      const state = createDefaultState();
      const service = new QueueEnqueueService({
        store: repository(state),
        logger: logger(),
        sendState: vi.fn(),
        effectiveImageInputLibraryDirectory: async () => path.join(root, "library"),
        resolveTaskOutputDirectory: async () => path.join(root, "output"),
        imageInspection: { readDimensions: () => ({ width: 864, height: 480 }) }
      });
      const draft = {
        ...createDefaultDraft(),
        inputMode: "video" as const,
        modelId: "minimax_h3_ref2va",
        workflowPath: fileURLToPath(new URL(
          "../workflows/minimax_h3_r2v_extend_api.json",
          import.meta.url
        )),
        sourceVideoPath: sourcePath,
        sourceVideoDuration: 5,
        trimStartSeconds: 0,
        trimEndSeconds: 4,
        sourceWidth: 864,
        sourceHeight: 480,
        h3ContextLatentPath: latentPath,
        h3ReferenceSlots: [{
          id: "source-slot",
          mediaType: "video" as const,
          mediaPath: sourcePath,
          role: "motion" as const,
          note: ""
        }]
      };

      await expect(service.enqueueExtension(draft)).rejects.toThrow("只对应源视频末端");
      expect(state.queue).toHaveLength(0);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("does not silently fall back to video when a selected Motion latent is missing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-motion-missing-contract-"));
    try {
      const sourcePath = path.join(root, "source.mp4");
      await fs.writeFile(sourcePath, "video");
      const state = createDefaultState();
      const service = new QueueEnqueueService({
        store: repository(state),
        logger: logger(),
        sendState: vi.fn(),
        effectiveImageInputLibraryDirectory: async () => path.join(root, "library"),
        resolveTaskOutputDirectory: async () => path.join(root, "output"),
        imageInspection: { readDimensions: () => ({ width: 864, height: 480 }) }
      });
      await expect(service.enqueueExtension({
        ...createDefaultDraft(),
        inputMode: "video",
        modelId: "minimax_h3_ref2va",
        workflowPath: fileURLToPath(new URL("../workflows/minimax_h3_r2v_extend_api.json", import.meta.url)),
        sourceVideoPath: sourcePath,
        sourceVideoDuration: 5,
        trimStartSeconds: 0,
        trimEndSeconds: 5,
        sourceWidth: 864,
        sourceHeight: 480,
        h3ContextLatentPath: path.join(root, "missing.safetensors"),
        h3ReferenceSlots: [{
          id: "source-slot",
          mediaType: "video" as const,
          mediaPath: sourcePath,
          role: "motion" as const,
          note: ""
        }]
      })).rejects.toThrow("所选 Motion Context latent 已不存在");
      expect(state.queue).toHaveLength(0);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("does not let a stale canonical Motion asset replace a manually selected latent", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-motion-stale-asset-"));
    try {
      const sourcePath = path.join(root, "source.mp4");
      const selectedLatentPath = path.join(root, "selected.safetensors");
      const staleOwnerPath = path.join(root, "stale-owner.safetensors");
      await Promise.all([
        fs.writeFile(sourcePath, "video"),
        fs.writeFile(selectedLatentPath, "selected latent"),
        fs.writeFile(staleOwnerPath, "stale latent")
      ]);
      const inspectedDrafts: Draft[] = [];
      const state = createDefaultState();
      const service = new QueueEnqueueService({
        store: repository(state),
        logger: logger(),
        sendState: vi.fn(),
        inspectExtensionSource: vi.fn(async (draft: Draft) => {
          inspectedDrafts.push(structuredClone(draft));
          return { route: "motion-context" as const, status: "available" as const };
        }),
        effectiveImageInputLibraryDirectory: async () => path.join(root, "library"),
        resolveTaskOutputDirectory: async () => path.join(root, "output"),
        imageInspection: { readDimensions: () => ({ width: 864, height: 480 }) }
      });
      const draft = {
        ...createDefaultDraft(),
        inputMode: "video" as const,
        modelId: "minimax_h3_ref2va",
        workflowPath: fileURLToPath(new URL("../workflows/minimax_h3_r2v_extend_api.json", import.meta.url)),
        sourceVideoPath: sourcePath,
        sourceVideoDuration: 5,
        trimStartSeconds: 0,
        trimEndSeconds: 5,
        sourceWidth: 864,
        sourceHeight: 480,
        h3ContextLatentPath: selectedLatentPath,
        h3MotionContextAsset: {
          schemaVersion: 1,
          assetId: "stale-canonical-owner",
          storageKind: "app-canonical" as const,
          ownerPath: {
            filename: path.basename(staleOwnerPath),
            subfolder: "h3-native-av",
            type: "output" as const,
            absolutePath: staleOwnerPath
          },
          payloadBytes: 12,
          payloadSha256: "a".repeat(64),
          videoTensorSha256: "b".repeat(64),
          audioTensorSha256: "c".repeat(64),
          videoShape: [1, 24, 2, 30, 54],
          videoDtype: "F16" as const,
          audioShape: [1, 32, 2, 8],
          audioDtype: "BF16" as const,
          width: 864,
          height: 480,
          fps: 24,
          frameCount: 5,
          producer: {
            workflowId: "minimax-h3",
            workflowRevision: "test-v1",
            producerNodeId: "LocalVideoStudioH3SaveJointAV",
            producerNodeVersion: "0.3.5",
            executionModelId: "minimax_h3_fl2va",
            diffusionModelFilename: "model.safetensors",
            textEncoderFilename: "text.safetensors",
            videoVaeFilename: "video-vae.safetensors",
            audioVaeFilename: "audio-vae.safetensors",
            loraFilenames: [],
            width: 864,
            height: 480,
            fps: 24,
            frameCount: 5
          },
          capabilities: ["native-av" as const],
          createdAt: "2026-09-19T00:00:00.000Z"
        },
        h3ReferenceSlots: [{
          id: "source-slot",
          mediaType: "video" as const,
          mediaPath: sourcePath,
          role: "motion" as const,
          note: ""
        }]
      };

      const next = await service.enqueueExtension(draft);

      expect(inspectedDrafts.at(-1)).toMatchObject({
        h3ContextLatentPath: selectedLatentPath,
        h3MotionContextAsset: undefined
      });
      expect(next.queue[0]).toMatchObject({ h3ContextLatentPath: selectedLatentPath });
      expect(next.queue[0]).not.toHaveProperty("h3MotionContextAsset");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("rechecks the Motion consumer contract at the final enqueue boundary", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-motion-final-preflight-"));
    try {
      const sourcePath = path.join(root, "source.mp4");
      const latentPath = path.join(root, "clip.safetensors");
      await fs.writeFile(sourcePath, "video");
      await fs.writeFile(latentPath, "latent");
      const state = createDefaultState();
      const service = new QueueEnqueueService({
        store: repository(state),
        logger: logger(),
        sendState: vi.fn(),
        inspectExtensionSource: vi.fn(async () => ({
          route: "motion-context" as const,
          status: "invalid" as const,
          reason: "Motion Context latent 的 schema 不匹配"
        })),
        effectiveImageInputLibraryDirectory: async () => path.join(root, "library"),
        resolveTaskOutputDirectory: async () => path.join(root, "output"),
        imageInspection: { readDimensions: () => ({ width: 864, height: 480 }) }
      });

      await expect(service.enqueueExtension({
        ...createDefaultDraft(),
        inputMode: "video",
        modelId: "minimax_h3_ref2va",
        workflowPath: fileURLToPath(new URL("../workflows/minimax_h3_r2v_extend_api.json", import.meta.url)),
        sourceVideoPath: sourcePath,
        sourceVideoDuration: 5,
        trimStartSeconds: 0,
        trimEndSeconds: 5,
        sourceWidth: 864,
        sourceHeight: 480,
        h3ContextLatentPath: latentPath,
        h3ReferenceSlots: [{
          id: "source-slot",
          mediaType: "video" as const,
          mediaPath: sourcePath,
          role: "motion" as const,
          note: ""
        }]
      })).rejects.toThrow("schema 不匹配");
      expect(state.queue).toHaveLength(0);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("validates the old AV instead of starting a managed Run from a stale managed draft", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-continuum-old-av-"));
    try {
      const sourcePath = path.join(root, "source.mp4");
      await fs.writeFile(sourcePath, "video");
      const store = repository(createDefaultState());
      const inspectNativeAvArtifact = vi.fn(async () => {
        throw new Error("old AV inspected before sampling");
      });
      const service = new QueueEnqueueService({
        store,
        logger: logger(),
        sendState: vi.fn(),
        effectiveImageInputLibraryDirectory: async () => root,
        resolveTaskOutputDirectory: async () => root,
        imageInspection: { readDimensions: () => ({ width: 1280, height: 720 }) },
        inspectNativeAvArtifact
      });
      const artifactPath = path.join(root, "h3-native-av", "old.safetensors");
      await expect(service.enqueueExtension({
        ...createDefaultDraft(),
        inputMode: "video",
        modelId: "minimax_h3_continuum",
        sourceVideoPath: sourcePath,
        sourceVideoDuration: 5,
        trimStartSeconds: 0,
        trimEndSeconds: 5,
        sourceWidth: 1280,
        sourceHeight: 720,
        workflowPath: fileURLToPath(new URL(
          "../workflows/minimax_h3_continuum_v38_managed_extend_api.json", import.meta.url
        )),
        h3ContinuumMode: "managed",
        h3ContinuumArtifactPath: artifactPath
      })).rejects.toThrow("old AV inspected before sampling");
      expect(inspectNativeAvArtifact).toHaveBeenCalledWith(artifactPath, root);
      expect(store.get().queue).toHaveLength(0);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("starts a fresh managed Run after an unaccepted first-chunk task fails", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-managed-run-recovery-"));
    try {
      const outputRoot = path.join(root, "output");
      const sourcePath = path.join(root, "source.mp4");
      await Promise.all([
        fs.mkdir(outputRoot, { recursive: true }),
        fs.writeFile(sourcePath, "video")
      ]);
      const state = createDefaultState();
      const store = repository(state);
      const dependencies = {
        store,
        logger: logger(),
        sendState: vi.fn(),
        effectiveImageInputLibraryDirectory: async () => path.join(root, "library"),
        resolveTaskOutputDirectory: async () => outputRoot,
        imageInspection: { readDimensions: () => ({ width: 1280, height: 720 }) }
      };
      const service = new QueueEnqueueService(dependencies);
      const workflowPath = fileURLToPath(new URL(
        "../workflows/minimax_h3_continuum_v38_managed_extend_api.json",
        import.meta.url
      ));
      const draft = {
        ...createDefaultDraft(),
        inputMode: "video" as const,
        modelId: "minimax_h3_continuum",
        sourceVideoPath: sourcePath,
        sourceVideoDuration: 5,
        trimStartSeconds: 0,
        trimEndSeconds: 5,
        sourceWidth: 1280,
        sourceHeight: 720,
        workflowPath,
        h3ContinuumMode: "managed" as const,
        seed: 123
      };

      const first = await service.enqueueExtension(draft);
      const firstSequence = first.draft.h3ContinuumSequence!;
      await store.update((current) => {
        current.queue[0]!.status = "failed";
        current.queue[0]!.error = "receipt rejected";
      });

      const second = await service.enqueueExtension(first.draft);
      const secondSequence = second.draft.h3ContinuumSequence!;
      expect(second.queue).toHaveLength(2);
      expect(secondSequence.sequenceId).not.toBe(firstSequence.sequenceId);
      expect(secondSequence.runName).not.toBe(firstSequence.runName);
      expect(second.queue[0]?.h3ContinuumSequence?.sequenceId).toBe(firstSequence.sequenceId);
      expect(second.queue[1]?.h3ContinuumSequence?.sequenceId).toBe(secondSequence.sequenceId);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("enqueues H3 image work while deferring runtime validation when no scan is cached", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-h3-image-enqueue-deferred-"));
    try {
      const outputRoot = path.join(root, "output");
      const sourcePath = path.join(root, "source.png");
      await Promise.all([
        fs.mkdir(outputRoot, { recursive: true }),
        fs.writeFile(sourcePath, "source")
      ]);
      const state = createDefaultState();
      state.settings.outputDirectory = path.join(outputRoot, "Videos");
      state.settings.imageOutputDirectory = path.join(outputRoot, "Images");
      const enqueueInfo = vi.fn();
      const enqueueLogger = {
        debug: vi.fn(), info: enqueueInfo, warn: vi.fn(), error: vi.fn()
      } as never;
      const service = new QueueEnqueueService({
        store: repository(state),
        logger: enqueueLogger,
        sendState: vi.fn(),
        getCachedEnvironmentScanForQueue: () => undefined,
        effectiveImageInputLibraryDirectory: async () => path.join(root, "library"),
        resolveTaskOutputDirectory: async () => outputRoot,
        imageInspection: { readDimensions: () => ({ width: 1920, height: 1080 }) }
      });
      const draft = {
        ...createDefaultImageEditDraft(),
        modelId: "minimax-h3-image-i2i",
        qualityProfile: "base-quality-20",
        pictures: [{
          id: "h3-picture-1",
          pictureNumber: 1,
          absolutePath: sourcePath,
          width: 1920,
          height: 1080,
          role: "base" as const
        }],
        promptVersions: [{
          id: "h3-prompt",
          label: "原始",
          text: "Adjust the lighting while preserving the subject.",
          createdAt: "2026-09-15T00:00:00.000Z"
        }],
        activePromptVersion: 0,
        nextPictureNumber: 2
      };

      const next = await service.enqueueImage(draft);
      expect(next.queue).toHaveLength(1);
      expect(next.queue[0]).toMatchObject({
        taskType: "image-generation",
        modelId: "minimax-h3-image-i2i",
        qualityProfile: "base-quality-20"
      });
      expect(enqueueInfo).toHaveBeenCalledWith(
        "queue",
        "image-enqueue-environment-preflight-deferred",
        expect.any(String),
        { taskType: "image-generation", modelId: "minimax-h3-image-i2i" }
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a selected Motion Context latent when it is missing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-motion-context-missing-"));
    try {
      const sourcePath = path.join(root, "source.mp4");
      const missingLatentPath = path.join(root, "missing-context.safetensors");
      const outputRoot = path.join(root, "output");
      await Promise.all([
        fs.mkdir(outputRoot, { recursive: true }),
        fs.writeFile(sourcePath, "video")
      ]);
      const state = createDefaultState();
      const enqueueLogger = {
        debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()
      } as never;
      const service = new QueueEnqueueService({
        store: repository(state),
        logger: enqueueLogger,
        sendState: vi.fn(),
        effectiveImageInputLibraryDirectory: async () => path.join(root, "library"),
        resolveTaskOutputDirectory: async () => outputRoot,
        imageInspection: { readDimensions: () => ({ width: 640, height: 360 }) }
      });
      const draft = {
        ...createDefaultDraft(),
        inputMode: "video" as const,
        modelId: "minimax_h3_ref2va",
        sourceVideoPath: sourcePath,
        sourceVideoDuration: 2,
        trimStartSeconds: 0,
        trimEndSeconds: 2,
        workflowPath: fileURLToPath(new URL("../workflows/minimax_h3_r2v_extend_api.json", import.meta.url)),
        h3ContextLatentPath: missingLatentPath
      };

      await expect(service.enqueueExtension(draft))
        .rejects.toThrow("所选 Motion Context latent 已不存在");
      expect(state.queue).toHaveLength(0);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
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
    expect(deps.sendState).toHaveBeenCalledTimes(1);
    expect(deps.sendState).toHaveBeenCalledWith(expect.objectContaining({
      queue: [],
      history: [expect.objectContaining({ comfyPromptId: "prompt-service" })]
    }));
  });
});
