function isEditableTarget(target) {
    if (!(target instanceof HTMLElement))
        return false;
    return target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable;
}
export function mountShellController(options) {
    const events = new AbortController();
    const signal = events.signal;
    const page = options.getPage();
    document.querySelectorAll("[data-page]").forEach((button) => {
        button.addEventListener("click", () => {
            const nextPage = button.dataset.page;
            const previousPage = options.getPage();
            if (previousPage === "settings" && nextPage !== "settings" && options.settingsHaveUnsavedChanges()) {
                options.rememberModalFocus();
                options.requestDiscardSettings(nextPage);
                return;
            }
            if ((previousPage === "history-detail" || previousPage === "image-history-detail") && nextPage === "history") {
                options.returnToHistory();
                return;
            }
            if (previousPage === "history")
                options.captureHistoryScrollPosition();
            if (nextPage === "history" && previousPage !== "history")
                options.clearHistoryForwardTarget();
            if (nextPage !== "history")
                options.clearHistoryForwardTarget();
            if (nextPage === "history" && previousPage !== "history")
                options.setHistoryScrollRestorePending(true);
            options.reportUserAction("navigate-panel", { from: previousPage, to: nextPage });
            options.setPage(nextPage);
            options.render();
            if (nextPage !== "history") {
                window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
            }
        }, { signal });
    });
    document.querySelector("#dismiss-app-flash")?.addEventListener("click", () => {
        options.reportUserAction("dismiss-notification");
        options.dismissNotification();
    }, { signal });
    document.querySelector("#app-flash")?.addEventListener("click", (event) => {
        const target = event.target instanceof HTMLElement
            ? event.target.closest("[data-notification-action]")
            : null;
        const actionId = target?.dataset.notificationAction;
        if (!actionId)
            return;
        event.preventDefault();
        options.reportUserAction("notification-action", { action: actionId });
        options.runNotificationAction(actionId);
    }, { signal });
    if (page === "history-detail" || page === "image-history-detail") {
        const handleKeyboardBack = (event) => {
            if (isEditableTarget(event.target))
                return;
            const isBrowserBack = event.key === "BrowserBack" ||
                event.key === "GoBack" ||
                event.code === "BrowserBack" ||
                (event.altKey && event.key === "ArrowLeft") ||
                (event.key === "Backspace" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey);
            if (!isBrowserBack)
                return;
            event.preventDefault();
            event.stopPropagation();
            options.returnToHistory();
        };
        const handleMouseBack = (event) => {
            if (event.button !== 3)
                return;
            event.preventDefault();
            event.stopPropagation();
            options.returnToHistory();
        };
        const handleHistoryVideoNavigation = (event) => {
            if (event.isComposing || event.repeat || isEditableTarget(event.target))
                return;
            if (document.querySelector(".dialog-backdrop"))
                return;
            const direction = event.key === "[" || event.code === "BracketLeft" || event.key === "PageUp" || event.code === "PageUp"
                ? -1
                : event.key === "]" || event.code === "BracketRight" || event.key === "PageDown" || event.code === "PageDown"
                    ? 1
                    : 0;
            if (direction !== -1 && direction !== 1)
                return;
            event.preventDefault();
            event.stopPropagation();
            if (options.getPage() === "image-history-detail")
                options.navigateImageHistoryDetail(direction);
            else
                options.navigateHistoryDetail(direction);
        };
        window.addEventListener("keydown", handleKeyboardBack, { signal });
        window.addEventListener("keydown", handleHistoryVideoNavigation, { signal });
        window.addEventListener("auxclick", handleMouseBack, { signal });
        window.addEventListener("mouseup", handleMouseBack, { signal });
    }
    if (page === "history") {
        const handleKeyboardForward = (event) => {
            if (isEditableTarget(event.target))
                return;
            const isBrowserForward = event.key === "BrowserForward" ||
                event.key === "GoForward" ||
                event.code === "BrowserForward" ||
                (event.altKey && event.key === "ArrowRight") ||
                (event.key === "Backspace" && event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey);
            if (!isBrowserForward)
                return;
            event.preventDefault();
            event.stopPropagation();
            options.returnToLastHistoryDetail();
        };
        const handleMouseForward = (event) => {
            if (event.button !== 4)
                return;
            event.preventDefault();
            event.stopPropagation();
            options.returnToLastHistoryDetail();
        };
        window.addEventListener("keydown", handleKeyboardForward, { signal });
        window.addEventListener("auxclick", handleMouseForward, { signal });
        window.addEventListener("mouseup", handleMouseForward, { signal });
    }
    options.bindConfirmationDialog();
    options.bindDirectoryMigrationDialog();
    options.bindImageAssetLibraryDialog();
    options.bindWindowCloseDialog();
    return () => events.abort();
}
