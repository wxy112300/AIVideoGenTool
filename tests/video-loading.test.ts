// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { mountVideoLoading } from "../src/renderer/shared/video-loading";

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

it("keeps a visible failure and retries the same media only after an explicit click", async () => {
  document.body.innerHTML = '<div class="history-player"><video src="clip.mp4"></video></div>';
  const video = document.querySelector("video")!;
  let error: MediaError | null = null;
  Object.defineProperty(video, "error", { get: () => error });
  const load = vi.spyOn(video, "load").mockImplementation(() => { error = null; });
  vi.spyOn(video, "play").mockResolvedValue();
  const cleanup = mountVideoLoading(document.body, "Loading", { label: "Video unavailable", retry: "Retry" });
  error = { code: 4 } as MediaError;
  video.dispatchEvent(new Event("error"));
  video.dispatchEvent(new Event("pause"));
  const status = document.querySelector<HTMLElement>('[role="alert"]')!;
  expect(status.hidden).toBe(false);
  expect(status.textContent).toContain("Video unavailable");
  expect(load).not.toHaveBeenCalled();
  status.querySelector<HTMLButtonElement>("button")!.click();
  expect(load).toHaveBeenCalledOnce();
  expect(video.getAttribute("aria-busy")).toBe("true");
  video.dispatchEvent(new Event("playing"));
  expect(status.hidden).toBe(true);
  expect(document.querySelector("video")).toBe(video);
  cleanup();
});
it("shows initial loading and buffering without replacing or restarting media", () => {
  document.body.innerHTML = '<div class="history-player"><video src="clip.mp4"></video></div><div data-history-media><video></video></div>';
  const video = document.querySelector("video")!;
  const cleanup = mountVideoLoading(document.body, "Loading video");
  const status = document.querySelector<HTMLElement>(".video-buffering-status")!;
  expect(status.hidden).toBe(false);
  expect(status.getAttribute("aria-label")).toBe("Loading video");
  video.dispatchEvent(new Event("canplay"));
  expect(status.hidden).toBe(true);
  video.dispatchEvent(new Event("waiting"));
  expect(status.hidden).toBe(false);
  video.dispatchEvent(new Event("playing"));
  expect(status.hidden).toBe(true);
  expect(document.querySelector("video")).toBe(video);
  expect(video.getAttribute("src")).toBe("clip.mp4");
  expect(document.querySelector("[data-history-media] .video-buffering-status")).toBeNull();
  cleanup();
  expect(status.isConnected).toBe(false);
  expect(video.hasAttribute("aria-busy")).toBe(false);
});
it("does not spin for a ready paused video or retain waiting after errors and pause", () => {
  document.body.innerHTML = '<div class="history-player"><video src="clip.mp4"></video></div>';
  const video = document.querySelector("video")!;
  Object.defineProperty(video, "readyState", { value: 4 });
  const cleanup = mountVideoLoading(document.body, "Loading");
  const status = document.querySelector<HTMLElement>(".video-buffering-status")!;
  for (const event of ["seeking", "stalled"]) video.dispatchEvent(new Event(event));
  expect(status.hidden).toBe(true);
  for (const event of ["pause", "error", "abort"]) {
    video.dispatchEvent(new Event("waiting"));
    expect(status.hidden).toBe(false);
    video.dispatchEvent(new Event(event));
    expect(status.hidden).toBe(true);
  }
  cleanup();
});
