import { describe, expect, it } from "vitest";
import {
  historyEntryClientId,
  historyEntryHasUnfinishedBatch
} from "../electron/services/comfy-ui.js";

describe("ComfyUI meta-batch history", () => {
  it("links requeued prompts by client id", () => {
    expect(
      historyEntryClientId({ prompt: [-1, "prompt-id", {}, { client_id: "client-1" }] })
    ).toBe("client-1");
    expect(historyEntryClientId({ prompt: [] })).toBe("");
  });

  it("does not treat an unfinished VHS batch as final output", () => {
    expect(
      historyEntryHasUnfinishedBatch({
        outputs: { "6": { unfinished_batch: [true] } }
      })
    ).toBe(true);
    expect(
      historyEntryHasUnfinishedBatch({
        outputs: { "6": { gifs: [{ filename: "done.mp4" }] } }
      })
    ).toBe(false);
  });
});