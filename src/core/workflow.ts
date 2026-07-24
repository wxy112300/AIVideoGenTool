import type { QueueTask } from "../types.js";

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

export function frameCountForTask(task: QueueTask, fps: number): number {
  const requested = Math.max(1, Math.round(task.duration * fps));
  if (!task.modelId.startsWith("wan22_") && task.modelId !== "hunyuan15") {
    return requested;
  }
  return Math.max(1, Math.round((requested - 1) / 4) * 4 + 1);
}

export function frameInterpolationMultiplier(task: QueueTask): 1 | 2 | 4 {
  if (task.frameInterpolation === "rife2x") return 2;
  if (task.frameInterpolation === "rife4x") return 4;
  return 1;
}

export function outputFrameCountForTask(task: QueueTask): number {
  return Math.max(1, Math.round(task.duration * task.fps));
}

export function generationFrameCountForTask(task: QueueTask): number {
  const multiplier = frameInterpolationMultiplier(task);
  if (multiplier === 1) return frameCountForTask(task, task.fps);
  const requiredSourceFrames =
    Math.ceil((outputFrameCountForTask(task) - 1) / multiplier) + 1;
  if (!task.modelId.startsWith("wan22_") && task.modelId !== "hunyuan15") {
    return requiredSourceFrames;
  }
  return Math.max(1, Math.ceil((requiredSourceFrames - 1) / 4) * 4 + 1);
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

export function outputDimensions(task: QueueTask): [number, number] {
  const [rw, rh] = ratios[task.ratio] ?? ratios.source!;
  const height = Math.max(64, Math.round(task.resolution / 16) * 16);
  const width = Math.max(64, Math.round((height * rw) / rh / 16) * 16);
  return [width, height];
}

export function renderWorkflow(
  source: unknown,
  task: QueueTask,
  context: Partial<WorkflowContext> = {}
): unknown {
  const [width, height] = outputDimensions(task);
  const fps = context.fps ?? task.fps ?? 8;
  const modelAssets = wan14ModelAssets[task.modelId];
  const interpolationMultiplier = frameInterpolationMultiplier(task);
  const tokens: Record<string, string | number> = {
    PROMPT: task.prompt,
    NEGATIVE_PROMPT: "",
    SEED: task.seed,
    INPUT_IMAGE: context.inputImage ?? "",
    END_IMAGE: context.endImage ?? "",
    WIDTH: context.width ?? width,
    HEIGHT: context.height ?? height,
    DURATION: task.duration,
    FPS: fps,
    SOURCE_FPS: fps / interpolationMultiplier,
    FRAMES: context.frames ?? generationFrameCountForTask(task),
    OUTPUT_FRAMES: outputFrameCountForTask(task),
    OUTPUT_FILENAME: task.outputFilename.replace(/\.mp4$/i, ""),
    HIGH_MODEL: modelAssets?.high ?? "",
    LOW_MODEL: modelAssets?.low ?? "",
    TEXT_ENCODER: modelAssets?.textEncoder ?? "",
    VAE_MODEL: modelAssets?.vae ?? ""
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
    interpolationMultiplier === 1 ||
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
  for (const node of Object.values(workflow)) {
    if (node.class_type !== "CreateVideo" || !node.inputs) continue;
    const decodedImages = node.inputs.images;
    if (!Array.isArray(decodedImages)) continue;
    const unloadId = String(nextNodeId++);
    const interpolateId = String(nextNodeId++);
    const trimId = String(nextNodeId++);
    workflow[unloadId] = {
      class_type: "VRAM_Debug",
      inputs: {
        empty_cache: true,
        gc_collect: true,
        unload_all_models: true,
        image_pass: decodedImages
      }
    };
    workflow[interpolateId] = {
      class_type: "RIFE VFI",
      inputs: {
        ckpt_name: "rife47.pth",
        frames: [unloadId, 1],
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
