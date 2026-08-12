import type {
  AppApi,
  AppState,
  HistoryMigrationProgress,
  ImageAssetLibraryProgress,
  TaskPreview,
  WindowCloseRequest
} from "../types";
import type { HistoryKind, Page, RendererCleanup } from "./contracts";
import {
  historyStateChanged,
  imageHistoryStateChanged
} from "./pages/history/helpers";
import {
  imageAssetPhaseLabel,
  imageAssetProgressPercent
} from "./shell/secondary-dialogs";

export interface RendererEventOptions {
  studio: AppApi;
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
  requestRender(): void;
}

function isEditingFormControl(): boolean {
  const activeElement = document.activeElement;
  return activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement instanceof HTMLSelectElement;
}

function updateImageAssetLibraryProgress(progress: ImageAssetLibraryProgress): void {
  const message = document.querySelector<HTMLElement>("#image-assets-progress-message");
  if (message) message.textContent = progress.message;
  const progressElement = document.querySelector<HTMLElement>("#image-assets-progress");
  if (progressElement) {
    const value = imageAssetProgressPercent(progress, true);
    progressElement.setAttribute("aria-valuenow", String(value));
    progressElement.querySelector<HTMLElement>("span")?.style.setProperty("width", `${value}%`);
  }
  const phase = document.querySelector<HTMLElement>("#image-assets-progress-phase");
  if (phase) phase.textContent = imageAssetPhaseLabel(progress.phase);
  const count = document.querySelector<HTMLElement>("#image-assets-progress-count");
  if (count) count.textContent = progress.total ? `${progress.current} / ${progress.total}` : "准备中";
}

function updateTaskPreview(
  preview: TaskPreview,
  options: RendererEventOptions
): void {
  options.taskPreviews[preview.taskId] = preview.dataUrl;
  const state = options.getState();
  const running = state?.queue.find((task) => task.status === "running");
  if (options.getPage() !== "queue" || running?.id !== preview.taskId) return;
  const image = document.querySelector<HTMLImageElement>("#live-preview-image");
  const empty = document.querySelector<HTMLElement>("#live-preview-empty");
  if (image) {
    image.src = preview.dataUrl;
    image.style.display = "";
  }
  document.querySelector<HTMLVideoElement>("[data-queue-input-video]")?.style.setProperty(
    "display",
    "none"
  );
  if (empty) empty.style.display = "none";
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
      if (nextState.queueRunning) options.setPromptRuntimeLoaded(false);
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
      updateImageAssetLibraryProgress(progress);
    }),
    options.studio.onTaskPreview((preview) => updateTaskPreview(preview, options)),
    options.studio.onAttentionInstallLog((message) => {
      const log = options.appendAttentionAccelerationLog(message);
      const logElement = document.querySelector<HTMLElement>("#attention-install-log");
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
