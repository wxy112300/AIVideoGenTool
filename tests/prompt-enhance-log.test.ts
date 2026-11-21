import { describe, expect, it } from "vitest";
import type { EnhanceRequest } from "../src/types.js";
import { promptEnhanceLogContext } from "../src/core/prompt-enhance-log.js";
import { createLongVideoScript } from "../src/core/long-video/script.js";
import { createLongVideoLayout } from "../src/core/long-video/layout.js";
import { longVideoPromptRequest } from "../src/core/long-video/enhancement.js";

describe("prompt enhancement log context", () => {
  it("distinguishes long-video planning from a native single prompt without logging story content", () => {
    let id = 0;
    const script = createLongVideoScript(createLongVideoLayout(60,6),()=>`page-${++id}`,"private story direction");
    const metadata = promptEnhanceLogContext({prompt:"private story direction",modelId:"minimax_h3_fl2va",mode:"h3-vision",longVideo:longVideoPromptRequest(script)});
    expect(metadata).toMatchObject({longVideoChunks:6,longVideoSeconds:60});
    expect(JSON.stringify(metadata)).not.toContain("private story direction");
  });
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
