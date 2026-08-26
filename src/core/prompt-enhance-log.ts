import type { EnhanceRequest } from "../types.js";
import { h3PromptModeForRequest, isH3ReferenceAutoPrompt } from "./h3-auto-prompter.js";
import { h3PromptPresetForMode } from "./h3-prompt-presets.js";

export type PromptEnhanceInputKind = "user-text" | "reference-auto" | "empty";
export type PromptPresetFamily = "h3" | "image-edit" | "none";
export type PromptPresetSource = "selected" | "default" | "mode-fallback" | "not-applicable";

/**
 * Safe, non-content metadata for the single prompt submission log entry and
 * its terminal result. Preset bodies, prompt text, reference paths, and seed
 * instructions deliberately do not belong here.
 */
export interface PromptEnhanceLogContext {
  inputKind: PromptEnhanceInputKind;
  presetFamily: PromptPresetFamily;
  selectedPreset: string | null;
  effectivePreset: string | null;
  presetSource: PromptPresetSource;
  autoSeedId: string | null;
  autoVariationId: string | null;
}

export function promptEnhanceLogContext(request: EnhanceRequest): PromptEnhanceLogContext {
  const inputKind: PromptEnhanceInputKind = request.prompt.trim()
    ? "user-text"
    : isH3ReferenceAutoPrompt(request)
      ? "reference-auto"
      : "empty";
  const autoSeedId = inputKind === "reference-auto"
    ? request.autoPromptSeedId?.trim() || null
    : null;
  const autoVariationId = inputKind === "reference-auto"
    ? request.autoPromptVariationId?.trim() || null
    : null;

  if (request.mode === "image-edit") {
    const selectedPreset = request.imageEditEnhanceMode ?? "detail-enhance";
    return {
      inputKind,
      presetFamily: "image-edit",
      selectedPreset,
      effectivePreset: selectedPreset,
      presetSource: request.imageEditEnhanceMode ? "selected" : "default",
      autoSeedId,
      autoVariationId
    };
  }

  const isH3 = request.mode === "h3-vision" || Boolean(
    request.h3PromptMode || request.h3PromptPreset || isH3ReferenceAutoPrompt(request)
  );
  if (!isH3) {
    return {
      inputKind,
      presetFamily: "none",
      selectedPreset: null,
      effectivePreset: null,
      presetSource: "not-applicable",
      autoSeedId,
      autoVariationId
    };
  }

  const mode = h3PromptModeForRequest(request);
  const selectedPreset = request.h3PromptPreset ?? "official-storyboard";
  const effectivePreset = h3PromptPresetForMode(mode, selectedPreset);
  return {
    inputKind,
    presetFamily: "h3",
    selectedPreset,
    effectivePreset,
    presetSource: request.h3PromptPreset
      ? effectivePreset === selectedPreset ? "selected" : "mode-fallback"
      : "default",
    autoSeedId,
    autoVariationId
  };
}
