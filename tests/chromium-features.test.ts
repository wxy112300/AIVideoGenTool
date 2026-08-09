import { describe, expect, it } from "vitest";
import { mergeChromiumFeatureList } from "../src/core/chromium-features.js";

describe("mergeChromiumFeatureList", () => {
  it("adds the required feature to an empty switch", () => {
    expect(
      mergeChromiumFeatureList("", ["SkipEmptyDisplayHotplugEvent"])
    ).toBe("SkipEmptyDisplayHotplugEvent");
  });

  it("preserves existing features and avoids duplicates", () => {
    expect(
      mergeChromiumFeatureList(
        "ExistingFeature, SkipEmptyDisplayHotplugEvent,ExistingFeature",
        ["SkipEmptyDisplayHotplugEvent"]
      )
    ).toBe("ExistingFeature,SkipEmptyDisplayHotplugEvent");
  });
});
