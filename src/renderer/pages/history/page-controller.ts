import type { RendererCleanup, RendererContext } from "../../contracts";
import {
  mountHistoryNavigationController,
  type HistoryNavigationControllerOptions
} from "./navigation-controller";
import {
  mountHistoryMediaController,
  type HistoryMediaControllerOptions
} from "./media-controller";
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
  playbackRate: number;
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
  openHistoryContextMenu(assetId: string, clientX: number, clientY: number): void;
  openImageHistoryContextMenu(projectId: string, clientX: number, clientY: number): void;
}

export function mountHistoryPageController(
  options: HistoryPageControllerOptions
): RendererCleanup {
  const cleanups: RendererCleanup[] = [
    mountHistoryNavigationController(options.context, options.navigation),
    mountHistoryFilterController(options.context, options.filter),
    mountHistoryMediaController(options.context, options.media),
    mountHistoryActionsController(options.context, options.actions),
    mountHistoryTagsController(options.context, options.tags),
    mountImageHistoryLightbox(options.context, options.imageLightbox)
  ];
  const events = new AbortController();
  const signal = events.signal;

  if (options.historyLayout === "album") options.bindHistoryAlbum();
  else options.bindHistoryMasonry();
  if (options.isImageHistoryDetail) options.bindImageHistoryViewer();
  options.bindHistoryTitleMarquees();
  options.restoreHistoryLayoutAnchor();

  const detailVideo = document.querySelector<HTMLVideoElement>(".history-player video");
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

  document.querySelectorAll<HTMLElement>(".history-media-badges").forEach((badges) => {
    badges.addEventListener("click", (event) => {
      event.stopPropagation();
    }, { signal });
  });
  document.querySelectorAll<HTMLElement>("[data-history-curation], .history-detail-curation").forEach((curation) => {
    curation.addEventListener("click", (event) => {
      event.stopPropagation();
    }, { signal });
  });
  document.querySelectorAll<HTMLElement>("[data-history]").forEach((card) => {
    card.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const assetId = card.dataset.history;
      if (!assetId) return;
      if (card.dataset.historyKind === "image") {
        options.openImageHistoryContextMenu(assetId, event.clientX, event.clientY);
      } else {
        options.openHistoryContextMenu(assetId, event.clientX, event.clientY);
      }
    }, { signal });
  });

  return () => {
    events.abort();
    cleanups.reverse().forEach((cleanup) => cleanup());
  };
}
