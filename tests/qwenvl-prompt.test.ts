import { describe, expect, it } from "vitest";
import {
  buildQwenVlPeftPromptWorkflow,
  explainQwenVlRuntimeError,
  QwenVlRuntimeValidationError,
  validateQwenVlRuntimeChoices
} from "../electron/services/qwenvl-prompt.js";
import { qwenVlManagedMetadata } from "../electron/services/qwenvl-model-assets.js";
import { createDefaultState } from "../src/core/defaults.js";
import { evaluateModelProfiles } from "../electron/services/environment.js";

describe("MiniMax H3 Prompt Rewriter LoRA 8B", () => {
  const modelId = "lightx2v/minimax-h3-prompt-rewriter-8b";
  const base = "LLM/Qwen-VL/qwen3-vl-8b-instruct";
  const adapter = "LLM/Qwen-VL-LoRA/minimax-h3-prompt-rewriter-8b";
  const completeFiles = [
    ...Array.from({ length: 4 }, (_, index) =>
      `${base}/model-${String(index + 1).padStart(5, "0")}-of-00004.safetensors`
    ),
    `${adapter}/adapter_model.safetensors`
  ];

  it("scans the Qwen3-VL 8B base and exact LightX2V adapter", () => {
    const profile = evaluateModelProfiles(completeFiles, "q3_k_m", new Set())
      .find((item) => item.id === modelId);
    expect(profile).toMatchObject({
      available: true,
      integrated: true,
      requiredCustomNodeIds: ["comfyui-qwenvl-lora"]
    });
  });

  it("does not mark a partial base or adapter as ready", () => {
    const profiles = evaluateModelProfiles([
      `${base}/model-00001-of-00004.safetensors`,
      `${adapter}/adapter_model.safetensors`
    ], "q3_k_m", new Set());
    expect(profiles.find((item) => item.id === modelId)?.available).toBe(false);
  });

  it("uses direct URLs from the exact 8B repos", () => {
    const profile = evaluateModelProfiles([]).find((item) => item.id === modelId);
    const urls = profile?.components.map((component) => component.installGuide?.downloadUrl) ?? [];
    expect(urls).toHaveLength(5);
    expect(urls.every((url) => url?.includes("/resolve/main/") && !url.includes("/tree/") && !url.includes("/blob/"))).toBe(true);
    expect(urls).toContain("https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct/resolve/main/model-00004-of-00004.safetensors?download=true");
    expect(urls).toContain("https://huggingface.co/lightx2v/MiniMax-H3-Prompt-Rewriter-LoRA-8B/resolve/main/adapter_model.safetensors?download=true");
    expect(urls.some((url) => url?.endsWith("config.json?download=true"))).toBe(false);
  });

  it("builds a Qwen-VL workflow bound to the 8B base and adapter", () => {
    const settings = createDefaultState().settings;
    settings.promptModelId = modelId;
    const workflow = buildQwenVlPeftPromptWorkflow(
      { prompt: "A person walks toward the camera.", modelId: "minimax_h3_fl2va", h3PromptMode: "T2VA" },
      "studio-input-reference.png",
      settings
    );
    expect(workflow["qwenvl-model"]?.inputs.model_name).toBe("qwen3-vl-8b-instruct");
    expect(workflow["qwenvl-lora"]?.inputs.lora_name).toBe("minimax-h3-prompt-rewriter-8b");
    expect(workflow["qwenvl-caption"]?.class_type).toBe("QwenVLCaption");
    expect(workflow["qwenvl-caption"]?.inputs.max_new_tokens).toBe(1280);
    expect(workflow["qwenvl-image-budget"]).toMatchObject({
      class_type: "ImageScaleToTotalPixels",
      inputs: { image: ["qwenvl-image", 0], megapixels: 1, resolution_steps: 32 }
    });
    expect(workflow["qwenvl-caption"]?.inputs.image).toEqual(["qwenvl-image-budget", 0]);
  });

  it("keeps JSON metadata application-managed instead of exposing it as a download requirement", () => {
    expect(qwenVlManagedMetadata).toHaveLength(10);
    expect(qwenVlManagedMetadata.every((asset) => asset.relativePath.endsWith(".json"))).toBe(true);
    expect(qwenVlManagedMetadata.at(-1)?.relativePath).toBe(`${adapter}/adapter_config.json`);
  });

  it("rejects a stale ComfyUI model enum before posting an invalid workflow", () => {
    const settings = createDefaultState().settings;
    settings.promptModelId = modelId;
    expect(() => validateQwenVlRuntimeChoices({
      QwenVLModelLoader: {
        input: { required: { model_name: [["(none)"], {}] } }
      },
      QwenVLLoRALoader: {
        input: { required: { lora_name: [["minimax-h3-prompt-rewriter-8b"], {}] } }
      }
    }, settings)).toThrow(QwenVlRuntimeValidationError);
    try {
      validateQwenVlRuntimeChoices({
        QwenVLModelLoader: {
          input: { required: { model_name: [["(none)"], {}] } }
        },
        QwenVLLoRALoader: {
          input: { required: { lora_name: [["minimax-h3-prompt-rewriter-8b"], {}] } }
        }
      }, settings);
    } catch (error) {
      expect(error).toMatchObject({
        needsRuntimeRefresh: true,
        inputName: "model_name",
        expected: "qwen3-vl-8b-instruct"
      });
      expect(error instanceof Error ? error.message : "").toContain("重启 ComfyUI");
    }
  });

  it("turns the Desktop stdout failure into a portable repair instruction", () => {
    const error = explainQwenVlRuntimeError(new Error("[Errno 9] Bad file descriptor"));
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("设置 → 节点与工作流");
    expect((error as Error).message).toContain("Qwen-VL LoRA");
  });

  it("accepts exact names and full relative paths returned by object_info", () => {
    const settings = createDefaultState().settings;
    settings.promptModelId = modelId;
    expect(() => validateQwenVlRuntimeChoices({
      QwenVLModelLoader: {
        input: { required: {
          model_name: [["Qwen-VL/qwen3-vl-8b-instruct"], {}]
        } }
      },
      QwenVLLoRALoader: {
        input: { required: {
          lora_name: [["LLM/Qwen-VL-LoRA/minimax-h3-prompt-rewriter-8b"], {}]
        } }
      }
    }, settings)).not.toThrow();
  });
});
