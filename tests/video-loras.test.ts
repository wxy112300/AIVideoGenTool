import { describe, expect, it } from "vitest";
import {
  BUILTIN_VIDEO_LORAS,
  H3_CAMERA_MOTION_LORA,
  H3_CINEMATIC_REALISM_LORA,
  H3_BETTER_HUMAN_MOTION_LORA,
  H3_EQUI360_LORA,
  H3_VR180_SBS_LORA,
  H3_AFTER_MIDNIGHT_LORA,
  H3_FACIAL_REALISM_CLOSEUP_LORA,
  H3_REALISM_PEOPLE_LORA,
  H3_PDD_FL2VA_LORA,
  H3_PDD_REF2VA_LORA,
  H3_REF2V_TURBO_LORA,
  H3_SLA_TURBO_LORA,
  H3_TURBO_LORA,
  H3_TURBO_V4_LORA,
  normalizeHistoryVideoLoras,
  normalizeVideoLoras,
  reorderVideoLoras,
  videoLorasAfterAdding,
  videoLoraSelection,
  videoLoraCompatibleWithDraft,
  videoLoraConfigurationIssues,
  videoLorasForCreation,
  videoPromptForLoras
} from "../src/core/video-loras";
import { h3LoraPromptInstruction } from "../src/core/prompts/h3/loras";

describe("video LoRA catalog", () => {
  it("groups performance LoRAs before functional LoRAs in the H3 catalog", () => {
    expect(BUILTIN_VIDEO_LORAS.map((lora) => lora.id)).toEqual([
      H3_PDD_FL2VA_LORA.id,
      H3_PDD_REF2VA_LORA.id,
      H3_TURBO_V4_LORA.id,
      H3_SLA_TURBO_LORA.id,
      H3_TURBO_LORA.id,
      "minimax-h3-lightx2v-turbo-8step-v1",
      "minimax-h3-ref2v-turbo-4step-v01",
      H3_CINEMATIC_REALISM_LORA.id,
      H3_BETTER_HUMAN_MOTION_LORA.id,
      H3_CAMERA_MOTION_LORA.id,
      H3_EQUI360_LORA.id,
      H3_VR180_SBS_LORA.id,
      H3_AFTER_MIDNIGHT_LORA.id,
      H3_FACIAL_REALISM_CLOSEUP_LORA.id,
      H3_REALISM_PEOPLE_LORA.id
    ]);
    expect(H3_SLA_TURBO_LORA).toMatchObject({
      strength: 1,
      purpose: "performance",
      compatibleModelIds: ["minimax_h3_fl2va"],
      compatibleInputModes: ["image"]
    });
    expect(H3_PDD_FL2VA_LORA).toMatchObject({
      strength: 1,
      purpose: "performance",
      compatibleModelIds: ["minimax_h3_fl2va"],
      compatibleInputModes: ["image"],
      filename: "MiniMax-H3-FL2VA-Acc-8Step_pruned_comfy.safetensors"
    });
    expect(H3_PDD_REF2VA_LORA).toMatchObject({
      strength: 1,
      purpose: "performance",
      compatibleModelIds: ["minimax_h3_ref2va"],
      compatibleInputModes: ["image"],
      filename: "MiniMax-H3-Ref2VA-Acc-8Step_pruned_comfy.safetensors"
    });
    expect(H3_REALISM_PEOPLE_LORA).toMatchObject({
      strength: 0.85,
      purpose: "quality",
      compatibleModelIds: ["minimax_h3_fl2va", "minimax_h3_ref2va"],
      compatibleInputModes: ["image"]
    });
    expect(H3_FACIAL_REALISM_CLOSEUP_LORA).toMatchObject({
      strength: 0.8,
      purpose: "quality",
      promptPrefixes: ["Facial Realism"],
      compatibleModelIds: ["minimax_h3_fl2va"],
      compatibleInputModes: ["image"]
    });
    expect(H3_CAMERA_MOTION_LORA).toMatchObject({
      strength: 0.8,
      purpose: "motion",
      promptPrefixes: ["camera motion"],
      compatibleModelIds: ["minimax_h3_fl2va"],
      compatibleInputModes: ["image"]
    });
    expect(H3_CINEMATIC_REALISM_LORA).toMatchObject({
      strength: 0.5,
      purpose: "style",
      promptPrefixes: ["DY"],
      compatibleModelIds: ["minimax_h3_fl2va"],
      compatibleInputModes: ["image"]
    });
    expect(H3_BETTER_HUMAN_MOTION_LORA).toMatchObject({
      strength: 0.4,
      purpose: "motion",
      promptPrefixes: [],
      compatibleModelIds: ["minimax_h3_fl2va"],
      compatibleInputModes: ["image"]
    });
    expect(H3_EQUI360_LORA).toMatchObject({
      strength: 1,
      purpose: "style",
      promptPrefixes: ["equirect360"],
      compatibleModelIds: ["minimax_h3_fl2va"],
      compatibleInputModes: ["image"]
    });
    expect(H3_VR180_SBS_LORA).toMatchObject({
      strength: 1,
      purpose: "style",
      promptPrefixes: ["vr180sbs"],
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

  it("adds a missing Realism People trigger without relocating an existing one", () => {
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
    )).toBe("a woman, r34l1sm, turns toward the window");
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

  it("upgrades persisted LightX2V and Equi360 selections to the current upstream weights", () => {
    const [turbo, equi] = normalizeVideoLoras([
      {
        ...H3_TURBO_LORA,
        id: "minimax-h3-lightx2v-turbo-4step-768p-v1.1",
        filename: "minimax_h3_fl2v_turbo_4step_v1.1_768p_comfyui_bf16.safetensors"
      },
      {
        ...H3_EQUI360_LORA,
        filename: "h3-equi360-lora-step2500.safetensors"
      }
    ]);
    expect(turbo).toMatchObject({
      id: H3_TURBO_LORA.id,
      filename: H3_TURBO_LORA.filename
    });
    expect(equi).toMatchObject({
      id: H3_EQUI360_LORA.id,
      filename: H3_EQUI360_LORA.filename
    });
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

  it("rejects stacking a PDD LoRA with another low-step sampler LoRA", () => {
    const issues = videoLoraConfigurationIssues({
      modelId: "minimax_h3_fl2va",
      inputMode: "image",
      spectrumMode: "balanced",
      attentionMode: "sage",
      videoLoras: [H3_PDD_FL2VA_LORA, H3_TURBO_LORA]
    });

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: `combination:${[H3_PDD_FL2VA_LORA.id, H3_TURBO_LORA.id].sort().join(":")}`,
        severity: "error"
      })
    ]));
  });

  it("adds Cinema's trigger while keeping Better Human Motion trigger-free", () => {
    expect(videoPromptForLoras(
      "a woman walks through a softly lit hallway",
      [H3_CINEMATIC_REALISM_LORA, H3_BETTER_HUMAN_MOTION_LORA]
    )).toBe("DY, a woman walks through a softly lit hallway");
    expect(videoPromptForLoras(
      "DY, a woman walks through a softly lit hallway",
      [H3_CINEMATIC_REALISM_LORA]
    )).toBe("DY, a woman walks through a softly lit hallway");
  });

  it("warns about unvalidated Cinema and Better Human Motion stacks", () => {
    const issues = videoLoraConfigurationIssues({
      modelId: "minimax_h3_fl2va",
      inputMode: "image",
      spectrumMode: "off",
      attentionMode: "sage",
      videoLoras: [H3_CINEMATIC_REALISM_LORA, H3_BETTER_HUMAN_MOTION_LORA]
    });

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: `combination:${[H3_BETTER_HUMAN_MOTION_LORA.id, H3_CINEMATIC_REALISM_LORA.id].sort().join(":")}`,
        severity: "warning"
      }),
      expect.objectContaining({
        code: `order:${H3_CINEMATIC_REALISM_LORA.id}:${H3_BETTER_HUMAN_MOTION_LORA.id}`,
        severity: "warning"
      })
    ]));
  });

  it("supports the optional Realism People and Camera Motion dual stack", () => {
    const issues = videoLoraConfigurationIssues({
      modelId: "minimax_h3_fl2va",
      inputMode: "image",
      spectrumMode: "off",
      attentionMode: "sage",
      videoLoras: [H3_CAMERA_MOTION_LORA, H3_REALISM_PEOPLE_LORA]
    });

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: `combination:${[H3_CAMERA_MOTION_LORA.id, H3_REALISM_PEOPLE_LORA.id].sort().join(":")}`,
        severity: "warning"
      })
    ]));

    const instruction = h3LoraPromptInstruction([
      H3_CAMERA_MOTION_LORA,
      H3_REALISM_PEOPLE_LORA
    ]);
    expect(instruction).toContain("canonical trigger: camera motion");
    expect(instruction).toContain("optical depth of field");
    expect(instruction).toContain("canonical trigger: r34l1sm");
    expect(instruction).toContain("natural skin texture");
  });

  it("adds the Facial Realism trigger without displacing the reference declaration", () => {
    expect(videoPromptForLoras(
      "a woman looks toward the camera",
      [H3_FACIAL_REALISM_CLOSEUP_LORA]
    )).toBe("Facial Realism, a woman looks toward the camera");
    expect(videoPromptForLoras(
      "Facial Realism, a woman looks toward the camera",
      [H3_FACIAL_REALISM_CLOSEUP_LORA]
    )).toBe("Facial Realism, a woman looks toward the camera");
    expect(videoPromptForLoras(
      "A woman looks toward the camera. Facial Realism.",
      [H3_FACIAL_REALISM_CLOSEUP_LORA]
    )).toBe("A woman looks toward the camera. Facial Realism.");
    expect(videoPromptForLoras(
      [
        "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.",
        "integrated_multimodal_description: [Shot 1] A woman looks toward the camera."
      ].join("\n\n"),
      [H3_FACIAL_REALISM_CLOSEUP_LORA]
    )).toBe([
      "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.",
      "Facial Realism, integrated_multimodal_description: [Shot 1] A woman looks toward the camera."
    ].join("\n\n"));
    expect(videoPromptForLoras(
      [
        "How the reference pictures align with the target video — Picture 1 aligns with the 0.00-second mark; Picture 2 aligns with the 5.17-second mark.",
        "integrated_multimodal_description: [Shot 1] The subject crosses the room."
      ].join("\n\n"),
      [H3_FACIAL_REALISM_CLOSEUP_LORA]
    )).toBe([
      "How the reference pictures align with the target video — Picture 1 aligns with the 0.00-second mark; Picture 2 aligns with the 5.17-second mark.",
      "Facial Realism, integrated_multimodal_description: [Shot 1] The subject crosses the room."
    ].join("\n\n"));
  });

  it("removes obsolete LoRAs from creation and keeps name-only history snapshots", () => {
    const removed = [
      ["minimax-h3-turbo-ckpt850-ema", "MiniMax H3 Turbo ckpt850 EMA · 4-step motion fallback"],
      ["minimax-h3-lightx2v-turbo-4step", "LightX2V Turbo 4-Step · legacy v0.1"],
      ["minimax-h3-lightx2v-turbo-4step-768p-v1", "LightX2V Turbo 4-Step v1.0 · 768p"],
      ["minimax-h3-pink-fluffy-bunny-nsfw", "PinkFluffyBunny NSFW"]
    ].map(([id, name]) => ({
      id,
      name,
      filename: "stale.safetensors",
      strength: 1,
      modelFamily: "minimax-h3",
      compatibleModelIds: ["minimax_h3_fl2va"],
      compatibleInputModes: ["image"],
      purpose: "content"
    }));

    expect(BUILTIN_VIDEO_LORAS.some((lora) => removed.some((item) => item.id === lora.id))).toBe(false);
    expect(normalizeVideoLoras(removed)).toEqual([]);

    const history = normalizeHistoryVideoLoras(removed);
    expect(history.map((lora) => ({
      id: lora.id,
      name: lora.name,
      filename: lora.filename,
      strength: lora.strength,
      historyOnly: lora.historyOnly
    }))).toEqual(removed.map(({ id, name }) => ({
      id,
      name,
      filename: "",
      strength: 0,
      historyOnly: true
    })));
    expect(videoLorasForCreation(history)).toEqual([]);
    expect(videoLoraConfigurationIssues({
      modelId: "minimax_h3_fl2va",
      inputMode: "image",
      spectrumMode: "off",
      attentionMode: "sage",
      videoLoras: history
    })).toEqual([]);
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
      videoLoras: [H3_TURBO_LORA, H3_SLA_TURBO_LORA]
    });

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: `combination:${[H3_TURBO_LORA.id, H3_SLA_TURBO_LORA.id].sort().join(":")}`,
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

  it("adds the Equirectangular 360 trigger and keeps it on the H3 generation path", () => {
    expect(videoPromptForLoras(
      "a quiet forest at sunset",
      [H3_EQUI360_LORA]
    )).toBe("equirect360, a quiet forest at sunset");
    expect(videoPromptForLoras(
      "equirect360, a quiet forest at sunset",
      [H3_EQUI360_LORA]
    )).toBe("equirect360, a quiet forest at sunset");
    expect(videoLoraCompatibleWithDraft(
      H3_EQUI360_LORA,
      "minimax_h3_fl2va",
      "image"
    )).toBe(true);
    expect(videoLoraCompatibleWithDraft(
      H3_EQUI360_LORA,
      "minimax_h3_fl2va",
      "video"
    )).toBe(false);
    expect(videoLoraCompatibleWithDraft(
      H3_EQUI360_LORA,
      "minimax_h3_ref2va",
      "image"
    )).toBe(false);
  });

  it("passes Equirectangular 360 guidance to the H3 prompt enhancer", () => {
    const instruction = h3LoraPromptInstruction([H3_EQUI360_LORA]);
    expect(instruction).toContain("equirect360");
    expect(instruction).toContain("equirectangular spherical projection");
    expect(instruction).toContain("mono 360");
  });

  it("adds the VR180 SBS trigger and keeps it on the H3 generation path", () => {
    expect(videoPromptForLoras(
      "a quiet beach at sunset",
      [H3_VR180_SBS_LORA]
    )).toBe("vr180sbs, a quiet beach at sunset");
    expect(videoPromptForLoras(
      "vr180sbs, a quiet beach at sunset",
      [H3_VR180_SBS_LORA]
    )).toBe("vr180sbs, a quiet beach at sunset");
    expect(videoLoraCompatibleWithDraft(
      H3_VR180_SBS_LORA,
      "minimax_h3_fl2va",
      "image"
    )).toBe(true);
    expect(videoLoraCompatibleWithDraft(
      H3_VR180_SBS_LORA,
      "minimax_h3_fl2va",
      "video"
    )).toBe(false);
    expect(videoLoraCompatibleWithDraft(
      H3_VR180_SBS_LORA,
      "minimax_h3_ref2va",
      "image"
    )).toBe(false);
  });

  it("passes the VR180 SBS layout guidance to the H3 prompt enhancer", () => {
    const instruction = h3LoraPromptInstruction([H3_VR180_SBS_LORA]);
    expect(instruction).toContain("vr180sbs");
    expect(instruction).toContain("side-by-side");
    expect(instruction).toContain("left-eye");
    expect(instruction).toContain("21:9");
  });

  it("warns when 180 or 360 spatial LoRAs are used outside 21:9", () => {
    const issues = videoLoraConfigurationIssues({
      modelId: "minimax_h3_fl2va",
      inputMode: "image",
      ratio: "16:9",
      spectrumMode: "off",
      attentionMode: "sage",
      videoLoras: [H3_EQUI360_LORA, H3_VR180_SBS_LORA]
    });

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: `ratio:${H3_EQUI360_LORA.id}`,
        severity: "warning",
        message: expect.stringContaining("21:9")
      }),
      expect.objectContaining({
        code: `ratio:${H3_VR180_SBS_LORA.id}`,
        severity: "warning",
        message: expect.stringContaining("21:9")
      })
    ]));

    const matchingRatioIssues = videoLoraConfigurationIssues({
      modelId: "minimax_h3_fl2va",
      inputMode: "image",
      ratio: "21:9",
      spectrumMode: "off",
      attentionMode: "sage",
      videoLoras: [H3_EQUI360_LORA, H3_VR180_SBS_LORA]
    });

    expect(matchingRatioIssues.some((issue) => issue.code.startsWith("ratio:"))).toBe(false);
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
