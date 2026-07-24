import type { UpscaleQueueTask, UpscaleRequest } from "../types.js";

type ApiNode = {
  class_type: string;
  inputs: Record<string, unknown>;
};

export function upscaleDimensions(
  sourceWidth: number,
  sourceHeight: number,
  targetHeight: UpscaleRequest["targetHeight"]
): [number, UpscaleRequest["targetHeight"]] {
  const safeWidth = Math.max(1, sourceWidth);
  const safeHeight = Math.max(1, sourceHeight);
  const width = Math.max(
    16,
    Math.round((targetHeight * safeWidth) / safeHeight / 16) * 16
  );
  return [width, targetHeight];
}

export function createUpscaleFilename(
  sourceFilename: string,
  targetHeight: UpscaleRequest["targetHeight"]
): string {
  const suffix = targetHeight === 2160 ? "4K" : `${targetHeight}p`;
  const stem = sourceFilename
    .replace(/\.(mp4|webm|mov|m4v|mkv)$/i, "")
    .replace(/-(?:720p|1080p|1440p|4K)$/i, "");
  return `${stem}-${suffix}.mp4`;
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
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${stem}-${String(suffix).padStart(2, "0")}.mp4`;
    if (!existingNames.some((name) => name.toLowerCase() === candidate.toLowerCase())) {
      return candidate;
    }
  }
  return `${stem}-${Date.now()}.mp4`;
}

function loadVideoNode(sourceVideo: string): ApiNode {
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
      format: "AnimateDiff"
    }
  };
}

function exactScaleNode(image: unknown, task: UpscaleQueueTask): ApiNode {
  return {
    class_type: "ImageScale",
    inputs: {
      image,
      upscale_method: "lanczos",
      width: task.targetWidth,
      height: task.targetHeight,
      crop: "disabled"
    }
  };
}

function combineVideoNode(task: UpscaleQueueTask): ApiNode {
  return {
    class_type: "VHS_VideoCombine",
    inputs: {
      images: ["5", 0],
      frame_rate: task.fps,
      loop_count: 0,
      filename_prefix: task.outputFilename.replace(/\.mp4$/i, ""),
      format: "video/h264-mp4",
      pingpong: false,
      save_output: true,
      audio: ["1", 2]
    }
  };
}

export function renderUpscaleWorkflow(
  task: UpscaleQueueTask,
  sourceVideo: string,
  models: { seedVr2: string; realEsrgan: string }
): Record<string, ApiNode> {
  const workflow: Record<string, ApiNode> = {
    "1": loadVideoNode(sourceVideo),
    "2": {
      class_type: "VHS_VideoInfoSource",
      inputs: { video_info: ["1", 3] }
    },
    "6": combineVideoNode(task)
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
    if (task.tileMode === "safe") {
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
    }
    workflow["4"] = {
      class_type: "SeedVR2",
      inputs: {
        images: ["1", 0],
        model: models.seedVr2,
        seed: task.seed,
        new_resolution: task.targetHeight,
        batch_size: task.tileMode === "fast" ? 9 : task.tileMode === "safe" ? 1 : 5,
        preserve_vram: task.tileMode !== "fast",
        ...(task.tileMode === "safe" ? { block_swap_config: ["3", 0] } : {})
      }
    };
  } else if (task.modelId === "flashvsr") {
    workflow["4"] = {
      class_type: "AILab_FlashVSR",
      inputs: {
        frames: ["1", 0],
        preset: task.tileMode === "safe"
          ? "Long Video (Low VRAM)"
          : task.tileMode === "fast"
            ? "Fast (2x Speed)"
            : "Balanced (2x Quality)",
        scale: task.targetHeight >= task.sourceHeight * 3 ? 4 : 2,
        unload_model: true,
        seed: Math.max(1, task.seed),
        audio: ["1", 2]
      }
    };
  } else {
    throw new Error(`不支持的分辨率提升模型：${task.modelId}`);
  }

  workflow["5"] = exactScaleNode(["4", 0], task);
  return workflow;
}