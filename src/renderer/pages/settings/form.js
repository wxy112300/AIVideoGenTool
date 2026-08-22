function value(id, fallback) {
    return document.querySelector(`#${id}`)?.value.trim() ?? fallback;
}
function directoryValue(id, fallback) {
    const input = document.querySelector(`#${id}`);
    const raw = input?.value.trim() ?? fallback;
    const automatic = input?.dataset.autoDirectory?.trim() ?? "";
    return !fallback.trim() && automatic && raw.toLowerCase() === automatic.toLowerCase()
        ? ""
        : raw;
}
function checked(id, fallback) {
    return document.querySelector(`#${id}`)?.checked ?? fallback;
}
export function readSettingsFromForm(base, h3PromptPreset, imagePromptPreset) {
    const h3PromptPresets = {
        ...base.h3PromptPresets,
        [h3PromptPreset]: value("h3-prompt-preset-text", base.h3PromptPresets[h3PromptPreset])
    };
    const imagePromptPresets = {
        ...base.imagePromptPresets,
        [imagePromptPreset]: value("image-prompt-preset-text", base.imagePromptPresets[imagePromptPreset])
    };
    const h3AutoPromptSeedId = value("h3-auto-prompt-seed-setting", base.h3AutoPromptSeedId);
    const h3AutoPromptSeedInstructions = { ...base.h3AutoPromptSeedInstructions };
    if (h3AutoPromptSeedId) {
        h3AutoPromptSeedInstructions[h3AutoPromptSeedId] = value("h3-auto-prompt-seed-text", base.h3AutoPromptSeedInstructions[h3AutoPromptSeedId] ?? "");
    }
    return {
        comfyUrl: value("comfy-url", base.comfyUrl),
        comfyInstallDirectory: value("comfy-install-directory", base.comfyInstallDirectory),
        comfyPythonPath: value("comfy-python-path", base.comfyPythonPath),
        lmStudioUrl: value("lm-url", base.lmStudioUrl),
        lmStudioModel: value("lm-model", base.lmStudioModel),
        lmStudioInstallDirectory: value("lm-install-directory", base.lmStudioInstallDirectory),
        promptRuntime: "comfyui",
        promptUseLmStudio: false,
        promptModelId: value("prompt-model-id", base.promptModelId),
        h3AutoPromptSeedId,
        h3AutoPromptSeedInstructions,
        promptModelDirectory: value("prompt-model-directory", base.promptModelDirectory),
        promptLlamaServerPath: value("prompt-llama-server-path", base.promptLlamaServerPath),
        promptLlamaPort: base.promptLlamaPort,
        h3PromptPresets,
        imagePromptPresets,
        modelDirectory: value("model-directory", base.modelDirectory),
        outputDirectory: directoryValue("output-directory", base.outputDirectory),
        imageOutputDirectory: directoryValue("image-output-directory", base.imageOutputDirectory),
        imageInputLibraryDirectory: directoryValue("image-input-library-directory", base.imageInputLibraryDirectory),
        defaultVideoModel: value("default-video-model", base.defaultVideoModel),
        defaultExtensionModel: value("default-extension-model", base.defaultExtensionModel),
        defaultImageModel: value("default-image-model", base.defaultImageModel),
        defaultImageQualityProfile: value("image-quality-profile", base.defaultImageQualityProfile),
        imageOutputCount: Math.min(10, Math.max(1, Number(value("image-output-count-number", String(base.imageOutputCount))))),
        imageOutputFormat: "png",
        vramReserveGb: Number(value("vram-reserve", String(base.vramReserveGb))),
        h3AttentionMode: value("h3-attention-mode", base.h3AttentionMode),
        h3LivePreview: base.h3LivePreview,
        autoOffload: checked("auto-offload", base.autoOffload),
        ltxExtensionModelProfile: value("ltx-extension-model-profile", base.ltxExtensionModelProfile),
        ltxExtensionResolution: Number(value("ltx-extension-resolution", String(base.ltxExtensionResolution))),
        ltxExtensionFrames: Number(value("ltx-extension-frames", String(base.ltxExtensionFrames))),
        ltxExtensionOverlapFrames: 16,
        ltxExtensionUnloadBetweenStages: true,
        ltxExtensionTimeoutMinutes: Number(value("ltx-extension-timeout", String(base.ltxExtensionTimeoutMinutes))),
        safeCancel: checked("safe-cancel", base.safeCancel),
        autoRetryFailedTasks: checked("auto-retry-failed-tasks", base.autoRetryFailedTasks),
        autoRetryCount: Number(value("auto-retry-count", String(base.autoRetryCount))),
        uiLocale: value("ui-locale", base.uiLocale ?? "zh-CN"),
        promptLanguage: value("prompt-language", base.promptLanguage),
        promptCreativity: Number(value("prompt-creativity", String(base.promptCreativity))),
        defaultUpscaleModel: value("default-upscale-model", base.defaultUpscaleModel),
        upscaleTileMode: value("upscale-tile-mode", base.upscaleTileMode),
        upscaleFaceRestore: checked("upscale-face-restore", base.upscaleFaceRestore),
        seedVr2Model: value("seedvr2-model", base.seedVr2Model),
        realEsrganModel: value("realesrgan-model", base.realEsrganModel),
        proxyEnabled: checked("proxy-enabled", base.proxyEnabled),
        proxyUrl: value("proxy-url", base.proxyUrl),
        hfMirrorEnabled: checked("hf-mirror-enabled", base.hfMirrorEnabled)
    };
}
