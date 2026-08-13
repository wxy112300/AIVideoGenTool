export type PromptModelBackend =
  | "h3-prompt-writer"
  | "native-text-generate"
  | "comfyui-multimodal";

export interface ManagedPromptModelDefinition {
  id: string;
  name: string;
  source: string;
  revision?: string;
  modelFilename: string;
  mmprojFilename: string;
  targetDirectory: string;
  contextSize: 8192 | 16384 | 24576 | 32768;
  badge: string;
  description: string;
  vram: string;
  licenseNote: string;
  /**
   * The ComfyUI-side adapter that owns model loading and unloading. Existing
   * Gemma entries intentionally omit this field and keep the H3 Prompt Writer
   * adapter for backwards-compatible persisted settings.
   */
  backend?: Exclude<PromptModelBackend, "native-text-generate">;
}

export const nativePromptModelFiles = {
  "qwen/qwen3.5-4b": "qwen3.5_4b_bf16.safetensors",
  "qwen/qwen3.5-2b": "qwen3.5_2b_bf16.safetensors"
} as const;

export const unconcernedPromptModelId = "qwen/qwen3.5-4b-unconcerned";
export const unconcernedPromptModelName = "Qwen3.5 4B Unconcerned · 应用自管理";
export const unconcernedPromptModelSource = "HauhauCS/Qwen3.5-4B-Uncensored-HauhauCS-Aggressive";
export const unconcernedPromptModelFilename = "Qwen3.5-4B-Uncensored-HauhauCS-Aggressive-Q6_K.gguf";
export const unconcernedPromptMmprojFilename = "mmproj-Qwen3.5-4B-Uncensored-HauhauCS-Aggressive-BF16.gguf";

export const managedPromptModelDefinitions: readonly ManagedPromptModelDefinition[] = [
  {
    id: "qwen/qwen3.6-27b-uncensored-q4",
    name: "Qwen3.6 27B Q4 · Uncensored · ComfyUI",
    source: "DavidAU/Qwen3.6-27B-Fable-Fusion-711-Uncensored-Heretic-NM-DAU-NEO-MAX-MTP-GGUF",
    revision: "main",
    modelFilename: "Qwen3.6-27B-Fable-Fus-711-UnHeretic-NM-DAU-NEO-MAX-NEO-Q4_K_M.gguf",
    mmprojFilename: "mmproj-BF16.gguf",
    targetDirectory: "LLM/qwen3.6-27b-uncensored-q4",
    contextSize: 8192,
    badge: "Uncensored · Q4 · 4090",
    description: "Qwen3.6 27B 的社区 Uncensored Q4 GGUF；通过 ComfyUI MultiModal Prompt Nodes 运行，支持参考图片理解。使用普通 Q4，不使用 MTP 变体。",
    vram: "Q4_K_M 约 18.5 GB + mmproj 约 0.93 GB；4090 单独运行",
    licenseNote: "社区衍生模型，采用 Apache-2.0 模型卡声明；请阅读上游模型卡。4090 运行前应释放 H3/图像模型，提示词完成后自动卸载。",
    backend: "comfyui-multimodal"
  },
  {
    id: "community/gemma-4-e4b-unconcerned-q5",
    name: "Gemma 4 E4B Q5 · Uncensored",
    source: "llmfan46/gemma-4-E4B-it-ultra-uncensored-heretic-GGUF",
    revision: "1465f37b7dbd15e91241ae78ffebecb9f25e15de",
    modelFilename: "gemma-4-E4B-it-ultra-uncensored-heretic-Q5_K_M.gguf",
    mmprojFilename: "gemma-4-E4B-it-mmproj-BF16.gguf",
    targetDirectory: "LLM/gemma-4-e4b-unconcerned-q5",
    contextSize: 8192,
    badge: "Uncensored · Q5",
    description: "Gemma 4 E4B 的社区低拒答多模态衍生版；保留图片与视频抽帧理解，适合普通模型拒绝扩写时手动选用。",
    vram: "Q5_K_M 5.76 GB + mmproj 0.99 GB",
    licenseNote: "社区衍生模型；使用前请阅读模型卡与 Gemma 使用条款，输出仍需由用户自行审核。"
  },
  {
    id: "community/gemma-4-12b-uncensored-q4",
    name: "Gemma 4 12B Q4 · Uncensored",
    source: "zaakirio/gemma-4-12b-it-uncensored-GGUF",
    revision: "32880562ac43cb589a85afb864309fdcaf486fae",
    modelFilename: "gemma-4-12b-it-uncensored-Q4_K_M.gguf",
    mmprojFilename: "mmproj-gemma-4-12B-it-bf16.gguf",
    targetDirectory: "LLM/gemma-4-12b-uncensored-q4",
    contextSize: 16384,
    badge: "Uncensored · Q4",
    description: "更强的社区 Uncensored 多模态档；适合复杂参考关系、长指令和需要更多画面细节的 H3 Prompt。",
    vram: "Q4_K_M 6.87 GB + mmproj 0.16 GB",
    licenseNote: "社区衍生模型；遵守 Gemma 使用条款。模型卡报告 Abliteration 只修改语言权重，多模态投影保持原版。"
  },
  {
    id: "community/gemma-4-26b-a4b-uncensored-q4",
    name: "Gemma 4 26B-A4B Q4 · Uncensored",
    source: "llmfan46/gemma-4-26B-A4B-it-ultra-uncensored-heretic-GGUF",
    revision: "aa470d4de039982e1924be4541bc4b45a3e8486d",
    modelFilename: "gemma-4-26B-A4B-it-ultra-uncensored-heretic-Q4_K_M.gguf",
    mmprojFilename: "gemma-4-26B-A4B-it-mmproj-BF16.gguf",
    targetDirectory: "LLM/gemma-4-26b-a4b-uncensored-q4",
    contextSize: 16384,
    badge: "Uncensored · MoE Q4",
    description: "Uncensored 质量上限档；MoE 每次只激活约 4B 参数，加载前仍需释放其它模型。",
    vram: "Q4_K_M · MoE",
    licenseNote: "社区衍生模型；使用前请阅读模型卡与 Gemma 使用条款。建议仅在 24GB 显卡上使用标准上下文。"
  },
  {
    id: "google/gemma-4-e4b-q3",
    name: "Gemma 4 E4B Q3 · 社区兼容档",
    source: "unsloth/gemma-4-E4B-it-GGUF",
    revision: "bfc15c382204943c3a8fff0c750b94ae2364d7a3",
    modelFilename: "gemma-4-E4B-it-Q3_K_M.gguf",
    mmprojFilename: "mmproj-BF16.gguf",
    targetDirectory: "LLM/gemma-4-e4b-q3",
    contextSize: 8192,
    badge: "社区兼容 · Q3",
    description: "H3 Prompt Writer 社区验证的轻量档；能理解图片和视频抽帧，但可能遗漏视觉细节。",
    vram: "Q3_K_M · 轻量视觉档",
    licenseNote: "Gemma 模型须遵守 Google Gemma 使用条款；GGUF 转换由 Unsloth 提供。"
  },
  {
    id: "google/gemma-4-12b-q4",
    name: "Gemma 4 12B Q4 · 社区紧凑档",
    source: "unsloth/gemma-4-12b-it-GGUF",
    revision: "fc034cfff751157913579611efad8462ac1be606",
    modelFilename: "gemma-4-12b-it-Q4_K_S.gguf",
    mmprojFilename: "mmproj-BF16.gguf",
    targetDirectory: "LLM/gemma-4-12b-q4",
    contextSize: 8192,
    badge: "社区紧凑 · Q4",
    description: "社区验证的紧凑多模态档，适合快速生成 H3 Prompt。",
    vram: "Q4_K_S · 紧凑多模态档",
    licenseNote: "Gemma 模型须遵守 Google Gemma 使用条款；GGUF 转换由 Unsloth 提供。"
  },
  {
    id: "google/gemma-4-12b-q5",
    name: "Gemma 4 12B Q5 · 社区标准档",
    source: "unsloth/gemma-4-12b-it-GGUF",
    revision: "fc034cfff751157913579611efad8462ac1be606",
    modelFilename: "gemma-4-12b-it-Q5_K_M.gguf",
    mmprojFilename: "mmproj-BF16.gguf",
    targetDirectory: "LLM/gemma-4-12b-q5",
    contextSize: 16384,
    badge: "社区标准 · Q5",
    description: "社区验证的通用多模态档；在视觉细节和上下文长度之间保持平衡。",
    vram: "Q5_K_M · 标准多模态档",
    licenseNote: "Gemma 模型须遵守 Google Gemma 使用条款；GGUF 转换由 Unsloth 提供。"
  },
  {
    id: "google/gemma-4-26b-a4b-q4",
    name: "Gemma 4 26B-A4B Q4 · 4090 社区推荐",
    source: "unsloth/gemma-4-26B-A4B-it-GGUF",
    revision: "c099eb48e663fd284577b04978a94ffccb261841",
    modelFilename: "gemma-4-26B-A4B-it-UD-Q4_K_M.gguf",
    mmprojFilename: "mmproj-BF16.gguf",
    targetDirectory: "LLM/gemma-4-26b-a4b-q4",
    contextSize: 16384,
    badge: "社区推荐 · MoE Q4",
    description: "H3 Prompt Writer 作者的质量/速度平衡档；运行前需要释放其它模型。",
    vram: "Q4_K_M · MoE",
    licenseNote: "Gemma 模型须遵守 Google Gemma 使用条款；GGUF 转换由 Unsloth 提供。"
  },
  {
    id: "google/gemma-4-31b-q4",
    name: "Gemma 4 31B Q4 · 大显存实验档",
    source: "unsloth/gemma-4-31B-it-GGUF",
    revision: "c1ac76e99d5513b141e8adde7288b85c3f9c32ec",
    modelFilename: "gemma-4-31B-it-UD-Q4_K_XL.gguf",
    mmprojFilename: "mmproj-BF16.gguf",
    targetDirectory: "LLM/gemma-4-31b-q4",
    contextSize: 16384,
    badge: "实验档 · Q4",
    description: "更强的视觉细节档，但更慢且不保证比 26B-A4B 生成更好的 H3 Prompt。",
    vram: "Q4_K_XL · 大上下文档",
    licenseNote: "Gemma 模型须遵守 Google Gemma 使用条款；GGUF 转换由 Unsloth 提供。"
  }
] as const;

export function managedPromptModel(modelId: string): ManagedPromptModelDefinition | undefined {
  return managedPromptModelDefinitions.find((model) => model.id === modelId);
}

export function isManagedPromptModel(modelId: string): boolean {
  return Boolean(managedPromptModel(modelId));
}

export function isGemmaPromptModel(modelId: string): boolean {
  const model = managedPromptModel(modelId);
  return Boolean(model && model.backend !== "comfyui-multimodal");
}

export function isComfyMultimodalPromptModel(modelId: string): boolean {
  return managedPromptModel(modelId)?.backend === "comfyui-multimodal";
}

export function comfyMultimodalPromptModel(
  modelId: string
): ManagedPromptModelDefinition | undefined {
  const model = managedPromptModel(modelId);
  return model?.backend === "comfyui-multimodal" ? model : undefined;
}

export function promptModelBackend(modelId: string): PromptModelBackend | null {
  if (modelId in nativePromptModelFiles) return "native-text-generate";
  const managed = managedPromptModel(modelId);
  if (managed) return managed.backend ?? "h3-prompt-writer";
  return null;
}

export function promptModelSupportsImageEdit(modelId: string): boolean {
  return promptModelBackend(modelId) !== null;
}

export function isUnconcernedPromptModel(modelId: string): boolean {
  return modelId === unconcernedPromptModelId;
}

export function promptRuntimeForSettings(settings: {
  promptModelId: string;
  promptRuntime?: "comfyui" | "lmstudio" | "llama-server";
  promptUseLmStudio?: boolean;
}): "comfyui" {
  // Legacy settings are intentionally ignored. Every supported prompt backend now
  // runs inside the selected ComfyUI instance.
  return "comfyui";
}
