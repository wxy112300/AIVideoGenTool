import { describe, expect, it } from "vitest";
import {
  BUILTIN_VIDEO_LORAS,
  H3_CKPT850_LORA,
  H3_CAMERA_MOTION_LORA,
  H3_AFTER_MIDNIGHT_LORA,
  H3_REALISM_PEOPLE_LORA,
  H3_REF2V_TURBO_LORA,
  H3_SLA_TURBO_LORA,
  H3_TURBO_LORA,
  H3_TURBO_V4_LORA,
  normalizeVideoLoras,
  reorderVideoLoras,
  videoLorasAfterAdding,
  videoLoraSelection,
  videoLoraCompatibleWithDraft,
  videoLoraConfigurationIssues,
  videoPromptForLoras
} from "../src/core/video-loras";

describe("video LoRA catalog", () => {
  it("groups performance LoRAs before functional LoRAs in the H3 catalog", () => {
    expect(BUILTIN_VIDEO_LORAS.map((lora) => lora.id)).toEqual([
      H3_TURBO_V4_LORA.id,
      H3_SLA_TURBO_LORA.id,
      H3_TURBO_LORA.id,
      "minimax-h3-lightx2v-turbo-8step-v1",
      H3_CKPT850_LORA.id,
      "minimax-h3-ref2v-turbo-4step-v01",
      H3_CAMERA_MOTION_LORA.id,
      H3_AFTER_MIDNIGHT_LORA.id,
      H3_REALISM_PEOPLE_LORA.id
    ]);
    expect(H3_CKPT850_LORA).toMatchObject({
      strength: 1,
      purpose: "performance",
      compatibleModelIds: ["minimax_h3_fl2va"],
      compatibleInputModes: ["image"]
    });
    expect(H3_SLA_TURBO_LORA).toMatchObject({
      strength: 1,
      purpose: "performance",
      compatibleModelIds: ["minimax_h3_fl2va"],
      compatibleInputModes: ["image"]
    });
    expect(H3_REALISM_PEOPLE_LORA).toMatchObject({
      strength: 0.8,
      purpose: "quality",
      compatibleModelIds: ["minimax_h3_fl2va", "minimax_h3_ref2va"],
      compatibleInputModes: ["image"]
    });
    expect(H3_CAMERA_MOTION_LORA).toMatchObject({
      strength: 0.8,
      purpose: "motion",
      promptPrefixes: ["camera motion"],
      compatibleModelIds: ["minimax_h3_fl2va"],
      compatibleInputModes: ["image"]
    });
    expect(H3_TURBO_V4_LORA).toMatchObject({
      strength: 1,
      purpose: "performance",
      compatibleModelIds: ["minimax_h3_fl2va"],
      compatibleInputModes: ["image"]
    });
    expect(H3_AFTER_MIDNIGHT_LORA).toMatchObject({
      strength: 1,
      purpose: "content",
      compatibleModelIds: ["minimax_h3_ref2va"],
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
      { ...H3_AFTER_MIDNIGHT_LORA, strength: 0.85 }
    ])).toMatchObject([
      { id: H3_TURBO_LORA.id, strength: 0.7 },
      { id: H3_AFTER_MIDNIGHT_LORA.id, strength: 0.85 }
    ]);
  });

  it("preserves the detected ComfyUI-relative filename for built-in LoRAs", () => {
    expect(normalizeVideoLoras([{
      ...H3_AFTER_MIDNIGHT_LORA,
      filename: "MiniMax-H3/AfterMidnight_ref2va_h3_sexytime_rank64-v1.2.safetensors"
    }])[0]?.filename).toBe(
      "MiniMax-H3/AfterMidnight_ref2va_h3_sexytime_rank64-v1.2.safetensors"
    );
  });

  it("allows Spectrum with Turbo and still reports risky LoRA combinations", () => {
    const issues = videoLoraConfigurationIssues({
      modelId: "minimax_h3_fl2va",
      inputMode: "image",
      spectrumMode: "balanced",
      attentionMode: "sage",
      videoLoras: [H3_TURBO_LORA, H3_REALISM_PEOPLE_LORA]
    });

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: `combination:${[H3_TURBO_LORA.id, H3_REALISM_PEOPLE_LORA.id].sort().join(":")}`,
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
      videoLoras: [H3_TURBO_LORA, H3_REALISM_PEOPLE_LORA]
    });
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: `combination:${[H3_REALISM_PEOPLE_LORA.id, H3_TURBO_LORA.id].sort().join(":")}`,
        severity: "warning"
      }),
    ]));
  });

  it("rejects stacking the v4 quality Turbo with another Turbo variant", () => {
    const issues = videoLoraConfigurationIssues({
      modelId: "minimax_h3_fl2va",
      inputMode: "image",
      spectrumMode: "off",
      attentionMode: "sage",
      videoLoras: [H3_TURBO_V4_LORA, H3_TURBO_LORA]
    });

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: `combination:${[H3_TURBO_V4_LORA.id, H3_TURBO_LORA.id].sort().join(":")}`,
        severity: "error"
      })
    ]));
  });

  it("rejects any persisted stack containing two compatible Turbo variants", () => {
    const issues = videoLoraConfigurationIssues({
      modelId: "minimax_h3_fl2va",
      inputMode: "image",
      spectrumMode: "balanced",
      attentionMode: "sage",
      videoLoras: [H3_CKPT850_LORA, H3_SLA_TURBO_LORA]
    });

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: `combination:${[H3_CKPT850_LORA.id, H3_SLA_TURBO_LORA.id].sort().join(":")}`,
        severity: "error"
      })
    ]));
  });

  it("replaces an existing Turbo variant when adding another Turbo variant", () => {
    const original = [H3_TURBO_LORA, H3_REALISM_PEOPLE_LORA];
    const next = videoLorasAfterAdding(original, H3_SLA_TURBO_LORA);

    expect(next.map((lora) => lora.id)).toEqual([
      H3_SLA_TURBO_LORA.id,
      H3_REALISM_PEOPLE_LORA.id
    ]);
    expect(original.map((lora) => lora.id)).toEqual([
      H3_TURBO_LORA.id,
      H3_REALISM_PEOPLE_LORA.id
    ]);
  });

  it("adds the Camera Motion trigger without changing the user's Prompt", () => {
    expect(videoPromptForLoras(
      "a slow orbit around the subject",
      [H3_CAMERA_MOTION_LORA]
    )).toBe("camera motion, a slow orbit around the subject");
    expect(videoLoraCompatibleWithDraft(
      H3_CAMERA_MOTION_LORA,
      "minimax_h3_fl2va",
      "image"
    )).toBe(true);
    expect(videoLoraCompatibleWithDraft(
      H3_CAMERA_MOTION_LORA,
      "minimax_h3_fl2va_int4",
      "image"
    )).toBe(false);
    expect(videoLoraCompatibleWithDraft(
      H3_CAMERA_MOTION_LORA,
      "minimax_h3_fl2va",
      "video"
    )).toBe(false);
  });

  it("reports the retired PinkFluffyBunny selection as unavailable for new tasks", () => {
    const issues = videoLoraConfigurationIssues({
      modelId: "minimax_h3_fl2va",
      inputMode: "image",
      spectrumMode: "off",
      attentionMode: "sage",
      videoLoras: [{
        id: "minimax-h3-pink-fluffy-bunny-nsfw",
        name: "PinkFluffyBunny NSFW",
        filename: "PinkFluffyBunny-pruned-v1-rank128.safetensors",
        strength: 0.5,
        modelFamily: "minimax-h3",
        compatibleModelIds: ["minimax_h3_fl2va"],
        compatibleInputModes: ["image"],
        purpose: "content"
      }]
    });
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "retired:minimax-h3-pink-fluffy-bunny-nsfw",
        severity: "error"
      })
    ]));
  });

  it("warns when LoRAs are loaded against their recommended order", () => {
    const issues = videoLoraConfigurationIssues({
      modelId: "minimax_h3_ref2va",
      inputMode: "image",
      spectrumMode: "off",
      attentionMode: "sage",
      videoLoras: [H3_AFTER_MIDNIGHT_LORA, H3_REF2V_TURBO_LORA]
    });

    expect(issues.some((issue) => issue.code.startsWith("order:"))).toBe(true);
  });

  it("offers the replacement NSFW LoRA only to R2V image drafts", () => {
    expect(videoLoraCompatibleWithDraft(
      H3_AFTER_MIDNIGHT_LORA,
      "minimax_h3_ref2va",
      "image"
    )).toBe(true);
    expect(videoLoraCompatibleWithDraft(
      H3_AFTER_MIDNIGHT_LORA,
      "minimax_h3_fl2va",
      "image"
    )).toBe(false);
    expect(videoLoraCompatibleWithDraft(
      H3_AFTER_MIDNIGHT_LORA,
      "minimax_h3_ref2va",
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
    const original = [H3_REF2V_TURBO_LORA, H3_AFTER_MIDNIGHT_LORA].map((lora) => ({ ...lora }));
    const reordered = reorderVideoLoras(original, H3_AFTER_MIDNIGHT_LORA.id, -1);

    expect(reordered.map((lora) => lora.id)).toEqual([
      H3_AFTER_MIDNIGHT_LORA.id,
      H3_REF2V_TURBO_LORA.id
    ]);
    expect(original.map((lora) => lora.id)).toEqual([
      H3_REF2V_TURBO_LORA.id,
      H3_AFTER_MIDNIGHT_LORA.id
    ]);
    expect(reorderVideoLoras(original, H3_REF2V_TURBO_LORA.id, -1)).toEqual(original);
  });
});
