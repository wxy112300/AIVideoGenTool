import { describe, expect, it } from "vitest";
import { createTranslator } from "../src/core/i18n";
import {
  h3TokenCountForInput
} from "../src/core/h3-token-count";
import {
  renderH3TokenCountMarkup,
  renderPerformanceStatsMarkup
} from "../src/renderer/pages/history/fragments";
import type { H3TokenCountInput } from "../src/core/h3-token-count";
import type { TaskPerformanceStats } from "../src/types";

function input(
  overrides: Partial<H3TokenCountInput> = {}
): H3TokenCountInput {
  return {
    modelId: "minimax_h3_ref2va",
    taskType: "generation",
    prompt: "A red car drives through a rainy city.",
    ratio: "16:9",
    resolution: 768,
    duration: 5,
    sourceWidth: 1920,
    sourceHeight: 1080,
    ...overrides
  };
}

describe("H3 token count", () => {
  it("only returns a count for MiniMax H3 tasks", () => {
    expect(h3TokenCountForInput(input({ modelId: "sulphur2" }))).toBeUndefined();
  });

  it("counts R2V image visual tokens after reference sizing", () => {
    const small = h3TokenCountForInput(input({
      h3ReferenceSlots: [{
        mediaType: "image",
        mediaPath: "small.png",
        width: 512,
        height: 512
      }]
    }));
    const large = h3TokenCountForInput(input({
      h3ReferenceSlots: [{
        mediaType: "image",
        mediaPath: "large.png",
        width: 4096,
        height: 4096
      }]
    }));
    expect(small).toBeDefined();
    expect(large).toBeGreaterThan(small!);
  });

  it("keeps FL2VA keyframe tokens tied to the final H3 canvas", () => {
    const smallSource = h3TokenCountForInput(input({
      modelId: "minimax_h3_fl2va",
      ratio: "source",
      sourceWidth: 640,
      sourceHeight: 360,
      startImagePath: "start-small.png"
    }));
    const largeSource = h3TokenCountForInput(input({
      modelId: "minimax_h3_fl2va",
      ratio: "source",
      sourceWidth: 3840,
      sourceHeight: 2160,
      startImagePath: "start-large.png"
    }));
    expect(largeSource).toBe(smallSource);
  });

  it("renders the resolved H3 count in the generation parameters", () => {
    const stats = {
      durationSeconds: 1,
      sampleCount: 1,
      gpuSampleCount: 1,
      cpuAveragePercent: 10,
      cpuPeakPercent: 10,
      memoryAverageBytes: 1,
      memoryPeakBytes: 2,
      memoryTotalBytes: 3,
      gpuAveragePercent: 10,
      gpuPeakPercent: 20,
      gpuTemperaturePeak: null,
      vramBaselineBytes: 1,
      vramAverageBytes: 2,
      vramPeakBytes: 3,
      vramTotalBytes: 4,
      h3TokenCount: 1234
    } satisfies TaskPerformanceStats;
    const performanceMarkup = renderPerformanceStatsMarkup(stats, {
      t: createTranslator("en-US").t,
      formatBytes: (value) => `${value} bytes`
    });
    const parameterMarkup = renderH3TokenCountMarkup(stats, {
      t: createTranslator("en-US").t
    });
    expect(performanceMarkup).not.toContain("1234 tokens");
    expect(parameterMarkup).toContain(createTranslator("en-US").t("history.page.tokenCount"));
    expect(parameterMarkup).toContain("1234 tokens");
  });
});
