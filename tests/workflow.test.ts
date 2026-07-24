import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { QueueTask } from "../src/types";
import {
  frameCountForTask,
  generationFrameCountForTask,
  missingWorkflowNodeTypes,
  outputFrameCountForTask,
  renderWorkflow,
  validateApiWorkflow
} from "../src/core/workflow";

const task: QueueTask = {
  id: "task-1",
  status: "waiting",
  createdAt: "2026-07-24T00:00:00.000Z",
  updatedAt: "2026-07-24T00:00:00.000Z",
  outputFilename: "test.mp4",
  prompt: "人物自然转身",
  promptVersion: 1,
  startImagePath: "start.png",
  endImagePath: "",
  modelId: "sulphur2",
  workflowPath: "workflow.json",
  ratio: "16:9",
  resolution: 480,
  duration: 5,
  fps: 24,
  frameInterpolation: "off",
  motion: "natural",
  seed: 42,
  keepSeedOnCopy: false
};

describe("renderWorkflow", () => {
  it("replaces nested values while preserving numeric token types", () => {
    const result = renderWorkflow(
      {
        "1": {
          class_type: "Example",
          inputs: {
            text: "{{PROMPT}}",
            seed: "{{SEED}}",
            filename_prefix: "studio/{{OUTPUT_FILENAME}}",
            untouched: "{{UNKNOWN}}"
          }
        }
      },
      task,
      { inputImage: "uploaded/start.png" }
    ) as Record<string, { inputs: Record<string, unknown> }>;

    expect(result["1"]!.inputs.text).toBe("人物自然转身");
    expect(result["1"]!.inputs.seed).toBe(42);
    expect(result["1"]!.inputs.filename_prefix).toBe("studio/test");
    expect(result["1"]!.inputs.untouched).toBe("{{UNKNOWN}}");
  });
});

describe("Wan 2.2 workflow compatibility", () => {
  it("rounds every built-in Wan video length to the required 4n+1 frame count", () => {
    expect(frameCountForTask({ ...task, modelId: "wan22_5b" }, 24)).toBe(121);
    expect(frameCountForTask({ ...task, modelId: "wan22_14b_nsfw" }, 24)).toBe(121);
    expect(frameCountForTask({ ...task, modelId: "wan22_remix" }, 24)).toBe(121);
    expect(frameCountForTask({ ...task, modelId: "wan22_smoothmix" }, 24)).toBe(121);
    expect(frameCountForTask({ ...task, modelId: "wan22_dasiwa" }, 24)).toBe(121);
    expect(frameCountForTask(task, 24)).toBe(120);
  });

  it("generates fewer source frames and trims RIFE output to the exact target", () => {
    const interpolatedTask: QueueTask = {
      ...task,
      modelId: "wan22_14b_nsfw",
      frameInterpolation: "rife2x"
    };
    const rendered = renderWorkflow(
      {
        "1": {
          class_type: "CreateVideo",
          inputs: { images: ["9", 0], fps: "{{FPS}}" }
        }
      },
      interpolatedTask
    ) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;

    expect(generationFrameCountForTask(interpolatedTask)).toBe(61);
    expect(outputFrameCountForTask(interpolatedTask)).toBe(120);
    expect(rendered["2"]?.class_type).toBe("VRAM_Debug");
    expect(rendered["2"]?.inputs.image_pass).toEqual(["9", 0]);
    expect(rendered["3"]?.class_type).toBe("RIFE VFI");
    expect(rendered["3"]?.inputs.multiplier).toBe(2);
    expect(rendered["3"]?.inputs.clear_cache_after_n_frames).toBe(1);
    expect(rendered["3"]?.inputs.batch_size).toBe(1);
    expect(rendered["4"]?.class_type).toBe("ImageFromBatch");
    expect(rendered["4"]?.inputs.length).toBe(120);
    expect(rendered["1"]?.inputs.images).toEqual(["4", 0]);
  });

  it("uses the minimum Wan-compatible source frame count for RIFE 4x", () => {
    expect(
      generationFrameCountForTask({
        ...task,
        modelId: "wan22_remix",
        frameInterpolation: "rife4x"
      })
    ).toBe(33);
  });

  it("renders the downloaded Wan 14B asset names into both workflow variants", () => {
    const standardSource = JSON.parse(
      readFileSync(
        new URL("../workflows/wan22_14b_i2v_api.json", import.meta.url),
        "utf8"
      )
    );
    const ggufSource = JSON.parse(
      readFileSync(
        new URL("../workflows/wan22_14b_gguf_i2v_api.json", import.meta.url),
        "utf8"
      )
    );
    const standard = renderWorkflow(standardSource, {
      ...task,
      modelId: "wan22_14b_nsfw"
    }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    const gguf = renderWorkflow(ggufSource, {
      ...task,
      modelId: "wan22_remix"
    }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;

    expect(validateApiWorkflow(standardSource).valid).toBe(true);
    expect(validateApiWorkflow(ggufSource).valid).toBe(true);
    expect(standard["1"]?.class_type).toBe("UNETLoader");
    expect(standard["1"]?.inputs.unet_name).toBe(
      "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors"
    );
    expect(standard["3"]?.inputs.clip_name).toBe(
      "nsfw_wan_umt5-xxl_fp8_scaled.safetensors"
    );
    expect(standard["4"]?.inputs.vae_name).toBe("wan_2.1_vae.safetensors");
    expect(gguf["1"]?.class_type).toBe("UnetLoaderGGUFAdvanced");
    expect(gguf["1"]?.inputs.unet_name).toBe(
      "wan22RemixT2VI2V_i2vHighV30-Q5_K_M.gguf"
    );
    expect(gguf["2"]?.inputs.unet_name).toBe(
      "wan22RemixT2VI2V_i2vLowV30-Q5_K_M.gguf"
    );
  });

  it("reports node types missing from the connected ComfyUI", () => {
    expect(
      missingWorkflowNodeTypes(
        {
          "1": { class_type: "LoadImage", inputs: {} },
          "2": { class_type: "MissingVideoNode", inputs: {} }
        },
        { LoadImage: {} }
      )
    ).toEqual(["MissingVideoNode"]);
  });
});

describe("HunyuanVideo 1.5 workflow compatibility", () => {
  it("rounds Hunyuan video length to the required 4n+1 frame count", () => {
    expect(frameCountForTask({ ...task, modelId: "hunyuan15" }, 24)).toBe(121);
  });
});

describe("validateApiWorkflow", () => {
  it("accepts API-format nodes with required GUI placeholders", () => {
    const result = validateApiWorkflow({
      "1": {
        class_type: "CLIPTextEncode",
        inputs: { text: "{{PROMPT}}" }
      },
      "2": {
        class_type: "LoadImage",
        inputs: { image: "{{INPUT_IMAGE}}" }
      }
    });
    expect(result.valid).toBe(true);
    expect(result.nodeCount).toBe(2);
    expect(result.warnings).toHaveLength(2);
  });

  it("explains when a normal UI workflow was selected", () => {
    const result = validateApiWorkflow({
      last_node_id: 12,
      nodes: []
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("普通 UI workflow");
    expect(result.errors.join(" ")).toContain("{{PROMPT}}");
  });
});
