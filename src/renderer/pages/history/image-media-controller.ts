import type { RendererCleanup, RendererContext } from "../../contracts";
import { uiKeys } from "../../../core/i18n-keys";
import {
  imageMediaStateAfterLoad,
  imageMediaStateClass,
  initialImageMediaState,
  type ImageMediaState
} from "./image-media-state";

export interface ImageHistoryMediaControllerOptions {
  loadImageHistoryThumbnail(image: HTMLImageElement): Promise<void>;
}

function imageMediaSource(image: HTMLImageElement | null): string {
  return image?.dataset.imageMediaUrl?.trim() || image?.getAttribute("src")?.trim() || "";
}

export function mountImageHistoryMediaController(
  context: RendererContext,
  options: ImageHistoryMediaControllerOptions
): RendererCleanup {
  const events = new AbortController();
  const signal = events.signal;
  const root = context.root;

  root.querySelectorAll<HTMLElement>("[data-image-media]").forEach((surface) => {
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
      setState(initialImageMediaState(imageMediaSource(image)));
    };

    const retry = () => {
      const sourceUrl = imageMediaSource(image);
      if (!image || !sourceUrl) {
        setState("unavailable");
        return;
      }
      const request = ++retryRequest;
      setState("loading");
      if (surfaceKind === "gallery") {
        void options.loadImageHistoryThumbnail(image).then(() => {
          if (request !== retryRequest || !surface.isConnected) return;
          if (image.complete) handleLoad();
        }).catch(() => {
          if (request === retryRequest && surface.isConnected) setState("error");
        });
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
        shown = await context.studio.showItemInFolder(sourcePath);
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
      if (image.complete) handleLoad();
    }
  });

  return () => events.abort();
}
