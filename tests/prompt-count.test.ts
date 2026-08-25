import { describe, expect, it } from "vitest";
import {
  countPromptWords,
  h3PromptWordRange
} from "../src/core/prompt-count.js";

describe("prompt word counter", () => {
  it("counts English and Chinese text as readable word units", () => {
    expect(countPromptWords("A woman slowly turns toward the camera.")).toBe(7);
    expect(countPromptWords("女孩慢慢转身看向镜头")).toBeGreaterThan(3);
  });

  it("uses a mode- and duration-aware soft writing range", () => {
    expect(h3PromptWordRange("I2VA")).toEqual({ min: 250, max: 500 });
    expect(h3PromptWordRange("FL2VA")).toEqual({ min: 250, max: 500 });
    expect(h3PromptWordRange("L2VA")).toEqual({ min: 250, max: 500 });
    expect(h3PromptWordRange("R2V")).toEqual({ min: 350, max: 500 });
    expect(h3PromptWordRange("FL2VA", 15)).toEqual({ min: 550, max: 900 });
    expect(h3PromptWordRange("R2V", 15)).toEqual({ min: 710, max: 900 });
  });
});
