import type { EnhanceRequest, ImagePromptPreset } from "../types.js";
import {
  qwenImageEditPromptContract,
  qwenImageEditPromptUserContent
} from "./prompts/qwen-image-edit/index.js";
import {
  zImagePromptContract,
  zImagePromptUserContent
} from "./z-image-prompt.js";
import {
  hidreamO1PromptContract,
  hidreamO1PromptUserContent
} from "./hidream-o1-prompt.js";
import {
  omnigen2PromptContract,
  omnigen2PromptUserContent
} from "./omnigen2-prompt.js";
import {
  parsePromptAnnotations,
  promptAnnotationInstruction
} from "./prompt-annotations.js";

export {
  qwenImageEditPromptContract as qwenImageEditEnhancerContract
} from "./prompts/qwen-image-edit/index.js";

export function isZImageTargetModel(modelId: string | undefined): boolean {
  return modelId === "z-image" || modelId === "z-image-turbo";
}

export function isHiDreamO1TargetModel(modelId: string | undefined): boolean {
  return modelId === "hidream-o1-image";
}

export function isOmniGen2TargetModel(modelId: string | undefined): boolean {
  return modelId === "omnigen2";
}

export function imageEditPromptContractForTarget(
  modelId: string | undefined,
  preset: ImagePromptPreset,
  presetText = "",
  outputMode: "plain" | "writer" = "plain"
): string {
  if (isOmniGen2TargetModel(modelId)) {
    return omnigen2PromptContract(preset, presetText, outputMode);
  }
  if (isHiDreamO1TargetModel(modelId)) {
    return hidreamO1PromptContract(preset, presetText, outputMode);
  }
  return isZImageTargetModel(modelId)
    ? zImagePromptContract(preset, presetText, outputMode)
    : qwenImageEditPromptContract(preset, presetText, outputMode);
}

export function imageEditPromptUserContentForTarget(request: EnhanceRequest): string {
  const parsedPrompt = parsePromptAnnotations(request.prompt);
  const sourceRequest = parsedPrompt.annotations.length
    ? { ...request, prompt: parsedPrompt.prompt }
    : request;
  const content = isOmniGen2TargetModel(request.imageTargetModelId)
    ? omnigen2PromptUserContent(sourceRequest)
    : isHiDreamO1TargetModel(request.imageTargetModelId)
      ? hidreamO1PromptUserContent(sourceRequest)
      : isZImageTargetModel(request.imageTargetModelId)
        ? zImagePromptUserContent(sourceRequest)
        : qwenImageEditPromptUserContent(sourceRequest);
  const annotationInstruction = promptAnnotationInstruction(parsedPrompt);
  return [annotationInstruction, content].filter(Boolean).join("\n\n");
}
