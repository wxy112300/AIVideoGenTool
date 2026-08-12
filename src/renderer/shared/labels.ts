import type { UiLocale, VideoLoraPurpose } from "../../types";
import { createTranslator, type Translate } from "../../core/i18n";
import { uiKeys } from "../../core/i18n-keys";
import { modelCatalog } from "../../core/catalog";

export function videoLoraPurposeLabel(
  purpose: VideoLoraPurpose,
  t: Translate = createTranslator("zh-CN").t
): string {
  return ({
    performance: t(uiKeys.shared.loraPerformance),
    style: t(uiKeys.shared.loraStyle),
    content: t(uiKeys.shared.loraContent),
    character: t(uiKeys.shared.loraCharacter),
    motion: t(uiKeys.shared.loraMotion),
    quality: t(uiKeys.shared.loraQuality)
  } satisfies Record<VideoLoraPurpose, string>)[purpose];
}

export function modelName(id: string, locale: UiLocale = "zh-CN"): string {
  const catalogLocale = modelCatalog.localized(id, locale);
  return catalogLocale?.shortName ?? catalogLocale?.name ?? id;
}
