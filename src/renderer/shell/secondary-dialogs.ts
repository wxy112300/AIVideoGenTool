import type {
  AssetVersion,
  EnvironmentScanResult,
  HistoryAsset,
  HistoryMigrationProgress,
  ImageAssetLibraryProgress,
  ImageAssetLibraryResult,
  ImageAssetLibraryScan,
  PerformanceMetrics
} from "../../types";
import type { Translate } from "../../core/i18n";
import { uiKeys } from "../../core/i18n-keys";
import type {
  UpscaleResourceEstimate,
  UpscaleResourceEstimateInput
} from "../../core/upscale";
import { h3NativeUpscaleDimensions } from "../../core/upscale";

type IconRenderer = (name: string, className?: string) => string;
type HtmlEscaper = (value: unknown) => string;

type UpscaleModelId = "seedvr2" | "seedvr2-native-int8" | "flashvsr" | "realesrgan" | "minimax_h3_latent_upscaler";
type UpscaleTargetHeight = 720 | 768 | 1080 | 1440 | 2160;
type UpscaleTileMode = "auto" | "safe" | "fast";

export interface DirectoryMigrationDialogRequest {
  oldDirectory: string;
  newDirectory: string;
}

export interface DirectoryMigrationDialogOptions {
  request: DirectoryMigrationDialogRequest | null;
  progress: HistoryMigrationProgress | null;
  busy: boolean;
  t: Translate;
  icon: IconRenderer;
  escapeHtml: HtmlEscaper;
}

export interface ImageAssetLibraryDialogResultViewModel {
  tone: "success" | "warning";
  title: string;
  detail: string;
  operationId?: string;
}

export interface ImageAssetLibraryDialogState {
  scan: ImageAssetLibraryScan | null;
  busy: boolean;
  error: string;
  confirmCleanup: boolean;
  selectedPaths: ReadonlyArray<string>;
  lastResult: ImageAssetLibraryDialogResultViewModel | null;
}

export interface ImageAssetLibraryDialogOptions {
  dialog: ImageAssetLibraryDialogState | null;
  progress: ImageAssetLibraryProgress | null;
  icon: IconRenderer;
  escapeHtml: HtmlEscaper;
  formatAssetBytes(bytes: number): string;
  t: Translate;
}

export interface UpscaleDialogState {
  taskId?: string;
  replaceTaskId?: string;
  h3Provider?: "bilinear" | "learned-3d";
  busy?: boolean;
  assetId: string;
  versionId: string;
  targetHeight: UpscaleTargetHeight;
  modelId: UpscaleModelId;
  tileMode: UpscaleTileMode;
}

export interface UpscaleDialogOptions {
  dialog: UpscaleDialogState | null;
  history: ReadonlyArray<HistoryAsset>;
  environment: EnvironmentScanResult | null;
  performance: PerformanceMetrics | null;
  icon: IconRenderer;
  escapeHtml: HtmlEscaper;
  formatBytes(bytes: number): string;
  formatVideoDuration(seconds: number): string;
  formatUpscaleEstimateRange(minSeconds: number, maxSeconds: number): string;
  createUpscaleFilename(
    sourceFilename: string,
    targetHeight: UpscaleTargetHeight
  ): string;
  estimateUpscaleResources(
    input: UpscaleResourceEstimateInput
  ): UpscaleResourceEstimate;
  upscaleDimensions(
    sourceWidth: number,
    sourceHeight: number,
    targetHeight: UpscaleTargetHeight
  ): [number, number];
  versionShortEdge(version: AssetVersion): number;
  t: Translate;
}

interface UpscaleModelProfileOption {
  id: string;
  name: string;
  available: boolean;
}

function directoryMigrationProgressValue(
  progress: HistoryMigrationProgress | null
): number {
  const phaseRanges: Record<HistoryMigrationProgress["phase"], [number, number]> = {
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

export function imageAssetProgressPercent(
  progress: ImageAssetLibraryProgress | null,
  busy: boolean
): number {
  if (!progress) return busy ? 5 : 100;
  if (progress.phase === "completed") return 100;
  const ranges: Record<ImageAssetLibraryProgress["phase"], [number, number]> = {
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

export function imageAssetPhaseLabel(
  phase: ImageAssetLibraryProgress["phase"] | undefined,
  t: Translate
): string {
  return ({
    scanning: t(uiKeys.assetLibrary.phaseScanning),
    archiving: t(uiKeys.assetLibrary.phaseArchiving),
    verifying: t(uiKeys.assetLibrary.phaseVerifying),
    committing: t(uiKeys.assetLibrary.phaseCommitting),
    cleaning: t(uiKeys.assetLibrary.phaseCleaning),
    completed: t(uiKeys.assetLibrary.phaseCompleted)
  } as const)[phase ?? "scanning"];
}

export function imageAssetResultSummary(
  result: ImageAssetLibraryResult,
  action: "organize" | "cleanup",
  formatAssetBytes: (bytes: number) => string,
  t: Translate
): ImageAssetLibraryDialogResultViewModel {
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

function findUpscaleAssetVersion(
  history: ReadonlyArray<HistoryAsset>,
  dialog: UpscaleDialogState
): { asset: HistoryAsset; version: AssetVersion } | null {
  const asset = history.find((item) => item.id === dialog.assetId);
  const version = asset?.versions.find((item) => item.id === dialog.versionId);
  return asset && version ? { asset, version } : null;
}

export function renderDirectoryMigrationDialog(
  options: DirectoryMigrationDialogOptions
): string {
  const request = options.request;
  if (!request) return "";
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

export function renderImageAssetLibraryDialog(
  options: ImageAssetLibraryDialogOptions
): string {
  const dialog = options.dialog;
  if (!dialog) return "";
  const scan = dialog.scan;
  const progress = options.progress;
  const progressValue = imageAssetProgressPercent(progress, dialog.busy);
  const t = options.t;
  const orphanPreview = scan?.orphanFiles.slice(0, 12).map((file) => `
    <label class="asset-library-file">
      <input type="checkbox" data-orphan-path="${options.escapeHtml(file.absolutePath)}" ${dialog.selectedPaths.includes(file.absolutePath) ? "checked" : ""}>
      <img class="asset-library-file-preview" data-asset-preview-source="${options.escapeHtml(file.absolutePath)}" alt="" aria-hidden="true" loading="lazy" decoding="async">
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

export function renderUpscaleDialog(options: UpscaleDialogOptions): string {
  const dialog = options.dialog;
  if (!dialog) return "";
  const resolved = findUpscaleAssetVersion(options.history, dialog);
  if (!resolved) return "";
  const { asset, version } = resolved;
  const busy = Boolean(dialog.busy);
  const h3Selected = dialog.modelId === "minimax_h3_latent_upscaler";
  const h3Artifact = version.h3ContinuationData?.status === "available"
    ? version.h3ContinuationData.artifact
    : undefined;
  const h3Available = Boolean(h3Artifact);
  const [targetWidth, outputHeight] = h3Selected
    ? h3NativeUpscaleDimensions(version.width, version.height, dialog.targetHeight === 2160 ? 1440 : dialog.targetHeight)
    : options.upscaleDimensions(version.width, version.height, dialog.targetHeight);
  const sourceShortEdge = options.versionShortEdge(version);
  const selectedTargetHeight = dialog.targetHeight;
  const estimate = options.estimateUpscaleResources({
    modelId: dialog.modelId,
    sourceWidth: version.width,
    sourceHeight: version.height,
    targetWidth,
    targetHeight: outputHeight,
    duration: version.duration,
    fps: version.fps
  });
  const formatEstimateGb = (value: number) =>
    `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)} GB`;
  const estimatedVram = `${formatEstimateGb(estimate.vramMinGb)}-${formatEstimateGb(estimate.vramMaxGb)}`;
  const estimatedTime = options.formatUpscaleEstimateRange(
    estimate.secondsMin,
    estimate.secondsMax
  );
  const detectedVramBytes = options.environment?.gpus[0]?.vramTotalBytes ??
    options.performance?.vramTotalBytes ??
    0;
  const vramWarning = detectedVramBytes > 0 &&
    estimate.vramMaxGb * 1024 ** 3 > detectedVramBytes;
  const supportedIds = new Set<string>(["seedvr2", "seedvr2-native-int8", "flashvsr", "realesrgan"]);
  const fallbackProfiles: UpscaleModelProfileOption[] = [
    { id: "seedvr2", name: "SeedVR2", available: true },
    { id: "seedvr2-native-int8", name: "SeedVR2 3B INT8 ConvRot · 原生", available: true },
    { id: "flashvsr", name: "FlashVSR", available: true },
    { id: "realesrgan", name: "Real-ESRGAN x4plus", available: true }
  ];
  const pixelProfiles: UpscaleModelProfileOption[] = options.environment?.modelProfiles
    .filter((profile) => profile.category === "upscale" && supportedIds.has(profile.id))
    .map((profile) => ({
      id: profile.id,
      name: profile.name,
      available: profile.available
    })) ?? fallbackProfiles;
  const profiles: UpscaleModelProfileOption[] = [
    ...pixelProfiles,
    { id: "minimax_h3_latent_upscaler", name: "H3 Latent Upscale", available: h3Available }
  ];
  const outputFilename = options.createUpscaleFilename(
    version.outputFilename,
    dialog.targetHeight
  );
  const supportsTileMode = dialog.modelId === "seedvr2";
  const targetOptions = h3Selected
    ? [720, 768, 1080, 1440] as const
    : [720, 1080, 1440, 2160] as const;
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
          <div><label>${t(uiKeys.upscale.targetResolution)}</label><div class="upscale-resolution">
            ${targetOptions.map((height) => `<button class="${height === selectedTargetHeight ? "primary" : "secondary"}" data-upscale-height="${height}"${busy || height <= sourceShortEdge || (dialog.h3Provider === "bilinear" && height >= 1080) || (dialog.h3Provider === "learned-3d" && height < 1080) ? " disabled" : ""}>${height === 2160 ? "4K" : `${height}p`}</button>`).join("")}
          </div></div>
          <div class="settings-grid two">
            <label>${t(uiKeys.upscale.model)}<select id="upscale-model" ${busy ? "disabled" : ""}>${profiles.map((profile) => `<option value="${profile.id}" ${profile.id === dialog.modelId ? "selected" : ""} ${!profile.available ? "disabled" : ""}>${options.escapeHtml(profile.name)}${profile.available ? "" : t(uiKeys.upscale.missingComponent)}</option>`).join("")}</select></label>
            <label>${t(uiKeys.upscale.memoryPolicy)}${supportsTileMode ? `<select id="upscale-tile" ${busy ? "disabled" : ""}><option value="auto" ${dialog.tileMode === "auto" ? "selected" : ""}>${t(uiKeys.upscale.autoPolicy)}</option><option value="safe" ${dialog.tileMode === "safe" ? "selected" : ""}>${t(uiKeys.upscale.safePolicy)}</option><option value="fast" ${dialog.tileMode === "fast" ? "selected" : ""}>${t(uiKeys.upscale.fastPolicy)}</option></select>` : `<span class="upscale-policy-readonly">${t(uiKeys.upscale.nodeFixed)}</span>`}</label>
          </div>
          <p class="muted">${h3Selected ? t(uiKeys.upscale.h3NativeDescription) : t(uiKeys.upscale.pixelVideoDescription)}</p>${h3Selected && !h3Available ? `<p class="upscale-estimate-note warning">${t(uiKeys.h3Native.reasonArtifactMissing)}</p>` : ""}
          <div class="upscale-output"><div><span>${t(uiKeys.upscale.estimatedOutput)}</span><strong>${targetWidth} × ${outputHeight}</strong><code>${options.escapeHtml(outputFilename)}</code></div><div class="upscale-estimates"><span>${t(uiKeys.upscale.estimatedPeak, { value: estimatedVram })}</span><span>${t(uiKeys.upscale.estimatedTime, { value: estimatedTime })}</span></div></div>
          <p class="upscale-estimate-note ${vramWarning ? "warning" : ""}">${t(uiKeys.upscale.estimateNote, { frames: estimate.frameCount })} ${vramWarning ? t(uiKeys.upscale.vramWarning, { vram: options.formatBytes(detectedVramBytes) }) : t(uiKeys.upscale.actualImpact)}</p>
        </div>
        <div class="dialog-actions" aria-live="polite"><button class="secondary button-with-icon" id="cancel-upscale" ${busy ? "disabled" : ""}>${options.icon("x")}${t(uiKeys.upscale.cancel)}</button><button class="primary button-with-icon" id="enqueue-upscale" ${busy || (h3Selected && !h3Available) ? "disabled" : ""}>${options.icon(busy ? "refresh-cw" : dialog.taskId ? "save" : "plus")}${busy ? t(uiKeys.runtime.enqueueing) : dialog.taskId ? t(uiKeys.upscale.saveChanges) : dialog.replaceTaskId ? t(uiKeys.upscale.requeue) : t(uiKeys.upscale.enqueue)}</button></div>
      </section>
    </div>`;
}
