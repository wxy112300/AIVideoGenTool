import type { EnhanceRequest, ImagePromptPreset } from "../types.js";
import { h3ImageEditGuide, h3ImageT2iGuide } from "./prompts/minimax-h3-image-guides.js";
import { createDefaultQwenImagePromptPresets } from "./prompts/qwen-image-edit/content.js";
import { createDefaultQwenImage21PromptPresets } from "./prompts/qwen-image-2-1/content.js";

export function h3ImagePromptContract(preset: ImagePromptPreset, presetText = "", mode: "plain" | "writer" = "plain"): string {
  const defaults = [createDefaultQwenImagePromptPresets()[preset], createDefaultQwenImage21PromptPresets()[preset]];
  return [
    "Write MiniMax H3 Image prompts using the official h3-image-prompt-writing Skill and the supplied T2I or Edit guide. Generate a still image, with no video or audio instructions.",
    "Use English visual narration. Preserve exact visible lettering and requested copy in their required language. Return the prompt itself, without headings, explanations, negative-prompt fields or generation settings. The canvas selection is supplied separately and must remain authoritative.",
    "For edits inspect images in supplied order. Use stable <Picture N> labels from the reference map and <Subject N> for independently preserved, changed or borrowed scopes. Do not invent source facts or describe an unseen target as observed. Use a single paragraph: source definitions, target overview and individual relationships, then changed/new content. Each fully preserved Subject gets its own exact '<Subject N> is fully preserved.' sentence; do not recaption retained appearance. Keep local edits local.",
    preset === "faithful" ? "Clarify the request while preserving its scope and constraints." : "Develop unspecified ordinary visual details only within the requested creative scope; never invent factual source data.",
    mode === "writer" ? "Put only the final image prompt in detailed_description. Other wrapper fields must be empty; no video/audio content." : "Return only the final plain-text image prompt.",
    ...(!defaults.includes(presetText.trim()) && presetText.trim() ? [`Additional user preset:\n${presetText.trim()}`] : [])
  ].join("\n");
}

export function h3ImagePromptUserContent(request: EnhanceRequest): string {
  const edit = Boolean(request.imagePaths?.length || request.referenceContext?.trim());
  return [edit ? h3ImageEditGuide : h3ImageT2iGuide,
    edit ? `Reference map (use its stable Picture labels):\n${request.referenceContext ?? "Use supplied image order."}` : "Text-to-image: no references are supplied. Do not invent Picture/Subject sources.",
    "User request:", request.prompt.trim()].join("\n\n");
}
