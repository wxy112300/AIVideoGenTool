// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { historyCardVideo, historyPreviewPresentation } from "../src/renderer/pages/history/card-video";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); document.body.replaceChildren(); });

function preview(frameCallbacks = true) {
  vi.useFakeTimers();
  const media = document.createElement("div"); media.className = "has-history-cover playing";
  const video = document.createElement("video"); media.append(video); document.body.append(media);
  let readyState = 0, seeking = false, next = 0;
  const frames = new Map<number, VideoFrameRequestCallback>();
  Object.defineProperties(video, {
    readyState: { get: () => readyState }, seeking: { get: () => seeking },
    requestVideoFrameCallback: { value: frameCallbacks ? vi.fn((fn: VideoFrameRequestCallback) => { frames.set(++next, fn); return next; }) : undefined },
    cancelVideoFrameCallback: { value: vi.fn((id: number) => frames.delete(id)) }
  });
  const abort = new AbortController();
  const presentation = historyPreviewPresentation(media, video, abort.signal);
  const fireFrame = () => {
    const [id, fn] = frames.entries().next().value!; frames.delete(id);
    fn(0, {} as VideoFrameCallbackMetadata);
  };
  return { media, video, abort, presentation, frames, fireFrame,
    ready(value = 2) { readyState = value; }, seek(value: boolean) { seeking = value; } };
}

it("retains the cover through loading and only reveals a presented frame, with a delayed quiet loading state", async () => {
  const p = preview(); p.presentation.start();
  expect(p.media.classList.contains("preview-ready")).toBe(false);
  await vi.advanceTimersByTimeAsync(249);
  expect(p.media.classList.contains("preview-pending")).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(p.media.classList.contains("preview-pending")).toBe(true);
  p.video.dispatchEvent(new Event("emptied")); // load() may emit this after hover started.
  p.ready(); p.video.dispatchEvent(new Event("loadeddata"));
  expect(p.media.classList.contains("preview-ready")).toBe(false);
  p.fireFrame();
  expect(p.media.classList.contains("preview-ready")).toBe(true);
  expect(p.media.classList.contains("preview-pending")).toBe(false);
  expect(p.media.classList.contains("has-history-cover")).toBe(true);
  p.abort.abort();
});

it("waits for the requested seek frame and ignores callbacks from an earlier hover", () => {
  const p = preview(); p.ready(); p.seek(true);
  const first = p.presentation.start();
  const stale = [...p.frames.values()][0]!;
  p.presentation.stop(); const next = p.presentation.start();
  stale(0, {} as VideoFrameCallbackMetadata);
  expect(p.presentation.isCurrent(first)).toBe(false);
  expect(p.presentation.isCurrent(next)).toBe(true);
  expect(p.media.classList.contains("preview-ready")).toBe(false);
  p.fireFrame();
  expect(p.media.classList.contains("preview-ready")).toBe(false);
  p.seek(false); p.fireFrame();
  expect(p.media.classList.contains("preview-ready")).toBe(true);
  p.abort.abort();
});

it.each(["stop", "abort", "error"])("cleans up the first-frame callback and loading timer on %s", async action => {
  const p = preview(); p.ready(); p.presentation.start();
  const stale = [...p.frames.values()][0]!;
  if (action === "stop") p.presentation.stop();
  else if (action === "abort") p.abort.abort();
  else p.video.dispatchEvent(new Event("error"));
  stale(0, {} as VideoFrameCallbackMetadata);
  await vi.advanceTimersByTimeAsync(500);
  expect(p.frames.size).toBe(0);
  expect(p.media.classList.contains("preview-ready")).toBe(false);
  expect(p.media.classList.contains("preview-pending")).toBe(false);
  p.abort.abort();
});

it("uses decoded-data and an animation frame as the fallback, without reviving a cancelled preview", () => {
  const p = preview(false);
  let frame!: FrameRequestCallback;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(fn => { frame = fn; return 1; });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  p.presentation.start();
  p.ready(); p.video.dispatchEvent(new Event("loadeddata"));
  expect(p.media.classList.contains("preview-ready")).toBe(false);
  const stale = frame; p.presentation.stop(); p.presentation.start();
  stale(0);
  expect(p.media.classList.contains("preview-ready")).toBe(false);
  frame(0);
  expect(p.media.classList.contains("preview-ready")).toBe(true);
  p.abort.abort();
});

it("keeps cover-only cards free of media elements and materializes one reusable muted preview on interaction", () => {
  const media = document.createElement("div"); media.dataset.historySrc = "studio-media://history/item/version/0";
  expect(historyCardVideo(media)).toBeNull();
  const video = historyCardVideo(media, true)!;
  expect(video.dataset.historySrc).toBe(media.dataset.historySrc);
  expect(video.hasAttribute("src")).toBe(false);
  expect(video.muted && video.loop && video.playsInline).toBe(true);
  expect(historyCardVideo(media, true)).toBe(video);
  expect(media.querySelectorAll("video")).toHaveLength(1);
  expect(historyCardVideo(document.createElement("div"), true)).toBeNull();
});
