import { describe, expect, it } from "vitest";
import { checkH3Prompt } from "../src/core/h3-prompt-check.js";

const i2vaPrompt = [
  "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.",
  "",
  "integrated_multimodal_description: [Shot 1] Live-action. The camera pushes in.",
  "overall_soundscape: Quiet room tone.",
  "non_diegetic_music: N/A"
].join("\n");

describe("MiniMax H3 prompt checks", () => {
  it("accepts T2VA without an image-alignment instruction", () => {
    const result = checkH3Prompt([
      "integrated_multimodal_description: [Shot 1] Live-action, a baker opens the shop.",
      "overall_soundscape: Wooden shutters scrape open.",
      "non_diegetic_music: N/A"
    ].join("\n"), { mode: "T2VA" });

    expect(result).toMatchObject({ mode: "T2VA", valid: true, items: [] });
  });

  it("accepts L2VA when the final-frame instruction is first", () => {
    const result = checkH3Prompt([
      "How the reference pictures align with the target video — <Picture 1> (from [Shot 1]) aligns with the 5.17-second mark of the target video.",
      "",
      "integrated_multimodal_description: [Shot 1] The glass falls and settles into the exact final arrangement in <Picture 1>.",
      "overall_soundscape: Glass scrapes and breaks on the floor.",
      "non_diegetic_music: N/A"
    ].join("\n"), { mode: "L2VA" });

    expect(result).toMatchObject({ mode: "L2VA", valid: true, items: [] });
  });

  it("warns when official timing and audio sentence limits are violated", () => {
    const result = checkH3Prompt([
      "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.",
      "integrated_multimodal_description: [Shot 1] At 00:01.000, the subject moves. [Shot 2] At 00:02.000, the camera cuts.",
      "overall_soundscape: One. Two. Three. Four. Five.",
      "non_diegetic_music: One. Two. Three. Four."
    ].join("\n"));

    const messages = result.items.map((item) => item.message).join("\n");
    expect(messages).toContain("Shot 1");
    expect(messages).toContain("overall_soundscape");
    expect(messages).toContain("non_diegetic_music");
  });

  it("accepts a complete I2VA structure", () => {
    expect(checkH3Prompt(i2vaPrompt)).toMatchObject({
      mode: "I2VA",
      valid: true,
      items: []
    });
  });

  it("reports FL2VA alignment and dialogue issues without blocking", () => {
    const result = checkH3Prompt(
      "integrated_multimodal_description: [Shot 1] A person says <d>[Chinese] 你好。</d>\noverall_soundscape: dialogue continues\nnon_diegetic_music: N/A",
      { hasEndImage: true }
    );

    expect(result.valid).toBe(false);
    expect(result.items.map((item) => item.message).join("\n")).toContain("FL2VA");
    expect(result.items.map((item) => item.message).join("\n")).toContain("说话人 ID");
    expect(result.items.map((item) => item.message).join("\n")).toContain("overall_soundscape");
  });

  it("requires timestamps for later shots", () => {
    const result = checkH3Prompt(`${i2vaPrompt}\n[Shot 2] The camera cuts to a close-up.`);

    expect(result.items.map((item) => item.message).join("\n")).toContain("时间戳");
  });

  it("rejects non-increasing timestamps for later shots", () => {
    const result = checkH3Prompt([
      "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.",
      "integrated_multimodal_description: [Shot 1] The action begins. [Shot 2] At 00:05.000, the camera cuts. [Shot 3] At 00:03.000, the camera cuts again.",
      "overall_soundscape: Quiet room tone.",
      "non_diegetic_music: N/A"
    ].join("\n"));

    expect(result.items.map((item) => item.message).join("\n")).toContain("递增");
  });

  it("warns when the main timeline has no first shot declaration", () => {
    const result = checkH3Prompt([
      "For the target video, at 0.00 seconds into the target video, <Picture 1> is fully referenced.",
      "integrated_multimodal_description: The subject moves naturally.",
      "overall_soundscape: Quiet room tone.",
      "non_diegetic_music: N/A"
    ].join("\n"));

    expect(result.items.map((item) => item.message).join("\n")).toContain("[Shot 1]");
  });

  it("accepts the R2V six-section structure", () => {
    const result = checkH3Prompt([
      "subject_definitions:",
      "<Picture 1> is the subject reference.",
      "summary:",
      "[reference generation] The target video uses <Picture 1>.",
      "retention_analysis:",
      "<Picture 1>: fully_preserved - preserve the subject.",
      "detailed_description:",
      "[Shot 1] The subject moves naturally.",
      "overall_soundscape: Quiet room tone.",
      "non_diegetic_music: N/A"
    ].join("\n"), { mode: "R2V" });

    expect(result).toMatchObject({ mode: "R2V", valid: true, items: [] });
  });

  it("warns when a video reference is not named in the R2V prompt", () => {
    const result = checkH3Prompt([
      "subject_definitions:",
      "<Picture 1> is the subject reference.",
      "summary:",
      "The reference image guides the subject.",
      "retention_analysis:",
      "Preserve the subject.",
      "detailed_description:",
      "[Shot 1] The subject moves.",
      "overall_soundscape: Quiet room tone.",
      "non_diegetic_music: N/A"
    ].join("\n"), { mode: "R2V", hasVideoReference: true });

    expect(result.items.map((item) => item.message).join("\n")).toContain("<Video 1>");
  });

  it("accepts a video-only R2V reference set without requiring Picture 1", () => {
    const result = checkH3Prompt([
      "subject_definitions:",
      "<Subject 1> is reusable motion content derived from <Video 1>.",
      "summary:",
      "[reference generation] Use the reference video for movement.",
      "retention_analysis:",
      "<Subject 1>: attribute_transfer - transfer the motion from <Video 1>.",
      "detailed_description:",
      "[Shot 1] The subject follows the reference motion.",
      "overall_soundscape: Natural ambient sound.",
      "non_diegetic_music: N/A"
    ].join("\n"), { mode: "R2V", hasImageReference: false, hasVideoReference: true });

    expect(result.valid).toBe(true);
  });
});