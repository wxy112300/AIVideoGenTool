import { renderShell } from "./shell/page";
import { renderIcons } from "./shared/icons";
function isRestorableFocusElement(element) {
    return element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLButtonElement;
}
function captureFocus(root) {
    const activeElement = document.activeElement;
    if (!isRestorableFocusElement(activeElement) || !root.contains(activeElement))
        return null;
    if (!activeElement.id && !activeElement.name)
        return null;
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
function findFocusTarget(root, snapshot) {
    if (snapshot.id) {
        const target = document.getElementById(snapshot.id);
        if (target && root.contains(target) &&
            target.tagName.toLowerCase() === snapshot.tagName &&
            isRestorableFocusElement(target))
            return target;
    }
    if (!snapshot.name)
        return null;
    return Array.from(root.querySelectorAll("input, textarea, select, button")).find((candidate) => candidate.tagName.toLowerCase() === snapshot.tagName &&
        candidate.name === snapshot.name) ?? null;
}
function restoreFocus(root, snapshot) {
    if (!snapshot)
        return;
    const target = findFocusTarget(root, snapshot);
    if (!target || ("disabled" in target && target.disabled))
        return;
    target.focus({ preventScroll: true });
    if (snapshot.selectionStart !== null &&
        (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
        try {
            target.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd ?? snapshot.selectionStart, snapshot.selectionDirection ?? "none");
        }
        catch {
            // Some input types do not expose a selectable text range.
        }
    }
    target.scrollLeft = snapshot.scrollLeft;
    target.scrollTop = snapshot.scrollTop;
}
function captureHistoryPlayback(root, page) {
    if (page !== "history-detail")
        return null;
    const video = root.querySelector(".history-player video");
    if (!video)
        return null;
    return {
        assetId: video.dataset.historyAsset ?? "",
        versionId: video.dataset.historyVersion ?? "",
        currentTime: video.currentTime,
        paused: video.paused,
        muted: video.muted,
        playbackRate: video.playbackRate
    };
}
function restoreHistoryPlayback(root, snapshot) {
    if (!snapshot)
        return;
    const video = root.querySelector(".history-player video");
    if (!video)
        return;
    if (video.dataset.historyAsset !== snapshot.assetId ||
        video.dataset.historyVersion !== snapshot.versionId)
        return;
    const restore = () => {
        // A render can be superseded before metadata arrives. Never restart a
        // detached media element: doing so leaves an orphaned audio stream that
        // survives page navigation and overlaps the next detail player.
        if (!video.isConnected || !root.contains(video))
            return;
        video.muted = snapshot.muted;
        video.playbackRate = snapshot.playbackRate;
        if (Number.isFinite(video.duration)) {
            video.currentTime = Math.min(snapshot.currentTime, video.duration);
        }
        if (snapshot.paused)
            video.pause();
        else
            void video.play().catch(() => undefined);
    };
    if (video.readyState >= 1)
        window.requestAnimationFrame(restore);
    else
        video.addEventListener("loadedmetadata", restore, { once: true });
}
function stopRenderedVideoPlayback(root) {
    root.querySelectorAll("video").forEach((video) => {
        video.pause();
        // Pausing alone is not sufficient for a media element that is about to be
        // detached. Clear its source and abort pending decode/play promises so a
        // late metadata callback cannot restart audio in the background.
        video.removeAttribute("src");
        video.querySelectorAll("source").forEach((source) => source.remove());
        video.load();
    });
}
export function createRenderCoordinator(options) {
    let renderRequest = 0;
    let scheduledFrame = null;
    let scheduledToken = 0;
    const cancelScheduledRender = () => {
        scheduledToken += 1;
        if (scheduledFrame === null)
            return;
        window.cancelAnimationFrame(scheduledFrame);
        scheduledFrame = null;
    };
    const renderNow = () => {
        // An explicit command render supersedes an event refresh that has not
        // reached the frame boundary yet. This keeps command ordering immediate.
        cancelScheduledRender();
        const request = ++renderRequest;
        void (async () => {
            const requestedPage = options.getPage();
            if (requestedPage === "create" || requestedPage === "settings") {
                await options.ensurePromptPacks();
            }
            if (request !== renderRequest)
                return;
            const previousPage = options.getPage();
            options.beforeRenderHistory();
            if (previousPage === "queue")
                options.beforeRenderQueue();
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
                performanceMetrics: options.getPerformanceMetrics(),
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
            if (page === "create")
                options.bindCreate();
            else if (page === "queue")
                options.bindQueue();
            else if (page === "history" || page === "history-detail" || page === "image-history-detail") {
                options.bindHistory(playback);
            }
            else if (page === "settings") {
                options.bindSettings();
            }
            options.renderOverlay();
            options.syncAppLogPolling();
            if (page === "queue" && previousPage === "queue")
                options.restoreQueueScrollPosition();
            if (page === "history")
                options.restoreHistoryScrollPosition();
            restoreHistoryPlayback(options.root, playback);
            restoreFocus(options.root, focus);
        })().catch((error) => {
            console.error("Failed to render page dependencies", error);
        });
    };
    return {
        render: renderNow,
        requestRender() {
            if (scheduledFrame !== null)
                return;
            const token = ++scheduledToken;
            scheduledFrame = window.requestAnimationFrame(() => {
                if (token !== scheduledToken)
                    return;
                scheduledFrame = null;
                renderNow();
            });
        }
    };
}
