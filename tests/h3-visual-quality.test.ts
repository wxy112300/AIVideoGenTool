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
    expect(body).toContain("Live-Action Visual Craft");
    expect(body).toContain(seed);
    expect(body).toContain("no negative-prompt channel");
    if (mode === "R2V") expect(body).toContain("detailed_description");
    else expect(body).toContain("integrated_multimodal_description");
  });

  it.each([
    { modelId: "minimax_h3_fl2va", h3PromptMode: "I2VA" as const },
    { modelId: "minimax_h3_ref2va", h3PromptMode: "R2V" as const },
    { modelId: "minimax_h3_continuum", h3PromptMode: "I2VA" as const }
  ])("retains quality guidance and continuity contract in $modelId Extend", async route => {
    const request: EnhanceRequest = { ...base, ...route, origin: "video-extension",
      extensionSource: { filePath: "source.mp4", trimStartSeconds: 0, trimEndSeconds: 5 } };
    const chat = await buildStrataPromptRequest(request, createDefaultState().settings, new AbortController().signal);
    const body = JSON.stringify(chat.messages);
    expect(body).toContain("Live-Action Visual Craft");
    expect(body).toContain("CONTINU");
    expect(body).toContain(seed);
  });

  it.each([
    { prompt: "Not photorealistic: an oil painting of a woman under hard light.", activatesRealism: false },
    { prompt: "Live-action room containing an oil painting; keep the painting's brush strokes.", activatesRealism: false },
    { prompt: "3D PBR animation with glossy wet skin and saturated neon lighting.", activatesRealism: false },
    { prompt: "Live-action documentary shot of a woman by a rainy window.", activatesRealism: true }
  ])("selectively activates Live-Action Visual Craft without imposing realism on stylized briefs: $prompt", async ({ prompt, activatesRealism }) => {
    const request = { ...base, prompt };
    const chat = await buildStrataPromptRequest(request, createDefaultState().settings, new AbortController().signal);
    const body = JSON.stringify(chat.messages);
    expect(body).toContain(prompt);
    if (activatesRealism) expect(body).toContain("Live-Action Visual Craft");
    else expect(body).not.toContain("Live-Action Visual Craft");
    expect(request.prompt).toBe(prompt);
  });

  it("does not add a global quality rewrite to targeted annotation edits or image editing", async () => {
    const settings = createDefaultState().settings;
    for (const request of [
      { ...base, prompt: "The woman turns.（批注：保留自然肤质）", promptStrategy: "targeted-revision" as const },
      { ...base, mode: "image-edit" as const, modelId: "qwen-image-edit" }
    ]) {
      const chat = await buildStrataPromptRequest(request, settings, new AbortController().signal);
      expect(JSON.stringify(chat.messages)).not.toContain("Live-Action Visual Craft");
    }
  });
});
