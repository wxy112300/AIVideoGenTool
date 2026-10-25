import { beforeAll, describe, expect, it } from "vitest";
import { createTranslator, loadUiLocale } from "../src/core/i18n";
import { createDefaultSettings } from "../src/core/defaults";
import { settingsChangedKeys } from "../src/core/settings-changes";
import { settingsChangeSummary } from "../src/renderer/pages/settings/change-summary";
import { settingsH3AutoPromptSeedDescription } from "../src/renderer/pages/settings/copy";
import { h3AutoPromptSeeds } from "../src/core/prompts/h3/auto-seeds";

beforeAll(async () => { await Promise.all([loadUiLocale("en-US"), loadUiLocale("zh-TW")]); });
describe("settings pending changes", () => {
  it.each(["zh-CN", "zh-TW", "en-US"] as const)("names cross-tab fields without exposing values or storage keys (%s)", locale => {
    const saved = createDefaultSettings(), { t } = createTranslator(locale);
    const draft = { ...saved, proxyUrl: "private://secret", promptCreativity: 0.3 };
    const summary = settingsChangeSummary(settingsChangedKeys(saved, draft), t, locale);
    expect(summary.split(/、|, /)).toHaveLength(2);
    expect(summary).not.toMatch(/private|secret|proxyUrl|promptCreativity|settings\./);
    expect(settingsChangeSummary(["defaultVideoModel"], t, locale)).not.toBe(settingsChangeSummary(["defaultUpscaleModel"], t, locale));
    expect(settingsChangeSummary(["strataUncensored", "strataUncensoredMode"], t, locale)).toBe(settingsChangeSummary(["strataUncensoredMode"], t, locale));
    expect(settingsChangeSummary([], t, locale)).toBe("");
  });
  it.each(["zh-CN", "zh-TW", "en-US"] as const)("describes drafting directions briefly without replacing editable instructions (%s)", locale => {
    for (const seed of h3AutoPromptSeeds) {
      const description = settingsH3AutoPromptSeedDescription(locale, seed.id, seed.label);
      expect(description.length).toBeLessThan(locale === "en-US" ? 75 : 31);
      expect(description).not.toBe(seed.instruction);
    }
    expect(settingsH3AutoPromptSeedDescription(locale, "future-seed", "Future direction")).toBe("Future direction");
  });
});
