import { describe, expect, it } from "vitest";
import { createDefaultDraft } from "../src/core/defaults";
import { normalizeVideoDraft, videoModelSupportsDraftInput } from "../src/core/video-draft-normalization";
import { H3_REF2V_TURBO_LORA, H3_REF2V_TURBO_LORA_ID } from "../src/core/video-loras";
import { shouldEnableSpectrumByDefault } from "../src/core/video-policy";

describe("video draft normalization", () => {
  it("removes incompatible cross-model state from H3 drafts", () => {
    const normalized = normalizeVideoDraft({
      ...createDefaultDraft(),
      fps: 12,
      frameInterpolation: "rife2x",
      h3MemoryOptimizationMode: "preserve-native",
      h3MemoryOptimizationUserSet: true,
      videoLoras: [{
        id: "other-model-lora",
        name: "Other model",
        filename: "other.safetensors",
        strength: 1,
        modelFamily: "other",
        compatibleModelIds: ["sulphur2"],
        compatibleInputModes: ["image"],
        purpose: "style"
      }]
    });

    expect(normalized).toMatchObject({
      modelId: "minimax_h3_fl2va",
      fps: 24,
      frameInterpolation: "off",
      videoLoras: [],
      h3MemoryOptimizationMode: "off",
      h3MemoryOptimizationUserSet: false
    });
  });

  it("preserves supported non-H3 RIFE settings while disabling H3-only spectrum", () => {
    const normalized = normalizeVideoDraft({
      ...createDefaultDraft(),
      modelId: "sulphur2",
      fps: 12,
      frameInterpolation: "rife2x",
      spectrumMode: "balanced"
    });

    expect(normalized.fps).toBe(12);
    expect(normalized.frameInterpolation).toBe("rife2x");
    expect(normalized.spectrumMode).toBe("off");
  });

  it("clears every LoRA from the Q3 profile regardless of self-declared compatibility", () => {
    const normalized = normalizeVideoDraft({
      ...createDefaultDraft(),
      modelId: "minimax_h3_fl2va_q3_gguf",
      videoLoras: [{
        id: "custom-q3-lora",
        name: "Custom Q3 LoRA",
        filename: "custom-q3.safetensors",
        strength: 1,
        modelFamily: "custom",
        compatibleModelIds: [],
        compatibleInputModes: ["image"],
        purpose: "style"
      }]
    });

    expect(normalized.videoLoras).toEqual([]);
    expect(normalized.steps).toBe(8);
  });

  it("keeps manual Spectrum off while marking policy-forced off as automatic", () => {
    const manuallyOff = normalizeVideoDraft({
      ...createDefaultDraft(),
      modelId: "sulphur2",
      spectrumMode: "off",
      spectrumModeUserSet: true
    });
    const policyForcedOff = normalizeVideoDraft({
      ...createDefaultDraft(),
      modelId: "sulphur2",
      spectrumMode: "balanced",
      spectrumModeUserSet: true
    });

    expect(manuallyOff.spectrumModeUserSet).toBe(true);
    expect(policyForcedOff).toMatchObject({
      spectrumMode: "off",
      spectrumModeUserSet: false,
      spectrumModelAwareMode: "off"
    });
    expect(shouldEnableSpectrumByDefault(
      { ...policyForcedOff, modelId: "minimax_h3_fl2va" },
      { installed: true, loaded: false, version: "0.2.16" }
    )).toBe(true);
  });

  it("normalizes the R2V Motion Context combination without dropping source fields", () => {
    const normalized = normalizeVideoDraft({
      ...createDefaultDraft(),
      modelId: "minimax_h3_ref2va",
      inputMode: "video",
      sourceVideoPath: "C:/input/source.mp4",
      sourceVideoDuration: 9,
      trimStartSeconds: 1,
      trimEndSeconds: 8,
      steps: 4,
      spectrumMode: "balanced",
      spectrumModeUserSet: true,
      spectrumModelAwareMode: "enabled",
      videoLoras: [H3_REF2V_TURBO_LORA]
    });

    expect(normalized).toMatchObject({
      modelId: "minimax_h3_ref2va",
      inputMode: "video",
      sourceVideoPath: "C:/input/source.mp4",
      sourceVideoDuration: 9,
      trimStartSeconds: 1,
      trimEndSeconds: 8,
      steps: 20,
      fps: 24,
      frameInterpolation: "off",
      spectrumMode: "off",
      spectrumModeUserSet: false,
      spectrumModelAwareMode: "off",
      videoLoras: []
    });
  });

  it("is idempotent", () => {
    const once = normalizeVideoDraft({
      ...createDefaultDraft(),
      fps: 12,
      frameInterpolation: "rife4x"
    });
    expect(normalizeVideoDraft(once)).toEqual(once);
  });

  it("migrates the legacy Ref2V Turbo pseudo-model to its canonical LoRA profile", () => {
    const normalized = normalizeVideoDraft({
      ...createDefaultDraft(),
      modelId: "minimax_h3_ref2va_turbo",
      fps: 12,
      frameInterpolation: "rife2x",
      videoLoras: []
    });

    expect(normalized).toMatchObject({
      modelId: "minimax_h3_ref2va",
      steps: 4,
      fps: 24,
      frameInterpolation: "off"
    });
    expect(normalized.videoLoras.map((lora) => lora.id)).toEqual([H3_REF2V_TURBO_LORA_ID]);
  });

  it("honors declared model input modes while preserving unknown workflow models", () => {
    expect(videoModelSupportsDraftInput("minimax_h3_fl2va_q3_gguf", "image")).toBe(true);
    expect(videoModelSupportsDraftInput("minimax_h3_fl2va_q3_gguf", "video")).toBe(false);
    expect(videoModelSupportsDraftInput("custom-workflow-model", "video")).toBe(true);
  });
});