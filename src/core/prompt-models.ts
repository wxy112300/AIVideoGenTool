export const unconcernedPromptModelId = "qwen/qwen3.5-4b-unconcerned";
export const unconcernedPromptModelName = "Qwen3.5 4B Unconcerned · 应用自管理";
export const unconcernedPromptModelSource = "HauhauCS/Qwen3.5-4B-Uncensored-HauhauCS-Aggressive";
export const unconcernedPromptModelFilename = "Qwen3.5-4B-Uncensored-HauhauCS-Aggressive-Q6_K.gguf";
export const unconcernedPromptMmprojFilename = "mmproj-Qwen3.5-4B-Uncensored-HauhauCS-Aggressive-BF16.gguf";

export function isUnconcernedPromptModel(modelId: string): boolean {
  return modelId === unconcernedPromptModelId;
}

export function promptRuntimeForSettings(settings: {
  promptModelId: string;
  promptRuntime?: "comfyui" | "lmstudio" | "llama-server";
  promptUseLmStudio?: boolean;
}): "comfyui" | "lmstudio" | "llama-server" {
  if (isUnconcernedPromptModel(settings.promptModelId)) return "llama-server";
  if (settings.promptRuntime === "llama-server") return "llama-server";
  if (settings.promptRuntime === "lmstudio" || settings.promptUseLmStudio) return "lmstudio";
  return "comfyui";
}
