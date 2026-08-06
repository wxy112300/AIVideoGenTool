import { describe, expect, it } from "vitest";
import {
  executedPreviewDataUrl,
  buildNativePromptWorkflow,
  extractTextGenerateOutput,
  h3PromptInstruction,
  historyFailure,
  historyEntryClientId,
  historyEntryHasUnfinishedBatch,
  nodeStage,
  progressForNode,
  safeComfyUploadFilename
} from "../electron/services/comfy-ui.js";
import { h3OfficialPromptBaseline } from "../src/core/h3-official-spec.js";

describe("native Qwen prompt workflow", () => {
  it("loads the selected ComfyUI encoder and batches multiple H3 references", () => {
    const workflow = buildNativePromptWorkflow(
      {
        prompt: "让人物自然地抬头并看向镜头。",
        modelId: "minimax_h3_fl2va",
        mode: "h3-vision",
        h3PromptMode: "FL2VA",
        referenceContext: "<Picture 1> = 首帧; <Picture 2> = 尾帧"
      },
      ["studio-input-first.png", "studio-input-last.png"],
      "qwen/qwen3.5-4b"
    );

    expect(workflow.clip).toMatchObject({
      class_type: "CLIPLoader",
      inputs: {
        clip_name: "qwen3.5_4b_bf16.safetensors",
        type: "stable_diffusion"
      }
    });
    expect(workflow["image-batch-1"]).toMatchObject({
      class_type: "ImageBatch",
      inputs: {
        image1: ["load-image-0", 0],
        image2: ["load-image-1", 0]
      }
    });
    expect(workflow["text-generate"]?.inputs.image).toEqual(["image-batch-1", 0]);
    expect(workflow["text-generate"]?.inputs.sampling_mode).toBe("on");
    expect(workflow["text-generate"]?.inputs["sampling_mode.temperature"]).toBe(0.35);
    expect(workflow["text-generate"]?.inputs["sampling_mode.top_k"]).toBe(40);
    expect(workflow["text-generate"]?.inputs.max_length).toBe(1536);
    expect(workflow.preview).toMatchObject({
      class_type: "PreviewAny",
      inputs: { source: ["text-generate", 0] }
    });
    expect(String(workflow["text-generate"]?.inputs.prompt)).toContain("MiniMax H3");
    expect(String(workflow["text-generate"]?.inputs.prompt)).toContain("<Picture 1>");
  });

  it("keeps the H3 instruction grounded when no image is supplied", () => {
    const instruction = h3PromptInstruction({
      prompt: "一个女孩在雨中慢慢转身。",
      modelId: "minimax_h3_fl2va"
    });
    expect(instruction).toContain("Return only the final English H3 prompt");
    expect(instruction).toContain("integrated_multimodal_description:");
    expect(instruction).toContain("overall_soundscape:");
    expect(instruction).toContain("non_diegetic_music:");
    expect(instruction).toContain("T2VA task rule");
    expect(instruction).not.toContain("For the target video, at 0.00 seconds into the target video");
  });

  it("changes the H3 output contract when the user selects a different preset", () => {
    const faithful = h3PromptInstruction({
      prompt: "人物向镜头走来。",
      modelId: "minimax_h3_fl2va",
      h3PromptMode: "FL2VA",
      h3PromptPreset: "reference-faithful"
    });
    const continuous = h3PromptInstruction({
      prompt: "人物向镜头走来。",
      modelId: "minimax_h3_fl2va",
      h3PromptMode: "FL2VA",
      h3PromptPreset: "continuous-motion"
    });

    expect(faithful).toContain("Prioritize reference fidelity over invention");
    expect(continuous).toContain("one continuous shot with no cuts");
    expect(faithful).not.toBe(continuous);
  });

  it("does not leak the R2V preset into FL2VA expansion", () => {
    const instruction = h3PromptInstruction(
      {
        prompt: "人物从首帧走到尾帧。",
        modelId: "minimax_h3_fl2va",
        h3PromptMode: "FL2VA",
        h3PromptPreset: "multi-reference"
      },
      {
        "official-storyboard": "Use the first-frame to last-frame path only.",
        "multi-reference": "R2V SLOT RULE: emit subject_definitions and <slot> labels."
      }
    );

    expect(instruction).toContain("Use the first-frame to last-frame path only.");
    expect(instruction).not.toContain("R2V SLOT RULE");
    expect(instruction).not.toContain("<slot>");
    expect(instruction).toContain("FL2VA task rule");
    expect(instruction).toContain("Non-R2V format exclusion");
  });

  it("injects user-edited preset text into the native prompt header", () => {
    const instruction = h3PromptInstruction(
      {
        prompt: "人物抬头。",
        modelId: "minimax_h3_fl2va",
        h3PromptMode: "I2VA",
        h3PromptPreset: "official-storyboard"
      },
      {
        "official-storyboard": "Use three short shots and put the strongest camera beat first."
      }
    );

    expect(instruction).toContain("Use three short shots and put the strongest camera beat first.");
    expect(instruction).toContain("Built-in MiniMax H3 official baseline");
    expect(instruction).toContain("I2VA task rule");
  });

  it("keeps the official reference rules separate from editable presets", () => {
    const baseline = h3OfficialPromptBaseline("R2V");

    expect(baseline).toContain("<Subject N>");
    expect(baseline).toContain("<Picture N>");
    expect(baseline).toContain("<Video N>");
    expect(baseline).toContain("<Audio N>");
    expect(baseline).toContain("omni-modal audio-visual generator");
    expect(baseline).toContain("R2V presentation-order rule");
    expect(baseline).toContain("Timeline rule");
    expect(baseline).toContain("Shot timing rule");
    expect(baseline).toContain("<scenetrans>");
    expect(baseline).toContain("Overall-soundscape rule");
    expect(baseline).toContain("Non-diegetic-music rule");
    expect(baseline).toContain("Dialogue rule");
    expect(baseline).toContain("[reference generation]");
    expect(baseline).toContain("fully_preserved");
    expect(baseline).toContain("subject_definitions, summary, retention_analysis");
  });

  it("uses a short READY warmup prompt for manual model startup", () => {
    const workflow = buildNativePromptWorkflow(
      {
        prompt: "ignored during warmup",
        modelId: "prompt-runtime-warmup",
        mode: "faithful"
      },
      [],
      "qwen/qwen3.5-2b",
      true
    );

    expect(workflow["text-generate"]?.inputs.prompt).toBe("Reply with READY only.");
    expect(workflow["text-generate"]?.inputs.max_length).toBe(8);
  });

  it("extracts TextGenerate string output and removes hidden thinking", () => {
    expect(extractTextGenerateOutput({
      outputs: {
        preview: {
          text: ["<think>internal reasoning</think>Style: cinematic. The subject turns slowly."]
        }
      }
    })).toBe("Style: cinematic. The subject turns slowly.");
  });
});

describe("ComfyUI task progress", () => {
  it("maps local sampler progress into the overall sampling range", () => {
    expect(progressForNode("SamplerCustomAdvanced", 4, 20)).toEqual({
      progress: 27.2,
      label: "扩散采样 4/20"
    });
  });

  it("keeps encoding and saving in their own narrow end-stage ranges", () => {
    expect(nodeStage("SaveVideo")).toMatchObject({
      start: 98.5,
      end: 99.5,
      label: "编码并保存"
    });
    expect(progressForNode("SaveVideo", 4, 20).progress).toBe(98.7);
    expect(progressForNode("VAEDecodeAudio", 1, 2).progress).toBe(90.5);
  });

  it("does not invent a sampling percentage without a node", () => {
    expect(progressForNode(undefined, 4, 20)).toEqual({
      progress: 2,
      label: "准备工作流"
    });
  });
});

describe("ComfyUI input filenames", () => {
  it("replaces unsafe names with an ASCII upload name and preserves extension", () => {
    expect(
      safeComfyUploadFilename("D:\\输入 @%\\乱码 图片.PNG", "abc-123")
    ).toBe("studio-input-abc-123.png");
  });

  it("uses a safe fallback extension when the source has no usable extension", () => {
    expect(safeComfyUploadFilename("D:\\输入 @%\\frame", "abc"))
      .toBe("studio-input-abc.bin");
  });
});

describe("ComfyUI result preview", () => {
  it("fetches an image emitted by a PreviewImage node", async () => {
    const calls: string[] = [];
    const fetcher = (async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { "content-type": "image/png" }
      });
    }) as typeof fetch;

    const preview = await executedPreviewDataUrl(
      "http://127.0.0.1:8188/",
      {
        output: {
          images: [
            {
              filename: "preview.png",
              subfolder: "studio",
              type: "temp"
            }
          ]
        }
      },
      fetcher
    );

    expect(preview).toBe("data:image/png;base64,iVBORw==");
    expect(calls[0]).toContain("/view?");
    expect(calls[0]).toContain("filename=preview.png");
    expect(calls[0]).toContain("subfolder=studio");
  });
});

describe("ComfyUI meta-batch history", () => {
  it("links requeued prompts by client id", () => {
    expect(
      historyEntryClientId({ prompt: [-1, "prompt-id", {}, { client_id: "client-1" }] })
    ).toBe("client-1");
    expect(historyEntryClientId({ prompt: [] })).toBe("");
  });

  it("does not treat an unfinished VHS batch as final output", () => {
    expect(
      historyEntryHasUnfinishedBatch({
        outputs: { "6": { unfinished_batch: [true] } }
      })
    ).toBe(true);
    expect(
      historyEntryHasUnfinishedBatch({
        outputs: { "6": { gifs: [{ filename: "done.mp4" }] } }
      })
    ).toBe(false);
  });

  it("preserves CUDA OOM details from failed ComfyUI history", () => {
    expect(
      historyFailure({
        status: {
          status_str: "error",
          messages: [
            [
              "execution_error",
              {
                exception_type: "torch.OutOfMemoryError",
                exception_message: "CUDA out of memory"
              }
            ]
          ]
        }
      })
    ).toBe("torch.OutOfMemoryError: CUDA out of memory");
  });
});
