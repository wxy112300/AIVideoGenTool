import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { registerSharedNativeAsset } from "../electron/application-runtime.js";
import { createDefaultDraft, createDefaultState } from "../src/core/defaults.js";
import { extensionTaskFromDraft } from "../src/core/queue-task-factory.js";
import { persistVideoHistoryResult } from "../electron/queue-history.js";
import { QueueExecutionSideEffects } from "../electron/services/queue-execution-side-effects.js";
import { NativeAvArtifactService } from "../electron/services/native-av-artifact.js";
import { nativeAvArtifactFileSystem } from "../electron/services/native-av-artifact-file-system.js";
import { H3ContinuumAssetRegistry } from "../electron/services/h3-continuum-asset-registry.js";
import type {
  AppState,
  HistoryFile,
  NativeAvContinuationData,
  QueueTask
} from "../src/types.js";

type VideoQueueTask = Exclude<QueueTask, { taskType: "image-generation" }>;

const continuation: NativeAvContinuationData = {
  status: "available",
  artifact: {
    schemaVersion: 1,
    artifactId: "artifact-1",
    role: "final-clean-av",
    lineageId: "lineage-1",
    manifest: { filename: "h3av_artifact-1.json", subfolder: "h3-native-av", type: "output", format: "json" },
    payload: { filename: "h3av_artifact-1.safetensors", subfolder: "h3-native-av", type: "output", format: "safetensors" },
    payloadSha256: "a".repeat(64),
    payloadBytes: 100,
    modelFamily: "minimax-h3",
    executionModelId: "minimax_h3_ref2va",
    providerId: "comfyui",
    providerRevision: "test",
    producerNodeId: "LocalVideoStudioH3SaveJointAV",
    producerNodeVersion: "0.3.4",
    workflowId: "workflow.json",
    diffusionModelFilename: "diffusion.safetensors",
    textEncoderFilename: "text.safetensors",
    videoVaeFilename: "video.safetensors",
    audioVaeFilename: "audio.safetensors",
    width: 864,
    height: 480,
    fps: 24,
    frameCount: 124,
    videoShape: [1, 24, 37, 54, 96],
    videoDtype: "F32",
    audioSampleRate: 32000,
    audioChannels: 2,
    audioLatentRate: 40,
    audioShape: [1, 32, 2, 207],
    audioDtype: "F32",
    contextFrames: 0,
    workflowRevision: "workflow-1",
    sourceTaskId: "task-1",
    createdAt: "2026-09-19T04:00:00.000Z"
  }
};

function task(
  taskType: "generation" | "extension" | "upscale",
  workflowPath = "workflow.json"
): VideoQueueTask {
  return {
    id: "task-1",
    taskType,
    workflowPath,
    modelId: "minimax_h3_ref2va",
    h3AvOutputPolicy: "shared"
  } as unknown as VideoQueueTask;
}

function nativePayload(): Buffer {
  const videoBytes = 1 * 24 * 2 * 30 * 54 * 2;
  const audioBytes = 1 * 32 * 2 * 8 * 2;
  const header = Buffer.from(JSON.stringify({
    video: { dtype: "F16", shape: [1, 24, 2, 30, 54], data_offsets: [0, videoBytes] },
    audio: { dtype: "F16", shape: [1, 32, 2, 8], data_offsets: [videoBytes, videoBytes + audioBytes] }
  }), "utf8");
  const payload = Buffer.alloc(8 + header.byteLength + videoBytes + audioBytes);
  payload.writeBigUInt64LE(BigInt(header.byteLength), 0);
  header.copy(payload, 8);
  return payload;
}

function repository(state: AppState) {
  return {
    get: () => state,
    update: async (mutator: (current: AppState) => void) => {
      mutator(state);
      return state;
    }
  } as never;
}

function completionSideEffects(state: AppState): QueueExecutionSideEffects {
  return new QueueExecutionSideEffects({
    store: repository(state),
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
    sendState: vi.fn(),
    updateTask: async () => state,
    resolveTaskOutputDirectory: async () => "C:/ComfyUI/output",
    requireExistingImageOutput: async () => [],
    requireExistingVideoOutput: async () => [],
    prepareQueueRuntimeForTask: async () => true,
    stabilizeH3RuntimeBetweenTasks: async () => true,
    stopQueueRuntime: async () => true,
    restartQueueRuntime: async () => ({ ok: true, message: "restarted" }),
    settingsForTask: (_task, settings) => settings,
    errorMeta: () => ({})
  });
}

describe("Phase 1 shared asset registration boundaries", () => {
  it("keeps ordinary shared video available when optional asset registration fails", async () => {
    const registry = {
      registerNativeArtifact: vi.fn(async () => {
        throw new Error("registry read failed");
      })
    };
    const result = await registerSharedNativeAsset(
      continuation,
      task("generation"),
      "C:/output",
      registry
    );
    expect(result).toMatchObject({ status: "save-failed", reason: "registry read failed" });
    expect(result.artifact).toBeUndefined();
    expect(result.asset).toBeUndefined();
  });

  it("keeps first-pass checkpoint registration out of final asset history", async () => {
    const registry = { registerNativeArtifact: vi.fn() };
    const result = await registerSharedNativeAsset(
      continuation,
      task("generation", "minimax_h3_fl2va_first_pass_av_api.json"),
      "C:/output",
      registry
    );
    expect(result).toBe(continuation);
    expect(registry.registerNativeArtifact).not.toHaveBeenCalled();
  });

  it("keeps required second-pass registration hard-failing", async () => {
    const registry = {
      registerNativeArtifact: vi.fn(async () => {
        throw new Error("required registry failure");
      })
    };
    await expect(registerSharedNativeAsset(
      continuation,
      task("upscale", "minimax_h3_fl2va_learned_3d_second_sample_av_api.json"),
      "C:/output",
      registry
    )).rejects.toThrow("required registry failure");
  });

  it("keeps the MP4 History result when optional shared registration fails and protects legacy tasks", async () => {
    const state = createDefaultState();
    const sharedTask = extensionTaskFromDraft({
      ...createDefaultDraft(),
      inputMode: "video",
      modelId: "minimax_h3_ref2va",
      sourceVideoPath: "C:/input/source.mp4",
      sourceVideoDuration: 1,
      trimStartSeconds: 0,
      trimEndSeconds: 1,
      sourceWidth: 864,
      sourceHeight: 480,
      workflowPath: "minimax_h3_r2v_extend_api.json"
    }, state, {
      now: () => new Date("2026-09-19T03:59:00.000Z"),
      id: () => "optional-failure-task",
      random: () => 0.5
    });
    sharedTask.h3AvOutputPolicy = "shared";
    state.queue = [sharedTask];
    const registry = {
      registerNativeArtifact: vi.fn(async () => {
        throw new Error("registry read failed");
      })
    };
    const failed = await registerSharedNativeAsset(
      continuation,
      sharedTask,
      "C:/output",
      registry
    );
    expect(failed).toMatchObject({ status: "save-failed" });

    await completionSideEffects(state).completeVideoTask({
      task: sharedTask,
      completedAt: "2026-09-19T04:00:00.000Z",
      promptId: "optional-failure-prompt",
      comfyOutputs: { fixture: true },
      files: [{
        filename: "optional-failure.mp4",
        subfolder: "Videos",
        type: "output",
        absolutePath: "C:/output/Videos/optional-failure.mp4"
      }],
      h3ContinuationData: failed
    });
    expect(state.queue).toHaveLength(0);
    expect(state.history[0]?.versions[0]).toMatchObject({
      files: [expect.objectContaining({ filename: "optional-failure.mp4" })],
      h3ContinuationData: { status: "save-failed" }
    });
    expect(state.history[0]?.versions[0]?.h3AvAsset).toBeUndefined();

    const legacyRegistry = { registerNativeArtifact: vi.fn() };
    const legacyResult = await registerSharedNativeAsset(
      continuation,
      { ...sharedTask, h3AvOutputPolicy: undefined },
      "C:/output",
      legacyRegistry
    );
    expect(legacyResult).toBe(continuation);
    expect(legacyRegistry.registerNativeArtifact).not.toHaveBeenCalled();
  });

  it("carries one committed owner from shared registration through History to the next task", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "h3-phase1-chain-"));
    try {
      const artifactService = new NativeAvArtifactService({ fileSystem: nativeAvArtifactFileSystem });
      const producedDirectory = path.join(root, "h3-native-av");
      const producedFilename = "h3av_shared-chain-artifact.safetensors";
      const producedPath = path.join(producedDirectory, producedFilename);
      await fs.mkdir(producedDirectory, { recursive: true });
      await fs.writeFile(producedPath, nativePayload());
      const committed = await artifactService.commitProducedFile({
        outputDirectory: root,
        artifactId: "shared-chain-artifact",
        sharedOutput: true,
        role: "extend-segment-clean-av",
        lineageId: "shared-chain-lineage",
        executionModelId: "minimax_h3_ref2va",
        providerId: "comfyui",
        providerRevision: "test",
        producerNodeId: "LocalVideoStudioH3SaveJointAV",
        producerNodeVersion: "0.3.4",
        workflowId: "minimax_h3_r2v_extend_api.json",
        diffusionModelFilename: "diffusion.safetensors",
        textEncoderFilename: "text.safetensors",
        videoVaeFilename: "video.safetensors",
        audioVaeFilename: "audio.safetensors",
        width: 864,
        height: 480,
        frameCount: 5,
        contextFrames: 0,
        workflowRevision: "test-workflow",
        sourceTaskId: "shared-chain-task",
        producedFile: {
          filename: producedFilename,
          subfolder: "h3-native-av",
          type: "output",
          format: "safetensors"
        }
      });
      expect(committed.status).toBe("available");
      if (committed.status !== "available" || !committed.artifact) throw new Error("fixture commit failed");

      const state = createDefaultState();
      const sourceTask = extensionTaskFromDraft({
        ...createDefaultDraft(),
        inputMode: "video",
        modelId: "minimax_h3_ref2va",
        sourceVideoPath: "C:/input/source.mp4",
        sourceVideoDuration: 1,
        trimStartSeconds: 0,
        trimEndSeconds: 1,
        sourceWidth: 864,
        sourceHeight: 480,
        workflowPath: "minimax_h3_r2v_extend_api.json"
      }, state, {
        now: () => new Date("2026-09-19T03:59:00.000Z"),
        id: () => "shared-chain-task",
        random: () => 0.5
      });
      sourceTask.h3AvOutputPolicy = "shared";
      state.queue = [sourceTask];
      const registry = new H3ContinuumAssetRegistry({ fileSystem: nativeAvArtifactFileSystem });
      const registered = await registerSharedNativeAsset(
        committed,
        sourceTask,
        root,
        registry
      );
      expect(registered.status).toBe("available");
      expect(registered.asset).toMatchObject({
        storageKind: "app-canonical",
        ownerPath: committed.artifact.payload,
        payloadSha256: committed.artifact.payloadSha256,
        capabilities: ["native-av"]
      });

      const videoFile: HistoryFile = {
        filename: "shared-chain.mp4",
        subfolder: "Videos",
        type: "output",
        absolutePath: path.join(root, "Videos", "shared-chain.mp4")
      };
      const sideEffects = completionSideEffects(state);
      await sideEffects.completeVideoTask({
        task: sourceTask,
        completedAt: "2026-09-19T04:00:00.000Z",
        promptId: "shared-chain-prompt",
        comfyOutputs: { fixture: true },
        files: [videoFile],
        h3ContinuationData: registered
      });

      const version = state.history[0]?.versions[0];
      expect(version).toMatchObject({
        h3ContextLatentPath: committed.artifact.payload.absolutePath,
        h3ContinuationData: {
          status: "available",
          artifact: { payload: committed.artifact.payload },
          asset: {
            storageKind: "app-canonical",
            payloadSha256: committed.artifact.payloadSha256,
            ownerPath: committed.artifact.payload
          }
        },
        h3AvAsset: {
          storageKind: "app-canonical",
          payloadSha256: committed.artifact.payloadSha256,
          ownerPath: committed.artifact.payload
        }
      });

      const nextTask = extensionTaskFromDraft({
        ...createDefaultDraft(),
        inputMode: "video",
        modelId: "minimax_h3_ref2va",
        sourceVideoPath: videoFile.absolutePath!,
        sourceVideoDuration: 1,
        trimStartSeconds: 0,
        trimEndSeconds: 1,
        sourceWidth: 864,
        sourceHeight: 480,
        workflowPath: "minimax_h3_r2v_extend_api.json",
        sourceAssetId: state.history[0]!.id,
        sourceVersionId: version!.id,
        h3ContextLatentPath: version!.h3ContextLatentPath
      }, state, {
        now: () => new Date("2026-09-19T04:01:00.000Z"),
        id: () => "shared-chain-next-task",
        random: () => 0.5
      });
      expect(nextTask).toMatchObject({
        sourceAssetId: state.history[0]!.id,
        sourceVersionId: version!.id,
        h3ContextLatentPath: committed.artifact.payload.absolutePath
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
