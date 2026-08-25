import type { EnhanceRequest, ImagePromptPreset } from "../types.js";
import {
  qwenImageEditPromptContract,
  qwenImageEditPromptUserContent
} from "./prompts/qwen-image-edit/index.js";
import {
  zImagePromptContract,
  zImagePromptUserContent
} from "./z-image-prompt.js";

export {
  qwenImageEditPromptContract as qwenImageEditEnhancerContract
} from "./prompts/qwen-image-edit/index.js";

export function isZImageTargetModel(modelId: string | undefined): boolean {
  return modelId === "z-image" || modelId === "z-image-turbo";
}

export function imageEditPromptContractForTarget(
  modelId: string | undefined,
  preset: ImagePromptPreset,
  presetText = "",
  outputMode: "plain" | "writer" = "plain"
): string {
  return isZImageTargetModel(modelId)
    ? zImagePromptContract(preset, presetText, outputMode)
    : qwenImageEditPromptContract(preset, presetText, outputMode);
}

export function imageEditPromptUserContentForTarget(request: EnhanceRequest): string {
  return isZImageTargetModel(request.imageTargetModelId)
    ? zImagePromptUserContent(request)
    : qwenImageEditPromptUserContent(request);
}
