import { mountHistoryNavigationController } from "./navigation-controller";
import { mountHistoryMediaController } from "./media-controller";
import { mountImageHistoryMediaController } from "./image-media-controller";
import { mountHistoryActionsController } from "./actions-controller";
import { mountImageHistoryLightbox } from "./lightbox-controller";
import { mountHistoryFilterController } from "./filter-controller";
import { mountHistoryTagsController } from "./tags-controller";
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
        mountHistoryNavigationController(options.context, options.navigation),
        mountHistoryFilterController(options.context, options.filter),
        mountHistoryMediaController(options.context, options.media),
        mountImageHistoryMediaController(options.context, {
            loadImageHistoryThumbnail: options.media.loadImageHistoryThumbnail
        }),
        mountHistoryActionsController(options.context, options.actions),
        mountHistoryTagsController(options.context, options.tags),
        mountImageHistoryLightbox(options.context, options.imageLightbox)
    ];
    const events = new AbortController();
    const signal = events.signal;
    if (options.historyLayout === "album")
        options.bindHistoryAlbum();
    else
        options.bindHistoryMasonry();
    if (options.isImageHistoryDetail)
        options.bindImageHistoryViewer();
    options.bindHistoryTitleMarquees();
    options.restoreHistoryLayoutAnchor();
    const detailVideo = document.querySelector(".history-player video");
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
    document.querySelectorAll(".history-media-badges").forEach((badges) => {
        badges.addEventListener("click", (event) => {
            event.stopPropagation();
        }, { signal });
    });
    document.querySelectorAll("[data-history-curation], .history-detail-curation").forEach((curation) => {
        curation.addEventListener("click", (event) => {
            event.stopPropagation();
        }, { signal });
    });
    document.querySelectorAll("[data-history]").forEach((card) => {
        card.addEventListener("contextmenu", (event) => {
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
        card.addEventListener("keydown", (event) => {
            if (event.target !== card || !isHistoryMenuKey(event))
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
    });
    document.querySelectorAll("[data-history-more]").forEach((button) => {
        button.addEventListener("click", (event) => {
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
    });
    return () => {
        events.abort();
        cleanups.reverse().forEach((cleanup) => cleanup());
    };
}
