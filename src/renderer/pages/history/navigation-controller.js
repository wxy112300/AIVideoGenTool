function directionFrom(value) {
    const direction = Number(value);
    return direction === -1 || direction === 1 ? direction : null;
}
function stopNavigation(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
}
function isCardSpaceKey(event) {
    return event.key === " " || event.key === "Spacebar";
}
function historyTabIndex(tabs, current, direction) {
    const index = tabs.indexOf(current);
    return tabs[(index + direction + tabs.length) % tabs.length] ?? current;
}
export function mountHistoryNavigationController(context, options) {
    const events = new AbortController();
    const signal = events.signal;
    const root = context.root;
    const historyTabs = [...root.querySelectorAll("[data-history-kind][role=tab]")];
    const activateHistoryKind = (button, restoreFocus) => {
        const nextKind = button.dataset.historyKind;
        if (nextKind !== "video" && nextKind !== "image")
            return;
        if (nextKind === context.getRoute().historyKind) {
            if (restoreFocus)
                button.focus();
            return;
        }
        context.reportUserAction("history-kind", { kind: nextKind });
        options.setHistoryKind(nextKind);
        options.resetHistoryScroll();
        context.requestRender();
        window.requestAnimationFrame(() => {
            window.scrollTo({ top: 0, behavior: "auto" });
            if (restoreFocus) {
                window.requestAnimationFrame(() => {
                    root.querySelector(`[data-history-kind="${nextKind}"][role="tab"]`)?.focus();
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
                event.key !== "Home" && event.key !== "End")
                return;
            event.preventDefault();
            event.stopPropagation();
            const next = event.key === "Home"
                ? historyTabs[0]
                : event.key === "End"
                    ? historyTabs[historyTabs.length - 1]
                    : historyTabIndex(historyTabs, button, event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1);
            if (next)
                activateHistoryKind(next, true);
        }, { signal });
    });
    root.querySelectorAll("[data-history-layout]").forEach((button) => {
        button.addEventListener("click", (event) => {
            stopNavigation(event);
            const layout = button.dataset.historyLayout;
            if (layout === "masonry" || layout === "album") {
                options.switchHistoryLayout(layout);
                root.querySelectorAll("[data-history-layout]").forEach((candidate) => {
                    candidate.setAttribute("aria-pressed", String(candidate.dataset.historyLayout === layout));
                });
            }
        }, { signal });
    });
    root.querySelectorAll("[data-history-navigation]").forEach((button) => {
        button.addEventListener("click", (event) => {
            stopNavigation(event);
            const direction = directionFrom(button.dataset.historyNavigation);
            if (direction == null)
                return;
            const page = context.getRoute().page;
            if (page === "image-history-detail") {
                options.navigateImageHistoryDetail(direction);
            }
            else {
                options.navigateHistoryDetail(direction);
            }
        }, { signal });
    });
    root.querySelectorAll("[data-image-version-navigation]").forEach((button) => {
        button.addEventListener("click", (event) => {
            stopNavigation(event);
            const direction = directionFrom(button.dataset.imageVersionNavigation);
            if (direction != null)
                options.navigateImageHistoryVersion(direction);
        }, { signal });
    });
    root.querySelectorAll("[data-image-version-id]").forEach((button) => {
        button.addEventListener("click", (event) => {
            stopNavigation(event);
            const versionId = button.dataset.imageVersionId;
            if (!versionId)
                return;
            options.selectImageHistoryVersion(versionId);
        }, { signal });
    });
    root.querySelectorAll("[data-open-history]").forEach((button) => {
        button.addEventListener("click", (event) => {
            stopNavigation(event);
            const assetId = button.dataset.openHistory;
            if (assetId)
                options.openHistoryDetail(assetId);
        }, { signal });
        button.addEventListener("keydown", (event) => {
            if (event.target !== button)
                return;
            if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                button.click();
            }
            else if (isCardSpaceKey(event)) {
                event.preventDefault();
                event.stopPropagation();
            }
        }, { signal });
        button.addEventListener("keyup", (event) => {
            if (event.target !== button || !isCardSpaceKey(event))
                return;
            event.preventDefault();
            event.stopPropagation();
            button.click();
        }, { signal });
    });
    root.querySelectorAll("[data-version-id]").forEach((button) => {
        button.addEventListener("click", (event) => {
            stopNavigation(event);
            const versionId = button.dataset.versionId;
            if (versionId)
                options.selectVideoHistoryVersion(versionId);
        }, { signal });
    });
    root.querySelectorAll("[data-open-image-history]").forEach((button) => {
        button.addEventListener("click", (event) => {
            stopNavigation(event);
            const projectId = button.dataset.openImageHistory;
            if (projectId)
                options.openImageHistoryDetail(projectId);
        }, { signal });
        button.addEventListener("keydown", (event) => {
            if (event.target !== button)
                return;
            if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                button.click();
            }
            else if (isCardSpaceKey(event)) {
                event.preventDefault();
                event.stopPropagation();
            }
        }, { signal });
        button.addEventListener("keyup", (event) => {
            if (event.target !== button || !isCardSpaceKey(event))
                return;
            event.preventDefault();
            event.stopPropagation();
            button.click();
        }, { signal });
    });
    return () => events.abort();
}
