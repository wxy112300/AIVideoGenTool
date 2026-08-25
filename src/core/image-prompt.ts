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
  if (isOmniGen2TargetModel(request.imageTargetModelId)) {
    return omnigen2PromptUserContent(request);
  }
  if (isHiDreamO1TargetModel(request.imageTargetModelId)) {
    return hidreamO1PromptUserContent(request);
  }
  return isZImageTargetModel(request.imageTargetModelId)
    ? zImagePromptUserContent(request)
    : qwenImageEditPromptUserContent(request);
}
