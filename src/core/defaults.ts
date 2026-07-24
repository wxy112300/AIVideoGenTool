import type { AppState, Draft, Settings } from "../types.js";

export const defaultPrompt =
  "人物自然地看向镜头，头发被微风吹动，镜头缓慢推近，动作真实流畅。";

export function createDefaultDraft(): Draft {
  return {
    startImagePath: "",
    endImagePath: "",
    promptVersions: [
      {
        id: crypto.randomUUID(),
        label: "原始",
        text: defaultPrompt,
        createdAt: new Date().toISOString()
      }
    ],
    activePromptVersion: 0,
    modelId: "wan22_5b",
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
    startImagePath: "",
    endImagePath: "",
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
    lmStudioUrl: "http://127.0.0.1:1234/v1",
    lmStudioModel: "",
    outputDirectory: "",
    modelDirectory: "",
    defaultVideoModel: "wan22_5b",
    vramReserveGb: 2,
    autoOffload: true,
    safeCancel: true,
    optimizeQueue: true,
    promptLanguage: "auto",
    promptCreativity: 0.7,
    defaultUpscaleModel: "seedvr2",
    proxyEnabled: false,
    proxyUrl: "http://127.0.0.1:7890",
    promptSystemTemplate:
      "你是视频生成提示词助手。保留主体身份与用户意图，把输入扩写为一段连贯、可直接用于图生视频模型的中文提示词。只返回提示词，不要解释。"
  };
}

export function createDefaultState(): AppState {
  return {
    schemaVersion: 1,
    draft: createDefaultDraft(),
    settings: createDefaultSettings(),
    queue: [],
    history: [],
    queueRunning: false
  };
}
