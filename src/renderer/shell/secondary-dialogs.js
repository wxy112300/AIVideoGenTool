import { uiKeys } from "../../core/i18n-keys";
import { createAetherScaleUpscaleFilename, createDlss5UpscaleFilename, h3NativeUpscaleDimensions } from "../../core/upscale";
import { DLSS5_MODEL_ID, DLSS5_SCALE_VALUES, dlss5OutputDimensions, isDlss5Quality, isDlss5Scale } from "../../core/dlss5";
import { AETHERSCALE_DEFAULT_MODE, AETHERSCALE_DEFAULT_STYLE_PROFILE, AETHERSCALE_MODEL_ID, AETHERSCALE_MODE_SPECS, aetherScaleOutputGeometry, isAetherScaleMode, isAetherScaleStyleProfile } from "../../core/aetherscale";
function directoryMigrationProgressValue(progress) {
    const phaseRanges = {
        scanning: [0, 10],
        moving: [10, 65],
        verifying: [65, 82],
        committing: [82, 88],
        cleaning: [88, 100],
        completed: [100, 100]
    };
    const [phaseStart, phaseEnd] = progress
        ? phaseRanges[progress.phase]
        : [0, 0];
    const phaseRatio = progress?.total
        ? Math.max(0, Math.min(1, progress.current / progress.total))
        : progress?.phase === "completed"
            ? 1
            : 0;
    return phaseStart + (phaseEnd - phaseStart) * phaseRatio;
}
export function imageAssetProgressPercent(progress, busy) {
    if (!progress)
        return busy ? 5 : 100;
    if (progress.phase === "completed")
        return 100;
    const ranges = {
        scanning: [5, 20],
        archiving: [20, 72],
        verifying: [72, 86],
        committing: [86, 96],
        cleaning: [20, 92],
        completed: [100, 100]
    };
    const [start, end] = ranges[progress.phase];
    const ratio = progress.total
        ? Math.max(0, Math.min(1, progress.current / progress.total))
        : 0;
    return Math.round(start + (end - start) * ratio);
}
export function imageAssetPhaseLabel(phase, t) {
    return {
        scanning: t(uiKeys.assetLibrary.phaseScanning),
        archiving: t(uiKeys.assetLibrary.phaseArchiving),
        verifying: t(uiKeys.assetLibrary.phaseVerifying),
        committing: t(uiKeys.assetLibrary.phaseCommitting),
        cleaning: t(uiKeys.assetLibrary.phaseCleaning),
        completed: t(uiKeys.assetLibrary.phaseCompleted)
    }[phase ?? "scanning"];
}
export function imageAssetResultSummary(result, action, formatAssetBytes, t) {
    const missing = result.scan.missingReferences.length;
    if (action === "cleanup") {
        return {
            tone: "success",
            title: t(uiKeys.assetLibrary.cleanupDoneTitle),
            detail: t(uiKeys.assetLibrary.cleanupDoneDetail, { files: result.cleanedFiles, directories: result.cleanedDirectories, bytes: formatAssetBytes(result.cleanedBytes) }),
            operationId: result.operationId
        };
    }
    return {
        tone: missing ? "warning" : "success",
        title: missing ? t(uiKeys.assetLibrary.organizeMissingTitle) : t(uiKeys.assetLibrary.organizeDoneTitle),
        detail: `${t(uiKeys.assetLibrary.organizeDoneDetail, { archived: result.archivedFiles, reorganized: result.reorganizedFiles, references: result.updatedReferences })}${missing ? ` ${t(uiKeys.assetLibrary.organizeMissingDetail, { missing })}` : ` ${t(uiKeys.assetLibrary.organizeNoMissing)}`}`,
        operationId: result.operationId
    };
}
function findUpscaleAssetVersion(history, dialog) {
    const asset = history.find((item) => item.id === dialog.assetId);
    const version = asset?.versions.find((item) => item.id === dialog.versionId);
    return asset && version ? { asset, version } : null;
}
function dlss5UiStatus(environment, t) {
    if (!environment) {
        return { tone: "warning", available: true, message: t(uiKeys.upscale.dlss5Pending) };
    }
    const profile = environment.modelProfiles?.find((item) => item.id === DLSS5_MODEL_ID);
    const customNodes = Array.isArray(environment.customNodes) ? environment.customNodes : undefined;
    const node = customNodes?.find((item) => item.id === "comfyui-dlss5");
    const runtime = environment.dlss5Runtime;
    const depth = environment.depthAnything;
    const remoteRuntime = runtime?.state === "remote";
    const nvidia = environment.items?.find((item) => item.id === "nvidia");
    if (nvidia && nvidia.ok === false && nvidia.status === "missing") {
        return { tone: "missing", available: false, message: t(uiKeys.upscale.dlss5GpuMissing) };
    }
    if (profile?.missingCustomNodeIds?.includes("comfyui-dlss5") ||
        (customNodes && !node) ||
        (node && !remoteRuntime && !node.installed)) {
        return { tone: "missing", available: false, message: t(uiKeys.upscale.dlss5NodeMissing) };
    }
    if (node?.loadError ||
        node?.runtimeRepairable ||
        node?.runtimeMissingNodeTypes?.length ||
        node?.compatibilityState === "error" ||
        profile?.customNodeCompatibility === "error" ||
        (node?.runtimeVerified && !node.loaded)) {
        return { tone: "missing", available: false, message: t(uiKeys.upscale.dlss5NodeMissing) };
    }
    if (profile?.runtimeMissingNodes?.length) {
        return { tone: "missing", available: false, message: t(uiKeys.upscale.dlss5SchemaMissing) };
    }
    if (runtime &&
        (runtime.state === "missing" ||
            runtime.state === "invalid" ||
            (runtime.state === "ready" && !runtime.srReady) ||
            (remoteRuntime && runtime.runtimeValidated && !runtime.srReady))) {
        return { tone: "missing", available: false, message: t(uiKeys.upscale.dlss5RuntimeMissing) };
    }
    if (profile?.runtimeVerified === true && profile.runtimeReady === false) {
        return { tone: "missing", available: false, message: t(uiKeys.upscale.dlss5RuntimeMissing) };
    }
    if (depth && !depth.available) {
        return { tone: "missing", available: false, message: t(uiKeys.upscale.dlss5GuideMissing) };
    }
    if (profile?.available === false) {
        return { tone: "missing", available: false, message: t(uiKeys.upscale.dlss5SchemaMissing) };
    }
    if (profile?.customNodeCompatibility === "warning" ||
        node?.compatibilityState === "warning" ||
        profile?.runtimeVerified === false ||
        runtime?.state === "offline" ||
        runtime?.state === "unknown" ||
        (depth && !depth.runtimeVerified) ||
        (runtime && !runtime.runtimeValidated)) {
        return { tone: "warning", available: true, message: t(uiKeys.upscale.dlss5Pending) };
    }
    return { tone: "available", available: true, message: t(uiKeys.upscale.dlss5Ready) };
}
function aetherScaleUiStatus(environment, t) {
    if (!environment) {
        return {
            tone: "warning",
            available: true,
            smokeValidated: false,
            message: t(uiKeys.upscale.aetherscalePending)
        };
    }
    const provider = environment.dlss5Providers?.["aetherscale-carrier"];
    const profile = environment.modelProfiles?.find((item) => item.id === AETHERSCALE_MODEL_ID);
    const node = environment.customNodes?.find((item) => item.id === "comfyui-aetherscale");
    const runtime = environment.aetherScaleRuntime;
    const nvidia = environment.items?.find((item) => item.id === "nvidia");
    const smokeValidated = Boolean(provider?.smokeValidated || runtime?.smokeValidated);
    if (nvidia && nvidia.ok === false && nvidia.status === "missing") {
        return { tone: "missing", available: false, smokeValidated, message: t(uiKeys.upscale.aetherscaleGpuMissing) };
    }
    if (profile?.missingCustomNodeIds?.includes("comfyui-aetherscale") ||
        (environment.customNodes && !node) ||
        (node && !node.installed)) {
        return { tone: "missing", available: false, smokeValidated, message: t(uiKeys.upscale.aetherscaleNodeMissing) };
    }
    if (node?.loadError || node?.runtimeRepairable || node?.runtimeMissingNodeTypes?.length ||
        node?.compatibilityState === "error" || profile?.customNodeCompatibility === "error") {
        return { tone: "missing", available: false, smokeValidated, message: t(uiKeys.upscale.aetherscaleNodeMissing) };
    }
    if (profile?.runtimeMissingNodes?.length || provider?.schemaValidated === false) {
        return { tone: "missing", available: false, smokeValidated, message: t(uiKeys.upscale.aetherscaleSchemaMissing) };
    }
    if (runtime && (runtime.state === "missing" || runtime.state === "invalid" || !runtime.carrierReady)) {
        return { tone: "missing", available: false, smokeValidated, message: t(uiKeys.upscale.aetherscaleRuntimeMissing) };
    }
    if (provider && !provider.availableForQueue) {
        return {
            tone: "missing",
            available: false,
            smokeValidated,
            message: provider.blockedReason
                ? `${t(uiKeys.upscale.aetherscaleRuntimeMissing)} · ${provider.blockedReason}`
                : t(uiKeys.upscale.aetherscaleRuntimeMissing)
        };
    }
    if (profile?.available === false) {
        return { tone: "missing", available: false, smokeValidated, message: t(uiKeys.upscale.aetherscaleSchemaMissing) };
    }
    if (profile?.customNodeCompatibility === "warning" || node?.compatibilityState === "warning" ||
        profile?.runtimeVerified === false || runtime?.state === "offline" || runtime?.state === "unknown" ||
        provider?.schemaValidated === false || (provider && !provider.runtimeValidated)) {
        return { tone: "warning", available: true, smokeValidated, message: t(uiKeys.upscale.aetherscalePending) };
    }
    return { tone: "available", available: true, smokeValidated, message: t(uiKeys.upscale.aetherscaleReady) };
}

function estimateUpscaleDiskBytes(version, targetWidth, targetHeight) {
    const sourceFile = version.files.find((file) => /\.(mp4|webm|mov|m4v|mkv)$/i.test(file.filename) &&
        typeof file.sizeBytes === "number" &&
        Number.isFinite(file.sizeBytes) &&
        file.sizeBytes > 0);
    if (!sourceFile?.sizeBytes)
        return null;
    const sourcePixels = Math.max(1, version.width * version.height);
    const targetPixels = Math.max(1, targetWidth * targetHeight);
    return Math.max(sourceFile.sizeBytes, Math.ceil(sourceFile.sizeBytes * targetPixels / sourcePixels));
}
export function renderDirectoryMigrationDialog(options) {
    const request = options.request;
    if (!request)
        return "";
    const progressValue = directoryMigrationProgressValue(options.progress);
    const t = options.t;
    return `
    <div class="dialog-backdrop confirm-backdrop" id="directory-migration-backdrop">
      <section class="confirm-dialog directory-migration-dialog" role="alertdialog" aria-modal="true" aria-labelledby="directory-migration-title" aria-describedby="directory-migration-description" tabindex="-1">
        <div class="confirm-icon" aria-hidden="true">${options.icon(options.busy ? "refresh-cw" : "folder-open")}</div>
        <div class="confirm-copy">
          <span class="eyebrow">${options.busy ? t(uiKeys.migration.processingDirectory) : t(uiKeys.migration.outputChanged)}</span>
          <h2 id="directory-migration-title">${t(uiKeys.migration.applyTitle)}</h2>
          <p id="directory-migration-description">${options.busy ? options.escapeHtml(options.progress?.message || t(uiKeys.migration.preparing)) : t(uiKeys.migration.chooseExisting)}</p>
          <div class="confirm-warning"><strong>${t(uiKeys.migration.currentDirectory)}</strong><code>${options.escapeHtml(request.oldDirectory || t(uiKeys.migration.autoDirectory))}</code><strong>${t(uiKeys.migration.newDirectory)}</strong><code>${options.escapeHtml(request.newDirectory)}</code></div>
          ${options.busy
        ? `<div class="progress" role="progressbar" aria-label="${t(uiKeys.migration.progressLabel)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progressValue)}"><span style="width:${progressValue}%"></span></div><p class="muted">${options.progress ? `${t(uiKeys.migration.fileCount, { current: options.progress.current, total: options.progress.total })}${options.progress.warningCount ? ` · ${t(uiKeys.migration.warningCount, { count: options.progress.warningCount })}` : ""}` : t(uiKeys.migration.preparing)}</p>`
        : `<p class="muted">${t(uiKeys.migration.applyInfo)}</p>`}
        </div>
        <div class="dialog-actions">
          <button class="secondary button-with-icon" id="directory-apply" ${options.busy ? "disabled" : ""}>${options.icon("check")}${t(uiKeys.migration.apply)}</button>
          <button class="primary button-with-icon" id="directory-apply-migrate" ${options.busy ? "disabled" : ""}>${options.icon("folder-open")}${t(uiKeys.migration.applyAndMigrate)}</button>
          <button class="ghost button-with-icon" id="directory-cancel" ${options.busy ? "disabled" : ""}>${options.icon("x")}${t(uiKeys.migration.cancel)}</button>
        </div>
      </section>
    </div>`;
}
export function renderImageAssetLibraryDialog(options) {
    const dialog = options.dialog;
    if (!dialog)
        return "";
    const scan = dialog.scan;
    const progress = options.progress;
    const progressValue = imageAssetProgressPercent(progress, dialog.busy);
    const t = options.t;
    const orphanPreview = scan?.orphanFiles.slice(0, 12).map((file) => `
    <label class="asset-library-file">
      <input type="checkbox" data-orphan-path="${options.escapeHtml(file.absolutePath)}" ${dialog.selectedPaths.includes(file.absolutePath) ? "checked" : ""}>
      <span><strong title="${options.escapeHtml(file.relativePath)}">${options.escapeHtml(file.relativePath)}</strong><small>${options.formatAssetBytes(file.size)}</small></span>
    </label>`).join("") ?? "";
    return `
    <div class="dialog-backdrop confirm-backdrop" id="image-asset-library-backdrop">
      <section class="confirm-dialog image-asset-library-dialog" role="dialog" aria-modal="true" aria-labelledby="image-asset-library-title" tabindex="-1">
        <div class="confirm-copy">
          <span class="eyebrow">${t(uiKeys.assetLibrary.eyebrow)}</span>
          <h2 id="image-asset-library-title">${t(uiKeys.assetLibrary.title)}</h2>
          <p id="image-assets-progress-message">${dialog.busy ? options.escapeHtml(progress?.message || t(uiKeys.assetLibrary.busyMessage)) : t(uiKeys.assetLibrary.idleMessage)}</p>
          ${scan ? `<code class="asset-library-path">${options.escapeHtml(scan.libraryDirectory)}</code>` : ""}
          ${dialog.busy ? `<div class="progress" id="image-assets-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progressValue}"><span style="width:${progressValue}%"></span></div>` : ""}
          ${dialog.busy ? `<div class="asset-library-progress-meta"><span id="image-assets-progress-phase">${imageAssetPhaseLabel(progress?.phase, t)}</span><span id="image-assets-progress-count">${progress?.total ? `${progress.current} / ${progress.total}` : t(uiKeys.assetLibrary.preparing)}</span></div>` : ""}
          ${dialog.error ? `<div class="confirm-warning danger-hint">${options.escapeHtml(dialog.error)}</div>` : ""}
          ${dialog.lastResult ? `<div class="asset-library-result ${dialog.lastResult.tone}" role="status"><span class="asset-library-result-icon">${options.icon(dialog.lastResult.tone === "success" ? "circle-check" : "alert-triangle")}</span><div><strong>${options.escapeHtml(dialog.lastResult.title)}</strong><p>${options.escapeHtml(dialog.lastResult.detail)}</p>${dialog.lastResult.operationId ? `<small>${t(uiKeys.assetLibrary.operationNumber, { id: options.escapeHtml(dialog.lastResult.operationId) })} · ${t(uiKeys.assetLibrary.logSearch)}</small>` : ""}</div></div>` : ""}
          ${scan ? `<div class="asset-library-summary">
            <article><span>${t(uiKeys.assetLibrary.references)}</span><strong>${scan.totalReferences}</strong></article>
            <article><span>${t(uiKeys.assetLibrary.pendingArchive)}</span><strong>${scan.archiveCandidates}</strong><small>${options.formatAssetBytes(scan.archiveBytes)}</small></article>
            <article class="${scan.missingReferences.length ? "warning" : ""}"><span>${t(uiKeys.assetLibrary.missing)}</span><strong>${scan.missingReferences.length}</strong></article>
            <article><span>${t(uiKeys.assetLibrary.cleanable)}</span><strong>${scan.orphanFiles.length}</strong><small>${options.formatAssetBytes(scan.orphanBytes)}</small></article>
          </div>
          ${scan.missingReferences.length ? `<details class="asset-library-details"><summary>${t(uiKeys.assetLibrary.missingReferences, { count: scan.missingReferences.length })}</summary>${scan.missingReferences.slice(0, 20).map((item) => `<code>${options.escapeHtml(item)}</code>`).join("")}</details>` : ""}
          ${scan.orphanFiles.length ? `<details class="asset-library-orphans" ${dialog.confirmCleanup ? "open" : ""}><summary><span><strong>${t(uiKeys.assetLibrary.orphanTitle)}</strong><small>${t(uiKeys.assetLibrary.count, { count: scan.orphanFiles.length })} · ${options.formatAssetBytes(scan.orphanBytes)}</small></span><span class="asset-library-summary-action">${t(uiKeys.assetLibrary.expandSelect)}</span></summary><div class="asset-library-file-list">${orphanPreview}${scan.orphanFiles.length > 12 ? `<p class="muted">${t(uiKeys.assetLibrary.moreFiles, { count: scan.orphanFiles.length - 12 })}</p>` : ""}</div></details>` : `<p class="asset-library-clean">${t(uiKeys.assetLibrary.noCleanable)}</p>`}
          ${dialog.confirmCleanup ? `<div class="confirm-warning"><strong>${t(uiKeys.assetLibrary.confirmDelete)}</strong><span>${t(uiKeys.assetLibrary.confirmDeleteDescription)}</span></div>` : ""}` : ""}
        </div>
        <div class="dialog-actions">
          <button class="secondary button-with-icon" id="image-assets-rescan" ${dialog.busy ? "disabled" : ""}>${options.icon("scan-search")}${t(uiKeys.assetLibrary.rescan)}</button>
          <button class="primary button-with-icon" id="image-assets-organize" ${dialog.busy || !scan?.archiveCandidates ? "disabled" : ""}>${options.icon("folder-open")}${t(uiKeys.assetLibrary.organize)}</button>
          ${scan?.orphanFiles.length ? `<button class="secondary destructive button-with-icon" id="image-assets-cleanup" ${dialog.busy ? "disabled" : ""}>${options.icon("trash-2")}${dialog.confirmCleanup ? t(uiKeys.assetLibrary.cleanupConfirm) : t(uiKeys.assetLibrary.cleanupSelected)}</button>` : ""}
          <button class="ghost button-with-icon" id="image-assets-close" ${dialog.busy ? "disabled" : ""}>${options.icon("x")}${t(uiKeys.assetLibrary.close)}</button>
        </div>
      </section>
    </div>`;
}
export function renderUpscaleDialog(options) {
    const dialog = options.dialog;
    if (!dialog)
        return "";
    const resolved = findUpscaleAssetVersion(options.history, dialog);
    if (!resolved)
        return "";
    const { asset, version } = resolved;
    const busy = Boolean(dialog.busy);
    const isDlss5Selected = dialog.modelId === DLSS5_MODEL_ID;
    const isAetherScaleSelected = dialog.modelId === AETHERSCALE_MODEL_ID;
    const h3Selected = dialog.modelId === "minimax_h3_latent_upscaler";
    const h3Artifact = version.h3ContinuationData?.status === "available"
        ? version.h3ContinuationData.artifact
        : undefined;
    const h3Available = Boolean(h3Artifact);
    const legacyTargetHeight = dialog.targetHeight ?? 720;
    const selectedScale = isDlss5Scale(dialog.targetScale) ? dialog.targetScale : 2;
    const selectedQuality = isDlss5Quality(dialog.dlss5Quality)
        ? dialog.dlss5Quality
        : "quality";
    const selectedAetherStyle = isAetherScaleStyleProfile(dialog.aetherStyleProfile)
        ? dialog.aetherStyleProfile
        : AETHERSCALE_DEFAULT_STYLE_PROFILE;
    const aetherStatus = aetherScaleUiStatus(options.environment, options.t);
    const aetherAdvancedReady = Boolean(aetherStatus.smokeValidated);
    const aetherModeOptions = isAetherScaleSelected
        ? AETHERSCALE_MODE_SPECS.flatMap((spec) => {
            const mainMode = spec.mode === "performance_2x" || spec.mode === "ultra_performance_3x";
            if (!aetherAdvancedReady && !mainMode)
                return [];
            try {
                return [{ spec, geometry: aetherScaleOutputGeometry(version.width, version.height, spec.mode) }];
            }
            catch {
                return [];
            }
        })
        : [];
    const requestedAetherMode = isAetherScaleMode(dialog.aetherScaleMode)
        ? dialog.aetherScaleMode
        : AETHERSCALE_DEFAULT_MODE;
    const selectedAetherMode = aetherModeOptions.find(({ spec }) => spec.mode === requestedAetherMode)?.spec.mode
        ?? aetherModeOptions.find(({ spec }) => spec.mode === AETHERSCALE_DEFAULT_MODE)?.spec.mode
        ?? AETHERSCALE_DEFAULT_MODE;
    let aetherGeometry = null;
    let aetherGeometryError = "";
    if (isAetherScaleSelected) {
        try {
            aetherGeometry = aetherScaleOutputGeometry(version.width, version.height, selectedAetherMode);
        }
        catch (error) {
            aetherGeometryError = error instanceof Error ? error.message : String(error);
        }
    }
    const [targetWidth, outputHeight] = isAetherScaleSelected && aetherGeometry
        ? [aetherGeometry.width, aetherGeometry.height]
        : isDlss5Selected
            ? dlss5OutputDimensions(version.width, version.height, selectedScale)
            : h3Selected
                ? h3NativeUpscaleDimensions(version.width, version.height, legacyTargetHeight === 2160 ? 1440 : legacyTargetHeight)
                : options.upscaleDimensions(version.width, version.height, legacyTargetHeight);
    const sourceShortEdge = options.versionShortEdge(version);
    const selectedTargetHeight = legacyTargetHeight;
    const dlss5Status = dlss5UiStatus(options.environment, options.t);
    const estimate = options.estimateUpscaleResources({
        modelId: dialog.modelId,
        sourceWidth: version.width,
        sourceHeight: version.height,
        targetWidth,
        targetHeight: outputHeight,
        duration: version.duration,
        fps: version.fps
    });
    const formatEstimateGb = (value) => `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)} GB`;
    const estimatedVram = isDlss5Selected
        ? options.t(uiKeys.upscale.dlss5BenchmarkPending)
        : isAetherScaleSelected
            ? "—"
            : `${formatEstimateGb(estimate.vramMinGb)}-${formatEstimateGb(estimate.vramMaxGb)}`;
    const estimatedTime = isDlss5Selected
        ? options.t(uiKeys.upscale.dlss5BenchmarkPending)
        : isAetherScaleSelected
            ? "—"
            : options.formatUpscaleEstimateRange(estimate.secondsMin, estimate.secondsMax);
    const detectedVramBytes = options.environment?.gpus?.[0]?.vramTotalBytes ??
        options.performance?.vramTotalBytes ??
        0;
    const vramWarning = detectedVramBytes > 0 &&
        estimate.vramMaxGb * 1024 ** 3 > detectedVramBytes;
    const supportedIds = new Set(["seedvr2", "seedvr2-native-int8", "flashvsr", "realesrgan"]);
    const fallbackProfiles = [
        { id: "seedvr2", name: "SeedVR2", available: true },
        { id: "seedvr2-native-int8", name: "SeedVR2 3B INT8 ConvRot · 原生", available: true },
        { id: "flashvsr", name: "FlashVSR", available: true },
        { id: "realesrgan", name: "Real-ESRGAN x4plus", available: true }
    ];
    const pixelProfiles = options.environment?.modelProfiles
        .filter((profile) => profile.category === "upscale" && supportedIds.has(profile.id))
        .map((profile) => ({
        id: profile.id,
        name: profile.name,
        available: profile.available
    })) ?? fallbackProfiles;
    const profiles = [
        ...pixelProfiles,
        { id: "minimax_h3_latent_upscaler", name: "H3 Latent Upscale", available: h3Available },
        { id: DLSS5_MODEL_ID, name: options.t(uiKeys.upscale.dlss5Name), available: dlss5Status.available },
        { id: AETHERSCALE_MODEL_ID, name: options.t(uiKeys.upscale.aetherscaleName), available: aetherStatus.available }
    ];
    const outputFilename = isAetherScaleSelected
        ? createAetherScaleUpscaleFilename(version.outputFilename, selectedAetherMode)
        : isDlss5Selected
            ? createDlss5UpscaleFilename(version.outputFilename, selectedScale)
            : options.createUpscaleFilename(version.outputFilename, legacyTargetHeight);
    const supportsTileMode = dialog.modelId === "seedvr2";
    const targetOptions = h3Selected ? [720, 768, 1080, 1440] : [720, 1080, 1440, 2160];
    const estimatedDiskBytes = isDlss5Selected || isAetherScaleSelected
        ? estimateUpscaleDiskBytes(version, targetWidth, outputHeight)
        : null;
    const targetMarkup = isAetherScaleSelected
        ? `<div><label>${options.t(uiKeys.upscale.aetherscaleMode)}</label><div class="upscale-resolution upscale-scale-resolution aetherscale-mode-options">
            ${aetherModeOptions.map(({ spec, geometry }) => {
            const disabled = busy || !aetherStatus.available;
            const label = spec.mode === "native_1x"
                ? options.t(uiKeys.upscale.aetherscaleModeNative)
                : spec.mode === "quality_1_5x"
                    ? options.t(uiKeys.upscale.aetherscaleModeQuality)
                    : spec.mode === "balanced_1_724x"
                        ? options.t(uiKeys.upscale.aetherscaleModeBalanced)
                    : spec.mode === "performance_2x"
                        ? options.t(uiKeys.upscale.aetherscaleModePerformance)
                        : options.t(uiKeys.upscale.aetherscaleModeUltra);
            const title = `${geometry.width} × ${geometry.height}`;
            return `<button class="${spec.mode === selectedAetherMode ? "primary" : "secondary"}" data-aetherscale-mode="${spec.mode}" aria-label="${options.escapeHtml(`${label} · ${title}`)}" title="${options.escapeHtml(title)}"${disabled ? " disabled" : ""}>${options.escapeHtml(label)}</button>`;
        }).join("")}
          </div></div>`
        : isDlss5Selected
        ? `<div><label>${options.t(uiKeys.upscale.scale)}</label><div class="upscale-resolution upscale-scale-resolution">
            ${DLSS5_SCALE_VALUES.map((scale) => {
                const [width, height] = dlss5OutputDimensions(version.width, version.height, scale);
                return `<button class="${scale === selectedScale ? "primary" : "secondary"}" data-upscale-scale="${scale}" aria-label="${scale}× · ${width} × ${height}" title="${width} × ${height}"${busy || !dlss5Status.available ? " disabled" : ""}>${scale}×</button>`;
            }).join("")}
          </div></div>`
        : `<div><label>${options.t(uiKeys.upscale.targetResolution)}</label><div class="upscale-resolution">
            ${targetOptions.map((height) => `<button class="${height === selectedTargetHeight ? "primary" : "secondary"}" data-upscale-height="${height}"${busy || height <= sourceShortEdge || (dialog.h3Provider === "bilinear" && height >= 1080) || (dialog.h3Provider === "learned-3d" && height < 1080) ? " disabled" : ""}>${height === 2160 ? "4K" : `${height}p`}</button>`).join("")}
          </div></div>`;
    const methodMarkup = isAetherScaleSelected
        ? `<label>${options.t(uiKeys.upscale.aetherscaleStyle)}<select id="upscale-aetherscale-style" ${busy || !aetherStatus.available ? "disabled" : ""}><option value="faithful" ${selectedAetherStyle === "faithful" ? "selected" : ""}>${options.t(uiKeys.upscale.aetherscaleStyleFaithful)}</option><option value="enhanced" ${selectedAetherStyle === "enhanced" ? "selected" : ""}>${options.t(uiKeys.upscale.aetherscaleStyleEnhanced)}</option></select></label>`
        : isDlss5Selected
        ? `<label>${options.t(uiKeys.upscale.quality)}<select id="upscale-dlss-quality" ${busy || !dlss5Status.available ? "disabled" : ""}><option value="quality" ${selectedQuality === "quality" ? "selected" : ""}>${options.t(uiKeys.upscale.qualityQuality)}</option><option value="balanced" ${selectedQuality === "balanced" ? "selected" : ""}>${options.t(uiKeys.upscale.qualityBalanced)}</option><option value="performance" ${selectedQuality === "performance" ? "selected" : ""}>${options.t(uiKeys.upscale.qualityPerformance)}</option></select></label>`
        : `<label>${options.t(uiKeys.upscale.memoryPolicy)}${supportsTileMode ? `<select id="upscale-tile" ${busy ? "disabled" : ""}><option value="auto" ${dialog.tileMode === "auto" ? "selected" : ""}>${options.t(uiKeys.upscale.autoPolicy)}</option><option value="safe" ${dialog.tileMode === "safe" ? "selected" : ""}>${options.t(uiKeys.upscale.safePolicy)}</option><option value="fast" ${dialog.tileMode === "fast" ? "selected" : ""}>${options.t(uiKeys.upscale.fastPolicy)}</option></select>` : `<span class="upscale-policy-readonly">${options.t(uiKeys.upscale.nodeFixed)}</span>`}</label>`;
    const dlss5StatusMarkup = isDlss5Selected
        ? `<div class="upscale-dlss-status ${dlss5Status.tone}" role="${dlss5Status.tone === "missing" ? "alert" : "status"}"><strong>${options.t(uiKeys.upscale.dlss5Experimental)}</strong><span>${dlss5Status.message}</span><small>${options.t(uiKeys.upscale.dlss5SettingsHint)}</small></div>`
        : "";
    const aetherStatusMarkup = isAetherScaleSelected && aetherStatus.tone === "missing"
        ? `<div class="upscale-dlss-status missing" role="alert"><span>${aetherStatus.message}</span>${aetherGeometryError ? `<small>${options.escapeHtml(aetherGeometryError)}</small>` : ""}</div>`
        : "";
    const enqueueDisabled = busy ||
        (h3Selected && !h3Available) ||
        (isDlss5Selected && !dlss5Status.available) ||
        (isAetherScaleSelected && (!aetherStatus.available || !aetherGeometry || (!aetherAdvancedReady && selectedAetherMode !== "performance_2x" && selectedAetherMode !== "ultra_performance_3x")));
    const t = options.t;
    return `
    <div class="dialog-backdrop upscale-backdrop" id="upscale-backdrop">
      <section class="upscale-dialog" role="dialog" aria-modal="true" aria-labelledby="upscale-title" aria-busy="${busy}" tabindex="-1">
        <div class="upscale-dialog-head">
          <div><span class="eyebrow">${t(uiKeys.upscale.eyebrow)}</span><h2 id="upscale-title">${t(uiKeys.upscale.title)}</h2></div>
          <button class="dialog-close" id="close-upscale" aria-label="${t(uiKeys.upscale.close)}" ${busy ? "disabled" : ""}>${options.icon("x")}</button>
        </div>
        <div class="upscale-dialog-body">
          <div class="upscale-source"><div><strong>${options.escapeHtml(asset.title)}</strong><code>${options.escapeHtml(version.outputFilename)}</code></div><span>${version.width} × ${version.height} · ${options.formatVideoDuration(version.duration)}</span></div>
          ${targetMarkup}
          <div class="settings-grid two">
            <label>${t(uiKeys.upscale.model)}<select id="upscale-model" ${busy ? "disabled" : ""}>${profiles.map((profile) => `<option value="${profile.id}" ${profile.id === dialog.modelId ? "selected" : ""} ${!profile.available ? "disabled" : ""}>${options.escapeHtml(profile.name)}${profile.available ? "" : t(uiKeys.upscale.missingComponent)}</option>`).join("")}</select></label>
            ${methodMarkup}
          </div>
          <p class="muted">${isAetherScaleSelected ? t(uiKeys.upscale.aetherscaleDescription) : isDlss5Selected ? t(uiKeys.upscale.dlss5Description) : h3Selected ? t(uiKeys.upscale.h3NativeDescription) : t(uiKeys.upscale.pixelVideoDescription)}</p>${h3Selected && !h3Available ? `<p class="upscale-estimate-note warning">${t(uiKeys.h3Native.reasonArtifactMissing)}</p>` : ""}${dlss5StatusMarkup}${aetherStatusMarkup}
          <div class="upscale-output"><div><span>${t(uiKeys.upscale.estimatedOutput)}</span><strong>${targetWidth} × ${outputHeight}</strong><code>${options.escapeHtml(outputFilename)}</code></div><div class="upscale-estimates"><span>${t(uiKeys.upscale.estimatedPeak, { value: estimatedVram })}</span><span>${t(uiKeys.upscale.estimatedTime, { value: estimatedTime })}</span>${isDlss5Selected || isAetherScaleSelected ? `<span>${estimatedDiskBytes ? t(uiKeys.upscale.estimatedDisk, { value: options.formatBytes(estimatedDiskBytes) }) : t(uiKeys.upscale.diskEstimatePending)}</span>` : ""}</div></div>
          <p class="upscale-estimate-note ${vramWarning ? "warning" : ""}">${isAetherScaleSelected ? `${t(uiKeys.upscale.aetherscaleBenchmarkPending)} · ${t(uiKeys.upscale.actualImpact)}` : isDlss5Selected ? `${t(uiKeys.upscale.dlss5BenchmarkPending)} · ${t(uiKeys.upscale.actualImpact)}` : `${t(uiKeys.upscale.estimateNote, { frames: estimate.frameCount })} ${vramWarning ? t(uiKeys.upscale.vramWarning, { vram: options.formatBytes(detectedVramBytes) }) : t(uiKeys.upscale.actualImpact)}`}</p>
        </div>
        <div class="dialog-actions" aria-live="polite"><button class="secondary button-with-icon" id="cancel-upscale" ${busy ? "disabled" : ""}>${options.icon("x")}${t(uiKeys.upscale.cancel)}</button><button class="primary button-with-icon" id="enqueue-upscale" ${enqueueDisabled ? "disabled" : ""}>${options.icon(busy ? "refresh-cw" : dialog.taskId ? "save" : "plus")}${busy ? t(uiKeys.runtime.enqueueing) : dialog.taskId ? t(uiKeys.upscale.saveChanges) : dialog.replaceTaskId ? t(uiKeys.upscale.requeue) : t(uiKeys.upscale.enqueue)}</button></div>
      </section>
    </div>`;
}
