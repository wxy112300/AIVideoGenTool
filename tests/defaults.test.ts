import { describe, expect, it } from "vitest";
import { createClearedDraft, createDefaultDraft } from "../src/core/defaults";

describe("draft defaults", () => {
  it("keeps the starter prompt for a new install", () => {
    const draft = createDefaultDraft();
    expect(draft.promptVersions[0]?.text).not.toBe("");
    expect(draft.fps).toBe(24);
  });

  it("clears user content while retaining the selected generation setup", () => {
    const current = {
      ...createDefaultDraft(),
      modelId: "wan22_5b",
      workflowPath: "wan.json",
      startImagePath: "start.png",
      endImagePath: "end.png",
      seed: 42
    };
    const cleared = createClearedDraft(current);

    expect(cleared.startImagePath).toBe("");
    expect(cleared.endImagePath).toBe("");
    expect(cleared.promptVersions).toHaveLength(1);
    expect(cleared.promptVersions[0]?.text).toBe("");
    expect(cleared.seed).toBeNull();
    expect(cleared.modelId).toBe("wan22_5b");
    expect(cleared.workflowPath).toBe("wan.json");
    expect(cleared.fps).toBe(current.fps);
  });
});
