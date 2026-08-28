import { describe, expect, it } from "vitest";
import {
  H3_MEMORY_DEFAULT_ENABLED,
  H3_MEMORY_PRODUCT_ENABLED,
  normalizeH3MemoryChunkRows,
  normalizeH3MemoryOptimizationMode,
  normalizeH3MemoryOptions,
  resolveMiniMaxH3ExecutionPlan
} from "../src/core/h3-memory-policy.js";
import { H3_SLA_TURBO_LORA } from "../src/core/video-loras.js";

describe("H3 Memory Optimization persisted options", () => {
  it("keeps Gate A opt-in disabled and uses the upstream chunk default", () => {
    expect(H3_MEMORY_DEFAULT_ENABLED).toBe(false);
    expect(H3_MEMORY_PRODUCT_ENABLED).toBe(false);
    expect(normalizeH3MemoryOptions({})).toEqual({
      h3MemoryOptimizationMode: "off",
      h3MemoryOptimizationUserSet: false,
      h3MemoryChunkRows: 4096
    });
  });

  it("forces current and legacy persisted modes off", () => {
    expect(normalizeH3MemoryOptimizationMode("preserve-native")).toBe("off");
    expect(normalizeH3MemoryOptimizationMode("auto")).toBe("off");
    expect(normalizeH3MemoryOptimizationMode("force-quant")).toBe("off");
    expect(normalizeH3MemoryOptimizationMode("legacy-mode")).toBe("off");
    expect(normalizeH3MemoryOptions({
      h3MemoryOptimizationMode: "auto",
      h3MemoryOptimizationUserSet: true
    })).toMatchObject({
      h3MemoryOptimizationMode: "off",
      h3MemoryOptimizationUserSet: false
    });
    expect(normalizeH3MemoryChunkRows(4097)).toBe(4096);
    expect(normalizeH3MemoryChunkRows(257)).toBe(256);
    expect(normalizeH3MemoryChunkRows(70000)).toBe(65536);
    expect(normalizeH3MemoryChunkRows("4096")).toBe(4096);
  });

  it("keeps configured attention while forcing requested Memory off", () => {
    const plan = resolveMiniMaxH3ExecutionPlan({
      modelId: "minimax_h3_fl2va",
      inputMode: "image",
      attentionMode: "sage-triton",
      h3MemoryOptimizationMode: "preserve-native",
      h3MemoryChunkRows: 8192,
      spectrumMode: "off",
      h3LivePreview: true,
      memoryNode: {
        installed: true,
        loaded: true,
        runtimeVerified: false,
        runtimeMissingNodeTypes: [],
        compatibilityState: "supported"
      }
    });

    expect(plan).toMatchObject({
      attention: "sage",
      memory: "off",
      chunkRows: 8192,
      spectrumEnabled: false,
      previewEnabled: true,
      allowed: true
    });
    expect(plan.normalizedFrom).toContain("memory:preserve-native->off");
  });

  it("does not apply dormant Memory compatibility blockers", () => {
    expect(resolveMiniMaxH3ExecutionPlan({
      modelId: "minimax_h3_fl2va_q3_gguf",
      inputMode: "image",
      h3MemoryOptimizationMode: "auto"
    }).reasons).not.toContain("q3-gguf-not-supported");
    expect(resolveMiniMaxH3ExecutionPlan({
      modelId: "minimax_h3_ref2va",
      inputMode: "video",
      h3MemoryOptimizationMode: "auto"
    }).reasons).not.toContain("motion-context-not-supported");
    expect(resolveMiniMaxH3ExecutionPlan({
      modelId: "minimax_h3_fl2va",
      inputMode: "image",
      videoLoras: [H3_SLA_TURBO_LORA],
      h3MemoryOptimizationMode: "auto"
    }).reasons).not.toContain("turbo-memory-not-validated");
  });

  it("preserves global Sage when a stale Memory value is present", () => {
    const plan = resolveMiniMaxH3ExecutionPlan({
      modelId: "minimax_h3_fl2va",
      inputMode: "image",
      attentionMode: "sage",
      spectrumMode: "balanced",
      h3MemoryOptimizationMode: "preserve-native",
      h3MemoryChunkRows: 4096,
      memoryNode: {
        installed: true,
        loaded: true,
        runtimeVerified: false,
        runtimeMissingNodeTypes: [],
        compatibilityState: "supported"
      }
    });

    expect(plan).toMatchObject({
      attention: "sage",
      memory: "off",
      spectrumEnabled: true,
      spectrumRequested: true,
      allowed: true
    });
    expect(plan.normalizedFrom).toContain("memory:preserve-native->off");
    expect(plan.reasons).not.toContain("spectrum-memory-conflict");
  });

  it("detects a second attention owner instead of silently stacking patches", () => {
    const plan = resolveMiniMaxH3ExecutionPlan({
      modelId: "minimax_h3_fl2va",
      inputMode: "image",
      attentionMode: "sage",
      existingGraphAttentionOwners: ["sage", "pytorch"]
    });
    expect(plan.allowed).toBe(false);
    expect(plan.reasons).toContain("attention-conflict");
  });
});
