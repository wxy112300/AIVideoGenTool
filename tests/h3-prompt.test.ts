import { describe, expect, it } from "vitest";
import { createH3PromptTemplate } from "../src/core/h3-prompt";

describe("createH3PromptTemplate", () => {
  it.each([
    [5, 1],
    [6, 2],
    [10, 2],
    [11, 3]
  ])("creates a useful number of shots for %s seconds", (duration, expectedShots) => {
    const result = createH3PromptTemplate("一架客机平稳起飞", duration);

    expect(result.shotCount).toBe(expectedShots);
    expect(result.text.match(/^SHOT \d+：/gm)).toHaveLength(expectedShots);
  });

  it("keeps the existing prompt as the overall visual description", () => {
    const result = createH3PromptTemplate("  黄昏中的机场跑道  ", 5);

    expect(result.text).toContain("整体画面：黄昏中的机场跑道");
    expect(result.text).toContain("Audio：");
  });

  it("provides guidance when the prompt is empty", () => {
    const result = createH3PromptTemplate("   ", 5);

    expect(result.text).toContain("整体画面：描述主体、环境、视觉风格");
  });
});
