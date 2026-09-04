import type {
  AppLogSnapshot,
  AppState,
  ComfyRuntimeState,
  EnvironmentScanResult,
  EnhanceRequest,
  HistoryMigrationProgress,
  ImageAssetLibraryProgress,
  PromptProgress,
  Settings,
  SettingsSaveMode,
  WindowCloseRequest
} from "../../types";
import {
  createPromptRuntimeState,
  promptModelStartupIsActive,
  promptOperationBelongsTo,
  promptOperationIsActive,
  type PromptRuntimeState
} from "../../core/prompt-runtime-state";
import { projectPromptRuntimeView, type PromptRuntimeViewProjection } from "../../core/prompt-runtime-view";
import { uiKeys } from "../../core/i18n-keys";
import type { Translate, TranslationParams } from "../../core/i18n";
import { createNotification, notificationAlreadyPending, notificationShouldPreserveError } from "../notifications";
import type { RendererNotifyOptions, Page, CreationMode, HistoryKind, SettingsTab } from "../contracts";
import type { RendererUiState } from "../ui-state";
import type {
  RendererApplicationApi,
  RendererAssetsApi,
  RendererHostCapabilities
} from "../studio-client";
import {
  acceptConfirmation as runConfirmation,
  type ConfirmationApplicationApi,
  type ConfirmationRequest
} from "./confirmation-service";
import {
  imageAssetResultSummary,
  renderDirectoryMigrationDialog,
  renderImageAssetLibraryDialog
} from "./secondary-dialogs";
import { renderConfirmationDialog, renderWindowCloseDialog } from "./dialogs";
import { appLogTerminalHtml, visibleAppLogText } from "../shared/logs";
import { renderIcons } from "../shared/icons";
import { promptModelStatus } from "../shared/status";

type ShellApplicationApi = Pick<RendererApplicationApi,
  | "setSettingsDirty"
  | "reportNotification"
  | "preflightPromptModel"
  | "enhancePrompt"
  | "startPromptModel"
  | "releasePromptModel"
  | "readAppLogs"
> & ConfirmationApplicationApi;

type ShellAssetsApi = Pick<RendererAssetsApi,
  | "readImage"
  | "scanImageAssetLibrary"
  | "organizeImageAssetLibrary"
  | "cleanupImageAssetLibrary"
>;

type ShellHostCapabilities = Pick<RendererHostCapabilities, "respondWindowClose">;

export interface RendererShellCoordinatorDependencies {
  modalRoot: HTMLElement;
  ui: RendererUiState;
  application: ShellApplicationApi;
  assets: ShellAssetsApi;
  hostCapabilities: ShellHostCapabilities;
  t(key: string, params?: TranslationParams, fallback?: string): string;
  icon(name: string, className?: string): string;
  escapeHtml(value: unknown): string;
  formatAssetBytes(bytes: number): string;
  getState(): AppState;
  setState(nextState: AppState): void;
  getPage(): Page;
  setPage(page: Page): void;
  getSettings(): Settings;
  getEnvironmentScan(): EnvironmentScanResult | null;
  getSettingsTab(): SettingsTab;
  getFormSettings(): Settings;
  setSettingsDraft(settings: Settings | null): void;
  setServiceForceStopping(value: boolean): void;
  setServiceStatusMessage(message: string): void;
  setLlamaCppPythonInstalling(value: boolean): void;
  getLlamaCppPythonLog(): string;
  setLlamaCppPythonLog(log: string): void;
  getCustomNodeLog(nodeId: string): string;
  setCustomNodeLog(nodeId: string, log: string): void;
  scanEnvironment(settings: Settings): Promise<void>;
  clearCreationDraft(mode: CreationMode): void;
  setHistoryKind(kind: HistoryKind): void;
  setHistoryScrollRestorePending(value: boolean): void;
  setSelectedHistoryAssetId(assetId: string): void;
  setSelectedHistoryVersionId(versionId: string): void;
  clearImageHistoryThumbnailCache(): void;
  setQueueActionBusy(value: { taskId: string; action: "remove" | "cancel" } | null): void;
  releaseHistoryVideo(assetId: string): void;
  saveSettings(settings: Settings, mode: SettingsSaveMode): Promise<void>;
  render(): void;
  requestRender(): void;
  reportUserAction(action: string, meta?: Record<string, unknown>): void;
  beforeRenderOverlay?(): void;
  renderAdditionalOverlays?(): string;
  bindAdditionalOverlays?(): (() => void) | undefined;
}

export interface RendererShellCoordinator {
  showMessage(message: string, legacyOrOptions?: boolean | RendererNotifyOptions): void;
  dismissNotification(id?: number): void;
  runNotificationAction(actionId: string): void;
  rememberModalFocus(): void;
  rememberModalControlFocus(element: HTMLElement): void;
  restoreModalFocus(): void;
  bindModalFocus(
    dialog: HTMLElement,
    close: () => void,
    initialSelector?: string,
    focusOnBind?: boolean
  ): void;
  renderOverlay(): void;
  requestConfirmation(request: ConfirmationRequest): void;
  enhancePrompt(request: EnhanceRequest): Promise<string>;
  togglePromptModel(): Promise<void>;
  promptRuntimeControlIcon(): string;
  promptRuntimeControlTitle(settings?: Settings): string;
  promptRuntimeView(origin: CreationMode): PromptRuntimeViewProjection;
  promptOperationBelongsTo(origin: CreationMode): boolean;
  getPromptRuntimeState(): PromptRuntimeState;
  setPromptRuntimeState(runtime: PromptRuntimeState): void;
  getPromptRuntimeLoaded(): boolean;
  setPromptRuntimeLoaded(value: boolean): void;
  getPromptStarting(): boolean;
  getPromptEnhancing(): boolean;
  setPromptEnhancing(value: boolean): void;
  getPromptReleasing(): boolean;
  getPromptProgress(): PromptProgress | null;
  setPromptProgress(progress: PromptProgress | null): void;
  setPendingWindowCloseRequest(request: WindowCloseRequest): void;
  setWindowCloseResponseBusy(value: boolean): void;
  setHistoryMigrationProgress(progress: HistoryMigrationProgress): void;
  hasPendingDirectoryMigration(): boolean;
  setImageAssetLibraryProgress(progress: ImageAssetLibraryProgress): void;
  requestDirectoryMigration(
    previousSettings: Settings,
    nextSettings: Settings,
    oldDirectory: string,
    newDirectory: string
  ): void;
  openImageAssetLibrary(): void;
  getAppLogs(): AppLogSnapshot | null;
  getAppLogsLoading(): boolean;
  getAppLogsError(): string;
  getAppLogScreenClearedAt(): number | null;
  clearAppLogScreen(): void;
  loadAppLogs(): Promise<void>;
  setAppLogFollowTail(value: boolean): void;
  syncAppLogPolling(): void;
}

export function createRendererShellCoordinator(
  deps: RendererShellCoordinatorDependencies,
  initialComfyRuntime: ComfyRuntimeState
): RendererShellCoordinator {
  let promptRuntime = createPromptRuntimeState(initialComfyRuntime);
  let promptEnhancing = false;
  let promptStarting = false;
  let promptStartRequestPending = false;
  let promptReleasing = false;
  let promptRuntimeLoaded = false;
  let promptProgress: PromptProgress | null = null;
  let resolvePromptCpuConfirmation: ((confirmed: boolean) => void) | null = null;
  let appLogs: AppLogSnapshot | null = null;
  let appLogsLoading = false;
  let appLogsError = "";
  let appLogPollingTimer: number | undefined;
  let appLogPollingInFlight = false;
  let appLogFollowTail = true;
  let appLogScreenClearedAt: number | null = null;
  let overlayCleanup: (() => void) | null = null;

  function rememberModalFocus(): void {
    const active = document.activeElement;
    deps.ui.modalReturnFocus = active instanceof HTMLElement && active !== document.body
      ? active
      : null;
    deps.ui.modalInitialFocusPending = true;
    deps.ui.modalControlFocusSelector = "";
  }

  function rememberModalControlFocus(element: HTMLElement): void {
    if (element.id) {
      deps.ui.modalControlFocusSelector = `#${element.id}`;
      return;
    }
    const upscaleHeight = element.dataset.upscaleHeight;
    if (upscaleHeight) {
      deps.ui.modalControlFocusSelector = `[data-upscale-height="${CSS.escape(upscaleHeight)}"]`;
      return;
    }
    const upscaleScale = element.dataset.upscaleScale;
    if (upscaleScale) {
      deps.ui.modalControlFocusSelector = `[data-upscale-scale="${CSS.escape(upscaleScale)}"]`;
    }
  }

  function preserveModalControlFocus(): void {
    const active = document.activeElement;
    if (active instanceof HTMLElement && deps.modalRoot.contains(active)) {
      rememberModalControlFocus(active);
    }
  }

  function restoreModalFocus(): void {
    const target = deps.ui.modalReturnFocus;
    deps.ui.modalReturnFocus = null;
    window.requestAnimationFrame(() => {
      if (target?.isConnected && !target.hasAttribute("disabled")) {
        target.focus();
        return;
      }
      const currentPage = deps.getPage();
      document.querySelector<HTMLElement>(
        `.nav-button[data-page="${currentPage === "history-detail" || currentPage === "image-history-detail" ? "history" : currentPage}"]`
      )?.focus();
    });
  }

  function bindModalFocus(
    dialog: HTMLElement,
    close: () => void,
    initialSelector?: string,
    focusOnBind = true
  ): void {
    const focusableSelector = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex=\"-1\"])";
    const focusInitial = () => {
      const storedControl = !deps.ui.modalInitialFocusPending && deps.ui.modalControlFocusSelector
        ? dialog.querySelector<HTMLElement>(deps.ui.modalControlFocusSelector)
        : null;
      const initial = storedControl ?? (initialSelector
        ? dialog.querySelector<HTMLElement>(initialSelector)
        : null);
      const first = initial ?? dialog.querySelector<HTMLElement>(focusableSelector);
      (first ?? dialog).focus();
      deps.ui.modalControlFocusSelector = "";
    };
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)]
        .filter((element) => element.getClientRects().length > 0);
      if (!focusables.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusables[0]!;
      const last = focusables.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    if (focusOnBind && (deps.ui.modalInitialFocusPending || deps.ui.modalControlFocusSelector)) {
      deps.ui.modalInitialFocusPending = false;
      focusInitial();
    }
  }

  function syncFlashMessage(): void {
    const flash = document.querySelector<HTMLElement>("#app-flash");
    if (!flash) return;
    const message = flash.querySelector<HTMLElement>("[data-flash-message]");
    if (message) message.textContent = deps.ui.flashMessage;
    else flash.textContent = deps.ui.flashMessage;
    const actionContainer = flash.querySelector<HTMLElement>("[data-flash-actions]");
    if (actionContainer) {
      actionContainer.replaceChildren(...(deps.ui.flashNotification?.actions ?? []).map((action) => {
        const button = document.createElement("button");
        button.className = `${action.tone ?? "secondary"} flash-action`;
        button.type = "button";
        button.dataset.notificationAction = action.id;
        button.textContent = action.label;
        return button;
      }));
    }
    const kind = deps.ui.flashNotification?.kind ?? "info";
    flash.dataset.kind = kind;
    flash.className = `flash flash-${kind}${deps.ui.flashMessage ? " visible" : ""}`;
    flash.setAttribute("role", kind === "error" ? "alert" : "status");
    flash.setAttribute("aria-live", kind === "error" ? "assertive" : "polite");
    flash.classList.toggle("visible", Boolean(deps.ui.flashMessage));
  }

  function displayNextNotification(): void {
    const next = deps.ui.flashNotificationQueue.shift() ?? null;
    deps.ui.flashNotification = next;
    deps.ui.flashMessage = next?.message ?? "";
    window.clearTimeout(deps.ui.flashMessageTimer);
    deps.ui.flashMessageTimer = undefined;
    syncFlashMessage();
    if (!next || next.persistent) return;
    deps.ui.flashMessageTimer = window.setTimeout(() => {
      if (deps.ui.flashNotification?.id !== next.id) return;
      displayNextNotification();
    }, next.durationMs);
  }

  function dismissNotification(id?: number): void {
    if (id !== undefined && deps.ui.flashNotification?.id !== id) return;
    window.clearTimeout(deps.ui.flashMessageTimer);
    deps.ui.flashMessageTimer = undefined;
    deps.ui.flashNotification = null;
    deps.ui.flashMessage = "";
    syncFlashMessage();
    displayNextNotification();
  }

  function runNotificationAction(actionId: string): void {
    const notification = deps.ui.flashNotification;
    const action = notification?.actions.find((candidate) => candidate.id === actionId);
    if (!notification || !action) return;
    if (action.dismissOnInvoke !== false) dismissNotification(notification.id);
    try {
      void Promise.resolve(action.run()).catch((error) => {
        showMessage(error instanceof Error ? error.message : String(error), { kind: "error" });
      });
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), { kind: "error" });
    }
  }

  function showMessage(
    message: string,
    legacyOrOptions?: boolean | RendererNotifyOptions
  ): void {
    const options = typeof legacyOrOptions === "object" ? legacyOrOptions : undefined;
    const kind = options?.kind ?? "info";
    const notification = createNotification(
      deps.ui.nextFlashNotificationId++,
      message,
      kind,
      options?.durationMs,
      options?.actions
    );
    if (notificationAlreadyPending(notification, deps.ui.flashNotification, deps.ui.flashNotificationQueue)) return;
    if (notificationShouldPreserveError(deps.ui.flashNotification, kind)) {
      if (kind === "info") return;
      deps.ui.flashNotificationQueue.push(notification);
      void deps.application.reportNotification(kind, message).catch(() => undefined);
      return;
    }
    void deps.application.reportNotification(kind, message).catch(() => undefined);
    if (kind === "task-complete" || kind === "queue-complete") {
      deps.ui.flashNotificationQueue.push(notification);
      if (!deps.ui.flashNotification) displayNextNotification();
      return;
    }
    deps.ui.flashNotificationQueue = [];
    deps.ui.flashNotification = notification;
    deps.ui.flashMessage = message;
    window.clearTimeout(deps.ui.flashMessageTimer);
    syncFlashMessage();
    if (notification.persistent) return;
    deps.ui.flashMessageTimer = window.setTimeout(() => {
      if (deps.ui.flashNotification?.id !== notification.id) return;
      displayNextNotification();
    }, notification.durationMs);
  }

  function directoryMigrationDialog(): string {
    return renderDirectoryMigrationDialog({
      request: deps.ui.pendingDirectoryMigration,
      progress: deps.ui.historyMigrationProgress,
      busy: deps.ui.directoryMigrationBusy,
      t: deps.t,
      icon: deps.icon,
      escapeHtml: deps.escapeHtml
    });
  }

  async function chooseDirectoryMigration(mode: SettingsSaveMode | "cancel"): Promise<void> {
    const request = deps.ui.pendingDirectoryMigration;
    if (!request || deps.ui.directoryMigrationBusy) return;
    if (mode === "cancel") {
      deps.setSettingsDraft({
        ...request.nextSettings,
        outputDirectory: request.previousSettings.outputDirectory
      });
      deps.ui.pendingDirectoryMigration = null;
      deps.ui.historyMigrationProgress = null;
      renderOverlay();
      restoreModalFocus();
      showMessage(deps.t(uiKeys.runtime.directoryCancelled));
      return;
    }
    deps.ui.directoryMigrationBusy = true;
    deps.ui.historyMigrationProgress = null;
    renderOverlay();
    try {
      await deps.saveSettings(request.nextSettings, mode);
      const warningCount = (deps.ui.historyMigrationProgress as HistoryMigrationProgress | null)?.warningCount ?? 0;
      deps.ui.pendingDirectoryMigration = null;
      deps.ui.directoryMigrationBusy = false;
      deps.ui.historyMigrationProgress = null;
      deps.render();
      restoreModalFocus();
      if (mode === "migrate-video-history") {
        showMessage(
          warningCount
            ? deps.t(uiKeys.runtime.migrationCompletedWarnings, { count: warningCount })
            : deps.t(uiKeys.runtime.migrationCompleted),
          warningCount ? { kind: "warning" } : undefined
        );
      }
    } catch (error) {
      deps.ui.directoryMigrationBusy = false;
      showMessage(error instanceof Error ? error.message : String(error), { kind: "error" });
      renderOverlay();
    }
  }

  function bindDirectoryMigrationDialog(): void {
    if (!deps.ui.pendingDirectoryMigration) return;
    deps.modalRoot.querySelector("#directory-apply")?.addEventListener("click", () => {
      void chooseDirectoryMigration("apply");
    });
    deps.modalRoot.querySelector("#directory-apply-migrate")?.addEventListener("click", () => {
      void chooseDirectoryMigration("migrate-video-history");
    });
    deps.modalRoot.querySelector("#directory-cancel")?.addEventListener("click", () => {
      void chooseDirectoryMigration("cancel");
    });
    deps.modalRoot.querySelector("#directory-migration-backdrop")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget && !deps.ui.directoryMigrationBusy) {
        void chooseDirectoryMigration("cancel");
      }
    });
    const dialog = deps.modalRoot.querySelector<HTMLElement>(".directory-migration-dialog");
    if (dialog) bindModalFocus(dialog, () => void chooseDirectoryMigration("cancel"), "#directory-cancel");
  }

  function imageAssetLibraryDialogHtml(): string {
    return renderImageAssetLibraryDialog({
      dialog: deps.ui.imageAssetLibraryDialog,
      progress: deps.ui.imageAssetLibraryProgress,
      icon: deps.icon,
      escapeHtml: deps.escapeHtml,
      formatAssetBytes: deps.formatAssetBytes,
      t: deps.t
    });
  }

  async function scanImageAssets(): Promise<void> {
    if (!deps.ui.imageAssetLibraryDialog || deps.ui.imageAssetLibraryDialog.busy) return;
    deps.ui.imageAssetLibraryDialog = {
      ...deps.ui.imageAssetLibraryDialog,
      busy: true,
      error: "",
      confirmCleanup: false,
      lastResult: null
    };
    deps.ui.imageAssetLibraryProgress = null;
    renderOverlay();
    try {
      const scan = await deps.assets.scanImageAssetLibrary();
      deps.ui.imageAssetLibraryDialog = {
        scan,
        busy: false,
        error: "",
        confirmCleanup: false,
        selectedPaths: scan.orphanFiles.slice(0, 12).map((file) => file.absolutePath),
        lastResult: null
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deps.ui.imageAssetLibraryDialog = {
        ...deps.ui.imageAssetLibraryDialog,
        busy: false,
        error: message
      };
      showMessage(message, { kind: "error" });
    }
    renderOverlay();
  }

  function loadImageAssetLibraryPreviews(): void {
    deps.modalRoot.querySelectorAll<HTMLImageElement>("[data-asset-preview-source]").forEach((preview) => {
      const sourcePath = preview.dataset.assetPreviewSource;
      if (!sourcePath) return;
      void deps.assets.readImage(sourcePath).then((dataUrl) => {
        if (!dataUrl || !preview.isConnected) return;
        preview.src = dataUrl;
        preview.classList.add("is-loaded");
      }).catch(() => {
        if (preview.isConnected) preview.classList.add("is-unavailable");
      });
    });
  }

  function bindImageAssetLibraryDialog(): void {
    const dialog = deps.ui.imageAssetLibraryDialog;
    if (!dialog) return;
    loadImageAssetLibraryPreviews();
    const close = () => {
      if (deps.ui.imageAssetLibraryDialog?.busy) return;
      deps.ui.imageAssetLibraryDialog = null;
      deps.ui.imageAssetLibraryProgress = null;
      renderOverlay();
      restoreModalFocus();
    };
    deps.modalRoot.querySelector("#image-assets-close")?.addEventListener("click", close);
    deps.modalRoot.querySelector("#image-asset-library-backdrop")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) close();
    });
    deps.modalRoot.querySelector("#image-assets-rescan")?.addEventListener("click", () => void scanImageAssets());
    deps.modalRoot.querySelector("#image-assets-organize")?.addEventListener("click", async () => {
      if (!deps.ui.imageAssetLibraryDialog || deps.ui.imageAssetLibraryDialog.busy) return;
      deps.ui.imageAssetLibraryDialog = {
        ...deps.ui.imageAssetLibraryDialog,
        busy: true,
        error: "",
        lastResult: null
      };
      deps.ui.imageAssetLibraryProgress = null;
      renderOverlay();
      try {
        const result = await deps.assets.organizeImageAssetLibrary();
        deps.ui.imageAssetLibraryDialog = {
          scan: result.scan,
          busy: false,
          error: "",
          confirmCleanup: false,
          selectedPaths: result.scan.orphanFiles.slice(0, 12).map((file) => file.absolutePath),
          lastResult: imageAssetResultSummary(result, "organize", deps.formatAssetBytes, deps.t)
        };
        showMessage(deps.t(uiKeys.runtime.assetOrganized, {
          archived: result.archivedFiles,
          reorganized: result.reorganizedFiles,
          references: result.updatedReferences
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        deps.ui.imageAssetLibraryDialog = {
          ...deps.ui.imageAssetLibraryDialog,
          busy: false,
          error: message
        };
        showMessage(message, { kind: "error" });
      }
      renderOverlay();
    });
    deps.modalRoot.querySelector("#image-assets-cleanup")?.addEventListener("click", async () => {
      if (!deps.ui.imageAssetLibraryDialog || deps.ui.imageAssetLibraryDialog.busy) return;
      if (!deps.ui.imageAssetLibraryDialog.confirmCleanup) {
        const selectedPaths = [...deps.modalRoot.querySelectorAll<HTMLInputElement>("[data-orphan-path]:checked")]
          .map((item) => item.dataset.orphanPath || "")
          .filter(Boolean);
        deps.ui.imageAssetLibraryDialog = {
          ...deps.ui.imageAssetLibraryDialog,
          confirmCleanup: true,
          selectedPaths
        };
        renderOverlay();
        return;
      }
      const paths = [...deps.ui.imageAssetLibraryDialog.selectedPaths];
      deps.ui.imageAssetLibraryDialog = {
        ...deps.ui.imageAssetLibraryDialog,
        busy: true,
        error: "",
        confirmCleanup: false,
        lastResult: null
      };
      deps.ui.imageAssetLibraryProgress = null;
      renderOverlay();
      try {
        const result = await deps.assets.cleanupImageAssetLibrary(paths);
        deps.ui.imageAssetLibraryDialog = {
          scan: result.scan,
          busy: false,
          error: "",
          confirmCleanup: false,
          selectedPaths: result.scan.orphanFiles.slice(0, 12).map((file) => file.absolutePath),
          lastResult: imageAssetResultSummary(result, "cleanup", deps.formatAssetBytes, deps.t)
        };
        showMessage(deps.t(uiKeys.runtime.assetCleaned, {
          files: result.cleanedFiles,
          bytes: deps.formatAssetBytes(result.cleanedBytes)
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        deps.ui.imageAssetLibraryDialog = {
          ...deps.ui.imageAssetLibraryDialog,
          busy: false,
          error: message,
          confirmCleanup: false
        };
        showMessage(message, { kind: "error" });
      }
      renderOverlay();
    });
    const element = deps.modalRoot.querySelector<HTMLElement>(".image-asset-library-dialog");
    if (element) bindModalFocus(element, close, "#image-assets-close");
  }

  function promptRuntimeControlIcon(): string {
    return promptStarting || promptReleasing
      ? "refresh-cw"
      : promptRuntimeLoaded || promptEnhancing
        ? "square"
        : "play";
  }

  function promptRuntimeControlTitle(settings = deps.getSettings()): string {
    return promptStarting
      ? deps.t(uiKeys.runtime.promptStarting)
      : promptEnhancing
        ? deps.t(uiKeys.runtime.releasePrompt)
        : promptReleasing
          ? deps.t(uiKeys.runtime.promptReleasing)
          : promptRuntimeLoaded
            ? deps.t(uiKeys.runtime.releasePrompt)
      : promptModelStatus(settings, deps.getEnvironmentScan(), deps.t).detail;
  }

  function promptVramLabel(bytes: number | null): string {
    return bytes == null ? "--" : `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
  }

  async function promptExecutionDecision(): Promise<"gpu" | "cpu" | null> {
    const preflight = await deps.application.preflightPromptModel();
    if (!preflight.requiresCpuConfirmation) return "gpu";
    resolvePromptCpuConfirmation?.(false);
    rememberModalFocus();
    deps.ui.pendingConfirmation = {
      kind: "prompt-cpu-fallback",
      usedVram: promptVramLabel(preflight.vramUsedBytes),
      totalVram: promptVramLabel(preflight.vramTotalBytes),
      freeVram: promptVramLabel(preflight.vramFreeBytes),
      requiredVram: promptVramLabel(preflight.requiredFreeVramBytes)
    };
    deps.ui.confirmationBusy = false;
    renderOverlay();
    return new Promise<"cpu" | null>((resolve) => {
      resolvePromptCpuConfirmation = (confirmed) => resolve(confirmed ? "cpu" : null);
    });
  }

  async function enhancePrompt(request: EnhanceRequest): Promise<string> {
    const decision = await promptExecutionDecision();
    if (!decision) {
      throw new DOMException(deps.t(uiKeys.dialog.promptCpuCancelled), "AbortError");
    }
    return deps.application.enhancePrompt({
      ...request,
      allowCpuFallback: decision === "cpu" ? true : undefined
    });
  }

  async function releasePromptModelFromUi(): Promise<void> {
    if (promptRuntime.model.phase === "unloading") return;
    deps.reportUserAction("release-prompt-service");
    promptReleasing = true;
    deps.render();
    try {
      const result = await deps.application.releasePromptModel();
      if (!result.ok) throw new Error(result.message);
      promptRuntimeLoaded = false;
      showMessage(result.message);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), { kind: "error" });
    } finally {
      promptReleasing = false;
      deps.render();
    }
  }

  async function startPromptModelFromUi(): Promise<void> {
    if (promptRuntime.model.phase === "warming" || promptRuntime.service.phase === "starting") return;
    deps.reportUserAction("start-prompt-service");
    promptStartRequestPending = true;
    promptStarting = true;
    deps.render();
    try {
      const decision = await promptExecutionDecision();
      if (!decision) return;
      const result = await deps.application.startPromptModel(decision === "cpu");
      if (!result.ok) throw new Error(result.message);
      promptRuntimeLoaded = true;
      showMessage(result.message);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), { kind: "error" });
    } finally {
      promptStartRequestPending = false;
      promptStarting = promptModelStartupIsActive(promptRuntime);
      deps.render();
    }
  }

  async function togglePromptModel(): Promise<void> {
    if (promptRuntime.model.phase === "resident" || promptOperationIsActive(promptRuntime)) {
      await releasePromptModelFromUi();
    } else {
      await startPromptModelFromUi();
    }
  }

  async function acceptConfirmation(): Promise<void> {
    if (deps.ui.pendingConfirmation?.kind === "prompt-cpu-fallback") {
      const resolve = resolvePromptCpuConfirmation;
      resolvePromptCpuConfirmation = null;
      deps.ui.pendingConfirmation = null;
      renderOverlay();
      restoreModalFocus();
      resolve?.(true);
      return;
    }
    await runConfirmation(
      { application: deps.application, t: deps.t },
      {
        getRequest: () => deps.ui.pendingConfirmation,
        setRequest: (request) => {
          deps.ui.pendingConfirmation = request;
        },
        setBusy: (value) => {
          deps.ui.confirmationBusy = value;
        },
        isBusy: () => deps.ui.confirmationBusy,
        getState: deps.getState,
        setState: deps.setState,
        getFormSettings: deps.getFormSettings,
        clearCreationDraft: deps.clearCreationDraft,
        setServiceForceStopping: deps.setServiceForceStopping,
        setServiceStatusMessage: deps.setServiceStatusMessage,
        setLlamaCppPythonInstalling: deps.setLlamaCppPythonInstalling,
        getLlamaCppPythonLog: deps.getLlamaCppPythonLog,
        setLlamaCppPythonLog: deps.setLlamaCppPythonLog,
        setCustomNodeLog: deps.setCustomNodeLog,
        scanEnvironment: deps.scanEnvironment,
        setSettingsDraft: deps.setSettingsDraft,
        setPage: deps.setPage,
        setHistoryKind: deps.setHistoryKind,
        setHistoryScrollRestorePending: deps.setHistoryScrollRestorePending,
        setSelectedHistoryAssetId: deps.setSelectedHistoryAssetId,
        setSelectedHistoryVersionId: deps.setSelectedHistoryVersionId,
        clearImageHistoryThumbnailCache: deps.clearImageHistoryThumbnailCache,
        setQueueActionBusy: deps.setQueueActionBusy,
        releaseHistoryVideo: deps.releaseHistoryVideo,
        rememberModalFocus,
        restoreModalFocus,
        render: deps.render,
        overlayRoot: deps.modalRoot,
        renderOverlay,
        notify: showMessage,
        getPage: deps.getPage
      }
    );
  }

  function bindConfirmationDialog(): void {
    if (!deps.ui.pendingConfirmation) return;
    const close = () => {
      if (deps.ui.confirmationBusy) return;
      if (deps.ui.pendingConfirmation?.kind === "prompt-cpu-fallback") {
        const resolve = resolvePromptCpuConfirmation;
        resolvePromptCpuConfirmation = null;
        resolve?.(false);
      }
      deps.ui.pendingConfirmation = null;
      renderOverlay();
      restoreModalFocus();
    };
    deps.modalRoot.querySelector("#cancel-confirmation")?.addEventListener("click", close);
    deps.modalRoot.querySelector("#accept-confirmation")?.addEventListener("click", () => {
      void acceptConfirmation();
    });
    deps.modalRoot.querySelector("#confirm-backdrop")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) close();
    });
    const dialog = deps.modalRoot.querySelector<HTMLElement>(".confirm-dialog");
    if (dialog) bindModalFocus(dialog, close, "#cancel-confirmation");
  }

  function bindWindowCloseDialog(): void {
    if (!deps.ui.pendingWindowCloseRequest) return;
    const respond = async (
      response: "cancel" | "discard-settings" | "finish-tasks" | "force-exit"
    ) => {
      if (deps.ui.windowCloseResponseBusy) return;
      if (document.activeElement instanceof HTMLElement) {
        rememberModalControlFocus(document.activeElement);
      }
      deps.ui.windowCloseResponseBusy = true;
      renderOverlay();
      try {
        await deps.hostCapabilities.respondWindowClose(response);
        if (response === "cancel") {
          deps.ui.pendingWindowCloseRequest = null;
          deps.ui.windowCloseResponseBusy = false;
          renderOverlay();
          restoreModalFocus();
        }
      } catch (error) {
        deps.ui.windowCloseResponseBusy = false;
        showMessage(error instanceof Error ? error.message : deps.t(uiKeys.runtime.exitRequestFailed), { kind: "error" });
        renderOverlay();
      }
    };
    const cancel = () => void respond("cancel");
    deps.modalRoot.querySelector("#cancel-window-close")?.addEventListener("click", cancel);
    deps.modalRoot.querySelector("#window-close-backdrop")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) cancel();
    });
    deps.modalRoot.querySelector("#discard-window-close")?.addEventListener("click", () => {
      void respond("discard-settings");
    });
    deps.modalRoot.querySelector("#finish-window-close")?.addEventListener("click", () => {
      void respond("finish-tasks");
    });
    deps.modalRoot.querySelector("#force-window-close")?.addEventListener("click", () => {
      void respond("force-exit");
    });
    const dialog = deps.modalRoot.querySelector<HTMLElement>(".close-dialog");
    if (dialog) bindModalFocus(dialog, cancel, "#cancel-window-close");
  }

  function renderOverlay(): void {
    deps.beforeRenderOverlay?.();
    preserveModalControlFocus();
    overlayCleanup?.();
    overlayCleanup = null;
    deps.modalRoot.innerHTML = [
      renderConfirmationDialog({
        request: deps.ui.pendingConfirmation,
        confirmationBusy: deps.ui.confirmationBusy,
        customNodeLog: deps.ui.pendingConfirmation?.kind === "uninstall-custom-node"
          ? deps.getCustomNodeLog(deps.ui.pendingConfirmation.nodeId)
          : "",
        imageHistoryIds: new Set(deps.getState().imageHistory.map((item) => item.id)),
        t: deps.t,
        icon: deps.icon,
        escapeHtml: deps.escapeHtml
      }),
      directoryMigrationDialog(),
      imageAssetLibraryDialogHtml(),
      renderWindowCloseDialog({
        request: deps.ui.pendingWindowCloseRequest,
        responseBusy: deps.ui.windowCloseResponseBusy,
        t: deps.t,
        icon: deps.icon,
        escapeHtml: deps.escapeHtml
      }),
      deps.renderAdditionalOverlays?.() ?? ""
    ].join("");
    renderIcons(deps.modalRoot);
    bindConfirmationDialog();
    bindDirectoryMigrationDialog();
    bindImageAssetLibraryDialog();
    bindWindowCloseDialog();
    overlayCleanup = deps.bindAdditionalOverlays?.() ?? null;
  }

  function requestConfirmation(request: ConfirmationRequest): void {
    rememberModalFocus();
    deps.ui.pendingConfirmation = request;
    deps.ui.confirmationBusy = false;
    renderOverlay();
  }

  function setPromptRuntimeState(runtime: PromptRuntimeState): void {
    promptRuntime = runtime;
    promptRuntimeLoaded = runtime.model.phase === "resident";
    promptStarting = promptModelStartupIsActive(runtime, promptStartRequestPending);
    promptReleasing = runtime.model.phase === "unloading";
    promptEnhancing = promptOperationIsActive(runtime);
  }

  function promptRuntimeView(origin: CreationMode): PromptRuntimeViewProjection {
    return projectPromptRuntimeView(promptRuntime, origin);
  }

  function clearAppLogScreen(): void {
    if (appLogsLoading) return;
    appLogScreenClearedAt = Date.now();
    appLogFollowTail = true;
    deps.reportUserAction("clear-log-screen");
    const terminal = document.querySelector<HTMLPreElement>("#app-log-terminal");
    if (terminal) {
      terminal.innerHTML = "";
      terminal.scrollTop = 0;
    }
  }

  function applyAppLogSnapshot(snapshot: AppLogSnapshot): void {
    appLogs = snapshot;
    const terminal = document.querySelector<HTMLPreElement>("#app-log-terminal");
    if (!terminal) {
      deps.render();
      return;
    }
    const shouldFollowTail = appLogFollowTail ||
      terminal.scrollHeight - terminal.scrollTop - terminal.clientHeight < 48;
    terminal.innerHTML = appLogTerminalHtml(
      visibleAppLogText(snapshot.text, appLogScreenClearedAt),
      deps.t(uiKeys.settings.logsEmpty)
    );
    if (shouldFollowTail) terminal.scrollTop = terminal.scrollHeight;
    const count = document.querySelector<HTMLElement>("#app-log-count");
    if (count) count.textContent = String(snapshot.records.length);
  }

  async function pollAppLogs(): Promise<void> {
    if (
      appLogPollingInFlight ||
      appLogsLoading ||
      deps.getPage() !== "settings" ||
      deps.getSettingsTab() !== "logs"
    ) return;
    appLogPollingInFlight = true;
    try {
      const snapshot = await deps.application.readAppLogs(2000);
      if (snapshot.text !== appLogs?.text) applyAppLogSnapshot(snapshot);
    } catch {
      // Keep the last readable log while the main process is busy.
    } finally {
      appLogPollingInFlight = false;
    }
  }

  function syncAppLogPolling(): void {
    const shouldPoll = deps.getPage() === "settings" && deps.getSettingsTab() === "logs";
    if (!shouldPoll) {
      if (appLogPollingTimer !== undefined) {
        window.clearInterval(appLogPollingTimer);
        appLogPollingTimer = undefined;
      }
      return;
    }
    if (appLogPollingTimer === undefined) {
      appLogPollingTimer = window.setInterval(() => void pollAppLogs(), 2_000);
    }
  }

  async function loadAppLogs(): Promise<void> {
    if (appLogsLoading) return;
    appLogScreenClearedAt = null;
    appLogsLoading = true;
    appLogsError = "";
    deps.render();
    try {
      applyAppLogSnapshot(await deps.application.readAppLogs(2000));
    } catch (error) {
      appLogsError = error instanceof Error ? error.message : String(error);
    } finally {
      appLogsLoading = false;
      deps.render();
    }
  }

  function requestDirectoryMigration(
    previousSettings: Settings,
    nextSettings: Settings,
    oldDirectory: string,
    newDirectory: string
  ): void {
    rememberModalFocus();
    deps.ui.pendingDirectoryMigration = {
      target: "video",
      previousSettings,
      nextSettings,
      oldDirectory,
      newDirectory
    };
    deps.ui.directoryMigrationBusy = false;
    deps.ui.historyMigrationProgress = null;
    renderOverlay();
  }

  function openImageAssetLibrary(): void {
    rememberModalFocus();
    deps.ui.imageAssetLibraryDialog = {
      scan: null,
      busy: false,
      error: "",
      confirmCleanup: false,
      selectedPaths: [],
      lastResult: null
    };
    renderOverlay();
    void scanImageAssets();
  }

  return {
    showMessage,
    dismissNotification,
    runNotificationAction,
    rememberModalFocus,
    rememberModalControlFocus,
    restoreModalFocus,
    bindModalFocus,
    renderOverlay,
    requestConfirmation,
    enhancePrompt,
    togglePromptModel,
    promptRuntimeControlIcon,
    promptRuntimeControlTitle,
    promptRuntimeView,
    promptOperationBelongsTo: (origin) => promptOperationBelongsTo(promptRuntime, origin),
    getPromptRuntimeState: () => promptRuntime,
    setPromptRuntimeState,
    getPromptRuntimeLoaded: () => promptRuntimeLoaded,
    setPromptRuntimeLoaded: (value) => {
      promptRuntimeLoaded = value;
    },
    getPromptStarting: () => promptStarting,
    getPromptEnhancing: () => promptEnhancing,
    setPromptEnhancing: (value) => {
      promptEnhancing = value;
    },
    getPromptReleasing: () => promptReleasing,
    getPromptProgress: () => promptProgress,
    setPromptProgress: (progress) => {
      promptProgress = progress;
    },
    setPendingWindowCloseRequest: (request) => {
      deps.ui.pendingWindowCloseRequest = request;
    },
    setWindowCloseResponseBusy: (value) => {
      deps.ui.windowCloseResponseBusy = value;
    },
    setHistoryMigrationProgress: (progress) => {
      deps.ui.historyMigrationProgress = progress;
    },
    hasPendingDirectoryMigration: () => Boolean(deps.ui.pendingDirectoryMigration),
    setImageAssetLibraryProgress: (progress) => {
      deps.ui.imageAssetLibraryProgress = progress;
    },
    requestDirectoryMigration,
    openImageAssetLibrary,
    getAppLogs: () => appLogs,
    getAppLogsLoading: () => appLogsLoading,
    getAppLogsError: () => appLogsError,
    getAppLogScreenClearedAt: () => appLogScreenClearedAt,
    clearAppLogScreen,
    loadAppLogs,
    setAppLogFollowTail: (value) => {
      appLogFollowTail = value;
    },
    syncAppLogPolling
  };
}
