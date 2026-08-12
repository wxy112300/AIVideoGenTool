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
import type {
  UpscaleResourceEstimate,
  UpscaleResourceEstimateInput
} from "../../core/upscale";

type IconRenderer = (name: string, className?: string) => string;
type HtmlEscaper = (value: unknown) => string;

type UpscaleModelId = "seedvr2" | "flashvsr" | "realesrgan";
type UpscaleTargetHeight = 720 | 1080 | 1440 | 2160;
type UpscaleTileMode = "auto" | "safe" | "fast";

export interface DirectoryMigrationDialogRequest {
  oldDirectory: string;
  newDirectory: string;
}

export interface DirectoryMigrationDialogOptions {
  request: DirectoryMigrationDialogRequest | null;
  progress: HistoryMigrationProgress | null;
  busy: boolean;
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
}

export interface UpscaleDialogState {
  taskId?: string;
  replaceTaskId?: string;
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
  phase: ImageAssetLibraryProgress["phase"] | undefined
): string {
  return ({
    scanning: "扫描引用",
    archiving: "复制归档",
    verifying: "校验文件",
    committing: "保存历史",
    cleaning: "清理素材",
    completed: "操作完成"
  } as const)[phase ?? "scanning"];
}

export function imageAssetResultSummary(
  result: ImageAssetLibraryResult,
  action: "organize" | "cleanup",
  formatAssetBytes: (bytes: number) => string
): ImageAssetLibraryDialogResultViewModel {
  const missing = result.scan.missingReferences.length;
  if (action === "cleanup") {
    return {
      tone: "success",
      title: "素材清理完成",
      detail: `已删除 ${result.cleanedFiles} 个未被引用的素材和 ${result.cleanedDirectories} 个空分片目录，释放 ${formatAssetBytes(result.cleanedBytes)}。执行前已重新核对引用。`,
      operationId: result.operationId
    };
  }
  return {
    tone: missing ? "warning" : "success",
    title: missing ? "整理完成，仍有缺失引用" : "整理完成，原文件已保留",
    detail: `已归档 ${result.archivedFiles} 个外部文件，并将 ${result.reorganizedFiles} 个旧分片文件复制到扁平目录；校验并写入 ${result.updatedReferences} 处引用，历史状态已保存。原文件和旧分片副本没有删除，可以稍后再清理。${missing ? ` 另有 ${missing} 个原文件已不存在，未改写这些记录。` : " 当前已没有待整理引用。"}`,
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
  return `
    <div class="dialog-backdrop confirm-backdrop" id="directory-migration-backdrop">
      <section class="confirm-dialog directory-migration-dialog" role="alertdialog" aria-modal="true" aria-labelledby="directory-migration-title" aria-describedby="directory-migration-description" tabindex="-1">
        <div class="confirm-icon" aria-hidden="true">${options.icon(options.busy ? "refresh-cw" : "folder-open")}</div>
        <div class="confirm-copy">
          <span class="eyebrow">${options.busy ? "正在处理目录" : "输出目录已更改"}</span>
          <h2 id="directory-migration-title">应用视频输出目录更改？</h2>
          <p id="directory-migration-description">${options.busy ? options.escapeHtml(options.progress?.message || "正在准备迁移") : "请选择如何处理已有的视频历史记录。"}</p>
          <div class="confirm-warning"><strong>当前目录</strong><code>${options.escapeHtml(request.oldDirectory || "自动目录")}</code><strong>新目录</strong><code>${options.escapeHtml(request.newDirectory)}</code></div>
          ${options.busy
            ? `<div class="progress" role="progressbar" aria-label="历史视频迁移进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progressValue)}"><span style="width:${progressValue}%"></span></div><p class="muted">${options.progress ? `${options.progress.current} / ${options.progress.total} 个文件${options.progress.warningCount ? ` · ${options.progress.warningCount} 个警告` : ""}` : "准备中"}</p>`
            : `<p class="muted">“应用更改”只影响之后创建的视频；“应用并迁移”会扫描历史中实际记录的视频文件并在复核后更新路径。</p>`}
        </div>
        <div class="dialog-actions">
          <button class="secondary button-with-icon" id="directory-apply" ${options.busy ? "disabled" : ""}>${options.icon("check")}应用更改</button>
          <button class="primary button-with-icon" id="directory-apply-migrate" ${options.busy ? "disabled" : ""}>${options.icon("folder-open")}应用并迁移</button>
          <button class="ghost button-with-icon" id="directory-cancel" ${options.busy ? "disabled" : ""}>${options.icon("x")}取消</button>
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
  const orphanPreview = scan?.orphanFiles.slice(0, 12).map((file) => `
    <label class="asset-library-file">
      <input type="checkbox" data-orphan-path="${options.escapeHtml(file.absolutePath)}" ${dialog.selectedPaths.includes(file.absolutePath) ? "checked" : ""}>
      <span><strong title="${options.escapeHtml(file.relativePath)}">${options.escapeHtml(file.relativePath)}</strong><small>${options.formatAssetBytes(file.size)}</small></span>
    </label>`).join("") ?? "";
  return `
    <div class="dialog-backdrop confirm-backdrop" id="image-asset-library-backdrop">
      <section class="confirm-dialog image-asset-library-dialog" role="dialog" aria-modal="true" aria-labelledby="image-asset-library-title" tabindex="-1">
        <div class="confirm-copy">
          <span class="eyebrow">图片输入资产</span>
          <h2 id="image-asset-library-title">整理图片素材库</h2>
          <p id="image-assets-progress-message">${dialog.busy ? options.escapeHtml(progress?.message || "正在扫描历史与素材文件") : "归档仍在外部的历史素材，并检查素材库中没有被历史、草稿或队列引用的文件。"}</p>
          ${scan ? `<code class="asset-library-path">${options.escapeHtml(scan.libraryDirectory)}</code>` : ""}
          ${dialog.busy ? `<div class="progress" id="image-assets-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progressValue}"><span style="width:${progressValue}%"></span></div>` : ""}
          ${dialog.busy ? `<div class="asset-library-progress-meta"><span id="image-assets-progress-phase">${imageAssetPhaseLabel(progress?.phase)}</span><span id="image-assets-progress-count">${progress?.total ? `${progress.current} / ${progress.total}` : "准备中"}</span></div>` : ""}
          ${dialog.error ? `<div class="confirm-warning danger-hint">${options.escapeHtml(dialog.error)}</div>` : ""}
          ${dialog.lastResult ? `<div class="asset-library-result ${dialog.lastResult.tone}" role="status"><span class="asset-library-result-icon">${options.icon(dialog.lastResult.tone === "success" ? "circle-check" : "alert-triangle")}</span><div><strong>${options.escapeHtml(dialog.lastResult.title)}</strong><p>${options.escapeHtml(dialog.lastResult.detail)}</p>${dialog.lastResult.operationId ? `<small>操作编号 ${options.escapeHtml(dialog.lastResult.operationId)} · 可在运行日志中检索</small>` : ""}</div></div>` : ""}
          ${scan ? `<div class="asset-library-summary">
            <article><span>记录引用</span><strong>${scan.totalReferences}</strong></article>
            <article><span>待整理</span><strong>${scan.archiveCandidates}</strong><small>${options.formatAssetBytes(scan.archiveBytes)}</small></article>
            <article class="${scan.missingReferences.length ? "warning" : ""}"><span>已缺失</span><strong>${scan.missingReferences.length}</strong></article>
            <article><span>可清理</span><strong>${scan.orphanFiles.length}</strong><small>${options.formatAssetBytes(scan.orphanBytes)}</small></article>
          </div>
          ${scan.missingReferences.length ? `<details class="asset-library-details"><summary>查看 ${scan.missingReferences.length} 个缺失引用</summary>${scan.missingReferences.slice(0, 20).map((item) => `<code>${options.escapeHtml(item)}</code>`).join("")}</details>` : ""}
          ${scan.orphanFiles.length ? `<details class="asset-library-orphans" ${dialog.confirmCleanup ? "open" : ""}><summary><span><strong>可清理的未引用素材</strong><small>${scan.orphanFiles.length} 个 · ${options.formatAssetBytes(scan.orphanBytes)}</small></span><span class="asset-library-summary-action">展开选择</span></summary><div class="asset-library-file-list">${orphanPreview}${scan.orphanFiles.length > 12 ? `<p class="muted">另有 ${scan.orphanFiles.length - 12} 个文件；本次清理只处理上面勾选的文件。</p>` : ""}</div></details>` : `<p class="asset-library-clean">没有发现可清理的孤立素材。</p>`}
          ${dialog.confirmCleanup ? `<div class="confirm-warning"><strong>确认永久删除勾选的孤立文件？</strong><span>执行前会重新扫描引用；素材库外文件不会被删除。</span></div>` : ""}` : ""}
        </div>
        <div class="dialog-actions">
          <button class="secondary button-with-icon" id="image-assets-rescan" ${dialog.busy ? "disabled" : ""}>${options.icon("scan-search")}重新扫描</button>
          <button class="primary button-with-icon" id="image-assets-organize" ${dialog.busy || !scan?.archiveCandidates ? "disabled" : ""}>${options.icon("folder-open")}归档并修复</button>
          ${scan?.orphanFiles.length ? `<button class="secondary destructive button-with-icon" id="image-assets-cleanup" ${dialog.busy ? "disabled" : ""}>${options.icon("trash-2")}${dialog.confirmCleanup ? "确认清理" : "清理所选"}</button>` : ""}
          <button class="ghost button-with-icon" id="image-assets-close" ${dialog.busy ? "disabled" : ""}>${options.icon("x")}关闭</button>
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
  const [targetWidth, outputHeight] = options.upscaleDimensions(
    version.width,
    version.height,
    dialog.targetHeight
  );
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
  const supportedIds = new Set<string>(["seedvr2", "flashvsr", "realesrgan"]);
  const fallbackProfiles: UpscaleModelProfileOption[] = [
    { id: "seedvr2", name: "SeedVR2", available: true },
    { id: "flashvsr", name: "FlashVSR", available: true },
    { id: "realesrgan", name: "Real-ESRGAN x4plus", available: true }
  ];
  const profiles: UpscaleModelProfileOption[] = options.environment?.modelProfiles
    .filter((profile) => profile.category === "upscale" && supportedIds.has(profile.id))
    .map((profile) => ({
      id: profile.id,
      name: profile.name,
      available: profile.available
    })) ?? fallbackProfiles;
  const outputFilename = options.createUpscaleFilename(
    version.outputFilename,
    dialog.targetHeight
  );
  const supportsTileMode = dialog.modelId === "seedvr2";
  return `
    <div class="dialog-backdrop upscale-backdrop" id="upscale-backdrop">
      <section class="upscale-dialog" role="dialog" aria-modal="true" aria-labelledby="upscale-title" tabindex="-1">
        <div class="upscale-dialog-head">
          <div><span class="eyebrow">创建后处理任务</span><h2 id="upscale-title">提升分辨率</h2></div>
          <button class="dialog-close" id="close-upscale" aria-label="关闭">${options.icon("x")}</button>
        </div>
        <div class="upscale-dialog-body">
          <div class="upscale-source"><div><strong>${options.escapeHtml(asset.title)}</strong><code>${options.escapeHtml(version.outputFilename)}</code></div><span>${version.width} × ${version.height} · ${options.formatVideoDuration(version.duration)}</span></div>
          <div><label>目标分辨率</label><div class="upscale-resolution">
            ${([720, 1080, 1440, 2160] as const).map((height) => `<button class="${height === selectedTargetHeight ? "primary" : "secondary"}" data-upscale-height="${height}" ${height <= sourceShortEdge ? "disabled" : ""}>${height === 2160 ? "4K" : `${height}p`}</button>`).join("")}
          </div></div>
          <div class="settings-grid two">
            <label>提升模型<select id="upscale-model">${profiles.map((profile) => `<option value="${profile.id}" ${profile.id === dialog.modelId ? "selected" : ""} ${!profile.available ? "disabled" : ""}>${options.escapeHtml(profile.name)}${profile.available ? "" : " · 缺组件"}</option>`).join("")}</select></label>
            <label>显存策略${supportsTileMode ? `<select id="upscale-tile"><option value="auto" ${dialog.tileMode === "auto" ? "selected" : ""}>自动 · 按显存选择</option><option value="safe" ${dialog.tileMode === "safe" ? "selected" : ""}>保守 · 分批与每批卸载</option><option value="fast" ${dialog.tileMode === "fast" ? "selected" : ""}>速度优先 · 尽量少卸载</option></select>` : `<span class="upscale-policy-readonly">节点固定 · 低显存分批</span>`}</label>
          </div>
          <div class="upscale-output"><div><span>预计输出</span><strong>${targetWidth} × ${outputHeight}</strong><code>${options.escapeHtml(outputFilename)}</code></div><div class="upscale-estimates"><span>预计峰值 ${estimatedVram}</span><span>预计耗时 ${estimatedTime}</span></div></div>
          <p class="upscale-estimate-note ${vramWarning ? "warning" : ""}">按模型、目标分辨率和帧数估算，共 ${estimate.frameCount} 帧；显存策略会影响实际峰值和耗时，不含首次加载模型、磁盘读取和最终编码时间。${vramWarning ? `预计峰值可能超过当前 ${options.formatBytes(detectedVramBytes)} 显存，建议降低目标分辨率或改用更轻模型。` : "实际速度和峰值会受 ComfyUI 版本、后台进程和磁盘速度影响。"}</p>
        </div>
        <div class="dialog-actions"><button class="secondary button-with-icon" id="cancel-upscale">${options.icon("x")}取消</button><button class="primary button-with-icon" id="enqueue-upscale">${options.icon(dialog.taskId ? "save" : "plus")}${dialog.taskId ? "保存更改" : dialog.replaceTaskId ? "重新加入队列" : "加入队列"}</button></div>
      </section>
    </div>`;
}
