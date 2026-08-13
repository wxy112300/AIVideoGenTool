import { describe, expect, it } from "vitest";
import {
  BUILTIN_VIDEO_LORAS,
  H3_PINK_FLUFFY_BUNNY_LORA,
  H3_REALISM_PEOPLE_LORA,
  H3_TURBO_LORA,
  normalizeVideoLoras,
  reorderVideoLoras,
  videoLoraSelection,
  videoLoraCompatibleWithDraft,
  videoLoraConfigurationIssues,
  videoPromptForLoras
} from "../src/core/video-loras";

describe("video LoRA catalog", () => {
  it("offers Turbo, Realism People, and PinkFluffyBunny as separate stackable H3 LoRAs", () => {
    expect(BUILTIN_VIDEO_LORAS.map((lora) => lora.id)).toEqual([
      H3_TURBO_LORA.id,
      H3_REALISM_PEOPLE_LORA.id,
      H3_PINK_FLUFFY_BUNNY_LORA.id
    ]);
    expect(H3_REALISM_PEOPLE_LORA).toMatchObject({
      strength: 0.8,
      purpose: "quality",
      compatibleModelIds: ["minimax_h3_fl2va", "minimax_h3_ref2va"],
      compatibleInputModes: ["image"]
    });
    expect(H3_PINK_FLUFFY_BUNNY_LORA).toMatchObject({
      strength: 0.5,
      purpose: "content",
      compatibleModelIds: ["minimax_h3_fl2va"],
      compatibleInputModes: ["image"]
    });
    for (const lora of BUILTIN_VIDEO_LORAS) {
      expect(lora.guide.summary).not.toBe("");
      expect(lora.guide.recommendedStrength).toContain(String(lora.strength));
      expect(lora.guide.effects).not.toBe("");
      expect(lora.guide.stacking).not.toBe("");
      expect(lora.guide.compatibility).not.toBe("");
      expect(lora.guide.source).not.toBe("");
      expect(Number.isFinite(lora.rules.orderPriority)).toBe(true);
      expect(Array.isArray(lora.rules.settingConflicts)).toBe(true);
      expect(Array.isArray(lora.rules.combinations)).toBe(true);
    }
  });

  it("adds the Realism People trigger at the start of the execution Prompt without duplication", () => {
    expect(videoPromptForLoras(
      "a woman turns toward the window",
      [H3_REALISM_PEOPLE_LORA]
    )).toBe("r34l1sm, a woman turns toward the window");
    expect(videoPromptForLoras(
      "r34l1sm, a woman turns toward the window",
      [H3_REALISM_PEOPLE_LORA]
    )).toBe("r34l1sm, a woman turns toward the window");
    expect(videoPromptForLoras(
      "a woman, r34l1sm, turns toward the window",
      [H3_REALISM_PEOPLE_LORA]
    )).toBe("r34l1sm, a woman, turns toward the window");
  });

  it("freezes automatic prompt prefixes into a queued LoRA selection snapshot", () => {
    const snapshot = videoLoraSelection(H3_REALISM_PEOPLE_LORA);
    expect(snapshot.promptPrefixes).toEqual(["r34l1sm"]);
    expect(videoPromptForLoras("portrait close-up", [{
      ...snapshot,
      id: "archived-realism-definition"
    }])).toBe("r34l1sm, portrait close-up");
  });

  it("hydrates automatic prompt prefixes when normalizing old persisted built-in selections", () => {
    const { promptPrefixes: _omitted, ...legacySelection } = H3_REALISM_PEOPLE_LORA;
    const [normalized] = normalizeVideoLoras([legacySelection]);
    expect(normalized?.promptPrefixes).toEqual(["r34l1sm"]);
  });

  it("normalizes both built-ins without merging their strengths", () => {
    expect(normalizeVideoLoras([
      { ...H3_TURBO_LORA, strength: 0.7 },
      { ...H3_PINK_FLUFFY_BUNNY_LORA, strength: 0.45 }
    ])).toMatchObject([
      { id: H3_TURBO_LORA.id, strength: 0.7 },
      { id: H3_PINK_FLUFFY_BUNNY_LORA.id, strength: 0.45 }
    ]);
  });

  it("preserves the detected ComfyUI-relative filename for built-in LoRAs", () => {
    expect(normalizeVideoLoras([{
      ...H3_PINK_FLUFFY_BUNNY_LORA,
      filename: "MiniMax-H3/PinkFluffyBunny-pruned-v1-rank128.safetensors"
    }])[0]?.filename).toBe(
      "MiniMax-H3/PinkFluffyBunny-pruned-v1-rank128.safetensors"
    );
  });

  it("allows Spectrum with Turbo and still reports risky LoRA combinations", () => {
    const issues = videoLoraConfigurationIssues({
      modelId: "minimax_h3_fl2va",
      inputMode: "image",
      spectrumMode: "balanced",
      attentionMode: "sage",
      videoLoras: [H3_TURBO_LORA, H3_PINK_FLUFFY_BUNNY_LORA]
    });

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: `combination:${[H3_TURBO_LORA.id, H3_PINK_FLUFFY_BUNNY_LORA.id].sort().join(":")}`,
        severity: "warning"
      })
    ]));
    expect(issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: `setting:${H3_TURBO_LORA.id}:spectrumMode` })
    ]));
  });

  it("warns about unvalidated Realism People stacks", () => {
    const issues = videoLoraConfigurationIssues({
      modelId: "minimax_h3_fl2va",
      inputMode: "image",
      spectrumMode: "off",
      attentionMode: "sage",
      videoLoras: [H3_TURBO_LORA, H3_REALISM_PEOPLE_LORA, H3_PINK_FLUFFY_BUNNY_LORA]
    });
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: `combination:${[H3_REALISM_PEOPLE_LORA.id, H3_TURBO_LORA.id].sort().join(":")}`,
        severity: "warning"
      }),
      expect.objectContaining({
        code: `combination:${[H3_PINK_FLUFFY_BUNNY_LORA.id, H3_REALISM_PEOPLE_LORA.id].sort().join(":")}`,
        severity: "warning"
      })
    ]));
  });

  it("warns when LoRAs are loaded against their recommended order", () => {
    const issues = videoLoraConfigurationIssues({
      modelId: "minimax_h3_fl2va",
      inputMode: "image",
      spectrumMode: "off",
      attentionMode: "sage",
      videoLoras: [H3_PINK_FLUFFY_BUNNY_LORA, H3_TURBO_LORA]
    });

    expect(issues.some((issue) => issue.code.startsWith("order:"))).toBe(true);
  });

  it("does not offer the NSFW LoRA to R2V or video extension drafts", () => {
    expect(videoLoraCompatibleWithDraft(
      H3_PINK_FLUFFY_BUNNY_LORA,
      "minimax_h3_fl2va",
      "image"
    )).toBe(true);
    expect(videoLoraCompatibleWithDraft(
      H3_PINK_FLUFFY_BUNNY_LORA,
      "minimax_h3_ref2va",
      "image"
    )).toBe(false);
    expect(videoLoraCompatibleWithDraft(
      H3_PINK_FLUFFY_BUNNY_LORA,
      "minimax_h3_fl2va",
      "video"
    )).toBe(false);
  });

  it("offers Realism People to INT8 FL2VA and R2V but not extension or unvalidated compressed models", () => {
    expect(videoLoraCompatibleWithDraft(H3_REALISM_PEOPLE_LORA, "minimax_h3_fl2va", "image")).toBe(true);
    expect(videoLoraCompatibleWithDraft(H3_REALISM_PEOPLE_LORA, "minimax_h3_ref2va", "image")).toBe(true);
    expect(videoLoraCompatibleWithDraft(H3_REALISM_PEOPLE_LORA, "minimax_h3_ref2va", "video")).toBe(false);
    expect(videoLoraCompatibleWithDraft(H3_REALISM_PEOPLE_LORA, "minimax_h3_fl2va_int4", "image")).toBe(false);
    expect(videoLoraCompatibleWithDraft(H3_REALISM_PEOPLE_LORA, "minimax_h3_fl2va_q3_gguf", "image")).toBe(false);
  });

  it("reorders LoRAs immutably and keeps boundary moves stable", () => {
    const original = [H3_TURBO_LORA, H3_PINK_FLUFFY_BUNNY_LORA].map((lora) => ({ ...lora }));
    const reordered = reorderVideoLoras(original, H3_PINK_FLUFFY_BUNNY_LORA.id, -1);

    expect(reordered.map((lora) => lora.id)).toEqual([
      H3_PINK_FLUFFY_BUNNY_LORA.id,
      H3_TURBO_LORA.id
    ]);
    expect(original.map((lora) => lora.id)).toEqual([
      H3_TURBO_LORA.id,
      H3_PINK_FLUFFY_BUNNY_LORA.id
    ]);
    expect(reorderVideoLoras(original, H3_TURBO_LORA.id, -1)).toEqual(original);
  });
});
