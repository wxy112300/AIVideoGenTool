import { describe, expect, it } from "vitest";
import { createDefaultState } from "../src/core/defaults.js";
import { h3PromptInstruction } from "../electron/services/comfy-ui.js";
import { buildStrataPromptRequest } from "../electron/services/strata-prompt.js";
import { h3PromptPackFor } from "../src/core/prompts/h3/index.js";
import { h3VisualQualityKnowledge } from "../src/core/prompts/h3/visual-quality.js";
import type { EnhanceRequest, H3PromptMode } from "../src/types.js";

const seed = h3PromptPackFor("zh-CN").snippets.find(snippet => snippet.id === "visual-photorealistic-quality")!.text;
const base: EnhanceRequest = { modelId: "minimax_h3_fl2va", mode: "h3-vision", h3PromptMode: "T2VA",
  h3PromptPreset: "official-storyboard", prompt: `A woman turns toward the window. ${seed}` };

describe("H3 visual-quality knowledge reaches actual enhancer requests", () => {
  it.each<H3PromptMode>(["T2VA", "I2VA", "FL2VA", "L2VA", "R2V"])("shares the knowledge in generic and Strata %s compilation", async mode => {
    const request = { ...base, h3PromptMode: mode };
    expect(h3PromptInstruction(request)).toContain(h3VisualQualityKnowledge);
    const chat = await buildStrataPromptRequest(request, createDefaultState().settings, new AbortController().signal);
    const body = JSON.stringify(chat.messages);
    expect(body).toContain("H3 visual-quality knowledge");
    expect(body).toContain(seed);
    expect(body).toContain("no separate negative-prompt channel");
    expect(body).toContain("integrated_multimodal_description");
    if (mode === "R2V") expect(body).toContain("detailed_description");
  });

  it.each([
    { modelId: "minimax_h3_fl2va", h3PromptMode: "I2VA" as const },
    { modelId: "minimax_h3_ref2va", h3PromptMode: "R2V" as const },
    { modelId: "minimax_h3_continuum", h3PromptMode: "I2VA" as const }
  ])("retains quality guidance and inherited look in $modelId Extend", async route => {
    const request: EnhanceRequest = { ...base, ...route, origin: "video-extension",
      extensionSource: { filePath: "source.mp4", trimStartSeconds: 0, trimEndSeconds: 5 } };
    const chat = await buildStrataPromptRequest(request, createDefaultState().settings, new AbortController().signal);
    const body = JSON.stringify(chat.messages);
    expect(body).toContain("H3 visual-quality knowledge");
    expect(body).toContain("inherited Extend look");
    expect(body).toContain("CONTINU");
    expect(body).toContain(seed);
  });

  it.each([
    "Not photorealistic: an oil painting of a woman under hard light.",
    "Live-action room containing an oil painting; keep the painting's brush strokes.",
    "3D PBR animation with glossy wet skin and saturated neon lighting."
  ])("preserves scoped and conflicting style intent without a hard-coded realism rewrite: %s", async prompt => {
    const request = { ...base, prompt };
    const chat = await buildStrataPromptRequest(request, createDefaultState().settings, new AbortController().signal);
    const body = JSON.stringify(chat.messages);
    expect(body).toContain(prompt);
    expect(body).toContain("Interpret negation and scope");
    expect(body).toContain("Explicit animation, illustration, oil-painting and CG/PBR requests retain their own medium");
    expect(body).toContain("Preserve intentional sweat, wet skin, makeup and glossy materials");
    expect(body).toContain("Shallow depth of field and fine film grain are optional");
    expect(request.prompt).toBe(prompt);
  });

  it("does not add a global quality rewrite to targeted annotation edits or image editing", async () => {
    const settings = createDefaultState().settings;
    for (const request of [
      { ...base, prompt: "The woman turns.（批注：保留自然肤质）", promptStrategy: "targeted-revision" as const },
      { ...base, mode: "image-edit" as const, modelId: "qwen-image-edit" }
    ]) {
      const chat = await buildStrataPromptRequest(request, settings, new AbortController().signal);
      expect(JSON.stringify(chat.messages)).not.toContain("H3 visual-quality knowledge");
    }
  });
});
