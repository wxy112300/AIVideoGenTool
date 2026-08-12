import type {
  AppState,
  AssetVersion,
  HistoryAsset,
  ImageAssetVersion,
  ImageHistoryProject
} from "../../../types";
import type { HistoryKind } from "../../contracts";
import {
  renderHistoryHeading,
  renderImageLightboxMarkup,
  renderImageReferenceSnapshotMarkup,
  renderPerformanceStatsMarkup,
  renderVideoInputSnapshotMarkup,
  renderVideoLoraSnapshotMarkup
} from "./fragments";

export type HistoryPageLayout = "masonry" | "album";

export interface HistoryPageViewModel {
  state: AppState;
  historyKind: HistoryKind;
  historyLayout: HistoryPageLayout;
  selectedHistoryAssetId: string;
  selectedHistoryVersionId: string;
}

export interface ImageHistoryGenerationSummary {
  steps?: number;
  cfg?: number;
  qualityLabel: string;
  loraLabel: string;
}

export interface HistoryPageOptions {
  icon(name: string, className?: string): string;
  escapeHtml(value: string): string;
  formatBytes(value: number): string;
  videoLoraPurposeLabel(purpose: NonNullable<HistoryAsset["videoLoras"]>[number]["purpose"]): string;
  h3ReferenceRoleLabel(role: NonNullable<HistoryAsset["h3ReferenceSlots"]>[number]["role"]): string;
  imageReferenceRoleLabel(role: NonNullable<ImageAssetVersion["references"][number]["role"]> | "auto"): string;
  modelName(modelId: string): string;
  formatFullHistoryTime(value: string): string;
  formatVideoDuration(seconds: number): string;
  formatElapsedDuration(seconds: number): string;
  historyAssetsByNewest(history: AppState["history"]): AppState["history"];
  imageProjectsByNewest(imageHistory: AppState["imageHistory"]): ImageHistoryProject[];
  preferredVersion(asset: HistoryAsset): AssetVersion;
  currentHistoryVersion(asset: HistoryAsset, selectedHistoryVersionId: string): AssetVersion;
  historyMediaUrl(asset: HistoryAsset, version?: AssetVersion): string;
  historyCoverCacheKey(asset: HistoryAsset, version: AssetVersion): string;
  historyCoverSeed(assetId: string, versionId: string): number;
  historyInitialCoverTime(duration: number, seed: number): number;
  historyResolutionLabel(asset: HistoryAsset, version: AssetVersion): string;
  historyRenderDuration(version: AssetVersion): string;
  versionVideoIndex(version: AssetVersion): number;
  versionShortEdge(version: AssetVersion): number;
  preferredImageVersion(project: ImageHistoryProject): ImageAssetVersion;
  currentImageHistoryVersion(project: ImageHistoryProject, selectedHistoryVersionId: string): ImageAssetVersion;
  imageHistoryMediaUrl(project: ImageHistoryProject, version?: ImageAssetVersion): string;
  imageHistoryThumbnailCacheKey(project: ImageHistoryProject, version: ImageAssetVersion): string;
  imageProjectCoverVersion(project: ImageHistoryProject): ImageAssetVersion | undefined;
  isRetiredVideoModel(modelId: string): boolean;
  imageHistoryGenerationSummary(version: ImageAssetVersion): ImageHistoryGenerationSummary;
}

export function renderImageHistoryPage(
  viewModel: HistoryPageViewModel,
  options: HistoryPageOptions
): string {
  const projects = options.imageProjectsByNewest(viewModel.state.imageHistory);
  const cards = projects.map((project, historyOrder) => {
    const version = options.preferredImageVersion(project);
    const mediaUrl = options.imageHistoryMediaUrl(project, version);
    const title = project.title.trim() || "未命名图片";
    const iterationCount = Math.max(0, project.versions.filter((item) => item.kind !== "source").length);
    return `
      <article class="history-gallery-item panel image-history-gallery-item" data-history="${options.escapeHtml(project.id)}" data-open-image-history="${options.escapeHtml(project.id)}" data-history-kind="image" data-history-order="${historyOrder}" tabindex="0" aria-label="${options.escapeHtml(title)}，打开图片详情；右键查看更多操作" title="${options.escapeHtml(title)}">
        <div class="history-media image-history-media" style="--media-ratio:${version.width || 1} / ${version.height || 1}">
          ${mediaUrl
            ? `<img src="${options.escapeHtml(mediaUrl)}" loading="lazy" alt="${options.escapeHtml(title)}" data-image-history-preview data-image-history-cache-key="${options.escapeHtml(options.imageHistoryThumbnailCacheKey(project, version))}" data-image-history-source="${options.escapeHtml(version.file.absolutePath ?? "")}">`
            : `<div class="history-media-fallback"><span>${options.icon("image")}</span><small>找不到图片文件</small></div>`}
          <div class="history-media-badges">
            <span class="media-chip history-model-chip">${options.escapeHtml(version.kind === "source" ? "原始图片" : options.modelName(version.modelId))}</span>
            <span class="media-chip">${version.width > 0 && version.height > 0 ? `${version.width} × ${version.height}` : "尺寸未知"}</span>
            <span class="media-chip history-version-count-chip">${project.versions.length} 个版本</span>
          </div>
          <span class="image-project-kind">${options.icon("workflow")}${iterationCount ? `${iterationCount} 次迭代` : "原始素材"}</span>
        </div>
        <div class="history-gallery-copy">
          <h3 class="history-card-title" title="${options.escapeHtml(title)}"><span class="history-card-title-track"><span>${options.escapeHtml(title)}</span><span aria-hidden="true">${options.escapeHtml(title)}</span></span></h3>
          <code class="history-card-filename">${options.escapeHtml(version.file.filename)}</code>
          <div class="history-card-meta"><span>${options.escapeHtml(options.formatFullHistoryTime(project.updatedAt || version.createdAt))}</span><span>最新版本 v${version.versionNumber}</span></div>
        </div>
      </article>`;
  }).join("");
  return `
    ${renderHistoryHeading({
      activeCount: viewModel.state.imageHistory.length,
      historyKind: viewModel.historyKind,
      historyLayout: viewModel.historyLayout,
      description: "一个图片项目包含原始素材和全部后续编辑版本；选择满意版本后可继续编辑或送入视频 Slot 1。"
    }, options)}
    <section class="history-gallery ${viewModel.historyLayout}">
      ${projects.length === 0
        ? `<div class="empty panel"><h2>还没有图片项目</h2><p>图片处理队列完成后，项目会自动出现在这里。</p></div>`
        : cards}
    </section>`;
}

export function renderHistoryPage(
  viewModel: HistoryPageViewModel,
  options: HistoryPageOptions
): string {
  const orderedAssets = options.historyAssetsByNewest(viewModel.state.history);
  const cards = orderedAssets.map((asset, historyOrder) => {
    const version = options.preferredVersion(asset);
    const historyTitle = asset.title.trim() || asset.prompt.trim() || "未命名视频";
    const videoIndex = options.versionVideoIndex(version);
    const mediaUrl = options.historyMediaUrl(asset, version);
    const coverKey = options.historyCoverCacheKey(asset, version);
    const coverSeed = options.historyCoverSeed(asset.id, version.id);
    const coverTime = options.historyInitialCoverTime(asset.duration, coverSeed);
    return `
      <article class="history-gallery-item panel" data-history="${asset.id}" data-open-history="${asset.id}" data-history-kind="video" data-history-order="${historyOrder}" tabindex="0" aria-label="${options.escapeHtml(historyTitle)}，打开详情；右键查看更多操作" title="${options.escapeHtml(historyTitle)}">
        <div class="history-media${mediaUrl ? " media-loading" : ""}" style="--media-ratio:${version.width} / ${version.height}" data-history-media data-cover-key="${options.escapeHtml(coverKey)}" data-cover-source="${options.escapeHtml(version.files[videoIndex]?.absolutePath ?? "")}" data-cover-time="${coverTime}" data-cover-seed="${coverSeed}" data-preview-duration="${asset.duration}">
          ${mediaUrl
            ? `<video muted loop playsinline preload="none" data-history-src="${options.escapeHtml(mediaUrl)}"></video>`
            : `<div class="history-media-fallback"><span>${options.icon("play")}</span><small>找不到视频文件</small></div>`}
          ${mediaUrl ? `<img class="history-cover-image" data-history-cover-image="${asset.id}" alt="">` : ""}
          ${mediaUrl ? `<div class="history-media-loading" role="status"><span class="history-loading-spinner" aria-hidden="true"></span><small>正在加载封面</small></div>` : ""}
          ${mediaUrl ? `<div class="history-media-error" aria-live="polite"><span>${options.icon("film")}</span><small>视频预览加载失败，点击卡片仍可打开详情</small></div>` : ""}
          <div class="history-media-badges">
            <span class="media-chip history-model-chip">${options.escapeHtml(options.modelName(version.modelId))}</span>
            <span class="media-chip">${options.historyResolutionLabel(asset, version)}</span>
            <span class="media-chip history-version-count-chip">${asset.versions.length} 个版本</span>
            <span class="media-chip">${options.formatVideoDuration(asset.duration)}</span>
          </div>
          ${mediaUrl ? `<span class="history-preview-state">${options.icon("play")}正在预览</span><button type="button" class="history-preview-progress" role="slider" aria-label="调整预览进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="等待视频加载"><i></i></button>` : ""}
        </div>
        <div class="history-gallery-copy">
          <h3 class="history-card-title" title="${options.escapeHtml(historyTitle)}"><span class="history-card-title-track"><span>${options.escapeHtml(historyTitle)}</span><span aria-hidden="true">${options.escapeHtml(historyTitle)}</span></span></h3>
          <code class="history-card-filename">${options.escapeHtml(version.files[videoIndex]?.filename ?? version.outputFilename)}</code>
          <div class="history-card-meta"><span>${options.escapeHtml(options.formatFullHistoryTime(version.createdAt))}</span><span>渲染 ${options.escapeHtml(options.historyRenderDuration(version))}</span></div>
        </div>
      </article>`;
  }).join("");
  return `
    ${renderHistoryHeading({
      activeCount: viewModel.state.history.length,
      historyKind: viewModel.historyKind,
      historyLayout: viewModel.historyLayout,
      description: "封面读取持久缓存；悬停才加载并播放原视频，退出后回到稳定封面。"
    }, options)}
    <section class="history-gallery ${viewModel.historyLayout}">
      ${viewModel.state.history.length === 0
        ? `<div class="empty panel"><h2>还没有完成的视频</h2><p>队列完成后，结果会自动出现在这里。</p></div>`
        : cards}
    </section>`;
}

export function renderHistoryDetailPage(
  viewModel: HistoryPageViewModel,
  options: HistoryPageOptions
): string {
  const asset = viewModel.state.history.find((item) => item.id === viewModel.selectedHistoryAssetId);
  if (!asset) return "";
  const version = options.currentHistoryVersion(asset, viewModel.selectedHistoryVersionId);
  const retiredModel = options.isRetiredVideoModel(asset.modelId);
  const videoIndex = options.versionVideoIndex(version);
  const mediaUrl = options.historyMediaUrl(asset, version);
  const videoFile = videoIndex >= 0 ? version.files[videoIndex] : undefined;
  const orderedHistory = options.historyAssetsByNewest(viewModel.state.history);
  const historyIndex = orderedHistory.findIndex((item) => item.id === asset.id);
  const previousAsset = historyIndex > 0 ? orderedHistory[historyIndex - 1] : undefined;
  const nextAsset = historyIndex >= 0 ? orderedHistory[historyIndex + 1] : undefined;
  const detailTitle = asset.title.trim() || asset.prompt.trim() || "未命名视频";
  const completedAt = options.formatFullHistoryTime(version.createdAt);
  const fps = version.fps;
  const performanceStats = version.performanceStats;
  const elapsedSeconds = version.startedAt
    ? Math.max(0, (new Date(version.createdAt).getTime() - new Date(version.startedAt).getTime()) / 1000)
    : null;
  return `
    <div class="history-detail-back">
      <button class="secondary button-with-icon history-detail-back-button" data-page="history">${options.icon("arrow-left")}返回历史</button>
      <div class="history-detail-tools">
        <span>任务记录为生成时的只读快照</span>
        <span class="history-detail-position" aria-label="当前历史作品位置">第 ${historyIndex + 1} / 共 ${viewModel.state.history.length} 个</span>
        <div class="history-detail-navigation" aria-label="切换历史作品">
          <button class="ghost history-detail-nav-button" data-history-navigation="-1" aria-keyshortcuts="PageUp" ${previousAsset ? "" : "disabled"} title="${previousAsset ? `上一个：${options.escapeHtml(previousAsset.title)} · Page Up` : "已经是第一项"}"><span class="history-detail-nav-label">${options.icon("arrow-left")}上一个</span><span class="history-detail-nav-shortcut"><kbd>Page Up</kbd></span></button>
          <button class="ghost history-detail-nav-button" data-history-navigation="1" aria-keyshortcuts="PageDown" ${nextAsset ? "" : "disabled"} title="${nextAsset ? `下一个：${options.escapeHtml(nextAsset.title)} · Page Down` : "已经是最后一项"}"><span class="history-detail-nav-label">下一个${options.icon("arrow-right")}</span><span class="history-detail-nav-shortcut"><kbd>Page Down</kbd></span></button>
        </div>
      </div>
    </div>
    <section class="history-detail-hero">
      <div class="history-player-column">
        <div class="panel history-player" style="--video-aspect: ${version.width} / ${version.height}">
          ${mediaUrl
            ? `<video controls loop playsinline preload="metadata" data-history-asset="${asset.id}" data-history-version="${version.id}" src="${mediaUrl}"></video>`
            : `<div class="history-media-fallback"><span>${options.icon("play")}</span><strong>视频文件不可用</strong><small>请检查输出目录或在下方定位文件。</small></div>`}
        </div>
      </div>
      <aside class="history-detail-sidebar">
        <section class="panel history-summary">
          <div class="history-summary-copy">
          <div class="history-title-line"><h1 class="history-detail-title" title="${options.escapeHtml(detailTitle)}"><span class="history-card-title-track"><span>${options.escapeHtml(detailTitle)}</span><span aria-hidden="true">${options.escapeHtml(detailTitle)}</span></span></h1><span class="status running">已完成</span></div>
          <code>${options.escapeHtml(videoFile?.filename ?? asset.outputFilename)}</code>
          <div class="history-summary-badges"><span class="model-badge">${options.escapeHtml(options.modelName(version.modelId))}</span><span>${version.kind === "original" ? "原始生成" : "分辨率提升版本"}</span></div>
          </div>
          <div class="history-overview-facts">
          <div><span>完成时间</span><strong>${completedAt}</strong></div>
          <div><span>生成耗时</span><strong>${elapsedSeconds == null ? "旧记录未保存" : options.formatElapsedDuration(elapsedSeconds)}</strong></div>
          <div><span>分辨率</span><strong>${version.width} × ${version.height}</strong></div>
          <div><span>视频时长</span><strong>${version.duration} 秒</strong></div>
          <div><span>成片帧率</span><strong>${fps} FPS</strong></div>
          <div><span>成片帧数</span><strong>${Math.round(version.duration * fps)} 帧</strong></div>
          </div>
          <div class="history-detail-quick-actions">
          ${retiredModel ? "" : `<button class="secondary button-with-icon" data-edit-history="${asset.id}" aria-label="在创建页调整" title="在创建页调整">${options.icon("sliders-horizontal")}调整参数</button>`}
          ${videoFile?.absolutePath ? `${retiredModel ? "" : `<button class="secondary button-with-icon" data-continue-history="${asset.id}" data-source-version="${version.id}" aria-label="继续创作" title="继续创作">${options.icon("video")}继续创作</button>`}<button class="secondary button-with-icon" data-copy-file="${options.escapeHtml(videoFile.absolutePath)}" aria-label="复制文件" title="复制文件">${options.icon("copy")}复制文件</button><button class="secondary button-with-icon history-file-action" data-show-file="${options.escapeHtml(videoFile.absolutePath)}" aria-label="打开所在目录" title="打开所在目录">${options.icon("folder-open")}定位文件</button>` : ""}
            <button class="secondary button-with-icon" data-open-upscale ${videoFile?.absolutePath && options.versionShortEdge(version) < 2160 ? "" : "disabled"}>${options.icon("maximize-2")}${options.versionShortEdge(version) >= 2160 ? "当前已是 4K" : "提升分辨率"}</button>
            <button class="secondary danger history-delete-button button-with-icon" data-delete-history="${asset.id}">${options.icon("trash-2")}删除视频和记录</button>
          </div>
        </section>
        <section class="panel history-version-panel">
          <div class="history-version-panel-heading"><strong>视频版本</strong><span>${asset.versions.length} 个版本</span></div>
          <div class="version-switcher history-summary-version-switcher">${asset.versions.map((item) => `<button class="${item.id === version.id ? "primary" : "ghost"}" data-version-id="${item.id}" title="${item.kind === "original" ? `原始生成 · ${item.width} × ${item.height}` : `${options.modelName(item.modelId)} · ${item.width} × ${item.height}`}">${item.kind === "original" ? `原始 · ${options.historyResolutionLabel(asset, item)}` : `提升 · ${options.historyResolutionLabel(asset, item)}`}</button>`).join("")}</div>
        </section>
      </aside>
    </section>
    <section class="history-record-grid">
      <article class="panel history-record full">
        <div class="history-record-heading"><h2>提示词</h2><button class="ghost button-with-icon" data-copy-prompt>${options.icon("copy")}复制提示词</button></div>
        <span class="muted">实际送入模型的完整提示词</span><div class="history-prompt-scroll" tabindex="0" aria-label="完整提示词"><p class="history-prompt">${options.escapeHtml(asset.prompt)}</p></div>
      </article>
      <article class="panel history-record">
        <h2>版本与生成参数</h2>
        <dl><dt>模型</dt><dd>${options.escapeHtml(options.modelName(version.modelId))}</dd><dt>Prompt 版本</dt><dd>${version.promptVersion ?? asset.promptVersion ?? "旧记录未保存"}</dd>${version.kind === "upscale" ? `<dt>分块模式</dt><dd>${options.escapeHtml(version.tileMode ?? "旧记录未保存")}</dd><dt>人脸修复</dt><dd>${version.faceRestore == null ? "旧记录未保存" : version.faceRestore ? "开启" : "关闭"}</dd>` : `<dt>采样步数</dt><dd>${version.steps ?? "工作流默认"}</dd><dt>Attention</dt><dd>${options.escapeHtml(version.attentionMode ?? asset.attentionMode ?? "旧记录未保存")}</dd><dt>计算模式</dt><dd>${version.spectrumMode === "balanced" ? "Spectrum 平衡模式 · 系统内存" : version.spectrumMode === "off" ? "原生完整计算" : "旧记录未保存"}</dd><dt>动作幅度</dt><dd>${options.escapeHtml(version.motion ?? asset.motion ?? "旧记录未保存")}</dd>`}<dt>Seed</dt><dd><code>${version.seed ?? "不适用"}</code></dd><dt>工作流</dt><dd><code>${options.escapeHtml(version.workflowPath || "旧记录未保存")}</code></dd><dt>ComfyUI Prompt ID</dt><dd><code>${options.escapeHtml(version.comfyPromptId)}</code></dd></dl>
      </article>
      <article class="panel history-record">
        <h2>视频输出</h2>
        <dl><dt>分辨率</dt><dd>${options.historyResolutionLabel(asset, version)} · ${version.width} × ${version.height}</dd><dt>画面比例</dt><dd>${options.escapeHtml(version.ratio ?? asset.ratio ?? "旧记录未保存")}</dd><dt>版本类型</dt><dd>${version.kind === "original" ? "原始生成" : "分辨率提升"}</dd><dt>时长</dt><dd>${version.duration} 秒</dd><dt>成片帧率</dt><dd>${fps} FPS</dd><dt>帧率处理</dt><dd>${options.escapeHtml(version.frameInterpolation ?? asset.frameInterpolation ?? "旧记录未保存")}</dd><dt>成片帧数</dt><dd>${Math.round(version.duration * fps)}</dd><dt>输出目录</dt><dd><code>${options.escapeHtml(videoFile?.absolutePath ?? viewModel.state.settings.outputDirectory)}</code></dd></dl>
      </article>
      <article class="panel history-record">
        <div class="history-record-heading"><h2>LoRA 叠加</h2><span>${version.videoLoras?.length ?? asset.videoLoras?.length ?? 0} 个</span></div>
        ${renderVideoLoraSnapshotMarkup(version.videoLoras ?? asset.videoLoras ?? [], options)}
      </article>
      <article class="panel history-record">
        <div class="history-record-heading"><h2>输入素材</h2><span>提交快照</span></div>
        ${renderVideoInputSnapshotMarkup(asset, options)}
      </article>
      <article class="panel history-record full history-performance-record">
        <div class="history-record-heading"><h2>运行统计</h2><span class="muted">低频采样摘要</span></div>
        ${renderPerformanceStatsMarkup(performanceStats, options)}
      </article>
      <article class="panel history-record full">
        <div class="history-record-heading"><h2>输出文件</h2><span>${version.files.length} 个</span></div>
      <div class="output-files">
        ${version.files.length === 0
          ? `<p class="muted">ComfyUI 返回中没有识别到文件。需要在本地保存一份 history 响应，用于补充该工作流的输出结构。</p>`
          : version.files.map((file) => `<div class="output-file"><div><strong>${options.escapeHtml(file.filename)}</strong><p class="muted">${options.escapeHtml(file.subfolder || ".")} · ${options.escapeHtml(file.type)}</p></div>${file.absolutePath ? `<button class="secondary button-with-icon" data-show-file="${options.escapeHtml(file.absolutePath)}">${options.icon("folder-open")}在 Explorer 中显示</button>` : `<span class="muted">请先在设置中填写 ComfyUI 输出目录</span>`}</div>`).join("")}
      </div>
        <details><summary>原始 ComfyUI 输出快照</summary><pre>${options.escapeHtml(JSON.stringify(version.comfyOutputs, null, 2))}</pre></details>
      </article>
    </section>`;
}

export function renderImageHistoryDetailPage(
  viewModel: HistoryPageViewModel,
  options: HistoryPageOptions
): string {
  const project = viewModel.state.imageHistory.find((item) => item.id === viewModel.selectedHistoryAssetId);
  if (!project) return "";
  const version = options.currentImageHistoryVersion(project, viewModel.selectedHistoryVersionId);
  const versionIndex = project.versions.findIndex((item) => item.id === version.id);
  const previousVersion = project.versions[versionIndex + 1];
  const nextVersion = project.versions[versionIndex - 1];
  const orderedProjects = options.imageProjectsByNewest(viewModel.state.imageHistory);
  const projectIndex = orderedProjects.findIndex((item) => item.id === project.id);
  const previousProject = projectIndex > 0 ? orderedProjects[projectIndex - 1] : undefined;
  const nextProject = projectIndex >= 0 ? orderedProjects[projectIndex + 1] : undefined;
  const title = project.title.trim() || "未命名图片";
  const mediaUrl = options.imageHistoryMediaUrl(project, version);
  const pinnedVersion = options.imageProjectCoverVersion(project);
  const parent = version.parentVersionId
    ? project.versions.find((item) => item.id === version.parentVersionId)
    : undefined;
  const elapsedSeconds = version.performanceStats?.durationSeconds ?? (version.startedAt
    ? Math.max(0, (Date.parse(version.createdAt) - Date.parse(version.startedAt)) / 1000)
    : null);
  const filePath = version.file.absolutePath ?? "";
  const generationSummary = options.imageHistoryGenerationSummary(version);
  return `
    <div class="history-detail-back">
      <button class="secondary button-with-icon history-detail-back-button" data-page="history">${options.icon("arrow-left")}返回图片历史</button>
      <div class="history-detail-tools">
        <span>图片项目保留所有编辑版本</span>
        <span class="history-detail-position" aria-label="当前图片项目位置">第 ${projectIndex + 1} / 共 ${orderedProjects.length} 个</span>
        <div class="history-detail-navigation" aria-label="切换图片项目">
          <button class="ghost history-detail-nav-button" data-history-navigation="-1" ${previousProject ? "" : "disabled"} title="${previousProject ? `上一个：${options.escapeHtml(previousProject.title)}` : "已经是第一项"}"><span class="history-detail-nav-label">${options.icon("arrow-left")}上一个</span><span class="history-detail-nav-shortcut"><kbd>Page Up</kbd></span></button>
          <button class="ghost history-detail-nav-button" data-history-navigation="1" ${nextProject ? "" : "disabled"} title="${nextProject ? `下一个：${options.escapeHtml(nextProject.title)}` : "已经是最后一项"}"><span class="history-detail-nav-label">下一个${options.icon("arrow-right")}</span><span class="history-detail-nav-shortcut"><kbd>Page Down</kbd></span></button>
        </div>
      </div>
    </div>
    <section class="image-history-detail-layout">
      <section class="panel image-history-viewer-panel">
        <div class="image-history-viewer-grid">
          <aside class="image-history-version-rail">
            <div><h2>版本</h2><p class="muted tiny">最新在前</p></div>
            <div class="image-history-version-list">
              ${project.versions.map((item) => `<button class="image-history-version-thumb ${item.id === version.id ? "active" : ""}" data-image-version-id="${options.escapeHtml(item.id)}" title="版本 ${item.versionNumber} · ${item.width} × ${item.height}">${options.imageHistoryMediaUrl(project, item) ? `<img src="${options.escapeHtml(options.imageHistoryMediaUrl(project, item))}" loading="lazy" alt="">` : ""}<span>${String(item.versionNumber).padStart(2, "0")}</span>${item.id === pinnedVersion?.id ? options.icon("circle-check") : ""}</button>`).join("")}
            </div>
          </aside>
          <section class="image-history-stage-panel">
            <div class="image-history-stage-toolbar"><div><strong>${options.escapeHtml(version.file.filename)}</strong><p class="muted tiny">版本 ${version.versionNumber} · Seed ${version.seed ?? "随机"} · ${options.escapeHtml(version.kind === "source" ? "原始图片" : options.modelName(version.modelId))}</p></div></div>
            <div class="image-history-stage ${version.width > version.height ? "is-wide" : "is-tall"}" data-image-stage="fit" data-image-orientation="${version.width > version.height ? "wide" : "tall"}" style="--image-aspect:${version.width || 1} / ${version.height || 1}">
              ${mediaUrl ? `<img src="${options.escapeHtml(mediaUrl)}" alt="${options.escapeHtml(title)} · 版本 ${version.versionNumber}" data-image-history-stage-image>` : `<div class="history-media-fallback"><span>${options.icon("image")}</span><strong>图片文件不可用</strong><small>请检查输出目录或在下方定位文件。</small></div>`}
            </div>
            <div class="image-history-stage-controls" aria-label="图片版本浏览操作">
              <button class="icon-button image-history-stage-nav" data-image-version-navigation="-1" ${previousVersion ? "" : "disabled"} title="${previousVersion ? `上一版本：v${previousVersion.versionNumber}` : "已经是最早版本"}" aria-label="上一版本">${options.icon("arrow-left")}</button>
              <button class="primary button-with-icon image-history-open-viewer" data-open-image-lightbox ${mediaUrl ? "" : "disabled"}>${options.icon("maximize-2")}查看大图</button>
              <button class="icon-button image-history-stage-nav" data-image-version-navigation="1" ${nextVersion ? "" : "disabled"} title="${nextVersion ? `下一版本：v${nextVersion.versionNumber}` : "已经是最新版本"}" aria-label="下一版本">${options.icon("arrow-right")}</button>
            </div>
          </section>
        </div>
      </section>
      <aside class="image-history-detail-sidebar">
        <section class="panel image-history-summary">
          <div class="status-line"><span class="badge ok">版本 ${version.versionNumber}${pinnedVersion?.id === version.id ? " · 当前封面" : ""}</span><span class="badge">PNG</span></div>
          <h2>${options.escapeHtml(title)}</h2>
          <p class="muted tiny">${options.escapeHtml(version.prompt || (version.kind === "source" ? "原始导入图片" : "未保存编辑要求"))}</p>
          <div class="image-history-facts"><div><span>模型</span><strong>${options.escapeHtml(version.kind === "source" ? "原始图片" : options.modelName(version.modelId))}</strong></div><div><span>Seed</span><strong>${version.seed ?? "随机"}</strong></div><div><span>尺寸</span><strong>${version.width} × ${version.height}</strong></div><div><span>格式</span><strong>${version.format.toUpperCase()}</strong></div><div><span>生成时间</span><strong>${options.escapeHtml(options.formatFullHistoryTime(version.createdAt))}</strong></div><div><span>耗时</span><strong>${elapsedSeconds == null ? "旧记录未保存" : options.escapeHtml(options.formatElapsedDuration(elapsedSeconds))}</strong></div></div>
          <div class="image-history-quick-actions"><button class="primary button-with-icon" data-image-continue-video-project="${options.escapeHtml(project.id)}" data-image-continue-video-version="${options.escapeHtml(version.id)}">${options.icon("video")}开始创作视频</button><button class="secondary button-with-icon" data-image-continue-edit-project="${options.escapeHtml(project.id)}" data-image-continue-edit-version="${options.escapeHtml(version.id)}">${options.icon("wand-sparkles")}继续编辑图片</button>${filePath ? `<button class="secondary button-with-icon" data-copy-image="${options.escapeHtml(filePath)}">${options.icon("copy")}复制图片</button><button class="secondary button-with-icon" data-copy-file="${options.escapeHtml(filePath)}">${options.icon("copy")}复制文件</button><button class="secondary button-with-icon" data-show-file="${options.escapeHtml(filePath)}">${options.icon("folder-open")}打开所在位置</button>` : ""}<button class="secondary button-with-icon" data-image-set-cover="${options.escapeHtml(project.id)}" data-image-cover-version="${pinnedVersion?.id === version.id ? "" : version.id}">${options.icon("image")}${pinnedVersion?.id === version.id ? "恢复自动封面" : "设为项目封面"}</button><button class="secondary danger button-with-icon" data-delete-image-version="${options.escapeHtml(project.id)}" data-image-version-delete-id="${options.escapeHtml(version.id)}" ${version.kind === "source" ? "disabled" : ""}>${options.icon("trash-2")}${version.kind === "source" ? "原始图不可删除" : "删除当前版本"}</button><button class="secondary danger button-with-icon" data-delete-history="${options.escapeHtml(project.id)}">${options.icon("trash-2")}删除图片项目</button></div>
        </section>
        <section class="panel image-history-version-panel"><div class="history-version-panel-heading"><strong>图片项目版本</strong><span>${project.versions.length} 个版本</span></div><p class="muted tiny">${parent ? `当前版本基于 v${parent.versionNumber} 继续编辑。` : version.kind === "source" ? "这是项目最初导入的基础图片。" : "当前版本没有记录父版本。"}</p></section>
      </aside>
    </section>
    <section class="history-record-grid image-history-record-grid">
      <article class="panel history-record full"><div class="history-record-heading"><h2>本次编辑要求</h2><button class="ghost button-with-icon" data-copy-image-prompt>${options.icon("copy")}复制 Prompt</button></div><span class="muted">生成时保存的 Prompt 快照</span><div class="history-prompt-scroll" tabindex="0" aria-label="图片编辑要求"><p class="history-prompt">${options.escapeHtml(version.prompt || "原始导入图片，没有编辑 Prompt")}</p></div></article>
      <article class="panel history-record"><h2>版本来源</h2><dl><dt>所属项目</dt><dd>${options.escapeHtml(title)}</dd><dt>父版本</dt><dd>${parent ? `v${parent.versionNumber}` : version.kind === "source" ? "原始图片" : "未记录"}</dd><dt>版本编号</dt><dd>${version.versionNumber} / ${project.versions.length}</dd><dt>版本类型</dt><dd>${version.kind === "source" ? "原始素材" : version.kind === "upscale" ? "分辨率提升" : "图片编辑"}</dd></dl></article>
      <article class="panel history-record"><h2>生成信息</h2><dl><dt>模型</dt><dd>${options.escapeHtml(version.kind === "source" ? "原始图片" : options.modelName(version.modelId))}</dd><dt>模型文件</dt><dd><code>${options.escapeHtml(version.diffusionModelFilename ?? "旧记录未保存")}</code></dd><dt>质量档</dt><dd>${options.escapeHtml(version.kind === "source" ? "不适用" : generationSummary.qualityLabel)}</dd><dt>采样步数</dt><dd>${version.kind === "source" ? "不适用" : generationSummary.steps ?? "旧记录未保存"}</dd><dt>CFG</dt><dd>${version.kind === "source" ? "不适用" : generationSummary.cfg ?? "旧记录未保存"}</dd><dt>图片 LoRA</dt><dd>${options.escapeHtml(version.kind === "source" ? "不适用" : generationSummary.loraLabel)}</dd><dt>目标尺寸</dt><dd>${version.targetResolution === "source" ? "保持原图" : version.targetResolution ? `${version.targetResolution}p` : "旧记录未保存"}</dd><dt>批次候选</dt><dd>${version.outputCount ?? "旧记录未保存"}</dd><dt>Prompt 版本</dt><dd>${version.promptVersion || "旧记录未保存"}</dd><dt>Seed</dt><dd>${version.seed ?? "随机"}</dd><dt>生成时间</dt><dd>${options.escapeHtml(options.formatFullHistoryTime(version.createdAt))}</dd><dt>输出格式</dt><dd>${version.format.toUpperCase()}</dd><dt>工作流</dt><dd><code>${options.escapeHtml(version.workflowPath || "原始导入")}</code></dd><dt>ComfyUI Prompt ID</dt><dd><code>${options.escapeHtml(version.comfyPromptId ?? "旧记录未保存")}</code></dd></dl></article>
      <article class="panel history-record full"><div class="history-record-heading"><h2>输入图片与 Canvas 标记</h2><span>${version.references.length} 张 Picture</span></div>${renderImageReferenceSnapshotMarkup(version, options)}</article>
      <article class="panel history-record full"><div class="history-record-heading"><h2>输出文件</h2><span>1 个</span></div><div class="output-files"><div class="output-file"><div><strong>${options.escapeHtml(version.file.filename)}</strong><p class="muted">${options.escapeHtml(version.file.subfolder || ".")} · ${options.escapeHtml(version.file.type)}</p></div>${filePath ? `<button class="secondary button-with-icon" data-show-file="${options.escapeHtml(filePath)}">${options.icon("folder-open")}在 Explorer 中显示</button>` : `<span class="muted">当前文件不可用</span>`}</div></div><details><summary>原始 ComfyUI 输出快照</summary><pre>${options.escapeHtml(JSON.stringify(version.comfyOutputs, null, 2))}</pre></details></article>
    </section>
    ${mediaUrl ? renderImageLightboxMarkup({
      title,
      mediaUrl,
      versionNumber: version.versionNumber,
      width: version.width,
      height: version.height
    }, options) : ""}`;
}
