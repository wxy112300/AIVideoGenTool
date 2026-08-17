import { describe, expect, it } from "vitest";
import {
  h3AutoPromptInstruction,
  hasH3ReferenceMedia,
  validateH3ReferenceAutoPrompt
} from "../src/core/h3-auto-prompter.js";
import {
  h3AutoPromptSeedFor,
  h3AutoPromptSeeds
} from "../src/core/prompts/h3/auto-seeds.js";

describe("H3 reference-driven auto prompting", () => {
  it("selects a different seed while unused seeds remain", () => {
    const first = h3AutoPromptSeedFor("I2VA", undefined, [], () => 0);
    const second = h3AutoPromptSeedFor("I2VA", undefined, [first.id], () => 0);

    expect(second.id).not.toBe(first.id);
    expect(new Set(h3AutoPromptSeeds.map((seed) => seed.id)).size).toBe(h3AutoPromptSeeds.length);
  });

  it("builds a blank-idea instruction around media, duration, and variation", () => {
    const instruction = h3AutoPromptInstruction({
      prompt: "",
      modelId: "minimax_h3_fl2va",
      mode: "h3-vision",
      promptStrategy: "reference-auto",
      autoPromptSeedId: "visible-affordance",
      autoPromptVariationId: "variation-42",
      imagePaths: ["reference.png"],
      h3PromptMode: "I2VA",
      h3DurationSeconds: 5
    });

    expect(instruction).toContain("user intentionally left the creative prompt blank");
    expect(instruction).toContain("5.17-second clip in I2VA mode");
    expect(instruction).toContain("Variation token: variation-42");
    expect(instruction).toContain("visible affordance");
    expect(instruction).toContain("Return only the complete final H3 prompt");
  });

  it("requires reference media for the auto strategy", () => {
    expect(hasH3ReferenceMedia({ prompt: "", promptStrategy: "reference-auto", modelId: "h3" })).toBe(false);
    expect(() => validateH3ReferenceAutoPrompt({
      prompt: "",
      modelId: "h3",
      mode: "h3-vision",
      promptStrategy: "reference-auto"
    })).toThrow(/参考图片或视频/iu);
    expect(() => validateH3ReferenceAutoPrompt({
      prompt: "",
      modelId: "h3",
      mode: "h3-vision",
      promptStrategy: "reference-auto",
      imagePath: "reference.png"
    })).not.toThrow();
  });
});
