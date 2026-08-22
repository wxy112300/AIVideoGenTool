import { createTranslator } from "../../core/i18n";
import { uiKeys } from "../../core/i18n-keys";
import { modelCatalog } from "../../core/catalog";
export function videoLoraPurposeLabel(purpose, t = createTranslator("zh-CN").t) {
    return {
        performance: t(uiKeys.shared.loraPerformance),
        style: t(uiKeys.shared.loraStyle),
        content: t(uiKeys.shared.loraContent),
        character: t(uiKeys.shared.loraCharacter),
        motion: t(uiKeys.shared.loraMotion),
        quality: t(uiKeys.shared.loraQuality)
    }[purpose];
}
export function modelName(id, locale = "zh-CN") {
    const catalogLocale = modelCatalog.localized(id, locale);
    return catalogLocale?.shortName ?? catalogLocale?.name ?? id;
}
