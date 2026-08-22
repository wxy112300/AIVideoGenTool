import { zhCNCatalog } from "./locales/zh-CN.js";
export const defaultUiLocale = "zh-CN";
export const supportedUiLocales = ["zh-CN", "zh-TW", "en-US"];
export const uiTranslationCatalogs = {
    "zh-CN": zhCNCatalog
};
const localeLoaders = {
    "en-US": async () => (await import("./locales/en-US.js")).enUSCatalog,
    "zh-TW": async () => (await import("./locales/zh-TW.js")).zhTWCatalog
};
const localeLoadPromises = {};
export function isUiLocale(value) {
    return typeof value === "string" && supportedUiLocales.includes(value);
}
export function normalizeUiLocale(value) {
    return isUiLocale(value) ? value : defaultUiLocale;
}
export async function loadUiLocale(locale) {
    const resolvedLocale = normalizeUiLocale(locale);
    if (uiTranslationCatalogs[resolvedLocale])
        return resolvedLocale;
    const loader = localeLoaders[resolvedLocale];
    if (!loader)
        return resolvedLocale;
    const pending = localeLoadPromises[resolvedLocale] ?? (localeLoadPromises[resolvedLocale] = loader());
    try {
        uiTranslationCatalogs[resolvedLocale] = await pending;
        return resolvedLocale;
    }
    finally {
        delete localeLoadPromises[resolvedLocale];
    }
}
function interpolate(template, params) {
    return template.replace(/\{([A-Za-z0-9_.-]+)\}/gu, (match, key) => {
        const value = params[key];
        return value == null ? match : String(value);
    });
}
export function createTranslator(locale = defaultUiLocale, catalogs = uiTranslationCatalogs) {
    const resolvedLocale = normalizeUiLocale(locale);
    return {
        locale: resolvedLocale,
        t(key, params = {}, fallback = key) {
            const template = catalogs[resolvedLocale]?.[key] ??
                catalogs[defaultUiLocale]?.[key] ??
                fallback;
            return interpolate(template, params);
        }
    };
}
