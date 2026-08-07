import type { UpscaleQueueTask, UpscaleRequest } from "../types.js";

type ApiNode = {
  class_type: string;
  inputs: Record<string, unknown>;
};

export interface UpscaleResourceEstimateInput {
  modelId: "seedvr2" | "flashvsr" | "realesrgan";
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
  const modernSeedVr2 = task.modelId === "seedvr2" &&
    availableNodes.has("SeedVR2VideoUpscaler") &&
    availableNodes.has("SeedVR2LoadDiTModel") &&
    availableNodes.has("SeedVR2LoadVAEModel");
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
  } else if (task.modelId === "seedvr2" && modernSeedVr2) {
    workflow["3"] = {
      class_type: "SeedVR2LoadDiTModel",
      inputs: {
        model: models.seedVr2,
        device: "cuda:0",
        blocks_to_swap: 20,
        swap_io_components: true,
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
        encode_tiled: false,
        decode_tiled: false
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
        batch_size: 5,
        uniform_batch_size: false,
        temporal_overlap: 0,
        prepend_frames: 0,
        color_correction: "wavelet",
        input_noise_scale: 0,
        latent_noise_scale: 0,
        offload_device: "cpu",
        enable_debug: false
      }
    };
    workflow["9"] = exactScaleNode(["5", 0], task);
  } else if (task.modelId === "seedvr2") {
    workflow["3"] = {
      class_type: "SeedVR2BlockSwap",
      inputs: {
        blocks_to_swap: 20,
        use_non_blocking: true,
        offload_io_components: true,
        cache_model: false,
        enable_debug: false
      }
    };
    workflow["4"] = {
      class_type: "SeedVR2",
      inputs: {
        images: ["1", 0],
        model: models.seedVr2,
        seed: task.seed,
        new_resolution: task.targetHeight,
        batch_size: 1,
        preserve_vram: true,
        block_swap_config: ["3", 0]
      }
    };
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

  if (task.modelId !== "seedvr2" || !modernSeedVr2) {
    workflow["5"] = exactScaleNode(["4", 0], task);
  }
  const finalImageNode = modernSeedVr2 ? ["9", 0] : ["5", 0];
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