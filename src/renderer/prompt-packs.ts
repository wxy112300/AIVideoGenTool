import type { H3PromptMode, H3PromptPreset, ImagePromptPreset, UiLocale } from "../types";

type PromptPackModule = typeof import("../core/prompts/index");

let promptPackModule: PromptPackModule | undefined;
let promptPackLoad: Promise<PromptPackModule> | undefined;

export async function loadPromptPacks(): Promise<void> {
  if (promptPackModule) return;
  promptPackLoad ??= import("../core/prompts/index");
  promptPackModule = await promptPackLoad;
}

function loadedPromptPacks(): PromptPackModule {
  if (!promptPackModule) {
    throw new Error("Prompt Pack is not loaded for the active renderer page.");
  }
  return promptPackModule;
}

export function h3PromptPackFor(locale: UiLocale = "zh-CN") {
  return loadedPromptPacks().h3PromptPackFor(locale);
}

export function qwenImagePromptPackFor(locale: UiLocale = "zh-CN") {
  return loadedPromptPacks().qwenImagePromptPackFor(locale);
}

export function h3PromptPresetForMode(
  mode: H3PromptMode,
  requestedPreset: H3PromptPreset = "official-storyboard"
) {
  return loadedPromptPacks().h3PromptPresetForMode(mode, requestedPreset);
}

export function promptSnippetFor(id: string): string {
  return loadedPromptPacks().promptSnippetFor(id);
}

export function createDefaultH3PromptPresets() {
  return loadedPromptPacks().createDefaultH3PromptPresets();
}

export function createDefaultQwenImagePromptPresets(): Record<ImagePromptPreset, string> {
  return loadedPromptPacks().createDefaultQwenImagePromptPresets();
}
