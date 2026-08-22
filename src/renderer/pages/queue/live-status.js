import { uiKeys } from "../../../core/i18n-keys";
import { elapsedText, formatBytes, formatElapsedDuration, queueEstimateText, queueStageElapsedText } from "../../shared/formatters";
import { queueRemainingSeconds, queueTaskRemainingSeconds } from "./helpers";
import { seedVr2ProgressView } from "./card";
function setMetric(id, value, detail = "") {
    const available = value != null && Number.isFinite(value);
    const label = document.querySelector(`#${id}`);
    const detailElement = document.querySelector(`#${id}-detail`);
    const bar = document.querySelector(`#${id}-bar`);
    if (label)
        label.textContent = available ? `${Math.round(value)}%` : "—";
    if (detailElement)
        detailElement.textContent = detail;
    if (bar)
        bar.style.width = `${available ? Math.max(0, Math.min(100, value)) : 0}%`;
}
function lifecycleKey(lifecycle) {
    switch (lifecycle ?? "idle") {
        case "starting": return uiKeys.queue.lifecycle.starting;
        case "running": return uiKeys.queue.lifecycle.running;
        case "pausing": return uiKeys.queue.lifecycle.pausing;
        case "cancelling": return uiKeys.queue.lifecycle.cancelling;
        case "cleaning": return uiKeys.queue.lifecycle.cleaning;
        case "error": return uiKeys.queue.lifecycle.error;
        case "idle": return uiKeys.queue.lifecycle.idle;
    }
}
function lifecycleShortKey(lifecycle) {
    switch (lifecycle ?? "idle") {
        case "starting": return uiKeys.queue.lifecycleShort.starting;
        case "running": return uiKeys.queue.lifecycleShort.running;
        case "pausing": return uiKeys.queue.lifecycleShort.pausing;
        case "cancelling": return uiKeys.queue.lifecycleShort.cancelling;
        case "cleaning": return uiKeys.queue.lifecycleShort.cleaning;
        case "error": return uiKeys.queue.lifecycleShort.error;
        case "idle": return uiKeys.queue.lifecycleShort.idle;
    }
}
export function queueLifecycleText(lifecycle, t) {
    return t(lifecycleKey(lifecycle));
}
export function queueLifecycleShortText(lifecycle, t) {
    return t(lifecycleShortKey(lifecycle));
}
export function queueHeaderTone(state) {
    const lifecycle = state.queueLifecycle ?? "idle";
    const running = state.queue.some((task) => task.status === "running");
    if (lifecycle === "error")
        return "error";
    if (running || lifecycle === "running" || lifecycle === "pausing")
        return "active";
    if (state.queueRunning || lifecycle !== "idle")
        return "pending";
    return "idle";
}
function comfyUiShortKey(tone) {
    switch (tone) {
        case "connected": return uiKeys.queue.comfyUiShort.connected;
        case "initializing": return uiKeys.queue.comfyUiShort.initializing;
        case "starting": return uiKeys.queue.comfyUiShort.starting;
        case "ending": return uiKeys.queue.comfyUiShort.ending;
        case "cancelling": return uiKeys.queue.comfyUiShort.cancelling;
        case "cleaning": return uiKeys.queue.comfyUiShort.cleaning;
        case "waiting": return uiKeys.queue.comfyUiShort.waiting;
        case "error": return uiKeys.queue.comfyUiShort.error;
        case "unknown": return uiKeys.queue.comfyUiShort.unknown;
    }
}
function comfyStatus(tone, label, t) {
    return { label, shortLabel: `ComfyUI ${t(comfyUiShortKey(tone))}`, tone };
}
export function queueComfyUiStatus(state, t, runtime, environmentScanning = false) {
    const lifecycle = state.queueLifecycle ?? "idle";
    const queueIsIdle = lifecycle === "idle" &&
        !state.queueRunning &&
        !state.queue.some((task) => task.status === "running");
    const runtimeIsUnsettled = !runtime ||
        runtime.phase === "unknown" ||
        runtime.phase === "stopped" ||
        runtime.phase === "degraded" ||
        runtime.phase === "error";
    if (environmentScanning && queueIsIdle && runtimeIsUnsettled) {
        return comfyStatus("initializing", t(uiKeys.queue.comfyUi.initializing), t);
    }
    if (runtime?.phase === "error") {
        return comfyStatus("error", runtime.message || t(uiKeys.queue.comfyUi.error), t);
    }
    if (runtime?.phase === "degraded") {
        return comfyStatus("error", runtime.message, t);
    }
    if (runtime?.phase === "starting") {
        return comfyStatus("starting", runtime.message || t(uiKeys.queue.comfyUi.starting), t);
    }
    if (runtime?.phase === "restarting" || runtime?.phase === "stopping") {
        return comfyStatus("ending", runtime.message, t);
    }
    if (runtime?.phase === "ready") {
        return comfyStatus("connected", runtime.message || t(uiKeys.queue.comfyUi.connected), t);
    }
    if (runtime?.phase === "stopped") {
        return comfyStatus(state.queue.some((task) => task.status === "waiting") ? "waiting" : "unknown", runtime.message, t);
    }
    if (lifecycle === "error") {
        return comfyStatus("error", t(uiKeys.queue.comfyUi.error), t);
    }
    if (lifecycle === "starting") {
        return comfyStatus("starting", t(uiKeys.queue.comfyUi.starting), t);
    }
    if (lifecycle === "cancelling") {
        return comfyStatus("cancelling", t(uiKeys.queue.comfyUi.cancelling), t);
    }
    if (lifecycle === "cleaning") {
        return comfyStatus("cleaning", t(uiKeys.queue.comfyUi.cleaning), t);
    }
    if (lifecycle === "pausing") {
        return comfyStatus("ending", t(uiKeys.queue.comfyUi.ending), t);
    }
    if (state.queue.some((task) => task.status === "waiting")) {
        return comfyStatus("waiting", t(uiKeys.queue.comfyUi.waiting), t);
    }
    return comfyStatus("unknown", t(uiKeys.queue.comfyUi.unknown), t);
}
export function queueOperationStatus(state, t) {
    const lifecycle = state.queueLifecycle ?? "idle";
    if (lifecycle === "error") {
        return {
            visible: true,
            tone: "error",
            message: t(uiKeys.queue.operation.error)
        };
    }
    const key = lifecycle === "starting"
        ? uiKeys.queue.operation.starting
        : lifecycle === "pausing"
            ? uiKeys.queue.operation.pausing
            : lifecycle === "cancelling"
                ? uiKeys.queue.operation.cancelling
                : lifecycle === "cleaning"
                    ? uiKeys.queue.operation.cleaning
                    : null;
    if (!key)
        return { visible: false, tone: "pending", message: "" };
    const startedAt = state.queueLifecycleStartedAt
        ? Date.parse(state.queueLifecycleStartedAt)
        : Number.NaN;
    const duration = Number.isFinite(startedAt)
        ? formatElapsedDuration(Math.max(0, (Date.now() - startedAt) / 1000), t)
        : t(uiKeys.format.waitingTimer);
    return {
        visible: true,
        tone: "pending",
        message: t(key, { duration })
    };
}
function patchQueueElement(selector, value, dataset) {
    const element = document.querySelector(selector);
    if (!element)
        return false;
    element.textContent = value;
    if (dataset) {
        for (const [key, dataValue] of Object.entries(dataset)) {
            element.dataset[key] = dataValue;
        }
    }
    return true;
}
/**
 * Patch the volatile queue fields in place. Returning false means the queue
 * shell is not mounted (or is missing a required stable target), so the
 * caller should fall back to a normal render.
 */
export function patchQueueLiveDom(state, t, runtime, environmentScanning = false) {
    const comfy = queueComfyUiStatus(state, t, runtime, environmentScanning);
    const operation = queueOperationStatus(state, t);
    const activeTasks = state.queue.filter((task) => task.status === "waiting" || task.status === "running");
    const headerTone = queueHeaderTone(state);
    if (!patchQueueElement("#queue-active-count", t(uiKeys.queue.taskCount, { count: activeTasks.length }), {
        queueState: headerTone
    }))
        return false;
    if (!patchQueueElement("#queue-comfy-status", comfy.shortLabel, {
        status: comfy.tone
    }))
        return false;
    const comfyElement = document.querySelector("#queue-comfy-status");
    if (comfyElement)
        comfyElement.title = comfy.label;
    const operationElement = document.querySelector("#queue-operation-status");
    const operationMessage = document.querySelector("#queue-operation-message");
    if (!operationElement || !operationMessage)
        return false;
    operationElement.hidden = !operation.visible;
    operationElement.dataset.tone = operation.tone;
    operationMessage.textContent = operation.message;
    const running = state.queue.find((task) => task.status === "running");
    const remainingSeconds = queueRemainingSeconds(activeTasks, state.history, state.imageHistory);
    const etaElement = document.querySelector("#queue-eta");
    if (etaElement)
        etaElement.textContent = queueEstimateText(remainingSeconds, t);
    if (etaElement) {
        etaElement.title = remainingSeconds == null
            ? t(uiKeys.queue.etaNoteAfterFirst)
            : t(uiKeys.queue.etaNoteCurrentProgress);
    }
    const runSummary = document.querySelector("#queue-run-summary");
    const lifecycle = state.queueLifecycle ?? "idle";
    const queueSessionActive = Boolean(state.queueStartedAt &&
        (state.queueRunning || (lifecycle !== "idle" && lifecycle !== "error")));
    // Keep the ETA visible for waiting/paused work even before a run has
    // started. Only the elapsed counter depends on an active queue session.
    if (runSummary)
        runSummary.hidden = !(activeTasks.length > 0 || queueSessionActive);
    const headerElapsed = document.querySelector("#queue-runtime-elapsed");
    if (headerElapsed)
        headerElapsed.textContent = queueSessionActive ? elapsedText(state.queueStartedAt, t) : "";
    const elapsed = document.querySelector("#running-elapsed");
    const stageElapsed = document.querySelector("#running-stage-elapsed");
    const runningEta = document.querySelector("#running-eta");
    const progressLabel = document.querySelector("#running-progress-label");
    const progressBar = document.querySelector("#running-progress-bar");
    if (!running) {
        return !elapsed && !stageElapsed && !runningEta && !progressLabel && !progressBar;
    }
    if (!elapsed || !stageElapsed || !runningEta || !progressLabel || !progressBar)
        return false;
    const progress = Math.max(0, Math.min(100, running.progress ?? 0));
    elapsed.textContent = elapsedText(running.startedAt, t);
    stageElapsed.textContent = queueStageElapsedText(running, t);
    runningEta.textContent = t(uiKeys.queue.card.eta, {
        time: queueEstimateText(queueTaskRemainingSeconds(running, state.history, state.imageHistory), t)
    });
    progressLabel.textContent = `${Math.round(progress)}%`;
    progressBar.style.width = `${progress}%`;
    const progressContainer = progressBar.closest("[role=progressbar]");
    progressContainer?.setAttribute("aria-valuenow", String(Math.round(progress)));
    const stage = document.querySelector("#running-stage");
    if (stage)
        stage.textContent = running.stage ?? t(uiKeys.queue.card.preparing);
    if (running.taskType === "upscale" && running.modelId === "seedvr2-native-int8") {
        const container = document.querySelector("#seedvr2-segment-progress");
        const label = document.querySelector("#seedvr2-segment-label");
        const detail = document.querySelector("#seedvr2-segment-detail");
        const localBar = document.querySelector("#seedvr2-segment-progress-bar");
        if (!container || !label || !detail || !localBar)
            return false;
        const view = seedVr2ProgressView(running, t);
        container.hidden = !view.visible;
        label.textContent = view.label;
        detail.textContent = view.detail;
        localBar.style.width = `${view.localProgress}%`;
        localBar.closest("[role=progressbar]")
            ?.setAttribute("aria-valuenow", String(Math.round(view.localProgress)));
    }
    return true;
}
export function createQueueLiveStatus(options) {
    let performancePolling = false;
    let pollingTimer;
    const refresh = async () => {
        if (performancePolling)
            return;
        const state = options.getState();
        if (!state)
            return;
        performancePolling = true;
        try {
            const metrics = await options.studio.getPerformanceMetrics(state.settings);
            options.setPerformanceMetrics(metrics);
            if (options.getPage() !== "queue")
                return;
            patchQueueLiveDom(options.getState() ?? state, options.t, options.getComfyRuntimeState(), options.getEnvironmentScanning?.() ?? false);
            setMetric("metric-cpu", metrics.cpuPercent);
            setMetric("metric-memory", metrics.memoryTotalBytes > 0
                ? metrics.memoryUsedBytes / metrics.memoryTotalBytes * 100
                : null, metrics.memoryTotalBytes > 0
                ? `${formatBytes(metrics.memoryUsedBytes)} / ${formatBytes(metrics.memoryTotalBytes)}`
                : "");
            setMetric("metric-gpu", metrics.gpuPercent, metrics.gpuTemperature == null ? "" : `${metrics.gpuTemperature}°C`);
            setMetric("metric-vram", metrics.vramUsedBytes != null && metrics.vramTotalBytes
                ? metrics.vramUsedBytes / metrics.vramTotalBytes * 100
                : null, metrics.vramUsedBytes != null && metrics.vramTotalBytes != null
                ? `${formatBytes(metrics.vramUsedBytes)} / ${formatBytes(metrics.vramTotalBytes)}`
                : "");
        }
        finally {
            performancePolling = false;
        }
    };
    const updateQueueStatus = () => {
        const state = options.getState();
        if (state && options.getPage() === "queue") {
            patchQueueLiveDom(state, options.t, options.getComfyRuntimeState(), options.getEnvironmentScanning?.() ?? false);
        }
    };
    return {
        refresh,
        start() {
            pollingTimer = window.setInterval(() => {
                void refresh();
                updateQueueStatus();
            }, 2_000);
            return () => {
                if (pollingTimer !== undefined) {
                    window.clearInterval(pollingTimer);
                    pollingTimer = undefined;
                }
            };
        }
    };
}
