import { describe, expect, it } from "vitest";
import { createDefaultState } from "../src/core/defaults.js";
import {
  describeH3PromptSkillsForInspection,
  formatH3PromptSkills,
  h3PromptSkills,
  parseLazySkillLoadRequest,
  resolveH3SkillsByIds,
  selectH3PromptSkills
} from "../src/core/prompts/h3/skills.js";
import { defaultH3PromptPresets, h3CorePromptPresetOrder, isLegacyDefaultH3PromptPreset } from "../src/core/prompts/h3/content.js";
import { strataH3InstructionParts, strataH3WordGuidance } from "../src/core/prompts/h3/strata.js";
import type { EnhanceRequest } from "../src/types.js";

describe("Consolidated H3 Craft Skills registry & priority cap", () => {
  it("consolidates scale-world-craft cleanly with reference localization, PS seam-healing, gravity, co-scaling & audio", () => {
    const ctx = {
      sourcePrompt: "把画面中的成年女性等比例缩小到5厘米高，让她沿着木桌上的咖啡杯旁走过，镜头慢慢推近。",
      supplementalContext: "",
      mode: "I2VA" as const,
      preset: "detailed-cinematic" as const,
      durationSeconds: 10,
      hasReferenceMedia: true
    };
    const skills = selectH3PromptSkills(ctx);
    const ids = skills.map((s) => s.id);
    expect(ids).toContain("scale-world-craft");
    expect(ids).toContain("physical-action-continuity");
    expect(ids).not.toContain("camera-threshold-entry");

    const rendered = formatH3PromptSkills(skills, ctx);
    expect(rendered).toContain("Two-person identity isolation & locked handles");
    expect(rendered).toContain("natural adult proportions");
    expect(rendered).toContain("Reference localization & seam-healing");
    expect(rendered).toContain("Centimeter-scale world");
    expect(rendered).toContain("Gravity, solid contact & co-scaling camera lock");
    expect(rendered).toContain("Psychoacoustic scale sound");
    expect(rendered).toContain("tilt-shift");
    // Only ONE example from scale-world-craft
    expect(rendered.match(/Example \(/g)?.length ?? 0).toBe(1);

    // Reference localization stays out of text-only T2VA prompts
    const textOnly = formatH3PromptSkills(skills, { ...ctx, hasReferenceMedia: false });
    expect(textOnly).not.toContain("Reference localization");
  });

  it("injects only matching interaction sub-rules inside scale-world-craft without duplicating scale skills", () => {
    const handCtx = {
      sourcePrompt: "女巨人伸出巨手从木桌上轻轻捏起巴掌大小的成年男子，放进掌心凑近观察并轻吹一口气。",
      supplementalContext: "",
      mode: "I2VA" as const,
      preset: "detailed-cinematic" as const,
      durationSeconds: 10,
      hasReferenceMedia: true
    };
    const handSkills = selectH3PromptSkills(handCtx);
    expect(handSkills.filter((s) => s.id.startsWith("scale-"))).toHaveLength(1);
    const handText = formatH3PromptSkills(handSkills, handCtx);
    expect(handText).toContain("Giant hand pickup, pinch, palm scoop & finger nudge");
    expect(handText).toContain("Local-horizon macro framing on giant face/body");
    expect(handText).not.toContain("Dynamic shrinking/growing transformation");
    expect(handText).not.toContain("Giant-body climbing/walking");

    const climbCtx = {
      sourcePrompt: "等比例缩小的成年男子抓着牛仔裤缝线从巨大女性的脚踝一路爬上肩膀，皮肤微凹且巨大女性低头看他。",
      supplementalContext: "",
      mode: "T2VA" as const,
      preset: "detailed-cinematic" as const,
      durationSeconds: 15,
      hasReferenceMedia: false,
      isLongVideo: true
    };
    const climbSkills = selectH3PromptSkills(climbCtx);
    expect(climbSkills.map((s) => s.id)).toContain("scale-world-craft");
    const climbText = formatH3PromptSkills(climbSkills, climbCtx);
    expect(climbText).toContain("Giant-body climbing/walking & shifting biological surface physics");
    expect(climbText).toContain("Example (body climb + tactile contact)");

    const shrinkCtx = {
      sourcePrompt: "A full-grown woman sitting on a sofa gradually shrinks down to thumb-sized while her oversized clothes collapse around her.",
      supplementalContext: "",
      mode: "I2VA" as const,
      preset: "detailed-cinematic" as const,
      durationSeconds: 10,
      hasReferenceMedia: true
    };
    const shrinkText = formatH3PromptSkills(selectH3PromptSkills(shrinkCtx), shrinkCtx);
    expect(shrinkText).toContain("Dynamic shrinking/growing transformation");
    expect(shrinkText).toContain("100% rigid and unchanged");

    const ordinaryHand = selectH3PromptSkills({
      sourcePrompt: "A woman picks up a ceramic coffee cup from the wooden table and smiles.",
      supplementalContext: "",
      mode: "I2VA",
      preset: "detailed-cinematic",
      durationSeconds: 5,
      hasReferenceMedia: true
    }).map((s) => s.id);
    expect(ordinaryHand).not.toContain("scale-world-craft");
    expect(ordinaryHand).not.toContain("micro-camera-transitions");
  });

  it("distinguishes 1mm vs 10cm physics and consolidates micro-FPV, tiny third-person low-angle & continuous Wide<->Micro transitions", () => {
    const mmCtx = {
      sourcePrompt: "等比例缩小到2毫米高的人站在地毯纤维和皮肤纹路间，蚂蚁视角贴近小人背后第三人称低机位仰拍，再一镜到底从脚边拉远展示全景房间。",
      supplementalContext: "",
      mode: "I2VA" as const,
      preset: "detailed-cinematic" as const,
      durationSeconds: 10,
      hasReferenceMedia: true
    };
    const mmSkills = selectH3PromptSkills(mmCtx);
    expect(mmSkills.map((s) => s.id)).toEqual(expect.arrayContaining(["scale-world-craft", "micro-camera-transitions"]));
    const mmText = formatH3PromptSkills(mmSkills, mmCtx);
    expect(mmText).toContain("Millimeter-scale world");
    expect(mmText).toContain("Translate micro-view shorthand");
    expect(mmText).toContain("True surface-eye-level low angle & smooth push-in");
    expect(mmText).toContain("Continuous unbroken perspective transitions");

    const literalAnt = selectH3PromptSkills({
      sourcePrompt: "A black ant crawls across a green leaf in morning sunlight.",
      supplementalContext: "",
      mode: "T2VA",
      preset: "official-storyboard",
      durationSeconds: 5,
      hasReferenceMedia: false
    }).map((s) => s.id);
    expect(literalAnt).not.toContain("micro-camera-transitions");
    expect(literalAnt).not.toContain("scale-world-craft");

    const natureTransition = selectH3PromptSkills({
      sourcePrompt: "One-take seamless macro-to-wide pullback from a trembling dewdrop on a fern leaf out to a misty morning forest.",
      supplementalContext: "",
      mode: "T2VA",
      preset: "continuous-motion",
      durationSeconds: 10,
      hasReferenceMedia: false
    }).map((s) => s.id);
    expect(natureTransition).toContain("micro-camera-transitions");
    expect(natureTransition).not.toContain("scale-world-craft");
  });

  it("activates multi-subject-blocking, acting-micro-expressions, scene-physics-optics, and stylized-animation-craft selectively", () => {
    const twoPersonDramatic = {
      sourcePrompt: "两人在桌边对视，左侧女子震惊愣住后把钥匙递给右侧男子。",
      supplementalContext: "",
      mode: "I2VA" as const,
      preset: "detailed-cinematic" as const,
      durationSeconds: 8,
      hasReferenceMedia: true
    };
    const bothSkills = selectH3PromptSkills(twoPersonDramatic);
    expect(bothSkills.map((s) => s.id)).toEqual(expect.arrayContaining([
      "multi-subject-blocking",
      "acting-micro-expressions"
    ]));
    const blockText = formatH3PromptSkills(bothSkills, twoPersonDramatic);
    expect(blockText).toContain("Spatial blocking, identity binding & 180° axis lock");
    expect(blockText).toContain("Eye-line coupling & turn-taking");
    expect(blockText).toContain("Single-object prop handoff");
    expect(blockText).toContain("Observable physiological beats");
    expect(blockText).toContain("Natural reaction latency & gradual arc");

    // Solo emotional scene triggers acting-micro-expressions without multi-subject-blocking
    const soloActing = selectH3PromptSkills({
      sourcePrompt: "女子独自坐在窗边读信，眼中含泪、欲言又止地深呼吸。",
      supplementalContext: "",
      mode: "I2VA",
      preset: "detailed-cinematic",
      durationSeconds: 6,
      hasReferenceMedia: true
    }).map((s) => s.id);
    expect(soloActing).toContain("acting-micro-expressions");
    expect(soloActing).not.toContain("multi-subject-blocking");

    // Neutral two-person handoff triggers multi-subject-blocking without acting-micro-expressions
    const neutralHandoff = selectH3PromptSkills({
      sourcePrompt: "Two workers stand side by side at the bench and pass a wrench from frame-left to frame-right.",
      supplementalContext: "",
      mode: "T2VA",
      preset: "official-storyboard",
      durationSeconds: 5,
      hasReferenceMedia: false
    }).map((s) => s.id);
    expect(neutralHandoff).toContain("multi-subject-blocking");
    expect(neutralHandoff).not.toContain("acting-micro-expressions");

    const physicsCtx = {
      sourcePrompt: "Rain pours down the glass window with neon reflections as the runner sprints in slow-motion.",
      supplementalContext: "",
      mode: "T2VA" as const,
      preset: "continuous-motion" as const,
      durationSeconds: 8,
      hasReferenceMedia: false
    };
    const physicsText = formatH3PromptSkills(selectH3PromptSkills(physicsCtx), physicsCtx);
    expect(physicsText).toContain("Fluid, fire & wind coherence");
    expect(physicsText).toContain("Mirror reflections, glass refraction");
    expect(physicsText).toContain("Action choreography & slow-motion physics");

    const anime = selectH3PromptSkills({
      sourcePrompt: "2D anime style girl running through cherry blossoms.",
      supplementalContext: "",
      mode: "I2VA",
      preset: "detailed-cinematic",
      durationSeconds: 5,
      hasReferenceMedia: true
    }).map((s) => s.id);
    expect(anime).toContain("stylized-animation-craft");
    expect(anime).not.toContain("visual-realism");
  });

  it("orders all matched orthogonal skills by priority, caps examples at 2, and supports optional maxSkills for small models", () => {
    expect(h3PromptSkills).toHaveLength(12);
    const overloadedCtx = {
      sourcePrompt: "2D anime style: Ant view third-person low-angle 180 degree orbit as a tiny 3mm man climbs a giantess's hand in pouring rain with mirror reflections, then camera flies into an open doorway while two shocked characters speak dialogue.",
      supplementalContext: "",
      mode: "I2VA" as const,
      preset: "detailed-cinematic" as const,
      durationSeconds: 10,
      hasReferenceMedia: true
    };
    const allMatched = selectH3PromptSkills(overloadedCtx);
    expect(allMatched.length).toBeGreaterThan(4);
    expect(allMatched[0]!.id).toBe("scale-world-craft");
    expect(allMatched[1]!.id).toBe("camera-threshold-entry");
    expect(allMatched[2]!.id).toBe("micro-camera-transitions");
    expect(allMatched.map((s) => s.id)).toContain("dialogue-audio");
    const rendered = formatH3PromptSkills(allMatched, overloadedCtx);
    expect(rendered.match(/Example \(/g)?.length ?? 0).toBeLessThanOrEqual(2);

    // Smaller models can still opt into a tighter skill budget
    const cappedForSmallModel = selectH3PromptSkills(overloadedCtx, 2);
    expect(cappedForSmallModel.map((s) => s.id)).toEqual(["scale-world-craft", "camera-threshold-entry"]);
  });

  it("activates camera-threshold-entry for mouth/throat/tunnel entry with anti-recursion rules", () => {
    for (const brief of [
      "镜头平滑飞进她张开的嘴里，穿过口腔深入幽暗的喉咙内部。",
      "The camera glides smoothly into the open mouth and travels deeper inside the throat.",
      "The lens pushes through the doorway into a dim stone tunnel."
    ]) {
      const ctx = {
        sourcePrompt: brief,
        supplementalContext: "",
        mode: "I2VA" as const,
        preset: "detailed-cinematic" as const,
        durationSeconds: 8,
        hasReferenceMedia: true
      };
      const skills = selectH3PromptSkills(ctx);
      expect(skills.map((s) => s.id)).toContain("camera-threshold-entry");
      const text = formatH3PromptSkills(skills, ctx);
      expect(text).toContain("Pre-entry & crossing");
      expect(text).toContain("One-way deeper entry");
      expect(text).toContain("Inside-looking-out 180° reverse orbit");
      expect(text).toContain("NEVER reveal outside light or an opening in front of the camera while still facing inward");
    }
  });

  it("handles real mouth/tongue reverse-orbit + tiny adult girl + pasted meta-boilerplate brief cleanly", () => {
    const settings = createDefaultState().settings;
    const req: EnhanceRequest = {
      prompt: [
        "Camera fly close to the tiny girl(note: a real life scaled down human adult girl, age 18, NOT a figure, keep her size unchanged) walking on giant girl's tongue inside mouth.",
        "Camera fly close to the tiny girl to an extremely low angle close to the tiny girl and following tiny girl's movement.",
        "Camera fly into the mouth and rotate around the tiny girl to another angle and we can see outside from inside mouth. The tiny girl is keep walking on the moving tongue, and then crawling on it. We can hear the sound of giant girl's breathing all the time.",
        "Use photorealistic live-action image quality with natural skin and material texture. Preserve the requested action, camera, lighting, and reference anchors."
      ].join("\n"),
      modelId: "minimax_h3_fl2va",
      mode: "h3-vision",
      h3PromptMode: "I2VA",
      h3PromptPreset: "detailed-cinematic",
      h3DurationSeconds: 10,
      imagePaths: ["mouth.png"]
    };
    const parts = strataH3InstructionParts(req, settings, "", "en");
    expect(parts.activeSkillIds).toEqual(expect.arrayContaining([
      "scale-world-craft",
      "camera-threshold-entry",
      "micro-camera-transitions",
      "multi-subject-blocking",
      "dialogue-audio"
    ]));
    expect(parts.contract).toContain("Inside-looking-out 180° reverse orbit");
    expect(parts.contract).toContain("the tiny adult woman");
    expect(parts.contract).toContain("moving tongue");
    expect(parts.contract).toContain("ROLE (TWO LAYERS):");
    expect(parts.contract).toContain("H3 PITFALLS — WRONG vs RIGHT");
    expect(parts.contract).toContain("Duration contract:");
    expect(parts.contract).toContain("actor → action → patient/object → contact surface");
    expect(parts.task).toContain("PRIVATE THINKING WORKSHEET");
    // Already-loaded skills are excluded from unloadedSkillIds so they can never be injected twice.
    expect(parts.unloadedSkillIds).not.toContain("scale-world-craft");
    expect(parts.unloadedSkillIds).not.toContain("camera-threshold-entry");
    expect(parts.unloadedSkillIds).not.toContain("multi-subject-blocking");
  });

  it("parses LOAD_SKILLS requests strictly against the unloaded whitelist and falls back cleanly on direct H3 output", () => {
    const allowed = ["scale-world-craft", "stylized-animation-craft", "scene-physics-optics"];
    expect(parseLazySkillLoadRequest("LOAD_SKILLS: scale-world-craft, stylized-animation-craft", allowed))
      .toEqual(["scale-world-craft", "stylized-animation-craft"]);
    expect(parseLazySkillLoadRequest("<think>Inspecting image...</think>\n```text\nLOAD_SKILLS: scene-physics-optics, unknown-id, scale-world-craft\n```", allowed))
      .toEqual(["scene-physics-optics", "scale-world-craft"]);
    expect(parseLazySkillLoadRequest("integrated_multimodal_description: [Shot 1] LOAD_SKILLS: scale-world-craft", allowed))
      .toBeNull();
    expect(parseLazySkillLoadRequest("LOAD_SKILLS: not-in-whitelist", allowed)).toBeNull();

    // Text-only T2VA does not attach the visual lazy-load catalog, while image-backed requests do.
    const settings = createDefaultState().settings;
    const baseReq: EnhanceRequest = {
      prompt: "A woman walks steadily forward.",
      modelId: "minimax_h3_fl2va",
      mode: "h3-vision",
      h3PromptMode: "T2VA",
      h3PromptPreset: "official-storyboard",
      h3DurationSeconds: 5
    };
    const textOnly = strataH3InstructionParts(baseReq, settings, "", "en");
    expect(textOnly.unloadedSkillIds).toEqual([]);
    expect(textOnly.contract).not.toContain("OPTIONAL CRAFT SKILLS NOT YET LOADED");

    const withImage = strataH3InstructionParts({ ...baseReq, h3PromptMode: "I2VA", imagePaths: ["ref.png"] }, settings, "", "en");
    expect(withImage.unloadedSkillIds).toContain("scale-world-craft");
    expect(withImage.contract).toContain("OPTIONAL CRAFT SKILLS NOT YET LOADED");

    // Lazy-loaded skills always emit non-empty fallback guidance even when the text brief lacks keywords.
    const blankCtx = {
      sourcePrompt: "She moves forward.",
      supplementalContext: "",
      mode: "I2VA" as const,
      preset: "official-storyboard" as const,
      durationSeconds: 5,
      hasReferenceMedia: true
    };
    for (const id of ["scene-physics-optics", "camera-precision", "micro-camera-transitions"]) {
      const resolved = resolveH3SkillsByIds([id], false);
      expect(resolved).toHaveLength(1);
      expect(resolved[0]!.guidance(blankCtx).trim().length).toBeGreaterThan(40);
    }
  });

  it("shares only long-video-compatible craft skills when isLongVideo is true", () => {
    const shared = selectH3PromptSkills({
      sourcePrompt: "Ant view following a shrunk adult woman as the camera flies into a doorway pocket, orbiting 180 degrees.",
      supplementalContext: "",
      mode: "T2VA",
      preset: "detailed-cinematic",
      durationSeconds: 5,
      hasReferenceMedia: true,
      isLongVideo: true
    }).map((s) => s.id);
    expect(shared).toEqual([
      "scale-world-craft",
      "continuum-continuity",
      "camera-threshold-entry",
      "micro-camera-transitions",
      "camera-precision"
    ]);
    expect(shared).not.toContain("physical-action-continuity");
    expect(shared).not.toContain("dialogue-audio");
  });

  it("activates continuum-continuity strictly in Long Video, multi-chunk Continuum, and Extend modes—never on ordinary single-clip prompts", () => {
    const settings = createDefaultState().settings;
    // Ordinary single-clip T2VA / I2VA / FL2VA / R2V must NOT load continuum-continuity (nor list it in lazy-load catalog)
    for (const mode of ["T2VA", "I2VA", "FL2VA", "R2V"] as const) {
      const normalParts = strataH3InstructionParts({
        prompt: "A woman walks across a quiet room.",
        modelId: mode === "R2V" ? "minimax_h3_ref2va" : "minimax_h3_fl2va",
        mode: "h3-vision",
        h3PromptMode: mode,
        h3PromptPreset: "detailed-cinematic",
        h3DurationSeconds: 10,
        imagePaths: mode === "T2VA" ? undefined : ["frame.png"]
      }, settings, "", "en");
      expect(normalParts.activeSkillIds).not.toContain("continuum-continuity");
      expect(normalParts.unloadedSkillIds).not.toContain("continuum-continuity");
    }

    // Native Continuum Extend triggers continuum-continuity with exact Chunk opener
    const nativeExtend = strataH3InstructionParts({
      prompt: "She finishes opening the drawer and lifts out the key.",
      modelId: "minimax_h3_continuum",
      mode: "h3-vision",
      h3PromptMode: "T2VA",
      h3PromptPreset: "detailed-cinematic",
      h3DurationSeconds: 10,
      extensionSource: "source-task-1",
      continuumPreviousChunk: 2
    }, settings, "", "en");
    expect(nativeExtend.activeSkillIds).toContain("continuum-continuity");
    expect(nativeExtend.contract).toContain("Continuum 22-frame latent tail & boundary physics");
    expect(nativeExtend.contract).toContain("Continuation of Chunk 2.");

    // Non-native FL2VA/I2VA Extend triggers continuum-continuity with boundary routing guidance
    const boundaryExtend = strataH3InstructionParts({
      prompt: "She turns toward the doorway and steps out.",
      modelId: "minimax_h3_fl2va",
      mode: "h3-vision",
      h3PromptMode: "I2VA",
      h3PromptPreset: "detailed-cinematic",
      h3DurationSeconds: 10,
      extensionSource: "source-task-1",
      imagePaths: ["boundary.png"]
    }, settings, "", "en");
    expect(boundaryExtend.activeSkillIds).toContain("continuum-continuity");
    expect(boundaryExtend.contract).toContain("Extend boundary routing:");
  });

  it("keeps Strata single-clip system prompt lean and honors custom presets without legacy 26B bloat", () => {
    const settings = createDefaultState().settings;
    const req: EnhanceRequest = {
      prompt: "A woman walks across a quiet wooden room and opens the window.",
      modelId: "minimax_h3_fl2va",
      mode: "h3-vision",
      h3PromptMode: "I2VA",
      h3PromptPreset: "detailed-cinematic",
      h3DurationSeconds: 10,
      imagePaths: ["first.png"]
    };
    const defaultParts = strataH3InstructionParts(req, settings, "", "en");
    expect(defaultParts.contract.length + defaultParts.sourceData.length).toBeLessThan(10500);
    expect(defaultParts.contract).toContain("ROLE (TWO LAYERS):");
    expect(defaultParts.contract).toContain("H3 PITFALLS — WRONG vs RIGHT");
    expect(defaultParts.contract).toContain("Blocked A→B shortcuts & casual brief wording");
    expect(defaultParts.contract).toContain("Passable A→B route, obstacle clearing & speed allocation");
    expect(defaultParts.contract).toContain("omit unknown age/details");
    expect(defaultParts.contract).toContain("Duration contract:");
    expect(defaultParts.contract).toContain("Strict single-take lock:");
    expect(defaultParts.contract).toContain("I2VA first-frame motion:");
    expect(defaultParts.contract).toContain("Audio section mixing");
    expect(defaultParts.task).toContain("PRIVATE THINKING WORKSHEET");
    expect(defaultParts.task).toContain("IMAGE GROUND TRUTH");
    expect(defaultParts.task).toContain("A→B ROUTE, OBSTACLES & TIME BUDGET");
    expect(defaultParts.contract).not.toContain("DETAILED CINEMATIC EXPANSION GATE");
    expect(strataH3WordGuidance("I2VA", 5, "detailed-cinematic")).toEqual({ min: 320, max: 480 });
    expect(strataH3WordGuidance("I2VA", 10, "detailed-cinematic")).toEqual({ min: 450, max: 680 });
    expect(strataH3WordGuidance("I2VA", 15, "detailed-cinematic")).toEqual({ min: 580, max: 850 });

    const fl2vaParts = strataH3InstructionParts({
      ...req,
      h3PromptMode: "FL2VA",
      imagePaths: ["first.png", "last.png"]
    }, settings, "", "en");
    expect(fl2vaParts.contract).toContain("Pair each person across Picture 1 and Picture 2 by stable visual traits");
    expect(fl2vaParts.contract).toContain("NEVER by screen side or pixel size");

    const r2vParts = strataH3InstructionParts({
      ...req,
      h3PromptMode: "R2V",
      imagePaths: ["ref1.png", "ref2.png"]
    }, settings, "", "en");
    expect(r2vParts.contract).toContain("Give every supplied asset ONE clear, stable job");

    const customSettings = {
      ...settings,
      h3PromptPresets: { ...settings.h3PromptPresets, "detailed-cinematic": "CUSTOM DIRECTOR STYLE: crisp handheld documentary pacing." }
    };
    const customParts = strataH3InstructionParts(req, customSettings, "", "en");
    expect(customParts.sourceData).toContain("CUSTOM DIRECTOR STYLE: crisp handheld documentary pacing.");
    // Single source of truth: default Settings text is sent verbatim to Strata without hidden overrides.
    expect(defaultParts.sourceData).toContain(defaultH3PromptPresets["detailed-cinematic"]);
  });

  it("migrates untouched legacy 26B default presets while preserving user-edited text and exposes all 11 skills for Settings inspection", () => {
    const legacyDetailed = "Create the most fully developed, production-ready H3 prompt among the available presets.\n...\nReturn only the final H3 prompt.";
    expect(isLegacyDefaultH3PromptPreset("detailed-cinematic", legacyDetailed)).toBe(true);
    expect(isLegacyDefaultH3PromptPreset("detailed-cinematic", "My custom style rule.")).toBe(false);
    expect(isLegacyDefaultH3PromptPreset("detailed-cinematic", defaultH3PromptPresets["detailed-cinematic"])).toBe(false);
    expect(h3CorePromptPresetOrder).toEqual([
      "detailed-cinematic",
      "official-storyboard",
      "continuous-motion",
      "beat-storyboard",
      "annotation-revision",
      "multi-reference"
    ]);

    const inspected = describeH3PromptSkillsForInspection();
    expect(inspected).toHaveLength(12);
    for (const skill of inspected) {
      expect(skill.triggerSummary.trim().length).toBeGreaterThan(10);
      expect(skill.rulesText.trim().length).toBeGreaterThan(40);
    }
    const scaleInspected = inspected.find((s) => s.id === "scale-world-craft")!;
    expect(scaleInspected.rulesText).toContain("Two-person identity isolation & locked handles");
    expect(scaleInspected.rulesText).toContain("Giant hand pickup");
    expect(scaleInspected.rulesText).toContain("moving tongue");
    expect(scaleInspected.rulesText).toContain("Exact tight ratio & scale-true verbs");
    expect(scaleInspected.rulesText).toContain("Bilateral opposing-plane press");
    expect(scaleInspected.rulesText).toContain("Tight clothing, waistband & pocket entry");
    expect(scaleInspected.rulesText).toContain("Oral interior teeth & chewing spatial layering");
  });

  it("handles real scale failure cases: waistband V-gap, sole-to-sole sandwich, surface-eye-level anti-overhead, local-horizon face & oral teeth layering", () => {
    const settings = createDefaultState().settings;
    const makeParts = (prompt: string) => strataH3InstructionParts({
      prompt,
      modelId: "minimax_h3_fl2va",
      mode: "h3-vision",
      h3PromptMode: "I2VA",
      h3PromptPreset: "detailed-cinematic",
      h3DurationSeconds: 10,
      imagePaths: ["ref.png"]
    }, settings, "", "en");

    // Case 1: Waistband / clothing gap (anti cloth clipping)
    const waistband = makeParts(
      "The tiny girl (18 years old real scaled down adult) grabs the giant girl's underwear elastic waistband and tries squeezing inside while the giant pulls back the elastic waistband."
    );
    expect(waistband.contract).toContain("Tight clothing, waistband & pocket entry (3D held-open V-gap");
    expect(waistband.contract).toContain("climbing OVER the top elastic rim");

    // Case 3: Sole-to-sole bilateral sandwich + inverted subject typo self-correction
    const soles = makeParts(
      "Camera fly close to the tiny girl climbing on giant girl's toes with an extremely low angle. Then the giant girl get sandwiched by the giant soles and toes (sole to sole, two foot sandwiched the tiny girl)."
    );
    expect(soles.contract).toContain("Bilateral opposing-plane press / sole-to-sole");
    expect(soles.contract).toContain("Silently fix draft typos/slips");

    // Case 4: Near eyebrow low-angle (anti-overhead, Frame-0 smooth push-in, anti-face-deformation & character isolation)
    const eyebrow = makeParts(
      "Camera fly close to the tiny girl(note: a real life scaled down human adult girl, age 18, NOT a figure, keep her size unchanged) near giant girl's eyebrow with an extremely low angle close to tiny girl's perspective. The tiny girl climbs on giant girl's nose and hugs her tongue."
    );
    expect(eyebrow.contract).toContain("True surface-eye-level low angle & smooth push-in");
    expect(eyebrow.contract).toContain("open at `<Picture 1>`'s real framing");
    expect(eyebrow.contract).toContain("NEVER the word 'figure'");
    expect(eyebrow.contract).toContain("Local-horizon macro framing on giant face/body (anti-face-deformation)");
    expect(eyebrow.contract).toContain("Exact tight ratio & scale-true verbs");

    // Case 6: 5 mm ice cream + mouth entry + teeth chewing + reverse orbit retention + action semantics
    const oralChew = makeParts(
      "The tiny girl (only 5 mm tall) climbs on chocolate ice cream, dogging the giant girl's tongue; camera flies into giant girl's mouth and arcs 180 degrees around so we can see outside while giant teeth chew the food."
    );
    expect(oralChew.activeSkillIds).toEqual(expect.arrayContaining([
      "scale-world-craft",
      "camera-threshold-entry",
      "camera-precision",
      "multi-subject-blocking",
      "physical-action-continuity"
    ]));
    expect(oralChew.contract).toContain("Oral interior teeth & chewing spatial layering");
    expect(oralChew.contract).toContain("Inside-looking-out 180° reverse orbit");
    expect(oralChew.contract).toContain("late camera trajectory");
    expect(oralChew.contract).toContain("Exact arc shot / orbit");
    expect(oralChew.contract).toContain("Preserve exact actor, target, verb meaning, direction, and repetition");
  });

  it("injects community-proven camera sub-rules selectively (dolly vs zoom, static, tracking, crane, handheld, rack focus, whip pan, POV)", () => {
    const base = {
      supplementalContext: "",
      mode: "I2VA" as const,
      preset: "detailed-cinematic" as const,
      durationSeconds: 10,
      hasReferenceMedia: true
    };
    const cases: Array<[string, string]> = [
      ["Slow dolly-in toward the doorway with noticeable background parallax.", "Physical dolly (push-in / pull-out) vs optical zoom"],
      ["Static tripod shot of the cyclist crossing the bridge.", "Locked-off static camera (beats I2VA/T2VA floating drift)"],
      ["Tracking shot moving laterally alongside the runner along the pier.", "Tracking / follow / truck shot"],
      ["Crane up from the alley to reveal the sunlit rooftops.", "Bounded crane / jib / pedestal elevation"],
      ["Subtle documentary handheld camera following the chef.", "Restrained handheld / documentary feel"],
      ["Rack focus from the foreground coffee cup to her eyes.", "Rack focus / depth-of-field handoff"],
      ["Fast whip pan from the ringing phone to the open door.", "Anchored whip pan (beats ghosting and face morphing)"],
      ["First-person POV hands opening the wooden toolbox on a bench.", "True first-person POV (beats accidental third-person)"]
    ];
    for (const [prompt, expectedPhrase] of cases) {
      const ctx = { ...base, sourcePrompt: prompt };
      const skills = selectH3PromptSkills(ctx);
      expect(skills.map((s) => s.id)).toContain("camera-precision");
      const rendered = formatH3PromptSkills(skills, ctx);
      expect(rendered).toContain("Single-trajectory discipline & anti-treadmill rule");
      expect(rendered).toContain(expectedPhrase);
    }

    // Ordinary action brief with no camera terms must NOT trigger camera-precision
    const plainSkills = selectH3PromptSkills({
      ...base,
      sourcePrompt: "A woman walks across a quiet wooden room and opens the window."
    }).map((s) => s.id);
    expect(plainSkills).not.toContain("camera-precision");

    // Macro visual realism triggers subtype-selective skin, lips/eyes, fabric & lens craft (skipped for anime)
    const macroCtx = {
      ...base,
      sourcePrompt: "100mm macro close-up of her lips and eyes with visible skin pores, peach fuzz, and woven denim jacket collar."
    };
    const macroSkills = selectH3PromptSkills(macroCtx);
    expect(macroSkills.map((s) => s.id)).toContain("visual-realism");
    const macroRendered = formatH3PromptSkills(macroSkills, macroCtx);
    expect(macroRendered).toContain("Unretouched skin micro-topography & subsurface scattering");
    expect(macroRendered).toContain("Macro lips, moisture & eye realism");
    expect(macroRendered).toContain("Tactile fabric weave & physical materiality");
    expect(macroRendered).toContain("Optical lens discipline");
  });

  it("passes the Two-Layer H3 Harness Audit (Layer 1 Qwen teacher hygiene + Layer 2 MiniMax H3 output contract)", async () => {
    const { auditH3Layer1Instructions, auditH3Layer2Output } = await import("../src/core/prompts/h3/layer-audit.js");
    const settings = createDefaultState().settings;

    // Layer 1: every built-in preset, every skill, and every compiled mode passes cleanly
    const layer1 = auditH3Layer1Instructions(settings);
    expect(layer1.issues).toEqual([]);
    expect(layer1.passed).toBe(true);
    expect(layer1.stats.skillCount).toBe(12);
    expect(layer1.stats.corePresetCount).toBe(6);

    // Layer 2: catches all real Qwen→H3 boundary failures
    const badOutput = [
      "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.",
      "integrated_multimodal_description:",
      "At 0.00 seconds, <Picture 1> (from [Shot 1]) is fully referenced. The camera Push In steadily on a giant 18-year-old woman and a tiny figure who squeezes through closed fabric. [Push in] named speaker (S1) says: <d>[English] Hello</d>. NOT a toy, no jitter.",
      "overall_soundscape:",
      "Rain taps on glass. Her spoken line carries clear voice intimacy. No music.",
      "non_diegetic_music:",
      "N/A"
    ].join("\n");
    const badReport = auditH3Layer2Output(badOutput, {
      mode: "I2VA",
      sourcePrompt: "tiny girl(note: age 18, NOT a figure) walking on giant girl's thigh"
    });
    expect(badReport.passed).toBe(false);
    const codes = badReport.issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining([
      "l2-literal-named-speaker",
      "l2-ungrammatical-camera-token",
      "l2-legacy-hailuo-bracket-tag",
      "l2-negative-channel-leak",
      "l2-toy-prior-leak",
      "l2-impossible-shortcut-clipping",
      "l2-main-missing-shot1-start",
      "l2-soundscape-format-leak",
      "l2-soundscape-speech-leak",
      "l2-cross-character-age-bleed"
    ]));

    // Layer 2: clean MiniMax H3 prompt passes with zero issues
    const goodOutput = [
      "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.",
      "integrated_multimodal_description:",
      "[Shot 1] In one continuous unbroken shot, the lens opens at <Picture 1>'s framing and glides smoothly forward and downward to the tiny adult woman's eye level on the giant woman's bare thigh as she steps forward with crisp contact shadows.",
      "overall_soundscape:",
      "Delicate dry footsteps tapping against smooth skin beneath slow warm breathing.",
      "non_diegetic_music:",
      "N/A"
    ].join("\n");
    const goodReport = auditH3Layer2Output(goodOutput, {
      mode: "I2VA",
      sourcePrompt: "tiny girl(note: age 18, NOT a figure) walking on giant girl's thigh"
    });
    expect(goodReport.issues).toEqual([]);
    expect(goodReport.passed).toBe(true);
  });

  it("does not let an opening output-language directive override Chinese dialogue language lock", async () => {
    const { extractH3DialogueLocks } = await import("../src/core/h3-dialogue.js");
    const locks = extractH3DialogueLocks("用英文。靠近镜头的男子把球杆靠在桌边，转头问花衬衣男子“你拿走了吗？”");
    expect(locks).toHaveLength(1);
    expect(locks[0]?.language).toBe("Chinese");
    expect(locks[0]?.text).toBe("你拿走了吗？");
  });

  it("highlights unbracketed timestamps, unnumbered continuations, R2V tags and dialogue in Rich Prompt HTML", async () => {
    const { renderRichPromptHtml } = await import("../src/renderer/pages/create/rich-prompt.js");
    const sample = [
      "subject_definitions:",
      "<Subject 1>: adult woman in blue coat. <Audio 1>: soft coastal wind.",
      "integrated_multimodal_description:",
      "[Shot 1] Continuation of the preceding segment. 0–2.5s: she glances over her shoulder as 00:02.50 – 00:05.00. passes smoothly, saying (S1) <d>[Chinese] 走吧</d>.",
      "overall_soundscape:",
      "Gentle surf.",
      "non_diegetic_music:",
      "N/A"
    ].join("\n");
    const html = renderRichPromptHtml(sample);
    expect(html).toContain('<span class="create-rich-section">subject_definitions:</span>');
    expect(html).toContain('<span class="create-rich-ref">&lt;Subject 1&gt;</span>');
    expect(html).toContain('<span class="create-rich-ref">&lt;Audio 1&gt;</span>');
    expect(html).toContain('<span class="create-rich-continuity">Continuation of the preceding segment.</span>');
    expect(html).toContain('<span class="create-rich-time">[Shot 1]</span>');
    expect(html).toContain('<span class="create-rich-time">00:02.50 – 00:05.00.</span>');
    expect(html).toContain('<span class="create-rich-say">(S1)</span>');
    expect(html).toContain('<span class="create-rich-say">&lt;d&gt;[Chinese] 走吧&lt;/d&gt;</span>');
  });
});
