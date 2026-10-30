import { mountAppearanceSettings } from "./appearance";
import { renderSettingsCacheDialog } from "./cache-dialog";
import type {
  AppCacheClearResult,
  AppCacheSnapshot,
  AppLogSnapshot,
  AppState,
  BundledWorkflow,
  ComfyRuntimeState,
  DependencyInstallProgress,
  StrataInstallProgress,
  EnvironmentIssue,
  EnvironmentScanResult,
  H3PromptPreset,
  ImagePromptPreset,
  LocalServiceKind,
  Settings,
  SettingsSaveMode,
  WorkflowCapabilities
} from "../../../types";
import { createTranslator, loadUiLocale, type TranslationParams } from "../../../core/i18n";
import { uiKeys } from "../../../core/i18n-keys";
import { imageModelCapabilityFor } from "../../../core/image-workflow";
import {
  isComfyMultimodalPromptModel,
  isGemmaPromptModel,
  isQwenVlPeftPromptModel
} from "../../../core/prompt-models";
import { modelCatalog } from "../../../core/catalog";
import { rewriteHuggingFaceDownloadUrl } from "../../../core/download-url";
import { settingsChangedKeys } from "../../../core/settings-changes";
import { settingsChangeSummary } from "./change-summary";
import { openModelComponentLocation } from "./model-location";
import { animateUi } from "../../shared/ui/motion";
import { BUILTIN_VIDEO_LORAS } from "../../../core/video-loras";
import { h3AutoPromptSeeds } from "../../../core/prompts/h3/auto-seeds";
import type {
  Page,
  RendererCleanup,
  RendererContext,
  RendererNotifyOptions,
  SettingsTab
} from "../../contracts";
import {
  EnvironmentRefreshCoordinator,
  type EnvironmentRefreshReason
} from "../../environment-refresh-coordinator";
import {
  buildSettingsPageViewModel,
  type SettingsViewModelDependencies
} from "./view-model";
import { renderSettingsPage } from "./page";
import {
  renderSettingsInstallGuideDialog,
  type SettingsInstallGuideSelection
} from "./fragments";
import { mountSettingsAssembly } from "./assembly";
import { readSettingsFromForm } from "./form";
import { createAppLogContextMenu, type AppLogContextMenu } from "./log-context-menu";
import {
  CustomNodeInstallQueue,
  type CustomNodeInstallPhase
} from "./node-install-queue";
import {
  SettingsSaveCoordinator,
  type SettingsSaveRequestResult
} from "./settings-save-coordinator";
import { h3PromptPresetOptions, orderVideoProfiles } from "../create/helpers";
import {
  h3PromptPackFor,
  qwenImagePromptPackFor
} from "../../prompt-packs";
import { escapeHtml } from "../../shared/dom";
import {
  formatBytes
} from "../../shared/formatters";
import { icon } from "../../shared/icons";
import { videoLoraInfoButton } from "../../shared/markup";
import {
  imageWorkflowStatus,
  isImageModelSelectable
} from "../../shared/status";
import { appLogTerminalHtml, visibleAppLogText } from "../../shared/logs";
import type { ConfirmationRequest } from "../../shell/confirmation-service";
import { renderUpscaleOverlayPreservingScroll } from "../../shell/upscale-controller";

export interface SettingsWorkspaceCoordinatorDependencies {
  modalRoot: HTMLElement;
  context: RendererContext;
  getState(): AppState;
  getPage(): Page;
  getComfyRuntimeState(): ComfyRuntimeState;
  setState(nextState: AppState): void;
  addPageCleanup(cleanup: RendererCleanup): void;
  render(): void;
  renderOverlay(): void;
  showMessage(message: string, options?: RendererNotifyOptions): void;
  reportUserAction(action: string, meta?: Record<string, unknown>): void;
  enableSpectrumByDefaultIfAvailable(): void;
  bundledWorkflows: Record<string, BundledWorkflow>;
  workflowCapabilities: Record<string, WorkflowCapabilities>;
  bundledWorkflowKey(modelId: string, inputMode: "image" | "video"): string;
  requestConfirmation(request: ConfirmationRequest): void;
  requestDirectoryMigration(
    previousSettings: Settings,
    nextSettings: Settings,
    oldDirectory: string,
    newDirectory: string
  ): void;
  openImageAssetLibrary(): void;
  rememberModalFocus(): void;
  restoreModalFocus(): void;
  bindModalFocus(
    dialog: HTMLElement,
    close: () => void,
    initialSelector?: string,
    focusOnBind?: boolean
  ): void;
  getPromptRuntimeLoaded(): boolean;
  getPromptStarting(): boolean;
  getPromptEnhancing(): boolean;
  getPromptReleasing(): boolean;
  promptRuntimeControlIcon(): string;
  promptRuntimeControlTitle(settings?: Settings): string;
  togglePromptModel(): Promise<void>;
  getAppLogs(): AppLogSnapshot | null;
  getAppLogsLoading(): boolean;
  getAppLogsError(): string;
  getAppLogScreenClearedAt(): number | null;
  loadAppLogs(): Promise<void>;
  clearAppLogScreen(): void;
  setAppLogFollowTail(value: boolean): void;
}

export interface SettingsWorkspaceCoordinator {
  renderPage(): string;
  bind(): void;
  formSettings(): Settings;
  settingsHaveUnsavedChanges(): boolean;
  getEnvironmentScan(): EnvironmentScanResult | null;
  isEnvironmentScanning(): boolean;
  getSettingsTab(): SettingsTab;
  setSettingsDraft(settings: Settings | null): void;
  setServiceForceStopping(value: boolean): void;
  setServiceStatusMessage(message: string): void;
  setLlamaCppPythonInstalling(value: boolean): void;
  getLlamaCppPythonLog(): string;
  setLlamaCppPythonLog(log: string): void;
  getCustomNodeLog(nodeId: string): string;
  setCustomNodeLog(nodeId: string, log: string): void;
  runEnvironmentScan(
    settings: Settings,
    reason?: EnvironmentRefreshReason
  ): Promise<EnvironmentScanResult | null>;
  requestSaveSettings(settings: Settings): Promise<SettingsSaveRequestResult>;
  saveSettings(settings: Settings, mode: SettingsSaveMode): Promise<void>;
  installGuideDialogHtml(): string;
  bindInstallGuideDialog(): void;
  cacheDialogHtml(): string;
  bindCacheDialog(): void;
  beforeRenderOverlay(): void;
  openAppLogContextMenu(clientX: number, clientY: number): void;
  closeAppLogContextMenu(): void;
  appendAttentionAccelerationLog(message: string): string;
  appendDependencyInstallLog(progress: DependencyInstallProgress): string;
}

export function createSettingsWorkspaceCoordinator(
  deps: SettingsWorkspaceCoordinatorDependencies
): SettingsWorkspaceCoordinator {
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
  let strataInstalling = false;
  const dependencyInstallCancelling = new Set<string>();
  let strataLog = "";
  let strataInstallProgress: StrataInstallProgress | undefined;
  let settingsDraft: Settings | null = null;
  let settingsTab: SettingsTab = "comfyui";
  let selectedInstallGuide: SettingsInstallGuideSelection | null = null;
  let settingsH3PromptPreset: H3PromptPreset = "official-storyboard";
  let settingsImagePromptPreset: ImagePromptPreset = "faithful";
  let appCache: AppCacheSnapshot | null = null;
  let appCacheLoading = false;
  let appCacheClearing = false;
  let appCacheError = "";
  let cacheDialogOpen = false;
  let cacheResult: AppCacheClearResult | null = null;

  const uiText = (
    key: string,
    params?: TranslationParams,
    fallback?: string
  ): string => createTranslator(deps.getState().settings.uiLocale).t(key, params, fallback);

  const settingsHaveUnsavedChanges = (): boolean => {
    return settingsChangedKeys(deps.getState().settings, settingsDraft).length > 0;
  };

  const syncSettingsDirtyUi = (): void => {
    const dirty = settingsHaveUnsavedChanges();
    const setSettingsDirty = deps.context.application.setSettingsDirty;
    if (setSettingsDirty) void setSettingsDirty(dirty).catch(() => undefined);
    const actionBar = document.querySelector<HTMLElement>(".settings-heading-actions");
    if (actionBar) {
      const reveal = actionBar.hidden && (dirty || settingsSaving);
      actionBar.hidden = !dirty && !settingsSaving;
      if (reveal) animateUi(actionBar, [{ opacity: 0, transform: "translate(-50%,12px)" }, { opacity: 1, transform: "translate(-50%,0)" }], 240);
    }
    actionBar?.classList.toggle("is-dirty", dirty || settingsSaving);
    actionBar?.classList.toggle("is-clean", !dirty && !settingsSaving);
    const status = document.querySelector<HTMLElement>(".settings-heading-actions .save-state");
    status?.classList.toggle("dirty", dirty);
    if (status) status.textContent = settingsSaving
      ? uiText(uiKeys.settings.saving)
      : dirty
        ? uiText(uiKeys.settings.unsavedCount, { count: settingsChangedKeys(deps.getState().settings, settingsDraft).length })
        : "";
    const names = document.querySelector<HTMLElement>(".settings-save-names");
    if (names) {
      names.textContent = settingsChangeSummary(settingsChangedKeys(deps.getState().settings, settingsDraft), deps.context.t, deps.getState().settings.uiLocale);
      names.title = names.textContent;
    }
    document.querySelector<HTMLButtonElement>("#discard-settings")?.toggleAttribute(
      "disabled",
      !dirty || settingsSaving
    );
    const saveButton = document.querySelector<HTMLButtonElement>("#save-settings");
    saveButton?.toggleAttribute("disabled", !dirty || settingsSaving);
    saveButton?.setAttribute("aria-busy", String(settingsSaving));
  };

  const formSettings = (): Settings => readSettingsFromForm(
    settingsDraft ?? deps.getState().settings,
    settingsH3PromptPreset,
    settingsImagePromptPreset
  );

  const environmentRefreshCoordinator = new EnvironmentRefreshCoordinator({
    scan: (settings, scope, options, onProgress) => deps.context.application.scanEnvironment(settings, scope, options, onProgress),
    setScanning: (value) => {
      environmentScanning = value;
    },
    setError: (message) => {
      environmentScanError = message;
    },
    commit: (scan) => {
      environmentScan = scan;
    },
    afterCommit: () => deps.enableSpectrumByDefaultIfAvailable(),
    notify: deps.showMessage,
    scanningMessage: () => uiText(uiKeys.runtime.environmentScanning),
    progressMessage: (progress) => uiText(uiKeys.runtime.environmentScanProgress[progress.stage]),
    completedMessage: () => uiText(uiKeys.runtime.environmentScanCompleted),
    failedMessage: (error, reason) => uiText(
      reason === "startup" ? uiKeys.runtime.startupScanFailed : uiKeys.runtime.environmentScanFailed,
      { error: error instanceof Error ? error.message : String(error) }
    ),
    requestRender: () => {
      const page = deps.getPage();
      if (page === "history-detail" || page === "image-history-detail") {
        // Scan readiness belongs to the open Upscale overlay, not the playing viewer.
        const dialog = deps.modalRoot.querySelector(".upscale-dialog");
        if (!environmentScanning && dialog) {
          const editing = dialog.querySelector("input:focus");
          if (editing) {
            editing.addEventListener("blur", () => window.requestAnimationFrame(() => {
              if (deps.modalRoot.contains(dialog)) renderUpscaleOverlayPreservingScroll(deps.modalRoot, deps.renderOverlay);
            }), { once: true });
          } else renderUpscaleOverlayPreservingScroll(deps.modalRoot, deps.renderOverlay);
        }
        return;
      }
      deps.render();
    },
    reportScan: (reason) => deps.reportUserAction("scan-environment", { reason })
  });

  const runEnvironmentScan = (
    settings: Settings,
    reason: EnvironmentRefreshReason = "manual"
  ): Promise<EnvironmentScanResult | null> => environmentRefreshCoordinator.refresh(settings, reason);

  const customNodeInstallManager = new CustomNodeInstallQueue({
    getUiLocale: () => deps.getState().settings.uiLocale,
    cancelInstall: (id) => deps.context.application.cancelDependencyInstall(`custom-node:${id}`),
    install: (nodeId, settings, mode) => deps.context.application.installCustomNode(nodeId, settings, mode),
    restart: (settings) => deps.context.application.restartLocalService("comfy", settings),
    scan: (settings) => runEnvironmentScan(settings, "dependency-change"),
    nodeName: (nodeId) => environmentScan?.customNodes.find((node) => node.id === nodeId)?.name ?? nodeId,
    getLog: (nodeId) => customNodeLogs[nodeId] ?? "",
    setLog: (nodeId, log) => {
      customNodeLogs = { ...customNodeLogs, [nodeId]: log };
    },
    notify: (message, kind) => deps.showMessage(message, { kind }),
    onSnapshot: (snapshot) => {
      customNodeInstalling = snapshot.activeNodeId;
      customNodeInstallQueue = snapshot.queuedNodeIds;
      customNodeInstallBatch = snapshot.batchNodeIds;
      customNodeInstallPhase = snapshot.phase;
      if (deps.getPage() !== "settings") return;
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement) return;
      deps.render();
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
        { name, detail: detail || uiText(uiKeys.uiError.nodeNotRegistered) }
      ),
      completed: (success, failed) => uiText(
        uiKeys.settings.actions.nodeBatchCompleted,
        { success, failed }
      )
    }
  });

  const settingsSaveCoordinator = new SettingsSaveCoordinator({
    updateDraftAppearance: (appearance) => { if (settingsDraft) settingsDraft = { ...settingsDraft, appearance }; },
    getState: deps.getState,
    getEnvironmentScan: () => environmentScan,
    loadLocale: async (locale) => {
      await loadUiLocale(locale);
    },
    saveSettings: (settings, mode) => deps.context.application.saveSettings(settings, mode),
    saveImageDraft: (draft) => deps.context.application.saveImageDraft(draft),
    saveDraft: (draft) => deps.context.application.saveDraft(draft),
    getBundledWorkflow: (modelId, inputMode) => deps.context.application.getBundledWorkflow(modelId, inputMode),
    setState: (state) => {
      deps.setState(state);
      environmentRefreshCoordinator.refreshProgressMessage();
    },
    clearSettingsDraft: () => {
      settingsDraft = null;
    },
    syncSettingsDirtyUi,
    deleteBundledWorkflow: (modelId, inputMode) => {
      delete deps.bundledWorkflows[deps.bundledWorkflowKey(modelId, inputMode)];
    },
    cacheBundledWorkflow: (workflow, inputMode) => {
      deps.bundledWorkflows[deps.bundledWorkflowKey(workflow.modelId, inputMode)] = workflow;
    },
    refreshEnvironment: (settings) => runEnvironmentScan(settings, "settings-change"),
    requestDirectoryMigration: deps.requestDirectoryMigration,
    notifySaved: (proxyChanged, mode) => {
      if (mode === "migrate-storage" && !proxyChanged) return;
      deps.showMessage(proxyChanged
        ? uiText(uiKeys.runtime.settingsProxySaved)
        : mode === "migrate-video-history"
          ? uiText(uiKeys.runtime.settingsMigrationSaved)
          : uiText(uiKeys.runtime.settingsNextTaskSaved));
    },
    requestRender: deps.render
  });

  const appLogContextMenu: AppLogContextMenu = createAppLogContextMenu(
    deps.context,
    deps.clearAppLogScreen
  );

  const loadAppCache = async (): Promise<void> => {
    if (appCacheLoading || appCacheClearing) return;
    appCacheLoading = true;
    appCacheError = "";
    deps.render();
    try {
      appCache = await deps.context.application.getAppCache();
    } catch (error) {
      appCacheError = error instanceof Error ? error.message : String(error);
    } finally {
      appCacheLoading = false;
      deps.render();
      if (cacheDialogOpen) deps.renderOverlay();
    }
  };

  const clearAppCache = async (): Promise<void> => {
    if (appCacheLoading || appCacheClearing) return;
    if (deps.getState().queue.some((task) => task.status === "running")) {
      deps.showMessage(uiText(uiKeys.settings.system.cacheBusy), { kind: "warning" });
      return;
    }
    appCacheClearing = true;
    cacheResult = null;
    appCacheError = "";
    deps.render();
    deps.renderOverlay();
    try {
      const result: AppCacheClearResult = await deps.context.application.clearAppCache();
      cacheResult = result;
      appCache = result.after;
      appCacheError = result.errors.slice(0, 3).join("\n");
      const affectedDirectories = result.skippedTemporaryDirectories + result.errors.length;
      if (affectedDirectories > 0 && !cacheDialogOpen) {
        deps.showMessage(uiText(uiKeys.settings.actions.cacheClearPartial, {
          size: formatBytes(result.clearedBytes),
          count: affectedDirectories
        }), { kind: "warning" });
      } else if (!cacheDialogOpen) {
        deps.showMessage(uiText(uiKeys.settings.actions.cacheClearCompleted, {
          size: formatBytes(result.clearedBytes)
        }));
      }
    } catch (error) {
      appCacheError = error instanceof Error ? error.message : String(error);
      if (!cacheDialogOpen) deps.showMessage(uiText(uiKeys.settings.actions.cacheClearFailed, { error: appCacheError }), { kind: "error" });
    } finally {
      appCacheClearing = false;
      deps.render();
      deps.renderOverlay();
    }
  };

  const settingsPage = (): string => {
    const state = deps.getState();
    const comfyRuntime = deps.getComfyRuntimeState();
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
        promptRuntimeLoaded: deps.getPromptRuntimeLoaded(),
        promptStarting: deps.getPromptStarting(),
        promptEnhancing: deps.getPromptEnhancing(),
        promptReleasing: deps.getPromptReleasing(),
        serviceStarting: serviceStarting ?? (comfyRuntime.phase === "starting" ? "comfy" : null),
        serviceRestarting: serviceRestarting ?? (comfyRuntime.phase === "restarting" ? "comfy" : null),
        serviceForceStopping,
        serviceStatusMessage: serviceStatusMessage || (["starting", "restarting", "error"].includes(comfyRuntime.phase) ? comfyRuntime.message : ""),
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
        strataInstalling,
        dependencyInstallCancelling: [...dependencyInstallCancelling],
        strataLog,
        strataInstallProgress,
        selectedInstallGuide,
        appLogs: deps.getAppLogs(),
        appLogsLoading: deps.getAppLogsLoading(),
        appLogsError: deps.getAppLogsError(),
        appCache,
        appCacheLoading,
        appCacheClearing,
        appCacheError,
        settingsHaveUnsavedChanges,
        promptRuntimeControlIcon: deps.promptRuntimeControlIcon,
        promptRuntimeControlTitle: deps.promptRuntimeControlTitle
      } satisfies SettingsViewModelDependencies),
      {
        t: deps.context.t,
        defaultH3PromptPresets: h3PromptPackFor(state.settings.uiLocale).defaultPresets,
        h3AutoPromptSeeds,
        defaultImagePromptPresets: qwenImagePromptPackFor(state.settings.uiLocale).defaultPresets,
        h3PromptPresetDescriptions: h3PromptPackFor(state.settings.uiLocale).presetDescriptions,
        imagePromptPresetLabels: qwenImagePromptPackFor(state.settings.uiLocale).presetLabels,
        imagePromptPresetDescriptions: qwenImagePromptPackFor(state.settings.uiLocale).presetDescriptions,
        icon,
        escapeHtml,
        formatBytes,
        formatScanTime: (scannedAt) => new Date(scannedAt).toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit"
        }),
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
        h3PromptPresetOptions: (selected, includeMultiReference) =>
          h3PromptPresetOptions(selected, includeMultiReference, state.settings.uiLocale),
        renderAppLogTerminal: (text) => appLogTerminalHtml(
          visibleAppLogText(text, deps.getAppLogScreenClearedAt()),
          uiText(uiKeys.settings.logsEmpty)
        )
      }
    );
  };

  const installGuideDialogHtml = (): string => {
    if (deps.getPage() !== "settings") return "";
    const state = deps.getState();
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
        t: deps.context.t,
        locale: state.settings.uiLocale
      }
    );
  };

  const bindInstallGuideDialog = (): void => {
    if (deps.getPage() !== "settings" || !selectedInstallGuide) return;
    const close = () => {
      selectedInstallGuide = null;
      deps.renderOverlay();
      deps.restoreModalFocus();
    };
    deps.modalRoot.querySelector("#close-install-guide")?.addEventListener("click", close);
    deps.modalRoot.querySelector("#dismiss-install-guide")?.addEventListener("click", close);
    deps.modalRoot.querySelector("#install-guide-backdrop")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) close();
    });
    deps.modalRoot.querySelector("#open-install-download")?.addEventListener("click", async () => {
      const guide = selectedInstallGuide?.component.installGuide;
      if (!guide) return;
      const state = deps.getState();
      const url = rewriteHuggingFaceDownloadUrl(
        guide.downloadUrl,
        settingsDraft ?? state.settings
      );
      const opened = await deps.context.hostCapabilities.openExternal(url);
      if (!opened) deps.showMessage(uiText(uiKeys.settings.actions.downloadPageFailed), { kind: "error" });
    });
    deps.modalRoot.querySelector("#open-install-directory")?.addEventListener("click", async (event) => {
      const directory = (event.currentTarget as HTMLButtonElement).dataset.installDirectory?.trim() || "";
      const opened = await openModelComponentLocation(deps.context.hostCapabilities, selectedInstallGuide?.component, directory);
      if (!opened) deps.showMessage(uiText(uiKeys.settings.actions.openDirectoryFailed), { kind: "error" });
    });
    const dialog = deps.modalRoot.querySelector<HTMLElement>(".install-guide-dialog");
    if (dialog) deps.bindModalFocus(dialog, close, "#dismiss-install-guide");
  };

  const requestSaveSettings = async (settings: Settings): Promise<SettingsSaveRequestResult> => {
    settingsSaving = true;
    deps.render();
    try {
      return await settingsSaveCoordinator.requestSave(settings);
    } finally {
      settingsSaving = false;
      deps.render();
    }
  };

  const bind = (): RendererCleanup | undefined => {
    if (settingsTab === "logs" && !deps.getAppLogs() && !deps.getAppLogsLoading()) {
      void deps.loadAppLogs();
    }
    if (settingsTab === "system" && !appCache && !appCacheLoading && !appCacheError) {
      void loadAppCache();
    }
    const state = deps.getState();
    if (settingsTab !== "logs" && settingsTab !== "appearance" && !environmentScan && !environmentScanning) {
      void runEnvironmentScan(settingsDraft ?? state.settings);
      return;
    }
    const cleanup = mountSettingsAssembly(deps.context, {
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
        setEnvironmentRepairLog: (issueId: EnvironmentIssue["id"], log) => {
          environmentRepairLogs = { ...environmentRepairLogs, [issueId]: log };
        },
        enqueueCustomNodeInstall: (nodeId, settings, mode) =>
          customNodeInstallManager.enqueue(nodeId, settings, mode),
        cancelCustomNodeInstall: (nodeId) => customNodeInstallManager.cancel(nodeId),
        cancelWaitingCustomNodes: () => customNodeInstallManager.cancelWaiting(),
        setDependencyInstallCancelling: (id, value) => {
          if (value) dependencyInstallCancelling.add(id);
          else dependencyInstallCancelling.delete(id);
        },
        requestCustomNodeUninstall: (nodeId, name) =>
          deps.requestConfirmation({ kind: "uninstall-custom-node", nodeId, name }),
        requestLlamaCppPythonUninstall: () =>
          deps.requestConfirmation({ kind: "uninstall-llama-cpp-python" }),
        requestStrataUninstall: (directory) =>
          deps.requestConfirmation({ kind: "uninstall-strata", directory }),
        setStrataInstalling: (value) => { strataInstalling = value; if (value) strataInstallProgress = { stage: "prepare" }; },
        getStrataLog: () => strataLog,
        setStrataLog: (log) => { strataLog = log; },
        requestForceStopConfirmation: () =>
          deps.requestConfirmation({ kind: "force-stop-comfy" }),
        rememberModalFocus: deps.rememberModalFocus
      },
      logs: {
        loadAppLogs: () => {
          void deps.loadAppLogs();
        },
        openAppLogContextMenu: appLogContextMenu.open,
        setAppLogFollowTail: deps.setAppLogFollowTail
      },
      cache: {
        loadAppCache: () => {
          void loadAppCache();
        },
        clearAppCache: () => {
          deps.rememberModalFocus();
          cacheResult = null;
          cacheDialogOpen = true;
          deps.renderOverlay();
        }
      },
      page: {
        context: deps.context,
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
        loadAppLogs: () => deps.loadAppLogs(),
        togglePromptModel: deps.togglePromptModel,
        requestSaveSettings,
        openImageAssetLibrary: deps.openImageAssetLibrary,
        rememberModalFocus: deps.rememberModalFocus,
        requestOverlayRender: deps.renderOverlay
      }
    });
    return cleanup;
  };

  return {
    renderPage: settingsPage,
    bind: () => {
      const cleanup = bind();
      if (cleanup) deps.addPageCleanup(cleanup);
      deps.addPageCleanup(mountAppearanceSettings(deps.context.root,
        (appearance) => settingsSaveCoordinator.saveAppearance(appearance),
        () => deps.context.notify(uiText(uiKeys.appearance.failed), { kind: "error" })));
    },
    formSettings,
    settingsHaveUnsavedChanges,
    getEnvironmentScan: () => environmentScan,
    isEnvironmentScanning: () => environmentScanning,
    getSettingsTab: () => settingsTab,
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
    runEnvironmentScan,
    requestSaveSettings,
    saveSettings: (settings, mode) => settingsSaveCoordinator.save(settings, mode),
    installGuideDialogHtml,
    bindInstallGuideDialog,
    cacheDialogHtml: () => renderSettingsCacheDialog({ open: cacheDialogOpen, snapshot: appCache, loading: appCacheLoading, clearing: appCacheClearing, error: appCacheError, running: deps.getState().queue.some(task => task.status === "running"), result: cacheResult }, { t: deps.context.t, icon, escapeHtml, formatBytes }),
    bindCacheDialog: () => {
      if (!cacheDialogOpen) return;
      const close = () => {
        if (appCacheClearing) return;
        cacheDialogOpen = false;
        deps.renderOverlay();
        deps.restoreModalFocus();
      };
      for (const id of ["settings-cache-close", "settings-cache-close-icon"]) deps.modalRoot.querySelector(`#${id}`)?.addEventListener("click", close);
      deps.modalRoot.querySelector("#settings-cache-backdrop")?.addEventListener("click", event => { if (event.target === event.currentTarget) close(); });
      deps.modalRoot.querySelector("#confirm-clear-app-cache")?.addEventListener("click", () => { void clearAppCache(); });
      const dialog = deps.modalRoot.querySelector<HTMLElement>(".settings-maintenance-dialog");
      if (dialog) deps.bindModalFocus(dialog, close, appCacheClearing ? "#settings-cache-title" : "#settings-cache-close");
    },
    beforeRenderOverlay: () => {
      if (deps.getPage() !== "settings" && selectedInstallGuide) selectedInstallGuide = null;
    },
    openAppLogContextMenu: appLogContextMenu.open,
    closeAppLogContextMenu: appLogContextMenu.close,
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
        : progress.id === "strata" ? strataLog : llamaCppPythonLog;
      const next = [current, progress.message]
        .filter(Boolean)
        .join("\n")
        .slice(-60_000);
      if (progress.kind === "custom-node") {
        customNodeLogs = { ...customNodeLogs, [progress.id]: next };
      } else if (progress.id === "strata") {
        strataLog = next;
        if (progress.progress) strataInstallProgress = { ...progress.progress };
      } else {
        llamaCppPythonLog = next;
      }
      return next;
    }
  };
}
