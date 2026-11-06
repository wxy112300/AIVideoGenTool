import type { ModelScanProfile } from "../../types";
import type { Translate } from "../../core/i18n";
import { uiKeys } from "../../core/i18n-keys";
import { zhCNCatalog } from "../../core/locales/zh-CN";
import { modelCatalog } from "../../core/catalog";
import type { UiLocale } from "../../types";

// Match whole built-in labels only. Paths, filenames and unknown/custom text
// never pass through word replacement or automatic script conversion.
const resourceKeys = new Map<string, string>(
  Object.values(uiKeys.modelResource).map(key => [zhCNCatalog[key], key])
);

export function localizeModelResourceText(text: string, t: Translate): string {
  const key = resourceKeys.get(text);
  return key ? t(key) : text;
}

/** Display projection only; scan evidence and component indexes stay intact. */
export function localizeModelScanProfile(profile: ModelScanProfile, locale: UiLocale | undefined, t: Translate): ModelScanProfile {
  const localized = modelCatalog.localized(profile.id, locale);
  if (!localized) return profile;
  return {
    ...profile,
    name: localized.name,
    badge: localized.badge ?? profile.badge,
    description: localized.description ?? profile.description,
    vram: localizeModelResourceText(profile.vram, t),
    components: profile.components.map(component => ({
      ...component,
      label: localizeModelResourceText(component.label, t),
      ...(component.installGuide ? { installGuide: {
        ...component.installGuide,
        sourceLabel: localizeModelResourceText(component.installGuide.sourceLabel, t)
      } } : {})
    }))
  };
}
