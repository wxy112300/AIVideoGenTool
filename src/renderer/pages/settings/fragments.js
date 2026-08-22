import { uiKeys } from "../../../core/i18n-keys";
import { settingsModelHardwareRecommendation, settingsText } from "./copy";
import { modelProfileEvidence, modelProfileStatusTone } from "../../shared/status";
function escapeValue(options, value) {
    return options.escapeHtml(value == null ? "" : String(value));
}
export function renderSettingsEnvironmentOverview(viewModel, options) {
    const { environmentScan } = viewModel;
    const escape = (value) => escapeValue(options, value);
    const icon = (name, className) => options.icon(name, className);
    const t = options.t;
    if (!environmentScan) {
        return `${viewModel.environmentScanError ? `<div class="service-status warning" role="alert">${escape(viewModel.environmentScanError)}</div>` : ""}<div class="environment-empty" role="status" aria-live="polite">${viewModel.environmentScanning ? `<span class="scan-spinner"></span><div><strong>${t(uiKeys.settings.system.scanningEnvironment)}</strong><p>${t(uiKeys.settings.system.scanningEnvironmentDescription)}</p></div>` : `<div><strong>${t(uiKeys.settings.system.notScanned)}</strong><p>${t(uiKeys.settings.system.rescanInstruction)}</p></div>`}</div>`;
    }
    return `
    ${viewModel.environmentScanError ? `<div class="service-status warning" role="alert">${escape(viewModel.environmentScanError)}</div>` : ""}
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
    ${viewModel.serviceStatusMessage ? `<div class="service-status ${viewModel.serviceStarting || viewModel.serviceRestarting ? "working" : ""}" role="status" aria-live="polite" aria-atomic="true">${escape(viewModel.serviceStatusMessage)}</div>` : ""}
    ${environmentScan.comfyRoot || environmentScan.comfyInstallDirectory ? `
      <div class="detected-path">
        <div><span class="eyebrow">${t(uiKeys.settings.system.detectedComfyUi, { type: environmentScan.comfyInstallType === "desktop" ? t(uiKeys.settings.system.desktopInstall) :
            environmentScan.comfyInstallType === "portable" ? t(uiKeys.settings.system.portableInstall) :
                environmentScan.comfyInstallType === "manual" ? t(uiKeys.settings.system.manualInstall) : t(uiKeys.settings.system.dataDirectory)
    })}</span>
        <strong>${escape(environmentScan.comfyInstallDirectory || environmentScan.comfyRoot)}</strong>
        <p class="muted">${t(uiKeys.settings.system.coreSource)}${settingsText(options.locale, "shared.labelSeparator")}${escape(environmentScan.comfySourceDirectory || t(uiKeys.settings.system.notFoundPath))}<br>${t(uiKeys.settings.system.dataDirectory)}${settingsText(options.locale, "shared.labelSeparator")}${escape(environmentScan.comfyRoot || t(uiKeys.settings.system.initializationWaiting))}<br>${t(uiKeys.settings.system.service)}${settingsText(options.locale, "shared.labelSeparator")}${escape(environmentScan.comfyUrl)}<br>${t(uiKeys.settings.system.modelPath)}${settingsText(options.locale, "shared.labelSeparator")}${escape(environmentScan.modelDirectory || t(uiKeys.settings.system.initializationWaiting))}<br>${t(uiKeys.settings.system.outputPath)}${settingsText(options.locale, "shared.labelSeparator")}${escape(environmentScan.outputDirectory || t(uiKeys.settings.system.initializationWaiting))}</p></div>
        <button class="secondary button-with-icon" id="use-scanned-comfy">${icon("check")}${t(uiKeys.settings.system.useScannedPaths)}</button>
      </div>` : ""}`;
}
export function renderSettingsEnvironmentIssuesPanel(viewModel, options) {
    const issues = viewModel.environmentScan?.issues ?? [];
    if (!issues.length)
        return "";
    const escape = (value) => escapeValue(options, value);
    const icon = (name, className) => options.icon(name, className);
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
export function renderSettingsComfyCompatibilityPanel(viewModel, options) {
    const compatibility = viewModel.environmentScan?.comfyCompatibility;
    if (!compatibility)
        return "";
    const selectedInstallation = viewModel.environmentScan?.comfyInstallations?.find((installation) => installation.selected) ?? viewModel.environmentScan?.comfyInstallations?.[0];
    const versionLabel = compatibility.version
        ? `v${compatibility.version}`
        : options.t(uiKeys.settings.compatibility.versionUnknown);
    const compatibilityState = compatibility.compatibilityState ?? (compatibility.version || compatibility.revision || compatibility.checkedFrom
        ? "supported"
        : "unknown");
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
    const escape = (value) => escapeValue(options, value);
    const icon = (name, className) => options.icon(name, className);
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
      ${versionMismatch ? `<div class="service-status warning">${escape(t(uiKeys.settings.compatibility.mismatchWarning, { serviceVersion: versionLabel, localVersion: `v${selectedInstallation?.version ?? t(uiKeys.settings.compatibility.versionUnknown)}` }))}</div>` : ""}
      ${compatibility.compatibilityNotice && compatibilityState !== "supported" ? `<div class="service-status ${compatibilityState === "error" ? "error" : "warning"}">${escape(compatibility.compatibilityNotice)}</div>` : ""}
      <p class="muted">${escape(compatibility.updateHint)}</p>
      ${viewModel.comfyUpdateLog ? `<details class="node-log" open><summary>${t(uiKeys.settings.compatibility.updateLog)}</summary><pre>${escape(viewModel.comfyUpdateLog)}</pre></details>` : ""}
    </section>`;
}
export function renderSettingsModelScanCard(profile, options) {
    const missingCount = profile.components.filter((component) => !component.found && !component.optional).length;
    const isPromptProfile = profile.category === "prompt";
    const isLlamaProfile = profile.managedBy === "llama-server";
    const isGemmaProfile = isPromptProfile && options.isGemmaPromptModel(profile.id);
    const isMultimodalProfile = isPromptProfile && options.isComfyMultimodalPromptModel(profile.id);
    const isQwenVlPeftProfile = isPromptProfile && options.isQwenVlPeftPromptModel(profile.id);
    const evidence = modelProfileEvidence(profile);
    const hardwareRecommendation = settingsModelHardwareRecommendation(options.locale, profile);
    const loraInfoButton = profile.category === "lora"
        ? options.videoLoraInfoButton(profile.id)
        : "";
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
    const nodeEvidence = evidence.nodePackage === "ready"
        ? options.t(uiKeys.settings.system.scanCardNodeReady)
        : evidence.nodePackage === "missing"
            ? options.t(uiKeys.settings.system.scanCardNodeMissing)
            : evidence.nodePackage === "incompatible"
                ? options.t(uiKeys.settings.system.scanCardNodeIncompatible)
                : evidence.nodePackage === "warning"
                    ? options.t(uiKeys.settings.system.scanCardNodeAttention)
                    : options.t(uiKeys.settings.system.scanCardNodeNotRequired);
    const runtimeEvidence = evidence.runtime === "ready"
        ? options.t(uiKeys.settings.system.scanCardRuntimeReady)
        : evidence.runtime === "pending"
            ? options.t(uiKeys.settings.system.scanCardRuntimePending)
            : evidence.runtime === "missing"
                ? options.t(uiKeys.settings.system.scanCardRuntimeUnavailable)
                : options.t(uiKeys.settings.system.scanCardRuntimeNotRequired);
    const evidenceLabel = options.t(uiKeys.settings.system.scanCardEvidence, {
        files: evidence.files === "ready"
            ? options.t(uiKeys.settings.system.scanCardFileReady)
            : options.t(uiKeys.settings.system.scanCardFileMissing),
        nodes: nodeEvidence,
        runtime: runtimeEvidence
    });
    const metaLabel = profile.available
        ? isPromptProfile
            ? isLlamaProfile
                ? settingsText(options.locale, "model.meta.llamaReady")
                : isMultimodalProfile
                    ? settingsText(options.locale, "model.meta.multimodalReady")
                    : isQwenVlPeftProfile
                        ? settingsText(options.locale, "model.meta.qwenReady")
                        : isGemmaProfile
                            ? settingsText(options.locale, "model.meta.gemmaReady")
                            : settingsText(options.locale, "model.meta.nativeReady")
            : profile.category === "image"
                ? options.imageWorkflowStatus(profile)
                : evidence.runtime === "missing"
                    ? settingsText(options.locale, "model.meta.runtimeMissing", {
                        nodes: profile.runtimeMissingNodes?.join(settingsText(options.locale, "shared.listSeparator")) || settingsText(options.locale, "model.meta.runtimeMissingHint")
                    })
                    : profile.integrated
                        ? settingsText(options.locale, "model.meta.fileReady")
                        : settingsText(options.locale, "model.meta.workflowPending")
        : isPromptProfile
            ? isLlamaProfile
                ? settingsText(options.locale, "model.meta.llamaMissing")
                : isMultimodalProfile
                    ? settingsText(options.locale, "model.meta.multimodalMissing")
                    : isQwenVlPeftProfile
                        ? settingsText(options.locale, "model.meta.qwenMissing")
                        : settingsText(options.locale, "model.meta.nativeMissing")
            : settingsText(options.locale, "model.meta.genericMissing");
    const escape = (value) => escapeValue(options, value);
    const icon = (name, className) => options.icon(name, className);
    return `
    <article class="panel model-profile ${statusTone}">
      <div class="model-profile-head">
        <div>
          <div class="model-title"><h3>${escape(profile.name)}</h3>${loraInfoButton}<span class="model-badge">${escape(profile.badge)}</span></div>
          <p class="muted">${escape(profile.description)}</p>
        </div>
        <span class="model-availability ${statusTone}">${profile.available ? `${icon(statusTone === "available" ? "circle-check" : statusTone === "warning" ? "circle-help" : "circle-alert")} ${escape(readyLabel)}` : `${icon("circle-alert")} ${options.t(uiKeys.settings.system.scanCardMissingCount, { count: missingCount })}`}</span>
      </div>
      <div class="model-meta-line"><span>${options.t(uiKeys.settings.system.scanCardResourcePolicy)} · ${escape(profile.vram)}</span><span class="model-hardware-recommendation">${options.t(uiKeys.settings.system.scanCardRecommendedHardware)} · ${escape(hardwareRecommendation)}</span><span>${escape(evidenceLabel)}</span><span>${metaLabel}</span></div>
      <div class="component-list">
        ${profile.components.map((component, componentIndex) => `
          <div class="component-row ${component.found ? "found" : component.optional ? "warning" : "missing"}">
            <span class="component-state">${icon(component.found ? "circle-check" : component.optional ? "circle-help" : "circle-alert")}</span>
            <div><strong>${escape(component.label)}</strong>
              ${component.found
        ? `<code title="${escape(component.matches.join("\n"))}">${escape(component.matches.join(" · "))}</code>`
        : `<span>${component.optional ? settingsText(options.locale, "model.component.optional") : options.t(uiKeys.settings.system.scanCardMissing)}${escape(component.expected)}</span>`}
              </div>
              ${component.found ? "" : `<button class="component-info" data-install-profile="${escape(profile.id)}" data-install-component="${componentIndex}" aria-label="${escape(settingsText(options.locale, "model.component.viewInfo", { label: component.label, info: options.t(uiKeys.settings.system.scanCardInstallInfo) }))}" title="${options.t(uiKeys.settings.system.scanCardInstallInfo)}">${icon("info")}</button>`}
          </div>`).join("")}
      </div>
    </article>`;
}
export function renderSettingsInstallGuideDialog(viewModel, options) {
    if (!viewModel.selectedInstallGuide)
        return "";
    const { profileName, component } = viewModel.selectedInstallGuide;
    const guide = component.installGuide;
    const escape = (value) => escapeValue(options, value);
    const icon = (name, className) => options.icon(name, className);
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
