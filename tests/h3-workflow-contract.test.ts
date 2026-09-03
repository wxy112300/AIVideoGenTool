import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  h3ComfyWorkflowRuntimeIssues,
  h3ComfyAvWorkflowKind,
  validateH3ComfyWorkflow
} from "../src/core/h3-workflow-contract";

function workflow(filename: string): unknown {
  return JSON.parse(readFileSync(new URL(`../workflows/${filename}`, import.meta.url), "utf8"));
}

function objectInfo(): Record<string, unknown> {
  const latent = { input: { required: { samples: ["LATENT"] } }, output: ["LATENT"] };
  return {
    LocalVideoStudioH3SaveJointAV: {
      input: { required: { joint_av: ["LATENT"], filename: ["STRING"] } },
      output: ["STRING"]
    },
    LocalVideoStudioH3LoadJointAV: {
      input: { required: { artifact: ["STRING"] } },
      output: ["LATENT"]
    },
    LocalVideoStudioH3RequireGpuVAE: {
      input: { required: { vae: ["VAE"] } },
      output: ["VAE"]
    },
    LocalVideoStudioH3AnchorConditioning: {
      input: { required: {
        conditioning: ["CONDITIONING"],
        video_latent: ["LATENT"],
        strength: ["FLOAT"]
      } },
      output: ["CONDITIONING"]
    },
    LTXVSeparateAVLatent: {
      input: { required: { av_latent: ["LATENT"] } },
      output: ["LATENT", "LATENT"]
    },
    LTXVConcatAVLatent: {
      input: { required: { video_latent: ["LATENT"], audio_latent: ["LATENT"] } },
      output: ["LATENT"]
    },
    MiniMaxH3LatentUpscale: {
      input: { required: {
        samples: ["LATENT"],
        scale_by: ["FLOAT"],
        upscale_method: [["nearest-exact", "bilinear"]]
      } },
      output: ["LATENT"]
    },
    MinimaxH3LatentUpscaler3D: {
      input: { required: {
        latent: ["*"],
        model_name: [["minimax_h3_latent_upscaler_3d_bf16.safetensors"]],
        mode: ["DYNAMIC_COMBO"],
        align: ["INT"],
        enable_temporal_chunking: ["BOOLEAN"],
        force_unload: ["BOOLEAN"],
        device: [["cuda", "rocm", "cpu"]],
        precision: [["fp32", "fp16", "bf16"]]
      } },
      output: ["*"]
    },
    MiniMaxH3ConditioningUpscale: {
      input: { required: {
        conditioning: ["CONDITIONING"],
        scale_by: ["FLOAT"],
        upscale_method: [["nearest-exact", "bilinear"]]
      } },
      output: ["CONDITIONING"]
    },
    MiniMaxH3AddNoise: {
      input: { required: {
        model: ["MODEL"], noise: ["NOISE"], sigmas: ["SIGMAS"], latent_image: ["LATENT"]
      } },
      output: ["LATENT"]
    },
    MiniMaxH3ShiftSigmas: {
      input: { required: {
        sigmas: ["SIGMAS"], shift_video: ["FLOAT"], shift_audio: ["FLOAT"]
      } },
      output: ["SIGMAS"]
    },
    MMH3LatentUpscaleWithModelParams: {
      input: { required: {
        model_name: [["minimax_h3_latent_upscaler_3d_bf16.safetensors"]],
        width: ["INT"], height: ["INT"], device: [["cuda", "cpu"]], precision: [["fp16", "fp32", "bf16"]]
      } },
      output: ["H3_UPSCALE_PARAM"]
    },
    MMH3TemporalSplitParams: {
      input: { required: {
        chunk_length: ["INT"], temporal_overlap: ["INT"], anchor_strength: ["FLOAT"]
      } },
      output: ["H3_TEMPORAL_PARAM"]
    },
    MMH3SpatialSplitParams: {
      input: { required: {
        upscale_width: ["INT"], upscale_height: ["INT"],
        tile_size_mode: [["specific_size", "rows_cols"]],
        tile_width: ["INT"], tile_height: ["INT"],
        spatial_w_overlap: ["INT"], spatial_h_overlap: ["INT"],
        fade_width: ["INT"], fade_height: ["INT"]
      } },
      output: ["H3_SPATIAL_PARAM", "INT", "INT"]
    },
    MMH3UltimateUpscale: {
      input: {
        required: {
          model: ["MODEL"], conditioning: ["CONDITIONING"], latent: ["LATENT"],
          noise: ["NOISE"], sampler: ["SAMPLER"], sigmas: ["SIGMAS"], cfg: ["FLOAT"]
        },
        optional: {
          latent_upscale_param: ["H3_UPSCALE_PARAM"],
          temporal_split_param: ["H3_TEMPORAL_PARAM"],
          spatial_split_param: ["H3_SPATIAL_PARAM"]
        }
      },
      output: ["LATENT", "DICT", "DICT"]
    },
    // The contract only checks special-node schema here; regular core nodes
    // remain covered by the existing missingWorkflowNodeTypes path.
    ...latent
  };
}

describe("H3 clean AV workflow contract", () => {
  it("validates both bundled graph shapes and classifies them", () => {
    const first = workflow("minimax_h3_fl2va_first_pass_av_api.json");
    const second = workflow("minimax_h3_fl2va_second_sample_av_api.json");
    const learned = workflow("minimax_h3_fl2va_learned_3d_second_sample_av_api.json");
    const ultimate = workflow("minimax_h3_fl2va_ultimate_tiled_second_sample_av_api.json");
    expect(h3ComfyAvWorkflowKind(first)).toBe("first-pass-av");
    expect(h3ComfyAvWorkflowKind(second)).toBe("second-sampling-av");
    expect(h3ComfyAvWorkflowKind(learned)).toBe("second-sampling-av");
    expect(h3ComfyAvWorkflowKind(ultimate)).toBe("second-sampling-av");
    expect(validateH3ComfyWorkflow(first)).toMatchObject({ valid: true, kind: "first-pass-av" });
    expect(validateH3ComfyWorkflow(second)).toMatchObject({ valid: true, kind: "second-sampling-av" });
    expect(validateH3ComfyWorkflow(learned)).toMatchObject({ valid: true, kind: "second-sampling-av" });
    expect(validateH3ComfyWorkflow(ultimate)).toMatchObject({ valid: true, kind: "second-sampling-av" });
  });

  it("rejects a second pass that loses the audio branch or input artifact placeholder", () => {
    const source = structuredClone(workflow("minimax_h3_fl2va_second_sample_av_api.json")) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    const concat = Object.values(source).find((node) => node.class_type === "LTXVConcatAVLatent");
    const load = Object.values(source).find((node) => node.class_type === "LocalVideoStudioH3LoadJointAV");
    expect(concat).toBeDefined();
    expect(load).toBeDefined();
    concat!.inputs.audio_latent = ["10", 0];
    load!.inputs.artifact = "some-file.safetensors";
    const result = validateH3ComfyWorkflow(source);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      "LocalVideoStudioH3LoadJointAV.artifact 必须保留 H3_AV_INPUT_ARTIFACT 占位符",
      "LTXVConcatAVLatent.audio_latent 必须引用 LTXVSeparateAVLatent 的 audio 输出"
    ]));
  });

  it("validates exact custom-node schema from /object_info", () => {
    const first = workflow("minimax_h3_fl2va_first_pass_av_api.json");
    const second = workflow("minimax_h3_fl2va_second_sample_av_api.json");
    const learned = workflow("minimax_h3_fl2va_learned_3d_second_sample_av_api.json");
    const ultimate = workflow("minimax_h3_fl2va_ultimate_tiled_second_sample_av_api.json");
    expect(h3ComfyWorkflowRuntimeIssues(first, objectInfo())).toEqual([]);
    expect(h3ComfyWorkflowRuntimeIssues(second, objectInfo())).toEqual([]);
    expect(h3ComfyWorkflowRuntimeIssues(learned, objectInfo())).toEqual([]);
    expect(h3ComfyWorkflowRuntimeIssues(ultimate, objectInfo())).toEqual([]);

    const broken = objectInfo();
    (broken.LocalVideoStudioH3SaveJointAV as { input: { required: Record<string, unknown> } }).input.required.filename = ["INT"];
    expect(h3ComfyWorkflowRuntimeIssues(first, broken)).toContain(
      "LocalVideoStudioH3SaveJointAV.filename schema 类型不兼容：要求 STRING"
    );
  });

  it("rejects an ultimate tiled graph that can bypass the GPU VAE contract", () => {
    const source = structuredClone(workflow("minimax_h3_fl2va_ultimate_tiled_second_sample_av_api.json")) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    const decode = Object.values(source).find((node) => node.class_type === "VAEDecode");
    expect(decode).toBeDefined();
    decode!.inputs.vae = ["3", 0];

    expect(validateH3ComfyWorkflow(source).errors).toContain(
      "VAEDecode.vae 必须引用 LocalVideoStudioH3RequireGpuVAE"
    );

    const objectInfoWithoutGuard = objectInfo();
    delete objectInfoWithoutGuard.LocalVideoStudioH3RequireGpuVAE;
    expect(h3ComfyWorkflowRuntimeIssues(
      workflow("minimax_h3_fl2va_ultimate_tiled_second_sample_av_api.json"),
      objectInfoWithoutGuard
    )).toContain("/object_info 缺少精确 class_type=LocalVideoStudioH3RequireGpuVAE");
  });

  it("does not add AV schema requirements to ordinary workflows", () => {
    expect(h3ComfyWorkflowRuntimeIssues(workflow("minimax_h3_i2v_api.json"), {})).toEqual([]);
  });
});
