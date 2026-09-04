// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { RendererContext } from "../src/renderer/contracts";
import { createHistoryMediaRuntime } from "../src/renderer/pages/history/media-helpers.ts";
import {
  mountImageHistoryMediaController
} from "../src/renderer/pages/history/image-media-controller.ts";
import {
  mountHistoryMediaController,
  type HistoryMediaControllerOptions
} from "../src/renderer/pages/history/media-controller.ts";
import { mountHistoryNavigationController } from "../src/renderer/pages/history/navigation-controller.ts";

type FakeObserverEntry = {
  target: Element;
  isIntersecting: boolean;
  boundingClientRect: DOMRect;
};

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  private readonly callback: (entries: FakeObserverEntry[]) => void;

  constructor(callback: (entries: FakeObserverEntry[]) => void) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }

  observe(): void {}

  disconnect(): void {}

  trigger(
    target: Element,
    isIntersecting: boolean,
    top = 0,
    bottom = 200
  ): void {
    this.callback([{
      target,
      isIntersecting,
      boundingClientRect: { top, bottom } as DOMRect
    }]);
  }
}

function createContext(root: HTMLElement): RendererContext {
  return {
    root,
    application: {} as RendererContext["application"],
    events: {} as RendererContext["events"],
    assets: {} as RendererContext["assets"],
    hostCapabilities: {} as RendererContext["hostCapabilities"],
    getState: () => undefined,
    getRoute: () => ({ page: "history", creationMode: "image-to-video", historyKind: "image" }),
    getTranslator: () => {
      throw new Error("not used");
    },
    t: (key) => key,
    requestRender: () => undefined,
    navigate: () => undefined,
    enhancePrompt: async () => "",
    notify: () => undefined,
    reportUserAction: () => undefined
  };
}

function createImageSurface(root: HTMLElement, index: number): HTMLElement {
  const surface = document.createElement("div");
  surface.dataset.imageMedia = "true";
  surface.dataset.imageMediaSurface = "gallery";
  const image = document.createElement("img");
  image.dataset.imageMediaImage = "true";
  image.dataset.imageHistoryCacheKey = `image-${index}`;
  image.dataset.imageHistorySource = `C:\\fixtures\\image-${index}.png`;
  image.dataset.imageMediaUrl = `studio-media://image/${index}`;
  surface.append(image);
  root.append(surface);
  return surface;
}

function createVideoCard(root: HTMLElement, index: number): HTMLElement {
  const media = document.createElement("div");
  media.dataset.historyMedia = "true";
  media.dataset.coverKey = `video-${index}`;
  media.dataset.coverSource = `C:\\fixtures\\video-${index}.mp4`;
  media.dataset.previewDuration = "10";
  const video = document.createElement("video");
  video.dataset.historySrc = `studio-media://video/${index}`;
  media.append(video);
  root.append(media);
  return media;
}

async function flushPromises(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  FakeIntersectionObserver.instances = [];
  document.body.replaceChildren();
});

describe("history media controller scheduling", () => {
  it("waits for image intersection before loading a 500-card gallery", async () => {
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    const root = document.createElement("main");
    document.body.append(root);
    const surfaces = Array.from({ length: 500 }, (_, index) => createImageSurface(root, index));
    const loadImageHistoryThumbnail = vi.fn(async () => true);

    const cleanup = mountImageHistoryMediaController(createContext(root), {
      loadImageHistoryThumbnail
    });
    await flushPromises();

    expect(loadImageHistoryThumbnail).not.toHaveBeenCalled();
    expect(FakeIntersectionObserver.instances).toHaveLength(1);

    FakeIntersectionObserver.instances[0]?.trigger(surfaces[0]!, true);
    await flushPromises();
    expect(loadImageHistoryThumbnail).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("keeps image thumbnail work at the configured concurrency limit", async () => {
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    const root = document.createElement("main");
    document.body.append(root);
    const surfaces = Array.from({ length: 4 }, (_, index) => createImageSurface(root, index));
    let active = 0;
    let peak = 0;
    const finishers: Array<() => void> = [];
    const loadImageHistoryThumbnail = vi.fn(() => new Promise<boolean>((resolve) => {
      active += 1;
      peak = Math.max(peak, active);
      finishers.push(() => {
        active -= 1;
        resolve(true);
      });
    }));

    const cleanup = mountImageHistoryMediaController(createContext(root), {
      loadImageHistoryThumbnail
    });
    FakeIntersectionObserver.instances[0]?.trigger(surfaces[0]!, true);
    FakeIntersectionObserver.instances[0]?.trigger(surfaces[1]!, true);
    FakeIntersectionObserver.instances[0]?.trigger(surfaces[2]!, true);
    FakeIntersectionObserver.instances[0]?.trigger(surfaces[3]!, true);
    await flushPromises();

    expect(loadImageHistoryThumbnail).toHaveBeenCalledTimes(3);
    expect(peak).toBe(3);
    finishers[0]?.();
    await flushPromises();
    expect(loadImageHistoryThumbnail).toHaveBeenCalledTimes(4);
    finishers.slice(1).forEach((finish) => finish());
    await flushPromises();
    cleanup();
  });

  it("does not write an old image surface after cleanup aborts its task", async () => {
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    const root = document.createElement("main");
    document.body.append(root);
    const surface = createImageSurface(root, 0);
    let resolveLoad!: (loaded: boolean) => void;
    const loadImageHistoryThumbnail = vi.fn(() => new Promise<boolean>((resolve) => {
      resolveLoad = resolve;
    }));
    const cleanup = mountImageHistoryMediaController(createContext(root), {
      loadImageHistoryThumbnail
    });
    FakeIntersectionObserver.instances[0]?.trigger(surface, true);
    await flushPromises();
    expect(loadImageHistoryThumbnail).toHaveBeenCalledTimes(1);

    const stateBeforeCleanup = surface.dataset.imageMediaState;
    cleanup();
    resolveLoad(true);
    await flushPromises();
    expect(surface.dataset.imageMediaState).toBe(stateBeforeCleanup);
  });

  it("does not warm every video until the warmup observer reports a card", async () => {
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    const root = document.createElement("main");
    document.body.append(root);
    const cards = Array.from({ length: 500 }, (_, index) => createVideoCard(root, index));
    const scheduleHistoryCoverWarmup = vi.fn();
    const options: HistoryMediaControllerOptions = {
      loadImageHistoryThumbnail: async () => true,
      loadHistoryCoverFromCache: async () => false,
      loadHistoryCardVideo: () => null,
      releaseHistoryCardVideo: () => undefined,
      scheduleHistoryCoverWarmup,
      cancelHistoryCoverWarmup: () => undefined,
      stopHistoryCoverWarmup: () => undefined,
      chooseHistoryCoverTime: async (_video, fallbackTime) => fallbackTime,
      saveHistoryCover: async () => undefined,
      formatVideoDuration: () => "0s"
    };

    const cleanup = mountHistoryMediaController(createContext(root), options);
    await flushPromises();
    expect(FakeIntersectionObserver.instances).toHaveLength(2);
    expect(scheduleHistoryCoverWarmup).not.toHaveBeenCalled();

    FakeIntersectionObserver.instances[1]?.trigger(cards[300]!, true, 100, 300);
    expect(scheduleHistoryCoverWarmup).toHaveBeenCalledWith([cards[300]], "viewport");
    cleanup();
  });

  it("initializes a deep video card when it is hovered before its batch", () => {
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const root = document.createElement("main");
    document.body.append(root);
    const cards = Array.from({ length: 500 }, (_, index) => createVideoCard(root, index));
    const deepCard = cards[499]!;
    vi.spyOn(deepCard, "matches").mockImplementation((selector) => selector === ":hover");
    const loadHistoryCardVideo = vi.fn((media: HTMLElement) => media.querySelector("video"));
    const options: HistoryMediaControllerOptions = {
      loadImageHistoryThumbnail: async () => true,
      loadHistoryCoverFromCache: async () => false,
      loadHistoryCardVideo,
      releaseHistoryCardVideo: () => undefined,
      scheduleHistoryCoverWarmup: () => undefined,
      cancelHistoryCoverWarmup: () => undefined,
      stopHistoryCoverWarmup: () => undefined,
      chooseHistoryCoverTime: async (_video, fallbackTime) => fallbackTime,
      saveHistoryCover: async () => undefined,
      formatVideoDuration: () => "0s"
    };

    const cleanup = mountHistoryMediaController(createContext(root), options);
    deepCard.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

    expect(loadHistoryCardVideo).toHaveBeenCalledOnce();
    expect(loadHistoryCardVideo).toHaveBeenCalledWith(deepCard);
    cleanup();
  });

  it("keeps image recovery controls out of delegated card navigation", async () => {
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    const root = document.createElement("main");
    document.body.append(root);
    const card = document.createElement("article");
    card.dataset.openImageHistory = "project-500";
    const surface = createImageSurface(card, 500);
    const status = document.createElement("div");
    status.dataset.imageMediaStatus = "true";
    const retry = document.createElement("button");
    retry.dataset.imageMediaRetry = "true";
    status.append(retry);
    surface.append(status);
    root.append(card);
    const loadImageHistoryThumbnail = vi.fn(async () => true);
    const openImageHistoryDetail = vi.fn();
    const context = createContext(root);
    const cleanupMedia = mountImageHistoryMediaController(context, { loadImageHistoryThumbnail });
    const cleanupNavigation = mountHistoryNavigationController(context, {
      setHistoryKind: vi.fn(),
      resetHistoryScroll: vi.fn(),
      switchHistoryLayout: vi.fn(),
      openHistoryDetail: vi.fn(),
      openImageHistoryDetail,
      navigateHistoryDetail: vi.fn(),
      navigateImageHistoryDetail: vi.fn(),
      navigateImageHistoryVersion: vi.fn(),
      selectVideoHistoryVersion: vi.fn(),
      selectImageHistoryVersion: vi.fn()
    });

    retry.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    retry.click();
    await flushPromises();

    expect(loadImageHistoryThumbnail).toHaveBeenCalledOnce();
    expect(openImageHistoryDetail).not.toHaveBeenCalled();
    cleanupNavigation();
    cleanupMedia();
  });

  it("handles navigation controls inserted after the controller mounts", () => {
    const root = document.createElement("main");
    document.body.append(root);
    const navigateHistoryDetail = vi.fn();
    const context = {
      ...createContext(root),
      getRoute: () => ({ page: "history-detail", creationMode: "image-to-video", historyKind: "video" as const })
    } as RendererContext;
    const cleanup = mountHistoryNavigationController(context, {
      setHistoryKind: vi.fn(),
      resetHistoryScroll: vi.fn(),
      switchHistoryLayout: vi.fn(),
      openHistoryDetail: vi.fn(),
      openImageHistoryDetail: vi.fn(),
      navigateHistoryDetail,
      navigateImageHistoryDetail: vi.fn(),
      navigateImageHistoryVersion: vi.fn(),
      selectVideoHistoryVersion: vi.fn(),
      selectImageHistoryVersion: vi.fn()
    });

    const controlBar = document.createElement("media-control-bar");
    const button = document.createElement("button");
    button.dataset.historyNavigation = "1";
    controlBar.append(button);
    root.append(controlBar);

    button.click();

    expect(navigateHistoryDetail).toHaveBeenCalledWith(1);
    cleanup();
  });

  it("does not report a warmup error when hover interrupts the temporary video", async () => {
    const root = document.createElement("main");
    document.body.append(root);
    const media = createVideoCard(root, 0);
    let hovered = false;
    vi.spyOn(media, "matches").mockImplementation((selector) => selector === ":hover" && hovered);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(function (this: HTMLMediaElement) {
      if (hovered) return;
      hovered = true;
      this.dispatchEvent(new Event("loadeddata"));
    });
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const assets = {
      readHistoryCover: vi.fn(async () => null),
      saveHistoryCover: vi.fn(async () => false)
    } as unknown as RendererContext["assets"];
    const application = {
      reportRendererError: vi.fn(async () => undefined)
    } as unknown as RendererContext["application"];
    const context = {
      ...createContext(root),
      assets,
      application,
      getRoute: () => ({ page: "history", creationMode: "image-to-video", historyKind: "video" as const })
    } as RendererContext;
    const runtime = createHistoryMediaRuntime(context, () => true);

    runtime.scheduleHistoryCoverWarmup([media], "viewport");
    await flushPromises();

    expect(media.classList.contains("media-error")).toBe(false);
    runtime.stopHistoryCoverWarmup();
  });
});
