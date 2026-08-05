import { describe, expect, it } from "vitest";
import { promptSnippetFor, promptSnippets } from "../src/core/prompt-suggestions.js";

describe("prompt snippets", () => {
  it("provides grouped camera, motion, sound, and dialogue snippets", () => {
    expect(new Set(promptSnippets.map((snippet) => snippet.group))).toEqual(
      new Set(["镜头运动", "景别构图", "主体动作", "声音", "对白"])
    );
    expect(promptSnippetFor("camera-push-in")).toContain("pushes in");
    expect(promptSnippetFor("dialogue-mandarin")).toContain("<d>[Chinese]");
  });

  it("returns an empty string for an unknown snippet", () => {
    expect(promptSnippetFor("missing")).toBe("");
  });
});