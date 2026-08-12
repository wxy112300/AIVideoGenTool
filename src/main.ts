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
import type { CreationMode, HistoryKind, Page } from "./renderer/contracts";
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
import { mountSettingsPageController } from "./renderer/pages/settings/page-controller";
import { mountSettingsControllers } from "./renderer/pages/settings/controllers";
import { readSettingsFromForm } from "./renderer/pages/settings/form";
import {
  buildSettingsPageViewModel,
  type SettingsViewModelDependencies
} from "./renderer/pages/settings/view-model";
import { mountSettingsFieldsController } from "./renderer/pages/settings/fields-controller";
import { mountSettingsEnvironmentController } from "./renderer/pages/settings/environment-controller";
import { mountSettingsLogsController } from "./renderer/pages/settings/logs-controller";
import { createAppLogContextMenu } from "./renderer/pages/settings/log-context-menu";
import {
  renderHistoryDetailPage,
  renderHistoryPage,
  renderImageHistoryDetailPage,
  renderImageHistoryPage,
  type HistoryPageOptions,
  type HistoryPageViewModel
} from "./renderer/pages/history/page";
import {
  mountHistoryPageController,
  type HistoryPlaybackSnapshot
} from "./renderer/pages/history/page-controller";
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
import { mountCreatePageController } from "./renderer/pages/create/page-controller";
import { mountCreateClipboardController } from "./renderer/pages/create/clipboard-controller";
import { mountH3ReferencesController } from "./renderer/pages/create/references-controller";
import {
  buildImageEditPageViewModel,
  buildVideoCreatePageViewModel,
  imageEditEnqueueBlockReason,
  type CreateViewModelDependencies
} from "./renderer/pages/create/view-model";
import {
  createDefaultH3PromptBuilder,
  h3PromptPresetDescriptions,
  h3PromptPresetOptions,
  h3ReferenceRoleLabels,
  h3PromptModeForDraft,
  imageFileIsSupported,
  imagePromptPresetDescriptions,
  imagePromptPresetLabels,
  imageReferenceRoleLabels,
  loadImagePreview,
  orderVideoProfiles,
  resizePromptInput,
  updateImagePromptWordCounter,
  updatePromptWordCounter
} from "./renderer/pages/create/helpers";
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
import { renderShell } from "./renderer/shell/page";
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
import { createClearedDraft, createDefaultImagePromptPresets } from "./core/defaults";
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
import { createDefaultH3PromptPresets } from "./core/h3-prompt-presets";
import {
  isGemmaPromptModel
} from "./core/prompt-models";
import {
  generationSafetyForTask,
  isMiniMaxH3BoundaryExtensionModel,
  isMiniMaxH3Fl2vaModel,
  isMiniMaxH3Model,
  isMiniMaxH3R2vModel,
  isMiniMaxH3SpectrumEligible,
  isRetiredVideoModel,
  normalizeH3Steps
} from "./core/workflow";
import {
  createUpscaleFilename,
  estimateUpscaleResources,
  upscaleDimensions
} from "./core/upscale";
import { checkH3Prompt } from "./core/h3-prompt-check";
import { structurallyEqual } from "./core/structural-equal";
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
let appVersion = "";
let draftSaveTimer: number | undefined;
let draftRevision = 0;
let draftSaveInFlight = 0;
let draftDirty = false;
let imageDraftSaveTimer: number | undefined;
let imageDraftRevision = 0;
let flashMessage = "";
let flashMessageTimer: number | undefined;
let selectedHistoryAssetId = "";
let selectedHistoryVersionId = "";
let historyForwardTarget: { assetId: string; versionId: string } | null = null;
let upscaleDialog: {
  taskId?: string;
  replaceTaskId?: string;
  assetId: string;
  versionId: string;
  targetHeight: 720 | 1080 | 1440 | 2160;
  modelId: "seedvr2" | "flashvsr" | "realesrgan";
  tileMode: "auto" | "safe" | "fast";
} | null = null;
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
let pendingConfirmation:
  | { kind: "clear-draft" }
  | { kind: "delete-history"; assetId: string; title: string }
  | { kind: "delete-image-version"; projectId: string; versionId: string; title: string }
  | { kind: "remove-queue-task"; taskId: string; title: string }
  | { kind: "cancel-queue-task"; taskId: string; title: string }
  | { kind: "discard-settings"; nextPage: Page }
  | { kind: "force-stop-comfy" }
  | null = null;
let confirmationBusy = false;
let pendingDirectoryMigration: {
  target: "video";
  previousSettings: Settings;
  nextSettings: Settings;
  oldDirectory: string;
  newDirectory: string;
} | null = null;
let directoryMigrationBusy = false;
let historyMigrationProgress: HistoryMigrationProgress | null = null;
let imageAssetLibraryDialog: {
  scan: ImageAssetLibraryScan | null;
  busy: boolean;
  error: string;
  confirmCleanup: boolean;
  selectedPaths: string[];
  lastResult: {
    tone: "success" | "warning";
    title: string;
    detail: string;
    operationId?: string;
  } | null;
} | null = null;
let imageAssetLibraryProgress: ImageAssetLibraryProgress | null = null;
let queueActionBusy: { taskId: string; action: "remove" | "cancel" | "edit" } | null = null;
let enqueueBusy = false;
let modalReturnFocus: HTMLElement | null = null;
let modalInitialFocusPending = false;
let modalControlFocusSelector = "";
let pendingWindowCloseRequest: WindowCloseRequest | null = null;
let windowCloseResponseBusy = false;
const bundledWorkflows: Record<string, BundledWorkflow> = {};
const bundledWorkflowKey = (modelId: string, inputMode: Draft["inputMode"]) =>
  `${modelId}:${inputMode}`;
const workflowCapabilities: Record<string, WorkflowCapabilities> = {};
const taskPreviews: Record<string, string> = {};
let performanceMetrics: PerformanceMetrics | null = null;
let shellControllerCleanup: (() => void) | null = null;
let promptEnhanceMode: PromptEnhanceMode = "sulphur-native";
let h3PromptPreset: H3PromptPreset = "official-storyboard";
let settingsH3PromptPreset: H3PromptPreset = "official-storyboard";
let settingsImagePromptPreset: ImagePromptPreset = "faithful";
let promptEnhancing = false;
let promptStarting = false;
let promptReleasing = false;
let promptRuntimeLoaded = false;

let h3PromptBuilder = createDefaultH3PromptBuilder();

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
  element.innerHTML = `<div class="h3-prompt-check-heading"><strong>H3 提示词检查</strong><span>${escapeHtml(result.summary)}</span></div>
    ${result.items.length ? `<ul>${result.items.map((item) => `<li>${escapeHtml(item.message)}</li>`).join("")}</ul>` : ""}`;
}

function rememberModalFocus(): void {
  const active = document.activeElement;
  modalReturnFocus = active instanceof HTMLElement && active !== document.body
    ? active
    : null;
  modalInitialFocusPending = true;
  modalControlFocusSelector = "";
}

function rememberModalControlFocus(element: HTMLElement): void {
  if (element.id) {
    modalControlFocusSelector = `#${element.id}`;
    return;
  }
  const upscaleHeight = element.dataset.upscaleHeight;
  if (upscaleHeight) {
    modalControlFocusSelector = `[data-upscale-height="${CSS.escape(upscaleHeight)}"]`;
  }
}

function restoreModalFocus(): void {
  const target = modalReturnFocus;
  modalReturnFocus = null;
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
    const storedControl = !modalInitialFocusPending && modalControlFocusSelector
      ? dialog.querySelector<HTMLElement>(modalControlFocusSelector)
      : null;
    const initial = storedControl ?? (initialSelector
      ? dialog.querySelector<HTMLElement>(initialSelector)
      : null);
    const first = initial ?? dialog.querySelector<HTMLElement>(focusableSelector);
    (first ?? dialog).focus();
    modalControlFocusSelector = "";
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
  if (modalInitialFocusPending || modalControlFocusSelector) {
    modalInitialFocusPending = false;
    focusInitial();
  }
}

function directoryMigrationDialog(): string {
  return renderDirectoryMigrationDialog({
    request: pendingDirectoryMigration,
    progress: historyMigrationProgress,
    busy: directoryMigrationBusy,
    icon,
    escapeHtml
  });
}

async function chooseDirectoryMigration(mode: SettingsSaveMode | "cancel"): Promise<void> {
  const request = pendingDirectoryMigration;
  if (!request || directoryMigrationBusy) return;
  if (mode === "cancel") {
    settingsDraft = {
      ...request.nextSettings,
      outputDirectory: request.previousSettings.outputDirectory
    };
    pendingDirectoryMigration = null;
    historyMigrationProgress = null;
    render();
    restoreModalFocus();
    showMessage("已取消目录更改，继续使用当前目录。");
    return;
  }
  directoryMigrationBusy = true;
  historyMigrationProgress = null;
  render();
  try {
    await saveSettingsFromUi(request.nextSettings, mode);
    const warningCount = (historyMigrationProgress as HistoryMigrationProgress | null)?.warningCount ?? 0;
    pendingDirectoryMigration = null;
    directoryMigrationBusy = false;
    historyMigrationProgress = null;
    render();
    restoreModalFocus();
    if (mode === "migrate-video-history") {
      showMessage(warningCount
        ? `历史视频已迁移，但有 ${warningCount} 个旧文件清理警告。`
        : "历史视频迁移完成。");
    }
  } catch (error) {
    directoryMigrationBusy = false;
    showMessage(error instanceof Error ? error.message : String(error), false);
    render();
  }
}

function bindDirectoryMigrationDialog(): void {
  if (!pendingDirectoryMigration) return;
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
    if (event.target === event.currentTarget && !directoryMigrationBusy) {
      void chooseDirectoryMigration("cancel");
    }
  });
  const dialog = document.querySelector<HTMLElement>(".directory-migration-dialog");
  if (dialog) bindModalFocus(dialog, () => void chooseDirectoryMigration("cancel"), "#directory-cancel");
}

function imageAssetLibraryDialogHtml(): string {
  return renderImageAssetLibraryDialog({
    dialog: imageAssetLibraryDialog,
    progress: imageAssetLibraryProgress,
    icon,
    escapeHtml,
    formatAssetBytes
  });
}

async function scanImageAssets(): Promise<void> {
  if (!imageAssetLibraryDialog || imageAssetLibraryDialog.busy) return;
  imageAssetLibraryDialog = { ...imageAssetLibraryDialog, busy: true, error: "", confirmCleanup: false, lastResult: null };
  imageAssetLibraryProgress = null;
  render();
  try {
    const scan = await window.studio.scanImageAssetLibrary();
    imageAssetLibraryDialog = { scan, busy: false, error: "", confirmCleanup: false, selectedPaths: scan.orphanFiles.slice(0, 12).map((file) => file.absolutePath), lastResult: null };
  } catch (error) {
    imageAssetLibraryDialog = { ...imageAssetLibraryDialog, busy: false, error: error instanceof Error ? error.message : String(error) };
  }
  render();
}

function bindImageAssetLibraryDialog(): void {
  const dialog = imageAssetLibraryDialog;
  if (!dialog) return;
  const close = () => {
    if (imageAssetLibraryDialog?.busy) return;
    imageAssetLibraryDialog = null;
    imageAssetLibraryProgress = null;
    render();
    restoreModalFocus();
  };
  document.querySelector("#image-assets-close")?.addEventListener("click", close);
  document.querySelector("#image-asset-library-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) close();
  });
  document.querySelector("#image-assets-rescan")?.addEventListener("click", () => void scanImageAssets());
  document.querySelector("#image-assets-organize")?.addEventListener("click", async () => {
    if (!imageAssetLibraryDialog || imageAssetLibraryDialog.busy) return;
    imageAssetLibraryDialog = { ...imageAssetLibraryDialog, busy: true, error: "", lastResult: null };
    imageAssetLibraryProgress = null;
    render();
    try {
      const result = await window.studio.organizeImageAssetLibrary();
      imageAssetLibraryDialog = { scan: result.scan, busy: false, error: "", confirmCleanup: false, selectedPaths: result.scan.orphanFiles.slice(0, 12).map((file) => file.absolutePath), lastResult: imageAssetResultSummary(result, "organize", formatAssetBytes) };
      showMessage(`素材库整理完成：归档 ${result.archivedFiles} 个外部素材、迁移 ${result.reorganizedFiles} 个旧目录文件、更新 ${result.updatedReferences} 处引用；原文件未删除。`);
    } catch (error) {
      imageAssetLibraryDialog = { ...imageAssetLibraryDialog, busy: false, error: error instanceof Error ? error.message : String(error) };
    }
    render();
  });
  document.querySelector("#image-assets-cleanup")?.addEventListener("click", async () => {
    if (!imageAssetLibraryDialog || imageAssetLibraryDialog.busy) return;
    if (!imageAssetLibraryDialog.confirmCleanup) {
      const selectedPaths = [...document.querySelectorAll<HTMLInputElement>("[data-orphan-path]:checked")].map((item) => item.dataset.orphanPath || "").filter(Boolean);
      imageAssetLibraryDialog = { ...imageAssetLibraryDialog, confirmCleanup: true, selectedPaths };
      render();
      return;
    }
    const paths = imageAssetLibraryDialog.selectedPaths;
    imageAssetLibraryDialog = { ...imageAssetLibraryDialog, busy: true, error: "", confirmCleanup: false, lastResult: null };
    imageAssetLibraryProgress = null;
    render();
    try {
      const result = await window.studio.cleanupImageAssetLibrary(paths);
      imageAssetLibraryDialog = { scan: result.scan, busy: false, error: "", confirmCleanup: false, selectedPaths: result.scan.orphanFiles.slice(0, 12).map((file) => file.absolutePath), lastResult: imageAssetResultSummary(result, "cleanup", formatAssetBytes) };
      showMessage(`已清理 ${result.cleanedFiles} 个孤立素材，释放 ${formatAssetBytes(result.cleanedBytes)}。`);
    } catch (error) {
      imageAssetLibraryDialog = { ...imageAssetLibraryDialog, busy: false, error: error instanceof Error ? error.message : String(error), confirmCleanup: false };
    }
    render();
  });
  const element = document.querySelector<HTMLElement>(".image-asset-library-dialog");
  if (element) bindModalFocus(element, close, "#image-assets-close");
}

function upscaleDialogHtml(): string {
  return renderUpscaleDialog({
    dialog: upscaleDialog,
    history: state.history,
    environment: environmentScan,
    performance: performanceMetrics,
    icon,
    escapeHtml,
    formatBytes,
    formatVideoDuration,
    formatUpscaleEstimateRange,
    createUpscaleFilename,
    estimateUpscaleResources,
    upscaleDimensions,
    versionShortEdge
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
    ? "正在启动提示词模型"
    : promptEnhancing
    ? "提示词模型正在运行"
    : promptReleasing
      ? "正在释放提示词模型"
      : promptRuntimeLoaded
      ? "释放 ComfyUI 提示词模型并回收显存"
      : promptModelStatus(settings, environmentScan).detail;
}

const createPageOptions: CreatePageOptions = {
  icon,
  escapeHtml,
  h3ReferenceRoleLabels,
  imageReferenceRoleLabels,
  videoLoraInfoButton,
  videoLoraPurposeLabel
};

function createViewModelDependencies(): CreateViewModelDependencies {
  return {
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
    enqueueBusy,
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
    performanceMetrics,
    queueRemainingSeconds: (tasks) => calculateQueueRemainingSeconds(tasks, state.history),
    queueEstimateText,
    performanceCard,
    renderTaskCard: queueTaskCard,
    icon
  });
}

function queueTaskCard(task: QueueTask, queuePosition: number): string {
  return renderQueueTaskCard(task, queuePosition, {
    taskPreviews,
    queueRunning: state.queueRunning,
    queueActionBusy,
    icon,
    escapeHtml,
    modelName,
    frameRateSummary,
    queueStageElapsedText,
    queueTaskRemainingSeconds: (queueTask) => calculateQueueTaskRemainingSeconds(queueTask, state.history),
    queueEstimateText,
    elapsedText
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
    promptVersions: [{
      id: crypto.randomUUID(),
      label: "从队列调整",
      text: task.prompt,
      createdAt: now
    }],
    activePromptVersion: 0,
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
      showMessage("已带回图片创作页，可调整参数后重新加入队列。");
      return;
    }
    const draft = draftFromQueueTask(task);
    if (!draft) return;
    await saveDraftImmediately(draft);
    setRendererState(await window.studio.removeTask(taskId));
    queueActionBusy = null;
    navigateToCreationMode(draft.inputMode === "video" ? "video-extension" : "image-to-video");
    showMessage("已带回创建页，可调整参数后重新加入队列。");
  } catch (error) {
    queueActionBusy = null;
    showMessage(error instanceof Error ? error.message : "无法编辑该队列任务");
  }
}

function createHistoryPageViewModel(): HistoryPageViewModel {
  return {
    state,
    historyKind,
    historyLayout: historyLayoutController.getLayout(),
    selectedHistoryAssetId,
    selectedHistoryVersionId
  };
}

const historyPageOptions: HistoryPageOptions = {
  icon,
  escapeHtml,
  formatBytes,
  videoLoraPurposeLabel,
  h3ReferenceRoleLabel: (role) => h3ReferenceRoleLabels[role],
  imageReferenceRoleLabel: (role) => imageReferenceRoleLabels[role],
  modelName,
  formatFullHistoryTime,
  formatVideoDuration,
  formatElapsedDuration,
  historyAssetsByNewest,
  imageProjectsByNewest,
  preferredVersion,
  currentHistoryVersion,
  historyMediaUrl,
  historyCoverCacheKey,
  historyCoverSeed,
  historyInitialCoverTime,
  historyResolutionLabel,
  historyRenderDuration,
  versionVideoIndex,
  versionShortEdge,
  preferredImageVersion,
  currentImageHistoryVersion,
  imageHistoryMediaUrl,
  imageHistoryThumbnailCacheKey,
  imageProjectCoverVersion,
  isRetiredVideoModel,
  imageHistoryGenerationSummary
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
  const asset = state.history.find((item) => item.id === selectedHistoryAssetId);
  if (!asset) {
    setPage("history");
    return historyPage();
  }
  const version = currentHistoryVersion(asset, selectedHistoryVersionId);
  selectedHistoryVersionId = version.id;
  return renderHistoryDetailPage(createHistoryPageViewModel(), historyPageOptions);
}

function imageHistoryDetailPage(): string {
  const project = state.imageHistory.find((item) => item.id === selectedHistoryAssetId);
  if (!project) {
    setHistoryKind("image");
    setPage("history");
    return historyPage();
  }
  const version = currentImageHistoryVersion(project, selectedHistoryVersionId);
  selectedHistoryVersionId = version.id;
  return renderImageHistoryDetailPage(createHistoryPageViewModel(), historyPageOptions);
}

function captureHistoryPlayback(): HistoryPlaybackSnapshot | null {
  if (page !== "history-detail") return null;
  const video = document.querySelector<HTMLVideoElement>(".history-player video");
  if (!video) return null;
  return {
    assetId: video.dataset.historyAsset ?? "",
    versionId: video.dataset.historyVersion ?? "",
    currentTime: video.currentTime,
    paused: video.paused,
    muted: video.muted,
    playbackRate: video.playbackRate
  };
}

function restoreHistoryPlayback(snapshot: HistoryPlaybackSnapshot | null): void {
  if (!snapshot) return;
  const video = document.querySelector<HTMLVideoElement>(".history-player video");
  if (!video) return;
  if (
    video.dataset.historyAsset !== snapshot.assetId ||
    video.dataset.historyVersion !== snapshot.versionId
  ) return;
  const restore = () => {
    video.muted = snapshot.muted;
    video.playbackRate = snapshot.playbackRate;
    if (Number.isFinite(video.duration)) {
      video.currentTime = Math.min(snapshot.currentTime, video.duration);
    }
    if (snapshot.paused) video.pause();
    else void video.play().catch(() => undefined);
  };
  if (video.readyState >= 1) window.requestAnimationFrame(restore);
  else video.addEventListener("loadedmetadata", restore, { once: true });
}

function stopRenderedVideoPlayback(): void {
  document.querySelectorAll<HTMLVideoElement>("video").forEach((video) => {
    video.pause();
  });
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
    !isMiniMaxH3SpectrumEligible(draft.modelId) ||
    (draft.inputMode === "video" && isMiniMaxH3R2vModel(draft.modelId))
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
  if (status) status.textContent = dirty ? "未保存更改" : "已保存";
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
      defaultH3PromptPresets: createDefaultH3PromptPresets(),
      defaultImagePromptPresets: createDefaultImagePromptPresets(),
      h3PromptPresetDescriptions,
      imagePromptPresetLabels,
      imagePromptPresetDescriptions,
      icon,
      escapeHtml,
      formatBytes,
      formatScanTime: (scannedAt) => new Date(scannedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
      orderVideoProfiles,
      getImageQualityProfiles: (modelId) => imageModelCapabilityFor(modelId).qualityProfiles,
      isGemmaPromptModel,
      videoLoraInfoButton: (profileId) => {
        const lora = BUILTIN_VIDEO_LORAS.find((item) => item.id === profileId);
        return lora ? videoLoraInfoButton(lora) : "";
      },
      isImageWorkflowReady,
      isImageModelSelectable,
      imageWorkflowStatus,
      h3PromptPresetOptions,
      renderAppLogTerminal: (text) => appLogTerminalHtml(visibleAppLogText(text, appLogScreenClearedAt))
    }
  );
}

function renderLegacy(): void {
  historyLayoutController.beforeRender();
  const playback = captureHistoryPlayback();
  stopRenderedVideoPlayback();
  appLogContextMenu.close();
  const content =
    page === "create" ? createPage() :
    page === "queue" ? queuePage() :
    page === "history" ? historyPage() :
    page === "history-detail" ? historyDetailPage() :
    page === "image-history-detail" ? imageHistoryDetailPage() :
    settingsPage();
  appElement.innerHTML = renderShell({
    page,
    appVersion,
    queueCount: state.queue.length,
    flashMessage,
    content,
    icon,
    escapeHtml,
    confirmationDialog: renderConfirmationDialog({
      request: pendingConfirmation,
      confirmationBusy,
      imageHistoryIds: new Set(state.imageHistory.map((item) => item.id)),
      icon,
      escapeHtml
    }),
    directoryMigrationDialog: directoryMigrationDialog(),
    imageAssetLibraryDialog: imageAssetLibraryDialogHtml(),
    windowCloseDialog: renderWindowCloseDialog({
      request: pendingWindowCloseRequest,
      responseBusy: windowCloseResponseBusy,
      icon,
      escapeHtml
    }),
    upscaleDialog: upscaleDialogHtml()
  });
  renderIcons(appElement);
  bindShell();
  rendererApp.addPageCleanup(historyLayoutController.bindViewportControls());
  bindUpscaleDialog();
  if (page === "create") {
    bindCreate();
    if (creationMode === "image-edit") {
      void loadImageEditPreviews();
    } else {
      void loadImagePreview(rendererApp.context, state.draft.startImagePath, "start-preview", patchDraft);
      void loadImagePreview(rendererApp.context, state.draft.endImagePath, "end-preview", patchDraft);
    }
    if (creationMode !== "image-edit" && isMiniMaxH3R2vModel(state.draft.modelId)) {
      bindH3ReferenceSlots();
      for (const slot of state.draft.h3ReferenceSlots) {
        if (slot.mediaType === "image") {
          void loadImagePreview(rendererApp.context, slot.mediaPath, `h3-slot-preview-${slot.id}`, patchDraft);
        }
      }
    }
  } else if (page === "queue") {
    bindQueue();
    void loadQueueInputPreviewsForPage(rendererApp.context);
  }
  else if (page === "history" || page === "history-detail" || page === "image-history-detail") {
    bindHistory(playback);
  }
  else if (page === "settings") bindSettings();
  syncAppLogPolling();
  if (page === "history") {
    historyLayoutController.restoreScrollPosition();
  }
  restoreHistoryPlayback(playback);
}

function render(): void {
  rendererApp.render();
}

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
  notify: (message, options) => showMessage(message, options?.renderPage ?? true),
  reportUserAction,
  renderLegacy
});

const historyMediaRuntime = createHistoryMediaRuntime(
  rendererApp.context,
  () => page === "history"
);
const historyLayoutController = createHistoryLayoutController(rendererApp.context, reportUserAction);
const historyActions = createHistoryActions({
  context: rendererApp.context,
  setState: setRendererState,
  getSelectedHistoryAssetId: () => selectedHistoryAssetId,
  getSelectedHistoryVersionId: () => selectedHistoryVersionId,
  setSelectedHistoryAssetId: (assetId) => {
    selectedHistoryAssetId = assetId;
  },
  setDialog: (dialog) => {
    upscaleDialog = dialog;
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
const queueLiveStatus = createQueueLiveStatus({
  studio: window.studio,
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
  flash.textContent = flashMessage;
  flash.classList.toggle("visible", Boolean(flashMessage));
}

function showMessage(message: string, _legacyRenderPage?: boolean): void {
  flashMessage = message;
  window.clearTimeout(flashMessageTimer);
  syncFlashMessage();
  flashMessageTimer = window.setTimeout(() => {
    if (flashMessage === message) {
      flashMessage = "";
      syncFlashMessage();
    }
  }, 3500);
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
  terminal.innerHTML = appLogTerminalHtml(visibleAppLogText(snapshot.text, appLogScreenClearedAt));
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
    showMessage(error instanceof Error ? error.message : String(error));
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
    showMessage(error instanceof Error ? error.message : String(error));
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
  pendingConfirmation = {
    kind: "delete-history",
    assetId,
    title
  };
  confirmationBusy = false;
  render();
}

function requestImageVersionDeletion(projectId: string, versionId: string): void {
  const project = state.imageHistory.find((item) => item.id === projectId);
  const version = project?.versions.find((item) => item.id === versionId);
  if (!project || !version || version.kind === "source") return;
  rememberModalFocus();
  pendingConfirmation = {
    kind: "delete-image-version",
    projectId,
    versionId,
    title: `${project.title} · 版本 ${version.versionNumber}`
  };
  confirmationBusy = false;
  render();
}

function requestQueueTaskConfirmation(
  taskId: string,
  action: "remove" | "cancel"
): void {
  const task = state.queue.find((item) => item.id === taskId);
  if (!task) return;
  rememberModalFocus();
  pendingConfirmation = {
    kind: action === "remove" ? "remove-queue-task" : "cancel-queue-task",
    taskId,
    title: task.outputFilename
  };
  confirmationBusy = false;
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
  selectedHistoryAssetId = assetId;
  const asset = state.history.find((item) => item.id === assetId);
  selectedHistoryVersionId = asset?.versions.find((item) => item.id === versionId)?.id ??
    (asset ? preferredVersion(asset).id : "");
  historyForwardTarget = asset
    ? { assetId, versionId: selectedHistoryVersionId }
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
  selectedHistoryAssetId = projectId;
  selectedHistoryVersionId = project.versions.find((item) => item.id === versionId)?.id ??
    preferredImageVersion(project).id;
  historyForwardTarget = { assetId: projectId, versionId: selectedHistoryVersionId };
  setPage("image-history-detail");
  render();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function returnToHistory(): void {
  if (page !== "history-detail" && page !== "image-history-detail") return;
  historyLayoutController.setScrollRestorePending(true);
  setPage("history");
  flashMessage = "";
  render();
}

function navigateToCreationMode(mode: CreationMode): void {
  setCreationMode(mode);
  setPage("create");
  historyForwardTarget = null;
  render();
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  });
}

function returnToLastHistoryDetail(): void {
  if (page !== "history" || !historyForwardTarget) return;
  const target = historyForwardTarget;
  if (historyKind === "image") {
    const project = state.imageHistory.find((item) => item.id === target.assetId);
    if (!project) {
      historyForwardTarget = null;
      return;
    }
    openImageHistoryDetail(target.assetId, target.versionId);
    return;
  }
  const asset = state.history.find((item) => item.id === target.assetId);
  if (!asset) {
    historyForwardTarget = null;
    return;
  }
  openHistoryDetail(target.assetId, target.versionId);
}

function navigateHistoryDetail(direction: -1 | 1): void {
  if (page !== "history-detail") return;
  const orderedHistory = historyAssetsByNewest(state.history);
  const currentIndex = orderedHistory.findIndex(
    (item) => item.id === selectedHistoryAssetId
  );
  const nextAsset = orderedHistory[currentIndex + direction];
  if (!nextAsset) return;
  openHistoryDetail(nextAsset.id);
}

function navigateImageHistoryDetail(direction: -1 | 1): void {
  if (page !== "image-history-detail") return;
  const orderedProjects = imageProjectsByNewest(state.imageHistory);
  const currentIndex = orderedProjects.findIndex((item) => item.id === selectedHistoryAssetId);
  const nextProject = orderedProjects[currentIndex + direction];
  if (!nextProject) return;
  openImageHistoryDetail(nextProject.id);
}

function navigateImageHistoryVersion(direction: -1 | 1): void {
  if (page !== "image-history-detail") return;
  const project = state.imageHistory.find((item) => item.id === selectedHistoryAssetId);
  if (!project) return;
  const currentIndex = project.versions.findIndex((item) => item.id === selectedHistoryVersionId);
  if (currentIndex < 0) return;
  const nextVersion = project.versions[currentIndex - direction];
  if (!nextVersion) return;
  selectedHistoryVersionId = nextVersion.id;
  historyForwardTarget = { assetId: project.id, versionId: nextVersion.id };
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
    page === "history-detail" && selectedHistoryAssetId === assetId
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
    getRequest: () => pendingConfirmation,
    setRequest: (request) => {
      pendingConfirmation = request;
    },
    setBusy: (value) => {
      confirmationBusy = value;
    },
    isBusy: () => confirmationBusy,
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
      selectedHistoryAssetId = assetId;
    },
    setSelectedHistoryVersionId: (versionId) => {
      selectedHistoryVersionId = versionId;
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
  if (!pendingConfirmation) return;
  const close = () => {
    if (confirmationBusy) return;
    pendingConfirmation = null;
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
  if (!pendingWindowCloseRequest) return;
  const respond = async (response: "cancel" | "discard-settings" | "finish-tasks" | "force-exit") => {
    if (windowCloseResponseBusy) return;
    if (document.activeElement instanceof HTMLElement) {
      rememberModalControlFocus(document.activeElement);
    }
    windowCloseResponseBusy = true;
    render();
    try {
      await window.studio.respondWindowClose(response);
      if (response === "cancel") {
        pendingWindowCloseRequest = null;
        windowCloseResponseBusy = false;
        render();
        restoreModalFocus();
      }
    } catch (error) {
      windowCloseResponseBusy = false;
      showMessage(error instanceof Error ? error.message : "无法处理退出请求");
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
  shellControllerCleanup?.();
  shellControllerCleanup = mountShellController({
    getPage: () => page,
    settingsHaveUnsavedChanges,
    rememberModalFocus,
    requestDiscardSettings: (nextPage) => {
      pendingConfirmation = { kind: "discard-settings", nextPage };
      confirmationBusy = false;
      render();
    },
    returnToHistory,
    returnToLastHistoryDetail,
    navigateHistoryDetail,
    navigateImageHistoryDetail,
    setHistoryScrollPosition: () => historyLayoutController.captureScrollPosition(),
    setHistoryScrollRestorePending: historyLayoutController.setScrollRestorePending,
    clearHistoryForwardTarget: () => {
      historyForwardTarget = null;
    },
    setPage,
    clearFlashMessage: () => {
      flashMessage = "";
    },
    reportUserAction,
    render,
    bindConfirmationDialog,
    bindDirectoryMigrationDialog,
    bindImageAssetLibraryDialog,
    bindWindowCloseDialog
  });
  rendererApp.addPageCleanup(() => {
    shellControllerCleanup?.();
    shellControllerCleanup = null;
  });
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
      showMessage(error instanceof Error ? error.message : "图片草稿保存失败", false);
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
    const previewPath = picture.markup?.renderedPath || picture.absolutePath;
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
  try {
    const { openImageMarkupEditor } = await import("./image-markup-editor");
    const [sourceDataUrl, existingDocument] = await Promise.all([
      window.studio.readImage(picture.absolutePath),
      picture.markup?.documentPath
        ? window.studio.readImageMarkup(picture.markup.documentPath)
        : Promise.resolve(null)
    ]);
    if (!sourceDataUrl) throw new Error("无法读取原始图片，请确认文件仍然存在。");
    const result = await openImageMarkupEditor({
      pictureNumber: picture.pictureNumber,
      filename: picture.absolutePath,
      sourceDataUrl,
      existingDocument
    });
    if (!result) return;
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
    showMessage(markup ? `已保存 ${markup.objectCount} 处图片标记` : "图片标记已清除", true);
  } catch (error) {
    showMessage(error instanceof Error ? error.message : "图片标记保存失败", false);
  }
}

function addImageSlot(): void {
  const pictures = state.imageDraft.pictures;
  const capability = imageModelCapabilityFor(state.imageDraft.modelId);
  if (pictures.length >= capability.maxPictures) {
    showMessage(`当前 ${capability.name} 最多支持 ${capability.maxPictures} 个 Slot`);
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
          ? { ...picture, absolutePath: path, width: 0, height: 0, markup: undefined }
          : picture
      )
    });
    render();
    return;
  }
  const capability = imageModelCapabilityFor(state.imageDraft.modelId);
  if (pictures.length >= capability.maxPictures) {
    showMessage(`当前 ${capability.name} 最多支持 ${capability.maxPictures} 张 Picture`);
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
  if (label) label.textContent = busy ? "加入中…" : "加入队列";
}

function syncVideoEnqueueUi(): void {
  const button = document.querySelector<HTMLButtonElement>("#enqueue");
  if (!button) return;
  const reason = buildVideoCreatePageViewModel(createViewModelDependencies()).enqueueBlockReason;
  button.dataset.enqueueBlockReason = reason;
  button.disabled = Boolean(reason) || enqueueBusy;
  button.title = reason || button.dataset.enqueueReadyTitle || "加入队列";
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
  const reason = imageEditEnqueueBlockReason(draft, imageProfile);
  const button = document.querySelector<HTMLButtonElement>("#enqueue-image-edit");
  if (button) {
    button.disabled = Boolean(reason) || enqueueBusy;
    button.title = reason || "加入图片编辑队列";
    button.dataset.enqueueBlockReason = reason;
  }
  const summary = document.querySelector<HTMLElement>(".image-edit-composer .interpolation-summary");
  const summaryTitle = summary?.querySelector<HTMLElement>("strong");
  if (summary && summaryTitle) {
    const count = Math.min(10, Math.max(1, draft.outputCount));
    summary.classList.toggle("unsafe", Boolean(reason));
    summaryTitle.textContent = reason || `一个任务 · ${count} 个${draft.seed == null ? "随机" : "相同"} Seed 顺序生成`;
  }
}

function bindCreate(): void {
  rendererApp.addPageCleanup(mountCreateClipboardController(rendererApp.context, {
    addImagePicture,
    updateH3ReferenceSlot,
    patchDraft
  }));
  rendererApp.addPageCleanup(mountCreatePageController({
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
      imageReferenceRoleLabel: (role) => imageReferenceRoleLabels[role],
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
      togglePromptModel: togglePromptModelFromUi,
      randomSeedValue,
      isEnqueueBusy: () => enqueueBusy,
      setEnqueueBusy: (value) => {
        enqueueBusy = value;
      },
      setEnqueueBusyUi
    },
    createPrompt: {
      h3ReferenceRoleLabels,
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
      togglePromptModel: togglePromptModelFromUi,
      getH3PromptBuilder: () => h3PromptBuilder,
      setH3PromptBuilder: (builder) => {
        h3PromptBuilder = builder;
      },
      createDefaultH3PromptBuilder,
      syncPromptEnqueueUi,
      updateH3PromptCheck
    },
    isEnqueueBusy: () => enqueueBusy,
    setEnqueueBusy: (value) => {
      enqueueBusy = value;
    },
    setEnqueueBusyUi,
    requestClearDraftConfirmation: () => {
      rememberModalFocus();
      pendingConfirmation = { kind: "clear-draft" };
      confirmationBusy = false;
      render();
    }
  }));
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
      upscaleDialog = {
        ...(editingWaitingTask ? { taskId: task.id } : { replaceTaskId: task.id }),
        assetId: task.sourceAssetId,
        versionId: task.sourceVersionId,
        targetHeight: task.targetHeight,
        modelId: task.modelId as typeof upscaleDialog extends { modelId: infer Model } ? Model : never,
        tileMode: task.tileMode
      };
      render();
    },
    rememberModalFocus
  }));
}

function bindUpscaleDialog(): void {
  rendererApp.addPageCleanup(mountUpscaleController(rendererApp.context, {
    getDialog: () => upscaleDialog,
    setDialog: (dialog) => {
      upscaleDialog = dialog;
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
  rendererApp.addPageCleanup(mountHistoryPageController({
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
        selectedHistoryVersionId = versionId;
        if (selectedHistoryAssetId) {
          historyForwardTarget = { assetId: selectedHistoryAssetId, versionId };
        }
        render();
      },
      selectImageHistoryVersion: (versionId) => {
        if (!selectedHistoryAssetId) return;
        selectedHistoryVersionId = versionId;
        historyForwardTarget = { assetId: selectedHistoryAssetId, versionId };
        reportUserAction("image-history-version-select", {
          projectId: selectedHistoryAssetId,
          versionId
        });
        render();
      }
    },
    media: { ...historyMediaRuntime, formatVideoDuration },
    actions: {
      setState: setRendererState,
      getSelectedHistoryAssetId: () => selectedHistoryAssetId,
      getSelectedHistoryVersionId: () => selectedHistoryVersionId,
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
      getSelectedHistoryAssetId: () => selectedHistoryAssetId,
      getSelectedHistoryVersionId: () => selectedHistoryVersionId,
      setSelectedHistoryVersionId: (versionId) => {
        selectedHistoryVersionId = versionId;
      },
      setHistoryForwardTarget: (target) => {
        historyForwardTarget = target;
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
  setRendererState(await window.studio.saveSettings(nextSettings, mode));
  settingsDraft = null;
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
    ? "设置已保存。代理已用于后续安装；请重启 ComfyUI，让 SeedVR2 等节点的运行时下载继承新代理。"
    : mode === "migrate-video-history"
      ? "设置已保存，历史视频迁移完成。"
      : "设置已保存，将对下一项尚未开始的任务生效。");
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
    environmentScanError = `环境扫描失败：${error instanceof Error ? error.message : String(error)}`;
    showMessage(environmentScanError);
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
  rendererApp.addPageCleanup(mountSettingsFieldsController(rendererApp.context, {
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
  }));
  rendererApp.addPageCleanup(mountSettingsEnvironmentController(rendererApp.context, {
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
    setCustomNodeInstalling: (nodeId) => {
      customNodeInstalling = nodeId;
    },
    getCustomNodeLog: (nodeId) => customNodeLogs[nodeId] ?? "",
    setCustomNodeLog: (nodeId, log) => {
      customNodeLogs = { ...customNodeLogs, [nodeId]: log };
    },
    setWorkflowDependencyInstalling: (workflowId) => {
      workflowDependencyInstalling = workflowId;
    },
    getWorkflowDependencyLog: (workflowId) => workflowDependencyLogs[workflowId] ?? "",
    setWorkflowDependencyLog: (workflowId, log) => {
      workflowDependencyLogs = { ...workflowDependencyLogs, [workflowId]: log };
    },
    requestForceStopConfirmation: () => {
      pendingConfirmation = { kind: "force-stop-comfy" };
      confirmationBusy = false;
    },
    rememberModalFocus
  }));
  rendererApp.addPageCleanup(mountSettingsLogsController(rendererApp.context, {
    loadAppLogs: () => {
      void loadAppLogs();
    },
    openAppLogContextMenu: appLogContextMenu.open,
    setAppLogFollowTail: (followTail) => {
      appLogFollowTail = followTail;
    }
  }));
  rendererApp.addPageCleanup(mountSettingsPageController({
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
      setRendererState(await window.studio.saveSettings(settings));
    },
    requestDirectoryMigration: (previousSettings, nextSettings, oldDirectory, newDirectory) => {
      pendingDirectoryMigration = {
        target: "video",
        previousSettings,
        nextSettings,
        oldDirectory,
        newDirectory
      };
      directoryMigrationBusy = false;
      historyMigrationProgress = null;
      render();
    },
    openImageAssetLibrary: () => {
      rememberModalFocus();
      imageAssetLibraryDialog = {
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
  }));
}

registerRendererEvents({
  studio: window.studio,
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
    pendingWindowCloseRequest = request;
  },
  setWindowCloseResponseBusy: (value) => {
    windowCloseResponseBusy = value;
  },
  setHistoryMigrationProgress: (progress) => {
    historyMigrationProgress = progress;
  },
  hasPendingDirectoryMigration: () => Boolean(pendingDirectoryMigration),
  setImageAssetLibraryProgress: (progress) => {
    imageAssetLibraryProgress = progress;
  },
  taskPreviews,
  appendAttentionAccelerationLog: (message) => {
    attentionAccelerationLog = [attentionAccelerationLog, message]
      .filter(Boolean)
      .join("\n")
      .slice(-40_000);
    return attentionAccelerationLog;
  },
  requestRender: render
});

bootstrapRenderer({
  studio: window.studio,
  setState: setRendererState,
  getState: () => state,
  setAppVersion: (version) => {
    appVersion = version;
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
