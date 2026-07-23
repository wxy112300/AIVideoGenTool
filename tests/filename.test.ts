import { describe, expect, it } from "vitest";
import { compactPrompt, createOutputFilename } from "../src/core/filename";

describe("output filename", () => {
  it("removes Windows-invalid characters and limits the summary", () => {
    expect(compactPrompt('人物:"看向"/镜头？动作自然流畅而且连续')).toBe(
      "人物-看向-镜头-动作自然流畅而"
    );
  });

  it("adds a sequence number for same-second collisions", () => {
    const date = new Date(2026, 6, 24, 14, 32, 5);
    const first = createOutputFilename("sulphur2", "人物看向镜头", [], date);
    const second = createOutputFilename("sulphur2", "人物看向镜头", [first], date);
    expect(second).toBe("SUL2-人物看向镜头-20260724-143205-02.mp4");
  });
});
