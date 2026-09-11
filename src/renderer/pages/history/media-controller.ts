import type { RendererCleanup, RendererContext } from "../../contracts";
import {
  scheduleHistoryBatches,
  type HistoryMediaTaskPriority
} from "./media-scheduler";
import type { MediaResourceConsumer } from "./media-resource-store";

export interface HistoryMediaControllerOptions {
  loadImageHistoryThumbnail(image: HTMLImageElement, signal?: AbortSignal): Promise<boolean>;
  subscribeImageHistoryThumbnail?(
    image: HTMLImageElement,
    priority: HistoryMediaTaskPriority,
    consumer: Omit<MediaResourceConsumer, "priority" | "signal">
  ): () => void;
  invalidateImageHistoryThumbnail?(key: string): void;
  loadHistoryCoverFromCache(media: HTMLElement, signal?: AbortSignal): Promise<boolean>;
  subscribeHistoryCover?(media: HTMLElement, priority: HistoryMediaTaskPriority): () => void;
  loadHistoryCardVideo(media: HTMLElement): HTMLVideoElement | null;
  releaseHistoryCardVideo(media: HTMLElement): void;
  scheduleHistoryCoverWarmup(mediaCards: HTMLElement[], priority?: HistoryMediaTaskPriority): void;
  cancelHistoryCoverWarmup(media: HTMLElement): void;
  stopHistoryCoverWarmup(): void;
  chooseHistoryCoverTime(
    video: HTMLVideoElement,
    fallbackTime: number,
    duration: number,
    seed: number,
    isActive: () => boolean
  ): Promise<number>;
  saveHistoryCover(
    media: HTMLElement,
    video: HTMLVideoElement,
    isActive: () => boolean
  ): Promise<void>;
  formatVideoDuration(seconds: number): string;
}

export function mountHistoryMediaController(
  context: RendererContext,
  options: HistoryMediaControllerOptions
): RendererCleanup {
  const events = new AbortController();
  const signal = events.signal;
  const root = context.root;

  let hoverTimer: number | null = null;
  let hoverTarget: HTMLElement | null = null;
  let activeHoverMedia: HTMLElement | null = null;
  let retainedHoverMedia: HTMLElement | null = null;
  let retainedHoverTimer: number | null = null;
  const previewStarts = new Map<HTMLElement, () => void>();
  const warmupPriorities = new Map<HTMLElement, HistoryMediaTaskPriority>();

  const resumeBackgroundWarmup = (): void => {
    if (activeHoverMedia || retainedHoverMedia || signal.aborted) return;
    for (const [media, priority] of warmupPriorities) {
      if (media.isConnected) options.scheduleHistoryCoverWarmup([media], priority);
    }
  };

  const clearHoverTimer = (media?: HTMLElement): void => {
    if (media && hoverTarget !== media) return;
    if (hoverTimer !== null) window.clearTimeout(hoverTimer);
    hoverTimer = null;
    hoverTarget = null;
  };

  const clearRetainedHover = (): void => {
    if (retainedHoverTimer !== null) window.clearTimeout(retainedHoverTimer);
    retainedHoverTimer = null;
    retainedHoverMedia = null;
  };

  const releaseHoverMedia = (media: HTMLElement, scheduleWarmup: boolean): void => {
    const video = media.querySelector<HTMLVideoElement>("video");
    if (video) {
      video.pause();
      options.releaseHistoryCardVideo(media);
    }
    media.classList.remove("playing");
    if (scheduleWarmup && media.isConnected) {
      options.scheduleHistoryCoverWarmup([media], "viewport");
    }
  };

  const confirmHover = (media: HTMLElement): void => {
    clearHoverTimer(media);
    if (!media.isConnected) return;
    if (retainedHoverMedia) {
      if (retainedHoverMedia !== media) releaseHoverMedia(retainedHoverMedia, false);
      clearRetainedHover();
    }
    if (activeHoverMedia && activeHoverMedia !== media) {
      releaseHoverMedia(activeHoverMedia, false);
      activeHoverMedia = null;
    }
    options.stopHistoryCoverWarmup();
    previewStarts.get(media)?.();
    activeHoverMedia = media;
  };

  const requestHover = (media: HTMLElement): void => {
    if (activeHoverMedia === media) return;
    clearHoverTimer();
    hoverTarget = media;
    hoverTimer = window.setTimeout(() => confirmHover(media), 120);
  };

  const leaveHover = (media: HTMLElement): void => {
    clearHoverTimer(media);
    if (activeHoverMedia !== media) return;
    activeHoverMedia = null;
    media.classList.remove("playing");
    media.querySelector<HTMLVideoElement>("video")?.pause();
    clearRetainedHover();
    retainedHoverMedia = media;
    retainedHoverTimer = window.setTimeout(() => {
      if (retainedHoverMedia !== media) return;
      releaseHoverMedia(media, true);
      clearRetainedHover();
      resumeBackgroundWarmup();
    }, 500);
  };

  const historyMediaCards = [...root.querySelectorAll<HTMLElement>("[data-history-media]")];
  const initializedMediaCards = new WeakSet<HTMLElement>();
  const setupMediaCard = (media: HTMLElement) => {
    if (initializedMediaCards.has(media)) return;
    initializedMediaCards.add(media);
    const video = media.querySelector<HTMLVideoElement>("video");
    if (!video) return;
    video.addEventListener("error", () => {
      media.classList.remove("playing");
      media.classList.remove("media-loading", "media-ready");
      if (media.dataset.historyCoverCached === "true") return;
      media.classList.add("media-error");
    }, { signal });
    video.addEventListener("loadeddata", () => {
      media.classList.remove("media-loading", "media-error");
      media.classList.add("media-ready");
    }, { signal });
    const progress = media.querySelector<HTMLButtonElement>(".history-preview-progress");
    const fill = progress?.querySelector<HTMLElement>("i");
    const fallbackDuration = Number(media.dataset.previewDuration) || 0;
    let pendingSeekRatio: number | null = null;
    let seeking = false;
    let resumeAfterSeek = false;
    let coverTime = Number(media.dataset.coverTime) || 0;
    const previewDuration = () =>
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : fallbackDuration;
    const updatePreviewProgress = () => {
      if (!progress || !fill) return;
      const duration = previewDuration();
      if (!duration) return;
      const ratio = pendingSeekRatio ?? Math.min(1, Math.max(0, video.currentTime / duration));
      fill.style.width = `${ratio * 100}%`;
      progress.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
      progress.setAttribute(
        "aria-valuetext",
        `${options.formatVideoDuration(ratio * duration)} / ${options.formatVideoDuration(duration)}`
      );
    };
    const seekToRatio = (value: number) => {
      const ratio = Math.min(1, Math.max(0, value));
      const duration = previewDuration();
      if (!duration) return;
      if (video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0) {
        try {
          video.currentTime = ratio * video.duration;
          pendingSeekRatio = null;
        } catch {
          pendingSeekRatio = ratio;
        }
      } else {
        pendingSeekRatio = ratio;
      }
      updatePreviewProgress();
    };
    const seekToPointer = (clientX: number) => {
      if (!progress) return;
      const bounds = progress.getBoundingClientRect();
      if (bounds.width <= 0) return;
      seekToRatio((clientX - bounds.left) / bounds.width);
    };
    const seekCover = () => {
      if (video.readyState < 1) return;
      try {
        video.currentTime = Math.min(coverTime, Math.max(0, video.duration - 0.05));
        pendingSeekRatio = null;
        updatePreviewProgress();
      } catch {
        return;
      }
    };
    const prepareVideo = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        media.style.setProperty(
          "--media-ratio",
          `${video.videoWidth} / ${video.videoHeight}`
        );
      }
      if (pendingSeekRatio == null) seekCover();
      else seekToRatio(pendingSeekRatio);
    };
    if (video.readyState >= 1) prepareVideo();
    video.addEventListener("loadedmetadata", prepareVideo, { signal });
    video.addEventListener("timeupdate", () => {
      pendingSeekRatio = null;
      updatePreviewProgress();
    }, { signal });
    progress?.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      confirmHover(media);
      seeking = true;
      resumeAfterSeek = !video.paused;
      video.pause();
      media.classList.add("playing");
      progress.setPointerCapture?.(event.pointerId);
      seekToPointer(event.clientX);
    }, { signal });
    progress?.addEventListener("pointermove", (event) => {
      if (!seeking) return;
      event.preventDefault();
      event.stopPropagation();
      seekToPointer(event.clientX);
    }, { signal });
    const finishSeeking = (event: PointerEvent, commit: boolean) => {
      if (!seeking) return;
      event.preventDefault();
      event.stopPropagation();
      if (commit) seekToPointer(event.clientX);
      seeking = false;
      if (progress?.hasPointerCapture?.(event.pointerId)) {
        progress.releasePointerCapture?.(event.pointerId);
      }
      if (resumeAfterSeek) void video.play().catch(() => undefined);
      resumeAfterSeek = false;
    };
    progress?.addEventListener("pointerup", (event) => finishSeeking(event, true), { signal });
    progress?.addEventListener("pointercancel", (event) => finishSeeking(event, false), { signal });
    progress?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.detail > 0) seekToPointer(event.clientX);
    }, { signal });
    progress?.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      event.stopPropagation();
      const current = pendingSeekRatio ?? (previewDuration() > 0
        ? video.currentTime / previewDuration()
        : 0);
      seekToRatio(current + (event.key === "ArrowRight" ? 0.05 : -0.05));
    }, { signal });
    const startPreview = () => {
      options.cancelHistoryCoverWarmup(media);
      options.loadHistoryCardVideo(media);
      seekToRatio(0);
      media.classList.add("playing");
      void video.play().catch(() => undefined);
    };
    previewStarts.set(media, startPreview);
    media.addEventListener("mouseenter", () => requestHover(media), { signal });
    media.addEventListener("mouseleave", () => {
      if (seeking) return;
      seekCover();
      leaveHover(media);
    }, { signal });
    if (media.matches(":hover")) requestHover(media);
  };
  const setupMediaCardFromEvent = (event: Event): void => {
    const target = event.target instanceof Element ? event.target : null;
    const media = target?.closest<HTMLElement>("[data-history-media]");
    if (media && root.contains(media)) setupMediaCard(media);
  };
  root.addEventListener("mouseover", setupMediaCardFromEvent, { signal });
  root.addEventListener("focusin", setupMediaCardFromEvent, { signal });
  root.addEventListener("pointerdown", setupMediaCardFromEvent, { capture: true, signal });
  const cancelSetup = scheduleHistoryBatches(historyMediaCards, setupMediaCard);

  const loadHistoryCardCover = (media: HTMLElement) => {
    if (options.subscribeHistoryCover) return;
    void options.loadHistoryCoverFromCache(media, signal);
  };
  let historyCoverCacheObserver: IntersectionObserver | null = null;
  let historyCoverWarmupObserver: IntersectionObserver | null = null;
  let cancelObserverSetup: (() => void) | null = null;
  let fallbackWarmupFrame: number | null = null;
  if (typeof IntersectionObserver === "undefined") {
    const scheduleNearViewport = () => {
      if (signal.aborted) return;
      historyMediaCards.forEach((media) => {
        const bounds = media.getBoundingClientRect();
        const nearViewport = bounds.bottom >= -320 && bounds.top <= window.innerHeight + 320;
        if (nearViewport) {
          const priority = bounds.bottom > 0 && bounds.top < window.innerHeight
            ? "viewport"
            : "prefetch";
          warmupPriorities.set(media, priority);
          options.scheduleHistoryCoverWarmup([media], priority);
        } else {
          warmupPriorities.delete(media);
          if (!media.matches(":hover") && !media.classList.contains("playing")) {
            options.cancelHistoryCoverWarmup(media);
            options.releaseHistoryCardVideo(media);
          }
        }
      });
    };
    const scheduleOnScroll = () => {
      if (fallbackWarmupFrame !== null) return;
      fallbackWarmupFrame = window.requestAnimationFrame(() => {
        fallbackWarmupFrame = null;
        scheduleNearViewport();
      });
    };
    window.addEventListener("scroll", scheduleOnScroll, { passive: true, signal });
    scheduleNearViewport();
  } else {
    if (!options.subscribeHistoryCover) {
      historyCoverCacheObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const media = entry.target as HTMLElement;
          if (entry.isIntersecting) loadHistoryCardCover(media);
        });
      }, { rootMargin: "800px 0px", threshold: 0 });
    }
    historyCoverWarmupObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const media = entry.target as HTMLElement;
        if (entry.isIntersecting) {
          const bounds = entry.boundingClientRect;
          const priority = bounds.bottom > 0 && bounds.top < window.innerHeight
            ? "viewport"
            : "prefetch";
          warmupPriorities.set(media, priority);
          options.scheduleHistoryCoverWarmup([media], priority);
        } else {
          warmupPriorities.delete(media);
          if (!media.matches(":hover") && !media.classList.contains("playing")) {
            options.cancelHistoryCoverWarmup(media);
            options.releaseHistoryCardVideo(media);
          }
        }
      });
    }, { rootMargin: "320px 0px" });
    cancelObserverSetup = scheduleHistoryBatches(historyMediaCards, (media) => {
      historyCoverCacheObserver?.observe(media);
      historyCoverWarmupObserver?.observe(media);
    }, 32);
  }

  return () => {
    cancelSetup();
    events.abort();
    if (fallbackWarmupFrame !== null) {
      window.cancelAnimationFrame(fallbackWarmupFrame);
      fallbackWarmupFrame = null;
    }
    cancelObserverSetup?.();
    cancelObserverSetup = null;
    historyCoverCacheObserver?.disconnect();
    historyCoverWarmupObserver?.disconnect();
    options.stopHistoryCoverWarmup();
    clearHoverTimer();
    if (retainedHoverMedia) releaseHoverMedia(retainedHoverMedia, false);
    clearRetainedHover();
    if (activeHoverMedia) releaseHoverMedia(activeHoverMedia, false);
    activeHoverMedia = null;
    warmupPriorities.clear();
    previewStarts.clear();
  };
}
