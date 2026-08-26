import { defaultH3PromptPresets } from "./content.js";
import { h3SnippetDefinitions } from "./snippets.js";
import { presetLocale as enPresetLocale, referenceRoleLocale as enReferenceRoleLocale, snippetLocale as enSnippetLocale, uiLocale as enUiLocale } from "./locale.en-US.js";
import { presetLocale as zhPresetLocale, referenceRoleLocale as zhReferenceRoleLocale, snippetLocale as zhSnippetLocale, uiLocale as zhUiLocale } from "./locale.zh-CN.js";
import { presetLocale as twPresetLocale, referenceRoleLocale as twReferenceRoleLocale, snippetLocale as twSnippetLocale, uiLocale as twUiLocale } from "./locale.zh-TW.js";
export const h3PromptPresetOrder = [
    "official-storyboard",
    "detailed-cinematic",
    "reference-faithful",
    "continuous-motion",
    "dialogue-sound",
    "beat-storyboard",
    "product-brand",
    "music-video",
    "narrative-animation",
    "multi-reference"
];
export function h3PromptPresetForMode(mode, requestedPreset = "official-storyboard") {
    return mode === "R2V" || requestedPreset !== "multi-reference"
        ? requestedPreset
        : "official-storyboard";
}
export function h3PromptPackFor(locale = "zh-CN") {
    const resolvedLocale = locale === "en-US" || locale === "zh-TW" ? locale : "zh-CN";
    const presetLocale = resolvedLocale === "en-US" ? enPresetLocale : resolvedLocale === "zh-TW" ? twPresetLocale : zhPresetLocale;
    const snippetLocale = resolvedLocale === "en-US" ? enSnippetLocale : resolvedLocale === "zh-TW" ? twSnippetLocale : zhSnippetLocale;
    const selectedUiLocale = resolvedLocale === "en-US" ? enUiLocale : resolvedLocale === "zh-TW" ? twUiLocale : zhUiLocale;
    const fallbackUiLocale = zhUiLocale;
    const referenceRoleLocale = resolvedLocale === "en-US" ? enReferenceRoleLocale : resolvedLocale === "zh-TW" ? twReferenceRoleLocale : zhReferenceRoleLocale;
    const ui = {
        locale: resolvedLocale,
        t(key, params = {}) {
            const template = selectedUiLocale[key] ?? fallbackUiLocale[key] ?? key;
            return template.replace(/\{([A-Za-z0-9_.-]+)\}/gu, (match, name) => {
                const value = params[name];
                return value == null ? match : String(value);
            });
        }
    };
    return {
        locale: resolvedLocale,
        presetOrder: h3PromptPresetOrder,
        defaultPresets: { ...defaultH3PromptPresets },
        presetLabels: Object.fromEntries(h3PromptPresetOrder.map((id) => [id, (presetLocale[id] ?? zhPresetLocale[id]).label])),
        presetDescriptions: Object.fromEntries(h3PromptPresetOrder.map((id) => [id, (presetLocale[id] ?? zhPresetLocale[id]).description])),
        snippets: h3SnippetDefinitions.map((snippet) => {
            const localized = snippetLocale[snippet.id] ?? zhSnippetLocale[snippet.id];
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
export function promptSnippetFor(id) {
    return h3SnippetDefinitions.find((snippet) => snippet.id === id)?.text ?? "";
}
export { createDefaultH3AutoPromptSeedInstructions, h3AutoPromptSeedFor, h3AutoPromptSeeds } from "./auto-seeds.js";
export { createDefaultH3PromptPresets, defaultH3PromptPresets } from "./content.js";
