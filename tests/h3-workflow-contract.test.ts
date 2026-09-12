import { describe, expect, it } from "vitest";
import {
  h3ComfyWorkflowRuntimeIssues,
  h3ExecutionNodeRuntimeIssues
} from "../src/core/h3-workflow-contract.js";

function nativeH3Workflow() {
  return {
    "1": {
      class_type: "ModelAttentionBackend",
      inputs: {
        model: ["0", 0],
        attention: "comfy kitchen attention"
      }
    },
    "2": {
      class_type: "BlockSparseAttention",
      inputs: {
        model: ["1", 0],
        selection: "sla",
        "selection.keep_percent": 10,
        start_percent: 0.2,
        end_percent: 1,
        dense_blocks: "",
        min_tokens: 12288,
        extra_tokens: 256,
        sink_conditioning: "exact_kv_and_rows",
        verbose: false
      }
    }
  };
}

function nativeH3ObjectInfo(includeVsa = true) {
  return {
    ModelAttentionBackend: {
      input: {
        required: {
          model: ["MODEL"],
          attention: [["pytorch attention", "comfy kitchen attention"], {}]
        }
      },
      output: ["MODEL"]
    },
    BlockSparseAttention: {
      input: {
        required: {
          model: ["MODEL"],
          selection: ["COMFY_DYNAMICCOMBO_V3", {
            options: [
              { key: "sol-attn" },
              { key: "sla" },
              ...(includeVsa ? [{ key: "vsa" }] : [])
            ]
          }],
          start_percent: ["FLOAT", {}],
          end_percent: ["FLOAT", {}],
          dense_blocks: ["STRING", {}],
          min_tokens: ["INT", {}],
          extra_tokens: ["INT", {}],
          sink_conditioning: [["exact_kv", "exact_kv_and_rows", "off"], {}],
          verbose: ["BOOLEAN", {}]
        }
      },
      output: ["MODEL"]
    }
  };
}

describe("ComfyUI 0.35 native H3 runtime contract", () => {
  it("accepts the exact ModelAttentionBackend and DynamicCombo schema", () => {
    expect(h3ExecutionNodeRuntimeIssues(nativeH3Workflow(), nativeH3ObjectInfo())).toEqual([]);
  });

  it("fails closed when the runtime omits a DynamicCombo option", () => {
    const issues = h3ExecutionNodeRuntimeIssues(
      nativeH3Workflow(),
      nativeH3ObjectInfo(false)
    );

    expect(issues).toContain("BlockSparseAttention.selection 缺少 vsa 选项");
  });

  it("rejects the pre-0.35 nested DynamicCombo payload", () => {
    const workflow = nativeH3Workflow();
    workflow["2"]!.inputs!.selection = { selection: "sla", keep_percent: 10 };

    expect(h3ExecutionNodeRuntimeIssues(workflow, nativeH3ObjectInfo())).toContain(
      "BlockSparseAttention.selection 使用了未知值：[object Object]"
    );
  });

  it("does not apply the native execution check to ordinary workflows", () => {
    expect(h3ExecutionNodeRuntimeIssues({
      "1": { class_type: "UNETLoader", inputs: {} }
    }, {})).toEqual([]);
  });

  it("does not accept a numeric combo where a string input is required", () => {
    const objectInfo = nativeH3ObjectInfo() as any;
    objectInfo.BlockSparseAttention.input.required.dense_blocks = [[1, 2], {}];

    expect(h3ExecutionNodeRuntimeIssues(nativeH3Workflow(), objectInfo)).toContain(
      "BlockSparseAttention.dense_blocks schema 类型不兼容：要求 STRING"
    );
  });
});

describe("H3 Continuum V3.8 runtime contract", () => {
  it("accepts the string-valued file picker schema used by Load Video", () => {
    const noSchema = {};
    const workflow = {
      "1": { class_type: "H3ContinuumSamplerV38", inputs: {} }
    };
    const objectInfo = {
      UNETLoader: noSchema,
      CLIPLoader: noSchema,
      VAELoader: noSchema,
      PathchSageAttentionKJ: noSchema,
      KSamplerSelect: noSchema,
      BasicScheduler: noSchema,
      ImageFromBatch: noSchema,
      H3ContinuumLoadVideo: {
        input: {
          required: {
            enable_video: ["BOOLEAN", {}],
            file: [["uploaded/h3-continuum-guide.mp4"], { video_upload: true }],
            force_rate: ["FLOAT", {}]
          }
        }
      },
      H3ContinuumSamplerV38: {
        input: {
          required: {
            model: ["MODEL", {}],
            clip: ["CLIP", {}],
            video_vae: ["VAE", {}],
            sampler: ["SAMPLER", {}],
            sigmas: ["SIGMAS", {}],
            sequence_prompt: ["STRING", {}],
            chunks: ["INT", {}],
            chunk_seconds: ["FLOAT", {}]
          }
        }
      },
      H3ContinuumAssembleSeamV35: {
        input: {
          required: {
            images: ["IMAGE", {}],
            audio: ["AUDIO", {}],
            assembly_plan: ["H3_CONTINUUM_ASSEMBLY_PLAN", {}]
          }
        }
      },
      LocalVideoStudioH3LoadJointAV: {
        input: { required: { artifact: ["STRING", {}] } },
        output: ["LATENT"]
      },
      LocalVideoStudioH3SaveJointAV: {
        input: {
          required: {
            joint_av: ["LATENT", {}],
            filename: ["STRING", {}]
          }
        },
        output: ["STRING"]
      }
    };

    expect(h3ComfyWorkflowRuntimeIssues(workflow, objectInfo)).toEqual([]);
  });
});
