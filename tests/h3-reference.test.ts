import { describe, expect, it } from "vitest";
import type { H3ReferenceSlot } from "../src/types";
import {
  ensureMotionContextSourceSlot,
  motionContextReferenceSlotsReady
} from "../src/core/h3-reference";

function imageSlot(id: string, mediaPath: string): H3ReferenceSlot {
  return { id, mediaType: "image", mediaPath, role: "subject", note: "" };
}

describe("Motion Context reference slots", () => {
  it("prepends a locked source video without losing existing image references", () => {
    const result = ensureMotionContextSourceSlot([imageSlot("picture", "subject.png")], "source.mp4");
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ mediaType: "video", mediaPath: "source.mp4", role: "motion" });
    expect(result[1]).toEqual(imageSlot("picture", "subject.png"));
  });

  it("updates an existing source slot while preserving its identity", () => {
    const result = ensureMotionContextSourceSlot([
      { id: "source", mediaType: "video", mediaPath: "old.mp4", role: "scene", note: "keep" },
      imageSlot("picture", "subject.png")
    ], "new.mp4");
    expect(result[0]).toMatchObject({ id: "source", mediaPath: "new.mp4", role: "motion", note: "keep" });
    expect(result[1]?.id).toBe("picture");
  });

  it("does not overwrite a regular R2V video when entering Motion Context", () => {
    const result = ensureMotionContextSourceSlot([
      { id: "video-reference", mediaType: "video", mediaPath: "reference.mp4", role: "subject", note: "" }
    ], "source.mp4");
    expect(result.map((slot) => slot.mediaPath)).toEqual(["source.mp4", "reference.mp4"]);
    expect(result[0]?.role).toBe("motion");
  });

  it("requires a complete source-first stack within native H3 limits", () => {
    const slots = ensureMotionContextSourceSlot([imageSlot("picture", "subject.png")], "source.mp4");
    expect(motionContextReferenceSlotsReady(slots, "source.mp4")).toBe(true);
    expect(motionContextReferenceSlotsReady([{ ...slots[0]!, mediaPath: "" }, slots[1]!], "source.mp4")).toBe(false);
    expect(motionContextReferenceSlotsReady(slots, "other.mp4")).toBe(false);
  });
});
