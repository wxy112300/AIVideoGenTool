import type {
  AppApi,
  AppState,
  DependencyInstallProgress,
  HistoryMigrationProgress,
  ImageAssetLibraryProgress,
  TaskPreview,
  WindowCloseRequest
} from "../types";
import type { HistoryKind, Page, RendererCleanup } from "./contracts";
import type { Translate } from "../core/i18n";
import {
  historyStateChanged,
  imageHistoryStateChanged
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
  setState(nextState: AppState): void;
  getPage(): Page;
  getHistoryKind(): HistoryKind;
  getDraftDirty(): boolean;
  getDraftSaveInFlight(): number;
  setPromptRuntimeLoaded(value: boolean): void;
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
      const historyChanged = historyStateChanged(previousState?.history, nextState.history);
      const imageHistoryChanged = imageHistoryStateChanged(
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
      if (queueStructureStable && patchQueueLiveDom(nextState, options.t)) return;
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
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}
