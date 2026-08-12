import type { RendererContext } from "../../contracts";
import { uiKeys } from "../../../core/i18n-keys";
import type { HistoryMediaControllerOptions } from "./media-controller";
import { historyCoverCandidates } from "./helpers";

const HISTORY_COVER_MAX_EDGE = 640;
const IMAGE_HISTORY_THUMBNAIL_MAX_EDGE = 640;

type HistoryMediaRuntime = Omit<HistoryMediaControllerOptions, "formatVideoDuration"> & {
  clearImageHistoryThumbnailCache(): void;
};

export function createHistoryMediaRuntime(
  context: RendererContext,
  isHistoryListPage: () => boolean
): HistoryMediaRuntime {
  const historyCoverDataUrls = new Map<string, string>();
  const imageHistoryThumbnailDataUrls = new Map<string, string>();
  let historyCoverWarmupController: AbortController | null = null;
  let historyCoverWarmupTimer: number | undefined;

  const loadImageHistoryThumbnail = async (image: HTMLImageElement): Promise<void> => {
    const key = image.dataset.imageHistoryCacheKey ?? "";
    const sourcePath = image.dataset.imageHistorySource ?? "";
    if (!key || !sourcePath || !image.isConnected) return;
    try {
      const cached = imageHistoryThumbnailDataUrls.get(key) ??
        await context.studio.readHistoryCover(key, sourcePath);
      if (cached) {
        imageHistoryThumbnailDataUrls.set(key, cached);
        if (image.isConnected) image.src = cached;
        return;
      }
      const sourceData = await context.studio.readImage(sourcePath);
      if (!sourceData || !image.isConnected) return;
      const source = document.createElement("img");
      source.src = sourceData;
      await source.decode();
      if (!source.naturalWidth || !source.naturalHeight) return;
      const scale = Math.min(
        1,
        IMAGE_HISTORY_THUMBNAIL_MAX_EDGE / Math.max(source.naturalWidth, source.naturalHeight)
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
      const canvasContext = canvas.getContext("2d");
      if (!canvasContext) return;
      canvasContext.drawImage(source, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", .88));
      if (!blob || blob.size > 2 * 1024 * 1024 || !image.isConnected) return;
      const saved = await context.studio.saveHistoryCover(key, sourcePath, await blob.arrayBuffer());
      if (!saved || !image.isConnected) return;
      const savedUrl = await context.studio.readHistoryCover(key, sourcePath);
      if (savedUrl) {
        imageHistoryThumbnailDataUrls.set(key, savedUrl);
        if (image.isConnected) image.src = savedUrl;
      }
    } catch {
    }
  };

  const loadHistoryCardVideo = (media: HTMLElement): HTMLVideoElement | null => {
    const video = media.querySelector<HTMLVideoElement>("video");
    const source = video?.dataset.historySrc;
    if (!video || !source) return video ?? null;
    if (video.dataset.historyLoaded === "true") return video;
    media.classList.remove("media-error");
    media.classList.add("media-loading");
    video.src = source;
    video.dataset.historyLoaded = "true";
    video.load();
    return video;
  };

  const setHistoryCoverImage = (media: HTMLElement, dataUrl: string): boolean => {
    const image = media.querySelector<HTMLImageElement>("[data-history-cover-image]");
    if (!image || !dataUrl) return false;
    const key = media.dataset.coverKey;
    image.hidden = false;
    const showImage = () => {
      if (image.src !== dataUrl || !media.isConnected) return;
      image.hidden = false;
      media.dataset.historyCoverCached = "true";
      media.classList.remove("media-loading", "media-error");
      media.classList.add("has-history-cover");
    };
    image.onload = showImage;
    image.onerror = () => {
      if (image.src !== dataUrl) return;
      image.removeAttribute("src");
      media.classList.remove("has-history-cover");
      delete media.dataset.historyCoverCached;
      if (key) historyCoverDataUrls.delete(key);
      loadHistoryCardVideo(media);
    };
    image.src = dataUrl;
    if (image.complete && image.naturalWidth > 0) showImage();
    return true;
  };

  const loadHistoryCoverFromCache = async (media: HTMLElement): Promise<boolean> => {
    const key = media.dataset.coverKey;
    const sourcePath = media.dataset.coverSource;
    if (!key || !sourcePath) return false;
    try {
      const cached = historyCoverDataUrls.get(key) ??
        await context.studio.readHistoryCover(key, sourcePath);
      if (!cached) return false;
      historyCoverDataUrls.set(key, cached);
      return setHistoryCoverImage(media, cached);
    } catch (error) {
      void context.studio.reportRendererError(context.t(uiKeys.history.media.coverReadFailed), {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  };

  const releaseHistoryCardVideo = (media: HTMLElement): void => {
    const video = media.querySelector<HTMLVideoElement>("video");
    if (!video || video.dataset.historyLoaded !== "true") return;
    video.pause();
    video.removeAttribute("src");
    delete video.dataset.historyLoaded;
    if (media.dataset.historyCoverCached !== "true") {
      media.classList.remove("media-ready");
      media.classList.add("media-loading");
    }
    video.load();
  };

  const historyCoverScore = (video: HTMLVideoElement): number | null => {
    if (!video.videoWidth || !video.videoHeight) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 18;
    const canvasContext = canvas.getContext("2d", { willReadFrequently: true });
    if (!canvasContext) return null;
    try {
      canvasContext.drawImage(video, 0, 0, canvas.width, canvas.height);
      const pixels = canvasContext.getImageData(0, 0, canvas.width, canvas.height).data;
      let brightnessTotal = 0;
      let brightnessSquaredTotal = 0;
      let saturationTotal = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const red = pixels[index] ?? 0;
        const green = pixels[index + 1] ?? 0;
        const blue = pixels[index + 2] ?? 0;
        const brightness = red * 0.299 + green * 0.587 + blue * 0.114;
        brightnessTotal += brightness;
        brightnessSquaredTotal += brightness * brightness;
        saturationTotal += Math.max(red, green, blue) - Math.min(red, green, blue);
      }
      const pixelCount = pixels.length / 4;
      const brightnessAverage = brightnessTotal / pixelCount;
      const brightnessVariance = Math.max(
        0,
        brightnessSquaredTotal / pixelCount - brightnessAverage * brightnessAverage
      );
      const saturationAverage = saturationTotal / pixelCount;
      const exposurePenalty = Math.abs(brightnessAverage - 128) * 0.35;
      const unusablePenalty = brightnessAverage < 18 || brightnessAverage > 242 ? 120 : 0;
      return Math.sqrt(brightnessVariance) * 1.5 + saturationAverage * 0.35 - exposurePenalty - unusablePenalty;
    } catch {
      return null;
    }
  };

  const historyCoverBlob = (video: HTMLVideoElement): Promise<Blob | null> => {
    if (!video.videoWidth || !video.videoHeight) return Promise.resolve(null);
    const scale = Math.min(
      1,
      HISTORY_COVER_MAX_EDGE / Math.max(video.videoWidth, video.videoHeight)
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const canvasContext = canvas.getContext("2d");
    if (!canvasContext) return Promise.resolve(null);
    try {
      canvasContext.drawImage(video, 0, 0, canvas.width, canvas.height);
    } catch {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      try {
        canvas.toBlob(resolve, "image/jpeg", 0.78);
      } catch {
        resolve(null);
      }
    });
  };

  const historyBlobDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(blob);
  });

  const saveHistoryCover = async (
    media: HTMLElement,
    video: HTMLVideoElement,
    isActive: () => boolean
  ): Promise<void> => {
    const key = media.dataset.coverKey;
    const sourcePath = media.dataset.coverSource;
    if (!key || !sourcePath || !isActive() || media.dataset.historyCoverCached === "true") return;
    const frameScore = historyCoverScore(video);
    if (frameScore == null || frameScore < -80) return;
    const blob = await historyCoverBlob(video);
    if (!blob || !isActive()) return;
    const data = await blob.arrayBuffer();
    try {
      if (!await context.studio.saveHistoryCover(key, sourcePath, data) || !isActive()) return;
      const dataUrl = await historyBlobDataUrl(blob);
      historyCoverDataUrls.set(key, dataUrl);
      setHistoryCoverImage(media, dataUrl);
    } catch (error) {
      void context.studio.reportRendererError(context.t(uiKeys.history.media.coverSaveFailed), {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  const waitForHistoryVideoData = (
    video: HTMLVideoElement,
    signal: AbortSignal
  ): Promise<boolean> => {
    if (video.readyState >= 2) return Promise.resolve(true);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (ready: boolean) => {
        if (settled) return;
        settled = true;
        video.removeEventListener("loadeddata", onReady);
        video.removeEventListener("error", onError);
        signal.removeEventListener("abort", onAbort);
        window.clearTimeout(timeout);
        resolve(ready);
      };
      const onReady = () => finish(true);
      const onError = () => finish(false);
      const onAbort = () => finish(false);
      const timeout = window.setTimeout(() => finish(false), 10_000);
      video.addEventListener("loadeddata", onReady, { once: true });
      video.addEventListener("error", onError, { once: true });
      signal.addEventListener("abort", onAbort, { once: true });
      video.load();
    });
  };

  const waitForHistorySeek = (video: HTMLVideoElement, time: number): Promise<void> => new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener("seeked", finish);
      window.clearTimeout(timeout);
      resolve();
    };
    const timeout = window.setTimeout(finish, 1200);
    video.addEventListener("seeked", finish, { once: true });
    try {
      video.currentTime = time;
    } catch {
      finish();
    }
  });

  const chooseHistoryCoverTime = async (
    video: HTMLVideoElement,
    fallbackTime: number,
    duration: number,
    seed: number,
    isActive: () => boolean
  ): Promise<number> => {
    const candidates = historyCoverCandidates(duration, seed);
    let bestTime = fallbackTime;
    let bestScore: number | null = null;
    for (const candidate of candidates) {
      if (!isActive()) return bestTime;
      await waitForHistorySeek(video, candidate);
      if (!isActive()) return bestTime;
      const score = historyCoverScore(video);
      if (score != null && (bestScore == null || score > bestScore)) {
        bestScore = score;
        bestTime = candidate;
      }
    }
    if (!isActive()) return bestTime;
    await waitForHistorySeek(video, bestTime);
    return bestTime;
  };

  const warmHistoryCover = async (
    media: HTMLElement,
    signal: AbortSignal
  ): Promise<void> => {
    if (signal.aborted || media.dataset.historyCoverCached === "true") return;
    const source = media.querySelector<HTMLVideoElement>("video")?.dataset.historySrc;
    const key = media.dataset.coverKey;
    if (!source || !key) return;
    if (await loadHistoryCoverFromCache(media) || signal.aborted) return;
    if (media.dataset.historyLoaded === "true" || media.matches(":hover") || media.classList.contains("playing")) return;
    const video = document.createElement("video");
    video.muted = true;
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.src = source;
    try {
      if (!await waitForHistoryVideoData(video, signal) || signal.aborted) return;
      const duration = Number(media.dataset.previewDuration) || video.duration;
      const fallbackTime = Number(media.dataset.coverTime) || 0;
      const seed = Number(media.dataset.coverSeed) || 0;
      const isActive = () =>
        !signal.aborted &&
        isHistoryListPage() &&
        media.isConnected &&
        !media.matches(":hover") &&
        !media.classList.contains("playing");
      const selectedTime = await chooseHistoryCoverTime(
        video,
        fallbackTime,
        duration,
        seed,
        isActive
      );
      if (!isActive()) return;
      media.dataset.coverTime = String(selectedTime);
      await saveHistoryCover(media, video, isActive);
    } finally {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
  };

  const stopHistoryCoverWarmup = (): void => {
    historyCoverWarmupController?.abort();
    historyCoverWarmupController = null;
    window.clearTimeout(historyCoverWarmupTimer);
    historyCoverWarmupTimer = undefined;
  };

  const scheduleHistoryCoverWarmup = (mediaCards: HTMLElement[]): void => {
    stopHistoryCoverWarmup();
    const controller = new AbortController();
    historyCoverWarmupController = controller;
    historyCoverWarmupTimer = window.setTimeout(() => {
      historyCoverWarmupTimer = undefined;
      void (async () => {
        for (const media of mediaCards) {
          if (controller.signal.aborted) return;
          await warmHistoryCover(media, controller.signal);
        }
      })();
    }, 1200);
  };

  return {
    loadImageHistoryThumbnail,
    loadHistoryCoverFromCache,
    loadHistoryCardVideo,
    releaseHistoryCardVideo,
    scheduleHistoryCoverWarmup,
    stopHistoryCoverWarmup,
    chooseHistoryCoverTime,
    saveHistoryCover,
    clearImageHistoryThumbnailCache: () => imageHistoryThumbnailDataUrls.clear()
  };
}
