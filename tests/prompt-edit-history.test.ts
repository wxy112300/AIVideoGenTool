import { describe, expect, it } from "vitest";
import { PromptEditHistory } from "../src/core/prompt-edit-history";

const before = {
  promptVersions: [{ id: "one", label: "One", text: "before", createdAt: "now" }],
  activePromptVersion: 0
};
const after = {
  promptVersions: [{ id: "two", label: "Two", text: "after", createdAt: "now" }],
  activePromptVersion: 0
};

describe("prompt edit history", () => {
  it("undoes and redoes a clear operation for each prompt scope", () => {
    const history = new PromptEditHistory();
    history.record("video", before, after);
    history.record("image", before, after);

    expect(history.undo("video")).toEqual(before);
    expect(history.redo("video")).toEqual(after);
    expect(history.undo("image")).toEqual(before);
    expect(history.redo("image")).toEqual(after);
  });

  it("does not intercept native undo after normal input invalidates app history", () => {
    const history = new PromptEditHistory();
    history.record("video", before, after);
    history.invalidate("video");

    expect(history.undo("video")).toBeUndefined();
    expect(history.redo("video")).toBeUndefined();
  });

  it("supports multiple clears and clears redo after a new clear", () => {
    const history = new PromptEditHistory();
    const third = {
      promptVersions: [{ id: "three", label: "Three", text: "third", createdAt: "now" }],
      activePromptVersion: 0
    };
    history.record("video", before, after);
    history.record("video", after, third);

    expect(history.undo("video")).toEqual(after);
    expect(history.undo("video")).toEqual(before);
    expect(history.redo("video")).toEqual(after);
    history.record("video", after, third);
    expect(history.redo("video")).toBeUndefined();
  });
});
