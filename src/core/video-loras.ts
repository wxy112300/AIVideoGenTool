import type { ModelScanProfile, UiLocale, VideoLoraSelection } from "../types.js";
import {
  H3_FL2VA_MODEL_ID,
  H3_CAMERA_MOTION_LORA_FILENAME,
  H3_CAMERA_MOTION_LORA_ID,
  H3_AFTER_MIDNIGHT_LORA_FILENAME,
  H3_AFTER_MIDNIGHT_LORA_ID,
  H3_PINK_FLUFFY_BUNNY_LORA_FILENAME,
  H3_PINK_FLUFFY_BUNNY_LORA_ID,
  H3_REALISM_PEOPLE_LORA_FILENAME,
  H3_REALISM_PEOPLE_LORA_ID,
  H3_REF2V_TURBO_LORA_ID,
  H3_REF2V_TURBO_LORA_FILENAME,
  H3_TURBO_LORA_FILENAME,
  H3_TURBO_LORA_ID,
  H3_TURBO_LORA_IDS,
  H3_TURBO_768P_V1_LORA_ID,
  H3_TURBO_8STEP_V1_LORA_ID,
  LEGACY_H3_TURBO_LORA_ID,
  LEGACY_H3_TURBO_MODEL_ID,
  LEGACY_H3_REF2V_TURBO_MODEL_ID,
  VIDEO_LORA_DEFINITIONS
} from "./catalog/loras/definitions.js";
import type {
  VideoLoraRules,
  VideoLoraSettingKey
} from "./catalog/loras/definitions.js";
import { loraLocaleFor, loraRuleText } from "./catalog/loras/locales.js";

export {
  H3_FL2VA_MODEL_ID,
  H3_CAMERA_MOTION_LORA_FILENAME,
  H3_CAMERA_MOTION_LORA_ID,
  H3_AFTER_MIDNIGHT_LORA_FILENAME,
  H3_AFTER_MIDNIGHT_LORA_ID,
  H3_PINK_FLUFFY_BUNNY_LORA_FILENAME,
  H3_PINK_FLUFFY_BUNNY_LORA_ID,
  H3_REALISM_PEOPLE_LORA_FILENAME,
  H3_REALISM_PEOPLE_LORA_ID,
  H3_REF2V_TURBO_LORA_FILENAME,
  H3_REF2V_TURBO_LORA_ID,
  H3_TURBO_LORA_FILENAME,
  H3_TURBO_LORA_ID,
  H3_TURBO_LORA_IDS,
  H3_TURBO_768P_V1_LORA_ID,
  H3_TURBO_8STEP_V1_LORA_ID,
  LEGACY_H3_TURBO_LORA_ID,
  LEGACY_H3_REF2V_TURBO_MODEL_ID,
  LEGACY_H3_TURBO_MODEL_ID
};
export type {
  VideoLoraCombinationRule,
  VideoLoraRules,
  VideoLoraSettingConflict,
  VideoLoraSettingKey
} from "./catalog/loras/definitions.js";

export interface VideoLoraGuide {
  summary: string;
  recommendedStrength: string;
  effects: string;
  stacking: string;
  compatibility: string;
  source: string;
}

export interface VideoLoraConfigurationIssue {
  code: string;
  severity: "error" | "warning";
  loraIds: string[];
  message: string;
}

export interface BuiltinVideoLora extends VideoLoraSelection {
  retired?: boolean;
  guide: VideoLoraGuide;
  rules: VideoLoraRules;
}

const allBuiltinVideoLoras: readonly BuiltinVideoLora[] = VIDEO_LORA_DEFINITIONS.map((definition) => ({
  ...videoLoraSelection(definition),
  ...(definition.retired ? { retired: true } : {}),
  guide: { ...loraLocaleFor(definition.id)?.guide! },
  rules: definition.rules
}));

export const BUILTIN_VIDEO_LORAS: readonly BuiltinVideoLora[] = allBuiltinVideoLoras
  .filter((lora) => lora.retired !== true);

function requiredBuiltinVideoLora(id: string): BuiltinVideoLora {
  const lora = allBuiltinVideoLoras.find((candidate) => candidate.id === id);
  if (!lora) throw new Error(`Missing built-in video LoRA definition: ${id}`);
  return lora;
}

export const H3_TURBO_LORA = requiredBuiltinVideoLora(H3_TURBO_LORA_ID);
export const H3_CAMERA_MOTION_LORA = requiredBuiltinVideoLora(H3_CAMERA_MOTION_LORA_ID);
export const H3_TURBO_8STEP_V1_LORA = requiredBuiltinVideoLora(H3_TURBO_8STEP_V1_LORA_ID);
export const H3_TURBO_768P_V1_LORA = requiredBuiltinVideoLora(H3_TURBO_768P_V1_LORA_ID);
export const H3_REF2V_TURBO_LORA = requiredBuiltinVideoLora(H3_REF2V_TURBO_LORA_ID);
export const H3_AFTER_MIDNIGHT_LORA = requiredBuiltinVideoLora(H3_AFTER_MIDNIGHT_LORA_ID);
export const H3_REALISM_PEOPLE_LORA = requiredBuiltinVideoLora(H3_REALISM_PEOPLE_LORA_ID);
export const H3_PINK_FLUFFY_BUNNY_LORA = requiredBuiltinVideoLora(H3_PINK_FLUFFY_BUNNY_LORA_ID);

const legacyTurboLoraIdSet = new Set<string>([
  ...H3_TURBO_LORA_IDS,
  LEGACY_H3_TURBO_LORA_ID,
  H3_TURBO_768P_V1_LORA_ID
]);

export function isH3TurboLoraId(id: string): boolean {
  return legacyTurboLoraIdSet.has(id);
}

export function isH3TurboFourStepV11LoraId(id: string): boolean {
  return id === H3_TURBO_LORA_ID;
}

export function isH3Ref2vTurboLoraId(id: string): boolean {
  return id === H3_REF2V_TURBO_LORA_ID;
}

export function h3TurboLoraForSelection(
  loras: readonly VideoLoraSelection[] | undefined,
  modelId = ""
): BuiltinVideoLora | undefined {
  return (loras ?? [])
    .map((lora) => videoLoraDefinition(lora.id))
    .find((lora): lora is BuiltinVideoLora =>
      Boolean(lora && isH3TurboLoraId(lora.id) && videoLoraCompatibleWithModel(lora, modelId))
    );
}

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
    purpose: definition.purpose,
    promptPrefixes: [...(definition.promptPrefixes ?? [])]
  };
}

export function videoLoraDefinition(id: string): BuiltinVideoLora | undefined {
  return allBuiltinVideoLoras.find((lora) => lora.id === id);
}

export function videoLoraConfigurationIssues(context: {
  modelId: string;
  inputMode: "image" | "video";
  spectrumMode: string;
  attentionMode: string;
  videoLoras: readonly VideoLoraSelection[];
  locale?: UiLocale;
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
        message: loraRuleText(lora.id, "incompatible", context.locale).replace("{name}", lora.name)
      });
    }
    const definition = videoLoraDefinition(lora.id);
    if (!definition) return;
    if (definition.retired) {
      push({
        code: `retired:${lora.id}`,
        severity: "error",
        loraIds: [lora.id],
        message: loraRuleText(lora.id, "retired", context.locale).replace("{name}", lora.name)
      });
    }
    definition.rules.settingConflicts.forEach((conflict) => {
      if (!conflict.values.includes(settingValues[conflict.setting])) return;
      push({
        code: `setting:${lora.id}:${conflict.setting}`,
        severity: conflict.severity,
        loraIds: [lora.id],
        message: conflict.localeKey
          ? loraRuleText(lora.id, conflict.localeKey, context.locale)
          : conflict.message ?? loraRuleText(lora.id, "incompatible", context.locale)
      });
    });
    definition.rules.combinations.forEach((combination) => {
      if (!selectedIds.has(combination.loraId)) return;
      const pair = [lora.id, combination.loraId].sort();
      push({
        code: `combination:${pair.join(":")}`,
        severity: combination.severity,
        loraIds: pair,
        message: combination.localeKey
          ? loraRuleText(lora.id, combination.localeKey, context.locale)
          : combination.message ?? loraRuleText(lora.id, "incompatible", context.locale)
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
      message: loraRuleText(current.id, "orderSuggestion", context.locale)
        .replace("{current}", current.name)
        .replace("{previous}", previous.name)
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
    const builtin = allBuiltinVideoLoras.find((lora) => lora.id === candidate.id);
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
        purpose: candidate.purpose ?? "style",
        promptPrefixes: Array.isArray(candidate.promptPrefixes)
          ? candidate.promptPrefixes.filter((prefix): prefix is string => typeof prefix === "string")
          : []
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
    value.modelId === LEGACY_H3_REF2V_TURBO_MODEL_ID ||
    Boolean(h3TurboLoraForSelection(value.videoLoras, baseVideoModelId(value.modelId)));
}

export function isH3Ref2vTurboEnabled(value: {
  modelId: string;
  videoLoras?: readonly VideoLoraSelection[];
}): boolean {
  return value.modelId === LEGACY_H3_REF2V_TURBO_MODEL_ID ||
    Boolean((value.videoLoras ?? []).some((lora) =>
      isH3Ref2vTurboLoraId(lora.id) && videoLoraCompatibleWithModel(lora, baseVideoModelId(value.modelId))
    ));
}

export function bundledWorkflowModelId(value: {
  modelId: string;
  videoLoras?: readonly VideoLoraSelection[];
}): string {
  if (isH3Ref2vTurboEnabled(value)) return baseVideoModelId(value.modelId);
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

export function videoPromptForLoras(
  prompt: string,
  loras: readonly VideoLoraSelection[] | undefined
): string {
  const prefixes = [...new Set((loras ?? []).flatMap((lora) =>
    lora.promptPrefixes ?? videoLoraDefinition(lora.id)?.promptPrefixes ?? []
  ))];
  return prefixes.reduceRight((current, prefix) => {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const existing = new RegExp(`(^|[\\s,;:])${escaped}(?=$|[\\s,;:])`, "iu");
    const withoutDuplicate = current
      .replace(existing, "$1")
      .replace(/([,;:])\s*[,;:]+\s*/gu, "$1 ")
      .replace(/^\s*[,;:]\s*/u, "")
      .trim();
    return withoutDuplicate ? `${prefix}, ${withoutDuplicate}` : prefix;
  }, prompt.trim());
}
