import { describe, expect, it } from "vitest";
import {
  ensureH3ScalePreservationInOutput,
  extractH3ScaleIntent,
  h3ScalePreservationInstruction
} from "../src/core/h3-scale-preservation.js";

describe("H3 scale semantics", () => {
  it("recognizes human size wording as a smaller world-scale relationship", () => {
    const intent = extractH3ScaleIntent(
      "A tiny girl walks across a full-size kitchen. She is a real human, not a figure."
    );

    expect(intent).toMatchObject({
      detected: true,
      direction: "smaller",
      humanSubject: true,
      morphologyChangeRequested: false
    });
    expect(intent.terms).toEqual(expect.arrayContaining(["tiny", "not a figure"]));
    expect(extractH3ScaleIntent("A tiny, real human walks through a full-size room.").detected).toBe(true);
  });

  it("recognizes annotation-only scale requirements without treating nearby prose as visual content", () => {
    const intent = extractH3ScaleIntent(
      "A woman stands beside a cup.",
      "请把她设为等比例缩小的真人，不要玩具感，不要变成小孩"
    );

    expect(intent.detected).toBe(true);
    expect(intent.direction).toBe("smaller");
  });

  it("keeps the mode-specific scale instruction for every H3 request mode", () => {
    const expectedRules = new Map([
      ["T2VA", "For T2VA"],
      ["I2VA", "For I2VA"],
      ["FL2VA", "For FL2VA"],
      ["L2VA", "For L2VA"],
      ["R2V", "For R2V"]
    ] as const);

    for (const [mode, expectedRule] of expectedRules) {
      const instruction = h3ScalePreservationInstruction("A tiny person stands beside a full-size door.", mode);
      expect(instruction).toContain("Scale semantics lock");
      expect(instruction).toContain(expectedRule);
    }
  });

  it("does not activate for an unrelated small environment", () => {
    expect(extractH3ScaleIntent("A small room with a bright window.").detected).toBe(false);
    expect(extractH3ScaleIntent("A giant room with a person standing by the window.").detected).toBe(false);
    expect(extractH3ScaleIntent("A real person, not a toy, stands in a room.").detected).toBe(false);
  });

  it("preserves an explicit stylized transformation instead of silently overriding it", () => {
    const instruction = h3ScalePreservationInstruction(
      "A tiny human in an explicitly chibi, big-headed style moves through a room.",
      "T2VA"
    );

    expect(instruction).toContain("preserve that explicit change");
    expect(instruction).toContain("uniform world-space factor");
  });

  it("adds a compact scale lock to generated H3 fields when the rewriter omitted it", () => {
    const output = [
      "integrated_multimodal_description:",
      "[Shot 1] A tiny person walks past a coffee mug.",
      "overall_soundscape: Footsteps and room tone.",
      "non_diegetic_music: N/A"
    ].join("\n");

    const normalized = ensureH3ScalePreservationInOutput(
      output,
      "I2VA",
      "A tiny person walks past a coffee mug."
    );

    expect(normalized).toContain("Scale continuity:");
    expect(normalized).toContain("head-to-body ratio");
    expect(normalized.indexOf("Scale continuity:")).toBeLessThan(normalized.indexOf("[Shot 1]"));
  });

  it("uses the R2V detailed description field and avoids duplicate locks", () => {
    const output = [
      "subject_definitions: <Subject 1> is a person.",
      "detailed_description:",
      "[Shot 1] A giant woman crosses the street.",
      "overall_soundscape: Traffic.",
      "non_diegetic_music: N/A"
    ].join("\n");

    const normalized = ensureH3ScalePreservationInOutput(
      output,
      "R2V",
      "A giant woman crosses the street."
    );
    const repeated = ensureH3ScalePreservationInOutput(normalized, "R2V", "A giant woman crosses the street.");

    expect(normalized).toContain("detailed_description:\nScale continuity:");
    expect(repeated.match(/Scale continuity:/gu)).toHaveLength(1);
  });

  it("uses annotation context when repairing a final prompt", () => {
    const repaired = ensureH3ScalePreservationInOutput(
      "integrated_multimodal_description: [Shot 1] A woman walks beside a cup.",
      "T2VA",
      "A woman walks beside a cup.",
      "Note: make her a proportional tiny real human, not a toy or child."
    );

    expect(repaired).toContain("Scale continuity:");
    expect(repaired).toContain("source-age human");
  });
});
