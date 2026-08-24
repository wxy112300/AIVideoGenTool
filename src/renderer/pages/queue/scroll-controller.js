export function clampQueueScrollPosition(scrollY, documentHeight, viewportHeight) {
    const position = Number.isFinite(scrollY) ? Math.max(0, scrollY) : 0;
    const height = Number.isFinite(documentHeight) ? Math.max(0, documentHeight) : 0;
    const viewport = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight) : 0;
    return Math.min(position, Math.max(0, height - viewport));
}
export function createQueueScrollController(getPage) {
    let scrollPosition = 0;
    let restorePending = false;
    let restoreFrame = null;
    const cancelPendingRestore = () => {
        if (restoreFrame !== null) {
            window.cancelAnimationFrame(restoreFrame);
            restoreFrame = null;
        }
    };
    const currentDocumentHeight = () => Math.max(document.documentElement?.scrollHeight ?? 0, document.body?.scrollHeight ?? 0);
    return {
        beforeRender: () => {
            if (getPage() !== "queue") {
                cancelPendingRestore();
                restorePending = false;
                scrollPosition = 0;
                return;
            }
            if (!restorePending)
                scrollPosition = window.scrollY;
        },
        restoreScrollPosition: () => {
            cancelPendingRestore();
            const desiredPosition = scrollPosition;
            restorePending = true;
            const apply = () => {
                if (getPage() !== "queue")
                    return;
                const position = clampQueueScrollPosition(desiredPosition, currentDocumentHeight(), window.innerHeight);
                window.scrollTo({ top: position, behavior: "auto" });
            };
            restoreFrame = window.requestAnimationFrame(() => {
                restoreFrame = null;
                if (getPage() !== "queue") {
                    restorePending = false;
                    return;
                }
                apply();
                restoreFrame = window.requestAnimationFrame(() => {
                    restoreFrame = null;
                    if (getPage() === "queue")
                        apply();
                    restorePending = false;
                });
            });
        }
    };
}
