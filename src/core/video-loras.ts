import type { ModelScanProfile, VideoLoraSelection } from "../types.js";

export interface VideoLoraGuide {
  summary: string;
  recommendedStrength: string;
  effects: string;
  stacking: string;
  compatibility: string;
  source: string;
}

export type VideoLoraSettingKey = "spectrumMode" | "attentionMode";

export interface VideoLoraSettingConflict {
  setting: VideoLoraSettingKey;
  values: string[];
  severity: "error" | "warning";
  message: string;
}

export interface VideoLoraCombinationRule {
  loraId: string;
  severity: "error" | "warning";
  message: string;
}

export interface VideoLoraRules {
  orderPriority: number;
  settingConflicts: VideoLoraSettingConflict[];
  combinations: VideoLoraCombinationRule[];
  workflowRequirement?: "h3-turbo-sampling";
}

export interface VideoLoraConfigurationIssue {
  code: string;
  severity: "error" | "warning";
  loraIds: string[];
  message: string;
}

export interface BuiltinVideoLora extends VideoLoraSelection {
  guide: VideoLoraGuide;
  rules: VideoLoraRules;
}

export const H3_TURBO_LORA_ID = "minimax-h3-lightx2v-turbo-4step";
export const LEGACY_H3_TURBO_MODEL_ID = "minimax_h3_fl2va_turbo";
export const H3_FL2VA_MODEL_ID = "minimax_h3_fl2va";
export const H3_TURBO_LORA_FILENAME =
  "minimax_h3_fl2v_lightx2v_turbo_4step_v0.1_comfy_resized_avg_rank_21_bf16.safetensors";
export const H3_PINK_FLUFFY_BUNNY_LORA_ID = "minimax-h3-pink-fluffy-bunny-nsfw";
export const H3_PINK_FLUFFY_BUNNY_LORA_FILENAME =
  "PinkFluffyBunny-pruned-v1-rank128.safetensors";

export const H3_TURBO_LORA: BuiltinVideoLora = {
  id: H3_TURBO_LORA_ID,
  name: "LightX2V Turbo 4-Step",
  filename: H3_TURBO_LORA_FILENAME,
  strength: 0.75,
  modelFamily: "minimax-h3",
  compatibleModelIds: [H3_FL2VA_MODEL_ID],
  compatibleInputModes: ["image"],
  purpose: "performance",
  guide: {
    summary: "把 H3 FL2VA 从标准约 20 步切换到 LightX2V Turbo 6–8 步采样，用更少步骤缩短生成时间。",
    recommendedStrength: "默认 0.75；建议 0.65–0.85。4 步仅适合实验，稳定测试优先使用 8 步。",
    effects: "速度明显提高，但过强或步数过低可能损失细节、运动稳定性和音频质量。",
    stacking: "与内容或风格 LoRA 同用时建议放在前面；若组合后质量下降，先降低其他 LoRA 强度，再回退标准 20 步。",
    compatibility: "仅 MiniMax H3 FL2VA 图生视频；会同时切换 ER-SDE、Beta 与 Turbo 步数策略。",
    source: "LightX2V / Kijai ComfyUI conversion"
  },
  rules: {
    orderPriority: 10,
    settingConflicts: [{
      setting: "spectrumMode",
      values: ["balanced"],
      severity: "error",
      message: "LightX2V Turbo 使用专用低步数采样策略，不能同时启用 Spectrum。"
    }],
    combinations: [],
    workflowRequirement: "h3-turbo-sampling"
  }
};

export const H3_PINK_FLUFFY_BUNNY_LORA: BuiltinVideoLora = {
  id: H3_PINK_FLUFFY_BUNNY_LORA_ID,
  name: "PinkFluffyBunny NSFW",
  filename: H3_PINK_FLUFFY_BUNNY_LORA_FILENAME,
  strength: 0.5,
  modelFamily: "minimax-h3",
  compatibleModelIds: [H3_FL2VA_MODEL_ID],
  compatibleInputModes: ["image"],
  purpose: "content",
  guide: {
    summary: "社区 NSFW 内容 LoRA，用于增强 H3 对成人内容、身体细节和相关姿态的响应。它不会替代 Prompt。",
    recommendedStrength: "默认 0.5；建议先在 0.35–0.65 间测试。高于 0.7 更容易出现过度特征和画面瑕疵。",
    effects: "会改变内容倾向、身体结构和局部细节；作者标注为 alpha，人物一致性与音频仍需抽样验证。",
    stacking: "与 Turbo 同用时建议放在 Turbo 后面。若出现鬼影、僵硬或细节退化，先降低本项强度，再单独关闭 Turbo 对照。",
    compatibility: "当前仅用于 MiniMax H3 FL2VA pruned INT8 图生视频；不提供给 R2V 或视频续写。",
    source: "SexGod1979 / PinkFluffyBunny-MiniMax-H3"
  },
  rules: {
    orderPriority: 50,
    settingConflicts: [],
    combinations: [{
      loraId: H3_TURBO_LORA_ID,
      severity: "warning",
      message: "PinkFluffyBunny 与 Turbo 可以组合，但属于未经充分验证的 alpha 叠加；建议 Turbo 在前，并分别保留单 LoRA 对照结果。"
    }]
  }
};

export const BUILTIN_VIDEO_LORAS: readonly BuiltinVideoLora[] = [
  H3_TURBO_LORA,
  H3_PINK_FLUFFY_BUNNY_LORA
];

export function detectedVideoLoraFilename(profile: ModelScanProfile | undefined): string {
  const match = profile?.components.flatMap((component) => component.matches)[0];
  if (!match) return "";
  const normalized = match.replaceAll("\\", "/");
  const markerIndex = normalized.toLowerCase().lastIndexOf("loras/");
  return markerIndex >= 0 ? normalized.slice(markerIndex + "loras/".length) : "";
}

export function profileProvidesVideoLora(
  profile: ModelScanProfile | undefined,
  filename: string
): boolean {
  if (!profile?.available) return false;
  const expected = `loras/${filename}`.replaceAll("\\", "/").toLowerCase();
  return profile.components.some((component) =>
    component.matches.some((match) => {
      const normalized = match.replaceAll("\\", "/").toLowerCase();
      return normalized === expected || normalized.endsWith(`/${expected}`);
    })
  );
}

export function videoLoraSelection(
  definition: VideoLoraSelection,
  strength = definition.strength,
  filename = definition.filename
): VideoLoraSelection {
  return {
    id: definition.id,
    name: definition.name,
    filename,
    strength,
    modelFamily: definition.modelFamily,
    compatibleModelIds: [...definition.compatibleModelIds],
    compatibleInputModes: [...definition.compatibleInputModes],
    purpose: definition.purpose
  };
}

export function videoLoraDefinition(id: string): BuiltinVideoLora | undefined {
  return BUILTIN_VIDEO_LORAS.find((lora) => lora.id === id);
}

export function videoLoraConfigurationIssues(context: {
  modelId: string;
  inputMode: "image" | "video";
  spectrumMode: string;
  attentionMode: string;
  videoLoras: readonly VideoLoraSelection[];
}): VideoLoraConfigurationIssue[] {
  const issues: VideoLoraConfigurationIssue[] = [];
  const selectedIds = new Set(context.videoLoras.map((lora) => lora.id));
  const settingValues: Record<VideoLoraSettingKey, string> = {
    spectrumMode: context.spectrumMode,
    attentionMode: context.attentionMode
  };
  const seen = new Set<string>();
  const push = (issue: VideoLoraConfigurationIssue) => {
    if (seen.has(issue.code)) return;
    seen.add(issue.code);
    issues.push(issue);
  };

  context.videoLoras.forEach((lora) => {
    if (!videoLoraCompatibleWithDraft(lora, context.modelId, context.inputMode)) {
      push({
        code: `compatibility:${lora.id}`,
        severity: "error",
        loraIds: [lora.id],
        message: `${lora.name} 不兼容当前基础模型或输入模式。`
      });
    }
    const definition = videoLoraDefinition(lora.id);
    if (!definition) return;
    definition.rules.settingConflicts.forEach((conflict) => {
      if (!conflict.values.includes(settingValues[conflict.setting])) return;
      push({
        code: `setting:${lora.id}:${conflict.setting}`,
        severity: conflict.severity,
        loraIds: [lora.id],
        message: conflict.message
      });
    });
    definition.rules.combinations.forEach((combination) => {
      if (!selectedIds.has(combination.loraId)) return;
      const pair = [lora.id, combination.loraId].sort();
      push({
        code: `combination:${pair.join(":")}`,
        severity: combination.severity,
        loraIds: pair,
        message: combination.message
      });
    });
  });

  for (let index = 1; index < context.videoLoras.length; index += 1) {
    const previous = videoLoraDefinition(context.videoLoras[index - 1]!.id);
    const current = videoLoraDefinition(context.videoLoras[index]!.id);
    if (!previous || !current || previous.rules.orderPriority <= current.rules.orderPriority) continue;
    push({
      code: `order:${previous.id}:${current.id}`,
      severity: "warning",
      loraIds: [previous.id, current.id],
      message: `建议将 ${current.name} 放在 ${previous.name} 前面；性能 LoRA 通常先加载，内容、人物和风格 LoRA 后加载。`
    });
  }
  return issues;
}

export function reorderVideoLoras(
  loras: readonly VideoLoraSelection[],
  id: string,
  direction: -1 | 1
): VideoLoraSelection[] {
  const currentIndex = loras.findIndex((lora) => lora.id === id);
  const targetIndex = currentIndex + direction;
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= loras.length) {
    return loras.map((lora) => ({ ...lora }));
  }
  const reordered = loras.map((lora) => ({ ...lora }));
  const current = reordered[currentIndex]!;
  const target = reordered[targetIndex]!;
  reordered[currentIndex] = target;
  reordered[targetIndex] = current;
  return reordered;
}

export function baseVideoModelId(modelId: string): string {
  return modelId === LEGACY_H3_TURBO_MODEL_ID ? H3_FL2VA_MODEL_ID : modelId;
}

export function normalizeVideoLoras(
  value: unknown,
  legacyModelId = ""
): VideoLoraSelection[] {
  const items = Array.isArray(value) ? value : [];
  const normalized = items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<VideoLoraSelection>;
    if (typeof candidate.id !== "string" || !candidate.id.trim() ||
      typeof candidate.name !== "string" || !candidate.name.trim() ||
      typeof candidate.filename !== "string" || !candidate.filename.trim()) return [];
    const builtin = BUILTIN_VIDEO_LORAS.find((lora) => lora.id === candidate.id);
    const definition: VideoLoraSelection = builtin ?? {
        id: candidate.id.trim(),
        name: candidate.name.trim(),
        filename: candidate.filename.trim(),
        strength: 1,
        modelFamily: typeof candidate.modelFamily === "string" ? candidate.modelFamily : "unknown",
        compatibleModelIds: Array.isArray(candidate.compatibleModelIds)
          ? candidate.compatibleModelIds.filter((id): id is string => typeof id === "string")
          : [],
        compatibleInputModes: Array.isArray(candidate.compatibleInputModes)
          ? candidate.compatibleInputModes.filter((mode): mode is "image" | "video" => mode === "image" || mode === "video")
          : ["image"],
        purpose: candidate.purpose ?? "style"
      };
    const normalizedItem = videoLoraSelection(
      definition,
      typeof candidate.strength === "number" && Number.isFinite(candidate.strength)
        ? Math.max(0, Math.min(2, candidate.strength))
        : builtin?.strength ?? 1,
      candidate.filename.trim()
    );
    return [normalizedItem];
  });
  if (
    legacyModelId === LEGACY_H3_TURBO_MODEL_ID &&
    !normalized.some((item) => item.id === H3_TURBO_LORA_ID)
  ) {
    normalized.push(videoLoraSelection(H3_TURBO_LORA));
  }
  return normalized.filter((lora, index) =>
    normalized.findIndex((candidate) => candidate.id === lora.id) === index
  );
}

export function videoLoraCompatibleWithModel(
  lora: VideoLoraSelection,
  modelId: string
): boolean {
  return lora.compatibleModelIds.length === 0 ||
    lora.compatibleModelIds.includes(baseVideoModelId(modelId));
}

export function videoLoraCompatibleWithDraft(
  lora: VideoLoraSelection,
  modelId: string,
  inputMode: "image" | "video"
): boolean {
  return videoLoraCompatibleWithModel(lora, modelId) &&
    lora.compatibleInputModes.includes(inputMode);
}

export function hasVideoLora(
  loras: readonly VideoLoraSelection[] | undefined,
  id: string
): boolean {
  return Boolean(loras?.some((lora) => lora.id === id));
}

export function isH3TurboEnabled(value: {
  modelId: string;
  videoLoras?: readonly VideoLoraSelection[];
}): boolean {
  return value.modelId === LEGACY_H3_TURBO_MODEL_ID ||
    (baseVideoModelId(value.modelId) === H3_FL2VA_MODEL_ID &&
      hasVideoLora(value.videoLoras, H3_TURBO_LORA_ID));
}

export function bundledWorkflowModelId(value: {
  modelId: string;
  videoLoras?: readonly VideoLoraSelection[];
}): string {
  return isH3TurboEnabled(value)
    ? LEGACY_H3_TURBO_MODEL_ID
    : baseVideoModelId(value.modelId);
}

export function videoLoraFilename(
  loras: readonly VideoLoraSelection[] | undefined,
  id: string
): string {
  return loras?.find((lora) => lora.id === id)?.filename ?? "";
}
