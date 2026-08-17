import type {
  Draft,
  HistoryAsset,
  ImageAssetVersion,
  TaskPerformanceStats
} from "../../../types";
import type { HistoryKind } from "../../contracts";
import type { Translate } from "../../../core/i18n";
import { uiKeys } from "../../../core/i18n-keys";

export interface HistoryFragmentRenderOptions {
  t: Translate;
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
    historyFilter?: string;
  },
  options: Pick<HistoryFragmentRenderOptions, "t" | "icon" | "escapeHtml">
): string {
  const { activeCount, description, historyKind, historyLayout } = viewModel;
  return `
    <section class="history-heading">
      <div class="history-heading-title"><div class="heading-line"><h1>${options.t(uiKeys.history.title)}</h1><span class="badge">${options.t(historyKind === "video" ? uiKeys.history.videoCount : uiKeys.history.imageProjectCount, { count: activeCount })}</span></div><p>${options.escapeHtml(description)}</p></div>
      <div class="history-kind-tabs" role="tablist" aria-label="${options.t(uiKeys.history.kindTabsLabel)}">
        <button class="${historyKind === "video" ? "active" : ""}" role="tab" aria-selected="${historyKind === "video"}" data-history-kind="video">${options.icon("film")}${options.t(uiKeys.history.video)}</button>
        <button class="${historyKind === "image" ? "active" : ""}" role="tab" aria-selected="${historyKind === "image"}" data-history-kind="image">${options.icon("image")}${options.t(uiKeys.history.image)}</button>
      </div>
      <div class="history-view-tools">
        ${viewModel.historyFilter ?? ""}
        <div class="button-row"><button class="${historyLayout === "masonry" ? "secondary" : "ghost"} button-with-icon" data-history-layout="masonry">${options.icon("columns-3")}${options.t(uiKeys.history.layoutMasonry)}</button><button class="${historyLayout === "album" ? "secondary" : "ghost"} button-with-icon" data-history-layout="album">${options.icon("layout-grid")}${options.t(uiKeys.history.layoutAlbum)}</button></div>
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
  options: Pick<HistoryFragmentRenderOptions, "t" | "icon" | "escapeHtml">
): string {
  return `<div class="image-lightbox" data-image-lightbox hidden>
      <div class="image-lightbox-backdrop" data-image-lightbox-close></div>
      <section class="image-lightbox-dialog" role="dialog" aria-modal="true" aria-labelledby="image-lightbox-title" tabindex="-1">
        <header class="image-lightbox-toolbar">
          <div><strong id="image-lightbox-title">${options.escapeHtml(viewModel.title)}</strong><span>${options.t(uiKeys.history.version, { version: viewModel.versionNumber })} · ${viewModel.width} × ${viewModel.height}</span></div>
          <div class="button-row"><button class="secondary button-with-icon" data-image-lightbox-reset>${options.icon("rotate-ccw")}${options.t(uiKeys.history.lightboxReset)}</button><button class="icon-button" data-image-lightbox-close aria-label="${options.t(uiKeys.history.lightboxClose)}" title="${options.t(uiKeys.history.lightboxClose)}">${options.icon("x")}</button></div>
        </header>
        <div class="image-lightbox-stage" data-image-lightbox-stage>
          <img src="${options.escapeHtml(viewModel.mediaUrl)}" alt="${options.escapeHtml(viewModel.title)} · ${options.t(uiKeys.history.version, { version: viewModel.versionNumber })}" data-image-lightbox-image draggable="false">
        </div>
        <p class="image-lightbox-hint">${options.t(uiKeys.history.lightboxHint)}</p>
      </section>
    </div>`;
}

function formatPerformancePercent(value: number | null | undefined, t: Translate): string {
  return value == null ? t(uiKeys.history.detail.unavailable) : `${Math.round(value)}%`;
}

function formatPerformanceBytes(
  value: number | null | undefined,
  formatBytes: HistoryFragmentRenderOptions["formatBytes"],
  t: Translate
): string {
  return value == null ? t(uiKeys.history.detail.unavailable) : formatBytes(value);
}

export function renderPerformanceStatsMarkup(
  stats: TaskPerformanceStats | undefined,
  options: Pick<HistoryFragmentRenderOptions, "formatBytes" | "t">
): string {
  if (!stats) {
    return `<p class="muted history-performance-empty">${options.t(uiKeys.history.detail.legacyNotSaved)}</p>`;
  }
  const vramIncrease = stats.vramPeakBytes != null && stats.vramBaselineBytes != null
    ? Math.max(0, stats.vramPeakBytes - stats.vramBaselineBytes)
    : null;
  return `
    <div class="task-stat-grid">
      <div class="task-stat"><span>${options.t(uiKeys.history.detail.gpuUtilization)}</span><strong>${formatPerformancePercent(stats.gpuAveragePercent, options.t)}</strong><small>${options.t(uiKeys.history.detail.peak, { value: formatPerformancePercent(stats.gpuPeakPercent, options.t) })}</small></div>
      <div class="task-stat"><span>${options.t(uiKeys.history.detail.vramPeak)}</span><strong>${formatPerformanceBytes(stats.vramPeakBytes, options.formatBytes, options.t)}</strong><small>${formatPerformanceBytes(stats.vramTotalBytes, options.formatBytes, options.t)} · ${options.t(uiKeys.history.detail.increase, { value: formatPerformanceBytes(vramIncrease, options.formatBytes, options.t) })}</small></div>
      <div class="task-stat"><span>${options.t(uiKeys.history.detail.cpuUsage)}</span><strong>${formatPerformancePercent(stats.cpuAveragePercent, options.t)}</strong><small>${options.t(uiKeys.history.detail.peak, { value: formatPerformancePercent(stats.cpuPeakPercent, options.t) })}</small></div>
      <div class="task-stat"><span>${options.t(uiKeys.history.detail.systemMemoryPeak)}</span><strong>${formatPerformanceBytes(stats.memoryPeakBytes, options.formatBytes, options.t)}</strong><small>${formatPerformanceBytes(stats.memoryAverageBytes, options.formatBytes, options.t)} · ${formatPerformanceBytes(stats.memoryTotalBytes, options.formatBytes, options.t)}</small></div>
      <div class="task-stat"><span>${options.t(uiKeys.history.detail.gpuTemperaturePeak)}</span><strong>${stats.gpuTemperaturePeak == null ? options.t(uiKeys.history.detail.unavailable) : `${Math.round(stats.gpuTemperaturePeak)}°C`}</strong><small>${options.t(uiKeys.history.detail.taskPeakTemperature)}</small></div>
      <div class="task-stat"><span>${options.t(uiKeys.history.detail.sampleSummary)}</span><strong>${options.t(uiKeys.history.detail.samples, { count: stats.sampleCount })}</strong><small>${options.t(uiKeys.history.detail.gpuSamples, { count: stats.gpuSampleCount, duration: stats.durationSeconds.toFixed(1) })}</small></div>
    </div>
    <p class="muted history-performance-note">${options.t(uiKeys.history.detail.sampleNote)}</p>`;
}

export function renderVideoLoraSnapshotMarkup(
  loras: ReadonlyArray<Draft["videoLoras"][number]>,
  options: Pick<HistoryFragmentRenderOptions, "escapeHtml" | "videoLoraPurposeLabel" | "t">
): string {
  if (!loras.length) return `<p class="history-empty-note">${options.t(uiKeys.history.detail.noLora)}</p>`;
  return `<div class="history-snapshot-list">${loras.map((lora, index) => `
    <div class="history-snapshot-item">
      <span class="history-snapshot-index">${index + 1}</span>
      <div><strong>${options.escapeHtml(lora.name)}</strong><p>${options.escapeHtml(lora.modelFamily)} · ${options.videoLoraPurposeLabel(lora.purpose)} · ${options.t(uiKeys.history.detail.loraStrengthValue, { value: lora.strength })}</p><code>${options.escapeHtml(lora.filename || options.t(uiKeys.history.detail.fileNameNotSaved))}</code></div>
    </div>`).join("")}</div>`;
}

export function renderVideoInputSnapshotMarkup(
  asset: HistoryAsset,
  options: Pick<HistoryFragmentRenderOptions, "escapeHtml" | "h3ReferenceRoleLabel" | "t">
): string {
  const items: string[] = [];
  if (asset.inputMode === "video" || asset.sourceVideoPath) {
    items.push(`<dt>${options.t(uiKeys.history.detail.inputMode)}</dt><dd>${options.t(uiKeys.history.detail.videoExtension)}</dd>`);
    items.push(`<dt>${options.t(uiKeys.history.detail.sourceVideo)}</dt><dd><code>${options.escapeHtml(asset.sourceVideoPath || options.t(uiKeys.history.detail.legacyNotSaved))}</code></dd>`);
    items.push(`<dt>${options.t(uiKeys.history.detail.sourceVideoDuration)}</dt><dd>${options.t(uiKeys.history.detail.duration, { value: asset.sourceVideoDuration ?? options.t(uiKeys.history.detail.legacyNotSaved) })}</dd>`);
    items.push(`<dt>${options.t(uiKeys.history.detail.keepRange)}</dt><dd>${asset.trimStartSeconds ?? 0}–${asset.trimEndSeconds ?? asset.sourceVideoDuration ?? "?"} ${options.t(uiKeys.history.detail.seconds)}</dd>`);
    if (asset.sourceAssetId) items.push(`<dt>${options.t(uiKeys.history.detail.sourceProject)}</dt><dd><code>${options.escapeHtml(asset.sourceAssetId)}</code></dd>`);
    if (asset.sourceVersionId) items.push(`<dt>${options.t(uiKeys.history.detail.sourceVersion)}</dt><dd><code>${options.escapeHtml(asset.sourceVersionId)}</code></dd>`);
  } else {
    items.push(`<dt>${options.t(uiKeys.history.detail.inputMode)}</dt><dd>${asset.h3ReferenceSlots?.length ? options.t(uiKeys.history.detail.r2v) : options.t(uiKeys.history.detail.imageToVideo)}</dd>`);
    if (asset.startImagePath) items.push(`<dt>${options.t(uiKeys.history.detail.firstFrame)}</dt><dd><code>${options.escapeHtml(asset.startImagePath)}</code></dd>`);
    if (asset.endImagePath) items.push(`<dt>${options.t(uiKeys.history.detail.lastFrame)}</dt><dd><code>${options.escapeHtml(asset.endImagePath)}</code></dd>`);
    for (const [index, slot] of (asset.h3ReferenceSlots ?? []).entries()) {
      items.push(`<dt>${options.t(uiKeys.history.detail.slot, { index: index + 1 })}</dt><dd><strong>${slot.mediaType === "video" ? options.t(uiKeys.history.detail.video) : options.t(uiKeys.history.detail.image)} · ${options.escapeHtml(options.h3ReferenceRoleLabel(slot.role))}</strong><br><code>${options.escapeHtml(slot.mediaPath || options.t(uiKeys.history.detail.legacyNotSaved))}</code>${slot.note ? `<br><span>${options.escapeHtml(slot.note)}</span>` : ""}</dd>`);
    }
  }
  return `<dl>${items.join("")}</dl>`;
}

export function renderImageReferenceSnapshotMarkup(
  version: ImageAssetVersion,
  options: Pick<HistoryFragmentRenderOptions, "escapeHtml" | "imageReferenceRoleLabel" | "t">
): string {
  if (!version.references.length) return `<p class="history-empty-note">${options.t(uiKeys.history.detail.noInputSnapshot)}</p>`;
  return `<div class="history-snapshot-list">${version.references.map((picture) => `
    <div class="history-snapshot-item image-reference-snapshot">
      <span class="history-snapshot-index">${picture.pictureNumber}</span>
      <div><strong>Picture ${picture.pictureNumber} · ${options.escapeHtml(options.imageReferenceRoleLabel(picture.role ?? "auto"))}</strong><p>${picture.width || "?"} × ${picture.height || "?"}</p><code>${options.escapeHtml(picture.absolutePath || options.t(uiKeys.history.detail.legacyNotSaved))}</code>${picture.crop ? `<div class="history-markup-snapshot"><strong>裁剪输入 · ${picture.crop.width} × ${picture.crop.height}</strong><p>x ${picture.crop.x} · y ${picture.crop.y} · 原图 ${picture.crop.sourceWidth} × ${picture.crop.sourceHeight}</p></div>` : ""}${picture.mask?.regionCount ? `<div class="history-markup-snapshot"><strong>移除 Mask · ${picture.mask.regionCount} 个区域</strong><p>${options.escapeHtml(picture.mask.maskPath)}</p></div>` : picture.markup?.objectCount ? `<div class="history-markup-snapshot"><strong>${options.t(uiKeys.history.detail.canvasMarkup, { count: picture.markup.objectCount })}</strong><p>${options.escapeHtml(picture.markup.summary || options.t(uiKeys.history.detail.legacyNotSaved))}</p></div>` : `<span class="history-unmarked">${options.t(uiKeys.history.detail.noMarkup)}</span>`}</div>
    </div>`).join("")}</div>`;
}
