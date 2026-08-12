import type { HistoryKind, Page, RendererCleanup, RendererContext } from "../../contracts";

export type HistoryLayout = "masonry" | "album";

export interface HistoryNavigationControllerOptions {
  setHistoryKind(kind: HistoryKind): void;
  resetHistoryScroll(): void;
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

export function mountHistoryNavigationController(
  context: RendererContext,
  options: HistoryNavigationControllerOptions
): RendererCleanup {
  const events = new AbortController();
  const signal = events.signal;
  const root = context.root;

  root.querySelectorAll<HTMLElement>("[data-history-kind][role=tab]").forEach((button) => {
    button.addEventListener("click", (event) => {
      stopNavigation(event);
      const nextKind = button.dataset.historyKind as HistoryKind | undefined;
      if (nextKind !== "video" && nextKind !== "image") return;
      if (nextKind === context.getRoute().historyKind) return;
      context.reportUserAction("history-kind", { kind: nextKind });
      options.setHistoryKind(nextKind);
      options.resetHistoryScroll();
      context.requestRender();
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
    }, { signal });
  });

  root.querySelectorAll<HTMLElement>("[data-history-layout]").forEach((button) => {
    button.addEventListener("click", (event) => {
      stopNavigation(event);
      const layout = button.dataset.historyLayout;
      if (layout === "masonry" || layout === "album") {
        options.switchHistoryLayout(layout);
      }
    }, { signal });
  });

  root.querySelectorAll<HTMLElement>("[data-history-navigation]").forEach((button) => {
    button.addEventListener("click", (event) => {
      stopNavigation(event);
      const direction = directionFrom(button.dataset.historyNavigation);
      if (direction == null) return;
      const page = context.getRoute().page as Page;
      if (page === "image-history-detail") {
        options.navigateImageHistoryDetail(direction);
      } else {
        options.navigateHistoryDetail(direction);
      }
    }, { signal });
  });

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

  root.querySelectorAll<HTMLElement>("[data-open-history]").forEach((button) => {
    button.addEventListener("click", (event) => {
      stopNavigation(event);
      const assetId = button.dataset.openHistory;
      if (assetId) options.openHistoryDetail(assetId);
    }, { signal });
  });

  root.querySelectorAll<HTMLElement>("[data-version-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      stopNavigation(event);
      const versionId = button.dataset.versionId;
      if (versionId) options.selectVideoHistoryVersion(versionId);
    }, { signal });
  });

  root.querySelectorAll<HTMLElement>("[data-open-image-history]").forEach((button) => {
    button.addEventListener("click", (event) => {
      stopNavigation(event);
      const projectId = button.dataset.openImageHistory;
      if (projectId) options.openImageHistoryDetail(projectId);
    }, { signal });
  });

  return () => events.abort();
}
