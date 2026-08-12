import type { RendererCleanup, RendererContext, Page } from "../../contracts";
import {
  historyCardsByOrder,
  historyMasonryColumnCount
} from "./helpers";

export type HistoryLayout = "masonry" | "album";
type HistoryAnchor = { assetId: string; offsetFromCenter: number };

export interface HistoryLayoutController {
  getLayout(): HistoryLayout;
  setScrollRestorePending(value: boolean): void;
  resetScroll(): void;
  captureScrollPosition(): void;
  beforeRender(): void;
  bindViewportControls(): RendererCleanup;
  bindMasonry(): void;
  bindAlbum(): void;
  bindImageHistoryViewer(): void;
  bindTitleMarquees(): void;
  switchLayout(nextLayout: HistoryLayout): void;
  restoreLayoutAnchor(): void;
  restoreScrollPosition(): void;
}

export function createHistoryLayoutController(
  context: RendererContext,
  reportUserAction: (action: string, meta?: Record<string, unknown>) => void
): HistoryLayoutController {
  let layout: HistoryLayout = "masonry";
  let scrollPosition = 0;
  let scrollRestorePending = false;
  let layoutAnchor: HistoryAnchor | null = null;
  let layoutRestoreFrame: number | null = null;
  let viewportEvents: AbortController | null = null;
  let masonryResizeObserver: ResizeObserver | null = null;
  let albumResizeObserver: ResizeObserver | null = null;
  let imageViewerResizeObserver: ResizeObserver | null = null;
  let titleResizeObserver: ResizeObserver | null = null;

  const captureLayoutAnchor = (): HistoryAnchor | null => {
    if (window.scrollY <= 1) return null;
    const heading = document.querySelector<HTMLElement>(".history-heading");
    if (heading) {
      const stickyTop = Number.parseFloat(getComputedStyle(heading).top) || 0;
      if (heading.getBoundingClientRect().top > stickyTop + 1) return null;
    }
    const cards = [...document.querySelectorAll<HTMLElement>(".history-gallery-item")];
    if (!cards.length) return null;
    const viewportCenter = window.innerHeight / 2;
    const card = cards.reduce((closest, candidate) => {
      const closestRect = closest.getBoundingClientRect();
      const candidateRect = candidate.getBoundingClientRect();
      return Math.abs(candidateRect.top + candidateRect.height / 2 - viewportCenter) <
        Math.abs(closestRect.top + closestRect.height / 2 - viewportCenter)
        ? candidate
        : closest;
    });
    const rect = card.getBoundingClientRect();
    return {
      assetId: card.dataset.history ?? "",
      offsetFromCenter: rect.top + rect.height / 2 - viewportCenter
    };
  };

  const restoreLayoutAnchor = () => {
    if (layoutRestoreFrame !== null) {
      window.cancelAnimationFrame(layoutRestoreFrame);
      layoutRestoreFrame = null;
    }
    const anchor = layoutAnchor;
    layoutAnchor = null;
    if (!anchor?.assetId) return;
    layoutRestoreFrame = window.requestAnimationFrame(() => {
      layoutRestoreFrame = null;
      const card = [...document.querySelectorAll<HTMLElement>(".history-gallery-item")]
        .find((item) => item.dataset.history === anchor.assetId);
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const desiredCenter = window.innerHeight / 2 + anchor.offsetFromCenter;
      const delta = rect.top + rect.height / 2 - desiredCenter;
      if (Math.abs(delta) >= 1) window.scrollBy({ top: delta, behavior: "auto" });
    });
  };

  const restoreScrollPosition = () => {
    const position = Math.max(0, scrollPosition);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (context.getRoute().page !== "history") {
          scrollRestorePending = false;
          return;
        }
        window.scrollTo({ top: position, behavior: "auto" });
        scrollRestorePending = false;
      });
    });
  };

  const layoutMasonry = (gallery: HTMLElement): number => {
    const cards = historyCardsByOrder(gallery);
    if (!cards.length) return 0;
    const gap = Number.parseFloat(getComputedStyle(gallery).columnGap) || 10;
    const columnCount = historyMasonryColumnCount(gallery.clientWidth, gap);
    const columns = Array.from({ length: columnCount }, () => {
      const column = document.createElement("div");
      column.className = "history-masonry-column";
      return column;
    });
    gallery.style.setProperty("--masonry-columns", String(columnCount));
    gallery.replaceChildren(...columns);
    for (const card of cards) {
      const shortestColumn = columns.reduce((shortest, column) =>
        column.getBoundingClientRect().height < shortest.getBoundingClientRect().height
          ? column
          : shortest
      );
      shortestColumn.append(card);
    }
    return columnCount;
  };

  const layoutAlbum = (gallery: HTMLElement): void => {
    const cards = historyCardsByOrder(gallery);
    if (!cards.length || gallery.clientWidth <= 0) return;
    const gap = Number.parseFloat(getComputedStyle(gallery).columnGap) || 8;
    const minimumCardWidth = 180;
    const maximumCardWidth = 300;
    const availableWidth = gallery.clientWidth;
    const maximumRowWidth = cards.length * maximumCardWidth + (cards.length - 1) * gap;
    let columnCount = cards.length;
    let cardWidth = maximumCardWidth;
    if (maximumRowWidth > availableWidth) {
      columnCount = Math.min(
        cards.length,
        Math.max(1, Math.floor((availableWidth + gap) / (minimumCardWidth + gap)))
      );
      cardWidth = (availableWidth - (columnCount - 1) * gap) / columnCount;
    }
    cardWidth = Math.max(1, Math.min(maximumCardWidth, cardWidth));
    gallery.style.gridTemplateColumns = `repeat(${columnCount}, ${cardWidth}px)`;
    gallery.style.justifyContent = "start";
  };

  const bindMasonry = () => {
    const gallery = document.querySelector<HTMLElement>(".history-gallery.masonry");
    if (!gallery) return;
    let columnCount = layoutMasonry(gallery);
    if (typeof ResizeObserver === "undefined") return;
    masonryResizeObserver = new ResizeObserver(() => {
      const gap = Number.parseFloat(getComputedStyle(gallery).columnGap) || 10;
      const nextColumnCount = historyMasonryColumnCount(gallery.clientWidth, gap);
      if (nextColumnCount !== columnCount) columnCount = layoutMasonry(gallery);
    });
    masonryResizeObserver.observe(gallery);
  };

  const bindAlbum = () => {
    const gallery = document.querySelector<HTMLElement>(".history-gallery.album");
    if (!gallery) return;
    const update = () => layoutAlbum(gallery);
    update();
    if (typeof ResizeObserver === "undefined") return;
    albumResizeObserver = new ResizeObserver(update);
    albumResizeObserver.observe(gallery);
  };

  const bindImageHistoryViewer = () => {
    const stagePanel = document.querySelector<HTMLElement>(".image-history-stage-panel");
    const versionRail = document.querySelector<HTMLElement>(".image-history-version-rail");
    const versionList = document.querySelector<HTMLElement>(".image-history-version-list");
    if (!stagePanel || !versionRail || !versionList) return;
    const update = () => {
      if (window.matchMedia("(max-width: 760px)").matches) {
        versionRail.style.removeProperty("height");
        versionList.style.removeProperty("height");
        return;
      }
      versionRail.style.height = "0px";
      versionList.style.height = "0px";
      const stageHeight = stagePanel.getBoundingClientRect().height;
      if (stageHeight <= 0) return;
      versionRail.style.height = `${stageHeight}px`;
      versionList.style.height = "100%";
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    imageViewerResizeObserver = new ResizeObserver(update);
    imageViewerResizeObserver.observe(stagePanel);
  };

  const bindTitleMarquees = () => {
    const titles = [...document.querySelectorAll<HTMLElement>(".history-card-title, .history-detail-title")];
    if (!titles.length) return;
    const update = () => {
      for (const title of titles) {
        title.classList.remove("is-overflowing");
        title.style.removeProperty("--marquee-distance");
        const text = title.querySelector<HTMLElement>(".history-card-title-track > span");
        if (!text || text.getBoundingClientRect().width <= title.clientWidth) continue;
        title.style.setProperty("--marquee-distance", `${text.getBoundingClientRect().width + 36}px`);
        title.classList.add("is-overflowing");
      }
    };
    window.requestAnimationFrame(update);
    if (typeof ResizeObserver !== "undefined") {
      titleResizeObserver = new ResizeObserver(update);
      titles.forEach((title) => titleResizeObserver?.observe(title));
    }
  };

  return {
    getLayout: () => layout,
    setScrollRestorePending: (value) => {
      scrollRestorePending = value;
    },
    resetScroll: () => {
      scrollPosition = 0;
      scrollRestorePending = false;
    },
    captureScrollPosition: () => {
      if (context.getRoute().page === "history" && !scrollRestorePending) scrollPosition = window.scrollY;
    },
    beforeRender: () => {
      if (layoutRestoreFrame !== null) {
        window.cancelAnimationFrame(layoutRestoreFrame);
        layoutRestoreFrame = null;
      }
      layoutAnchor = null;
      if (context.getRoute().page === "history" && !scrollRestorePending) scrollPosition = window.scrollY;
      viewportEvents?.abort();
      viewportEvents = null;
      masonryResizeObserver?.disconnect();
      masonryResizeObserver = null;
      albumResizeObserver?.disconnect();
      albumResizeObserver = null;
      imageViewerResizeObserver?.disconnect();
      imageViewerResizeObserver = null;
      titleResizeObserver?.disconnect();
      titleResizeObserver = null;
    },
    bindViewportControls: () => {
      const events = new AbortController();
      viewportEvents = events;
      const backTop = document.querySelector<HTMLButtonElement>("#history-back-top");
      const update = (capturePosition = true) => {
        if (capturePosition && context.getRoute().page === "history" && !scrollRestorePending) scrollPosition = window.scrollY;
        backTop?.classList.toggle("visible", window.scrollY > 260);
      };
      window.addEventListener("scroll", () => update(), { passive: true, signal: events.signal });
      backTop?.addEventListener("click", () => {
        reportUserAction(context.getRoute().page === "history" ? "history-scroll-top" : "page-scroll-top");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, { signal: events.signal });
      update(false);
      return () => {
        events.abort();
        if (viewportEvents === events) viewportEvents = null;
      };
    },
    bindMasonry,
    bindAlbum,
    bindImageHistoryViewer,
    bindTitleMarquees,
    switchLayout: (nextLayout) => {
      if (nextLayout === layout) return;
      if (layoutRestoreFrame !== null) {
        window.cancelAnimationFrame(layoutRestoreFrame);
        layoutRestoreFrame = null;
      }
      reportUserAction("history-layout", { from: layout, to: nextLayout });
      const gallery = document.querySelector<HTMLElement>(".history-gallery");
      if (!gallery) return;
      layoutAnchor = captureLayoutAnchor();
      layout = nextLayout;
      masonryResizeObserver?.disconnect();
      masonryResizeObserver = null;
      albumResizeObserver?.disconnect();
      albumResizeObserver = null;
      imageViewerResizeObserver?.disconnect();
      imageViewerResizeObserver = null;
      gallery.classList.toggle("masonry", nextLayout === "masonry");
      gallery.classList.toggle("album", nextLayout === "album");
      gallery.style.removeProperty("grid-template-columns");
      gallery.style.removeProperty("justify-content");
      if (nextLayout === "album") {
        const cards = historyCardsByOrder(gallery);
        if (cards.length) {
          gallery.replaceChildren(...cards);
          gallery.style.removeProperty("--masonry-columns");
        }
        bindAlbum();
      } else {
        bindMasonry();
      }
      document.querySelectorAll<HTMLElement>("[data-history-layout]").forEach((button) => {
        const active = button.dataset.historyLayout === nextLayout;
        button.classList.toggle("secondary", active);
        button.classList.toggle("ghost", !active);
      });
      restoreLayoutAnchor();
    },
    restoreLayoutAnchor,
    restoreScrollPosition: restoreScrollPosition
  };
}
