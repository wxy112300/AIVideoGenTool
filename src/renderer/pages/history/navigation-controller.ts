import type { HistoryKind, Page, RendererCleanup, RendererContext } from "../../contracts";

export type HistoryLayout = "masonry" | "album";

export interface HistoryNavigationControllerOptions {
  setHistoryKind(kind: HistoryKind): void;
  resetHistoryScroll(): void;
  captureHistoryScrollPosition?(preferredAssetId?: string, preserveForActivation?: boolean): void;
  switchHistoryLayout(layout: HistoryLayout): void;
  openHistoryDetail(assetId: string): void;
  openImageHistoryDetail(projectId: string): void;
  navigateHistoryDetail(direction: -1 | 1): void;
  navigateImageHistoryDetail(direction: -1 | 1): void;
  navigateImageHistoryVersion(direction: -1 | 1): void;
  selectVideoHistoryVersion(versionId: string): void;
  selectImageHistoryVersion(versionId: string): void;
}

function directionFrom(value: string | undefined): -1 | 1 | null {
  const direction = Number(value);
  return direction === -1 || direction === 1 ? direction : null;
}

function stopNavigation(event: Event): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function navigationButtonFromEvent(root: HTMLElement, event: Event): HTMLElement | null {
  const path = event.composedPath();
  if (!path.includes(root)) return null;
  return path.find((target): target is HTMLElement =>
    target instanceof HTMLElement && target.matches("[data-history-navigation]")
  ) ?? null;
}

function isCardSpaceKey(event: KeyboardEvent): boolean {
  return event.key === " " || event.key === "Spacebar";
}

function historyTabIndex(tabs: HTMLElement[], current: HTMLElement, direction: -1 | 1): HTMLElement {
  const index = tabs.indexOf(current);
  return tabs[(index + direction + tabs.length) % tabs.length] ?? current;
}

export function mountHistoryNavigationController(
  context: RendererContext,
  options: HistoryNavigationControllerOptions
): RendererCleanup {
  const events = new AbortController();
  const signal = events.signal;
  const root = context.root;

  const historyTabs = [...root.querySelectorAll<HTMLElement>("[data-history-kind][role=tab]")];
  const activateHistoryKind = (button: HTMLElement, restoreFocus: boolean) => {
    const nextKind = button.dataset.historyKind as HistoryKind | undefined;
    if (nextKind !== "video" && nextKind !== "image") return;
    if (nextKind === context.getRoute().historyKind) {
      if (restoreFocus) button.focus();
      return;
    }
    context.reportUserAction("history-kind", { kind: nextKind });
    options.setHistoryKind(nextKind);
    options.resetHistoryScroll();
    context.requestRender();
    window.requestAnimationFrame(() => {
      if (context.getRoute().page !== "history" || context.getRoute().historyKind !== nextKind) return;
      window.scrollTo({ top: 0, behavior: "auto" });
      if (restoreFocus) {
        window.requestAnimationFrame(() => {
          root.querySelector<HTMLElement>(`[data-history-kind="${nextKind}"][role="tab"]`)?.focus();
        });
      }
    });
  };

  historyTabs.forEach((button) => {
    button.addEventListener("click", (event) => {
      stopNavigation(event);
      activateHistoryKind(button, false);
    }, { signal });
    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowUp" &&
        event.key !== "ArrowRight" && event.key !== "ArrowDown" &&
        event.key !== "Home" && event.key !== "End") return;
      event.preventDefault();
      event.stopPropagation();
      const next = event.key === "Home"
        ? historyTabs[0]
        : event.key === "End"
          ? historyTabs[historyTabs.length - 1]
          : historyTabIndex(historyTabs, button, event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1);
      if (next) activateHistoryKind(next, true);
    }, { signal });
  });

  root.querySelectorAll<HTMLElement>("[data-history-layout]").forEach((button) => {
    button.addEventListener("click", (event) => {
      stopNavigation(event);
      const layout = button.dataset.historyLayout;
      if (layout === "masonry" || layout === "album") {
        options.switchHistoryLayout(layout);
        root.querySelectorAll<HTMLElement>("[data-history-layout]").forEach((candidate) => {
          candidate.setAttribute("aria-pressed", String(candidate.dataset.historyLayout === layout));
        });
      }
    }, { signal });
  });

  root.addEventListener("click", (event) => {
    const button = navigationButtonFromEvent(root, event);
    if (!button) return;
    stopNavigation(event);
    const direction = directionFrom(button.dataset.historyNavigation);
    if (direction == null) return;
    const page = context.getRoute().page as Page;
    if (page === "image-history-detail") {
      options.navigateImageHistoryDetail(direction);
    } else {
      options.navigateHistoryDetail(direction);
    }
  }, { capture: true, signal });

  root.querySelectorAll<HTMLElement>("[data-image-version-navigation]").forEach((button) => {
    button.addEventListener("click", (event) => {
      stopNavigation(event);
      const direction = directionFrom(button.dataset.imageVersionNavigation);
      if (direction != null) options.navigateImageHistoryVersion(direction);
    }, { signal });
  });

  root.querySelectorAll<HTMLElement>("[data-image-version-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      stopNavigation(event);
      const versionId = button.dataset.imageVersionId;
      if (!versionId) return;
      options.selectImageHistoryVersion(versionId);
    }, { signal });
  });

  const cardFromEvent = (event: Event): HTMLElement | null => {
    const target = event.target instanceof Element ? event.target : null;
    return target?.closest<HTMLElement>("[data-open-history], [data-open-image-history]") ?? null;
  };
  root.addEventListener("click", (event) => {
    const card = cardFromEvent(event);
    if (!card || event.target instanceof Element && event.target.closest(
      ".history-media-badges, [data-history-curation], .history-detail-curation, .history-card-more, .history-preview-progress, [data-image-media-retry], [data-image-media-locate]"
    )) return;
    stopNavigation(event);
    const assetId = card.dataset.openHistory;
    const projectId = card.dataset.openImageHistory;
    if (assetId) options.openHistoryDetail(assetId);
    else if (projectId) options.openImageHistoryDetail(projectId);
  }, { signal });
  root.addEventListener("keydown", (event) => {
    const card = cardFromEvent(event);
    if (!card || event.target !== card) return;
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      card.click();
    } else if (isCardSpaceKey(event)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, { signal });
  root.addEventListener("keyup", (event) => {
    const card = cardFromEvent(event);
    if (!card || event.target !== card || !isCardSpaceKey(event)) return;
    event.preventDefault();
    event.stopPropagation();
    card.click();
  }, { signal });

  root.querySelectorAll<HTMLElement>("[data-version-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      stopNavigation(event);
      const versionId = button.dataset.versionId;
      if (versionId) options.selectVideoHistoryVersion(versionId);
    }, { signal });
  });

  const captureCardActivation = (event: Event): void => {
    if (context.getRoute().page !== "history") return;
    const card = cardFromEvent(event);
    if (!card) return;
    const assetId = card.dataset.openHistory ?? card.dataset.openImageHistory;
    if (assetId) options.captureHistoryScrollPosition?.(assetId, true);
  };
  // Pointer focus can scroll a card before the bubbling click handler runs.
  // Capture the anchor at the earliest activation boundary so opening a detail
  // page cannot overwrite it with the browser-adjusted scroll position.
  root.addEventListener("pointerdown", captureCardActivation, { capture: true, signal });
  root.addEventListener("mousedown", captureCardActivation, { capture: true, signal });
  root.addEventListener("click", captureCardActivation, { capture: true, signal });
  root.addEventListener("focusin", (event) => {
    captureCardActivation(event);
  }, { capture: true, signal });


  return () => events.abort();
}
