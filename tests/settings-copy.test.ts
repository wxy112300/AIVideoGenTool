import { describe, expect, it } from "vitest";
import { h3AutoPromptSeeds } from "../src/core/prompts/h3/auto-seeds";
import {
  settingsH3AutoPromptSeedDescription,
  settingsModelHardwareRecommendation,
  settingsText
} from "../src/renderer/pages/settings/copy";

describe("Settings localized copy", () => {
  it("uses Traditional Chinese for the shared prompt runtime card and both component info states", () => {
    expect(settingsText("zh-TW", "prompt.runtimeInstall")).toBe("安裝並自我檢查");
    expect(settingsText("zh-TW", "prompt.runtimeNodeMissing")).toContain("重新啟動");
    expect(settingsText("en-US", "model.component.viewInfo", { label: "Gemma", info: "Source" }))
      .toBe("Gemma: Source");
  });
  it("explains the official high/xhigh alias and next-request behavior in all locales", () => {
    for (const locale of ["zh-CN", "zh-TW", "en-US"] as const) {
      expect(settingsText(locale, "prompt.reasoningHint")).toContain("xhigh");
      expect(settingsText(locale, "prompt.reasoning.medium")).not.toBe("prompt.reasoning.medium");
    }
  });
  it("keeps model evidence and hardware recommendations localized", () => {
    const profile = { id: "minimax_h3_fl2va", category: "video" } as const;

    expect(settingsText("zh-CN", "model.meta.llamaReady")).toContain("文件");
    expect(settingsText("zh-TW", "model.meta.llamaReady")).toContain("檔案");
    expect(settingsText("en-US", "model.meta.llamaReady")).toContain("files");
    expect(settingsText("en-US", "model.meta.llamaReady")).not.toMatch(/[一-龥]/u);
    expect(settingsModelHardwareRecommendation("en-US", profile)).toContain("recommended");
    expect(settingsModelHardwareRecommendation("zh-TW", profile)).toContain("系統");
  });

  it("uses locale-aware separators for lists and labels", () => {
    expect(settingsText("zh-CN", "shared.listSeparator")).toBe("、");
    expect(settingsText("zh-CN", "shared.labelSeparator")).toBe("：");
    expect(settingsText("en-US", "shared.listSeparator")).toBe(", ");
    expect(settingsText("en-US", "shared.labelSeparator")).toBe(": ");
  });

  it("localizes no-prompt direction descriptions without changing unknown fallbacks", () => {
    const fallback = "ORIGINAL MODEL INSTRUCTION";

    expect(settingsH3AutoPromptSeedDescription("zh-CN", "visible-affordance", fallback)).toContain("已有物体");
    expect(settingsH3AutoPromptSeedDescription("zh-TW", "visible-affordance", fallback)).toContain("既有物體");
    expect(settingsH3AutoPromptSeedDescription("en-US", "visible-affordance", fallback)).toContain("visible objects");
    expect(settingsH3AutoPromptSeedDescription("zh-CN", "custom-direction", fallback)).toBe(fallback);
  });

  it("has a localized description for every built-in no-prompt direction", () => {
    for (const locale of ["zh-CN", "zh-TW", "en-US"] as const) {
      for (const seed of h3AutoPromptSeeds) {
        expect(settingsH3AutoPromptSeedDescription(locale, seed.id, "__missing__")).not.toBe("__missing__");
      }
    }
  });
});
