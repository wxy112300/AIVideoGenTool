import type {
  EnvironmentScanResult,
  LocalServiceKind,
  ModelComponentStatus,
  ModelScanProfile,
  UiLocale
} from "../../../types";
import type { Translate } from "../../../core/i18n";
import { uiKeys } from "../../../core/i18n-keys";
import { loraLocaleFor } from "../../../core/catalog/loras/locales";
import { videoLoraDefinition } from "../../../core/video-loras";
import {
  settingsModelHardwareRecommendation,
  settingsText
} from "./copy";
import {
  modelComponentSatisfied,
  modelProfileEvidence,
  modelProfileMissingComponentCount,
  modelProfileStatusTone
} from "../../shared/status";
import type { SettingsEnvironmentItemState } from "./selectors";

type IconRenderer = (name: string, className?: string) => string;
type EscapeHtml = (value: string) => string;

interface SettingsFragmentRenderOptions {
  icon: IconRenderer;
  escapeHtml: EscapeHtml;
  t: Translate;
  locale: UiLocale | undefined;
}

export interface SettingsEnvironmentOverviewViewModel {
  environmentScan: EnvironmentScanResult | null;
  environmentItems: SettingsEnvironmentItemState[];
  environmentScanning: boolean;
  environmentScanError: string;
  serviceStarting: LocalServiceKind | null;
  serviceRestarting: LocalServiceKind | null;
  serviceForceStopping: boolean;
  serviceStatusMessage: string;
  queueRunning: boolean;
  hasRunningQueueTask: boolean;
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
  isQwenVlPeftPromptModel(modelId: string): boolean;
  videoLoraInfoButton(profileId: string): string;
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

function formatGuideBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function escapeValue(
  options: SettingsFragmentRenderOptions,
  value: string | number | null | undefined
): string {
  return options.escapeHtml(value == null ? "" : String(value));
}

function renderSettingsStatusNotice(
  options: SettingsFragmentRenderOptions,
  message: string,
  tone: "" | "working" | "warning" | "error",
  iconName: string,
  role: "status" | "alert" = "status"
): string {
  const live = role === "alert" ? "assertive" : "polite";
  return `<div class="service-status${tone ? ` ${tone}` : ""}" role="${role}" aria-live="${live}" aria-atomic="true"><span class="service-status-icon" aria-hidden="true">${options.icon(iconName, "status-icon")}</span><span class="service-status-copy">${escapeValue(options, message)}</span></div>`;
}

export function renderSettingsEnvironmentOverview(
  viewModel: SettingsEnvironmentOverviewViewModel,
  options: SettingsEnvironmentOverviewOptions
): string {
  const { environmentScan } = viewModel;
  const escape = (value: string | number | null | undefined) => escapeValue(options, value);
  const icon = (name: string, className?: string) => options.icon(name, className);
  const t = options.t;
  const serviceStatusBusy = Boolean(viewModel.serviceStarting || viewModel.serviceRestarting);
  if (!environmentScan) {
    return `${viewModel.environmentScanError ? renderSettingsStatusNotice(options, viewModel.environmentScanError, "warning", "circle-alert", "alert") : ""}<div class="environment-empty" role="status" aria-live="polite">${viewModel.environmentScanning ? `<span class="scan-spinner"></span><div><strong>${t(uiKeys.settings.system.scanningEnvironment)}</strong><p>${t(uiKeys.settings.system.scanningEnvironmentDescription)}</p></div>` : `<div><strong>${t(uiKeys.settings.system.notScanned)}</strong><p>${t(uiKeys.settings.system.rescanInstruction)}</p></div>`}</div>`;
  }
  return `
    ${viewModel.environmentScanError ? renderSettingsStatusNotice(options, viewModel.environmentScanError, "warning", "circle-alert", "alert") : ""}
    <div class="environment-summary">
      <div><span class="muted">${t(uiKeys.settings.system.currentUserDirectory)}</span><code title="${escape(environmentScan.userHome)}">${escape(environmentScan.userHome)}</code></div>
      <span class="scan-time">${escape(t(uiKeys.settings.system.scannedAt, { time: options.formatScanTime(environmentScan.scannedAt) }))}</span>
    </div>
    <div class="environment-evidence-list">
      ${viewModel.environmentItems.map((item) => {
        const liveLabel = item.liveState === "running"
          ? t(uiKeys.settings.system.serviceRunning)
          : item.liveState === "unavailable"
            ? t(uiKeys.settings.system.serviceUnavailable)
            : "";
        const detail = liveLabel ? `${liveLabel} · ${item.detail}` : item.detail;
        const serviceBusy = viewModel.serviceStarting === "comfy" || viewModel.serviceRestarting === "comfy";
        const serviceAction = item.id === "comfyui-api"
          ? item.ok
            ? `<button class="service-start secondary button-with-icon" data-restart-service="comfy" aria-busy="${viewModel.serviceRestarting === "comfy"}" ${serviceBusy || viewModel.serviceForceStopping || viewModel.queueRunning || viewModel.hasRunningQueueTask ? "disabled" : ""}>${icon("refresh-cw")}${t(viewModel.serviceRestarting === "comfy" ? uiKeys.settings.system.restartWaiting : uiKeys.settings.system.restartService)}</button>`
            : `<button class="service-start button-with-icon" data-start-service="comfy" aria-busy="${viewModel.serviceStarting === "comfy"}" ${serviceBusy || viewModel.serviceForceStopping || viewModel.queueRunning || viewModel.hasRunningQueueTask ? "disabled" : ""}>${icon("play")}${t(viewModel.serviceStarting === "comfy" ? uiKeys.settings.system.startWaiting : uiKeys.settings.system.startService)}</button>`
          : "";
        const downloadAction = !item.ok && item.downloadUrl
          ? `<button class="environment-download secondary button-with-icon" data-open-environment-download="${escape(item.downloadUrl)}">${icon("external-link")} ${t(uiKeys.settings.system.openDependencyDownload)}</button>`
          : "";
        return `
        <article class="environment-item environment-evidence ${item.tone}">
          <span class="environment-state">${icon(item.ok ? "circle-check" : item.optional ? "circle-help" : "circle-alert")}</span>
          <div class="environment-evidence-label">
            <div class="environment-name"><strong>${escape(item.label)}</strong>${item.optional ? `<span class="optional-tag">${t(uiKeys.settings.system.optional)}</span>` : ""}</div>
          </div>
          <div class="environment-evidence-detail">
            <p>${escape(detail)}</p>
            ${item.path ? `<code title="${escape(item.path)}">${escape(item.path)}</code>` : ""}
          </div>
          <div class="environment-evidence-actions">${serviceAction}${downloadAction}</div>
        </article>`;
      }).join("")}
    </div>
    ${viewModel.serviceStatusMessage ? renderSettingsStatusNotice(options, viewModel.serviceStatusMessage, serviceStatusBusy ? "working" : "", serviceStatusBusy ? "refresh-cw" : "circle-help") : ""}
    `;
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
            ${issue.repairable ? `<button class="primary button-with-icon" data-repair-issue="${escape(issue.id)}" aria-busy="${viewModel.environmentRepairing === issue.id}" ${viewModel.environmentRepairing ? "disabled" : ""}>${icon(viewModel.environmentRepairing === issue.id ? "refresh-cw" : "shield-check")}${viewModel.environmentRepairing === issue.id ? t(uiKeys.settings.system.repairing) : escape(issue.repairLabel)}</button>` : ""}
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
  const selectedInstallation = viewModel.environmentScan?.comfyInstallations?.find(
    (installation) => installation.selected
  ) ?? viewModel.environmentScan?.comfyInstallations?.[0];
  const versionLabel = compatibility.version
    ? `v${compatibility.version}`
    : options.t(uiKeys.settings.compatibility.versionUnknown);
  const compatibilityState = compatibility.compatibilityState ?? (
    compatibility.version || compatibility.revision || compatibility.checkedFrom
      ? "supported"
      : "unknown"
  );
  const ready = compatibilityState !== "unknown";
  const statusTone = compatibilityState === "error"
    ? "missing"
    : compatibilityState === "warning"
      ? "warning"
      : ready
        ? "available"
        : "warning";
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
            <span class="model-availability ${statusTone}">${compatibilityState === "error" ? `${icon("circle-alert")} ${t(uiKeys.settings.compatibility.incompatible)}` : compatibilityState === "warning" ? `${icon("circle-help")} ${t(uiKeys.settings.compatibility.advisory)}` : ready ? `${icon("circle-check")} ${t(uiKeys.settings.compatibility.recognized)}` : `${icon("circle-help")} ${t(uiKeys.settings.compatibility.waitingService)}`}</span>
          <button class="primary button-with-icon" id="update-comfyui" aria-busy="${viewModel.comfyUpdating}" ${viewModel.comfyUpdating || compatibility.updateMode === "unsupported" ? "disabled" : ""}>${icon(viewModel.comfyUpdating ? "refresh-cw" : "download")}${viewModel.comfyUpdating ? t(uiKeys.settings.compatibility.processing) : compatibility.updateMode === "desktop" ? t(uiKeys.settings.compatibility.openOfficialUpdater) : t(uiKeys.settings.compatibility.manualUpdate)}</button>
        </div>
      </div>
      <div class="compatibility-version">
        <div><span>${t(uiKeys.settings.compatibility.desktopApp)}</span><strong>${escape(selectedInstallation?.desktopVersion ? `v${selectedInstallation.desktopVersion}` : selectedInstallation?.type === "desktop" ? t(uiKeys.settings.compatibility.versionNotRead) : t(uiKeys.settings.compatibility.notApplicable))}</strong></div>
        <div><span>${t(uiKeys.settings.compatibility.selectedLocalCore)}</span><strong>${escape(selectedInstallation?.version ? `v${selectedInstallation.version}` : t(uiKeys.settings.compatibility.versionNotRead))}</strong></div>
        <div><span>${t(uiKeys.settings.compatibility.connectedServiceCore)}</span><strong>${escape(compatibility.checkedFrom === "api" ? versionLabel : t(uiKeys.settings.compatibility.serviceNotConnected))}</strong></div>
        <div><span>${t(uiKeys.settings.compatibility.coreCommit)}</span><code>${escape(compatibility.revision || t(uiKeys.settings.compatibility.versionUnknown))}</code></div>
        <div><span>${t(uiKeys.settings.compatibility.detectionSource)}</span><strong>${compatibility.checkedFrom === "api" ? t(uiKeys.settings.compatibility.runningService) : compatibility.checkedFrom === "source" ? t(uiKeys.settings.compatibility.localCoreSource) : t(uiKeys.settings.compatibility.waitingStart)}</strong></div>
      </div>
      ${versionMismatch ? renderSettingsStatusNotice(options, t(uiKeys.settings.compatibility.mismatchWarning, { serviceVersion: versionLabel, localVersion: `v${selectedInstallation?.version ?? t(uiKeys.settings.compatibility.versionUnknown)}` }), "warning", "circle-alert") : ""}
      ${compatibility.compatibilityNotice && compatibilityState !== "supported" ? renderSettingsStatusNotice(options, compatibility.compatibilityNotice, compatibilityState === "error" ? "error" : "warning", compatibilityState === "error" ? "circle-alert" : "circle-help", compatibilityState === "error" ? "alert" : "status") : ""}
      ${viewModel.comfyUpdateLog ? `<details class="node-log" open><summary>${t(uiKeys.settings.compatibility.updateLog)}</summary><pre>${escape(viewModel.comfyUpdateLog)}</pre></details>` : ""}
    </section>`;
}

export function renderSettingsModelScanCard(
  profile: ModelScanProfile,
  options: SettingsModelScanCardOptions
): string {
  const missingCount = modelProfileMissingComponentCount(profile);
  const isPromptProfile = profile.category === "prompt";
  const isLlamaProfile = profile.managedBy === "llama-server";
  const isGemmaProfile = isPromptProfile && options.isGemmaPromptModel(profile.id);
  const isMultimodalProfile = isPromptProfile && options.isComfyMultimodalPromptModel(profile.id);
  const isQwenVlPeftProfile = isPromptProfile && options.isQwenVlPeftPromptModel(profile.id);
  const isLoraProfile = profile.category === "lora";
  const loraGuide = isLoraProfile
    ? loraLocaleFor(profile.id, options.locale)?.guide ?? videoLoraDefinition(profile.id)?.guide
    : undefined;
  const evidence = modelProfileEvidence(profile);
  const hardwareRecommendation = settingsModelHardwareRecommendation(options.locale, profile);
  const statusTone = modelProfileStatusTone(profile);
  const readyLabel = evidence.nodePackage === "missing"
    ? options.t(uiKeys.settings.system.scanCardNodeMissing)
    : evidence.nodePackage === "incompatible"
      ? options.t(uiKeys.settings.system.scanCardNodeIncompatible)
      : evidence.nodePackage === "warning"
        ? options.t(uiKeys.settings.system.scanCardNodeAttention)
    : evidence.runtime === "missing"
      ? options.t(uiKeys.settings.system.scanCardRuntimeUnavailable)
      : evidence.integration === "pending"
        ? options.t(uiKeys.settings.system.scanCardIntegrationPending)
        : evidence.runtime === "ready"
          ? options.t(uiKeys.settings.system.scanCardAvailable)
          : evidence.nodePackage === "ready"
            ? options.t(uiKeys.settings.system.scanCardStaticReady)
          : options.t(uiKeys.settings.system.scanCardFileComplete);
  const descriptionIncludes = (text: string) => profile.description.toLocaleLowerCase().includes(text.toLocaleLowerCase());
  const promptDependencyDescription = isPromptProfile
    ? isLlamaProfile && !descriptionIncludes("llama-server")
      ? settingsText(options.locale, "model.meta.llamaDependency")
      : isMultimodalProfile && !descriptionIncludes("MultiModal Prompt Nodes")
        ? settingsText(options.locale, "model.meta.multimodalDependency")
        : isQwenVlPeftProfile && !descriptionIncludes("Qwen-VL")
          ? settingsText(options.locale, "model.meta.qwenDependency")
          : isGemmaProfile && !descriptionIncludes("Prompt Writer")
            ? settingsText(options.locale, "model.meta.gemmaDependency")
            : !descriptionIncludes("TextGenerate")
              ? settingsText(options.locale, "model.meta.nativeDependency")
              : ""
    : "";
  const missingCustomNodeNames = profile.missingCustomNodeNames?.length
    ? profile.missingCustomNodeNames
    : profile.missingCustomNodeIds?.length
      ? profile.missingCustomNodeIds
      : [];
  const missingNodeDescription = missingCustomNodeNames.length
    ? settingsText(options.locale, "model.meta.nodesMissing", {
        nodes: missingCustomNodeNames.join(settingsText(options.locale, "shared.listSeparator"))
      })
    : "";
  const runtimeNodeDescription = evidence.runtime === "missing" && profile.runtimeMissingNodes?.length
    ? settingsText(options.locale, "model.meta.runtimeMissing", {
        nodes: profile.runtimeMissingNodes.join(settingsText(options.locale, "shared.listSeparator"))
      })
    : "";
  const modelDescription = [
    profile.description,
    promptDependencyDescription,
    missingNodeDescription,
    runtimeNodeDescription
  ].filter((value, index, values) => Boolean(value) && values.indexOf(value) === index).join(" · ");
  const escape = (value: string | number | null | undefined) => escapeValue(options, value);
  const icon = (name: string, className?: string) => options.icon(name, className);
  const loraStatusLabel = missingCount > 0
    ? options.t(uiKeys.settings.system.scanCardMissingCount, { count: missingCount })
    : readyLabel;
  const loraStatus = isLoraProfile && !profile.available ? `
        <span class="model-availability missing">${icon("circle-alert")} ${escape(loraStatusLabel)}</span>` : "";
  const modelOverview = isLoraProfile ? "" : `
      <div class="model-meta-line"><span>${options.t(uiKeys.settings.system.scanCardResourcePolicy)} · ${escape(profile.vram)}</span><span class="model-hardware-recommendation">${options.t(uiKeys.settings.system.scanCardRecommendedHardware)} · ${escape(hardwareRecommendation)}</span></div>`;
  const loraGuideDetails = isLoraProfile && loraGuide ? `
      <details class="lora-profile-guide">
        <summary>${escape(settingsText(options.locale, "lora.details"))}</summary>
        <dl class="model-profile-guide">
          <div><dt>${escape(options.t(uiKeys.shared.loraEffects))}</dt><dd>${escape(loraGuide.effects)}</dd></div>
          <div><dt>${escape(options.t(uiKeys.shared.loraStacking))}</dt><dd>${escape(loraGuide.stacking)}</dd></div>
          <div><dt>${escape(options.t(uiKeys.shared.loraCompatibility))}</dt><dd>${escape(loraGuide.compatibility)}</dd></div>
        </dl>
      </details>` : "";
  const componentList = `
      <div class="component-list">
        ${profile.components.map((component, componentIndex) => {
          const satisfied = modelComponentSatisfied(profile, component);
          const alternativeAvailable = satisfied && !component.found && Boolean(component.alternativeGroup);
          const guide = component.installGuide;
          const guideEvidence = guide
            ? [
                guide.sourceLabel,
                guide.version ? `v${guide.version}` : "",
                guide.revision ? `rev ${guide.revision.slice(0, 12)}` : "",
                guide.bytes ? formatGuideBytes(guide.bytes) : ""
              ].filter(Boolean).join(" · ")
            : "";
          const guideActionLabel = component.found
            ? settingsText(options.locale, "model.component.viewSource")
            : settingsText(options.locale, "model.component.downloadInstall");
          return `
          <div class="component-row ${component.found ? "found" : satisfied || component.optional ? "warning" : "missing"}">
            <span class="component-state">${icon(component.found ? "circle-check" : satisfied || component.optional ? "circle-help" : "circle-alert")}</span>
            <div><strong>${escape(component.label)}</strong>
              ${component.found
                ? `<code title="${escape(component.matches.join("\n"))}">${escape(component.matches.join(" · "))}</code>`
                : `<span>${alternativeAvailable ? settingsText(options.locale, "model.component.alternativeAvailable") : component.optional ? settingsText(options.locale, "model.component.optional") : options.t(uiKeys.settings.system.scanCardMissing)}${escape(component.expected)}</span>`}
              ${guideEvidence ? `<small class="component-evidence">${escape(guideEvidence)}</small>` : ""}
              </div>
              ${guide ? `<button class="component-info" data-install-profile="${escape(profile.id)}" data-install-component="${componentIndex}" aria-label="${escape(settingsText(options.locale, "model.component.viewInfo", { label: component.label, info: guideActionLabel }))}" title="${escape(guideActionLabel)}">${icon(component.found ? "external-link" : "download")}</button>` : ""}
          </div>`;
        }).join("")}
      </div>`;
  return `
    <article class="panel model-profile ${statusTone}${isLoraProfile ? " lora-profile" : ""}">
      <div class="model-profile-head">
        <div>
          <div class="model-title"><h3>${escape(profile.name)}</h3><span class="model-badge">${escape(profile.badge)}</span></div>
          ${isLoraProfile ? "" : `<p class="muted">${escape(modelDescription)}</p>`}
        </div>
        ${isLoraProfile ? loraStatus : `<span class="model-availability ${statusTone}">${profile.available ? `${icon(statusTone === "available" ? "circle-check" : statusTone === "warning" ? "circle-help" : "circle-alert")} ${escape(readyLabel)}` : `${icon("circle-alert")} ${options.t(uiKeys.settings.system.scanCardMissingCount, { count: missingCount })}`}</span>`}
      </div>
      ${isLoraProfile ? `
        <div class="lora-profile-summary">
          <p>${escape(profile.description)}</p>
          <span class="lora-profile-hardware">${escape(hardwareRecommendation)}</span>
        </div>
        ${loraGuideDetails}
        ${componentList}` : `
        ${modelOverview}
        ${componentList}`}
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
  const sourceRevision = guide.version
    ? `v${guide.version}`
    : guide.revision || "—";
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
          <div><span>${escape(settingsText(options.locale, "model.component.sourceRevision"))}</span><code>${escape(sourceRevision)}</code></div>
          ${guide.bytes ? `<div><span>${escape(settingsText(options.locale, "model.component.fileSize"))}</span><code>${escape(formatGuideBytes(guide.bytes))}</code></div>` : ""}
          ${guide.sha256 ? `<div><span>${escape(settingsText(options.locale, "model.component.sha256"))}</span><code>${escape(guide.sha256)}</code></div>` : ""}
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
