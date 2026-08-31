import "media-chrome";
import "media-chrome/menu";
import "media-chrome/lang/zh-CN.js";
import "media-chrome/lang/zh-TW.js";
import "./style.css";
import { createRendererApp } from "./renderer/app";
import { bootstrapRenderer } from "./renderer/bootstrap";
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
import { renderSettingsPage } from "./renderer/pages/settings/page";
import { renderSettingsInstallGuideDialog } from "./renderer/pages/settings/fragments";
import { mountSettingsAssembly } from "./renderer/pages/settings/assembly";
import { createRenderCoordinator, type RenderCoordinator } from "./renderer/render-coordinator";
import { EnvironmentRefreshCoordinator, type EnvironmentRefreshReason } from "./renderer/environment-refresh-coordinator";
import { readSettingsFromForm } from "./renderer/pages/settings/form";
import {
  buildSettingsPageViewModel,
  type SettingsViewModelDependencies
} from "./renderer/pages/settings/view-model";
import { createAppLogContextMenu } from "./renderer/pages/settings/log-context-menu";
import { SettingsSaveCoordinator } from "./renderer/pages/settings/settings-save-coordinator";
import {
  CustomNodeInstallQueue,
  type CustomNodeInstallPhase
} from "./renderer/pages/settings/node-install-queue";
import {
  toggleHistoryPlayerFullscreen,
  type HistoryPlaybackSnapshot
} from "./renderer/pages/history/page-controller";
import {
  createHistoryAssembly,
  mountHistoryAssembly
} from "./renderer/pages/history/assembly";
import { createHistoryContextMenus } from "./renderer/pages/history/context-menus";
import { createHistoryLayoutController } from "./renderer/pages/history/layout-controller";
import { createHistoryActions } from "./renderer/pages/history/actions";
import {
  historyAssetsByNewest,
  imageProjectsByNewest,
  preferredImageVersion,
  preferredVersion,
  versionShortEdge
} from "./renderer/pages/history/helpers";
import {
  historyFilterSignature,
  normalizeHistoryFilter
} from "./core/history-filter";
import { swapHistoryDetailFragments } from "./renderer/pages/history/detail-transition";
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
import { h3AutoPromptSeeds } from "./core/prompts/h3/auto-seeds";
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
  formatAssetBytes,
  formatBytes,
  formatFullHistoryTime,
  formatTrimTime,
  formatUpscaleEstimateRange,
  formatVideoDuration,
  historyRenderDuration,
  performanceCard,
} from "./renderer/shared/formatters";
import { icon, renderIcons } from "./renderer/shared/icons";
import { modelName, videoLoraPurposeLabel } from "./renderer/shared/labels";
import { videoLoraInfoButton } from "./renderer/shared/markup";
import {
  imageWorkflowStatus,
  isImageModelSelectable
} from "./renderer/shared/status";
import { appLogTerminalHtml, visibleAppLogText } from "./renderer/shared/logs";
import { mountShellController } from "./renderer/shell/controller";
import { mountUpscaleController } from "./renderer/shell/upscale-controller";
import { renderUpscaleDialog } from "./renderer/shell/secondary-dialogs";
import { createRendererShellCoordinator, type RendererShellCoordinator } from "./renderer/shell/coordinator";
import type {
  AppState,
  AssetVersion,
  BundledWorkflow,
  ComfyRuntimeState,
  Draft,
  EnvironmentScanResult,
  H3PromptPreset,
  H3PromptMode,
  H3ReferenceSlot,
  HistoryAsset,
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
  WorkflowCapabilities
} from "./types";
import { createClearedDraft, createDefaultImageEditDraft } from "./core/draft-defaults";
import {
  activateCreationDraft,
  creationDraftForMode,
  patchCreationDraftForMode,
  preserveLocalCreationDrafts
} from "./core/creation-drafts";
import {
  imageEditDraftFromQueueTask,
  imageEditPicturesForVersion,
  nextImagePictureNumber,
  normalizeImageEditDraft
} from "./core/image-project";
import {
  firstSupportedImageModelId,
  imageModelCapabilityFor,
  imageOutputCountMax,
  imageReferenceInputPath,
  normalizeImageTargetResolution
} from "./core/image-workflow";
import {
  isComfyMultimodalPromptModel,
  isGemmaPromptModel,
  isQwenVlPeftPromptModel
} from "./core/prompt-models";
import {
  generationSafetyForTask,
  isMiniMaxH3BoundaryExtensionModel,
  isMiniMaxH3Fl2vaModel,
  isMiniMaxH3Model,
  isMiniMaxH3R2vModel,
  motionContextMaxDurationSeconds,
  normalizeH3Steps
} from "./core/workflow";
import { resolveVideoGenerationPolicy, shouldEnableSpectrumByDefault } from "./core/video-policy";
import { modelCatalog } from "./core/catalog";
import { rewriteHuggingFaceDownloadUrl } from "./core/download-url";
import { nearestSupportedVideoResolution } from "./core/video-resolution";
import { ensureMotionContextSourceSlot } from "./core/h3-reference";
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
const modalRoot = document.querySelector<HTMLDivElement>("#modal-root")!;
const rendererEntry = createWindowRendererEntry();
const rendererDependencies = rendererEntry.dependencies;
const rendererApplication = rendererDependencies.application;
const rendererEvents = rendererDependencies.events;
const rendererAssets = rendererDependencies.assets;
const rendererHostCapabilities = rendererDependencies.hostCapabilities;
let shellCoordinator: RendererShellCoordinator;
let settingsSaveCoordinator: SettingsSaveCoordinator;
let draftSaveTimer: number | undefined;
let draftRevision = 0;
let draftSaveInFlight = 0;
let draftDirty = false;
let imageDraftSaveTimer: number | undefined;
let imageDraftRevision = 0;
let imageDraftSaveInFlight = 0;
let imageDraftDirty = false;
let environmentScan: EnvironmentScanResult | null = null;
let environmentScanning = false;
let settingsSaving = false;
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
let attentionAccelerationInstalling = false;
let attentionAccelerationLog = "";
let llamaCppPythonInstalling = false;
let llamaCppPythonLog = "";
let settingsDraft: Settings | null = null;
let settingsTab: "comfyui" | "system" | "acceleration" | "video" | "lora" | "image" | "nodes" | "prompt" | "upscale" | "logs" = "comfyui";
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
let comfyRuntime: ComfyRuntimeState = {
  phase: "unknown",
  ownership: "unknown",
  endpoint: "",
  message: "",
  updatedAt: new Date(0).toISOString(),
  operationId: 0
};
interface CreationModeUiState {
  promptEnhanceMode: PromptEnhanceMode;
  h3PromptPreset: H3PromptPreset;
}
const creationModeUiState: Record<CreationMode, CreationModeUiState> = {
  "image-to-video": {
    promptEnhanceMode: "sulphur-native",
    h3PromptPreset: "official-storyboard"
  },
  "video-extension": {
    promptEnhanceMode: "sulphur-native",
    h3PromptPreset: "official-storyboard"
  },
  "image-edit": {
    promptEnhanceMode: "sulphur-native",
    h3PromptPreset: "official-storyboard"
  }
};
const activeCreationModeUiState = (): CreationModeUiState => creationModeUiState[creationMode];
let settingsH3PromptPreset: H3PromptPreset = "official-storyboard";
let settingsImagePromptPreset: ImagePromptPreset = "faithful";
const promptEditHistory = new PromptEditHistory();

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
  const origin = creationMode;
  const modeUiState = activeCreationModeUiState();
  const promptRuntimeView = shellCoordinator.promptRuntimeView(origin);
  const ownsActivePrompt = shellCoordinator.promptOperationBelongsTo(origin);
  return {
    t: uiText,
    state,
    environmentScan,
    performanceMetrics,
    workflowCapabilities,
    bundledWorkflows,
    promptEnhanceMode: modeUiState.promptEnhanceMode,
    h3PromptPreset: modeUiState.h3PromptPreset,
    promptEnhancing: promptRuntimeView.right.action === "cancel",
    promptStarting: shellCoordinator.getPromptStarting(),
    promptReleasing: shellCoordinator.getPromptReleasing(),
    promptRuntimeLoaded: shellCoordinator.getPromptRuntimeLoaded(),
    promptProgress: ownsActivePrompt ? shellCoordinator.getPromptProgress() : null,
    enqueueBusy: ui.enqueueBusy,
    promptRuntimeControlTitle,
    promptRuntimeControlIcon,
    promptRuntimeView
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

function installGuideDialogHtml(): string {
  if (page !== "settings") return "";
  return renderSettingsInstallGuideDialog(
    {
      selectedInstallGuide,
      configuredModelDirectory:
        environmentScan?.modelDirectory ||
        settingsDraft?.modelDirectory ||
        state.settings.modelDirectory ||
        "ComfyUI\\models"
    },
    {
      icon,
      escapeHtml,
      t: rendererApp.context.t,
      locale: state.settings.uiLocale
    }
  );
}

function bindInstallGuideDialog(): void {
  if (page !== "settings" || !selectedInstallGuide) return;
  const close = () => {
    selectedInstallGuide = null;
    renderOverlay();
    restoreModalFocus();
  };
  modalRoot.querySelector("#close-install-guide")?.addEventListener("click", close);
  modalRoot.querySelector("#dismiss-install-guide")?.addEventListener("click", close);
  modalRoot.querySelector("#install-guide-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) close();
  });
  modalRoot.querySelector("#open-install-download")?.addEventListener("click", async () => {
    const guide = selectedInstallGuide?.component.installGuide;
    if (!guide) return;
    const url = rewriteHuggingFaceDownloadUrl(
      guide.downloadUrl,
      (settingsDraft ?? state.settings).hfMirrorEnabled
    );
    const opened = await rendererHostCapabilities.openExternal(url);
    if (!opened) showMessage(uiText(uiKeys.settings.actions.downloadPageFailed), { kind: "error" });
  });
  modalRoot.querySelector("#open-install-directory")?.addEventListener("click", async (event) => {
    const directory = (event.currentTarget as HTMLButtonElement).dataset.installDirectory?.trim();
    if (!directory) return;
    const opened = await rendererHostCapabilities.openDirectory(directory);
    if (!opened) showMessage(uiText(uiKeys.settings.actions.openDirectoryFailed), { kind: "error" });
  });
  const dialog = modalRoot.querySelector<HTMLElement>(".install-guide-dialog");
  if (dialog) bindModalFocus(dialog, close, "#dismiss-install-guide");
}

function draftFromQueueTask(task: QueueTask): Draft | null {
  if (task.taskType === "upscale" || task.taskType === "image-generation" || task.status === "running") return null;
  const now = new Date().toISOString();
  const resolution = [360, 480, 540, 720, 768].includes(task.resolution)
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
    endImageWidth: task.taskType === "generation" ? task.endImageWidth ?? 0 : 0,
    endImageHeight: task.taskType === "generation" ? task.endImageHeight ?? 0 : 0,
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
    h3ReferenceSlots: extension
      ? task.taskType === "extension" && isMiniMaxH3R2vModel(task.modelId)
        ? ensureMotionContextSourceSlot(task.h3ReferenceSlots ?? [], task.sourceVideoPath)
        : []
      : (task.h3ReferenceSlots ?? []).map((slot) => ({ ...slot })),
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
      setRendererState(await rendererApplication.saveImageDraft(imageDraft));
      setRendererState(await rendererApplication.removeTask(taskId));
      queueActionBusy = null;
      navigateToCreationMode("image-edit");
      showMessage(uiText(uiKeys.runtime.queueImageReturned));
      return;
    }
    const draft = draftFromQueueTask(task);
    if (!draft) return;
    await saveDraftImmediately(draft);
    setRendererState(await rendererApplication.removeTask(taskId));
    queueActionBusy = null;
    navigateToCreationMode(draft.inputMode === "video" ? "video-extension" : "image-to-video");
    showMessage(uiText(uiKeys.runtime.queueReturned));
  } catch (error) {
    queueActionBusy = null;
    showMessage(error instanceof Error ? error.message : uiText(uiKeys.runtime.cannotEditQueue), { kind: "error" });
  }
}

function enableSpectrumByDefaultIfAvailable(
  mode?: Exclude<CreationMode, "image-edit">
): void {
  const spectrumNode = environmentScan?.customNodes.find(
    (node) => node.id === "spectrum-minimax-h3"
  );
  const draft = mode
    ? creationDraftForMode(state, mode === "video-extension" ? "video" : "image")
    : state?.draft;
  if (!draft || !shouldEnableSpectrumByDefault(draft, spectrumNode)) return;
  if (mode) patchDraftForMode(mode, () => ({ spectrumMode: "balanced" }));
  else patchDraft({ spectrumMode: "balanced" });
}


function settingsHaveUnsavedChanges(): boolean {
  return settingsDraft !== null &&
    !structurallyEqual(settingsDraft, state.settings);
}

function syncSettingsDirtyUi(): void {
  const dirty = settingsHaveUnsavedChanges();
  const setSettingsDirty = rendererApplication.setSettingsDirty;
  if (setSettingsDirty) void setSettingsDirty(dirty).catch(() => undefined);
  const actionBar = document.querySelector<HTMLElement>(".settings-heading-actions");
  actionBar?.classList.toggle("is-dirty", dirty || settingsSaving);
  actionBar?.classList.toggle("is-clean", !dirty && !settingsSaving);
  const status = document.querySelector<HTMLElement>(".settings-heading-actions .save-state");
  status?.classList.toggle("dirty", dirty);
  if (status) status.textContent = settingsSaving
    ? uiText(uiKeys.settings.saving)
    : dirty
      ? uiText(uiKeys.runtime.unsavedChanges)
      : "";
  document.querySelector<HTMLButtonElement>("#discard-settings")?.toggleAttribute("disabled", !dirty || settingsSaving);
  const saveButton = document.querySelector<HTMLButtonElement>("#save-settings");
  saveButton?.toggleAttribute("disabled", !dirty || settingsSaving);
  saveButton?.setAttribute("aria-busy", String(settingsSaving));
}

function settingsPage(): string {
  return renderSettingsPage(
    buildSettingsPageViewModel({
      state,
      settingsDraft,
      settingsSaving,
      environmentScan,
      comfyConnected: comfyRuntime.phase === "unknown"
        ? undefined
        : comfyRuntime.phase === "ready",
      environmentScanning,
      environmentScanError,
      settingsTab,
      settingsH3PromptPreset,
      settingsImagePromptPreset,
      promptRuntimeLoaded: shellCoordinator.getPromptRuntimeLoaded(),
      promptStarting: shellCoordinator.getPromptStarting(),
      promptEnhancing: shellCoordinator.getPromptEnhancing(),
      promptReleasing: shellCoordinator.getPromptReleasing(),
      serviceStarting: serviceStarting ?? (comfyRuntime.phase === "starting" ? "comfy" : null),
      serviceRestarting: serviceRestarting ?? (comfyRuntime.phase === "restarting" ? "comfy" : null),
      serviceForceStopping,
      serviceStatusMessage: serviceStatusMessage || comfyRuntime.message,
      comfyUpdating,
      comfyUpdateLog,
      environmentRepairing,
      environmentRepairLogs,
      customNodeInstalling,
      customNodeInstallQueue,
      customNodeInstallBatch,
      customNodeInstallPhase,
      customNodeLogs,
      attentionAccelerationInstalling,
      attentionAccelerationLog,
      llamaCppPythonInstalling,
      llamaCppPythonLog,
      selectedInstallGuide,
      appLogs: shellCoordinator.getAppLogs(),
      appLogsLoading: shellCoordinator.getAppLogsLoading(),
      appLogsError: shellCoordinator.getAppLogsError(),
      settingsHaveUnsavedChanges,
      promptRuntimeControlIcon,
      promptRuntimeControlTitle
    } satisfies SettingsViewModelDependencies),
    {
      t: rendererApp.context.t,
      defaultH3PromptPresets: h3PromptPackFor(state.settings.uiLocale).defaultPresets,
      h3AutoPromptSeeds,
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
      isQwenVlPeftPromptModel,
      videoLoraInfoButton: (profileId) => {
        const lora = BUILTIN_VIDEO_LORAS.find((item) => item.id === profileId);
        return lora ? videoLoraInfoButton(lora, uiText, state.settings.uiLocale) : "";
      },
      isImageModelSelectable,
      imageWorkflowStatus,
      h3PromptPresetOptions: (selected, includeMultiReference) => h3PromptPresetOptions(selected, includeMultiReference, state.settings.uiLocale),
      renderAppLogTerminal: (text) => appLogTerminalHtml(visibleAppLogText(text, shellCoordinator.getAppLogScreenClearedAt()), uiText(uiKeys.settings.logsEmpty))
    }
  );
}

function render(): void {
  appElement.removeAttribute("aria-busy");
  rendererApp.render();
}

let renderCoordinator: RenderCoordinator;
function requestRendererRefresh(): void {
  renderCoordinator.requestRender();
}
let activeHistoryCleanup: RendererCleanup | null = null;
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
    history: () => historyAssembly.renderList(rendererApp.context),
    historyDetail: () => historyAssembly.renderDetail(rendererApp.context, "video"),
    imageHistoryDetail: () => historyAssembly.renderDetail(rendererApp.context, "image"),
    settings: settingsPage
  },
  beforeRenderHistory: historyLayoutController.beforeRender,
  closeAppLogContextMenu: appLogContextMenu.close,
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
  bindHistoryViewportControls: historyLayoutController.bindViewportControls,
  restoreQueueScrollPosition: queueScrollController.restoreScrollPosition,
  restoreHistoryScrollPosition: historyLayoutController.restoreScrollPosition,
  syncAppLogPolling,
  icon,
  escapeHtml
  });
}

const historyMediaRuntime = createHistoryMediaRuntime(
  rendererApp.context,
  () => page === "history"
);
const historyLayoutController = createHistoryLayoutController(
  rendererApp.context,
  reportUserAction,
  () => historyFilterSignature(ui.historyFilter)
);
const queueScrollController = createQueueScrollController(() => page);
const queueAssembly = createQueueAssembly({
  getState: () => state,
  getPerformanceMetrics: () => performanceMetrics,
  getComfyRuntime: () => comfyRuntime,
  isEnvironmentScanning: () => environmentScanning,
  getTaskPreviews: () => taskPreviews,
  getQueueActionBusy: () => queueActionBusy,
  setState: setRendererState,
  setPromptRuntimeLoaded: (loaded) => shellCoordinator.setPromptRuntimeLoaded(loaded),
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
    renderOverlay();
  },
  rememberModalFocus
});
const historyAssembly = createHistoryAssembly({
  getState: () => state,
  getHistoryKind: () => historyKind,
  getHistoryLayout: () => historyLayoutController.getLayout(),
  getHistoryFilter: () => ui.historyFilter,
  isHistoryFilterPanelOpen: () => ui.historyFilterPanelOpen,
  getSelectedHistoryAssetId: () => ui.selectedHistoryAssetId,
  getSelectedHistoryVersionId: () => ui.selectedHistoryVersionId,
  setSelectedHistoryVersionId: (versionId) => {
    ui.selectedHistoryVersionId = versionId;
  },
  setHistoryKind,
  navigateToHistory: () => setPage("history")
});
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
  requestHistoryDeletion,
  toggleHistoryPlayerFullscreen
});
const appLogContextMenu = createAppLogContextMenu(rendererApp.context, clearAppLogScreen);
const environmentRefreshCoordinator = new EnvironmentRefreshCoordinator({
  scan: (settings, scope) => rendererApplication.scanEnvironment(settings, scope),
  setScanning: (value) => {
    environmentScanning = value;
  },
  setError: (message) => {
    environmentScanError = message;
  },
  commit: (scan) => {
    environmentScan = scan;
  },
  afterCommit: () => enableSpectrumByDefaultIfAvailable(),
  notify: showMessage,
  scanningMessage: () => uiText(uiKeys.runtime.environmentScanning),
  completedMessage: () => uiText(uiKeys.runtime.environmentScanCompleted),
  failedMessage: (error, reason) => uiText(
    reason === "startup" ? uiKeys.runtime.startupScanFailed : uiKeys.runtime.environmentScanFailed,
    { error: error instanceof Error ? error.message : String(error) }
  ),
  requestRender: render,
  reportScan: (reason) => reportUserAction("scan-environment", { reason })
});
const customNodeInstallManager = new CustomNodeInstallQueue({
  install: (nodeId, settings, mode) => rendererApplication.installCustomNode(nodeId, settings, mode),
  restart: (settings) => rendererApplication.restartLocalService("comfy", settings),
  scan: (settings) => environmentRefreshCoordinator.refresh(settings, "dependency-change"),
  nodeName: (nodeId) => environmentScan?.customNodes.find((node) => node.id === nodeId)?.name ?? nodeId,
  getLog: (nodeId) => customNodeLogs[nodeId] ?? "",
  setLog: (nodeId, log) => {
    customNodeLogs = { ...customNodeLogs, [nodeId]: log };
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
    manualRestartRequired: (message) => uiText(
      uiKeys.settings.actions.nodeManualRestartRequired,
      { message }
    ),
    readyCheckFailed: (name, detail) => uiText(
      uiKeys.settings.actions.nodeBatchReadyCheckFailed,
      { name, detail: detail || "节点未注册或运行时未返回详情" }
    ),
    completed: (success, failed) => uiText(
      uiKeys.settings.actions.nodeBatchCompleted,
      { success, failed }
    )
  }
});
const queueLiveStatus = createQueueLiveStatus({
  application: rendererApplication,
  t: rendererApp.context.t,
  getState: () => state,
  getPage: () => page,
  getComfyRuntimeState: () => comfyRuntime,
  getEnvironmentScanning: () => environmentScanning,
  setPerformanceMetrics: (metrics) => {
    performanceMetrics = metrics;
  }
});
queueLiveStatus.start();

function reportUserAction(action: string, meta?: Record<string, unknown>): void {
  void action;
  void meta;
}

function requestHistoryDeletion(assetId: string): void {
  const asset = state.history.find((item) => item.id === assetId);
  const project = state.imageHistory.find((item) => item.id === assetId);
  const title = asset?.title ?? project?.title;
  if (!title) return;
  if (page === "history") historyLayoutController.captureHistoryScrollPosition();
  rememberModalFocus();
  ui.pendingConfirmation = {
    kind: "delete-history",
    assetId,
    title
  };
  ui.confirmationBusy = false;
  renderOverlay();
}

function requestHistoryVersionDeletion(assetId: string, versionId: string): void {
  const asset = state.history.find((item) => item.id === assetId);
  const version = asset?.versions.find((item) => item.id === versionId);
  if (!asset || !version || asset.versions.length <= 1) return;
  if (page === "history") historyLayoutController.captureHistoryScrollPosition();
  rememberModalFocus();
  ui.pendingConfirmation = {
    kind: "delete-video-version",
    assetId,
    versionId,
    title: uiText(uiKeys.runtime.historyVersionTitle, {
      title: asset.title,
      version: `${version.width} × ${version.height}`
    })
  };
  ui.confirmationBusy = false;
  renderOverlay();
}

function requestImageVersionDeletion(projectId: string, versionId: string): void {
  const project = state.imageHistory.find((item) => item.id === projectId);
  const version = project?.versions.find((item) => item.id === versionId);
  if (!project || !version || version.kind === "source") return;
  if (page === "history") historyLayoutController.captureHistoryScrollPosition();
  rememberModalFocus();
  ui.pendingConfirmation = {
    kind: "delete-image-version",
    projectId,
    versionId,
    title: uiText(uiKeys.runtime.historyVersionTitle, { title: project.title, version: version.versionNumber })
  };
  ui.confirmationBusy = false;
  renderOverlay();
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
  renderOverlay();
}

function historyPlayerIsFullscreen(): boolean {
  return Boolean(document.fullscreenElement?.closest(".history-player"));
}

function restoreHistoryPlayerFullscreen(): void {
  const target = document.querySelector<HTMLElement>(".history-player") ??
    document.querySelector<HTMLVideoElement>(".history-player video");
  if (!target?.requestFullscreen) return;
  void target.requestFullscreen().catch(() => undefined);
}

function updateHistoryDetailInPlace(): boolean {
  const currentPlayer = document.querySelector<HTMLElement>(".history-player");
  if (!currentPlayer) return false;

  const nextMarkup = document.createElement("div");
  nextMarkup.innerHTML = historyAssembly.renderDetail(rendererApp.context, "video");
  const nextPlayer = nextMarkup.querySelector<HTMLElement>(".history-player");
  if (!nextPlayer || !swapHistoryDetailFragments({
    currentRoot: document,
    nextRoot: nextMarkup,
    currentPlayer,
    nextPlayer
  })) {
    return false;
  }

  const nextBack = document.querySelector<HTMLElement>(".history-detail-back");
  if (!nextBack) return false;
  // The shell controller owns the global Page Up/Page Down listeners.  The
  // fullscreen fast path only replaces detail fragments, so keep that shell
  // binding untouched and let bindHistory rotate the detail-controller
  // cleanup before attaching listeners to the newly-created fragments.
  nextBack.querySelector<HTMLButtonElement>("[data-page=history]")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    returnToHistory();
  });
  renderIcons(appElement);
  bindHistory();
  return true;
}

function openHistoryDetail(assetId: string, versionId?: string): void {
  const preserveFullscreen = page === "history-detail" && historyPlayerIsFullscreen();
  if (page === "history") historyLayoutController.captureHistoryScrollPosition();
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
  if (page === "history") historyLayoutController.captureHistoryScrollPosition();
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
  if (mode === "video-extension" && isMiniMaxH3R2vModel(state.draft.modelId)) {
    const maxDuration = motionContextMaxDurationSeconds();
    if (state.draft.duration > maxDuration) {
      patchDraft({ duration: maxDuration });
    }
  }
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
  const orderedHistory = historyAssetsByNewest(state.history, ui.historyFilter);
  const currentIndex = orderedHistory.findIndex(
    (item) => item.id === ui.selectedHistoryAssetId
  );
  const nextAsset = orderedHistory[currentIndex + direction];
  if (!nextAsset) return;
  openHistoryDetail(nextAsset.id);
}

function navigateImageHistoryDetail(direction: -1 | 1): void {
  if (page !== "image-history-detail") return;
  const orderedProjects = imageProjectsByNewest(state.imageHistory, ui.historyFilter);
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
    captureHistoryScrollPosition: historyLayoutController.captureHistoryScrollPosition,
    setHistoryScrollRestorePending: historyLayoutController.setScrollRestorePending,
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

function scheduleDraftSave(): void {
  window.clearTimeout(draftSaveTimer);
  draftSaveTimer = window.setTimeout(async () => {
    const revision = draftRevision;
    const draftToSave = state.draft;
    draftSaveInFlight += 1;
    try {
      const savedState = await rendererApplication.saveDraft(draftToSave, {
        imageToVideoDraft: state.imageToVideoDraft,
        videoExtensionDraft: state.videoExtensionDraft
      });
      const localDraft = state.draft;
      const localImageToVideoDraft = state.imageToVideoDraft;
      const localVideoExtensionDraft = state.videoExtensionDraft;
      setRendererState({
        ...savedState,
        draft: localDraft,
        imageToVideoDraft: localImageToVideoDraft,
        videoExtensionDraft: localVideoExtensionDraft
      });
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
    imageDraftSaveInFlight += 1;
    try {
      const savedState = await rendererApplication.saveImageDraft(draftToSave);
      if (revision === imageDraftRevision) {
        setRendererState({
          ...preserveLocalCreationDrafts(savedState, state),
          imageDraft: draftToSave
        });
        imageDraftDirty = false;
      }
    } catch (error) {
      showMessage(error instanceof Error ? error.message : uiText(uiKeys.runtime.imageDraftSaveFailed), { kind: "error" });
    } finally {
      imageDraftSaveInFlight -= 1;
    }
  }, 350);
}

async function ensureDraftWorkflowCapability(draft: Draft): Promise<void> {
  try {
    const workflowModelId = bundledWorkflowModelId(draft);
    const key = bundledWorkflowKey(workflowModelId, draft.inputMode);
    const bundled = bundledWorkflows[key] ??
      await rendererApplication.getBundledWorkflow(workflowModelId, draft.inputMode);
    if (bundled) {
      bundledWorkflows[key] = bundled;
      workflowCapabilities[bundled.path] = {
        supportsEndImage: bundled.supportsEndImage,
        supportsVideoExtension: bundled.supportsVideoExtension
      };
    }
    if (draft.workflowPath && draft.workflowPath !== bundled?.path) {
      const capability = await rendererApplication.inspectWorkflow(
        draft.workflowPath,
        draft.modelId
      );
      if (
        state.draft.workflowPath === draft.workflowPath &&
        state.draft.modelId === draft.modelId
      ) {
        workflowCapabilities[draft.workflowPath] = capability;
      }
    }
  } catch (error) {
    await rendererApplication.reportRendererError(
      error instanceof Error ? error.message : String(error),
      { source: "draft-workflow-capability" }
    ).catch(() => undefined);
  }
}

async function saveDraftImmediately(draft: Draft): Promise<void> {
  window.clearTimeout(draftSaveTimer);
  draftRevision += 1;
  const revision = draftRevision;
  draftDirty = false;
  activateCreationDraft(state, draft);
  const workflowCapabilityPromise = ensureDraftWorkflowCapability(draft);
  draftSaveInFlight += 1;
  try {
    const [savedState] = await Promise.all([
      rendererApplication.saveDraft(state.draft, {
        imageToVideoDraft: state.imageToVideoDraft,
        videoExtensionDraft: state.videoExtensionDraft
      }),
      workflowCapabilityPromise
    ]);
    setRendererState(preserveLocalCreationDrafts(savedState, state));
    if (revision === draftRevision) draftDirty = false;
  } finally {
    draftSaveInFlight -= 1;
  }
}

function patchDraft(patch: Partial<Draft>): void {
  activateCreationDraft(state, { ...state.draft, ...patch });
  draftRevision += 1;
  draftDirty = true;
  scheduleDraftSave();
}

function patchDraftForMode(
  mode: Exclude<CreationMode, "image-edit">,
  update: (draft: Draft) => Partial<Draft>
): void {
  const inputMode = mode === "video-extension" ? "video" : "image";
  const nextDraft = patchCreationDraftForMode(
    state,
    inputMode,
    update,
    creationMode === mode
  );
  if (!nextDraft) return;
  draftRevision += 1;
  draftDirty = true;
  scheduleDraftSave();
}

function patchImageDraft(patch: Partial<ImageEditDraft>): void {
  state.imageDraft = normalizeImageEditDraft({ ...state.imageDraft, ...patch });
  imageDraftRevision += 1;
  imageDraftDirty = true;
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
    const previewPath = picture.markup?.renderedPath || imageReferenceInputPath(picture);
    const dataUrl = await rendererAssets.readImage(previewPath).catch(() => null);
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

function sameImageCrop(
  left: ImageReference["crop"] | null | undefined,
  right: { x: number; y: number; width: number; height: number; sourceWidth: number; sourceHeight: number } | null
): boolean {
  if (!left || !right) return !left && !right;
  return left.x === right.x && left.y === right.y &&
    left.width === right.width && left.height === right.height &&
    left.sourceWidth === right.sourceWidth && left.sourceHeight === right.sourceHeight;
}

async function editImagePictureMarkup(
  pictureId: string,
  requestedMode: "annotation" | "mask" = "annotation"
): Promise<void> {
  const picture = state.imageDraft.pictures.find((item) => item.id === pictureId);
  if (!picture?.absolutePath) return;
  const maskMode = requestedMode === "mask" ||
    (requestedMode === "annotation" && imageModelCapabilityFor(state.imageDraft.modelId).requiresMask === true);
  try {
    const { openImageMarkupEditor } = await import("./image-markup-editor");
    const [sourceDataUrl, existingDocument] = await Promise.all([
      rendererAssets.readImage(picture.absolutePath),
      (maskMode ? picture.mask?.documentPath : picture.markup?.documentPath)
        ? rendererAssets.readImageMarkup((maskMode ? picture.mask?.documentPath : picture.markup?.documentPath)!)
        : Promise.resolve(null)
    ]);
    if (!sourceDataUrl) throw new Error(uiText(uiKeys.runtime.readOriginalImageFailed));
    const result = await openImageMarkupEditor({
      pictureNumber: picture.pictureNumber,
      filename: picture.absolutePath,
      sourceDataUrl,
      existingDocument,
      existingCrop: picture.crop,
      mode: maskMode ? "mask" : "annotation"
    });
    if (!result) return;
    const cropChanged = !sameImageCrop(picture.crop, result.crop);
    let crop = picture.crop;
    if (cropChanged) {
      crop = result.crop
        ? (await rendererAssets.saveImageCrop({
            pictureId: picture.id,
            sourcePath: picture.absolutePath,
            crop: result.crop,
            croppedPng: result.croppedPng,
            previousRevision: picture.crop?.revision
          })) ?? undefined
        : undefined;
    }
    const width = result.crop?.width ?? picture.crop?.sourceWidth ?? picture.width;
    const height = result.crop?.height ?? picture.crop?.sourceHeight ?? picture.height;
    if (maskMode) {
      const mask = result.objectCount > 0
        ? await rendererAssets.saveImageMask({
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
          item.id === pictureId ? { ...item, crop, width, height, mask } : item
        )
      });
      render();
      void loadImageEditPreviews();
      showMessage(mask ? `Mask 已保存 · ${mask.regionCount} 个区域` : "Mask 已清除", true);
      return;
    }
    const markup = result.objectCount > 0
      ? await rendererAssets.saveImageMarkup({
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
        item.id === pictureId ? { ...item, crop, width, height, markup } : item
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
    pictures: [...pictures, slot].sort((left, right) => left.pictureNumber - right.pictureNumber),
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
          ? { ...picture, absolutePath: path, width: 0, height: 0, crop: undefined, markup: undefined, mask: undefined }
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
    pictures: [...pictures, picture].sort((left, right) => left.pictureNumber - right.pictureNumber),
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
      slot.id === slotId
        ? {
            ...slot,
            ...patch,
            ...((patch.mediaType !== undefined && patch.mediaType !== slot.mediaType) ||
              (patch.mediaPath !== undefined && patch.mediaPath !== slot.mediaPath)
              ? { width: undefined, height: undefined }
              : {})
          }
        : slot
    )
  });
}

function bindH3ReferenceSlots(): void {
  rendererApp.addPageCleanup(mountH3ReferencesController(rendererApp.context, {
    getDraft: () => state?.draft,
    patchDraft,
    requestRender: render,
    notify: (message) => showMessage(message, false),
    lockedFirstVideo: Boolean(state?.draft.inputMode === "video" && isMiniMaxH3R2vModel(state.draft.modelId))
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
    resolution?: number;
    resetSeed?: boolean;
  },
  renderAfterSave = true
): Promise<void> {
  const preserveMotionContextDraft = state.draft.inputMode === "video" &&
    isMiniMaxH3R2vModel(state.draft.modelId);
  const draft: Draft = {
    ...state.draft,
    inputMode: "video",
    startImagePath: "",
    endImagePath: "",
    endImageWidth: 0,
    endImageHeight: 0,
    sourceVideoPath: filename,
    sourceVideoDuration: source?.duration ?? 0,
    trimStartSeconds: 0,
    trimEndSeconds: source?.duration ?? 0,
    sourceAssetId: source?.assetId,
    sourceVersionId: source?.versionId,
    h3ContextLatentPath: source?.h3ContextLatentPath,
    sourceWidth: source?.width ?? 0,
    sourceHeight: source?.height ?? 0,
    ratio: "source",
    h3ReferenceSlots: isMiniMaxH3R2vModel(state.draft.modelId)
      ? ensureMotionContextSourceSlot(
          preserveMotionContextDraft ? state.draft.h3ReferenceSlots : [],
          filename
        )
      : [],
    ...(source?.resolution != null
      ? {
          resolution: nearestSupportedVideoResolution(
            source.resolution,
            modelCatalog.get(state.draft.modelId)?.definition.capabilities?.resolutions ??
              modelCatalog.get(state.settings.defaultExtensionModel)?.definition.capabilities?.resolutions ??
              [360, 480, 540, 720, 768],
            state.draft.resolution
          ) as Draft["resolution"]
        }
      : {}),
    ...(source?.resetSeed ? { seed: null } : {})
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
  const viewModel = buildVideoCreatePageViewModel(createViewModelDependencies());
  const reason = viewModel.enqueueBlockReason;
  button.dataset.enqueueBlockReason = reason;
  button.disabled = Boolean(reason) || ui.enqueueBusy;
  button.title = reason || button.dataset.enqueueReadyTitle || uiText(uiKeys.runtime.enqueue);
  const tokenEstimate = document.querySelector<HTMLElement>("[data-h3-token-estimate]");
  if (tokenEstimate) {
    tokenEstimate.textContent = viewModel.h3TokenEstimate == null
      ? ""
      : `${Math.trunc(viewModel.h3TokenEstimate)} tokens`;
  }
  const feedback = document.querySelector<HTMLElement>("[data-enqueue-feedback]");
  if (feedback) {
    feedback.hidden = !reason;
    const message = feedback.querySelector<HTMLElement>("span");
    if (message) message.textContent = reason;
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
  const imageCapability = imageModelCapabilityFor(draft.modelId);
  const button = document.querySelector<HTMLButtonElement>("#enqueue-image-edit");
  if (button) {
    button.disabled = Boolean(reason) || ui.enqueueBusy;
    button.title = reason || uiText(uiKeys.runtime.imageEnqueue);
    button.dataset.enqueueBlockReason = reason;
  }
  const feedback = document.querySelector<HTMLElement>("[data-enqueue-feedback]");
  if (feedback) {
    feedback.hidden = !reason;
    const message = feedback.querySelector<HTMLElement>("span");
    if (message) message.textContent = reason;
  }
  const summaryTitle = document.querySelector<HTMLElement>(
    ".image-edit-composer .interpolation-summary strong"
  );
  if (summaryTitle) {
    const count = imageCapability.deterministic ? 1 : Math.min(imageOutputCountMax, Math.max(1, draft.outputCount));
    summaryTitle.textContent = imageCapability.requiresPrompt === false
      ? uiText(imageCapability.operation === "background-removal"
        ? uiKeys.create.imageEdit.promptlessBackgroundRemovalSummary
        : uiKeys.create.imageEdit.promptlessLocalRemovalSummary, { count })
      : uiText(uiKeys.create.imageEdit.summary, {
        count,
        seedMode: draft.seed == null ? uiText(uiKeys.runtime.random) : uiText(uiKeys.runtime.same)
      });
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
    patchDraftForMode,
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
      getPromptEnhanceMode: () => activeCreationModeUiState().promptEnhanceMode === "faithful" ? "faithful" : "detail-enhance",
      setPromptEnhanceMode: (mode) => {
        activeCreationModeUiState().promptEnhanceMode = mode === "faithful" ? "faithful" : "sulphur-native";
      },
      isPromptEnhancing: () => shellCoordinator.promptOperationBelongsTo("image-edit"),
      setPromptEnhancing: (value) => shellCoordinator.setPromptEnhancing(value),
      setPromptRuntimeLoaded: (value) => shellCoordinator.setPromptRuntimeLoaded(value),
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
      setEnqueueBusyUi,
      requestClearDraftConfirmation: () => shellCoordinator.requestConfirmation({ kind: "clear-draft", mode: "image-edit" })
    },
    createPrompt: {
      h3ReferenceRoleLabels: h3PromptPackFor(state.settings.uiLocale).referenceRoleLabels,
      h3ReferenceRolePromptLabels,
      getPromptEnhanceMode: () => activeCreationModeUiState().promptEnhanceMode,
      setPromptEnhanceMode: (mode) => {
        activeCreationModeUiState().promptEnhanceMode = mode;
      },
      getH3PromptPreset: () => activeCreationModeUiState().h3PromptPreset,
      setH3PromptPreset: (preset) => {
        activeCreationModeUiState().h3PromptPreset = preset;
      },
      isPromptEnhancing: () => shellCoordinator.promptOperationBelongsTo(creationMode),
      setPromptEnhancing: (value) => shellCoordinator.setPromptEnhancing(value),
      setPromptRuntimeLoaded: (value) => shellCoordinator.setPromptRuntimeLoaded(value),
      clearPromptVersion: () => clearPromptVersionForScope("video"),
      undoPromptEdit: () => undoPromptEdit("video"),
      redoPromptEdit: () => redoPromptEdit("video"),
      invalidatePromptEditHistory: () => invalidatePromptEditHistory("video"),
      togglePromptModel: togglePromptModelFromUi,
      syncPromptEnqueueUi,
      updateH3PromptCheck
    },
    isEnqueueBusy: () => ui.enqueueBusy,
    setEnqueueBusy: (value) => {
      ui.enqueueBusy = value;
    },
    setEnqueueBusyUi,
    requestClearDraftConfirmation: () => shellCoordinator.requestConfirmation({ kind: "clear-draft", mode: creationMode })
  }));
  if (creationMode === "image-edit") {
    void loadImageEditPreviews();
  } else {
    void loadImagePreview(rendererApp.context, state.draft.startImagePath, "start-preview", patchDraft);
    const endImagePath = state.draft.endImagePath;
    void loadImagePreview(
      rendererApp.context,
      endImagePath,
      "end-preview",
      patchDraft,
      ({ width, height }) => {
        const currentState = rendererApp.context.getState();
        const currentDraft = currentState?.draft;
        if (!currentDraft || currentDraft.endImagePath !== endImagePath ||
          (currentDraft.endImageWidth === width && currentDraft.endImageHeight === height)) {
          return undefined;
        }
        return { endImageWidth: width, endImageHeight: height };
      }
    );
    if (isMiniMaxH3R2vModel(state.draft.modelId)) {
      bindH3ReferenceSlots();
      for (const slot of state.draft.h3ReferenceSlots) {
        if (slot.mediaType === "image") {
          const slotId = slot.id;
          const slotPath = slot.mediaPath;
          void loadImagePreview(
            rendererApp.context,
            slotPath,
            `h3-slot-preview-${slotId}`,
            patchDraft,
            ({ width, height }) => {
              const currentDraft = rendererApp.context.getState()?.draft;
              const currentSlot = currentDraft?.h3ReferenceSlots.find((item) => item.id === slotId);
              if (!currentDraft || !currentSlot || currentSlot.mediaType !== "image" ||
                currentSlot.mediaPath !== slotPath ||
                (currentSlot.width === width && currentSlot.height === height)) {
                return undefined;
              }
              return {
                h3ReferenceSlots: currentDraft.h3ReferenceSlots.map((item) =>
                  item.id === slotId ? { ...item, width, height } : item
                )
              };
            }
          );
        }
      }
    }
  }
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

function bindHistory(playback: HistoryPlaybackSnapshot | null = null): void {
  activeHistoryCleanup?.();
  const cleanup = mountHistoryAssembly({
    context: rendererApp.context,
    playback,
    navigation: {
      setHistoryKind: (kind) => {
        setHistoryKind(kind);
        if (kind === "image" && ui.historyFilter.minDuration !== null) {
          ui.historyFilter = normalizeHistoryFilter({ ...ui.historyFilter, minDuration: null });
        }
      },
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
      requestHistoryVersionDeletion,
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
      },
      updateHistoryMetadata: (assetId, patch) => rendererApplication.updateHistoryMetadata(assetId, patch)
    },
    filter: {
      getFilter: () => ui.historyFilter,
      setFilter: (filter) => {
        ui.historyFilter = normalizeHistoryFilter(filter);
      },
      getPanelOpen: () => ui.historyFilterPanelOpen,
      setPanelOpen: (open) => {
        ui.historyFilterPanelOpen = open;
      }
    },
    tags: {
      setState: (nextState) => {
        setRendererState(nextState);
      },
      escapeHtml,
      icon,
      updateHistoryMetadata: (assetId, patch) => rendererApplication.updateHistoryMetadata(assetId, patch)
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
      rememberModalFocus,
      restoreModalFocus,
      bindModalFocus,
      setSelectedHistoryVersionId: (versionId) => {
        ui.selectedHistoryVersionId = versionId;
      },
      setHistoryForwardTarget: (target) => {
        ui.historyForwardTarget = target;
      }
    },
    openHistoryContextMenu: historyContextMenus.openHistory,
    openImageHistoryContextMenu: historyContextMenus.openImageHistory,
    openHistoryPlayerContextMenu: historyContextMenus.openHistoryPlayer,
    closeHistoryContextMenu: historyContextMenus.close
  });
  let disposed = false;
  const managedCleanup: RendererCleanup = () => {
    if (disposed) return;
    disposed = true;
    cleanup();
    if (activeHistoryCleanup === managedCleanup) activeHistoryCleanup = null;
  };
  activeHistoryCleanup = managedCleanup;
  rendererApp.addPageCleanup(managedCleanup);
}

function formSettings(): Settings {
  return readSettingsFromForm(
    settingsDraft ?? state.settings,
    settingsH3PromptPreset,
    settingsImagePromptPreset
  );
}

async function runEnvironmentScan(
  settings: Settings,
  reason: EnvironmentRefreshReason = "manual"
): Promise<EnvironmentScanResult | null> {
  return environmentRefreshCoordinator.refresh(settings, reason);
}

async function requestSaveSettings(settings: Settings): Promise<"saved" | "migration-required"> {
  settingsSaving = true;
  render();
  try {
    return await settingsSaveCoordinator.requestSave(settings);
  } finally {
    settingsSaving = false;
    render();
  }
}

settingsSaveCoordinator = new SettingsSaveCoordinator({
  getState: () => state,
  getEnvironmentScan: () => environmentScan,
  loadLocale: async (locale) => {
    await loadUiLocale(locale);
  },
  saveSettings: (settings, mode) => rendererApplication.saveSettings(settings, mode),
  saveImageDraft: (draft) => rendererApplication.saveImageDraft(draft),
  saveDraft: (draft) => rendererApplication.saveDraft(draft),
  getBundledWorkflow: (modelId, inputMode) => rendererApplication.getBundledWorkflow(modelId, inputMode),
  setState: setRendererState,
  clearSettingsDraft: () => {
    settingsDraft = null;
  },
  syncSettingsDirtyUi,
  deleteBundledWorkflow: (modelId, inputMode) => {
    delete bundledWorkflows[bundledWorkflowKey(modelId, inputMode)];
  },
  cacheBundledWorkflow: (workflow, inputMode) => {
    bundledWorkflows[bundledWorkflowKey(workflow.modelId, inputMode)] = workflow;
  },
  refreshEnvironment: (settings) => runEnvironmentScan(settings, "settings-change"),
  requestDirectoryMigration: (previousSettings, nextSettings, oldDirectory, newDirectory) =>
    shellCoordinator.requestDirectoryMigration(previousSettings, nextSettings, oldDirectory, newDirectory),
  notifySaved: (proxyChanged, mode) => {
    showMessage(proxyChanged
      ? uiText(uiKeys.runtime.settingsProxySaved)
      : mode === "migrate-video-history"
        ? uiText(uiKeys.runtime.settingsMigrationSaved)
        : uiText(uiKeys.runtime.settingsNextTaskSaved));
  },
  requestRender: render
});

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
  getEnvironmentScan: () => environmentScan,
  getSettingsTab: () => settingsTab,
  getFormSettings: formSettings,
  setSettingsDraft: (settings) => {
    settingsDraft = settings;
  },
  setServiceForceStopping: (value) => {
    serviceForceStopping = value;
  },
  setServiceStatusMessage: (message) => {
    serviceStatusMessage = message;
  },
  setLlamaCppPythonInstalling: (value) => {
    llamaCppPythonInstalling = value;
  },
  getLlamaCppPythonLog: () => llamaCppPythonLog,
  setLlamaCppPythonLog: (log) => {
    llamaCppPythonLog = log;
  },
  getCustomNodeLog: (nodeId) => customNodeLogs[nodeId] ?? "",
  setCustomNodeLog: (nodeId, log) => {
    customNodeLogs = { ...customNodeLogs, [nodeId]: log };
  },
  scanEnvironment: async (settings) => {
    await runEnvironmentScan(settings);
  },
  clearCreationDraft: (mode) => {
    if (mode === "image-edit") {
      patchImageDraft(createDefaultImageEditDraft());
    } else {
      patchDraftForMode(mode, (draft) => createClearedDraft(draft));
    }
  },
  setHistoryKind,
  setHistoryScrollRestorePending: historyLayoutController.setScrollRestorePending,
  setSelectedHistoryAssetId: (assetId) => {
    ui.selectedHistoryAssetId = assetId;
  },
  setSelectedHistoryVersionId: (versionId) => {
    ui.selectedHistoryVersionId = versionId;
  },
  clearImageHistoryThumbnailCache: () => historyMediaRuntime.clearImageHistoryThumbnailCache(),
  setQueueActionBusy: (value) => {
    queueActionBusy = value;
  },
  releaseHistoryVideo,
  saveSettings: (settings, mode) => settingsSaveCoordinator.save(settings, mode),
  render,
  requestRender: () => renderCoordinator.requestRender(),
  reportUserAction,
  beforeRenderOverlay: () => {
    if (page !== "settings" && selectedInstallGuide) selectedInstallGuide = null;
  },
  renderAdditionalOverlays: () => [upscaleDialogHtml(), installGuideDialogHtml()].join(""),
  bindAdditionalOverlays: () => {
    const cleanup = bindUpscaleDialog();
    bindInstallGuideDialog();
    return cleanup;
  }
}, comfyRuntime);

initializeRenderCoordinator();

function bindSettings(): void {
  if (settingsTab === "logs" && !shellCoordinator.getAppLogs() && !shellCoordinator.getAppLogsLoading()) {
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
      refreshEnvironment: runEnvironmentScan,
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
      setLlamaCppPythonInstalling: (value) => {
        llamaCppPythonInstalling = value;
      },
      getLlamaCppPythonLog: () => llamaCppPythonLog,
      setLlamaCppPythonLog: (log) => {
        llamaCppPythonLog = log;
      },
      setEnvironmentRepairing: (issueId) => {
        environmentRepairing = issueId;
      },
      setEnvironmentRepairLog: (issueId, log) => {
        environmentRepairLogs = { ...environmentRepairLogs, [issueId]: log };
      },
      enqueueCustomNodeInstall: (nodeId, settings, mode) =>
        customNodeInstallManager.enqueue(nodeId, settings, mode),
      requestCustomNodeUninstall: (nodeId, name) =>
        shellCoordinator.requestConfirmation({ kind: "uninstall-custom-node", nodeId, name }),
      requestLlamaCppPythonUninstall: () =>
        shellCoordinator.requestConfirmation({ kind: "uninstall-llama-cpp-python" }),
      requestForceStopConfirmation: () =>
        shellCoordinator.requestConfirmation({ kind: "force-stop-comfy" }),
      rememberModalFocus
    },
    logs: {
      loadAppLogs: () => {
        void loadAppLogs();
      },
      openAppLogContextMenu: appLogContextMenu.open,
      setAppLogFollowTail: (followTail) => shellCoordinator.setAppLogFollowTail(followTail)
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
      loadAppLogs: () => loadAppLogs(),
      togglePromptModel: togglePromptModelFromUi,
      requestSaveSettings,
      openImageAssetLibrary: () => shellCoordinator.openImageAssetLibrary(),
      rememberModalFocus,
      requestOverlayRender: renderOverlay
    }
  }));
}

registerRendererEvents({
  events: rendererEvents,
  application: rendererApplication,
  t: rendererApp.context.t,
  getState: () => state,
  getComfyRuntimeState: () => comfyRuntime,
  getEnvironmentScanning: () => environmentScanning,
  setComfyRuntimeState: (runtime) => {
    comfyRuntime = runtime;
  },
  setPromptRuntimeState: (runtime) => shellCoordinator.setPromptRuntimeState(runtime),
  getPromptRuntimeState: () => shellCoordinator.getPromptRuntimeState(),
  getCreationMode: () => creationMode,
  setState: setRendererState,
  getPage: () => page,
  getHistoryKind: () => historyKind,
  getDraftDirty: () => draftDirty,
  getDraftSaveInFlight: () => draftSaveInFlight,
  getImageDraftDirty: () => imageDraftDirty,
  getImageDraftSaveInFlight: () => imageDraftSaveInFlight,
  setPromptRuntimeLoaded: (value) => shellCoordinator.setPromptRuntimeLoaded(value),
  setPromptProgress: (progress) => shellCoordinator.setPromptProgress(progress),
  rememberModalFocus,
  setPendingWindowCloseRequest: (request) => shellCoordinator.setPendingWindowCloseRequest(request),
  setWindowCloseResponseBusy: (value) => shellCoordinator.setWindowCloseResponseBusy(value),
  setHistoryMigrationProgress: (progress) => shellCoordinator.setHistoryMigrationProgress(progress),
  hasPendingDirectoryMigration: () => shellCoordinator.hasPendingDirectoryMigration(),
  setImageAssetLibraryProgress: (progress) => shellCoordinator.setImageAssetLibraryProgress(progress),
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
      : llamaCppPythonLog;
    const next = [current, progress.message]
      .filter(Boolean)
      .join("\n")
      .slice(-60_000);
    if (progress.kind === "custom-node") {
      customNodeLogs = { ...customNodeLogs, [progress.id]: next };
    } else {
      llamaCppPythonLog = next;
    }
    return next;
  },
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
