import type { RendererCleanup, RendererContext } from "../../contracts";
import { uiKeys } from "../../../core/i18n-keys";
import {
  imageMediaStateAfterLoad,
  imageMediaStateClass,
  initialImageMediaState,
  type ImageMediaState
} from "./image-media-state";
import {
  createHistoryMediaScheduler,
  scheduleHistoryBatches,
  type HistoryMediaTaskPriority
} from "./media-scheduler";
import type { MediaResourceConsumer, Presentation } from "./media-resource-store";

export interface ImageHistoryMediaControllerOptions {
  loadImageHistoryThumbnail?(image: HTMLImageElement, signal?: AbortSignal): Promise<boolean>;
  subscribeImageHistoryThumbnail?(
    image: HTMLImageElement,
    priority: HistoryMediaTaskPriority,
    consumer: Omit<MediaResourceConsumer, "priority" | "signal">
  ): () => void;
  invalidateImageHistoryThumbnail?(key: string): void;
}

function imageMediaSource(image: HTMLImageElement | null): string {
  return image?.dataset.imageMediaUrl?.trim() || image?.getAttribute("src")?.trim() || "";
}

function waitForImagePresentation(
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

export function mountImageHistoryMediaController(
  context: RendererContext,
  options: ImageHistoryMediaControllerOptions
): RendererCleanup {
  const events = new AbortController();
  const signal = events.signal;
  const root = context.root;
  const thumbnailScheduler = options.subscribeImageHistoryThumbnail
    ? null
    : createHistoryMediaScheduler(3);
  const thumbnailSubscriptions = new Map<HTMLElement, () => void>();
  const thumbnailSchedulerKeys = new Map<HTMLElement, string>();
  const gallerySchedules = new Map<HTMLElement, {
    schedule(priority: HistoryMediaTaskPriority): void;
    cancel(): void;
  }>();
  const galleryStateHandlers = new Map<HTMLElement, {
    handleLoad(): void;
    handleError(): void;
  }>();
  const initializedSurfaces = new WeakSet<HTMLElement>();

  const enqueueThumbnail = (
    surface: HTMLElement,
    image: HTMLImageElement,
    priority: HistoryMediaTaskPriority,
    request?: number
  ): void => {
    const key = image.dataset.imageHistoryCacheKey?.trim() ||
      image.dataset.imageHistorySource?.trim() ||
      image.dataset.imageMediaUrl?.trim() || "";
    if (!key) return;
    const cancelPrevious = () => {
      thumbnailSubscriptions.get(surface)?.();
      thumbnailSubscriptions.delete(surface);
      const schedulerKey = thumbnailSchedulerKeys.get(surface);
      if (schedulerKey) thumbnailScheduler?.cancel(schedulerKey);
      thumbnailSchedulerKeys.delete(surface);
    };
    if (request !== undefined) cancelPrevious();
    if (options.subscribeImageHistoryThumbnail) {
      if (request === undefined && thumbnailSubscriptions.has(surface)) return;
      const controller = new AbortController();
      const unsubscribe = options.subscribeImageHistoryThumbnail(image, priority, {
        onPresentation: async (presentation: Presentation) => {
          if (controller.signal.aborted || !surface.isConnected) return false;
          image.dataset.imageMediaPresentation = presentation.phase;
          image.dataset.imageMediaOrigin = presentation.origin;
          image.dataset.imageMediaRevision = presentation.sourceRevision;
          image.src = presentation.url;
          const loaded = await waitForImagePresentation(image, presentation.url, controller.signal);
          if (loaded && surface.isConnected && !controller.signal.aborted) {
            const currentHandlers = galleryStateHandlers.get(surface);
            if (currentHandlers) currentHandlers.handleLoad();
            else surface.dataset.imageMediaPendingState = "ready";
          }
          return loaded;
        },
        onFailure: (reason) => {
          if (controller.signal.aborted || !surface.isConnected) return;
          if (reason === "missing" || reason === "decode" || reason === "timeout" || reason === "io") {
            const currentHandlers = galleryStateHandlers.get(surface);
            if (currentHandlers) currentHandlers.handleError();
            else surface.dataset.imageMediaPendingState = "error";
          }
        }
      });
      thumbnailSubscriptions.set(surface, () => {
        controller.abort();
        unsubscribe();
      });
      return;
    }
    const schedulerKey = `${key}\u0000${[...image.closest<HTMLElement>("[data-image-media]")?.parentElement?.children ?? []].indexOf(surface)}`;
    thumbnailSchedulerKeys.set(surface, schedulerKey);
    thumbnailScheduler?.enqueue(schedulerKey, async (taskSignal) => {
      let loaded = false;
      try {
        loaded = await options.loadImageHistoryThumbnail?.(image, taskSignal) || false;
      } catch {
        loaded = false;
      }
      if (taskSignal.aborted || !surface.isConnected) return false;
      const handlers = galleryStateHandlers.get(surface);
      if (loaded && image.complete) {
        if (handlers) handlers.handleLoad();
        else surface.dataset.imageMediaPendingState = "ready";
      }
      if (!loaded && image.dataset.imageHistorySource?.trim()) {
        if (handlers) handlers.handleError();
        else surface.dataset.imageMediaPendingState = "error";
      }
      return loaded;
    }, priority);
  };

  const imageSurfaces = [...root.querySelectorAll<HTMLElement>("[data-image-media]")];
  const gallerySurfaces = imageSurfaces.filter((surface) => surface.dataset.imageMediaSurface === "gallery");
  gallerySurfaces.forEach((surface) => {
    const image = surface.querySelector<HTMLImageElement>("[data-image-media-image]");
    if (!image) return;
    const thumbnailKey = () => image.dataset.imageHistoryCacheKey?.trim() ||
      image.dataset.imageHistorySource?.trim() ||
      image.dataset.imageMediaUrl?.trim() || "";
    gallerySchedules.set(surface, {
      schedule: (priority) => enqueueThumbnail(surface, image, priority),
      cancel: () => {
        thumbnailSubscriptions.get(surface)?.();
        thumbnailSubscriptions.delete(surface);
        const schedulerKey = thumbnailSchedulerKeys.get(surface) || thumbnailKey();
        if (schedulerKey) thumbnailScheduler?.cancel(schedulerKey);
        thumbnailSchedulerKeys.delete(surface);
      }
    });
  });

  const setupSurface = (surface: HTMLElement) => {
    if (initializedSurfaces.has(surface)) return;
    initializedSurfaces.add(surface);
    const image = surface.querySelector<HTMLImageElement>("[data-image-media-image]");
    const status = surface.querySelector<HTMLElement>("[data-image-media-status]");
    const label = status?.querySelector<HTMLElement>("[data-image-media-status-label]");
    const retryButton = status?.querySelector<HTMLButtonElement>("[data-image-media-retry]");
    const locateButton = status?.querySelector<HTMLButtonElement>("[data-image-media-locate]");
    const surfaceKind = surface.dataset.imageMediaSurface ?? "detail";
    let state: ImageMediaState = initialImageMediaState(imageMediaSource(image));
    let retryRequest = 0;
    let hasReadyMedia = surface.dataset.imageMediaHasReady === "true";
    let lastReadySource = "";

    const setState = (nextState: ImageMediaState) => {
      state = nextState;
      surface.dataset.imageMediaState = nextState;
      surface.classList.remove(
        "image-media-loading",
        "image-media-ready",
        "image-media-unavailable",
        "image-media-error"
      );
      surface.classList.add(imageMediaStateClass(nextState));
      if (hasReadyMedia) surface.dataset.imageMediaHasReady = "true";
      if (image) image.setAttribute("aria-busy", String(nextState === "loading"));
      if (!status) return;
      status.hidden = nextState === "ready";
      status.setAttribute("role", nextState === "loading" ? "status" : "alert");
      if (label) {
        label.textContent = nextState === "loading"
          ? context.t(uiKeys.history.media.imageLoading)
          : nextState === "unavailable"
            ? context.t(uiKeys.history.page.imageUnavailable)
            : nextState === "error"
              ? context.t(uiKeys.history.media.imageLoadFailed)
              : "";
      }
      if (retryButton) retryButton.hidden = !image || !imageMediaSource(image) || nextState === "loading";
      if (locateButton) locateButton.hidden = !surface.dataset.imageMediaSource?.trim() || nextState === "loading" || nextState === "ready";
    };

    const handleLoad = () => {
      if (!image) return;
      const nextState = imageMediaStateAfterLoad(imageMediaSource(image), image.naturalWidth);
      if (nextState === "ready") {
        hasReadyMedia = true;
        lastReadySource = image.currentSrc || image.getAttribute("src") || "";
      }
      setState(nextState);
    };
    const handleError = () => {
      if (image && hasReadyMedia && lastReadySource && image.currentSrc !== lastReadySource && image.src !== lastReadySource) {
        image.src = lastReadySource;
      }
      setState(imageMediaSource(image) ? "error" : "unavailable");
    };
    const handleSourceChange = () => {
      retryRequest += 1;
      gallerySchedules.get(surface)?.cancel();
      setState(initialImageMediaState(imageMediaSource(image)));
    };
    if (surfaceKind === "gallery") {
      galleryStateHandlers.set(surface, { handleLoad, handleError });
    }

    const retry = () => {
      const sourceUrl = imageMediaSource(image);
      if (!image || !sourceUrl) {
        setState("unavailable");
        return;
      }
      const request = ++retryRequest;
      setState("loading");
      if (surfaceKind === "gallery") {
        const key = image.dataset.imageHistoryCacheKey?.trim() ||
          image.dataset.imageHistorySource?.trim() ||
          image.dataset.imageMediaUrl?.trim() || "";
        if (key) options.invalidateImageHistoryThumbnail?.(key);
        if (image) enqueueThumbnail(surface, image, "interactive", request);
        return;
      }
      const probe = new Image();
      probe.onload = () => {
        if (request !== retryRequest || !surface.isConnected) return;
        image.src = probe.src;
        if (image.complete) handleLoad();
      };
      probe.onerror = () => {
        if (request === retryRequest && surface.isConnected) setState("error");
      };
      probe.src = sourceUrl;
    };

    image?.addEventListener("load", handleLoad, { signal });
    image?.addEventListener("error", handleError, { signal });
    image?.addEventListener("image-media-source-change", handleSourceChange, { signal });
    retryButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      retry();
    }, { signal });
    locateButton?.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const sourcePath = surface.dataset.imageMediaSource?.trim() ?? "";
      if (!sourcePath) return;
      let shown = false;
      try {
        shown = await context.hostCapabilities.showItemInFolder(sourcePath);
      } catch {
        shown = false;
      }
      if (!shown) {
        context.notify(context.t(uiKeys.history.actions.fileMissing), { renderPage: false, kind: "error" });
      }
    }, { signal });

    if (!image) {
      setState("unavailable");
    } else {
      setState(state);
      const pendingState = surface.dataset.imageMediaPendingState;
      delete surface.dataset.imageMediaPendingState;
      if (pendingState === "error") setState("error");
      else if (pendingState === "ready") handleLoad();
      else if (image.getAttribute("src") && image.complete && image.naturalWidth > 0) handleLoad();
    }
  };

  const setupSurfaceFromEvent = (event: Event): void => {
    const target = event.target instanceof Element ? event.target : null;
    const surface = target?.closest<HTMLElement>("[data-image-media]");
    if (surface && root.contains(surface)) setupSurface(surface);
  };
  root.addEventListener("mouseover", setupSurfaceFromEvent, { signal });
  root.addEventListener("focusin", setupSurfaceFromEvent, { signal });
  root.addEventListener("pointerdown", setupSurfaceFromEvent, { capture: true, signal });

  const cancelSetup = scheduleHistoryBatches(imageSurfaces, setupSurface);

  let galleryObserver: IntersectionObserver | null = null;
  let cancelGalleryObserverSetup: (() => void) | null = null;
  if (typeof IntersectionObserver === "undefined") {
    gallerySurfaces.forEach((surface) => gallerySchedules.get(surface)?.schedule("prefetch"));
  } else {
    galleryObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const surface = entry.target as HTMLElement;
        const schedule = gallerySchedules.get(surface);
        if (!entry.isIntersecting) {
          schedule?.cancel();
          return;
        }
        const bounds = entry.boundingClientRect;
        const priority = bounds.bottom > 0 && bounds.top < window.innerHeight
          ? "viewport"
          : "prefetch";
        schedule?.schedule(priority);
      });
    }, { rootMargin: "600px 0px", threshold: 0 });
    cancelGalleryObserverSetup = scheduleHistoryBatches(gallerySurfaces, (surface) => {
      galleryObserver?.observe(surface);
    }, 32);
  }

  return () => {
    cancelSetup();
    events.abort();
    cancelGalleryObserverSetup?.();
    cancelGalleryObserverSetup = null;
    galleryObserver?.disconnect();
    for (const unsubscribe of thumbnailSubscriptions.values()) unsubscribe();
    thumbnailSubscriptions.clear();
    thumbnailScheduler?.dispose();
  };
}
