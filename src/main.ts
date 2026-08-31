import "media-chrome";
import "media-chrome/menu";
import "media-chrome/lang/zh-CN.js";
import "media-chrome/lang/zh-TW.js";
import "./style.css";
import { createRendererApp } from "./renderer/app";
import { bootstrapRenderer } from "./renderer/bootstrap";
import {
  createQueueWorkspaceCoordinator,
  createRendererNavigation,
  type QueueWorkspaceCoordinator,
  type RendererNavigation
} from "./renderer/composition";
import { createWindowRendererEntry } from "./renderer/entry";
import { registerRendererEvents } from "./renderer/state-events";
import {
  creationMode,
  historyKind,
  page,
  setCreationMode,
  setHistoryKind,
  setPage,
  setRendererState,
  state
} from "./renderer/renderer-state";
import { rendererUiState as ui } from "./renderer/ui-state";
import type { CreationMode, HistoryKind, Page, RendererCleanup, RendererNotifyOptions } from "./renderer/contracts";
import { createQueueLiveStatus } from "./renderer/pages/queue/live-status";
import { createQueueAssembly } from "./renderer/pages/queue/assembly";
import { createQueueScrollController } from "./renderer/pages/queue/scroll-controller";
import { createRenderCoordinator, type RenderCoordinator } from "./renderer/render-coordinator";
import type { EnvironmentRefreshReason } from "./renderer/environment-refresh-coordinator";
import {
  createSettingsWorkspaceCoordinator,
  type SettingsWorkspaceCoordinator
} from "./renderer/pages/settings/coordinator";
import {
  createHistoryWorkspaceCoordinator,
  type HistoryWorkspaceCoordinator,
  type HistoryPlaybackSnapshot
} from "./renderer/pages/history/coordinator";
import { versionShortEdge } from "./renderer/pages/history/helpers";
import {
  createCreateWorkspaceCoordinator,
  type CreateWorkspaceCoordinator
} from "./renderer/pages/create/coordinator";
import { loadPromptPacks } from "./renderer/prompt-packs";
import { escapeHtml } from "./renderer/shared/dom";
import {
  formatAssetBytes,
  formatBytes,
  formatUpscaleEstimateRange,
  formatVideoDuration,
  performanceCard,
} from "./renderer/shared/formatters";
import { icon } from "./renderer/shared/icons";
import { mountShellController } from "./renderer/shell/controller";
import { mountUpscaleController } from "./renderer/shell/upscale-controller";
import { renderUpscaleDialog } from "./renderer/shell/secondary-dialogs";
import { createRendererShellCoordinator, type RendererShellCoordinator } from "./renderer/shell/coordinator";
import type {
  AppState,
  BundledWorkflow,
  ComfyRuntimeState,
  Draft,
  EnvironmentScanResult,
  ImageEditDraft,
  ImageHistoryProject,
  PerformanceMetrics,
  Settings,
  WorkflowCapabilities
} from "./types";
import {
  createUpscaleFilename,
  estimateUpscaleResources,
  upscaleDimensions
} from "./core/upscale";
import {
  BUILTIN_VIDEO_LORAS,
  H3_TURBO_LORA_ID,
  bundledWorkflowModelId,
  isH3TurboEnabled,
  reorderVideoLoras,
  videoLoraConfigurationIssues,
  videoLoraCompatibleWithDraft,
  videoLoraSelection,
  detectedVideoLoraFilename,
  profileProvidesVideoLora
} from "./core/video-loras";

const appElement = document.querySelector<HTMLDivElement>("#app")!;
const modalRoot = document.querySelector<HTMLDivElement>("#modal-root")!;
const rendererEntry = createWindowRendererEntry();
const rendererDependencies = rendererEntry.dependencies;
const rendererApplication = rendererDependencies.application;
const rendererEvents = rendererDependencies.events;
const rendererAssets = rendererDependencies.assets;
const rendererHostCapabilities = rendererDependencies.hostCapabilities;
let shellCoordinator: RendererShellCoordinator;
let createWorkspaceCoordinator: CreateWorkspaceCoordinator;
let historyWorkspaceCoordinator: HistoryWorkspaceCoordinator;
let settingsWorkspaceCoordinator: SettingsWorkspaceCoordinator;
let queueWorkspaceCoordinator: QueueWorkspaceCoordinator;
let rendererNavigation: RendererNavigation;
const bundledWorkflows: Record<string, BundledWorkflow> = {};
const bundledWorkflowKey = (modelId: string, inputMode: Draft["inputMode"]) =>
  `${modelId}:${inputMode}`;
const workflowCapabilities: Record<string, WorkflowCapabilities> = {};
const taskPreviews: Record<string, string> = {};
let performanceMetrics: PerformanceMetrics | null = null;
let comfyRuntime: ComfyRuntimeState = {
  phase: "unknown",
  ownership: "unknown",
  endpoint: "",
  message: "",
  updatedAt: new Date(0).toISOString(),
  operationId: 0
};

window.addEventListener("dragover", (event) => {
  if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
});
window.addEventListener("drop", (event) => {
  if (event.dataTransfer?.files.length) event.preventDefault();
});
const rememberModalFocus = (): void => shellCoordinator.rememberModalFocus();
const rememberModalControlFocus = (element: HTMLElement): void => shellCoordinator.rememberModalControlFocus(element);
const restoreModalFocus = (): void => shellCoordinator.restoreModalFocus();
const bindModalFocus = (
  dialog: HTMLElement,
  close: () => void,
  initialSelector?: string,
  focusOnBind = true
): void => shellCoordinator.bindModalFocus(dialog, close, initialSelector, focusOnBind);
const renderOverlay = (): void => shellCoordinator.renderOverlay();
const dismissNotification = (id?: number): void => shellCoordinator.dismissNotification(id);
const runNotificationAction = (actionId: string): void => shellCoordinator.runNotificationAction(actionId);
const showMessage = (
  message: string,
  legacyOrOptions?: boolean | RendererNotifyOptions
): void => shellCoordinator.showMessage(message, legacyOrOptions);
const clearAppLogScreen = (): void => shellCoordinator.clearAppLogScreen();
const loadAppLogs = (): Promise<void> => shellCoordinator.loadAppLogs();
const syncAppLogPolling = (): void => shellCoordinator.syncAppLogPolling();
const togglePromptModelFromUi = (): Promise<void> => shellCoordinator.togglePromptModel();
const promptRuntimeControlIcon = (): string => shellCoordinator.promptRuntimeControlIcon();
const promptRuntimeControlTitle = (settings = state.settings): string =>
  shellCoordinator.promptRuntimeControlTitle(settings);

function upscaleDialogHtml(): string {
  return renderUpscaleDialog({
    dialog: ui.upscaleDialog,
    history: state.history,
    environment: settingsWorkspaceCoordinator.getEnvironmentScan(),
    performance: performanceMetrics,
    icon,
    escapeHtml,
    formatBytes,
    formatVideoDuration,
    formatUpscaleEstimateRange: (minSeconds, maxSeconds) => formatUpscaleEstimateRange(minSeconds, maxSeconds, rendererApp.context.t),
    createUpscaleFilename,
    estimateUpscaleResources,
    upscaleDimensions,
    versionShortEdge,
    t: rendererApp.context.t
  });
}

function createPage(): string {
  return createWorkspaceCoordinator.renderPage();
}

function patchDraft(patch: Partial<Draft>): void {
  createWorkspaceCoordinator.patchDraft(patch);
}

function patchDraftForMode(
  mode: Exclude<CreationMode, "image-edit">,
  update: (draft: Draft) => Partial<Draft>
): void {
  createWorkspaceCoordinator.patchDraftForMode(mode, update);
}

function patchImageDraft(patch: Partial<ImageEditDraft>): void {
  createWorkspaceCoordinator.patchImageDraft(patch);
}

function clearCreationDraft(mode: CreationMode): void {
  createWorkspaceCoordinator.clearDraft(mode);
}

function saveDraftImmediately(draft: Draft): Promise<void> {
  return createWorkspaceCoordinator.saveDraftImmediately(draft);
}

function selectDraftVideo(
  filename: string,
  source?: Parameters<CreateWorkspaceCoordinator["selectDraftVideo"]>[1],
  renderAfterSave?: boolean
): Promise<void> {
  return createWorkspaceCoordinator.selectDraftVideo(filename, source, renderAfterSave);
}

function enableSpectrumByDefaultIfAvailable(
  mode?: Exclude<CreationMode, "image-edit">
): void {
  createWorkspaceCoordinator.enableSpectrumByDefaultIfAvailable(mode);
}

function bindCreate(): void {
  createWorkspaceCoordinator.bind();
}

function getDraftDirty(): boolean {
  return createWorkspaceCoordinator.getDraftDirty();
}

function getDraftSaveInFlight(): number {
  return createWorkspaceCoordinator.getDraftSaveInFlight();
}

function getImageDraftDirty(): boolean {
  return createWorkspaceCoordinator.getImageDraftDirty();
}

function getImageDraftSaveInFlight(): number {
  return createWorkspaceCoordinator.getImageDraftSaveInFlight();
}

function renderHistoryList(): string {
  return historyWorkspaceCoordinator.renderList(rendererApp.context);
}

function renderHistoryDetail(kind: "video" | "image"): string {
  return historyWorkspaceCoordinator.renderDetail(rendererApp.context, kind);
}

function bindHistory(playback: HistoryPlaybackSnapshot | null = null): void {
  historyWorkspaceCoordinator.bind(playback);
}

function historyBeforeRender(): void {
  historyWorkspaceCoordinator.beforeRender();
}

function bindHistoryViewportControls(): RendererCleanup {
  return historyWorkspaceCoordinator.bindViewportControls();
}

function restoreHistoryScrollPosition(): void {
  historyWorkspaceCoordinator.restoreScrollPosition();
}

function captureHistoryScrollPosition(): void {
  historyWorkspaceCoordinator.captureHistoryScrollPosition();
}

function setHistoryScrollRestorePending(value: boolean): void {
  historyWorkspaceCoordinator.setScrollRestorePending(value);
}

function clearImageHistoryThumbnailCache(): void {
  historyWorkspaceCoordinator.clearImageHistoryThumbnailCache();
}

function releaseHistoryVideo(assetId: string): void {
  historyWorkspaceCoordinator.releaseHistoryVideo(assetId);
}

function returnToHistory(): void {
  historyWorkspaceCoordinator.returnToHistory();
}

function returnToLastHistoryDetail(): void {
  historyWorkspaceCoordinator.returnToLastHistoryDetail();
}

function navigateHistoryDetail(direction: -1 | 1): void {
  historyWorkspaceCoordinator.navigateHistoryDetail(direction);
}

function navigateImageHistoryDetail(direction: -1 | 1): void {
  historyWorkspaceCoordinator.navigateImageHistoryDetail(direction);
}

function settingsHaveUnsavedChanges(): boolean {
  return settingsWorkspaceCoordinator.settingsHaveUnsavedChanges();
}

function settingsPage(): string {
  return settingsWorkspaceCoordinator.renderPage();
}

function render(): void {
  appElement.removeAttribute("aria-busy");
  rendererApp.render();
}

let renderCoordinator: RenderCoordinator;
function requestRendererRefresh(): void {
  renderCoordinator.requestRender();
}
const rendererApp = createRendererApp({
  root: appElement,
  dependencies: rendererDependencies,
  enhancePrompt: (request) => shellCoordinator.enhancePrompt(request),
  getState: () => state,
  getRoute: () => ({ page, creationMode, historyKind }),
  requestRender: () => render(),
  navigate: (nextPage) => {
    setPage(nextPage);
    render();
  },
  notify: showMessage,
  reportUserAction,
  renderLegacy: () => renderCoordinator.render()
});

function initializeRenderCoordinator(): void {
  renderCoordinator = createRenderCoordinator({
  root: appElement,
  addPageCleanup: rendererApp.addPageCleanup,
  getPage: () => page,
  getState: () => state,
  getUiState: () => ui,
  getPerformanceMetrics: () => performanceMetrics,
  t: rendererApp.context.t,
  renderPages: {
    create: createPage,
    queue: () => queueAssembly.render(rendererApp.context),
    history: renderHistoryList,
    historyDetail: () => renderHistoryDetail("video"),
    imageHistoryDetail: () => renderHistoryDetail("image"),
    settings: settingsPage
  },
  beforeRenderHistory: historyBeforeRender,
  closeAppLogContextMenu: () => settingsWorkspaceCoordinator.closeAppLogContextMenu(),
  ensurePromptPacks: loadPromptPacks,
  bindShell,
  renderOverlay,
  beforeRenderQueue: queueScrollController.beforeRender,
  bindCreate,
  bindQueue: () => {
    rendererApp.addPageCleanup(queueAssembly.mount(rendererApp.context));
  },
  bindHistory,
  bindSettings,
  bindHistoryViewportControls,
  restoreQueueScrollPosition: queueScrollController.restoreScrollPosition,
  restoreHistoryScrollPosition,
  syncAppLogPolling,
  icon,
  escapeHtml
  });
}

const queueScrollController = createQueueScrollController(() => page);
rendererNavigation = createRendererNavigation({
  getState: () => state,
  ui,
  setCreationMode,
  setPage,
  patchDraft: (patch) => createWorkspaceCoordinator.patchDraft(patch),
  render
});
historyWorkspaceCoordinator = createHistoryWorkspaceCoordinator({
  context: rendererApp.context,
  ui,
  getState: () => state,
  getPage: () => page,
  setPage,
  getHistoryKind: () => historyKind,
  setHistoryKind,
  setState: setRendererState,
  addPageCleanup: rendererApp.addPageCleanup,
  render,
  reportUserAction,
  rememberModalFocus,
  restoreModalFocus,
  bindModalFocus,
  renderOverlay,
  saveDraftImmediately,
  selectDraftVideo,
  navigateToCreationMode: rendererNavigation.navigateToCreationMode
});
queueWorkspaceCoordinator = createQueueWorkspaceCoordinator({
  context: rendererApp.context,
  application: rendererApplication,
  ui,
  getState: () => state,
  setState: setRendererState,
  render,
  renderOverlay,
  rememberModalFocus,
  saveDraftImmediately: (draft) => createWorkspaceCoordinator.saveDraftImmediately(draft),
  navigateToCreationMode: rendererNavigation.navigateToCreationMode
});
const queueAssembly = createQueueAssembly({
  getState: () => state,
  getPerformanceMetrics: () => performanceMetrics,
  getComfyRuntime: () => comfyRuntime,
  isEnvironmentScanning: () => settingsWorkspaceCoordinator.isEnvironmentScanning(),
  getTaskPreviews: () => taskPreviews,
  getQueueActionBusy: queueWorkspaceCoordinator.getActionBusy,
  setState: setRendererState,
  setPromptRuntimeLoaded: (loaded) => shellCoordinator.setPromptRuntimeLoaded(loaded),
  requestConfirmation: queueWorkspaceCoordinator.requestConfirmation,
  editTask: queueWorkspaceCoordinator.editTask,
  editUpscaleTask: queueWorkspaceCoordinator.editUpscaleTask,
  rememberModalFocus
});
const queueLiveStatus = createQueueLiveStatus({
  application: rendererApplication,
  t: rendererApp.context.t,
  getState: () => state,
  getPage: () => page,
  getComfyRuntimeState: () => comfyRuntime,
  getEnvironmentScanning: () => settingsWorkspaceCoordinator.isEnvironmentScanning(),
  setPerformanceMetrics: (metrics) => {
    performanceMetrics = metrics;
  }
});
queueLiveStatus.start();

function reportUserAction(action: string, meta?: Record<string, unknown>): void {
  void action;
  void meta;
}

function bindShell(): void {
  rendererApp.addPageCleanup(mountShellController({
    getPage: () => page,
    settingsHaveUnsavedChanges,
    rememberModalFocus,
    requestDiscardSettings: (nextPage) => shellCoordinator.requestConfirmation({ kind: "discard-settings", nextPage }),
    returnToHistory,
    returnToLastHistoryDetail,
    navigateHistoryDetail,
    navigateImageHistoryDetail,
    captureHistoryScrollPosition,
    setHistoryScrollRestorePending,
    clearHistoryForwardTarget: () => {
      ui.historyForwardTarget = null;
    },
    setPage,
    dismissNotification,
    runNotificationAction,
    reportUserAction,
    render
  }));
}

function bindUpscaleDialog(): (() => void) {
  return mountUpscaleController(rendererApp.context, {
    root: modalRoot,
    renderOverlay,
    getDialog: () => ui.upscaleDialog,
    setDialog: (dialog) => {
      ui.upscaleDialog = dialog;
    },
    setRendererState,
    rememberModalFocus,
    rememberModalControlFocus,
    restoreModalFocus,
    bindModalFocus,
    reportUserAction
  });
}

settingsWorkspaceCoordinator = createSettingsWorkspaceCoordinator({
  modalRoot,
  context: rendererApp.context,
  getState: () => state,
  getPage: () => page,
  getComfyRuntimeState: () => comfyRuntime,
  setState: setRendererState,
  addPageCleanup: rendererApp.addPageCleanup,
  render,
  renderOverlay,
  showMessage,
  reportUserAction,
  enableSpectrumByDefaultIfAvailable,
  bundledWorkflows,
  workflowCapabilities,
  bundledWorkflowKey,
  requestConfirmation: (request) => shellCoordinator.requestConfirmation(request),
  requestDirectoryMigration: (previousSettings, nextSettings, oldDirectory, newDirectory) =>
    shellCoordinator.requestDirectoryMigration(previousSettings, nextSettings, oldDirectory, newDirectory),
  openImageAssetLibrary: () => shellCoordinator.openImageAssetLibrary(),
  rememberModalFocus,
  restoreModalFocus,
  bindModalFocus,
  getPromptRuntimeLoaded: () => shellCoordinator.getPromptRuntimeLoaded(),
  getPromptStarting: () => shellCoordinator.getPromptStarting(),
  getPromptEnhancing: () => shellCoordinator.getPromptEnhancing(),
  getPromptReleasing: () => shellCoordinator.getPromptReleasing(),
  promptRuntimeControlIcon,
  promptRuntimeControlTitle,
  togglePromptModel: togglePromptModelFromUi,
  getAppLogs: () => shellCoordinator.getAppLogs(),
  getAppLogsLoading: () => shellCoordinator.getAppLogsLoading(),
  getAppLogsError: () => shellCoordinator.getAppLogsError(),
  getAppLogScreenClearedAt: () => shellCoordinator.getAppLogScreenClearedAt(),
  loadAppLogs,
  clearAppLogScreen,
  setAppLogFollowTail: (value) => shellCoordinator.setAppLogFollowTail(value)
});

function formSettings(): Settings {
  return settingsWorkspaceCoordinator.formSettings();
}

function runEnvironmentScan(
  settings: Settings,
  reason: EnvironmentRefreshReason = "manual"
): Promise<EnvironmentScanResult | null> {
  return settingsWorkspaceCoordinator.runEnvironmentScan(settings, reason);
}

shellCoordinator = createRendererShellCoordinator({
  modalRoot,
  ui,
  application: rendererApplication,
  assets: rendererAssets,
  hostCapabilities: rendererHostCapabilities,
  t: rendererApp.context.t,
  icon,
  escapeHtml,
  formatAssetBytes,
  getState: () => state,
  setState: setRendererState,
  getPage: () => page,
  setPage,
  getSettings: () => state.settings,
  getEnvironmentScan: () => settingsWorkspaceCoordinator.getEnvironmentScan(),
  getSettingsTab: () => settingsWorkspaceCoordinator.getSettingsTab(),
  getFormSettings: formSettings,
  setSettingsDraft: settingsWorkspaceCoordinator.setSettingsDraft,
  setServiceForceStopping: settingsWorkspaceCoordinator.setServiceForceStopping,
  setServiceStatusMessage: settingsWorkspaceCoordinator.setServiceStatusMessage,
  setLlamaCppPythonInstalling: settingsWorkspaceCoordinator.setLlamaCppPythonInstalling,
  getLlamaCppPythonLog: settingsWorkspaceCoordinator.getLlamaCppPythonLog,
  setLlamaCppPythonLog: settingsWorkspaceCoordinator.setLlamaCppPythonLog,
  getCustomNodeLog: settingsWorkspaceCoordinator.getCustomNodeLog,
  setCustomNodeLog: settingsWorkspaceCoordinator.setCustomNodeLog,
  scanEnvironment: async (settings) => {
    await runEnvironmentScan(settings);
  },
  clearCreationDraft,
  setHistoryKind,
  setHistoryScrollRestorePending,
  setSelectedHistoryAssetId: (assetId) => {
    ui.selectedHistoryAssetId = assetId;
  },
  setSelectedHistoryVersionId: (versionId) => {
    ui.selectedHistoryVersionId = versionId;
  },
  clearImageHistoryThumbnailCache,
  setQueueActionBusy: queueWorkspaceCoordinator.setActionBusy,
  releaseHistoryVideo,
  saveSettings: settingsWorkspaceCoordinator.saveSettings,
  render,
  requestRender: () => renderCoordinator.requestRender(),
  reportUserAction,
  beforeRenderOverlay: settingsWorkspaceCoordinator.beforeRenderOverlay,
  renderAdditionalOverlays: () => [upscaleDialogHtml(), settingsWorkspaceCoordinator.installGuideDialogHtml()].join(""),
  bindAdditionalOverlays: () => {
    const cleanup = bindUpscaleDialog();
    settingsWorkspaceCoordinator.bindInstallGuideDialog();
    return cleanup;
  }
}, comfyRuntime);

createWorkspaceCoordinator = createCreateWorkspaceCoordinator({
  context: rendererApp.context,
  getState: () => state,
  getPage: () => page,
  getCreationMode: () => creationMode,
  setCreationMode,
  getEnvironmentScan: () => settingsWorkspaceCoordinator.getEnvironmentScan(),
  getPerformanceMetrics: () => performanceMetrics,
  bundledWorkflows,
  workflowCapabilities,
  bundledWorkflowKey,
  setRendererState,
  addPageCleanup: rendererApp.addPageCleanup,
  render,
  getEnqueueBusy: () => ui.enqueueBusy,
  setEnqueueBusy: (value) => {
    ui.enqueueBusy = value;
  },
  requestClearDraftConfirmation: (mode) =>
    shellCoordinator.requestConfirmation({ kind: "clear-draft", mode }),
  promptRuntimeControlIcon: () => shellCoordinator.promptRuntimeControlIcon(),
  promptRuntimeControlTitle: (settings) => shellCoordinator.promptRuntimeControlTitle(settings),
  promptRuntimeView: (origin) => shellCoordinator.promptRuntimeView(origin),
  promptOperationBelongsTo: (origin) => shellCoordinator.promptOperationBelongsTo(origin),
  getPromptStarting: () => shellCoordinator.getPromptStarting(),
  getPromptReleasing: () => shellCoordinator.getPromptReleasing(),
  getPromptRuntimeLoaded: () => shellCoordinator.getPromptRuntimeLoaded(),
  getPromptProgress: () => shellCoordinator.getPromptProgress(),
  setPromptEnhancing: (value) => shellCoordinator.setPromptEnhancing(value),
  setPromptRuntimeLoaded: (value) => shellCoordinator.setPromptRuntimeLoaded(value),
  togglePromptModel: () => shellCoordinator.togglePromptModel()
});

initializeRenderCoordinator();

function bindSettings(): void {
  settingsWorkspaceCoordinator.bind();
}

registerRendererEvents({
  events: rendererEvents,
  application: rendererApplication,
  t: rendererApp.context.t,
  getState: () => state,
  getComfyRuntimeState: () => comfyRuntime,
  getEnvironmentScanning: () => settingsWorkspaceCoordinator.isEnvironmentScanning(),
  setComfyRuntimeState: (runtime) => {
    comfyRuntime = runtime;
  },
  setPromptRuntimeState: (runtime) => shellCoordinator.setPromptRuntimeState(runtime),
  getPromptRuntimeState: () => shellCoordinator.getPromptRuntimeState(),
  getCreationMode: () => creationMode,
  setState: setRendererState,
  getPage: () => page,
  getHistoryKind: () => historyKind,
  getDraftDirty,
  getDraftSaveInFlight,
  getImageDraftDirty,
  getImageDraftSaveInFlight,
  setPromptRuntimeLoaded: (value) => shellCoordinator.setPromptRuntimeLoaded(value),
  setPromptProgress: (progress) => shellCoordinator.setPromptProgress(progress),
  rememberModalFocus,
  setPendingWindowCloseRequest: (request) => shellCoordinator.setPendingWindowCloseRequest(request),
  setWindowCloseResponseBusy: (value) => shellCoordinator.setWindowCloseResponseBusy(value),
  setHistoryMigrationProgress: (progress) => shellCoordinator.setHistoryMigrationProgress(progress),
  hasPendingDirectoryMigration: () => shellCoordinator.hasPendingDirectoryMigration(),
  setImageAssetLibraryProgress: (progress) => shellCoordinator.setImageAssetLibraryProgress(progress),
  taskPreviews,
  appendAttentionAccelerationLog: settingsWorkspaceCoordinator.appendAttentionAccelerationLog,
  appendDependencyInstallLog: settingsWorkspaceCoordinator.appendDependencyInstallLog,
  notify: showMessage,
  requestRender: requestRendererRefresh,
  requestOverlayRender: renderOverlay
});

bootstrapRenderer({
  application: rendererApplication,
  setState: setRendererState,
  setComfyRuntimeState: (runtime) => {
    comfyRuntime = runtime;
  },
  setPromptRuntimeState: (runtime) => shellCoordinator.setPromptRuntimeState(runtime),
  getState: () => state,
  setAppVersion: (version) => {
    ui.appVersion = version;
  },
  showStartupFailure: (message) => {
    const status = appElement.querySelector<HTMLElement>("[data-startup-message]");
    if (status) status.textContent = message;
    appElement.setAttribute("aria-busy", "false");
  },
  refreshEnvironment: (settings) => runEnvironmentScan(settings, "startup"),
  bundledWorkflows,
  workflowCapabilities,
  bundledWorkflowKey,
  bundledWorkflowModelId,
  patchDraft,
  render,
  refreshPerformanceMetrics: () => queueLiveStatus.refresh()
});
