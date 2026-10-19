import { describe, expect, it, vi } from "vitest";
import { withStrataReferenceMedia } from "../electron/services/strata-reference-media.js";
import type { EnhanceRequest } from "../src/types.js";

describe("Strata visual references (synthetic frame tools)", () => {
  it("keeps Picture numbering and the exact boundary without resampling the extension source", async () => {
    const cleanup = vi.fn(async () => undefined);
    const frame = vi.fn(async (_source, id) => ({ filePath: id + ".png", cleanup }));
    const request: EnhanceRequest = { prompt: "continue", modelId: "minimax_h3_ref2va", h3PromptMode: "R2V",
      extensionSource: { filePath: "source.mp4", trimStartSeconds: 2, trimEndSeconds: 8 },
      imagePaths: ["boundary.png", "person.png"], referenceMediaPaths: ["source.mp4", "person.png"] };
    await withStrataReferenceMedia(request, new AbortController().signal, async (prepared) => {
      expect(prepared.imagePaths?.slice(0, 2)).toEqual(["person.png", "boundary.png"]);
      expect(prepared.imagePaths).toHaveLength(2);
      expect(prepared.referenceContext).toContain("Attachment 1: <Picture 1>");
      expect(prepared.referenceContext).toContain("continuation boundary, enhancer-only");
      expect(prepared.referenceContext).not.toContain("sampled frame");
      return "success";
    }, { prepareFrame: frame, duration: vi.fn(async () => 10) });
    expect(frame).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });
  it("still samples additional video references without renumbering the locked source Video 1", async () => {
    const cleanup = vi.fn(async () => undefined);
    const frame = vi.fn(async (_source, id) => ({ filePath: id + ".png", cleanup }));
    await withStrataReferenceMedia({ prompt: "continue", modelId: "minimax_h3_ref2va", h3PromptMode: "R2V",
      extensionSource: { filePath: "source.mp4", trimStartSeconds: 2, trimEndSeconds: 8 },
      imagePaths: ["boundary.png"], referenceMediaPaths: ["source.mp4", "reference.mp4"] },
    new AbortController().signal, async (prepared) => {
      expect(prepared.imagePaths).toHaveLength(4);
      expect(prepared.referenceContext).toContain("<Video 2> sampled frame");
      expect(prepared.referenceContext).toContain("contain no audio");
    }, { prepareFrame: frame, duration: async () => 10 });
    expect(frame.mock.calls.map(([source]) => source.filePath)).toEqual(["reference.mp4", "reference.mp4", "reference.mp4"]);
    expect(cleanup).toHaveBeenCalledTimes(3);
  });
  it("cleans all successful samples on output failure and cancellation", async () => {
    const cleanup = vi.fn(async () => undefined), controller = new AbortController();
    const frame = vi.fn(async () => { if (frame.mock.calls.length === 2) controller.abort(new Error("cancelled")); return { filePath: "frame.png", cleanup }; });
    const request: EnhanceRequest = { prompt: "continue", modelId: "minimax_h3_ref2va", h3PromptMode: "R2V", referenceMediaPaths: ["source.mp4"] };
    await expect(withStrataReferenceMedia(request, controller.signal, async () => { throw new Error("unreachable"); }, { prepareFrame: frame, duration: async () => 5 })).rejects.toThrow(/取消|cancelled/);
    expect(cleanup).toHaveBeenCalledTimes(2);
  });
  it("rejects excessive video references before invoking tools", async () => {
    const frame = vi.fn();
    await expect(withStrataReferenceMedia({ prompt: "describe", modelId: "h3", referenceMediaPaths: ["a.mp4", "b.mp4", "c.mp4", "d.mp4"] },
      new AbortController().signal, vi.fn(), { prepareFrame: frame })).rejects.toThrow("最多");
    expect(frame).not.toHaveBeenCalled();
  });
});
