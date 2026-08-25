import { qwenImageEditPromptContract, qwenImageEditPromptUserContent } from "./prompts/qwen-image-edit/index.js";
import { zImagePromptContract, zImagePromptUserContent } from "./z-image-prompt.js";
export { qwenImageEditPromptContract as qwenImageEditEnhancerContract } from "./prompts/qwen-image-edit/index.js";
export function isZImageTargetModel(modelId) {
    return modelId === "z-image" || modelId === "z-image-turbo";
}
export function imageEditPromptContractForTarget(modelId, preset, presetText = "", outputMode = "plain") {
    return isZImageTargetModel(modelId)
        ? zImagePromptContract(preset, presetText, outputMode)
        : qwenImageEditPromptContract(preset, presetText, outputMode);
}
export function imageEditPromptUserContentForTarget(request) {
    return isZImageTargetModel(request.imageTargetModelId)
        ? zImagePromptUserContent(request)
        : qwenImageEditPromptUserContent(request);
}
