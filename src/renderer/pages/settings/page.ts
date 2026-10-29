import type {
  AppCacheSnapshot,
  AppLogSnapshot,
  EnvironmentScanResult,
  H3GlobalSparseAttentionMode,
  H3PromptPreset,
  ImagePromptPreset,
  LocalServiceKind,
  ModelScanProfile,
  Settings
} from "../../../types";
import type { H3AutoPromptSeed } from "../../../core/prompts/h3/auto-seeds";
import type { SettingsTab } from "../../contracts";
import type { Translate } from "../../../core/i18n";
import { uiKeys } from "../../../core/i18n-keys";
import {
  compareDependencyIds,
  customNodeDefinition,
  DLSS5_NODE_ID,
  AETHERSCALE_NODE_ID,
  modelCatalog,
  sortProfilesByCatalogOrder
} from "../../../core/catalog";
import { promptModelCapabilityOrderValue } from "../../../core/prompt-models";
import { strataPreparationMatchesSettings, strataPreparationProfiles } from "../../../core/strata-preparation";
import { supportsStrataUncensored, strataUncensoredMode } from "../../../core/strata-uncensored";
import { normalizeStrataReasoningEffort, strataReasoningEfforts } from "../../../core/strata-reasoning";
import { isStrataRuntimeInstalled, renderStrataPreparationPanel } from "./strata-preparation";
import { renderDependencyActionSplit, renderDependencyVersions } from "./dependency-actions";
import { renderDependencyFeedback, renderDependencyInfo, settingsNodeGroup } from "./dependency-presentation";
import { gitInstallProgress } from "../../../core/dependency-install-progress";
import { compareReleaseVersions } from "../../../core/release-version";
import { LLAMA_CPP_PYTHON_JAMEPENG_VERSION } from "../../../core/catalog/dependencies/llama-cpp-python";
import {
  renderSettingsComfyCompatibilityPanel,
  renderSettingsEnvironmentIssuesPanel,
  renderSettingsEnvironmentOverview,
  renderSettingsModelScanCard,
  type SettingsInstallGuideSelection
} from "./fragments";
import { settingsH3AutoPromptSeedDescription, settingsNodePurpose, settingsText } from "./copy";
import { fieldLabelWithTip } from "../../shared/markup";
import { renderLanBrowserSettings } from "./lan-browser";
import { renderAppearanceSettings } from "./appearance";
import { renderSettingsPathField } from "./path-field";
import { groupSettingsLoras, sharedSettingsComponentPaths } from "./model-presentation";
import { settingsChangeSummary } from "./change-summary";
import { modelDownloadSource, modelDownloadSources } from "../../../core/download-url";
import {
  customNodeBulkActionMode,
  customNodeIdsForBulkAction,
  type CustomNodeInstallPhase
} from "./node-install-queue";
import {
  deriveAccelerationState,
  deriveCustomNodeCardState,
  deriveEnvironmentOverviewItems,
  deriveSettingsDependencyActionState,
  deriveSettingsDirectories,
  deriveSettingsGpuState,
  deriveH3VideoVaeState,
  isAetherScaleRuntimeUnavailable,
  isDlss5RuntimeUnavailable
} from "./selectors";

interface ImageQualityProfileOption {
  id: string;
  label: string;
  steps: number;
}

interface PromptStatusViewModel {
  ready: boolean;
  detail: string;
}

export interface SettingsPageViewModel {
  settings: Settings;
  settingsDirty: boolean;
  settingsChangeCount?: number;
  settingsChangeKeys?: (keyof Settings)[];
  settingsSaving: boolean;
  environmentScan: EnvironmentScanResult | null;
  comfyConnected?: boolean;
  environmentScanning: boolean;
  environmentScanError: string;
  settingsTab: SettingsTab;
  settingsH3PromptPreset: H3PromptPreset;
  settingsImagePromptPreset: ImagePromptPreset;
  promptStatus: PromptStatusViewModel;
  promptRuntimeLoaded: boolean;
  promptRuntimeBusy: boolean;
  promptRuntimeControlIconName: string;
  promptRuntimeControlTitle: string;
  queueRunning: boolean;
  hasRunningQueueTask: boolean;
  serviceStarting: LocalServiceKind | null;
  serviceRestarting: LocalServiceKind | null;
  serviceForceStopping: boolean;
  serviceBusy: boolean;
  serviceStatusMessage: string;
  comfyUpdating: boolean;
  comfyUpdateLog: string;
  environmentRepairing: string;
  environmentRepairLogs: Record<string, string>;
  customNodeInstalling: string;
  customNodeInstallQueue: string[];
  customNodeInstallBatch: string[];
  customNodeInstallPhase: CustomNodeInstallPhase;
  customNodeLogs: Record<string, string>;
  attentionAccelerationInstalling: boolean;
  attentionAccelerationLog: string;
  llamaCppPythonInstalling: boolean;
  llamaCppPythonLog: string;
  strataInstalling?: boolean;
  dependencyInstallCancelling?: string[];
  strataLog?: string;
  strataInstallProgress?: import("../../../types").StrataInstallProgress;
  selectedInstallGuide: SettingsInstallGuideSelection | null;
  installGuideModelDirectory: string;
  appLogs: AppLogSnapshot | null;
  appLogsLoading: boolean;
  appLogsError: string;
  appCache: AppCacheSnapshot | null;
  appCacheLoading: boolean;
  appCacheClearing: boolean;
  appCacheError: string;
}

export interface SettingsPageOptions {
  t: Translate;
  defaultH3PromptPresets: Record<H3PromptPreset, string>;
  h3AutoPromptSeeds: readonly H3AutoPromptSeed[];
  defaultImagePromptPresets: Record<ImagePromptPreset, string>;
  h3PromptPresetDescriptions: Record<H3PromptPreset, string>;
  imagePromptPresetLabels: Record<ImagePromptPreset, string>;
  imagePromptPresetDescriptions: Record<ImagePromptPreset, string>;
  icon(name: string, className?: string): string;
  escapeHtml(value: string): string;
  formatBytes(bytes: number): string;
  formatScanTime(scannedAt: string): string;
  orderVideoProfiles(profiles: ModelScanProfile[]): ModelScanProfile[];
  getImageQualityProfiles(modelId: string): ImageQualityProfileOption[];
  isGemmaPromptModel(modelId: string): boolean;
  isComfyMultimodalPromptModel(modelId: string): boolean;
  isQwenVlPeftPromptModel(modelId: string): boolean;
  videoLoraInfoButton(profileId: string): string;
  isImageModelSelectable(profile?: ModelScanProfile): boolean;
  imageWorkflowStatus(profile?: ModelScanProfile): string;
  h3PromptPresetOptions(selected: H3PromptPreset, includeMultiReference: boolean): string;
  renderAppLogTerminal(text: string): string;
}

export function renderSettingsPage(
  viewModel: SettingsPageViewModel,
  options: SettingsPageOptions
): string {
  const settings = viewModel.settings;
  const t = options.t;
  const downloadDescriptions = {
    huggingface: uiKeys.settings.system.downloadOfficial,
    "hf-mirror": uiKeys.settings.system.downloadMirror,
    "hf-mirror-net": uiKeys.settings.system.downloadMirrorNet,
    gitee: uiKeys.settings.system.downloadGitee
  };
  const s = (key: Parameters<typeof settingsText>[1], params?: Record<string, string | number>) =>
    settingsText(settings.uiLocale, key, params);
  const environmentScan = viewModel.environmentScan;
  const escape = (value: string | number | null | undefined) => options.escapeHtml(value == null ? "" : String(value));
  const icon = (name: string, className?: string) => options.icon(name, className);
  const pathField = (id: string, pickerId: string, label: string, value: string, placeholder: string, automatic?: string) => renderSettingsPathField({
    id, pickerId, label, value, placeholder, automatic, icon,
    chooseLabel: t(uiKeys.settings.system.chooseDirectory),
    openLabel: t(uiKeys.settings.system.installGuideOpenDirectory)
  });
  const sharedFragmentOptions = {
    icon: options.icon,
    escapeHtml: options.escapeHtml,
    t,
    locale: settings.uiLocale
  };
  const environmentOverview = renderSettingsEnvironmentOverview(
    {
      environmentScan,
      environmentItems: deriveEnvironmentOverviewItems(
        environmentScan,
        viewModel.comfyConnected
      ),
      environmentScanning: viewModel.environmentScanning,
      environmentScanError: viewModel.environmentScanError,
      serviceStarting: viewModel.serviceStarting,
      serviceRestarting: viewModel.serviceRestarting,
      serviceForceStopping: viewModel.serviceForceStopping,
      serviceStatusMessage: viewModel.serviceStatusMessage,
      queueRunning: viewModel.queueRunning,
      hasRunningQueueTask: viewModel.hasRunningQueueTask
    },
    {
      ...sharedFragmentOptions,
      formatScanTime: options.formatScanTime
    }
  );
  const comfyCompatibilityPanel = renderSettingsComfyCompatibilityPanel(
    {
      environmentScan,
      comfyUpdating: viewModel.comfyUpdating,
      comfyUpdateLog: viewModel.comfyUpdateLog
    },
    sharedFragmentOptions
  );
  const environmentIssuesPanel = renderSettingsEnvironmentIssuesPanel(
    {
      environmentScan,
      environmentRepairing: viewModel.environmentRepairing,
      environmentRepairLogs: viewModel.environmentRepairLogs
    },
    sharedFragmentOptions
  );
  const sharedComponentPaths = sharedSettingsComponentPaths(environmentScan?.modelProfiles ?? []);
  const renderProfileCard = (profile: ModelScanProfile) => renderSettingsModelScanCard(
    profile,
    {
      ...sharedFragmentOptions,
      sharedComponentPaths,
      isGemmaPromptModel: options.isGemmaPromptModel,
      isComfyMultimodalPromptModel: options.isComfyMultimodalPromptModel,
      isQwenVlPeftPromptModel: options.isQwenVlPeftPromptModel,
      videoLoraInfoButton: options.videoLoraInfoButton,
      imageWorkflowStatus: options.imageWorkflowStatus
    }
  );
  const scannedProfiles = environmentScan?.modelProfiles ?? [];
  const strataProfiles = strataPreparationMatchesSettings(settings, environmentScan?.strataPreparation)
    ? scannedProfiles.filter((profile) => profile.managedBy === "strata")
    : [];
  const profiles = [
    ...scannedProfiles.filter((profile) => profile.managedBy !== "strata"),
    ...(strataProfiles.length ? strataProfiles : strataPreparationProfiles(settings.uiLocale))
  ];
  const videoProfiles = options.orderVideoProfiles(
    profiles.filter((profile) => profile.category === "video")
  );
  const videoSelectorProfiles = videoProfiles.length
    ? videoProfiles
    : modelCatalog.list("video").map((entry) => ({
        id: entry.definition.id,
        name: modelCatalog.localized(entry.definition.id, settings.uiLocale)?.name ?? entry.definition.id,
        available: false,
        integrated: entry.definition.scan?.integrated !== false
      }));
  const extensionProfiles = videoSelectorProfiles.filter((profile) =>
    modelCatalog.get(profile.id)?.definition.capabilities?.supportsVideoExtension === true
  );
  const loraProfiles = profiles.filter((profile) => profile.category === "lora");
  const imageProfiles = sortProfilesByCatalogOrder(
    profiles.filter((profile) => profile.category === "image" && !modelCatalog.get(profile.id)?.definition.retired),
    modelCatalog,
    "image"
  );
  const imageQualityProfiles = options.getImageQualityProfiles(settings.defaultImageModel);
  const promptProfiles = profiles
    .filter((profile) => profile.category === "prompt")
    .sort((left, right) => {
      const leftPreparation = left.managedBy === "strata";
      const rightPreparation = right.managedBy === "strata";
      if (leftPreparation !== rightPreparation) return leftPreparation ? -1 : 1;
      if (leftPreparation) return (modelCatalog.get(right.id)?.definition.order ?? 0) -
        (modelCatalog.get(left.id)?.definition.order ?? 0);
      const orderDifference = promptModelCapabilityOrderValue(right.id) -
        promptModelCapabilityOrderValue(left.id);
      return orderDifference || left.name.localeCompare(right.name);
    });
  const selectablePromptProfiles = [...promptProfiles];
  // Before the first scan, retain the saved model rather than saving an empty select.
  if (!selectablePromptProfiles.some((profile) => profile.id === settings.promptModelId)) selectablePromptProfiles.push({
    id: settings.promptModelId,
    name: modelCatalog.localized(settings.promptModelId, settings.uiLocale)?.name ?? settings.promptModelId,
    category: "prompt", badge: "", description: "", vram: "",
    available: false, integrated: true, components: []
  });
  const upscaleProfiles = profiles.filter((profile) => profile.category === "upscale");
  const defaultPromptPresets = options.defaultH3PromptPresets;
  const selectedH3PresetText = settings.h3PromptPresets[viewModel.settingsH3PromptPreset] ??
    defaultPromptPresets[viewModel.settingsH3PromptPreset];
  const defaultImagePromptPresets = options.defaultImagePromptPresets;
  const selectedImagePromptPresetText = settings.imagePromptPresets[viewModel.settingsImagePromptPreset] ??
    defaultImagePromptPresets[viewModel.settingsImagePromptPreset];
  const selectedAutoPromptSeed = options.h3AutoPromptSeeds.find(
    (seed) => seed.id === settings.h3AutoPromptSeedId
  );
  const selectedAutoPromptSeedText = selectedAutoPromptSeed
    ? settings.h3AutoPromptSeedInstructions[selectedAutoPromptSeed.id] ?? selectedAutoPromptSeed.instruction
    : "";
  const appCache = viewModel.appCache;
  const cacheTotal = viewModel.appCacheLoading
    ? t(uiKeys.settings.system.cacheLoading)
    : appCache
      ? options.formatBytes(appCache.totalBytes)
      : "—";
  const cacheSession = appCache ? options.formatBytes(appCache.currentSessionBytes) : "—";
  const cacheTemporary = appCache ? options.formatBytes(appCache.temporaryBytes) : "—";
  const cacheDirectories = appCache ? String(appCache.temporaryDirectoryCount) : "—";
  const cacheClearDisabled = viewModel.appCacheLoading ||
    viewModel.appCacheClearing;
  const cachePanel = `
    <section class="panel settings-section settings-form-card app-cache-panel">
      <div class="section-heading">
        <div><h2>${t(uiKeys.settings.system.cacheTitle)}</h2></div>
        <div class="button-row"><button class="secondary button-with-icon" id="refresh-app-cache" ${viewModel.appCacheLoading || viewModel.appCacheClearing ? "disabled" : ""}>${icon(viewModel.appCacheLoading ? "refresh-cw" : "rotate-ccw")}${t(uiKeys.settings.system.cacheRefresh)}</button><button class="secondary destructive button-with-icon" id="clear-app-cache" ${cacheClearDisabled ? "disabled" : ""}>${icon(viewModel.appCacheClearing ? "refresh-cw" : "trash-2")}${viewModel.appCacheClearing ? t(uiKeys.settings.system.cacheClearing) : t(uiKeys.settings.system.cacheClear)}</button></div>
      </div>
      <div class="app-cache-summary">
        <div class="app-cache-total"><span>${t(uiKeys.settings.system.cacheTotal)}</span><strong id="app-cache-total" aria-live="polite">${cacheTotal}</strong></div>
        <div class="app-log-stats"><div class="app-log-stat"><span>${t(uiKeys.settings.system.cacheSession)}</span><strong id="app-cache-session">${cacheSession}</strong></div><div class="app-log-stat"><span>${t(uiKeys.settings.system.cacheTemporary)}</span><strong id="app-cache-temporary">${cacheTemporary}</strong></div><div class="app-log-stat"><span>${t(uiKeys.settings.system.cacheDirectories)}</span><strong id="app-cache-directories">${cacheDirectories}</strong></div></div>
      </div>
      ${viewModel.hasRunningQueueTask ? `<p class="muted" role="status">${t(uiKeys.settings.system.cacheBusy)}</p>` : ""}
      ${viewModel.appCacheError ? `<p class="error" role="alert">${escape(viewModel.appCacheError)}</p>` : ""}
    </section>`;
  const videoAvailable = videoProfiles.filter(
    (profile) => profile.available && profile.integrated
  ).length;
  const loraAvailable = loraProfiles.filter((profile) => profile.available).length;
  const imageComponentsReady = imageProfiles.filter((profile) => profile.available).length;
  const upscaleAvailable = upscaleProfiles.filter(
    (profile) => profile.available && profile.integrated
  ).length;
  const promptAvailable = promptProfiles.filter((profile) => profile.available && profile.integrated).length;
  const dependencyActionState = deriveSettingsDependencyActionState({
    environmentScan,
    customNodeInstallPhase: viewModel.customNodeInstallPhase,
    queueRunning: viewModel.queueRunning,
    hasRunningQueueTask: viewModel.hasRunningQueueTask
  });
  const {
    nodeUpdatesAvailable,
    customNodeInstallFinalizing,
    customNodeInstallGloballyBlocked: dependencyInstallBlocked
  } = dependencyActionState;
  const customNodeInstallGloballyBlocked = dependencyInstallBlocked || Boolean(viewModel.strataInstalling);
  const gpuState = deriveSettingsGpuState(settings, environmentScan);
  const gpu = gpuState.item;
  const gpuDevices = gpuState.devices;
  const gpuSummary = gpuDevices.length
    ? gpuDevices.map((device) => `${device.name} · ${options.formatBytes(device.vramTotalBytes)}`).join(s("shared.listSeparator"))
    : gpu?.ok || gpu?.status === "warning"
      ? gpu.detail
      : environmentScan
        ? t(uiKeys.settings.system.gpuNotDetected)
        : t(uiKeys.settings.system.gpuScanWaiting);
  const gpuBadge = gpuSummary;
  const reserveVramBytes = gpuState.reserveVramBytes;
  const gpuCards = gpuDevices.length
    ? `<div class="gpu-device-list">${gpuDevices.map((device) => `
        <article class="gpu-device-card">
          <span class="runtime-label">${t(uiKeys.settings.system.gpuDevice, { index: device.index })}</span>
          <strong class="runtime-value">${escape(device.name)}</strong>
          <code class="runtime-detail">${options.formatBytes(device.vramTotalBytes)} ${t(uiKeys.settings.system.totalVram)} · ${options.formatBytes(Math.max(0, device.vramTotalBytes - reserveVramBytes))} ${t(uiKeys.settings.system.workBudget)} · ${t(uiKeys.settings.system.driver)} ${escape(device.driverVersion || t(uiKeys.settings.compatibility.versionUnknown))}</code>
        </article>`).join("")}</div>`
    : `<div class="scan-result">${escape(gpuSummary)}</div>`;
  const directoryState = deriveSettingsDirectories(settings, environmentScan);
  const comfyInstallations = directoryState.comfyInstallations;
  const effectiveComfyInstallDirectory = directoryState.comfyInstallDirectory;
  const effectiveComfyCoreDirectory = directoryState.comfyCoreDirectory;
  const effectiveComfyDataDirectory = directoryState.comfyDataDirectory;
  const effectiveModelDirectory = directoryState.modelDirectory;
  const autoVideoOutputDirectory = directoryState.autoVideoOutputDirectory;
  const autoImageOutputDirectory = directoryState.autoImageOutputDirectory;
  const autoImageInputLibraryDirectory = directoryState.autoImageInputLibraryDirectory;
  const videoOutputDirectoryValue = directoryState.videoOutputDirectory;
  const imageOutputDirectoryPlaceholder = autoImageOutputDirectory ||
    t(uiKeys.settings.system.autoDirectoryPlaceholder, { folder: "Images" });

  const accelerationState = deriveAccelerationState(settings, environmentScan);
  const attention = accelerationState.attention;
  const attentionTone = accelerationState.tone;
  const attentionStatus = accelerationState.status;
  const attentionProbeFailed = attentionStatus === "failed";
  const probeEvidenceLabel = (
    evidence: EnvironmentScanResult["attentionAcceleration"]["probeEvidence"]
  ): string => {
    if (!evidence) return s("accel.verificationPending");
    const timestamp = evidence.verifiedAt
      ? ` · ${options.formatScanTime(evidence.verifiedAt)}`
      : "";
    if (evidence.source === "live" && evidence.state === "valid") {
      return `${s("accel.verificationLive")}${timestamp}`;
    }
    if (evidence.source === "cache" && evidence.state === "valid") {
      return `${s("accel.verificationCached")}${timestamp}`;
    }
    if (evidence.source === "previous" && evidence.state === "valid") {
      return `${s("accel.verificationPrevious")}${timestamp}`;
    }
    return `${s("accel.verificationPending")}${timestamp}`;
  };
  const attentionVerificationLabel = probeEvidenceLabel(attention?.probeEvidence);
  const runtimeVerificationBlocked = viewModel.environmentScanning ||
    viewModel.attentionAccelerationInstalling ||
    viewModel.llamaCppPythonInstalling ||
    viewModel.strataInstalling ||
    !environmentScan?.comfyRoot;
  const h3VideoVaeState = deriveH3VideoVaeState(settings, environmentScan);
  const h3VideoVaeTone = h3VideoVaeState.tone;
  const h3VideoVaeStatusIcon = h3VideoVaeState.status === "missing"
    ? "circle-alert"
    : h3VideoVaeState.status === "waiting"
      ? "circle-help"
      : "circle-check";
  const h3VideoVaeStatusLabel = h3VideoVaeState.status === "missing"
    ? s("accel.unsupported")
    : h3VideoVaeState.status === "waiting"
      ? s("accel.pending")
      : s("accel.ready");
  const h3VideoVaeDetail = h3VideoVaeState.status === "missing"
    ? s("accel.videoVaeMissing")
    : h3VideoVaeState.status === "waiting"
      ? s("accel.videoVaeWaiting")
      : h3VideoVaeState.status === "fp16-only"
        ? s("accel.videoVaeFp16Only")
        : h3VideoVaeState.status === "int8-only"
          ? s("accel.videoVaeInt8Only")
          : s("accel.videoVaeBoth");
  const attentionInstallLines = viewModel.attentionAccelerationLog.split(/\r?\n/).filter(Boolean);
  const attentionInstallStage = attentionInstallLines.at(-1) ?? s("accel.preparing");
  const attentionStatusIcon = attentionStatus === "ready"
    ? "circle-check"
    : attentionProbeFailed
      ? "circle-help"
    : attentionStatus === "unsupported"
      ? "circle-alert"
      : "circle-help";
  const pythonSourceLabels: Record<string, string> = {
    selected: s("accel.sourceSelected"),
    "comfy-venv": s("accel.sourceComfyVenv"),
    embedded: s("accel.sourceEmbedded"),
    path: s("accel.sourcePath"),
    "py-launcher": s("accel.sourceLauncher"),
    other: s("accel.sourceOther")
  };
  const pythonRuntimes = accelerationState.pythonRuntimes;
  const effectivePythonPath = accelerationState.effectivePythonPath;
  const pythonSelectionLabel = accelerationState.pythonSelection === "comfy-venv"
    ? s("accel.sourceComfyVenv")
    : accelerationState.pythonSelection === "selected"
      ? s("accel.sourceSelected")
      : s("accel.autoDetect");
  const scannedComfyUiPath = environmentScan?.comfyInstallDirectory || environmentScan?.comfyRoot || "";
  const scannedComfyUiTypeLabel = environmentScan?.comfyInstallType === "desktop"
    ? t(uiKeys.settings.system.desktopInstall)
    : environmentScan?.comfyInstallType === "portable"
      ? t(uiKeys.settings.system.portableInstall)
      : environmentScan?.comfyInstallType === "manual"
        ? t(uiKeys.settings.system.manualInstall)
        : t(uiKeys.settings.system.dataDirectory);

  const comfyUiPanel = `
    <section class="settings-panel settings-comfy-panel">
      <section id="settings-environment-section" class="panel settings-section settings-form-card" aria-busy="${viewModel.environmentScanning}">
        <div class="section-heading">
          <div><h2>${t(uiKeys.settings.system.environmentTitle)}</h2></div>
          <span class="settings-action-status" role="status" aria-live="polite">${viewModel.environmentScanning ? t(uiKeys.settings.scanning) : ""}</span>
        </div>
        ${environmentOverview}
      </section>
      ${comfyCompatibilityPanel}
      ${environmentIssuesPanel}
      <section class="panel settings-section settings-form-card settings-installations-card">
        <div class="section-heading">
          <div><h2>${t(uiKeys.settings.system.installationTitle)}</h2></div>
          ${!environmentScan && viewModel.environmentScanning ? "" : comfyInstallations.length > 1 ? `<span class="model-badge">${t(uiKeys.settings.system.installationCount, { count: comfyInstallations.length })}</span>` : `<span class="model-badge">${t(comfyInstallations.length ? uiKeys.settings.system.found : uiKeys.settings.system.notFound)}</span>`}
        </div>
        ${pathField("comfy-install-directory", "pick-comfy-install-directory", t(uiKeys.settings.system.currentInstallEntry), effectiveComfyInstallDirectory, t(uiKeys.settings.system.directoryPlaceholder), effectiveComfyInstallDirectory)}
        ${scannedComfyUiPath && settings.comfyInstallDirectory && scannedComfyUiPath.replace(/[\\/]+$/, "").toLowerCase() !== settings.comfyInstallDirectory.replace(/[\\/]+$/, "").toLowerCase() ? `
        <div class="settings-environment-actions">
          <div><span class="eyebrow">${t(uiKeys.settings.system.detectedComfyUi, { type: scannedComfyUiTypeLabel })}</span><code title="${escape(scannedComfyUiPath)}">${escape(scannedComfyUiPath)}</code></div>
          <button class="secondary button-with-icon" id="use-scanned-comfy">${icon("check")}${t(uiKeys.settings.system.useScannedPaths)}</button>
        </div>` : ""}
        <div class="comfy-directory-map" aria-label="${t(uiKeys.settings.system.directoryStructureLabel)}">
          <div class="comfy-directory-row">
            <span class="comfy-directory-label">${t(uiKeys.settings.system.coreDirectory)}</span>
            <div><code title="${escape(effectiveComfyCoreDirectory)}">${escape(effectiveComfyCoreDirectory || t(uiKeys.settings.system.waitingScan))}</code></div>
          </div>
          <div class="comfy-directory-row">
            <span class="comfy-directory-label">${t(uiKeys.settings.system.dataNodeDirectory)}</span>
            <div><code title="${escape(effectiveComfyDataDirectory)}">${escape(effectiveComfyDataDirectory || t(uiKeys.settings.system.waitingScan))}</code></div>
          </div>
        </div>
        ${comfyInstallations.length ? `<div class="comfy-installation-list">
          ${comfyInstallations.map((installation) => {
            const active = settings.comfyInstallDirectory
              ? installation.selected || installation.directory.toLowerCase() === settings.comfyInstallDirectory.toLowerCase()
              : installation === comfyInstallations[0];
            const typeLabel = installation.type === "desktop"
              ? t(uiKeys.settings.system.desktop)
              : installation.type === "portable"
                ? t(uiKeys.settings.system.portable)
                : t(uiKeys.settings.system.source);
            const versionParts = [
              installation.desktopVersion ? t(uiKeys.settings.system.desktopVersion, { version: installation.desktopVersion }) : "",
              installation.version ? t(uiKeys.settings.system.coreVersion, { version: installation.version }) : ""
            ].filter(Boolean);
            const version = versionParts.join(" · ") || t(uiKeys.settings.system.versionMetadataMissing);
            const runtimeDetails = active && installation.type === "desktop"
              ? [
                  environmentScan?.attentionAcceleration?.torchVersion ? `PyTorch ${environmentScan.attentionAcceleration.torchVersion}` : "",
                  environmentScan?.attentionAcceleration?.cudaVersion ? `CUDA ${environmentScan.attentionAcceleration.cudaVersion}` : ""
                ].filter(Boolean).join(" · ")
              : "";
            const installationDetails = [
              installation.revision ? t(uiKeys.settings.system.revision, { value: installation.revision }) : "",
              runtimeDetails
            ].filter(Boolean).join(" · ");
            return `<article class="comfy-installation ${active ? "active" : ""}">
              <div><div class="model-title"><strong>${escape(typeLabel)}</strong><span class="model-badge">${escape(version)}</span></div><div class="comfy-installation-entry"><span>${t(uiKeys.settings.system.installEntry)}</span><code title="${escape(installation.directory)}">${escape(installation.directory)}</code></div>${installationDetails ? `<span class="muted comfy-installation-runtime" title="${escape(installationDetails)}">${escape(installationDetails)}</span>` : ""}</div>
              <button class="secondary button-with-icon" data-select-comfy-install="${escape(installation.directory)}" ${active ? "disabled" : ""}>${icon(active ? "check" : "play")}${active ? t(uiKeys.settings.system.currentUse) : t(uiKeys.settings.system.useVersion)}</button>
            </article>`;
          }).join("")}
        </div>` : !environmentScan && viewModel.environmentScanning ? "" : `<p class="muted proxy-hint">${t(uiKeys.settings.system.noInstallFoundDescription)}</p>`}
      </section>
      <section class="panel settings-section settings-form-card">
        <div class="section-heading"><div><h2>${t(uiKeys.settings.system.connectionTitle)}</h2></div></div>
        <div class="settings-row">
          <div class="settings-row-copy"><label for="comfy-url">${t(uiKeys.settings.system.serviceAddress)}</label></div>
          <div class="settings-row-control"><input id="comfy-url" value="${escape(settings.comfyUrl)}" placeholder="http://127.0.0.1:8188"><button class="secondary button-with-icon" data-test="comfy" ${viewModel.serviceForceStopping ? "disabled" : ""}>${icon("zap")}${t(uiKeys.settings.system.testConnection)}</button></div>
        </div>
        <div class="settings-row danger-zone">
          <div><strong>${t(uiKeys.settings.system.forceStop)}</strong><span class="muted danger-hint">${t(uiKeys.settings.system.forceStopHint)}</span></div>
          <button class="secondary destructive button-with-icon" id="force-stop-comfy" ${viewModel.serviceForceStopping || viewModel.serviceBusy ? "disabled" : ""}>${icon(viewModel.serviceForceStopping ? "refresh-cw" : "ban")}${t(viewModel.serviceForceStopping ? uiKeys.settings.system.forceStopping : uiKeys.settings.system.forceStop)}</button>
        </div>
        <div id="connection-result" class="connection-result muted" role="status" aria-live="polite" aria-atomic="true">${t(uiKeys.settings.system.connectionNotTested)}</div>
      </section>
      <section class="panel settings-section settings-form-card acceleration-section acceleration-runtime-panel">
        <div class="section-heading">
          <div><h2>${s("accel.runtimeTitle")}</h2></div>
          <span class="python-selection-badge">${pythonSelectionLabel}</span>
        </div>
        <div class="python-runtime-picker">
          <div class="python-runtime-picker-controls">
            <label class="python-path-field"><span class="runtime-label">${s("accel.currentPath")}</span><div class="input-action"><input id="comfy-python-path" data-auto-directory="${escape(effectivePythonPath)}" value="${escape(effectivePythonPath)}" placeholder="${s("accel.scanFill")}"><button class="secondary button-with-icon" id="pick-comfy-python">${icon("folder-open")}${s("accel.chooseFile")}</button></div></label>
            <label class="python-candidate-field"><span class="runtime-label">${s("accel.candidates")}</span><select id="comfy-python-candidate"><option value="">${viewModel.environmentScanning ? s("accel.scanning") : pythonRuntimes.length ? s("accel.chooseInterpreter") : s("accel.noPython")}</option>${pythonRuntimes.map((runtime) => `<option value="${escape(runtime.path)}" ${runtime.path.toLowerCase() === effectivePythonPath.toLowerCase() ? "selected" : ""}>Python ${escape(runtime.version)} · ${escape(pythonSourceLabels[runtime.source] ?? runtime.source)}${runtime.path.toLowerCase() === effectivePythonPath.toLowerCase() ? ` · ${s("accel.current")}` : ""}</option>`).join("")}</select></label>
          </div>
        </div>
      </section>
    </section>`;

  const applicationPathsPanel = `
    <section class="settings-panel settings-application-panel">
      <section class="panel settings-section settings-form-card">
        <label class="settings-row"><span>${t(uiKeys.settings.localeTitle)}</span>
        <select id="ui-locale" aria-label="${t(uiKeys.settings.localeTitle)}"><option value="zh-CN" ${settings.uiLocale === "zh-CN" ? "selected" : ""}>${t(uiKeys.settings.localeChinese)}</option><option value="zh-TW" ${settings.uiLocale === "zh-TW" ? "selected" : ""}>${t(uiKeys.settings.localeTraditionalChinese)}</option><option value="en-US" ${settings.uiLocale === "en-US" ? "selected" : ""}>${t(uiKeys.settings.localeEnglish)}</option></select>
        </label>
      </section>
      <section class="panel settings-section settings-form-card settings-paths-card">
        <div class="section-heading"><div><h2>${t(uiKeys.settings.system.filePathsTitle)}</h2></div><button class="secondary button-with-icon" id="open-image-asset-library">${icon("folder-open")}${t(uiKeys.settings.system.assetLibraryMaintenance)}</button></div>
        <div class="path-settings-group primary-paths">
          <div class="settings-grid two">
            ${pathField("output-directory", "pick-output-directory", t(uiKeys.settings.system.videoOutputDirectory), videoOutputDirectoryValue, t(uiKeys.settings.system.autoDirectoryPlaceholder, { folder: "Videos" }), autoVideoOutputDirectory)}
            ${pathField("image-output-directory", "pick-image-output-directory", t(uiKeys.settings.system.imageOutputDirectory), settings.imageOutputDirectory || autoImageOutputDirectory, imageOutputDirectoryPlaceholder, autoImageOutputDirectory)}
          </div>
        </div>
        <div class="path-settings-group resource-paths">
          <div class="settings-grid two">
            ${pathField("library-directory", "pick-library-directory", t(uiKeys.settings.system.libraryDirectory), settings.libraryDirectory ?? "", "")}
          </div>
          <div class="settings-grid two">
            ${pathField("image-input-library-directory", "pick-image-input-library-directory", t(uiKeys.settings.system.inputLibrary), settings.imageInputLibraryDirectory || autoImageInputLibraryDirectory, t(uiKeys.settings.system.inputLibraryPlaceholder), autoImageInputLibraryDirectory)}
            ${pathField("model-directory", "pick-model-directory", t(uiKeys.settings.system.modelDirectory), effectiveModelDirectory, t(uiKeys.settings.system.modelDirectoryPlaceholder))}
          </div>
        </div>
      </section>
      ${cachePanel}
      ${renderLanBrowserSettings(settings, t, options.escapeHtml)}
      <section class="panel settings-section settings-form-card">
        <div class="section-heading"><div><h2>${t(uiKeys.settings.system.proxyTitle)}</h2></div><span class="model-badge">${t(settings.proxyEnabled ? uiKeys.settings.system.enabled : uiKeys.settings.system.disabled)}</span></div>
        <div class="settings-grid two">
          <label class="ios-switch-field"><span class="policy-copy"><strong>${t(uiKeys.settings.system.enableProxy)}</strong><small>${t(uiKeys.settings.system.proxyResourceDescription)}</small></span><input id="proxy-enabled" type="checkbox" ${settings.proxyEnabled ? "checked" : ""}><span class="ios-switch" aria-hidden="true"></span></label>
          <label>${t(uiKeys.settings.system.proxyAddress)}<input id="proxy-url" value="${escape(settings.proxyUrl)}" placeholder="http://127.0.0.1:7890"></label>
          <label>${t(uiKeys.settings.system.useHfMirror)}<select id="model-download-source">${modelDownloadSources.map(source => `<option value="${source.id}" ${modelDownloadSource(settings) === source.id ? "selected" : ""} data-description="${escape(source.id === "custom" ? "" : t(downloadDescriptions[source.id]))}">${escape(source.id === "custom" ? t(uiKeys.settings.system.downloadCustom) : source.label)}</option>`).join("")}</select></label>
          <label data-model-download-custom ${modelDownloadSource(settings) === "custom" ? "" : "hidden"}>${t(uiKeys.settings.system.downloadCustom)}<input id="model-download-custom-url" type="url" value="${escape(settings.modelDownloadCustomUrl ?? "")}" placeholder="https://hf.example.com" ${modelDownloadSource(settings) === "custom" ? "required" : ""}></label>
        </div>
      </section>
      <section class="panel settings-section settings-form-card">
        <div class="section-heading"><div><h2>${t(uiKeys.settings.system.gpuPolicyTitle)}</h2></div></div>
        <div class="gpu-hardware-block">
          ${gpuCards}
        </div>
        <div class="runtime-policy-grid">
          <div class="settings-row"><span>${t(uiKeys.settings.system.vramReserve)}</span><div class="settings-reserve-control">
            <select id="vram-reserve" data-native-select hidden aria-label="${t(uiKeys.settings.system.vramReserve)}"><option value="0.5" ${settings.vramReserveGb === 0.5 ? "selected" : ""}>0.5 GB · ${t(uiKeys.settings.system.aggressive)}</option><option value="0.75" ${settings.vramReserveGb === 0.75 ? "selected" : ""}>0.75 GB · ${t(uiKeys.settings.system.balanced)}</option><option value="1" ${settings.vramReserveGb === 1 ? "selected" : ""}>1 GB · ${t(uiKeys.settings.system.conservative)}</option></select>
            <div class="settings-choice-segment" data-ui-segmented="settings-vram-reserve" role="group" aria-label="${t(uiKeys.settings.system.vramReserve)}">${[0.5, 0.75, 1].map((value) => `<button type="button" class="ghost" id="settings-reserve-${value}" data-settings-reserve="${value}" aria-pressed="${settings.vramReserveGb === value}">${value} GB</button>`).join("")}</div>
          </div></div>
          <label class="ios-switch-field"><span class="policy-copy"><strong>${t(uiKeys.settings.system.safeCancel)}</strong><small>${t(uiKeys.settings.system.safeCancelDescription)}</small></span><input id="safe-cancel" type="checkbox" ${settings.safeCancel ? "checked" : ""}><span class="ios-switch" aria-hidden="true"></span></label>
          <label class="ios-switch-field"><span class="policy-copy"><strong>${t(uiKeys.settings.system.autoRetry)}</strong><small>${t(uiKeys.settings.system.autoRetryDescription)}</small></span><input id="auto-retry-failed-tasks" type="checkbox" ${settings.autoRetryFailedTasks ? "checked" : ""}><span class="ios-switch" aria-hidden="true"></span></label>
          <label class="policy-select-field"><span>${t(uiKeys.settings.system.retryCount)}</span><select id="auto-retry-count" ${settings.autoRetryFailedTasks || settings.vramStallWatchdogMinutes !== 0 ? "" : "disabled"}>${[1, 2, 3, 4, 5].map((count) => `<option value="${count}" ${settings.autoRetryCount === count ? "selected" : ""}>${t(uiKeys.settings.system.retryCountValue, { count, suffix: count === 2 ? ` · ${t(uiKeys.settings.system.recommended)}` : "" })}</option>`).join("")}</select></label>
          <label class="policy-select-field">${fieldLabelWithTip(t(uiKeys.settings.system.vramStallWatchdog), t(uiKeys.settings.system.vramStallWatchdogDescription))}<select id="vram-stall-watchdog-minutes"><option value="0" ${settings.vramStallWatchdogMinutes === 0 ? "selected" : ""}>${t(uiKeys.settings.system.vramStallWatchdogOff)}</option><option value="1" ${settings.vramStallWatchdogMinutes === 1 ? "selected" : ""}>${t(uiKeys.settings.system.vramStallWatchdogMinutes, { minutes: 1 })}</option><option value="5" ${settings.vramStallWatchdogMinutes === 5 ? "selected" : ""}>${t(uiKeys.settings.system.vramStallWatchdogMinutes, { minutes: 5 })}</option><option value="10" ${settings.vramStallWatchdogMinutes === 10 ? "selected" : ""}>${t(uiKeys.settings.system.vramStallWatchdogMinutes, { minutes: 10 })}</option><option value="15" ${settings.vramStallWatchdogMinutes === 15 ? "selected" : ""}>${t(uiKeys.settings.system.vramStallWatchdogMinutes, { minutes: 15 })}</option></select></label>
          <label class="policy-select-field">${fieldLabelWithTip(t(uiKeys.settings.system.queueIsolationMode), t(uiKeys.settings.system.queueIsolationDescription))}<select id="queue-isolation-mode"><option value="never" ${settings.queueIsolationMode === "never" ? "selected" : ""}>${t(uiKeys.settings.system.queueIsolationNever)}</option><option value="lora" ${settings.queueIsolationMode === "lora" ? "selected" : ""}>${t(uiKeys.settings.system.queueIsolationLora)}</option><option value="model-change" ${settings.queueIsolationMode === "model-change" ? "selected" : ""}>${t(uiKeys.settings.system.queueIsolationModelChange)}</option><option value="always" ${settings.queueIsolationMode === "always" ? "selected" : ""}>${t(uiKeys.settings.system.queueIsolationAlways)}</option></select></label>
        </div>
      </section>
    </section>`;

  const videoPanel = `
    <section class="settings-panel settings-catalog-panel">
      <div class="settings-nodes-heading"><h2>${s("video.title")}</h2></div>
      <section class="panel settings-section settings-form-card">
        <div class="settings-grid two default-video-model-grid">
          <label>${s("video.defaultModel")}<select id="default-video-model">
            ${videoSelectorProfiles.map((profile) => `<option value="${profile.id}" ${settings.defaultVideoModel === profile.id ? "selected" : ""} ${!profile.available || profile.integrated === false ? "disabled" : ""}>${escape(profile.name)}${!profile.available ? s("video.missingComponent") : profile.integrated === false ? s("video.workflowPending") : ""}</option>`).join("")}
          </select></label>
          <label>${s("video.defaultExtensionModel")}<select id="default-extension-model">
            ${extensionProfiles.map((profile) => `<option value="${profile.id}" ${settings.defaultExtensionModel === profile.id ? "selected" : ""} ${!profile.available || profile.integrated === false ? "disabled" : ""}>${escape(profile.name)}${!profile.available ? s("video.missingComponent") : profile.integrated === false ? s("video.workflowPending") : ""}</option>`).join("")}
          </select></label>
        </div>
      </section>
      <div class="model-profile-list">${videoProfiles.length ? videoProfiles.map((profile) => renderProfileCard(profile)).join("") : `<div class="panel environment-empty">${s("video.empty")}</div>`}</div>
      <section class="panel settings-section settings-form-card settings-sulphur-card">
        <div class="section-heading"><div><h2>${s("sulphur.title")}</h2></div><span class="model-badge">${s("sulphur.badge")}</span></div>
        <div class="settings-grid two settings-sulphur-grid">
          <label>${s("sulphur.transformer")}<select id="ltx-extension-model-profile"><option value="q2_distilled" ${settings.ltxExtensionModelProfile === "q2_distilled" ? "selected" : ""}>Q2_K distilled · 7.93 GB · 8GB compatible</option><option value="q3_k_m" ${settings.ltxExtensionModelProfile === "q3_k_m" ? "selected" : ""}>Q3_K_M dev · 11.13 GB · ${s("sulphur.recommended")}</option><option value="q4_k_m" ${settings.ltxExtensionModelProfile === "q4_k_m" ? "selected" : ""}>Q4_K_M dev · 14.30 GB · quality</option></select></label>
          <label>${s("sulphur.resolution")}<select id="ltx-extension-resolution"><option value="360" ${settings.ltxExtensionResolution === 360 ? "selected" : ""}>360p · ${s("sulphur.recommended")}</option><option value="480" ${settings.ltxExtensionResolution === 480 ? "selected" : ""}>480p · ${s("sulphur.slower")}</option></select></label>
          <label>${s("sulphur.frames")}<select id="ltx-extension-frames"><option value="49" ${settings.ltxExtensionFrames === 49 ? "selected" : ""}>49 ${s("sulphur.framesUnit")} · ${s("sulphur.recommended")}</option><option value="65" ${settings.ltxExtensionFrames === 65 ? "selected" : ""}>65 ${s("sulphur.framesUnit")} · ${s("sulphur.longer")}</option></select></label>
          <label>${s("sulphur.timeout")}<select id="ltx-extension-timeout"><option value="10" ${settings.ltxExtensionTimeoutMinutes === 10 ? "selected" : ""}>10 ${s("sulphur.minutesUnit")} · ${s("sulphur.fastStop")}</option><option value="20" ${settings.ltxExtensionTimeoutMinutes === 20 ? "selected" : ""}>20 ${s("sulphur.minutesUnit")} · ${s("sulphur.recommended")}</option><option value="30" ${settings.ltxExtensionTimeoutMinutes === 30 ? "selected" : ""}>30 ${s("sulphur.minutesUnit")} · ${s("sulphur.verySlow")}</option></select></label>
        </div>
        <details class="settings-runtime-details settings-sulphur-details"><summary>${s("nodes.details")}</summary><p class="muted">${s("sulphur.note")}</p></details>
      </section>
    </section>`;

  const loraPanel = `
    <section class="settings-panel">
      <div class="settings-nodes-heading"><h2>${s("lora.title")}</h2><span class="model-badge">${s("lora.available", { available: loraAvailable, total: loraProfiles.length })}</span></div>
      <div class="settings-lora-groups">${loraProfiles.length ? groupSettingsLoras(loraProfiles).map(group => `<section class="settings-lora-group"><div class="settings-node-group-title"><h3>${escape(group.title || s("lora.other"))}</h3><span>${s("lora.available", { available: group.profiles.filter(profile => profile.available).length, total: group.profiles.length })}</span></div><div class="settings-lora-grid">${group.profiles.map(profile => renderProfileCard(profile)).join("")}</div></section>`).join("") : `<div class="panel environment-empty">${s("lora.empty")}</div>`}</div>
    </section>`;

  const imagePanel = `
    <section class="settings-panel settings-catalog-panel">
      <div class="settings-nodes-heading"><h2>${s("image.title")}</h2></div>
      <section class="panel settings-section settings-form-card">
        <div class="settings-grid two">
          <label>${s("image.defaultModel")}<select id="default-image-model">
            ${(imageProfiles.length ? imageProfiles : modelCatalog.list("image").map((entry) => ({
              id: entry.definition.id,
              name: modelCatalog.localized(entry.definition.id, settings.uiLocale)?.name ?? entry.definition.id,
              category: "image" as const,
              badge: modelCatalog.localized(entry.definition.id, settings.uiLocale)?.badge ?? "",
              description: modelCatalog.localized(entry.definition.id, settings.uiLocale)?.description ?? "",
              vram: entry.definition.scan?.vram ?? "",
              available: false,
              integrated: entry.definition.scan?.integrated !== false,
              components: []
            }))).map((profile) => `<option value="${escape(profile.id)}" ${settings.defaultImageModel === profile.id ? "selected" : ""} ${options.isImageModelSelectable(profile) ? "" : "disabled"}>${escape(profile.name)}${options.isImageModelSelectable(profile) ? "" : ` · ${escape(options.imageWorkflowStatus(profile))}`}</option>`).join("")}
          </select></label>
          <label>${s("image.defaultQuality")}<select id="image-quality-profile">
            ${imageQualityProfiles.map((profile) => `<option value="${escape(profile.id)}" ${settings.defaultImageQualityProfile === profile.id ? "selected" : ""}>${escape(profile.label)} · ${profile.steps} ${t(uiKeys.create.videoSettings.stepsUnit)}</option>`).join("")}
          </select></label>
        </div>
      </section>
      <div class="model-profile-list">${imageProfiles.length ? imageProfiles.map((profile) => renderProfileCard(profile)).join("") : `<div class="panel environment-empty">${s("image.empty")}</div>`}</div>
    </section>`;

  const promptPanel = `
    <section class="settings-panel settings-catalog-panel">
      <div class="settings-nodes-heading"><h2>${t(uiKeys.settings.tabPrompt)}</h2></div>
      <section class="panel settings-section settings-form-card">
        <div class="section-heading"><div><h2>${s("prompt.localModel")}</h2></div><div class="button-row"><span class="model-badge">${s("prompt.badge")}</span><button class="icon-button prompt-runtime-button ${viewModel.promptRuntimeControlIconName === "refresh-cw" ? "busy" : ""}" id="release-prompt-model" ${(viewModel.promptRuntimeBusy && viewModel.promptRuntimeControlIconName !== "square") || viewModel.queueRunning || (!viewModel.promptRuntimeLoaded && !viewModel.promptStatus.ready && viewModel.promptRuntimeControlIconName !== "square") ? "disabled" : ""} aria-label="${escape(viewModel.promptRuntimeControlTitle)}" title="${escape(viewModel.promptRuntimeControlTitle)}" aria-busy="${viewModel.promptRuntimeControlIconName === "refresh-cw"}">${icon(viewModel.promptRuntimeControlIconName)}</button></div></div>
        <label class="settings-row">${s("prompt.defaultModel")}<select id="prompt-model-id">${selectablePromptProfiles.map((profile) => `<option value="${escape(profile.id)}" ${settings.promptModelId === profile.id ? "selected" : ""} ${!profile.available || profile.integrated === false ? "disabled" : ""}>${escape(profile.name)}${!profile.available ? s("prompt.missingComponent") : profile.integrated === false ? s("video.workflowPending") : ""} ${s("prompt.videoImage")}</option>`).join("")}</select></label>
        <div class="settings-grid two">
        ${settings.promptModelId.startsWith("strata/") ? `
          <label>${s("prompt.uncensored")}<select id="strata-uncensored" ${supportsStrataUncensored(settings.promptModelId) ? "" : "disabled"}>${(["off", "builtin", "community"] as const).map(mode => `<option value="${mode}" ${strataUncensoredMode(settings) === mode ? "selected" : ""}>${s(`prompt.uncensored.${mode}`)}</option>`).join("")}</select></label>
          <div class="settings-row"><span>${s("prompt.reasoning")}</span><div class="settings-reserve-control"><select id="strata-reasoning-effort" data-native-select hidden aria-label="${s("prompt.reasoning")}">${strataReasoningEfforts.map(effort => `<option value="${effort}" ${normalizeStrataReasoningEffort(settings.strataReasoningEffort) === effort ? "selected" : ""}>${s(`prompt.reasoning.${effort}`)}</option>`).join("")}</select><div class="settings-choice-segment" data-ui-segmented="settings-reasoning" role="group" aria-label="${s("prompt.reasoning")}">${strataReasoningEfforts.map(effort => `<button type="button" class="ghost" data-settings-reasoning="${effort}" aria-pressed="${normalizeStrataReasoningEffort(settings.strataReasoningEffort) === effort}">${s(`prompt.reasoning.${effort}`)}</button>`).join("")}</div></div></div>
        ` : ""}
          <label>${s("prompt.language")}<select id="prompt-language"><option value="auto" ${settings.promptLanguage === "auto" ? "selected" : ""}>${s("prompt.followInput")}</option><option value="zh" ${settings.promptLanguage === "zh" ? "selected" : ""}>${s("prompt.chinese")}</option><option value="en" ${settings.promptLanguage === "en" ? "selected" : ""}>${s("prompt.english")}</option></select></label>
          <div class="settings-row"><label for="prompt-creativity">${s("prompt.creativity")}</label><div class="settings-slider-field"><input id="prompt-creativity" type="range" min="${Math.min(0, settings.promptCreativity)}" max="${Math.max(1.5, settings.promptCreativity)}" step="${Number.isInteger(settings.promptCreativity * 10) ? "0.1" : "any"}" value="${settings.promptCreativity}" aria-label="${s("prompt.creativity")}"><input id="prompt-creativity-number" type="number" min="${Math.min(0, settings.promptCreativity)}" max="${Math.max(1.5, settings.promptCreativity)}" step="${Number.isInteger(settings.promptCreativity * 10) ? "0.1" : "any"}" value="${settings.promptCreativity}" aria-label="${s("prompt.creativity")}"></div></div>
        </div>
      </section>
      <section class="panel settings-section settings-form-card settings-preset-card">
        <div class="section-heading"><div><h2>${s("prompt.videoPresetTitle")}</h2></div><button class="secondary button-with-icon" id="restore-h3-prompt-presets">${icon("rotate-ccw")}${s("prompt.restore")}</button></div>
        <label class="settings-row"><span class="settings-row-copy"><span>${s("prompt.currentPreset")}</span></span><select id="h3-prompt-preset-setting">${options.h3PromptPresetOptions(viewModel.settingsH3PromptPreset, true)}</select></label>
        <label class="settings-row settings-preset-rule"><span class="settings-row-copy"><span>${s("prompt.ruleHeader")}</span><span class="muted">${s("prompt.h3Note")}</span></span><textarea id="h3-prompt-preset-text" rows="7">${escape(selectedH3PresetText)}</textarea></label>
      </section>
      <section class="panel settings-section settings-form-card settings-preset-card">
        <div class="section-heading"><div><h2>${s("prompt.autoVideoPresetTitle")}</h2></div><button class="secondary button-with-icon" id="restore-h3-auto-prompt-seeds">${icon("rotate-ccw")}${s("prompt.restore")}</button></div>
        <label class="settings-row"><span class="settings-row-copy"><span>${s("prompt.autoVideoPresetSelection")}</span></span><select id="h3-auto-prompt-seed-setting"><option value="" data-description="${escape(s("prompt.autoVideoPresetRandomHint"))}" ${!selectedAutoPromptSeed ? "selected" : ""}>${s("prompt.autoVideoPresetRandom")}</option>${options.h3AutoPromptSeeds.map((seed) => { const description = settingsH3AutoPromptSeedDescription(settings.uiLocale, seed.id, seed.label); return `<option value="${escape(seed.id)}" data-description="${escape(description)}" title="${escape(description)}" ${selectedAutoPromptSeed?.id === seed.id ? "selected" : ""}>${escape(seed.label)}</option>`; }).join("")}</select></label>
        ${selectedAutoPromptSeed ? `<label class="settings-row settings-preset-rule"><span>${s("prompt.autoVideoPresetRule")}</span><textarea id="h3-auto-prompt-seed-text" rows="7">${escape(selectedAutoPromptSeedText)}</textarea></label>` : ""}
      </section>
      <section class="panel settings-section settings-form-card settings-preset-card">
        <div class="section-heading"><div><h2>${s("prompt.imagePresetTitle")}</h2></div><button class="secondary button-with-icon" id="restore-image-prompt-presets">${icon("rotate-ccw")}${s("prompt.restore")}</button></div>
        <label class="settings-row"><span class="settings-row-copy"><span>${s("prompt.currentPreset")}</span></span><select id="image-prompt-preset-setting">${Object.entries(options.imagePromptPresetLabels).map(([id, label]) => `<option value="${id}" data-description="${escape(options.imagePromptPresetDescriptions[id as ImagePromptPreset] ?? '')}" ${viewModel.settingsImagePromptPreset === id ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        <label class="settings-row settings-preset-rule"><span class="settings-row-copy"><span>${s("prompt.ruleHeader")}</span><span class="muted">${s("prompt.imageNote")}</span></span><textarea id="image-prompt-preset-text" rows="7">${escape(selectedImagePromptPresetText)}</textarea></label>
      </section>
      <div class="model-profile-list">${promptProfiles.length ? promptProfiles.map((profile) => renderProfileCard(profile)).join("") : `<div class="panel environment-empty">${s("prompt.empty")}</div>`}</div>
    </section>`;

  const upscalePanel = `
    <section class="settings-panel settings-catalog-panel">
      <div class="settings-nodes-heading"><h2>${s("upscale.title")}</h2></div>
      <section class="panel settings-section settings-form-card">
        <label class="settings-row">${s("upscale.defaultModel")}<select id="default-upscale-model">${upscaleProfiles.map((profile) => `<option value="${profile.id}" ${settings.defaultUpscaleModel === profile.id ? "selected" : ""} ${!profile.available || profile.integrated === false ? "disabled" : ""}>${escape(profile.name)}${!profile.available ? s("upscale.missingComponent") : profile.integrated === false ? s("video.workflowPending") : ""}</option>`).join("")}</select></label>
      </section>
      <div class="model-profile-list">${upscaleProfiles.length ? upscaleProfiles.map((profile) => renderProfileCard(profile)).join("") : `<div class="panel environment-empty">${s("upscale.empty")}</div>`}</div>
    </section>`;

  const llamaCppPython = environmentScan?.llamaCppPython;
  const llamaPythonUpdateAvailable = Boolean(llamaCppPython?.installed && llamaCppPython.packageVersion &&
    compareReleaseVersions(llamaCppPython.packageVersion, LLAMA_CPP_PYTHON_JAMEPENG_VERSION) < 0);
  const llamaPythonOperation = !llamaCppPython?.installed ? "install" : llamaPythonUpdateAvailable ? "update" : "reinstall";
  const llamaPythonTone = !environmentScan
    ? "warning"
    : llamaCppPython?.ready
      ? llamaPythonUpdateAvailable ? "warning" : "available"
      : llamaCppPython?.nativeCrash
        ? "missing"
        : llamaCppPython?.installed
          ? "warning"
          : "missing";
  const llamaPythonStatus = !environmentScan
    ? s("nodes.notChecked")
    : llamaCppPython?.ready
      ? s(llamaPythonUpdateAvailable ? "nodes.needsUpdate" : "nodes.runtimeVerified")
      : llamaCppPython?.installed
        ? s("nodes.installedRepair")
        : s("nodes.notInstalled");
  const llamaPythonDetail = environmentScan
    ? llamaCppPython?.detail || s("nodes.notInstalled")
    : s("nodes.notChecked");
  const llamaPythonEnvironment = [
    llamaCppPython?.pythonPath ? `${s("nodes.pythonEnvironment")}${llamaCppPython.pythonPath}` : "",
    llamaCppPython?.pythonVersion ? `Python ${llamaCppPython.pythonVersion}` : "",
    llamaCppPython?.torchVersion ? `PyTorch ${llamaCppPython.torchVersion}` : "",
    llamaCppPython?.cudaVersion ? `CUDA ${llamaCppPython.cudaVersion}` : ""
  ].filter(Boolean).join(" · ");
  const llamaPythonStatusIcon = llamaPythonTone === "available"
    ? "circle-check"
    : llamaPythonTone === "warning"
      ? "circle-help"
      : "circle-alert";
  const llamaPythonActionBlocked = customNodeInstallGloballyBlocked ||
    viewModel.llamaCppPythonInstalling ||
    !environmentScan?.comfyRoot;
  const customNodes = [...(environmentScan?.customNodes ?? [])]
    .filter((node) => node.retired !== true && node.id !== "h3-optimizations")
    .sort((left, right) => compareDependencyIds(left.id, right.id));
  const nodeDependencyAvailable = customNodes.filter((node) => node.installed).length +
    (llamaCppPython?.ready ? 1 : 0) +
    (attention?.ready ? 1 : 0) +
    (isStrataRuntimeInstalled(settings, environmentScan?.strataPreparation) ? 1 : 0);
  const nodeDependencyTotal = customNodes.length + 3;
  const bulkNodeIds = customNodeIdsForBulkAction(customNodes);
  const bulkActionMode = customNodeBulkActionMode(customNodes);
  const bulkActionLabel = bulkActionMode === "update"
    ? s("nodes.updateAvailable")
    : bulkActionMode === "install"
      ? s("nodes.installMissing")
      : bulkActionMode === "mixed"
        ? s("nodes.installAll")
        : s("nodes.updateAvailable");
  const llamaPythonCard = `
    <article class="panel custom-node-card settings-node-item settings-runtime-card ${llamaPythonTone}" data-settings-runtime="llama" data-install-state="${viewModel.llamaCppPythonInstalling ? "processing" : "idle"}">
      <div class="custom-node-copy">
        <div class="settings-node-top"><div class="model-title"><h3>${s("nodes.llamaTitle")}</h3><span class="model-badge">${s("nodes.llamaBadge")}</span></div><span class="model-availability ${llamaPythonTone}" role="status" aria-live="polite"${llamaPythonEnvironment ? ` title="${escape(llamaPythonEnvironment)}"` : ""}>${icon(llamaPythonStatusIcon)} ${viewModel.llamaCppPythonInstalling ? s("nodes.processing") : llamaPythonStatus}</span></div>
        <p class="settings-node-purpose" title="${s("nodes.llamaDescription")}">${s("nodes.llamaDescription")}</p>

      </div>
      ${llamaCppPython?.installed && !llamaCppPython.ready && !viewModel.llamaCppPythonInstalling ? `<p class="node-error" role="alert">${escape(llamaPythonDetail)}</p>` : ""}
      <div class="settings-node-footer">${renderDependencyVersions(settings.uiLocale, escape, { current: llamaCppPython?.packageVersion || "", recommended: LLAMA_CPP_PYTHON_JAMEPENG_VERSION, latest: llamaCppPython?.latestVersion || "", latestSource: llamaCppPython?.latestVersion ? "GitHub Release · JamePeng" : undefined, currentFallback: llamaCppPython?.installed === false ? s("nodes.notInstalled") : "—", fallback: "—" })}<div class="custom-node-actions">
        ${renderDependencyActionSplit(`<button class="primary button-with-icon node-action-main" id="install-llama-cpp-python" data-node-operation="${llamaPythonOperation}" aria-busy="${viewModel.llamaCppPythonInstalling}" ${llamaPythonActionBlocked ? "disabled" : ""}${llamaPythonActionBlocked && (viewModel.hasRunningQueueTask || viewModel.queueRunning) ? ` title="${escape(t(uiKeys.settings.actions.runningTaskBlocked))}"` : ""}>${icon(viewModel.llamaCppPythonInstalling ? "refresh-cw" : llamaPythonUpdateAvailable ? "circle-arrow-up" : llamaCppPython?.installed ? "refresh-cw" : "download")}${viewModel.llamaCppPythonInstalling ? s("nodes.installing") : llamaPythonUpdateAvailable ? s("nodes.update") : llamaCppPython?.installed ? s("nodes.reinstall") : s("nodes.oneClickInstall")}</button>`, {
          locale: settings.uiLocale, escapeHtml: escape, icon,
          location: llamaCppPython?.packageDirectory || "", locationAvailable: Boolean(llamaCppPython?.installed && llamaCppPython.packageDirectory),
          cancellation: viewModel.llamaCppPythonInstalling ? { id: "python-runtime:llama-cpp-python", pending: viewModel.dependencyInstallCancelling?.includes("python-runtime:llama-cpp-python") } : undefined,
          menuActions: llamaCppPython?.installed ? `<button class="destructive-menu-action button-with-icon" data-uninstall-llama-cpp-python ${llamaPythonActionBlocked ? "disabled" : ""}>${icon("trash-2")}${s("nodes.uninstall")}</button>` : ""
        })}
      </div></div>
      ${renderDependencyFeedback(settings.uiLocale, "python-runtime:llama-cpp-python", viewModel.llamaCppPythonLog, viewModel.llamaCppPythonInstalling)}
    </article>`;
  const desktopRuntimeHint = environmentScan?.comfyInstallType === "desktop" ? `${s("accel.desktopTorchTitle")}\n${s("accel.desktopTorchHint")}` : "";
  const runtimeTile = (label: string, value: string | undefined, tip: string, detail = "") => `<article class="attention-runtime-card field-info" data-tooltip-toggle tabindex="0" aria-expanded="false" aria-label="${escape([label, value, tip].filter(Boolean).join(" · "))}"><div class="runtime-label">${escape(label)}</div><strong class="runtime-value">${escape(value || (attentionProbeFailed ? s("accel.probeFailed") : s("accel.notFound")))}</strong>${detail ? `<span class="runtime-detail" title="${escape(detail)}">${escape(detail)}</span>` : ""}<span class="field-info-tip" role="tooltip">${escape(tip)}</span></article>`;
  const h3AccelerationCard = `
    <article class="panel custom-node-card settings-node-item settings-runtime-card ${attentionTone} h3-acceleration-card" data-settings-runtime="attention" data-install-state="${viewModel.attentionAccelerationInstalling ? "processing" : "idle"}">
      <div class="custom-node-copy">
        <div class="settings-node-top"><div class="model-title"><h3>${s("nodes.h3AccelerationTitle")}</h3><span class="model-badge">${s("nodes.h3AccelerationBadge")}</span><span data-probe-evidence="attention">${renderDependencyInfo([attention?.pythonPath || "", attentionVerificationLabel, desktopRuntimeHint].filter(Boolean).join("\n\n"), icon("info"))}</span></div><span class="model-availability ${attentionTone}" role="status" aria-live="polite">${icon(attentionStatusIcon)} ${viewModel.attentionAccelerationInstalling ? s("nodes.processing") : attentionStatus === "ready" ? s("accel.ready") : attentionStatus === "unsupported" ? s("accel.unsupported") : attentionProbeFailed ? s("accel.probeFailed") : s("accel.pending")}</span></div>
         <p class="settings-node-purpose" title="${s("nodes.h3AccelerationDescription")}">${s("nodes.h3AccelerationDescription")}</p>
         <div class="attention-runtime-grid">
          ${runtimeTile(s("accel.runtimePython"), attention?.pythonVersion, [s("accel.runtimePythonTip"), attention?.pythonPath].filter(Boolean).join("\n\n"))}
          ${runtimeTile(s("accel.runtimeTorch"), attention?.torchVersion, [s("accel.runtimeTorchTip"), attention?.comfyKitchenVersion ? "comfy-kitchen " + attention.comfyKitchenVersion : "", ...(attention?.comfyKitchenBackends ?? [])].filter(Boolean).join("\n\n"), s("accel.cuda") + " " + (attention?.cudaVersion || s("accel.unknown")) + " · " + s("accel.sm") + " " + (attention?.gpuArchitecture || s("accel.unknown")))}
          ${runtimeTile(s("accel.runtimeSage"), attention?.sageAttentionVersion, [s("accel.runtimeSageTip"), attention?.recommendedWheel].filter(Boolean).join("\n\n"))}
          ${runtimeTile(s("accel.runtimeKj"), attention?.tritonVersion, s("accel.runtimeKjTip"), attention?.kjNodesCompatible ? s("accel.kjAvailable") : attention?.kjNodesInstalled ? s("accel.kjUpdate") : s("accel.kjMissing"))}
        </div>
        ${attentionProbeFailed ? `<p class="node-error">${escape(attention?.probeError || s("accel.probeFailed"))}</p>` : ""}
        <div class="attention-install-progress" id="attention-install-progress" aria-live="polite" ${viewModel.attentionAccelerationInstalling ? "" : "hidden"}>
          <div class="progress indeterminate" role="progressbar" aria-label="${s("accel.progress")}" aria-valuemin="0" aria-valuemax="100"><span></span></div>
          <strong id="attention-install-stage">${escape(attentionInstallStage)}</strong>
        </div>
        <details class="node-log" id="attention-install-log-details" ${viewModel.attentionAccelerationInstalling ? "open" : ""} ${viewModel.attentionAccelerationInstalling || viewModel.attentionAccelerationLog ? "" : "hidden"}>
          <summary>${s("accel.log")}</summary>
          <pre id="attention-install-log">${escape(viewModel.attentionAccelerationLog)}</pre>
        </details>
      </div>
       <div class="settings-node-footer"><span class="settings-operation-note">${s("accel.stopComfy")}</span><div class="custom-node-actions">
         ${renderDependencyActionSplit(`<button class="primary button-with-icon node-action-main" id="install-attention-acceleration" aria-busy="${viewModel.attentionAccelerationInstalling}" ${viewModel.attentionAccelerationInstalling || !accelerationState.canInstall || !environmentScan?.comfyRoot ? "disabled" : ""}>${icon(viewModel.attentionAccelerationInstalling ? "refresh-cw" : "wand-sparkles")}${viewModel.attentionAccelerationInstalling ? s("accel.installing") : attentionStatus === "ready" ? s("accel.repair") : s("accel.install")}</button>`, {
           locale: settings.uiLocale, escapeHtml: escape, icon,
           location: attention?.pythonPath || "", locationAvailable: Boolean(attention?.pythonPath && (attention.ready || attention.sageAttentionVersion || attention.tritonVersion || attention.comfyKitchenVersion)),
           menuActions: `<button class="button-with-icon" id="verify-python-runtime" ${runtimeVerificationBlocked ? "disabled" : ""}>${icon(viewModel.environmentScanning ? "refresh-cw" : "scan-search")}${s("accel.verifyRuntime")}</button>`,
           cancellation: viewModel.attentionAccelerationInstalling ? { id: "attention-acceleration", pending: viewModel.dependencyInstallCancelling?.includes("attention-acceleration") } : undefined
         })}
      </div></div>
    </article>`;
  const customNodeCards = customNodes.map((node) => {
    const queuedIndex = viewModel.customNodeInstallQueue.indexOf(node.id);
    const active = viewModel.customNodeInstalling === node.id;
    const dlss5Runtime = node.id === DLSS5_NODE_ID
      ? environmentScan?.dlss5Runtime
      : undefined;
    const aetherScaleRuntime = node.id === AETHERSCALE_NODE_ID
      ? environmentScan?.aetherScaleRuntime
      : undefined;
    const providerRuntimeUnavailable = node.id === AETHERSCALE_NODE_ID
      ? isAetherScaleRuntimeUnavailable(aetherScaleRuntime)
      : isDlss5RuntimeUnavailable(dlss5Runtime);
    const providerRuntimeReason = providerRuntimeUnavailable
      ? aetherScaleRuntime?.error || aetherScaleRuntime?.missingFiles.join(s("shared.listSeparator")) ||
        dlss5Runtime?.error || dlss5Runtime?.missingFiles.join(s("shared.listSeparator")) || ""
      : "";
    const providerRuntimeDetail = (aetherScaleRuntime || dlss5Runtime) &&
      (aetherScaleRuntime?.state ?? dlss5Runtime?.state) !== "remote" &&
      (aetherScaleRuntime?.state ?? dlss5Runtime?.state) !== "unknown" &&
      (aetherScaleRuntime?.state ?? dlss5Runtime?.state) !== "offline"
      ? `<p class="muted"><strong>${s(node.id === AETHERSCALE_NODE_ID ? "nodes.aetherscaleRuntimeLabel" : "nodes.dlss5RuntimeLabel")}</strong>${providerRuntimeUnavailable ? s(node.id === AETHERSCALE_NODE_ID ? "nodes.aetherscaleRuntimeMissing" : "nodes.dlss5RuntimeMissing") : s(node.id === AETHERSCALE_NODE_ID ? "nodes.aetherscaleRuntimeReady" : "nodes.dlss5RuntimeReady")}${providerRuntimeReason ? ` · ${escape(providerRuntimeReason)}` : ""}</p>`
      : "";
    const cardState = deriveCustomNodeCardState({
      node,
      queuedIndex,
      active,
      finalizing: customNodeInstallFinalizing,
      inFinalizingBatch: viewModel.customNodeInstallBatch.includes(node.id),
      globallyBlocked: customNodeInstallGloballyBlocked,
      runtimeUnavailable: providerRuntimeUnavailable
    });
    const queued = cardState.queued;
    const installBlocked = cardState.installBlocked;
    const primaryOperation = cardState.primaryOperation;
    const manualOnly = node.appInstallable === false;
    const nodeGuide = [node.runtimeRequirement, node.runtimeNotice, node.id === "spectrum-minimax-h3" ? s("nodes.runtimeMemory") : ""].filter(Boolean).join("\n\n");
    const versionMode = node.versionMode ?? "release";
    const versionFallback = versionMode === "rolling"
      ? s("nodes.rollingVersion")
      : versionMode === "pinned"
        ? s("nodes.pinnedVersion")
        : "—";
    const policy = customNodeDefinition(node.id);
    const recommendedVersion = node.recommendedVersion || policy?.recommendedVersion || "";
    const recommendedTarget = recommendedVersion || node.installRevision || policy?.installRevision || (versionMode === "rolling" ? s("nodes.rollingRecommendation") : versionFallback);
    const recommendedLabel = /^[a-f0-9]{40}$/i.test(recommendedTarget) ? recommendedTarget.slice(0, 8) : recommendedTarget;
    const versionSummaryMarkup = versionMode === "release"
      ? renderDependencyVersions(settings.uiLocale, escape, { current: node.version, recommended: recommendedVersion,
          latest: node.latestVersion, latestSource: node.latestVersionSource, currentFallback: node.installed ? s("nodes.versionUnread") : s("nodes.notInstalled"), fallback: versionFallback })
      : `<p class="node-version-line" aria-label="${escape(s("nodes.versionSummary"))}">
          <span class="node-version-item"><span class="node-version-label">${s("nodes.versionLabel")}</span><strong class="node-version-value">${versionFallback}</strong></span>
          <span class="node-version-item" title="${escape(recommendedTarget)}"><span class="node-version-label">${s("nodes.recommendedVersion")}</span><strong class="node-version-value">${escape(recommendedLabel)}</strong></span>
          ${versionMode === "rolling" && node.revisionDate ? `<span class="node-version-separator" aria-hidden="true">·</span><span class="node-version-item"><span class="node-version-label">${s("nodes.commitDate")}</span><strong class="node-version-value">${escape(node.revisionDate)}</strong></span>` : ""}
        </p>`;
    const installStatus = cardState.phase === "processing"
      ? s("nodes.processing")
      : cardState.phase === "queued"
        ? s("nodes.waitingPosition", { position: queuedIndex + 1 })
        : cardState.phase === "finalizing"
          ? s("nodes.finalizing")
          : "";
    const statusMarkup = cardState.status === "processing" || cardState.status === "queued" || cardState.status === "finalizing"
      ? `${icon(active ? "refresh-cw" : "clock-3")} ${installStatus}`
      : cardState.status === "compatibility-error"
        ? `${icon("circle-alert")} ${s("nodes.compatibilityError")}`
          : cardState.status === "update"
            ? `${icon("circle-alert")} ${s("nodes.needsUpdate")}`
          : cardState.status === "runtime-missing"
            ? `${icon("circle-alert")} ${providerRuntimeUnavailable ? s(node.id === AETHERSCALE_NODE_ID ? "nodes.aetherscaleRuntimeMissing" : "nodes.dlss5RuntimeMissing") : s("nodes.runtimeMissing")}`
            : cardState.status === "file-ready"
              ? `${icon("circle-check")} ${s("nodes.fileCheckPassed")}`
              : cardState.status === "compatibility-warning"
                ? `${icon("circle-help")} ${s("nodes.compatibilityWarning")}`
                : cardState.status === "runtime-ready"
                  ? `${icon("circle-check")} ${s("nodes.runtimeVerified")}`
                  : cardState.status === "repair"
                    ? `${icon("circle-alert")} ${s("nodes.installedRepair")}`
                    : `${icon("circle-alert")} ${s("nodes.notInstalled")}`;
    return {
      id: node.id,
      markup: `
        <article class="panel custom-node-card settings-node-item ${cardState.tone}" data-settings-node="${escape(node.id)}" data-install-state="${cardState.phase || "idle"}">
          <div class="custom-node-copy">
            <div class="settings-node-top"><div class="model-title"><h3 title="${escape(node.name)}">${escape(node.name)}</h3>${node.required || manualOnly ? `<span class="model-badge">${node.required ? s("nodes.projectRequired") : s("nodes.manualInstall")}</span>` : ""}${renderDependencyInfo(nodeGuide, icon("info"))}</div><span class="model-availability ${cardState.tone}" role="status" aria-live="polite">${statusMarkup}</span></div>
            <p class="settings-node-purpose">${escape(settingsNodePurpose(settings.uiLocale, node.id, node.purpose))}</p>
            ${manualOnly ? `<p class="muted">${s("nodes.manualInstallHint")}</p>` : ""}
            ${providerRuntimeDetail}
            ${node.loadError ? `<span class="${node.compatibilityState === "warning" ? "node-update-notice" : "node-error"}">${escape(node.loadError)}</span>` : ""}
            ${node.updateNotice ? `<span class="node-update-notice">${escape(node.updateNotice)}</span>` : ""}
            ${node.duplicateDirectories?.length ? `<span class="node-update-notice">${escape(s("nodes.duplicateCopies", { paths: node.duplicateDirectories.join(s("shared.listSeparator")) }))}</span>` : ""}
            ${node.compatibilityNotice && node.compatibilityState !== "supported" && node.compatibilityNotice !== node.updateNotice ? `<span class="node-update-notice">${escape(node.compatibilityNotice)}</span>` : ""}
          </div>
          <div class="settings-node-footer">${versionSummaryMarkup}<div class="custom-node-actions">
            ${manualOnly ? `<div class="node-manual-actions">
              ${renderDependencyActionSplit(`<button class="secondary button-with-icon node-action-main" data-open-node-source="${escape(node.repositoryUrl)}">${icon("external-link")}${s("nodes.openSource")}</button>`, {
                locale: settings.uiLocale, escapeHtml: escape, icon,
                location: node.directory || "", locationAvailable: node.installed
              })}
              <button class="secondary button-with-icon" data-rescan-node="${escape(node.id)}" ${installBlocked ? "disabled" : ""}>${icon("scan-search")}${t(uiKeys.settings.rescan)}</button>
            </div>` : renderDependencyActionSplit(`<button class="primary button-with-icon node-action-main" aria-busy="${active || queued || cardState.phase === "finalizing"}" data-install-node="${escape(node.id)}" data-node-operation="${primaryOperation}" ${installBlocked ? "disabled" : ""}>${icon(active ? "refresh-cw" : queued ? "clock-3" : primaryOperation === "install" ? "download" : primaryOperation === "update" ? "circle-arrow-up" : primaryOperation === "repair" ? "wrench" : "refresh-cw")}${installStatus || (primaryOperation === "install" ? s("nodes.oneClickInstall") : primaryOperation === "repair" ? s("nodes.repair") : primaryOperation === "update" ? s("nodes.update") : s("nodes.reinstall"))}</button>`, {
              locale: settings.uiLocale, escapeHtml: escape, icon,
              location: node.directory || "", locationAvailable: node.installed,
              menuActions: `<button class="button-with-icon" data-open-node-source="${escape(node.repositoryUrl)}">${icon("external-link")}${s("nodes.openSource")}</button>${node.installed ? `<button class="destructive-menu-action button-with-icon" data-uninstall-node="${escape(node.id)}" ${installBlocked ? "disabled" : ""}>${icon("trash-2")}${s("nodes.uninstall")}</button>` : ""}`,
              cancellation: viewModel.customNodeInstallPhase === "installing" && (active || queued) ? { id: `custom-node:${node.id}`, queued, percent: active ? gitInstallProgress(viewModel.customNodeLogs[node.id] || "")?.percent : undefined, statusLabel: queued ? installStatus : undefined, pending: viewModel.dependencyInstallCancelling?.includes(`custom-node:${node.id}`) } : undefined
            })}
          </div></div>
          ${renderDependencyFeedback(settings.uiLocale, `custom-node:${node.id}`, viewModel.customNodeLogs[node.id] || "", active || cardState.phase === "finalizing")}
        </article>`
    };
  });
  const nodeGroups = ([
    ["video", "nodes.groupVideo"], ["upscale", "nodes.groupUpscale"],
    ["prompt", "nodes.groupPrompt"], ["general", "nodes.groupGeneral"]
  ] as const).map(([group, label]) => {
    const cards = customNodeCards.filter(card => settingsNodeGroup(card.id) === group);
    return cards.length ? `<section class="settings-node-group"><div class="settings-node-group-title"><h3>${s(label)}</h3><span>${cards.length}</span></div><div class="settings-node-grid">${cards.map(card => card.markup).join("")}</div></section>` : "";
  }).join("");
  const runtimeInstallName = viewModel.strataInstalling ? "Strata" : viewModel.attentionAccelerationInstalling ? s("nodes.h3AccelerationTitle") : viewModel.llamaCppPythonInstalling ? "llama-cpp-python" : "";
  const queueLabel = customNodeInstallFinalizing ? s("nodes.finalizing") : viewModel.customNodeInstalling
    ? s("nodes.processingName", { name: customNodes.find(node => node.id === viewModel.customNodeInstalling)?.name || viewModel.customNodeInstalling }) : runtimeInstallName ? s("nodes.processingName", { name: runtimeInstallName }) : "";
  const nodePanel = `
    <section class="settings-panel settings-nodes-panel">
      <div class="settings-nodes-heading"><h2>${s("nodes.title")}</h2><span class="model-badge">${nodeDependencyAvailable}/${nodeDependencyTotal} ${s("nodes.installed")}</span><button class="primary button-with-icon" id="install-all-custom-nodes" aria-busy="${viewModel.customNodeInstallPhase !== "idle"}" ${!bulkNodeIds.length || customNodeInstallGloballyBlocked || viewModel.customNodeInstallPhase !== "idle" ? "disabled" : ""}>${icon(bulkActionMode === "update" ? "refresh-cw" : bulkActionMode === "none" ? "circle-check" : "download")}${bulkActionLabel} <span class="button-count">${bulkNodeIds.length}</span></button></div>
      ${viewModel.customNodeInstallPhase !== "idle" || runtimeInstallName ? `<div class="settings-install-queue" role="status">${icon("refresh-cw")}<span>${escape(queueLabel)}${viewModel.customNodeInstallQueue.length ? ` · ${s("nodes.queuedCount", { count: viewModel.customNodeInstallQueue.length })}` : ""}</span>${viewModel.customNodeInstallQueue.length ? `<button class="ghost button-with-icon" id="cancel-waiting-node-installs">${icon("x")}${s("nodes.cancelWaiting")}</button>` : ""}</div>` : ""}
      <div class="settings-node-group-title"><h3>${s("nodes.groupRuntime")}</h3></div>
      <div class="settings-runtime-stack">
        ${renderStrataPreparationPanel(settings, environmentScan?.strataPreparation, options.escapeHtml, { icon, installing: viewModel.strataInstalling, cancelling: viewModel.dependencyInstallCancelling?.includes("python-runtime:strata"), progress: viewModel.strataInstallProgress, log: viewModel.strataLog, blocked: customNodeInstallGloballyBlocked || viewModel.llamaCppPythonInstalling || viewModel.attentionAccelerationInstalling || viewModel.environmentScanning })}
        ${h3AccelerationCard}${llamaPythonCard}
      </div>
      ${nodeGroups || `<div class="panel environment-empty">${s("nodes.empty")}</div>`}
    </section>`;

  const attentionModeTips: Record<Settings["h3AttentionMode"], string> = {
    sage: s("accel.modeSageTip"),
    "sage-triton": s("accel.modeSageTritonTip"),
    pytorch: s("accel.modePytorchTip"),
    "comfy-kitchen": s("accel.modeComfyKitchenTip")
  };
  const selectedAttentionModeTip = attentionModeTips[settings.h3AttentionMode] ?? attentionModeTips.sage;
  const sparseModeTips: Record<H3GlobalSparseAttentionMode, string> = {
    off: s("accel.sparseOffTip"),
    "sol-attn": s("accel.sparseSolAttnTip")
  };
  const selectedSparseMode: H3GlobalSparseAttentionMode = settings.h3SparseAttentionMode === "sol-attn" ? "sol-attn" : "off";
  const selectedSparseModeTip = sparseModeTips[selectedSparseMode];
  const runtimeModeTips: Record<Settings["h3RuntimeMode"], string> = {
    compatibility: s("accel.runtimeCompatibilityTip"),
    native: s("accel.runtimeNativeTip")
  };
  const selectedRuntimeModeTip = runtimeModeTips[settings.h3RuntimeMode];
  const h3VideoVaePanel = `
      <section class="panel settings-section settings-form-card acceleration-section h3-video-vae-panel ${h3VideoVaeTone}">
        <div class="section-heading">
          <div><h2>${s("accel.videoVaeTitle")}</h2></div>
          <span class="model-availability ${h3VideoVaeTone}" role="status" aria-live="polite">${icon(h3VideoVaeStatusIcon)} ${h3VideoVaeStatusLabel}</span>
        </div>
        <div class="acceleration-strategy-grid">
          <label class="acceleration-mode-field settings-row"><span class="settings-row-copy">${fieldLabelWithTip(s("accel.videoVaeMode"), s("accel.videoVaeModeTip"))}${!h3VideoVaeState.available || !h3VideoVaeState.fp16Available || !h3VideoVaeState.int8ConvrotAvailable ? `<span class="muted">${escape(h3VideoVaeDetail)}</span>` : ""}</span>
            <select id="h3-video-vae-mode" ${h3VideoVaeState.available ? "" : "disabled"}>
              <option value="auto" ${h3VideoVaeState.selectedMode === "auto" ? "selected" : ""}>${s("accel.videoVaeAuto")}</option>
              <option value="fp16" ${h3VideoVaeState.selectedMode === "fp16" ? "selected" : ""} ${h3VideoVaeState.fp16Available ? "" : "disabled"}>${s("accel.videoVaeFp16")}</option>
              <option value="int8-convrot" ${h3VideoVaeState.selectedMode === "int8-convrot" ? "selected" : ""} ${h3VideoVaeState.int8ConvrotAvailable ? "" : "disabled"}>${s("accel.videoVaeInt8")}</option>
            </select>
          </label>
        </div>
      </section>`;
  const accelerationPanel = `
    <section class="settings-panel acceleration-panel">
      <div class="settings-nodes-heading"><h2>${t(uiKeys.settings.tabAcceleration)}</h2></div>
      <section class="panel settings-section settings-form-card acceleration-section acceleration-strategy-panel ${attentionTone}">
        <div class="section-heading">
          <div><h2>${s("accel.strategyTitle")}</h2></div>
          <span class="model-availability ${attentionTone}">${attentionStatus === "ready" ? `${icon("circle-check")} ${s("accel.ready")}` : attentionStatus === "unsupported" ? `${icon("circle-alert")} ${s("accel.unsupported")}` : attentionProbeFailed ? `${icon("circle-help")} ${s("accel.probeFailed")}` : `${icon("circle-help")} ${s("accel.pending")}`}</span>
        </div>
        <div class="acceleration-strategy-grid">
          <label class="acceleration-mode-field settings-row"><span class="settings-row-copy">${fieldLabelWithTip(s("accel.mode"), [s("accel.modeTip"), s("accel.fallback")].join("\n\n"))}${attentionStatus !== "ready" ? `<span class="muted">${escape(attentionProbeFailed ? attention?.probeError || s("accel.probeFailed") : attention?.detail ?? s("accel.waitingScan"))}</span>` : ""}</span>
            <select id="h3-attention-mode" aria-describedby="h3-attention-description">
              <option value="sage" data-description="${escape(attentionModeTips.sage)}" title="${escape(attentionModeTips.sage)}" ${settings.h3AttentionMode === "sage" ? "selected" : ""}>${s("accel.modeSage")}</option>
              <option value="sage-triton" data-description="${escape(attentionModeTips["sage-triton"])}" title="${escape(attentionModeTips["sage-triton"])}" ${settings.h3AttentionMode === "sage-triton" ? "selected" : ""}>${s("accel.modeSageTriton")}</option>
              <option value="pytorch" data-description="${escape(attentionModeTips.pytorch)}" title="${escape(attentionModeTips.pytorch)}" ${settings.h3AttentionMode === "pytorch" ? "selected" : ""}>${s("accel.modePytorch")}</option>
              <option value="comfy-kitchen" data-description="${escape(attentionModeTips["comfy-kitchen"])}" title="${escape(attentionModeTips["comfy-kitchen"])}" ${settings.h3AttentionMode === "comfy-kitchen" ? "selected" : ""}>${s("accel.modeComfyKitchen")}</option>
            </select>
            <span class="sr-only" id="h3-attention-description">${escape(selectedAttentionModeTip)}</span>
          </label>
          <label class="acceleration-mode-field settings-row">${fieldLabelWithTip(s("accel.sparseMode"), s("accel.sparseModeTip"))}
            <select id="h3-sparse-attention-mode" aria-describedby="h3-sparse-attention-description">
              <option value="off" data-description="${escape(sparseModeTips.off)}" title="${escape(sparseModeTips.off)}" ${selectedSparseMode === "off" ? "selected" : ""}>${s("accel.sparseOff")}</option>
              <option value="sol-attn" data-description="${escape(sparseModeTips["sol-attn"])}" title="${escape(sparseModeTips["sol-attn"])}" ${selectedSparseMode === "sol-attn" ? "selected" : ""}>${s("accel.sparseSolAttn")}</option>
            </select>
            <span class="sr-only" id="h3-sparse-attention-description">${escape(selectedSparseModeTip)}</span>
          </label>
          <label class="acceleration-mode-field settings-row">${fieldLabelWithTip(s("accel.runtimeMode"), s("accel.runtimeModeTip"))}
            <select id="h3-runtime-mode" aria-describedby="h3-runtime-description">
              <option value="compatibility" data-description="${escape(runtimeModeTips.compatibility)}" title="${escape(runtimeModeTips.compatibility)}" ${settings.h3RuntimeMode === "compatibility" ? "selected" : ""}>${s("accel.runtimeCompatibility")}</option>
              <option value="native" data-description="${escape(runtimeModeTips.native)}" title="${escape(runtimeModeTips.native)}" ${settings.h3RuntimeMode === "native" ? "selected" : ""}>${s("accel.runtimeNative")}</option>
            </select>
            <span class="sr-only" id="h3-runtime-description">${escape(selectedRuntimeModeTip)}</span>
          </label>
          <label class="acceleration-mode-field settings-row">${fieldLabelWithTip(s("accel.compilerMode"), s("accel.compilerModeTip"))}
            <select id="h3-comfy-compiler-mode">
              <option value="disabled" ${settings.h3ComfyCompilerMode === "disabled" ? "selected" : ""}>${s("accel.compilerDisabled")}</option>
              <option value="auto" ${settings.h3ComfyCompilerMode === "auto" ? "selected" : ""}>${s("accel.compilerAuto")}</option>
            </select>
          </label>
        </div>
      </section>
      ${h3VideoVaePanel}
    </section>`;
  const logsPanel = `
    <section class="settings-panel app-logs-panel">
      <div class="settings-log-toolbar"><h2>${t(uiKeys.settings.logsTitle)}</h2><span class="muted">${t(uiKeys.settings.logsRetention)} ${viewModel.appLogs?.retentionDays ?? 7} ${t(uiKeys.settings.system.days)} · <span id="app-log-count">${viewModel.appLogs?.records.length ?? 0}</span> ${t(uiKeys.settings.logsRecords)}</span><div class="button-row"><button class="ghost button-with-icon" id="refresh-app-logs" ${viewModel.appLogsLoading ? "disabled" : ""}>${icon("refresh-cw")}${t(viewModel.appLogsLoading ? uiKeys.settings.logsLoading : uiKeys.settings.logsRefresh)}</button><button class="secondary button-with-icon" id="open-app-log-directory">${icon("folder-open")}${t(uiKeys.settings.logsDirectoryOpen)}</button><button class="secondary button-with-icon" id="open-app-crash-directory">${icon("folder-open")}${t(uiKeys.settings.logsCrashDump)}</button></div></div>
      ${viewModel.appLogsError ? `<p class="error" role="alert">${escape(viewModel.appLogsError)}</p>` : ""}
      <pre class="app-log-terminal" id="app-log-terminal">${viewModel.appLogs?.text ? options.renderAppLogTerminal(viewModel.appLogs.text) : escape(t(viewModel.appLogsLoading ? uiKeys.settings.logsReading : uiKeys.settings.logsEmpty))}</pre>
    </section>`;

  const activePanel =
    viewModel.settingsTab === "appearance" ? renderAppearanceSettings(settings.appearance, t) :
    viewModel.settingsTab === "comfyui" ? comfyUiPanel :
    viewModel.settingsTab === "system" ? applicationPathsPanel :
    viewModel.settingsTab === "acceleration" ? accelerationPanel :
    viewModel.settingsTab === "video" ? videoPanel :
    viewModel.settingsTab === "lora" ? loraPanel :
    viewModel.settingsTab === "image" ? imagePanel :
    viewModel.settingsTab === "nodes" ? nodePanel :
    viewModel.settingsTab === "prompt" ? promptPanel :
    viewModel.settingsTab === "upscale" ? upscalePanel :
    logsPanel;

  return `
    <section class="page-heading settings-heading">
      <div class="heading-line"><h1>${t(uiKeys.settings.title)}</h1>${gpuDevices.length ? `<span class="model-badge" data-settings-hardware title="${escape(gpuBadge)}">${escape(gpuBadge)}</span>` : ""}</div>
        <div class="settings-tool-actions">
          <button class="secondary button-with-icon" id="scan-environment" aria-busy="${viewModel.environmentScanning}" ${viewModel.environmentScanning ? "disabled" : ""}>${icon(viewModel.environmentScanning ? "refresh-cw" : "scan-search")}${viewModel.environmentScanning ? t(uiKeys.settings.scanning) : t(uiKeys.settings.rescan)}</button>
        </div>
    </section>
    <div class="settings-layout">
      <nav id="settings-category-tabs" class="settings-sidebar" role="tablist" aria-label="${t(uiKeys.settings.categories)}">
        ${([
          ["comfyui", "server", uiKeys.settings.tabComfyUi],
          ["system", "folder-cog", uiKeys.settings.tabSystem],
          ["nodes", "package-open", uiKeys.settings.tabNodes],
          ["acceleration", "zap", uiKeys.settings.tabAcceleration],
          ["video", "film", uiKeys.settings.tabVideo],
          ["lora", "layers", uiKeys.settings.tabLora],
          ["image", "images", uiKeys.settings.tabImage],
          ["prompt", "sparkles", uiKeys.settings.tabPrompt],
          ["upscale", "maximize-2", uiKeys.settings.tabUpscale],
          ["appearance", "palette", uiKeys.appearance.title],
          ["logs", "file-text", uiKeys.settings.tabLogs]
        ] as const).map(([id, iconName, labelKey]) => {
          const count = id === "video" && environmentScan
            ? `${videoAvailable}/${videoProfiles.length}`
            : id === "lora" && environmentScan
              ? `${loraAvailable}/${loraProfiles.length}`
              : id === "image" && environmentScan
                ? `${imageComponentsReady}/${imageProfiles.length}`
                : id === "nodes" && environmentScan
                  ? `${nodeDependencyAvailable}/${nodeDependencyTotal}`
                  : id === "prompt" && environmentScan
                    ? `${promptAvailable}/${promptProfiles.length}`
                    : id === "upscale" && environmentScan
                      ? `${upscaleAvailable}/${upscaleProfiles.length}`
                      : "";
          const updateDot = id === "nodes" && nodeUpdatesAvailable
            ? `<span class="settings-update-dot" role="img" aria-label="${escape(s("nodes.needsUpdate"))}" title="${escape(s("nodes.needsUpdate"))}"></span>`
            : id === "acceleration" && Boolean(environmentScan) && attentionStatus !== "ready"
              ? `<span class="settings-update-dot" role="img" aria-label="${escape(s("accel.pending"))}" title="${escape(s("accel.pending"))}"></span>`
              : "";
          const metadata = count
            ? `<span class="settings-tab-meta"><small>${count}</small></span>`
            : "";
          const active = viewModel.settingsTab === id;
          return `<button id="settings-tab-${id}" class="settings-tab ${active ? "active" : ""}" role="tab" aria-selected="${active}" aria-controls="settings-panel-${id}" tabindex="${active ? "0" : "-1"}" data-settings-tab="${id}"><span>${icon(iconName)}</span><span class="settings-tab-label">${t(labelKey)}${updateDot}</span>${metadata}</button>`;
        }).join("")}
      </nav>
      <div id="settings-panel-${viewModel.settingsTab}" class="settings-content" role="tabpanel" aria-labelledby="settings-tab-${viewModel.settingsTab}" tabindex="0" aria-busy="${viewModel.settingsSaving || viewModel.environmentScanning}">${activePanel}</div>
    </div>
    <div class="settings-save-bar settings-heading-actions ${viewModel.settingsDirty || viewModel.settingsSaving ? "is-dirty" : "is-clean"}" role="region" aria-label="${t(uiKeys.settings.unsaved)}" ${viewModel.settingsDirty || viewModel.settingsSaving ? "" : "hidden"}>
      <span class="settings-save-dot" aria-hidden="true"></span><div class="settings-save-copy"><strong class="save-state" role="status" aria-live="polite" aria-atomic="true">${viewModel.settingsSaving ? t(uiKeys.settings.saving) : t(uiKeys.settings.unsavedCount, { count: viewModel.settingsChangeCount ?? 1 })}</strong><span class="settings-save-names" title="${escape(settingsChangeSummary(viewModel.settingsChangeKeys ?? [], t, settings.uiLocale))}">${escape(settingsChangeSummary(viewModel.settingsChangeKeys ?? [], t, settings.uiLocale))}</span></div>
      <button class="ghost button-with-icon" id="discard-settings" ${viewModel.settingsDirty && !viewModel.settingsSaving ? "" : "disabled"}>${icon("rotate-ccw")}${t(uiKeys.settings.discard)}</button>
      <button class="primary button-with-icon" id="save-settings" aria-busy="${viewModel.settingsSaving}" ${viewModel.settingsDirty && !viewModel.settingsSaving ? "" : "disabled"}>${icon(viewModel.settingsSaving ? "refresh-cw" : "save")}${viewModel.settingsSaving ? t(uiKeys.settings.saving) : t(uiKeys.settings.save)}</button>
    </div>`;
}
