import type { ImageLoraSelection, ModelScanProfile } from "../types.js";
import {
  IMAGE_LORA_DEFINITIONS,
  type CatalogImageLoraDefinition
} from "./catalog/loras/definitions.js";
import { loraLocaleFor, type CatalogLoraGuideLocale } from "./catalog/loras/locales.js";

export interface BuiltinImageLora extends CatalogImageLoraDefinition {
  guide: CatalogLoraGuideLocale;
}

const allBuiltinImageLoras: readonly BuiltinImageLora[] = IMAGE_LORA_DEFINITIONS
  .slice()
  .sort((left, right) => right.catalogOrder - left.catalogOrder)
  .map((definition) => ({
    ...definition,
    guide: loraLocaleFor(definition.id)?.guide ?? {
      summary: definition.name,
      recommendedStrength: `固定 ${definition.strength}`,
      effects: "",
      stacking: "",
      compatibility: "",
      source: ""
    }
  }));

export const BUILTIN_IMAGE_LORAS: readonly BuiltinImageLora[] = allBuiltinImageLoras;

export function imageLoraDefinition(id: string): BuiltinImageLora | undefined {
  return allBuiltinImageLoras.find((lora) => lora.id === id);
}

export function imageLoraCompatibleWithModel(
  lora: Pick<ImageLoraSelection, "compatibleModelIds">,
  modelId: string
): boolean {
  return lora.compatibleModelIds.includes(modelId);
}

export function imageLoraSelection(
  definition: ImageLoraSelection,
  strength = definition.strength,
  filename = definition.filename
): ImageLoraSelection {
  return {
    id: definition.id,
    name: definition.name,
    filename,
    strength,
    modelFamily: definition.modelFamily,
    compatibleModelIds: [...definition.compatibleModelIds],
    compatibleInputModes: [...definition.compatibleInputModes],
    ...(definition.promptPrefixes ? { promptPrefixes: [...definition.promptPrefixes] } : {}),
    ...(definition.workflowProfile ? { workflowProfile: definition.workflowProfile } : {})
  };
}

export function imageLoraUsesQwenImage21Fix(
  lora: Pick<ImageLoraSelection, "id" | "workflowProfile"> | undefined
): boolean {
  if (!lora) return false;
  return lora.workflowProfile === "qwen-image-2-1-fix" ||
    imageLoraDefinition(lora.id)?.workflowProfile === "qwen-image-2-1-fix";
}

export function promptContainsImageLoraTrigger(prompt: string, trigger: string): boolean {
  const normalizedPrompt = prompt.replace(/\s+/gu, " ").trim().toLowerCase();
  const normalizedTrigger = trigger.replace(/\s+/gu, " ").trim().toLowerCase();
  if (!normalizedTrigger) return true;
  let searchFrom = 0;
  while (searchFrom < normalizedPrompt.length) {
    const index = normalizedPrompt.indexOf(normalizedTrigger, searchFrom);
    if (index < 0) return false;
    const before = normalizedPrompt[index - 1];
    const after = normalizedPrompt[index + normalizedTrigger.length];
    const isTokenCharacter = (value: string | undefined): boolean =>
      Boolean(value && /[\p{L}\p{N}]/u.test(value));
    if (!isTokenCharacter(before) && !isTokenCharacter(after)) return true;
    searchFrom = index + normalizedTrigger.length;
  }
  return false;
}

export function imagePromptForLoras(
  prompt: string,
  loras: readonly ImageLoraSelection[] | undefined
): string {
  const prefixes = [...new Set((loras ?? []).flatMap((lora) =>
    lora.promptPrefixes ?? imageLoraDefinition(lora.id)?.promptPrefixes ?? []
  ).map((prefix) => prefix.trim()).filter(Boolean))];
  const normalizedPrompt = prompt.trim();
  const missingPrefixes = prefixes.filter((prefix) =>
    !promptContainsImageLoraTrigger(normalizedPrompt, prefix)
  );
  if (!missingPrefixes.length) return normalizedPrompt;
  const triggerText = missingPrefixes.join(", ");
  return normalizedPrompt ? triggerText + ", " + normalizedPrompt : triggerText;
}

export function detectedImageLoraFilename(profile: ModelScanProfile | undefined): string {
  const match = profile?.components.flatMap((component) => component.matches)[0];
  if (!match) return "";
  const normalized = match.replaceAll("\\", "/");
  const markerIndex = normalized.toLowerCase().lastIndexOf("loras/");
  return markerIndex >= 0 ? normalized.slice(markerIndex + "loras/".length) : "";
}

export function profileProvidesImageLora(
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

export function normalizeImageLoras(value: unknown, _modelId = ""): ImageLoraSelection[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<ImageLoraSelection>;
    if (typeof candidate.id !== "string" || seen.has(candidate.id)) return [];
    const definition = imageLoraDefinition(candidate.id);
    if (!definition) return [];
    seen.add(candidate.id);
    const strength = typeof candidate.strength === "number" && Number.isFinite(candidate.strength)
      ? Math.max(0, Math.min(2, candidate.strength))
      : definition.strength;
    return [imageLoraSelection(
      definition,
      strength,
      typeof candidate.filename === "string" && candidate.filename.trim()
        ? candidate.filename.trim()
        : definition.filename
    )];
  });
}

export function imageLoraConfigurationError(
  loras: readonly ImageLoraSelection[] | undefined,
  modelId: string,
  pictureCount: number
): string {
  if (!loras?.length) return "";
  if (loras.length > 1) return "当前图片 LoRA 路径一次只支持一个图片 LoRA。";
  const lora = loras[0]!;
  const definition = imageLoraDefinition(lora.id);
  if (!definition) return `图片 LoRA ${lora.name || lora.id} 尚未登记，无法加入队列。`;
  if (!imageLoraCompatibleWithModel(definition, modelId)) {
    return `${definition.name} 不兼容当前图片模型。`;
  }
  if (definition.requiredPictureCount !== undefined && pictureCount !== definition.requiredPictureCount) {
    return `${definition.name} 需要正好 ${definition.requiredPictureCount} 张 Picture：Picture 1 为目标视角粗渲染，Picture 2 为原图。`;
  }
  return "";
}
