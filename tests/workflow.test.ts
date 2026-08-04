import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ExtensionQueueTask, QueueTask } from "../src/types";
import {
  activityTimeoutMinutesForTask,
  extensionWorkflowSafetyErrors,
  extensionSafetyForTask,
  extensionOutputDimensions,
  frameCountForTask,
  generationFrameCountForTask,
  generationSafetyForTask,
  missingWorkflowNodeTypes,
  outputDimensions,
  outputFrameCountForTask,
  renderWorkflow,
  validateApiWorkflow,
  workflowSupportsEndImage,
  workflowSupportsH3BoundaryExtension,
  workflowSupportsVideoExtension
} from "../src/core/workflow";

const task: QueueTask = {
  id: "task-1",
  taskType: "generation",
  status: "waiting",
  createdAt: "2026-07-24T00:00:00.000Z",
  updatedAt: "2026-07-24T00:00:00.000Z",
  outputFilename: "test.mp4",
  prompt: "人物自然转身",
  promptVersion: 1,
  startImagePath: "start.png",
  sourceWidth: 0,
  sourceHeight: 0,
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

const extensionTask: ExtensionQueueTask = {
  id: "extension-1",
  taskType: "extension",
  status: "waiting",
  createdAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z",
  outputFilename: "extended.mp4",
  prompt: "人物继续向前走",
  promptVersion: 1,
  sourceVideoPath: "source.mp4",
  sourceVideoDuration: 10,
  trimStartSeconds: 1,
  trimEndSeconds: 6,
  sourceWidth: 1920,
  sourceHeight: 1080,
  modelId: "sulphur2",
  workflowPath: "extend.json",
  ratio: "source",
  resolution: 360,
  duration: 5,
  fps: 24,
  frameInterpolation: "rife4x",
  motion: "natural",
  modelProfile: "q3_k_m",
  seed: 42,
  keepSeedOnCopy: false,
  maxGeneratedFrames: 49,
  overlapFrames: 16,
  unloadBetweenStages: true
};

describe("activityTimeoutMinutesForTask", () => {
  it("allows H3 generation and extension samplers to run without false stalls", () => {
    expect(activityTimeoutMinutesForTask(task, 30)).toBe(10);
    expect(activityTimeoutMinutesForTask({ ...task, modelId: "minimax_h3_fl2va" }, 30)).toBe(90);
    expect(activityTimeoutMinutesForTask({ ...extensionTask, modelId: "minimax_h3_fl2va" }, 30)).toBe(90);
  });

  it("keeps the configured timeout for other extension models", () => {
    expect(activityTimeoutMinutesForTask(extensionTask, 45)).toBe(45);
  });
});

describe("renderWorkflow", () => {
  it("renders the bundled MiniMax H3 I2V graph with staged model and VAE unloading", () => {
    const source = JSON.parse(
      readFileSync(
        new URL("../workflows/minimax_h3_i2v_api.json", import.meta.url),
        "utf8"
      )
    ) as unknown;
    const h3Task: QueueTask = {
      ...task,
      modelId: "minimax_h3_fl2va",
      duration: 5,
      fps: 24,
      frameInterpolation: "off"
    };
    const rendered = renderWorkflow(source, h3Task, {
      inputImage: "input.png",
      vramTotalBytes: 24 * 1024 ** 3
    }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;

    expect(validateApiWorkflow(source).valid).toBe(true);
    expect(workflowSupportsEndImage(source)).toBe(true);
    expect(rendered["6"]?.inputs).toMatchObject({
      width: 864,
      height: 480,
      length: 124,
      first_frame: ["5", 0]
    });
    expect(rendered["8"]?.inputs).toMatchObject({
      model: ["19", 0],
      scheduler: "simple",
      steps: 20,
      denoise: 1
    });
    expect(rendered["13"]?.class_type).toBe("VAEDecodeTiled");
    expect(rendered["13"]?.inputs.samples).toEqual(["12", 0]);
    expect(rendered["15"]?.inputs.samples).toEqual(["14", 0]);
    expect(rendered["16"]?.inputs).toMatchObject({
      images: ["14", 1],
      audio: ["15", 0],
      fps: 24
    });
    expect(rendered["18"]).toBeUndefined();
    expect(rendered["6"]?.inputs.last_frame).toBeUndefined();
    expect(rendered["19"]).toMatchObject({
      class_type: "PathchSageAttentionKJ",
      inputs: {
        model: ["1", 0],
        sage_attention: "sageattn_qk_int8_pv_fp16_cuda",
        allow_compile: false
      }
    });

    const compatible = renderWorkflow(
      source,
      { ...h3Task, attentionMode: "pytorch" },
      { inputImage: "input.png", vramTotalBytes: 24 * 1024 ** 3 }
    ) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    expect(compatible["19"]).toBeUndefined();
    expect(compatible["8"]?.inputs.model).toEqual(["1", 0]);
    expect(compatible["10"]?.inputs.model).toEqual(["1", 0]);

    const withLastFrame = renderWorkflow(source, h3Task, {
      inputImage: "first.png",
      endImage: "last.png",
      vramTotalBytes: 24 * 1024 ** 3
    }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    expect(withLastFrame["18"]?.inputs.image).toBe("last.png");
    expect(withLastFrame["6"]?.inputs.last_frame).toEqual(["18", 0]);

    const heavyTask: QueueTask = {
      ...h3Task,
      duration: 15,
      resolution: 768
    };
    const heavy = renderWorkflow(source, heavyTask, {
      inputImage: "first.png",
      vramTotalBytes: 24 * 1024 ** 3
    }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    expect(heavy["6"]?.inputs).toMatchObject({
      width: 1344,
      height: 768,
      length: 362
    });
    expect(heavy["13"]?.inputs).toMatchObject({
      tile_size: 256,
      temporal_size: 64,
      temporal_overlap: 16
    });
  });

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

  it("detects end-frame support from the workflow token", () => {
    expect(
      workflowSupportsEndImage({
        "1": { class_type: "LoadImage", inputs: { image: "{{END_IMAGE}}" } }
      })
    ).toBe(true);
    expect(workflowSupportsEndImage({ "1": { inputs: {} } })).toBe(false);
  });

  it("requires the complete video extension placeholder contract", () => {
    expect(
      workflowSupportsVideoExtension({
        "1": {
          inputs: {
            video: "{{SOURCE_VIDEO}}",
            frames: "{{EXTENSION_FRAMES}}",
            overlap: "{{OVERLAP_FRAMES}}"
          }
        }
      })
    ).toBe(true);
    expect(
      workflowSupportsVideoExtension({
        "1": { inputs: { video: "{{SOURCE_VIDEO}}", overlap: "{{OVERLAP_FRAMES}}" } }
      })
    ).toBe(false);
    expect(
      workflowSupportsVideoExtension({
        metadata: {
          note: "{{SOURCE_VIDEO}} {{EXTENSION_FRAMES}} {{OVERLAP_FRAMES}}"
        },
        "1": { inputs: { image: "{{INPUT_IMAGE}}" } }
      })
    ).toBe(false);
  });

  it("accepts the legacy low-VRAM checkpoint extension structure", () => {
    const source = {
      "1": {
        class_type: "LTXVExtendSampler",
        inputs: {
          video: "{{SOURCE_VIDEO}}",
          frames: "{{EXTENSION_FRAMES}}",
          overlap: "{{OVERLAP_FRAMES}}"
        }
      },
      "2": { class_type: "LowVRAMCheckpointLoader", inputs: {} },
      "3": { class_type: "VRAM_Debug", inputs: {} },
      "4": { class_type: "VAEDecodeTiled", inputs: {} }
    };
    expect(extensionWorkflowSafetyErrors(source)).toEqual([]);
    expect(extensionWorkflowSafetyErrors({ ...source, "2": undefined })).toContain(
      "缺少 LowVRAMCheckpointLoader 或 UnetLoaderGGUFAdvanced"
    );
  });

  it("requires a conservative split-component GGUF extension structure", () => {
    const source = {
      "1": {
        class_type: "LTXVExtendSampler",
        inputs: {
          video: "{{SOURCE_VIDEO}}",
          frames: "{{EXTENSION_FRAMES}}",
          overlap: "{{OVERLAP_FRAMES}}"
        }
      },
      "2": {
        class_type: "UnetLoaderGGUFAdvanced",
        inputs: { patch_on_device: false }
      },
      "3": { class_type: "DualCLIPLoader", inputs: {} },
      "4": { class_type: "VAELoader", inputs: {} },
      "5": { class_type: "VRAM_Debug", inputs: {} },
      "6": { class_type: "VAEDecodeTiled", inputs: {} }
    };
    expect(extensionWorkflowSafetyErrors(source)).toEqual([]);
    expect(
      extensionWorkflowSafetyErrors({
        ...source,
        "2": {
          class_type: "UnetLoaderGGUFAdvanced",
          inputs: { patch_on_device: true }
        }
      })
    ).toContain("GGUF loader 必须关闭 patch_on_device");
  });

  it("renders typed video extension inputs", () => {
    const result = renderWorkflow(
      {
        "1": {
          class_type: "ExtensionExample",
          inputs: {
            video: "{{SOURCE_VIDEO}}",
            start: "{{TRIM_START}}",
            end: "{{TRIM_END}}",
            frames: "{{EXTENSION_FRAMES}}",
            overlap: "{{OVERLAP_FRAMES}}",
            unload: "{{UNLOAD_BETWEEN_STAGES}}"
          }
        }
      },
      extensionTask,
      { sourceVideo: "uploaded/source.mp4" }
    ) as Record<string, { inputs: Record<string, unknown> }>;

    expect(result["1"]!.inputs).toMatchObject({
      video: "uploaded/source.mp4",
      start: 1,
      end: 6,
      frames: 33,
      overlap: 16,
      unload: true
    });
  });

  it("enforces the 24GB extension frame budget", () => {
    expect(extensionSafetyForTask(extensionTask).safe).toBe(true);
    const unsafe = extensionSafetyForTask({
      ...extensionTask,
      frameInterpolation: "off"
    });
    expect(unsafe.safe).toBe(false);
    expect(unsafe.generatedFrames).toBe(121);
    expect(unsafe.maxGeneratedFrames).toBe(49);
  });

  it("preserves the source image aspect ratio when requested", () => {
    const rendered = renderWorkflow(
      {
        "1": {
          class_type: "Example",
          inputs: { width: "{{WIDTH}}", height: "{{HEIGHT}}" }
        }
      },
      { ...task, ratio: "source", sourceWidth: 1000, sourceHeight: 1000 }
    ) as Record<string, { inputs: Record<string, unknown> }>;

    expect(rendered["1"]?.inputs.width).toBe(480);
    expect(rendered["1"]?.inputs.height).toBe(480);
  });

  it("treats the selected resolution as the short edge for portrait input", () => {
    expect(
      outputDimensions({
        ...task,
        ratio: "source",
        sourceWidth: 896,
        sourceHeight: 1344,
        resolution: 480
      })
    ).toEqual([480, 720]);
    expect(
      outputDimensions({
        ...task,
        ratio: "9:16",
        resolution: 480
      })
    ).toEqual([480, 848]);
  });

  it("bounds extremely wide source ratios to the 720p memory envelope", () => {
    expect(
      outputDimensions({
        ...task,
        ratio: "source",
        sourceWidth: 10_000,
        sourceHeight: 1_000,
        resolution: 720
      })
    ).toEqual([1280, 128]);
  });

  it("injects unload barriers before and after tiled VAE decoding", () => {
    const rendered = renderWorkflow(
      {
        "1": {
          class_type: "VAEDecode",
          inputs: { samples: ["9", 0], vae: ["8", 0] }
        },
        "2": {
          class_type: "CreateVideo",
          inputs: { images: ["1", 0], fps: "{{FPS}}" }
        }
      },
      { ...task, frameInterpolation: "off" }
    ) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;

    expect(rendered["1"]?.class_type).toBe("VAEDecodeTiled");
    expect(rendered["1"]?.inputs).toMatchObject({
      samples: ["3", 0],
      tile_size: 256,
      overlap: 64,
      temporal_size: 64,
      temporal_overlap: 16
    });
    expect(rendered["3"]?.inputs.any_input).toEqual(["9", 0]);
    expect(rendered["4"]?.inputs.image_pass).toEqual(["1", 0]);
    expect(rendered["2"]?.inputs.images).toEqual(["4", 1]);
  });

  it("disables temporal VAE splitting when at least 20 GB VRAM is available", () => {
    const rendered = renderWorkflow(
      {
        "1": {
          class_type: "VAEDecode",
          inputs: { samples: ["9", 0], vae: ["8", 0] }
        }
      },
      task,
      { vramTotalBytes: 24 * 1024 ** 3 }
    ) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;

    expect(rendered["1"]?.class_type).toBe("VAEDecodeTiled");
    expect(rendered["1"]?.inputs.tile_size).toBe(512);
    expect(rendered["1"]?.inputs.overlap).toBe(64);
    expect(rendered["1"]?.inputs.temporal_size).toBe(4096);
    expect(rendered["1"]?.inputs.temporal_overlap).toBe(16);
  });

  it("overrides temporal tiling already embedded in Wan and Hunyuan workflows", () => {
    const rendered = renderWorkflow(
      {
        "1": {
          class_type: "VAEDecodeTiled",
          inputs: {
            samples: ["9", 0],
            vae: ["8", 0],
            tile_size: 256,
            overlap: 32,
            temporal_size: 16,
            temporal_overlap: 4
          }
        }
      },
      task,
      { vramTotalBytes: 24 * 1024 ** 3 }
    ) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;

    expect(rendered["1"]?.inputs).toMatchObject({
      samples: ["2", 0],
      tile_size: 512,
      overlap: 64,
      temporal_size: 4096,
      temporal_overlap: 16
    });
    expect(rendered["2"]?.inputs.any_input).toEqual(["9", 0]);
  });

  it("disables temporal splitting in the native LTX tiled decoder on a 4090", () => {
    const rendered = renderWorkflow(
      {
        "1": {
          class_type: "LTXVSpatioTemporalTiledVAEDecode",
          inputs: {
            latents: ["9", 0],
            vae: ["8", 0],
            spatial_tiles: 4,
            temporal_tile_length: 8,
            temporal_overlap: 1
          }
        }
      },
      extensionTask,
      { vramTotalBytes: 24 * 1024 ** 3 }
    ) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;

    expect(rendered["1"]?.inputs).toMatchObject({
      latents: ["2", 0],
      temporal_tile_length: 1000,
      temporal_overlap: 4
    });
    expect(rendered["2"]?.inputs.any_input).toEqual(["9", 0]);
  });
});

describe("generation VRAM safety", () => {
  it("keeps MiniMax H3 on the official 17n+5 grid through its roughly 15-second range", () => {
    const h3Task = {
      ...task,
      modelId: "minimax_h3_fl2va",
      fps: 24 as const,
      frameInterpolation: "off" as const
    };
    expect(frameCountForTask({ ...h3Task, duration: 1 }, 24)).toBe(39);
    expect(frameCountForTask({ ...h3Task, duration: 3 }, 24)).toBe(73);
    expect(generationSafetyForTask(h3Task)).toMatchObject({
      safe: true,
      generatedFrames: 124,
      maxGeneratedFrames: 362,
      maxDurationSeconds: 15
    });
    expect(generationSafetyForTask({ ...h3Task, duration: 10 })).toMatchObject({
      safe: true,
      generatedFrames: 243
    });
    expect(generationSafetyForTask({ ...h3Task, duration: 15 })).toMatchObject({
      safe: true,
      generatedFrames: 362
    });
    expect(generationSafetyForTask({ ...h3Task, duration: 16 }).safe).toBe(false);
  });

  it("allows H3 boundary-frame extension through the trained 15-second range", () => {
    const h3Extension: ExtensionQueueTask = {
      ...extensionTask,
      modelId: "minimax_h3_fl2va",
      resolution: 768,
      duration: 15,
      fps: 24,
      frameInterpolation: "off",
      maxGeneratedFrames: 362
    };
    expect(extensionSafetyForTask(h3Extension)).toMatchObject({
      safe: true,
      generatedFrames: 362,
      maxDurationSeconds: 15,
      minimumContextSeconds: 1 / 24
    });
    expect(extensionOutputDimensions(h3Extension)).toEqual([1344, 768]);
    expect(extensionSafetyForTask({ ...h3Extension, duration: 16 }).safe).toBe(false);
  });

  it("aligns MiniMax H3 dimensions to the required 32-pixel grid", () => {
    expect(outputDimensions({
      ...task,
      modelId: "minimax_h3_fl2va",
      resolution: 480,
      ratio: "16:9"
    })).toEqual([864, 480]);
    expect(outputDimensions({
      ...task,
      modelId: "minimax_h3_fl2va",
      resolution: 768,
      ratio: "16:9"
    })).toEqual([1344, 768]);
  });

  it("allows the official 121-frame Wan 5B baseline", () => {
    const safety = generationSafetyForTask({
      ...task,
      modelId: "wan22_5b",
      duration: 5,
      frameInterpolation: "off"
    });
    expect(safety).toMatchObject({
      safe: true,
      generatedFrames: 121,
      maxGeneratedFrames: 121,
      maxDurationSeconds: 10
    });
  });

  it("keeps Wan 14B at the initial 81-frame validation profile", () => {
    expect(
      generationSafetyForTask({
        ...task,
        modelId: "wan22_14b_nsfw",
        duration: 5,
        fps: 24,
        frameInterpolation: "off"
      }).safe
    ).toBe(false);
    expect(
      generationSafetyForTask({
        ...task,
        modelId: "wan22_14b_nsfw",
        duration: 5,
        fps: 16,
        frameInterpolation: "off"
      })
    ).toMatchObject({ safe: true, generatedFrames: 81, maxGeneratedFrames: 81 });
  });

  it("allows ten-second output when RIFE keeps generation within 121 frames", () => {
    const safety = generationSafetyForTask({
      ...task,
      modelId: "wan22_5b",
      duration: 10,
      fps: 24,
      frameInterpolation: "rife2x"
    });
    expect(safety).toMatchObject({ safe: true, generatedFrames: 121 });
  });

  it("rejects output beyond the ten-second single-segment profile", () => {
    const safety = generationSafetyForTask({
      ...task,
      modelId: "wan22_5b",
      duration: 11,
      fps: 24,
      frameInterpolation: "rife4x"
    });
    expect(safety.safe).toBe(false);
    expect(safety.message).toContain("最长 10 秒");
  });
});

describe("Wan 2.2 workflow compatibility", () => {
  it("rounds every built-in Wan video length to the required 4n+1 frame count", () => {
    expect(frameCountForTask({ ...task, modelId: "wan22_5b" }, 24)).toBe(121);
    expect(frameCountForTask({ ...task, modelId: "wan22_14b_nsfw" }, 24)).toBe(121);
    expect(frameCountForTask({ ...task, modelId: "wan22_remix" }, 24)).toBe(121);
    expect(frameCountForTask({ ...task, modelId: "wan22_smoothmix" }, 24)).toBe(121);
    expect(frameCountForTask({ ...task, modelId: "wan22_dasiwa" }, 24)).toBe(121);
    expect(frameCountForTask({ ...task, modelId: "other" }, 24)).toBe(120);
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
    expect(standard["17"]?.class_type).toBe("VRAM_Debug");
    expect(standard["17"]?.inputs.any_input).toEqual(["10", 0]);
    expect(standard["12"]?.inputs.latent_image).toEqual(["17", 0]);
    expect(gguf["1"]?.class_type).toBe("UnetLoaderGGUFAdvanced");
    expect(gguf["1"]?.inputs.unet_name).toBe(
      "wan22RemixT2VI2V_i2vHighV30-Q5_K_M.gguf"
    );
    expect(gguf["2"]?.inputs.unet_name).toBe(
      "wan22RemixT2VI2V_i2vLowV30-Q5_K_M.gguf"
    );
    expect(gguf["17"]?.class_type).toBe("VRAM_Debug");
    expect(gguf["12"]?.inputs.latent_image).toEqual(["17", 0]);
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

describe("Sulphur 2 / LTX 2.3 workflow compatibility", () => {
  it("uses 8n+1 frames for direct and interpolated generation", () => {
    expect(frameCountForTask(task, 24)).toBe(121);
    expect(
      generationFrameCountForTask({ ...task, frameInterpolation: "rife2x" })
    ).toBe(65);
  });

  it("renders the Q3 GGUF split assets and two-stage dimensions", () => {
    const source = JSON.parse(
      readFileSync(
        new URL(
          "../workflows/sulphur2_ltx23_i2v_gguf_dev_api.json",
          import.meta.url
        ),
        "utf8"
      )
    );
    const rendered = renderWorkflow(source, task, {
      inputImage: "uploaded/start.png"
    }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;

    expect(validateApiWorkflow(source).valid).toBe(true);
    expect(rendered["44"]?.inputs.unet_name).toBe("sulphur_dev-Q3_K_M.gguf");
    expect(rendered["44"]?.inputs.patch_on_device).toBe(false);
    expect(rendered["5"]?.inputs.clip_name1).toBe(
      "gemma_3_12B_it_fp4_mixed.safetensors"
    );
    expect(rendered["5"]?.inputs.clip_name2).toBe(
      "ltx-2-3-22b-text_encoder.safetensors"
    );
    expect(rendered["4"]?.class_type).toBe("LowVRAMAudioVAELoader");
    expect(rendered["4"]?.inputs.ckpt_name).toBe(
      "ltx-2-3-22b-audio_vae.safetensors"
    );
    expect(rendered["75"]?.inputs.vae_name).toBe(
      "ltx-2-3-22b-VAE.safetensors"
    );
    expect(rendered["21"]?.inputs.width).toBe(432);
    expect(rendered["21"]?.inputs.height).toBe(240);
    expect(rendered["21"]?.inputs.length).toBe(121);
    expect(rendered["67"]?.inputs.image).toBe("uploaded/start.png");
    expect(rendered["74"]?.class_type).toBe("VRAM_Debug");
    expect(rendered["35"]?.inputs.av_latent).toEqual(["74", 0]);
    expect(rendered["73"]?.class_type).toBe("VAEDecodeTiled");
    expect(
      Object.values(rendered).some(
        (node) => node.class_type === "PreviewImage"
      )
    ).toBe(true);
    expect(JSON.stringify(rendered)).not.toContain("{{");
  });

  it("renders the bundled Q3 native extension graph", () => {
    const source = JSON.parse(
      readFileSync(
        new URL(
          "../workflows/sulphur2_ltx23_extend_gguf_dev_api.json",
          import.meta.url
        ),
        "utf8"
      )
    );
    const rendered = renderWorkflow(source, extensionTask, {
      sourceVideo: "uploaded/context.mp4"
    }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;

    expect(validateApiWorkflow(source).valid).toBe(true);
    expect(extensionWorkflowSafetyErrors(source)).toEqual([]);
    expect(rendered["1"]?.inputs.video).toBe("uploaded/context.mp4");
    expect(rendered["1"]?.inputs.custom_width).toBe(640);
    expect(rendered["1"]?.inputs.custom_height).toBe(352);
    expect(rendered["7"]?.class_type).toBe("UnetLoaderGGUFAdvanced");
    expect(rendered["7"]?.inputs.unet_name).toBe("sulphur_dev-Q3_K_M.gguf");
    expect(rendered["7"]?.inputs.patch_on_device).toBe(false);
    expect(rendered["3"]?.class_type).toBe("DualCLIPLoader");
    expect(rendered["18"]?.class_type).toBe("VAELoader");
    expect(rendered["14"]?.inputs.num_new_frames).toBe(33);
    expect(rendered["14"]?.inputs.frame_overlap).toBe(16);
    expect(rendered["16"]?.inputs.working_device).toBe("cpu");
    expect(JSON.stringify(rendered)).not.toContain("{{");
  });

  it("renders the H3 I2V graph as a boundary-frame extension", () => {
    const source = JSON.parse(
      readFileSync(
        new URL("../workflows/minimax_h3_i2v_api.json", import.meta.url),
        "utf8"
      )
    );
    const h3Extension: ExtensionQueueTask = {
      ...extensionTask,
      modelId: "minimax_h3_fl2va",
      resolution: 480,
      duration: 5,
      fps: 24,
      frameInterpolation: "off",
      maxGeneratedFrames: 362
    };
    const rendered = renderWorkflow(source, h3Extension, {
      inputImage: "uploaded/boundary.png",
      vramTotalBytes: 24 * 1024 ** 3
    }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;

    expect(workflowSupportsH3BoundaryExtension(source)).toBe(true);
    expect(rendered["5"]?.inputs.image).toBe("uploaded/boundary.png");
    expect(rendered["6"]?.inputs).toMatchObject({
      width: 864,
      height: 480,
      length: 124,
      first_frame: ["5", 0]
    });
    expect(rendered["18"]).toBeUndefined();
  });

  it("renders the distilled Q2 graph without a distill LoRA", () => {
    const source = JSON.parse(
      readFileSync(
        new URL(
          "../workflows/sulphur2_ltx23_extend_gguf_q2_api.json",
          import.meta.url
        ),
        "utf8"
      )
    );
    const rendered = renderWorkflow(
      source,
      { ...extensionTask, modelProfile: "q2_distilled" },
      { sourceVideo: "uploaded/context.mp4" }
    ) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;

    expect(extensionWorkflowSafetyErrors(source)).toEqual([]);
    expect(rendered["7"]?.inputs.unet_name).toBe(
      "sulphur-2-distilled-Q2_K.gguf"
    );
    expect(Object.values(rendered).some(
      (node) => node.class_type === "LoraLoaderModelOnly"
    )).toBe(false);
    expect(JSON.stringify(rendered)).not.toContain("{{");
  });

  it("renders the Q4 transformer through the shared dev graph", () => {
    const source = JSON.parse(
      readFileSync(
        new URL(
          "../workflows/sulphur2_ltx23_extend_gguf_dev_api.json",
          import.meta.url
        ),
        "utf8"
      )
    );
    const rendered = renderWorkflow(
      source,
      { ...extensionTask, modelProfile: "q4_k_m" },
      { sourceVideo: "uploaded/context.mp4" }
    ) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;

    expect(rendered["7"]?.inputs.unet_name).toBe("sulphur_dev-Q4_K_M.gguf");
    expect(rendered["8"]?.class_type).toBe("LoraLoaderModelOnly");
    expect(JSON.stringify(rendered)).not.toContain("{{");
  });
});

describe("HunyuanVideo 1.5 workflow compatibility", () => {
  it("rounds Hunyuan video length to the required 4n+1 frame count", () => {
    expect(frameCountForTask({ ...task, modelId: "hunyuan15" }, 24)).toBe(121);
    expect(frameCountForTask({ ...task, modelId: "hunyuan15_sr" }, 24)).toBe(121);
  });

  it("renders 720p generation and 1080p SR dimensions", () => {
    const source = JSON.parse(
      readFileSync(
        new URL("../workflows/hunyuan15_sr_i2v_api.json", import.meta.url),
        "utf8"
      )
    );
    const rendered = renderWorkflow(source, {
      ...task,
      modelId: "hunyuan15_sr",
      resolution: 720
    }) as Record<string, { inputs: Record<string, unknown> }>;

    expect(rendered["9"]?.inputs.width).toBe(1280);
    expect(rendered["9"]?.inputs.height).toBe(720);
    expect(rendered["21"]?.inputs.width).toBe(1920);
    expect(rendered["21"]?.inputs.height).toBe(1080);
    expect(validateApiWorkflow(source).valid).toBe(true);
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
