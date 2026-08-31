import { uiKeys } from "../../../core/i18n-keys";
import { icon } from "../../shared/icons";
import { mountQueueActionMenu } from "./action-menu";
import { mountQueueDragSort } from "./drag-sort";
function currentState(context) {
    return context.getState() ?? null;
}
export function mountQueueController(context, options) {
    const events = new AbortController();
    const signal = events.signal;
    const root = context.root;
    const t = context.t;
    const dragSortCleanup = mountQueueDragSort(context, options.setState);
    const startQueue = async () => {
        context.reportUserAction("queue-start");
        try {
            options.setState(await context.application.startQueue());
            options.setPromptRuntimeLoaded(false);
            context.requestRender();
        }
        catch (error) {
            context.notify(error instanceof Error ? error.message : String(error), { kind: "error" });
        }
    };
    const continueQueue = async () => {
        context.reportUserAction("queue-continue");
        try {
            options.setState(await context.application.continueQueue());
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
            options.setState(await context.application.pauseQueue());
            context.requestRender();
        }
        catch (error) {
            context.notify(error instanceof Error ? error.message : String(error), { kind: "error" });
        }
    };
    const canPromote = (taskId) => {
        const state = currentState(context);
        if (!state)
            return false;
        const runningIndex = state.queue.findIndex((task) => task.status === "running");
        const reorderable = state.queue.filter((task, index) => task.status === "waiting" && (runningIndex < 0 || index > runningIndex));
        return reorderable.findIndex((task) => task.id === taskId) > 0;
    };
    const handleQueueMenuAction = async (action, taskId) => {
        const task = currentState(context)?.queue.find((item) => item.id === taskId);
        if (!task)
            return;
        try {
            if (action === "duplicate") {
                context.reportUserAction("queue-duplicate", { taskId });
                options.setState(await context.application.duplicateTask(taskId));
            }
        else if (action === "promote") {
            if (!canPromote(taskId))
                return;
            context.reportUserAction("queue-promote", { taskId, targetIndex: 0 });
                options.setState(await context.application.reorderTask(taskId, 0));
        }
        else if (action === "render-through-here") {
            if (task.status !== "waiting")
                return;
            context.reportUserAction("queue-set-pause-boundary", { taskId });
                options.setState(await context.application.setQueuePauseBoundaryAfterTask(taskId));
        }
        else {
                if (task.status !== "waiting" || task.taskType === "image-generation")
                    return;
                context.reportUserAction("queue-randomize-seed", { taskId });
                options.setState(await context.application.randomizeTaskSeed(taskId));
            }
            context.requestRender();
        }
        catch (error) {
            context.notify(error instanceof Error ? error.message : String(error), { kind: "error" });
        }
    };
    const queueActionMenuCleanup = mountQueueActionMenu(context, {
        icon,
        getTask: (taskId) => currentState(context)?.queue.find((task) => task.id === taskId),
        canPromote,
        onAction: handleQueueMenuAction
    });
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
                options.setState(await context.application.setQueueH3LivePreview(input.checked));
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
        if (state?.queue.some((task) => task.status === "running")) {
            await continueQueue();
            return;
        }
        await startQueue();
    }, { signal });
    root.querySelector("#pause-queue")?.addEventListener("click", async () => {
        await endQueue("queue-pause");
    }, { signal });
    root.querySelector("#continue-queue")?.addEventListener("click", async () => {
        await continueQueue();
    }, { signal });
    root.querySelector("[data-queue-boundary-clear]")?.addEventListener("click", async () => {
        context.reportUserAction("queue-boundary-clear");
        try {
                options.setState(await context.application.clearQueuePauseBoundary());
            context.requestRender();
        }
        catch (error) {
            context.notify(error instanceof Error ? error.message : String(error), { kind: "error" });
        }
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
    root.querySelectorAll("[data-reset-task]").forEach((button) => {
        button.addEventListener("click", async () => {
            const taskId = button.dataset.resetTask;
            if (!taskId)
                return;
            context.reportUserAction("queue-reset-status", { taskId });
            try {
                options.setState(await context.application.resetTask(taskId));
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
    return () => {
        events.abort();
        queueActionMenuCleanup();
        dragSortCleanup();
    };
}
