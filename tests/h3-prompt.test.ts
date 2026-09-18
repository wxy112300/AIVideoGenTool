import { describe, expect, it } from "vitest";
import {
  auditH3PromptControlOutput,
  assertDetailedCinematicExpansion,
  buildH3PromptControlPlan,
  h3DetailedExpansionGateInstruction,
  h3DetailedExpansionTargetWords,
  h3DurationPlan,
  h3ExplicitConstraintSummary,
  h3PromptControlInstruction,
  h3PromptPriorityInstruction,
  h3PromptExpansionTokenBudget,
  h3ShotPolicyForPrompt,
  normalizeH3PromptOutput
} from "../src/core/h3-prompt.js";
import { h3PromptPresetTextForRequest } from "../src/core/h3-prompt-presets.js";
import { promptSnippetFor } from "../src/core/prompts/index.js";

describe("MiniMax H3 prompt templates", () => {
  it("selects only the control modules required by the request", () => {
    const plan = buildH3PromptControlPlan({
      rawPrompt: "A tiny woman walks from the cup to the plate while a second person responds. The low-angle camera rotates around her exactly 180 degrees. She says in Japanese: \"大丈夫？\". The sign reads \"EXIT\".（注：保留原始动作）",
      mode: "FL2VA",
      preset: "detailed-cinematic",
      referenceContext: "Picture 1 = the opening reference image",
      hasReferenceMedia: true
    });

    expect(plan.modules).toEqual(expect.arrayContaining([
      "intent-lock",
      "reference-delta",
      "camera-route",
      "exact-rotation",
      "micro-scale",
      "action-mechanics",
      "human-motion-integrity",
      "subject-reaction",
      "speech-gate",
      "sound-causality",
      "shot-continuity",
      "endpoint-transition"
    ]));
    expect(plan.annotationCount).toBe(1);
    expect(plan.sourcePrompt).not.toContain("注：");

    const instruction = h3PromptControlInstruction({
      rawPrompt: "A woman walks toward the camera and says in Japanese: \"大丈夫？\".",
      mode: "I2VA",
      preset: "detailed-cinematic",
      hasReferenceMedia: true
    });
    expect(instruction).toContain("LOCKED user request");
    expect(instruction).toContain("Source-fidelity gate");
    expect(instruction).toContain("PRESERVE, CHANGE, or INFER");
    expect(instruction).toContain("user's original prompt is authoritative");
    expect(instruction).toContain("reference media is authoritative for supported visible facts");
    expect(instruction).toContain("never summarize, substitute, reassign, reverse, or omit it");
    expect(instruction).toContain("Camera-route module");
    expect(instruction).toContain("Speech-gate module");
    expect(instruction).toContain("one continuous [Shot 1]");
    expect(instruction).toContain("editorial cut");
    expect(instruction).toContain("Detailed-expansion coverage");
    expect(instruction).toContain("Human-motion integrity module");
    expect(instruction).toContain("never a concise rewrite");
    expect(instruction).toContain("at least two applicable grounded execution details");
    expect(instruction).toContain("request-specific minimum and target");
    expect(instruction).not.toContain("180-320 grounded English words");
    expect(instruction.length).toBeLessThan(4000);
  });

  it("keeps FL2VA and R2V entity ownership distinct", () => {
    const fl2va = h3PromptControlInstruction({
      rawPrompt: "The giant reaches toward the tiny person.",
      mode: "FL2VA",
      hasReferenceMedia: true
    });
    expect(fl2va).toContain("Reference understanding");
    expect(fl2va).toContain("Source-fidelity gate");
    expect(fl2va).toContain("which visible subject each user-named role refers to");
    expect(fl2va).toContain("user's role and action assignments as authoritative");
    expect(fl2va).toContain("retain the user's labels and requested role-action mapping");
    expect(fl2va).toContain("FL2VA subject-correspondence module");
    expect(fl2va).toContain("not screen position or apparent frame size");
    expect(fl2va).toContain("clothing ownership");
    expect(fl2va).toContain("with their original subjects");

    const r2v = h3PromptControlInstruction({
      rawPrompt: "Use the two referenced characters in one scene.",
      mode: "R2V",
      hasReferenceMedia: true
    });
    expect(r2v).toContain("R2V entity-role module");
    expect(r2v).toContain("every source asset one explicit job");
    expect(r2v).toContain("originating subjects");
  });

  it("does not classify ordinary appearance wording as subject interaction", () => {
    const plan = buildH3PromptControlPlan({
      rawPrompt: "A woman with red hair walks through a bright room.",
      mode: "T2VA"
    });

    expect(plan.hasInteraction).toBe(false);
    expect(plan.modules).not.toContain("subject-reaction");
  });

  it("audits the generated prompt against the same locks used for repair", () => {
    const plan = buildH3PromptControlPlan({
      rawPrompt: "One continuous low-angle camera rotates around the tiny human 180 degrees.",
      mode: "T2VA"
    });
    const audit = auditH3PromptControlOutput(
      plan,
      "integrated_multimodal_description: [Shot 1] The camera completes a 360-degree orbit. [Shot 2] It cuts closer."
    );

    expect(audit.passed).toBe(false);
    expect(audit.missing).toEqual(expect.arrayContaining(["camera-control", "single-shot"]));
  });

  it("treats the one-take shortcut as a hard single-shot request", () => {
    const shortcut = promptSnippetFor("camera-continuous-take");

    expect(h3ShotPolicyForPrompt(shortcut)).toBe("hard-single");
    expect(h3PromptPriorityInstruction(h3ShotPolicyForPrompt(shortcut))).toContain("one continuous [Shot 1]");
  });

  it("audits and repairs editorial cuts hidden inside a single Shot 1", () => {
    const source = "A woman walks across the room while the camera follows her.";
    const output = [
      "integrated_multimodal_description: [Shot 1] The camera follows her, then cuts to a close-up of her face.",
      "overall_soundscape: N/A",
      "non_diegetic_music: N/A"
    ].join("\n");
    const plan = buildH3PromptControlPlan({ rawPrompt: source, mode: "T2VA" });
    const audit = auditH3PromptControlOutput(plan, output);

    expect(audit.missing).toContain("single-shot");
    const normalized = normalizeH3PromptOutput(output, "T2VA", 5, [], [], source, source);
    expect(normalized).not.toContain("cuts to");
    expect(normalized).toContain("continuously reframes toward");
  });

  it("repairs compiler-owned camera and scale locks without inventing a new beat", () => {
    const source = "One continuous low-angle camera rotates around the tiny human 180 degrees.";
    const normalized = normalizeH3PromptOutput(
      "integrated_multimodal_description: [Shot 1] The camera completes a 360-degree orbit around the tiny human.",
      "T2VA",
      5,
      [],
      [],
      source,
      source
    );

    expect(normalized).toContain("180 degrees");
    expect(normalized).not.toContain("360-degree");
    expect(normalized).toContain("Scale relation:");
    expect(normalized).not.toMatch(/source-age|adult|child|baby|toy|doll/iu);
    expect(normalized).not.toContain("[Shot 2]");
  });

  it("plans a long H3 clip across the full effective duration", () => {
    const plan = h3DurationPlan("FL2VA", 15);

    expect(plan).toContain("effective H3 duration is 15.08 seconds");
    expect(plan).toContain("Plan 6 sequential development beats");
    expect(plan).toContain("final beat must settle at 15.08 seconds");
    expect(plan).toContain("Connect the first-frame state to the last-frame state");
    expect(plan).toContain("distance, scale, pace, acceleration");
    expect(plan).toContain("A walk or run from A to B must have enough continuous time");
  });

  it("uses action-led free timing for the detailed cinematic preset", () => {
    const plan = h3DurationPlan("FL2VA", 15, "detailed-cinematic");

    expect(plan).toContain("flexible causal timeline");
    expect(plan).toContain("a fixed beat count or equal-time grid");
    expect(plan).toContain("do not force events to standard fractions or fixed timestamps");
    expect(plan).toContain("Picture 1 at the required first-frame anchor");
    expect(plan).not.toContain("Plan 6 sequential development beats");
    expect(plan).not.toContain("0.00-2.51s");
  });

  it("keeps extra output headroom for long and reference-led prompts", () => {
    expect(h3PromptExpansionTokenBudget("T2VA")).toBe(1280);
    expect(h3PromptExpansionTokenBudget("R2V")).toBe(1792);
    expect(h3PromptExpansionTokenBudget("FL2VA", 15)).toBe(1920);
  });

  it("gives the detailed cinematic preset extra local output headroom", () => {
    expect(h3PromptExpansionTokenBudget("T2VA", 5, "detailed-cinematic")).toBe(2048);
    expect(h3PromptExpansionTokenBudget("R2V", 5, "detailed-cinematic")).toBe(2304);
    expect(h3PromptExpansionTokenBudget("FL2VA", 15, "detailed-cinematic")).toBe(2880);
  });

  it("targets about twice the standard coverage without weakening the acceptance floor", () => {
    expect(h3DetailedExpansionTargetWords("I2VA", 5)).toBe(500);
    expect(h3DetailedExpansionTargetWords("FL2VA", 15)).toBe(900);
    expect(h3DetailedExpansionTargetWords("R2V", 5)).toBe(700);
    expect(h3DetailedExpansionGateInstruction("FL2VA", 15)).toContain("approximately 900 grounded words");
    expect(h3DetailedExpansionGateInstruction("FL2VA", 15)).toContain("fewer than 450 grounded words");
  });

  it("removes the obsolete short range from persisted copies of the old built-in preset", () => {
    const legacy = [
      "Keep every original action.",
      "For a simple approximately five-second Base-mode request, normally develop the integrated timeline to roughly 180-320 grounded English words; for R2V, use roughly 350-500 grounded English words in detailed_description as the starting range. Scale upward for a longer duration. These are coverage floors and planning ranges, not padding targets or hard maxima: if the user's source is already detailed, preserve all of it."
    ].join("\n");
    const normalized = h3PromptPresetTextForRequest("detailed-cinematic", legacy);

    expect(normalized).toContain("Keep every original action.");
    expect(normalized).toContain("if the user's source is already detailed");
    expect(normalized).not.toContain("180-320");
    expect(normalized).not.toContain("350-500");
  });

  it("extracts explicit audio and single-shot constraints from the user request", () => {
    const constraints = h3ExplicitConstraintSummary(
      "One shot, no cuts. A runner goes from A to B. No BGM, but keep footsteps."
    );

    expect(constraints).toContain("non-diegetic background music");
    expect(constraints).toContain("non_diegetic_music to N/A");
    expect(constraints).toContain("exactly one [Shot 1]");
    expect(constraints).not.toContain("completely silent");
  });

  it("keeps the compact priority rule and distinguishes shot policies", () => {
    expect(h3ShotPolicyForPrompt("Low Angle tracking shot follows the girl.")).toBe("default-single");
    expect(h3ShotPolicyForPrompt("[Shot 1] only: the camera follows the girl.")).toBe("hard-single");
    expect(h3ShotPolicyForPrompt("Two shots: the camera cuts to a close-up.")).toBe("allow-multiple");
    expect(h3PromptPriorityInstruction("default-single")).toContain("explicit request and labeled notes first");
    expect(h3PromptPriorityInstruction("default-single")).toContain("one continuous [Shot 1]");
    expect(h3ShotPolicyForPrompt("[Shot 1] A woman walks forward.")).toBe("default-single");
    expect(h3ShotPolicyForPrompt("")).toBe("default-single");
  });

  it("gives detailed expansion a source-fidelity gate before compression", () => {
    const instruction = h3PromptControlInstruction({
      rawPrompt: "A woman opens the gate, runs across the yard, then turns back toward the camera.",
      mode: "T2VA",
      preset: "detailed-cinematic"
    });

    expect(instruction).toContain("user's original prompt is authoritative");
    expect(instruction).toContain("role-action ownership");
    expect(instruction).toContain("Keep every user-required item explicit and in order");
    expect(instruction).toContain("never summarize, substitute, reassign, reverse, or omit it");
    expect(instruction).toContain("this preset is an expansion, never a concise rewrite");
    expect(instruction).toContain("shorten static reference inventory and assistant-added filler first");
  });

  it("treats complete silence separately from no background music", () => {
    const constraints = h3ExplicitConstraintSummary("完全静音，不要字幕。");

    expect(constraints).toContain("set overall_soundscape and non_diegetic_music to N/A");
    expect(constraints).toContain("do not add dialogue, singing, music, ambience, or sound effects");
    expect(constraints).toContain("do not add subtitles, captions");
  });

  it("normalizes model output to the requested H3 alignment mode", () => {
    const i2vaInstruction = "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.";
    const fl2vaInstruction = "How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the 5.17-second mark of the target video.";
    const body = "integrated_multimodal_description: [Shot 1] The subject moves.";

    expect(normalizeH3PromptOutput(`${i2vaInstruction}\n\n${body}`, "T2VA", 5)).toBe(body);
    expect(normalizeH3PromptOutput(`${i2vaInstruction}\n\n${body}`, "FL2VA", 5)).toBe(`${fl2vaInstruction}\n\n${body}`);
    expect(normalizeH3PromptOutput(body, "I2VA", 5)).toBe(`${i2vaInstruction}\n\n${body}`);
    expect(normalizeH3PromptOutput(
      `${i2vaInstruction}\n\n${body}`,
      "I2VA",
      5,
      [],
      [],
      "",
      "",
      true
    )).toBe(body);
  });

  it("locks native Continuum output to the running shot and repairs implicit viewpoint resets", () => {
    const output = [
      "integrated_multimodal_description: [Shot 1] The view suddenly shifts to a new angle. A new camera angle reveals the subject walking onward.",
      "overall_soundscape: Footsteps continue.",
      "non_diegetic_music: N/A"
    ].join("\n\n");

    const normalized = normalizeH3PromptOutput(
      output,
      "T2VA",
      5,
      [],
      [],
      "The subject walks onward.",
      "",
      true,
      true
    );

    expect(normalized).toMatch(/^Continuation of the preceding segment\./u);
    expect(normalized).toContain("subject walking onward");
    expect(normalized).not.toContain("At the first generated moment, each established subject");
    expect(normalized).not.toMatch(/new (?:camera )?angle|view suddenly shifts/iu);
    expect(normalized).not.toContain("For the target video, at 0.00 seconds");
  });

  it("keeps an explicitly requested multi-shot Continuum timeline unlocked", () => {
    const output = "integrated_multimodal_description: [Shot 1] The subject walks. [Shot 2] Cut to the doorway.";
    const normalized = normalizeH3PromptOutput(
      output,
      "T2VA",
      5,
      [],
      [],
      "Use two different shots, then cut to the doorway.",
      "",
      true,
      true
    );

    expect(normalized).toContain("[Shot 2]");
    expect(normalized).not.toContain("one continuous unbroken take continues directly");
  });

  it("adds the numbered Skill handoff without rewriting the authored body", () => {
    const output = [
      "integrated_multimodal_description: [Shot 1] This is the uninterrupted continuation of the currently running shot. The subject keeps walking.",
      "overall_soundscape: Footsteps continue.",
      "non_diegetic_music: N/A"
    ].join("\n\n");

    const normalized = normalizeH3PromptOutput(
      output,
      "T2VA",
      5,
      [],
      [],
      "The subject keeps walking.",
      "",
      true,
      true,
      2
    );

    expect(normalized).toBe(`Continuation of Chunk 2.\n${output}`);
    expect(() => normalizeH3PromptOutput("[Chunk 1]\nold\n[Chunk 2]\nnew", "T2VA", 5, [], [], "", "", true, true))
      .toThrow("当前 Chunk body");
  });

  it("rejects a native Continuum result without the official main timeline", () => {
    expect(() => normalizeH3PromptOutput(
      "The subject continues walking in the same scene.",
      "T2VA",
      5,
      [],
      [],
      "The subject continues walking.",
      "",
      true,
      true
    )).toThrow("无法确认单镜头接续");
  });

  it("removes tagged and untagged reasoning before the first H3 output field", () => {
    const body = [
      "integrated_multimodal_description: [Shot 1] 人物缓慢转身。",
      "overall_soundscape: 安静的室内环境声。",
      "non_diegetic_music: N/A"
    ].join("\n\n");

    expect(normalizeH3PromptOutput(
      `Looking at this request, I need to map out six beats across 13.67 seconds.\n\n${body}`,
      "T2VA",
      13.67
    )).toBe(body);
    expect(normalizeH3PromptOutput(
      `<analysis>internal plan</analysis>\n${body}`,
      "T2VA",
      13.67
    )).toBe(body);
  });

  it("unwraps JSON and Markdown envelopes from H3 model output", () => {
    const json = JSON.stringify({
      prompt: {
        integrated_multimodal_description: "[Shot 1] The subject continues forward.",
        overall_soundscape: "Footsteps remain synchronized.",
        non_diegetic_music: "N/A"
      }
    });
    expect(normalizeH3PromptOutput(json, "T2VA", 5)).toBe([
      "integrated_multimodal_description: [Shot 1] The subject continues forward.",
      "overall_soundscape: Footsteps remain synchronized.",
      "non_diegetic_music: N/A"
    ].join("\n\n"));

    const markdown = [
      "```markdown",
      "### **integrated_multimodal_description:** [Shot 1] The subject continues forward.",
      "**overall_soundscape:** Footsteps remain synchronized.",
      "**non_diegetic_music:** N/A",
      "```"
    ].join("\n");
    const normalized = normalizeH3PromptOutput(markdown, "T2VA", 5);
    expect(normalized).not.toContain("```");
    expect(normalized).not.toContain("**");
    expect(normalized).not.toContain("###");
    expect(normalized).toContain("integrated_multimodal_description: [Shot 1]");
  });

  it("rejects a shortened detailed-cinematic result before it becomes a version", () => {
    const source = "The giant lifts the tiny person, then carries them toward the window while the camera tracks alongside.";
    expect(h3DetailedExpansionGateInstruction("I2VA", 5, source)).toContain("approximately 500 grounded words");
    expect(h3DetailedExpansionGateInstruction("I2VA", 5, source)).toContain("fewer than 250 grounded words");
    expect(() => assertDetailedCinematicExpansion(
      "integrated_multimodal_description: [Shot 1] The giant lifts the tiny person.\noverall_soundscape: N/A\nnon_diegetic_music: N/A",
      "I2VA",
      5,
      source
    )).toThrow("原提示词已保持不变");

    const detailedTimeline = `${source} ${Array.from({ length: 250 }, (_, index) => `detail${index + 1}`).join(" ")}`;
    expect(() => assertDetailedCinematicExpansion(
      `integrated_multimodal_description: [Shot 1] ${detailedTimeline}\noverall_soundscape: N/A\nnon_diegetic_music: N/A`,
      "I2VA",
      5,
      source
    )).not.toThrow();

    const unrelatedTimeline = Array.from({ length: 260 }, (_, index) => `unrelated${index + 1}`).join(" ");
    expect(() => assertDetailedCinematicExpansion(
      `integrated_multimodal_description: [Shot 1] ${unrelatedTimeline}\noverall_soundscape: N/A\nnon_diegetic_music: N/A`,
      "I2VA",
      5,
      source
    )).toThrow("遗漏了过多原始提示词要点");
  });

  it("removes labeled annotation echoes from the generated H3 output", () => {
    const output = [
      "integrated_multimodal_description: [Shot 1] The subject moves（Note: this must not appear in the final prompt）.",
      "overall_soundscape: N/A",
      "non_diegetic_music: N/A"
    ].join("\n\n");

    expect(normalizeH3PromptOutput(output, "T2VA", 5)).toContain(
      "The subject moves."
    );
    expect(normalizeH3PromptOutput(output, "T2VA", 5)).not.toContain("Note:");
  });

  it("folds an invented second shot back into the continuous H3 shot", () => {
    const source = "Low Angle tracking shot follows the girl. [Shot 1] only.";
    const output = [
      "integrated_multimodal_description: [Shot 1] The low-angle tracking camera follows the girl.",
      "[Shot 2] At 00:03.000, the camera cuts to a close-up of her face.",
      "overall_soundscape: N/A",
      "non_diegetic_music: N/A"
    ].join("\n");

    const normalized = normalizeH3PromptOutput(output, "T2VA", 5, [], [], source, source);
    expect(normalized).not.toContain("[Shot 2]");
    expect(normalized).toContain("within the same continuous shot");
    expect(normalized).not.toContain("camera cuts to");
    expect(normalized).toContain("overall_soundscape: N/A");
  });

  it("preserves multiple shots when the source explicitly asks for them", () => {
    const source = "Two shots: the camera cuts from the room to a close-up.";
    const output = "integrated_multimodal_description: [Shot 1] The room is quiet. [Shot 2] At 00:03.000, cut to a close-up.\noverall_soundscape: N/A\nnon_diegetic_music: N/A";

    expect(normalizeH3PromptOutput(output, "T2VA", 5, [], [], source, source)).toContain("[Shot 2]");
  });

  it("folds an unrequested R2V second shot into the default continuous take", () => {
    const source = "<Subject 1> walks through the room.";
    const output = "detailed_description: [Shot 1] <Subject 1> walks. [Shot 2] At 00:03.000, the camera cuts closer.\noverall_soundscape: N/A\nnon_diegetic_music: N/A";

    const normalized = normalizeH3PromptOutput(output, "R2V", 5, [], [], source, source);
    expect(normalized).not.toContain("[Shot 2]");
    expect(normalized).toContain("within the same continuous shot");
  });

});
