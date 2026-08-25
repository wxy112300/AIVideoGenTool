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
  renderOverlay(): void;
  beforeRenderQueue(): void;
  bindCreate(): void;
  bindQueue(): void;
  bindHistory(playback: HistoryPlaybackSnapshot | null): void;
  bindSettings(): void;
  bindHistoryViewportControls(): RendererCleanup;
  restoreQueueScrollPosition(): void;
  restoreHistoryScrollPosition(): void;
  ensurePromptPacks(): Promise<void>;
  syncAppLogPolling(): void;
  icon(name: string, className?: string): string;
  escapeHtml(value: unknown): string;
}

export interface RenderCoordinator {
  render(): void;
}

type RestorableFocusElement =
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLSelectElement
  | HTMLButtonElement;

interface FocusSnapshot {
  id: string;
  name: string;
  tagName: string;
  selectionStart: number | null;
  selectionEnd: number | null;
  selectionDirection: "forward" | "backward" | "none" | null;
  scrollLeft: number;
  scrollTop: number;
}

function isRestorableFocusElement(
  element: Element | null
): element is RestorableFocusElement {
  return element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLButtonElement;
}

function captureFocus(root: HTMLElement): FocusSnapshot | null {
  const activeElement = document.activeElement;
  if (!isRestorableFocusElement(activeElement) || !root.contains(activeElement)) return null;
  if (!activeElement.id && !activeElement.name) return null;

  const isTextControl = activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement;
  return {
    id: activeElement.id,
    name: activeElement.name,
    tagName: activeElement.tagName.toLowerCase(),
    selectionStart: isTextControl ? activeElement.selectionStart : null,
    selectionEnd: isTextControl ? activeElement.selectionEnd : null,
    selectionDirection: isTextControl ? activeElement.selectionDirection : null,
    scrollLeft: activeElement.scrollLeft,
    scrollTop: activeElement.scrollTop
  };
}

function findFocusTarget(
  root: HTMLElement,
  snapshot: FocusSnapshot
): RestorableFocusElement | null {
  if (snapshot.id) {
    const target = document.getElementById(snapshot.id);
    if (
      target &&
      root.contains(target) &&
      target.tagName.toLowerCase() === snapshot.tagName &&
      isRestorableFocusElement(target)
    ) return target;
  }
  if (!snapshot.name) return null;
  return Array.from(root.querySelectorAll<RestorableFocusElement>(
    "input, textarea, select, button"
  )).find((candidate) =>
    candidate.tagName.toLowerCase() === snapshot.tagName &&
    candidate.name === snapshot.name
  ) ?? null;
}

function restoreFocus(root: HTMLElement, snapshot: FocusSnapshot | null): void {
  if (!snapshot) return;
  const target = findFocusTarget(root, snapshot);
  if (!target || ("disabled" in target && target.disabled)) return;
  target.focus({ preventScroll: true });
  if (
    snapshot.selectionStart !== null &&
    (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
  ) {
    try {
      target.setSelectionRange(
        snapshot.selectionStart,
        snapshot.selectionEnd ?? snapshot.selectionStart,
        snapshot.selectionDirection ?? "none"
      );
    } catch {
      // Some input types do not expose a selectable text range.
    }
  }
  target.scrollLeft = snapshot.scrollLeft;
  target.scrollTop = snapshot.scrollTop;
}

function captureHistoryPlayback(
  root: HTMLElement,
  page: Page
): HistoryPlaybackSnapshot | null {
  if (page !== "history-detail") return null;
  const video = root.querySelector<HTMLVideoElement>(".history-player video");
  if (!video) return null;
  const player = root.querySelector<HTMLElement>(".history-player");
  const fullscreenElement = document.fullscreenElement;
  return {
    assetId: video.dataset.historyAsset ?? "",
    versionId: video.dataset.historyVersion ?? "",
    currentTime: video.currentTime,
    paused: video.paused,
    muted: video.muted,
    volume: video.volume,
    playbackRate: video.playbackRate,
    fullscreen: Boolean(
      player &&
      fullscreenElement &&
      (fullscreenElement === player || player.contains(fullscreenElement))
    )
  };
}

function restoreHistoryPlayerFullscreen(
  root: HTMLElement,
  snapshot: HistoryPlaybackSnapshot
): void {
  if (!snapshot.fullscreen || document.fullscreenElement) return;
  const player = root.querySelector<HTMLElement>(".history-player");
  if (typeof player?.requestFullscreen !== "function") return;
  // Fullscreen requests can be rejected when the render was triggered by an
  // asynchronous state update rather than a user gesture. The current player
  // remains usable in that case, so this is intentionally best effort.
  void player.requestFullscreen().catch(() => undefined);
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
    // A render can be superseded before metadata arrives. Never restart a
    // detached media element: doing so leaves an orphaned audio stream that
    // survives page navigation and overlaps the next detail player.
    if (!video.isConnected || !root.contains(video)) return;
    if (Number.isFinite(snapshot.volume)) {
      video.volume = Math.min(1, Math.max(0, snapshot.volume));
    }
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
    // Pausing alone is not sufficient for a media element that is about to be
    // detached. Clear its source and abort pending decode/play promises so a
    // late metadata callback cannot restart audio in the background.
    video.removeAttribute("src");
    video.querySelectorAll("source").forEach((source) => source.remove());
    video.load();
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

        const previousPage = options.getPage();
        options.beforeRenderHistory();
        if (previousPage === "queue") options.beforeRenderQueue();
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
        const focus = captureFocus(options.root);

        options.root.innerHTML = renderShell({
          page,
          appVersion: ui.appVersion,
          queueCount: state.queue.length,
          flashMessage: ui.flashMessage,
          flashKind: ui.flashNotification?.kind ?? "info",
          flashActions: ui.flashNotification?.actions ?? [],
          content,
          t: options.t,
          icon: options.icon,
          escapeHtml: options.escapeHtml
        });
        renderIcons(options.root);
        options.bindShell();
        options.addPageCleanup(options.bindHistoryViewportControls());
        if (page === "create") options.bindCreate();
        else if (page === "queue") options.bindQueue();
        else if (page === "history" || page === "history-detail" || page === "image-history-detail") {
          options.bindHistory(playback);
        } else if (page === "settings") {
          options.bindSettings();
        }
        options.renderOverlay();
        options.syncAppLogPolling();
        if (page === "queue" && previousPage === "queue") options.restoreQueueScrollPosition();
        if (page === "history") options.restoreHistoryScrollPosition();
        if (playback) restoreHistoryPlayerFullscreen(options.root, playback);
        restoreHistoryPlayback(options.root, playback);
        restoreFocus(options.root, focus);
      })().catch((error) => {
        console.error("Failed to render page dependencies", error);
      });
    }
  };
}
