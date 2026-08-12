import type { ImagePromptPreset, UiLocale } from "../../../types.js";
import { createDefaultQwenImagePromptPresets } from "./content.js";
import { presetLocale as enPresetLocale, referenceRoleLocale as enReferenceRoleLocale, uiLocale as enUiLocale } from "./locale.en-US.js";
import { presetLocale as zhPresetLocale, referenceRoleLocale as zhReferenceRoleLocale, uiLocale as zhUiLocale } from "./locale.zh-CN.js";
import type { ImagePromptPack, ImagePromptUiKey } from "../types.js";

export function qwenImagePromptPackFor(locale: UiLocale = "zh-CN"): ImagePromptPack {
  const resolvedLocale = locale === "en-US" ? "en-US" : "zh-CN";
  const presetLocale = resolvedLocale === "en-US" ? enPresetLocale : zhPresetLocale;
  const referenceRoleLocale = resolvedLocale === "en-US" ? enReferenceRoleLocale : zhReferenceRoleLocale;
  const selectedUiLocale = resolvedLocale === "en-US" ? enUiLocale : zhUiLocale;
  return {
    locale: resolvedLocale,
    defaultPresets: createDefaultQwenImagePromptPresets(),
    presetLabels: Object.fromEntries(
      Object.keys(presetLocale).map((id) => [id, presetLocale[id as ImagePromptPreset].label])
    ) as Record<ImagePromptPreset, string>,
    presetDescriptions: Object.fromEntries(
      Object.keys(presetLocale).map((id) => [id, presetLocale[id as ImagePromptPreset].description])
    ) as Record<ImagePromptPreset, string>,
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
  createDefaultQwenImagePromptPresets,
  normalizeQwenImagePromptPresets,
  qwenImageEditPromptContract,
  qwenImageEditPromptUserContent,
  normalizeQwenImageEditPromptOutput
} from "./content.js";
export type { ImagePromptPack } from "../types.js";
