import { describe, expect, it } from "vitest";
import {
  auditH3PromptControlOutput,
  buildH3PromptControlPlan,
  h3DurationPlan,
  h3ExplicitConstraintSummary,
  h3PromptControlInstruction,
  h3PromptPriorityInstruction,
  h3PromptExpansionTokenBudget,
  h3ShotPolicyForPrompt,
  normalizeH3PromptOutput
} from "../src/core/h3-prompt.js";

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
    expect(instruction).toContain("PRESERVE, CHANGE, or INFER");
    expect(instruction).toContain("Camera-route module");
    expect(instruction).toContain("Speech-gate module");
    expect(instruction).toContain("Detailed-expansion budget");
    expect(instruction.length).toBeLessThan(2600);
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
    expect(normalized).toContain("Scale continuity:");
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
    expect(h3PromptExpansionTokenBudget("T2VA", 5, "detailed-cinematic")).toBe(1792);
    expect(h3PromptExpansionTokenBudget("R2V", 5, "detailed-cinematic")).toBe(2304);
    expect(h3PromptExpansionTokenBudget("FL2VA", 15, "detailed-cinematic")).toBe(2880);
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
    expect(h3PromptPriorityInstruction("default-single")).toContain("exactly one continuous [Shot 1]");
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

});
