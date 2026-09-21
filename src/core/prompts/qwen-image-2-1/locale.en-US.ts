import type { ImagePromptPreset, ImageReferenceRole } from "../../../types.js";
import type { ImagePromptUiLocale, PromptPresetLocale } from "../types.js";

export const uiLocale: ImagePromptUiLocale = { originalVersion: "Original" };
export const presetLocale: Record<ImagePromptPreset, PromptPresetLocale> = {
  faithful: { label: "2.1 faithful rewrite", description: "Use Qwen Image 2.1 <imageN> reference syntax and clarify only the explicit edit intent." },
  "detail-enhance": { label: "2.1 detail enhancement", description: "Add only execution details such as region, material, lighting, and edge blending for Qwen Image 2.1." }
};
export const referenceRoleLocale: Record<ImageReferenceRole, string> = {
  base: "Base image", person: "Person", object: "Object", pose: "Pose", style: "Style", background: "Background", auto: "Automatic"
};
