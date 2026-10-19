import { describe, expect, it } from "vitest";
import { missingH3SourceTimepoints } from "../src/core/h3-timing.js";
import { h3TemporalPlanForSeconds, h3MaxDurationForFrameBudget, h3MotionContextFrameCountForSeconds } from "../src/core/h3-temporal.js";

describe("H3 explicit timepoint presence (not semantic completeness)", () => {
  it.each([[15.1, 15.08], [15.2, 15.79], [30, 30.67]])("accepts a declared final endpoint on the same frame grid: %s", (duration, endpoint) => {
    expect(missingH3SourceTimepoints(`At ${duration} seconds the final state settles.`,
      `integrated_multimodal_description: [Shot 1] At ${endpoint} seconds the final state settles.`, "T2VA", duration)).toEqual([]);
  });
  it("preserves intermediate events even when their time equals the requested duration", () => {
    expect(missingH3SourceTimepoints("At 30 seconds the light flashes, then the final shot settles.",
      "integrated_multimodal_description: [Shot 1] At 30.67 seconds the light flashes.", "T2VA", 30)).toEqual([30]);
    expect(missingH3SourceTimepoints("At 30 seconds the light flashes. At 30 seconds the final state settles.",
      "integrated_multimodal_description: [Shot 1] At 30.67 seconds the final state settles.", "T2VA", 30)).toEqual([30]);
  });
  it("compares seconds, Chinese ranges and official timecodes on one axis", () => {
    expect(missingH3SourceTimepoints("0至3秒前行，At 00:20.000 the light flashes; at 00:30.000 the final state settles.",
      "integrated_multimodal_description: [Shot 1] 00:00.000-00:03.000 前行；20秒闪光；30.67秒最终停稳。", "T2VA", 30)).toEqual([]);
    expect(missingH3SourceTimepoints("At 00:20.000 the light flashes.",
      "integrated_multimodal_description: [Shot 1] At 00:20.080 the light flashes.", "T2VA", 30)).toEqual([20]);
  });
  it("keeps visible Extend endpoints independent of the sampled prefix", () => {
    expect(missingH3SourceTimepoints("At 30 seconds the final state settles.",
      "integrated_multimodal_description: [Shot 1] At 30.67 seconds the final state settles.", "T2VA", 30, 30)).toEqual([30]);
  });
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

describe("H3 route temporal plans", () => {
  it("separates graph length, actual samples, raw new frames and visible output", () => {
    expect(h3TemporalPlanForSeconds(30, "generation")).toMatchObject({ graphFrames: 736, sampledFrames: 736, outputFrames: 736 });
    expect(h3TemporalPlanForSeconds(30, "boundary")).toMatchObject({ sampledFrames: 736, prefixFrames: 1, rawNewFrames: 735, outputFrames: 720 });
    expect(h3TemporalPlanForSeconds(30, "motion-context")).toMatchObject({ graphFrames: 758, sampledFrames: 770, prefixFrames: 22, rawNewFrames: 748, outputFrames: 720 });
    expect(h3TemporalPlanForSeconds(30, "continuum")).toMatchObject({ sampledFrames: 736, prefixFrames: 22, rawNewFrames: 714, outputFrames: 720 });
    expect(h3TemporalPlanForSeconds(30, "continuum-legacy")).toMatchObject({ outputFrames: 714 });
    expect(h3TemporalPlanForSeconds(30, "continuum", 0)).toMatchObject({ prefixFrames: 0, sampledFrames: 719, outputFrames: 720 });
  });
  it("finds maximum input duration at the UI tenth-second precision", () => {
    expect(h3MaxDurationForFrameBudget(h3MotionContextFrameCountForSeconds, 758)).toBe(29.9);
    expect(h3MaxDurationForFrameBudget(h3MotionContextFrameCountForSeconds, 770)).toBe(30);
  });
});
