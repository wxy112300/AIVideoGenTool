import { uiKeys } from "../../../core/i18n-keys";
import { imageMediaStateAfterLoad, imageMediaStateClass, initialImageMediaState } from "./image-media-state";
import { createHistoryMediaScheduler } from "./media-scheduler";
function imageMediaSource(image) {
    return image?.dataset.imageMediaUrl?.trim() || image?.getAttribute("src")?.trim() || "";
}
export function mountImageHistoryMediaController(context, options) {
    const events = new AbortController();
    const signal = events.signal;
    const root = context.root;
    const thumbnailScheduler = createHistoryMediaScheduler(3);
    const gallerySchedules = new Map();
    root.querySelectorAll("[data-image-media]").forEach((surface) => {
        const image = surface.querySelector("[data-image-media-image]");
        const status = surface.querySelector("[data-image-media-status]");
        const label = status?.querySelector("[data-image-media-status-label]");
        const retryButton = status?.querySelector("[data-image-media-retry]");
        const locateButton = status?.querySelector("[data-image-media-locate]");
        const surfaceKind = surface.dataset.imageMediaSurface ?? "detail";
        let state = initialImageMediaState(imageMediaSource(image));
        let retryRequest = 0;
        let hasReadyMedia = surface.dataset.imageMediaHasReady === "true";
        let lastReadySource = "";
        const setState = (nextState) => {
            state = nextState;
            surface.dataset.imageMediaState = nextState;
            surface.classList.remove("image-media-loading", "image-media-ready", "image-media-unavailable", "image-media-error");
            surface.classList.add(imageMediaStateClass(nextState));
            if (hasReadyMedia)
                surface.dataset.imageMediaHasReady = "true";
            if (image)
                image.setAttribute("aria-busy", String(nextState === "loading"));
            if (!status)
                return;
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
            if (retryButton)
                retryButton.hidden = !image || !imageMediaSource(image) || nextState === "loading";
            if (locateButton)
                locateButton.hidden = !surface.dataset.imageMediaSource?.trim() || nextState === "loading" || nextState === "ready";
        };
        const handleLoad = () => {
            if (!image)
                return;
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
        const enqueueThumbnail = (priority, request) => {
            if (!image)
                return;
            const key = image.dataset.imageHistoryCacheKey?.trim() ||
                image.dataset.imageHistorySource?.trim() ||
                image.dataset.imageMediaUrl?.trim() || "";
            if (!key)
                return;
            if (request !== undefined)
                thumbnailScheduler.cancel(key);
            thumbnailScheduler.enqueue(key, async (taskSignal) => {
                let loaded = false;
                try {
                    loaded = await options.loadImageHistoryThumbnail(image, taskSignal);
                }
                catch {
                    loaded = false;
                }
                if (taskSignal.aborted || !surface.isConnected)
                    return false;
                if (loaded && image.complete)
                    handleLoad();
                if (!loaded &&
                    image.dataset.imageHistorySource?.trim()) {
                    setState("error");
                }
                return loaded;
            }, priority);
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
                enqueueThumbnail("interactive", request);
                return;
            }
            const probe = new Image();
            probe.onload = () => {
                if (request !== retryRequest || !surface.isConnected)
                    return;
                image.src = probe.src;
                if (image.complete)
                    handleLoad();
            };
            probe.onerror = () => {
                if (request === retryRequest && surface.isConnected)
                    setState("error");
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
            if (!sourcePath)
                return;
            let shown = false;
            try {
                shown = await context.studio.showItemInFolder(sourcePath);
            }
            catch {
                shown = false;
            }
            if (!shown) {
                context.notify(context.t(uiKeys.history.actions.fileMissing), { renderPage: false, kind: "error" });
            }
        }, { signal });
        if (!image) {
            setState("unavailable");
        }
        else {
            setState(state);
            if (image.complete)
                handleLoad();
            if (surfaceKind === "gallery") {
                const thumbnailKey = () => image.dataset.imageHistoryCacheKey?.trim() ||
                    image.dataset.imageHistorySource?.trim() ||
                    image.dataset.imageMediaUrl?.trim() || "";
                gallerySchedules.set(surface, {
                    schedule: (priority) => enqueueThumbnail(priority),
                    cancel: () => {
                        const key = thumbnailKey();
                        if (key)
                            thumbnailScheduler.cancel(key);
                    }
                });
            }
        }
    });
    const gallerySurfaces = [...gallerySchedules.keys()];
    let galleryObserver = null;
    if (typeof IntersectionObserver === "undefined") {
        gallerySurfaces.forEach((surface) => gallerySchedules.get(surface)?.schedule("prefetch"));
    }
    else {
        galleryObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                const surface = entry.target;
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
        gallerySurfaces.forEach((surface) => galleryObserver?.observe(surface));
    }
    return () => {
        events.abort();
        galleryObserver?.disconnect();
        thumbnailScheduler.dispose();
    };
}
