import { describe, expect, it } from "vitest";
import {
  createH3PromptFromBuilder,
  createH3PromptTemplate,
  h3DurationPlan,
  h3ExplicitConstraintSummary,
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

  it("creates the official T2VA structure without an image-alignment instruction", () => {
    const template = createH3PromptTemplate("A baker opens the shop before sunrise", 5, {
      mode: "T2VA",
      hasStartImage: false,
      hasEndImage: false
    });

    expect(template.mode).toBe("T2VA");
    expect(template.text.startsWith("integrated_multimodal_description:")).toBe(true);
    expect(template.text).not.toContain("Picture 1");
  });

  it("creates the official L2VA structure with the reference on the final frame", () => {
    const template = createH3PromptTemplate("A glass gradually falls and settles broken", 5, {
      mode: "L2VA",
      hasStartImage: false,
      hasEndImage: true
    });

    expect(template.mode).toBe("L2VA");
    expect(template.text).toContain(
      "<Picture 1> (from [Shot 1]) aligns with the 5.17-second mark"
    );
    expect(template.text).toContain("Treat <Picture 1> as the final frame");
  });

  it("creates the official I2VA structure for a single reference image", () => {
    const template = createH3PromptTemplate("一位女性看向镜头", 5);

    expect(template.mode).toBe("I2VA");
    expect(template.shotCount).toBe(1);
    expect(template.text).toContain(
      "For the target video, at 0.00 seconds into the target video"
    );
    expect(template.text).toContain("integrated_multimodal_description:");
    expect(template.text).toContain("overall_soundscape:");
    expect(template.text).toContain("non_diegetic_music: N/A");
    expect(template.text).toContain("<d>[Chinese] ...</d>");
    expect(template.text).not.toContain("Picture 2");
  });

  it("creates a single-shot FL2VA alignment using the aligned H3 duration", () => {
    const template = createH3PromptTemplate("人物从左向右走", 5, {
      hasEndImage: true
    });

    expect(template.mode).toBe("FL2VA");
    expect(template.effectiveDurationSeconds).toBeCloseTo(124 / 24);
    expect(template.text).toContain(
      "Picture 2 (from Shot 1) aligns with the 5.17-second mark"
    );
    expect(template.text).toContain("exact final composition in <Picture 2>");
    expect(template.text).not.toContain("[Shot 2]");
  });

  it("creates the six-section R2V structure with Subject definitions", () => {
    const template = createH3PromptTemplate("人物在场景中行走", 5, {
      mode: "R2V",
      referenceSlots: [
        { role: "人物 / 主体", note: "角色外貌" },
        { role: "场景 / 环境", note: "街道布局" }
      ]
    });

    expect(template.mode).toBe("R2V");
    expect(template.text).toContain("subject_definitions:");
    expect(template.text).toContain("<Subject 1> is reusable 人物 / 主体 content derived from <Picture 1>: 角色外貌.");
    expect(template.text).toContain("<Subject 2> is reusable 场景 / 环境 content derived from <Picture 2>: 街道布局.");
    expect(template.text).toContain("retention_analysis:");
    expect(template.text).toContain("detailed_description:");
    expect(template.text).not.toContain("integrated_multimodal_description:");
  });

  it("turns camera, continuity, dialogue, and screen text decisions into H3 structure", () => {
    const template = createH3PromptFromBuilder({
      style: "Live-action, cinematic.",
      subject: "A cyclist waits at a rainy intersection.",
      action: "A light breath precedes the cyclist's slow turn toward the crossing signal.",
      continuity: "Preserve the red rain jacket, bicycle position, wet street reflections, and dusk lighting.",
      physicalLock: "The hands remain on the handlebars and the gaze follows the signal.",
      cameraMotion: "pull-out",
      cameraAmplitude: "large",
      cameraSpeed: "slow",
      framing: "The frame progresses from a close portrait to a wide view of the intersection.",
      diegeticSound: "Rain taps the jacket and the bicycle chain responds to the movement.",
      finalState: "The cyclist settles at the curb as the signal changes and the rain continues.",
      soundscape: "Steady rain, distant traffic, and wet tire noise.",
      music: "N/A",
      dialogueSpeaker: "S1",
      dialogueLanguage: "English",
      dialogueDelivery: "a quiet, natural voice",
      dialogueText: "Wait for the light.",
      onScreenText: "WALK"
    }, 5);

    expect(template.text).toContain("Preserve the red rain jacket");
    expect(template.text).toContain("large amplitude at slow speed");
    expect(template.text).toContain("<d>[English] Wait for the light.</d>");
    expect(template.text).toContain('reads exactly "WALK"');
    expect(template.text).toContain("The cyclist settles at the curb");
  });

  it("uses the same builder decisions in the R2V six-section structure", () => {
    const template = createH3PromptFromBuilder({
      style: "3D CG.",
      subject: "A robot stands in a workshop.",
      action: "The robot raises one hand.",
      continuity: "Preserve the robot's color and panel layout.",
      physicalLock: "Keep the torso facing forward.",
      cameraMotion: "static",
      cameraAmplitude: "small",
      cameraSpeed: "slow",
      framing: "Hold a medium shot.",
      diegeticSound: "Servo motors click softly.",
      finalState: "The hand remains raised.",
      soundscape: "Quiet workshop hum.",
      music: "N/A",
      dialogueSpeaker: "S1",
      dialogueLanguage: "Chinese",
      dialogueDelivery: "a calm voice",
      dialogueText: "",
      onScreenText: ""
    }, 5, { mode: "R2V", referenceSlots: [{ role: "人物 / 主体" }] });

    expect(template.text).toContain("subject_definitions:");
    expect(template.text).toContain("detailed_description:");
    expect(template.text).toContain("<Subject 1> is reusable 人物 / 主体 content derived from <Picture 1>");
    expect(template.text).toContain("The camera holds a static shot.");
  });

  it("numbers mixed R2V Picture and Video references independently", () => {
    const template = createH3PromptTemplate("人物与视频中的动作保持一致", 5, {
      mode: "R2V",
      referenceSlots: [
        { mediaType: "image", role: "人物 / 主体" },
        { mediaType: "video", role: "动作 / 姿态" },
        { mediaType: "image", role: "场景 / 环境" },
        { mediaType: "video", role: "镜头 / 构图" }
      ]
    });

    expect(template.text).toContain("<Subject 1> is reusable 人物 / 主体 content derived from <Picture 1>");
    expect(template.text).toContain("<Subject 2> is reusable 动作 / 姿态 content derived from <Video 1>");
    expect(template.text).toContain("<Subject 3> is reusable 场景 / 环境 content derived from <Picture 2>");
    expect(template.text).toContain("<Subject 4> is reusable 镜头 / 构图 content derived from <Video 2>");
  });
});
