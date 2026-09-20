import { clampHistoryTimelineProgress, closestHistoryTimelineMarker, historyTimelineMarkerLabel, historyTimelineProgress, historyTimelineScrollY } from "./timeline";
const MIN_STAGE_WIDTH = 1120;
const MIN_VIEWPORT_WIDTH = 1180;
const MIN_MARKER_GAP = 28;
function requestFrame(callback) {
    if (typeof window.requestAnimationFrame === "function") {
        return window.requestAnimationFrame(() => callback());
    }
    return window.setTimeout(callback, 0);
}
function cancelFrame(frame) {
    if (frame === null)
        return;
    if (typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(frame);
    }
    else {
        window.clearTimeout(frame);
    }
}
function currentScrollY() {
    const value = Number.isFinite(window.scrollY) ? window.scrollY : window.pageYOffset;
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}
function maximumScrollY() {
    const documentHeight = Math.max(document.documentElement?.scrollHeight ?? 0, document.body?.scrollHeight ?? 0);
    return Math.max(0, documentHeight - Math.max(0, window.innerHeight));
}
function scrollWindowTo(top, behavior) {
    const safeTop = Math.max(0, Number.isFinite(top) ? top : 0);
    try {
        window.scrollTo({ top: safeTop, behavior });
    }
    catch {
        window.scrollTo(0, safeTop);
    }
}
function writeTimelineLabel(target, label, dateKey) {
    target.replaceChildren();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey ?? "");
    if (!match) {
        target.textContent = label;
        return;
    }
    const year = target.ownerDocument.createElement("span");
    year.className = "history-timeline-year";
    year.textContent = match[1];
    const monthDay = target.ownerDocument.createElement("span");
    monthDay.className = "history-timeline-month-day";
    monthDay.textContent = `${match[2]}.${match[3]}`;
    target.append(year, monthDay);
}
export function mountHistoryTimelineController(context) {
    const root = context.root;
    const timeline = root.querySelector("[data-history-timeline]");
    if (!timeline)
        return () => undefined;
    const stage = timeline.closest("[data-history-list-stage]");
    const gallery = stage?.querySelector(".history-gallery");
    const track = timeline.querySelector("[data-history-timeline-track]");
    const thumb = timeline.querySelector("[data-history-timeline-thumb]");
    const lineFill = timeline.querySelector("[data-history-timeline-line-fill]");
    const current = timeline.querySelector("[data-history-timeline-current]");
    const markerElements = [...timeline.querySelectorAll("[data-history-timeline-marker]")];
    if (!stage || !gallery || !track || !thumb || !lineFill || !current || !markerElements.length) {
        return () => undefined;
    }
    const events = new AbortController();
    const signal = events.signal;
    let measureFrame = null;
    let scrollFrame = null;
    let interactionTimer = null;
    let isDragging = false;
    let markerStates = [];
    let visibleMarkerStates = [];
    let lastCurrentLabel = "";
    const setInteracting = (active, keepBriefly = false) => {
        if (interactionTimer !== null) {
            window.clearTimeout(interactionTimer);
            interactionTimer = null;
        }
        if (active) {
            timeline.classList.add("is-interacting");
            if (keepBriefly) {
                interactionTimer = window.setTimeout(() => {
                    interactionTimer = null;
                    if (!isDragging)
                        timeline.classList.remove("is-interacting");
                }, 1400);
            }
        }
        else if (!isDragging) {
            timeline.classList.remove("is-interacting");
        }
    };
    const headingOffset = () => {
        const heading = root.querySelector(".history-heading");
        if (!heading)
            return 14;
        const height = heading.getBoundingClientRect().height;
        return Math.max(14, height + 12);
    };
    const updateScrollState = () => {
        scrollFrame = null;
        if (stage.dataset.historyTimelineVisible !== "true")
            return;
        const maxScroll = maximumScrollY();
        const progress = historyTimelineProgress(currentScrollY(), maxScroll);
        const position = `${progress * 100}`;
        lineFill.style.setProperty("--history-timeline-progress", position);
        thumb.style.setProperty("--history-timeline-position", position);
        current.style.setProperty("--history-timeline-position", position);
        thumb.setAttribute("aria-valuenow", String(Math.round(progress * 100)));
        const markerIndex = closestHistoryTimelineMarker(visibleMarkerStates.map((marker, index) => ({ index, top: marker.progress })), progress);
        const activeMarker = markerIndex >= 0 ? visibleMarkerStates[markerIndex] : undefined;
        visibleMarkerStates.forEach((marker) => {
            const active = marker === activeMarker;
            marker.element.classList.toggle("is-active", active);
            if (active)
                marker.element.setAttribute("aria-current", "true");
            else
                marker.element.removeAttribute("aria-current");
        });
        const activeLabel = activeMarker?.displayLabel ?? "—";
        if (activeLabel !== lastCurrentLabel) {
            writeTimelineLabel(current, activeLabel, activeMarker?.dateKey);
            current.setAttribute("aria-label", activeLabel);
            lastCurrentLabel = activeLabel;
        }
        thumb.setAttribute("aria-valuetext", activeLabel);
    };
    const scheduleScrollState = () => {
        if (scrollFrame !== null)
            return;
        scrollFrame = requestFrame(updateScrollState);
    };
    const setVisible = (visible) => {
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
        const canShow = stageWidth >= MIN_STAGE_WIDTH && viewportWidth >= MIN_VIEWPORT_WIDTH && maximumScrollY() > 1;
        setVisible(canShow);
        if (!canShow)
            return;
        const heading = root.querySelector(".history-heading");
        const headingRect = heading?.getBoundingClientRect();
        const galleryRect = gallery.getBoundingClientRect();
        const galleryTop = galleryRect.top;
        const headingBottom = headingRect?.bottom ?? galleryTop;
        const top = Math.max(0, Math.ceil(Math.max(galleryTop, headingBottom + 8)));
        const left = Math.ceil(galleryRect.right + 4);
        const height = Math.max(180, Math.floor(window.innerHeight - top - 16));
        timeline.style.setProperty("--history-timeline-top", `${top}px`);
        timeline.style.setProperty("--history-timeline-left", `${left}px`);
        timeline.style.setProperty("--history-timeline-height", `${height}px`);
        const trackHeight = Math.max(1, track.getBoundingClientRect().height);
        const maxScroll = maximumScrollY();
        const cards = [...gallery.querySelectorAll("[data-history]")];
        const offset = headingOffset();
        const states = [];
        markerElements.forEach((element, order) => {
            element.hidden = true;
            element.classList.remove("is-active");
            element.removeAttribute("aria-current");
            const targetId = element.dataset.historyTimelineTarget ?? "";
            const card = cards.find((candidate) => candidate.dataset.history === targetId);
            if (!card)
                return;
            const rect = card.getBoundingClientRect();
            const targetScrollY = Math.min(maxScroll, Math.max(0, rect.top + currentScrollY() - offset));
            const progress = historyTimelineProgress(targetScrollY, maxScroll);
            const label = element.dataset.historyTimelineLabel || element.textContent?.trim() || "—";
            element.style.setProperty("--history-timeline-position", `${progress * 100}`);
            states.push({ element, targetId, dateKey: element.dataset.historyTimelineDateKey ?? "unknown", label, displayLabel: label, targetScrollY, progress, order });
        });
        if (!states.length) {
            setVisible(false);
            return;
        }
        const sorted = [...states].sort((left, right) => left.progress - right.progress || left.order - right.order);
        const minimumGap = MIN_MARKER_GAP / trackHeight;
        const visible = [];
        let anchor = null;
        let rangeLabels = [];
        let lastVisibleProgress = Number.NEGATIVE_INFINITY;
        const commitAnchor = () => {
            if (!anchor)
                return;
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
            }
            else {
                state.element.hidden = true;
                rangeLabels.push(state.label);
            }
        });
        commitAnchor();
        markerStates = states;
        visibleMarkerStates = visible;
        timeline.dataset.historyTimelineReady = "true";
        updateScrollState();
    };
    const scheduleMeasure = () => {
        if (measureFrame !== null)
            return;
        measureFrame = requestFrame(measure);
    };
    const moveToPointer = (clientY) => {
        const rect = track.getBoundingClientRect();
        const progress = clampHistoryTimelineProgress((clientY - rect.top) / Math.max(1, rect.height));
        scrollWindowTo(historyTimelineScrollY(progress, maximumScrollY()), "auto");
        updateScrollState();
    };
    const beginDrag = (event) => {
        event.preventDefault();
        event.stopPropagation();
        isDragging = true;
        setInteracting(true);
        try {
            event.currentTarget.setPointerCapture(event.pointerId);
        }
        catch {
        }
        moveToPointer(event.clientY);
    };
    const finishDrag = (event) => {
        if (!isDragging)
            return;
        isDragging = false;
        try {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        catch {
        }
        setInteracting(true, true);
    };
    const markerTarget = (targetId) => [...gallery.querySelectorAll("[data-history]")]
        .find((candidate) => candidate.dataset.history === targetId);
    const jumpToMarker = (event) => {
        const marker = event.currentTarget;
        const targetId = marker.dataset.historyTimelineTarget;
        if (!targetId)
            return;
        const card = markerTarget(targetId);
        if (!card)
            return;
        event.preventDefault();
        event.stopPropagation();
        const rect = card.getBoundingClientRect();
        scrollWindowTo(rect.top + currentScrollY() - headingOffset(), "smooth");
        setInteracting(true, true);
        scheduleScrollState();
    };
    const keyboardJump = (event) => {
        const maxScroll = maximumScrollY();
        const currentPosition = currentScrollY();
        const step = Math.max(48, Math.round(Math.max(1, window.innerHeight) * 0.12));
        let nextPosition = null;
        if (event.key === "Home")
            nextPosition = 0;
        else if (event.key === "End")
            nextPosition = maxScroll;
        else if (event.key === "ArrowUp")
            nextPosition = currentPosition - step;
        else if (event.key === "ArrowDown")
            nextPosition = currentPosition + step;
        else if (event.key === "PageUp")
            nextPosition = currentPosition - Math.max(step, window.innerHeight * 0.85);
        else if (event.key === "PageDown")
            nextPosition = currentPosition + Math.max(step, window.innerHeight * 0.85);
        if (nextPosition === null)
            return;
        event.preventDefault();
        scrollWindowTo(Math.min(maxScroll, Math.max(0, nextPosition)), "auto");
        setInteracting(true, true);
        updateScrollState();
    };
    timeline.addEventListener("pointerenter", () => setInteracting(true), { signal });
    timeline.addEventListener("pointerleave", () => setInteracting(false), { signal });
    timeline.addEventListener("focusin", () => setInteracting(true), { signal });
    timeline.addEventListener("focusout", () => setInteracting(false), { signal });
    track.addEventListener("pointerdown", (event) => {
        const target = event.target;
        if (target?.closest("[data-history-timeline-marker], [data-history-timeline-thumb]"))
            return;
        beginDrag(event);
    }, { signal });
    thumb.addEventListener("pointerdown", beginDrag, { signal });
    window.addEventListener("pointermove", (event) => {
        if (!isDragging)
            return;
        event.preventDefault();
        moveToPointer(event.clientY);
    }, { signal, passive: false });
    window.addEventListener("pointerup", finishDrag, { signal });
    window.addEventListener("pointercancel", finishDrag, { signal });
    window.addEventListener("scroll", scheduleScrollState, { signal, passive: true });
    window.addEventListener("resize", scheduleMeasure, { signal });
    thumb.addEventListener("keydown", keyboardJump, { signal });
    markerElements.forEach((marker) => marker.addEventListener("click", jumpToMarker, { signal }));
    track.addEventListener("click", (event) => {
        const target = event.target;
        if (target?.closest("[data-history-timeline-marker], [data-history-timeline-thumb]"))
            return;
        moveToPointer(event.clientY);
        setInteracting(true, true);
    }, { signal });
    let resizeObserver = null;
    if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(scheduleMeasure);
        resizeObserver.observe(stage);
        resizeObserver.observe(gallery);
    }
    const mutationObserver = typeof MutationObserver !== "undefined" ? new MutationObserver(scheduleMeasure) : null;
    mutationObserver?.observe(gallery, { childList: true });
    scheduleMeasure();
    return () => {
        events.abort();
        cancelFrame(measureFrame);
        cancelFrame(scrollFrame);
        if (interactionTimer !== null)
            window.clearTimeout(interactionTimer);
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
