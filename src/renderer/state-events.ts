import type {
  AppApi,
  AppState,
  ComfyRuntimeState,
  DependencyInstallProgress,
  HistoryMigrationProgress,
  ImageAssetLibraryProgress,
  PromptProgress,
  PromptProgressStage,
  TaskPreview,
  WindowCloseRequest
} from "../types";
import type { HistoryKind, Page, RendererCleanup } from "./contracts";
import type { Translate } from "../core/i18n";
import {
  historyContentStateChanged,
  imageHistoryContentStateChanged
} from "./pages/history/helpers";
import {
  imageAssetPhaseLabel,
  imageAssetProgressPercent
} from "./shell/secondary-dialogs";
import { uiKeys } from "../core/i18n-keys";
import { queueCompletionChange } from "./notifications";
import type { RendererNotifyOptions } from "./contracts";
import { queueLayoutSignature } from "./pages/queue/helpers";
import { patchQueueLiveDom } from "./pages/queue/live-status";

export interface RendererEventOptions {
  studio: AppApi;
  t: Translate;
  getState(): AppState | undefined;
  getComfyRuntimeState(): ComfyRuntimeState;
  setComfyRuntimeState(state: ComfyRuntimeState): void;
  setState(nextState: AppState): void;
  getPage(): Page;
  getHistoryKind(): HistoryKind;
  getDraftDirty(): boolean;
  getDraftSaveInFlight(): number;
  setPromptRuntimeLoaded(value: boolean): void;
  setPromptProgress(progress: PromptProgress | null): void;
  rememberModalFocus(): void;
  setPendingWindowCloseRequest(request: WindowCloseRequest): void;
  setWindowCloseResponseBusy(value: boolean): void;
  setHistoryMigrationProgress(progress: HistoryMigrationProgress): void;
  hasPendingDirectoryMigration(): boolean;
  setImageAssetLibraryProgress(progress: ImageAssetLibraryProgress): void;
  taskPreviews: Record<string, string>;
  appendAttentionAccelerationLog(message: string): string;
  appendDependencyInstallLog(progress: DependencyInstallProgress): string;
  notify(message: string, options?: RendererNotifyOptions): void;
  requestRender(): void;
}

function isEditingFormControl(): boolean {
  const activeElement = document.activeElement;
  return activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement instanceof HTMLSelectElement;
}

function updateImageAssetLibraryProgress(progress: ImageAssetLibraryProgress, t: Translate): void {
  const message = document.querySelector<HTMLElement>("#image-assets-progress-message");
  if (message) message.textContent = progress.message;
  const progressElement = document.querySelector<HTMLElement>("#image-assets-progress");
  if (progressElement) {
    const value = imageAssetProgressPercent(progress, true);
    progressElement.setAttribute("aria-valuenow", String(value));
    progressElement.querySelector<HTMLElement>("span")?.style.setProperty("width", `${value}%`);
  }
  const phase = document.querySelector<HTMLElement>("#image-assets-progress-phase");
  if (phase) phase.textContent = imageAssetPhaseLabel(progress.phase, t);
  const count = document.querySelector<HTMLElement>("#image-assets-progress-count");
  if (count) count.textContent = progress.total ? `${progress.current} / ${progress.total}` : t(uiKeys.assetLibrary.preparing);
}

const promptProgressStageKeys: Record<PromptProgressStage, string> = {
  preparing: uiKeys.create.promptProgress.preparing,
  checking: uiKeys.create.promptProgress.checking,
  uploading: uiKeys.create.promptProgress.uploading,
  "loading-model": uiKeys.create.promptProgress.loadingModel,
  analyzing: uiKeys.create.promptProgress.analyzing,
  generating: uiKeys.create.promptProgress.generating,
  validating: uiKeys.create.promptProgress.validating,
  unloading: uiKeys.create.promptProgress.unloading
};

function promptElapsedText(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function updatePromptProgressDom(progress: PromptProgress | null, t: Translate): void {
  const button = document.querySelector<HTMLButtonElement>("#enhance-prompt");
  if (!button) return;
  const label = button.querySelector<HTMLElement>("[data-prompt-progress-label]");
  const bar = button.querySelector<HTMLElement>("[data-prompt-progress-bar]");
  const active = progress?.status === "running";
  button.classList.toggle("prompt-progress-active", active);
  button.setAttribute("aria-busy", String(active));
  if (!progress) return;
  const elapsed = promptElapsedText(progress.elapsedMs);
  const stage = t(promptProgressStageKeys[progress.stage]);
  const detail = progress.detail?.trim();
  const amount = progress.progress == null ? "" : ` · ${Math.round(progress.progress)}%`;
  const suffix = progress.status === "running"
    ? `${t(uiKeys.create.promptProgress.elapsed, { time: elapsed })}${amount}`
    : progress.status === "cancelled"
      ? t(uiKeys.create.promptProgress.cancel)
      : detail || stage;
  button.title = `${stage} · ${suffix}`;
  if (label) label.textContent = active ? elapsed : suffix;
  if (bar) {
    bar.classList.toggle("indeterminate", progress.progress == null && active);
    bar.style.width = progress.progress == null
      ? active ? "34%" : "0%"
      : `${Math.max(0, Math.min(100, progress.progress))}%`;
  }
}

function updateTaskPreview(
  preview: TaskPreview,
  options: RendererEventOptions
): void {
  const state = options.getState();
  const running = state?.queue.find((task) => task.status === "running");
  if (!running || running.id !== preview.taskId) {
    delete options.taskPreviews[preview.taskId];
    return;
  }
  options.taskPreviews[preview.taskId] = preview.dataUrl;
  if (options.getPage() !== "queue" || running?.id !== preview.taskId) return;
  const taskSelector = CSS.escape(preview.taskId);
  const image = document.querySelector<HTMLImageElement>(
    `[data-live-preview-image="${taskSelector}"]`
  );
  const empty = document.querySelector<HTMLElement>(
    `[data-live-preview-empty="${taskSelector}"]`
  );
  const indicator = document.querySelector<HTMLElement>(
    `[data-live-preview-indicator="${taskSelector}"]`
  );
  const spinner = document.querySelector<HTMLElement>(
    `[data-live-preview-spinner="${taskSelector}"]`
  );
  if (image) {
    image.src = preview.dataUrl;
    image.style.display = "";
    image.dataset.livePreviewActive = "true";
    image.dataset.livePreviewSource = preview.source ?? "unknown";
    if (preview.step !== undefined) image.dataset.livePreviewStep = String(preview.step);
    if (preview.totalSteps !== undefined) image.dataset.livePreviewTotalSteps = String(preview.totalSteps);
  }
  if (indicator) indicator.style.display = "";
  if (spinner) spinner.style.display = "none";
  document.querySelector<HTMLVideoElement>(
    `[data-queue-input-video="${taskSelector}"]`
  )?.style.setProperty(
    "display",
    "none"
  );
  if (empty) empty.style.display = "none";
}

function pruneTaskPreviews(
  state: AppState,
  options: RendererEventOptions
): void {
  const runningTaskIds = new Set(
    state.queue
      .filter((task) => task.status === "running")
      .map((task) => task.id)
  );
  for (const taskId of Object.keys(options.taskPreviews)) {
    if (!runningTaskIds.has(taskId)) delete options.taskPreviews[taskId];
  }
}

export function registerRendererEvents(
  options: RendererEventOptions
): RendererCleanup {
  let promptProgressTimer: number | undefined;
  const stopPromptProgressTimer = () => {
    if (promptProgressTimer === undefined) return;
    window.clearInterval(promptProgressTimer);
    promptProgressTimer = undefined;
  };
  const startPromptProgressTimer = (progress: PromptProgress) => {
    stopPromptProgressTimer();
    promptProgressTimer = window.setInterval(() => {
      const current = {
        ...progress,
        elapsedMs: Date.now() - progress.startedAt
      };
      options.setPromptProgress(current);
      updatePromptProgressDom(current, options.t);
    }, 1000);
  };
  const unsubscribers = [
    options.studio.onWindowCloseRequest((request) => {
      options.rememberModalFocus();
      options.setPendingWindowCloseRequest(request);
      options.setWindowCloseResponseBusy(false);
      options.requestRender();
    }),
    options.studio.onStateChanged((nextState) => {
      const previousState = options.getState();
      const queueStructureStable = options.getPage() === "queue" &&
        previousState !== undefined &&
        queueLayoutSignature(previousState) === queueLayoutSignature(nextState);
      const completion = queueCompletionChange(previousState, nextState);
      const historyChanged = historyContentStateChanged(previousState?.history, nextState.history);
      const imageHistoryChanged = imageHistoryContentStateChanged(
        previousState?.imageHistory,
        nextState.imageHistory
      );
      const localDraft = previousState?.draft;
      options.setState({
        ...nextState,
        draft: localDraft && (options.getDraftDirty() || options.getDraftSaveInFlight() > 0)
          ? localDraft
          : nextState.draft
      });
      pruneTaskPreviews(nextState, options);
      if (nextState.queueRunning) options.setPromptRuntimeLoaded(false);
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
      if (queueStructureStable && patchQueueLiveDom(nextState, options.t, options.getComfyRuntimeState())) return;
      if (isEditingFormControl() || options.getDraftSaveInFlight() > 0) return;
      const visibleHistoryChanged = options.getHistoryKind() === "image"
        ? imageHistoryChanged
        : historyChanged;
      const page = options.getPage();
      if (
        (page === "history" || page === "history-detail" || page === "image-history-detail") &&
        !visibleHistoryChanged
      ) return;
      options.requestRender();
    }),
    options.studio.onComfyRuntimeStateChanged((runtime) => {
      const previous = options.getComfyRuntimeState();
      options.setComfyRuntimeState(runtime);
      const meaningfulTransition = previous.phase !== runtime.phase && (
        previous.phase !== "unknown" || ["starting", "restarting", "degraded", "error"].includes(runtime.phase)
      );
      if (meaningfulTransition && ["starting", "restarting", "ready", "degraded", "stopped", "error"].includes(runtime.phase)) {
        options.notify(runtime.message, {
          kind: runtime.phase === "error" ? "error" : ["degraded", "stopped"].includes(runtime.phase) ? "warning" : "info"
        });
      }
      const currentState = options.getState();
      if (options.getPage() === "queue" && currentState) {
        patchQueueLiveDom(currentState, options.t, runtime);
      } else if (options.getPage() === "settings") {
        options.requestRender();
      }
    }),
    options.studio.onPromptProgress((progress) => {
      if (progress.status === "running") {
        options.setPromptProgress(progress);
        updatePromptProgressDom(progress, options.t);
        startPromptProgressTimer(progress);
      } else {
        stopPromptProgressTimer();
        options.setPromptProgress(null);
        updatePromptProgressDom(progress, options.t);
      }
    }),
    options.studio.onHistoryMigrationProgress((progress) => {
      options.setHistoryMigrationProgress(progress);
      if (options.hasPendingDirectoryMigration()) options.requestRender();
    }),
    options.studio.onImageAssetLibraryProgress((progress) => {
      options.setImageAssetLibraryProgress(progress);
      updateImageAssetLibraryProgress(progress, options.t);
    }),
    options.studio.onTaskPreview((preview) => updateTaskPreview(preview, options)),
    options.studio.onAttentionInstallLog((message) => {
      const log = options.appendAttentionAccelerationLog(message);
      const logElement = document.querySelector<HTMLElement>("#attention-install-log");
      if (logElement) {
        logElement.textContent = log;
        logElement.scrollTop = logElement.scrollHeight;
      }
    }),
    options.studio.onDependencyInstallLog((progress) => {
      const log = options.appendDependencyInstallLog(progress);
      const logElement = document.querySelector<HTMLElement>(
        `[data-dependency-install-log="${CSS.escape(`${progress.kind}:${progress.id}`)}"]`
      );
      if (logElement) {
        logElement.textContent = log;
        logElement.scrollTop = logElement.scrollHeight;
      }
    })
  ];

  const reportError = (message: string, meta?: Record<string, unknown>) => {
    void options.studio.reportRendererError(message, meta).catch(() => undefined);
  };
  const onError = (event: ErrorEvent) => {
    reportError(event.message || "Renderer error", {
      source: event.filename,
      line: event.lineno,
      column: event.colno
    });
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
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
