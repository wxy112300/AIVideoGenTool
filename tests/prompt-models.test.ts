import { describe, expect, it } from "vitest";
import {
  isUnconcernedPromptModel,
  promptRuntimeForSettings,
  unconcernedPromptModelId
} from "../src/core/prompt-models.js";

describe("prompt model runtime selection", () => {
  it("routes the Unconcerned model to the app-managed llama-server", () => {
    expect(isUnconcernedPromptModel(unconcernedPromptModelId)).toBe(true);
    expect(promptRuntimeForSettings({
      promptModelId: unconcernedPromptModelId,
      promptRuntime: "comfyui",
      promptUseLmStudio: false
    })).toBe("llama-server");
  });

  it("keeps native Qwen on ComfyUI unless another runtime is selected", () => {
    expect(promptRuntimeForSettings({
      promptModelId: "qwen/qwen3.5-4b",
      promptRuntime: "comfyui",
      promptUseLmStudio: false
    })).toBe("comfyui");
    expect(promptRuntimeForSettings({
      promptModelId: "qwen/qwen3.5-4b",
      promptRuntime: "lmstudio",
      promptUseLmStudio: true
    })).toBe("lmstudio");
  });
});