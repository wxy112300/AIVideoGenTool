import { describe, expect, it } from "vitest";
import {
  isGemmaPromptModel,
  isManagedPromptModel,
  managedPromptModel,
  managedPromptModelDefinitions,
  promptModelBackend,
  promptModelSupportsImageEdit,
  promptRuntimeForSettings
} from "../src/core/prompt-models.js";

describe("prompt model runtime selection", () => {
  it("routes all ten selectable prompt models to a real backend", () => {
    expect(managedPromptModelDefinitions).toHaveLength(8);
    for (const model of managedPromptModelDefinitions) {
      expect(promptModelBackend(model.id)).toBe("h3-prompt-writer");
      expect(promptModelSupportsImageEdit(model.id)).toBe(true);
    }
    for (const modelId of ["qwen/qwen3.5-4b", "qwen/qwen3.5-2b"]) {
      expect(promptModelBackend(modelId)).toBe("native-text-generate");
      expect(promptModelSupportsImageEdit(modelId)).toBe(true);
    }
  });

  it("runs Gemma 4 through the ComfyUI Prompt Writer without replacing Qwen", () => {
    const modelId = "google/gemma-4-26b-a4b-q4";
    expect(isGemmaPromptModel(modelId)).toBe(true);
    expect(isManagedPromptModel(modelId)).toBe(true);
    expect(managedPromptModel(modelId)).toMatchObject({
      contextSize: 16384,
      modelFilename: "gemma-4-26B-A4B-it-UD-Q4_K_M.gguf",
      mmprojFilename: "mmproj-BF16.gguf"
    });
    expect(promptRuntimeForSettings({
      promptModelId: modelId,
      promptRuntime: "comfyui",
      promptUseLmStudio: false
    })).toBe("comfyui");
    expect(promptRuntimeForSettings({
      promptModelId: "qwen/qwen3.5-4b",
      promptRuntime: "comfyui",
      promptUseLmStudio: false
    })).toBe("comfyui");
  });

  it("keeps the low-refusal Gemma option inside the ComfyUI runtime", () => {
    const modelId = "community/gemma-4-e4b-unconcerned-q5";
    expect(isGemmaPromptModel(modelId)).toBe(true);
    expect(managedPromptModel(modelId)).toMatchObject({
      modelFilename: "gemma-4-E4B-it-ultra-uncensored-heretic-Q5_K_M.gguf",
      mmprojFilename: "gemma-4-E4B-it-mmproj-BF16.gguf",
      targetDirectory: "LLM/gemma-4-e4b-unconcerned-q5"
    });
    expect(promptRuntimeForSettings({
      promptModelId: modelId,
      promptRuntime: "llama-server",
      promptUseLmStudio: true
    })).toBe("comfyui");
  });

  it("offers balanced and 4090-class Uncensored Gemma tiers", () => {
    expect(managedPromptModel("community/gemma-4-12b-uncensored-q4")).toMatchObject({
      modelFilename: "gemma-4-12b-it-uncensored-Q4_K_M.gguf",
      mmprojFilename: "mmproj-gemma-4-12B-it-bf16.gguf"
    });
    expect(managedPromptModel("community/gemma-4-26b-a4b-uncensored-q4")).toMatchObject({
      modelFilename: "gemma-4-26B-A4B-it-ultra-uncensored-heretic-Q4_K_M.gguf",
      mmprojFilename: "gemma-4-26B-A4B-it-mmproj-BF16.gguf"
    });
    expect(isGemmaPromptModel("community/gemma-4-12b-uncensored-q4")).toBe(true);
    expect(isGemmaPromptModel("community/gemma-4-26b-a4b-uncensored-q4")).toBe(true);
  });

  it("migrates every legacy runtime selection to ComfyUI", () => {
    expect(promptRuntimeForSettings({
      promptModelId: "qwen/qwen3.5-4b",
      promptRuntime: "comfyui",
      promptUseLmStudio: false
    })).toBe("comfyui");
    expect(promptRuntimeForSettings({
      promptModelId: "qwen/qwen3.5-4b",
      promptRuntime: "lmstudio",
      promptUseLmStudio: true
    })).toBe("comfyui");
  });
});
