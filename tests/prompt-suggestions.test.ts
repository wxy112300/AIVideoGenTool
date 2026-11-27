import { describe, expect, it } from "vitest";
import { promptSnippetFor, promptSnippets } from "../src/core/prompt-suggestions.js";

describe("prompt snippets", () => {
  it("provides purified grouped visual, camera, framing, sound, and detail snippets", () => {
    expect(new Set(promptSnippets.map((snippet) => snippet.group))).toEqual(
      new Set(["画质与实拍光学", "镜头与运镜", "切镜与景别", "声音与对白", "细节与文字"])
    );
    expect(promptSnippetFor("camera-push-in")).toContain("pushes in");
    expect(promptSnippetFor("visual-photorealistic-quality")).toContain("Live-action photographic texture");
    expect(promptSnippetFor("visual-photorealistic-quality")).toContain("interlocking fabric weave");
    expect(promptSnippetFor("visual-photorealistic-quality")).not.toMatch(/Preserve the requested|CGI|toy|doll|wax|plastic/iu);
    expect(promptSnippetFor("visual-macro-closeup")).toContain("100mm macro lens");
    expect(promptSnippetFor("visual-macro-closeup")).toContain("vertical lip lines");
    expect(promptSnippetFor("capture-85mm-portrait")).toContain("85mm prime lens");
    expect(promptSnippetFor("capture-35mm-natural")).toContain("35mm lens");
    expect(promptSnippetFor("capture-smartphone-1x")).toContain("1x");
    expect(promptSnippetFor("camera-orbit")).toContain("180-degree");
    expect(promptSnippetFor("camera-low-angle-macro")).toContain("probe lens");
    expect(promptSnippetFor("shot-close-up")).toContain("[Shot 2]");
    expect(promptSnippetFor("sound-ambience")).toBe(
      "overall_soundscape: Natural room tone and quiet environmental ambience matched to the visible space."
    );
    expect(promptSnippetFor("sound-no-music")).toBe("non_diegetic_music: N/A");
    expect(promptSnippetFor("dialogue-mandarin")).toContain("<d>[Chinese]");
    expect(promptSnippetFor("screen-text")).toContain("exactly");
    expect(promptSnippets.every((snippet) => !/[\u3400-\u9fff]/u.test(snippet.text))).toBe(true);
  });

  it("returns an empty string for an unknown snippet", () => {
    expect(promptSnippetFor("missing")).toBe("");
  });
});
