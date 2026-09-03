import { describe, expect, it, vi } from "vitest";
import type { ExtensionQueueTask, GenerationQueueTask, UpscaleQueueTask } from "../src/types";
import type { NativeAvArtifactMetadata } from "../electron/services/native-av-artifact";
import {
  collectNativeAvProducedFile,
  H3NativeAvArtifactCollector,
  nativeAvArtifactMetadataForTask
} from "../electron/services/h3-native-av-collector";

const metadata: NativeAvArtifactMetadata = {
  outputDirectory: "C:/ComfyUI/output",
  role: "first-pass-clean-av",
  lineageId: "lineage-001",
  executionModelId: "minimax_h3_fl2va",
  providerId: "comfyui",
  providerRevision: "comfy-revision",
  producerNodeId: "LocalVideoStudioH3SaveJointAV",
  producerNodeVersion: "0.1.0",
  workflowId: "minimax_h3_fl2va_first_pass_av",
  diffusionModelFilename: "diffusion.safetensors",
  textEncoderFilename: "text-encoder.safetensors",
  videoVaeFilename: "video-vae.safetensors",
  audioVaeFilename: "audio-vae.safetensors",
  width: 32,
  height: 32,
  frameCount: 5,
  contextFrames: 0,
  workflowRevision: "workflow-1",
  sourceTaskId: "task-001"
};

function completion(...files: Array<Record<string, unknown>>): unknown {
  return {
    outputs: {
      "20": {
        ui: { h3_native_av: files }
      }
    }
  };
}

describe("H3 native AV completion collector", () => {
  it("builds final artifact metadata from the immutable generation task", () => {
    const task = {
      id: "generation-001",
      taskType: "generation",
      modelId: "minimax_h3_fl2va",
      workflowPath: "C:/app/workflows/minimax_h3_i2v_api.json",
      ratio: "16:9",
      resolution: 480,
      sourceWidth: 1920,
      sourceHeight: 1080,
      duration: 5,
      fps: 24,
      h3VideoVaeMode: "int8-convrot"
    } as GenerationQueueTask;

    expect(nativeAvArtifactMetadataForTask(
      task,
      "C:/ComfyUI/output",
      "2026-09-02T00:00:00.000Z"
    )).toMatchObject({
      role: "final-clean-av",
      producerNodeId: "LocalVideoStudioH3SaveJointAV",
      producerNodeVersion: "0.2.3",
      workflowId: "minimax_h3_i2v_api.json",
      width: 864,
      height: 480,
      frameCount: 124,
      contextFrames: 0
    });
  });

  it("includes Motion Context frames in extension artifact geometry", () => {
    const task = {
      id: "extension-001",
      taskType: "extension",
      modelId: "minimax_h3_ref2va",
      workflowPath: "C:/app/workflows/minimax_h3_r2v_extend_api.json",
      ratio: "source",
      resolution: 480,
      sourceWidth: 1920,
      sourceHeight: 1080,
      duration: 5,
      fps: 24,
      h3VideoVaeMode: "fp16"
    } as ExtensionQueueTask;

    expect(nativeAvArtifactMetadataForTask(
      task,
      "C:/ComfyUI/output",
      "2026-09-02T00:00:00.000Z"
    )).toMatchObject({
      role: "extend-segment-clean-av",
      width: 864,
      height: 480,
      frameCount: 146,
      contextFrames: 22
    });
  });

  it("links H3 upscale output to its source JointAV lineage", () => {
    const task = {
      id: "upscale-001",
      taskType: "upscale",
      upscaleMode: "h3-native",
      modelId: "minimax_h3_fl2va",
      workflowPath: "C:/app/workflows/minimax_h3_fl2va_second_sample_av_api.json",
      h3VideoVaeMode: "int8-convrot",
      sourceAssetId: "asset-1",
      sourceVersionId: "version-1",
      targetWidth: 1312,
      targetHeight: 720,
      targetOutputHeight: 736,
      h3NativeInput: {
        artifact: { artifactId: "parent-av", lineageId: "lineage-av", frameCount: 124 },
      }
    } as UpscaleQueueTask;
    expect(nativeAvArtifactMetadataForTask(
      task,
      "C:/ComfyUI/output",
      "2026-09-02T01:00:00.000Z"
    )).toMatchObject({
      role: "final-clean-av",
      lineageId: "lineage-av",
      derivedFromArtifactId: "parent-av",
      width: 1312,
      height: 736,
      frameCount: 124,
      sourceAssetId: "asset-1",
      sourceVersionId: "version-1",
      upscalerId: "h3-latent-upscaler:bilinear-second-sampling"
    });
  });

  it("records learned 3D second sampling distinctly from legacy bilinear tasks", () => {
    const task = {
      id: "upscale-learned",
      taskType: "upscale",
      upscaleMode: "h3-native",
      modelId: "minimax_h3_fl2va",
      workflowPath: "C:/app/workflows/minimax_h3_fl2va_learned_3d_second_sample_av_api.json",
      h3VideoVaeMode: "int8-convrot",
      sourceAssetId: "asset-1",
      sourceVersionId: "version-1",
      targetWidth: 1952,
      targetHeight: 1080,
      targetOutputHeight: 1088,
      h3NativeInput: {
        provider: "learned-3d",
        artifact: { artifactId: "parent-av", lineageId: "lineage-av", frameCount: 124 }
      }
    } as UpscaleQueueTask;

    expect(nativeAvArtifactMetadataForTask(
      task,
      "C:/ComfyUI/output",
      "2026-09-02T01:00:00.000Z"
    )).toMatchObject({
      upscalerId: "h3-latent-upscaler:learned-3d-second-sampling",
      upscalerRevision: "09592c6221ec95cc8e0fae67842e34926c4e668b",
      width: 1952,
      height: 1088
    });
  });

  it("selects one descriptor from the expected serializer node", () => {
    expect(collectNativeAvProducedFile(completion({
      filename: "serializer-output.safetensors",
      subfolder: "h3-native-av",
      type: "output",
      format: "safetensors"
    }), "20")).toEqual({
      status: "available",
      producedFile: {
        filename: "serializer-output.safetensors",
        subfolder: "h3-native-av",
        type: "output",
        format: "safetensors"
      }
    });
  });

  it("fails closed for a missing, wrong-node, or ambiguous descriptor", () => {
    const file = {
      filename: "serializer-output.safetensors",
      subfolder: "h3-native-av",
      type: "output",
      format: "safetensors"
    };
    expect(collectNativeAvProducedFile(completion(), "20").status).toBe("missing");
    expect(collectNativeAvProducedFile(completion(file), "21").status).toBe("missing");
    expect(collectNativeAvProducedFile(completion(file, {
      ...file,
      filename: "serializer-output-2.safetensors"
    }), "20").status).toBe("save-failed");
  });

  it("passes only the descriptor to the streaming artifact committer", async () => {
    const commitProducedFile = vi.fn(async (request) => ({
      status: "available" as const,
      artifact: { artifactId: request.artifactId ?? "generated" }
    }));
    const collector = new H3NativeAvArtifactCollector({ commitProducedFile });
    await expect(collector.commitCompletion(completion({
      filename: "serializer-output.safetensors",
      subfolder: "h3-native-av",
      type: "output",
      format: "safetensors"
    }), "20", metadata)).resolves.toMatchObject({ status: "available" });
    expect(commitProducedFile).toHaveBeenCalledWith(expect.objectContaining({
      outputDirectory: metadata.outputDirectory,
      producedFile: {
        filename: "serializer-output.safetensors",
        subfolder: "h3-native-av",
        type: "output",
        format: "safetensors"
      }
    }));
  });

  it("reuses a managed serializer filename as the committed artifact id", async () => {
    const commitProducedFile = vi.fn(async (request) => ({
      status: "available" as const,
      artifact: { artifactId: request.artifactId }
    }));
    const collector = new H3NativeAvArtifactCollector({ commitProducedFile });

    await collector.commitCompletion(completion({
      filename: "h3av_task-001_execution-001.safetensors",
      subfolder: "h3-native-av",
      type: "output",
      format: "safetensors"
    }), "20", metadata);

    expect(commitProducedFile).toHaveBeenCalledWith(expect.objectContaining({
      artifactId: "task-001_execution-001"
    }));
  });
});
