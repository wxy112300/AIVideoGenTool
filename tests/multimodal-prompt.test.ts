import { describe, expect, it } from "vitest";
import {
  buildMultimodalPromptWorkflow,
  multimodalActivityTimeoutMinutes,
  multimodalDeviceFor,
  multimodalPromptTargetLanguage,
  multimodalRuntimeSelection
} from "../electron/services/multimodal-prompt.js";
import { createDefaultState } from "../src/core/defaults.js";

describe("Qwen3.6 ComfyUI prompt workflow", () => {
  it("resolves automatic output language from user text instead of the English system prompt", () => {
    const settings = createDefaultState().settings;
    settings.promptLanguage = "auto";

    expect(multimodalPromptTargetLanguage({
      prompt: "人物缓慢转身，镜头向前推进。",
      modelId: "minimax_h3_fl2va"
    }, settings)).toBe("zh");
    expect(multimodalPromptTargetLanguage({
      prompt: "The subject turns while the camera pushes in.",
      modelId: "minimax_h3_fl2va"
    }, settings)).toBe("en");

    settings.promptLanguage = "en";
    expect(multimodalPromptTargetLanguage({
      prompt: "人物缓慢转身。",
      modelId: "minimax_h3_fl2va"
    }, settings)).toBe("en");
  });

  it("does not let multilingual dialogue change the descriptive output language", () => {
    const settings = createDefaultState().settings;
    settings.promptLanguage = "auto";

    expect(multimodalPromptTargetLanguage({
      prompt: "A woman looks at the camera and says in Chinese: \"你好。\"",
      modelId: "minimax_h3_fl2va"
    }, settings)).toBe("en");
    expect(multimodalPromptTargetLanguage({
      prompt: "人物看向镜头，用英语说：\"I am ready!\"",
      modelId: "minimax_h3_fl2va"
    }, settings)).toBe("zh");
  });

  it("accepts Qwen3.8 only when both runtime enum values are registered", () => {
    const model = "LLM/qwen3.8-27b-uncensored-q4/Qwen3.8-27B-Uncensored-noMTP-Q4_K_M.gguf";
    const mmproj = "LLM/qwen3.8-27b-uncensored-q4/Qwen3.8-27B-Uncensored-vision-f16.gguf";
    const objectInfo = {
      VisionLLMNode: {
        input: {
          required: {
            model: [[model], {}],
            mmproj: [[mmproj, "(Auto-detect)", "(Not required)"], {}]
          }
        }
      }
    };

    expect(multimodalRuntimeSelection(
      objectInfo,
      "qwen/qwen3.8-27b-uncensored-q4"
    )).toEqual({ model, mmproj });
  });

  it("reports an actionable Qwen3.8 projector registration error before submission", () => {
    const model = "LLM/qwen3.8-27b-uncensored-q4/Qwen3.8-27B-Uncensored-noMTP-Q4_K_M.gguf";
    expect(() => multimodalRuntimeSelection({
      VisionLLMNode: {
        input: {
          required: {
            model: [[model], {}],
            mmproj: [[
              "LLM/qwen3.6-27b-uncensored-q4/mmproj-BF16.gguf",
              "(Auto-detect)",
              "(Not required)"
            ], {}]
          }
        }
      }
    }, "qwen/qwen3.8-27b-uncensored-q4"))
      .toThrow("旧节点只识别 mmproj 前缀");
  });

  it("uses measured free VRAM instead of forcing Qwen3.6/Qwen3.8 onto CPU", () => {
    expect(multimodalDeviceFor(
      "qwen/qwen3.6-27b-uncensored-q4",
      4.5 * 1024 ** 3,
      22.9 * 1024 ** 3
    )).toBe("CPU");
    expect(multimodalDeviceFor(
      "qwen/qwen3.6-27b-uncensored-q4",
      1 * 1024 ** 3,
      22.9 * 1024 ** 3
    )).toBe("GPU");
    expect(multimodalDeviceFor(
      "qwen/qwen3.8-27b-uncensored-q4",
      1.8 * 1024 ** 3,
      24 * 1024 ** 3
    )).toBe("GPU");
    expect(multimodalDeviceFor(
      "qwen/qwen3.8-27b-uncensored-q4",
      null,
      null
    )).toBe("CPU");
    expect(multimodalActivityTimeoutMinutes(
      "qwen/qwen3.6-27b-uncensored-q4",
      "CPU"
    )).toBe(20);
  });

  it("can render the VisionLLM workflow with an explicit CPU device", () => {
    const settings = createDefaultState().settings;
    settings.promptModelId = "qwen/qwen3.6-27b-uncensored-q4";
    const workflow = buildMultimodalPromptWorkflow(
      {
        prompt: "A person walks toward the camera.",
        modelId: "minimax_h3_fl2va",
        h3PromptMode: "I2VA"
      },
      ["studio-input-reference.png"],
      settings,
      false,
      "CPU"
    );

    expect(workflow["vision-llm"]?.inputs.device).toBe("CPU");
    expect(workflow["vision-llm"]?.inputs.keep_model_loaded).toBe(false);
  });

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
        max_tokens: 1920,
        temperature: 0.9,
        device: "GPU",
        image: ["image-budget-0", 0]
      }
    });
    expect(workflow["vision-llm"]?.inputs.prompt).toContain("do not include analysis");
    expect(workflow["image-budget-0"]).toMatchObject({
      class_type: "ImageScaleToTotalPixels",
      inputs: { image: ["load-image-0", 0], megapixels: 1, resolution_steps: 32 }
    });
    expect(workflow["image-batch-1"]).toBeUndefined();
    expect(workflow.preview.inputs.source).toEqual(["vision-llm", 0]);
  });

  it("caps detailed cinematic output at the VisionLLM schema maximum", () => {
    const settings = createDefaultState().settings;
    settings.promptModelId = "qwen/qwen3.6-27b-uncensored-q4";
    const workflow = buildMultimodalPromptWorkflow(
      {
        prompt: "",
        modelId: "minimax_h3_fl2va",
        mode: "h3-vision",
        promptStrategy: "reference-auto",
        autoPromptSeedId: "contextual-action-dialogue",
        autoPromptVariationId: "variation-7",
        h3PromptMode: "I2VA",
        h3PromptPreset: "detailed-cinematic",
        h3DurationSeconds: 15,
        imagePaths: ["reference.png"]
      },
      ["studio-input-reference.png"],
      settings
    );

    expect(workflow["vision-llm"]?.inputs.max_tokens).toBe(2048);
  });

  it("passes a concrete Chinese target language for automatic Chinese input", () => {
    const settings = createDefaultState().settings;
    settings.promptModelId = "qwen/qwen3.8-27b-uncensored-q4";
    settings.promptLanguage = "auto";
    const workflow = buildMultimodalPromptWorkflow({
      prompt: "人物看向镜头，然后缓慢后退。",
      modelId: "minimax_h3_fl2va",
      mode: "h3-vision",
      h3PromptMode: "I2VA"
    }, ["reference.png"], settings);

    expect(workflow["vision-llm"]?.inputs.target_language).toBe("zh");
    expect(workflow["vision-llm"]?.inputs.prompt).toContain("write explanatory H3 prose and field descriptions in Chinese");
  });

  it("passes an explicit dialogue ledger and protects foreign-language speech from the override", () => {
    const settings = createDefaultState().settings;
    settings.promptModelId = "qwen/qwen3.8-27b-uncensored-q4";
    settings.promptLanguage = "en";
    const workflow = buildMultimodalPromptWorkflow({
      prompt: "A woman looks at the camera and says in Chinese: \"你好。\"",
      modelId: "minimax_h3_fl2va",
      mode: "h3-vision",
      h3PromptMode: "T2VA"
    }, [], settings);
    const prompt = String(workflow["vision-llm"]?.inputs.prompt);

    expect(prompt).toContain("target output language applies only to explanatory H3 prose");
    expect(prompt).toContain("<d>[Chinese] 你好。</d>");
    expect(prompt).toContain("preserve each user's original language, characters, and punctuation exactly");
  });

  it("passes a blank reference-auto request as a visual generation instruction", () => {
    const settings = createDefaultState().settings;
    settings.promptModelId = "qwen/qwen3.6-27b-uncensored-q4";
    const workflow = buildMultimodalPromptWorkflow(
      {
        prompt: "",
        modelId: "minimax_h3_fl2va",
        mode: "h3-vision",
        promptStrategy: "reference-auto",
        autoPromptSeedId: "playful-surprise",
        autoPromptVariationId: "variation-9",
        h3PromptMode: "I2VA",
        h3DurationSeconds: 5,
        imagePaths: ["reference.png"]
      },
      ["studio-input-reference.png"],
      settings
    );

    const prompt = String(workflow["vision-llm"]?.inputs.prompt);
    expect(prompt).toContain("Reference-driven H3 auto-creation mode");
    expect(prompt).toContain("Variation token: variation-9");
    expect(prompt).toContain("playful response");
  });

  it("keeps the warmup request within the VisionLLM minimum token range", () => {
    const settings = createDefaultState().settings;
    settings.promptModelId = "qwen/qwen3.6-27b-uncensored-q4";
    const workflow = buildMultimodalPromptWorkflow(
      {
        prompt: "加载提示词模型并返回 READY。",
        modelId: "prompt-runtime-warmup",
        h3PromptMode: "I2VA"
      },
      [],
      settings,
      true,
      "GPU",
      true
    );

    expect(workflow["vision-llm"]?.inputs.max_tokens).toBe(64);
    expect(workflow["vision-llm"]?.inputs.keep_model_loaded).toBe(true);
  });
});
