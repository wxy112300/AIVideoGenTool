import { createDefaultQwenImage21PromptPresets } from "./content.js";
import { presetLocale as enPresetLocale, referenceRoleLocale as enReferenceRoleLocale, uiLocale as enUiLocale } from "./locale.en-US.js";
import { presetLocale as zhPresetLocale, referenceRoleLocale as zhReferenceRoleLocale, uiLocale as zhUiLocale } from "./locale.zh-CN.js";
import { presetLocale as twPresetLocale, referenceRoleLocale as twReferenceRoleLocale, uiLocale as twUiLocale } from "./locale.zh-TW.js";
export function qwenImage21PromptPackFor(locale = "zh-CN") {
    const resolvedLocale = locale === "en-US" || locale === "zh-TW" ? locale : "zh-CN";
    const presetLocale = resolvedLocale === "en-US" ? enPresetLocale : resolvedLocale === "zh-TW" ? twPresetLocale : zhPresetLocale;
    const referenceRoleLocale = resolvedLocale === "en-US" ? enReferenceRoleLocale : resolvedLocale === "zh-TW" ? twReferenceRoleLocale : zhReferenceRoleLocale;
    const selectedUiLocale = resolvedLocale === "en-US" ? enUiLocale : resolvedLocale === "zh-TW" ? twUiLocale : zhUiLocale;
    return {
        locale: resolvedLocale,
        defaultPresets: createDefaultQwenImage21PromptPresets(),
        presetLabels: Object.fromEntries(Object.keys(presetLocale).map((id) => [id, presetLocale[id].label])),
        presetDescriptions: Object.fromEntries(Object.keys(presetLocale).map((id) => [id, presetLocale[id].description])),
        referenceRoleLabels: { ...referenceRoleLocale },
        ui: {
            locale: resolvedLocale,
            t(key, params = {}) {
                const template = selectedUiLocale[key] ?? zhUiLocale[key] ?? key;
                return template.replace(/\{([A-Za-z0-9_.-]+)\}/gu, (match, name) => {
                    const value = params[name];
                    return value == null ? match : String(value);
                });
            }
        }
    };
}
export { createDefaultQwenImage21PromptPresets, normalizeQwenImage21PromptPresets, qwenImage21PromptContract, qwenImage21PromptUserContent, normalizeQwenImage21PromptOutput } from "./content.js";
