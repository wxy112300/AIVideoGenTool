import type { ImagePromptPreset, UiLocale } from "../../../types.js";
import { createDefaultQwenImage21PromptPresets } from "./content.js";
import { presetLocale as enPresetLocale, referenceRoleLocale as enReferenceRoleLocale, uiLocale as enUiLocale } from "./locale.en-US.js";
import { presetLocale as zhPresetLocale, referenceRoleLocale as zhReferenceRoleLocale, uiLocale as zhUiLocale } from "./locale.zh-CN.js";
import { presetLocale as twPresetLocale, referenceRoleLocale as twReferenceRoleLocale, uiLocale as twUiLocale } from "./locale.zh-TW.js";
import type { ImagePromptPack, ImagePromptUiKey } from "../types.js";

export function qwenImage21PromptPackFor(locale: UiLocale = "zh-CN"): ImagePromptPack {
  const resolvedLocale = locale === "en-US" || locale === "zh-TW" ? locale : "zh-CN";
  const presetLocale = resolvedLocale === "en-US" ? enPresetLocale : resolvedLocale === "zh-TW" ? twPresetLocale : zhPresetLocale;
  const referenceRoleLocale = resolvedLocale === "en-US" ? enReferenceRoleLocale : resolvedLocale === "zh-TW" ? twReferenceRoleLocale : zhReferenceRoleLocale;
  const selectedUiLocale = resolvedLocale === "en-US" ? enUiLocale : resolvedLocale === "zh-TW" ? twUiLocale : zhUiLocale;
  return {
    locale: resolvedLocale,
    defaultPresets: createDefaultQwenImage21PromptPresets(),
    presetLabels: Object.fromEntries(Object.keys(presetLocale).map((id) => [id, presetLocale[id as ImagePromptPreset].label])) as Record<ImagePromptPreset, string>,
    presetDescriptions: Object.fromEntries(Object.keys(presetLocale).map((id) => [id, presetLocale[id as ImagePromptPreset].description])) as Record<ImagePromptPreset, string>,
    referenceRoleLabels: { ...referenceRoleLocale },
    ui: {
      locale: resolvedLocale,
      t(key: ImagePromptUiKey, params = {}) {
        const template = selectedUiLocale[key] ?? zhUiLocale[key] ?? key;
        return template.replace(/\{([A-Za-z0-9_.-]+)\}/gu, (match, name: string) => {
          const value = params[name];
          return value == null ? match : String(value);
        });
      }
    }
  };
}

export {
  createDefaultQwenImage21PromptPresets,
  normalizeQwenImage21PromptPresets,
  qwenImage21PromptContract,
  qwenImage21PromptUserContent,
  normalizeQwenImage21PromptOutput
} from "./content.js";
export type { ImagePromptPack } from "../types.js";
