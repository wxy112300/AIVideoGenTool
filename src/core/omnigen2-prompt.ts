import type { EnhanceRequest, ImagePromptPreset } from "../types.js";

const omnigen2ReferenceContract = [
  "You are preparing an English prompt for the official OmniGen2 image workflow.",
  "OmniGen2 supports text-to-image with no references, instruction-based editing with one reference Picture, and multi-image composition with up to two reference Pictures.",
  "When references exist, use explicit labels such as Picture 1 and Picture 2. State what should be preserved from each Picture and what should change.",
  "For viewpoint changes, describe the new camera angle, viewing direction, subject orientation, perspective, framing, depth, and spatial relationships.",
  "For detail enhancement, identify the exact subject or region and describe material, texture, edge quality, lighting, shadow, reflections, and natural integration.",
  "Preserve identity, proportions, composition, readable text, numbers, logos, and proper nouns unless the user explicitly requests a change.",
  "If a Mask or annotation is present, treat it as location-only guidance: edit only the intended region, never reproduce marks or labels, and keep unrelated pixels unchanged.",
  "Return one concise, concrete English image prompt only. Do not add headings, bullets, JSON, a negative prompt, or meta commentary."
].join("\n");

export function omnigen2PromptContract(
  preset: ImagePromptPreset,
  presetText = "",
  outputMode: "plain" | "writer" = "plain"
): string {
  const modeInstruction = outputMode === "writer"
    ? "Write polished natural-language instructions with explicit spatial relationships and photographic or material details."
    : "Keep the result direct and operational, with the requested subject, action, composition, and visual constraints stated explicitly.";
  const presetInstruction = preset === "faithful"
    ? "Faithful mode: preserve the user's exact operation, subject identity, attributes, quantity, visible text, composition, and explicit constraints. Clarify only what is needed to execute the request."
    : "Detail-enhance mode: preserve the user's edit scope, then add useful visual execution details without inventing unrelated objects or style changes.";
  return `${omnigen2ReferenceContract}\n${modeInstruction}\n${presetInstruction}`;
}

export function omnigen2PromptUserContent(request: EnhanceRequest): string {
  const referenceCount = request.imagePaths?.length || (request.imagePath ? 1 : 0);
  const referenceInstruction = referenceCount === 0
    ? "There is no reference image. Compose a new image from the user's text as a text-to-image prompt."
    : referenceCount === 1
      ? "There is one reference image, which the workflow exposes as Picture 1. Write an instruction-edit prompt that clearly separates preserved content from requested changes."
      : "There are two reference images, exposed as Picture 1 and Picture 2. Explicitly map every requested subject or visual attribute to the correct Picture and describe how they should be combined.";
  return [
    referenceInstruction,
    "Rewrite and enhance the following user request for OmniGen2 while preserving its intent:",
    request.referenceContext?.trim() ? `Reference map:\n${request.referenceContext.trim()}` : "",
    request.prompt.trim()
  ].filter(Boolean).join("\n\n");
}
