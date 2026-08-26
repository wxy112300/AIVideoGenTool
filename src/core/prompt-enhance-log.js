import { h3PromptModeForRequest, isH3ReferenceAutoPrompt } from "./h3-auto-prompter.js";
import { h3PromptPresetForMode } from "./h3-prompt-presets.js";
export function promptEnhanceLogContext(request) {
    const inputKind = request.prompt.trim()
        ? "user-text"
        : isH3ReferenceAutoPrompt(request)
            ? "reference-auto"
            : "empty";
    const autoSeedId = inputKind === "reference-auto"
        ? request.autoPromptSeedId?.trim() || null
        : null;
    const autoVariationId = inputKind === "reference-auto"
        ? request.autoPromptVariationId?.trim() || null
        : null;
    if (request.mode === "image-edit") {
        const selectedPreset = request.imageEditEnhanceMode ?? "detail-enhance";
        return {
            inputKind,
            presetFamily: "image-edit",
            selectedPreset,
            effectivePreset: selectedPreset,
            presetSource: request.imageEditEnhanceMode ? "selected" : "default",
            autoSeedId,
            autoVariationId
        };
    }
    const isH3 = request.mode === "h3-vision" || Boolean(request.h3PromptMode || request.h3PromptPreset || isH3ReferenceAutoPrompt(request));
    if (!isH3) {
        return {
            inputKind,
            presetFamily: "none",
            selectedPreset: null,
            effectivePreset: null,
            presetSource: "not-applicable",
            autoSeedId,
            autoVariationId
        };
    }
    const mode = h3PromptModeForRequest(request);
    const selectedPreset = request.h3PromptPreset ?? "official-storyboard";
    const effectivePreset = h3PromptPresetForMode(mode, selectedPreset);
    return {
        inputKind,
        presetFamily: "h3",
        selectedPreset,
        effectivePreset,
        presetSource: request.h3PromptPreset
            ? effectivePreset === selectedPreset ? "selected" : "mode-fallback"
            : "default",
        autoSeedId,
        autoVariationId
    };
}
