// @vitest-environment jsdom
import { expect, it } from "vitest";
import { historyCardVideo } from "../src/renderer/pages/history/card-video";

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
