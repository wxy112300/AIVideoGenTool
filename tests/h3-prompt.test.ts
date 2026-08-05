import { describe, expect, it } from "vitest";
import { createH3PromptTemplate } from "../src/core/h3-prompt.js";

describe("MiniMax H3 prompt templates", () => {
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
});
