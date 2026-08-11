import { describe, expect, it } from "vitest";
import {
  createTranslator,
  defaultUiLocale,
  normalizeUiLocale
} from "../src/core/i18n";

describe("UI locale foundation", () => {
  it("keeps Chinese as the default and normalizes unknown values", () => {
    expect(defaultUiLocale).toBe("zh-CN");
    expect(normalizeUiLocale("en-US")).toBe("en-US");
    expect(normalizeUiLocale("fr-FR")).toBe("zh-CN");
    expect(normalizeUiLocale(undefined)).toBe("zh-CN");
  });

  it("falls back to the default catalog and interpolates parameters", () => {
    const translator = createTranslator("en-US");
    expect(translator.t("task.status.waiting")).toBe("等待");
    expect(translator.t("queue.remaining", { count: 3 }, "剩余 {count} 项")).toBe("剩余 3 项");
  });

  it("accepts an incremental catalog without requiring the full UI to move at once", () => {
    const translator = createTranslator("zh-CN", {
      "zh-CN": { "queue.remaining": "剩余 {count} 个任务" }
    });
    expect(translator.t("queue.remaining", { count: 2 })).toBe("剩余 2 个任务");
    expect(translator.t("queue.unknown", undefined, "保留当前文案")).toBe("保留当前文案");
  });
});
