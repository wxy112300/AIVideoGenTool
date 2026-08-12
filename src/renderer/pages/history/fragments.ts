import type {
  Draft,
  HistoryAsset,
  ImageAssetVersion,
  TaskPerformanceStats
} from "../../../types";
import type { HistoryKind } from "../../contracts";

export interface HistoryFragmentRenderOptions {
  icon(name: string, className?: string): string;
  escapeHtml(value: string): string;
  formatBytes(value: number): string;
  videoLoraPurposeLabel(purpose: Draft["videoLoras"][number]["purpose"]): string;
  h3ReferenceRoleLabel(role: NonNullable<HistoryAsset["h3ReferenceSlots"]>[number]["role"]): string;
  imageReferenceRoleLabel(role: NonNullable<ImageAssetVersion["references"][number]["role"]> | "auto"): string;
}

export function renderHistoryHeading(
  viewModel: {
    activeCount: number;
    historyKind: HistoryKind;
    historyLayout: "masonry" | "album";
    description: string;
  },
  options: Pick<HistoryFragmentRenderOptions, "icon" | "escapeHtml">
): string {
  const { activeCount, description, historyKind, historyLayout } = viewModel;
  return `
    <section class="history-heading">
      <div class="history-heading-title"><div class="heading-line"><h1>历史作品</h1><span class="badge">${activeCount} 个${historyKind === "video" ? "视频" : "图片项目"}</span></div><p>${options.escapeHtml(description)}</p></div>
      <div class="history-kind-tabs" role="tablist" aria-label="作品类型">
        <button class="${historyKind === "video" ? "active" : ""}" role="tab" aria-selected="${historyKind === "video"}" data-history-kind="video">${options.icon("film")}视频</button>
        <button class="${historyKind === "image" ? "active" : ""}" role="tab" aria-selected="${historyKind === "image"}" data-history-kind="image">${options.icon("image")}图片</button>
      </div>
      <div class="history-view-tools">
        <div class="button-row"><button class="${historyLayout === "masonry" ? "secondary" : "ghost"} button-with-icon" data-history-layout="masonry">${options.icon("columns-3")}瀑布流</button><button class="${historyLayout === "album" ? "secondary" : "ghost"} button-with-icon" data-history-layout="album">${options.icon("layout-grid")}相册</button></div>
      </div>
    </section>`;
}

export function renderImageLightboxMarkup(
  viewModel: {
    title: string;
    mediaUrl: string;
    versionNumber: number;
    width: number;
    height: number;
  },
  options: Pick<HistoryFragmentRenderOptions, "icon" | "escapeHtml">
): string {
  return `<div class="image-lightbox" data-image-lightbox hidden>
      <div class="image-lightbox-backdrop" data-image-lightbox-close></div>
      <section class="image-lightbox-dialog" role="dialog" aria-modal="true" aria-labelledby="image-lightbox-title" tabindex="-1">
        <header class="image-lightbox-toolbar">
          <div><strong id="image-lightbox-title">${options.escapeHtml(viewModel.title)}</strong><span>版本 ${viewModel.versionNumber} · ${viewModel.width} × ${viewModel.height}</span></div>
          <div class="button-row"><button class="secondary button-with-icon" data-image-lightbox-reset>${options.icon("rotate-ccw")}重置视图</button><button class="icon-button" data-image-lightbox-close aria-label="关闭大图" title="关闭大图">${options.icon("x")}</button></div>
        </header>
        <div class="image-lightbox-stage" data-image-lightbox-stage>
          <img src="${options.escapeHtml(viewModel.mediaUrl)}" alt="${options.escapeHtml(viewModel.title)} · 版本 ${viewModel.versionNumber}" data-image-lightbox-image draggable="false">
        </div>
        <p class="image-lightbox-hint">滚轮缩放 · 拖动平移 · 双击重置 · Esc 关闭</p>
      </section>
    </div>`;
}

function formatPerformancePercent(value: number | null | undefined): string {
  return value == null ? "不可用" : `${Math.round(value)}%`;
}

function formatPerformanceBytes(
  value: number | null | undefined,
  formatBytes: HistoryFragmentRenderOptions["formatBytes"]
): string {
  return value == null ? "不可用" : formatBytes(value);
}

export function renderPerformanceStatsMarkup(
  stats: TaskPerformanceStats | undefined,
  options: Pick<HistoryFragmentRenderOptions, "formatBytes">
): string {
  if (!stats) {
    return `<p class="muted history-performance-empty">旧记录没有保存运行采样摘要。</p>`;
  }
  const vramIncrease = stats.vramPeakBytes != null && stats.vramBaselineBytes != null
    ? Math.max(0, stats.vramPeakBytes - stats.vramBaselineBytes)
    : null;
  return `
    <div class="task-stat-grid">
      <div class="task-stat"><span>GPU 利用率</span><strong>${formatPerformancePercent(stats.gpuAveragePercent)}</strong><small>峰值 ${formatPerformancePercent(stats.gpuPeakPercent)}</small></div>
      <div class="task-stat"><span>显存峰值</span><strong>${formatPerformanceBytes(stats.vramPeakBytes, options.formatBytes)}</strong><small>${formatPerformanceBytes(stats.vramTotalBytes, options.formatBytes)} · 增加 ${formatPerformanceBytes(vramIncrease, options.formatBytes)}</small></div>
      <div class="task-stat"><span>CPU 占用</span><strong>${formatPerformancePercent(stats.cpuAveragePercent)}</strong><small>峰值 ${formatPerformancePercent(stats.cpuPeakPercent)}</small></div>
      <div class="task-stat"><span>系统内存峰值</span><strong>${formatPerformanceBytes(stats.memoryPeakBytes, options.formatBytes)}</strong><small>平均 ${formatPerformanceBytes(stats.memoryAverageBytes, options.formatBytes)} · 总量 ${formatPerformanceBytes(stats.memoryTotalBytes, options.formatBytes)}</small></div>
      <div class="task-stat"><span>GPU 温度峰值</span><strong>${stats.gpuTemperaturePeak == null ? "不可用" : `${Math.round(stats.gpuTemperaturePeak)}°C`}</strong><small>任务期间最高温度</small></div>
      <div class="task-stat"><span>采样摘要</span><strong>${stats.sampleCount} 次</strong><small>GPU 采样 ${stats.gpuSampleCount} 次 · ${stats.durationSeconds.toFixed(1)} 秒</small></div>
    </div>
    <p class="muted history-performance-note">只保存任务摘要，不保存原始采样曲线；GPU、显存和系统内存包含同机其他进程的影响。</p>`;
}

export function renderVideoLoraSnapshotMarkup(
  loras: ReadonlyArray<Draft["videoLoras"][number]>,
  options: Pick<HistoryFragmentRenderOptions, "escapeHtml" | "videoLoraPurposeLabel">
): string {
  if (!loras.length) return `<p class="history-empty-note">本次提交未使用 LoRA。</p>`;
  return `<div class="history-snapshot-list">${loras.map((lora, index) => `
    <div class="history-snapshot-item">
      <span class="history-snapshot-index">${index + 1}</span>
      <div><strong>${options.escapeHtml(lora.name)}</strong><p>${options.escapeHtml(lora.modelFamily)} · ${options.videoLoraPurposeLabel(lora.purpose)} · 强度 ${lora.strength}</p><code>${options.escapeHtml(lora.filename || "旧记录未保存文件名")}</code></div>
    </div>`).join("")}</div>`;
}

export function renderVideoInputSnapshotMarkup(
  asset: HistoryAsset,
  options: Pick<HistoryFragmentRenderOptions, "escapeHtml" | "h3ReferenceRoleLabel">
): string {
  const items: string[] = [];
  if (asset.inputMode === "video" || asset.sourceVideoPath) {
    items.push(`<dt>输入模式</dt><dd>视频续写</dd>`);
    items.push(`<dt>源视频</dt><dd><code>${options.escapeHtml(asset.sourceVideoPath || "旧记录未保存")}</code></dd>`);
    items.push(`<dt>源视频时长</dt><dd>${asset.sourceVideoDuration ?? "旧记录未保存"} 秒</dd>`);
    items.push(`<dt>保留范围</dt><dd>${asset.trimStartSeconds ?? 0}–${asset.trimEndSeconds ?? asset.sourceVideoDuration ?? "?"} 秒</dd>`);
    if (asset.sourceAssetId) items.push(`<dt>来源作品</dt><dd><code>${options.escapeHtml(asset.sourceAssetId)}</code></dd>`);
    if (asset.sourceVersionId) items.push(`<dt>来源版本</dt><dd><code>${options.escapeHtml(asset.sourceVersionId)}</code></dd>`);
  } else {
    items.push(`<dt>输入模式</dt><dd>${asset.h3ReferenceSlots?.length ? "R2V 多参考" : "图生视频"}</dd>`);
    if (asset.startImagePath) items.push(`<dt>首帧</dt><dd><code>${options.escapeHtml(asset.startImagePath)}</code></dd>`);
    if (asset.endImagePath) items.push(`<dt>尾帧</dt><dd><code>${options.escapeHtml(asset.endImagePath)}</code></dd>`);
    for (const [index, slot] of (asset.h3ReferenceSlots ?? []).entries()) {
      items.push(`<dt>Slot ${index + 1}</dt><dd><strong>${slot.mediaType === "video" ? "视频" : "图片"} · ${options.escapeHtml(options.h3ReferenceRoleLabel(slot.role))}</strong><br><code>${options.escapeHtml(slot.mediaPath || "旧记录未保存")}</code>${slot.note ? `<br><span>${options.escapeHtml(slot.note)}</span>` : ""}</dd>`);
    }
  }
  return `<dl>${items.join("")}</dl>`;
}

export function renderImageReferenceSnapshotMarkup(
  version: ImageAssetVersion,
  options: Pick<HistoryFragmentRenderOptions, "escapeHtml" | "imageReferenceRoleLabel">
): string {
  if (!version.references.length) return `<p class="history-empty-note">旧记录没有保存输入图片快照。</p>`;
  return `<div class="history-snapshot-list">${version.references.map((picture) => `
    <div class="history-snapshot-item image-reference-snapshot">
      <span class="history-snapshot-index">${picture.pictureNumber}</span>
      <div><strong>Picture ${picture.pictureNumber} · ${options.escapeHtml(options.imageReferenceRoleLabel(picture.role ?? "auto"))}</strong><p>${picture.width || "?"} × ${picture.height || "?"}</p><code>${options.escapeHtml(picture.absolutePath || "旧记录未保存路径")}</code>${picture.markup?.objectCount ? `<div class="history-markup-snapshot"><strong>Canvas 标记 / Mask 指令 · ${picture.markup.objectCount} 处</strong><p>${options.escapeHtml(picture.markup.summary || "旧记录没有保存标记说明")}</p></div>` : `<span class="history-unmarked">未使用 Canvas 标记</span>`}</div>
    </div>`).join("")}</div>`;
}