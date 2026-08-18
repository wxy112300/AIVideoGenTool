import type { AppState, Draft, Settings } from "../types.js";
import {
  createDefaultH3PromptPresets,
  createDefaultQwenImagePromptPresets,
  createDefaultH3AutoPromptSeedInstructions
} from "./prompts/index.js";
import { createDefaultImageEditDraft } from "./draft-defaults.js";

export const defaultPrompt =
  "The subject naturally looks toward the camera as a light breeze moves their hair; the camera slowly pushes in with realistic, fluid motion.";

export { createDefaultImageEditDraft } from "./draft-defaults.js";

export function createDefaultImagePromptPresets(): Record<"faithful" | "detail-enhance", string> {
  return createDefaultQwenImagePromptPresets();
}

export function createDefaultDraft(): Draft {
  return {
    inputMode: "image",
    startImagePath: "",
    sourceWidth: 0,
    sourceHeight: 0,
    endImagePath: "",
    sourceVideoPath: "",
    sourceVideoDuration: 0,
    trimStartSeconds: 0,
    trimEndSeconds: 0,
    promptVersions: [
      {
        id: crypto.randomUUID(),
        label: "原始",
        text: defaultPrompt,
        createdAt: new Date().toISOString()
      }
    ],
    activePromptVersion: 0,
    extensionPromptVersions: [
      {
        id: crypto.randomUUID(),
        label: "原始",
        text: defaultPrompt,
        createdAt: new Date().toISOString()
      }
    ],
    extensionActivePromptVersion: 0,
    h3ReferenceSlots: [],
    modelId: "minimax_h3_fl2va",
    videoLoras: [],
    workflowPath: "",
    ratio: "source",
    resolution: 480,
    duration: 5,
    steps: 20,
    fps: 24,
    frameInterpolation: "off",
    motion: "natural",
    seed: null,
    keepSeedOnCopy: false,
    spectrumMode: "off",
    spectrumModelAwareMode: "off",
    spectrumModeUserSet: false
  };
}

export { createClearedDraft } from "./draft-defaults.js";

export function createDefaultSettings(): Settings {
  return {
    comfyUrl: "http://127.0.0.1:8188",
    comfyInstallDirectory: "",
    comfyPythonPath: "",
    lmStudioUrl: "http://127.0.0.1:1234/v1",
    lmStudioModel: "",
    lmStudioInstallDirectory: "",
    promptUseLmStudio: false,
    promptRuntime: "comfyui",
    promptModelId: "community/gemma-4-e4b-unconcerned-q5",
    h3AutoPromptSeedId: "",
    h3AutoPromptSeedInstructions: createDefaultH3AutoPromptSeedInstructions(),
    promptModelDirectory: "",
    promptLlamaServerPath: "",
    promptLlamaPort: 8091,
    h3PromptPresets: createDefaultH3PromptPresets(),
    imagePromptPresets: createDefaultImagePromptPresets(),
    outputDirectory: "",
    imageOutputDirectory: "",
    imageInputLibraryDirectory: "",
    modelDirectory: "",
    defaultVideoModel: "minimax_h3_fl2va",
    defaultExtensionModel: "minimax_h3_ref2va",
    defaultImageModel: "qwen-image-edit-2511",
    defaultImageQualityProfile: "balanced-20",
    imageOutputCount: 6,
    imageOutputFormat: "png",
    vramReserveGb: 1,
    h3AttentionMode: "sage",
    h3LivePreview: false,
    autoOffload: true,
    ltxExtensionModelProfile: "q3_k_m",
    ltxExtensionResolution: 360,
    ltxExtensionFrames: 49,
    ltxExtensionOverlapFrames: 16,
    ltxExtensionUnloadBetweenStages: true,
    ltxExtensionTimeoutMinutes: 20,
    safeCancel: true,
    autoRetryFailedTasks: true,
    autoRetryCount: 2,
    uiLocale: "zh-CN",
    promptLanguage: "auto",
    promptCreativity: 0.7,
    defaultUpscaleModel: "seedvr2",
    upscaleTileMode: "safe",
    upscaleFaceRestore: false,
    seedVr2Model: "seedvr2_ema_3b_fp8_e4m3fn.safetensors",
    realEsrganModel: "RealESRGAN_x4plus.safetensors",
    proxyEnabled: false,
    proxyUrl: "http://127.0.0.1:7890",
    hfMirrorEnabled: false,
  };
}

export function createDefaultState(): AppState {
  return {
    schemaVersion: 12,
    draft: createDefaultDraft(),
    imageDraft: createDefaultImageEditDraft(),
    settings: createDefaultSettings(),
    queue: [],
    history: [],
    imageHistory: [],
    queueRunning: false,
    queueStartedAt: undefined,
    queueLifecycle: "idle",
    queueLifecycleStartedAt: undefined
  };
}
