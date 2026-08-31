import type { RendererCleanup, RendererContext } from "../../contracts";
import {
  mountHistoryNavigationController,
  type HistoryNavigationControllerOptions
} from "./navigation-controller";
import {
  mountHistoryMediaController,
  type HistoryMediaControllerOptions
} from "./media-controller";
import { mountImageHistoryMediaController } from "./image-media-controller";
import {
  mountHistoryActionsController,
  type HistoryActionsControllerOptions
} from "./actions-controller";
import {
  mountImageHistoryLightbox,
  type ImageHistoryLightboxControllerOptions
} from "./lightbox-controller";
import {
  mountHistoryFilterController,
  type HistoryFilterControllerOptions
} from "./filter-controller";
import {
  mountHistoryTagsController,
  type HistoryTagsControllerOptions
} from "./tags-controller";

export interface HistoryPlaybackSnapshot {
  assetId: string;
  versionId: string;
  currentTime: number;
  paused: boolean;
  muted: boolean;
  volume: number;
  playbackRate: number;
  fullscreen: boolean;
}

export interface HistoryPageControllerOptions {
  context: RendererContext;
  playback: HistoryPlaybackSnapshot | null;
  navigation: HistoryNavigationControllerOptions;
  media: HistoryMediaControllerOptions;
  actions: HistoryActionsControllerOptions;
  filter: HistoryFilterControllerOptions;
  tags: HistoryTagsControllerOptions;
  historyLayout: "masonry" | "album";
  isImageHistoryDetail: boolean;
  bindHistoryMasonry(): void;
  bindHistoryAlbum(): void;
  bindImageHistoryViewer(): void;
  bindHistoryTitleMarquees(): void;
  restoreHistoryLayoutAnchor(): void;
  imageLightbox: ImageHistoryLightboxControllerOptions;
  openHistoryContextMenu(assetId: string, clientX: number, clientY: number, returnFocus?: HTMLElement): void;
  openImageHistoryContextMenu(projectId: string, clientX: number, clientY: number, returnFocus?: HTMLElement): void;
  openHistoryPlayerContextMenu?(
    assetId: string,
    versionId: string,
    clientX: number,
    clientY: number,
    player: HTMLElement,
    returnFocus?: HTMLElement
  ): void;
  closeHistoryContextMenu?(): void;
}

/**
 * History review uses a duration-relative seek step so short generated clips
 * do not lose most of their timeline on a single arrow press.
 */
export const HISTORY_PLAYER_ARROW_SEEK_PERCENT = 0.1;

export function seekHistoryPlayerByPercentage(
  video: HTMLVideoElement,
  direction: -1 | 1,
  percentage = HISTORY_PLAYER_ARROW_SEEK_PERCENT
): boolean {
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(percentage) || percentage <= 0) {
    return false;
  }
  const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  const targetTime = Math.min(
    duration,
    Math.max(0, currentTime + direction * duration * percentage)
  );
  if (targetTime === currentTime) return false;
  try {
    video.currentTime = targetTime;
    return true;
  } catch {
    return false;
  }
}

function eventPathContainsTag(event: Event, tagName: string): boolean {
  return event.composedPath().some((target) =>
    target instanceof Element && target.tagName.toLowerCase() === tagName
  );
}

function eventPathContainsElement(event: Event, element: HTMLElement): boolean {
  return event.composedPath().some((target) =>
    target instanceof Node && element.contains(target)
  );
}

function isHistoryPlayerFullscreen(player: HTMLElement): boolean {
  const fullscreenElement = document.fullscreenElement;
  return fullscreenElement === player ||
    Boolean(fullscreenElement && player.contains(fullscreenElement));
}

/**
 * Toggle the history detail player's fullscreen target without relying on the
 * browser's native video controls. Media Chrome observes the same fullscreen
 * change, so its button and icon stay synchronized with this path.
 */
export function toggleHistoryPlayerFullscreen(player: HTMLElement): void {
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

export function downloadHistoryPlayerVideo(video: HTMLVideoElement, filename: string): boolean {
  const url = video.currentSrc || video.src;
  const ownerDocument = video.ownerDocument;
  if (!url || !ownerDocument.body) return false;

  const anchor = ownerDocument.createElement("a");
  anchor.href = url;
  anchor.download = filename.trim() || "video";
  anchor.hidden = true;
  ownerDocument.body.append(anchor);
  try {
    anchor.click();
  } catch {
    anchor.remove();
    return false;
  }
  anchor.remove();
  return true;
}

export function toggleHistoryPlayerPictureInPicture(video: HTMLVideoElement): boolean {
  type PictureInPictureDocument = Document & {
    pictureInPictureElement?: Element | null;
    exitPictureInPicture?: () => Promise<void>;
  };
  type PictureInPictureVideo = HTMLVideoElement & {
    requestPictureInPicture?: () => Promise<unknown>;
  };

  const ownerDocument = video.ownerDocument as PictureInPictureDocument;
  if (ownerDocument.pictureInPictureElement === video) {
    if (typeof ownerDocument.exitPictureInPicture !== "function") return false;
    void ownerDocument.exitPictureInPicture().catch(() => undefined);
    return true;
  }

  const requestPictureInPicture = (video as PictureInPictureVideo).requestPictureInPicture;
  if (typeof requestPictureInPicture !== "function") return false;
  void requestPictureInPicture.call(video).catch(() => undefined);
  return true;
}

function historyPlayerMenuAction(event: Event): "download" | "pip" | null {
  const menuItem = event.composedPath().find((target): target is HTMLElement => {
    if (!(target instanceof HTMLElement)) return false;
    return target.dataset.historyPlayerMenuAction === "download" ||
      target.dataset.historyPlayerMenuAction === "pip";
  });
  const action = menuItem?.dataset.historyPlayerMenuAction;
  return action === "download" || action === "pip" ? action : null;
}

function isHistoryMenuKey(event: KeyboardEvent): boolean {
  return (event.key === "F10" && event.shiftKey) ||
    event.key === "ContextMenu" ||
    event.code === "ContextMenu";
}

function contextMenuPoint(trigger: HTMLElement): { clientX: number; clientY: number } {
  const rect = trigger.getBoundingClientRect();
  return {
    clientX: Math.max(8, Math.min(window.innerWidth - 8, rect.right - 8)),
    clientY: Math.max(8, Math.min(window.innerHeight - 8, rect.bottom - 8))
  };
}

export function mountHistoryPageController(
  options: HistoryPageControllerOptions
): RendererCleanup {
  const cleanups: RendererCleanup[] = [
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
  const root = options.context.root;

  if (options.historyLayout === "album") options.bindHistoryAlbum();
  else options.bindHistoryMasonry();
  if (options.isImageHistoryDetail) options.bindImageHistoryViewer();
  options.bindHistoryTitleMarquees();
  options.restoreHistoryLayoutAnchor();

  const detailVideo = document.querySelector<HTMLVideoElement>(".history-player video");
  const detailPlayer = detailVideo?.closest<HTMLElement>(".history-player");
  if (detailVideo && detailPlayer) {
    detailVideo.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleHistoryPlayerFullscreen(detailPlayer);
    }, { signal });

    const settingsMenu = detailPlayer.querySelector<HTMLElement>("media-settings-menu");
    if (settingsMenu) {
      const handleMenuAction = (event: Event): boolean => {
        const action = historyPlayerMenuAction(event);
        if (!action) return false;
        const handled = action === "download"
          ? downloadHistoryPlayerVideo(detailVideo, detailVideo.dataset.historyDownloadFilename ?? "video")
          : toggleHistoryPlayerPictureInPicture(detailVideo);
        if (!handled) return false;
        event.preventDefault();
        settingsMenu.hidden = true;
        return true;
      };

      settingsMenu.addEventListener("click", (event) => {
        handleMenuAction(event);
      }, { capture: true, signal });
      settingsMenu.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (!handleMenuAction(event)) return;
        event.stopPropagation();
      }, { capture: true, signal });
    }

    const openPlayerContextMenu = (clientX: number, clientY: number, returnFocus: HTMLElement = detailVideo) => {
      const assetId = detailVideo.dataset.historyAsset;
      const versionId = detailVideo.dataset.historyVersion;
      if (!assetId || !versionId || !options.openHistoryPlayerContextMenu) return;
      options.openHistoryPlayerContextMenu(assetId, versionId, clientX, clientY, detailPlayer, returnFocus);
    };
    detailPlayer.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openPlayerContextMenu(event.clientX, event.clientY);
    }, { signal });
    detailVideo.addEventListener("keydown", (event) => {
      if (!isHistoryMenuKey(event)) return;
      event.preventDefault();
      event.stopPropagation();
      const point = contextMenuPoint(detailVideo);
      openPlayerContextMenu(point.clientX, point.clientY, detailVideo);
    }, { signal });

    document.addEventListener("keydown", (event) => {
      if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (!isHistoryPlayerFullscreen(detailPlayer) && !eventPathContainsElement(event, detailPlayer)) return;
      // Keep horizontal arrows available to the vertical volume slider when
      // it owns focus. The player timeline uses percentage seeks.
      if (eventPathContainsTag(event, "media-volume-range")) return;
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      if (!seekHistoryPlayerByPercentage(detailVideo, direction)) return;
      event.preventDefault();
      event.stopPropagation();
    }, { capture: true, signal });
  }
  const playbackMatches = Boolean(
    detailVideo &&
    options.playback &&
    detailVideo.dataset.historyAsset === options.playback.assetId &&
    detailVideo.dataset.historyVersion === options.playback.versionId
  );
  if (detailVideo && !playbackMatches) {
    const startPlayback = () => {
      if (!detailVideo.isConnected || !options.context.root.contains(detailVideo)) return;
      detailVideo.loop = true;
      try {
        detailVideo.currentTime = 0;
      } catch {
        // Metadata may not expose a seekable range yet; playback still begins at zero.
      }
      void detailVideo.play().catch(() => {
        if (detailVideo.muted) return;
        detailVideo.muted = true;
        void detailVideo.play().catch(() => undefined);
      });
    };
    if (detailVideo.readyState >= 2) startPlayback();
    else detailVideo.addEventListener("canplay", startPlayback, { once: true, signal });
  }

  const historyCardFromEvent = (event: Event): HTMLElement | null => {
    const target = event.target instanceof Element ? event.target : null;
    return target?.closest<HTMLElement>("[data-history]") ?? null;
  };
  root.addEventListener("contextmenu", (event) => {
    const card = historyCardFromEvent(event);
    if (!card) return;
    event.preventDefault();
    const assetId = card.dataset.history;
    if (!assetId) return;
    if (card.dataset.historyKind === "image") {
      options.openImageHistoryContextMenu(assetId, event.clientX, event.clientY, card);
    } else {
      options.openHistoryContextMenu(assetId, event.clientX, event.clientY, card);
    }
  }, { signal });
  root.addEventListener("keydown", (event) => {
    const card = historyCardFromEvent(event);
    if (!card || event.target !== card || !isHistoryMenuKey(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const point = contextMenuPoint(card);
    const assetId = card.dataset.history;
    if (!assetId) return;
    if (card.dataset.historyKind === "image") {
      options.openImageHistoryContextMenu(assetId, point.clientX, point.clientY, card);
    } else {
      options.openHistoryContextMenu(assetId, point.clientX, point.clientY, card);
    }
  }, { signal });
  root.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest<HTMLButtonElement>("[data-history-more]");
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const card = button.closest<HTMLElement>("[data-history]");
    const assetId = card?.dataset.history;
    if (!card || !assetId) return;
    const point = contextMenuPoint(button);
    if (card.dataset.historyKind === "image") {
      options.openImageHistoryContextMenu(assetId, point.clientX, point.clientY, button);
    } else {
      options.openHistoryContextMenu(assetId, point.clientX, point.clientY, button);
    }
  }, { signal });

  return () => {
    options.closeHistoryContextMenu?.();
    events.abort();
    cleanups.reverse().forEach((cleanup) => cleanup());
  };
}
