import { describe, expect, it } from "vitest";
import type { EnhanceRequest } from "../src/types.js";
import { promptEnhanceLogContext } from "../src/core/prompt-enhance-log.js";

describe("prompt enhancement log context", () => {
  it("records the selected H3 preset for a user-written prompt", () => {
    const context = promptEnhanceLogContext({
      prompt: "A woman opens the door.",
      modelId: "minimax-h3",
      mode: "h3-vision",
      h3PromptMode: "T2VA",
      h3PromptPreset: "detailed-cinematic"
    });

    expect(context).toEqual({
      inputKind: "user-text",
      presetFamily: "h3",
      selectedPreset: "detailed-cinematic",
      effectivePreset: "detailed-cinematic",
      presetSource: "selected",
      autoSeedId: null,
      autoVariationId: null
    });
  });

  it("records the actual automatic seed when the prompt is blank", () => {
    const request: EnhanceRequest = {
      prompt: "",
      modelId: "minimax-h3",
      mode: "h3-vision",
      promptStrategy: "reference-auto",
      autoPromptSeedId: "character-interaction",
      autoPromptVariationId: "variation-42",
      h3PromptMode: "I2VA",
      h3PromptPreset: "hollywood-cinematic",
      imagePaths: ["reference.png"]
    };

    expect(promptEnhanceLogContext(request)).toMatchObject({
      inputKind: "reference-auto",
      presetFamily: "h3",
      selectedPreset: "hollywood-cinematic",
      effectivePreset: "hollywood-cinematic",
      presetSource: "selected",
      autoSeedId: "character-interaction",
      autoVariationId: "variation-42"
    });
  });

  it("distinguishes a requested preset from a mode fallback", () => {
    const context = promptEnhanceLogContext({
      prompt: "A boat moves across the water.",
      modelId: "minimax-h3",
      mode: "h3-vision",
      h3PromptMode: "FL2VA",
      h3PromptPreset: "multi-reference"
    });

    expect(context.selectedPreset).toBe("multi-reference");
    expect(context.effectivePreset).toBe("official-storyboard");
    expect(context.presetSource).toBe("mode-fallback");
  });

  it("uses the image editing preset on the image editing route", () => {
    expect(promptEnhanceLogContext({
      prompt: "Remove the background.",
      modelId: "qwen-image-edit",
      mode: "image-edit",
      imageEditEnhanceMode: "faithful"
    })).toMatchObject({
      inputKind: "user-text",
      presetFamily: "image-edit",
      selectedPreset: "faithful",
      effectivePreset: "faithful",
      presetSource: "selected"
    });
  });
});
