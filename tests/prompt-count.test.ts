import { describe, expect, it } from "vitest";
import {
  countPromptWords,
  recommendedH3PromptWords
} from "../src/core/prompt-count.js";

describe("prompt word counter", () => {
  it("counts English and Chinese text as readable word units", () => {
    expect(countPromptWords("A woman slowly turns toward the camera.")).toBe(7);
    expect(countPromptWords("女孩慢慢转身看向镜头")).toBeGreaterThan(3);
  });

  it("uses a longer budget for R2V than ordinary H3 modes", () => {
    expect(recommendedH3PromptWords("I2VA")).toBe(280);
    expect(recommendedH3PromptWords("FL2VA")).toBe(280);
    expect(recommendedH3PromptWords("L2VA")).toBe(280);
    expect(recommendedH3PromptWords("R2V")).toBe(500);
    expect(recommendedH3PromptWords("FL2VA", 15)).toBeGreaterThan(280);
    expect(recommendedH3PromptWords("R2V", 15)).toBeGreaterThan(500);
  });
});
