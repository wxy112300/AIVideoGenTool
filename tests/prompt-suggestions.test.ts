import { describe, expect, it } from "vitest";
import { promptSnippetFor, promptSnippets } from "../src/core/prompt-suggestions.js";

describe("prompt snippets", () => {
  it("provides grouped visual, camera, motion, sound, and dialogue snippets", () => {
    expect(new Set(promptSnippets.map((snippet) => snippet.group))).toEqual(
      new Set(["参考与连续性", "真实感与材质", "拍摄与设备", "动作与反应", "镜头运动", "景别构图", "主体动作", "声音", "对白", "屏幕文字"])
    );
    expect(promptSnippetFor("camera-push-in")).toContain("pushes in");
    expect(promptSnippetFor("continuity-body-gaze-lock")).toContain("gaze");
    expect(promptSnippetFor("visual-live-action-human")).toContain("live-action");
    expect(promptSnippetFor("visual-anti-cg-plastic")).toContain("plastic");
    expect(promptSnippetFor("capture-smartphone-1x")).toContain("1x");
    expect(promptSnippetFor("dialogue-mandarin")).toContain("<d>[Chinese]");
    expect(promptSnippetFor("screen-text")).toContain("exactly");
    expect(promptSnippets.every((snippet) => !/[\u3400-\u9fff]/u.test(snippet.text))).toBe(true);
  });

  it("returns an empty string for an unknown snippet", () => {
    expect(promptSnippetFor("missing")).toBe("");
  });
});