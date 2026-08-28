import { describe, expect, it } from "vitest";
import {
  parsePromptAnnotations,
  promptAnnotationInstruction,
  stripPromptAnnotations
} from "../src/core/prompt-annotations.js";

describe("prompt annotation parsing", () => {
  it("recognizes Chinese and English note labels with mixed full-width delimiters", () => {
    const parsed = parsePromptAnnotations(
      "A girl looks at the camera（批注：camera means the viewpoint, not a prop】, then turns【note: keep the original action）."
    );

    expect(parsed.annotations.map(({ text }) => text)).toEqual([
      "camera means the viewpoint, not a prop",
      "keep the original action"
    ]);
    expect(parsed.prompt).toBe("A girl looks at the camera, then turns.");
    expect(parsed.annotations[0]?.anchor).toContain("A girl looks at the camera");
  });

  it("accepts 注 with or without a colon while avoiding ordinary 注视 text", () => {
    const parsed = parsePromptAnnotations(
      "女孩看向镜头（注：保留主观视角），然后转身（注请翻译成英文）。不要误判（注视女孩）。"
    );

    expect(parsed.annotations.map(({ text }) => text)).toEqual([
      "保留主观视角",
      "请翻译成英文"
    ]);
    expect(parsed.prompt).toContain("不要误判（注视女孩）。");
  });

  it("does not consume normal parentheticals or H3 shot labels", () => {
    const source = "A woman (smiling) walks into frame [Shot 1] and looks at the lens.";

    expect(parsePromptAnnotations(source)).toEqual({
      prompt: source,
      annotations: []
    });
    expect(stripPromptAnnotations(source)).toBe(source);
  });

  it("does not treat note-like text inside quoted dialogue or visible text as an annotation", () => {
    const source = 'The sign reads "[Note: danger]" while a woman says "(注：你好)".';

    expect(parsePromptAnnotations(source)).toEqual({
      prompt: source,
      annotations: []
    });
  });

  it("supports note, comment, and instruction aliases", () => {
    const parsed = parsePromptAnnotations(
      "Scene (Note: use English prose) 【Comment - do not add music】 [Instruction: preserve the dialogue]."
    );

    expect(parsed.annotations.map(({ text }) => text)).toEqual([
      "use English prose",
      "do not add music",
      "preserve the dialogue"
    ]);
  });

  it("builds a model-facing instruction that removes notes from final output", () => {
    const parsed = parsePromptAnnotations("A small real person（注：not a toy or figurine）stands still.");
    const instruction = promptAnnotationInstruction(parsed);

    expect(instruction).toContain("instruction for the prompt editor");
    expect(instruction).toContain("not a toy or figurine");
    expect(instruction).toContain("nearest preceding clause");
    expect(instruction).toContain("Remove the annotation label, marker, and note text");
  });
});
