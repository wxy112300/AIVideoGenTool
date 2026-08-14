import type {
  EnvironmentScanResult,
  LocalServiceKind,
  ModelComponentStatus,
  ModelScanProfile
} from "../../../types";
import type { Translate } from "../../../core/i18n";
import { uiKeys } from "../../../core/i18n-keys";
import {
  environmentItemStatusTone,
  modelProfileStatusTone
} from "../../shared/status";

type IconRenderer = (name: string, className?: string) => string;
type EscapeHtml = (value: string) => string;

interface SettingsFragmentRenderOptions {
  icon: IconRenderer;
  escapeHtml: EscapeHtml;
  t: Translate;
}

export interface SettingsEnvironmentOverviewViewModel {
  environmentScan: EnvironmentScanResult | null;
  environmentScanning: boolean;
  environmentScanError: string;
  serviceStarting: LocalServiceKind | null;
  serviceRestarting: LocalServiceKind | null;
  serviceForceStopping: boolean;
  serviceStatusMessage: string;
}

export interface SettingsEnvironmentOverviewOptions extends SettingsFragmentRenderOptions {
  formatScanTime(scannedAt: string): string;
}

export interface SettingsEnvironmentIssuesPanelViewModel {
  environmentScan: EnvironmentScanResult | null;
  environmentRepairing: string;
  environmentRepairLogs: Record<string, string>;
}

export interface SettingsComfyCompatibilityPanelViewModel {
  environmentScan: EnvironmentScanResult | null;
  comfyUpdating: boolean;
  comfyUpdateLog: string;
}

export interface SettingsModelScanCardOptions extends SettingsFragmentRenderOptions {
  isGemmaPromptModel(modelId: string): boolean;
  isComfyMultimodalPromptModel(modelId: string): boolean;
  videoLoraInfoButton(profileId: string): string;
  isImageWorkflowReady(profile?: ModelScanProfile): boolean;
  imageWorkflowStatus(profile?: ModelScanProfile): string;
}

export interface SettingsInstallGuideSelection {
  profileName: string;
  component: ModelComponentStatus;
}

export interface SettingsInstallGuideDialogViewModel {
  selectedInstallGuide: SettingsInstallGuideSelection | null;
  configuredModelDirectory: string;
}

const modelHardwareRecommendations: Record<string, string> = {
  "qwen/qwen3.5-4b": "RTX 3060 12GB 以上 · 系统 RAM 16GB 以上",
  "qwen/qwen3.5-2b": "RTX 2060 6GB 以上 · 系统 RAM 16GB 以上",
  "qwen-image-edit-2511": "RTX 3090/4090 24GB 以上 · CPU/offload",
  "flux2-klein-4b": "RTX 4080/4090 16GB 以上",
  minimax_h3_fl2va: "RTX 3090/4090 24GB 以上 · 系统 RAM 64GB 推荐",
  minimax_h3_fl2va_int4: "RTX 4070/4080 16GB 推荐 · 12GB 仅实验",
  minimax_h3_fl2va_q3_gguf: "RTX 3080 10GB 实验 · 480p/5秒/32GB RAM 起步",
  minimax_h3_fl2va_turbo: "RTX 3090/4090 24GB 以上 · Turbo 不降低基础显存",
  minimax_h3_ref2va: "RTX 3090/4090 24GB 以上 · 多参考需更多 RAM",
  minimax_h3_ref2va_int4: "RTX 4070/4080 16GB 推荐 · 12GB 仅实验",
  sulphur2: "RTX 3060 12GB 以上 · 系统 RAM 32GB 以上",
  wan22_5b: "RTX 3080 12GB/4070 12GB 以上 · 16GB 推荐",
  hunyuan15: "RTX 3090/4090 24GB 以上",
  wan22_14b_nsfw: "RTX 3090/4090 24GB 以上 · 保守卸载",
  wan22_remix: "RTX 3090/4090 24GB 以上",
  wan22_smoothmix: "RTX 3090/4090 24GB 以上",
  wan22_dasiwa: "RTX 3090/4090 24GB 以上",
  seedvr2: "RTX 3090/4090 24GB 以上",
  flashvsr: "RTX 4080/4090 16GB 以上",
  hunyuan15_sr: "RTX 4090 24GB 以上 · 两阶段模型卸载",
  realesrgan: "RTX 2060/3060 6GB 以上",
  rife: "RTX 2060/3060 6GB 以上",
  "community/gemma-4-e4b-unconcerned-q5": "RTX 3060 12GB 以上 · 系统 RAM 16GB 以上",
  "community/gemma-4-12b-uncensored-q4": "RTX 3060/4070 12GB 以上 · 系统 RAM 24GB 以上",
  "community/gemma-4-26b-a4b-uncensored-q4": "RTX 3090/4090 24GB 以上",
  "google/gemma-4-e4b-q3": "RTX 3060 8GB/12GB 以上 · 系统 RAM 16GB 以上",
  "google/gemma-4-12b-q4": "RTX 3060/4070 12GB 以上 · 系统 RAM 24GB 以上",
  "google/gemma-4-12b-q5": "RTX 4080/4090 16GB 以上 · 系统 RAM 24GB 以上",
  "google/gemma-4-26b-a4b-q4": "RTX 3090/4090 24GB 以上",
  "google/gemma-4-31b-q4": "RTX 4090 32GB 以上或专业卡"
};

function escapeValue(
  options: SettingsFragmentRenderOptions,
  value: string | number | null | undefined
): string {
  return options.escapeHtml(value == null ? "" : String(value));
}

function modelHardwareRecommendation(profile: ModelScanProfile): string {
  return modelHardwareRecommendations[profile.id] ?? (
    profile.category === "video"
      ? "RTX 3080 12GB 以上 · 系统 RAM 32GB 以上"
      : profile.category === "image"
        ? "RTX 3060 12GB 以上"
        : profile.category === "prompt"
          ? "RTX 3060 12GB 以上 · 系统 RAM 16GB 以上"
          : "RTX 2060 6GB 以上"
  );
}

export function renderSettingsEnvironmentOverview(
  viewModel: SettingsEnvironmentOverviewViewModel,
  options: SettingsEnvironmentOverviewOptions
): string {
  const { environmentScan } = viewModel;
  const escape = (value: string | number | null | undefined) => escapeValue(options, value);
  const icon = (name: string, className?: string) => options.icon(name, className);
  const t = options.t;
  if (!environmentScan) {
    return `${viewModel.environmentScanError ? `<div class="service-status warning">${escape(viewModel.environmentScanError)}</div>` : ""}<div class="environment-empty">${viewModel.environmentScanning ? `<span class="scan-spinner"></span><div><strong>${t(uiKeys.settings.system.scanningEnvironment)}</strong><p>${t(uiKeys.settings.system.scanningEnvironmentDescription)}</p></div>` : `<div><strong>${t(uiKeys.settings.system.notScanned)}</strong><p>${t(uiKeys.settings.system.rescanInstruction)}</p></div>`}</div>`;
  }
  return `
    ${viewModel.environmentScanError ? `<div class="service-status warning">${escape(viewModel.environmentScanError)}</div>` : ""}
    <div class="environment-summary">
      <div><span class="muted">${t(uiKeys.settings.system.currentUserDirectory)}</span><code title="${escape(environmentScan.userHome)}">${escape(environmentScan.userHome)}</code></div>
      <span class="scan-time">${escape(t(uiKeys.settings.system.scannedAt, { time: options.formatScanTime(environmentScan.scannedAt) }))}</span>
    </div>
    <div class="environment-grid">
      ${environmentScan.items.map((item) => `
        <article class="environment-item ${environmentItemStatusTone(item)}">
          <span class="environment-state">${icon(item.ok ? "circle-check" : item.optional ? "circle-help" : "circle-alert")}</span>
          <div>
            <div class="environment-item-heading">
              <div class="environment-name"><strong>${escape(item.label)}</strong>${item.optional ? `<span class="optional-tag">${t(uiKeys.settings.system.optional)}</span>` : ""}</div>
              ${item.id === "comfyui-api"
                ? item.ok
                  ? `<button class="service-start secondary button-with-icon" data-restart-service="comfy" ${viewModel.serviceStarting || viewModel.serviceRestarting || viewModel.serviceForceStopping ? "disabled" : ""}>${icon("refresh-cw")}${t(viewModel.serviceRestarting === "comfy" ? uiKeys.settings.system.restartWaiting : uiKeys.settings.system.restartService)}</button>`
                  : `<button class="service-start button-with-icon" data-start-service="comfy" ${viewModel.serviceStarting || viewModel.serviceRestarting || viewModel.serviceForceStopping ? "disabled" : ""}>${icon("play")}${t(viewModel.serviceStarting === "comfy" ? uiKeys.settings.system.startWaiting : uiKeys.settings.system.startService)}</button>`
                : ""}
              ${!item.ok && item.downloadUrl ? `<button class="environment-download secondary button-with-icon" data-open-environment-download="${escape(item.downloadUrl)}">${icon("external-link")} ${t(uiKeys.settings.system.openDependencyDownload)}</button>` : ""}
            </div>
            <p>${escape(item.detail)}</p>
            ${item.path ? `<code title="${escape(item.path)}">${escape(item.path)}</code>` : ""}
          </div>
        </article>`).join("")}
    </div>
    ${viewModel.serviceStatusMessage ? `<div class="service-status ${viewModel.serviceStarting || viewModel.serviceRestarting ? "working" : ""}">${escape(viewModel.serviceStatusMessage)}</div>` : ""}
    ${environmentScan.comfyRoot || environmentScan.comfyInstallDirectory ? `
      <div class="detected-path">
        <div><span class="eyebrow">${t(uiKeys.settings.system.detectedComfyUi, { type:
          environmentScan.comfyInstallType === "desktop" ? t(uiKeys.settings.system.desktopInstall) :
          environmentScan.comfyInstallType === "portable" ? t(uiKeys.settings.system.portableInstall) :
          environmentScan.comfyInstallType === "manual" ? t(uiKeys.settings.system.manualInstall) : t(uiKeys.settings.system.dataDirectory)
        })}</span>
        <strong>${escape(environmentScan.comfyInstallDirectory || environmentScan.comfyRoot)}</strong>
        <p class="muted">${t(uiKeys.settings.system.coreSource)}：${escape(environmentScan.comfySourceDirectory || t(uiKeys.settings.system.notFoundPath))}<br>${t(uiKeys.settings.system.dataDirectory)}：${escape(environmentScan.comfyRoot || t(uiKeys.settings.system.initializationWaiting))}<br>${t(uiKeys.settings.system.service)}：${escape(environmentScan.comfyUrl)}<br>${t(uiKeys.settings.system.modelPath)}：${escape(environmentScan.modelDirectory || t(uiKeys.settings.system.initializationWaiting))}<br>${t(uiKeys.settings.system.outputPath)}：${escape(environmentScan.outputDirectory || t(uiKeys.settings.system.initializationWaiting))}</p></div>
        <button class="secondary button-with-icon" id="use-scanned-comfy">${icon("check")}${t(uiKeys.settings.system.useScannedPaths)}</button>
      </div>` : ""}`;
}

export function renderSettingsEnvironmentIssuesPanel(
  viewModel: SettingsEnvironmentIssuesPanelViewModel,
  options: SettingsFragmentRenderOptions
): string {
  const issues = viewModel.environmentScan?.issues ?? [];
  if (!issues.length) return "";
  const escape = (value: string | number | null | undefined) => escapeValue(options, value);
  const icon = (name: string, className?: string) => options.icon(name, className);
  const t = options.t;
  return `
    <section class="panel settings-section environment-issues">
      <div class="section-heading"><div><h2>${t(uiKeys.settings.system.issuesTitle)}</h2><span class="muted">${t(uiKeys.settings.system.issuesDescription)}</span></div><span class="model-badge">${t(uiKeys.settings.system.issueCount, { count: issues.length })}</span></div>
      <div class="issue-list">
        ${issues.map((issue) => `
          <article class="issue-card ${issue.severity}">
            <div>
              <strong>${escape(issue.label)}</strong>
              <p class="muted">${escape(issue.detail)}</p>
              ${viewModel.environmentRepairLogs[issue.id] ? `<details class="node-log" open><summary>${t(uiKeys.settings.system.repairLog)}</summary><pre>${escape(viewModel.environmentRepairLogs[issue.id])}</pre></details>` : ""}
            </div>
            ${issue.repairable ? `<button class="primary button-with-icon" data-repair-issue="${escape(issue.id)}" ${viewModel.environmentRepairing ? "disabled" : ""}>${icon(viewModel.environmentRepairing === issue.id ? "refresh-cw" : "shield-check")}${viewModel.environmentRepairing === issue.id ? t(uiKeys.settings.system.repairing) : escape(issue.repairLabel)}</button>` : ""}
          </article>`).join("")}
      </div>
    </section>`;
}

export function renderSettingsComfyCompatibilityPanel(
  viewModel: SettingsComfyCompatibilityPanelViewModel,
  options: SettingsFragmentRenderOptions
): string {
  const compatibility = viewModel.environmentScan?.comfyCompatibility;
  if (!compatibility) return "";
  const selectedInstallation = viewModel.environmentScan?.comfyInstallations.find(
    (installation) => installation.selected
  ) ?? viewModel.environmentScan?.comfyInstallations[0];
  const versionLabel = compatibility.version
    ? `v${compatibility.version}`
    : options.t(uiKeys.settings.compatibility.versionUnknown);
  const ready = Boolean(compatibility.version || compatibility.revision || compatibility.checkedFrom);
  const statusTone = ready ? "available" : "warning";
  const versionMismatch = compatibility.checkedFrom === "api" &&
    Boolean(selectedInstallation?.version) &&
    Boolean(compatibility.version) &&
    selectedInstallation?.version !== compatibility.version;
  const escape = (value: string | number | null | undefined) => escapeValue(options, value);
  const icon = (name: string, className?: string) => options.icon(name, className);
  const t = options.t;
  return `
    <section class="panel settings-section comfy-compatibility ${statusTone}">
      <div class="section-heading">
        <div>
          <h2>${t(uiKeys.settings.compatibility.title)}</h2>
          <span class="muted">${t(uiKeys.settings.compatibility.description)}</span>
        </div>
        <div class="compatibility-actions">
            <span class="model-availability ${statusTone}">${ready ? `${icon("circle-check")} ${t(uiKeys.settings.compatibility.recognized)}` : `${icon("circle-help")} ${t(uiKeys.settings.compatibility.waitingService)}`}</span>
          <button class="primary button-with-icon" id="update-comfyui" ${viewModel.comfyUpdating || compatibility.updateMode === "unsupported" ? "disabled" : ""}>${icon(viewModel.comfyUpdating ? "refresh-cw" : "download")}${viewModel.comfyUpdating ? t(uiKeys.settings.compatibility.processing) : compatibility.updateMode === "desktop" ? t(uiKeys.settings.compatibility.openOfficialUpdater) : t(uiKeys.settings.compatibility.manualUpdate)}</button>
        </div>
      </div>
      <div class="compatibility-version">
        <div><span>${t(uiKeys.settings.compatibility.desktopApp)}</span><strong>${escape(selectedInstallation?.desktopVersion ? `v${selectedInstallation.desktopVersion}` : selectedInstallation?.type === "desktop" ? t(uiKeys.settings.compatibility.versionNotRead) : t(uiKeys.settings.compatibility.notApplicable))}</strong></div>
        <div><span>${t(uiKeys.settings.compatibility.selectedLocalCore)}</span><strong>${escape(selectedInstallation?.version ? `v${selectedInstallation.version}` : t(uiKeys.settings.compatibility.versionNotRead))}</strong></div>
        <div><span>${t(uiKeys.settings.compatibility.connectedServiceCore)}</span><strong>${escape(compatibility.checkedFrom === "api" ? versionLabel : t(uiKeys.settings.compatibility.serviceNotConnected))}</strong></div>
        <div><span>${t(uiKeys.settings.compatibility.coreCommit)}</span><code>${escape(compatibility.revision || t(uiKeys.settings.compatibility.versionUnknown))}</code></div>
        <div><span>${t(uiKeys.settings.compatibility.detectionSource)}</span><strong>${compatibility.checkedFrom === "api" ? t(uiKeys.settings.compatibility.runningService) : compatibility.checkedFrom === "source" ? t(uiKeys.settings.compatibility.localCoreSource) : t(uiKeys.settings.compatibility.waitingStart)}</strong></div>
      </div>
      ${versionMismatch ? `<div class="service-status warning">${escape(t(uiKeys.settings.compatibility.mismatchWarning, { serviceVersion: versionLabel, localVersion: `v${selectedInstallation?.version ?? t(uiKeys.settings.compatibility.versionUnknown)}` }))}</div>` : ""}
      <p class="muted">${escape(compatibility.updateHint)}</p>
      ${viewModel.comfyUpdateLog ? `<details class="node-log" open><summary>${t(uiKeys.settings.compatibility.updateLog)}</summary><pre>${escape(viewModel.comfyUpdateLog)}</pre></details>` : ""}
    </section>`;
}

export function renderSettingsModelScanCard(
  profile: ModelScanProfile,
  options: SettingsModelScanCardOptions
): string {
  const missingCount = profile.components.filter((component) => !component.found && !component.optional).length;
  const isPromptProfile = profile.category === "prompt";
  const isLlamaProfile = profile.managedBy === "llama-server";
  const isGemmaProfile = isPromptProfile && options.isGemmaPromptModel(profile.id);
  const isMultimodalProfile = isPromptProfile && options.isComfyMultimodalPromptModel(profile.id);
  const runtimeUnavailable = profile.runtimeVerified === true && profile.runtimeReady === false;
  const hardwareRecommendation = modelHardwareRecommendation(profile);
  const loraInfoButton = profile.category === "lora"
    ? options.videoLoraInfoButton(profile.id)
    : "";
  const isReady = profile.category === "image"
    ? options.isImageWorkflowReady(profile)
    : profile.available && !runtimeUnavailable;
  const statusTone = modelProfileStatusTone(profile, isReady);
  const readyLabel = isPromptProfile
    ? options.t(uiKeys.settings.system.scanCardFileComplete)
    : statusTone === "available"
      ? options.t(uiKeys.settings.system.scanCardAvailable)
      : runtimeUnavailable
        ? options.t(uiKeys.settings.system.scanCardRuntimeUnavailable)
        : profile.category === "image"
          ? options.imageWorkflowStatus(profile)
          : options.t(uiKeys.settings.system.scanCardComponentComplete);
  const metaLabel = profile.available
    ? isPromptProfile
        ? isLlamaProfile
        ? "GGUF + mmproj 文件完整；由应用自管理 llama-server"
        : isMultimodalProfile
          ? "LLM GGUF + mmproj 文件完整；通过 ComfyUI MultiModal Prompt Nodes 处理 H3 提示词"
          : isGemmaProfile
          ? "LLM GGUF + mmproj 文件完整；通过 ComfyUI Prompt Writer 处理视频和图片提示词"
          : "ComfyUI text_encoders 文件完整；可通过原生 TextGenerate 进行本地扩写"
      : profile.category === "image"
        ? options.imageWorkflowStatus(profile)
        : runtimeUnavailable
          ? `缺少运行节点：${profile.runtimeMissingNodes?.join("、") || "请启动 ComfyUI 后重新扫描"}`
          : profile.integrated
            ? "组件完整，可用于配置"
            : "依赖已完整；生成工作流将在下一阶段接入"
    : isPromptProfile
      ? isLlamaProfile
        ? "补齐 GGUF + mmproj，并配置 llama-server.exe 后才能使用"
        : isMultimodalProfile
          ? "补齐 Qwen3.6 GGUF、mmproj 与 MultiModal Prompt Nodes 后才能接入本地扩写"
          : "补齐对应的 ComfyUI text_encoders 文件后才能接入本地扩写"
      : "补齐所有必需组件后才能启用";
  const escape = (value: string | number | null | undefined) => escapeValue(options, value);
  const icon = (name: string, className?: string) => options.icon(name, className);
  return `
    <article class="panel model-profile ${statusTone}">
      <div class="model-profile-head">
        <div>
          <div class="model-title"><h3>${escape(profile.name)}</h3>${loraInfoButton}<span class="model-badge">${escape(profile.badge)}</span></div>
          <p class="muted">${escape(profile.description)}</p>
        </div>
        <span class="model-availability ${statusTone}">${profile.available ? `${icon(statusTone === "available" ? "circle-check" : statusTone === "warning" ? "circle-help" : "circle-alert")} ${escape(readyLabel)}` : `${icon("circle-alert")} ${options.t(uiKeys.settings.system.scanCardMissingCount, { count: missingCount })}`}</span>
      </div>
      <div class="model-meta-line"><span>${options.t(uiKeys.settings.system.scanCardResourcePolicy)} · ${escape(profile.vram)}</span><span class="model-hardware-recommendation">${options.t(uiKeys.settings.system.scanCardRecommendedHardware)} · ${escape(hardwareRecommendation)}</span><span>${metaLabel}</span></div>
      <div class="component-list">
        ${profile.components.map((component, componentIndex) => `
          <div class="component-row ${component.found ? "found" : component.optional ? "warning" : "missing"}">
            <span class="component-state">${icon(component.found ? "circle-check" : component.optional ? "circle-help" : "circle-alert")}</span>
            <div><strong>${escape(component.label)}</strong>
              ${component.found
                ? `<code title="${escape(component.matches.join("\n"))}">${escape(component.matches.join(" · "))}</code>`
                : `<span>${component.optional ? "可选，4 步 Lightning 档需要：" : options.t(uiKeys.settings.system.scanCardMissing)}${escape(component.expected)}</span>`}
              </div>
              ${component.found ? "" : `<button class="component-info" data-install-profile="${escape(profile.id)}" data-install-component="${componentIndex}" aria-label="查看 ${escape(component.label)} 的${options.t(uiKeys.settings.system.scanCardInstallInfo)}" title="${options.t(uiKeys.settings.system.scanCardInstallInfo)}">${icon("info")}</button>`}
          </div>`).join("")}
      </div>
    </article>`;
}

export function renderSettingsInstallGuideDialog(
  viewModel: SettingsInstallGuideDialogViewModel,
  options: SettingsFragmentRenderOptions
): string {
  if (!viewModel.selectedInstallGuide) return "";
  const { profileName, component } = viewModel.selectedInstallGuide;
  const guide = component.installGuide;
  const escape = (value: string | number | null | undefined) => escapeValue(options, value);
  const icon = (name: string, className?: string) => options.icon(name, className);
  const t = options.t;
  if (!guide) {
    return `
      <div class="dialog-backdrop" id="install-guide-backdrop">
        <section class="install-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="install-guide-title" tabindex="-1">
          <div class="install-guide-head">
            <div><span class="eyebrow">${escape(profileName)}</span><h2 id="install-guide-title">${escape(component.label)}</h2></div>
            <button class="dialog-close" id="close-install-guide" aria-label="${t(uiKeys.settings.system.installGuideClose)}">${icon("x")}</button>
          </div>
          <div class="install-note"><strong>${t(uiKeys.settings.system.installGuideRefreshTitle)}</strong><p>${t(uiKeys.settings.system.installGuideRefreshDescription)}</p></div>
          <div class="dialog-actions"><button class="primary" id="dismiss-install-guide">${t(uiKeys.settings.system.installGuideAcknowledged)}</button></div>
        </section>
      </div>`;
  }
  const targetDirectory = `${viewModel.configuredModelDirectory.replace(/[\\/]+$/, "")}\\${guide.targetSubdirectory.replaceAll("/", "\\")}`;
  return `
    <div class="dialog-backdrop" id="install-guide-backdrop">
      <section class="install-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="install-guide-title" tabindex="-1">
        <div class="install-guide-head">
          <div><span class="eyebrow">${escape(profileName)}</span><h2 id="install-guide-title">${escape(component.label)}</h2></div>
            <button class="dialog-close" id="close-install-guide" aria-label="${t(uiKeys.settings.system.installGuideClose)}">${icon("x")}</button>
        </div>
        <p class="muted">${t(uiKeys.settings.system.installGuideDownloadInstruction)}</p>
        <div class="install-guide-fields">
          <div><span>${t(uiKeys.settings.system.installGuideSource)}</span><strong>${escape(guide.sourceLabel)}</strong></div>
          <div><span>${t(uiKeys.settings.system.installGuideRecommendedFile)}</span><code>${escape(guide.recommendedFilename)}</code></div>
          <div class="install-target"><span>${t(uiKeys.settings.system.installGuideTargetDirectory)}</span><code>${escape(targetDirectory)}</code></div>
        </div>
        ${guide.notes ? `<div class="install-note"><strong>${t(uiKeys.settings.system.installGuideNote)}</strong><p>${escape(guide.notes)}</p></div>` : ""}
        <div class="dialog-actions">
          <button class="secondary" id="dismiss-install-guide">${t(uiKeys.settings.system.installGuideClose)}</button>
          <button class="secondary button-with-icon" id="open-install-directory" data-install-directory="${escape(targetDirectory)}">${icon("folder-open")}${t(uiKeys.settings.system.installGuideOpenDirectory)}</button>
          <button class="primary button-with-icon" id="open-install-download">${t(uiKeys.settings.system.installGuideOpenDownload)}${icon("external-link")}</button>
        </div>
      </section>
    </div>`;
}
