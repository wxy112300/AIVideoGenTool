import type { H3PromptMode, H3PromptPreset, UiLocale } from "../../../types.js";
import { defaultH3PromptPresets } from "./content.js";
import { h3SnippetDefinitions } from "./snippets.js";
import { presetLocale as enPresetLocale, referenceRoleLocale as enReferenceRoleLocale, snippetLocale as enSnippetLocale, uiLocale as enUiLocale } from "./locale.en-US.js";
import { presetLocale as zhPresetLocale, referenceRoleLocale as zhReferenceRoleLocale, snippetLocale as zhSnippetLocale, uiLocale as zhUiLocale } from "./locale.zh-CN.js";
import { presetLocale as twPresetLocale, referenceRoleLocale as twReferenceRoleLocale, snippetLocale as twSnippetLocale, uiLocale as twUiLocale } from "./locale.zh-TW.js";
import type { H3PromptPack, H3PromptUiKey, PromptUi, PromptUiLocale } from "../types.js";

export const h3PromptPresetOrder: readonly H3PromptPreset[] = [
  "official-storyboard",
  "reference-faithful",
  "continuous-motion",
  "dialogue-sound",
  "beat-storyboard",
  "product-brand",
  "music-video",
  "narrative-animation",
  "multi-reference"
];

export function h3PromptPresetForMode(
  mode: H3PromptMode,
  requestedPreset: H3PromptPreset = "official-storyboard"
): H3PromptPreset {
  return mode === "R2V" || requestedPreset !== "multi-reference"
    ? requestedPreset
    : "official-storyboard";
}

export function h3PromptPackFor(locale: UiLocale = "zh-CN"): H3PromptPack {
  const resolvedLocale = locale === "en-US" || locale === "zh-TW" ? locale : "zh-CN";
  const presetLocale = resolvedLocale === "en-US" ? enPresetLocale : resolvedLocale === "zh-TW" ? twPresetLocale : zhPresetLocale;
  const snippetLocale = resolvedLocale === "en-US" ? enSnippetLocale : resolvedLocale === "zh-TW" ? twSnippetLocale : zhSnippetLocale;
  const selectedUiLocale = resolvedLocale === "en-US" ? enUiLocale : resolvedLocale === "zh-TW" ? twUiLocale : zhUiLocale;
  const fallbackUiLocale = zhUiLocale;
  const referenceRoleLocale = resolvedLocale === "en-US" ? enReferenceRoleLocale : resolvedLocale === "zh-TW" ? twReferenceRoleLocale : zhReferenceRoleLocale;
  const ui: PromptUi = {
    locale: resolvedLocale,
    t(key: H3PromptUiKey, params = {}) {
      const template = selectedUiLocale[key] ?? fallbackUiLocale[key] ?? key;
      return template.replace(/\{([A-Za-z0-9_.-]+)\}/gu, (match, name: string) => {
        const value = params[name];
        return value == null ? match : String(value);
      });
    }
  };
  return {
    locale: resolvedLocale,
    presetOrder: h3PromptPresetOrder,
    defaultPresets: { ...defaultH3PromptPresets },
    presetLabels: Object.fromEntries(
      h3PromptPresetOrder.map((id) => [id, (presetLocale[id] ?? zhPresetLocale[id]).label])
    ) as Record<H3PromptPreset, string>,
    presetDescriptions: Object.fromEntries(
      h3PromptPresetOrder.map((id) => [id, (presetLocale[id] ?? zhPresetLocale[id]).description])
    ) as Record<H3PromptPreset, string>,
    snippets: h3SnippetDefinitions.map((snippet) => {
      const localized = snippetLocale[snippet.id] ?? zhSnippetLocale[snippet.id]!;
      return {
        id: snippet.id,
        group: localized.group,
        label: localized.label,
        text: snippet.text
      };
    }),
    ui,
    referenceRoleLabels: { ...referenceRoleLocale }
  };
}

export function promptSnippetFor(id: string): string {
  return h3SnippetDefinitions.find((snippet) => snippet.id === id)?.text ?? "";
}

export {
  createDefaultH3AutoPromptSeedInstructions,
  h3AutoPromptSeedFor,
  h3AutoPromptSeeds
} from "./auto-seeds.js";
export { createDefaultH3PromptPresets, defaultH3PromptPresets } from "./content.js";
export type { H3PromptPack } from "../types.js";
