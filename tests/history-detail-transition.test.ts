// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { swapHistoryDetailFragments } from "../src/renderer/pages/history/detail-transition";

function detailMarkup(assetId: string, versionId: string, title: string, record: string): string {
  return `
    <div class="history-detail-back"><button data-page="history">${title} back</button></div>
    <section class="history-detail-hero">
      <div class="history-player" style="--video-aspect: 16 / 9" aria-label="${title}">
        <video data-history-asset="${assetId}" data-history-version="${versionId}" src="${assetId}.mp4" loop playsinline></video>
        <div data-history-player-info><strong>${title}</strong></div>
        <div data-history-player-actions><button data-history-navigation="1">next</button></div>
        <div class="history-player-utility-group">
          <div data-history-player-utility><button data-history-favorite="${assetId}">favorite</button></div>
          <media-fullscreen-button></media-fullscreen-button>
        </div>
      </div>
      <aside class="history-detail-sidebar"><strong>${title} sidebar</strong></aside>
    </section>
    <div data-history-tags-root>${title} tags</div>
    <section class="history-record-section"><strong>${record}</strong></section>
  `;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("history detail fast transition", () => {
  it("replaces all selected-video details while preserving the fullscreen player element", () => {
    const currentRoot = document.createElement("main");
    currentRoot.innerHTML = detailMarkup("asset-1", "version-1", "First", "first record");
    document.body.append(currentRoot);
    const currentPlayer = currentRoot.querySelector<HTMLElement>(".history-player");
    if (!currentPlayer) throw new Error("current player was not created");
    const currentVideo = currentPlayer.querySelector<HTMLVideoElement>("video");
    if (!currentVideo) throw new Error("current video was not created");
    Object.defineProperties(currentVideo, {
      volume: { configurable: true, writable: true, value: 0.36 },
      muted: { configurable: true, writable: true, value: true },
      playbackRate: { configurable: true, writable: true, value: 1.5 }
    });
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);

    const nextRoot = document.createElement("div");
    nextRoot.innerHTML = detailMarkup("asset-2", "version-2", "Second", "second record");
    const nextPlayer = nextRoot.querySelector<HTMLElement>(".history-player");
    if (!nextPlayer) throw new Error("next player was not created");

    expect(swapHistoryDetailFragments({
      currentRoot: document,
      nextRoot,
      currentPlayer,
      nextPlayer
    })).toBe(true);

    expect(document.querySelector(".history-player")).toBe(currentPlayer);
    expect(currentPlayer.querySelector("video")).toBe(currentVideo);
    expect(currentVideo.dataset.historyAsset).toBe("asset-2");
    expect(currentVideo.dataset.historyVersion).toBe("version-2");
    expect(currentVideo.getAttribute("src")).toContain("asset-2.mp4");
    expect(currentVideo.volume).toBeCloseTo(0.36);
    expect(currentVideo.muted).toBe(true);
    expect(currentVideo.playbackRate).toBeCloseTo(1.5);
    expect(document.querySelector("[data-history-player-info]")?.textContent).toContain("Second");
    expect(document.querySelector(".history-detail-sidebar")?.textContent).toContain("Second sidebar");
    expect(document.querySelector("[data-history-tags-root]")?.textContent).toContain("Second tags");
    expect(document.querySelector(".history-record-section")?.textContent).toContain("second record");
    expect(currentPlayer.querySelector("media-fullscreen-button")).not.toBeNull();
  });
});
