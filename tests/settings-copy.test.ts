import { describe, expect, it } from "vitest";
import {
  settingsModelHardwareRecommendation,
  settingsText
} from "../src/renderer/pages/settings/copy";

describe("Settings localized copy", () => {
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
});
