import type { UiLocale } from "../types.js";

export const defaultUiLocale: UiLocale = "zh-CN";
export const supportedUiLocales = ["zh-CN", "en-US"] as const satisfies readonly UiLocale[];

export type TranslationParams = Record<string, string | number>;
export type TranslationCatalog = Record<string, string>;
export type TranslationCatalogs = Partial<Record<UiLocale, TranslationCatalog>>;

export interface Translator {
  readonly locale: UiLocale;
  t(key: string, params?: TranslationParams, fallback?: string): string;
}

export const uiTranslationCatalogs: TranslationCatalogs = {
  "zh-CN": {
    "task.status.waiting": "等待",
    "task.status.running": "运行中",
    "task.status.completed": "完成",
    "task.status.failed": "失败",
    "task.status.cancelled": "已取消"
  }
};

export function isUiLocale(value: unknown): value is UiLocale {
  return typeof value === "string" && supportedUiLocales.includes(value as UiLocale);
}

export function normalizeUiLocale(value: unknown): UiLocale {
  return isUiLocale(value) ? value : defaultUiLocale;
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
