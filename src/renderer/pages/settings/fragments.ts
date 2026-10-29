import type {
  EnvironmentScanResult,
  LocalServiceKind,
  ModelComponentStatus,
  ModelScanProfile,
  UiLocale
} from "../../../types";
import type { Translate } from "../../../core/i18n";
import { uiKeys } from "../../../core/i18n-keys";
import { modelCatalog } from "../../../core/catalog";
import { imageModelOptionNote } from "../../shared/image-option-label";
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
import { settingsComponentPath } from "./model-presentation";

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
  sharedComponentPaths?: ReadonlySet<string>;
  isGemmaPromptModel(modelId: string): boolean;
  isComfyMultimodalPromptModel(modelId: string): boolean;
  isQwenVlPeftPromptModel(modelId: string): boolean;
  videoLoraInfoButton(profileId: string): string;
  imageWorkflowStatus(profile?: ModelScanProfile): string;
}

export interface SettingsInstallGuideSelection {
  profileName: string;
  component: ModelComponentStatus;
  /** Explicit independent root. Empty means unconfigured, not the ComfyUI root. */
  targetRoot?: string;
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
        const compactDetail = item.id === "ffmpeg" ? /ffmpeg version\s+(\S+)/i.exec(detail)?.[1] || detail
          : item.id === "git" ? detail.replace(/^git version\s+/i, "") : detail;
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
            <p title="${escape(detail)}">${escape(compactDetail)}</p>
            ${item.path ? `<code title="${escape(item.path)}">${escape(item.path)}</code>` : ""}
          </div>
          <div class="environment-evidence-actions">${item.id === "comfyui" ? `<button type="button" class="ghost icon-button" data-pick-environment-comfy aria-label="${t(uiKeys.settings.system.chooseDirectory)}">${icon("folder-search")}</button>` : ""}${item.path ? `<button type="button" class="ghost icon-button" data-open-node-location="${escape(item.path)}" aria-label="${escape(settingsText(options.locale, "nodes.openLocation"))}">${icon("folder-open")}</button>` : ""}${serviceAction}${downloadAction}</div>
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
    <section class="panel settings-section settings-form-card environment-issues">
      <div class="section-heading"><div><h2>${t(uiKeys.settings.system.issuesTitle)}</h2></div><span class="model-badge">${t(uiKeys.settings.system.issueCount, { count: issues.length })}</span></div>
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
    <section class="panel settings-section settings-form-card comfy-compatibility ${statusTone}">
      <div class="section-heading">
        <div>
          <h2>${t(uiKeys.settings.compatibility.title)}</h2>
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
  const localized = modelCatalog.localized(profile.id, options.locale);
  if (localized) profile = { ...profile, name: localized.name, badge: localized.badge ?? profile.badge, description: localized.description ?? profile.description };
  const missingCount = modelProfileMissingComponentCount(profile);
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
  const escape = (value: string | number | null | undefined) => escapeValue(options, value);
  const icon = (name: string, className?: string) => options.icon(name, className);
  const statusLabel = missingCount > 0
    ? options.t(uiKeys.settings.system.scanCardMissingCount, { count: missingCount }) : readyLabel;
  const description = profile.category === "image" && localized
    ? imageModelOptionNote(profile.id, options.t)
    : localized?.supportSummary ?? profile.description;
  const blocker = [missingNodeDescription, runtimeNodeDescription, profile.productGate === "locked" ? profile.productGateReason : ""].filter(Boolean).join(" · ");
  const hardware = isLoraProfile ? "" : `<div class="model-meta-line"><span>${escape(profile.vram || hardwareRecommendation)}</span></div>`;
  const componentList = `<div class="component-list">${profile.components.map((component, componentIndex) => {
    const satisfied = modelComponentSatisfied(profile, component);
    const alternativeAvailable = satisfied && !component.found && Boolean(component.alternativeGroup);
    const guide = component.installGuide;
    const source = guide ? [guide.sourceLabel, guide.version ? `v${guide.version}` : guide.revision ? `rev ${guide.revision.slice(0, 12)}` : "", guide.bytes ? formatGuideBytes(guide.bytes) : ""].filter(Boolean).join(" · ") : "";
    const label = component.found ? settingsText(options.locale, "model.component.viewSource") : settingsText(options.locale, "model.component.downloadInstall");
    const state = component.found ? "found" : satisfied || component.optional ? "warning" : "missing";
    const tag = component.found ? "" : alternativeAvailable ? settingsText(options.locale, "model.component.alternativeAvailable") : component.optional ? settingsText(options.locale, "model.component.optional") : options.t(uiKeys.settings.system.scanCardMissing);
    const path = component.found ? component.matches.join(" · ") : component.expected;
    const shared = component.found && component.matches.some(path => options.sharedComponentPaths?.has(settingsComponentPath(path)));
    return `<div class="component-row ${state}"><span class="component-state">${icon(component.found ? "circle-check" : satisfied || component.optional ? "circle-help" : "circle-dashed")}</span>
      <div class="settings-component-main"><div class="settings-component-line"><strong>${escape(component.label)}</strong>${shared ? `<span class="settings-component-tag">${escape(settingsText(options.locale, "model.shared"))}</span>` : ""}${tag ? `<span class="settings-component-tag">${escape(tag)}</span>` : ""}${source ? `<small class="component-evidence" title="${escape(source)}">${escape(source)}</small>` : ""}</div><code title="${escape(path)}">${escape(path)}</code></div>
      ${guide ? `<button type="button" class="${component.found ? "icon-button" : "secondary button-with-icon"} component-info" data-install-profile="${escape(profile.id)}" data-install-component="${componentIndex}" aria-label="${escape(settingsText(options.locale, "model.component.viewInfo", { label: component.label, info: label }))}" title="${escape(label)}">${icon(component.found ? "info" : "download")}${component.found ? "" : escape(settingsText(options.locale, "model.download"))}</button>` : ""}</div>`;
  }).join("")}</div>`;
  const foundCount = profile.components.filter(component => component.found).length;
  const filesLabel = settingsText(options.locale, "model.files", { found: foundCount, total: profile.components.length }) + (missingCount ? ` · ${options.t(uiKeys.settings.system.scanCardMissingCount, { count: missingCount })}` : "");
  const loraGuideDetails = isLoraProfile && loraGuide ? `<details class="settings-model-disclosure lora-profile-guide" data-settings-disclosure-key="guide:${escape(profile.id)}"><summary>${icon("chevron-right")}<span>${escape(settingsText(options.locale, "lora.details"))}</span></summary><dl class="model-profile-guide">
    <div><dt>${escape(options.t(uiKeys.shared.loraEffects))}</dt><dd>${escape(loraGuide.effects)}</dd></div>
    <div><dt>${escape(options.t(uiKeys.shared.loraStacking))}</dt><dd>${escape(loraGuide.stacking)}</dd></div>
    <div><dt>${escape(options.t(uiKeys.shared.loraCompatibility))}</dt><dd>${escape(loraGuide.compatibility)}</dd></div></dl></details>` : "";
  return `<article class="panel model-profile settings-model-card ${statusTone}${isLoraProfile ? " lora-profile" : ""}" data-settings-model="${escape(profile.id)}">
    <div class="model-profile-head"><div><div class="model-title"><h3>${escape(profile.name)}</h3>${profile.badge ? `<span class="model-badge">${escape(profile.badge)}</span>` : ""}</div><p class="settings-model-description" title="${escape(description)}">${escape(description)}</p>${hardware}</div>
      <span class="model-availability ${statusTone}">${missingCount ? "" : icon(statusTone === "available" ? "circle-check" : "circle-alert")}${escape(statusLabel)}</span></div>
    ${blocker ? `<p class="settings-model-blocker">${escape(blocker)}</p>` : ""}
    ${isLoraProfile ? componentList + loraGuideDetails : profile.components.length ? `<details class="settings-model-disclosure settings-model-files" data-settings-disclosure-key="files:${escape(profile.id)}"><summary>${icon("chevron-right")}<span class="settings-files-collapsed">${escape(filesLabel)}</span><span class="settings-files-expanded">${escape(settingsText(options.locale, "model.collapse"))}</span></summary>${componentList}</details>` : ""}
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
  const targetRoot = viewModel.selectedInstallGuide.targetRoot ?? viewModel.configuredModelDirectory;
  const targetDirectory = targetRoot.trim()
    ? [targetRoot.replace(/[\\/]+$/, ""), guide.targetSubdirectory.replaceAll("/", "\\")].filter(Boolean).join("\\")
    : "";
  const sourceRevision = guide.version
    ? `v${guide.version}`
    : guide.revision || "—";
  return `
    <div class="dialog-backdrop" id="install-guide-backdrop">
      <section class="install-guide-dialog settings-component-dialog" role="dialog" aria-modal="true" aria-labelledby="install-guide-title" tabindex="-1">
        <div class="install-guide-head">
          <div><span class="eyebrow">${escape(profileName)}</span><h2 id="install-guide-title">${escape(component.label)}</h2></div>
            <button class="dialog-close" id="close-install-guide" aria-label="${t(uiKeys.settings.system.installGuideClose)}">${icon("x")}</button>
        </div>
        ${component.found ? "" : `<p class="muted">${t(uiKeys.settings.system.installGuideDownloadInstruction)}</p>`}
        <div class="install-guide-fields">
          <div><span>${t(uiKeys.settings.system.installGuideSource)}</span><strong>${escape(guide.sourceLabel)}</strong></div>
          <div><span>${escape(settingsText(options.locale, "model.component.sourceRevision"))}</span><code>${escape(sourceRevision)}</code></div>
          ${guide.bytes ? `<div><span>${escape(settingsText(options.locale, "model.component.fileSize"))}</span><code>${escape(formatGuideBytes(guide.bytes))}</code></div>` : ""}
          ${guide.sha256 ? `<div><span>${escape(settingsText(options.locale, "model.component.sha256"))}</span><code>${escape(guide.sha256)}</code></div>` : ""}
          <div><span>${t(uiKeys.settings.system.installGuideRecommendedFile)}</span><code>${escape(guide.recommendedFilename)}</code></div>
          ${component.found && component.matches.length ? `<div><span>${escape(settingsText(options.locale, "model.component.location"))}</span><code>${escape(component.matches.join("\n"))}</code></div>` : ""}
          <div class="install-target"><span>${t(uiKeys.settings.system.installGuideTargetDirectory)}</span><code>${escape(targetDirectory || settingsText(options.locale, "strata.chooseRoot"))}</code></div>
        </div>
        ${guide.notes ? `<div class="install-note"><strong>${t(uiKeys.settings.system.installGuideNote)}</strong><p>${escape(guide.notes)}</p></div>` : ""}
        <div class="dialog-actions">
          <button class="secondary" id="dismiss-install-guide">${t(uiKeys.settings.system.installGuideClose)}</button>
          <button class="secondary button-with-icon" id="open-install-directory" data-install-directory="${escape(targetDirectory)}" ${targetDirectory || (component.found && component.matches.some(filename => filename.trim())) ? "" : "disabled"}>${icon("folder-open")}${t(uiKeys.settings.system.installGuideOpenDirectory)}</button>
          <button class="primary button-with-icon" id="open-install-download">${component.found ? escape(settingsText(options.locale, "model.component.viewSource")) : t(uiKeys.settings.system.installGuideOpenDownload)}${icon("external-link")}</button>
        </div>
      </section>
    </div>`;
}
