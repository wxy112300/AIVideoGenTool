// @vitest-environment jsdom

import { writeFileSync } from "node:fs";
import { env } from "node:process";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "../src/types";
import type { RendererContext } from "../src/renderer/contracts";
import { defaultHistoryFilter } from "../src/core/history-filter";
import {
  historyAssetsByNewest,
  historyCoverCacheKey,
  historyCoverSeed,
  historyInitialCoverTime,
  historyMediaUrl,
  historyResolutionLabel,
  imageHistoryMediaUrl,
  imageHistoryThumbnailCacheKey,
  imageHistoryGenerationSummary,
  imageProjectsByNewest,
  imageProjectCoverVersion,
  preferredImageVersion,
  preferredVersion,
  currentImageHistoryVersion,
  currentHistoryVersion,
  versionShortEdge,
  versionVideoIndex
} from "../src/renderer/pages/history/helpers.ts";
import {
  formatElapsedDuration,
  formatFullHistoryTime,
  formatVideoDuration,
  historyRenderDuration
} from "../src/renderer/shared/formatters.ts";
import { escapeHtml } from "../src/renderer/shared/dom.ts";
import { icon } from "../src/renderer/shared/icons.ts";
import {
  renderHistoryPage,
  renderImageHistoryPage,
  type HistoryPageOptions,
  type HistoryPageViewModel
} from "../src/renderer/pages/history/page.ts";
import { mountImageHistoryMediaController } from "../src/renderer/pages/history/image-media-controller.ts";
import {
  mountHistoryMediaController,
  type HistoryMediaControllerOptions
} from "../src/renderer/pages/history/media-controller.ts";
import { createHistoryMediaScheduler } from "../src/renderer/pages/history/media-scheduler.ts";
import { createHistoryPerformanceFixture } from "./fixtures/history-performance.ts";

type HistoryBenchmarkKind = "video" | "image";
type HistoryBenchmarkLayout = "masonry" | "album";

interface FakeObserverEntry {
  target: Element;
  isIntersecting: boolean;
  top: number;
  bottom: number;
}

class BenchmarkIntersectionObserver {
  static instances: BenchmarkIntersectionObserver[] = [];
  readonly rootMargin: string;
  private readonly callback: IntersectionObserverCallback;
  private readonly targets = new Set<Element>();

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.rootMargin = options?.rootMargin ?? "";
    BenchmarkIntersectionObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.targets.add(target);
  }

  disconnect(): void {
    this.targets.clear();
  }

  trigger(target: Element, isIntersecting: boolean, top = 0, bottom = 200): void {
    if (!this.targets.has(target)) return;
    const entry = {
      target,
      isIntersecting,
      boundingClientRect: { top, bottom } as DOMRect
    } as IntersectionObserverEntry;
    this.callback([entry], this as unknown as IntersectionObserver);
  }
}

interface HistoryBenchmarkResult {
  kind: HistoryBenchmarkKind;
  layout: HistoryBenchmarkLayout;
  records: number;
  renderedCards: number;
  renderMs: number;
  domParseMs: number;
  controllerMountMs: number;
  imageLoaderCallsAtMount: number;
  imageLoaderCallsAfterViewport: number;
  imagePeakConcurrency: number;
  videoCacheReadsAtMount: number;
  videoCacheReadsAfterViewport: number;
  videoWarmupTasksAtMount: number;
  videoWarmupTasksAfterViewport: number;
  videoPeakConcurrency: number;
}

const translate: HistoryPageOptions["t"] = (key) => key;
const renderOptions: HistoryPageOptions = {
  t: translate,
  icon,
  escapeHtml,
  formatBytes: (value) => `${value} B`,
  videoLoraPurposeLabel: (purpose) => purpose,
  h3ReferenceRoleLabel: (role) => role,
  imageReferenceRoleLabel: (role) => role,
  modelName: (modelId) => modelId || "fixture",
  formatFullHistoryTime,
  formatVideoDuration,
  formatElapsedDuration: (seconds) => formatElapsedDuration(seconds, translate),
  historyAssetsByNewest,
  imageProjectsByNewest,
  historyFilterModelIds: () => [],
  historyFilterTagNames: () => [],
  preferredVersion,
  currentHistoryVersion,
  historyMediaUrl,
  historyCoverCacheKey,
  historyCoverSeed,
  historyInitialCoverTime,
  historyResolutionLabel: (asset, version) => historyResolutionLabel(asset, version, translate),
  historyRenderDuration: (version) => historyRenderDuration(version, translate),
  versionVideoIndex,
  versionShortEdge,
  preferredImageVersion,
  currentImageHistoryVersion,
  imageHistoryMediaUrl,
  imageHistoryThumbnailCacheKey,
  imageProjectCoverVersion,
  isRetiredVideoModel: () => false,
  imageHistoryGenerationSummary: (version) => imageHistoryGenerationSummary(version, translate)
};

function createContext(root: HTMLElement, kind: HistoryBenchmarkKind): RendererContext {
  return {
    root,
    application: {} as RendererContext["application"],
    events: {} as RendererContext["events"],
    assets: {} as RendererContext["assets"],
    hostCapabilities: {} as RendererContext["hostCapabilities"],
    getState: () => undefined,
    getRoute: () => ({ page: "history", creationMode: "image-to-video", historyKind: kind }),
    getTranslator: () => {
      throw new Error("not used");
    },
    t: translate,
    requestRender: () => undefined,
    navigate: () => undefined,
    notify: () => undefined,
    reportUserAction: () => undefined
  };
}

function benchmarkViewModel(
  state: AppState,
  kind: HistoryBenchmarkKind,
  layout: HistoryBenchmarkLayout
): HistoryPageViewModel {
  return {
    state,
    historyKind: kind,
    historyLayout: layout,
    historyFilter: defaultHistoryFilter,
    historyFilterPanelOpen: false,
    selectedHistoryAssetId: "",
    selectedHistoryVersionId: ""
  };
}

function roundMilliseconds(value: number): number {
  return Math.round(value * 100) / 100;
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 16; index += 1) await Promise.resolve();
}

async function runHistoryBenchmark(
  state: AppState,
  kind: HistoryBenchmarkKind,
  layout: HistoryBenchmarkLayout
): Promise<HistoryBenchmarkResult> {
  const root = document.createElement("main");
  document.body.append(root);
  const viewModel = benchmarkViewModel(state, kind, layout);
  const renderStart = performance.now();
  const markup = kind === "video"
    ? renderHistoryPage(viewModel, renderOptions)
    : renderImageHistoryPage(viewModel, renderOptions);
  const renderMs = performance.now() - renderStart;
  const domParseStart = performance.now();
  root.innerHTML = markup;
  const domParseMs = performance.now() - domParseStart;
  const records = kind === "video" ? state.history.length : state.imageHistory.length;
  const renderedCards = root.querySelectorAll(".history-gallery-item").length;

  let imageActive = 0;
  let imagePeak = 0;
  const loadImageHistoryThumbnail = vi.fn((image: HTMLImageElement, signal?: AbortSignal) => {
    if (signal?.aborted) return Promise.resolve(false);
    imageActive += 1;
    imagePeak = Math.max(imagePeak, imageActive);
    return Promise.resolve(true).finally(() => {
      imageActive -= 1;
    });
  });

  let videoActive = 0;
  let videoPeak = 0;
  const videoScheduler = createHistoryMediaScheduler(1);
  const scheduleHistoryCoverWarmup = vi.fn((mediaCards: HTMLElement[]) => {
    mediaCards.forEach((media) => {
      const key = media.dataset.coverKey ?? "";
      if (!key) return;
      videoScheduler.enqueue(key, async (signal) => {
        if (signal.aborted) return false;
        videoActive += 1;
        videoPeak = Math.max(videoPeak, videoActive);
        await Promise.resolve();
        videoActive -= 1;
        return true;
      }, "viewport");
    });
  });
  const loadHistoryCoverFromCache = vi.fn(async () => false);
  const videoOptions: HistoryMediaControllerOptions = {
    loadImageHistoryThumbnail,
    loadHistoryCoverFromCache,
    loadHistoryCardVideo: (media) => media.querySelector<HTMLVideoElement>("video"),
    releaseHistoryCardVideo: () => undefined,
    scheduleHistoryCoverWarmup,
    cancelHistoryCoverWarmup: (media) => {
      const key = media.dataset.coverKey;
      if (key) videoScheduler.cancel(key);
    },
    stopHistoryCoverWarmup: () => videoScheduler.clear(),
    chooseHistoryCoverTime: async (_video, fallbackTime) => fallbackTime,
    saveHistoryCover: async () => undefined,
    formatVideoDuration
  };
  const observerStart = BenchmarkIntersectionObserver.instances.length;
  const mountStart = performance.now();
  const cleanup = kind === "video"
    ? mountHistoryMediaController(createContext(root, kind), videoOptions)
    : mountImageHistoryMediaController(createContext(root, kind), { loadImageHistoryThumbnail });
  const controllerMountMs = performance.now() - mountStart;
  const imageLoaderCallsAtMount = loadImageHistoryThumbnail.mock.calls.length;
  const videoCacheReadsAtMount = loadHistoryCoverFromCache.mock.calls.length;
  const videoWarmupTasksAtMount = scheduleHistoryCoverWarmup.mock.calls.length;

  const gallerySurfaces = [...root.querySelectorAll<HTMLElement>(
    kind === "video" ? "[data-history-media]" : "[data-image-media-surface=gallery]"
  )];
  const visibleSurfaces = gallerySurfaces.slice(0, 12);
  const observers = BenchmarkIntersectionObserver.instances.slice(observerStart);
  if (kind === "image") {
    observers
      .find((observer) => observer.rootMargin === "600px 0px")
      ?.trigger(visibleSurfaces[0]!, true);
    visibleSurfaces.slice(1).forEach((surface) => {
      observers
        .find((observer) => observer.rootMargin === "600px 0px")
        ?.trigger(surface, true);
    });
  } else {
    const cacheObserver = observers
      .find((observer) => observer.rootMargin === "800px 0px");
    const warmupObserver = observers
      .find((observer) => observer.rootMargin === "320px 0px");
    visibleSurfaces.forEach((surface) => {
      cacheObserver?.trigger(surface, true);
      warmupObserver?.trigger(surface, true);
    });
  }
  await flushMicrotasks();
  const result: HistoryBenchmarkResult = {
    kind,
    layout,
    records,
    renderedCards,
    renderMs: roundMilliseconds(renderMs),
    domParseMs: roundMilliseconds(domParseMs),
    controllerMountMs: roundMilliseconds(controllerMountMs),
    imageLoaderCallsAtMount,
    imageLoaderCallsAfterViewport: loadImageHistoryThumbnail.mock.calls.length,
    imagePeakConcurrency: imagePeak,
    videoCacheReadsAtMount,
    videoCacheReadsAfterViewport: loadHistoryCoverFromCache.mock.calls.length,
    videoWarmupTasksAtMount,
    videoWarmupTasksAfterViewport: scheduleHistoryCoverWarmup.mock.calls.length,
    videoPeakConcurrency: videoPeak
  };
  cleanup();
  root.remove();
  videoScheduler.dispose();
  return result;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  BenchmarkIntersectionObserver.instances = [];
  document.body.replaceChildren();
});

describe("synthetic History performance benchmark", () => {
  it("renders and mounts 500 video/image records without full-table media work", async () => {
    vi.stubGlobal("IntersectionObserver", BenchmarkIntersectionObserver);
    const fixture = createHistoryPerformanceFixture(500);
    const state = {
      history: fixture.videos,
      imageHistory: fixture.images
    } as unknown as AppState;
    const results: HistoryBenchmarkResult[] = [];

    for (const kind of ["video", "image"] as const) {
      for (const layout of ["masonry", "album"] as const) {
        results.push(await runHistoryBenchmark(state, kind, layout));
      }
    }

    expect(results).toHaveLength(4);
    results.forEach((result) => {
      expect(result.records).toBe(500);
      expect(result.renderedCards).toBe(500);
      expect(result.controllerMountMs).toBeGreaterThanOrEqual(0);
    });
    const videoResults = results.filter((result) => result.kind === "video");
    const imageResults = results.filter((result) => result.kind === "image");
    expect(videoResults.every((result) => result.videoCacheReadsAtMount === 0)).toBe(true);
    expect(videoResults.every((result) => result.videoWarmupTasksAtMount === 0)).toBe(true);
    expect(videoResults.every((result) => result.videoPeakConcurrency <= 1)).toBe(true);
    expect(imageResults.every((result) => result.imageLoaderCallsAtMount === 0)).toBe(true);
    expect(imageResults.every((result) => result.imagePeakConcurrency <= 3)).toBe(true);

    console.log("\nSynthetic History benchmark (500 records; no real media files):");
    console.table(results);
    const outputPath = env.HISTORY_PERF_OUTPUT?.trim();
    if (outputPath) writeFileSync(outputPath, JSON.stringify(results, null, 2), "utf8");
  });
});
