import type { ImagePromptPreset, ImageReferenceRole } from "../../../types.js";
import type { ImagePromptUiLocale, PromptPresetLocale } from "../types.js";

export const uiLocale: ImagePromptUiLocale = {
  originalVersion: "Original"
};

export const presetLocale: Record<ImagePromptPreset, PromptPresetLocale> = {
  faithful: { label: "Faithful rewrite", description: "Clarify only the user's explicit editing intent without adding unsupported subjects, materials, lighting, composition, or story." },
  "detail-enhance": { label: "Detail enhancement", description: "Add only execution details such as region, material, lighting, perspective, and edge blending without changing the edit scope." }
};

export const referenceRoleLocale: Record<ImageReferenceRole, string> = {
  base: "Base image",
  person: "Person",
  object: "Object",
  pose: "Pose",
  style: "Style",
  background: "Background",
  auto: "Automatic"
};
