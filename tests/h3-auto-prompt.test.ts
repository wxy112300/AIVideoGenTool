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
  it("accepts a cropped extension video as visual grounding before frame extraction", () => {
    expect(() => validateH3ReferenceAutoPrompt({
      prompt: "",
      modelId: "minimax_h3_ref2va",
      mode: "h3-vision",
      promptStrategy: "reference-auto",
      extensionSource: {
        filePath: "source.mp4",
        trimStartSeconds: 2,
        trimEndSeconds: 8
      }
    })).not.toThrow();
  });

  it("selects a different seed while unused seeds remain", () => {
    const first = h3AutoPromptSeedFor("I2VA", undefined, [], () => 0);
    const second = h3AutoPromptSeedFor("I2VA", undefined, [first.id], () => 0);

    expect(second.id).not.toBe(first.id);
    expect(new Set(h3AutoPromptSeeds.map((seed) => seed.id)).size).toBe(h3AutoPromptSeeds.length);
  });

  it("keeps the mild adult direction opt-in during automatic rotation", () => {
    for (const randomValue of [0, 0.5, 0.999]) {
      expect(h3AutoPromptSeedFor("I2VA", undefined, [], () => randomValue).id).not.toBe("mild-adult-atmosphere");
    }
    expect(h3AutoPromptSeedFor("I2VA", "mild-adult-atmosphere", [], () => 0).id).toBe("mild-adult-atmosphere");
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

  it("supports character interaction, contextual dialogue, mild adult, and Hollywood directions", () => {
    const seedIds = new Set(h3AutoPromptSeeds.map((seed) => seed.id));
    expect([...seedIds]).toEqual(expect.arrayContaining([
      "character-interaction",
      "contextual-action-dialogue",
      "mild-adult-atmosphere",
      "hollywood-cinematic"
    ]));

    const dialogueInstruction = h3AutoPromptInstruction({
      prompt: "",
      modelId: "minimax_h3_fl2va",
      mode: "h3-vision",
      promptStrategy: "reference-auto",
      autoPromptSeedId: "contextual-action-dialogue",
      imagePaths: ["reference.png"],
      h3PromptMode: "I2VA",
      h3DurationSeconds: 5
    });
    expect(dialogueInstruction).toContain("natural language");
    expect(dialogueInstruction).toContain("required H3 dialogue conventions");

    const adultSeed = h3AutoPromptSeeds.find((seed) => seed.id === "mild-adult-atmosphere");
    expect(adultSeed?.instruction).toContain("clearly adult subjects only");
    expect(adultSeed?.instruction).toContain("non-explicit");

    const hollywoodSeed = h3AutoPromptSeeds.find((seed) => seed.id === "hollywood-cinematic");
    expect(hollywoodSeed?.instruction).toContain("Hollywood-grade");
    expect(hollywoodSeed?.instruction).toContain("motivated camera language");
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
