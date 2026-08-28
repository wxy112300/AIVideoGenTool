import { describe, expect, it } from "vitest";
import {
  h3MemoryOptimizationInputNames,
  h3MemoryOptimizationRuntimeIssues
} from "../src/core/h3-memory-contract";

const objectInfo = {
  H3MemoryOptimization: {
    input: {
      required: {
        model: ["MODEL"],
        mlp_memory: [["auto", "off"], {}],
        chunk_rows: ["INT", { min: 256, max: 65536, step: 256, default: 4096 }],
        precision_mode: [["Auto", "BF16", "Preserve native", "Force quant"], {}],
        qkv_streaming_mode: [["Off", "Auto", "Forced"], {}]
      }
    }
  },
  H3AIMDOResidencyLimiter: {
    input: {
      required: {
        model: ["MODEL"],
        residency: [["stock", "0 blocks", "1 block", "2 blocks", "4 blocks"], {}]
      }
    }
  }
};

describe("H3 Memory Optimization runtime contract", () => {
  it("accepts the current schema without requiring removed legacy inputs", () => {
    expect(h3MemoryOptimizationRuntimeIssues(objectInfo, {
      precisionMode: "Preserve native",
      chunkRows: 4096
    })).toEqual([]);
    expect(h3MemoryOptimizationInputNames(objectInfo)).toEqual(new Set([
      "model",
      "mlp_memory",
      "chunk_rows",
      "precision_mode",
      "qkv_streaming_mode"
    ]));
  });

  it("reports missing model, enum, or integer capabilities precisely", () => {
    const drifted = {
      H3MemoryOptimization: {
        input: {
          required: {
            model: ["STRING"],
            mlp_memory: [["off"], {}],
            chunk_rows: ["INT", { min: 512, max: 4095, step: 512 }],
            precision_mode: [["Auto"], {}],
            qkv_streaming_mode: [["Off"], {}]
          }
        }
      }
    };
    expect(h3MemoryOptimizationRuntimeIssues(drifted, {
      precisionMode: "Preserve native",
      chunkRows: 4096
    })).toEqual([
      "model 不接受 MODEL",
      "mlp_memory 缺少 auto",
      "chunk_rows 不接受 4096",
      "precision_mode 缺少 Preserve native",
      "qkv_streaming_mode 缺少 Auto",
      "未注册 H3AIMDOResidencyLimiter"
    ]);
  });

  it("reports an unregistered node separately", () => {
    expect(h3MemoryOptimizationRuntimeIssues({}, {
      precisionMode: "Auto",
      chunkRows: 4096
    })).toEqual(["未注册 H3MemoryOptimization"]);
  });
});
