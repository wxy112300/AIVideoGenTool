function runCleanups(cleanups) {
    for (const cleanup of cleanups.splice(0)) {
        try {
            cleanup();
        }
        catch {
            continue;
        }
    }
}
export function createRenderLifecycle() {
    let cleanups = [];
    return {
        beginRender() {
            runCleanups(cleanups);
        },
        addCleanup(cleanup) {
            cleanups.push(cleanup);
        },
        dispose() {
            runCleanups(cleanups);
        }
    };
}
