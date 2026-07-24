import type { GenerationQueueTask } from "../types.js";

export interface WorkflowContext {
  inputImage: string;
  endImage: string;
  width: number;
  height: number;
  frames: number;
  fps: number;
}

export interface WorkflowValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  placeholders: string[];
  nodeCount: number;
}

export interface GenerationSafety {
  safe: boolean;
  generatedFrames: number;
  maxGeneratedFrames: number;
  maxDurationSeconds: number;
  message: string;
}

interface GenerationSafetyProfile {
  label: string;
  maxGeneratedFrames: number;
  maxDurationSeconds: number;
}

function generationSafetyProfileForModel(
  modelId: string
): GenerationSafetyProfile {
  if (modelId === "wan22_5b") {
    return {
      label: "Wan 2.2 TI2V-5B",
      maxGeneratedFrames: 121,
      maxDurationSeconds: 10
    };
  }
  if (modelId.startsWith("wan22_")) {
    return {
      label: "Wan 2.2 14B",
      maxGeneratedFrames: 81,
      maxDurationSeconds: 10
    };
  }
  if (modelId.startsWith("hunyuan15")) {
    return {
      label: "HunyuanVideo 1.5",
      maxGeneratedFrames: 121,
      maxDurationSeconds: 10
    };
  }
  if (modelId === "sulphur2") {
    return {
      label: "Sulphur 2 / LTX 2.3",
      maxGeneratedFrames: 121,
      maxDurationSeconds: 10
    };
  }
  return {
    label: "当前模型",
    maxGeneratedFrames: 81,
    maxDurationSeconds: 10
  };
}

export function workflowSupportsEndImage(source: unknown): boolean {
  return JSON.stringify(source).includes("{{END_IMAGE}}");
}

function frameIntervalForModel(modelId: string): 1 | 4 | 8 {
  if (modelId === "sulphur2") return 8;
  if (modelId.startsWith("wan22_") || modelId.startsWith("hunyuan15")) return 4;
  return 1;
}

export function frameCountForTask(
  task: Pick<GenerationQueueTask, "modelId" | "duration">,
  fps: number
): number {
  const requested = Math.max(1, Math.round(task.duration * fps));
  const interval = frameIntervalForModel(task.modelId);
  return Math.max(1, Math.round((requested - 1) / interval) * interval + 1);
}

export function frameInterpolationMultiplier(
  task: Pick<GenerationQueueTask, "frameInterpolation">
): 1 | 2 | 4 {
  if (task.frameInterpolation === "rife2x") return 2;
  if (task.frameInterpolation === "rife4x") return 4;
  return 1;
}

export function outputFrameCountForTask(
  task: Pick<GenerationQueueTask, "duration" | "fps">
): number {
  return Math.max(1, Math.round(task.duration * task.fps));
}

export function generationFrameCountForTask(
  task: Pick<
    GenerationQueueTask,
    "modelId" | "duration" | "fps" | "frameInterpolation"
  >
): number {
  const multiplier = frameInterpolationMultiplier(task);
  if (multiplier === 1) return frameCountForTask(task, task.fps);
  const requiredSourceFrames =
    Math.ceil((outputFrameCountForTask(task) - 1) / multiplier) + 1;
  const interval = frameIntervalForModel(task.modelId);
  return Math.max(
    1,
    Math.ceil((requiredSourceFrames - 1) / interval) * interval + 1
  );
}

export function generationSafetyForTask(
  task: Pick<
    GenerationQueueTask,
    "modelId" | "duration" | "fps" | "frameInterpolation"
  >
): GenerationSafety {
  const profile = generationSafetyProfileForModel(task.modelId);
  const { maxDurationSeconds, maxGeneratedFrames } = profile;
  if (
    !Number.isFinite(task.duration) ||
    !Number.isFinite(task.fps) ||
    task.duration <= 0 ||
    task.fps <= 0
  ) {
    return {
      safe: false,
      generatedFrames: 0,
      maxGeneratedFrames,
      maxDurationSeconds,
      message: "时长和帧率必须是大于 0 的有效数字。"
    };
  }
  const generatedFrames = generationFrameCountForTask(task);
  if (task.duration > maxDurationSeconds) {
    return {
      safe: false,
      generatedFrames,
      maxGeneratedFrames,
      maxDurationSeconds,
      message: `当前单段输出最长 ${maxDurationSeconds} 秒；更长视频需要插帧、续写或分段生成。`
    };
  }
  if (generatedFrames > maxGeneratedFrames) {
    return {
      safe: false,
      generatedFrames,
      maxGeneratedFrames,
      maxDurationSeconds,
      message: `当前组合需要生成 ${generatedFrames} 个模型帧，${profile.label} 的当前验证预算是 ${maxGeneratedFrames} 帧。请降低输出 FPS、启用 RIFE，或等待更高帧数实测通过。`
    };
  }
  return {
    safe: true,
    generatedFrames,
    maxGeneratedFrames,
    maxDurationSeconds,
    message: `${profile.label} 模型帧预算：${generatedFrames}/${maxGeneratedFrames}。`
  };
}

const wan14ModelAssets: Record<
  string,
  { high: string; low: string; textEncoder: string; vae: string }
> = {
  wan22_14b_nsfw: {
    high: "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors",
    low: "wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors",
    textEncoder: "nsfw_wan_umt5-xxl_fp8_scaled.safetensors",
    vae: "wan_2.1_vae.safetensors"
  },
  wan22_remix: {
    high: "wan22RemixT2VI2V_i2vHighV30-Q5_K_M.gguf",
    low: "wan22RemixT2VI2V_i2vLowV30-Q5_K_M.gguf",
    textEncoder: "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
    vae: "wan_2.1_vae.safetensors"
  },
  wan22_smoothmix: {
    high: "smoothMixWan22I2VT2V_i2vHigh-Q5_K_M.gguf",
    low: "smoothMixWan22I2VT2V_i2vLow-Q5_K_M.gguf",
    textEncoder: "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
    vae: "wan_2.1_vae.safetensors"
  },
  wan22_dasiwa: {
    high: "DasiwaWAN22I2V14BSynthseduction_q4High.gguf",
    low: "DasiwaWAN22I2V14BSynthseduction_q4Low.gguf",
    textEncoder: "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
    vae: "wan_2.1_vae.safetensors"
  }
};

export function missingWorkflowNodeTypes(
  source: unknown,
  objectInfo: unknown
): string[] {
  if (!source || typeof source !== "object" || Array.isArray(source)) return [];
  if (!objectInfo || typeof objectInfo !== "object" || Array.isArray(objectInfo)) {
    return [];
  }
  const available = new Set(Object.keys(objectInfo as Record<string, unknown>));
  return [
    ...new Set(
      Object.values(source as Record<string, unknown>)
        .map((node) =>
          node && typeof node === "object" && !Array.isArray(node)
            ? (node as Record<string, unknown>).class_type
            : undefined
        )
        .filter((value): value is string => typeof value === "string")
        .filter((value) => !available.has(value))
    )
  ].sort();
}

const ratios: Record<string, [number, number]> = {
  "16:9": [16, 9],
  "9:16": [9, 16],
  "1:1": [1, 1],
  "4:3": [4, 3],
  source: [16, 9]
};

function baseGenerationDimensions(task: GenerationQueueTask): [number, number] {
  const [rw, rh] =
    task.ratio === "source" && task.sourceWidth > 0 && task.sourceHeight > 0
      ? [task.sourceWidth, task.sourceHeight]
      : ratios[task.ratio] ?? ratios.source!;
  const height = Math.max(64, Math.round(task.resolution / 16) * 16);
  const width = Math.max(64, Math.round((height * rw) / rh / 16) * 16);
  const maxWidth = Math.max(
    64,
    Math.round((task.resolution * 16) / 9 / 16) * 16
  );
  if (width <= maxWidth) return [width, height];
  return [
    maxWidth,
    Math.max(64, Math.round((height * maxWidth) / width / 16) * 16)
  ];
}

export function outputDimensions(task: GenerationQueueTask): [number, number] {
  const [width, height] = baseGenerationDimensions(task);
  if (task.modelId !== "hunyuan15_sr") return [width, height];
  return [
    Math.max(64, Math.round((width * 1.5) / 8) * 8),
    Math.max(64, Math.round((height * 1.5) / 8) * 8)
  ];
}

export function renderWorkflow(
  source: unknown,
  task: GenerationQueueTask,
  context: Partial<WorkflowContext> = {}
): unknown {
  const [width, height] = outputDimensions(task);
  const [baseWidth, baseHeight] = baseGenerationDimensions(task);
  const outputWidth = context.width ?? width;
  const outputHeight = context.height ?? height;
  const fps = context.fps ?? task.fps ?? 8;
  const modelAssets = wan14ModelAssets[task.modelId];
  const interpolationMultiplier = frameInterpolationMultiplier(task);
  const tokens: Record<string, string | number> = {
    PROMPT: task.prompt,
    NEGATIVE_PROMPT: "",
    SEED: task.seed,
    INPUT_IMAGE: context.inputImage ?? "",
    END_IMAGE: context.endImage ?? "",
    WIDTH: outputWidth,
    HEIGHT: outputHeight,
    BASE_WIDTH: baseWidth,
    BASE_HEIGHT: baseHeight,
    DURATION: task.duration,
    FPS: fps,
    SOURCE_FPS: fps / interpolationMultiplier,
    FRAMES: context.frames ?? generationFrameCountForTask(task),
    OUTPUT_FRAMES: outputFrameCountForTask(task),
    OUTPUT_FILENAME: task.outputFilename.replace(/\.mp4$/i, ""),
    HIGH_MODEL: modelAssets?.high ?? "",
    LOW_MODEL: modelAssets?.low ?? "",
    TEXT_ENCODER: modelAssets?.textEncoder ?? "",
    VAE_MODEL: modelAssets?.vae ?? "",
    HALF_WIDTH: Math.max(16, Math.round(outputWidth / 2 / 16) * 16),
    HALF_HEIGHT: Math.max(16, Math.round(outputHeight / 2 / 16) * 16),
    SULPHUR_MODEL: "sulphur_dev_fp8mixed.safetensors",
    LTX_TEXT_ENCODER: "gemma_3_12B_it_fp4_mixed.safetensors",
    LTX_DISTILL_LORA:
      "ltx-2.3-22b-distilled-lora-1.1_fro90_ceil72_condsafe.safetensors",
    LTX_UPSCALER: "ltx-2.3-spatial-upscaler-x2-1.0.safetensors"
  };

  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, child]) => [
          key,
          visit(child)
        ])
      );
    }
    if (typeof value !== "string") return value;
    const exact = value.match(/^\{\{([A-Z_]+)\}\}$/);
    if (exact?.[1] && exact[1] in tokens) return tokens[exact[1]];
    return value.replace(/\{\{([A-Z_]+)\}\}/g, (match, key: string) =>
      key in tokens ? String(tokens[key]) : match
    );
  };

  const rendered = visit(source);
  if (
    !rendered ||
    typeof rendered !== "object" ||
    Array.isArray(rendered)
  ) {
    return rendered;
  }

  const workflow = rendered as Record<
    string,
    { class_type?: string; inputs?: Record<string, unknown> }
  >;
  let nextNodeId =
    Math.max(
      0,
      ...Object.keys(workflow).map((id) => Number.parseInt(id, 10) || 0)
    ) + 1;
  const isUnloadConnection = (value: unknown): boolean => {
    if (!Array.isArray(value) || typeof value[0] !== "string") return false;
    const upstream = workflow[value[0]];
    return (
      upstream?.class_type === "VRAM_Debug" &&
      upstream.inputs?.unload_all_models === true
    );
  };

  for (const node of Object.values(workflow)) {
    if (!node.inputs || !node.class_type?.includes("VAEDecode")) continue;
    if (node.class_type === "VAEDecode") {
      node.class_type = "VAEDecodeTiled";
      Object.assign(node.inputs, {
        tile_size: 256,
        overlap: 32,
        temporal_size: 16,
        temporal_overlap: 4
      });
    }
    const samples = node.inputs.samples;
    if (!Array.isArray(samples) || isUnloadConnection(samples)) continue;
    const unloadId = String(nextNodeId++);
    workflow[unloadId] = {
      class_type: "VRAM_Debug",
      inputs: {
        empty_cache: true,
        gc_collect: true,
        unload_all_models: true,
        any_input: samples
      }
    };
    node.inputs.samples = [unloadId, 0];
  }

  for (const node of Object.values(workflow)) {
    if (node.class_type !== "CreateVideo" || !node.inputs) continue;
    let decodedImages = node.inputs.images;
    if (!Array.isArray(decodedImages)) continue;
    if (!isUnloadConnection(decodedImages)) {
      const unloadId = String(nextNodeId++);
      workflow[unloadId] = {
        class_type: "VRAM_Debug",
        inputs: {
          empty_cache: true,
          gc_collect: true,
          unload_all_models: true,
          image_pass: decodedImages
        }
      };
      decodedImages = [unloadId, 1];
      node.inputs.images = decodedImages;
    }
    if (interpolationMultiplier === 1) continue;
    const interpolateId = String(nextNodeId++);
    const trimId = String(nextNodeId++);
    workflow[interpolateId] = {
      class_type: "RIFE VFI",
      inputs: {
        ckpt_name: "rife47.pth",
        frames: decodedImages,
        clear_cache_after_n_frames: 1,
        multiplier: interpolationMultiplier,
        fast_mode: true,
        ensemble: false,
        scale_factor: 1,
        dtype: "bfloat16",
        torch_compile: false,
        batch_size: 1
      }
    };
    workflow[trimId] = {
      class_type: "ImageFromBatch",
      inputs: {
        image: [interpolateId, 0],
        batch_index: 0,
        length: outputFrameCountForTask(task)
      }
    };
    node.inputs.images = [trimId, 0];
  }
  return workflow;
}

export function validateApiWorkflow(source: unknown): WorkflowValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const placeholders = new Set<string>();
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return {
      valid: false,
      errors: ["工作流根节点必须是 ComfyUI API 格式的对象"],
      warnings,
      placeholders: [],
      nodeCount: 0
    };
  }

  const entries = Object.entries(source as Record<string, unknown>);
  if (Array.isArray((source as Record<string, unknown>).nodes)) {
    errors.push("检测到普通 UI workflow；请使用 Export Workflow (API) 导出");
  }
  if (entries.length === 0) errors.push("工作流没有节点");
  for (const [nodeId, value] of entries) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`节点 ${nodeId} 不是对象`);
      continue;
    }
    const node = value as Record<string, unknown>;
    if (typeof node.class_type !== "string" || !node.class_type) {
      errors.push(`节点 ${nodeId} 缺少 class_type；可能导出了普通 UI workflow`);
    }
    if (!node.inputs || typeof node.inputs !== "object" || Array.isArray(node.inputs)) {
      errors.push(`节点 ${nodeId} 缺少 inputs`);
    }
  }

  const serialized = JSON.stringify(source);
  for (const match of serialized.matchAll(/\{\{([A-Z_]+)\}\}/g)) {
    if (match[1]) placeholders.add(match[1]);
  }
  if (!placeholders.has("PROMPT")) {
    errors.push("缺少 {{PROMPT}}，GUI 无法注入当前提示词");
  }
  if (!placeholders.has("INPUT_IMAGE")) {
    errors.push("缺少 {{INPUT_IMAGE}}，GUI 无法注入首帧");
  }
  if (!placeholders.has("SEED")) warnings.push("缺少 {{SEED}}，任务 Seed 不会传入工作流");
  if (!placeholders.has("OUTPUT_FILENAME")) {
    warnings.push("缺少 {{OUTPUT_FILENAME}}，ComfyUI 将自行决定输出文件名");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    placeholders: [...placeholders].sort(),
    nodeCount: entries.length
  };
}
