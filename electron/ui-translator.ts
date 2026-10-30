import { createTranslator } from "../src/core/i18n.js";
import { zhCNCatalog } from "../src/core/locales/zh-CN.js";
import { zhTWCatalog } from "../src/core/locales/zh-TW.js";
import { enUSCatalog } from "../src/core/locales/en-US.js";

// Native dialogs cannot depend on the renderer's lazy-loaded catalogs.
export function createNativeTranslator(locale: unknown) {
  return createTranslator(locale, {
    "zh-CN": zhCNCatalog,
    "zh-TW": zhTWCatalog,
    "en-US": enUSCatalog
  });
}
