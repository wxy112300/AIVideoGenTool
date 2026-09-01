import type { AppState, PerformanceMetrics } from "../types";
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
  getPerformanceMetrics(): PerformanceMetrics | null;
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
  bindHistoryNavigation(): RendererCleanup;
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
  /** Coalesce event-driven refresh requests until the next paint opportunity. */
  requestRender(): void;
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

interface PreservedHistoryList {
  state: AppState;
  mainContent: DocumentFragment;
}

interface DeferredHistoryDetailPlayer {
  content: string;
  playerMarkup: string;
}

function isHistoryDetailPage(page: Page): boolean {
  return page === "history-detail" || page === "image-history-detail";
}

function hasHistoryList(root: HTMLElement): boolean {
  return Boolean(root.querySelector(".app-shell.history-shell .history-gallery"));
}

function hasHistoryDetail(root: HTMLElement): boolean {
  return Boolean(root.querySelector(".history-detail-hero, .image-history-detail-layout"));
}

function takeHistoryMainContent(root: HTMLElement): DocumentFragment | null {
  const main = root.querySelector<HTMLElement>(".app-shell.history-shell > main");
  if (!main || !main.querySelector(".history-gallery")) return null;
  const content = document.createDocumentFragment();
  while (main.firstChild) content.append(main.firstChild);
  return content;
}

function deferHistoryDetailPlayer(content: string): DeferredHistoryDetailPlayer | null {
  const playerStart = content.indexOf("<media-controller");
  if (playerStart < 0) return null;
  const openingEnd = content.indexOf(">", playerStart);
  const closingStart = content.indexOf("</media-controller>", openingEnd + 1);
  if (openingEnd < 0 || closingStart < 0) return null;
  const opening = content.slice(playerStart, openingEnd + 1);
  const playerMarkup = content.slice(playerStart, closingStart + "</media-controller>".length);
  const placeholderOpening = opening
    .replace(/^<media-controller\b/, '<div data-history-player-placeholder="true"')
    .replace(/>$/, ' aria-busy="true">');
  const placeholder = `${placeholderOpening}</div>`;
  return {
    content: `${content.slice(0, playerStart)}${placeholder}${content.slice(closingStart + "</media-controller>".length)}`,
    playerMarkup
  };
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

async function mountDeferredHistoryPlayer(
  root: HTMLElement,
  playerMarkup: string,
  isCurrent: () => boolean
): Promise<boolean> {
  const placeholder = root.querySelector<HTMLElement>("[data-history-player-placeholder]");
  if (!placeholder) return true;
  await nextAnimationFrame();
  if (!isCurrent()) return false;

  const detachedPlayer = document.createElement("div");
  detachedPlayer.innerHTML = playerMarkup;
  const player = detachedPlayer.firstElementChild;
  if (!(player instanceof HTMLElement)) return false;

  const playerChildren = [...player.children];
  const controlBar = playerChildren.find((child) => child.localName === "media-control-bar") as HTMLElement | undefined;
  const controlChildren = controlBar ? [...controlBar.children] : [];
  const volume = controlChildren.find((child) => child.classList.contains("history-player-volume"));
  const volumeChildren = volume ? [...volume.children] : [];
  const volumeRange = volumeChildren.find((child) => child.localName === "media-volume-range");
  const utilityGroup = controlChildren.find((child) => child.classList.contains("history-player-utility-group"));
  const utilityChildren = utilityGroup ? [...utilityGroup.children] : [];
  controlBar?.replaceChildren();
  volume?.replaceChildren();
  utilityGroup?.replaceChildren();
  player.replaceChildren();

  await nextAnimationFrame();
  if (!isCurrent()) return false;

  placeholder.replaceWith(player);
  await nextAnimationFrame();
  if (!isCurrent()) return false;
  player.append(...playerChildren.filter((child) => child !== controlBar));

  const continueMount = async (): Promise<void> => {
    if (!controlBar) return;
    await nextAnimationFrame();
    if (!isCurrent()) return;
    player.append(controlBar);

    await nextAnimationFrame();
    if (!isCurrent()) return;
    controlBar.append(...controlChildren);

    await nextAnimationFrame();
    if (!isCurrent()) return;
    if (volume) volume.append(...volumeChildren.filter((child) => child !== volumeRange));
    if (utilityGroup) utilityGroup.append(...utilityChildren);
    renderIcons(controlBar);

    await nextAnimationFrame();
    if (!isCurrent()) return;
    if (volumeRange && volume) volume.append(volumeRange);
    renderIcons(controlBar);
  };
  void continueMount().catch(() => undefined);
  return true;
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
    // History cards keep an inert <video> shell until their scheduler brings
    // a preview into the viewport. Calling load() on every inert shell while
    // leaving the list would force Chromium to touch hundreds of media
    // elements in the click task. Only tear down elements that have actually
    // acquired a source or entered a media state.
    const hasActiveMedia = Boolean(
      video.getAttribute("src") ||
      video.currentSrc ||
      video.querySelector("source") ||
      video.dataset.historyLoaded === "true" ||
      !video.paused
    );
    if (!hasActiveMedia) return;
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
  let scheduledFrame: number | null = null;
  let scheduledToken = 0;
  let preservedHistoryList: PreservedHistoryList | null = null;

  const cancelScheduledRender = (): void => {
    scheduledToken += 1;
    if (scheduledFrame === null) return;
    window.cancelAnimationFrame(scheduledFrame);
    scheduledFrame = null;
  };

  const renderNow = (): void => {
    // An explicit command render supersedes an event refresh that has not
    // reached the frame boundary yet. This keeps command ordering immediate.
    cancelScheduledRender();
    const request = ++renderRequest;
    void (async () => {
      const requestedPage = options.getPage();
      if (requestedPage === "create" || requestedPage === "settings") {
        await options.ensurePromptPacks();
      }
      if (request !== renderRequest) return;

      const previousPage = options.getPage();
      const enteringHistoryDetail = isHistoryDetailPage(previousPage) && hasHistoryList(options.root);
      const returningFromHistoryDetail = previousPage === "history" && hasHistoryDetail(options.root);
      options.beforeRenderHistory();
      if (previousPage === "queue") options.beforeRenderQueue();
      const playback = captureHistoryPlayback(options.root, previousPage);
      stopRenderedVideoPlayback(options.root);
      if (enteringHistoryDetail) {
        const mainContent = takeHistoryMainContent(options.root);
        if (mainContent) {
          preservedHistoryList = {
            state: options.getState(),
            mainContent
          };
        }
      } else if (!isHistoryDetailPage(previousPage) && !returningFromHistoryDetail) {
        preservedHistoryList = null;
      }
      options.closeAppLogContextMenu();

      const page = options.getPage();
      const state = options.getState();
      const preservedList = preservedHistoryList;
      const restorePreservedHistory = page === "history" &&
        returningFromHistoryDetail &&
        preservedList?.state === state;
      if (page === "history" && returningFromHistoryDetail && !restorePreservedHistory) {
        preservedHistoryList = null;
      }
      let content = restorePreservedHistory ? "" : previousPage === "create" ? options.renderPages.create() :
        previousPage === "queue" ? options.renderPages.queue() :
        previousPage === "history" ? options.renderPages.history() :
        previousPage === "history-detail" ? options.renderPages.historyDetail() :
        previousPage === "image-history-detail" ? options.renderPages.imageHistoryDetail() :
        options.renderPages.settings();
      let deferredHistoryPlayerMarkup: string | null = null;
      if (isHistoryDetailPage(page)) {
        const deferredPlayer = deferHistoryDetailPlayer(content);
        if (deferredPlayer) {
          content = deferredPlayer.content;
          deferredHistoryPlayerMarkup = deferredPlayer.playerMarkup;
        }
      }
      const ui = options.getUiState();
      const focus = captureFocus(options.root);
      let shellBound = false;
      const historyNavigationCleanup: { current: RendererCleanup | null } = { current: null };
      const bindShellController = (): void => {
        if (shellBound) return;
        options.bindShell();
        options.addPageCleanup(options.bindHistoryViewportControls());
        shellBound = true;
      };

      options.root.innerHTML = renderShell({
        page,
        appVersion: ui.appVersion,
        queueCount: state.queue.length,
        performanceMetrics: options.getPerformanceMetrics(),
        flashMessage: ui.flashMessage,
        flashKind: ui.flashNotification?.kind ?? "info",
        flashActions: ui.flashNotification?.actions ?? [],
        content,
        t: options.t,
        icon: options.icon,
        escapeHtml: options.escapeHtml
      });
      if (page === "history" || isHistoryDetailPage(page)) bindShellController();
      if (restorePreservedHistory && preservedList) {
        const renderedMain = options.root.querySelector<HTMLElement>(".app-shell.history-shell > main");
        renderedMain?.append(preservedList.mainContent);
        preservedHistoryList = null;
        historyNavigationCleanup.current = options.bindHistoryNavigation();
        options.addPageCleanup(historyNavigationCleanup.current);
        options.restoreHistoryScrollPosition();
      } else if (page === "history") {
        historyNavigationCleanup.current = options.bindHistoryNavigation();
        options.addPageCleanup(historyNavigationCleanup.current);
      }
      if (deferredHistoryPlayerMarkup) {
        const mounted = await mountDeferredHistoryPlayer(
          options.root,
          deferredHistoryPlayerMarkup,
          () => request === renderRequest && options.getPage() === page
        );
        if (!mounted) return;
      }
      if (page === "history") {
        // History can contain hundreds of cards. Let the browser commit the
        // shell/list DOM before mounting controllers and media observers so a
        // return click does not keep all work in one input task.
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        if (request !== renderRequest || options.getPage() !== page) {
          return;
        }
      }
      const earlyHistoryNavigationCleanup = historyNavigationCleanup.current;
      historyNavigationCleanup.current = null;
      earlyHistoryNavigationCleanup?.();
      renderIcons(options.root);
      bindShellController();
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
      if (page === "history" && !restorePreservedHistory) options.restoreHistoryScrollPosition();
      if (playback) restoreHistoryPlayerFullscreen(options.root, playback);
      restoreHistoryPlayback(options.root, playback);
      restoreFocus(options.root, focus);
    })().catch((error) => {
      console.error("Failed to render page dependencies", error);
    });
  };

  return {
    render: renderNow,
    requestRender() {
      if (scheduledFrame !== null) return;
      const token = ++scheduledToken;
      scheduledFrame = window.requestAnimationFrame(() => {
        if (token !== scheduledToken) return;
        scheduledFrame = null;
        renderNow();
      });
    }
  };
}
