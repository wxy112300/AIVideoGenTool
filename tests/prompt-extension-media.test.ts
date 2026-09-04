import { describe, expect, it, vi } from "vitest";
import type { EnhanceRequest } from "../src/types";
import { withPromptExtensionMedia } from "../electron/services/prompt-extension-media";
import { promptExtensionFrameTime } from "../electron/services/extension-media";

const baseRequest = (): EnhanceRequest => ({
  prompt: "Continue the motion.",
  modelId: "minimax_h3_ref2va",
  mode: "h3-vision",
  h3PromptMode: "R2V",
  imagePaths: ["picture-1.png"],
  referenceMediaPaths: ["picture-1.png", "video-1.mp4"],
  referenceContext: "<Picture 1> = character reference",
  extensionSource: {
    filePath: "source.mp4",
    trimStartSeconds: 2,
    trimEndSeconds: 8
  }
});

describe("extension prompt boundary media", () => {
  it("samples one frame before the selected crop end", () => {
    expect(promptExtensionFrameTime({
      trimStartSeconds: 2,
      trimEndSeconds: 8
    })).toBeCloseTo(8 - 1 / 24);
    expect(promptExtensionFrameTime({
      trimStartSeconds: 2,
      trimEndSeconds: 2.01
    })).toBe(2);
    expect(promptExtensionFrameTime({
      trimStartSeconds: 2,
      trimEndSeconds: 8
    }, 7.96)).toBeCloseTo(7.96 - 1 / 24);
  });

  it("keeps ordinary prompt requests unchanged", async () => {
    const request = { ...baseRequest(), extensionSource: undefined };
    const prepareFrame = vi.fn();
    const run = vi.fn(async (prepared: EnhanceRequest) => prepared);

    const result = await withPromptExtensionMedia(
      request,
      "operation-1",
      new AbortController().signal,
      run,
      { prepareFrame }
    );

    expect(result).toBe(request);
    expect(run).toHaveBeenCalledWith(request);
    expect(prepareFrame).not.toHaveBeenCalled();
  });

  it("places the cropped final frame first without renumbering references", async () => {
    const cleanup = vi.fn(async () => undefined);
    const prepareFrame = vi.fn(async () => ({
      filePath: "extension-boundary.png",
      cleanup
    }));

    const result = await withPromptExtensionMedia(
      baseRequest(),
      "operation-2",
      new AbortController().signal,
      async (prepared) => prepared,
      { prepareFrame }
    );

    expect(prepareFrame).toHaveBeenCalledWith(
      baseRequest().extensionSource,
      "operation-2",
      expect.any(AbortSignal)
    );
    expect(result.imagePath).toBe("extension-boundary.png");
    expect(result.imagePaths).toEqual(["extension-boundary.png", "picture-1.png"]);
    expect(result.referenceMediaPaths).toEqual([
      "picture-1.png",
      "video-1.mp4",
      "extension-boundary.png"
    ]);
    expect(result.referenceContext).toContain("exact final frame at the selected trim end");
    expect(result.referenceContext).toContain("renumber any existing <Picture N> labels");
    expect(result.referenceContext).toContain("<Picture 1> = character reference");
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("removes the temporary frame when the prompt backend fails", async () => {
    const cleanup = vi.fn(async () => undefined);

    await expect(withPromptExtensionMedia(
      baseRequest(),
      "operation-3",
      new AbortController().signal,
      async () => { throw new Error("backend failed"); },
      {
        prepareFrame: async () => ({
          filePath: "extension-boundary.png",
          cleanup
        })
      }
    )).rejects.toThrow("backend failed");

    expect(cleanup).toHaveBeenCalledOnce();
  });
});
