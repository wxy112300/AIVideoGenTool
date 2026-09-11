import { historyCoverCandidates } from "./helpers";
import type {
  MediaRef,
  ProducedThumbnail,
  ThumbnailProducerHooks
} from "./media-resource-store";

const HISTORY_COVER_MAX_EDGE = 640;
const IMAGE_HISTORY_THUMBNAIL_MAX_EDGE = 640;
const IMAGE_THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;
const VIDEO_DATA_TIMEOUT_MS = 10_000;
const VIDEO_SEEK_TIMEOUT_MS = 1_200;

function benchmarkCount(name: string, delta = 1): void {
  const hook = (globalThis as typeof globalThis & {
    __historyMediaBenchmark?: { count?: (metric: string, value?: number) => void };
  }).__historyMediaBenchmark;
  hook?.count?.(name, delta);
}

function benchmarkMax(name: string, value: number): void {
  const hook = (globalThis as typeof globalThis & {
    __historyMediaBenchmark?: { max?: (metric: string, value: number) => void };
  }).__historyMediaBenchmark;
  hook?.max?.(name, value);
}

function abortError(): Error {
  return new DOMException("The media operation was aborted", "AbortError");
}

function timeoutError(): Error {
  return new DOMException("The media operation timed out", "TimeoutError");
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

function imageLoad(
  image: HTMLImageElement,
  sourceUrl: string,
  signal: AbortSignal
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let timeout: number | undefined;
    const finish = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
      if (timeout !== undefined) window.clearTimeout(timeout);
      resolve(loaded && !signal.aborted);
    };
    const onLoad = () => finish(true);
    const onError = () => finish(false);
    const onAbort = () => {
      try {
        image.removeAttribute("src");
      } catch {
        // The cleanup below still settles the producer when a test double or
        // a browser implementation rejects the empty-source assignment.
      }
      finish(false);
    };
    image.addEventListener("load", onLoad);
    image.addEventListener("error", onError);
    signal.addEventListener("abort", onAbort, { once: true });
    timeout = window.setTimeout(() => finish(false), VIDEO_DATA_TIMEOUT_MS);
    benchmarkCount("sourceImageLoads");
    image.src = sourceUrl;
    // A cached image can be complete before the event listener observes a
    // load event. A complete image with width 0 is intentionally not treated
    // as an error: an unassigned/deferred img commonly has that shape.
    if (image.complete && image.naturalWidth > 0) finish(true);
  });
}

async function loadAndDecodeImage(
  image: HTMLImageElement,
  sourceUrl: string,
  signal: AbortSignal
): Promise<boolean> {
  if (!await imageLoad(image, sourceUrl, signal)) return false;
  throwIfAborted(signal);
  if (typeof image.decode === "function") {
    try {
      await image.decode();
    } catch {
      return false;
    }
  }
  benchmarkCount("sourceDecodes");
  return image.naturalWidth > 0 && image.naturalHeight > 0 && !signal.aborted;
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob(resolve, type, quality);
    } catch {
      resolve(null);
    }
  });
}

async function imageThumbnail(
  ref: MediaRef,
  sourceRevision: string,
  signal: AbortSignal
): Promise<ProducedThumbnail | null> {
  if (!ref.sourceUrl || signal.aborted) return null;
  const source = new Image();
  source.crossOrigin = "anonymous";
  try {
    if (!await loadAndDecodeImage(source, ref.sourceUrl, signal)) return null;
    throwIfAborted(signal);
    const scale = Math.min(
      1,
      IMAGE_HISTORY_THUMBNAIL_MAX_EDGE / Math.max(source.naturalWidth, source.naturalHeight)
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
    const canvasContext = canvas.getContext("2d");
    if (!canvasContext) return null;
    canvasContext.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await canvasBlob(canvas, "image/png");
    if (!blob || blob.size > IMAGE_THUMBNAIL_MAX_BYTES) return null;
    throwIfAborted(signal);
    return {
      blob,
      data: await blob.arrayBuffer(),
      sourceRevision
    };
  } finally {
    try {
      source.removeAttribute("src");
    } catch {
      // Ignore cleanup errors from a browser/test image double.
    }
  }
}

export function historyCoverScore(video: HTMLVideoElement): number | null {
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
}

function videoCoverBlob(video: HTMLVideoElement): Promise<Blob | null> {
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
  return canvasBlob(canvas, "image/jpeg", 0.78);
}

function waitForVideoData(
  video: HTMLVideoElement,
  signal: AbortSignal
): Promise<"ready" | "timeout" | "aborted" | "error"> {
  if (signal.aborted) return Promise.resolve("aborted");
  if (video.readyState >= 2) return Promise.resolve("ready");
  return new Promise((resolve) => {
    let settled = false;
    let timeout: number | undefined;
    const finish = (result: "ready" | "timeout" | "aborted" | "error") => {
      if (settled) return;
      settled = true;
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
      if (timeout !== undefined) window.clearTimeout(timeout);
      resolve(result);
    };
    const onReady = () => finish("ready");
    const onError = () => finish("error");
    const onAbort = () => finish("aborted");
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("error", onError);
    signal.addEventListener("abort", onAbort, { once: true });
    timeout = window.setTimeout(() => finish("timeout"), VIDEO_DATA_TIMEOUT_MS);
    try {
      video.load();
    } catch {
      finish("error");
    }
  });
}

function waitForVideoSeek(
  video: HTMLVideoElement,
  time: number,
  signal: AbortSignal
): Promise<"seeked" | "timeout" | "aborted"> {
  if (signal.aborted) return Promise.resolve("aborted");
  benchmarkCount("seeks");
  return new Promise((resolve) => {
    let settled = false;
    let timeout: number | undefined;
    const finish = (result: "seeked" | "timeout" | "aborted") => {
      if (settled) return;
      settled = true;
      video.removeEventListener("seeked", onSeeked);
      signal.removeEventListener("abort", onAbort);
      if (timeout !== undefined) window.clearTimeout(timeout);
      resolve(result);
    };
    const onSeeked = () => finish("seeked");
    const onAbort = () => finish("aborted");
    video.addEventListener("seeked", onSeeked, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
    timeout = window.setTimeout(() => finish("timeout"), VIDEO_SEEK_TIMEOUT_MS);
    try {
      video.currentTime = time;
    } catch {
      finish("timeout");
    }
  });
}

async function videoThumbnail(
  ref: MediaRef,
  sourceRevision: string,
  signal: AbortSignal,
  hooks: ThumbnailProducerHooks
): Promise<ProducedThumbnail | null> {
  if (!ref.sourceUrl || signal.aborted) return null;
  const video = document.createElement("video");
  let activeOwnedVideo = 0;
  benchmarkCount("sourceVideoLoads");
  activeOwnedVideo += 1;
  benchmarkMax("activeOwnedVideoPeak", activeOwnedVideo);
  video.muted = true;
  video.crossOrigin = "anonymous";
  video.preload = "auto";
  video.src = ref.sourceUrl;
  let previewPublished = false;
  let bestTime = Number.isFinite(ref.coverTime) ? Math.max(0, ref.coverTime ?? 0) : 0;
  let bestScore: number | null = null;
  let seekTimedOut = false;
  try {
    const dataState = await waitForVideoData(video, signal);
    if (dataState === "aborted") return null;
    if (dataState === "timeout") throw timeoutError();
    if (dataState !== "ready") return null;
    benchmarkCount("sourceDecodes");
    throwIfAborted(signal);
    const duration = Math.max(
      0,
      Number.isFinite(ref.duration) && (ref.duration ?? 0) > 0
        ? ref.duration ?? 0
        : video.duration
    );
    const initialScore = historyCoverScore(video);
    if (initialScore !== null && initialScore >= -80) {
      const previewBlob = await videoCoverBlob(video);
      if (previewBlob) {
        await hooks.publishPreview?.({
          blob: previewBlob,
          data: await previewBlob.arrayBuffer(),
          sourceRevision
        });
        previewPublished = true;
      }
    }

    const candidates = historyCoverCandidates(duration, ref.seed ?? 0);
    for (const candidate of candidates) {
      throwIfAborted(signal);
      const seekState = await waitForVideoSeek(video, candidate, signal);
      if (seekState !== "seeked") {
        if (seekState === "aborted") throwIfAborted(signal);
        seekTimedOut = true;
        continue;
      }
      throwIfAborted(signal);
      const score = historyCoverScore(video);
      if (score === null || score < -80) continue;
      if (!previewPublished) {
        const previewBlob = await videoCoverBlob(video);
        if (previewBlob) {
          await hooks.publishPreview?.({
            blob: previewBlob,
            data: await previewBlob.arrayBuffer(),
            sourceRevision
          });
          previewPublished = true;
        }
      }
      if (bestScore === null || score > bestScore) {
        bestScore = score;
        bestTime = candidate;
      }
    }
    if (bestScore === null) {
      if (seekTimedOut) throw timeoutError();
      return null;
    }
    throwIfAborted(signal);
    const finalSeekState = await waitForVideoSeek(video, bestTime, signal);
    if (finalSeekState !== "seeked") {
      if (finalSeekState === "aborted") throwIfAborted(signal);
      throw timeoutError();
    }
    throwIfAborted(signal);
    const finalScore = historyCoverScore(video);
    if (finalScore === null || finalScore < -80) return null;
    const finalBlob = await videoCoverBlob(video);
    if (!finalBlob) return null;
    return {
      blob: finalBlob,
      data: await finalBlob.arrayBuffer(),
      sourceRevision,
      selectedTime: bestTime
    };
  } finally {
    activeOwnedVideo -= 1;
    try {
      video.pause();
      video.removeAttribute("src");
      video.load();
    } catch {
      // Ignore cleanup failures; the scheduler owns the producer slot.
    }
  }
}

export async function produceHistoryThumbnail(
  ref: MediaRef,
  sourceRevision: string,
  signal: AbortSignal,
  hooks: ThumbnailProducerHooks = {}
): Promise<ProducedThumbnail | null> {
  return ref.kind === "image"
    ? imageThumbnail(ref, sourceRevision, signal)
    : videoThumbnail(ref, sourceRevision, signal, hooks);
}
