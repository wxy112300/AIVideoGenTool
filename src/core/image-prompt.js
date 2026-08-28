import { qwenImageEditPromptContract, qwenImageEditPromptUserContent } from "./prompts/qwen-image-edit/index.js";
import { zImagePromptContract, zImagePromptUserContent } from "./z-image-prompt.js";
import { hidreamO1PromptContract, hidreamO1PromptUserContent } from "./hidream-o1-prompt.js";
import { omnigen2PromptContract, omnigen2PromptUserContent } from "./omnigen2-prompt.js";
import { parsePromptAnnotations, promptAnnotationInstruction } from "./prompt-annotations.js";
export { qwenImageEditPromptContract as qwenImageEditEnhancerContract } from "./prompts/qwen-image-edit/index.js";
export function isZImageTargetModel(modelId) {
    return modelId === "z-image" || modelId === "z-image-turbo";
}
export function isHiDreamO1TargetModel(modelId) {
    return modelId === "hidream-o1-image";
}
export function isOmniGen2TargetModel(modelId) {
    return modelId === "omnigen2";
}
export function imageEditPromptContractForTarget(modelId, preset, presetText = "", outputMode = "plain") {
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
export function imageEditPromptUserContentForTarget(request) {
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
