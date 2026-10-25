// @vitest-environment jsdom
import { expect, it } from "vitest";
import { reuseHistoryCovers } from "../src/renderer/pages/history/retained-covers";

function video(key = "version", source = "input.mp4") {
  const root = document.createElement("div");
  root.innerHTML = `<div data-history-media data-cover-key="${key}" data-cover-source="${source}" data-history-src="media://${source}" class="media-loading"><img alt="fresh title"></div>`;
  return root;
}
function ready(root: HTMLElement) {
  const image = root.querySelector("img")!;
  image.src = "blob:decoded";
  Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 320 } });
  root.firstElementChild!.setAttribute("data-history-cover-cached", "true");
  return image;
}
it("keeps the decoded node across rebuilt cards while applying fresh card labels", () => {
  const old = video(), image = ready(old), fresh = video();
  image.alt = "old title";
  expect(reuseHistoryCovers(fresh, old)).toBe(1);
  expect(fresh.querySelector("img")).toBe(image);
  expect(image.alt).toBe("fresh title");
  expect(fresh.firstElementChild!.classList.contains("media-loading")).toBe(false);
  expect(fresh.firstElementChild!.getAttribute("data-history-cover-cached")).toBe("true");
});
it("does not reuse changed versions, changed source files or undecoded covers", () => {
  const old = video(); ready(old);
  expect(reuseHistoryCovers(video("new-version"), old)).toBe(0);
  expect(reuseHistoryCovers(video("version", "different.mp4"), old)).toBe(0);
  expect(reuseHistoryCovers(video(), video())).toBe(0);
});
it("retains decoded image project thumbnails without a fresh loading state", () => {
  const markup = '<div data-image-media-surface="gallery" data-image-media-source="source.png" class="image-media-loading"><img data-image-history-cache-key="image-version" data-image-media-url="media://source.png"><div data-image-media-status></div></div>';
  const old = document.createElement("div"), fresh = document.createElement("div");
  old.innerHTML = markup; fresh.innerHTML = markup;
  const image = ready(old);
  expect(reuseHistoryCovers(fresh, old)).toBe(1);
  expect(fresh.querySelector("img")).toBe(image);
  expect(fresh.firstElementChild!.classList.contains("image-media-ready")).toBe(true);
  expect(fresh.querySelector<HTMLElement>("[data-image-media-status]")!.hidden).toBe(true);
});
