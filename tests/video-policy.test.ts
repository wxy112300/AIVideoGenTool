import { describe, expect, it } from "vitest";
import { createDefaultDraft } from "../src/core/defaults";
import { H3_SLA_TURBO_LORA, H3_TURBO_LORA, H3_TURBO_V4_LORA } from "../src/core/video-loras";
import {
  normalizeVideoSteps,
  resolveVideoGenerationPolicy,
  shouldApplySpectrum,
  shouldEnableSpectrumByDefault
} from "../src/core/video-policy";

describe("video generation policy", () => {
  it("enables Spectrum after offline installation unless the user has chosen a value", () => {
    const draft = {
      ...createDefaultDraft(),
      spectrumMode: "off" as const,
      spectrumModeUserSet: false
    };
    const installedButOffline = { installed: true, loaded: false, version: "0.2.16" };

    expect(shouldEnableSpectrumByDefault(draft, installedButOffline)).toBe(true);
    expect(shouldEnableSpectrumByDefault({ ...draft, spectrumModeUserSet: true }, installedButOffline)).toBe(false);
    expect(shouldEnableSpectrumByDefault(draft, { installed: false, loaded: false, version: "0.2.16" })).toBe(false);
    expect(shouldEnableSpectrumByDefault(draft, { installed: false, loaded: true, version: "0.2.16" })).toBe(false);
  });

  it("keeps incompatible Turbo and Motion Context profiles from auto-enabling Spectrum", () => {
    const turboDraft = {
      ...createDefaultDraft(),
      spectrumMode: "off" as const,
      spectrumModeUserSet: false,
      videoLoras: [H3_TURBO_LORA]
    };
    expect(shouldEnableSpectrumByDefault(turboDraft, { installed: true, loaded: false, version: "0.2.5" })).toBe(false);
    expect(shouldEnableSpectrumByDefault(turboDraft, { installed: true, loaded: false, version: "0.2.6" })).toBe(true);
    expect(shouldEnableSpectrumByDefault({
      ...turboDraft,
      modelId: "minimax_h3_ref2va",
      inputMode: "video",
      videoLoras: []
    }, { installed: true, loaded: false, version: "0.2.16" })).toBe(false);
  });

  it("switches Turbo to low-step options while keeping Spectrum available", () => {
    const policy = resolveVideoGenerationPolicy({
      modelId: "minimax_h3_fl2va",
      inputMode: "image",
      spectrumMode: "balanced",
      videoLoras: [H3_TURBO_LORA]
    });

    expect(policy.turboEnabled).toBe(true);
    expect(policy.steps.options).toEqual([4]);
    expect(policy.steps.maxValue).toBe(4);
    expect(normalizeVideoSteps(20, policy)).toBe(4);
    expect(policy.spectrum.allowed).toBe(true);
    expect(policy.spectrum.reason).toBeNull();
    expect(shouldApplySpectrum({
      modelId: "minimax_h3_fl2va",
      inputMode: "image",
      spectrumMode: "balanced",
      videoLoras: [H3_TURBO_LORA]
    })).toBe(true);
  });

  it("keeps the v4 step600 quality Turbo on its dedicated six-to-eight-step policy", () => {
    const policy = resolveVideoGenerationPolicy({
      modelId: "minimax_h3_fl2va",
      inputMode: "image",
      spectrumMode: "balanced",
      videoLoras: [H3_TURBO_V4_LORA]
    });

    expect(policy.turboEnabled).toBe(true);
    expect(policy.steps.options).toEqual([6, 8]);
    expect(policy.steps.defaultValue).toBe(8);
    expect(policy.steps.maxValue).toBe(8);
    expect(normalizeVideoSteps(4, policy)).toBe(8);
    expect(normalizeVideoSteps(6, policy)).toBe(6);
    expect(policy.spectrum.allowed).toBe(true);
  });

  it("locks Turbo-SLA to four steps while keeping Spectrum available", () => {
    const policy = resolveVideoGenerationPolicy({
      modelId: "minimax_h3_fl2va",
      inputMode: "image",
      spectrumMode: "balanced",
      videoLoras: [H3_SLA_TURBO_LORA]
    });

    expect(policy.turboEnabled).toBe(true);
    expect(policy.steps.options).toEqual([4]);
    expect(policy.steps.defaultValue).toBe(4);
    expect(policy.steps.maxValue).toBe(4);
    expect(normalizeVideoSteps(20, policy)).toBe(4);
    expect(policy.spectrum.allowed).toBe(true);
    expect(shouldApplySpectrum({
      modelId: "minimax_h3_fl2va",
      inputMode: "image",
      spectrumMode: "balanced",
      videoLoras: [H3_SLA_TURBO_LORA]
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

  it("locks the Q3 GGUF profile to the 3080 starting steps and disables Spectrum", () => {
    const policy = resolveVideoGenerationPolicy({
      modelId: "minimax_h3_fl2va_q3_gguf",
      inputMode: "image",
      spectrumMode: "balanced",
      videoLoras: []
    });

    expect(policy.steps.options).toEqual([4, 6, 8]);
    expect(policy.steps.defaultValue).toBe(8);
    expect(policy.steps.maxValue).toBe(8);
    expect(normalizeVideoSteps(20, policy)).toBe(8);
    expect(normalizeVideoSteps(6, policy)).toBe(6);
    expect(policy.spectrum.allowed).toBe(false);
    expect(shouldApplySpectrum({
      modelId: "minimax_h3_fl2va_q3_gguf",
      inputMode: "image",
      spectrumMode: "balanced",
      videoLoras: []
    })).toBe(false);
  });
});
