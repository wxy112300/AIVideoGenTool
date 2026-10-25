import type { EnhanceRequest, ImagePromptPreset } from "../types.js";
import { createDefaultQwenImagePromptPresets } from "./prompts/qwen-image-edit/content.js";
import { createDefaultQwenImage21PromptPresets } from "./prompts/qwen-image-2-1/content.js";

export function mossImagePromptContract(preset: ImagePromptPreset, presetText = "", outputMode: "plain" | "writer" = "plain"): string {
  // Existing settings store shared image presets. Factory Qwen instructions
  // must not quietly turn a MOSS text-to-image request into reference editing.
  const factoryRules = [createDefaultQwenImagePromptPresets()[preset], createDefaultQwenImage21PromptPresets()[preset]];
  const custom = presetText.trim() && !factoryRules.includes(presetText.trim()) ? presetText.trim() : "";
  return [
    "You write prompts for MOSS-Image, a text-to-image model supporting natural language, tag sequences and JSON layouts.",
    "Describe one generated image: subjects, count, attributes, spatial relationships, composition, lighting and materials. Preserve the user's intent, proper nouns and exact visible text in its original language. Do not invent reference images or source-preservation instructions. This checkpoint has no image-edit, Paint, mask or alpha input.",
    preset === "faithful" ? "Clarify the request without adding unrequested content or style." : "Add only useful visual detail consistent with the requested scene and composition.",
    "If the user supplies a JSON layout, retain valid JSON, its schema, object identities, coordinates, exact text and layout constraints. Do not convert the layout to prose or invent keys. For a natural-language request, return one direct English paragraph and retain quoted visible text verbatim. Do not force a JSON schema onto ordinary prose.",
    outputMode === "writer" ? "Put only the final prompt or serialized JSON layout in detailed_description; leave video/audio fields empty." : "Return only the final prompt or JSON layout, without Markdown fences, commentary, negative prompts, quality slogans, video or audio fields.",
    ...(custom ? [`Additional user preset (within this text-to-image capability):\n${custom}`] : [])
  ].join("\n");
}
export function mossImagePromptUserContent(request: EnhanceRequest): string {
  return `Target: MOSS-Image text-to-image. Rewrite the following request under the MOSS prompt contract.\n\n${request.prompt.trim()}`;
}
export function normalizeMossImagePromptOutput(output: string): string {
  const text = output.replace(/<think>[\s\S]*?<\/think>/giu, "").trim()
    .replace(/^```(?:json|text|markdown)?\s*/iu, "").replace(/\s*```$/u, "").trim();
  if (!text) throw new Error("MOSS 提示词增强没有返回内容。");
  if (text.startsWith("{")) {
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw new Error("MOSS 布局增强返回了无效 JSON，请保留原稿并重试。"); }
    if (value && typeof value === "object" && "detailed_description" in value && typeof value.detailed_description === "string") {
      return normalizeMossImagePromptOutput(value.detailed_description);
    }
  }
  return text;
}
