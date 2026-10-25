import type { RendererCleanup, RendererContext } from "../../contracts";
import { virtualHistoryBox } from "./virtual-gallery";
import {
  clampHistoryTimelineProgress,
  closestHistoryTimelineMarker,
  historyTimelineProgress,
  historyTimelineMarkerLabel,
  historyTimelineScrollY
} from "./timeline";

const MIN_STAGE_WIDTH = 400;
const MIN_VIEWPORT_WIDTH = 480;
const MIN_MARKER_GAP = 5;

interface TimelineMarkerState {
  element: HTMLButtonElement;
  targetId: string;
  dateKey: string;
  label: string;
  displayLabel: string;
  targetScrollY: number;
  progress: number;
  order: number;
}

function requestFrame(callback: () => void): number {
  if (typeof window.requestAnimationFrame === "function") {
    return window.requestAnimationFrame(() => callback());
  }
  return window.setTimeout(callback, 0);
}

function cancelFrame(frame: number | null): void {
  if (frame === null) return;
  if (typeof window.cancelAnimationFrame === "function") {
    window.cancelAnimationFrame(frame);
  } else {
    window.clearTimeout(frame);
  }
}

function currentScrollY(): number {
  const value = Number.isFinite(window.scrollY) ? window.scrollY : window.pageYOffset;
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function maximumScrollY(): number {
  const documentHeight = Math.max(
    document.documentElement?.scrollHeight ?? 0,
    document.body?.scrollHeight ?? 0
  );
  return Math.max(0, documentHeight - Math.max(0, window.innerHeight));
}

function scrollWindowTo(top: number, behavior: ScrollBehavior): void {
  const safeTop = Math.max(0, Number.isFinite(top) ? top : 0);
  try {
    window.scrollTo({ top: safeTop, behavior });
  } catch {
    window.scrollTo(0, safeTop);
  }
}

function writeTimelineLabel(target: HTMLElement, label: string, dateKey?: string, locale = "zh-CN", countLabel = ""): void {
  target.replaceChildren();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey ?? "");
  if (!match) {
    target.textContent = label;
    return;
  }

  const year = target.ownerDocument.createElement("span");
  year.className = "history-timeline-year";
  const date = new Date(`${dateKey}T12:00:00`);
  year.textContent = `${match[1]} · ${new Intl.DateTimeFormat(locale || "zh-CN", { weekday: "short" }).format(date)}${countLabel ? ` · ${countLabel}` : ""}`;
  const monthDay = target.ownerDocument.createElement("span");
  monthDay.className = "history-timeline-month-day";
  monthDay.textContent = new Intl.DateTimeFormat(locale || "zh-CN", { month: "long", day: "numeric" }).format(date);
  target.append(monthDay, year);
}

export function mountHistoryTimelineController(context: RendererContext): RendererCleanup {
  const root = context.root;
  const timeline = root.querySelector<HTMLElement>("[data-history-timeline]");
  if (!timeline) return () => undefined;

  const stage = timeline.closest<HTMLElement>("[data-history-list-stage]");
  const gallery = stage?.querySelector<HTMLElement>(".history-gallery");
  const track = timeline.querySelector<HTMLElement>("[data-history-timeline-track]");
  const thumb = timeline.querySelector<HTMLButtonElement>("[data-history-timeline-thumb]");
  const lineFill = timeline.querySelector<HTMLElement>("[data-history-timeline-line-fill]");
  const current = timeline.querySelector<HTMLElement>("[data-history-timeline-current]");
  const hover = timeline.querySelector<HTMLElement>("[data-history-timeline-hover]");
  const markerElements = [...timeline.querySelectorAll<HTMLButtonElement>("[data-history-timeline-marker]")];
  if (!stage || !gallery || !track || !thumb || !lineFill || !current || !markerElements.length) {
    return () => undefined;
  }

  const events = new AbortController();
  const signal = events.signal;
  let measureFrame: number | null = null;
  let scrollFrame: number | null = null;
  let interactionTimer: number | null = null;
  let isDragging = false;
  let markerStates: TimelineMarkerState[] = [];
  let visibleMarkerStates: TimelineMarkerState[] = [];
  let lastCurrentLabel = "";

  const setInteracting = (active: boolean, keepBriefly = false) => {
    if (interactionTimer !== null) {
      window.clearTimeout(interactionTimer);
      interactionTimer = null;
    }
    if (active) {
      timeline.classList.add("is-interacting");
      if (keepBriefly) {
        interactionTimer = window.setTimeout(() => {
          interactionTimer = null;
          if (!isDragging) timeline.classList.remove("is-interacting");
        }, 1200);
      }
    } else if (!isDragging) {
      timeline.classList.remove("is-interacting");
    }
  };

  const headingOffset = (): number => {
    const heading = root.querySelector<HTMLElement>(".history-heading");
    if (!heading) return 14;
    const height = heading.getBoundingClientRect().height;
    const contextHeight = root.querySelector<HTMLElement>("[data-history-context]:not([hidden])")?.getBoundingClientRect().height ?? 0;
    const topbar = root.querySelector<HTMLElement>(".topbar")?.getBoundingClientRect().height ?? 64;
    return Math.max(14, topbar + height + contextHeight + 20);
  };

  const updateScrollState = () => {
    scrollFrame = null;
    if (stage.dataset.historyTimelineVisible !== "true") return;
    const maxScroll = maximumScrollY();
    const progress = historyTimelineProgress(currentScrollY(), maxScroll);
    const position = `${progress * 100}`;
    lineFill.style.setProperty("--history-timeline-progress", position);
    thumb.style.setProperty("--history-timeline-position", position);
    current.style.setProperty("--history-timeline-position", position);
    thumb.setAttribute("aria-valuenow", String(Math.round(progress * 100)));

    const markerIndex = closestHistoryTimelineMarker(
      markerStates.map((marker, index) => ({ index, top: marker.progress })),
      progress
    );
    const activeMarker = markerIndex >= 0 ? markerStates[markerIndex] : undefined;
    visibleMarkerStates.forEach((marker) => {
      const active = marker === activeMarker;
      marker.element.classList.toggle("is-active", active);
      if (active) marker.element.setAttribute("aria-current", "true");
      else marker.element.removeAttribute("aria-current");
    });
    const activeLabel = activeMarker?.displayLabel ?? "—";
    if (activeLabel !== lastCurrentLabel) {
      writeTimelineLabel(current, activeLabel, activeMarker?.dateKey, timeline.dataset.historyTimelineLocale, activeMarker ? context.t("history.list.items", { count: Number(activeMarker.element.dataset.historyTimelineCount) || 1 }) : "");
      current.setAttribute("aria-label", activeLabel);
      lastCurrentLabel = activeLabel;
    }
    thumb.setAttribute("aria-valuetext", activeLabel);
  };

  const scheduleScrollState = () => {
    if (scrollFrame !== null) return;
    scrollFrame = requestFrame(updateScrollState);
  };

  const setVisible = (visible: boolean) => {
    stage.dataset.historyTimelineVisible = String(visible);
    timeline.hidden = !visible;
    timeline.setAttribute("aria-hidden", String(!visible));
    if (!visible) {
      timeline.dataset.historyTimelineReady = "false";
      markerStates = [];
      visibleMarkerStates = [];
      timeline.classList.remove("is-interacting");
    }
  };

  const measure = () => {
    measureFrame = null;
    const stageWidth = stage.getBoundingClientRect().width || stage.clientWidth;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const canShow = stageWidth >= MIN_STAGE_WIDTH &&
      viewportWidth >= MIN_VIEWPORT_WIDTH &&
      maximumScrollY() > 1;
    setVisible(canShow);
    if (!canShow) return;

    const galleryRect = gallery.getBoundingClientRect();
    const top = Math.ceil(headingOffset());
    const left = Math.min(window.innerWidth - 30, Math.ceil(galleryRect.right + 4));
    const height = Math.max(80, Math.floor(window.innerHeight - top - 72));
    timeline.style.setProperty("--history-timeline-top", `${top}px`);
    timeline.style.setProperty("--history-timeline-left", `${left}px`);
    timeline.style.setProperty("--history-timeline-height", `${height}px`);

    const trackHeight = Math.max(1, track.getBoundingClientRect().height);
    const maxScroll = maximumScrollY();
    const cards = [...gallery.querySelectorAll<HTMLElement>("[data-history]")];
    const cardsById = new Map(cards.map(card => [card.dataset.history, card]));
    const offset = headingOffset();
    const states: TimelineMarkerState[] = [];

    // Read all card positions before writing marker styles; interleaving them
    // forces layout repeatedly when a large library spans many dates.
    const positions = markerElements.map(element => {
      const id = element.dataset.historyTimelineTarget ?? "";
      const box = virtualHistoryBox(gallery, id);
      if (box) return { top: galleryRect.top + box.top };
      const card = cardsById.get(id);
      return card?.getBoundingClientRect();
    });
    markerElements.forEach((element, order) => {
      element.hidden = true;
      element.classList.remove("is-active");
      element.removeAttribute("aria-current");
      const targetId = element.dataset.historyTimelineTarget ?? "";
      const rect = positions[order];
      if (!rect) return;
      const targetScrollY = Math.min(
        maxScroll,
        Math.max(0, rect.top + currentScrollY() - offset)
      );
      const progress = historyTimelineProgress(targetScrollY, maxScroll);
      const label = element.dataset.historyTimelineLabel || element.textContent?.trim() || "—";
      element.style.setProperty("--history-timeline-position", `${progress * 100}`);
      states.push({
        element,
        targetId,
        dateKey: element.dataset.historyTimelineDateKey ?? "unknown",
        label,
        displayLabel: label,
        targetScrollY,
        progress,
        order
      });
    });

    if (!states.length) {
      setVisible(false);
      return;
    }

    const sorted = [...states].sort((left, right) =>
      left.progress - right.progress || left.order - right.order
    );
    const minimumGap = MIN_MARKER_GAP / trackHeight;
    const visible: TimelineMarkerState[] = [];
    let anchor: TimelineMarkerState | null = null;
    let rangeLabels: string[] = [];
    let lastVisibleProgress = Number.NEGATIVE_INFINITY;

    const commitAnchor = () => {
      if (!anchor) return;
      const displayLabel = historyTimelineMarkerLabel(rangeLabels);
      const accessibleLabel = rangeLabels.length > 1
        ? `${displayLabel} · ${rangeLabels.join(" · ")}`
        : displayLabel;
      anchor.displayLabel = displayLabel;
      writeTimelineLabel(anchor.element, displayLabel, anchor.dateKey);
      anchor.element.title = accessibleLabel;
      anchor.element.setAttribute("aria-label", accessibleLabel);
      anchor.element.hidden = false;
      visible.push(anchor);
    };

    sorted.forEach((state) => {
      if (!anchor || state.progress - lastVisibleProgress >= minimumGap) {
        commitAnchor();
        anchor = state;
        rangeLabels = [state.label];
        lastVisibleProgress = state.progress;
      } else {
        state.element.hidden = true;
        rangeLabels.push(state.label);
      }
    });
    commitAnchor();

    let month = "", lastMonthProgress = -Infinity;
    visible.forEach(marker => {
      const key = marker.dateKey.slice(0, 7);
      const showMonth = key !== month && (marker.progress - lastMonthProgress) * trackHeight >= 22;
      marker.element.classList.toggle("is-month", showMonth);
      if (showMonth) {
        const date = new Date(marker.dateKey + "T12:00:00");
        if (Number.isFinite(date.getTime())) marker.element.textContent = new Intl.DateTimeFormat(timeline.dataset.historyTimelineLocale || "zh-CN", { year: key.slice(0,4) !== String(new Date().getFullYear()) ? "numeric" : undefined, month: "short" }).format(date);
        month = key; lastMonthProgress = marker.progress;
      } else marker.element.textContent = "";
    });

    markerStates = states;
    visibleMarkerStates = visible;
    timeline.dataset.historyTimelineReady = "true";
    updateScrollState();
  };

  const scheduleMeasure = () => {
    if (measureFrame !== null) return;
    measureFrame = requestFrame(measure);
  };

  const moveToPointer = (clientY: number) => {
    const rect = track.getBoundingClientRect();
    const progress = clampHistoryTimelineProgress(
      (clientY - rect.top) / Math.max(1, rect.height)
    );
    scrollWindowTo(historyTimelineScrollY(progress, maximumScrollY()), "auto");
    updateScrollState();
  };

  const beginDrag = (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    thumb.focus({ preventScroll: true });
    isDragging = true;
    timeline.classList.add("is-dragging");
    setInteracting(true);
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is optional in non-browser test environments.
    }
    moveToPointer(event.clientY);
  };

  const finishDrag = (event: PointerEvent) => {
    if (!isDragging) return;
    isDragging = false;
    timeline.classList.remove("is-dragging");
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already have been released or cancelled.
    }
    setInteracting(true, true);
  };

  const markerTarget = (targetId: string): HTMLElement | undefined =>
    [...gallery.querySelectorAll<HTMLElement>("[data-history]")]
      .find((candidate) => candidate.dataset.history === targetId);

  const jumpToMarker = (event: Event) => {
    const marker = event.currentTarget as HTMLButtonElement;
    const targetId = marker.dataset.historyTimelineTarget;
    if (!targetId) return;
    const card = markerTarget(targetId);
    const box = virtualHistoryBox(gallery, targetId);
    if (!card && !box) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = box ? { top: gallery.getBoundingClientRect().top + box.top } : card!.getBoundingClientRect();
    scrollWindowTo(rect.top + currentScrollY() - headingOffset(), "smooth");
    setInteracting(true, true);
    scheduleScrollState();
  };

  const keyboardJump = (event: KeyboardEvent) => {
    const maxScroll = maximumScrollY();
    const currentPosition = currentScrollY();
    let nextPosition: number | null = null;
    const forward = event.key === "ArrowDown" || event.key === "PageDown";
    const byMonth = event.key === "PageUp" || event.key === "PageDown";
    const candidates = forward ? markerStates : [...markerStates].reverse();
    const currentMarker = [...markerStates].reverse().find(marker => marker.targetScrollY <= currentPosition + 2);
    const target = candidates.find(marker => (forward ? marker.targetScrollY > currentPosition + 2 : marker.targetScrollY < currentPosition - 2) && (!byMonth || marker.dateKey.slice(0,7) !== currentMarker?.dateKey.slice(0,7)));
    if (event.key === "Home") nextPosition = 0;
    else if (event.key === "End") nextPosition = maxScroll;
    else if (["ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(event.key)) nextPosition = target?.targetScrollY ?? (forward ? maxScroll : 0);
    if (nextPosition === null) return;
    event.preventDefault();
    scrollWindowTo(Math.min(maxScroll, Math.max(0, nextPosition)), "auto");
    setInteracting(true, true);
    updateScrollState();
  };

  timeline.addEventListener("pointerenter", () => setInteracting(true), { signal });
  timeline.addEventListener("pointerleave", () => setInteracting(false), { signal });
  timeline.addEventListener("focusin", () => setInteracting(true), { signal });
  timeline.addEventListener("focusout", () => setInteracting(false), { signal });
  track.addEventListener("pointermove", (event) => {
    if (!hover || isDragging) return;
    const rect = track.getBoundingClientRect();
    const progress = clampHistoryTimelineProgress((event.clientY - rect.top) / Math.max(1, rect.height));
    const index = closestHistoryTimelineMarker(markerStates.map((marker, index) => ({ index, top: marker.progress })), progress);
    const marker = markerStates[index];
    if (marker) {
      hover.textContent = `${marker.label} · ${context.t("history.list.items", { count: Number(marker.element.dataset.historyTimelineCount) || 1 })}`;
      hover.style.setProperty("--history-timeline-position", String(progress * 100));
    }
  }, { signal });
  track.addEventListener("pointerdown", (event) => {
    const target = event.target as Element | null;
    if (target?.closest("[data-history-timeline-marker], [data-history-timeline-thumb]")) return;
    beginDrag(event);
  }, { signal });
  thumb.addEventListener("pointerdown", beginDrag, { signal });
  window.addEventListener("pointermove", (event) => {
    if (!isDragging) return;
    event.preventDefault();
    moveToPointer(event.clientY);
  }, { signal, passive: false });
  window.addEventListener("pointerup", finishDrag, { signal });
  window.addEventListener("pointercancel", finishDrag, { signal });
  window.addEventListener("scroll", () => { scheduleScrollState(); setInteracting(true, true); }, { signal, passive: true });
  window.addEventListener("resize", scheduleMeasure, { signal });
  gallery.addEventListener("history-virtual-layout", scheduleMeasure, { signal });
  thumb.addEventListener("keydown", keyboardJump, { signal });
  markerElements.forEach((marker) => marker.addEventListener("click", jumpToMarker, { signal }));
  track.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    if (target?.closest("[data-history-timeline-marker], [data-history-timeline-thumb]")) return;
    moveToPointer((event as MouseEvent).clientY);
    setInteracting(true, true);
  }, { signal });

  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(stage);
    resizeObserver.observe(gallery);
    const heading = root.querySelector<HTMLElement>(".history-heading");
    const contextBar = root.querySelector<HTMLElement>("[data-history-context]");
    if (heading) resizeObserver.observe(heading);
    if (contextBar) resizeObserver.observe(contextBar);
  }
  const mutationObserver = typeof MutationObserver !== "undefined"
    ? new MutationObserver(scheduleMeasure)
    : null;
  if (!gallery.hasAttribute("data-history-virtual")) mutationObserver?.observe(gallery, { childList: true });

  scheduleMeasure();

  return () => {
    events.abort();
    cancelFrame(measureFrame);
    cancelFrame(scrollFrame);
    if (interactionTimer !== null) window.clearTimeout(interactionTimer);
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    stage.dataset.historyTimelineVisible = "false";
    timeline.hidden = true;
    timeline.dataset.historyTimelineReady = "false";
    timeline.style.removeProperty("--history-timeline-top");
    timeline.style.removeProperty("--history-timeline-left");
    timeline.style.removeProperty("--history-timeline-height");
  };
}
