import { describe, expect, it } from "vitest";
import { normalizeMiniMaxH3ModelPatchChain } from "../src/core/h3-memory-workflow";

type TestNode = { class_type: string; inputs: Record<string, unknown> };

function workflowWithSage(): Record<string, TestNode> {
  return {
    "1": { class_type: "UNETLoader", inputs: { unet_name: "h3.safetensors" } },
    "2": {
      class_type: "PathchSageAttentionKJ",
      inputs: { model: ["1", 0], sage_attention: "sageattn_qk_int8_pv_fp16_cuda" }
    },
    "8": { class_type: "BasicScheduler", inputs: { model: ["2", 0] } },
    "10": { class_type: "BasicGuider", inputs: { model: ["2", 0] } }
  };
}

const standardOptions = {
  modelId: "minimax_h3_fl2va",
  inputMode: "image" as const,
  attentionMode: "sage"
};

function nodeIdOf(workflow: Record<string, TestNode>, classType: string): string {
  const match = Object.entries(workflow).find(([, node]) => node.class_type === classType);
  expect(match, `missing ${classType}`).toBeDefined();
  return match![0];
}

function modelInputOf(workflow: Record<string, TestNode>, nodeId: string): [string, number] {
  return workflow[nodeId]!.inputs.model as [string, number];
}

describe("normalizeMiniMaxH3ModelPatchChain", () => {
  it("keeps KJ Triton Sage and ignores a stale Memory request", () => {
    const workflow = workflowWithSage();
    workflow["2"]!.inputs.sage_attention = "sageattn_qk_int8_pv_fp16_triton";

    normalizeMiniMaxH3ModelPatchChain(workflow, {
      ...standardOptions,
      attentionMode: "sage-triton",
      memoryMode: "preserve-native",
      chunkRows: 4096
    });

    expect(workflow["2"]?.inputs.sage_attention).toBe("sageattn_qk_int8_pv_fp16_triton");
    expect(Object.values(workflow).some((node) => node.class_type === "H3MemoryOptimization")).toBe(false);
    expect(Object.values(workflow).some((node) => node.class_type === "H3AIMDOResidencyLimiter")).toBe(false);
    expect(modelInputOf(workflow, "8")).toEqual(["2", 0]);
    expect(modelInputOf(workflow, "10")).toEqual(["2", 0]);
  });

  it("keeps KJ Triton Sage when Memory is off", () => {
    const workflow = workflowWithSage();
    workflow["2"]!.inputs.sage_attention = "sageattn_qk_int8_pv_fp16_triton";

    normalizeMiniMaxH3ModelPatchChain(workflow, {
      ...standardOptions,
      attentionMode: "sage-triton",
      memoryMode: "off"
    });

    expect(workflow["2"]?.inputs.sage_attention).toBe("sageattn_qk_int8_pv_fp16_triton");
    expect(Object.values(workflow).some((node) => node.class_type === "H3MemoryOptimization")).toBe(false);
    expect(modelInputOf(workflow, "8")).toEqual(["2", 0]);
    expect(modelInputOf(workflow, "10")).toEqual(["2", 0]);
  });

  it("does not add Memory wrappers for stale persisted modes", () => {
    const workflow = workflowWithSage();
    normalizeMiniMaxH3ModelPatchChain(workflow, {
      ...standardOptions,
      memoryMode: "preserve-native",
      chunkRows: 8192
    });

    expect(Object.values(workflow).some((node) => node.class_type === "H3MemoryOptimization")).toBe(false);
    expect(Object.values(workflow).some((node) => node.class_type === "H3AIMDOResidencyLimiter")).toBe(false);
    expect(workflow["8"]?.inputs.model).toEqual(["2", 0]);
    expect(workflow["10"]?.inputs.model).toEqual(["2", 0]);
  });

  it("removes existing managed wrappers when memory is switched off and rebuilds the remaining order", () => {
    const workflow = workflowWithSage();
    workflow["3"] = {
      class_type: "H3MemoryOptimization",
      inputs: { model: ["2", 0], chunk_rows: 4096 }
    };
    workflow["4"] = {
      class_type: "SpectrumApplyMiniMaxH3",
      inputs: { model: ["3", 0] }
    };
    workflow["5"] = {
      class_type: "ModelPreviewOverrideKJ",
      inputs: { model: ["4", 0] }
    };
    workflow["8"]!.inputs.model = ["5", 0];
    workflow["10"]!.inputs.model = ["5", 0];

    normalizeMiniMaxH3ModelPatchChain(workflow, {
      ...standardOptions,
      memoryMode: "off",
      spectrumEnabled: true,
      previewEnabled: true,
      tinyVae: "taeh3.safetensors"
    });

    expect(workflow["3"]).toBeUndefined();
    expect(workflow["4"]?.inputs.model).toEqual(["2", 0]);
    expect(workflow["5"]?.inputs.model).toEqual(["4", 0]);
    expect(workflow["8"]?.inputs.model).toEqual(["5", 0]);
    expect(workflow["10"]?.inputs.model).toEqual(["5", 0]);
  });

  it("removes an existing memory node instead of preserving it", () => {
    const workflow = workflowWithSage();
    workflow["3"] = {
      class_type: "H3MemoryOptimization",
      inputs: { model: ["2", 0], chunk_rows: 256, precision_mode: "Auto" }
    };
    workflow["8"]!.inputs.model = ["3", 0];
    workflow["10"]!.inputs.model = ["3", 0];

    normalizeMiniMaxH3ModelPatchChain(workflow, {
      ...standardOptions,
      memoryMode: "auto",
      chunkRows: 16384
    });

    expect(Object.values(workflow).filter((node) => node.class_type === "H3MemoryOptimization")).toHaveLength(0);
    expect(Object.values(workflow).filter((node) => node.class_type === "H3AIMDOResidencyLimiter")).toHaveLength(0);
    expect(workflow["8"]?.inputs.model).toEqual(["2", 0]);
    expect(workflow["10"]?.inputs.model).toEqual(["2", 0]);
  });

  it("composes Spectrum and preview while removing dormant Memory wrappers", () => {
    const workflow = workflowWithSage();
    const options = {
      ...standardOptions,
      memoryMode: "preserve-native" as const,
      chunkRows: 4096,
      spectrumEnabled: true,
      previewEnabled: true,
      tinyVae: "taeh3.safetensors"
    };

    normalizeMiniMaxH3ModelPatchChain(workflow, options);

    const spectrumId = nodeIdOf(workflow, "SpectrumApplyMiniMaxH3");
    const previewId = nodeIdOf(workflow, "ModelPreviewOverrideKJ");
    expect(Object.values(workflow).filter((node) => node.class_type === "H3MemoryOptimization")).toHaveLength(0);
    expect(Object.values(workflow).filter((node) => node.class_type === "H3AIMDOResidencyLimiter")).toHaveLength(0);
    expect(modelInputOf(workflow, spectrumId)).toEqual(["2", 0]);
    expect(modelInputOf(workflow, previewId)).toEqual([spectrumId, 0]);
    expect(modelInputOf(workflow, "8")).toEqual([previewId, 0]);
    expect(modelInputOf(workflow, "10")).toEqual([previewId, 0]);

    const firstKeys = Object.keys(workflow);
    const firstGraph = JSON.stringify(workflow);
    normalizeMiniMaxH3ModelPatchChain(workflow, options);
    expect(Object.keys(workflow)).toEqual(firstKeys);
    expect(JSON.stringify(workflow)).toBe(firstGraph);

    normalizeMiniMaxH3ModelPatchChain(workflow, {
      ...options,
      memoryMode: "off",
      spectrumEnabled: true
    });
    expect(Object.values(workflow).filter((node) => node.class_type === "H3MemoryOptimization")).toHaveLength(0);
    expect(Object.values(workflow).filter((node) => node.class_type === "H3AIMDOResidencyLimiter")).toHaveLength(0);
    expect(modelInputOf(workflow, spectrumId)).toEqual(["2", 0]);
    expect(modelInputOf(workflow, previewId)).toEqual([spectrumId, 0]);
    expect(modelInputOf(workflow, "8")).toEqual([previewId, 0]);
    expect(modelInputOf(workflow, "10")).toEqual([previewId, 0]);

    normalizeMiniMaxH3ModelPatchChain(workflow, {
      ...options,
      spectrumEnabled: false
    });
    expect(Object.values(workflow).filter((node) => node.class_type === "SpectrumApplyMiniMaxH3")).toHaveLength(0);
    expect(Object.values(workflow).filter((node) => node.class_type === "H3MemoryOptimization")).toHaveLength(0);
    expect(Object.values(workflow).filter((node) => node.class_type === "H3AIMDOResidencyLimiter")).toHaveLength(0);
    expect(modelInputOf(workflow, previewId)).toEqual(["2", 0]);
    expect(modelInputOf(workflow, "8")).toEqual([previewId, 0]);
    expect(modelInputOf(workflow, "10")).toEqual([previewId, 0]);
  });

  it("rejects duplicate memory nodes and mixed attention owners", () => {
    const duplicate = workflowWithSage();
    duplicate["3"] = { class_type: "H3MemoryOptimization", inputs: { model: ["2", 0] } };
    duplicate["4"] = { class_type: "H3MemoryOptimization", inputs: { model: ["3", 0] } };
    duplicate["8"]!.inputs.model = ["4", 0];
    duplicate["10"]!.inputs.model = ["4", 0];
    expect(() => normalizeMiniMaxH3ModelPatchChain(duplicate, {
      ...standardOptions,
      memoryMode: "auto"
    })).toThrow(/重复|duplicate/u);

    const conflict = workflowWithSage();
    conflict["3"] = { class_type: "H3SparseAttention", inputs: { model: ["2", 0] } };
    conflict["8"]!.inputs.model = ["3", 0];
    conflict["10"]!.inputs.model = ["3", 0];
    expect(() => normalizeMiniMaxH3ModelPatchChain(conflict, standardOptions)).toThrow(/Attention/u);
  });

  it("fails closed when scheduler and guider do not share one final model", () => {
    const workflow = workflowWithSage();
    workflow["10"]!.inputs.model = ["1", 0];
    expect(() => normalizeMiniMaxH3ModelPatchChain(workflow, {
      ...standardOptions,
      memoryMode: "preserve-native"
    })).toThrow(/不同|different/u);
  });
});
