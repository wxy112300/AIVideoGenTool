import "./style.css";
import { createRendererApp } from "./renderer/app";
import { bootstrapRenderer } from "./renderer/bootstrap";
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
import type { CreationMode, HistoryKind, Page, RendererNotifyOptions } from "./renderer/contracts";
import { notificationDuration } from "./renderer/notifications";
import {
  queueTaskInput,
  queueTaskInputUrl,
  renderQueueTaskCard
} from "./renderer/pages/queue/card";
import {
  queueRemainingSeconds as calculateQueueRemainingSeconds,
  queueTaskRemainingSeconds as calculateQueueTaskRemainingSeconds
} from "./renderer/pages/queue/helpers";
import { createQueueLiveStatus } from "./renderer/pages/queue/live-status";
import { mountQueueController } from "./renderer/pages/queue/controller";
import { loadQueueInputPreviews as loadQueueInputPreviewsForPage } from "./renderer/pages/queue/input-previews";
import { renderQueuePage } from "./renderer/pages/queue/page";
import { renderSettingsPage } from "./renderer/pages/settings/page";
import { mountSettingsAssembly } from "./renderer/pages/settings/assembly";
import { createRenderCoordinator, type RenderCoordinator } from "./renderer/render-coordinator";
import { readSettingsFromForm } from "./renderer/pages/settings/form";
import {
  buildSettingsPageViewModel,
  type SettingsViewModelDependencies
} from "./renderer/pages/settings/view-model";
import { createAppLogContextMenu } from "./renderer/pages/settings/log-context-menu";
import {
  CustomNodeInstallQueue,
  type CustomNodeInstallPhase
} from "./renderer/pages/settings/node-install-queue";
import {
  renderHistoryDetailPage,
  renderHistoryPage,
  renderImageHistoryDetailPage,
  renderImageHistoryPage,
  type HistoryPageOptions,
  type HistoryPageViewModel
} from "./renderer/pages/history/page";
import { type HistoryPlaybackSnapshot } from "./renderer/pages/history/page-controller";
import { mountHistoryAssembly } from "./renderer/pages/history/assembly";
import { createHistoryContextMenus } from "./renderer/pages/history/context-menus";
import { createHistoryLayoutController } from "./renderer/pages/history/layout-controller";
import { createHistoryActions } from "./renderer/pages/history/actions";
import {
  currentHistoryVersion,
  currentImageHistoryVersion,
  historyAssetsByNewest,
  historyCoverCacheKey,
  historyCoverSeed,
  historyInitialCoverTime,
  historyMediaUrl,
  historyResolutionLabel,
  imageHistoryGenerationSummary,
  imageHistoryMediaUrl,
  imageHistoryThumbnailCacheKey,
  imageProjectsByNewest,
  preferredImageVersion,
  preferredVersion,
  versionShortEdge,
  versionVideoIndex
} from "./renderer/pages/history/helpers";
import { createHistoryMediaRuntime } from "./renderer/pages/history/media-helpers";
import {
  renderCreatePage,
  renderImageEditPage,
  type CreatePageOptions,
} from "./renderer/pages/create/page";
import { mountCreateAssembly } from "./renderer/pages/create/assembly";
import { mountH3ReferencesController } from "./renderer/pages/create/references-controller";
import {
  buildImageEditPageViewModel,
  buildVideoCreatePageViewModel,
  imageEditEnqueueBlockReason,
  type CreateViewModelDependencies
} from "./renderer/pages/create/view-model";
import {
  createDefaultH3PromptBuilder,
  h3PromptPresetOptions,
  h3PromptModeForDraft,
  imageFileIsSupported,
  h3ReferenceRolePromptLabels,
  imageReferenceRolePromptLabels,
  loadImagePreview,
  orderVideoProfiles,
  resizePromptInput,
  updateImagePromptWordCounter,
  updatePromptWordCounter
} from "./renderer/pages/create/helpers";
import {
  h3PromptPackFor,
  loadPromptPacks,
  qwenImagePromptPackFor
} from "./renderer/prompt-packs";
import {
  activePromptIndexForDraft,
  clearPromptVersion,
  promptPatchForDraft,
  promptVersionsForDraft
} from "./core/draft-prompts";
import {
  PromptEditHistory,
  type PromptHistoryScope,
  type PromptHistorySnapshot
} from "./core/prompt-edit-history";
import { escapeHtml } from "./renderer/shared/dom";
import {
  elapsedText,
  frameRateSummary,
  formatAssetBytes,
  formatBytes,
  formatElapsedDuration,
  formatFullHistoryTime,
  formatTrimTime,
  formatUpscaleEstimateRange,
  formatVideoDuration,
  historyRenderDuration,
  performanceCard,
  queueEstimateText,
  queueStageElapsedText
} from "./renderer/shared/formatters";
import { icon, renderIcons } from "./renderer/shared/icons";
import { modelName, videoLoraPurposeLabel } from "./renderer/shared/labels";
import { videoLoraInfoButton } from "./renderer/shared/markup";
import {
  imageWorkflowStatus,
  isImageModelSelectable,
  isImageWorkflowReady,
  promptModelStatus
} from "./renderer/shared/status";
import { appLogTerminalHtml, visibleAppLogText } from "./renderer/shared/logs";
import { mountShellController } from "./renderer/shell/controller";
import { mountUpscaleController } from "./renderer/shell/upscale-controller";
import { acceptConfirmation as runConfirmation } from "./renderer/shell/confirmation-service";
import {
  renderConfirmationDialog,
  renderWindowCloseDialog
} from "./renderer/shell/dialogs";
import {
  imageAssetResultSummary,
  renderDirectoryMigrationDialog,
  renderImageAssetLibraryDialog,
  renderUpscaleDialog
} from "./renderer/shell/secondary-dialogs";
import type {
  AppLogSnapshot,
  AppState,
  AssetVersion,
  BundledWorkflow,
  Draft,
  EnvironmentScanResult,
  H3PromptPreset,
  H3PromptMode,
  H3ReferenceSlot,
  HistoryAsset,
  HistoryMigrationProgress,
  ImageAssetLibraryProgress,
  ImageAssetLibraryScan,
  ImageAssetVersion,
  ImageGenerationQueueTask,
  ImageEditDraft,
  ImageHistoryProject,
  ImagePromptPreset,
  ImageReference,
  LocalServiceKind,
  ModelComponentStatus,
  ModelScanProfile,
  PerformanceMetrics,
  PromptEnhanceMode,
  QueueTask,
  Settings,
  SettingsSaveMode,
  TaskPerformanceStats,
  WindowCloseRequest,
  WorkflowCapabilities
} from "./types";
import { createClearedDraft } from "./core/draft-defaults";
import {
  imageEditDraftFromQueueTask,
  imageEditPicturesForVersion,
  imageProjectCoverVersion,
  nextImagePictureNumber,
  normalizeImageEditDraft
} from "./core/image-project";
import {
  firstSupportedImageModelId,
  imageModelCapabilityFor,
  normalizeImageTargetResolution
} from "./core/image-workflow";
import {
  isComfyMultimodalPromptModel,
  isGemmaPromptModel
} from "./core/prompt-models";
import {
  generationSafetyForTask,
  isMiniMaxH3BoundaryExtensionModel,
  isMiniMaxH3Fl2vaModel,
  isMiniMaxH3Model,
  isMiniMaxH3R2vModel,
  isRetiredVideoModel,
  normalizeH3Steps
} from "./core/workflow";
import { resolveVideoGenerationPolicy } from "./core/video-policy";
import { SPECTRUM_TURBO_MINIMUM_VERSION } from "./core/catalog";
import { releaseVersionAtLeast } from "./core/release-version";
import {
  createUpscaleFilename,
  estimateUpscaleResources,
  upscaleDimensions
} from "./core/upscale";
import { checkH3Prompt } from "./core/h3-prompt-check";
import { structurallyEqual } from "./core/structural-equal";
import { createTranslator, loadUiLocale, type TranslationParams } from "./core/i18n";
import { uiKeys } from "./core/i18n-keys";
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
let draftSaveTimer: number | undefined;
let draftRevision = 0;
let draftSaveInFlight = 0;
let draftDirty = false;
let imageDraftSaveTimer: number | undefined;
let imageDraftRevision = 0;
let environmentScan: EnvironmentScanResult | null = null;
let environmentScanning = false;
let environmentScanError = "";
let serviceStarting: LocalServiceKind | null = null;
let serviceRestarting: LocalServiceKind | null = null;
let serviceForceStopping = false;
let serviceStatusMessage = "";
let comfyUpdating = false;
let comfyUpdateLog = "";
let environmentRepairing = "";
let environmentRepairLogs: Record<string, string> = {};
let customNodeInstalling = "";
let customNodeInstallQueue: string[] = [];
let customNodeInstallBatch: string[] = [];
let customNodeInstallPhase: CustomNodeInstallPhase = "idle";
let customNodeLogs: Record<string, string> = {};
let workflowDependencyInstalling = "";
let workflowDependencyLogs: Record<string, string> = {};
let coreDependencyRepairing = false;
let attentionAccelerationInstalling = false;
let attentionAccelerationLog = "";
let settingsDraft: Settings | null = null;
let settingsTab: "system" | "acceleration" | "video" | "lora" | "image" | "nodes" | "prompt" | "upscale" | "logs" = "system";
let appLogs: AppLogSnapshot | null = null;
let appLogsLoading = false;
let appLogsError = "";
let appLogPollingTimer: number | undefined;
let appLogPollingInFlight = false;
let appLogFollowTail = true;
let appLogScreenClearedAt: number | null = null;
let selectedInstallGuide: {
  profileName: string;
  component: ModelComponentStatus;
} | null = null;
let queueActionBusy: { taskId: string; action: "remove" | "cancel" | "edit" } | null = null;
const bundledWorkflows: Record<string, BundledWorkflow> = {};
const bundledWorkflowKey = (modelId: string, inputMode: Draft["inputMode"]) =>
  `${modelId}:${inputMode}`;
const workflowCapabilities: Record<string, WorkflowCapabilities> = {};
const taskPreviews: Record<string, string> = {};
let performanceMetrics: PerformanceMetrics | null = null;
let promptEnhanceMode: PromptEnhanceMode = "sulphur-native";
let h3PromptPreset: H3PromptPreset = "official-storyboard";
let settingsH3PromptPreset: H3PromptPreset = "official-storyboard";
let settingsImagePromptPreset: ImagePromptPreset = "faithful";
let promptEnhancing = false;
let promptStarting = false;
let promptReleasing = false;
let promptRuntimeLoaded = false;
const promptEditHistory = new PromptEditHistory();

let h3PromptBuilder = createDefaultH3PromptBuilder();

function uiText(
  key: string,
  params?: TranslationParams,
  fallback?: string
): string {
  return createTranslator(state.settings.uiLocale).t(key, params, fallback);
}

function videoPromptSnapshot(): PromptHistorySnapshot {
  return {
    promptVersions: promptVersionsForDraft(state.draft).map((version) => ({ ...version })),
    activePromptVersion: activePromptIndexForDraft(state.draft)
  };
}

function imagePromptSnapshot(): PromptHistorySnapshot {
  return {
    promptVersions: state.imageDraft.promptVersions.map((version) => ({ ...version })),
    activePromptVersion: state.imageDraft.activePromptVersion
  };
}

function clearPromptVersionForScope(scope: PromptHistoryScope): void {
  const before = scope === "video" ? videoPromptSnapshot() : imagePromptSnapshot();
  if (before.promptVersions.length === 1 && !before.promptVersions[0]?.text) return;
  const cleared = clearPromptVersion(before.promptVersions, before.activePromptVersion);
  const after = {
    promptVersions: cleared.promptVersions,
    activePromptVersion: cleared.activePromptVersion
  };
  promptEditHistory.record(scope, before, after);
  if (scope === "video") {
    patchDraft(promptPatchForDraft(state.draft, after.promptVersions, after.activePromptVersion));
  } else {
    patchImageDraft(after);
  }
}

function applyPromptHistorySnapshot(
  scope: PromptHistoryScope,
  snapshot: PromptHistorySnapshot
): void {
  if (scope === "video") {
    patchDraft(promptPatchForDraft(
      state.draft,
      snapshot.promptVersions.map((version) => ({ ...version })),
      snapshot.activePromptVersion
    ));
  } else {
    patchImageDraft({
      promptVersions: snapshot.promptVersions.map((version) => ({ ...version })),
      activePromptVersion: snapshot.activePromptVersion
    });
  }
}

function undoPromptEdit(scope: PromptHistoryScope): boolean {
  const snapshot = promptEditHistory.undo(scope);
  if (!snapshot) return false;
  applyPromptHistorySnapshot(scope, snapshot);
  return true;
}

function redoPromptEdit(scope: PromptHistoryScope): boolean {
  const snapshot = promptEditHistory.redo(scope);
  if (!snapshot) return false;
  applyPromptHistorySnapshot(scope, snapshot);
  return true;
}

function invalidatePromptEditHistory(scope: PromptHistoryScope): void {
  promptEditHistory.invalidate(scope);
}

window.addEventListener("dragover", (event) => {
  if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
});
window.addEventListener("drop", (event) => {
  if (event.dataTransfer?.files.length) event.preventDefault();
});
function updateH3PromptCheck(
  promptText: string,
  hasEndImage: boolean,
  mode?: H3PromptMode,
  hasVideoReference = false
): void {
  const element = document.querySelector<HTMLElement>("#h3-prompt-check");
  if (!element) return;
  const result = checkH3Prompt(promptText, {
    hasEndImage,
    mode,
    hasImageReference: state.draft.h3ReferenceSlots.some((slot) => slot.mediaType === "image"),
    hasVideoReference,
    durationSeconds: state.draft.duration
  });
  element.className = `h3-prompt-check ${result.valid ? "valid" : "warning"}`;
  element.innerHTML = `<div class="h3-prompt-check-heading"><strong>${uiText(uiKeys.runtime.h3PromptCheck)}</strong><span>${escapeHtml(result.summary)}</span></div>
    ${result.items.length ? `<ul>${result.items.map((item) => `<li>${escapeHtml(item.message)}</li>`).join("")}</ul>` : ""}`;
}

function rememberModalFocus(): void {
  const active = document.activeElement;
  ui.modalReturnFocus = active instanceof HTMLElement && active !== document.body
    ? active
    : null;
  ui.modalInitialFocusPending = true;
  ui.modalControlFocusSelector = "";
}

function rememberModalControlFocus(element: HTMLElement): void {
  if (element.id) {
    ui.modalControlFocusSelector = `#${element.id}`;
    return;
  }
  const upscaleHeight = element.dataset.upscaleHeight;
  if (upscaleHeight) {
    ui.modalControlFocusSelector = `[data-upscale-height="${CSS.escape(upscaleHeight)}"]`;
  }
}

function restoreModalFocus(): void {
  const target = ui.modalReturnFocus;
  ui.modalReturnFocus = null;
  window.requestAnimationFrame(() => {
    if (target?.isConnected && !target.hasAttribute("disabled")) {
      target.focus();
      return;
    }
    document.querySelector<HTMLElement>(`.nav-button[data-page="${page === "history-detail" || page === "image-history-detail" ? "history" : page}"]`)?.focus();
  });
}

function bindModalFocus(
  dialog: HTMLElement,
  close: () => void,
  initialSelector?: string
): void {
  const focusableSelector = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex=\"-1\"])";
  const focusInitial = () => {
    const storedControl = !ui.modalInitialFocusPending && ui.modalControlFocusSelector
      ? dialog.querySelector<HTMLElement>(ui.modalControlFocusSelector)
      : null;
    const initial = storedControl ?? (initialSelector
      ? dialog.querySelector<HTMLElement>(initialSelector)
      : null);
    const first = initial ?? dialog.querySelector<HTMLElement>(focusableSelector);
    (first ?? dialog).focus();
    ui.modalControlFocusSelector = "";
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
  if (ui.modalInitialFocusPending || ui.modalControlFocusSelector) {
    ui.modalInitialFocusPending = false;
    focusInitial();
  }
}

function directoryMigrationDialog(): string {
  return renderDirectoryMigrationDialog({
    request: ui.pendingDirectoryMigration,
    progress: ui.historyMigrationProgress,
    busy: ui.directoryMigrationBusy,
    t: rendererApp.context.t,
    icon,
    escapeHtml
  });
}

async function chooseDirectoryMigration(mode: SettingsSaveMode | "cancel"): Promise<void> {
  const request = ui.pendingDirectoryMigration;
  if (!request || ui.directoryMigrationBusy) return;
  if (mode === "cancel") {
    settingsDraft = {
      ...request.nextSettings,
      outputDirectory: request.previousSettings.outputDirectory
    };
    ui.pendingDirectoryMigration = null;
    ui.historyMigrationProgress = null;
    render();
    restoreModalFocus();
    showMessage(uiText(uiKeys.runtime.directoryCancelled));
    return;
  }
  ui.directoryMigrationBusy = true;
  ui.historyMigrationProgress = null;
  render();
  try {
    await saveSettingsFromUi(request.nextSettings, mode);
    const warningCount = (ui.historyMigrationProgress as HistoryMigrationProgress | null)?.warningCount ?? 0;
    ui.pendingDirectoryMigration = null;
    ui.directoryMigrationBusy = false;
    ui.historyMigrationProgress = null;
    render();
    restoreModalFocus();
    if (mode === "migrate-video-history") {
      showMessage(warningCount
        ? uiText(uiKeys.runtime.migrationCompletedWarnings, { count: warningCount })
        : uiText(uiKeys.runtime.migrationCompleted), warningCount ? { kind: "warning" } : undefined);
    }
  } catch (error) {
    ui.directoryMigrationBusy = false;
    showMessage(error instanceof Error ? error.message : String(error), { kind: "error" });
    render();
  }
}

function bindDirectoryMigrationDialog(): void {
  if (!ui.pendingDirectoryMigration) return;
  document.querySelector("#directory-apply")?.addEventListener("click", () => {
    void chooseDirectoryMigration("apply");
  });
  document.querySelector("#directory-apply-migrate")?.addEventListener("click", () => {
    void chooseDirectoryMigration("migrate-video-history");
  });
  document.querySelector("#directory-cancel")?.addEventListener("click", () => {
    void chooseDirectoryMigration("cancel");
  });
  document.querySelector("#directory-migration-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget && !ui.directoryMigrationBusy) {
      void chooseDirectoryMigration("cancel");
    }
  });
  const dialog = document.querySelector<HTMLElement>(".directory-migration-dialog");
  if (dialog) bindModalFocus(dialog, () => void chooseDirectoryMigration("cancel"), "#directory-cancel");
}

function imageAssetLibraryDialogHtml(): string {
  return renderImageAssetLibraryDialog({
    dialog: ui.imageAssetLibraryDialog,
    progress: ui.imageAssetLibraryProgress,
    icon,
    escapeHtml,
    formatAssetBytes,
    t: rendererApp.context.t
  });
}

async function scanImageAssets(): Promise<void> {
  if (!ui.imageAssetLibraryDialog || ui.imageAssetLibraryDialog.busy) return;
  ui.imageAssetLibraryDialog = { ...ui.imageAssetLibraryDialog, busy: true, error: "", confirmCleanup: false, lastResult: null };
  ui.imageAssetLibraryProgress = null;
  render();
  try {
    const scan = await window.studio.scanImageAssetLibrary();
    ui.imageAssetLibraryDialog = { scan, busy: false, error: "", confirmCleanup: false, selectedPaths: scan.orphanFiles.slice(0, 12).map((file) => file.absolutePath), lastResult: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ui.imageAssetLibraryDialog = { ...ui.imageAssetLibraryDialog, busy: false, error: message };
    showMessage(message, { kind: "error" });
  }
  render();
}

function bindImageAssetLibraryDialog(): void {
  const dialog = ui.imageAssetLibraryDialog;
  if (!dialog) return;
  const close = () => {
    if (ui.imageAssetLibraryDialog?.busy) return;
    ui.imageAssetLibraryDialog = null;
    ui.imageAssetLibraryProgress = null;
    render();
    restoreModalFocus();
  };
  document.querySelector("#image-assets-close")?.addEventListener("click", close);
  document.querySelector("#image-asset-library-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) close();
  });
  document.querySelector("#image-assets-rescan")?.addEventListener("click", () => void scanImageAssets());
  document.querySelector("#image-assets-organize")?.addEventListener("click", async () => {
    if (!ui.imageAssetLibraryDialog || ui.imageAssetLibraryDialog.busy) return;
    ui.imageAssetLibraryDialog = { ...ui.imageAssetLibraryDialog, busy: true, error: "", lastResult: null };
    ui.imageAssetLibraryProgress = null;
    render();
    try {
      const result = await window.studio.organizeImageAssetLibrary();
      ui.imageAssetLibraryDialog = { scan: result.scan, busy: false, error: "", confirmCleanup: false, selectedPaths: result.scan.orphanFiles.slice(0, 12).map((file) => file.absolutePath), lastResult: imageAssetResultSummary(result, "organize", formatAssetBytes, rendererApp.context.t) };
      showMessage(uiText(uiKeys.runtime.assetOrganized, { archived: result.archivedFiles, reorganized: result.reorganizedFiles, references: result.updatedReferences }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ui.imageAssetLibraryDialog = { ...ui.imageAssetLibraryDialog, busy: false, error: message };
      showMessage(message, { kind: "error" });
    }
    render();
  });
  document.querySelector("#image-assets-cleanup")?.addEventListener("click", async () => {
    if (!ui.imageAssetLibraryDialog || ui.imageAssetLibraryDialog.busy) return;
    if (!ui.imageAssetLibraryDialog.confirmCleanup) {
      const selectedPaths = [...document.querySelectorAll<HTMLInputElement>("[data-orphan-path]:checked")].map((item) => item.dataset.orphanPath || "").filter(Boolean);
      ui.imageAssetLibraryDialog = { ...ui.imageAssetLibraryDialog, confirmCleanup: true, selectedPaths };
      render();
      return;
    }
    const paths = [...ui.imageAssetLibraryDialog.selectedPaths];
    ui.imageAssetLibraryDialog = { ...ui.imageAssetLibraryDialog, busy: true, error: "", confirmCleanup: false, lastResult: null };
    ui.imageAssetLibraryProgress = null;
    render();
    try {
      const result = await window.studio.cleanupImageAssetLibrary(paths);
      ui.imageAssetLibraryDialog = { scan: result.scan, busy: false, error: "", confirmCleanup: false, selectedPaths: result.scan.orphanFiles.slice(0, 12).map((file) => file.absolutePath), lastResult: imageAssetResultSummary(result, "cleanup", formatAssetBytes, rendererApp.context.t) };
      showMessage(uiText(uiKeys.runtime.assetCleaned, { files: result.cleanedFiles, bytes: formatAssetBytes(result.cleanedBytes) }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ui.imageAssetLibraryDialog = { ...ui.imageAssetLibraryDialog, busy: false, error: message, confirmCleanup: false };
      showMessage(message, { kind: "error" });
    }
    render();
  });
  const element = document.querySelector<HTMLElement>(".image-asset-library-dialog");
  if (element) bindModalFocus(element, close, "#image-assets-close");
}

function upscaleDialogHtml(): string {
  return renderUpscaleDialog({
    dialog: ui.upscaleDialog,
    history: state.history,
    environment: environmentScan,
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

function promptRuntimeControlIcon(): string {
  return promptStarting || promptEnhancing || promptReleasing
    ? "refresh-cw"
    : promptRuntimeLoaded
      ? "power"
      : "play";
}

function promptRuntimeControlTitle(settings = state.settings): string {
  return promptStarting
    ? uiText(uiKeys.runtime.promptStarting)
    : promptEnhancing
    ? uiText(uiKeys.runtime.promptRunning)
    : promptReleasing
      ? uiText(uiKeys.runtime.promptReleasing)
      : promptRuntimeLoaded
      ? uiText(uiKeys.runtime.releasePrompt)
      : promptModelStatus(settings, environmentScan, uiText).detail;
}

const createPageOptions: CreatePageOptions = {
  t: (key, params, fallback) => createTranslator(state.settings.uiLocale).t(key, params, fallback),
  icon,
  escapeHtml,
  get h3ReferenceRoleLabels() {
    return h3PromptPackFor(state.settings.uiLocale).referenceRoleLabels;
  },
  get imageReferenceRoleLabels() {
    return qwenImagePromptPackFor(state.settings.uiLocale).referenceRoleLabels;
  },
  videoLoraInfoButton: (lora) => videoLoraInfoButton(lora, uiText, state.settings.uiLocale),
  videoLoraPurposeLabel: (purpose) => videoLoraPurposeLabel(purpose, uiText)
};

function createViewModelDependencies(): CreateViewModelDependencies {
  return {
    t: uiText,
    state,
    environmentScan,
    performanceMetrics,
    workflowCapabilities,
    bundledWorkflows,
    promptEnhanceMode,
    h3PromptPreset,
    promptEnhancing,
    promptStarting,
    promptReleasing,
    promptRuntimeLoaded,
    h3PromptBuilder,
    enqueueBusy: ui.enqueueBusy,
    promptRuntimeControlTitle,
    promptRuntimeControlIcon
  };
}

function imageEditPage(): string {
  return renderImageEditPage(
    buildImageEditPageViewModel(createViewModelDependencies()),
    createPageOptions
  );
}

function createPage(): string {
  if (creationMode === "image-edit") return imageEditPage();
  return renderCreatePage(
    buildVideoCreatePageViewModel(createViewModelDependencies()),
    createPageOptions
  );
}

function queuePage(): string {
  return renderQueuePage(state, {
    t: rendererApp.context.t,
    performanceMetrics,
    queueRemainingSeconds: (tasks) => calculateQueueRemainingSeconds(tasks, state.history),
    queueEstimateText: (seconds) => queueEstimateText(seconds, rendererApp.context.t),
    performanceCard,
    renderTaskCard: queueTaskCard,
    icon
  });
}

function queueTaskCard(task: QueueTask, queuePosition: number): string {
  return renderQueueTaskCard(task, queuePosition, {
    t: rendererApp.context.t,
    taskPreviews,
    queueRunning: state.queueRunning,
    queueActionBusy,
    icon,
    escapeHtml,
    modelName: (id) => modelName(id, state.settings.uiLocale),
    frameRateSummary,
    queueStageElapsedText: (queueTask) => queueStageElapsedText(queueTask, rendererApp.context.t),
    queueTaskRemainingSeconds: (queueTask) => calculateQueueTaskRemainingSeconds(queueTask, state.history),
    queueEstimateText: (seconds) => queueEstimateText(seconds, rendererApp.context.t),
    elapsedText: (startedAt) => elapsedText(startedAt, rendererApp.context.t)
  });
}

function draftFromQueueTask(task: QueueTask): Draft | null {
  if (task.taskType === "upscale" || task.taskType === "image-generation" || task.status === "running") return null;
  const now = new Date().toISOString();
  const resolution = [480, 540, 720, 768].includes(task.resolution)
    ? task.resolution as Draft["resolution"]
    : 480;
  const extension = task.taskType === "extension";
  return {
    ...state.draft,
    inputMode: extension ? "video" : "image",
    startImagePath: extension ? "" : task.startImagePath,
    sourceWidth: task.sourceWidth,
    sourceHeight: task.sourceHeight,
    endImagePath: extension ? "" : task.endImagePath,
    sourceVideoPath: extension ? task.sourceVideoPath : "",
    sourceVideoDuration: extension ? task.sourceVideoDuration : 0,
    trimStartSeconds: extension ? task.trimStartSeconds : 0,
    trimEndSeconds: extension ? task.trimEndSeconds : 0,
    sourceAssetId: extension ? task.sourceAssetId : undefined,
    sourceVersionId: extension ? task.sourceVersionId : undefined,
    ...(extension
      ? {
          extensionPromptVersions: [{
            id: crypto.randomUUID(),
            label: uiText(uiKeys.runtime.fromQueue),
            text: task.prompt,
            createdAt: now
          }],
          extensionActivePromptVersion: 0
        }
      : {
          promptVersions: [{
            id: crypto.randomUUID(),
            label: uiText(uiKeys.runtime.fromQueue),
            text: task.prompt,
            createdAt: now
          }],
          activePromptVersion: 0
        }),
    h3ReferenceSlots: extension ? [] : (task.h3ReferenceSlots ?? []).map((slot) => ({ ...slot })),
    modelId: task.modelId,
    videoLoras: task.videoLoras?.map((lora) => ({ ...lora })) ?? [],
    workflowPath: task.workflowPath,
    ratio: task.ratio,
    resolution,
    duration: task.duration,
    steps: normalizeH3Steps(task.steps, task.modelId, task.videoLoras),
    fps: task.fps,
    frameInterpolation: task.frameInterpolation,
    motion: task.motion,
    seed: task.seed,
    keepSeedOnCopy: task.keepSeedOnCopy
  };
}

async function editQueueTask(taskId: string): Promise<void> {
  const task = state.queue.find((item) => item.id === taskId);
  if (!task || task.status === "running") return;
  queueActionBusy = { taskId, action: "edit" };
  render();
  try {
    if (task.taskType === "image-generation") {
      const imageDraft = imageEditDraftFromQueueTask(task, state.imageDraft);
      setRendererState(await window.studio.saveImageDraft(imageDraft));
      setRendererState(await window.studio.removeTask(taskId));
      queueActionBusy = null;
      navigateToCreationMode("image-edit");
      showMessage(uiText(uiKeys.runtime.queueImageReturned));
      return;
    }
    const draft = draftFromQueueTask(task);
    if (!draft) return;
    await saveDraftImmediately(draft);
    setRendererState(await window.studio.removeTask(taskId));
    queueActionBusy = null;
    navigateToCreationMode(draft.inputMode === "video" ? "video-extension" : "image-to-video");
    showMessage(uiText(uiKeys.runtime.queueReturned));
  } catch (error) {
    queueActionBusy = null;
    showMessage(error instanceof Error ? error.message : uiText(uiKeys.runtime.cannotEditQueue), { kind: "error" });
  }
}

function createHistoryPageViewModel(): HistoryPageViewModel {
  return {
    state,
    historyKind,
    historyLayout: historyLayoutController.getLayout(),
    selectedHistoryAssetId: ui.selectedHistoryAssetId,
    selectedHistoryVersionId: ui.selectedHistoryVersionId
  };
}

const historyPageOptions: HistoryPageOptions = {
  t: (key, params, fallback) => createTranslator(state.settings.uiLocale).t(key, params, fallback),
  icon,
  escapeHtml,
  formatBytes,
  videoLoraPurposeLabel: (purpose) => videoLoraPurposeLabel(purpose, uiText),
  h3ReferenceRoleLabel: (role) => h3PromptPackFor(state.settings.uiLocale).referenceRoleLabels[role],
  imageReferenceRoleLabel: (role) => qwenImagePromptPackFor(state.settings.uiLocale).referenceRoleLabels[role],
  modelName: (id) => modelName(id, state.settings.uiLocale),
  formatFullHistoryTime,
  formatVideoDuration,
  formatElapsedDuration: (seconds) => formatElapsedDuration(seconds, uiText),
  historyAssetsByNewest,
  imageProjectsByNewest,
  preferredVersion,
  currentHistoryVersion,
  historyMediaUrl,
  historyCoverCacheKey,
  historyCoverSeed,
  historyInitialCoverTime,
  historyResolutionLabel: (asset, version) => historyResolutionLabel(asset, version, uiText),
  historyRenderDuration: (version) => historyRenderDuration(version, uiText),
  versionVideoIndex,
  versionShortEdge,
  preferredImageVersion,
  currentImageHistoryVersion,
  imageHistoryMediaUrl,
  imageHistoryThumbnailCacheKey,
  imageProjectCoverVersion,
  isRetiredVideoModel,
  imageHistoryGenerationSummary: (version) => imageHistoryGenerationSummary(version, uiText)
};

function imageHistoryPage(): string {
  return renderImageHistoryPage(createHistoryPageViewModel(), historyPageOptions);
}

function historyPage(): string {
  if (historyKind === "image") return imageHistoryPage();
  return renderHistoryPage(createHistoryPageViewModel(), historyPageOptions);
}

function bindHistoryMasonry(): void {
  historyLayoutController.bindMasonry();
}

function bindHistoryAlbum(): void {
  historyLayoutController.bindAlbum();
}

function bindImageHistoryViewer(): void {
  historyLayoutController.bindImageHistoryViewer();
}

function switchHistoryLayout(nextLayout: "masonry" | "album"): void {
  historyLayoutController.switchLayout(nextLayout);
}

function bindHistoryTitleMarquees(): void {
  historyLayoutController.bindTitleMarquees();
}

function historyDetailPage(): string {
  const asset = state.history.find((item) => item.id === ui.selectedHistoryAssetId);
  if (!asset) {
    setPage("history");
    return historyPage();
  }
  const version = currentHistoryVersion(asset, ui.selectedHistoryVersionId);
  ui.selectedHistoryVersionId = version.id;
  return renderHistoryDetailPage(createHistoryPageViewModel(), historyPageOptions);
}

function imageHistoryDetailPage(): string {
  const project = state.imageHistory.find((item) => item.id === ui.selectedHistoryAssetId);
  if (!project) {
    setHistoryKind("image");
    setPage("history");
    return historyPage();
  }
  const version = currentImageHistoryVersion(project, ui.selectedHistoryVersionId);
  ui.selectedHistoryVersionId = version.id;
  return renderImageHistoryDetailPage(createHistoryPageViewModel(), historyPageOptions);
}

function enableSpectrumByDefaultIfAvailable(): void {
  const spectrumNode = environmentScan?.customNodes.find(
    (node) => node.id === "spectrum-minimax-h3"
  );
  const draft = state?.draft;
  if (
    !draft ||
    draft.spectrumModeUserSet ||
    draft.spectrumMode === "balanced" ||
    !spectrumNode?.installed ||
    !spectrumNode.loaded ||
    (isH3TurboEnabled(draft) && !releaseVersionAtLeast(
      spectrumNode.version,
      SPECTRUM_TURBO_MINIMUM_VERSION
    )) ||
    !resolveVideoGenerationPolicy({
      modelId: draft.modelId,
      inputMode: draft.inputMode,
      spectrumMode: draft.spectrumMode,
      videoLoras: draft.videoLoras
    }).spectrum.allowed
  ) return;
  patchDraft({ spectrumMode: "balanced" });
}


function settingsHaveUnsavedChanges(): boolean {
  return settingsDraft !== null &&
    !structurallyEqual(settingsDraft, state.settings);
}

function syncSettingsDirtyUi(): void {
  const dirty = settingsHaveUnsavedChanges();
  const setSettingsDirty = window.studio.setSettingsDirty;
  if (setSettingsDirty) void setSettingsDirty(dirty).catch(() => undefined);
  const status = document.querySelector<HTMLElement>(".settings-heading-actions .save-state");
  status?.classList.toggle("dirty", dirty);
  if (status) status.textContent = dirty ? uiText(uiKeys.runtime.unsavedChanges) : uiText(uiKeys.runtime.saved);
  document.querySelector<HTMLButtonElement>("#discard-settings")?.toggleAttribute("disabled", !dirty);
  document.querySelector<HTMLButtonElement>("#save-settings")?.toggleAttribute("disabled", !dirty);
}

function settingsPage(): string {
  return renderSettingsPage(
    buildSettingsPageViewModel({
      state,
      settingsDraft,
      environmentScan,
      environmentScanning,
      environmentScanError,
      settingsTab,
      settingsH3PromptPreset,
      settingsImagePromptPreset,
      promptRuntimeLoaded,
      promptStarting,
      promptEnhancing,
      promptReleasing,
      serviceStarting,
      serviceRestarting,
      serviceForceStopping,
      serviceStatusMessage,
      comfyUpdating,
      comfyUpdateLog,
      environmentRepairing,
      environmentRepairLogs,
      workflowDependencyInstalling,
      workflowDependencyLogs,
      customNodeInstalling,
      customNodeInstallQueue,
      customNodeInstallBatch,
      customNodeInstallPhase,
      customNodeLogs,
      coreDependencyRepairing,
      attentionAccelerationInstalling,
      attentionAccelerationLog,
      selectedInstallGuide,
      appLogs,
      appLogsLoading,
      appLogsError,
      settingsHaveUnsavedChanges,
      promptRuntimeControlIcon,
      promptRuntimeControlTitle
    } satisfies SettingsViewModelDependencies),
    {
      t: rendererApp.context.t,
      defaultH3PromptPresets: h3PromptPackFor(state.settings.uiLocale).defaultPresets,
      defaultImagePromptPresets: qwenImagePromptPackFor(state.settings.uiLocale).defaultPresets,
      h3PromptPresetDescriptions: h3PromptPackFor(state.settings.uiLocale).presetDescriptions,
      imagePromptPresetLabels: qwenImagePromptPackFor(state.settings.uiLocale).presetLabels,
      imagePromptPresetDescriptions: qwenImagePromptPackFor(state.settings.uiLocale).presetDescriptions,
      icon,
      escapeHtml,
      formatBytes,
      formatScanTime: (scannedAt) => new Date(scannedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
      orderVideoProfiles,
      getImageQualityProfiles: (modelId) => imageModelCapabilityFor(modelId).qualityProfiles,
      isGemmaPromptModel,
      isComfyMultimodalPromptModel,
      videoLoraInfoButton: (profileId) => {
        const lora = BUILTIN_VIDEO_LORAS.find((item) => item.id === profileId);
        return lora ? videoLoraInfoButton(lora, uiText, state.settings.uiLocale) : "";
      },
      isImageWorkflowReady,
      isImageModelSelectable,
      imageWorkflowStatus,
      h3PromptPresetOptions: (selected, includeMultiReference) => h3PromptPresetOptions(selected, includeMultiReference, state.settings.uiLocale),
      renderAppLogTerminal: (text) => appLogTerminalHtml(visibleAppLogText(text, appLogScreenClearedAt), uiText(uiKeys.settings.logsEmpty))
    }
  );
}

function render(): void {
  rendererApp.render();
}

let renderCoordinator: RenderCoordinator;
const rendererApp = createRendererApp({
  root: appElement,
  studio: window.studio,
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
  t: rendererApp.context.t,
  renderPages: {
    create: createPage,
    queue: queuePage,
    history: historyPage,
    historyDetail: historyDetailPage,
    imageHistoryDetail: imageHistoryDetailPage,
    settings: settingsPage
  },
  beforeRenderHistory: historyLayoutController.beforeRender,
  closeAppLogContextMenu: appLogContextMenu.close,
  ensurePromptPacks: loadPromptPacks,
  bindShell,
  bindUpscaleDialog,
  bindCreate,
  bindQueue: () => {
    bindQueue();
    void loadQueueInputPreviewsForPage(rendererApp.context);
  },
  bindHistory,
  bindSettings,
  bindHistoryViewportControls: historyLayoutController.bindViewportControls,
  restoreHistoryScrollPosition: historyLayoutController.restoreScrollPosition,
  syncAppLogPolling,
  renderConfirmationDialog: () => renderConfirmationDialog({
    request: ui.pendingConfirmation,
    confirmationBusy: ui.confirmationBusy,
    imageHistoryIds: new Set(state.imageHistory.map((item) => item.id)),
    t: rendererApp.context.t,
    icon,
    escapeHtml
  }),
  renderDirectoryMigrationDialog: directoryMigrationDialog,
  renderImageAssetLibraryDialog: imageAssetLibraryDialogHtml,
  renderWindowCloseDialog: () => renderWindowCloseDialog({
    request: ui.pendingWindowCloseRequest,
    responseBusy: ui.windowCloseResponseBusy,
    t: rendererApp.context.t,
    icon,
    escapeHtml
  }),
  renderUpscaleDialog: upscaleDialogHtml,
  icon,
  escapeHtml
  });
}

const historyMediaRuntime = createHistoryMediaRuntime(
  rendererApp.context,
  () => page === "history"
);
const historyLayoutController = createHistoryLayoutController(rendererApp.context, reportUserAction);
const historyActions = createHistoryActions({
  context: rendererApp.context,
  setState: setRendererState,
  getSelectedHistoryAssetId: () => ui.selectedHistoryAssetId,
  getSelectedHistoryVersionId: () => ui.selectedHistoryVersionId,
  setSelectedHistoryAssetId: (assetId) => {
    ui.selectedHistoryAssetId = assetId;
  },
  setDialog: (dialog) => {
    ui.upscaleDialog = dialog;
  },
  rememberModalFocus,
  saveDraftImmediately,
  selectDraftVideo,
  navigateToCreationMode,
  requestHistoryDeletion,
  reportUserAction
});
const historyContextMenus = createHistoryContextMenus(rendererApp.context, {
  getState: () => state,
  openHistoryDetail,
  editHistoryAsset: historyActions.editHistoryAsset,
  openImageHistoryDetail,
  continueImageEdit: historyActions.continueImageEdit,
  continueImageToVideo: historyActions.continueImageToVideo,
  copyHistoryFile: historyActions.copyHistoryFile,
  copyHistoryText: historyActions.copyHistoryText,
  requestHistoryDeletion
});
const appLogContextMenu = createAppLogContextMenu(rendererApp.context, clearAppLogScreen);
const customNodeInstallManager = new CustomNodeInstallQueue({
  install: (nodeId, settings) => window.studio.installCustomNode(nodeId, settings),
  restart: (settings) => window.studio.restartLocalService("comfy", settings),
  scan: (settings) => window.studio.scanEnvironment(settings),
  nodeName: (nodeId) => environmentScan?.customNodes.find((node) => node.id === nodeId)?.name ?? nodeId,
  getLog: (nodeId) => customNodeLogs[nodeId] ?? "",
  setLog: (nodeId, log) => {
    customNodeLogs = { ...customNodeLogs, [nodeId]: log };
  },
  setEnvironmentScan: (scan) => {
    environmentScan = scan;
  },
  notify: (message, kind) => showMessage(message, { kind }),
  onSnapshot: (snapshot) => {
    customNodeInstalling = snapshot.activeNodeId;
    customNodeInstallQueue = snapshot.queuedNodeIds;
    customNodeInstallBatch = snapshot.batchNodeIds;
    customNodeInstallPhase = snapshot.phase;
    if (page !== "settings") return;
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement ||
      activeElement instanceof HTMLSelectElement) return;
    render();
  },
  messages: {
    queued: (name, position) => uiText(uiKeys.settings.actions.nodeQueued, { name, position }),
    get processing() {
      return uiText(uiKeys.settings.actions.nodeProcessing);
    },
    restartLog: (message) => uiText(uiKeys.settings.actions.comfyRestartLog, { message }),
    installFailed: (name, message) => uiText(uiKeys.settings.actions.nodeInstallFailed, {
      message: `${name}: ${message}`
    }),
    restartFailed: (message) => uiText(uiKeys.settings.actions.nodeRestartFailed, { message }),
    readyCheckFailed: (name) => uiText(
      uiKeys.settings.actions.nodeBatchReadyCheckFailed,
      { name }
    ),
    completed: (success, failed) => uiText(
      uiKeys.settings.actions.nodeBatchCompleted,
      { success, failed }
    )
  }
});
initializeRenderCoordinator();
const queueLiveStatus = createQueueLiveStatus({
  studio: window.studio,
  t: rendererApp.context.t,
  getState: () => state,
  getPage: () => page,
  setPerformanceMetrics: (metrics) => {
    performanceMetrics = metrics;
  }
});
queueLiveStatus.start();

function syncFlashMessage(): void {
  const flash = document.querySelector<HTMLElement>("#app-flash");
  if (!flash) return;
  flash.textContent = ui.flashMessage;
  const kind = ui.flashNotification?.kind ?? "info";
  flash.dataset.kind = kind;
  flash.className = `flash flash-${kind}${ui.flashMessage ? " visible" : ""}`;
  flash.setAttribute("role", kind === "error" ? "alert" : "status");
  flash.setAttribute("aria-live", kind === "error" ? "assertive" : "polite");
  flash.classList.toggle("visible", Boolean(ui.flashMessage));
}

function displayNextNotification(): void {
  const next = ui.flashNotificationQueue.shift() ?? null;
  ui.flashNotification = next;
  ui.flashMessage = next?.message ?? "";
  window.clearTimeout(ui.flashMessageTimer);
  syncFlashMessage();
  if (!next) return;
  ui.flashMessageTimer = window.setTimeout(() => {
    if (ui.flashNotification?.id !== next.id) return;
    displayNextNotification();
  }, next.durationMs);
}

function showMessage(
  message: string,
  legacyOrOptions?: boolean | RendererNotifyOptions
): void {
  const options = typeof legacyOrOptions === "object" ? legacyOrOptions : undefined;
  const kind = options?.kind ?? "info";
  const notification = {
    id: ui.nextFlashNotificationId++,
    message,
    kind,
    durationMs: options?.durationMs ?? notificationDuration[kind]
  };
  void window.studio.reportNotification(kind, message).catch(() => undefined);
  if (kind === "task-complete" || kind === "queue-complete") {
    ui.flashNotificationQueue.push(notification);
    if (!ui.flashNotification) displayNextNotification();
    return;
  }
  ui.flashNotificationQueue = [];
  ui.flashNotification = notification;
  ui.flashMessage = message;
  window.clearTimeout(ui.flashMessageTimer);
  syncFlashMessage();
  ui.flashMessageTimer = window.setTimeout(() => {
    if (ui.flashNotification?.id !== notification.id) return;
    displayNextNotification();
  }, notification.durationMs);
}

function reportUserAction(action: string, meta?: Record<string, unknown>): void {
  void window.studio.reportUserAction(action, meta).catch(() => undefined);
}

function clearAppLogScreen(): void {
  if (appLogsLoading) return;
  appLogScreenClearedAt = Date.now();
  appLogFollowTail = true;
  reportUserAction("clear-log-screen");
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
    render();
    return;
  }
  const shouldFollowTail = appLogFollowTail ||
    terminal.scrollHeight - terminal.scrollTop - terminal.clientHeight < 48;
  terminal.innerHTML = appLogTerminalHtml(visibleAppLogText(snapshot.text, appLogScreenClearedAt), uiText(uiKeys.settings.logsEmpty));
  if (shouldFollowTail) terminal.scrollTop = terminal.scrollHeight;
  const count = document.querySelector<HTMLElement>("#app-log-count");
  if (count) count.textContent = String(snapshot.records.length);
}

async function pollAppLogs(): Promise<void> {
  if (
    appLogPollingInFlight ||
    appLogsLoading ||
    page !== "settings" ||
    settingsTab !== "logs"
  ) return;
  appLogPollingInFlight = true;
  try {
    const snapshot = await window.studio.readAppLogs(500);
    if (snapshot.text !== appLogs?.text) applyAppLogSnapshot(snapshot);
  } catch {
    // The panel keeps the last readable log while the main process is busy.
  } finally {
    appLogPollingInFlight = false;
  }
}

function syncAppLogPolling(): void {
  const shouldPoll = page === "settings" && settingsTab === "logs";
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

async function releasePromptModelFromUi(): Promise<void> {
  if (promptReleasing) return;
  reportUserAction("release-prompt-service");
  promptReleasing = true;
  render();
  try {
    const result = await window.studio.releasePromptModel();
    if (result.ok) promptRuntimeLoaded = false;
    showMessage(result.message);
  } catch (error) {
    showMessage(error instanceof Error ? error.message : String(error), { kind: "error" });
  } finally {
    promptReleasing = false;
    render();
  }
}

async function startPromptModelFromUi(): Promise<void> {
  if (promptStarting) return;
  reportUserAction("start-prompt-service");
  promptStarting = true;
  render();
  try {
    const result = await window.studio.startPromptModel();
    if (!result.ok) throw new Error(result.message);
    promptRuntimeLoaded = true;
    showMessage(result.message);
  } catch (error) {
    showMessage(error instanceof Error ? error.message : String(error), { kind: "error" });
  } finally {
    promptStarting = false;
    render();
  }
}

async function togglePromptModelFromUi(): Promise<void> {
  if (promptRuntimeLoaded) {
    await releasePromptModelFromUi();
  } else {
    await startPromptModelFromUi();
  }
}

function requestHistoryDeletion(assetId: string): void {
  const asset = state.history.find((item) => item.id === assetId);
  const project = state.imageHistory.find((item) => item.id === assetId);
  const title = asset?.title ?? project?.title;
  if (!title) return;
  rememberModalFocus();
  ui.pendingConfirmation = {
    kind: "delete-history",
    assetId,
    title
  };
  ui.confirmationBusy = false;
  render();
}

function requestImageVersionDeletion(projectId: string, versionId: string): void {
  const project = state.imageHistory.find((item) => item.id === projectId);
  const version = project?.versions.find((item) => item.id === versionId);
  if (!project || !version || version.kind === "source") return;
  rememberModalFocus();
  ui.pendingConfirmation = {
    kind: "delete-image-version",
    projectId,
    versionId,
    title: uiText(uiKeys.runtime.historyVersionTitle, { title: project.title, version: version.versionNumber })
  };
  ui.confirmationBusy = false;
  render();
}

function requestQueueTaskConfirmation(
  taskId: string,
  action: "remove" | "cancel"
): void {
  const task = state.queue.find((item) => item.id === taskId);
  if (!task) return;
  rememberModalFocus();
  ui.pendingConfirmation = {
    kind: action === "remove" ? "remove-queue-task" : "cancel-queue-task",
    taskId,
    title: task.outputFilename
  };
  ui.confirmationBusy = false;
  render();
}

function historyPlayerIsFullscreen(): boolean {
  return Boolean(document.fullscreenElement?.closest(".history-player"));
}

function restoreHistoryPlayerFullscreen(): void {
  const target = document.querySelector<HTMLVideoElement>(".history-player video") ??
    document.querySelector<HTMLElement>(".history-player");
  if (!target?.requestFullscreen) return;
  void target.requestFullscreen().catch(() => undefined);
}

function updateHistoryDetailInPlace(): boolean {
  const currentPlayer = document.querySelector<HTMLElement>(".history-player");
  const currentVideo = currentPlayer?.querySelector<HTMLVideoElement>("video");
  if (!currentPlayer || !currentVideo) return false;

  const nextMarkup = document.createElement("div");
  nextMarkup.innerHTML = historyDetailPage();
  const nextPlayer = nextMarkup.querySelector<HTMLElement>(".history-player");
  const nextVideo = nextPlayer?.querySelector<HTMLVideoElement>("video");
  const currentBack = document.querySelector<HTMLElement>(".history-detail-back");
  const nextBack = nextMarkup.querySelector<HTMLElement>(".history-detail-back");
  const currentSidebar = document.querySelector<HTMLElement>(".history-detail-sidebar");
  const nextSidebar = nextMarkup.querySelector<HTMLElement>(".history-detail-sidebar");
  if (!nextPlayer || !nextVideo || !currentBack || !nextBack || !currentSidebar || !nextSidebar) {
    return false;
  }

  currentPlayer.setAttribute("style", nextPlayer.getAttribute("style") ?? "");
  currentVideo.pause();
  const nextSource = nextVideo.getAttribute("src");
  if (nextSource) currentVideo.setAttribute("src", nextSource);
  else currentVideo.removeAttribute("src");
  currentVideo.dataset.historyAsset = nextVideo.dataset.historyAsset ?? "";
  currentVideo.dataset.historyVersion = nextVideo.dataset.historyVersion ?? "";
  currentVideo.loop = true;
  currentVideo.load();
  currentBack.replaceWith(nextBack);
  currentSidebar.replaceWith(nextSidebar);
  renderIcons(appElement);
  bindShell();
  bindHistory();
  return true;
}

function openHistoryDetail(assetId: string, versionId?: string): void {
  const preserveFullscreen = page === "history-detail" && historyPlayerIsFullscreen();
  if (page === "history") historyLayoutController.captureScrollPosition();
  reportUserAction("history-open-detail", { assetId, versionId });
  setHistoryKind("video");
  ui.selectedHistoryAssetId = assetId;
  const asset = state.history.find((item) => item.id === assetId);
  ui.selectedHistoryVersionId = asset?.versions.find((item) => item.id === versionId)?.id ??
    (asset ? preferredVersion(asset).id : "");
  ui.historyForwardTarget = asset
    ? { assetId, versionId: ui.selectedHistoryVersionId }
    : null;
  setPage("history-detail");
  if (preserveFullscreen && updateHistoryDetailInPlace()) {
    window.scrollTo({ top: 0, behavior: "auto" });
    return;
  }
  render();
  if (preserveFullscreen) restoreHistoryPlayerFullscreen();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function openImageHistoryDetail(projectId: string, versionId?: string): void {
  const project = state.imageHistory.find((item) => item.id === projectId);
  if (!project) return;
  reportUserAction("image-history-open-detail", { projectId, versionId });
  setHistoryKind("image");
  ui.selectedHistoryAssetId = projectId;
  ui.selectedHistoryVersionId = project.versions.find((item) => item.id === versionId)?.id ??
    preferredImageVersion(project).id;
  ui.historyForwardTarget = { assetId: projectId, versionId: ui.selectedHistoryVersionId };
  setPage("image-history-detail");
  render();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function returnToHistory(): void {
  if (page !== "history-detail" && page !== "image-history-detail") return;
  historyLayoutController.setScrollRestorePending(true);
  setPage("history");
  render();
}

function navigateToCreationMode(mode: CreationMode): void {
  setCreationMode(mode);
  setPage("create");
  ui.historyForwardTarget = null;
  render();
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  });
}

function returnToLastHistoryDetail(): void {
  if (page !== "history" || !ui.historyForwardTarget) return;
  const target = ui.historyForwardTarget;
  if (historyKind === "image") {
    const project = state.imageHistory.find((item) => item.id === target.assetId);
    if (!project) {
      ui.historyForwardTarget = null;
      return;
    }
    openImageHistoryDetail(target.assetId, target.versionId);
    return;
  }
  const asset = state.history.find((item) => item.id === target.assetId);
  if (!asset) {
    ui.historyForwardTarget = null;
    return;
  }
  openHistoryDetail(target.assetId, target.versionId);
}

function navigateHistoryDetail(direction: -1 | 1): void {
  if (page !== "history-detail") return;
  const orderedHistory = historyAssetsByNewest(state.history);
  const currentIndex = orderedHistory.findIndex(
    (item) => item.id === ui.selectedHistoryAssetId
  );
  const nextAsset = orderedHistory[currentIndex + direction];
  if (!nextAsset) return;
  openHistoryDetail(nextAsset.id);
}

function navigateImageHistoryDetail(direction: -1 | 1): void {
  if (page !== "image-history-detail") return;
  const orderedProjects = imageProjectsByNewest(state.imageHistory);
  const currentIndex = orderedProjects.findIndex((item) => item.id === ui.selectedHistoryAssetId);
  const nextProject = orderedProjects[currentIndex + direction];
  if (!nextProject) return;
  openImageHistoryDetail(nextProject.id);
}

function navigateImageHistoryVersion(direction: -1 | 1): void {
  if (page !== "image-history-detail") return;
  const project = state.imageHistory.find((item) => item.id === ui.selectedHistoryAssetId);
  if (!project) return;
  const currentIndex = project.versions.findIndex((item) => item.id === ui.selectedHistoryVersionId);
  if (currentIndex < 0) return;
  const nextVersion = project.versions[currentIndex - direction];
  if (!nextVersion) return;
  ui.selectedHistoryVersionId = nextVersion.id;
  ui.historyForwardTarget = { assetId: project.id, versionId: nextVersion.id };
  reportUserAction("image-history-version-navigation", {
    projectId: project.id,
    versionId: nextVersion.id,
    direction
  });
  render();
  window.requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(`[data-image-version-id="${CSS.escape(nextVersion.id)}"]`)?.scrollIntoView({
      block: "nearest",
      inline: "nearest"
    });
  });
}

function releaseHistoryVideo(assetId: string): void {
  const cards = [...document.querySelectorAll<HTMLElement>("[data-history]")];
  const card = cards.find((item) => item.dataset.history === assetId);
  const videos =
    page === "history-detail" && ui.selectedHistoryAssetId === assetId
      ? document.querySelectorAll<HTMLVideoElement>(".history-player video")
      : card?.querySelectorAll<HTMLVideoElement>("video") ?? [];
  videos.forEach((video) => {
    video.pause();
    video.removeAttribute("src");
    video.load();
  });
}

async function acceptConfirmation(): Promise<void> {
  await runConfirmation(rendererApp.context, {
    getRequest: () => ui.pendingConfirmation,
    setRequest: (request) => {
      ui.pendingConfirmation = request;
    },
    setBusy: (value) => {
      ui.confirmationBusy = value;
    },
    isBusy: () => ui.confirmationBusy,
    getState: () => state,
    setState: setRendererState,
    getFormSettings: formSettings,
    clearDraftSaveTimer: () => {
      window.clearTimeout(draftSaveTimer);
    },
    setDraftDirty: (value) => {
      draftDirty = value;
    },
    bumpDraftRevision: () => {
      draftRevision += 1;
    },
    setServiceForceStopping: (value) => {
      serviceForceStopping = value;
    },
    setServiceStatusMessage: (message) => {
      serviceStatusMessage = message;
    },
    scanEnvironment: runEnvironmentScan,
    setSettingsDraft: (settings) => {
      settingsDraft = settings;
    },
    setPage,
    setHistoryKind,
    setSelectedHistoryAssetId: (assetId) => {
      ui.selectedHistoryAssetId = assetId;
    },
    setSelectedHistoryVersionId: (versionId) => {
      ui.selectedHistoryVersionId = versionId;
    },
    clearImageHistoryThumbnailCache: () => {
      historyMediaRuntime.clearImageHistoryThumbnailCache();
    },
    setQueueActionBusy: (value) => {
      queueActionBusy = value;
    },
    releaseHistoryVideo,
    rememberModalFocus,
    restoreModalFocus,
    render,
    notify: (message) => showMessage(message),
    getPage: () => page
  });
}

function bindConfirmationDialog(): void {
  if (!ui.pendingConfirmation) return;
  const close = () => {
    if (ui.confirmationBusy) return;
    ui.pendingConfirmation = null;
    render();
    restoreModalFocus();
  };
  document.querySelector("#cancel-confirmation")?.addEventListener("click", close);
  document.querySelector("#accept-confirmation")?.addEventListener("click", () => {
    void acceptConfirmation();
  });
  document.querySelector("#confirm-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) close();
  });
  const dialog = document.querySelector<HTMLElement>(".confirm-dialog");
  if (dialog) bindModalFocus(dialog, close, "#cancel-confirmation");
}

function bindWindowCloseDialog(): void {
  if (!ui.pendingWindowCloseRequest) return;
  const respond = async (response: "cancel" | "discard-settings" | "finish-tasks" | "force-exit") => {
    if (ui.windowCloseResponseBusy) return;
    if (document.activeElement instanceof HTMLElement) {
      rememberModalControlFocus(document.activeElement);
    }
    ui.windowCloseResponseBusy = true;
    render();
    try {
      await window.studio.respondWindowClose(response);
      if (response === "cancel") {
        ui.pendingWindowCloseRequest = null;
        ui.windowCloseResponseBusy = false;
        render();
        restoreModalFocus();
      }
    } catch (error) {
      ui.windowCloseResponseBusy = false;
      showMessage(error instanceof Error ? error.message : uiText(uiKeys.runtime.exitRequestFailed), { kind: "error" });
    }
  };
  const cancel = () => void respond("cancel");
  document.querySelector("#cancel-window-close")?.addEventListener("click", cancel);
  document.querySelector("#window-close-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) cancel();
  });
  document.querySelector("#discard-window-close")?.addEventListener("click", () => {
    void respond("discard-settings");
  });
  document.querySelector("#finish-window-close")?.addEventListener("click", () => {
    void respond("finish-tasks");
  });
  document.querySelector("#force-window-close")?.addEventListener("click", () => {
    void respond("force-exit");
  });
  const dialog = document.querySelector<HTMLElement>(".close-dialog");
  if (dialog) bindModalFocus(dialog, cancel, "#cancel-window-close");
}

function bindShell(): void {
  rendererApp.addPageCleanup(mountShellController({
    getPage: () => page,
    settingsHaveUnsavedChanges,
    rememberModalFocus,
    requestDiscardSettings: (nextPage) => {
      ui.pendingConfirmation = { kind: "discard-settings", nextPage };
      ui.confirmationBusy = false;
      render();
    },
    returnToHistory,
    returnToLastHistoryDetail,
    navigateHistoryDetail,
    navigateImageHistoryDetail,
    setHistoryScrollPosition: () => historyLayoutController.captureScrollPosition(),
    setHistoryScrollRestorePending: historyLayoutController.setScrollRestorePending,
    clearHistoryForwardTarget: () => {
      ui.historyForwardTarget = null;
    },
    setPage,
    reportUserAction,
    render,
    bindConfirmationDialog,
    bindDirectoryMigrationDialog,
    bindImageAssetLibraryDialog,
    bindWindowCloseDialog
  }));
}

function scheduleDraftSave(): void {
  window.clearTimeout(draftSaveTimer);
  draftSaveTimer = window.setTimeout(async () => {
    const revision = draftRevision;
    const draftToSave = state.draft;
    draftSaveInFlight += 1;
    try {
      const savedState = await window.studio.saveDraft(draftToSave);
      const localDraft = state.draft;
      setRendererState({ ...savedState, draft: localDraft });
      if (revision === draftRevision) draftDirty = false;
    } finally {
      draftSaveInFlight -= 1;
    }
  }, 350);
}

function scheduleImageDraftSave(): void {
  window.clearTimeout(imageDraftSaveTimer);
  imageDraftSaveTimer = window.setTimeout(async () => {
    const revision = imageDraftRevision;
    const draftToSave = state.imageDraft;
    try {
      const savedState = await window.studio.saveImageDraft(draftToSave);
      if (revision === imageDraftRevision) {
        setRendererState({ ...savedState, imageDraft: draftToSave });
      }
    } catch (error) {
      showMessage(error instanceof Error ? error.message : uiText(uiKeys.runtime.imageDraftSaveFailed), { kind: "error" });
    }
  }, 350);
}

async function saveDraftImmediately(draft: Draft): Promise<void> {
  window.clearTimeout(draftSaveTimer);
  draftRevision += 1;
  draftDirty = false;
  setRendererState(await window.studio.saveDraft(draft));
}

function patchDraft(patch: Partial<Draft>): void {
  state.draft = { ...state.draft, ...patch };
  draftRevision += 1;
  draftDirty = true;
  scheduleDraftSave();
}

function patchImageDraft(patch: Partial<ImageEditDraft>): void {
  state.imageDraft = normalizeImageEditDraft({ ...state.imageDraft, ...patch });
  imageDraftRevision += 1;
  scheduleImageDraftSave();
}

async function loadImageEditPreviews(): Promise<void> {
  const pictures = state.imageDraft.pictures;
  let dimensionsChanged = false;
  await Promise.all(pictures.map(async (picture) => {
    const image = document.querySelector<HTMLImageElement>(
      `[data-image-picture-preview="${CSS.escape(picture.id)}"]`
    );
    if (!image || !picture.absolutePath) return;
    const previewPath = state.imageDraft.modelId === "lama-inpaint"
      ? picture.absolutePath
      : picture.markup?.renderedPath || picture.absolutePath;
    const dataUrl = await window.studio.readImage(previewPath).catch(() => null);
    if (!dataUrl || !image.isConnected) return;
    await new Promise<void>((resolve) => {
      image.addEventListener("load", () => {
        if (image.naturalWidth && image.naturalHeight) {
    const preview = image.closest<HTMLButtonElement>(".image-picture-preview");
    preview?.style.setProperty("--picture-ratio", `${image.naturalWidth} / ${image.naturalHeight}`);
          const current = state.imageDraft.pictures.find((item) => item.id === picture.id);
          if (current && (current.width !== image.naturalWidth || current.height !== image.naturalHeight)) {
            const nextPictures = state.imageDraft.pictures.map((item) =>
              item.id === picture.id
                ? { ...item, width: image.naturalWidth, height: image.naturalHeight }
                : item
            );
            const basePicture = nextPictures[0];
            patchImageDraft({
              pictures: nextPictures,
              targetResolution: normalizeImageTargetResolution(
                state.imageDraft.targetResolution,
                basePicture?.width ?? 0,
                basePicture?.height ?? 0
              )
            });
            dimensionsChanged = true;
          }
        }
        resolve();
      }, { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
      image.src = dataUrl;
    });
  }));
  if (dimensionsChanged && page === "create" && creationMode === "image-edit") render();
}

function randomSeedValue(): number {
  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  const high = (values[0] ?? 0) & 0x001fffff;
  return high * 0x100000000 + (values[1] ?? 0);
}

async function editImagePictureMarkup(pictureId: string): Promise<void> {
  const picture = state.imageDraft.pictures.find((item) => item.id === pictureId);
  if (!picture?.absolutePath) return;
  const maskMode = state.imageDraft.modelId === "lama-inpaint";
  try {
    const { openImageMarkupEditor } = await import("./image-markup-editor");
    const [sourceDataUrl, existingDocument] = await Promise.all([
      window.studio.readImage(picture.absolutePath),
      (maskMode ? picture.mask?.documentPath : picture.markup?.documentPath)
        ? window.studio.readImageMarkup((maskMode ? picture.mask?.documentPath : picture.markup?.documentPath)!)
        : Promise.resolve(null)
    ]);
    if (!sourceDataUrl) throw new Error(uiText(uiKeys.runtime.readOriginalImageFailed));
    const result = await openImageMarkupEditor({
      pictureNumber: picture.pictureNumber,
      filename: picture.absolutePath,
      sourceDataUrl,
      existingDocument,
      mode: maskMode ? "mask" : "annotation"
    });
    if (!result) return;
    if (maskMode) {
      const mask = result.objectCount > 0
        ? await window.studio.saveImageMask({
            pictureId: picture.id,
            sourcePath: picture.absolutePath,
            document: result.document,
            maskPng: result.renderedPng,
            regionCount: result.objectCount,
            previousRevision: picture.mask?.revision
          })
        : undefined;
      patchImageDraft({
        pictures: state.imageDraft.pictures.map((item) =>
          item.id === pictureId ? { ...item, mask } : item
        )
      });
      render();
      void loadImageEditPreviews();
      showMessage(mask ? `Mask 已保存 · ${mask.regionCount} 个区域` : "Mask 已清除", true);
      return;
    }
    const markup = result.objectCount > 0
      ? await window.studio.saveImageMarkup({
          pictureId: picture.id,
          sourcePath: picture.absolutePath,
          document: result.document,
          renderedPng: result.renderedPng,
          summary: result.summary,
          objectCount: result.objectCount,
          previousRevision: picture.markup?.revision
        })
      : undefined;
    patchImageDraft({
      pictures: state.imageDraft.pictures.map((item) =>
        item.id === pictureId ? { ...item, markup } : item
      )
    });
    render();
    void loadImageEditPreviews();
    showMessage(markup ? uiText(uiKeys.runtime.markupSaved, { count: markup.objectCount }) : uiText(uiKeys.runtime.markupCleared), true);
  } catch (error) {
    showMessage(error instanceof Error ? error.message : uiText(uiKeys.runtime.markupSaveFailed), { kind: "error" });
  }
}

function addImageSlot(): void {
  const pictures = state.imageDraft.pictures;
  const capability = imageModelCapabilityFor(state.imageDraft.modelId);
  if (pictures.length >= capability.maxPictures) {
    showMessage(uiText(uiKeys.runtime.maxPictureSlots, { name: capability.name, count: capability.maxPictures }), { kind: "warning" });
    return;
  }
  const pictureNumber = nextImagePictureNumber(state.imageDraft);
  const slot: ImageReference = {
    id: crypto.randomUUID(),
    pictureNumber,
    absolutePath: "",
    width: 0,
    height: 0,
    role: pictureNumber === 1 ? "base" : "auto"
  };
  patchImageDraft({
    pictures: [...pictures, slot],
    nextPictureNumber: pictureNumber + 1
  });
  render();
}

function addImagePicture(path: string, replacePictureId?: string): void {
  if (!path) return;
  const pictures = state.imageDraft.pictures;
  const targetPicture = replacePictureId
    ? pictures.find((picture) => picture.id === replacePictureId)
    : pictures.find((picture) => !picture.absolutePath);
  if (targetPicture) {
    patchImageDraft({
      pictures: pictures.map((picture) =>
        picture.id === targetPicture.id
          ? { ...picture, absolutePath: path, width: 0, height: 0, markup: undefined, mask: undefined }
          : picture
      )
    });
    render();
    return;
  }
  const capability = imageModelCapabilityFor(state.imageDraft.modelId);
  if (pictures.length >= capability.maxPictures) {
    showMessage(uiText(uiKeys.runtime.maxPictureReferences, { name: capability.name, count: capability.maxPictures }), { kind: "warning" });
    return;
  }
  const pictureNumber = nextImagePictureNumber(state.imageDraft);
  const picture: ImageReference = {
    id: crypto.randomUUID(),
    pictureNumber,
    absolutePath: path,
    width: 0,
    height: 0,
    role: pictureNumber === 1 ? "base" : "auto"
  };
  patchImageDraft({
    pictures: [...pictures, picture],
    nextPictureNumber: pictureNumber + 1
  });
  render();
}

function updateH3ReferenceSlot(
  slotId: string,
  patch: Partial<H3ReferenceSlot>
): void {
  patchDraft({
    h3ReferenceSlots: state.draft.h3ReferenceSlots.map((slot) =>
      slot.id === slotId ? { ...slot, ...patch } : slot
    )
  });
}

function bindH3ReferenceSlots(): void {
  rendererApp.addPageCleanup(mountH3ReferencesController(rendererApp.context, {
    getDraft: () => state?.draft,
    patchDraft,
    requestRender: render,
    notify: (message) => showMessage(message, false)
  }));
}

async function selectDraftVideo(
  filename: string,
  source?: {
    assetId: string;
    versionId: string;
    duration: number;
    width: number;
    height: number;
    h3ContextLatentPath?: string;
  },
  renderAfterSave = true
): Promise<void> {
  const draft: Draft = {
    ...state.draft,
    inputMode: "video",
    sourceVideoPath: filename,
    sourceVideoDuration: source?.duration ?? 0,
    trimStartSeconds: 0,
    trimEndSeconds: source?.duration ?? 0,
    sourceAssetId: source?.assetId,
    sourceVersionId: source?.versionId,
    h3ContextLatentPath: source?.h3ContextLatentPath,
    sourceWidth: source?.width ?? 0,
    sourceHeight: source?.height ?? 0,
    ratio: "source"
  };
  await saveDraftImmediately(draft);
  if (renderAfterSave) render();
}

function setEnqueueBusyUi(busy: boolean): void {
  const button = document.querySelector<HTMLButtonElement>(
    creationMode === "image-edit" ? "#enqueue-image-edit" : "#enqueue"
  );
  if (!button) return;
  button.disabled = busy;
  button.classList.toggle("busy", busy);
  button.setAttribute("aria-busy", String(busy));
  const buttonIcon = button.querySelector<HTMLElement>(".enqueue-spinner");
  if (buttonIcon) {
    buttonIcon.outerHTML = icon(busy ? "refresh-cw" : "plus", "enqueue-spinner");
    renderIcons(button);
  }
  const label = button.querySelector<HTMLElement>("[data-enqueue-label]");
  if (label) label.textContent = busy ? uiText(uiKeys.runtime.enqueueing) : uiText(uiKeys.runtime.enqueue);
}

function syncVideoEnqueueUi(): void {
  const button = document.querySelector<HTMLButtonElement>("#enqueue");
  if (!button) return;
  const reason = buildVideoCreatePageViewModel(createViewModelDependencies()).enqueueBlockReason;
  button.dataset.enqueueBlockReason = reason;
  button.disabled = Boolean(reason) || ui.enqueueBusy;
  button.title = reason || button.dataset.enqueueReadyTitle || uiText(uiKeys.runtime.enqueue);
  const feedback = document.querySelector<HTMLElement>("[data-enqueue-feedback]");
  if (feedback) {
    feedback.hidden = !reason;
    feedback.textContent = reason;
  }
}

function syncPromptEnqueueUi(_promptText: string): void {
  syncVideoEnqueueUi();
}

function syncImageEditEnqueueUi(): void {
  const draft = state.imageDraft;
  const imageProfile = environmentScan?.modelProfiles.find(
    (profile) => profile.id === draft.modelId
  );
  const reason = imageEditEnqueueBlockReason(draft, imageProfile, uiText);
  const button = document.querySelector<HTMLButtonElement>("#enqueue-image-edit");
  if (button) {
    button.disabled = Boolean(reason) || ui.enqueueBusy;
    button.title = reason || uiText(uiKeys.runtime.imageEnqueue);
    button.dataset.enqueueBlockReason = reason;
  }
  const summary = document.querySelector<HTMLElement>(".image-edit-composer .interpolation-summary");
  const summaryTitle = summary?.querySelector<HTMLElement>("strong");
  if (summary && summaryTitle) {
    const count = Math.min(10, Math.max(1, draft.outputCount));
    summary.classList.toggle("unsafe", Boolean(reason));
    summaryTitle.textContent = reason || (imageProfile?.id === "lama-inpaint"
      ? `生成 ${count} 张局部修补结果`
      : uiText(uiKeys.create.imageEdit.summary, { count, seedMode: draft.seed == null ? uiText(uiKeys.runtime.random) : uiText(uiKeys.runtime.same) }));
  }
}

function bindCreate(): void {
  rendererApp.addPageCleanup(mountCreateAssembly(rendererApp.context, {
    clipboard: {
      addImagePicture,
      updateH3ReferenceSlot,
      patchDraft
    },
    context: rendererApp.context,
    setCreationMode,
    getEnvironmentScan: () => environmentScan,
    bundledWorkflows,
    workflowCapabilities,
    bundledWorkflowKey,
    setRendererState,
    patchDraft,
    patchImageDraft,
    syncEnqueueUi: syncVideoEnqueueUi,
    enableSpectrumByDefaultIfAvailable,
    selectDraftVideo,
    formatTrimTime,
    imageEdit: {
      addImageSlot,
      addImagePicture,
      editImagePictureMarkup,
      imageFileIsSupported,
      imageReferenceRoleLabel: (role) => qwenImagePromptPackFor(state.settings.uiLocale).referenceRoleLabels[role],
      imageReferenceRolePromptLabel: (role) => imageReferenceRolePromptLabels[role],
      resizePromptInput,
      updateImagePromptWordCounter,
      syncEnqueueUi: syncImageEditEnqueueUi,
      getPromptEnhanceMode: () => promptEnhanceMode === "faithful" ? "faithful" : "detail-enhance",
      setPromptEnhanceMode: (mode) => {
        promptEnhanceMode = mode === "faithful" ? "faithful" : "sulphur-native";
      },
      isPromptEnhancing: () => promptEnhancing,
      setPromptEnhancing: (value) => {
        promptEnhancing = value;
      },
      setPromptRuntimeLoaded: (value) => {
        promptRuntimeLoaded = value;
      },
      clearPromptVersion: () => clearPromptVersionForScope("image"),
      undoPromptEdit: () => undoPromptEdit("image"),
      redoPromptEdit: () => redoPromptEdit("image"),
      invalidatePromptEditHistory: () => invalidatePromptEditHistory("image"),
      togglePromptModel: togglePromptModelFromUi,
      randomSeedValue,
      isEnqueueBusy: () => ui.enqueueBusy,
      setEnqueueBusy: (value) => {
        ui.enqueueBusy = value;
      },
      setEnqueueBusyUi
    },
    createPrompt: {
      h3ReferenceRoleLabels: h3PromptPackFor(state.settings.uiLocale).referenceRoleLabels,
      h3ReferenceRolePromptLabels,
      getPromptEnhanceMode: () => promptEnhanceMode,
      setPromptEnhanceMode: (mode) => {
        promptEnhanceMode = mode;
      },
      getH3PromptPreset: () => h3PromptPreset,
      setH3PromptPreset: (preset) => {
        h3PromptPreset = preset;
      },
      isPromptEnhancing: () => promptEnhancing,
      setPromptEnhancing: (value) => {
        promptEnhancing = value;
      },
      setPromptRuntimeLoaded: (value) => {
        promptRuntimeLoaded = value;
      },
      clearPromptVersion: () => clearPromptVersionForScope("video"),
      undoPromptEdit: () => undoPromptEdit("video"),
      redoPromptEdit: () => redoPromptEdit("video"),
      invalidatePromptEditHistory: () => invalidatePromptEditHistory("video"),
      togglePromptModel: togglePromptModelFromUi,
      getH3PromptBuilder: () => h3PromptBuilder,
      setH3PromptBuilder: (builder) => {
        h3PromptBuilder = builder;
      },
      createDefaultH3PromptBuilder,
      syncPromptEnqueueUi,
      updateH3PromptCheck
    },
    isEnqueueBusy: () => ui.enqueueBusy,
    setEnqueueBusy: (value) => {
      ui.enqueueBusy = value;
    },
    setEnqueueBusyUi,
    requestClearDraftConfirmation: () => {
      rememberModalFocus();
      ui.pendingConfirmation = { kind: "clear-draft" };
      ui.confirmationBusy = false;
      render();
    }
  }));
  if (creationMode === "image-edit") {
    void loadImageEditPreviews();
  } else {
    void loadImagePreview(rendererApp.context, state.draft.startImagePath, "start-preview", patchDraft);
    void loadImagePreview(rendererApp.context, state.draft.endImagePath, "end-preview", patchDraft);
    if (isMiniMaxH3R2vModel(state.draft.modelId)) {
      bindH3ReferenceSlots();
      for (const slot of state.draft.h3ReferenceSlots) {
        if (slot.mediaType === "image") {
          void loadImagePreview(rendererApp.context, slot.mediaPath, `h3-slot-preview-${slot.id}`, patchDraft);
        }
      }
    }
  }
}

function bindQueue(): void {
  rendererApp.addPageCleanup(mountQueueController(rendererApp.context, {
    setState: (nextState) => {
      setRendererState(nextState);
    },
    setPromptRuntimeLoaded: (loaded) => {
      promptRuntimeLoaded = loaded;
    },
    requestConfirmation: requestQueueTaskConfirmation,
    editTask: (taskId) => {
      void editQueueTask(taskId);
    },
    editUpscaleTask: (task) => {
      const editingWaitingTask = task.status === "waiting";
      ui.upscaleDialog = {
        ...(editingWaitingTask ? { taskId: task.id } : { replaceTaskId: task.id }),
        assetId: task.sourceAssetId,
        versionId: task.sourceVersionId,
        targetHeight: task.targetHeight,
        modelId: task.modelId as typeof ui.upscaleDialog extends { modelId: infer Model } ? Model : never,
        tileMode: task.tileMode
      };
      render();
    },
    rememberModalFocus
  }));
}

function bindUpscaleDialog(): void {
  rendererApp.addPageCleanup(mountUpscaleController(rendererApp.context, {
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
  }));
}

function bindHistory(playback: HistoryPlaybackSnapshot | null = null): void {
  rendererApp.addPageCleanup(mountHistoryAssembly({
    context: rendererApp.context,
    playback,
    navigation: {
      setHistoryKind,
      resetHistoryScroll: () => {
        historyLayoutController.resetScroll();
      },
      switchHistoryLayout: historyLayoutController.switchLayout,
      openHistoryDetail,
      openImageHistoryDetail,
      navigateHistoryDetail,
      navigateImageHistoryDetail,
      navigateImageHistoryVersion,
      selectVideoHistoryVersion: (versionId) => {
        reportUserAction("history-version-select", { versionId });
        ui.selectedHistoryVersionId = versionId;
        if (ui.selectedHistoryAssetId) {
          ui.historyForwardTarget = { assetId: ui.selectedHistoryAssetId, versionId };
        }
        render();
      },
      selectImageHistoryVersion: (versionId) => {
        if (!ui.selectedHistoryAssetId) return;
        ui.selectedHistoryVersionId = versionId;
        ui.historyForwardTarget = { assetId: ui.selectedHistoryAssetId, versionId };
        reportUserAction("image-history-version-select", {
          projectId: ui.selectedHistoryAssetId,
          versionId
        });
        render();
      }
    },
    media: { ...historyMediaRuntime, formatVideoDuration },
    actions: {
      setState: setRendererState,
      getSelectedHistoryAssetId: () => ui.selectedHistoryAssetId,
      getSelectedHistoryVersionId: () => ui.selectedHistoryVersionId,
      openUpscaleDialog: historyActions.openUpscaleDialog,
      requestHistoryDeletion,
      requestImageVersionDeletion,
      copyHistoryText: historyActions.copyHistoryText,
      copyHistoryFile: historyActions.copyHistoryFile,
      copyHistoryImage: historyActions.copyHistoryImage,
      editHistoryAsset: historyActions.editHistoryAsset,
      continueVideoHistory: historyActions.continueVideoHistory,
      continueImageEdit: async (projectId, versionId) => {
        const project = state.imageHistory.find((item) => item.id === projectId);
        const version = project?.versions.find((item) => item.id === versionId);
        if (project && version) await historyActions.continueImageEdit(project, version);
      },
      continueImageToVideo: async (projectId, versionId) => {
        const project = state.imageHistory.find((item) => item.id === projectId);
        const version = project?.versions.find((item) => item.id === versionId);
        if (project && version) await historyActions.continueImageToVideo(project, version);
      }
    },
    historyLayout: historyLayoutController.getLayout(),
    isImageHistoryDetail: page === "image-history-detail",
    bindHistoryMasonry: historyLayoutController.bindMasonry,
    bindHistoryAlbum: historyLayoutController.bindAlbum,
    bindImageHistoryViewer: historyLayoutController.bindImageHistoryViewer,
    bindHistoryTitleMarquees: historyLayoutController.bindTitleMarquees,
    restoreHistoryLayoutAnchor: historyLayoutController.restoreLayoutAnchor,
    imageLightbox: {
      getSelectedHistoryAssetId: () => ui.selectedHistoryAssetId,
      getSelectedHistoryVersionId: () => ui.selectedHistoryVersionId,
      setSelectedHistoryVersionId: (versionId) => {
        ui.selectedHistoryVersionId = versionId;
      },
      setHistoryForwardTarget: (target) => {
        ui.historyForwardTarget = target;
      }
    },
    openHistoryContextMenu: historyContextMenus.openHistory,
    openImageHistoryContextMenu: historyContextMenus.openImageHistory
  }));
}

function formSettings(): Settings {
  return readSettingsFromForm(
    settingsDraft ?? state.settings,
    settingsH3PromptPreset,
    settingsImagePromptPreset
  );
}

async function saveSettingsFromUi(
  nextSettings: Settings,
  mode: SettingsSaveMode = "apply"
): Promise<void> {
  const previousSettings = state.settings;
  const previousProfile = previousSettings.ltxExtensionModelProfile;
  const imageModelChanged = previousSettings.defaultImageModel !== nextSettings.defaultImageModel;
  const pathsChanged = previousSettings.comfyInstallDirectory !== nextSettings.comfyInstallDirectory ||
    previousSettings.comfyPythonPath !== nextSettings.comfyPythonPath ||
    previousSettings.modelDirectory !== nextSettings.modelDirectory ||
    previousSettings.outputDirectory !== nextSettings.outputDirectory ||
    previousSettings.imageOutputDirectory !== nextSettings.imageOutputDirectory ||
    previousSettings.imageInputLibraryDirectory !== nextSettings.imageInputLibraryDirectory ||
    previousSettings.lmStudioInstallDirectory !== nextSettings.lmStudioInstallDirectory ||
    previousSettings.promptModelDirectory !== nextSettings.promptModelDirectory ||
    previousSettings.promptLlamaServerPath !== nextSettings.promptLlamaServerPath;
  const proxyChanged = previousSettings.proxyEnabled !== nextSettings.proxyEnabled ||
    previousSettings.proxyUrl !== nextSettings.proxyUrl;
  await loadUiLocale(nextSettings.uiLocale);
  const savedState = await window.studio.saveSettings(nextSettings, mode);
  settingsDraft = null;
  setRendererState(savedState);
  syncSettingsDirtyUi();
  if (imageModelChanged && state.imageDraft.modelId === previousSettings.defaultImageModel) {
    const capability = imageModelCapabilityFor(nextSettings.defaultImageModel);
    const qualityProfile = capability.qualityProfiles.some(
      (profile) => profile.id === state.imageDraft.qualityProfile
    )
      ? state.imageDraft.qualityProfile
      : capability.qualityProfiles[0]?.id ?? "native";
    setRendererState(await window.studio.saveImageDraft({
      ...state.imageDraft,
      modelId: nextSettings.defaultImageModel,
      qualityProfile
    }));
  }
  if (state.settings.ltxExtensionModelProfile !== previousProfile) {
    delete bundledWorkflows[bundledWorkflowKey("sulphur2", "image")];
    delete bundledWorkflows[bundledWorkflowKey("sulphur2", "video")];
    if (state.draft.modelId === "sulphur2") {
      const bundled = await window.studio.getBundledWorkflow(
        "sulphur2",
        state.draft.inputMode
      );
      if (bundled) {
        bundledWorkflows[
          bundledWorkflowKey("sulphur2", state.draft.inputMode)
        ] = bundled;
        setRendererState(await window.studio.saveDraft({
          ...state.draft,
          workflowPath: bundled.path
        }));
      }
    }
  }
  if (pathsChanged || state.settings.ltxExtensionModelProfile !== previousProfile) {
    await runEnvironmentScan(state.settings);
  }
  showMessage(proxyChanged
    ? uiText(uiKeys.runtime.settingsProxySaved)
    : mode === "migrate-video-history"
      ? uiText(uiKeys.runtime.settingsMigrationSaved)
      : uiText(uiKeys.runtime.settingsNextTaskSaved));
  render();
}

async function runEnvironmentScan(settings: Settings): Promise<void> {
  reportUserAction("scan-environment");
  environmentScanning = true;
  environmentScanError = "";
  render();
  try {
    environmentScan = await window.studio.scanEnvironment(settings);
    enableSpectrumByDefaultIfAvailable();
  } catch (error) {
    environmentScanError = uiText(uiKeys.runtime.environmentScanFailed, { error: error instanceof Error ? error.message : String(error) });
    showMessage(environmentScanError, { kind: "error" });
  } finally {
    environmentScanning = false;
    render();
  }
}

async function loadAppLogs(): Promise<void> {
  if (appLogsLoading) return;
  appLogScreenClearedAt = null;
  appLogsLoading = true;
  appLogsError = "";
  render();
  try {
    applyAppLogSnapshot(await window.studio.readAppLogs(500));
  } catch (error) {
    appLogsError = error instanceof Error ? error.message : String(error);
  } finally {
    appLogsLoading = false;
    render();
  }
}

function bindSettings(): void {
  if (settingsTab === "logs" && !appLogs && !appLogsLoading) {
    void loadAppLogs();
  }
  if (settingsTab !== "logs" && !environmentScan && !environmentScanning) {
    void runEnvironmentScan(settingsDraft ?? state.settings);
    return;
  }
  rendererApp.addPageCleanup(mountSettingsAssembly(rendererApp.context, {
    fields: {
      formSettings,
      setH3PromptPreset: (preset) => {
        settingsH3PromptPreset = preset;
      },
      setImagePromptPreset: (preset) => {
        settingsImagePromptPreset = preset;
      },
      setSettingsDraft: (draft) => {
        settingsDraft = draft;
      },
      setSettingsTab: (tab) => {
        settingsTab = tab;
      },
      hasUnsavedChanges: settingsHaveUnsavedChanges,
      syncSettingsDirtyUi
    },
    environment: {
      formSettings,
      getEnvironmentScan: () => environmentScan,
      setEnvironmentScan: (scan) => {
        environmentScan = scan;
      },
      setSettingsDraft: (draft) => {
        settingsDraft = draft;
      },
      setServiceStarting: (kind) => {
        serviceStarting = kind;
      },
      setServiceRestarting: (kind) => {
        serviceRestarting = kind;
      },
      setServiceStatusMessage: (message) => {
        serviceStatusMessage = message;
      },
      setComfyUpdating: (value) => {
        comfyUpdating = value;
      },
      getComfyUpdateLog: () => comfyUpdateLog,
      setComfyUpdateLog: (log) => {
        comfyUpdateLog = log;
      },
      setAttentionAccelerationInstalling: (value) => {
        attentionAccelerationInstalling = value;
      },
      getAttentionAccelerationLog: () => attentionAccelerationLog,
      setAttentionAccelerationLog: (log) => {
        attentionAccelerationLog = log;
      },
      setCoreDependencyRepairing: (value) => {
        coreDependencyRepairing = value;
      },
      setEnvironmentRepairing: (issueId) => {
        environmentRepairing = issueId;
      },
      setEnvironmentRepairLog: (issueId, log) => {
        environmentRepairLogs = { ...environmentRepairLogs, [issueId]: log };
      },
      enqueueCustomNodeInstall: (nodeId, settings) =>
        customNodeInstallManager.enqueue(nodeId, settings),
      setWorkflowDependencyInstalling: (workflowId) => {
        workflowDependencyInstalling = workflowId;
      },
      getWorkflowDependencyLog: (workflowId) => workflowDependencyLogs[workflowId] ?? "",
      setWorkflowDependencyLog: (workflowId, log) => {
        workflowDependencyLogs = { ...workflowDependencyLogs, [workflowId]: log };
      },
      requestForceStopConfirmation: () => {
        ui.pendingConfirmation = { kind: "force-stop-comfy" };
        ui.confirmationBusy = false;
      },
      rememberModalFocus
    },
    logs: {
      loadAppLogs: () => {
        void loadAppLogs();
      },
      openAppLogContextMenu: appLogContextMenu.open,
      setAppLogFollowTail: (followTail) => {
        appLogFollowTail = followTail;
      }
    },
    page: {
      context: rendererApp.context,
      formSettings,
      getEnvironmentScan: () => environmentScan,
      setSettingsDraft: (draft) => {
        settingsDraft = draft;
      },
      setInstallGuide: (selection) => {
        selectedInstallGuide = selection;
      },
      getInstallGuide: () => selectedInstallGuide,
      settingsHaveUnsavedChanges,
      syncSettingsDirtyUi,
      runEnvironmentScan,
      loadAppLogs: () => void loadAppLogs(),
      togglePromptModel: togglePromptModelFromUi,
      saveSettingsFromUi,
      saveSettingsDirect: async (settings) => {
        await loadUiLocale(settings.uiLocale);
        setRendererState(await window.studio.saveSettings(settings));
      },
      requestDirectoryMigration: (previousSettings, nextSettings, oldDirectory, newDirectory) => {
        ui.pendingDirectoryMigration = {
          target: "video",
          previousSettings,
          nextSettings,
          oldDirectory,
          newDirectory
        };
        ui.directoryMigrationBusy = false;
        ui.historyMigrationProgress = null;
        render();
      },
      openImageAssetLibrary: () => {
        rememberModalFocus();
        ui.imageAssetLibraryDialog = {
          scan: null,
          busy: false,
          error: "",
          confirmCleanup: false,
          selectedPaths: [],
          lastResult: null
        };
        render();
        void scanImageAssets();
      },
      rememberModalFocus,
      restoreModalFocus,
      bindModalFocus
    }
  }));
}

registerRendererEvents({
  studio: window.studio,
  t: rendererApp.context.t,
  getState: () => state,
  setState: setRendererState,
  getPage: () => page,
  getHistoryKind: () => historyKind,
  getDraftDirty: () => draftDirty,
  getDraftSaveInFlight: () => draftSaveInFlight,
  setPromptRuntimeLoaded: (value) => {
    promptRuntimeLoaded = value;
  },
  rememberModalFocus,
  setPendingWindowCloseRequest: (request) => {
    ui.pendingWindowCloseRequest = request;
  },
  setWindowCloseResponseBusy: (value) => {
    ui.windowCloseResponseBusy = value;
  },
  setHistoryMigrationProgress: (progress) => {
    ui.historyMigrationProgress = progress;
  },
  hasPendingDirectoryMigration: () => Boolean(ui.pendingDirectoryMigration),
  setImageAssetLibraryProgress: (progress) => {
    ui.imageAssetLibraryProgress = progress;
  },
  taskPreviews,
  appendAttentionAccelerationLog: (message) => {
    attentionAccelerationLog = [attentionAccelerationLog, message]
      .filter(Boolean)
      .join("\n")
      .slice(-40_000);
    return attentionAccelerationLog;
  },
  appendDependencyInstallLog: (progress) => {
    const current = progress.kind === "custom-node"
      ? customNodeLogs[progress.id] ?? ""
      : workflowDependencyLogs[progress.id] ?? "";
    const next = [current, progress.message]
      .filter(Boolean)
      .join("\n")
      .slice(-60_000);
    if (progress.kind === "custom-node") {
      customNodeLogs = { ...customNodeLogs, [progress.id]: next };
    } else {
      workflowDependencyLogs = { ...workflowDependencyLogs, [progress.id]: next };
    }
    return next;
  },
  notify: showMessage,
  requestRender: render
});

bootstrapRenderer({
  studio: window.studio,
  setState: setRendererState,
  getState: () => state,
  setAppVersion: (version) => {
    ui.appVersion = version;
  },
  setEnvironmentScan: (scan) => {
    environmentScan = scan;
  },
  setEnvironmentScanError: (message) => {
    environmentScanError = message;
  },
  bundledWorkflows,
  workflowCapabilities,
  bundledWorkflowKey,
  bundledWorkflowModelId,
  enableSpectrumByDefaultIfAvailable,
  patchDraft,
  render,
  refreshPerformanceMetrics: () => queueLiveStatus.refresh()
});
