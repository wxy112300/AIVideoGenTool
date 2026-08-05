import type { AppState, Draft, Settings } from "../types.js";

export const defaultPrompt =
  "人物自然地看向镜头，头发被微风吹动，镜头缓慢推近，动作真实流畅。";

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
    modelId: "minimax_h3_fl2va",
    workflowPath: "",
    ratio: "source",
    resolution: 480,
    duration: 5,
    fps: 24,
    frameInterpolation: "off",
    motion: "natural",
    seed: null,
    keepSeedOnCopy: false
  };
}

export function createClearedDraft(current: Draft): Draft {
  return {
    ...current,
    inputMode: "image",
    startImagePath: "",
    sourceWidth: 0,
    sourceHeight: 0,
    endImagePath: "",
    sourceVideoPath: "",
    sourceVideoDuration: 0,
    trimStartSeconds: 0,
    trimEndSeconds: 0,
    sourceAssetId: undefined,
    sourceVersionId: undefined,
    promptVersions: [
      {
        id: crypto.randomUUID(),
        label: "新建",
        text: "",
        createdAt: new Date().toISOString()
      }
    ],
    activePromptVersion: 0,
    seed: null
  };
}

export function createDefaultSettings(): Settings {
  return {
    comfyUrl: "http://127.0.0.1:8188",
    comfyInstallDirectory: "",
    lmStudioUrl: "http://127.0.0.1:1234/v1",
    lmStudioModel: "",
    lmStudioInstallDirectory: "",
    outputDirectory: "",
    modelDirectory: "",
    defaultVideoModel: "minimax_h3_fl2va",
    vramReserveGb: 1,
    h3AttentionMode: "sage",
    autoOffload: true,
    ltxExtensionModelProfile: "q3_k_m",
    ltxExtensionResolution: 360,
    ltxExtensionFrames: 49,
    ltxExtensionOverlapFrames: 16,
    ltxExtensionUnloadBetweenStages: true,
    ltxExtensionTimeoutMinutes: 20,
    safeCancel: true,
    optimizeQueue: true,
    promptLanguage: "auto",
    promptCreativity: 0.7,
    defaultUpscaleModel: "seedvr2",
    upscaleTileMode: "safe",
    upscaleFaceRestore: false,
    seedVr2Model: "seedvr2_ema_3b_fp8_e4m3fn.safetensors",
    realEsrganModel: "RealESRGAN_x4plus.safetensors",
    proxyEnabled: false,
    proxyUrl: "http://127.0.0.1:7890",
    promptSystemTemplate:
      "你是视频生成提示词助手。保留主体身份与用户意图，把输入扩写为一段连贯、可直接用于图生视频模型的中文提示词。只返回提示词，不要解释。"
  };
}

export function createDefaultState(): AppState {
  return {
    schemaVersion: 2,
    draft: createDefaultDraft(),
    settings: createDefaultSettings(),
    queue: [],
    history: [],
    queueRunning: false
  };
}
