import { historyContentStateChanged, imageHistoryContentStateChanged } from "./pages/history/helpers";
import { imageAssetPhaseLabel, imageAssetProgressPercent } from "./shell/secondary-dialogs";
import { uiKeys } from "../core/i18n-keys";
import { queueCompletionChange } from "./notifications";
import { queueLayoutSignature } from "./pages/queue/helpers";
import { patchQueueLiveDom } from "./pages/queue/live-status";
import { promptOperationBelongsTo, promptOperationIsActive } from "../core/prompt-runtime-state";
import { preserveLocalCreationDrafts } from "../core/creation-drafts";
function isEditingFormControl() {
    const activeElement = document.activeElement;
    return activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement;
}
function updateImageAssetLibraryProgress(progress, t) {
    const message = document.querySelector("#image-assets-progress-message");
    if (message)
        message.textContent = progress.message;
    const progressElement = document.querySelector("#image-assets-progress");
    if (progressElement) {
        const value = imageAssetProgressPercent(progress, true);
        progressElement.setAttribute("aria-valuenow", String(value));
        progressElement.querySelector("span")?.style.setProperty("width", `${value}%`);
    }
    const phase = document.querySelector("#image-assets-progress-phase");
    if (phase)
        phase.textContent = imageAssetPhaseLabel(progress.phase, t);
    const count = document.querySelector("#image-assets-progress-count");
    if (count)
        count.textContent = progress.total ? `${progress.current} / ${progress.total}` : t(uiKeys.assetLibrary.preparing);
}
const promptProgressStageKeys = {
    preparing: uiKeys.create.promptProgress.preparing,
    checking: uiKeys.create.promptProgress.checking,
    uploading: uiKeys.create.promptProgress.uploading,
    "loading-model": uiKeys.create.promptProgress.loadingModel,
    analyzing: uiKeys.create.promptProgress.analyzing,
    generating: uiKeys.create.promptProgress.generating,
    validating: uiKeys.create.promptProgress.validating,
    unloading: uiKeys.create.promptProgress.unloading
};
function promptElapsedText(milliseconds) {
    const seconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    return hours > 0
        ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
        : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}
function promptProgressStatusText(progress, t) {
    const elapsed = promptElapsedText(progress.elapsedMs);
    const stage = t(promptProgressStageKeys[progress.stage]);
    const detail = progress.detail?.trim();
    const amount = progress.progress == null ? "" : ` · ${Math.round(progress.progress)}%`;
    const suffix = progress.status === "running"
        ? `${t(uiKeys.create.promptProgress.elapsed, { time: elapsed })}${amount}`
        : progress.status === "cancelled"
            ? t(uiKeys.create.promptProgress.cancel)
            : detail || stage;
    return `${stage} · ${suffix}`;
}
function updatePromptProgressDom(progress, t) {
    const button = document.querySelector("#enhance-prompt");
    if (!button)
        return;
    const label = button.querySelector("[data-prompt-progress-label]");
    const bar = button.querySelector("[data-prompt-progress-bar]");
    const tooltip = document.querySelector("[data-prompt-progress-tooltip]");
    const active = progress?.status === "running";
    button.classList.toggle("prompt-progress-active", active);
    button.setAttribute("aria-busy", String(active));
    if (!progress)
        return;
    const elapsed = promptElapsedText(progress.elapsedMs);
    const accessibleStatus = promptProgressStatusText(progress, t);
    const suffix = accessibleStatus.slice(accessibleStatus.indexOf(" · ") + 3);
    button.setAttribute("aria-label", accessibleStatus);
    if (active) {
        if (tooltip) {
            button.removeAttribute("title");
            button.setAttribute("aria-describedby", "prompt-progress-tooltip");
            tooltip.textContent = accessibleStatus;
        }
        else {
            button.removeAttribute("aria-describedby");
            button.title = accessibleStatus;
        }
    }
    else {
        button.removeAttribute("aria-describedby");
        button.title = accessibleStatus;
        if (tooltip)
            tooltip.textContent = "";
    }
    if (label)
        label.textContent = active ? elapsed : suffix;
    if (bar) {
        bar.classList.toggle("indeterminate", progress.progress == null && active);
        bar.style.width = progress.progress == null
            ? active ? "34%" : "0%"
            : `${Math.max(0, Math.min(100, progress.progress))}%`;
    }
}
function updateTaskPreview(preview, options) {
    const state = options.getState();
    const running = state?.queue.find((task) => task.status === "running");
    if (!running || running.id !== preview.taskId) {
        delete options.taskPreviews[preview.taskId];
        return;
    }
    options.taskPreviews[preview.taskId] = preview.dataUrl;
    if (options.getPage() !== "queue" || running?.id !== preview.taskId)
        return;
    const taskSelector = CSS.escape(preview.taskId);
    const image = document.querySelector(`[data-live-preview-image="${taskSelector}"]`);
    const empty = document.querySelector(`[data-live-preview-empty="${taskSelector}"]`);
    const indicator = document.querySelector(`[data-live-preview-indicator="${taskSelector}"]`);
    const spinner = document.querySelector(`[data-live-preview-spinner="${taskSelector}"]`);
    if (image) {
        image.src = preview.dataUrl;
        image.style.display = "";
        image.dataset.livePreviewActive = "true";
        image.dataset.livePreviewSource = preview.source ?? "unknown";
        if (preview.step !== undefined)
            image.dataset.livePreviewStep = String(preview.step);
        if (preview.totalSteps !== undefined)
            image.dataset.livePreviewTotalSteps = String(preview.totalSteps);
    }
    if (indicator)
        indicator.style.display = "";
    if (spinner)
        spinner.style.display = "none";
    document.querySelector(`[data-queue-input-video="${taskSelector}"]`)?.style.setProperty("display", "none");
    if (empty)
        empty.style.display = "none";
}
function pruneTaskPreviews(state, options) {
    const runningTaskIds = new Set(state.queue
        .filter((task) => task.status === "running")
        .map((task) => task.id));
    for (const taskId of Object.keys(options.taskPreviews)) {
        if (!runningTaskIds.has(taskId))
            delete options.taskPreviews[taskId];
    }
}
export function registerRendererEvents(options) {
    let promptProgressTimer;
    const stopPromptProgressTimer = () => {
        if (promptProgressTimer === undefined)
            return;
        window.clearInterval(promptProgressTimer);
        promptProgressTimer = undefined;
    };
    const startPromptProgressTimer = (progress) => {
        stopPromptProgressTimer();
        promptProgressTimer = window.setInterval(() => {
            const origin = options.getCreationMode();
            if (!promptOperationBelongsTo(options.getPromptRuntimeState(), origin))
                return;
            const current = {
                ...progress,
                elapsedMs: Date.now() - progress.startedAt
            };
            options.setPromptProgress(current);
            const label = document.querySelector("#enhance-prompt [data-prompt-progress-label]");
            if (label)
                label.textContent = promptElapsedText(current.elapsedMs);
            const status = promptProgressStatusText(current, options.t);
            const button = document.querySelector("#enhance-prompt");
            const tooltip = document.querySelector("[data-prompt-progress-tooltip]");
            if (button)
                button.setAttribute("aria-label", status);
            if (tooltip)
                tooltip.textContent = status;
            else if (button)
                button.title = status;
        }, 1000);
    };
    const unsubscribers = [
        options.studio.onWindowCloseRequest((request) => {
            options.rememberModalFocus();
            options.setPendingWindowCloseRequest(request);
            options.setWindowCloseResponseBusy(false);
            (options.requestOverlayRender ?? options.requestRender)();
        }),
        options.studio.onStateChanged((nextState) => {
            const previousState = options.getState();
            const queueStructureStable = options.getPage() === "queue" &&
                previousState !== undefined &&
                queueLayoutSignature(previousState) === queueLayoutSignature(nextState);
            const completion = queueCompletionChange(previousState, nextState);
            const historyChanged = historyContentStateChanged(previousState?.history, nextState.history);
            const imageHistoryChanged = imageHistoryContentStateChanged(previousState?.imageHistory, nextState.imageHistory);
            const preserveLocalDrafts = previousState !== undefined &&
                (options.getDraftDirty() || options.getDraftSaveInFlight() > 0);
            const preserveLocalImageDraft = previousState !== undefined &&
                (options.getImageDraftDirty() || options.getImageDraftSaveInFlight() > 0);
            const localState = preserveLocalDrafts
                ? preserveLocalCreationDrafts(nextState, previousState)
                : nextState;
            options.setState(preserveLocalImageDraft && previousState
                ? { ...localState, imageDraft: previousState.imageDraft }
                : localState);
            pruneTaskPreviews(nextState, options);
            if (nextState.queueRunning)
                options.setPromptRuntimeLoaded(false);
            for (const task of completion.completedTasks) {
                options.notify(options.t(uiKeys.runtime.taskCompleted, { title: task.title }), {
                    kind: "task-complete"
                });
            }
            for (const task of completion.failedTasks) {
                options.notify(options.t(uiKeys.runtime.taskFailed, {
                    title: task.title,
                    error: task.error
                }), { kind: "error" });
            }
            if (completion.queueCompleted) {
                options.notify(options.t(uiKeys.runtime.queueCompleted), { kind: "queue-complete" });
            }
            if (queueStructureStable && patchQueueLiveDom(nextState, options.t, options.getComfyRuntimeState(), options.getEnvironmentScanning?.() ?? false))
                return;
            if (isEditingFormControl() || options.getDraftSaveInFlight() > 0 || options.getImageDraftSaveInFlight() > 0)
                return;
            const visibleHistoryChanged = options.getHistoryKind() === "image"
                ? imageHistoryChanged
                : historyChanged;
            const page = options.getPage();
            if ((page === "history" || page === "history-detail" || page === "image-history-detail") &&
                !visibleHistoryChanged)
                return;
            options.requestRender();
        }),
        options.studio.onComfyRuntimeStateChanged((runtime) => {
            const previous = options.getComfyRuntimeState();
            options.setComfyRuntimeState(runtime);
            const meaningfulTransition = previous.phase !== runtime.phase && (previous.phase !== "unknown" || ["starting", "restarting", "degraded", "error"].includes(runtime.phase));
            if (meaningfulTransition && ["starting", "restarting", "ready", "degraded", "stopped", "error"].includes(runtime.phase)) {
                options.notify(runtime.message, {
                    kind: runtime.phase === "error" ? "error" : ["degraded", "stopped"].includes(runtime.phase) ? "warning" : "info"
                });
            }
            const currentState = options.getState();
            if (options.getPage() === "queue" && currentState) {
                patchQueueLiveDom(currentState, options.t, runtime, options.getEnvironmentScanning?.() ?? false);
            }
            else if (options.getPage() === "settings") {
                options.requestRender();
            }
        }),
        options.studio.onPromptRuntimeStateChanged((runtime) => {
            options.setPromptRuntimeState(runtime);
            if (!promptOperationIsActive(runtime)) {
                stopPromptProgressTimer();
                options.setPromptProgress(null);
            }
            if (["create", "settings"].includes(options.getPage()))
                options.requestRender();
        }),
        options.studio.onPromptProgress((progress) => {
            const origin = options.getCreationMode();
            const runtime = options.getPromptRuntimeState();
            const ownsPrompt = promptOperationBelongsTo(runtime, origin) &&
                runtime.operation.operationId === progress.operationId &&
                progress.origin === origin;
            if (runtime.operation.operationId !== progress.operationId)
                return;
            if (progress.status === "running") {
                options.setPromptProgress(progress);
                if (ownsPrompt)
                    updatePromptProgressDom(progress, options.t);
                startPromptProgressTimer(progress);
            }
            else {
                stopPromptProgressTimer();
                options.setPromptProgress(null);
                if (ownsPrompt)
                    updatePromptProgressDom(progress, options.t);
            }
        }),
        options.studio.onHistoryMigrationProgress((progress) => {
            options.setHistoryMigrationProgress(progress);
            if (options.hasPendingDirectoryMigration()) {
                (options.requestOverlayRender ?? options.requestRender)();
            }
        }),
        options.studio.onImageAssetLibraryProgress((progress) => {
            options.setImageAssetLibraryProgress(progress);
            updateImageAssetLibraryProgress(progress, options.t);
        }),
        options.studio.onTaskPreview((preview) => updateTaskPreview(preview, options)),
        options.studio.onAttentionInstallLog((message) => {
            const log = options.appendAttentionAccelerationLog(message);
            const logElement = document.querySelector("#attention-install-log");
            const logDetails = document.querySelector("#attention-install-log-details");
            const progressElement = document.querySelector("#attention-install-progress");
            const stageElement = document.querySelector("#attention-install-stage");
            const progressBar = progressElement?.querySelector(".progress");
            const progressFill = progressBar?.querySelector("span");
            const downloadProgress = message.match(/下载进度：(\d+)%/u);
            if (logDetails) {
                logDetails.hidden = false;
                logDetails.open = true;
            }
            if (progressElement)
                progressElement.hidden = false;
            if (stageElement)
                stageElement.textContent = message;
            if (progressBar && progressFill) {
                if (downloadProgress) {
                    const percent = Math.min(100, Math.max(0, Number(downloadProgress[1])));
                    progressBar.classList.remove("indeterminate");
                    progressBar.setAttribute("aria-valuenow", String(percent));
                    progressFill.style.width = `${percent}%`;
                }
                else {
                    progressBar.classList.add("indeterminate");
                    progressBar.removeAttribute("aria-valuenow");
                    progressFill.style.removeProperty("width");
                }
            }
            if (logElement) {
                logElement.textContent = log;
                logElement.scrollTop = logElement.scrollHeight;
            }
        }),
        options.studio.onDependencyInstallLog((progress) => {
            const log = options.appendDependencyInstallLog(progress);
            const logElement = document.querySelector(`[data-dependency-install-log="${CSS.escape(`${progress.kind}:${progress.id}`)}"]`);
            if (logElement) {
                logElement.textContent = log;
                logElement.scrollTop = logElement.scrollHeight;
            }
        })
    ];
    const reportError = (message, meta) => {
        void options.studio.reportRendererError(message, meta).catch(() => undefined);
    };
    const onError = (event) => {
        reportError(event.message || "Renderer error", {
            source: event.filename,
            line: event.lineno,
            column: event.colno
        });
    };
    const onUnhandledRejection = (event) => {
        const reason = event.reason instanceof Error
            ? event.reason.message
            : String(event.reason ?? "Unhandled promise rejection");
        reportError(reason);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
        stopPromptProgressTimer();
        unsubscribers.forEach((unsubscribe) => unsubscribe());
        window.removeEventListener("error", onError);
        window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
}
