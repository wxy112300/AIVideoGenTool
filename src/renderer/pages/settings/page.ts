import type {
  AppLogSnapshot,
  EnvironmentScanResult,
  H3PromptPreset,
  ImagePromptPreset,
  LocalServiceKind,
  ModelScanProfile,
  Settings
} from "../../../types";
import type { SettingsTab } from "../../contracts";
import type { Translate } from "../../../core/i18n";
import { uiKeys } from "../../../core/i18n-keys";
import { modelCatalog } from "../../../core/catalog";
import {
  renderSettingsComfyCompatibilityPanel,
  renderSettingsEnvironmentIssuesPanel,
  renderSettingsEnvironmentOverview,
  renderSettingsInstallGuideDialog,
  renderSettingsModelScanCard,
  type SettingsInstallGuideSelection
} from "./fragments";
import { settingsText } from "./copy";

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
  environmentScan: EnvironmentScanResult | null;
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
  workflowDependencyInstalling: string;
  workflowDependencyLogs: Record<string, string>;
  customNodeInstalling: string;
  customNodeLogs: Record<string, string>;
  coreDependencyRepairing: boolean;
  attentionAccelerationInstalling: boolean;
  attentionAccelerationLog: string;
  selectedInstallGuide: SettingsInstallGuideSelection | null;
  installGuideModelDirectory: string;
  appLogs: AppLogSnapshot | null;
  appLogsLoading: boolean;
  appLogsError: string;
}

export interface SettingsPageOptions {
  t: Translate;
  defaultH3PromptPresets: Record<H3PromptPreset, string>;
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
  videoLoraInfoButton(profileId: string): string;
  isImageWorkflowReady(profile?: ModelScanProfile): boolean;
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
  const s = (key: Parameters<typeof settingsText>[1], params?: Record<string, string | number>) =>
    settingsText(settings.uiLocale, key, params);
  const environmentScan = viewModel.environmentScan;
  const escape = (value: string | number | null | undefined) => options.escapeHtml(value == null ? "" : String(value));
  const icon = (name: string, className?: string) => options.icon(name, className);
  const sharedFragmentOptions = {
    icon: options.icon,
    escapeHtml: options.escapeHtml,
    t
  };
  const environmentOverview = renderSettingsEnvironmentOverview(
    {
      environmentScan,
      environmentScanning: viewModel.environmentScanning,
      environmentScanError: viewModel.environmentScanError,
      serviceStarting: viewModel.serviceStarting,
      serviceRestarting: viewModel.serviceRestarting,
      serviceForceStopping: viewModel.serviceForceStopping,
      serviceStatusMessage: viewModel.serviceStatusMessage
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
  const renderProfileCard = (profile: ModelScanProfile) => renderSettingsModelScanCard(
    profile,
    {
      ...sharedFragmentOptions,
      isGemmaPromptModel: options.isGemmaPromptModel,
      videoLoraInfoButton: options.videoLoraInfoButton,
      isImageWorkflowReady: options.isImageWorkflowReady,
      imageWorkflowStatus: options.imageWorkflowStatus
    }
  );
  const installGuideDialog = renderSettingsInstallGuideDialog(
    {
      selectedInstallGuide: viewModel.selectedInstallGuide,
      configuredModelDirectory: viewModel.installGuideModelDirectory
    },
    sharedFragmentOptions
  );
  const profiles = environmentScan?.modelProfiles ?? [];
  const videoProfiles = options.orderVideoProfiles(
    profiles.filter((profile) => profile.category === "video")
  );
  const loraProfiles = profiles.filter((profile) => profile.category === "lora");
  const imageProfiles = profiles.filter((profile) => profile.category === "image");
  const imageQualityProfiles = options.getImageQualityProfiles(settings.defaultImageModel);
  const promptProfiles = profiles.filter((profile) => profile.category === "prompt");
  const upscaleProfiles = profiles.filter((profile) => profile.category === "upscale");
  const defaultPromptPresets = options.defaultH3PromptPresets;
  const selectedH3PresetText = settings.h3PromptPresets[viewModel.settingsH3PromptPreset] ??
    defaultPromptPresets[viewModel.settingsH3PromptPreset];
  const defaultImagePromptPresets = options.defaultImagePromptPresets;
  const selectedImagePromptPresetText = settings.imagePromptPresets[viewModel.settingsImagePromptPreset] ??
    defaultImagePromptPresets[viewModel.settingsImagePromptPreset];
  const videoAvailable = videoProfiles.filter(
    (profile) => profile.available && profile.integrated
  ).length;
  const loraAvailable = loraProfiles.filter((profile) => profile.available).length;
  const imageComponentsReady = imageProfiles.filter((profile) => profile.available).length;
  const imageWorkflowsReady = imageProfiles.filter((profile) => options.isImageWorkflowReady(profile)).length;
  const upscaleAvailable = upscaleProfiles.filter((profile) => profile.available).length;
  const promptAvailable = promptProfiles.filter((profile) => profile.available).length;
  const gpu = environmentScan?.items.find((item) => item.id === "nvidia");
  const gpuDevices = environmentScan?.gpus ?? [];
  const gpuSummary = gpuDevices.length
    ? gpuDevices.map((device) => `${device.name} · ${options.formatBytes(device.vramTotalBytes)}`).join("；")
    : gpu?.ok
      ? gpu.detail
      : environmentScan
        ? t(uiKeys.settings.system.gpuNotDetected)
        : t(uiKeys.settings.system.gpuScanWaiting);
  const gpuBadge = gpuDevices.length
    ? gpuDevices.length === 1
      ? `${gpuDevices[0]!.name} · ${options.formatBytes(gpuDevices[0]!.vramTotalBytes)}`
      : t(uiKeys.settings.system.gpuCount, { count: gpuDevices.length })
    : t(uiKeys.settings.system.gpuWaiting);
  const reserveVramBytes = Math.max(
    0,
    (Number.isFinite(settings.vramReserveGb)
      ? Math.max(0.5, Math.min(1, settings.vramReserveGb))
      : 1)
  ) * 1024 ** 3;
  const gpuBudgetSummary = gpuDevices.length
    ? gpuDevices.map((device) => t(uiKeys.settings.system.gpuBudgetSummary, {
        total: options.formatBytes(device.vramTotalBytes),
        reserve: options.formatBytes(reserveVramBytes),
        budget: options.formatBytes(Math.max(0, device.vramTotalBytes - reserveVramBytes))
      })).join("；")
    : t(uiKeys.settings.system.gpuBudgetWaiting);
  const gpuCards = gpuDevices.length
    ? `<div class="gpu-device-list">${gpuDevices.map((device) => `
        <article class="gpu-device-card">
          <span class="runtime-label">${t(uiKeys.settings.system.gpuDevice, { index: device.index })}</span>
          <strong class="runtime-value">${escape(device.name)}</strong>
          <code class="runtime-detail">${options.formatBytes(device.vramTotalBytes)} ${t(uiKeys.settings.system.totalVram)} · ${options.formatBytes(Math.max(0, device.vramTotalBytes - reserveVramBytes))} ${t(uiKeys.settings.system.workBudget)} · ${t(uiKeys.settings.system.driver)} ${escape(device.driverVersion || t(uiKeys.settings.compatibility.versionUnknown))}</code>
        </article>`).join("")}</div>`
    : `<div class="scan-result">${escape(gpuSummary)}</div>`;
  const comfyInstallations = environmentScan?.comfyInstallations ?? [];
  const effectiveComfyInstallDirectory =
    environmentScan?.comfyInstallDirectory || settings.comfyInstallDirectory;
  const selectedComfyInstallation = comfyInstallations.find(
    (installation) => installation.selected || (
      Boolean(effectiveComfyInstallDirectory) &&
      installation.directory.toLowerCase() === effectiveComfyInstallDirectory.toLowerCase()
    )
  ) ?? comfyInstallations[0];
  const effectiveComfyCoreDirectory =
    environmentScan?.comfySourceDirectory || selectedComfyInstallation?.sourceDirectory || "";
  const effectiveComfyDataDirectory = environmentScan?.comfyRoot || "";
  const effectiveModelDirectory =
    settings.modelDirectory || environmentScan?.modelDirectory || "";
  const comfyOutputRoot = environmentScan?.comfyRoot
    ? `${environmentScan.comfyRoot.replace(/[\\/]+$/u, "")}\\output`
    : environmentScan?.outputDirectory || "";
  const autoVideoOutputDirectory = comfyOutputRoot
    ? `${comfyOutputRoot.replace(/[\\/]+$/u, "")}\\Videos`
    : "";
  const autoImageOutputDirectory = comfyOutputRoot
    ? `${comfyOutputRoot.replace(/[\\/]+$/u, "")}\\Images`
    : "";
  const autoImageInputLibraryDirectory = environmentScan?.comfyRoot
    ? `${environmentScan.comfyRoot.replace(/[\\/]+$/u, "")}\\input\\LocalVideoStudio`
    : "";
  const videoOutputDirectoryValue = settings.outputDirectory || autoVideoOutputDirectory;
  const imageOutputDirectoryPlaceholder = autoImageOutputDirectory ||
    t(uiKeys.settings.system.autoDirectoryPlaceholder, { folder: "Images" });
  const customNodeInstallBlocked = Boolean(
    viewModel.customNodeInstalling || viewModel.queueRunning || viewModel.hasRunningQueueTask
  );

  const systemPanel = `
    <section class="settings-panel">
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>${t(uiKeys.settings.localeTitle)}</h2><span class="muted">${t(uiKeys.settings.localeDescription)}</span></div></div>
        <label>${t(uiKeys.settings.localeLabel)}<select id="ui-locale"><option value="zh-CN" ${settings.uiLocale === "zh-CN" ? "selected" : ""}>${t(uiKeys.settings.localeChinese)}</option><option value="zh-TW" ${settings.uiLocale === "zh-TW" ? "selected" : ""}>${t(uiKeys.settings.localeTraditionalChinese)}</option><option value="en-US" ${settings.uiLocale === "en-US" ? "selected" : ""}>${t(uiKeys.settings.localeEnglish)}</option></select></label>
        <p class="muted proxy-hint">${t(uiKeys.settings.localePending)}</p>
      </section>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>${t(uiKeys.settings.system.environmentTitle)}</h2><span class="muted">${t(uiKeys.settings.system.environmentDescription)}</span></div></div>
        ${environmentOverview}
      </section>
      ${comfyCompatibilityPanel}
      ${environmentIssuesPanel}
      <section class="panel settings-section">
        <div class="section-heading">
          <div><h2>${t(uiKeys.settings.system.installationTitle)}</h2><span class="muted">${t(uiKeys.settings.system.installationDescription)}</span></div>
          ${comfyInstallations.length > 1 ? `<span class="model-availability missing">${t(uiKeys.settings.system.installationCount, { count: comfyInstallations.length })}</span>` : `<span class="model-badge">${t(comfyInstallations.length ? uiKeys.settings.system.found : uiKeys.settings.system.notFound)}</span>`}
        </div>
        <label>${t(uiKeys.settings.system.currentInstallEntry)}
          <div class="input-action"><input id="comfy-install-directory" value="${escape(effectiveComfyInstallDirectory)}" placeholder="${t(uiKeys.settings.system.directoryPlaceholder)}"><button class="secondary button-with-icon" id="pick-comfy-install-directory">${icon("folder-open")}${t(uiKeys.settings.system.chooseDirectory)}</button></div>
        </label>
        <div class="comfy-directory-map" aria-label="${t(uiKeys.settings.system.directoryStructureLabel)}">
          <div class="comfy-directory-row">
            <span class="comfy-directory-label">${t(uiKeys.settings.system.coreDirectory)}</span>
            <div><code title="${escape(effectiveComfyCoreDirectory)}">${escape(effectiveComfyCoreDirectory || t(uiKeys.settings.system.waitingScan))}</code><small>${t(uiKeys.settings.system.coreDirectoryDescription)}</small></div>
          </div>
          <div class="comfy-directory-row">
            <span class="comfy-directory-label">${t(uiKeys.settings.system.dataNodeDirectory)}</span>
            <div><code title="${escape(effectiveComfyDataDirectory)}">${escape(effectiveComfyDataDirectory || t(uiKeys.settings.system.waitingScan))}</code><small>${t(uiKeys.settings.system.dataNodeDirectoryDescription)}</small></div>
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
            return `<article class="comfy-installation ${active ? "active" : ""}">
              <div><div class="model-title"><strong>${escape(typeLabel)}</strong><span class="model-badge">${escape(version)}</span></div><div class="comfy-installation-entry"><span>${t(uiKeys.settings.system.installEntry)}</span><code title="${escape(installation.directory)}">${escape(installation.directory)}</code></div>${installation.revision ? `<span class="muted">${escape(t(uiKeys.settings.system.revision, { value: installation.revision }))}</span>` : ""}</div>
              <button class="secondary button-with-icon" data-select-comfy-install="${escape(installation.directory)}" ${active ? "disabled" : ""}>${icon(active ? "check" : "play")}${active ? t(uiKeys.settings.system.currentUse) : t(uiKeys.settings.system.useVersion)}</button>
            </article>`;
          }).join("")}
        </div>` : `<p class="muted proxy-hint">${t(uiKeys.settings.system.noInstallFoundDescription)}</p>`}
      </section>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>${t(uiKeys.settings.system.connectionTitle)}</h2><span class="muted">${t(uiKeys.settings.system.connectionDescription)}</span></div><div class="connection-actions"><button class="secondary button-with-icon" data-test="comfy" ${viewModel.serviceForceStopping ? "disabled" : ""}>${icon("zap")}${t(uiKeys.settings.system.testConnection)}</button><button class="primary destructive button-with-icon" id="force-stop-comfy" ${viewModel.serviceForceStopping || viewModel.serviceBusy ? "disabled" : ""}>${icon(viewModel.serviceForceStopping ? "refresh-cw" : "ban")}${t(viewModel.serviceForceStopping ? uiKeys.settings.system.forceStopping : uiKeys.settings.system.forceStop)}</button></div></div>
        <label>${t(uiKeys.settings.system.serviceAddress)}<input id="comfy-url" value="${escape(settings.comfyUrl)}" placeholder="http://127.0.0.1:8188"></label>
        <p class="muted proxy-hint">${t(uiKeys.settings.system.connectionDefaultHint)}</p>
        <p class="muted proxy-hint danger-hint">${t(uiKeys.settings.system.forceStopHint)}</p>
        <div id="connection-result" class="connection-result muted">${t(uiKeys.settings.system.connectionNotTested)}</div>
      </section>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>${t(uiKeys.settings.system.filePathsTitle)}</h2><span class="muted">${t(uiKeys.settings.system.filePathsDescription)}</span></div></div>
        <div class="path-settings-group primary-paths">
          <div class="path-settings-caption"><strong>${t(uiKeys.settings.system.outputLocation)}</strong><span>${t(uiKeys.settings.system.outputDescription)}</span></div>
          <div class="settings-grid two">
            <label>${t(uiKeys.settings.system.videoOutputDirectory)}<div class="input-action"><input id="output-directory" data-auto-directory="${escape(autoVideoOutputDirectory)}" value="${escape(videoOutputDirectoryValue)}" placeholder="${t(uiKeys.settings.system.autoDirectoryPlaceholder, { folder: "Videos" })}"><button class="secondary button-with-icon" id="pick-output-directory">${icon("folder-open")}${t(uiKeys.settings.system.chooseDirectory)}</button></div></label>
            <label>${t(uiKeys.settings.system.imageOutputDirectory)}<div class="input-action"><input id="image-output-directory" data-auto-directory="${escape(autoImageOutputDirectory)}" value="${escape(settings.imageOutputDirectory || autoImageOutputDirectory)}" placeholder="${escape(imageOutputDirectoryPlaceholder)}"><button class="secondary button-with-icon" id="pick-image-output-directory">${icon("folder-open")}${t(uiKeys.settings.system.chooseDirectory)}</button></div></label>
          </div>
        </div>
        <div class="path-settings-group resource-paths">
          <div class="path-settings-caption"><strong>${t(uiKeys.settings.system.inputResources)}</strong><span>${t(uiKeys.settings.system.inputResourcesDescription)}</span></div>
          <div class="settings-grid two">
            <label>${t(uiKeys.settings.system.inputLibrary)}<div class="input-action"><input id="image-input-library-directory" value="${escape(settings.imageInputLibraryDirectory || autoImageInputLibraryDirectory)}" placeholder="${t(uiKeys.settings.system.inputLibraryPlaceholder)}"><button class="secondary button-with-icon" id="pick-image-input-library-directory">${icon("folder-open")}${t(uiKeys.settings.system.chooseDirectory)}</button></div></label>
            <label>${t(uiKeys.settings.system.modelDirectory)}<div class="input-action"><input id="model-directory" value="${escape(effectiveModelDirectory)}" placeholder="${t(uiKeys.settings.system.modelDirectoryPlaceholder)}"><button class="secondary button-with-icon" id="pick-model-directory">${icon("folder-open")}${t(uiKeys.settings.system.chooseDirectory)}</button></div></label>
          </div>
        </div>
        <div class="asset-library-settings-row"><div><strong>${t(uiKeys.settings.system.assetLibraryMaintenance)}</strong><span class="muted">${t(uiKeys.settings.system.assetLibraryDescription)}</span></div><button class="secondary button-with-icon" id="open-image-asset-library">${icon("package-open")}${t(uiKeys.settings.system.organizeAssetLibrary)}</button></div>
      </section>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>${t(uiKeys.settings.system.proxyTitle)}</h2><span class="muted">${t(uiKeys.settings.system.proxyDescription)}</span></div><span class="model-badge">${t(settings.proxyEnabled ? uiKeys.settings.system.enabled : uiKeys.settings.system.disabled)}</span></div>
        <div class="settings-grid two">
          <label class="ios-switch-field"><span class="policy-copy"><strong>${t(uiKeys.settings.system.enableProxy)}</strong><small>${t(uiKeys.settings.system.proxyResourceDescription)}</small></span><input id="proxy-enabled" type="checkbox" ${settings.proxyEnabled ? "checked" : ""}><span class="ios-switch" aria-hidden="true"></span></label>
          <label>${t(uiKeys.settings.system.proxyAddress)}<input id="proxy-url" value="${escape(settings.proxyUrl)}" placeholder="http://127.0.0.1:7890"></label>
        </div>
        <p class="muted proxy-hint">${t(uiKeys.settings.system.proxyDefaultHint)}</p>
      </section>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>${t(uiKeys.settings.system.gpuPolicyTitle)}</h2><span class="muted">${escape(gpuSummary)}</span></div><span class="model-badge">${escape(gpuBadge)}</span></div>
        <div class="gpu-hardware-block">
          <div class="gpu-hardware-heading"><div><strong>${t(uiKeys.settings.system.recognizedHardware)}</strong><span>${t(uiKeys.settings.system.gpuDetectionDescription)}</span></div><span class="gpu-budget-label">${escape(gpuBudgetSummary)}</span></div>
          ${gpuCards}
        </div>
        <div class="runtime-policy-grid">
          <label class="policy-select-field"><span>${t(uiKeys.settings.system.vramReserve)}</span><select id="vram-reserve"><option value="0.5" ${settings.vramReserveGb === 0.5 ? "selected" : ""}>0.5 GB · ${t(uiKeys.settings.system.aggressive)}</option><option value="0.75" ${settings.vramReserveGb === 0.75 ? "selected" : ""}>0.75 GB · ${t(uiKeys.settings.system.balanced)}</option><option value="1" ${settings.vramReserveGb === 1 ? "selected" : ""}>1 GB · ${t(uiKeys.settings.system.conservative)}</option></select></label>
          <label class="ios-switch-field"><span class="policy-copy"><strong>${t(uiKeys.settings.system.safeCancel)}</strong><small>${t(uiKeys.settings.system.safeCancelDescription)}</small></span><input id="safe-cancel" type="checkbox" ${settings.safeCancel ? "checked" : ""}><span class="ios-switch" aria-hidden="true"></span></label>
          <label class="ios-switch-field"><span class="policy-copy"><strong>${t(uiKeys.settings.system.autoRetry)}</strong><small>${t(uiKeys.settings.system.autoRetryDescription)}</small></span><input id="auto-retry-failed-tasks" type="checkbox" ${settings.autoRetryFailedTasks ? "checked" : ""}><span class="ios-switch" aria-hidden="true"></span></label>
          <label class="policy-select-field"><span>${t(uiKeys.settings.system.retryCount)}</span><select id="auto-retry-count" ${settings.autoRetryFailedTasks ? "" : "disabled"}>${[1, 2, 3, 4, 5].map((count) => `<option value="${count}" ${settings.autoRetryCount === count ? "selected" : ""}>${t(uiKeys.settings.system.retryCountValue, { count, suffix: count === 2 ? ` · ${t(uiKeys.settings.system.recommended)}` : "" })}</option>`).join("")}</select></label>
        </div>
        <p class="muted proxy-hint">${t(uiKeys.settings.system.retryPolicyDescription)}</p>
      </section>
    </section>`;

  const videoPanel = `
    <section class="settings-panel">
      <section class="panel settings-section">
        <div class="section-heading">
          <div><h2>${s("video.title")}</h2><span class="muted">${s("video.description")}</span></div>
          <label class="compact-label">${s("video.defaultModel")}<select id="default-video-model">
            ${(videoProfiles.length ? videoProfiles : modelCatalog.list("video").map((entry) => ({
              id: entry.definition.id,
              name: modelCatalog.localized(entry.definition.id, settings.uiLocale)?.name ?? entry.definition.id,
              available: false,
              integrated: entry.definition.scan?.integrated !== false
            }))).map((profile) => `<option value="${profile.id}" ${settings.defaultVideoModel === profile.id ? "selected" : ""} ${!profile.available || profile.integrated === false ? "disabled" : ""}>${escape(profile.name)}${!profile.available ? s("video.missingComponent") : profile.integrated === false ? s("video.workflowPending") : ""}</option>`).join("")}
          </select></label>
        </div>
        <div class="scan-result">${viewModel.environmentScanning ? s("video.scanning") : environmentScan ? s("video.summary", { available: videoAvailable, pending: videoProfiles.length - videoAvailable }) : s("video.waitingScan")}</div>
      </section>
      <div class="model-profile-list">${videoProfiles.length ? videoProfiles.map((profile) => renderProfileCard(profile)).join("") : `<div class="panel environment-empty">${s("video.empty")}</div>`}</div>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>${s("sulphur.title")}</h2><span class="muted">${s("sulphur.description")}</span></div><span class="model-badge">${s("sulphur.badge")}</span></div>
        <div class="settings-grid two">
          <label>${s("sulphur.transformer")}<select id="ltx-extension-model-profile"><option value="q2_distilled" ${settings.ltxExtensionModelProfile === "q2_distilled" ? "selected" : ""}>Q2_K distilled · 7.93 GB · 8GB compatible</option><option value="q3_k_m" ${settings.ltxExtensionModelProfile === "q3_k_m" ? "selected" : ""}>Q3_K_M dev · 11.13 GB · ${s("sulphur.recommended")}</option><option value="q4_k_m" ${settings.ltxExtensionModelProfile === "q4_k_m" ? "selected" : ""}>Q4_K_M dev · 14.30 GB · quality</option></select></label>
          <label>${s("sulphur.resolution")}<select id="ltx-extension-resolution"><option value="360" ${settings.ltxExtensionResolution === 360 ? "selected" : ""}>360p · ${s("sulphur.recommended")}</option><option value="480" ${settings.ltxExtensionResolution === 480 ? "selected" : ""}>480p · ${s("sulphur.slower")}</option></select></label>
          <label>${s("sulphur.frames")}<select id="ltx-extension-frames"><option value="49" ${settings.ltxExtensionFrames === 49 ? "selected" : ""}>49 ${s("sulphur.framesUnit")} · ${s("sulphur.recommended")}</option><option value="65" ${settings.ltxExtensionFrames === 65 ? "selected" : ""}>65 ${s("sulphur.framesUnit")} · ${s("sulphur.longer")}</option></select></label>
          <label>${s("sulphur.timeout")}<select id="ltx-extension-timeout"><option value="10" ${settings.ltxExtensionTimeoutMinutes === 10 ? "selected" : ""}>10 minutes · ${s("sulphur.fastStop")}</option><option value="20" ${settings.ltxExtensionTimeoutMinutes === 20 ? "selected" : ""}>20 minutes · ${s("sulphur.recommended")}</option><option value="30" ${settings.ltxExtensionTimeoutMinutes === 30 ? "selected" : ""}>30 minutes · ${s("sulphur.verySlow")}</option></select></label>
        </div>
        <p class="muted proxy-hint">${s("sulphur.note")}</p>
      </section>
    </section>`;

  const loraPanel = `
    <section class="settings-panel">
      <section class="panel settings-section">
        <div class="section-heading">
          <div><h2>${s("lora.title")}</h2><span class="muted">${s("lora.description")}</span></div>
          <span class="model-badge">${s("lora.available", { available: loraAvailable, total: loraProfiles.length })}</span>
        </div>
        <div class="scan-result">${s("lora.scan")}</div>
        <p class="muted proxy-hint">${s("lora.turbo")}</p>
      </section>
      <div class="model-profile-list">${loraProfiles.length ? loraProfiles.map((profile) => renderProfileCard(profile)).join("") : `<div class="panel environment-empty">${s("lora.empty")}</div>`}</div>
    </section>`;

  const imagePanel = `
    <section class="settings-panel">
      <section class="panel settings-section">
        <div class="section-heading">
          <div><h2>${s("image.title")}</h2><span class="muted">${s("image.description")}</span></div>
          <span class="model-badge">Qwen / Klein</span>
        </div>
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
            ${imageQualityProfiles.map((profile) => `<option value="${escape(profile.id)}" ${settings.defaultImageQualityProfile === profile.id ? "selected" : ""}>${escape(profile.label)} · ${profile.steps} ${s("sulphur.framesUnit")}</option>`).join("")}
          </select></label>
          <label>${s("image.defaultCount")}<div class="inline-field"><input id="image-output-count" type="range" min="1" max="10" step="1" value="${Math.min(10, Math.max(1, settings.imageOutputCount))}"><input id="image-output-count-number" type="number" min="1" max="10" step="1" value="${Math.min(10, Math.max(1, settings.imageOutputCount))}"><span>${s("image.countUnit")}</span></div></label>
        </div>
        <div class="scan-result">${viewModel.environmentScanning ? s("image.scanning") : environmentScan ? s("image.summary", { components: imageComponentsReady, workflows: imageWorkflowsReady }) : s("image.waitingScan")}</div>
        <p class="muted proxy-hint">${s("image.note")}</p>
      </section>
      <div class="model-profile-list">${imageProfiles.length ? imageProfiles.map((profile) => renderProfileCard(profile)).join("") : `<div class="panel environment-empty">${s("image.empty")}</div>`}</div>
    </section>`;

  const promptPanel = `
    <section class="settings-panel">
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>${s("prompt.title")}</h2><span class="muted">${s("prompt.description")}</span></div><div class="button-row"><span class="model-badge">${s("prompt.badge")}</span><button class="icon-button prompt-runtime-button ${viewModel.promptRuntimeBusy ? "busy" : ""}" id="release-prompt-model" ${viewModel.promptRuntimeBusy || viewModel.queueRunning || (!viewModel.promptRuntimeLoaded && !viewModel.promptStatus.ready) ? "disabled" : ""} aria-label="${escape(viewModel.promptRuntimeControlTitle)}" title="${escape(viewModel.promptRuntimeControlTitle)}" aria-busy="${viewModel.promptRuntimeBusy}">${icon(viewModel.promptRuntimeControlIconName)}</button></div></div>
        <label>${s("prompt.defaultModel")}<select id="prompt-model-id">${promptProfiles.map((profile) => `<option value="${escape(profile.id)}" ${settings.promptModelId === profile.id ? "selected" : ""} ${!profile.available ? "disabled" : ""}>${escape(profile.name)}${profile.available ? "" : s("prompt.missingComponent")} ${s("prompt.videoImage")}</option>`).join("")}</select></label>
        <div class="settings-grid two">
          <label>${s("prompt.language")}<select id="prompt-language"><option value="auto" ${settings.promptLanguage === "auto" ? "selected" : ""}>${s("prompt.followInput")}</option><option value="zh" ${settings.promptLanguage === "zh" ? "selected" : ""}>${s("prompt.chinese")}</option><option value="en" ${settings.promptLanguage === "en" ? "selected" : ""}>${s("prompt.english")}</option></select></label>
          <label>${s("prompt.creativity")}<select id="prompt-creativity"><option value="0.3" ${settings.promptCreativity === 0.3 ? "selected" : ""}>${s("prompt.restrained")} · 0.3</option><option value="0.7" ${settings.promptCreativity === 0.7 ? "selected" : ""}>${s("prompt.balanced")} · 0.7</option><option value="1" ${settings.promptCreativity === 1 ? "selected" : ""}>${s("prompt.rich")} · 1.0</option></select></label>
        </div>
        <div class="scan-result">${viewModel.environmentScanning ? s("prompt.scanning") : environmentScan ? s("prompt.summary", { count: promptAvailable }) : s("prompt.waitingScan")}</div>
        <p class="muted proxy-hint">${s("prompt.note")}</p>
      </section>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>${s("prompt.videoPresetTitle")}</h2><span class="muted">${s("prompt.videoPresetDescription")}</span></div><button class="secondary button-with-icon" id="restore-h3-prompt-presets">${icon("rotate-ccw")}${s("prompt.restore")}</button></div>
        <label>${s("prompt.currentPreset")}<select id="h3-prompt-preset-setting">${options.h3PromptPresetOptions(viewModel.settingsH3PromptPreset, true)}</select></label>
        <p class="muted proxy-hint">${escape(options.h3PromptPresetDescriptions[viewModel.settingsH3PromptPreset])}</p>
        <label>${s("prompt.ruleHeader")}<textarea id="h3-prompt-preset-text" rows="7">${escape(selectedH3PresetText)}</textarea></label>
        <p class="muted proxy-hint">${s("prompt.h3Note")}</p>
      </section>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>${s("prompt.imagePresetTitle")}</h2><span class="muted">${s("prompt.imagePresetDescription")}</span></div><button class="secondary button-with-icon" id="restore-image-prompt-presets">${icon("rotate-ccw")}${s("prompt.restore")}</button></div>
        <label>${s("prompt.currentPreset")}<select id="image-prompt-preset-setting">${Object.entries(options.imagePromptPresetLabels).map(([id, label]) => `<option value="${id}" ${viewModel.settingsImagePromptPreset === id ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        <p class="muted proxy-hint">${escape(options.imagePromptPresetDescriptions[viewModel.settingsImagePromptPreset])}</p>
        <label>${s("prompt.ruleHeader")}<textarea id="image-prompt-preset-text" rows="7">${escape(selectedImagePromptPresetText)}</textarea></label>
        <p class="muted proxy-hint">${s("prompt.imageNote")}</p>
      </section>
      <div class="model-profile-list">${promptProfiles.length ? promptProfiles.map((profile) => renderProfileCard(profile)).join("") : `<div class="panel environment-empty">${s("prompt.empty")}</div>`}</div>
    </section>`;

  const upscalePanel = `
    <section class="settings-panel">
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>${s("upscale.title")}</h2><span class="muted">${s("upscale.description")}</span></div>
          <label class="compact-label">${s("upscale.defaultModel")}<select id="default-upscale-model">${upscaleProfiles.map((profile) => `<option value="${profile.id}" ${settings.defaultUpscaleModel === profile.id ? "selected" : ""} ${!profile.available ? "disabled" : ""}>${escape(profile.name)}${profile.available ? "" : s("upscale.missingComponent")}</option>`).join("")}</select></label>
        </div>
        <div class="scan-result">${viewModel.environmentScanning ? s("upscale.scanning") : environmentScan ? s("upscale.summary", { available: upscaleAvailable, pending: upscaleProfiles.length - upscaleAvailable }) : s("upscale.waitingScan")}</div>
        <div class="settings-grid two">
          <label>${s("upscale.seedWeight")}<input id="seedvr2-model" value="${escape(settings.seedVr2Model)}"></label>
          <label>${s("upscale.realesrganWeight")}<input id="realesrgan-model" value="${escape(settings.realEsrganModel)}"></label>
        </div>
      </section>
      <div class="model-profile-list">${upscaleProfiles.length ? upscaleProfiles.map((profile) => renderProfileCard(profile)).join("") : `<div class="panel environment-empty">${s("upscale.empty")}</div>`}</div>
    </section>`;

  const nodeInstalled = environmentScan?.customNodes.filter(
    (node) => node.loaded
  ).length ?? 0;
  const h3CoreNodes = environmentScan?.comfyCompatibility.coreNodes ?? [];
  const h3CoreKnown = environmentScan?.comfyCompatibility.checkedFrom !== "";
  const h3CoreReady = environmentScan?.comfyCompatibility.h3CoreSupported ?? false;
  const promptCoreNodes = environmentScan?.comfyCompatibility.promptCoreNodes ?? [];
  const promptCoreKnown = environmentScan?.comfyCompatibility.checkedFrom !== "";
  const promptCoreReady = promptCoreNodes.length > 0 && promptCoreNodes.every((node) => node.available);
  const workflowDependencies = environmentScan?.workflowDependencies ?? [];
  const nodeDependencyAvailable = nodeInstalled + (h3CoreReady ? 1 : 0) +
    (promptCoreReady ? 1 : 0) +
    workflowDependencies.filter((workflow) => workflow.installed).length;
  const nodeDependencyTotal = (environmentScan?.customNodes.length ?? 0) + 2 +
    workflowDependencies.length;
  const nodePanel = `
    <section class="settings-panel">
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>${s("nodes.title")}</h2><span class="muted">${s("nodes.description")}</span></div><span class="model-badge">${nodeDependencyAvailable}/${nodeDependencyTotal} ${s("nodes.installed")}</span></div>
        <div class="scan-result">${s("nodes.installNote")}</div>
      </section>
      <div class="model-profile-list">
        <article class="panel custom-node-card ${h3CoreReady ? "available" : "missing"}">
          <div class="custom-node-copy">
            <div class="model-title"><h3>${s("nodes.h3Title")}</h3><span class="model-badge">${s("nodes.h3Badge")}</span></div>
            <p>${s("nodes.h3Description")}</p>
            <div class="component-list">
              ${h3CoreNodes.map((node) => `<div class="component-row ${node.available ? "found" : "missing"}"><span class="component-state">${icon(node.available ? "circle-check" : "circle-alert")}</span><div><strong>${escape(node.label)}</strong><code>${escape(node.id)}</code></div></div>`).join("") || `<div class="component-row missing"><span class="component-state">${icon("circle-alert")}</span><div><strong>${s("nodes.waitingCore")}</strong></div></div>`}
            </div>
            <span class="muted">${s("nodes.minimumVersion")} <code>v0.31.0</code> · ${s("nodes.coreLog")} <code>${escape(environmentScan?.comfyCompatibility.h3MinimumRevision ?? "")}</code></span>
            ${viewModel.comfyUpdateLog ? `<details class="node-log" open><summary>${s("nodes.coreLog")}</summary><pre>${escape(viewModel.comfyUpdateLog)}</pre></details>` : ""}
          </div>
          <div class="custom-node-actions">
            <span class="model-availability ${h3CoreReady ? "available" : "missing"}">${h3CoreReady ? `${icon("circle-check")} ${s("nodes.loaded")}` : h3CoreKnown ? `${icon("circle-alert")} ${s("nodes.coreMissing")}` : `${icon("circle-help")} ${s("nodes.notChecked")}`}</span>
            ${h3CoreReady ? "" : `<button class="primary button-with-icon" id="repair-h3-core" ${viewModel.coreDependencyRepairing ? "disabled" : ""}>${icon(viewModel.coreDependencyRepairing ? "refresh-cw" : "shield-check")}${viewModel.coreDependencyRepairing ? s("nodes.processing") : h3CoreKnown ? s("nodes.repairUpdate") : s("nodes.startCheck")}</button>`}
          </div>
        </article>
        <article class="panel custom-node-card ${promptCoreReady ? "available" : "missing"}">
          <div class="custom-node-copy">
            <div class="model-title"><h3>${s("nodes.qwenTitle")}</h3><span class="model-badge">${s("nodes.qwenBadge")}</span></div>
            <p>${s("nodes.qwenDescription")}</p>
            <div class="component-list">
              ${promptCoreNodes.map((node) => `<div class="component-row ${node.available ? "found" : "missing"}"><span class="component-state">${icon(node.available ? "circle-check" : "circle-alert")}</span><div><strong>${escape(node.label)}</strong><code>${escape(node.id)}</code></div></div>`).join("") || `<div class="component-row missing"><span class="component-state">${icon("circle-alert")}</span><div><strong>${s("nodes.waitingQwen")}</strong></div></div>`}
            </div>
          </div>
          <div class="custom-node-actions">
            <span class="model-availability ${promptCoreReady ? "available" : "missing"}">${promptCoreReady ? `${icon("circle-check")} ${s("nodes.loaded")}` : promptCoreKnown ? `${icon("circle-alert")} ${s("nodes.coreMissing")}` : `${icon("circle-help")} ${s("nodes.notChecked")}`}</span>
          </div>
        </article>
        ${workflowDependencies.map((workflow) => `
          <article class="panel custom-node-card ${workflow.installed ? "available" : "missing"}">
            <div class="custom-node-copy">
              <div class="model-title"><h3>${escape(workflow.name)}</h3><span class="model-badge">${s("nodes.officialWorkflow")}</span></div>
              <p>${escape(workflow.purpose)}</p>
              <code>${escape(workflow.path || workflow.sourceUrl)}</code>
              ${viewModel.workflowDependencyLogs[workflow.id] ? `<details class="node-log" open><summary>${s("nodes.installLog")}</summary><pre data-dependency-install-log="${escape(`workflow:${workflow.id}`)}">${escape(viewModel.workflowDependencyLogs[workflow.id])}</pre></details>` : ""}
            </div>
            <div class="custom-node-actions">
              <span class="model-availability ${workflow.installed ? "available" : "missing"}">${workflow.installed ? `${icon("circle-check")} ${s("nodes.installed")}` : `${icon("circle-alert")} ${s("nodes.notInstalled")}`}</span>
              <button class="${workflow.installed ? "secondary" : "primary"} button-with-icon" data-install-workflow="${escape(workflow.id)}" ${viewModel.workflowDependencyInstalling ? "disabled" : ""}>${icon(viewModel.workflowDependencyInstalling === workflow.id ? "refresh-cw" : "download")}${viewModel.workflowDependencyInstalling === workflow.id ? s("nodes.installing") : workflow.installed ? s("nodes.reinstall") : s("nodes.oneClickInstall")}</button>
            </div>
          </article>`).join("")}
        ${(environmentScan?.customNodes ?? []).map((node) => `
          <article class="panel custom-node-card ${node.loaded ? "available" : "missing"}">
            <div class="custom-node-copy">
              <div class="model-title"><h3>${escape(node.name)}</h3><span class="model-badge">${node.required ? s("nodes.projectRequired") : s("nodes.optional")}${node.version ? ` · v${escape(node.version)}` : ""}</span></div>
              <p>${escape(node.purpose)}</p>
              <code>${escape(node.directory || node.repositoryUrl)}</code>
              ${node.id === "spectrum-minimax-h3" ? `<p class="muted">${s("nodes.localVersion")}${node.version ? `v${escape(node.version)}` : node.installed ? s("nodes.versionUnread") : s("nodes.notInstalled")} · ${s("nodes.latestRelease")}${node.latestVersion ? `v${escape(node.latestVersion)}` : s("nodes.rescanOnline")} · ${s("nodes.runtimeMemory")}</p>` : ""}
              ${node.loadError ? `<span class="node-error">${escape(node.loadError)}</span>` : ""}
              ${viewModel.customNodeLogs[node.id] ? `<details class="node-log" open><summary>${s("nodes.installLog")}</summary><pre data-dependency-install-log="${escape(`custom-node:${node.id}`)}">${escape(viewModel.customNodeLogs[node.id])}</pre></details>` : ""}
            </div>
            <div class="custom-node-actions">
              <span class="model-availability ${node.loaded && !node.updateAvailable ? "available" : "missing"}">${node.updateAvailable ? `${icon("circle-alert")} ${s("nodes.needsUpdate")}` : node.loaded ? `${icon("circle-check")} ${node.runtimeVerified ? s("nodes.runtimeVerified") : s("nodes.fileCheckPassed")}` : node.installed ? `${icon("circle-alert")} ${s("nodes.installedRepair")}` : `${icon("circle-alert")} ${s("nodes.notInstalled")}`}</span>
              <button class="${node.updateAvailable || !node.installed || !node.loaded ? "primary" : "secondary"} button-with-icon" data-install-node="${escape(node.id)}" ${customNodeInstallBlocked ? "disabled" : ""}>${icon(viewModel.customNodeInstalling === node.id ? "refresh-cw" : node.installed ? "refresh-cw" : "download")}${viewModel.customNodeInstalling === node.id ? s("nodes.processing") : node.updateAvailable ? s("nodes.updateRestart") : node.installed && !node.loaded ? s("nodes.updateRecheck") : node.installed ? s("nodes.checkUpdate") : s("nodes.installRestart")}</button>
            </div>
          </article>`).join("") || `<div class="panel environment-empty">${s("nodes.empty")}</div>`}
      </div>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>${s("nodes.placeholderTitle")}</h2><span class="muted">${s("nodes.placeholderDescription")}</span></div></div>
        <div class="token-list">${["PROMPT", "NEGATIVE_PROMPT", "SEED", "INPUT_IMAGE", "END_IMAGE", "SOURCE_VIDEO", "TRIM_START", "TRIM_END", "EXTENSION_FRAMES", "OVERLAP_FRAMES", "UNLOAD_BETWEEN_STAGES", "WIDTH", "HEIGHT", "DURATION", "SOURCE_FPS", "FPS", "FRAMES", "OUTPUT_FRAMES", "OUTPUT_FILENAME", "H3_DIFFUSION_MODEL", "H3_TEXT_ENCODER", "H3_TURBO_LORA"].map((token) => `<code>{{${token}}}</code>`).join("")}</div>
      </section>
    </section>`;

  const attention = environmentScan?.attentionAcceleration;
  const pythonSourceLabels: Record<string, string> = {
    selected: s("accel.sourceSelected"),
    "comfy-venv": s("accel.sourceComfyVenv"),
    embedded: s("accel.sourceEmbedded"),
    path: s("accel.sourcePath"),
    "py-launcher": s("accel.sourceLauncher"),
    other: s("accel.sourceOther")
  };
  const pythonRuntimes = environmentScan?.pythonRuntimes ?? [];
  const detectedPythonPath = attention?.pythonPath ||
    pythonRuntimes.find((runtime) => runtime.selected)?.path ||
    pythonRuntimes[0]?.path ||
    "";
  const effectivePythonPath = settings.comfyPythonPath || detectedPythonPath;
  const selectedPythonRuntime = pythonRuntimes.find(
    (runtime) => runtime.path.toLowerCase() === effectivePythonPath.toLowerCase()
  );
  const pythonSelectionLabel = settings.comfyPythonPath
    ? selectedPythonRuntime?.source === "comfy-venv"
      ? s("accel.sourceComfyVenv")
      : s("accel.sourceSelected")
    : s("accel.autoDetect");
  const accelerationPanel = `
    <section class="settings-panel acceleration-panel">
      <section class="panel settings-section acceleration-overview ${attention?.ready ? "available" : "missing"}">
        <div class="section-heading">
          <div><h2>${s("accel.title")}</h2><span class="muted">${s("accel.description")}</span></div>
          <span class="model-availability ${attention?.ready ? "available" : "missing"}">${attention?.ready ? `${icon("circle-check")} ${s("accel.ready")}` : attention?.supported ? `${icon("circle-alert")} ${s("accel.pending")}` : `${icon("circle-alert")} ${s("accel.unsupported")}`}</span>
        </div>
        <div class="acceleration-control-row">
          <label class="acceleration-mode-field">${s("accel.mode")}
            <select id="h3-attention-mode">
              <option value="sage" ${settings.h3AttentionMode === "sage" ? "selected" : ""}>${s("accel.auto")} · SageAttention CUDA FP16</option>
              <option value="sage-triton" ${settings.h3AttentionMode === "sage-triton" ? "selected" : ""}>${s("accel.stable")} · SageAttention Triton FP16</option>
              <option value="pytorch" ${settings.h3AttentionMode === "pytorch" ? "selected" : ""}>${s("accel.compatible")} · PyTorch Attention</option>
            </select>
          </label>
          <div class="acceleration-summary">
            <span class="acceleration-summary-icon">${icon(attention?.ready ? "circle-check" : "circle-alert")}</span>
            <div><strong>${escape(attention?.detail ?? s("accel.waitingScan"))}</strong><span>${s("accel.fallback")}</span></div>
          </div>
        </div>
        <div class="python-runtime-picker">
          <div class="python-runtime-picker-head">
            <div><span class="runtime-label">${s("accel.python")}</span><strong>${s("accel.pythonUse")}</strong></div>
            <span class="python-selection-badge">${pythonSelectionLabel}</span>
          </div>
          <div class="python-runtime-picker-controls">
            <label class="python-path-field"><span class="runtime-label">${s("accel.currentPath")}</span><div class="input-action"><input id="comfy-python-path" value="${escape(effectivePythonPath)}" placeholder="${s("accel.scanFill")}"><button class="secondary button-with-icon" id="pick-comfy-python">${icon("folder-open")}${s("accel.chooseFile")}</button></div></label>
            <label class="python-candidate-field"><span class="runtime-label">${s("accel.candidates")}</span><select id="comfy-python-candidate"><option value="">${viewModel.environmentScanning ? s("accel.scanning") : pythonRuntimes.length ? s("accel.chooseInterpreter") : s("accel.noPython")}</option>${pythonRuntimes.map((runtime) => `<option value="${escape(runtime.path)}" ${runtime.path.toLowerCase() === effectivePythonPath.toLowerCase() ? "selected" : ""}>Python ${escape(runtime.version)} · ${escape(pythonSourceLabels[runtime.source] ?? runtime.source)}${runtime.path.toLowerCase() === effectivePythonPath.toLowerCase() ? ` · ${s("accel.current")}` : ""}</option>`).join("")}</select></label>
          </div>
        </div>
        <div class="attention-runtime-grid">
          <article class="attention-runtime-card"><span class="runtime-label">ComfyUI Python</span><strong class="runtime-value">${escape(attention?.pythonVersion || s("accel.notFound"))}</strong><code class="runtime-detail" title="${escape(attention?.pythonPath || "")}">${escape(attention?.pythonPath || s("accel.scanFill"))}</code></article>
          <article class="attention-runtime-card"><span class="runtime-label">PyTorch / CUDA</span><strong class="runtime-value">${escape(attention?.torchVersion || s("accel.unknown"))}</strong><code class="runtime-detail">CUDA ${escape(attention?.cudaVersion || s("accel.unknown"))} · SM ${escape(attention?.gpuArchitecture || s("accel.unknown"))}</code></article>
          <article class="attention-runtime-card"><span class="runtime-label">SageAttention</span><strong class="runtime-value">${escape(attention?.sageAttentionVersion || s("accel.notInstalled"))}</strong><code class="runtime-detail" title="${escape(attention?.recommendedWheel || "")}">${escape(attention?.recommendedWheel || s("accel.noWheel"))}</code></article>
          <article class="attention-runtime-card"><span class="runtime-label">Triton / KJNodes</span><strong class="runtime-value">${escape(attention?.tritonVersion || s("accel.notInstalled"))}</strong><code class="runtime-detail">${attention?.kjNodesCompatible ? s("accel.kjAvailable") : attention?.kjNodesInstalled ? s("accel.kjUpdate") : s("accel.kjMissing")}</code></article>
        </div>
        <div class="acceleration-actions">
          <button class="primary button-with-icon" id="install-attention-acceleration" ${viewModel.attentionAccelerationInstalling || !attention?.supported ? "disabled" : ""}>${icon(viewModel.attentionAccelerationInstalling ? "refresh-cw" : "wand-sparkles")}${viewModel.attentionAccelerationInstalling ? s("accel.installing") : attention?.ready ? s("accel.repair") : s("accel.install")}</button>
          <div><strong>${s("accel.stopComfy")}</strong><span>${s("accel.restartComfy")}</span></div>
        </div>
        ${viewModel.attentionAccelerationLog ? `<details class="node-log" open><summary>${s("accel.log")}</summary><pre id="attention-install-log">${escape(viewModel.attentionAccelerationLog)}</pre></details>` : ""}
      </section>
    </section>`;

  const logsPanel = `
    <section class="settings-panel app-logs-panel">
      <section class="panel settings-section">
        <div class="section-heading">
          <div><h2>${t(uiKeys.settings.logsTitle)}</h2><span class="muted">${t(uiKeys.settings.logsDescription)}</span></div>
          <div class="button-row"><button class="secondary button-with-icon" id="refresh-app-logs" ${viewModel.appLogsLoading ? "disabled" : ""}>${icon(viewModel.appLogsLoading ? "refresh-cw" : "rotate-ccw")}${viewModel.appLogsLoading ? t(uiKeys.settings.logsLoading) : t(uiKeys.settings.logsRefresh)}</button></div>
        </div>
        <div class="app-log-summary">
          <div class="app-log-directory-actions"><span>${t(uiKeys.settings.logsDirectory)}</span><div><button class="secondary button-with-icon" id="open-app-log-directory">${icon("folder-open")}${t(uiKeys.settings.logsDirectoryOpen)}</button><button class="secondary button-with-icon" id="open-app-crash-directory">${icon("folder-open")}${t(uiKeys.settings.logsCrashDump)}</button></div></div>
          <div class="app-log-stats"><div class="app-log-stat"><span>${t(uiKeys.settings.logsRetention)}</span><strong>${viewModel.appLogs?.retentionDays ?? 7} ${t(uiKeys.settings.system.days)}</strong></div><div class="app-log-stat"><span>${t(uiKeys.settings.logsRecords)}</span><strong id="app-log-count">${viewModel.appLogs?.records.length ?? 0}</strong></div></div>
        </div>
        ${viewModel.appLogsError ? `<p class="error">${escape(viewModel.appLogsError)}</p>` : ""}
        ${viewModel.appLogs?.text
          ? `<pre class="app-log-terminal" id="app-log-terminal">${options.renderAppLogTerminal(viewModel.appLogs.text)}</pre>`
          : `<div class="environment-empty">${viewModel.appLogsLoading ? t(uiKeys.settings.logsReading) : t(uiKeys.settings.logsEmpty)}</div>`}
      </section>
    </section>`;

  const activePanel =
    viewModel.settingsTab === "system" ? systemPanel :
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
      <div><div class="heading-line"><h1>${t(uiKeys.settings.title)}</h1>${gpuDevices.length ? `<span class="model-badge">${escape(gpuBadge)}</span>` : ""}</div><p>${t(uiKeys.settings.description)}</p></div>
      <div class="button-row settings-heading-actions"><span class="save-state ${viewModel.settingsDirty ? "dirty" : ""}">${viewModel.settingsDirty ? t(uiKeys.settings.unsaved) : t(uiKeys.settings.saved)}</span><button class="secondary button-with-icon" id="scan-environment" ${viewModel.environmentScanning ? "disabled" : ""}>${icon(viewModel.environmentScanning ? "refresh-cw" : "scan-search")}${viewModel.environmentScanning ? t(uiKeys.settings.scanning) : t(uiKeys.settings.rescan)}</button><button class="secondary button-with-icon" id="discard-settings" ${viewModel.settingsDirty ? "" : "disabled"}>${icon("rotate-ccw")}${t(uiKeys.settings.discard)}</button><button class="primary button-with-icon" id="save-settings" ${viewModel.settingsDirty ? "" : "disabled"}>${icon("save")}${t(uiKeys.settings.save)}</button></div>
    </section>
    <div class="settings-layout">
      <nav class="settings-sidebar" aria-label="${t(uiKeys.settings.categories)}">
        ${([
          ["system", "settings", uiKeys.settings.tabSystem],
          ["acceleration", "zap", uiKeys.settings.tabAcceleration],
          ["video", "images", uiKeys.settings.tabVideo],
          ["lora", "zap", uiKeys.settings.tabLora],
          ["image", "images", uiKeys.settings.tabImage],
          ["nodes", "workflow", uiKeys.settings.tabNodes],
          ["prompt", "sparkles", uiKeys.settings.tabPrompt],
          ["upscale", "maximize-2", uiKeys.settings.tabUpscale],
          ["logs", "file-text", uiKeys.settings.tabLogs]
        ] as const).map(([id, iconName, labelKey]) => `<button class="settings-tab ${viewModel.settingsTab === id ? "active" : ""}" data-settings-tab="${id}"><span>${icon(iconName)}</span>${t(labelKey)}${id === "video" && environmentScan ? `<small>${videoAvailable}/${videoProfiles.length}</small>` : ""}${id === "lora" && environmentScan ? `<small>${loraAvailable}/${loraProfiles.length}</small>` : ""}${id === "image" && environmentScan ? `<small>${imageComponentsReady}/${imageProfiles.length}</small>` : ""}${id === "nodes" && environmentScan ? `<small>${nodeDependencyAvailable}/${nodeDependencyTotal}</small>` : ""}${id === "prompt" && environmentScan ? `<small>${promptAvailable}/${promptProfiles.length}</small>` : ""}${id === "upscale" && environmentScan ? `<small>${upscaleAvailable}/${upscaleProfiles.length}</small>` : ""}</button>`).join("")}
      </nav>
      <div class="settings-content">${activePanel}</div>
    </div>
    ${installGuideDialog}`;
}
