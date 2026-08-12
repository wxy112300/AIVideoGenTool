import type { UiLocale } from "../types.js";
import { zhCNCatalog } from "./locales/zh-CN.js";

export const defaultUiLocale: UiLocale = "zh-CN";
export const supportedUiLocales = ["zh-CN", "en-US"] as const satisfies readonly UiLocale[];

export type TranslationParams = Record<string, string | number>;
export type TranslationCatalog = Record<string, string>;
export type TranslationCatalogs = Partial<Record<UiLocale, TranslationCatalog>>;

export interface Translator {
  readonly locale: UiLocale;
  t(key: string, params?: TranslationParams, fallback?: string): string;
}

export type Translate = Translator["t"];

export const uiTranslationCatalogs: TranslationCatalogs = {
  "zh-CN": zhCNCatalog
};

const localeLoaders: Partial<Record<UiLocale, () => Promise<TranslationCatalog>>> = {
  "en-US": async () => (await import("./locales/en-US.js")).enUSCatalog
};
const localeLoadPromises: Partial<Record<UiLocale, Promise<TranslationCatalog>>> = {};

export function isUiLocale(value: unknown): value is UiLocale {
  return typeof value === "string" && supportedUiLocales.includes(value as UiLocale);
}

export function normalizeUiLocale(value: unknown): UiLocale {
  return isUiLocale(value) ? value : defaultUiLocale;
}

export async function loadUiLocale(locale: unknown): Promise<UiLocale> {
  const resolvedLocale = normalizeUiLocale(locale);
  if (uiTranslationCatalogs[resolvedLocale]) return resolvedLocale;
  const loader = localeLoaders[resolvedLocale];
  if (!loader) return resolvedLocale;
  const pending = localeLoadPromises[resolvedLocale] ?? (localeLoadPromises[resolvedLocale] = loader());
  try {
    uiTranslationCatalogs[resolvedLocale] = await pending;
    return resolvedLocale;
  } finally {
    delete localeLoadPromises[resolvedLocale];
  }
}

function interpolate(template: string, params: TranslationParams): string {
  return template.replace(/\{([A-Za-z0-9_.-]+)\}/gu, (match, key: string) => {
    const value = params[key];
    return value == null ? match : String(value);
  });
}

export function createTranslator(
  locale: unknown = defaultUiLocale,
  catalogs: TranslationCatalogs = uiTranslationCatalogs
): Translator {
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
