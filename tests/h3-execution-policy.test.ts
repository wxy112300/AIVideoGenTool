import { describe, expect, it } from "vitest";
import {
  H3_DEFAULT_COMFY_COMPILER_MODE,
  H3_DEFAULT_RUNTIME_MODE,
  H3_DEFAULT_SPARSE_ATTENTION_MODE,
  normalizeH3GlobalSparseAttentionMode,
  resolveH3ExecutionPolicy
} from "../src/core/h3-execution-policy.js";
import {
  H3_PDD_FL2VA_LORA,
  H3_SLA_TURBO_LORA
} from "../src/core/video-loras.js";

describe("native H3 0.35 execution policy", () => {
  it("uses the safe dense compatibility defaults for a normal H3 task", () => {
    const policy = resolveH3ExecutionPolicy({
      modelId: "minimax_h3_fl2va",
      inputMode: "image"
    });

    expect(policy).toMatchObject({
      attentionMode: "sage",
      attentionOwner: "sage",
      sparseAttentionMode: "off",
      runtimeMode: H3_DEFAULT_RUNTIME_MODE,
      comfyCompilerMode: H3_DEFAULT_COMFY_COMPILER_MODE,
      spectrumEnabled: false,
      allowed: true
    });
    expect(H3_DEFAULT_SPARSE_ATTENTION_MODE).toBe("off");
    expect(H3_DEFAULT_COMFY_COMPILER_MODE).toBe("disabled");
  });

  it("maps Comfy Kitchen to the native ModelAttentionBackend owner", () => {
    const policy = resolveH3ExecutionPolicy({
      modelId: "minimax_h3_fl2va",
      inputMode: "image",
      attentionMode: "comfy-kitchen"
    });

    expect(policy.attentionMode).toBe("comfy-kitchen");
    expect(policy.attentionOwner).toBe("comfy-kitchen");
    expect(policy.allowed).toBe(true);
  });

  it("uses native SLA only for the compatible Turbo-SLA route", () => {
    const policy = resolveH3ExecutionPolicy({
      modelId: "minimax_h3_fl2va",
      inputMode: "image",
      videoLoras: [H3_SLA_TURBO_LORA]
    });

    expect(policy).toMatchObject({
      sparseAttentionMode: "native-sla",
      turboProfile: "h3-turbo-sla",
      allowed: true
    });
  });

  it("migrates removed global sparse choices back to dense", () => {
    expect(normalizeH3GlobalSparseAttentionMode("auto")).toBe("off");
    expect(normalizeH3GlobalSparseAttentionMode("native-sla")).toBe("off");
    expect(normalizeH3GlobalSparseAttentionMode("vsa")).toBe("off");
    expect(normalizeH3GlobalSparseAttentionMode("sol-attn")).toBe("sol-attn");
  });

  it("keeps PDD on the native dense path and identifies its low-step profile", () => {
    const policy = resolveH3ExecutionPolicy({
      modelId: "minimax_h3_fl2va",
      inputMode: "image",
      videoLoras: [H3_PDD_FL2VA_LORA]
    });

    expect(policy).toMatchObject({
      sparseAttentionMode: "off",
      turboProfile: "h3-pdd",
      allowed: true
    });
  });

  it("fails closed for the not-yet-validated VSA path", () => {
    const policy = resolveH3ExecutionPolicy({
      modelId: "minimax_h3_fl2va",
      inputMode: "image",
      sparseAttentionMode: "vsa"
    });

    expect(policy.allowed).toBe(false);
    expect(policy.reasons).toContain("vsa-requires-validated-fast-h3");
  });

  it("preserves the Motion Context Spectrum-off boundary", () => {
    const policy = resolveH3ExecutionPolicy({
      modelId: "minimax_h3_ref2va",
      inputMode: "video",
      spectrumMode: "balanced"
    });

    expect(policy.spectrumEnabled).toBe(false);
    expect(policy.reasons).toContain("motion-context-spectrum-conflict");
  });
});
