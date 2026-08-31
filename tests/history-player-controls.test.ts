// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { createTranslator } from "../src/core/i18n";
import type { RendererContext } from "../src/renderer/contracts";
import {
  mountHistoryActionsController,
  type HistoryActionsControllerOptions
} from "../src/renderer/pages/history/actions-controller";
import {
  mountHistoryPageController,
  HISTORY_PLAYER_ARROW_SEEK_PERCENT,
  downloadHistoryPlayerVideo,
  seekHistoryPlayerByPercentage,
  toggleHistoryPlayerFullscreen,
  toggleHistoryPlayerPictureInPicture,
  type HistoryPageControllerOptions
} from "../src/renderer/pages/history/page-controller";

const translator = createTranslator("zh-CN");

function createContext(root: HTMLElement, getState: () => ReturnType<typeof createDefaultState>): RendererContext {
  return {
    root,
    application: {} as RendererContext["application"],
    events: {} as RendererContext["events"],
    assets: {} as RendererContext["assets"],
    hostCapabilities: {} as RendererContext["hostCapabilities"],
    getState,
    getRoute: () => ({ page: "history-detail", creationMode: "image-to-video", historyKind: "video" }),
    getTranslator: () => translator,
    t: translator.t,
    requestRender: () => undefined,
    navigate: () => undefined,
    notify: vi.fn(),
    reportUserAction: () => undefined
  };
}

function createActions(
  state: ReturnType<typeof createDefaultState>,
  updateHistoryMetadata: HistoryActionsControllerOptions["updateHistoryMetadata"]
): HistoryActionsControllerOptions {
  return {
    setState: (nextState) => Object.assign(state, nextState),
    getSelectedHistoryAssetId: () => "video-1",
    getSelectedHistoryVersionId: () => "version-1",
    openUpscaleDialog: () => undefined,
    requestHistoryDeletion: () => undefined,
    requestHistoryVersionDeletion: () => undefined,
    requestImageVersionDeletion: () => undefined,
    copyHistoryText: async () => undefined,
    copyHistoryFile: async () => undefined,
    copyHistoryImage: async () => undefined,
    editHistoryAsset: async () => undefined,
    continueVideoHistory: async () => undefined,
    continueImageEdit: async () => undefined,
    continueImageToVideo: async () => undefined,
    updateHistoryMetadata
  };
}

function restoreFullscreenDescriptor(): void {
  delete (document as Document & { fullscreenElement?: Element | null }).fullscreenElement;
  delete (document as Document & { exitFullscreen?: () => Promise<void> }).exitFullscreen;
  delete (document as Document & { pictureInPictureElement?: Element | null }).pictureInPictureElement;
  delete (document as Document & { exitPictureInPicture?: () => Promise<void> }).exitPictureInPicture;
}

afterEach(() => {
  restoreFullscreenDescriptor();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("history player fullscreen controls", () => {
  it("enters fullscreen from a double-click target and exits from the same target", async () => {
    const player = document.createElement("div");
    const requestFullscreen = vi.fn(async () => undefined);
    Object.defineProperty(player, "requestFullscreen", { configurable: true, value: requestFullscreen });
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
    document.body.append(player);

    toggleHistoryPlayerFullscreen(player);
    await Promise.resolve();
    expect(requestFullscreen).toHaveBeenCalledTimes(1);

    const exitFullscreen = vi.fn(async () => undefined);
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exitFullscreen });
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: player });
    toggleHistoryPlayerFullscreen(player);
    await Promise.resolve();
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it("wires the video double-click gesture to the player's fullscreen target", () => {
    const root = document.createElement("main");
    root.innerHTML = `<div class="history-player"><video data-history-asset="video-1" data-history-version="version-1" data-history-download-filename="downloaded-video.mp4"></video><media-settings-menu><media-chrome-menu-item data-history-player-menu-action="download">Download</media-chrome-menu-item></media-settings-menu></div>`;
    document.body.append(root);
    const player = root.querySelector<HTMLElement>(".history-player");
    const video = root.querySelector<HTMLVideoElement>("video");
    const downloadItem = root.querySelector<HTMLElement>("[data-history-player-menu-action=download]");
    if (!player || !video || !downloadItem) throw new Error("history player fixture was not created");
    const requestFullscreen = vi.fn(async () => undefined);
    Object.defineProperty(player, "requestFullscreen", { configurable: true, value: requestFullscreen });
    Object.defineProperty(video, "currentSrc", {
      configurable: true,
      value: "studio-media://history/video-1/video.mp4"
    });
    let clickedAnchor: HTMLAnchorElement | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function(this: HTMLAnchorElement) {
      clickedAnchor = this;
    });

    const context = createContext(root, createDefaultState);
    const options = {
      context,
      playback: null,
      navigation: {} as HistoryPageControllerOptions["navigation"],
      media: {
        loadImageHistoryThumbnail: async () => true,
        loadHistoryCoverFromCache: async () => false,
        loadHistoryCardVideo: () => null,
        releaseHistoryCardVideo: () => undefined,
        scheduleHistoryCoverWarmup: () => undefined,
        cancelHistoryCoverWarmup: () => undefined,
        stopHistoryCoverWarmup: () => undefined,
        chooseHistoryCoverTime: async (_video, fallbackTime) => fallbackTime,
        saveHistoryCover: async () => undefined,
        formatVideoDuration: () => "0s"
      },
      actions: {} as HistoryPageControllerOptions["actions"],
      filter: {} as HistoryPageControllerOptions["filter"],
      tags: {} as HistoryPageControllerOptions["tags"],
      historyLayout: "masonry" as const,
      isImageHistoryDetail: false,
      bindHistoryMasonry: () => undefined,
      bindHistoryAlbum: () => undefined,
      bindImageHistoryViewer: () => undefined,
      bindHistoryTitleMarquees: () => undefined,
      restoreHistoryLayoutAnchor: () => undefined,
      imageLightbox: {} as HistoryPageControllerOptions["imageLightbox"],
      openHistoryContextMenu: () => undefined,
      openImageHistoryContextMenu: () => undefined,
      openHistoryPlayerContextMenu: vi.fn()
    } satisfies HistoryPageControllerOptions;
    const cleanup = mountHistoryPageController(options);

    video.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    expect(requestFullscreen).toHaveBeenCalledTimes(1);

    video.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 20, clientY: 30 }));
    expect(options.openHistoryPlayerContextMenu).toHaveBeenCalledWith(
      "video-1",
      "version-1",
      20,
      30,
      player,
      video
    );

    downloadItem.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(clickedAnchor?.download).toBe("downloaded-video.mp4");
    expect(root.querySelector<HTMLElement>("media-settings-menu")?.hidden).toBe(true);
    cleanup();
  });

  it("downloads the active video with its persisted filename", () => {
    const video = document.createElement("video");
    Object.defineProperty(video, "currentSrc", {
      configurable: true,
      value: "studio-media://history/video-1/video.mp4"
    });
    document.body.append(video);
    let clickedAnchor: HTMLAnchorElement | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function(this: HTMLAnchorElement) {
      clickedAnchor = this;
    });

    expect(downloadHistoryPlayerVideo(video, "generated-video.mp4")).toBe(true);
    expect(clickedAnchor?.href).toContain("studio-media://history/video-1/video.mp4");
    expect(clickedAnchor?.download).toBe("generated-video.mp4");
    expect(document.body.querySelector("a[download]")).toBeNull();
  });

  it("toggles native picture-in-picture when the browser exposes it", async () => {
    const video = document.createElement("video");
    document.body.append(video);
    const requestPictureInPicture = vi.fn(async () => undefined);
    const exitPictureInPicture = vi.fn(async () => undefined);
    Object.defineProperty(video, "requestPictureInPicture", {
      configurable: true,
      value: requestPictureInPicture
    });
    Object.defineProperty(document, "pictureInPictureElement", { configurable: true, value: null });
    Object.defineProperty(document, "exitPictureInPicture", {
      configurable: true,
      value: exitPictureInPicture
    });

    expect(toggleHistoryPlayerPictureInPicture(video)).toBe(true);
    await Promise.resolve();
    expect(requestPictureInPicture).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "pictureInPictureElement", { configurable: true, value: video });
    expect(toggleHistoryPlayerPictureInPicture(video)).toBe(true);
    await Promise.resolve();
    expect(exitPictureInPicture).toHaveBeenCalledTimes(1);
  });

  it("seeks by a fullscreen duration percentage and leaves volume focus alone", () => {
    const root = document.createElement("main");
    root.innerHTML = `<div class="history-player"><video></video><media-volume-range></media-volume-range></div>`;
    document.body.append(root);
    const player = root.querySelector<HTMLElement>(".history-player");
    const video = root.querySelector<HTMLVideoElement>("video");
    const volumeRange = root.querySelector<HTMLElement>("media-volume-range");
    if (!player || !video || !volumeRange) throw new Error("history player fixture was not created");
    Object.defineProperties(video, {
      duration: { configurable: true, value: 100 },
      currentTime: { configurable: true, writable: true, value: 40 }
    });
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: player });

    expect(seekHistoryPlayerByPercentage(video, 1)).toBe(true);
    expect(video.currentTime).toBe(40 + 100 * HISTORY_PLAYER_ARROW_SEEK_PERCENT);

    const context = createContext(root, createDefaultState);
    const options = {
      context,
      playback: null,
      navigation: {} as HistoryPageControllerOptions["navigation"],
      media: {
        loadImageHistoryThumbnail: async () => true,
        loadHistoryCoverFromCache: async () => false,
        loadHistoryCardVideo: () => null,
        releaseHistoryCardVideo: () => undefined,
        scheduleHistoryCoverWarmup: () => undefined,
        cancelHistoryCoverWarmup: () => undefined,
        stopHistoryCoverWarmup: () => undefined,
        chooseHistoryCoverTime: async (_video, fallbackTime) => fallbackTime,
        saveHistoryCover: async () => undefined,
        formatVideoDuration: () => "0s"
      },
      actions: {} as HistoryPageControllerOptions["actions"],
      filter: {} as HistoryPageControllerOptions["filter"],
      tags: {} as HistoryPageControllerOptions["tags"],
      historyLayout: "masonry" as const,
      isImageHistoryDetail: false,
      bindHistoryMasonry: () => undefined,
      bindHistoryAlbum: () => undefined,
      bindImageHistoryViewer: () => undefined,
      bindHistoryTitleMarquees: () => undefined,
      restoreHistoryLayoutAnchor: () => undefined,
      imageLightbox: {} as HistoryPageControllerOptions["imageLightbox"],
      openHistoryContextMenu: () => undefined,
      openImageHistoryContextMenu: () => undefined
    } satisfies HistoryPageControllerOptions;
    const cleanup = mountHistoryPageController(options);

    const rightArrow = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true
    });
    video.dispatchEvent(rightArrow);
    expect(video.currentTime).toBe(60);
    expect(rightArrow.defaultPrevented).toBe(true);

    const volumeArrow = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true
    });
    volumeRange.dispatchEvent(volumeArrow);
    expect(video.currentTime).toBe(60);
    expect(volumeArrow.defaultPrevented).toBe(false);

    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
    const normalModeLeftArrow = new KeyboardEvent("keydown", {
      key: "ArrowLeft",
      bubbles: true,
      cancelable: true
    });
    video.dispatchEvent(normalModeLeftArrow);
    expect(video.currentTime).toBe(50);
    expect(normalModeLeftArrow.defaultPrevented).toBe(true);
    cleanup();
  });
});

describe("history favorite synchronization", () => {
  it("updates player and sidebar buttons together and serializes rapid clicks", async () => {
    const state = createDefaultState();
    state.history = [{
      id: "video-1",
      favorite: false,
      rating: null,
      tags: [],
      versions: []
    } as typeof state.history[number]];
    const root = document.createElement("main");
    root.innerHTML = `
      <div data-history-player-utility aria-label="收藏">
        <button type="button" data-history-favorite="video-1" aria-pressed="false">player</button>
      </div>
      <button type="button" data-history-favorite="video-1" aria-pressed="false">sidebar</button>
    `;
    document.body.append(root);

    let resolveUpdate!: (nextState: ReturnType<typeof createDefaultState>) => void;
    const updateHistoryMetadata = vi.fn(() => new Promise<ReturnType<typeof createDefaultState>>((resolve) => {
      resolveUpdate = resolve;
    }));
    const context = createContext(root, () => state);
    const cleanup = mountHistoryActionsController(
      context,
      createActions(state, updateHistoryMetadata)
    );

    const buttons = root.querySelectorAll<HTMLButtonElement>("[data-history-favorite]");
    buttons[0]?.click();
    buttons[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(updateHistoryMetadata).toHaveBeenCalledTimes(1);
    expect(buttons[0]?.disabled).toBe(true);
    expect(buttons[1]?.disabled).toBe(true);

    const nextState = createDefaultState();
    nextState.history = [{
      id: "video-1",
      favorite: true,
      rating: null,
      tags: [],
      versions: []
    } as typeof nextState.history[number]];
    resolveUpdate(nextState);
    await Promise.resolve();
    await Promise.resolve();

    expect(buttons[0]?.classList.contains("is-favorite")).toBe(true);
    expect(buttons[1]?.classList.contains("is-favorite")).toBe(true);
    expect(buttons[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(buttons[1]?.getAttribute("aria-pressed")).toBe("true");
    expect(root.querySelector("[data-history-player-utility]")?.getAttribute("aria-label")).toBe("取消收藏");
    expect(buttons[0]?.disabled).toBe(false);
    expect(buttons[1]?.disabled).toBe(false);
    cleanup();
  });
});
