import { uiKeys } from "../../../core/i18n-keys";
let queueMoveScrollAnchor = null;
function captureQueueMoveAnchor(button, focusAfterMove = false) {
    const taskId = button.dataset.move;
    const direction = Number(button.dataset.direction);
    if (!taskId || (direction !== -1 && direction !== 1))
        return;
    queueMoveScrollAnchor = {
        taskId,
        direction,
        viewportTop: button.getBoundingClientRect().top,
        focusAfterMove
    };
}
function restoreQueueMoveAnchor(root) {
    const anchor = queueMoveScrollAnchor;
    if (!anchor)
        return;
    window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
            if (queueMoveScrollAnchor !== anchor)
                return;
            const button = [...root.querySelectorAll("[data-move]")]
                .find((candidate) => candidate.dataset.move === anchor.taskId &&
                Number(candidate.dataset.direction) === anchor.direction);
            if (!button) {
                queueMoveScrollAnchor = null;
                return;
            }
            const delta = button.getBoundingClientRect().top - anchor.viewportTop;
            if (Math.abs(delta) > 0.5) {
                window.scrollBy({ top: delta, behavior: "auto" });
            }
            if (anchor.focusAfterMove) {
                button.focus({ preventScroll: true });
            }
            queueMoveScrollAnchor = null;
        });
    });
}
function currentState(context) {
    return context.getState() ?? null;
}
export function mountQueueController(context, options) {
    const events = new AbortController();
    const signal = events.signal;
    const root = context.root;
    const t = context.t;
    const startQueue = async () => {
        context.reportUserAction("queue-start");
        try {
            options.setState(await context.studio.startQueue());
            options.setPromptRuntimeLoaded(false);
            context.requestRender();
        }
        catch (error) {
            context.notify(error instanceof Error ? error.message : String(error), { kind: "error" });
        }
    };
    const endQueue = async (action = "queue-end") => {
        context.reportUserAction(action);
        try {
            // Ending the queue is graceful: the current task is allowed to finish,
            // while later waiting tasks remain available for a future restart.
            options.setState(await context.studio.pauseQueue());
            context.requestRender();
        }
        catch (error) {
            context.notify(error instanceof Error ? error.message : String(error), { kind: "error" });
        }
    };
    root.querySelector("#h3-live-preview")?.addEventListener("change", async (event) => {
        const input = event.currentTarget;
        const current = currentState(context);
        if (!current)
            return;
        input.disabled = true;
        try {
            // This is a queue preference, not a general settings form submission.
            // Keep it on a narrow IPC path so toggling it never performs environment
            // validation, starts ComfyUI, or marks the settings page dirty.
            options.setState(await context.studio.setQueueH3LivePreview(input.checked));
            context.requestRender();
        }
        catch (error) {
            input.checked = !input.checked;
            input.disabled = false;
            context.notify(error instanceof Error ? error.message : String(error), { kind: "error" });
        }
    }, { signal });
    root.querySelector("#queue-primary-action")?.addEventListener("click", async () => {
        const state = currentState(context);
        if (state?.queueRunning) {
            await endQueue();
            return;
        }
        await startQueue();
    }, { signal });
    root.querySelector("#pause-queue")?.addEventListener("click", async () => {
        await endQueue("queue-pause");
    }, { signal });
    root.querySelector("#continue-queue")?.addEventListener("click", async () => {
        await startQueue();
    }, { signal });
    root.querySelectorAll("[data-remove]").forEach((button) => {
        button.addEventListener("click", () => {
            const taskId = button.dataset.remove;
            if (!taskId)
                return;
            context.reportUserAction("queue-remove", { taskId });
            options.requestConfirmation(taskId, "remove");
        }, { signal });
    });
    root.querySelectorAll("[data-cancel]").forEach((button) => {
        button.addEventListener("click", () => {
            const taskId = button.dataset.cancel;
            if (!taskId)
                return;
            context.reportUserAction("queue-cancel", { taskId });
            options.requestConfirmation(taskId, "cancel");
        }, { signal });
    });
    const moveTask = async (button, focusAfterMove = false) => {
        const taskId = button.dataset.move;
        const directionValue = button.dataset.direction;
        const direction = Number(directionValue);
        if (!taskId || (direction !== -1 && direction !== 1))
            return;
        captureQueueMoveAnchor(button, focusAfterMove);
        context.reportUserAction("queue-move", { taskId, direction: directionValue });
        options.setState(await context.studio.moveTask(taskId, direction));
        context.requestRender();
    };
    root.querySelectorAll("[data-move]").forEach((button) => {
        button.addEventListener("click", async () => {
            await moveTask(button);
        }, { signal });
        button.addEventListener("keydown", async (event) => {
            if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
                return;
            const direction = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
            if (!direction)
                return;
            event.preventDefault();
            const currentDirection = Number(button.dataset.direction);
            if (currentDirection !== direction) {
                const sibling = [...root.querySelectorAll("[data-move]")]
                    .find((candidate) => candidate.dataset.move === button.dataset.move &&
                    Number(candidate.dataset.direction) === direction);
                if (sibling) {
                    await moveTask(sibling, true);
                }
                return;
            }
            await moveTask(button, true);
        }, { signal });
    });
    root.querySelectorAll("[data-duplicate]").forEach((button) => {
        button.addEventListener("click", async () => {
            const taskId = button.dataset.duplicate;
            if (!taskId)
                return;
            context.reportUserAction("queue-duplicate", { taskId });
            options.setState(await context.studio.duplicateTask(taskId));
            context.requestRender();
        }, { signal });
    });
    root.querySelectorAll("[data-reset-task]").forEach((button) => {
        button.addEventListener("click", async () => {
            const taskId = button.dataset.resetTask;
            if (!taskId)
                return;
            context.reportUserAction("queue-reset-status", { taskId });
            try {
                options.setState(await context.studio.resetTask(taskId));
                context.requestRender();
            }
            catch (error) {
                context.notify(error instanceof Error ? error.message : t(uiKeys.runtime.queueResetFailed), { kind: "error" });
            }
        }, { signal });
    });
    root.querySelectorAll("[data-edit-task]").forEach((button) => {
        button.addEventListener("click", () => {
            const taskId = button.dataset.editTask;
            if (taskId)
                options.editTask(taskId);
        }, { signal });
    });
    root.querySelectorAll("[data-edit-upscale-task]").forEach((button) => {
        button.addEventListener("click", () => {
            const taskId = button.dataset.editUpscaleTask;
            const task = taskId
                ? currentState(context)?.queue.find((item) => item.id === taskId)
                : undefined;
            if (!task || task.taskType !== "upscale")
                return;
            try {
                options.rememberModalFocus();
                options.editUpscaleTask(task);
            }
            catch (error) {
                context.notify(error instanceof Error ? error.message : t(uiKeys.runtime.queueEditFailed), { kind: "error" });
            }
        }, { signal });
    });
    restoreQueueMoveAnchor(root);
    return () => events.abort();
}
