import { describe, expect, it } from "vitest";
import {
  h3DurationPlan,
  h3ExplicitConstraintSummary,
  h3PromptExpansionTokenBudget,
  normalizeH3PromptOutput
} from "../src/core/h3-prompt.js";

describe("MiniMax H3 prompt templates", () => {
  it("plans a long H3 clip across the full effective duration", () => {
    const plan = h3DurationPlan("FL2VA", 15);

    expect(plan).toContain("effective H3 duration is 15.08 seconds");
    expect(plan).toContain("Plan 6 sequential development beats");
    expect(plan).toContain("final beat must settle at 15.08 seconds");
    expect(plan).toContain("Connect the first-frame state to the last-frame state");
    expect(plan).toContain("distance, scale, pace, acceleration");
    expect(plan).toContain("A walk or run from A to B must have enough continuous time");
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

});
