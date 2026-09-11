// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { historyCoverCandidates } from "../src/renderer/pages/history/helpers.ts";
import {
  produceHistoryThumbnail
} from "../src/renderer/pages/history/thumbnail-producers.ts";
import type {
  MediaRef,
  ProducedThumbnail
} from "../src/renderer/pages/history/media-resource-store.ts";

const originalCreateElement = document.createElement.bind(document);

function videoRef(overrides: Partial<MediaRef> = {}): MediaRef {
  return {
    key: "video-key",
    kind: "video",
    sourcePath: "C:\\fixtures\\video.mp4",
    sourceUrl: "studio-media://history/video.mp4",
    duration: 10,
    coverTime: 2,
    seed: 0,
    ...overrides
  };
}

function installVideoAndCanvasFakes(options: { readyState: number }): {
  videos: HTMLVideoElement[];
  canvasSizes: Array<{ width: number; height: number }>;
} {
  const videos: HTMLVideoElement[] = [];
  const canvasSizes: Array<{ width: number; height: number }> = [];
  vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
    const element = originalCreateElement(tagName);
    if (tagName.toLowerCase() === "video") {
      let currentTime = 0;
      Object.defineProperties(element, {
        readyState: { configurable: true, get: () => options.readyState },
        videoWidth: { configurable: true, get: () => 1_920 },
        videoHeight: { configurable: true, get: () => 1_080 },
        duration: { configurable: true, get: () => 10 },
        currentTime: {
          configurable: true,
          get: () => currentTime,
          set: (value: number) => {
            currentTime = value;
            element.dispatchEvent(new Event("seeked"));
          }
        }
      });
      vi.spyOn(element, "load").mockImplementation(() => undefined);
      vi.spyOn(element, "pause").mockImplementation(() => undefined);
      videos.push(element);
    } else if (tagName.toLowerCase() === "canvas") {
      const canvas = element as HTMLCanvasElement;
      let drawnVideo: HTMLVideoElement | undefined;
      const context = {
        drawImage: (source: CanvasImageSource) => {
          drawnVideo = source as HTMLVideoElement;
        },
        getImageData: () => {
          const highQuality = (drawnVideo?.currentTime ?? 0) >= 4.5;
          const usable = (drawnVideo?.currentTime ?? 0) > 0;
          const red = highQuality ? 255 : usable ? 100 : 0;
          const green = highQuality ? 0 : usable ? 50 : 0;
          const blue = highQuality ? 0 : usable ? 20 : 0;
          const data = new Uint8ClampedArray(32 * 18 * 4);
          for (let index = 0; index < data.length; index += 4) {
            data[index] = red;
            data[index + 1] = green;
            data[index + 2] = blue;
            data[index + 3] = 255;
          }
          return { data } as ImageData;
        }
      } as unknown as CanvasRenderingContext2D;
      Object.defineProperty(canvas, "getContext", {
        configurable: true,
        value: () => {
          canvasSizes.push({ width: canvas.width, height: canvas.height });
          return context;
        }
      });
      Object.defineProperty(canvas, "toBlob", {
        configurable: true,
        value: (callback: BlobCallback) => callback({
          size: 5,
          type: "image/jpeg",
          arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer
        } as unknown as Blob)
      });
    }
    return element;
  }) as typeof document.createElement);
  return { videos, canvasSizes };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("history thumbnail producers", () => {
  it("rejects a black first frame, previews the first usable candidate, and persists the best candidate", async () => {
    const { videos, canvasSizes } = installVideoAndCanvasFakes({ readyState: 2 });
    const previews: ProducedThumbnail[] = [];

    const result = await produceHistoryThumbnail(
      videoRef(),
      "revision-video",
      new AbortController().signal,
      { publishPreview: (value) => previews.push(value) }
    );

    const candidates = historyCoverCandidates(10, 0);
    expect(result?.selectedTime).toBeCloseTo(candidates[3] ?? 0);
    expect(previews).toHaveLength(1);
    expect(previews[0]?.sourceRevision).toBe("revision-video");
    expect(result?.blob.type).toBe("image/jpeg");
    expect(canvasSizes.some((size) => size.width === 640 && size.height === 360)).toBe(true);
    expect(videos).toHaveLength(1);
    expect(videos[0]?.src).toBe("");
  });

  it("settles and cleans up an in-flight video decode when aborted", async () => {
    const { videos } = installVideoAndCanvasFakes({ readyState: 0 });
    const controller = new AbortController();
    const resultPromise = produceHistoryThumbnail(
      videoRef(),
      "revision-aborted",
      controller.signal
    );
    await Promise.resolve();
    controller.abort();

    await expect(resultPromise).resolves.toBeNull();
    expect(videos[0]?.src).toBe("");
    expect(videos[0]?.pause).toHaveBeenCalledOnce();
    expect(videos[0]?.load).toHaveBeenCalledTimes(2);
  });
});
