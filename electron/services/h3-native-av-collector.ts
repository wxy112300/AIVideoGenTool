import type {
  ExtensionQueueTask,
  GenerationQueueTask,
  NativeAvContinuationData,
  UpscaleQueueTask
} from "../../src/types.js";
import {
  extractComfyNativeAvOutputFiles
} from "../../src/core/comfy-output.js";
import {
  generationFrameCountForTask,
  continuumSampledFrameCountForSeconds,
  isMiniMaxH3ContinuumModel,
  isMiniMaxH3R2vModel,
  miniMaxH3ModelAssetNames,
  outputDimensions
} from "../../src/core/workflow.js";
import {
  H3_AV_SERIALIZER_REVISION,
  H3_LATENT_UPSCALER_REVISION
} from "../../src/core/catalog/index.js";
import { H3_LEARNED_UPSCALER_MODEL_REVISION } from "../../src/core/catalog/models/minimax_h3_shared.js";
import { upscaleOutputDimensions } from "../../src/core/upscale.js";
import { h3VideoVaeFilename } from "../../src/core/h3-video-vae.js";
import type {
  NativeAvArtifactMetadata,
  NativeAvArtifactProducedFileCommitRequest,
  NativeAvArtifactProducedFileDescriptor
} from "./native-av-artifact.js";

export interface NativeAvArtifactCommitter {
  commitProducedFile(
    request: NativeAvArtifactProducedFileCommitRequest
  ): Promise<NativeAvContinuationData>;
}

export interface NativeAvProducedFileCollection {
  status: "available" | "missing" | "save-failed";
  producedFile?: NativeAvArtifactProducedFileDescriptor;
  reason?: string;
}

type H3ArtifactTask = GenerationQueueTask | ExtensionQueueTask | UpscaleQueueTask;

export function nativeAvArtifactMetadataForTask(
  task: H3ArtifactTask,
  outputDirectory: string,
  createdAt: string
): NativeAvArtifactMetadata {
  const assets = miniMaxH3ModelAssetNames(task.modelId);
  if (!assets) throw new Error(`H3 AV artifact 缺少 ${task.modelId} 的模型资产映射。`);
  if (!task.h3VideoVaeMode) throw new Error("H3 AV artifact 缺少已解析的视频 VAE backend。" );
  const h3Upscale = task.taskType === "upscale" && task.upscaleMode === "h3-native"
    ? task.h3NativeInput
    : undefined;
  if (task.taskType === "upscale" && !h3Upscale) {
    throw new Error("普通 Upscale 任务不能提交 H3 JointAV artifact。");
  }
  const [width, height] = task.taskType === "upscale"
    ? upscaleOutputDimensions(task)
    : outputDimensions(task);
  const contextFrames = task.taskType === "extension" && (
    isMiniMaxH3R2vModel(task.modelId) || isMiniMaxH3ContinuumModel(task.modelId)
  ) ? 22 : 0;
  const frameCount = task.taskType === "upscale"
    ? h3Upscale!.artifact.frameCount
    : task.taskType === "extension" && isMiniMaxH3ContinuumModel(task.modelId)
      ? continuumSampledFrameCountForSeconds(task.duration)
    : generationFrameCountForTask(task) + contextFrames;
  const workflowId = task.workflowPath.replaceAll("\\", "/").split("/").pop() ?? task.workflowPath;
  return {
    outputDirectory,
    role: task.taskType === "extension" ? "extend-segment-clean-av" : "final-clean-av",
    lineageId: h3Upscale?.artifact.lineageId ?? task.id,
    ...(h3Upscale ? { derivedFromArtifactId: h3Upscale.artifact.artifactId } : {}),
    executionModelId: task.modelId,
    providerId: "comfyui",
    providerRevision: "runtime-managed",
    producerNodeId: "LocalVideoStudioH3SaveJointAV",
    producerNodeVersion: H3_AV_SERIALIZER_REVISION,
    workflowId,
    diffusionModelFilename: assets.diffusionModel,
    textEncoderFilename: assets.textEncoder,
    videoVaeFilename: h3VideoVaeFilename(task.h3VideoVaeMode),
    audioVaeFilename: "minimax_h3_audio_vae_fp32.safetensors",
    ...(h3Upscale
      ? {
          upscalerId: h3Upscale.provider === "learned-3d"
            ? "h3-latent-upscaler:learned-3d-second-sampling"
            : "h3-latent-upscaler:bilinear-second-sampling",
          upscalerRevision: h3Upscale.provider === "learned-3d"
            ? H3_LEARNED_UPSCALER_MODEL_REVISION
            : H3_LATENT_UPSCALER_REVISION
        }
      : {}),
    width,
    height,
    fps: 24,
    frameCount,
    contextFrames,
    workflowRevision: "bundled-runtime-v1",
    sourceTaskId: task.id,
    ...(task.taskType === "upscale"
      ? { sourceAssetId: task.sourceAssetId, sourceVersionId: task.sourceVersionId }
      : {}),
    createdAt
  };
}

/**
 * Reads the serializer descriptor from the completion returned for one
 * ComfyUI prompt. The binary payload remains in ComfyUI's output directory;
 * the committer performs the bounded header validation and streaming hash.
 */
export function collectNativeAvProducedFile(
  completion: unknown,
  expectedNodeId: string
): NativeAvProducedFileCollection {
  if (!expectedNodeId.trim()) {
    return {
      status: "save-failed",
      reason: "H3 AV serializer collector 缺少预期节点 ID。"
    };
  }
  const files = extractComfyNativeAvOutputFiles(completion, expectedNodeId);
  if (files.length === 0) {
    return {
      status: "missing",
      reason: "本次 ComfyUI prompt 的预期 H3 AV serializer 节点没有返回文件。"
    };
  }
  if (files.length !== 1) {
    return {
      status: "save-failed",
      reason: `H3 AV serializer 返回了 ${files.length} 个 payload，无法确定唯一 artifact。`
    };
  }
  const file = files[0]!;
  return {
    status: "available",
    producedFile: {
      filename: file.filename,
      subfolder: file.subfolder,
      type: "output",
      format: "safetensors"
    }
  };
}

export class H3NativeAvArtifactCollector {
  constructor(private readonly committer: NativeAvArtifactCommitter) {}

  async commitCompletion(
    completion: unknown,
    expectedNodeId: string,
    metadata: NativeAvArtifactMetadata
  ): Promise<NativeAvContinuationData> {
    const collection = collectNativeAvProducedFile(completion, expectedNodeId);
    if (!collection.producedFile) {
      return {
        status: collection.status,
        ...(collection.reason ? { reason: collection.reason } : {})
      };
    }
    const artifactId = /^h3av_([A-Za-z0-9][A-Za-z0-9_-]{7,127})\.safetensors$/i
      .exec(collection.producedFile.filename)?.[1];
    return this.committer.commitProducedFile({
      ...metadata,
      ...(artifactId ? { artifactId } : {}),
      producedFile: collection.producedFile
    });
  }
}
