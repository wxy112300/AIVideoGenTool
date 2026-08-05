import { describe, expect, it } from "vitest";
import { compactPrompt, createOutputFilename } from "../src/core/filename";

describe("output filename", () => {
  it("removes Windows-invalid characters and limits the summary", () => {
    expect(compactPrompt('人物:"看向"/镜头？动作自然流畅而且连续')).toBe(
      "人物-看向-镜头-动作自然流畅而"
    );
  });

  it("uses model metadata instead of prompt text", () => {
    const date = new Date(2026, 6, 24, 14, 32, 5);
    const first = createOutputFilename("sulphur2", 480, 5, [], date);
    expect(first).toBe("SUL2-480p-5s-20260724-143205-v01.mp4");
    expect(first).not.toContain("人物");
  });

  it("increments the explicit version for same-second collisions", () => {
    const date = new Date(2026, 6, 24, 14, 32, 5);
    const first = createOutputFilename("sulphur2", 480, 5, [], date);
    const second = createOutputFilename("sulphur2", 480, 5, [first], date);
    expect(second).toBe("SUL2-480p-5s-20260724-143205-v02.mp4");
  });
});
