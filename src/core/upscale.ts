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

export interface UpscaleResourceEstimateInput {
  modelId: "seedvr2" | "seedvr2-native-int8" | "flashvsr" | "realesrgan";
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
  const secondsMin = Math.max(
    1,
    Math.ceil(frameCount * profile.secondsPerFrameMin * resolutionFactor * internalScaleTime)
  );
  const secondsMax = Math.max(
    secondsMin,
    Math.ceil(frameCount * profile.secondsPerFrameMax * resolutionFactor * internalScaleTime)
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
  sourceVideo: string
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
    "2": {
      class_type: "GetVideoComponents",
      inputs: { video: ["1", 0] }
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
  objectInfo?: unknown
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
        : "请在设置 → 节点与工作流中更新 SeedVR2，并重启 ComfyUI。")
    );
  }
  if (task.modelId === "seedvr2-native-int8") {
    return renderNativeSeedVr2Workflow(task, sourceVideo);
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
