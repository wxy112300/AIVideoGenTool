import type { RendererContext } from "../../contracts";
import type {
  HistoryCoverLookup,
  HistoryCoverSaveResult
} from "../../../types";
import {
  createMediaResourceStore,
  type MediaRef,
  type MediaResourceConsumer,
  type Presentation
} from "./media-resource-store";
import { produceHistoryThumbnail } from "./thumbnail-producers";
import type { HistoryMediaTaskPriority } from "./media-scheduler";

export interface HistoryMediaRuntime {
  loadImageHistoryThumbnail(image: HTMLImageElement, signal?: AbortSignal): Promise<boolean>;
  subscribeImageHistoryThumbnail(
    image: HTMLImageElement,
    priority: HistoryMediaTaskPriority,
    consumer: Omit<MediaResourceConsumer, "priority" | "signal">
  ): () => void;
  invalidateImageHistoryThumbnail(key: string): void;
  loadHistoryCoverFromCache(media: HTMLElement, signal?: AbortSignal): Promise<boolean>;
  subscribeHistoryCover(media: HTMLElement, priority: HistoryMediaTaskPriority): () => void;
  loadHistoryCardVideo(media: HTMLElement): HTMLVideoElement | null;
  releaseHistoryCardVideo(media: HTMLElement): void;
  scheduleHistoryCoverWarmup(mediaCards: HTMLElement[], priority?: HistoryMediaTaskPriority): void;
  cancelHistoryCoverWarmup(media: HTMLElement): void;
  stopHistoryCoverWarmup(): void;
  invalidateHistoryMediaForAsset(assetId: string): void;
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
  clearImageHistoryThumbnailCache(): void;
  invalidate(keys?: readonly string[]): void;
  dispose(): void;
}

function mediaRefForImage(image: HTMLImageElement): MediaRef {
  const surface = image.closest<HTMLElement>("[data-image-media]");
  const ratio = surface?.style.getPropertyValue("--media-ratio").split("/") ?? [];
  return {
    key: image.dataset.imageHistoryCacheKey?.trim() ||
      image.dataset.imageHistorySource?.trim() ||
      image.dataset.imageMediaUrl?.trim() || "",
    kind: "image",
    sourcePath: image.dataset.imageHistorySource?.trim() ||
      surface?.dataset.imageMediaSource?.trim() || "",
    sourceUrl: image.dataset.imageMediaUrl?.trim() || image.getAttribute("src")?.trim() || "",
    width: Number(ratio[0]) || undefined,
    height: Number(ratio[1]) || undefined
  };
}

function mediaRefForVideo(media: HTMLElement): MediaRef {
  const video = media.querySelector<HTMLVideoElement>("video");
  return {
    key: media.dataset.coverKey?.trim() || "",
    kind: "video",
    sourcePath: media.dataset.coverSource?.trim() || "",
    sourceUrl: video?.dataset.historySrc?.trim() || "",
    coverTime: Number(media.dataset.coverTime) || 0,
    duration: Number(media.dataset.previewDuration) || undefined,
    seed: Number(media.dataset.coverSeed) || 0
  };
}

function imagePresentationLoad(
  image: HTMLImageElement,
  url: string,
  signal: AbortSignal
): Promise<boolean> {
  if (signal.aborted || !image.isConnected) return Promise.resolve(false);
  if (image.currentSrc === url && image.complete && image.naturalWidth > 0) {
    return Promise.resolve(true);
  }
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
      resolve(loaded && !signal.aborted && image.naturalWidth > 0);
    };
    const onLoad = () => finish(true);
    const onError = () => finish(false);
    const onAbort = () => finish(false);
    image.addEventListener("load", onLoad);
    image.addEventListener("error", onError);
    signal.addEventListener("abort", onAbort, { once: true });
    timeout = window.setTimeout(() => finish(false), 10_000);
    image.src = url;
    if (image.currentSrc === url && image.complete && image.naturalWidth > 0) finish(true);
  });
}

function legacyLookup(
  context: RendererContext,
  key: string,
  sourcePath: string
): Promise<HistoryCoverLookup> {
  const lookup = context.assets.lookupHistoryCover;
  if (typeof lookup === "function") return lookup(key, sourcePath);
  return context.assets.readHistoryCover(key, sourcePath).then((url) => url
    ? { state: "hit", url, sourceRevision: "legacy" }
    : { state: "miss", sourceRevision: "legacy" });
}

async function legacySave(
  context: RendererContext,
  input: {
    key: string;
    sourcePath: string;
    sourceRevision: string;
    data: ArrayBuffer;
  }
): Promise<HistoryCoverSaveResult> {
  const saveIfCurrent = context.assets.saveHistoryCoverIfCurrent;
  if (typeof saveIfCurrent === "function") return saveIfCurrent(input);
  const saved = await context.assets.saveHistoryCover(input.key, input.sourcePath, input.data);
  if (!saved) return { state: "failed" };
  const url = await context.assets.readHistoryCover(input.key, input.sourcePath);
  return url ? { state: "saved", url } : { state: "failed" };
}

export function createHistoryMediaRuntime(
  context: RendererContext,
  _isHistoryListPage: () => boolean
): HistoryMediaRuntime {
  const imageKeys = new Set<string>();
  const coverPresentations = new WeakMap<HTMLElement, Presentation>();
  const coverSubscriptions = new Map<HTMLElement, () => void>();
  const rememberImageKey = (key: string): void => {
    imageKeys.delete(key);
    imageKeys.add(key);
    while (imageKeys.size > 256) {
      const oldest = imageKeys.values().next().value as string | undefined;
      if (!oldest) break;
      imageKeys.delete(oldest);
    }
  };
  const store = createMediaResourceStore({
    lookup: (ref) => legacyLookup(context, ref.key, ref.sourcePath),
    produce: (ref, sourceRevision, signal, hooks) =>
      produceHistoryThumbnail(ref, sourceRevision, signal, hooks),
    save: (input) => legacySave(context, input),
    onPersistenceFailure: (key, error) => {
      void context.application.reportRendererError(
        context.t("history.media.coverSaveFailed"),
        { key, error: error instanceof Error ? error.message : String(error ?? "写入失败") }
      );
    }
  });

  const setHistoryCoverImage = async (
    media: HTMLElement,
    presentation: Presentation,
    signal: AbortSignal
  ): Promise<boolean> => {
    const image = media.querySelector<HTMLImageElement>("[data-history-cover-image]");
    if (!image || !presentation.url || signal.aborted || !media.isConnected) return false;
    const previous = coverPresentations.get(media);
    if (presentation.phase === "final") delete media.dataset.historyCoverCached;
    image.hidden = false;
    image.dataset.historyCoverPresentation = presentation.phase;
    image.dataset.historyCoverOrigin = presentation.origin;
    image.dataset.historyCoverRevision = presentation.sourceRevision;
    const loaded = await imagePresentationLoad(image, presentation.url, signal);
    const isCurrentPresentation = image.currentSrc === presentation.url || image.getAttribute("src") === presentation.url;
    if (!loaded || signal.aborted || !media.isConnected || !isCurrentPresentation) {
      if (
        !loaded &&
        previous &&
        previous.url !== presentation.url &&
        !signal.aborted &&
        media.isConnected &&
        isCurrentPresentation
      ) {
        image.src = previous.url;
        image.dataset.historyCoverPresentation = previous.phase;
        image.dataset.historyCoverOrigin = previous.origin;
        image.dataset.historyCoverRevision = previous.sourceRevision;
      }
      return false;
    }
    media.classList.remove("media-loading", "media-error");
    media.classList.add("has-history-cover");
    coverPresentations.set(media, presentation);
    if (presentation.phase === "final") {
      media.dataset.historyCoverCached = "true";
      delete media.dataset.historyCoverRefinement;
    } else {
      delete media.dataset.historyCoverCached;
      delete media.dataset.historyCoverRefinement;
    }
    return true;
  };

  const historyCoverFailure = (
    media: HTMLElement,
    reason: "missing" | "decode" | "timeout" | "io"
  ): void => {
    if (!media.isConnected || media.dataset.historyCoverCached === "true") return;
    if (
      media.classList.contains("has-history-cover") &&
      media.dataset.historyCoverPresentation === "preview"
    ) {
      media.classList.remove("media-loading", "media-error");
      media.dataset.historyCoverRefinement = reason === "timeout" ? "deferred" : "failed";
      return;
    }
    media.classList.remove("media-loading");
    if (reason === "missing" || reason === "decode" || reason === "timeout" || reason === "io") {
      media.classList.add("media-error");
    }
  };

  const subscribeHistoryCover = (
    media: HTMLElement,
    priority: HistoryMediaTaskPriority,
    consumer?: Omit<MediaResourceConsumer, "priority" | "signal">,
    controllerOverride?: AbortController
  ): (() => void) => {
    const ref = mediaRefForVideo(media);
    if (!ref.key || !ref.sourceUrl) return () => undefined;
    const controller = controllerOverride ?? new AbortController();
    const defaultConsumer = {
      onPresentation: (presentation: Presentation) =>
        setHistoryCoverImage(media, presentation, controller.signal),
      onFailure: (reason: "missing" | "decode" | "timeout" | "io") =>
        historyCoverFailure(media, reason)
    };
    const unsubscribeStore = store.subscribe(ref, {
      priority,
      signal: controller.signal,
      onPresentation: consumer?.onPresentation ?? defaultConsumer.onPresentation,
      onFailure: consumer?.onFailure ?? defaultConsumer.onFailure
    });
    const unsubscribe = () => {
      if (coverSubscriptions.get(media) === unsubscribe) coverSubscriptions.delete(media);
      controller.abort();
      unsubscribeStore();
    };
    coverSubscriptions.set(media, unsubscribe);
    return unsubscribe;
  };

  const loadImageHistoryThumbnail = async (
    image: HTMLImageElement,
    signal?: AbortSignal
  ): Promise<boolean> => {
    const ref = mediaRefForImage(image);
    if (!ref.key || !ref.sourceUrl || !image.isConnected || signal?.aborted) return false;
    rememberImageKey(ref.key);
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    let result = false;
    let resolveCompletion!: () => void;
    const completion = new Promise<void>((resolve) => {
      resolveCompletion = resolve;
    });
    const unsubscribe = store.subscribe(ref, {
      priority: "interactive",
      signal: controller.signal,
      onPresentation: async (presentation) => {
        image.src = presentation.url;
        result = await imagePresentationLoad(image, presentation.url, controller.signal);
        resolveCompletion();
        return result;
      },
      onFailure: () => resolveCompletion()
    });
    controller.signal.addEventListener("abort", resolveCompletion, { once: true });
    try {
      await completion;
      return result;
    } finally {
      unsubscribe();
      signal?.removeEventListener("abort", abort);
    }
  };

  const subscribeImageHistoryThumbnail = (
    image: HTMLImageElement,
    priority: HistoryMediaTaskPriority,
    consumer: Omit<MediaResourceConsumer, "priority" | "signal">
  ): (() => void) => {
    const ref = mediaRefForImage(image);
    if (!ref.key || !ref.sourceUrl) return () => undefined;
    rememberImageKey(ref.key);
    const controller = new AbortController();
    const unsubscribeStore = store.subscribe(ref, {
      priority,
      signal: controller.signal,
      onPresentation: consumer.onPresentation,
      onFailure: consumer.onFailure
    });
    return () => {
      controller.abort();
      unsubscribeStore();
    };
  };

  const loadHistoryCoverFromCache = async (
    media: HTMLElement,
    signal?: AbortSignal
  ): Promise<boolean> => {
    const ref = mediaRefForVideo(media);
    if (!ref.key || !ref.sourceUrl || !media.isConnected || signal?.aborted) return false;
    let resolved = false;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    let resolveCompletion!: () => void;
    const completion = new Promise<void>((resolve) => {
      resolveCompletion = resolve;
    });
    const unsubscribe = subscribeHistoryCover(media, "viewport", {
      onPresentation: async (presentation) => {
        resolved = await setHistoryCoverImage(media, presentation, controller.signal);
        resolveCompletion();
        return resolved;
      },
      onFailure: (reason) => {
        historyCoverFailure(media, reason);
        resolveCompletion();
      }
    }, controller);
    controller.signal.addEventListener("abort", resolveCompletion, { once: true });
    try {
      await completion;
      return resolved;
    } finally {
      unsubscribe();
      signal?.removeEventListener("abort", abort);
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

  const scheduleHistoryCoverWarmup = (
    mediaCards: HTMLElement[],
    priority: HistoryMediaTaskPriority = "viewport"
  ): void => {
    mediaCards.forEach((media) => {
      if (coverSubscriptions.has(media)) return;
      const unsubscribe = subscribeHistoryCover(media, priority);
      if (!coverSubscriptions.has(media)) unsubscribe();
    });
  };

  const cancelHistoryCoverWarmup = (media: HTMLElement): void => {
    const unsubscribe = coverSubscriptions.get(media);
    if (!unsubscribe) return;
    coverSubscriptions.delete(media);
    unsubscribe();
  };

  const invalidateHistoryMediaForAsset = (assetId: string): void => {
    const keys = new Set<string>();
    document.querySelectorAll<HTMLElement>("[data-history]").forEach((item) => {
      if (item.dataset.history !== assetId) return;
      item.querySelectorAll<HTMLElement>("[data-cover-key], [data-image-history-cache-key]")
        .forEach((element) => {
          const key = element.dataset.coverKey?.trim() ||
            element.dataset.imageHistoryCacheKey?.trim();
          if (key) {
            keys.add(key);
            if (element.dataset.coverKey?.trim()) {
              coverPresentations.delete(element);
              delete element.dataset.historyCoverCached;
            }
          }
        });
    });
    if (keys.size) store.invalidate([...keys]);
  };

  return {
    loadImageHistoryThumbnail,
    subscribeImageHistoryThumbnail,
    invalidateImageHistoryThumbnail: (key: string) => store.invalidate([key]),
    loadHistoryCoverFromCache,
    subscribeHistoryCover: (media, priority) => {
      const previous = coverSubscriptions.get(media);
      previous?.();
      return subscribeHistoryCover(media, priority);
    },
    loadHistoryCardVideo,
    releaseHistoryCardVideo,
    scheduleHistoryCoverWarmup,
    cancelHistoryCoverWarmup,
    stopHistoryCoverWarmup: () => {
      for (const [media, unsubscribe] of coverSubscriptions) {
        coverSubscriptions.delete(media);
        unsubscribe();
      }
    },
    invalidateHistoryMediaForAsset,
    chooseHistoryCoverTime: async (_video, fallbackTime) => fallbackTime,
    saveHistoryCover: async (media, video, isActive) => {
      const key = media.dataset.coverKey?.trim();
      const sourcePath = media.dataset.coverSource?.trim();
      if (!key || !sourcePath || !isActive()) return;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(video.videoWidth || 640));
      canvas.height = Math.max(1, Math.round(video.videoHeight || 360));
      const canvasContext = canvas.getContext("2d");
      if (!canvasContext) return;
      canvasContext.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.78));
      if (!blob || !isActive()) return;
      const result = await legacySave(context, {
        key,
        sourcePath,
        sourceRevision: "legacy",
        data: await blob.arrayBuffer()
      });
      if (result.state === "saved" && isActive()) {
        store.invalidate([key]);
        await setHistoryCoverImage(media, {
          url: result.url,
          phase: "final",
          origin: "disk",
          sourceRevision: "legacy"
        }, new AbortController().signal);
      }
    },
    clearImageHistoryThumbnailCache: () => store.invalidate([...imageKeys]),
    invalidate: (keys) => store.invalidate(keys),
    dispose: () => {
      for (const unsubscribe of coverSubscriptions.values()) unsubscribe();
      coverSubscriptions.clear();
      store.dispose();
    }
  };
}
