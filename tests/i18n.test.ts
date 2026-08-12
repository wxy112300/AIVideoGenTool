import { describe, expect, it } from "vitest";
import {
  createTranslator,
  defaultUiLocale,
  loadUiLocale,
  normalizeUiLocale
} from "../src/core/i18n";
import { uiKeys } from "../src/core/i18n-keys";
import { zhCNCatalog } from "../src/core/locales/zh-CN";
import { enUSCatalog } from "../src/core/locales/en-US";

describe("UI locale foundation", () => {
  it("keeps Chinese as the default and normalizes unknown values", () => {
    expect(defaultUiLocale).toBe("zh-CN");
    expect(normalizeUiLocale("en-US")).toBe("en-US");
    expect(normalizeUiLocale("zh-TW")).toBe("zh-TW");
    expect(normalizeUiLocale("fr-FR")).toBe("zh-CN");
    expect(normalizeUiLocale(undefined)).toBe("zh-CN");
  });

  it("falls back to the default catalog and interpolates parameters", () => {
    const translator = createTranslator("en-US");
    expect(translator.t("task.status.waiting")).toBe("等待");
    expect(translator.t(uiKeys.nav.create)).toBe("创建");
    expect(translator.t(uiKeys.settings.localeEnglish)).toBe("English");
    expect(translator.t(uiKeys.history.videoCount, { count: 4 })).toBe("4 个视频");
    expect(translator.t(uiKeys.create.imageToVideo)).toBe("图生视频");
    expect(translator.t("queue.remaining", { count: 3 }, "剩余 {count} 项")).toBe("剩余 3 项");
    expect(translator.t(uiKeys.queue.summary, { activeCount: 2, attentionCount: 1, status: "队列为空" }))
      .toBe("2 项执行任务 · 1 项需处理 · 队列为空");
  });

  it("accepts an incremental catalog without requiring the full UI to move at once", () => {
    const translator = createTranslator("zh-CN", {
      "zh-CN": { "queue.remaining": "剩余 {count} 个任务" }
    });
    expect(translator.t("queue.remaining", { count: 2 })).toBe("剩余 2 个任务");
    expect(translator.t("queue.unknown", undefined, "保留当前文案")).toBe("保留当前文案");
  });

  it("loads non-default locale catalogs separately and preserves fallback", async () => {
    expect(await loadUiLocale("en-US")).toBe("en-US");
    const translator = createTranslator("en-US");
    expect(translator.t(uiKeys.nav.create)).toBe("Create");
    expect(translator.t(uiKeys.settings.localeEnglish)).toBe("English");
    expect(translator.t("untranslated.example")).toBe("untranslated.example");
    expect(await loadUiLocale("zh-TW")).toBe("zh-TW");
    expect(createTranslator("zh-TW").t(uiKeys.nav.settings)).toBe("設定");
    expect(createTranslator("zh-TW").t(uiKeys.settings.localeTraditionalChinese)).toBe("繁體中文（台灣）");
  });

  it("keeps the English catalog key-complete with the default catalog", () => {
    expect(Object.keys(enUSCatalog).sort()).toEqual(Object.keys(zhCNCatalog).sort());
  });

  it("keeps the Traditional Chinese catalog key-complete with the default catalog", async () => {
    await loadUiLocale("zh-TW");
    const translator = createTranslator("zh-TW");
    expect(translator.t(uiKeys.nav.queue)).toBe("佇列");
    expect(translator.t(uiKeys.create.imageToVideo)).toBe("圖生影片");
  });
});
