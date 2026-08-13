import { describe, expect, it } from "vitest";
import { buildMultimodalPromptWorkflow } from "../electron/services/multimodal-prompt.js";
import { createDefaultState } from "../src/core/defaults.js";

describe("Qwen3.6 ComfyUI prompt workflow", () => {
  it("uses the VisionLLM node, the regular Q4 model, and GPU-safe prompt limits", () => {
    const settings = createDefaultState().settings;
    settings.promptModelId = "qwen/qwen3.6-27b-uncensored-q4";
    settings.promptCreativity = 1;
    const workflow = buildMultimodalPromptWorkflow(
      {
        prompt: "A person walks toward the camera.",
        modelId: "minimax_h3_fl2va",
        h3PromptMode: "R2V",
        h3DurationSeconds: 15
      },
      ["studio-input-reference.png"],
      settings
    );

    expect(workflow["vision-llm"]).toMatchObject({
      class_type: "VisionLLMNode",
      inputs: {
        model: "LLM/qwen3.6-27b-uncensored-q4/Qwen3.6-27B-Fable-Fus-711-UnHeretic-NM-DAU-NEO-MAX-NEO-Q4_K_M.gguf",
        mmproj: "LLM/qwen3.6-27b-uncensored-q4/mmproj-BF16.gguf",
        max_tokens: 1536,
        temperature: 0.9,
        device: "GPU",
        image: ["load-image-0", 0]
      }
    });
    expect(workflow["image-batch-1"]).toBeUndefined();
    expect(workflow.preview.inputs.source).toEqual(["vision-llm", 0]);
  });
});
