import { describe, expect, it } from "vitest";
import {
  assertImageWorkflowRuntimeCompatible,
  executedPreviewDataUrl,
  buildNativePromptWorkflow,
  extractTextGenerateOutput,
  h3PromptInstruction,
  imageEditPromptInstruction,
  historyFailure,
  historyEntryClientId,
  historyEntryHasUnfinishedBatch,
  h3PreviewEventDataUrl,
  h3PreviewTinyVaeFromObjectInfo,
  nodeStage,
  progressForNode,
  safeComfyUploadFilename
} from "../electron/services/comfy-ui.js";
import { h3OfficialPromptBaseline } from "../src/core/h3-official-spec.js";

describe("H3 live preview runtime discovery", () => {
  it("selects the TAE only when KJNodes exposes it through vae_approx", () => {
    expect(h3PreviewTinyVaeFromObjectInfo({
      ModelPreviewOverrideKJ: {
        input: {
          optional: {
            tiny_vae: [["none", "taeh3.safetensors"], { default: "none" }]
          }
        }
      }
    })).toBe("taeh3.safetensors");
    expect(h3PreviewTinyVaeFromObjectInfo({})).toBe("");
  });

  it("converts the KJNodes custom preview event into the renderer data URL", () => {
    expect(h3PreviewEventDataUrl({
      type: "kj_preview_override",
      data: { image: "YWJj", mime: "image/jpeg" }
    })).toBe("data:image/jpeg;base64,YWJj");
    expect(h3PreviewEventDataUrl({ type: "progress", data: {} })).toBeNull();
  });
});

describe("image workflow runtime preflight", () => {
  it("distinguishes an unloaded required custom-node package", () => {
    expect(() => assertImageWorkflowRuntimeCompatible(
      "lama-inpaint",
      {
        inpaint: {
          class_type: "INPAINT_InpaintWithModel",
          inputs: { image: ["source", 0], mask: ["mask", 0], inpaint_model: ["model", 0], seed: 1 }
        }
      },
      {}
    )).toThrow(/必需节点未加载：ComfyUI Inpaint Nodes/);
  });

  it("reports a registered node whose input schema is incompatible", () => {
    expect(() => assertImageWorkflowRuntimeCompatible(
      "lama-inpaint",
      {
        expand: {
          class_type: "INPAINT_ExpandMask",
          inputs: { mask: ["mask", 0], grow: 8, blur: 5, blur_type: "gaussian" }
        }
      },
      {
        INPAINT_ExpandMask: {
          input: { required: { mask: ["MASK"], grow: ["INT"], blur: ["INT"] } }
        }
      }
    )).toThrow(/节点版本不兼容.*blur_type/);
  });
});

describe("native Qwen prompt workflow", () => {
  it("uses a plain image-edit contract without H3 timeline instructions", () => {
    const instruction = imageEditPromptInstruction({
      prompt: "把 Picture 2 的人物放到 Picture 1 的场景中。",
      modelId: "qwen-image-edit-2511",
      mode: "image-edit",
      referenceContext: "Slot 1 = 基础画面\nSlot 2 = 人物"
    });

    expect(instruction).toContain("Qwen-Image-Edit-2511");
    expect(instruction).toContain("Slot 1 = 基础画面");
    expect(instruction).toContain("Do not output headings, lists, JSON, Markdown");
    expect(instruction).not.toContain("Shot 1");
    expect(instruction).not.toContain("integrated_multimodal_description:");
  });

  it("changes the image-edit optimization contract with the selected preset", () => {
    const faithful = imageEditPromptInstruction({
      prompt: "把 Picture 2 放到 Picture 1 中。",
      modelId: "qwen-image-edit-2511",
      mode: "image-edit",
      imageEditEnhanceMode: "faithful",
      imageEditPresetText: "CUSTOM FAITHFUL RULE"
    });
    const native = imageEditPromptInstruction({
      prompt: "把 Picture 2 放到 Picture 1 中。",
      modelId: "qwen-image-edit-2511",
      mode: "image-edit",
      imageEditEnhanceMode: "sulphur-native"
    });

    expect(faithful).toContain("Faithful mode:");
    expect(faithful).toContain("CUSTOM FAITHFUL RULE");
    expect(native).toContain("Detail-enhance mode:");
    expect(faithful).not.toBe(native);
  });

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
    expect(workflow["text-generate"]?.inputs.max_length).toBe(896);
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
    expect(instruction).toContain("Motion-first priority");
    expect(instruction).toContain("Reference economy");
    expect(instruction).toContain("User-intent preservation rule");
    expect(instruction).toContain("Final user-intent lock");
  });

  it("puts normalized user hard constraints after the source request", () => {
    const instruction = h3PromptInstruction({
      prompt: "One shot, no cuts. A runner goes from A to B. No BGM, but keep footsteps.",
      modelId: "minimax_h3_fl2va",
      h3PromptMode: "T2VA"
    });

    expect(instruction).toContain("no non-diegetic background music");
    expect(instruction).toContain("exactly one [Shot 1]");
    expect(instruction.lastIndexOf("Explicit hard constraints extracted")).toBeGreaterThan(
      instruction.lastIndexOf("User request (content to preserve")
    );
  });

  it("uses a compact user-first contract for the small prompt model", () => {
    const instruction = h3PromptInstruction({
      prompt: "微缩的人穿着银色外套，巨人弯腰观察他，然后镜头慢慢推进。",
      modelId: "minimax_h3_fl2va",
      h3PromptMode: "I2VA"
    });

    expect(instruction).toContain("silent four-pass workflow");
    expect(instruction).toContain("User-word lock");
    expect(instruction).toContain("Otherwise omit it");
    expect(instruction).toContain("微缩的人穿着银色外套");
    expect(instruction).toContain("I2VA");
    expect(instruction).not.toContain("R2V presentation-order rule");
    expect(instruction).not.toContain("Overall-soundscape rule");
  });

  it("treats explicit user attributes as requirements instead of reference inventions", () => {
    const instruction = h3PromptInstruction({
      prompt: "An adult character wearing underwear turns slowly toward the camera.",
      modelId: "minimax_h3_fl2va"
    });

    expect(instruction).toContain("An adult character wearing underwear turns slowly toward the camera.");
    expect(instruction).toContain("including subject details, clothing or exposure level");
    expect(instruction).toContain("Never omit, euphemize, sanitize, or replace an explicit user term");
  });

  it("passes a long requested duration into the native expansion plan", () => {
    const instruction = h3PromptInstruction({
      prompt: "人物先观察四周，再慢慢走向门口，最后停下回头。",
      modelId: "minimax_h3_fl2va",
      h3DurationSeconds: 15
    });

    expect(instruction).toContain("effective H3 duration is 15.08 seconds");
    expect(instruction).toContain("Plan 6 sequential development beats");
    expect(instruction).not.toContain("Target roughly 140-280 English words for a normal 5-second prompt");
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

    expect(faithful).toContain("Prioritize the user's explicit content first");
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
    expect(instruction).toContain("Compact H3 small-model contract");
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
    expect(baseline).toContain("User-intent preservation rule");
    expect(baseline).toContain("Reference economy rule");
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
  it("maps upscale nodes across compute and output stages", () => {
    expect(nodeStage("SeedVR2VideoUpscaler")).toMatchObject({
      start: 12,
      end: 76,
      label: "SeedVR2 超分辨率",
      tracksSteps: true
    });
    expect(progressForNode("SeedVR2VideoUpscaler", 50, 100)).toEqual({
      progress: 44,
      label: "SeedVR2 超分辨率 50/100"
    });
    expect(progressForNode("ImageScale")).toEqual({
      progress: 76,
      label: "调整输出尺寸"
    });
    expect(progressForNode("VRAM_Debug", 1, 1)).toEqual({
      progress: 82,
      label: "卸载扩散模型并释放显存"
    });
    expect(progressForNode("VHS_VideoCombine", 1, 1)).toEqual({
      progress: 99,
      label: "封装输出视频"
    });
  });

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
    expect(progressForNode("SaveVideo", 20, 20)).toEqual({
      progress: 99.5,
      label: "编码并保存"
    });
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
