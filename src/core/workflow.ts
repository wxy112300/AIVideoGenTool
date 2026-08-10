import type {
  ExtensionQueueTask,
  GenerationQueueTask,
  H3StepCount,
  QueueTask
} from "../types.js";

export interface WorkflowContext {
  inputImage: string;
  endImage: string;
  sourceVideo: string;
  h3ReferenceImages: string[];
  h3ReferenceVideos: string[];
  width: number;
  height: number;
  frames: number;
  fps: number;
  vramTotalBytes: number;
  vramAvailableBytes: number;
  h3ContextLatentPath: string;
  h3ContextSavePrefix: string;
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

export function isMiniMaxH3Fl2vaModel(modelId: string): boolean {
  return modelId === "minimax_h3_fl2va" || modelId === "minimax_h3_fl2va_int4";
}

export const retiredVideoModelIds = [
  "wan22_5b",
  "hunyuan15",
  "hunyuan15_sr",
  "wan22_remix",
  "wan22_smoothmix",
  "wan22_dasiwa"
] as const;

export function isRetiredVideoModel(modelId: string): boolean {
  return (retiredVideoModelIds as readonly string[]).includes(modelId);
}

export function isMiniMaxH3TurboModel(modelId: string): boolean {
  return modelId === "minimax_h3_fl2va_turbo";
}

export function isMiniMaxH3R2vModel(modelId: string): boolean {
  return modelId === "minimax_h3_ref2va" || modelId === "minimax_h3_ref2va_int4";
}

export function isMiniMaxH3Model(modelId: string): boolean {
  return isMiniMaxH3Fl2vaModel(modelId) ||
    isMiniMaxH3TurboModel(modelId) ||
    isMiniMaxH3R2vModel(modelId);
}

export function isMiniMaxH3SpectrumEligible(modelId: string): boolean {
  return isMiniMaxH3Model(modelId);
}

function applyMiniMaxH3Spectrum(
  workflow: Record<string, { class_type?: string; inputs?: Record<string, unknown> }>
): void {
  const consumers = Object.entries(workflow).filter(([, node]) =>
    (node.class_type === "BasicScheduler" || node.class_type === "BasicGuider") &&
    Array.isArray(node.inputs?.model)
  );
  if (!consumers.length) {
    throw new Error("Spectrum 加速需要连接到 H3 的 BasicScheduler / BasicGuider 模型输入。");
  }
  const existing = Object.entries(workflow).find(([, node]) =>
    node.class_type === "SpectrumApplyMiniMaxH3"
  );
  const upstream = existing?.[1].inputs?.model ?? consumers[0]?.[1].inputs?.model;
  if (!Array.isArray(upstream) || typeof upstream[0] !== "string") {
    throw new Error("Spectrum 加速无法识别 H3 模型补丁链的输出。");
  }
  if (!existing && consumers.some(([, node]) => JSON.stringify(node.inputs?.model) !== JSON.stringify(upstream))) {
    throw new Error("Spectrum 加速要求 BasicScheduler 与 BasicGuider 使用同一个 H3 模型输出。");
  }
  const numericIds = Object.keys(workflow)
    .map(Number)
    .filter(Number.isFinite);
  const nodeId = existing?.[0] ?? String((numericIds.length ? Math.max(...numericIds) : 0) + 1);
  workflow[nodeId] = {
    class_type: "SpectrumApplyMiniMaxH3",
    inputs: {
      model: upstream,
      enabled: true,
      blend_weight: 0.5,
      degree: 1,
      ridge_lambda: 0.1,
      window_size: 2,
      flex_window: 0.75,
      warmup_steps: 1,
      tail_actual_steps: 1,
      max_history: 8,
      debug: true,
      history_storage: "system_ram",
      offline_archive_storage: "system_ram",
      bootstrap_first_forecast: true,
      anchor_residual_feedback: false,
      selective_rollback_correction: false,
      offline_smoothing_replay: true,
      audio_blend_weight: 0
    }
  };
  for (const [, node] of consumers) node.inputs!.model = [nodeId, 0];
}

export function normalizeH3Steps(value: unknown, modelId = ""): H3StepCount {
  const normalized = value === 4 || value === 6 || value === 8 || value === 10 ||
    value === 12 || value === 16 || value === 20
    ? value
    : 20;
  return isMiniMaxH3TurboModel(modelId) && normalized > 8 ? 8 : normalized;
}

function generationSafetyProfileForModel(
  modelId: string
): GenerationSafetyProfile {
  if (isMiniMaxH3Model(modelId)) {
    return {
      label: isMiniMaxH3R2vModel(modelId)
        ? "MiniMax H3 R2V"
        : isMiniMaxH3TurboModel(modelId)
          ? "MiniMax H3 Turbo FL2VA"
          : "MiniMax H3 FL2VA",
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
  if (isMiniMaxH3Model(modelId)) return 17;
  if (modelId === "sulphur2") return 8;
  if (modelId.startsWith("wan22_") || modelId.startsWith("hunyuan15")) return 4;
  return 1;
}

export function frameCountForTask(
  task: Pick<GenerationQueueTask, "modelId" | "duration">,
  fps: number
): number {
  if (task.modelId && isMiniMaxH3Model(task.modelId)) {
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
  if (task.modelId && isMiniMaxH3Model(task.modelId)) {
    return frameCountForTask(
      { modelId: task.modelId, duration: task.duration },
      24
    );
  }
  return Math.max(1, Math.round(task.duration * task.fps));
}

export function workflowSupportsH3BoundaryExtension(source: unknown): boolean {
  if (!source || typeof source !== "object" || Array.isArray(source)) return false;
  const nodes = Object.values(source as Record<string, unknown>).filter(
    (node): node is Record<string, unknown> =>
      Boolean(node) && typeof node === "object" && !Array.isArray(node)
  );
  const classTypes = new Set(
    nodes.flatMap((node) =>
      typeof node.class_type === "string" ? [node.class_type] : []
    )
  );
  return JSON.stringify(source).includes("{{INPUT_IMAGE}}") &&
    classTypes.has("MiniMaxH3ImageToVideo") &&
    classTypes.has("CreateVideo") &&
    classTypes.has("SaveVideo");
}

export function workflowSupportsH3MotionContextExtension(source: unknown): boolean {
  if (!source || typeof source !== "object" || Array.isArray(source)) return false;
  const serialized = JSON.stringify(source);
  const classTypes = new Set(
    Object.values(source as Record<string, unknown>).flatMap((node) => {
      if (!node || typeof node !== "object" || Array.isArray(node)) return [];
      const classType = (node as Record<string, unknown>).class_type;
      return typeof classType === "string" ? [classType] : [];
    })
  );
  return serialized.includes("{{SOURCE_VIDEO}}") &&
    classTypes.has("MiniMaxH3ReferenceToVideo") &&
    classTypes.has("MiniMaxH3MotionContext") &&
    classTypes.has("MiniMaxH3MotionContextTrim") &&
    classTypes.has("MiniMaxH3MotionContextSaveLatent") &&
    classTypes.has("CreateVideo") &&
    classTypes.has("SaveVideo");
}

export function generationFrameCountForTask(
  task: Pick<
    GenerationQueueTask,
    "modelId" | "duration" | "fps" | "frameInterpolation"
  >
): number {
  if (isMiniMaxH3Model(task.modelId)) {
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
  > & { resolution?: number }
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
  if (isMiniMaxH3Model(task.modelId)) {
    const resolution = task.resolution ?? 480;
    const guidance = task.duration <= 5 && resolution <= 540
      ? "官方本地模板默认档，适合作为当前显卡的稳妥起步范围。"
      : task.duration <= 10 && resolution <= 720
        ? "当前显卡可尝试的均衡档；请预留更长采样和解码时间。"
        : "当前显卡重负载档；允许生成但显存与耗时风险较高，请关闭其他 GPU 程序，并避免同时排多个长任务。";
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

export function activityTimeoutMinutesForTask(
  task: Pick<QueueTask, "taskType" | "modelId">,
  ltxExtensionTimeoutMinutes: number
): number {
  if (isMiniMaxH3Model(task.modelId)) return 90;
  if (task.taskType === "extension") return ltxExtensionTimeoutMinutes;
  return 10;
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
    | "spectrumMode"
  >
): ExtensionSafety {
  if (isMiniMaxH3Fl2vaModel(task.modelId)) {
    const generationSafety = generationSafetyForTask(task);
    const minimumContextSeconds = 1 / 24;
    const result = (safe: boolean, message: string): ExtensionSafety => ({
      ...generationSafety,
      safe,
      minimumContextSeconds,
      message
    });
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
    if (!generationSafety.safe) return result(false, generationSafety.message);
    return result(
      true,
      `H3 结尾帧接续：生成 ${generationSafety.generatedFrames}/${generationSafety.maxGeneratedFrames} 帧新片段；它不是 latent overlap 原生续写。${generationSafety.message}`
    );
  }
  if (isMiniMaxH3R2vModel(task.modelId)) {
    const contextFrames = 22;
    const generationSafety = generationSafetyForTask(task);
    const sampledFrames = generationSafety.generatedFrames + contextFrames;
    const result = (safe: boolean, message: string): ExtensionSafety => ({
      ...generationSafety,
      safe,
      generatedFrames: sampledFrames,
      minimumContextSeconds: contextFrames / 24,
      message
    });
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
    if (task.trimEndSeconds - task.trimStartSeconds < contextFrames / 24) {
      return result(false, "H3 Motion Context 至少需要保留约 0.92 秒（22 帧）源视频。");
    }
    if (task.spectrumMode !== "off") {
      return result(false, "H3 Motion Context 续写必须关闭 Spectrum，避免预测固定上下文行导致音频和接缝退化。");
    }
    if (!generationSafety.safe || sampledFrames > generationSafety.maxGeneratedFrames) {
      return result(
        false,
        `新增片段与 22 帧运动上下文合计需要采样 ${sampledFrames} 帧，超过 H3 当前 ${generationSafety.maxGeneratedFrames} 帧预算。请缩短新增时长。`
      );
    }
    return result(
      true,
      `H3 Motion Context：采样 ${sampledFrames}/${generationSafety.maxGeneratedFrames} 帧，其中前 22 帧承接上一段运动和音频并在输出前自动裁掉。`
    );
  }
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

const miniMaxH3ModelAssets: Record<
  string,
  { diffusionModel: string; textEncoder: string; turboLora?: string }
> = {
  minimax_h3_fl2va: {
    diffusionModel: "minimax_h3_fl2va_pruned_int8_convrot.safetensors",
    textEncoder: "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors"
  },
  minimax_h3_fl2va_int4: {
    diffusionModel: "minimax_h3_fl2va_pruned_int4_convrot.safetensors",
    textEncoder: "qwen3vl_32b_minimax_h3_int4_convrot.safetensors"
  },
  minimax_h3_fl2va_turbo: {
    diffusionModel: "minimax_h3_fl2va_pruned_int8_convrot.safetensors",
    textEncoder: "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
    turboLora: "minimax_h3_fl2v_lightx2v_turbo_4step_v0.1_comfy_resized_avg_rank_21_bf16.safetensors"
  },
  minimax_h3_ref2va: {
    diffusionModel: "minimax_h3_ref2va_pruned_int8_convrot.safetensors",
    textEncoder: "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors"
  },
  minimax_h3_ref2va_int4: {
    diffusionModel: "minimax_h3_ref2va_pruned_int4_convrot.safetensors",
    textEncoder: "qwen3vl_32b_minimax_h3_int4_convrot.safetensors"
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
  if (isMiniMaxH3Model(task.modelId)) {
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
  if (isMiniMaxH3Fl2vaModel(task.modelId)) {
    return miniMaxH3Dimensions(task);
  }
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
  const h3Assets = miniMaxH3ModelAssets[task.modelId];
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
    H3_CONTEXT_LATENT_PATH: context.h3ContextLatentPath ?? "",
    H3_CONTEXT_SAVE_PREFIX: context.h3ContextSavePrefix ?? `h3_context/${task.id}/clip`,
    H3_REF_IMAGE_0: context.h3ReferenceImages?.[0] ?? "",
    H3_REF_IMAGE_1: context.h3ReferenceImages?.[1] ?? "",
    H3_REF_IMAGE_2: context.h3ReferenceImages?.[2] ?? "",
    H3_REF_IMAGE_3: context.h3ReferenceImages?.[3] ?? "",
    H3_REF_IMAGE_4: context.h3ReferenceImages?.[4] ?? "",
    H3_REF_IMAGE_5: context.h3ReferenceImages?.[5] ?? "",
    H3_REF_IMAGE_6: context.h3ReferenceImages?.[6] ?? "",
    H3_REF_IMAGE_7: context.h3ReferenceImages?.[7] ?? "",
    H3_REF_IMAGE_8: context.h3ReferenceImages?.[8] ?? "",
    H3_REF_VIDEO_0: context.h3ReferenceVideos?.[0] ?? "",
    H3_REF_VIDEO_1: context.h3ReferenceVideos?.[1] ?? "",
    H3_REF_VIDEO_2: context.h3ReferenceVideos?.[2] ?? "",
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
    FRAMES: context.frames ?? (
      task.taskType === "extension" && isMiniMaxH3R2vModel(task.modelId)
        ? generationFrameCountForTask(task) + 22
        : generationFrameCountForTask(task)
    ),
    OUTPUT_FRAMES: outputFrameCountForTask(task),
    OUTPUT_FILENAME: task.outputFilename.replace(/\.mp4$/i, ""),
    H3_DIFFUSION_MODEL: h3Assets?.diffusionModel ?? "",
    H3_TEXT_ENCODER: h3Assets?.textEncoder ?? "",
    H3_TURBO_LORA: h3Assets?.turboLora ?? "",
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
    const exact = value.match(/^\{\{([A-Z0-9_]+)\}\}$/);
    if (exact?.[1] && exact[1] in tokens) return tokens[exact[1]];
    return value.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key: string) =>
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
  if (isMiniMaxH3Model(task.modelId)) {
    const steps = normalizeH3Steps(task.steps, task.modelId);
    for (const node of Object.values(workflow)) {
      if (node.class_type !== "BasicScheduler" || !node.inputs) continue;
      node.inputs.steps = steps;
    }
  }
  if (
    isMiniMaxH3Model(task.modelId) &&
    task.attentionMode === "sage-triton"
  ) {
    for (const node of Object.values(workflow)) {
      if (node.class_type !== "PathchSageAttentionKJ" || !node.inputs) continue;
      node.inputs.sage_attention = "sageattn_qk_int8_pv_fp16_triton";
      node.inputs.allow_compile = false;
    }
  }
  if (
    isMiniMaxH3Model(task.modelId) &&
    task.attentionMode === "pytorch"
  ) {
    const sageNodeIds = new Set(
      Object.entries(workflow)
        .filter(([, node]) => node.class_type === "PathchSageAttentionKJ")
        .map(([id]) => id)
    );
    for (const sageNodeId of sageNodeIds) {
      const upstreamModel = workflow[sageNodeId]?.inputs?.model;
      if (!Array.isArray(upstreamModel)) continue;
      for (const node of Object.values(workflow)) {
        if (!node.inputs) continue;
        for (const [name, input] of Object.entries(node.inputs)) {
          if (Array.isArray(input) && input[0] === sageNodeId) {
            node.inputs[name] = upstreamModel;
          }
        }
      }
      delete workflow[sageNodeId];
    }
  }
  if (
    task.spectrumMode === "balanced" &&
    isMiniMaxH3SpectrumEligible(task.modelId)
  ) {
    applyMiniMaxH3Spectrum(workflow);
  }
  const emptyReferenceNodeIds = new Set(
    Object.entries(workflow)
      .filter(([, node]) =>
        (node.class_type === "LoadImage" && node.inputs?.image === "") ||
        (node.class_type === "VHS_LoadVideoFFmpeg" && node.inputs?.video === "") ||
        (node.class_type === "MiniMaxH3MotionContextLoadLatent" &&
          node.inputs?.latent_path === "")
      )
      .map(([id]) => id)
  );
  for (const nodeId of emptyReferenceNodeIds) delete workflow[nodeId];
  if (emptyReferenceNodeIds.size) {
    for (const node of Object.values(workflow)) {
      if (!node.inputs) continue;
      for (const [inputName, input] of Object.entries(node.inputs)) {
        if (
          Array.isArray(input) &&
          typeof input[0] === "string" &&
          emptyReferenceNodeIds.has(input[0])
        ) {
          delete node.inputs[inputName];
        }
      }
    }
  }
  const h3HeavyDecode =
    isMiniMaxH3Model(task.modelId) &&
    (
      generationFrameCountForTask(task) > 124 ||
      outputWidth * outputHeight > 960 * 544
    );
  const availableVramBytes = context.vramAvailableBytes ?? context.vramTotalBytes ?? 0;
  const highVramDecode =
    availableVramBytes >= 20 * 1024 ** 3 && !h3HeavyDecode;
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
      if (!isMiniMaxH3Model(task.modelId)) {
        if (node.class_type === "VAEDecode") {
          node.class_type = "VAEDecodeTiled";
        }
        Object.assign(node.inputs, tiledDecodeInputs);
      }
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
  for (const match of serialized.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)) {
    if (match[1]) placeholders.add(match[1]);
  }
  if (!placeholders.has("PROMPT")) {
    errors.push("缺少 {{PROMPT}}，GUI 无法注入当前提示词");
  }
  const hasH3ReferenceImage = [...placeholders].some((token) =>
    /^H3_REF_IMAGE_\d+$/u.test(token)
  );
  const hasH3ReferenceVideo = [...placeholders].some((token) =>
    /^H3_REF_VIDEO_\d+$/u.test(token)
  );
  if (!placeholders.has("INPUT_IMAGE") && !placeholders.has("SOURCE_VIDEO") && !hasH3ReferenceImage && !hasH3ReferenceVideo) {
    errors.push("缺少 {{INPUT_IMAGE}}、{{SOURCE_VIDEO}} 或 H3 参考媒体占位符，GUI 无法注入输入媒体");
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
