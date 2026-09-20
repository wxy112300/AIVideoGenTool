import { mountHistoryNavigationController } from "./navigation-controller";
import { mountHistoryMediaController } from "./media-controller";
import { mountImageHistoryMediaController } from "./image-media-controller";
import { mountHistoryActionsController } from "./actions-controller";
import { mountImageHistoryLightbox } from "./lightbox-controller";
import { mountHistoryFilterController } from "./filter-controller";
import { mountHistoryTagsController } from "./tags-controller";
import { mountHistoryBatchController } from "./batch-controller";
import { mountHistoryTimelineController } from "./timeline-controller";
/**
 * History review uses a duration-relative seek step so short generated clips
 * do not lose most of their timeline on a single arrow press.
 */
export const HISTORY_PLAYER_ARROW_SEEK_PERCENT = 0.1;
export function seekHistoryPlayerByPercentage(video, direction, percentage = HISTORY_PLAYER_ARROW_SEEK_PERCENT) {
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(percentage) || percentage <= 0) {
        return false;
    }
    const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    const targetTime = Math.min(duration, Math.max(0, currentTime + direction * duration * percentage));
    if (targetTime === currentTime)
        return false;
    try {
        video.currentTime = targetTime;
        return true;
    }
    catch {
        return false;
    }
}
function eventPathContainsTag(event, tagName) {
    return event.composedPath().some((target) => target instanceof Element && target.tagName.toLowerCase() === tagName);
}
function eventPathContainsElement(event, element) {
    return event.composedPath().some((target) => target instanceof Node && element.contains(target));
}
function isHistoryPlayerSpaceKey(event) {
    return event.key === " " || event.key === "Spacebar" || event.code === "Space";
}
function eventPathContainsHistoryPlayerControl(event) {
    return event.composedPath().some((target) => {
        if (!(target instanceof HTMLElement))
            return false;
        if (target instanceof HTMLAnchorElement ||
            target instanceof HTMLButtonElement ||
            target instanceof HTMLInputElement ||
            target instanceof HTMLSelectElement ||
            target instanceof HTMLTextAreaElement)
            return true;
        const tagName = target.tagName.toLowerCase();
        return tagName.startsWith("media-") &&
            tagName !== "media-controller" &&
            tagName !== "media-gesture-receiver";
    });
}
function toggleHistoryPlayerPlayback(video) {
    if (video.paused)
        void video.play().catch(() => undefined);
    else
        video.pause();
}
function isHistoryPlayerFullscreen(player) {
    const fullscreenElement = document.fullscreenElement;
    return fullscreenElement === player ||
        Boolean(fullscreenElement && player.contains(fullscreenElement));
}
/**
 * Toggle the history detail player's fullscreen target without relying on the
 * browser's native video controls. Media Chrome observes the same fullscreen
 * change, so its button and icon stay synchronized with this path.
 */
export function toggleHistoryPlayerFullscreen(player) {
    const fullscreenElement = document.fullscreenElement;
    const isFullscreen = fullscreenElement === player ||
        Boolean(fullscreenElement && player.contains(fullscreenElement));
    if (isFullscreen) {
        if (typeof document.exitFullscreen === "function") {
            void document.exitFullscreen().catch(() => undefined);
        }
        return;
    }
    if (typeof player.requestFullscreen === "function") {
        void player.requestFullscreen().catch(() => undefined);
    }
}
export function downloadHistoryPlayerVideo(video, filename) {
    const url = video.currentSrc || video.src;
    const ownerDocument = video.ownerDocument;
    if (!url || !ownerDocument.body)
        return false;
    const anchor = ownerDocument.createElement("a");
    anchor.href = url;
    anchor.download = filename.trim() || "video";
    anchor.hidden = true;
    ownerDocument.body.append(anchor);
    try {
        anchor.click();
    }
    catch {
        anchor.remove();
        return false;
    }
    anchor.remove();
    return true;
}
export function toggleHistoryPlayerPictureInPicture(video) {
    const ownerDocument = video.ownerDocument;
    if (ownerDocument.pictureInPictureElement === video) {
        if (typeof ownerDocument.exitPictureInPicture !== "function")
            return false;
        void ownerDocument.exitPictureInPicture().catch(() => undefined);
        return true;
    }
    const requestPictureInPicture = video.requestPictureInPicture;
    if (typeof requestPictureInPicture !== "function")
        return false;
    void requestPictureInPicture.call(video).catch(() => undefined);
    return true;
}
function historyPlayerMenuAction(event) {
    const menuItem = event.composedPath().find((target) => {
        if (!(target instanceof HTMLElement))
            return false;
        return target.dataset.historyPlayerMenuAction === "download" ||
            target.dataset.historyPlayerMenuAction === "pip";
    });
    const action = menuItem?.dataset.historyPlayerMenuAction;
    return action === "download" || action === "pip" ? action : null;
}
function isHistoryMenuKey(event) {
    return (event.key === "F10" && event.shiftKey) ||
        event.key === "ContextMenu" ||
        event.code === "ContextMenu";
}
function contextMenuPoint(trigger) {
    const rect = trigger.getBoundingClientRect();
    return {
        clientX: Math.max(8, Math.min(window.innerWidth - 8, rect.right - 8)),
        clientY: Math.max(8, Math.min(window.innerHeight - 8, rect.bottom - 8))
    };
}
export function mountHistoryPageController(options) {
    const cleanups = [
        ...(options.batch ? [mountHistoryBatchController(options.context, options.batch)] : []),
        mountHistoryNavigationController(options.context, options.navigation),
        mountHistoryFilterController(options.context, options.filter),
        mountHistoryMediaController(options.context, options.media),
        mountImageHistoryMediaController(options.context, {
            loadImageHistoryThumbnail: options.media.loadImageHistoryThumbnail,
            subscribeImageHistoryThumbnail: options.media.subscribeImageHistoryThumbnail,
            invalidateImageHistoryThumbnail: options.media.invalidateImageHistoryThumbnail
        }),
        mountHistoryActionsController(options.context, options.actions),
        mountHistoryTagsController(options.context, options.tags),
        mountImageHistoryLightbox(options.context, options.imageLightbox)
    ];
    const events = new AbortController();
    const signal = events.signal;
    const root = options.context.root;
    if (options.historyLayout === "album")
        options.bindHistoryAlbum();
    else
        options.bindHistoryMasonry();
    if (options.isImageHistoryDetail)
        options.bindImageHistoryViewer();
    options.bindHistoryTitleMarquees();
    options.restoreHistoryLayoutAnchor();
    cleanups.push(mountHistoryTimelineController(options.context));
    const detailVideo = document.querySelector(".history-player video");
    const detailPlayer = detailVideo?.closest(".history-player");
    if (detailVideo && detailPlayer) {
        detailVideo.addEventListener("dblclick", (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleHistoryPlayerFullscreen(detailPlayer);
        }, { signal });
        const settingsMenu = detailPlayer.querySelector("media-settings-menu");
        if (settingsMenu) {
            const handleMenuAction = (event) => {
                const action = historyPlayerMenuAction(event);
                if (!action)
                    return false;
                const handled = action === "download"
                    ? downloadHistoryPlayerVideo(detailVideo, detailVideo.dataset.historyDownloadFilename ?? "video")
                    : toggleHistoryPlayerPictureInPicture(detailVideo);
                if (!handled)
                    return false;
                event.preventDefault();
                settingsMenu.hidden = true;
                return true;
            };
            settingsMenu.addEventListener("click", (event) => {
                handleMenuAction(event);
            }, { capture: true, signal });
            settingsMenu.addEventListener("keydown", (event) => {
                if (event.key !== "Enter" && event.key !== " ")
                    return;
                if (!handleMenuAction(event))
                    return;
                event.stopPropagation();
            }, { capture: true, signal });
        }
        const openPlayerContextMenu = (clientX, clientY, returnFocus = detailVideo) => {
            const assetId = detailVideo.dataset.historyAsset;
            const versionId = detailVideo.dataset.historyVersion;
            if (!assetId || !versionId || !options.openHistoryPlayerContextMenu)
                return;
            options.openHistoryPlayerContextMenu(assetId, versionId, clientX, clientY, detailPlayer, returnFocus);
        };
        detailPlayer.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            event.stopPropagation();
            openPlayerContextMenu(event.clientX, event.clientY);
        }, { signal });
        detailVideo.addEventListener("keydown", (event) => {
            if (!isHistoryMenuKey(event))
                return;
            event.preventDefault();
            event.stopPropagation();
            const point = contextMenuPoint(detailVideo);
            openPlayerContextMenu(point.clientX, point.clientY, detailVideo);
        }, { signal });
        document.addEventListener("keydown", (event) => {
            if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
                return;
            const isFullscreen = isHistoryPlayerFullscreen(detailPlayer);
            if (!isFullscreen && !eventPathContainsElement(event, detailPlayer))
                return;
            if (isHistoryPlayerSpaceKey(event)) {
                // Media Chrome handles this when its controller owns focus, but a
                // fullscreen document can deliver the key outside that event path.
                // Controls keep their own Space semantics, so do not toggle twice.
                if (event.repeat || eventPathContainsHistoryPlayerControl(event))
                    return;
                event.preventDefault();
                event.stopPropagation();
                toggleHistoryPlayerPlayback(detailVideo);
                return;
            }
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
                return;
            // Keep horizontal arrows available to the vertical volume slider when
            // it owns focus. The player timeline uses percentage seeks.
            if (eventPathContainsTag(event, "media-volume-range"))
                return;
            const direction = event.key === "ArrowLeft" ? -1 : 1;
            if (!seekHistoryPlayerByPercentage(detailVideo, direction))
                return;
            event.preventDefault();
            event.stopPropagation();
        }, { capture: true, signal });
    }
    const playbackMatches = Boolean(detailVideo &&
        options.playback &&
        detailVideo.dataset.historyAsset === options.playback.assetId &&
        detailVideo.dataset.historyVersion === options.playback.versionId);
    if (detailVideo && !playbackMatches) {
        const startPlayback = () => {
            if (!detailVideo.isConnected || !options.context.root.contains(detailVideo))
                return;
            detailVideo.loop = true;
            try {
                detailVideo.currentTime = 0;
            }
            catch {
                // Metadata may not expose a seekable range yet; playback still begins at zero.
            }
            void detailVideo.play().catch(() => {
                if (detailVideo.muted)
                    return;
                detailVideo.muted = true;
                void detailVideo.play().catch(() => undefined);
            });
        };
        if (detailVideo.readyState >= 2)
            startPlayback();
        else
            detailVideo.addEventListener("canplay", startPlayback, { once: true, signal });
    }
    const historyCardFromEvent = (event) => {
        const target = event.target instanceof Element ? event.target : null;
        return target?.closest("[data-history]") ?? null;
    };
    root.addEventListener("contextmenu", (event) => {
        const card = historyCardFromEvent(event);
        if (!card)
            return;
        event.preventDefault();
        const assetId = card.dataset.history;
        if (!assetId)
            return;
        if (card.dataset.historyKind === "image") {
            options.openImageHistoryContextMenu(assetId, event.clientX, event.clientY, card);
        }
        else {
            options.openHistoryContextMenu(assetId, event.clientX, event.clientY, card);
        }
    }, { signal });
    root.addEventListener("keydown", (event) => {
        const card = historyCardFromEvent(event);
        if (!card || event.target !== card || !isHistoryMenuKey(event))
            return;
        event.preventDefault();
        event.stopPropagation();
        const point = contextMenuPoint(card);
        const assetId = card.dataset.history;
        if (!assetId)
            return;
        if (card.dataset.historyKind === "image") {
            options.openImageHistoryContextMenu(assetId, point.clientX, point.clientY, card);
        }
        else {
            options.openHistoryContextMenu(assetId, point.clientX, point.clientY, card);
        }
    }, { signal });
    root.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const button = target?.closest("[data-history-more]");
        if (!button)
            return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const card = button.closest("[data-history]");
        const assetId = card?.dataset.history;
        if (!card || !assetId)
            return;
        const point = contextMenuPoint(button);
        if (card.dataset.historyKind === "image") {
            options.openImageHistoryContextMenu(assetId, point.clientX, point.clientY, button);
        }
        else {
            options.openHistoryContextMenu(assetId, point.clientX, point.clientY, button);
        }
    }, { signal });
    return () => {
        options.closeHistoryContextMenu?.();
        events.abort();
        cleanups.reverse().forEach((cleanup) => cleanup());
    };
}
