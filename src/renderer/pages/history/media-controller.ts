import type { RendererCleanup, RendererContext } from "../../contracts";

export interface HistoryMediaControllerOptions {
  loadImageHistoryThumbnail(image: HTMLImageElement): Promise<void>;
  loadHistoryCoverFromCache(media: HTMLElement): Promise<boolean>;
  loadHistoryCardVideo(media: HTMLElement): HTMLVideoElement | null;
  releaseHistoryCardVideo(media: HTMLElement): void;
  scheduleHistoryCoverWarmup(mediaCards: HTMLElement[]): void;
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

  root.querySelectorAll<HTMLImageElement>("[data-image-history-preview]").forEach((image) => {
    void options.loadImageHistoryThumbnail(image);
  });

  const historyMediaCards = [...root.querySelectorAll<HTMLElement>("[data-history-media]")];
  historyMediaCards.forEach((media) => {
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
    const coverSeed = Number(media.dataset.coverSeed) || 0;
    let coverSelectionStarted = false;
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
    const startSmartCoverSelection = () => {
      if (
        coverSelectionStarted ||
        video.readyState < 2 ||
        media.dataset.historyCoverCached === "true" ||
        media.matches(":hover") ||
        media.classList.contains("playing")
      ) return;
      coverSelectionStarted = true;
      const duration = previewDuration();
      const isActive = () =>
        video.dataset.historyLoaded === "true" &&
        media.isConnected &&
        !media.matches(":hover") &&
        !media.classList.contains("playing");
      void options.chooseHistoryCoverTime(
        video,
        coverTime,
        duration,
        coverSeed,
        isActive
      ).then((selectedTime) => {
        if (video.dataset.historyLoaded !== "true" || !media.isConnected) return;
        coverTime = selectedTime;
        media.dataset.coverTime = String(selectedTime);
        if (isActive()) {
          seekCover();
          void options.saveHistoryCover(media, video, isActive);
        }
      });
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
      startSmartCoverSelection();
    };
    if (video.readyState >= 1) prepareVideo();
    video.addEventListener("loadedmetadata", prepareVideo, { signal });
    video.addEventListener("loadeddata", startSmartCoverSelection, { once: true, signal });
    video.addEventListener("timeupdate", () => {
      pendingSeekRatio = null;
      updatePreviewProgress();
    }, { signal });
    progress?.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      seeking = true;
      resumeAfterSeek = !video.paused;
      video.pause();
      media.classList.add("playing");
      progress.setPointerCapture(event.pointerId);
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
      if (progress?.hasPointerCapture(event.pointerId)) {
        progress.releasePointerCapture(event.pointerId);
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
    media.addEventListener("mouseenter", () => {
      options.loadHistoryCardVideo(media);
      seekToRatio(0);
      media.classList.add("playing");
      void video.play().catch(() => undefined);
    }, { signal });
    media.addEventListener("mouseleave", () => {
      if (seeking) return;
      media.classList.remove("playing");
      video.pause();
      seekCover();
    }, { signal });
  });

  const loadHistoryCardMedia = (media: HTMLElement) => {
    void options.loadHistoryCoverFromCache(media).then((cached) => {
      if (!cached) options.loadHistoryCardVideo(media);
    });
  };
  let historyMediaObserver: IntersectionObserver | null = null;
  if (typeof IntersectionObserver === "undefined") {
    historyMediaCards.forEach(loadHistoryCardMedia);
  } else {
    historyMediaObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const media = entry.target as HTMLElement;
        if (entry.isIntersecting) {
          loadHistoryCardMedia(media);
        } else if (!media.matches(":hover") && !media.classList.contains("playing")) {
          options.releaseHistoryCardVideo(media);
        }
      });
    }, { rootMargin: "320px 0px" });
    historyMediaCards.forEach((media) => historyMediaObserver?.observe(media));
  }
  options.scheduleHistoryCoverWarmup(historyMediaCards);

  return () => {
    events.abort();
    historyMediaObserver?.disconnect();
    options.stopHistoryCoverWarmup();
  };
}
