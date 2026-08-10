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
}

export type PromptModelBackend = "h3-prompt-writer" | "native-text-generate";

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
    id: "community/gemma-4-e4b-unconcerned-q5",
    name: "Gemma 4 E4B Q5 · Uncensored",
    source: "llmfan46/gemma-4-E4B-it-ultra-uncensored-heretic-GGUF",
    revision: "1465f37b7dbd15e91241ae78ffebecb9f25e15de",
    modelFilename: "gemma-4-E4B-it-ultra-uncensored-heretic-Q5_K_M.gguf",
    mmprojFilename: "gemma-4-E4B-it-mmproj-BF16.gguf",
    targetDirectory: "LLM/gemma-4-e4b-unconcerned-q5",
    contextSize: 8192,
    badge: "约 7GB · Uncensored",
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
    badge: "约 8GB · Uncensored",
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
    badge: "24GB · Uncensored",
    description: "RTX 4090 的 Uncensored 质量上限档；MoE 每次只激活约 4B 参数，但加载前仍需释放 H3 和其它显存占用。",
    vram: "Q4_K_M · 24GB 上限档",
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
    badge: "8GB · 社区兼容",
    description: "H3 Prompt Writer 社区验证的最低显存档；能理解图片和视频抽帧，但可能遗漏视觉细节。",
    vram: "Q3_K_M · 约 8 GB 档",
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
    badge: "12GB · 紧凑",
    description: "社区验证的紧凑多模态档，适合显存有限或需要快速生成 H3 Prompt 的设备。",
    vram: "Q4_K_S · 约 12 GB 档",
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
    badge: "16GB · 标准",
    description: "社区验证的通用多模态档；在视觉细节、上下文长度和显存占用之间保持平衡。",
    vram: "Q5_K_M · 约 16 GB 档",
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
    badge: "24GB · 社区推荐",
    description: "H3 Prompt Writer 作者在 24GB 档的本地测试首选；运行前需要释放 H3 和其它显存占用。",
    vram: "Q4_K_M · 约 24 GB 档",
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
    badge: "32GB+ · 实验",
    description: "更强的视觉细节档，但更慢且不保证比 26B-A4B 生成更好的 H3 Prompt；普通 24GB 4090 不推荐。",
    vram: "Q4_K_XL · 约 32 GB 档",
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
  return Boolean(managedPromptModel(modelId));
}

export function promptModelBackend(modelId: string): PromptModelBackend | null {
  if (isGemmaPromptModel(modelId)) return "h3-prompt-writer";
  if (modelId in nativePromptModelFiles) return "native-text-generate";
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
