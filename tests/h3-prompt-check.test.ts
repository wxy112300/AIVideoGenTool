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
});