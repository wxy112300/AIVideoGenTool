import { describe, expect, it } from "vitest";
import { H3_TURBO_LORA } from "../src/core/video-loras";
import {
  normalizeVideoSteps,
  resolveVideoGenerationPolicy,
  shouldApplySpectrum
} from "../src/core/video-policy";

describe("video generation policy", () => {
  it("switches Turbo to low-step options while keeping Spectrum available", () => {
    const policy = resolveVideoGenerationPolicy({
      modelId: "minimax_h3_fl2va",
      inputMode: "image",
      spectrumMode: "balanced",
      videoLoras: [H3_TURBO_LORA]
    });

    expect(policy.turboEnabled).toBe(true);
    expect(policy.steps.options).toEqual([4, 6, 8]);
    expect(policy.steps.maxValue).toBe(8);
    expect(normalizeVideoSteps(20, policy)).toBe(8);
    expect(policy.spectrum.allowed).toBe(true);
    expect(policy.spectrum.reason).toBeNull();
    expect(shouldApplySpectrum({
      modelId: "minimax_h3_fl2va",
      inputMode: "image",
      spectrumMode: "balanced",
      videoLoras: [H3_TURBO_LORA]
    })).toBe(true);
  });

  it("keeps Spectrum available for standard H3 image generation", () => {
    const policy = resolveVideoGenerationPolicy({
      modelId: "minimax_h3_fl2va",
      inputMode: "image",
      spectrumMode: "balanced",
      videoLoras: []
    });

    expect(policy.turboEnabled).toBe(false);
    expect(policy.steps.options).toEqual([20, 16, 12]);
    expect(policy.spectrum.allowed).toBe(true);
    expect(policy.spectrum.reason).toBeNull();
    expect(shouldApplySpectrum({
      modelId: "minimax_h3_fl2va",
      inputMode: "image",
      spectrumMode: "balanced",
      videoLoras: []
    })).toBe(true);
  });

  it("disables Spectrum for R2V extension while keeping it available for R2V generation", () => {
    const extensionPolicy = resolveVideoGenerationPolicy({
      modelId: "minimax_h3_ref2va",
      inputMode: "video",
      spectrumMode: "balanced",
      videoLoras: []
    });
    const generationPolicy = resolveVideoGenerationPolicy({
      modelId: "minimax_h3_ref2va",
      inputMode: "image",
      spectrumMode: "balanced",
      videoLoras: []
    });

    expect(extensionPolicy.spectrum.allowed).toBe(false);
    expect(extensionPolicy.spectrum.reason).toBe("motion-context");
    expect(generationPolicy.spectrum.allowed).toBe(true);
  });
});
