import { describe, expect, it } from "vitest";
import { missingH3SourceTimepoints } from "../src/core/h3-timing.js";

describe("H3 explicit timepoint presence (not semantic completeness)", () => {
  it("detects a missing mid-clip flash despite a sufficiently long timeline", () => {
    expect(missingH3SourceTimepoints("红灯在4.0秒和10.0秒各闪一次。", "integrated_multimodal_description: [Shot 1] 10.00秒红灯闪。", "I2VA", 15)).toEqual([4]);
  });
  it("accepts interval endpoints and frame-aligned clip end, not unrelated clock drift", () => {
    expect(missingH3SourceTimepoints("0至3秒滑行，3至6秒后移，13至15秒稳定。", "integrated_multimodal_description: [Shot 1] 0.00-3.00秒滑行，3.00-6.00秒后移，13.00-15.08秒稳定。", "I2VA", 15)).toEqual([]);
    expect(missingH3SourceTimepoints("4秒闪光。", "integrated_multimodal_description: [Shot 1] 4.08秒闪光。", "I2VA", 15)).toEqual([4]);
  });
  it("does not accept a soundscape-only time or treat quoted speech as a timeline time requirement", () => {
    expect(missingH3SourceTimepoints("4秒闪光。", "integrated_multimodal_description: [Shot 1] 飞机停稳。\noverall_soundscape: 4秒广播。", "I2VA", 15)).toEqual([4]);
    expect(missingH3SourceTimepoints('广播说“等待4秒。”', "integrated_multimodal_description: [Shot 1] 广播。", "I2VA", 15)).toEqual([]);
  });
});
