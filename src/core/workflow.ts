import type { ExtensionQueueTask, GenerationQueueTask } from "../types.js";

export interface WorkflowContext {
  inputImage: string;
  endImage: string;
  sourceVideo: string;
  width: number;
  height: number;
  frames: number;
  fps: number;
  vramTotalBytes: number;
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

export interface ExtensionSafety extends GenerationSafety {
  minimumContextSeconds: number;
}

interface GenerationSafetyProfile {
  label: string;
  maxGeneratedFrames: number;
  maxDurationSeconds: number;
}

function generationSafetyProfileForModel(
  modelId: string
): GenerationSafetyProfile {
  if (modelId === "minimax_h3_fl2va") {
    return {
      label: "MiniMax H3 FL2VA",
      maxGeneratedFrames: 362,
      maxDurationSeconds: 15
    };
  }
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

export function workflowSupportsVideoExtension(source: unknown): boolean {
  if (!source || typeof source !== "object" || Array.isArray(source)) return false;
  const inputValues = Object.values(source as Record<string, unknown>).flatMap(
    (node) => {
      if (!node || typeof node !== "object" || Array.isArray(node)) return [];
      const inputs = (node as Record<string, unknown>).inputs;
      return inputs && typeof inputs === "object" && !Array.isArray(inputs)
        ? Object.values(inputs as Record<string, unknown>)
        : [];
    }
  );
  const serializedInputs = JSON.stringify(inputValues);
  return ["{{SOURCE_VIDEO}}", "{{EXTENSION_FRAMES}}", "{{OVERLAP_FRAMES}}"].every(
    (placeholder) => serializedInputs.includes(placeholder)
  );
}

export function extensionWorkflowSafetyErrors(source: unknown): string[] {
  const errors: string[] = [];
  if (!workflowSupportsVideoExtension(source)) {
    errors.push("缺少 SOURCE_VIDEO、EXTENSION_FRAMES 或 OVERLAP_FRAMES 输入占位符");
  }
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return errors.length ? errors : ["工作流根节点不是 API 对象"];
  }
  const nodes = Object.values(source as Record<string, unknown>).filter(
    (node): node is Record<string, unknown> =>
      Boolean(node) && typeof node === "object" && !Array.isArray(node)
  );
  const classTypes = nodes.flatMap(
    (node) => {
      const classType = node.class_type;
      return typeof classType === "string" ? [classType] : [];
    }
  );
  if (!classTypes.some((value) =>
    value === "LTXVExtendSampler" || value === "LTXVLoopingSampler"
  )) {
    errors.push("缺少官方 LTXVExtendSampler 或 LTXVLoopingSampler");
  }
  const usesCheckpointLoader = classTypes.includes("LowVRAMCheckpointLoader");
  const ggufLoader = nodes.find(
    (node) => node.class_type === "UnetLoaderGGUFAdvanced"
  );
  if (!usesCheckpointLoader && !ggufLoader) {
    errors.push("缺少 LowVRAMCheckpointLoader 或 UnetLoaderGGUFAdvanced");
  }
  if (ggufLoader) {
    const inputs = ggufLoader.inputs;
    const patchOnDevice = inputs && typeof inputs === "object" && !Array.isArray(inputs)
      ? (inputs as Record<string, unknown>).patch_on_device
      : undefined;
    if (patchOnDevice !== false) {
      errors.push("GGUF loader 必须关闭 patch_on_device");
    }
    if (!classTypes.includes("DualCLIPLoader")) {
      errors.push("GGUF 工作流缺少独立 DualCLIPLoader");
    }
    if (!classTypes.includes("VAELoader")) {
      errors.push("GGUF 工作流缺少独立 VAELoader");
    }
  }
  if (!classTypes.includes("VRAM_Debug")) {
    errors.push("缺少采样后的 VRAM_Debug 显式卸载节点");
  }
  if (!classTypes.some((value) =>
    value === "VAEDecodeTiled" || value.includes("TiledVAEDecode")
  )) {
    errors.push("缺少 tiled VAE decode");
  }
  return errors;
}

function frameIntervalForModel(modelId: string): 1 | 4 | 8 | 17 {
  if (modelId === "minimax_h3_fl2va") return 17;
  if (modelId === "sulphur2") return 8;
  if (modelId.startsWith("wan22_") || modelId.startsWith("hunyuan15")) return 4;
  return 1;
}

export function frameCountForTask(
  task: Pick<GenerationQueueTask, "modelId" | "duration">,
  fps: number
): number {
  if (task.modelId === "minimax_h3_fl2va") {
    const requested = Math.max(5, Math.round(task.duration * 24));
    return requested + ((5 - (requested % 17) + 17) % 17);
  }
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
  task: Pick<GenerationQueueTask, "duration" | "fps"> &
    Partial<Pick<GenerationQueueTask, "modelId">>
): number {
  if (task.modelId === "minimax_h3_fl2va") {
    return frameCountForTask(
      { modelId: task.modelId, duration: task.duration },
      24
    );
  }
  return Math.max(1, Math.round(task.duration * task.fps));
}

export function generationFrameCountForTask(
  task: Pick<
    GenerationQueueTask,
    "modelId" | "duration" | "fps" | "frameInterpolation"
  >
): number {
  if (task.modelId === "minimax_h3_fl2va") {
    return frameCountForTask(task, 24);
  }
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
  > & Partial<Pick<GenerationQueueTask, "resolution">>
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
  if (task.modelId === "minimax_h3_fl2va") {
    const resolution = task.resolution ?? 480;
    const guidance = task.duration <= 5 && resolution <= 540
      ? "官方本地模板默认档，属于 RTX 4090 的稳妥起步范围。"
      : task.duration <= 10 && resolution <= 720
        ? "4090 可尝试的均衡档；请预留更长采样和解码时间。"
        : "4090 重负载档；允许生成但显存与耗时风险较高，请关闭其他 GPU 程序，并避免同时排多个长任务。";
    return {
      safe: true,
      generatedFrames,
      maxGeneratedFrames,
      maxDurationSeconds,
      message: `${profile.label} 官方帧范围：${generatedFrames}/${maxGeneratedFrames}。${guidance}`
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

export function extensionSafetyForTask(
  task: Pick<
    ExtensionQueueTask,
    | "modelId"
    | "duration"
    | "fps"
    | "frameInterpolation"
    | "sourceVideoPath"
    | "sourceVideoDuration"
    | "trimStartSeconds"
    | "trimEndSeconds"
    | "maxGeneratedFrames"
    | "overlapFrames"
    | "resolution"
    | "unloadBetweenStages"
  >
): ExtensionSafety {
  const multiplier = frameInterpolationMultiplier(task);
  const sourceFps = task.fps / multiplier;
  const maxDurationSeconds = Math.max(
    1,
    Math.floor(((task.maxGeneratedFrames - 1) * multiplier + 1) / task.fps)
  );
  const minimumContextSeconds = task.overlapFrames / sourceFps;
  const generatedFrames = generationFrameCountForTask(task);
  const result = (safe: boolean, message: string): ExtensionSafety => ({
    safe,
    generatedFrames,
    maxGeneratedFrames: task.maxGeneratedFrames,
    maxDurationSeconds,
    minimumContextSeconds,
    message
  });
  if (task.modelId !== "sulphur2") {
    return result(false, "当前只允许 Sulphur 2 使用原生视频续写任务。");
  }
  if (!task.sourceVideoPath || task.sourceVideoDuration <= 0) {
    return result(false, "请先选择可读取的源视频。");
  }
  if (
    !Number.isFinite(task.trimStartSeconds) ||
    !Number.isFinite(task.trimEndSeconds) ||
    task.trimStartSeconds < 0 ||
    task.trimEndSeconds > task.sourceVideoDuration ||
    task.trimEndSeconds <= task.trimStartSeconds
  ) {
    return result(false, "视频裁剪范围无效。");
  }
  if (task.trimEndSeconds - task.trimStartSeconds < minimumContextSeconds) {
    return result(
      false,
      `至少保留 ${minimumContextSeconds.toFixed(1)} 秒，才能提供 ${task.overlapFrames} 帧续写上下文。`
    );
  }
  if (![360, 480].includes(task.resolution)) {
    return result(false, "Sulphur 2 续写只允许 360p 或 480p 基准分辨率。");
  }
  if (!task.unloadBetweenStages) {
    return result(false, "Sulphur 2 续写必须开启阶段间模型卸载。");
  }
  if (generatedFrames > task.maxGeneratedFrames) {
    return result(
      false,
      `当前组合需要 ${generatedFrames} 个模型帧，24GB 预设上限为 ${task.maxGeneratedFrames} 帧。请缩短新增时长或启用 RIFE。`
    );
  }
  return result(
    true,
    `GGUF 续写预算：${generatedFrames}/${task.maxGeneratedFrames} 模型帧，${task.overlapFrames} 帧上下文。`
  );
}

export function extensionContextDuration(
  task: Pick<ExtensionQueueTask, "fps" | "frameInterpolation" | "overlapFrames">
): number {
  return task.overlapFrames /
    (task.fps / frameInterpolationMultiplier(task));
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

const sulphurModelAssets = {
  q2_distilled: {
    transformer: "sulphur-2-distilled-Q2_K.gguf",
    distilled: true
  },
  q3_k_m: {
    transformer: "sulphur_dev-Q3_K_M.gguf",
    distilled: false
  },
  q4_k_m: {
    transformer: "sulphur_dev-Q4_K_M.gguf",
    distilled: false
  }
} as const;

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

type DimensionTask = Pick<
  GenerationQueueTask | ExtensionQueueTask,
  "ratio" | "resolution" | "sourceWidth" | "sourceHeight"
>;

function baseGenerationDimensions(task: DimensionTask): [number, number] {
  const [rw, rh] =
    task.ratio === "source" && task.sourceWidth > 0 && task.sourceHeight > 0
      ? [task.sourceWidth, task.sourceHeight]
      : ratios[task.ratio] ?? ratios.source!;
  const shortEdge = Math.max(64, Math.floor(task.resolution / 16) * 16);
  const maxLongEdge = Math.max(
    64,
    Math.floor((task.resolution * 16) / 9 / 16) * 16
  );
  if (rw >= rh) {
    const width = Math.max(
      64,
      Math.round((shortEdge * rw) / rh / 16) * 16
    );
    if (width <= maxLongEdge) return [width, shortEdge];
    return [
      maxLongEdge,
      Math.max(64, Math.round((maxLongEdge * rh) / rw / 16) * 16)
    ];
  }

  const height = Math.max(
    64,
    Math.round((shortEdge * rh) / rw / 16) * 16
  );
  if (height <= maxLongEdge) return [shortEdge, height];
  return [
    Math.max(64, Math.round((maxLongEdge * rw) / rh / 16) * 16),
    maxLongEdge
  ];
}

function legacyVideoDimensions(task: DimensionTask): [number, number] {
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

function miniMaxH3Dimensions(task: DimensionTask): [number, number] {
  const [rw, rh] =
    task.ratio === "source" && task.sourceWidth > 0 && task.sourceHeight > 0
      ? [task.sourceWidth, task.sourceHeight]
      : ratios[task.ratio] ?? ratios.source!;
  const ratio = rw / rh;
  let width = ratio >= 1 ? task.resolution * ratio : task.resolution;
  let height = ratio >= 1 ? task.resolution : task.resolution / ratio;
  const maxPixels = 768 * 1344;
  if (width * height > maxPixels) {
    const scale = Math.sqrt(maxPixels / (width * height));
    width *= scale;
    height *= scale;
  }
  return [
    Math.max(32, Math.round(width / 32) * 32),
    Math.max(32, Math.round(height / 32) * 32)
  ];
}

export function outputDimensions(
  task: DimensionTask & Pick<GenerationQueueTask, "modelId">
): [number, number] {
  if (task.modelId === "minimax_h3_fl2va") {
    return miniMaxH3Dimensions(task);
  }
  const [width, height] = baseGenerationDimensions(task);
  if (task.modelId !== "hunyuan15_sr") return [width, height];
  return [
    Math.max(64, Math.round((width * 1.5) / 8) * 8),
    Math.max(64, Math.round((height * 1.5) / 8) * 8)
  ];
}

export function extensionOutputDimensions(
  task: ExtensionQueueTask
): [number, number] {
  return legacyVideoDimensions(task);
}

export function renderWorkflow(
  source: unknown,
  task: GenerationQueueTask | ExtensionQueueTask,
  context: Partial<WorkflowContext> = {}
): unknown {
  const [width, height] = task.taskType === "extension"
    ? extensionOutputDimensions(task)
    : outputDimensions(task);
  const [baseWidth, baseHeight] = task.taskType === "extension"
    ? extensionOutputDimensions(task)
    : baseGenerationDimensions(task);
  const outputWidth = context.width ?? width;
  const outputHeight = context.height ?? height;
  const fps = context.fps ?? task.fps ?? 8;
  const modelAssets = wan14ModelAssets[task.modelId];
  const sulphurAssets = sulphurModelAssets[
    task.modelProfile ?? "q3_k_m"
  ];
  const interpolationMultiplier = frameInterpolationMultiplier(task);
  const tokens: Record<string, string | number | boolean> = {
    PROMPT: task.prompt,
    NEGATIVE_PROMPT: "",
    SEED: task.seed,
    INPUT_IMAGE: context.inputImage ?? "",
    END_IMAGE: context.endImage ?? "",
    SOURCE_VIDEO: context.sourceVideo ?? "",
    TRIM_START: task.taskType === "extension" ? task.trimStartSeconds : 0,
    TRIM_END: task.taskType === "extension" ? task.trimEndSeconds : 0,
    EXTENSION_FRAMES: task.taskType === "extension"
      ? generationFrameCountForTask(task)
      : 0,
    OVERLAP_FRAMES: task.taskType === "extension" ? task.overlapFrames : 0,
    UNLOAD_BETWEEN_STAGES: task.taskType === "extension"
      ? task.unloadBetweenStages
      : true,
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
    SULPHUR_GGUF: sulphurAssets.transformer,
    LTX_TEXT_ENCODER: "gemma_3_12B_it_fp4_mixed.safetensors",
    LTX_TEXT_CONNECTOR: "ltx-2-3-22b-text_encoder.safetensors",
    LTX_VIDEO_VAE: "ltx-2-3-22b-VAE.safetensors",
    LTX_AUDIO_VAE: "ltx-2-3-22b-audio_vae.safetensors",
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
  const emptyImageNodeIds = new Set(
    Object.entries(workflow)
      .filter(([, node]) =>
        node.class_type === "LoadImage" && node.inputs?.image === ""
      )
      .map(([id]) => id)
  );
  for (const nodeId of emptyImageNodeIds) delete workflow[nodeId];
  if (emptyImageNodeIds.size) {
    for (const node of Object.values(workflow)) {
      if (!node.inputs) continue;
      for (const [inputName, input] of Object.entries(node.inputs)) {
        if (
          Array.isArray(input) &&
          typeof input[0] === "string" &&
          emptyImageNodeIds.has(input[0])
        ) {
          delete node.inputs[inputName];
        }
      }
    }
  }
  const h3HeavyDecode =
    task.taskType === "generation" &&
    task.modelId === "minimax_h3_fl2va" &&
    (
      generationFrameCountForTask(task) > 124 ||
      outputWidth * outputHeight > 960 * 544
    );
  const highVramDecode =
    (context.vramTotalBytes ?? 0) >= 20 * 1024 ** 3 && !h3HeavyDecode;
  const tiledDecodeInputs = highVramDecode
    ? {
        // Keep spatial tiling, but make the temporal tile larger than every
        // supported clip so the VAE sees the whole sequence at once.
        tile_size: 512,
        overlap: 64,
        temporal_size: 4096,
        temporal_overlap: 16
      }
    : {
        tile_size: 256,
        overlap: 64,
        temporal_size: 64,
        temporal_overlap: 16
      };
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
    let latentInputKey: "samples" | "latents";
    if (node.class_type === "LTXVSpatioTemporalTiledVAEDecode") {
      Object.assign(node.inputs, {
        // This node counts latent frames. 1000 therefore disables temporal
        // splitting for our bounded generation/extension clips.
        temporal_tile_length: highVramDecode ? 1000 : 32,
        temporal_overlap: 4
      });
      latentInputKey = "latents";
    } else if (
      node.class_type === "VAEDecode" ||
      node.class_type === "VAEDecodeTiled"
    ) {
      if (node.class_type === "VAEDecode") {
        node.class_type = "VAEDecodeTiled";
      }
      Object.assign(node.inputs, tiledDecodeInputs);
      latentInputKey = "samples";
    } else {
      continue;
    }
    const samples = node.inputs[latentInputKey];
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
    node.inputs[latentInputKey] = [unloadId, 0];
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
    if (
      task.taskType === "generation" &&
      task.modelId === "sulphur2"
    ) {
      const previewFrameId = String(nextNodeId++);
      const previewOutputId = String(nextNodeId++);
      workflow[previewFrameId] = {
        class_type: "ImageFromBatch",
        inputs: {
          image: decodedImages,
          batch_index: Math.max(
            0,
            Math.floor((context.frames ?? generationFrameCountForTask(task)) / 2)
          ),
          length: 1
        }
      };
      workflow[previewOutputId] = {
        class_type: "PreviewImage",
        inputs: {
          images: [previewFrameId, 0]
        }
      };
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
        length: task.taskType === "extension"
          ? task.overlapFrames * interpolationMultiplier +
            outputFrameCountForTask(task)
          : outputFrameCountForTask(task)
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
  if (!placeholders.has("INPUT_IMAGE") && !placeholders.has("SOURCE_VIDEO")) {
    errors.push("缺少 {{INPUT_IMAGE}} 或 {{SOURCE_VIDEO}}，GUI 无法注入输入媒体");
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
