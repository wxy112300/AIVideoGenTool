import type { HistoryKind, RendererCleanup, RendererContext } from "../../contracts";
import {
  assignHistoryMasonryColumns,
  estimateHistoryCardHeight,
  historyCardsByOrder,
  historyAlbumColumnCount,
  historyMediaAspectRatio,
  historyMasonryColumnCount
} from "./helpers";

export type HistoryLayout = "masonry" | "album";
type HistoryAnchor = { assetId: string; offsetFromCenter: number };

export interface HistoryScrollSnapshot {
  scrollY: number;
  assetId: string | null;
  offsetFromViewportCenter: number;
  historyKind: HistoryKind;
  layout: HistoryLayout;
  filterSignature: string;
}

export function historyScrollAnchorIsValid(
  snapshot: HistoryScrollSnapshot,
  historyKind: HistoryKind,
  layout: HistoryLayout,
  filterSignature: string,
  assetExists: boolean
): boolean {
  return Boolean(snapshot.assetId) &&
    assetExists &&
    snapshot.historyKind === historyKind &&
    snapshot.layout === layout &&
    snapshot.filterSignature === filterSignature;
}

export function clampHistoryScrollPosition(
  scrollY: number,
  documentHeight: number,
  viewportHeight: number
): number {
  const position = Number.isFinite(scrollY) ? Math.max(0, scrollY) : 0;
  const height = Number.isFinite(documentHeight) ? Math.max(0, documentHeight) : 0;
  const viewport = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight) : 0;
  return Math.min(position, Math.max(0, height - viewport));
}

export interface HistoryLayoutController {
  getLayout(): HistoryLayout;
  setScrollRestorePending(value: boolean): void;
  resetScroll(): void;
  captureHistoryScrollPosition(): void;
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
  reportUserAction: (action: string, meta?: Record<string, unknown>) => void,
  getHistoryFilterSignature: () => string = () => ""
): HistoryLayoutController {
  let layout: HistoryLayout = "masonry";
  let scrollPosition = 0;
  let historyScrollSnapshot: HistoryScrollSnapshot | null = null;
  let renderedHistoryFilterSignature = getHistoryFilterSignature();
  let scrollRestorePending = false;
  let layoutAnchor: HistoryAnchor | null = null;
  let layoutRestoreFrame: number | null = null;
  let scrollRestoreFrame: number | null = null;
  let scrollRestoreObserver: ResizeObserver | null = null;
  let viewportEvents: AbortController | null = null;
  let masonryResizeObserver: ResizeObserver | null = null;
  let albumResizeObserver: ResizeObserver | null = null;
  let imageViewerResizeObserver: ResizeObserver | null = null;
  let titleResizeObserver: ResizeObserver | null = null;
  let titleViewportObserver: IntersectionObserver | null = null;
  let titleMeasureFrame: number | null = null;
  let titleEvents: AbortController | null = null;

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

  const cancelPendingScrollRestore = () => {
    if (scrollRestoreFrame !== null) {
      window.cancelAnimationFrame(scrollRestoreFrame);
      scrollRestoreFrame = null;
    }
    scrollRestoreObserver?.disconnect();
    scrollRestoreObserver = null;
  };

  const restoreScrollPosition = () => {
    cancelPendingScrollRestore();
    const snapshot = historyScrollSnapshot;
    scrollRestoreFrame = window.requestAnimationFrame(() => {
      scrollRestoreFrame = null;
      if (context.getRoute().page !== "history") {
        scrollRestorePending = false;
        return;
      }
      const documentHeight = Math.max(
        document.documentElement?.scrollHeight ?? 0,
        document.body?.scrollHeight ?? 0
      );
      const position = clampHistoryScrollPosition(
        snapshot?.scrollY ?? scrollPosition,
        documentHeight,
        window.innerHeight
      );
      window.scrollTo({ top: position, behavior: "auto" });
      scrollRestoreFrame = window.requestAnimationFrame(() => {
        scrollRestoreFrame = null;
        if (context.getRoute().page !== "history") {
          scrollRestorePending = false;
          return;
        }
        const currentRoute = context.getRoute();
        const currentFilterSignature = getHistoryFilterSignature();
        const target = snapshot?.assetId
          ? [...document.querySelectorAll<HTMLElement>(".history-gallery-item")]
            .find((item) => item.dataset.history === snapshot.assetId)
          : undefined;
        if (!snapshot || !target || !historyScrollAnchorIsValid(
          snapshot,
          currentRoute.historyKind,
          layout,
          currentFilterSignature,
          Boolean(target)
        )) {
          renderedHistoryFilterSignature = currentFilterSignature;
          scrollRestorePending = false;
          return;
        }
        const desiredCenter = window.innerHeight / 2 + snapshot.offsetFromViewportCenter;
        const correctAnchor = () => {
          if (context.getRoute().page !== "history" || !target.isConnected) return;
          const rect = target.getBoundingClientRect();
          const delta = rect.top + rect.height / 2 - desiredCenter;
          if (Math.abs(delta) >= 1) window.scrollBy({ top: delta, behavior: "auto" });
        };
        correctAnchor();
        if (typeof ResizeObserver !== "undefined") {
          let correctionUsed = false;
          const gallery = target.closest<HTMLElement>(".history-gallery") ?? target;
          let firstResizeNotification = true;
          let observedHeight = gallery.getBoundingClientRect().height;
          const observer = new ResizeObserver(() => {
            const nextHeight = gallery.getBoundingClientRect().height;
            if (firstResizeNotification) {
              firstResizeNotification = false;
              observedHeight = nextHeight;
              return;
            }
            if (Math.abs(nextHeight - observedHeight) < 1) return;
            observedHeight = nextHeight;
            if (correctionUsed) return;
            correctionUsed = true;
            observer.disconnect();
            if (scrollRestoreObserver === observer) scrollRestoreObserver = null;
            scrollRestoreFrame = window.requestAnimationFrame(() => {
              scrollRestoreFrame = null;
              correctAnchor();
            });
          });
          scrollRestoreObserver = observer;
          observer.observe(gallery);
        }
        renderedHistoryFilterSignature = currentFilterSignature;
        scrollRestorePending = false;
      });
    });
  };

  const layoutMasonry = (gallery: HTMLElement): number => {
    const cards = historyCardsByOrder(gallery);
    if (!cards.length) return 0;
    const gap = Number.parseFloat(getComputedStyle(gallery).columnGap) || 10;
    const columnCount = historyMasonryColumnCount(gallery.clientWidth, gap);
    const cardWidth = Math.max(1, (gallery.clientWidth - gap * Math.max(0, columnCount - 1)) / columnCount);
    const copyHeight = cards[0]?.querySelector<HTMLElement>(".history-gallery-copy")?.getBoundingClientRect().height ?? 70;
    const cardHeights = cards.map((card) => {
      const mediaRatio = historyMediaAspectRatio(
        card.querySelector<HTMLElement>(".history-media")?.style.getPropertyValue("--media-ratio") ?? ""
      );
      const height = estimateHistoryCardHeight(cardWidth, mediaRatio, copyHeight, "masonry");
      card.style.setProperty("--history-card-intrinsic-height", `${Math.ceil(height)}px`);
      return height;
    });
    const assignments = assignHistoryMasonryColumns(cardHeights, columnCount, gap);
    const columns = Array.from({ length: columnCount }, () => {
      const column = document.createElement("div");
      column.className = "history-masonry-column";
      return column;
    });
    assignments.forEach((cardIndexes, columnIndex) => {
      const column = columns[columnIndex];
      if (!column) return;
      cardIndexes.forEach((cardIndex) => {
        const card = cards[cardIndex];
        if (card) column.append(card);
      });
    });
    gallery.style.setProperty("--masonry-columns", String(columnCount));
    gallery.replaceChildren(...columns);
    return columnCount;
  };

  const layoutAlbum = (gallery: HTMLElement): void => {
    if (gallery.clientWidth <= 0) return;
    const gap = Number.parseFloat(getComputedStyle(gallery).columnGap) || 8;
    const availableWidth = gallery.clientWidth;
    const columnCount = historyAlbumColumnCount(availableWidth, gap);
    if (!columnCount) return;
    const cards = historyCardsByOrder(gallery);
    const cardWidth = Math.max(1, (availableWidth - gap * Math.max(0, columnCount - 1)) / columnCount);
    const copyHeight = cards[0]?.querySelector<HTMLElement>(".history-gallery-copy")?.getBoundingClientRect().height ?? 70;
    cards.forEach((card) => {
      const height = estimateHistoryCardHeight(cardWidth, 1, copyHeight, "album");
      card.style.setProperty("--history-card-intrinsic-height", `${Math.ceil(height)}px`);
    });
    gallery.style.gridTemplateColumns = `repeat(${columnCount}, minmax(0, 1fr))`;
    gallery.style.justifyContent = "stretch";
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
    const events = new AbortController();
    titleEvents = events;
    const measuredTitles = new Set<HTMLElement>();
    const pendingTitles = new Set<HTMLElement>();
    const measureTitle = (title: HTMLElement) => {
      if (events.signal.aborted || !title.isConnected) return;
      const text = title.querySelector<HTMLElement>(".history-card-title-track > span");
      const textWidth = text?.getBoundingClientRect().width ?? 0;
      const overflowing = textWidth > title.clientWidth;
      if (!overflowing) {
        title.classList.remove("is-overflowing");
        title.style.removeProperty("--marquee-distance");
      } else {
        title.style.setProperty("--marquee-distance", `${textWidth + 36}px`);
        title.classList.add("is-overflowing");
      }
      measuredTitles.add(title);
      titleResizeObserver?.observe(title);
    };
    const measureBatch = () => {
      titleMeasureFrame = null;
      if (events.signal.aborted) return;
      let measuredThisFrame = 0;
      for (const title of pendingTitles) {
        pendingTitles.delete(title);
        measureTitle(title);
        measuredThisFrame += 1;
        if (measuredThisFrame >= 12) break;
      }
      if (pendingTitles.size) titleMeasureFrame = window.requestAnimationFrame(measureBatch);
    };
    const enqueueTitle = (title: HTMLElement, force = false) => {
      if (events.signal.aborted || !title.isConnected || (!force && measuredTitles.has(title))) return;
      pendingTitles.add(title);
      if (titleMeasureFrame === null) titleMeasureFrame = window.requestAnimationFrame(measureBatch);
    };
    titles.forEach((title) => {
      title.addEventListener("mouseenter", () => measureTitle(title), { signal: events.signal });
    });
    if (typeof ResizeObserver !== "undefined") {
      titleResizeObserver = new ResizeObserver((entries) => {
        entries.forEach((entry) => {
          const title = entry.target as HTMLElement;
          if (measuredTitles.has(title)) enqueueTitle(title, true);
        });
      });
    }
    if (typeof IntersectionObserver !== "undefined") {
      titleViewportObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) enqueueTitle(entry.target as HTMLElement);
        });
      }, { rootMargin: "200px 0px", threshold: 0 });
      titles.forEach((title) => titleViewportObserver?.observe(title));
    } else {
      // Electron supports IntersectionObserver; this bounded fallback keeps
      // older environments from restoring the old full-table measurement.
      titles.slice(0, 12).forEach((title) => enqueueTitle(title));
    }
  };

  return {
    getLayout: () => layout,
    setScrollRestorePending: (value) => {
      scrollRestorePending = value;
    },
    resetScroll: () => {
      cancelPendingScrollRestore();
      scrollPosition = 0;
      historyScrollSnapshot = null;
      scrollRestorePending = true;
    },
    captureHistoryScrollPosition: () => {
      if (context.getRoute().page !== "history" || scrollRestorePending) return;
      const anchor = captureLayoutAnchor();
      scrollPosition = window.scrollY;
      historyScrollSnapshot = {
        scrollY: window.scrollY,
        assetId: anchor?.assetId ?? null,
        offsetFromViewportCenter: anchor?.offsetFromCenter ?? 0,
        historyKind: context.getRoute().historyKind,
        layout,
        filterSignature: renderedHistoryFilterSignature
      };
    },
    beforeRender: () => {
      cancelPendingScrollRestore();
      if (layoutRestoreFrame !== null) {
        window.cancelAnimationFrame(layoutRestoreFrame);
        layoutRestoreFrame = null;
      }
      layoutAnchor = null;
      if (context.getRoute().page === "history" && !scrollRestorePending) {
        const anchor = captureLayoutAnchor();
        scrollPosition = window.scrollY;
        historyScrollSnapshot = {
          scrollY: window.scrollY,
          assetId: anchor?.assetId ?? null,
          offsetFromViewportCenter: anchor?.offsetFromCenter ?? 0,
          historyKind: context.getRoute().historyKind,
          layout,
          filterSignature: renderedHistoryFilterSignature
        };
      }
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
      titleViewportObserver?.disconnect();
      titleViewportObserver = null;
      if (titleMeasureFrame !== null) {
        window.cancelAnimationFrame(titleMeasureFrame);
        titleMeasureFrame = null;
      }
      titleEvents?.abort();
      titleEvents = null;
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
