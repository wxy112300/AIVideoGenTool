import "./style.css";
import { createRendererApp } from "./renderer/app";
import { bootstrapRenderer } from "./renderer/bootstrap";
import { createPromptRuntimeState, promptModelStartupIsActive, promptOperationBelongsTo, promptOperationIsActive } from "./core/prompt-runtime-state";
import { projectPromptRuntimeView } from "./core/prompt-runtime-view";
import { registerRendererEvents } from "./renderer/state-events";
import { creationMode, historyKind, page, setCreationMode, setHistoryKind, setPage, setRendererState, state } from "./renderer/renderer-state";
import { rendererUiState as ui } from "./renderer/ui-state";
import { createNotification, notificationAlreadyPending, notificationShouldPreserveError } from "./renderer/notifications";
import { createQueueLiveStatus } from "./renderer/pages/queue/live-status";
import { createQueueAssembly } from "./renderer/pages/queue/assembly";
import { createQueueScrollController } from "./renderer/pages/queue/scroll-controller";
import { renderSettingsPage } from "./renderer/pages/settings/page";
import { renderSettingsInstallGuideDialog } from "./renderer/pages/settings/fragments";
import { mountSettingsAssembly } from "./renderer/pages/settings/assembly";
import { createRenderCoordinator } from "./renderer/render-coordinator";
import { EnvironmentRefreshCoordinator } from "./renderer/environment-refresh-coordinator";
import { readSettingsFromForm } from "./renderer/pages/settings/form";
import { buildSettingsPageViewModel } from "./renderer/pages/settings/view-model";
import { createAppLogContextMenu } from "./renderer/pages/settings/log-context-menu";
import { SettingsSaveCoordinator } from "./renderer/pages/settings/settings-save-coordinator";
import { CustomNodeInstallQueue } from "./renderer/pages/settings/node-install-queue";
import { createHistoryAssembly, mountHistoryAssembly } from "./renderer/pages/history/assembly";
import { createHistoryContextMenus } from "./renderer/pages/history/context-menus";
import { createHistoryLayoutController } from "./renderer/pages/history/layout-controller";
import { createHistoryActions } from "./renderer/pages/history/actions";
import { historyAssetsByNewest, imageProjectsByNewest, preferredImageVersion, preferredVersion, versionShortEdge } from "./renderer/pages/history/helpers";
import { historyFilterSignature, normalizeHistoryFilter } from "./core/history-filter";
import { createHistoryMediaRuntime } from "./renderer/pages/history/media-helpers";
import { renderCreatePage, renderImageEditPage, } from "./renderer/pages/create/page";
import { mountCreateAssembly } from "./renderer/pages/create/assembly";
import { mountH3ReferencesController } from "./renderer/pages/create/references-controller";
import { buildImageEditPageViewModel, buildVideoCreatePageViewModel, imageEditEnqueueBlockReason } from "./renderer/pages/create/view-model";
import { h3PromptPresetOptions, imageFileIsSupported, h3ReferenceRolePromptLabels, imageReferenceRolePromptLabels, loadImagePreview, orderVideoProfiles, resizePromptInput, updateImagePromptWordCounter } from "./renderer/pages/create/helpers";
import { h3PromptPackFor, loadPromptPacks, qwenImagePromptPackFor } from "./renderer/prompt-packs";
import { h3AutoPromptSeeds } from "./core/prompts/h3/auto-seeds";
import { activePromptIndexForDraft, clearPromptVersion, promptPatchForDraft, promptVersionsForDraft } from "./core/draft-prompts";
import { PromptEditHistory } from "./core/prompt-edit-history";
import { escapeHtml } from "./renderer/shared/dom";
import { formatAssetBytes, formatBytes, formatElapsedDuration, formatFullHistoryTime, formatTrimTime, formatUpscaleEstimateRange, formatVideoDuration, historyRenderDuration, performanceCard } from "./renderer/shared/formatters";
import { icon, renderIcons } from "./renderer/shared/icons";
import { modelName, videoLoraPurposeLabel } from "./renderer/shared/labels";
import { videoLoraInfoButton } from "./renderer/shared/markup";
import { imageWorkflowStatus, isImageModelSelectable, promptModelStatus } from "./renderer/shared/status";
import { appLogTerminalHtml, visibleAppLogText } from "./renderer/shared/logs";
import { mountShellController } from "./renderer/shell/controller";
import { mountUpscaleController } from "./renderer/shell/upscale-controller";
import { acceptConfirmation as runConfirmation } from "./renderer/shell/confirmation-service";
import { renderConfirmationDialog, renderWindowCloseDialog } from "./renderer/shell/dialogs";
import { imageAssetResultSummary, renderDirectoryMigrationDialog, renderImageAssetLibraryDialog, renderUpscaleDialog } from "./renderer/shell/secondary-dialogs";
import { createClearedDraft, createDefaultImageEditDraft } from "./core/draft-defaults";
import { activateCreationDraft, creationDraftForMode, patchCreationDraftForMode, preserveLocalCreationDrafts } from "./core/creation-drafts";
import { imageEditDraftFromQueueTask, nextImagePictureNumber, normalizeImageEditDraft } from "./core/image-project";
import { imageModelCapabilityFor, imageOutputCountMax, imageReferenceInputPath, normalizeImageTargetResolution } from "./core/image-workflow";
import { isComfyMultimodalPromptModel, isGemmaPromptModel, isQwenVlPeftPromptModel } from "./core/prompt-models";
import { isMiniMaxH3R2vModel, motionContextMaxDurationSeconds, normalizeH3Steps } from "./core/workflow";
import { shouldEnableSpectrumByDefault } from "./core/video-policy";
import { modelCatalog } from "./core/catalog";
import { rewriteHuggingFaceDownloadUrl } from "./core/download-url";
import { nearestSupportedVideoResolution } from "./core/video-resolution";
import { ensureMotionContextSourceSlot } from "./core/h3-reference";
import { createUpscaleFilename, estimateUpscaleResources, upscaleDimensions } from "./core/upscale";
import { checkH3Prompt } from "./core/h3-prompt-check";
import { structurallyEqual } from "./core/structural-equal";
import { createTranslator, loadUiLocale } from "./core/i18n";
import { uiKeys } from "./core/i18n-keys";
import { BUILTIN_VIDEO_LORAS, bundledWorkflowModelId } from "./core/video-loras";
const appElement = document.querySelector("#app");
const modalRoot = document.querySelector("#modal-root");
let draftSaveTimer;
let draftRevision = 0;
let draftSaveInFlight = 0;
let draftDirty = false;
let imageDraftSaveTimer;
let imageDraftRevision = 0;
let imageDraftSaveInFlight = 0;
let imageDraftDirty = false;
let environmentScan = null;
let environmentScanning = false;
let settingsSaving = false;
let environmentScanError = "";
let serviceStarting = null;
let serviceRestarting = null;
let serviceForceStopping = false;
let serviceStatusMessage = "";
let comfyUpdating = false;
let comfyUpdateLog = "";
let environmentRepairing = "";
let environmentRepairLogs = {};
let customNodeInstalling = "";
let customNodeInstallQueue = [];
let customNodeInstallBatch = [];
let customNodeInstallPhase = "idle";
let customNodeLogs = {};
let workflowDependencyInstalling = "";
let workflowDependencyLogs = {};
let coreDependencyRepairing = false;
let attentionAccelerationInstalling = false;
let attentionAccelerationLog = "";
let llamaCppPythonInstalling = false;
let llamaCppPythonLog = "";
let settingsDraft = null;
let settingsTab = "system";
let appLogs = null;
let appLogsLoading = false;
let appLogsError = "";
let appLogPollingTimer;
let appLogPollingInFlight = false;
let appLogFollowTail = true;
let appLogScreenClearedAt = null;
let selectedInstallGuide = null;
let queueActionBusy = null;
const bundledWorkflows = {};
const bundledWorkflowKey = (modelId, inputMode) => `${modelId}:${inputMode}`;
const workflowCapabilities = {};
const taskPreviews = {};
let performanceMetrics = null;
let comfyRuntime = {
    phase: "unknown",
    ownership: "unknown",
    endpoint: "",
    message: "",
    updatedAt: new Date(0).toISOString(),
    operationId: 0
};
let promptRuntime = createPromptRuntimeState(comfyRuntime);
const creationModeUiState = {
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
const activeCreationModeUiState = () => creationModeUiState[creationMode];
let settingsH3PromptPreset = "official-storyboard";
let settingsImagePromptPreset = "faithful";
let promptEnhancing = false;
let promptStarting = false;
let promptStartRequestPending = false;
let promptReleasing = false;
let promptRuntimeLoaded = false;
let promptProgress = null;
const promptEditHistory = new PromptEditHistory();
function uiText(key, params, fallback) {
    return createTranslator(state.settings.uiLocale).t(key, params, fallback);
}
function videoPromptSnapshot() {
    return {
        promptVersions: promptVersionsForDraft(state.draft).map((version) => ({ ...version })),
        activePromptVersion: activePromptIndexForDraft(state.draft)
    };
}
function imagePromptSnapshot() {
    return {
        promptVersions: state.imageDraft.promptVersions.map((version) => ({ ...version })),
        activePromptVersion: state.imageDraft.activePromptVersion
    };
}
function clearPromptVersionForScope(scope) {
    const before = scope === "video" ? videoPromptSnapshot() : imagePromptSnapshot();
    if (before.promptVersions.length === 1 && !before.promptVersions[0]?.text)
        return;
    const cleared = clearPromptVersion(before.promptVersions, before.activePromptVersion);
    const after = {
        promptVersions: cleared.promptVersions,
        activePromptVersion: cleared.activePromptVersion
    };
    promptEditHistory.record(scope, before, after);
    if (scope === "video") {
        patchDraft(promptPatchForDraft(state.draft, after.promptVersions, after.activePromptVersion));
    }
    else {
        patchImageDraft(after);
    }
}
function applyPromptHistorySnapshot(scope, snapshot) {
    if (scope === "video") {
        patchDraft(promptPatchForDraft(state.draft, snapshot.promptVersions.map((version) => ({ ...version })), snapshot.activePromptVersion));
    }
    else {
        patchImageDraft({
            promptVersions: snapshot.promptVersions.map((version) => ({ ...version })),
            activePromptVersion: snapshot.activePromptVersion
        });
    }
}
function undoPromptEdit(scope) {
    const snapshot = promptEditHistory.undo(scope);
    if (!snapshot)
        return false;
    applyPromptHistorySnapshot(scope, snapshot);
    return true;
}
function redoPromptEdit(scope) {
    const snapshot = promptEditHistory.redo(scope);
    if (!snapshot)
        return false;
    applyPromptHistorySnapshot(scope, snapshot);
    return true;
}
function invalidatePromptEditHistory(scope) {
    promptEditHistory.invalidate(scope);
}
window.addEventListener("dragover", (event) => {
    if (event.dataTransfer?.types.includes("Files"))
        event.preventDefault();
});
window.addEventListener("drop", (event) => {
    if (event.dataTransfer?.files.length)
        event.preventDefault();
});
function updateH3PromptCheck(promptText, hasEndImage, mode, hasVideoReference = false) {
    const element = document.querySelector("#h3-prompt-check");
    if (!element)
        return;
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
function rememberModalFocus() {
    const active = document.activeElement;
    ui.modalReturnFocus = active instanceof HTMLElement && active !== document.body
        ? active
        : null;
    ui.modalInitialFocusPending = true;
    ui.modalControlFocusSelector = "";
}
function rememberModalControlFocus(element) {
    if (element.id) {
        ui.modalControlFocusSelector = `#${element.id}`;
        return;
    }
    const upscaleHeight = element.dataset.upscaleHeight;
    if (upscaleHeight) {
        ui.modalControlFocusSelector = `[data-upscale-height="${CSS.escape(upscaleHeight)}"]`;
    }
}
function preserveModalControlFocus() {
    const active = document.activeElement;
    if (active instanceof HTMLElement && modalRoot.contains(active)) {
        rememberModalControlFocus(active);
    }
}
function restoreModalFocus() {
    const target = ui.modalReturnFocus;
    ui.modalReturnFocus = null;
    window.requestAnimationFrame(() => {
        if (target?.isConnected && !target.hasAttribute("disabled")) {
            target.focus();
            return;
        }
        document.querySelector(`.nav-button[data-page="${page === "history-detail" || page === "image-history-detail" ? "history" : page}"]`)?.focus();
    });
}
function bindModalFocus(dialog, close, initialSelector, focusOnBind = true) {
    const focusableSelector = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex=\"-1\"])";
    const focusInitial = () => {
        const storedControl = !ui.modalInitialFocusPending && ui.modalControlFocusSelector
            ? dialog.querySelector(ui.modalControlFocusSelector)
            : null;
        const initial = storedControl ?? (initialSelector
            ? dialog.querySelector(initialSelector)
            : null);
        const first = initial ?? dialog.querySelector(focusableSelector);
        (first ?? dialog).focus();
        ui.modalControlFocusSelector = "";
    };
    dialog.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            close();
            return;
        }
        if (event.key !== "Tab")
            return;
        const focusables = [...dialog.querySelectorAll(focusableSelector)]
            .filter((element) => element.getClientRects().length > 0);
        if (!focusables.length) {
            event.preventDefault();
            dialog.focus();
            return;
        }
        const first = focusables[0];
        const last = focusables.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        }
        else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
    if (focusOnBind && (ui.modalInitialFocusPending || ui.modalControlFocusSelector)) {
        ui.modalInitialFocusPending = false;
        focusInitial();
    }
}
function directoryMigrationDialog() {
    return renderDirectoryMigrationDialog({
        request: ui.pendingDirectoryMigration,
        progress: ui.historyMigrationProgress,
        busy: ui.directoryMigrationBusy,
        t: rendererApp.context.t,
        icon,
        escapeHtml
    });
}
async function chooseDirectoryMigration(mode) {
    const request = ui.pendingDirectoryMigration;
    if (!request || ui.directoryMigrationBusy)
        return;
    if (mode === "cancel") {
        settingsDraft = {
            ...request.nextSettings,
            outputDirectory: request.previousSettings.outputDirectory
        };
        ui.pendingDirectoryMigration = null;
        ui.historyMigrationProgress = null;
        renderOverlay();
        restoreModalFocus();
        showMessage(uiText(uiKeys.runtime.directoryCancelled));
        return;
    }
    ui.directoryMigrationBusy = true;
    ui.historyMigrationProgress = null;
    renderOverlay();
    try {
        await settingsSaveCoordinator.save(request.nextSettings, mode);
        const warningCount = ui.historyMigrationProgress?.warningCount ?? 0;
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
    }
    catch (error) {
        ui.directoryMigrationBusy = false;
        showMessage(error instanceof Error ? error.message : String(error), { kind: "error" });
        renderOverlay();
    }
}
function bindDirectoryMigrationDialog() {
    if (!ui.pendingDirectoryMigration)
        return;
    modalRoot.querySelector("#directory-apply")?.addEventListener("click", () => {
        void chooseDirectoryMigration("apply");
    });
    modalRoot.querySelector("#directory-apply-migrate")?.addEventListener("click", () => {
        void chooseDirectoryMigration("migrate-video-history");
    });
    modalRoot.querySelector("#directory-cancel")?.addEventListener("click", () => {
        void chooseDirectoryMigration("cancel");
    });
    modalRoot.querySelector("#directory-migration-backdrop")?.addEventListener("click", (event) => {
        if (event.target === event.currentTarget && !ui.directoryMigrationBusy) {
            void chooseDirectoryMigration("cancel");
        }
    });
    const dialog = modalRoot.querySelector(".directory-migration-dialog");
    if (dialog)
        bindModalFocus(dialog, () => void chooseDirectoryMigration("cancel"), "#directory-cancel");
}
function imageAssetLibraryDialogHtml() {
    return renderImageAssetLibraryDialog({
        dialog: ui.imageAssetLibraryDialog,
        progress: ui.imageAssetLibraryProgress,
        icon,
        escapeHtml,
        formatAssetBytes,
        t: rendererApp.context.t
    });
}
async function scanImageAssets() {
    if (!ui.imageAssetLibraryDialog || ui.imageAssetLibraryDialog.busy)
        return;
    ui.imageAssetLibraryDialog = { ...ui.imageAssetLibraryDialog, busy: true, error: "", confirmCleanup: false, lastResult: null };
    ui.imageAssetLibraryProgress = null;
    renderOverlay();
    try {
        const scan = await window.studio.scanImageAssetLibrary();
        ui.imageAssetLibraryDialog = { scan, busy: false, error: "", confirmCleanup: false, selectedPaths: scan.orphanFiles.slice(0, 12).map((file) => file.absolutePath), lastResult: null };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ui.imageAssetLibraryDialog = { ...ui.imageAssetLibraryDialog, busy: false, error: message };
        showMessage(message, { kind: "error" });
    }
    renderOverlay();
}
function bindImageAssetLibraryDialog() {
    const dialog = ui.imageAssetLibraryDialog;
    if (!dialog)
        return;
    const close = () => {
        if (ui.imageAssetLibraryDialog?.busy)
            return;
        ui.imageAssetLibraryDialog = null;
        ui.imageAssetLibraryProgress = null;
        renderOverlay();
        restoreModalFocus();
    };
    modalRoot.querySelector("#image-assets-close")?.addEventListener("click", close);
    modalRoot.querySelector("#image-asset-library-backdrop")?.addEventListener("click", (event) => {
        if (event.target === event.currentTarget)
            close();
    });
    modalRoot.querySelector("#image-assets-rescan")?.addEventListener("click", () => void scanImageAssets());
    modalRoot.querySelector("#image-assets-organize")?.addEventListener("click", async () => {
        if (!ui.imageAssetLibraryDialog || ui.imageAssetLibraryDialog.busy)
            return;
        ui.imageAssetLibraryDialog = { ...ui.imageAssetLibraryDialog, busy: true, error: "", lastResult: null };
        ui.imageAssetLibraryProgress = null;
        renderOverlay();
        try {
            const result = await window.studio.organizeImageAssetLibrary();
            ui.imageAssetLibraryDialog = { scan: result.scan, busy: false, error: "", confirmCleanup: false, selectedPaths: result.scan.orphanFiles.slice(0, 12).map((file) => file.absolutePath), lastResult: imageAssetResultSummary(result, "organize", formatAssetBytes, rendererApp.context.t) };
            showMessage(uiText(uiKeys.runtime.assetOrganized, { archived: result.archivedFiles, reorganized: result.reorganizedFiles, references: result.updatedReferences }));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            ui.imageAssetLibraryDialog = { ...ui.imageAssetLibraryDialog, busy: false, error: message };
            showMessage(message, { kind: "error" });
        }
        renderOverlay();
    });
    modalRoot.querySelector("#image-assets-cleanup")?.addEventListener("click", async () => {
        if (!ui.imageAssetLibraryDialog || ui.imageAssetLibraryDialog.busy)
            return;
        if (!ui.imageAssetLibraryDialog.confirmCleanup) {
            const selectedPaths = [...modalRoot.querySelectorAll("[data-orphan-path]:checked")].map((item) => item.dataset.orphanPath || "").filter(Boolean);
            ui.imageAssetLibraryDialog = { ...ui.imageAssetLibraryDialog, confirmCleanup: true, selectedPaths };
            renderOverlay();
            return;
        }
        const paths = [...ui.imageAssetLibraryDialog.selectedPaths];
        ui.imageAssetLibraryDialog = { ...ui.imageAssetLibraryDialog, busy: true, error: "", confirmCleanup: false, lastResult: null };
        ui.imageAssetLibraryProgress = null;
        renderOverlay();
        try {
            const result = await window.studio.cleanupImageAssetLibrary(paths);
            ui.imageAssetLibraryDialog = { scan: result.scan, busy: false, error: "", confirmCleanup: false, selectedPaths: result.scan.orphanFiles.slice(0, 12).map((file) => file.absolutePath), lastResult: imageAssetResultSummary(result, "cleanup", formatAssetBytes, rendererApp.context.t) };
            showMessage(uiText(uiKeys.runtime.assetCleaned, { files: result.cleanedFiles, bytes: formatAssetBytes(result.cleanedBytes) }));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            ui.imageAssetLibraryDialog = { ...ui.imageAssetLibraryDialog, busy: false, error: message, confirmCleanup: false };
            showMessage(message, { kind: "error" });
        }
        renderOverlay();
    });
    const element = modalRoot.querySelector(".image-asset-library-dialog");
    if (element)
        bindModalFocus(element, close, "#image-assets-close");
}
function upscaleDialogHtml() {
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
function installGuideDialogHtml() {
    if (page !== "settings")
        return "";
    return renderSettingsInstallGuideDialog({
        selectedInstallGuide,
        configuredModelDirectory: environmentScan?.modelDirectory || settingsDraft?.modelDirectory || state.settings.modelDirectory || "ComfyUI\\models"
    }, {
        icon,
        escapeHtml,
        t: rendererApp.context.t,
        locale: state.settings.uiLocale
    });
}
function bindInstallGuideDialog() {
    if (page !== "settings" || !selectedInstallGuide)
        return;
    const close = () => {
        selectedInstallGuide = null;
        renderOverlay();
        restoreModalFocus();
    };
    modalRoot.querySelector("#close-install-guide")?.addEventListener("click", close);
    modalRoot.querySelector("#dismiss-install-guide")?.addEventListener("click", close);
    modalRoot.querySelector("#install-guide-backdrop")?.addEventListener("click", (event) => {
        if (event.target === event.currentTarget)
            close();
    });
    modalRoot.querySelector("#open-install-download")?.addEventListener("click", async () => {
        const guide = selectedInstallGuide?.component.installGuide;
        if (!guide)
            return;
        const url = rewriteHuggingFaceDownloadUrl(guide.downloadUrl, (settingsDraft ?? state.settings).hfMirrorEnabled);
        const opened = await window.studio.openExternal(url);
        if (!opened)
            showMessage(uiText(uiKeys.settings.actions.downloadPageFailed), { kind: "error" });
    });
    modalRoot.querySelector("#open-install-directory")?.addEventListener("click", async (event) => {
        const directory = event.currentTarget.dataset.installDirectory?.trim();
        if (!directory)
            return;
        const opened = await window.studio.openDirectory(directory);
        if (!opened)
            showMessage(uiText(uiKeys.settings.actions.openDirectoryFailed), { kind: "error" });
    });
    const dialog = modalRoot.querySelector(".install-guide-dialog");
    if (dialog)
        bindModalFocus(dialog, close, "#dismiss-install-guide");
}
function promptRuntimeControlIcon() {
    return promptStarting || promptReleasing
        ? "refresh-cw"
        : promptRuntimeLoaded || promptEnhancing
            ? "square"
            : "play";
}
function promptRuntimeControlTitle(settings = state.settings) {
    return promptStarting
        ? uiText(uiKeys.runtime.promptStarting)
        : promptEnhancing
            ? uiText(uiKeys.runtime.releasePrompt)
            : promptReleasing
                ? uiText(uiKeys.runtime.promptReleasing)
                : promptRuntimeLoaded
                    ? uiText(uiKeys.runtime.releasePrompt)
                    : promptModelStatus(settings, environmentScan, uiText).detail;
}
const createPageOptions = {
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
function createViewModelDependencies() {
    const origin = creationMode;
    const modeUiState = activeCreationModeUiState();
    const promptRuntimeView = projectPromptRuntimeView(promptRuntime, origin);
    const ownsActivePrompt = promptOperationBelongsTo(promptRuntime, origin);
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
        promptStarting,
        promptReleasing: promptRuntime.model.phase === "unloading",
        promptRuntimeLoaded: promptRuntime.model.phase === "resident",
        promptProgress: ownsActivePrompt ? promptProgress : null,
        enqueueBusy: ui.enqueueBusy,
        promptRuntimeControlTitle,
        promptRuntimeControlIcon,
        promptRuntimeView
    };
}
function imageEditPage() {
    return renderImageEditPage(buildImageEditPageViewModel(createViewModelDependencies()), createPageOptions);
}
function createPage() {
    if (creationMode === "image-edit")
        return imageEditPage();
    return renderCreatePage(buildVideoCreatePageViewModel(createViewModelDependencies()), createPageOptions);
}
function draftFromQueueTask(task) {
    if (task.taskType === "upscale" || task.taskType === "image-generation" || task.status === "running")
        return null;
    const now = new Date().toISOString();
    const resolution = [360, 480, 540, 720, 768].includes(task.resolution)
        ? task.resolution
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
async function editQueueTask(taskId) {
    const task = state.queue.find((item) => item.id === taskId);
    if (!task || task.status === "running")
        return;
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
        if (!draft)
            return;
        await saveDraftImmediately(draft);
        setRendererState(await window.studio.removeTask(taskId));
        queueActionBusy = null;
        navigateToCreationMode(draft.inputMode === "video" ? "video-extension" : "image-to-video");
        showMessage(uiText(uiKeys.runtime.queueReturned));
    }
    catch (error) {
        queueActionBusy = null;
        showMessage(error instanceof Error ? error.message : uiText(uiKeys.runtime.cannotEditQueue), { kind: "error" });
    }
}
function enableSpectrumByDefaultIfAvailable(mode) {
    const spectrumNode = environmentScan?.customNodes.find((node) => node.id === "spectrum-minimax-h3");
    const draft = mode
        ? creationDraftForMode(state, mode === "video-extension" ? "video" : "image")
        : state?.draft;
    if (!draft || !shouldEnableSpectrumByDefault(draft, spectrumNode))
        return;
    if (mode)
        patchDraftForMode(mode, () => ({ spectrumMode: "balanced" }));
    else
        patchDraft({ spectrumMode: "balanced" });
}
function settingsHaveUnsavedChanges() {
    return settingsDraft !== null &&
        !structurallyEqual(settingsDraft, state.settings);
}
function syncSettingsDirtyUi() {
    const dirty = settingsHaveUnsavedChanges();
    const setSettingsDirty = window.studio.setSettingsDirty;
    if (setSettingsDirty)
        void setSettingsDirty(dirty).catch(() => undefined);
    const actionBar = document.querySelector(".settings-heading-actions");
    actionBar?.classList.toggle("is-dirty", dirty || settingsSaving);
    actionBar?.classList.toggle("is-clean", !dirty && !settingsSaving);
    const status = document.querySelector(".settings-heading-actions .save-state");
    status?.classList.toggle("dirty", dirty);
    if (status)
        status.textContent = settingsSaving
            ? uiText(uiKeys.settings.saving)
            : dirty
                ? uiText(uiKeys.runtime.unsavedChanges)
                : "";
    document.querySelector("#discard-settings")?.toggleAttribute("disabled", !dirty || settingsSaving);
    const saveButton = document.querySelector("#save-settings");
    saveButton?.toggleAttribute("disabled", !dirty || settingsSaving);
    saveButton?.setAttribute("aria-busy", String(settingsSaving));
}
function settingsPage() {
    return renderSettingsPage(buildSettingsPageViewModel({
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
        promptRuntimeLoaded,
        promptStarting,
        promptEnhancing,
        promptReleasing,
        serviceStarting: serviceStarting ?? (comfyRuntime.phase === "starting" ? "comfy" : null),
        serviceRestarting: serviceRestarting ?? (comfyRuntime.phase === "restarting" ? "comfy" : null),
        serviceForceStopping,
        serviceStatusMessage: serviceStatusMessage || comfyRuntime.message,
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
        llamaCppPythonInstalling,
        llamaCppPythonLog,
        selectedInstallGuide,
        appLogs,
        appLogsLoading,
        appLogsError,
        settingsHaveUnsavedChanges,
        promptRuntimeControlIcon,
        promptRuntimeControlTitle
    }), {
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
        renderAppLogTerminal: (text) => appLogTerminalHtml(visibleAppLogText(text, appLogScreenClearedAt), uiText(uiKeys.settings.logsEmpty))
    });
}
function render() {
    rendererApp.render();
}
let overlayCleanup = null;
function confirmationDialogHtml() {
    return renderConfirmationDialog({
        request: ui.pendingConfirmation,
        confirmationBusy: ui.confirmationBusy,
        imageHistoryIds: new Set(state.imageHistory.map((item) => item.id)),
        t: rendererApp.context.t,
        icon,
        escapeHtml
    });
}
function windowCloseDialogHtml() {
    return renderWindowCloseDialog({
        request: ui.pendingWindowCloseRequest,
        responseBusy: ui.windowCloseResponseBusy,
        t: rendererApp.context.t,
        icon,
        escapeHtml
    });
}
function renderOverlay() {
    if (page !== "settings" && selectedInstallGuide)
        selectedInstallGuide = null;
    preserveModalControlFocus();
    overlayCleanup?.();
    overlayCleanup = null;
    modalRoot.innerHTML = [
        confirmationDialogHtml(),
        directoryMigrationDialog(),
        imageAssetLibraryDialogHtml(),
        windowCloseDialogHtml(),
        upscaleDialogHtml(),
        installGuideDialogHtml()
    ].join("");
    renderIcons(modalRoot);
    bindConfirmationDialog();
    bindDirectoryMigrationDialog();
    bindImageAssetLibraryDialog();
    bindWindowCloseDialog();
    bindInstallGuideDialog();
    overlayCleanup = bindUpscaleDialog();
}
let renderCoordinator;
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
function initializeRenderCoordinator() {
    renderCoordinator = createRenderCoordinator({
        root: appElement,
        addPageCleanup: rendererApp.addPageCleanup,
        getPage: () => page,
        getState: () => state,
        getUiState: () => ui,
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
const historyMediaRuntime = createHistoryMediaRuntime(rendererApp.context, () => page === "history");
const historyLayoutController = createHistoryLayoutController(rendererApp.context, reportUserAction, () => historyFilterSignature(ui.historyFilter));
const queueScrollController = createQueueScrollController(() => page);
const queueAssembly = createQueueAssembly({
    getState: () => state,
    getPerformanceMetrics: () => performanceMetrics,
    getComfyRuntime: () => comfyRuntime,
    isEnvironmentScanning: () => environmentScanning,
    getTaskPreviews: () => taskPreviews,
    getQueueActionBusy: () => queueActionBusy,
    setState: setRendererState,
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
            modelId: task.modelId,
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
    requestHistoryDeletion
});
const appLogContextMenu = createAppLogContextMenu(rendererApp.context, clearAppLogScreen);
const environmentRefreshCoordinator = new EnvironmentRefreshCoordinator({
    scan: (settings, scope) => window.studio.scanEnvironment(settings, scope),
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
    failedMessage: (error, reason) => uiText(reason === "startup" ? uiKeys.runtime.startupScanFailed : uiKeys.runtime.environmentScanFailed, { error: error instanceof Error ? error.message : String(error) }),
    requestRender: render,
    reportScan: (reason) => reportUserAction("scan-environment", { reason })
});
const customNodeInstallManager = new CustomNodeInstallQueue({
    install: (nodeId, settings) => window.studio.installCustomNode(nodeId, settings),
    restart: (settings) => window.studio.restartLocalService("comfy", settings),
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
        if (page !== "settings")
            return;
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLInputElement ||
            activeElement instanceof HTMLTextAreaElement ||
            activeElement instanceof HTMLSelectElement)
            return;
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
        manualRestartRequired: (message) => uiText(uiKeys.settings.actions.nodeManualRestartRequired, { message }),
        readyCheckFailed: (name, detail) => uiText(uiKeys.settings.actions.nodeBatchReadyCheckFailed, { name, detail: detail || "节点未注册或运行时未返回详情" }),
        completed: (success, failed) => uiText(uiKeys.settings.actions.nodeBatchCompleted, { success, failed })
    }
});
initializeRenderCoordinator();
const queueLiveStatus = createQueueLiveStatus({
    studio: window.studio,
    t: rendererApp.context.t,
    getState: () => state,
    getPage: () => page,
    getComfyRuntimeState: () => comfyRuntime,
    getEnvironmentScanning: () => environmentScanning,
    setPerformanceMetrics: (metrics) => {
        const connectionChanged = performanceMetrics?.comfyConnected !== metrics.comfyConnected;
        performanceMetrics = metrics;
        if (connectionChanged && page === "settings") {
            const activeElement = document.activeElement;
            const editing = activeElement instanceof HTMLInputElement ||
                activeElement instanceof HTMLTextAreaElement ||
                activeElement instanceof HTMLSelectElement;
            if (!editing)
                render();
        }
    }
});
queueLiveStatus.start();
function syncFlashMessage() {
    const flash = document.querySelector("#app-flash");
    if (!flash)
        return;
    const message = flash.querySelector("[data-flash-message]");
    if (message)
        message.textContent = ui.flashMessage;
    else
        flash.textContent = ui.flashMessage;
    const actionContainer = flash.querySelector("[data-flash-actions]");
    if (actionContainer) {
        actionContainer.replaceChildren(...(ui.flashNotification?.actions ?? []).map((action) => {
            const button = document.createElement("button");
            button.className = `${action.tone ?? "secondary"} flash-action`;
            button.type = "button";
            button.dataset.notificationAction = action.id;
            button.textContent = action.label;
            return button;
        }));
    }
    const kind = ui.flashNotification?.kind ?? "info";
    flash.dataset.kind = kind;
    flash.className = `flash flash-${kind}${ui.flashMessage ? " visible" : ""}`;
    flash.setAttribute("role", kind === "error" ? "alert" : "status");
    flash.setAttribute("aria-live", kind === "error" ? "assertive" : "polite");
    flash.classList.toggle("visible", Boolean(ui.flashMessage));
}
function displayNextNotification() {
    const next = ui.flashNotificationQueue.shift() ?? null;
    ui.flashNotification = next;
    ui.flashMessage = next?.message ?? "";
    window.clearTimeout(ui.flashMessageTimer);
    ui.flashMessageTimer = undefined;
    syncFlashMessage();
    if (!next || next.persistent)
        return;
    ui.flashMessageTimer = window.setTimeout(() => {
        if (ui.flashNotification?.id !== next.id)
            return;
        displayNextNotification();
    }, next.durationMs);
}
function dismissNotification(id) {
    if (id !== undefined && ui.flashNotification?.id !== id)
        return;
    window.clearTimeout(ui.flashMessageTimer);
    ui.flashMessageTimer = undefined;
    ui.flashNotification = null;
    ui.flashMessage = "";
    syncFlashMessage();
    displayNextNotification();
}
function runNotificationAction(actionId) {
    const notification = ui.flashNotification;
    const action = notification?.actions.find((candidate) => candidate.id === actionId);
    if (!notification || !action)
        return;
    if (action.dismissOnInvoke !== false)
        dismissNotification(notification.id);
    try {
        void Promise.resolve(action.run()).catch((error) => {
            showMessage(error instanceof Error ? error.message : String(error), { kind: "error" });
        });
    }
    catch (error) {
        showMessage(error instanceof Error ? error.message : String(error), { kind: "error" });
    }
}
function showMessage(message, legacyOrOptions) {
    const options = typeof legacyOrOptions === "object" ? legacyOrOptions : undefined;
    const kind = options?.kind ?? "info";
    const notification = createNotification(ui.nextFlashNotificationId++, message, kind, options?.durationMs, options?.actions);
    if (notificationAlreadyPending(notification, ui.flashNotification, ui.flashNotificationQueue))
        return;
    if (notificationShouldPreserveError(ui.flashNotification, kind)) {
        if (kind === "info")
            return;
        ui.flashNotificationQueue.push(notification);
        void window.studio.reportNotification(kind, message).catch(() => undefined);
        return;
    }
    void window.studio.reportNotification(kind, message).catch(() => undefined);
    if (kind === "task-complete" || kind === "queue-complete") {
        ui.flashNotificationQueue.push(notification);
        if (!ui.flashNotification)
            displayNextNotification();
        return;
    }
    ui.flashNotificationQueue = [];
    ui.flashNotification = notification;
    ui.flashMessage = message;
    window.clearTimeout(ui.flashMessageTimer);
    syncFlashMessage();
    if (notification.persistent)
        return;
    ui.flashMessageTimer = window.setTimeout(() => {
        if (ui.flashNotification?.id !== notification.id)
            return;
        displayNextNotification();
    }, notification.durationMs);
}
function reportUserAction(action, meta) {
    void action;
    void meta;
}
function clearAppLogScreen() {
    if (appLogsLoading)
        return;
    appLogScreenClearedAt = Date.now();
    appLogFollowTail = true;
    reportUserAction("clear-log-screen");
    const terminal = document.querySelector("#app-log-terminal");
    if (terminal) {
        terminal.innerHTML = "";
        terminal.scrollTop = 0;
    }
}
function applyAppLogSnapshot(snapshot) {
    appLogs = snapshot;
    const terminal = document.querySelector("#app-log-terminal");
    if (!terminal) {
        render();
        return;
    }
    const shouldFollowTail = appLogFollowTail ||
        terminal.scrollHeight - terminal.scrollTop - terminal.clientHeight < 48;
    terminal.innerHTML = appLogTerminalHtml(visibleAppLogText(snapshot.text, appLogScreenClearedAt), uiText(uiKeys.settings.logsEmpty));
    if (shouldFollowTail)
        terminal.scrollTop = terminal.scrollHeight;
    const count = document.querySelector("#app-log-count");
    if (count)
        count.textContent = String(snapshot.records.length);
}
async function pollAppLogs() {
    if (appLogPollingInFlight ||
        appLogsLoading ||
        page !== "settings" ||
        settingsTab !== "logs")
        return;
    appLogPollingInFlight = true;
    try {
        const snapshot = await window.studio.readAppLogs(2000);
        if (snapshot.text !== appLogs?.text)
            applyAppLogSnapshot(snapshot);
    }
    catch {
        // The panel keeps the last readable log while the main process is busy.
    }
    finally {
        appLogPollingInFlight = false;
    }
}
function syncAppLogPolling() {
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
async function releasePromptModelFromUi() {
    if (promptRuntime.model.phase === "unloading")
        return;
    reportUserAction("release-prompt-service");
    promptReleasing = true;
    render();
    try {
        const result = await window.studio.releasePromptModel();
        if (!result.ok)
            throw new Error(result.message);
        promptRuntimeLoaded = false;
        showMessage(result.message);
    }
    catch (error) {
        showMessage(error instanceof Error ? error.message : String(error), { kind: "error" });
    }
    finally {
        promptReleasing = false;
        render();
    }
}
async function startPromptModelFromUi() {
    if (promptRuntime.model.phase === "warming" || promptRuntime.service.phase === "starting")
        return;
    reportUserAction("start-prompt-service");
    promptStartRequestPending = true;
    promptStarting = true;
    render();
    try {
        const result = await window.studio.startPromptModel();
        if (!result.ok)
            throw new Error(result.message);
        promptRuntimeLoaded = true;
        showMessage(result.message);
    }
    catch (error) {
        showMessage(error instanceof Error ? error.message : String(error), { kind: "error" });
    }
    finally {
        promptStartRequestPending = false;
        promptStarting = promptModelStartupIsActive(promptRuntime);
        render();
    }
}
async function togglePromptModelFromUi() {
    if (promptRuntime.model.phase === "resident" || promptOperationIsActive(promptRuntime)) {
        await releasePromptModelFromUi();
    }
    else {
        await startPromptModelFromUi();
    }
}
function requestHistoryDeletion(assetId) {
    const asset = state.history.find((item) => item.id === assetId);
    const project = state.imageHistory.find((item) => item.id === assetId);
    const title = asset?.title ?? project?.title;
    if (!title)
        return;
    if (page === "history")
        historyLayoutController.captureHistoryScrollPosition();
    rememberModalFocus();
    ui.pendingConfirmation = {
        kind: "delete-history",
        assetId,
        title
    };
    ui.confirmationBusy = false;
    renderOverlay();
}
function requestHistoryVersionDeletion(assetId, versionId) {
    const asset = state.history.find((item) => item.id === assetId);
    const version = asset?.versions.find((item) => item.id === versionId);
    if (!asset || !version || asset.versions.length <= 1)
        return;
    if (page === "history")
        historyLayoutController.captureHistoryScrollPosition();
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
function requestImageVersionDeletion(projectId, versionId) {
    const project = state.imageHistory.find((item) => item.id === projectId);
    const version = project?.versions.find((item) => item.id === versionId);
    if (!project || !version || version.kind === "source")
        return;
    if (page === "history")
        historyLayoutController.captureHistoryScrollPosition();
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
function requestQueueTaskConfirmation(taskId, action) {
    const task = state.queue.find((item) => item.id === taskId);
    if (!task)
        return;
    rememberModalFocus();
    ui.pendingConfirmation = {
        kind: action === "remove" ? "remove-queue-task" : "cancel-queue-task",
        taskId,
        title: task.outputFilename
    };
    ui.confirmationBusy = false;
    renderOverlay();
}
function historyPlayerIsFullscreen() {
    return Boolean(document.fullscreenElement?.closest(".history-player"));
}
function restoreHistoryPlayerFullscreen() {
    const target = document.querySelector(".history-player video") ??
        document.querySelector(".history-player");
    if (!target?.requestFullscreen)
        return;
    void target.requestFullscreen().catch(() => undefined);
}
function updateHistoryDetailInPlace() {
    const currentPlayer = document.querySelector(".history-player");
    const currentVideo = currentPlayer?.querySelector("video");
    if (!currentPlayer || !currentVideo)
        return false;
    const nextMarkup = document.createElement("div");
    nextMarkup.innerHTML = historyAssembly.renderDetail(rendererApp.context, "video");
    const nextPlayer = nextMarkup.querySelector(".history-player");
    const nextVideo = nextPlayer?.querySelector("video");
    const currentBack = document.querySelector(".history-detail-back");
    const nextBack = nextMarkup.querySelector(".history-detail-back");
    const currentSidebar = document.querySelector(".history-detail-sidebar");
    const nextSidebar = nextMarkup.querySelector(".history-detail-sidebar");
    const currentTags = document.querySelector("[data-history-tags-root]");
    const nextTags = nextMarkup.querySelector("[data-history-tags-root]");
    if (!nextPlayer || !nextVideo || !currentBack || !nextBack || !currentSidebar || !nextSidebar) {
        return false;
    }
    currentPlayer.setAttribute("style", nextPlayer.getAttribute("style") ?? "");
    currentVideo.pause();
    const nextSource = nextVideo.getAttribute("src");
    if (nextSource)
        currentVideo.setAttribute("src", nextSource);
    else
        currentVideo.removeAttribute("src");
    currentVideo.dataset.historyAsset = nextVideo.dataset.historyAsset ?? "";
    currentVideo.dataset.historyVersion = nextVideo.dataset.historyVersion ?? "";
    currentVideo.loop = true;
    currentVideo.load();
    currentBack.replaceWith(nextBack);
    currentSidebar.replaceWith(nextSidebar);
    // The fast detail-navigation path preserves the player while swapping the
    // surrounding detail UI. Tags live outside the sidebar, so they must be
    // swapped explicitly as well; otherwise the old asset's tag controller and
    // chips remain visible after Page Up/Page Down navigation.
    if (currentTags && nextTags)
        currentTags.replaceWith(nextTags);
    // The shell controller owns the global Page Up/Page Down listeners.  The
    // fullscreen fast path only replaces the detail fragments, so rebinding the
    // shell here would leave the previous window listener alive and make each
    // subsequent key press navigate more than once.  Bind only the newly-created
    // back button; the existing shell listener remains the single global owner.
    nextBack.querySelector("[data-page=history]")?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        returnToHistory();
    });
    renderIcons(appElement);
    bindHistory();
    return true;
}
function openHistoryDetail(assetId, versionId) {
    const preserveFullscreen = page === "history-detail" && historyPlayerIsFullscreen();
    if (page === "history")
        historyLayoutController.captureHistoryScrollPosition();
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
    if (preserveFullscreen)
        restoreHistoryPlayerFullscreen();
    window.scrollTo({ top: 0, behavior: "auto" });
}
function openImageHistoryDetail(projectId, versionId) {
    const project = state.imageHistory.find((item) => item.id === projectId);
    if (!project)
        return;
    if (page === "history")
        historyLayoutController.captureHistoryScrollPosition();
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
function returnToHistory() {
    if (page !== "history-detail" && page !== "image-history-detail")
        return;
    historyLayoutController.setScrollRestorePending(true);
    setPage("history");
    render();
}
function navigateToCreationMode(mode) {
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
function returnToLastHistoryDetail() {
    if (page !== "history" || !ui.historyForwardTarget)
        return;
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
function navigateHistoryDetail(direction) {
    if (page !== "history-detail")
        return;
    const orderedHistory = historyAssetsByNewest(state.history, ui.historyFilter);
    const currentIndex = orderedHistory.findIndex((item) => item.id === ui.selectedHistoryAssetId);
    const nextAsset = orderedHistory[currentIndex + direction];
    if (!nextAsset)
        return;
    openHistoryDetail(nextAsset.id);
}
function navigateImageHistoryDetail(direction) {
    if (page !== "image-history-detail")
        return;
    const orderedProjects = imageProjectsByNewest(state.imageHistory, ui.historyFilter);
    const currentIndex = orderedProjects.findIndex((item) => item.id === ui.selectedHistoryAssetId);
    const nextProject = orderedProjects[currentIndex + direction];
    if (!nextProject)
        return;
    openImageHistoryDetail(nextProject.id);
}
function navigateImageHistoryVersion(direction) {
    if (page !== "image-history-detail")
        return;
    const project = state.imageHistory.find((item) => item.id === ui.selectedHistoryAssetId);
    if (!project)
        return;
    const currentIndex = project.versions.findIndex((item) => item.id === ui.selectedHistoryVersionId);
    if (currentIndex < 0)
        return;
    const nextVersion = project.versions[currentIndex - direction];
    if (!nextVersion)
        return;
    ui.selectedHistoryVersionId = nextVersion.id;
    ui.historyForwardTarget = { assetId: project.id, versionId: nextVersion.id };
    reportUserAction("image-history-version-navigation", {
        projectId: project.id,
        versionId: nextVersion.id,
        direction
    });
    render();
    window.requestAnimationFrame(() => {
        document.querySelector(`[data-image-version-id="${CSS.escape(nextVersion.id)}"]`)?.scrollIntoView({
            block: "nearest",
            inline: "nearest"
        });
    });
}
function releaseHistoryVideo(assetId) {
    const cards = [...document.querySelectorAll("[data-history]")];
    const card = cards.find((item) => item.dataset.history === assetId);
    const videos = page === "history-detail" && ui.selectedHistoryAssetId === assetId
        ? document.querySelectorAll(".history-player video")
        : card?.querySelectorAll("video") ?? [];
    videos.forEach((video) => {
        video.pause();
        video.removeAttribute("src");
        video.load();
    });
}
async function acceptConfirmation() {
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
        clearCreationDraft: (mode) => {
            if (mode === "image-edit") {
                patchImageDraft(createDefaultImageEditDraft());
            }
            else {
                patchDraftForMode(mode, (draft) => createClearedDraft(draft));
            }
        },
        setServiceForceStopping: (value) => {
            serviceForceStopping = value;
        },
        setServiceStatusMessage: (message) => {
            serviceStatusMessage = message;
        },
        scanEnvironment: async (settings) => {
            await runEnvironmentScan(settings);
        },
        setSettingsDraft: (settings) => {
            settingsDraft = settings;
        },
        setPage,
        setHistoryKind,
        setHistoryScrollRestorePending: historyLayoutController.setScrollRestorePending,
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
        overlayRoot: modalRoot,
        renderOverlay,
        notify: (message) => showMessage(message),
        getPage: () => page
    });
}
function bindConfirmationDialog() {
    if (!ui.pendingConfirmation)
        return;
    const close = () => {
        if (ui.confirmationBusy)
            return;
        ui.pendingConfirmation = null;
        renderOverlay();
        restoreModalFocus();
    };
    modalRoot.querySelector("#cancel-confirmation")?.addEventListener("click", close);
    modalRoot.querySelector("#accept-confirmation")?.addEventListener("click", () => {
        void acceptConfirmation();
    });
    modalRoot.querySelector("#confirm-backdrop")?.addEventListener("click", (event) => {
        if (event.target === event.currentTarget)
            close();
    });
    const dialog = modalRoot.querySelector(".confirm-dialog");
    if (dialog)
        bindModalFocus(dialog, close, "#cancel-confirmation");
}
function bindWindowCloseDialog() {
    if (!ui.pendingWindowCloseRequest)
        return;
    const respond = async (response) => {
        if (ui.windowCloseResponseBusy)
            return;
        if (document.activeElement instanceof HTMLElement) {
            rememberModalControlFocus(document.activeElement);
        }
        ui.windowCloseResponseBusy = true;
        renderOverlay();
        try {
            await window.studio.respondWindowClose(response);
            if (response === "cancel") {
                ui.pendingWindowCloseRequest = null;
                ui.windowCloseResponseBusy = false;
                renderOverlay();
                restoreModalFocus();
            }
        }
        catch (error) {
            ui.windowCloseResponseBusy = false;
            showMessage(error instanceof Error ? error.message : uiText(uiKeys.runtime.exitRequestFailed), { kind: "error" });
            renderOverlay();
        }
    };
    const cancel = () => void respond("cancel");
    modalRoot.querySelector("#cancel-window-close")?.addEventListener("click", cancel);
    modalRoot.querySelector("#window-close-backdrop")?.addEventListener("click", (event) => {
        if (event.target === event.currentTarget)
            cancel();
    });
    modalRoot.querySelector("#discard-window-close")?.addEventListener("click", () => {
        void respond("discard-settings");
    });
    modalRoot.querySelector("#finish-window-close")?.addEventListener("click", () => {
        void respond("finish-tasks");
    });
    modalRoot.querySelector("#force-window-close")?.addEventListener("click", () => {
        void respond("force-exit");
    });
    const dialog = modalRoot.querySelector(".close-dialog");
    if (dialog)
        bindModalFocus(dialog, cancel, "#cancel-window-close");
}
function bindShell() {
    rendererApp.addPageCleanup(mountShellController({
        getPage: () => page,
        settingsHaveUnsavedChanges,
        rememberModalFocus,
        requestDiscardSettings: (nextPage) => {
            ui.pendingConfirmation = { kind: "discard-settings", nextPage };
            ui.confirmationBusy = false;
            renderOverlay();
        },
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
function scheduleDraftSave() {
    window.clearTimeout(draftSaveTimer);
    draftSaveTimer = window.setTimeout(async () => {
        const revision = draftRevision;
        const draftToSave = state.draft;
        draftSaveInFlight += 1;
        try {
            const savedState = await window.studio.saveDraft(draftToSave, {
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
            if (revision === draftRevision)
                draftDirty = false;
        }
        finally {
            draftSaveInFlight -= 1;
        }
    }, 350);
}
function scheduleImageDraftSave() {
    window.clearTimeout(imageDraftSaveTimer);
    imageDraftSaveTimer = window.setTimeout(async () => {
        const revision = imageDraftRevision;
        const draftToSave = state.imageDraft;
        imageDraftSaveInFlight += 1;
        try {
            const savedState = await window.studio.saveImageDraft(draftToSave);
            if (revision === imageDraftRevision) {
                setRendererState({
                    ...preserveLocalCreationDrafts(savedState, state),
                    imageDraft: draftToSave
                });
                imageDraftDirty = false;
            }
        }
        catch (error) {
            showMessage(error instanceof Error ? error.message : uiText(uiKeys.runtime.imageDraftSaveFailed), { kind: "error" });
        }
        finally {
            imageDraftSaveInFlight -= 1;
        }
    }, 350);
}
async function saveDraftImmediately(draft) {
    window.clearTimeout(draftSaveTimer);
    draftRevision += 1;
    const revision = draftRevision;
    draftDirty = false;
    activateCreationDraft(state, draft);
    draftSaveInFlight += 1;
    try {
        const savedState = await window.studio.saveDraft(state.draft, {
            imageToVideoDraft: state.imageToVideoDraft,
            videoExtensionDraft: state.videoExtensionDraft
        });
        setRendererState(preserveLocalCreationDrafts(savedState, state));
        if (revision === draftRevision)
            draftDirty = false;
    }
    finally {
        draftSaveInFlight -= 1;
    }
}
function patchDraft(patch) {
    activateCreationDraft(state, { ...state.draft, ...patch });
    draftRevision += 1;
    draftDirty = true;
    scheduleDraftSave();
}
function patchDraftForMode(mode, update) {
    const inputMode = mode === "video-extension" ? "video" : "image";
    const nextDraft = patchCreationDraftForMode(state, inputMode, update, creationMode === mode);
    if (!nextDraft)
        return;
    draftRevision += 1;
    draftDirty = true;
    scheduleDraftSave();
}
function patchImageDraft(patch) {
    state.imageDraft = normalizeImageEditDraft({ ...state.imageDraft, ...patch });
    imageDraftRevision += 1;
    imageDraftDirty = true;
    scheduleImageDraftSave();
}
async function loadImageEditPreviews() {
    const pictures = state.imageDraft.pictures;
    let dimensionsChanged = false;
    await Promise.all(pictures.map(async (picture) => {
        const image = document.querySelector(`[data-image-picture-preview="${CSS.escape(picture.id)}"]`);
        if (!image || !picture.absolutePath)
            return;
        const previewPath = picture.markup?.renderedPath || imageReferenceInputPath(picture);
        const dataUrl = await window.studio.readImage(previewPath).catch(() => null);
        if (!dataUrl || !image.isConnected)
            return;
        await new Promise((resolve) => {
            image.addEventListener("load", () => {
                if (image.naturalWidth && image.naturalHeight) {
                    const preview = image.closest(".image-picture-preview");
                    preview?.style.setProperty("--picture-ratio", `${image.naturalWidth} / ${image.naturalHeight}`);
                    const current = state.imageDraft.pictures.find((item) => item.id === picture.id);
                    if (current && (current.width !== image.naturalWidth || current.height !== image.naturalHeight)) {
                        const nextPictures = state.imageDraft.pictures.map((item) => item.id === picture.id
                            ? { ...item, width: image.naturalWidth, height: image.naturalHeight }
                            : item);
                        const basePicture = nextPictures[0];
                        patchImageDraft({
                            pictures: nextPictures,
                            targetResolution: normalizeImageTargetResolution(state.imageDraft.targetResolution, basePicture?.width ?? 0, basePicture?.height ?? 0)
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
    if (dimensionsChanged && page === "create" && creationMode === "image-edit")
        render();
}
function randomSeedValue() {
    const values = new Uint32Array(2);
    crypto.getRandomValues(values);
    const high = (values[0] ?? 0) & 0x001fffff;
    return high * 0x100000000 + (values[1] ?? 0);
}
function sameImageCrop(left, right) {
    if (!left || !right)
        return !left && !right;
    return left.x === right.x && left.y === right.y &&
        left.width === right.width && left.height === right.height &&
        left.sourceWidth === right.sourceWidth && left.sourceHeight === right.sourceHeight;
}
async function editImagePictureMarkup(pictureId, requestedMode = "annotation") {
    const picture = state.imageDraft.pictures.find((item) => item.id === pictureId);
    if (!picture?.absolutePath)
        return;
    const maskMode = requestedMode === "mask" ||
        (requestedMode === "annotation" && imageModelCapabilityFor(state.imageDraft.modelId).requiresMask === true);
    try {
        const { openImageMarkupEditor } = await import("./image-markup-editor");
        const [sourceDataUrl, existingDocument] = await Promise.all([
            window.studio.readImage(picture.absolutePath),
            (maskMode ? picture.mask?.documentPath : picture.markup?.documentPath)
                ? window.studio.readImageMarkup((maskMode ? picture.mask?.documentPath : picture.markup?.documentPath))
                : Promise.resolve(null)
        ]);
        if (!sourceDataUrl)
            throw new Error(uiText(uiKeys.runtime.readOriginalImageFailed));
        const result = await openImageMarkupEditor({
            pictureNumber: picture.pictureNumber,
            filename: picture.absolutePath,
            sourceDataUrl,
            existingDocument,
            existingCrop: picture.crop,
            mode: maskMode ? "mask" : "annotation"
        });
        if (!result)
            return;
        const cropChanged = !sameImageCrop(picture.crop, result.crop);
        let crop = picture.crop;
        if (cropChanged) {
            crop = result.crop
                ? (await window.studio.saveImageCrop({
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
                pictures: state.imageDraft.pictures.map((item) => item.id === pictureId ? { ...item, crop, width, height, mask } : item)
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
            pictures: state.imageDraft.pictures.map((item) => item.id === pictureId ? { ...item, crop, width, height, markup } : item)
        });
        render();
        void loadImageEditPreviews();
        showMessage(markup ? uiText(uiKeys.runtime.markupSaved, { count: markup.objectCount }) : uiText(uiKeys.runtime.markupCleared), true);
    }
    catch (error) {
        showMessage(error instanceof Error ? error.message : uiText(uiKeys.runtime.markupSaveFailed), { kind: "error" });
    }
}
function addImageSlot() {
    const pictures = state.imageDraft.pictures;
    const capability = imageModelCapabilityFor(state.imageDraft.modelId);
    if (pictures.length >= capability.maxPictures) {
        showMessage(uiText(uiKeys.runtime.maxPictureSlots, { name: capability.name, count: capability.maxPictures }), { kind: "warning" });
        return;
    }
    const pictureNumber = nextImagePictureNumber(state.imageDraft);
    const slot = {
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
function addImagePicture(path, replacePictureId) {
    if (!path)
        return;
    const pictures = state.imageDraft.pictures;
    const targetPicture = replacePictureId
        ? pictures.find((picture) => picture.id === replacePictureId)
        : pictures.find((picture) => !picture.absolutePath);
    if (targetPicture) {
        patchImageDraft({
            pictures: pictures.map((picture) => picture.id === targetPicture.id
                ? { ...picture, absolutePath: path, width: 0, height: 0, crop: undefined, markup: undefined, mask: undefined }
                : picture)
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
    const picture = {
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
function updateH3ReferenceSlot(slotId, patch) {
    patchDraft({
        h3ReferenceSlots: state.draft.h3ReferenceSlots.map((slot) => slot.id === slotId ? { ...slot, ...patch } : slot)
    });
}
function bindH3ReferenceSlots() {
    rendererApp.addPageCleanup(mountH3ReferencesController(rendererApp.context, {
        getDraft: () => state?.draft,
        patchDraft,
        requestRender: render,
        notify: (message) => showMessage(message, false),
        lockedFirstVideo: Boolean(state?.draft.inputMode === "video" && isMiniMaxH3R2vModel(state.draft.modelId))
    }));
}
async function selectDraftVideo(filename, source, renderAfterSave = true) {
    const preserveMotionContextDraft = state.draft.inputMode === "video" &&
        isMiniMaxH3R2vModel(state.draft.modelId);
    const draft = {
        ...state.draft,
        inputMode: "video",
        startImagePath: "",
        endImagePath: "",
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
            ? ensureMotionContextSourceSlot(preserveMotionContextDraft ? state.draft.h3ReferenceSlots : [], filename)
            : [],
        ...(source?.resolution != null
            ? {
                resolution: nearestSupportedVideoResolution(source.resolution, modelCatalog.get(state.draft.modelId)?.definition.capabilities?.resolutions ??
                    modelCatalog.get(state.settings.defaultExtensionModel)?.definition.capabilities?.resolutions ??
                    [360, 480, 540, 720, 768], state.draft.resolution)
            }
            : {}),
        ...(source?.resetSeed ? { seed: null } : {})
    };
    await saveDraftImmediately(draft);
    if (renderAfterSave)
        render();
}
function setEnqueueBusyUi(busy) {
    const button = document.querySelector(creationMode === "image-edit" ? "#enqueue-image-edit" : "#enqueue");
    if (!button)
        return;
    button.disabled = busy;
    button.classList.toggle("busy", busy);
    button.setAttribute("aria-busy", String(busy));
    const buttonIcon = button.querySelector(".enqueue-spinner");
    if (buttonIcon) {
        buttonIcon.outerHTML = icon(busy ? "refresh-cw" : "plus", "enqueue-spinner");
        renderIcons(button);
    }
    const label = button.querySelector("[data-enqueue-label]");
    if (label)
        label.textContent = busy ? uiText(uiKeys.runtime.enqueueing) : uiText(uiKeys.runtime.enqueue);
}
function syncVideoEnqueueUi() {
    const button = document.querySelector("#enqueue");
    if (!button)
        return;
    const reason = buildVideoCreatePageViewModel(createViewModelDependencies()).enqueueBlockReason;
    button.dataset.enqueueBlockReason = reason;
    button.disabled = Boolean(reason) || ui.enqueueBusy;
    button.title = reason || button.dataset.enqueueReadyTitle || uiText(uiKeys.runtime.enqueue);
    const feedback = document.querySelector("[data-enqueue-feedback]");
    if (feedback) {
        feedback.hidden = !reason;
        const message = feedback.querySelector("span");
        if (message)
            message.textContent = reason;
    }
}
function syncPromptEnqueueUi(_promptText) {
    syncVideoEnqueueUi();
}
function syncImageEditEnqueueUi() {
    const draft = state.imageDraft;
    const imageProfile = environmentScan?.modelProfiles.find((profile) => profile.id === draft.modelId);
    const reason = imageEditEnqueueBlockReason(draft, imageProfile, uiText);
    const imageCapability = imageModelCapabilityFor(draft.modelId);
    const button = document.querySelector("#enqueue-image-edit");
    if (button) {
        button.disabled = Boolean(reason) || ui.enqueueBusy;
        button.title = reason || uiText(uiKeys.runtime.imageEnqueue);
        button.dataset.enqueueBlockReason = reason;
    }
    const feedback = document.querySelector("[data-enqueue-feedback]");
    if (feedback) {
        feedback.hidden = !reason;
        const message = feedback.querySelector("span");
        if (message)
            message.textContent = reason;
    }
    const summaryTitle = document.querySelector(".image-edit-composer .interpolation-summary strong");
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
function bindCreate() {
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
            isPromptEnhancing: () => promptOperationBelongsTo(promptRuntime, "image-edit"),
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
            setEnqueueBusyUi,
            requestClearDraftConfirmation: () => {
                rememberModalFocus();
                ui.pendingConfirmation = { kind: "clear-draft", mode: "image-edit" };
                ui.confirmationBusy = false;
                renderOverlay();
            }
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
            isPromptEnhancing: () => promptOperationBelongsTo(promptRuntime, creationMode),
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
            ui.pendingConfirmation = {
                kind: "clear-draft",
                mode: creationMode
            };
            ui.confirmationBusy = false;
            renderOverlay();
        }
    }));
    if (creationMode === "image-edit") {
        void loadImageEditPreviews();
    }
    else {
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
function bindUpscaleDialog() {
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
function bindHistory(playback = null) {
    rendererApp.addPageCleanup(mountHistoryAssembly({
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
                if (!ui.selectedHistoryAssetId)
                    return;
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
                if (project && version)
                    await historyActions.continueImageEdit(project, version);
            },
            continueImageToVideo: async (projectId, versionId) => {
                const project = state.imageHistory.find((item) => item.id === projectId);
                const version = project?.versions.find((item) => item.id === versionId);
                if (project && version)
                    await historyActions.continueImageToVideo(project, version);
            },
            updateHistoryMetadata: (assetId, patch) => window.studio.updateHistoryMetadata(assetId, patch)
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
            updateHistoryMetadata: (assetId, patch) => window.studio.updateHistoryMetadata(assetId, patch)
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
        openImageHistoryContextMenu: historyContextMenus.openImageHistory
    }));
}
function formSettings() {
    return readSettingsFromForm(settingsDraft ?? state.settings, settingsH3PromptPreset, settingsImagePromptPreset);
}
async function runEnvironmentScan(settings, reason = "manual") {
    return environmentRefreshCoordinator.refresh(settings, reason);
}
async function requestSaveSettings(settings) {
    settingsSaving = true;
    render();
    try {
        return await settingsSaveCoordinator.requestSave(settings);
    }
    finally {
        settingsSaving = false;
        render();
    }
}
const settingsSaveCoordinator = new SettingsSaveCoordinator({
    getState: () => state,
    getEnvironmentScan: () => environmentScan,
    loadLocale: async (locale) => {
        await loadUiLocale(locale);
    },
    saveSettings: (settings, mode) => window.studio.saveSettings(settings, mode),
    saveImageDraft: (draft) => window.studio.saveImageDraft(draft),
    saveDraft: (draft) => window.studio.saveDraft(draft),
    getBundledWorkflow: (modelId, inputMode) => window.studio.getBundledWorkflow(modelId, inputMode),
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
    requestDirectoryMigration: (previousSettings, nextSettings, oldDirectory, newDirectory) => {
        rememberModalFocus();
        ui.pendingDirectoryMigration = {
            target: "video",
            previousSettings,
            nextSettings,
            oldDirectory,
            newDirectory
        };
        ui.directoryMigrationBusy = false;
        ui.historyMigrationProgress = null;
        renderOverlay();
    },
    notifySaved: (proxyChanged, mode) => {
        showMessage(proxyChanged
            ? uiText(uiKeys.runtime.settingsProxySaved)
            : mode === "migrate-video-history"
                ? uiText(uiKeys.runtime.settingsMigrationSaved)
                : uiText(uiKeys.runtime.settingsNextTaskSaved));
    },
    requestRender: render
});
async function loadAppLogs() {
    if (appLogsLoading)
        return;
    appLogScreenClearedAt = null;
    appLogsLoading = true;
    appLogsError = "";
    render();
    try {
        applyAppLogSnapshot(await window.studio.readAppLogs(2000));
    }
    catch (error) {
        appLogsError = error instanceof Error ? error.message : String(error);
    }
    finally {
        appLogsLoading = false;
        render();
    }
}
function bindSettings() {
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
            setCoreDependencyRepairing: (value) => {
                coreDependencyRepairing = value;
            },
            setEnvironmentRepairing: (issueId) => {
                environmentRepairing = issueId;
            },
            setEnvironmentRepairLog: (issueId, log) => {
                environmentRepairLogs = { ...environmentRepairLogs, [issueId]: log };
            },
            enqueueCustomNodeInstall: (nodeId, settings) => customNodeInstallManager.enqueue(nodeId, settings),
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
                renderOverlay();
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
            requestSaveSettings,
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
                renderOverlay();
                void scanImageAssets();
            },
            rememberModalFocus,
            requestOverlayRender: renderOverlay
        }
    }));
}
registerRendererEvents({
    studio: window.studio,
    t: rendererApp.context.t,
    getState: () => state,
    getComfyRuntimeState: () => comfyRuntime,
    getEnvironmentScanning: () => environmentScanning,
    setComfyRuntimeState: (runtime) => {
        comfyRuntime = runtime;
    },
    setPromptRuntimeState: (runtime) => {
        promptRuntime = runtime;
        promptRuntimeLoaded = runtime.model.phase === "resident";
        promptStarting = promptModelStartupIsActive(runtime, promptStartRequestPending);
        promptReleasing = runtime.model.phase === "unloading";
        promptEnhancing = promptOperationIsActive(runtime);
    },
    getPromptRuntimeState: () => promptRuntime,
    getCreationMode: () => creationMode,
    setState: setRendererState,
    getPage: () => page,
    getHistoryKind: () => historyKind,
    getDraftDirty: () => draftDirty,
    getDraftSaveInFlight: () => draftSaveInFlight,
    setPromptRuntimeLoaded: (value) => {
        promptRuntimeLoaded = value;
    },
    setPromptProgress: (progress) => {
        promptProgress = progress;
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
            : progress.kind === "workflow"
                ? workflowDependencyLogs[progress.id] ?? ""
                : llamaCppPythonLog;
        const next = [current, progress.message]
            .filter(Boolean)
            .join("\n")
            .slice(-60_000);
        if (progress.kind === "custom-node") {
            customNodeLogs = { ...customNodeLogs, [progress.id]: next };
        }
        else if (progress.kind === "workflow") {
            workflowDependencyLogs = { ...workflowDependencyLogs, [progress.id]: next };
        }
        else {
            llamaCppPythonLog = next;
        }
        return next;
    },
    notify: showMessage,
    requestRender: render,
    requestOverlayRender: renderOverlay
});
bootstrapRenderer({
    studio: window.studio,
    setState: setRendererState,
    setComfyRuntimeState: (runtime) => {
        comfyRuntime = runtime;
    },
    setPromptRuntimeState: (runtime) => {
        promptRuntime = runtime;
        promptRuntimeLoaded = runtime.model.phase === "resident";
        promptStarting = promptModelStartupIsActive(runtime, promptStartRequestPending);
        promptReleasing = runtime.model.phase === "unloading";
        promptEnhancing = promptOperationIsActive(runtime);
    },
    getState: () => state,
    setAppVersion: (version) => {
        ui.appVersion = version;
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
