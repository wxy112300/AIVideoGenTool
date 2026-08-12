import type { AppState } from "../types";
import type { Translate } from "../core/i18n";
import type { Page, RendererCleanup } from "./contracts";
import type { RendererUiState } from "./ui-state";
import type { HistoryPlaybackSnapshot } from "./pages/history/page-controller";
import { renderShell } from "./shell/page";
import { renderIcons } from "./shared/icons";

export interface RenderCoordinatorOptions {
  root: HTMLElement;
  addPageCleanup(cleanup: RendererCleanup): void;
  getPage(): Page;
  getState(): AppState;
  getUiState(): RendererUiState;
  t: Translate;
  renderPages: {
    create(): string;
    queue(): string;
    history(): string;
    historyDetail(): string;
    imageHistoryDetail(): string;
    settings(): string;
  };
  beforeRenderHistory(): void;
  closeAppLogContextMenu(): void;
  bindShell(): void;
  bindUpscaleDialog(): void;
  bindCreate(): void;
  bindQueue(): void;
  bindHistory(playback: HistoryPlaybackSnapshot | null): void;
  bindSettings(): void;
  bindHistoryViewportControls(): RendererCleanup;
  restoreHistoryScrollPosition(): void;
  ensurePromptPacks(): Promise<void>;
  syncAppLogPolling(): void;
  renderConfirmationDialog(): string;
  renderDirectoryMigrationDialog(): string;
  renderImageAssetLibraryDialog(): string;
  renderWindowCloseDialog(): string;
  renderUpscaleDialog(): string;
  icon(name: string, className?: string): string;
  escapeHtml(value: unknown): string;
}

export interface RenderCoordinator {
  render(): void;
}

function captureHistoryPlayback(
  root: HTMLElement,
  page: Page
): HistoryPlaybackSnapshot | null {
  if (page !== "history-detail") return null;
  const video = root.querySelector<HTMLVideoElement>(".history-player video");
  if (!video) return null;
  return {
    assetId: video.dataset.historyAsset ?? "",
    versionId: video.dataset.historyVersion ?? "",
    currentTime: video.currentTime,
    paused: video.paused,
    muted: video.muted,
    playbackRate: video.playbackRate
  };
}

function restoreHistoryPlayback(
  root: HTMLElement,
  snapshot: HistoryPlaybackSnapshot | null
): void {
  if (!snapshot) return;
  const video = root.querySelector<HTMLVideoElement>(".history-player video");
  if (!video) return;
  if (
    video.dataset.historyAsset !== snapshot.assetId ||
    video.dataset.historyVersion !== snapshot.versionId
  ) return;
  const restore = () => {
    video.muted = snapshot.muted;
    video.playbackRate = snapshot.playbackRate;
    if (Number.isFinite(video.duration)) {
      video.currentTime = Math.min(snapshot.currentTime, video.duration);
    }
    if (snapshot.paused) video.pause();
    else void video.play().catch(() => undefined);
  };
  if (video.readyState >= 1) window.requestAnimationFrame(restore);
  else video.addEventListener("loadedmetadata", restore, { once: true });
}

function stopRenderedVideoPlayback(root: HTMLElement): void {
  root.querySelectorAll<HTMLVideoElement>("video").forEach((video) => {
    video.pause();
  });
}

export function createRenderCoordinator(
  options: RenderCoordinatorOptions
): RenderCoordinator {
  let renderRequest = 0;
  return {
    render() {
      const request = ++renderRequest;
      void (async () => {
        const requestedPage = options.getPage();
        if (requestedPage === "create" || requestedPage === "settings") {
          await options.ensurePromptPacks();
        }
        if (request !== renderRequest) return;

        options.beforeRenderHistory();
        const previousPage = options.getPage();
        const playback = captureHistoryPlayback(options.root, previousPage);
        stopRenderedVideoPlayback(options.root);
        options.closeAppLogContextMenu();

        const content = previousPage === "create" ? options.renderPages.create() :
          previousPage === "queue" ? options.renderPages.queue() :
          previousPage === "history" ? options.renderPages.history() :
          previousPage === "history-detail" ? options.renderPages.historyDetail() :
          previousPage === "image-history-detail" ? options.renderPages.imageHistoryDetail() :
          options.renderPages.settings();
        const page = options.getPage();
        const state = options.getState();
        const ui = options.getUiState();

        options.root.innerHTML = renderShell({
          page,
          appVersion: ui.appVersion,
          queueCount: state.queue.length,
          flashMessage: ui.flashMessage,
          content,
          t: options.t,
          icon: options.icon,
          escapeHtml: options.escapeHtml,
          confirmationDialog: options.renderConfirmationDialog(),
          directoryMigrationDialog: options.renderDirectoryMigrationDialog(),
          imageAssetLibraryDialog: options.renderImageAssetLibraryDialog(),
          windowCloseDialog: options.renderWindowCloseDialog(),
          upscaleDialog: options.renderUpscaleDialog()
        });
        renderIcons(options.root);
        options.bindShell();
        options.addPageCleanup(options.bindHistoryViewportControls());
        options.bindUpscaleDialog();
        if (page === "create") options.bindCreate();
        else if (page === "queue") options.bindQueue();
        else if (page === "history" || page === "history-detail" || page === "image-history-detail") {
          options.bindHistory(playback);
        } else if (page === "settings") {
          options.bindSettings();
        }
        options.syncAppLogPolling();
        if (page === "history") options.restoreHistoryScrollPosition();
        restoreHistoryPlayback(options.root, playback);
      })().catch((error) => {
        console.error("Failed to render page dependencies", error);
      });
    }
  };
}
