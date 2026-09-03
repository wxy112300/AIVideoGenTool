import type { UpscaleQueueTask, UpscaleRequest } from "../types.js";
import {
  seedVr2NativeModelFilename,
  seedVr2NativeRequiredNodes,
  seedVr2NativeVaeFilename
} from "./seedvr2-native.js";

type ApiNode = {
  class_type: string;
  inputs: Record<string, unknown>;
};

export interface NativeSeedVr2Segment {
  index: number;
  startFrame: number;
  frameCount: number;
  startTime: number;
  duration: number;
}

export interface NativeSeedVr2SegmentPlan {
  planVersion: 2;
  framesPerSegment: number;
  totalFrames: number;
  targetWidth: number;
  targetHeight: number;
  systemMemoryTotalBytes?: number;
  systemMemoryAvailableBytes?: number;
  vramTotalBytes?: number | null;
  vramAvailableBytes?: number | null;
  preprocessingBudgetBytes: number;
  vramFrameLimit: number;
  segments: NativeSeedVr2Segment[];
}

export interface NativeSeedVr2ResourceSnapshot {
  systemMemoryTotalBytes: number;
  systemMemoryAvailableBytes: number;
  vramTotalBytes: number | null;
  vramAvailableBytes: number | null;
}

export interface NativeSeedVr2WorkflowSegment {
  startTime: number;
  duration: number;
}

export interface UpscaleResourceEstimateInput {
  modelId: "seedvr2" | "seedvr2-native-int8" | "flashvsr" | "realesrgan" | "minimax_h3_latent_upscaler";
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
  duration: number;
  fps: number;
}

export interface UpscaleResourceEstimate {
  frameCount: number;
  vramMinGb: number;
  vramMaxGb: number;
  secondsMin: number;
  secondsMax: number;
  internalScale: 2 | 4;
}

const upscaleEstimateProfiles = {
    minimax_h3_latent_upscaler: {
      baseVramMinGb: 21.5,
      baseVramMaxGb: 22.75,
      vramPerAreaMinGb: 0,
      vramPerAreaMaxGb: 0,
      secondsPerFrameMin: 9.5,
      secondsPerFrameMax: 12
    },
  realesrgan: {
    baseVramMinGb: 2.5,
    baseVramMaxGb: 4,
    vramPerAreaMinGb: 0.85,
    vramPerAreaMaxGb: 1.35,
    secondsPerFrameMin: 0.18,
    secondsPerFrameMax: 0.32
  },
  flashvsr: {
    baseVramMinGb: 6.5,
    baseVramMaxGb: 10,
    vramPerAreaMinGb: 0.55,
    vramPerAreaMaxGb: 0.95,
    secondsPerFrameMin: 0.32,
    secondsPerFrameMax: 0.55
  },
  seedvr2: {
    baseVramMinGb: 8.5,
    baseVramMaxGb: 13,
    vramPerAreaMinGb: 0.9,
    vramPerAreaMaxGb: 1.5,
    secondsPerFrameMin: 1.2,
    secondsPerFrameMax: 1.9
  },
  "seedvr2-native-int8": {
    // Initial estimate based on the published one-step INT8 profile. Recalibrate
    // after a local smoke run with the same source and output dimensions.
    baseVramMinGb: 10,
    baseVramMaxGb: 15,
    vramPerAreaMinGb: 0.65,
    vramPerAreaMaxGb: 1.15,
    secondsPerFrameMin: 0.9,
    secondsPerFrameMax: 1.6
  }
} as const;

function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

export function estimateUpscaleResources(
  input: UpscaleResourceEstimateInput
): UpscaleResourceEstimate {
  const profile = upscaleEstimateProfiles[input.modelId];
  const safeSourceShortEdge = Math.max(
    1,
    Math.min(Math.max(1, input.sourceWidth), Math.max(1, input.sourceHeight))
  );
  const targetShortEdge = Math.min(
    Math.max(1, input.targetWidth),
    Math.max(1, input.targetHeight)
  );
  const targetPixels = Math.max(1, input.targetWidth * input.targetHeight);
  const referencePixels = 1280 * 720;
  const areaFactor = Math.max(0.35, targetPixels / referencePixels);
  const resolutionFactor = Math.pow(areaFactor, 0.85);
  const frameCount = Math.max(
    1,
    Math.ceil(Math.max(0, input.duration) * Math.max(1, input.fps))
  );
  const internalScale: 2 | 4 = input.modelId === "flashvsr" &&
    targetShortEdge >= safeSourceShortEdge * 3
    ? 4
    : 2;
  const internalScaleVram = input.modelId === "flashvsr" && internalScale === 4
    ? 1.5
    : 0;
  const internalScaleTime = input.modelId === "flashvsr" && internalScale === 4
    ? 1.18
    : 1;
  const vramMinGb = roundHalf(
    profile.baseVramMinGb +
      areaFactor * profile.vramPerAreaMinGb +
      internalScaleVram
  );
  const vramMaxGb = Math.ceil(
    profile.baseVramMaxGb +
      areaFactor * profile.vramPerAreaMaxGb +
      internalScaleVram * 1.5
  );
  const h3Tiled1440 = input.modelId === "minimax_h3_latent_upscaler" &&
    targetShortEdge >= 1400;
  const timeResolutionFactor = input.modelId === "minimax_h3_latent_upscaler"
    ? h3Tiled1440 ? 1 : Math.max(0.35, targetShortEdge / 1440)
    : resolutionFactor;
  const secondsMin = Math.max(
    1,
    Math.ceil(frameCount * profile.secondsPerFrameMin * timeResolutionFactor * internalScaleTime)
  );
  const secondsMax = Math.max(
    secondsMin,
    Math.ceil(frameCount * profile.secondsPerFrameMax * timeResolutionFactor * internalScaleTime)
  );
  return {
    frameCount,
    vramMinGb,
    vramMaxGb,
    secondsMin,
    secondsMax,
    internalScale
  };
}

export function upscaleDimensions(
  sourceWidth: number,
  sourceHeight: number,
  targetShortEdge: UpscaleRequest["targetHeight"]
): [number, number] {
  const safeWidth = Math.max(1, sourceWidth);
  const safeHeight = Math.max(1, sourceHeight);
  const sourceShortEdge = Math.min(safeWidth, safeHeight);
  const sourceLongEdge = Math.max(safeWidth, safeHeight);
  if (sourceShortEdge === sourceLongEdge) {
    return [targetShortEdge, targetShortEdge];
  }
  const targetLongEdge = Math.max(
    16,
    Math.round((targetShortEdge * sourceLongEdge) / sourceShortEdge / 16) * 16
  );
  return safeWidth >= safeHeight
    ? [targetLongEdge, targetShortEdge]
    : [targetShortEdge, targetLongEdge];
}

function snapUpToEven(value: number): number {
  return Math.ceil(value / 2) * 2;
}

export function h3NativeUpscaleDimensions(
  sourceWidth: number,
  sourceHeight: number,
  targetShortEdge: 720 | 768 | 1080 | 1440
): [number, number] {
  const safeWidth = Math.max(32, Math.round(sourceWidth / 16) * 16);
  const safeHeight = Math.max(32, Math.round(sourceHeight / 16) * 16);
  const scaleBy = targetShortEdge / Math.min(safeWidth, safeHeight);
  const latentWidth = snapUpToEven(Math.round((safeWidth / 16) * scaleBy));
  const latentHeight = snapUpToEven(Math.round((safeHeight / 16) * scaleBy));
  return [latentWidth * 16, latentHeight * 16];
}

export function upscaleOutputDimensions(
  task: Pick<
    UpscaleQueueTask,
    "upscaleMode" | "sourceWidth" | "sourceHeight" | "targetWidth" | "targetHeight" | "targetOutputHeight"
  >
): [number, number] {
  if (task.targetOutputHeight && task.targetWidth) {
    return [task.targetWidth, task.targetOutputHeight];
  }
  return upscaleDimensions(task.sourceWidth, task.sourceHeight, task.targetHeight);
}

function seedVr2SegmentMemoryBudgetBytes(tileMode: UpscaleQueueTask["tileMode"]): number {
  // The native graph expands the IMAGE batch before VAE/latent chunking. Keep
  // that float RGB batch bounded even on machines with very large pagefiles;
  // the official latent auto-chunker then independently protects VRAM.
  const gib = tileMode === "safe" ? 4 : tileMode === "fast" ? 8 : 6;
  return gib * 1024 ** 3;
}

function seedVr2AdaptiveMemoryBudgetBytes(
  tileMode: UpscaleQueueTask["tileMode"],
  resources?: NativeSeedVr2ResourceSnapshot
): number {
  if (!resources || resources.systemMemoryAvailableBytes <= 0) {
    return seedVr2SegmentMemoryBudgetBytes(tileMode);
  }
  const reserveBytes = Math.max(
    8 * 1024 ** 3,
    resources.systemMemoryTotalBytes * 0.15
  );
  const availableAfterReserve = Math.max(
    1 * 1024 ** 3,
    resources.systemMemoryAvailableBytes - reserveBytes
  );
  const modeShare = tileMode === "safe" ? 0.45 : tileMode === "fast" ? 0.8 : 0.65;
  // ImageScale, SeedVR preprocessing, VAE input/output and video containers
  // coexist for part of the graph. Convert host headroom back to a raw float
  // RGB budget with a conservative measured working-set multiplier.
  return Math.max(
    1 * 1024 ** 3,
    availableAfterReserve * modeShare / 2.75
  );
}

function seedVr2VramFrameLimit(
  targetPixels: number,
  resources?: NativeSeedVr2ResourceSnapshot
): number {
  if (!resources?.vramAvailableBytes || resources.vramAvailableBytes <= 0) {
    return Number.MAX_SAFE_INTEGER;
  }
  const availableGib = resources.vramAvailableBytes / 1024 ** 3;
  const megapixels = Math.max(0.1, targetPixels / 1e6);
  // Mirrors the native core's published auto-chunk activation law. This is a
  // diagnostic for one internal chunk; the native node owns this VRAM limit.
  const reservedGib = 8.5 + 4 * 0.55;
  const latentFrames = Math.max(
    1,
    Math.floor(Math.max(0.55, availableGib - reservedGib) / (0.55 * megapixels))
  );
  const pixelFramesPerInternalChunk = Math.max(1, 4 * (latentFrames - 1) + 1);
  return seedVr2CompatibleFrameCount(pixelFramesPerInternalChunk);
}

function seedVr2CompatibleFrameCount(value: number): number {
  const bounded = Math.max(5, Math.floor(value));
  return Math.max(5, Math.floor((bounded - 1) / 4) * 4 + 1);
}

export function nativeSeedVr2SegmentPlan(
  task: Pick<
    UpscaleQueueTask,
    "modelId" | "sourceWidth" | "sourceHeight" | "targetHeight" | "duration" | "fps" | "tileMode"
  >,
  resources?: NativeSeedVr2ResourceSnapshot,
  preferredFramesPerSegment?: number
): NativeSeedVr2SegmentPlan | null {
  if (task.modelId !== "seedvr2-native-int8") return null;
  const fps = Math.max(1, task.fps);
  const totalFrames = Math.max(1, Math.ceil(Math.max(0, task.duration) * fps));
  const [targetWidth, targetHeight] = upscaleDimensions(
    task.sourceWidth,
    task.sourceHeight,
    task.targetHeight
  );
  const bytesPerFloatRgbFrame = targetWidth * targetHeight * 3 * 4;
  const preprocessingBudgetBytes = seedVr2AdaptiveMemoryBudgetBytes(task.tileMode, resources);
  const memoryFrameLimit = seedVr2CompatibleFrameCount(Math.floor(
    preprocessingBudgetBytes / Math.max(1, bytesPerFloatRgbFrame)
  ));
  const vramFrameLimit = seedVr2VramFrameLimit(
    targetWidth * targetHeight,
    resources
  );
  const framesPerSegment = seedVr2CompatibleFrameCount(
    preferredFramesPerSegment ?? memoryFrameLimit
  );
  if (totalFrames <= framesPerSegment) return null;
  const segments: NativeSeedVr2Segment[] = [];
  for (let startFrame = 0; startFrame < totalFrames; startFrame += framesPerSegment) {
    const frameCount = Math.min(framesPerSegment, totalFrames - startFrame);
    segments.push({
      index: segments.length,
      startFrame,
      frameCount,
      startTime: startFrame / fps,
      duration: frameCount / fps
    });
  }
  return {
    planVersion: 2,
    framesPerSegment,
    totalFrames,
    targetWidth,
    targetHeight,
    ...(resources
      ? {
          systemMemoryTotalBytes: resources.systemMemoryTotalBytes,
          systemMemoryAvailableBytes: resources.systemMemoryAvailableBytes,
          vramTotalBytes: resources.vramTotalBytes,
          vramAvailableBytes: resources.vramAvailableBytes
        }
      : {}),
    preprocessingBudgetBytes,
    vramFrameLimit,
    segments
  };
}

export function createUpscaleFilename(
  sourceFilename: string,
  targetHeight: UpscaleRequest["targetHeight"]
): string {
  const suffix = targetHeight === 2160 ? "4K" : `${targetHeight}p`;
  const stem = sourceFilename
    .replace(/\.(mp4|webm|mov|m4v|mkv)$/i, "")
    .replace(/-(?:720p|1080p|1440p|4K)$/i, "");
  const metadata = stem.match(
    /^(.*?)-(?:\d+p|4K)-(\d+(?:\.\d+)?s)-(\d{8}-\d{6})(?:-v\d+)?$/i
  );
  const base = metadata
    ? `${metadata[1]}-${suffix}-${metadata[2]}-${metadata[3]}`
    : `${stem}-${suffix}`;
  return `${base}-v01.mp4`;
}

export function uniqueUpscaleFilename(
  sourceFilename: string,
  targetHeight: UpscaleRequest["targetHeight"],
  existingNames: string[]
): string {
  const base = createUpscaleFilename(sourceFilename, targetHeight);
  if (!existingNames.some((name) => name.toLowerCase() === base.toLowerCase())) {
    return base;
  }
  const stem = base.replace(/\.mp4$/i, "");
  for (let version = 2; version < 1000; version += 1) {
    const candidate = `${stem.replace(/-v\d+$/i, "")}-v${String(version).padStart(2, "0")}.mp4`;
    if (!existingNames.some((name) => name.toLowerCase() === candidate.toLowerCase())) {
      return candidate;
    }
  }
  return `${stem}-${Date.now()}.mp4`;
}

function loadVideoNode(sourceVideo: string, useExternalBatching: boolean): ApiNode {
  return {
    class_type: "VHS_LoadVideo",
    inputs: {
      video: sourceVideo,
      force_rate: 0,
      custom_width: 0,
      custom_height: 0,
      frame_load_cap: 0,
      skip_first_frames: 0,
      select_every_nth: 1,
      format: "AnimateDiff",
      ...(useExternalBatching ? { meta_batch: ["7", 0] } : {})
    }
  };
}

function exactScaleNode(image: unknown, task: UpscaleQueueTask): ApiNode {
  const [targetWidth, targetHeight] = upscaleDimensions(
    task.sourceWidth,
    task.sourceHeight,
    task.targetHeight
  );
  return {
    class_type: "ImageScale",
    inputs: {
      image,
      upscale_method: "lanczos",
      width: targetWidth,
      height: targetHeight,
      crop: "disabled"
    }
  };
}

function combineVideoNode(
  task: UpscaleQueueTask,
  useExternalBatching: boolean
): ApiNode {
  return {
    class_type: "VHS_VideoCombine",
    inputs: {
      images: ["8", 1],
      frame_rate: task.fps,
      loop_count: 0,
      filename_prefix: task.outputFilename.replace(/\.mp4$/i, ""),
      format: "video/h264-mp4",
      pingpong: false,
      save_output: true,
      audio: ["1", 2],
      ...(useExternalBatching ? { meta_batch: ["7", 0] } : {})
    }
  };
}

const seedVr2RequiredNodes = [
  "SeedVR2VideoUpscaler",
  "SeedVR2LoadDiTModel",
  "SeedVR2LoadVAEModel"
] as const;

function renderNativeSeedVr2Workflow(
  task: UpscaleQueueTask,
  sourceVideo: string,
  segment?: NativeSeedVr2WorkflowSegment
): Record<string, ApiNode> {
  const [targetWidth, targetHeight] = upscaleDimensions(
    task.sourceWidth,
    task.sourceHeight,
    task.targetHeight
  );
  return {
    "1": {
      class_type: "LoadVideo",
      inputs: { file: sourceVideo }
    },
    ...(segment
      ? {
          "video-slice": {
            class_type: "Video Slice",
            inputs: {
              video: ["1", 0],
              start_time: segment.startTime,
              duration: segment.duration,
              strict_duration: false
            }
          }
        }
      : {}),
    "2": {
      class_type: "GetVideoComponents",
      inputs: { video: [segment ? "video-slice" : "1", 0] }
    },
    "3": {
      class_type: "ImageScale",
      inputs: {
        image: ["2", 0],
        upscale_method: "lanczos",
        width: targetWidth,
        height: targetHeight,
        crop: "center"
      }
    },
    "4": {
      class_type: "SeedVR2Preprocess",
      inputs: { resized_images: ["3", 0] }
    },
    "5": {
      class_type: "VAELoader",
      inputs: { vae_name: seedVr2NativeVaeFilename }
    },
    "6": {
      class_type: "VAEEncodeTiled",
      inputs: {
        pixels: ["4", 0],
        vae: ["5", 0],
        tile_size: 512,
        overlap: 128,
        temporal_size: 64,
        temporal_overlap: 8
      }
    },
    "7": {
      class_type: "UNETLoader",
      inputs: {
        unet_name: seedVr2NativeModelFilename,
        weight_dtype: "default"
      }
    },
    "8": {
      class_type: "SeedVR2TemporalChunk",
      inputs: {
        latent: ["6", 0],
        temporal_overlap: 0,
        chunking_mode: "auto"
      }
    },
    "9": {
      class_type: "SeedVR2Conditioning",
      inputs: {
        model: ["7", 0],
        vae_conditioning: ["8", 0]
      }
    },
    "10": {
      class_type: "KSampler",
      inputs: {
        model: ["7", 0],
        seed: task.seed,
        steps: 1,
        cfg: 1,
        sampler_name: "euler",
        scheduler: "simple",
        positive: ["9", 0],
        negative: ["9", 1],
        latent_image: ["8", 0],
        denoise: 1
      }
    },
    "11": {
      class_type: "SeedVR2TemporalMerge",
      inputs: {
        latents: ["10", 0],
        temporal_overlap: ["8", 1]
      }
    },
    "12": {
      class_type: "VAEDecodeTiled",
      inputs: {
        samples: ["11", 0],
        vae: ["5", 0],
        tile_size: 512,
        overlap: 128,
        temporal_size: 64,
        temporal_overlap: 8
      }
    },
    "13": {
      class_type: "SeedVR2PostProcessing",
      inputs: {
        images: ["12", 0],
        original_resized_images: ["3", 0],
        color_correction_method: "none"
      }
    },
    "14": {
      class_type: "CreateVideo",
      inputs: {
        images: ["13", 0],
        audio: ["2", 1],
        fps: ["2", 2],
        bit_depth: ["2", 3]
      }
    },
    "15": {
      class_type: "SaveVideo",
      inputs: {
        video: ["14", 0],
        filename_prefix: task.outputFilename.replace(/\.mp4$/i, ""),
        format: "mp4",
        codec: "auto"
      }
    }
  };
}

function seedVr2Profile(task: UpscaleQueueTask): {
  batchSize: number;
  blocksToSwap: number;
  swapIoComponents: boolean;
  tiledVae: boolean;
} {
  const highResolution = task.targetHeight >= 1440;
  const ultraHighResolution = task.targetHeight >= 2160;
  if (task.tileMode === "safe") {
    return {
      batchSize: 9,
      blocksToSwap: ultraHighResolution ? 24 : 16,
      swapIoComponents: true,
      tiledVae: highResolution
    };
  }
  if (task.tileMode === "fast") {
    return {
      batchSize: ultraHighResolution ? 13 : highResolution ? 21 : 33,
      blocksToSwap: ultraHighResolution ? 12 : 0,
      swapIoComponents: ultraHighResolution,
      tiledVae: ultraHighResolution
    };
  }
  return {
    batchSize: ultraHighResolution ? 9 : highResolution ? 13 : 21,
    blocksToSwap: ultraHighResolution ? 20 : highResolution ? 8 : 0,
    swapIoComponents: highResolution,
    tiledVae: highResolution
  };
}

export function renderUpscaleWorkflow(
  task: UpscaleQueueTask,
  sourceVideo: string,
  models: { seedVr2: string; realEsrgan: string },
  objectInfo?: unknown,
  nativeSeedVr2Segment?: NativeSeedVr2WorkflowSegment
): Record<string, ApiNode> {
  const sourceShortEdge = Math.max(1, Math.min(task.sourceWidth, task.sourceHeight));
  const availableNodes = objectInfo && typeof objectInfo === "object" && !Array.isArray(objectInfo)
    ? new Set(Object.keys(objectInfo as Record<string, unknown>))
    : new Set<string>();
  const requiredSeedVr2Nodes = task.modelId === "seedvr2-native-int8"
    ? seedVr2NativeRequiredNodes
    : task.modelId === "seedvr2"
      ? seedVr2RequiredNodes
      : [];
  const missingSeedVr2Nodes = requiredSeedVr2Nodes.filter((node) => !availableNodes.has(node));
  if (missingSeedVr2Nodes.length) {
    const nodeLabel = task.modelId === "seedvr2-native-int8"
      ? "原生 SeedVR2 节点"
      : "SeedVR2 节点模块";
    throw new Error(
      `${nodeLabel}版本过旧或尚未加载，缺少：${missingSeedVr2Nodes.join(", ")}。` +
      (task.modelId === "seedvr2-native-int8"
        ? "请升级到支持原生 SeedVR2 工作流的 ComfyUI 核心后重启并复检。"
        : "请在设置 → 节点与依赖中更新 SeedVR2，并重启 ComfyUI。")
    );
  }
  if (task.modelId === "seedvr2-native-int8") {
    return renderNativeSeedVr2Workflow(task, sourceVideo, nativeSeedVr2Segment);
  }
  const modernSeedVr2 = task.modelId === "seedvr2";
  const useExternalBatching = !modernSeedVr2;
  const workflow: Record<string, ApiNode> = {
    "1": loadVideoNode(sourceVideo, useExternalBatching),
    "2": {
      class_type: "VHS_VideoInfoSource",
      inputs: { video_info: ["1", 3] }
    },
    "6": combineVideoNode(task, useExternalBatching),
    ...(useExternalBatching
      ? {
          "7": {
            class_type: "VHS_BatchManager",
            inputs: {
              frames_per_batch: task.modelId === "realesrgan"
                ? 1
                : task.modelId === "seedvr2"
                  ? 5
                  : 16
            }
          }
        }
      : {})
  };

  if (task.modelId === "realesrgan") {
    workflow["3"] = {
      class_type: "UpscaleModelLoader",
      inputs: { model_name: models.realEsrgan }
    };
    workflow["4"] = {
      class_type: "ImageUpscaleWithModel",
      inputs: { upscale_model: ["3", 0], image: ["1", 0] }
    };
  } else if (task.modelId === "seedvr2") {
    const profile = seedVr2Profile(task);
    workflow["3"] = {
      class_type: "SeedVR2LoadDiTModel",
      inputs: {
        model: models.seedVr2,
        device: "cuda:0",
        blocks_to_swap: profile.blocksToSwap,
        swap_io_components: profile.swapIoComponents,
        offload_device: "cpu",
        cache_model: false,
        attention_mode: "sdpa"
      }
    };
    workflow["4"] = {
      class_type: "SeedVR2LoadVAEModel",
      inputs: {
        model: "ema_vae_fp16.safetensors",
        device: "cuda:0",
        offload_device: "cpu",
        cache_model: false,
        encode_tiled: profile.tiledVae,
        encode_tile_size: 1024,
        encode_tile_overlap: 128,
        decode_tiled: profile.tiledVae,
        decode_tile_size: 1024,
        decode_tile_overlap: 128,
        tile_debug: "false"
      }
    };
    workflow["5"] = {
      class_type: "SeedVR2VideoUpscaler",
      inputs: {
        image: ["1", 0],
        dit: ["3", 0],
        vae: ["4", 0],
        seed: task.seed,
        resolution: task.targetHeight,
        max_resolution: 0,
        batch_size: profile.batchSize,
        uniform_batch_size: true,
        temporal_overlap: 3,
        prepend_frames: 4,
        color_correction: "lab",
        input_noise_scale: 0,
        latent_noise_scale: 0,
        offload_device: "cpu",
        enable_debug: false
      }
    };
    workflow["9"] = exactScaleNode(["5", 0], task);
  } else if (task.modelId === "flashvsr") {
    workflow["4"] = {
      class_type: "AILab_FlashVSR",
      inputs: {
        frames: ["1", 0],
        preset: "Long Video (Low VRAM)",
        scale: task.targetHeight >= sourceShortEdge * 3 ? 4 : 2,
        unload_model: true,
        seed: Math.max(1, task.seed),
        audio: ["1", 2]
      }
    };
  } else {
    throw new Error(`不支持的分辨率提升模型：${task.modelId}`);
  }

  if (task.modelId !== "seedvr2") {
    workflow["5"] = exactScaleNode(["4", 0], task);
  }
  const finalImageNode = task.modelId === "seedvr2" ? ["9", 0] : ["5", 0];
  workflow["8"] = {
    class_type: "VRAM_Debug",
    inputs: {
      empty_cache: true,
      gc_collect: true,
      unload_all_models: true,
      image_pass: finalImageNode
    }
  };
  return workflow;
}
