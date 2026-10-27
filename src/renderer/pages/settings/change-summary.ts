import type { Settings } from "../../../types";
import type { Translate } from "../../../core/i18n";
import { uiKeys } from "../../../core/i18n-keys";
import { settingsText } from "./copy";

/** Presentation labels are independent of the currently mounted settings tab. */
export function settingsChangeSummary(keys: readonly (keyof Settings)[], t: Translate, locale: Settings["uiLocale"]): string {
  const s = (key: Parameters<typeof settingsText>[1]) => settingsText(locale, key);
  const k = uiKeys.settings.system;
  const labels: Record<keyof Settings, string> = {
    appearance: "",
    lanBrowserEnabled: t(uiKeys.lanBrowser.enabled), lanBrowserPort: t(uiKeys.lanBrowser.port),
    comfyUrl: t(k.serviceAddress), comfyInstallDirectory: t(k.installEntry), comfyPythonPath: s("accel.runtimeTitle"),
    lmStudioUrl: "LM Studio", lmStudioModel: "LM Studio", lmStudioInstallDirectory: "LM Studio",
    promptUseLmStudio: s("prompt.localModel"), promptRuntime: s("prompt.localModel"),
    promptModelId: s("prompt.defaultModel"), promptModelDirectory: s("prompt.title"),
    h3AutoPromptSeedId: s("prompt.autoVideoPresetSelection"), h3AutoPromptSeedInstructions: s("prompt.autoVideoPresetTitle"),
    strataInstallDirectory: s("strata.root"), strataModelDirectory: s("strata.root"), strataPort: s("strata.port"),
    strataUncensored: s("prompt.uncensored"), strataUncensoredMode: s("prompt.uncensored"), strataReasoningEffort: s("prompt.reasoning"),
    promptLlamaServerPath: s("nodes.llamaTitle"), promptLlamaPort: s("nodes.llamaTitle"),
    h3PromptPresets: s("prompt.videoPresetTitle"), imagePromptPresets: s("prompt.imagePresetTitle"),
    outputDirectory: t(k.videoOutputDirectory), imageOutputDirectory: t(k.imageOutputDirectory),
    libraryDirectory: t(k.libraryDirectory),
    imageInputLibraryDirectory: t(k.inputLibrary), modelDirectory: t(k.modelDirectory),
    defaultVideoModel: `${s("video.title")} · ${s("video.defaultModel")}`, defaultExtensionModel: s("video.defaultExtensionModel"),
    defaultImageModel: s("image.defaultModel"), defaultImageQualityProfile: s("image.defaultQuality"),
    imageOutputCount: t(uiKeys.create.imageEdit.outputCount), imageOutputFormat: t(uiKeys.create.videoSettings.outputTitle),
    vramReserveGb: t(k.vramReserve), h3AttentionMode: s("accel.mode"), h3SparseAttentionMode: s("accel.sparseMode"),
    h3RuntimeMode: s("accel.runtimeMode"), h3ComfyCompilerMode: s("accel.compilerMode"), h3VideoVaeMode: s("accel.videoVaeMode"),
    h3LivePreview: s("accel.title"), autoOffload: t(k.gpuPolicyTitle),
    ltxExtensionModelProfile: s("sulphur.transformer"), ltxExtensionResolution: s("sulphur.resolution"),
    ltxExtensionFrames: s("sulphur.frames"), ltxExtensionOverlapFrames: s("sulphur.title"),
    ltxExtensionUnloadBetweenStages: s("sulphur.title"), ltxExtensionTimeoutMinutes: s("sulphur.timeout"),
    safeCancel: t(k.safeCancel), autoRetryFailedTasks: t(k.autoRetry), autoRetryCount: t(k.retryCount),
    vramStallWatchdogMinutes: t(k.vramStallWatchdog), queueIsolationMode: t(k.queueIsolationMode),
    uiLocale: t(uiKeys.settings.localeTitle), promptLanguage: s("prompt.language"), promptCreativity: s("prompt.creativity"),
    defaultUpscaleModel: `${s("upscale.title")} · ${s("upscale.defaultModel")}`, upscaleTileMode: t(uiKeys.history.page.tileMode),
    upscaleFaceRestore: t(uiKeys.history.page.faceRestore), seedVr2Model: "SeedVR2", realEsrganModel: "Real-ESRGAN",
    proxyEnabled: t(k.enableProxy), proxyUrl: t(k.proxyAddress), hfMirrorEnabled: t(k.useHfMirror)
  };
  return [...new Set(keys.map(key => labels[key]).filter(Boolean))].join(s("shared.listSeparator"));
}
