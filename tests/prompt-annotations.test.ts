import { describe, expect, it } from "vitest";
import {
  applyPromptRevision,
  buildPromptRevisionPlan,
  parsePromptAnnotations,
  promptAnnotationInstruction,
  promptRevisionInstruction,
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

  it("builds targeted replacements while protecting every unannotated passage", () => {
    const source = [
      "integrated_multimodal_description:",
      "[Shot 1] The tiny person bends down and lifts the giant.（批注：动作主体写反了，改成巨人托起微小角色。） The camera tracks alongside them.",
      "overall_soundscape:",
      "Soft room tone."
    ].join("\n");
    const plan = buildPromptRevisionPlan(source);

    expect(plan.targets).toHaveLength(1);
    expect(plan.targets[0]?.original).toBe("The tiny person bends down and lifts the giant.");
    expect(plan.markedPrompt).toContain("[Shot 1] <EDIT_TARGET_1>The tiny person bends down and lifts the giant.</EDIT_TARGET_1>");
    expect(promptRevisionInstruction(source)).toContain("动作主体写反了");

    const revised = applyPromptRevision(
      source,
      "<EDIT_TARGET_1>The giant bends down and carefully lifts the tiny person.</EDIT_TARGET_1>"
    );
    expect(revised).toContain("[Shot 1] The giant bends down and carefully lifts the tiny person. The camera tracks alongside them.");
    expect(revised).toContain("overall_soundscape:\nSoft room tone.");
    expect(revised).not.toContain("批注");
    expect(revised).not.toContain("EDIT_TARGET");
  });

  it("supports concise revision aliases and applies multiple notes in order", () => {
    const source = "The giant looks away（修改：让巨人看向掌心）。 The tiny person waves【改为：微小角色双手挥动】。";
    const plan = buildPromptRevisionPlan(source);

    expect(plan.targets.map((target) => target.instruction)).toEqual([
      "让巨人看向掌心",
      "微小角色双手挥动"
    ]);
    expect(applyPromptRevision(source, [
      "<EDIT_TARGET_1>The giant looks into their palm</EDIT_TARGET_1>",
      "<EDIT_TARGET_2>The tiny person waves both hands</EDIT_TARGET_2>"
    ].join("\n"))).toBe("The giant looks into their palm。 The tiny person waves both hands。");
  });

  it("fails closed when revision annotations or replacement blocks are missing", () => {
    expect(() => buildPromptRevisionPlan("The approved prompt stays unchanged."))
      .toThrow("需要至少一条带标签的批注");
    expect(() => applyPromptRevision(
      "The giant moves.（批注：动作更明确）",
      "The giant moves more clearly."
    )).toThrow("原提示词已保持不变");
  });

  it("uses the annotation position when identical clauses occur more than once", () => {
    const source = "The subject waits. The subject waits.（批注：第二次等待改为挥手。） The camera holds.";
    expect(applyPromptRevision(
      source,
      "<EDIT_TARGET_1>The subject waves.</EDIT_TARGET_1>"
    )).toBe("The subject waits. The subject waves. The camera holds.");
  });
});
