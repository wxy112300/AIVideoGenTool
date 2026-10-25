import type {
  Draft,
  HistoryAsset,
  ImageAssetVersion,
  TaskPerformanceStats
} from "../../../types";
import type { HistoryKind } from "../../contracts";
import type { Translate } from "../../../core/i18n";
import { uiKeys } from "../../../core/i18n-keys";
import type { HistoryTimelineGroup } from "./timeline";

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
    totalCount?: number;
    filtered?: boolean;
    historyKind: HistoryKind;
    historyLayout: "masonry" | "album";
    description: string;
    historyFilter?: string;
  },
  options: Pick<HistoryFragmentRenderOptions, "t" | "icon" | "escapeHtml">
): string {
  const { activeCount, historyKind, historyLayout } = viewModel;
  return `
    <section class="history-heading">
      <div class="history-heading-title"><div class="heading-line"><h1>${options.t(uiKeys.history.title)}</h1><span class="history-heading-count">${viewModel.filtered ? `${activeCount} / ` : ""}${options.t(historyKind === "video" ? uiKeys.history.videoCount : uiKeys.history.imageProjectCount, { count: viewModel.totalCount ?? activeCount })}</span></div></div>
      <div class="history-kind-tabs" data-ui-segmented="history-kind" role="tablist" aria-label="${options.t(uiKeys.history.kindTabsLabel)}">
        <button id="history-tab-video" class="${historyKind === "video" ? "active" : ""}" role="tab" aria-selected="${historyKind === "video"}" aria-controls="history-panel-video" tabindex="${historyKind === "video" ? "0" : "-1"}" data-history-kind="video">${options.icon("film")}${options.t(uiKeys.history.video)}</button>
        <button id="history-tab-image" class="${historyKind === "image" ? "active" : ""}" role="tab" aria-selected="${historyKind === "image"}" aria-controls="history-panel-image" tabindex="${historyKind === "image" ? "0" : "-1"}" data-history-kind="image">${options.icon("image")}${options.t(uiKeys.history.image)}</button>
      </div>
      <div class="history-view-tools">
        ${viewModel.historyFilter ?? ""}
        <div class="button-row history-layout-tabs" data-ui-segmented="history-layout" role="group" aria-label="${options.t(uiKeys.history.layoutMasonry)} / ${options.t(uiKeys.history.layoutAlbum)}"><button type="button" class="${historyLayout === "masonry" ? "secondary" : "ghost"} button-with-icon" aria-pressed="${historyLayout === "masonry"}" data-history-layout="masonry">${options.icon("columns-3")}${options.t(uiKeys.history.layoutMasonry)}</button><button type="button" class="${historyLayout === "album" ? "secondary" : "ghost"} button-with-icon" aria-pressed="${historyLayout === "album"}" data-history-layout="album">${options.icon("layout-grid")}${options.t(uiKeys.history.layoutAlbum)}</button></div>
      </div>
    </section>`;
}

export function renderHistoryTimeline(
  groups: ReadonlyArray<HistoryTimelineGroup>,
  options: Pick<HistoryFragmentRenderOptions, "t" | "escapeHtml">,
  locale?: string
): string {
  if (!groups.length) return "";
  const historyLabel = options.t(uiKeys.history.title);
  const markers = groups.map((group) => `
        <button type="button" class="history-timeline-marker" data-history-timeline-marker data-history-timeline-target="${options.escapeHtml(group.targetId)}" data-history-timeline-date-key="${options.escapeHtml(group.dateKey)}" data-history-timeline-count="${group.ids.length}" data-history-timeline-label="${options.escapeHtml(group.label)}" style="--history-timeline-position:0" aria-label="${options.escapeHtml(group.label)}" title="${options.escapeHtml(group.label)}">${options.escapeHtml(group.label)}</button>`).join("");
  return `
    <aside class="history-timeline" data-history-timeline data-history-timeline-locale="${options.escapeHtml(locale ?? "")}" aria-label="${options.escapeHtml(historyLabel)}">
      <div class="history-timeline-track" data-history-timeline-track>
        <span class="history-timeline-line" aria-hidden="true"><span class="history-timeline-line-fill" data-history-timeline-line-fill></span></span>
        <span class="history-timeline-current" data-history-timeline-current aria-live="polite"></span>
        <span class="history-timeline-hover" data-history-timeline-hover aria-hidden="true"></span>
        <button type="button" class="history-timeline-thumb" data-history-timeline-thumb role="slider" tabindex="0" aria-orientation="vertical" aria-label="${options.escapeHtml(historyLabel)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="0%"></button>
        ${markers}
      </div>
    </aside>`;
}

export function renderImageMediaStatus(
  options: Pick<HistoryFragmentRenderOptions, "t" | "icon">,
  includeActions = true
): string {
  return `<div class="image-media-status" data-image-media-status role="status" aria-live="polite">
      <div class="image-media-status-symbol" aria-hidden="true"><i class="image-media-spinner"></i>${options.icon("image")}</div>
      <small data-image-media-status-label>${options.t(uiKeys.history.media.imageLoading)}</small>
      ${includeActions ? `<div class="image-media-status-actions"><button type="button" class="ghost button-with-icon" data-image-media-retry>${options.icon("refresh-cw")}${options.t(uiKeys.history.media.retryImage)}</button><button type="button" class="ghost button-with-icon" data-image-media-locate>${options.icon("folder-open")}${options.t(uiKeys.history.media.locateImage)}</button></div>` : ""}
    </div>`;
}

export function renderImageLightboxMarkup(
  viewModel: {
    title: string;
    mediaUrl: string;
    sourcePath?: string;
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
          <div class="image-lightbox-version-controls" data-image-lightbox-version-controls aria-label="${options.t(uiKeys.history.lightboxVersionSwitch)}"></div>
          <div class="button-row"><span class="image-lightbox-zoom" data-image-lightbox-zoom aria-live="polite" title="${options.t(uiKeys.history.lightboxZoom, { percent: "100%" })}">100%</span><button class="secondary button-with-icon" data-image-lightbox-reset>${options.icon("rotate-ccw")}${options.t(uiKeys.history.lightboxReset)}</button><button class="icon-button" data-image-lightbox-close aria-label="${options.t(uiKeys.history.lightboxClose)}" title="${options.t(uiKeys.history.lightboxClose)}">${options.icon("x")}</button></div>
        </header>
        <div class="image-lightbox-stage" data-image-lightbox-stage data-image-media data-image-media-surface="lightbox" data-image-media-source="${options.escapeHtml(viewModel.sourcePath ?? "")}">
          <img src="${options.escapeHtml(viewModel.mediaUrl)}" data-image-media-url="${options.escapeHtml(viewModel.mediaUrl)}" alt="${options.escapeHtml(viewModel.title)} · ${options.t(uiKeys.history.version, { version: viewModel.versionNumber })}" data-image-lightbox-image data-image-media-image draggable="false">
          ${renderImageMediaStatus(options)}
        </div>
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

export function renderH3TokenCountMarkup(
  stats: TaskPerformanceStats | undefined,
  options: Pick<HistoryFragmentRenderOptions, "t">
): string {
  const h3TokenCount = Number.isFinite(stats?.h3TokenCount)
    ? Math.trunc(stats!.h3TokenCount!)
    : undefined;
  return h3TokenCount == null
    ? ""
    : `<dt>${options.t(uiKeys.history.page.tokenCount)}</dt><dd>${h3TokenCount} tokens</dd>`;
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
  return `<div class="history-snapshot-list">${loras.map((lora, index) => {
    const details = lora.historyOnly === true
      ? `<div><strong>${options.escapeHtml(lora.name)}</strong></div>`
      : `<div><strong>${options.escapeHtml(lora.name)}</strong><p>${options.escapeHtml(lora.modelFamily)} · ${options.videoLoraPurposeLabel(lora.purpose)} · ${options.t(uiKeys.history.detail.loraStrengthValue, { value: lora.strength })}</p><code>${options.escapeHtml(lora.filename || options.t(uiKeys.history.detail.fileNameNotSaved))}</code></div>`;
    return `
    <div class="history-snapshot-item">
      <span class="history-snapshot-index">${index + 1}</span>
      ${details}
    </div>`;
  }).join("")}</div>`;
}

function referenceThumbnail(path: string, label: string, width: number | undefined, height: number | undefined,
  options: Pick<HistoryFragmentRenderOptions, "escapeHtml" | "t">, video = false): string {
  const e = options.escapeHtml;
  const ratio = width && height && width > 0 && height > 0 ? `${width}/${height}` : "16/9";
  const url = `studio-media://draft/reference-video?source=${encodeURIComponent(path)}`;
  return `<figure><button type="button" class="history-reference-media" data-history-reference-open="${e(path)}" data-history-reference-kind="${video ? "video" : "image"}" aria-label="${e(`${options.t(uiKeys.history.page.viewLarge)} · ${label}`)}" style="aspect-ratio:${ratio}">
    ${video ? `<video data-history-reference-video="${e(url)}" muted playsinline preload="none" aria-label="${e(label)}"></video>` : `<img data-history-reference-preview="${e(path)}" alt="${e(label)}" loading="lazy">`}
    <span class="history-reference-fallback" hidden>${options.t(uiKeys.history.page.currentFileUnavailable)}</span>
  </button><figcaption title="${e(path)}">${e(label)}${width && height ? ` · ${width} × ${height}` : ""}</figcaption></figure>`;
}

export function renderVideoInputSnapshotMarkup(
  asset: HistoryAsset,
  options: Pick<HistoryFragmentRenderOptions, "escapeHtml" | "h3ReferenceRoleLabel" | "t">
): string {
  const formatInputDimensions = (width?: number, height?: number): string =>
    Number.isFinite(width) && Number.isFinite(height) && width! > 0 && height! > 0
      ? `${Math.trunc(width!)} × ${Math.trunc(height!)}`
      : "? × ?";
  const resolutionLabel = (width?: number, height?: number): string =>
    `${options.t(uiKeys.history.page.resolution)} ${formatInputDimensions(width, height)}`;
  const renderReferenceSlot = (slot: NonNullable<HistoryAsset["h3ReferenceSlots"]>[number], index: number): string => {
    const dimensions = slot.mediaType === "image"
      ? ` · ${resolutionLabel(slot.width, slot.height)}`
      : "";
    return `<dt>${options.t(uiKeys.history.detail.slot, { index: index + 1 })}</dt><dd><strong>${slot.mediaType === "video" ? options.t(uiKeys.history.detail.video) : options.t(uiKeys.history.detail.image)} · ${options.escapeHtml(options.h3ReferenceRoleLabel(slot.role))}${dimensions}</strong><br><code>${options.escapeHtml(slot.mediaPath || options.t(uiKeys.history.detail.legacyNotSaved))}</code>${slot.note ? `<br><span>${options.escapeHtml(slot.note)}</span>` : ""}</dd>`;
  };
  const items: string[] = [];
  if (asset.inputMode === "video" || asset.sourceVideoPath) {
    items.push(`<dt>${options.t(uiKeys.history.detail.inputMode)}</dt><dd>${options.t(uiKeys.history.detail.videoExtension)}</dd>`);
    items.push(`<dt>${options.t(uiKeys.history.detail.sourceVideo)}</dt><dd><code>${options.escapeHtml(asset.sourceVideoPath || options.t(uiKeys.history.detail.legacyNotSaved))}</code><br><span>${resolutionLabel(asset.sourceWidth, asset.sourceHeight)}</span></dd>`);
    items.push(`<dt>${options.t(uiKeys.history.detail.sourceVideoDuration)}</dt><dd>${options.t(uiKeys.history.detail.duration, { value: asset.sourceVideoDuration ?? options.t(uiKeys.history.detail.legacyNotSaved) })}</dd>`);
    items.push(`<dt>${options.t(uiKeys.history.detail.keepRange)}</dt><dd>${asset.trimStartSeconds ?? 0}–${asset.trimEndSeconds ?? asset.sourceVideoDuration ?? "?"} ${options.t(uiKeys.history.detail.seconds)}</dd>`);
    if (asset.sourceAssetId) items.push(`<dt>${options.t(uiKeys.history.detail.sourceProject)}</dt><dd><code>${options.escapeHtml(asset.sourceAssetId)}</code></dd>`);
    if (asset.sourceVersionId) items.push(`<dt>${options.t(uiKeys.history.detail.sourceVersion)}</dt><dd><code>${options.escapeHtml(asset.sourceVersionId)}</code></dd>`);
    (asset.h3ReferenceSlots ?? []).forEach((slot, index) => {
      if (slot.mediaType === "video" && Boolean(asset.sourceVideoPath) && slot.mediaPath === asset.sourceVideoPath) return;
      items.push(renderReferenceSlot(slot, index));
    });
  } else {
    items.push(`<dt>${options.t(uiKeys.history.detail.inputMode)}</dt><dd>${asset.h3ReferenceSlots?.length ? options.t(uiKeys.history.detail.r2v) : options.t(uiKeys.history.detail.imageToVideo)}</dd>`);
    if (asset.startImagePath) items.push(`<dt>${options.t(uiKeys.history.detail.firstFrame)}</dt><dd><code>${options.escapeHtml(asset.startImagePath)}</code><br><span>${resolutionLabel(asset.sourceWidth, asset.sourceHeight)}</span></dd>`);
    if (asset.endImagePath) items.push(`<dt>${options.t(uiKeys.history.detail.lastFrame)}</dt><dd><code>${options.escapeHtml(asset.endImagePath)}</code><br><span>${resolutionLabel(asset.endImageWidth, asset.endImageHeight)}</span></dd>`);
    (asset.h3ReferenceSlots ?? []).forEach((slot, index) => items.push(renderReferenceSlot(slot, index)));
  }
  const previews: string[] = [];
  if (asset.sourceVideoPath) previews.push(referenceThumbnail(asset.sourceVideoPath, options.t(uiKeys.history.detail.sourceVideo), asset.sourceWidth, asset.sourceHeight, options, true));
  if (asset.startImagePath) previews.push(referenceThumbnail(asset.startImagePath, options.t(uiKeys.history.detail.firstFrame), asset.sourceWidth, asset.sourceHeight, options));
  if (asset.endImagePath) previews.push(referenceThumbnail(asset.endImagePath, options.t(uiKeys.history.detail.lastFrame), asset.endImageWidth, asset.endImageHeight, options));
  (asset.h3ReferenceSlots ?? []).forEach((slot, index) => {
    if (!slot.mediaPath || slot.mediaPath === asset.sourceVideoPath) return;
    previews.push(referenceThumbnail(slot.mediaPath, `${options.t(uiKeys.history.detail.slot, { index: index + 1 })} · ${options.h3ReferenceRoleLabel(slot.role)}`, slot.width, slot.height, options, slot.mediaType === "video"));
  });
  const metadata = `<details class="history-record-disclosure"><summary>${options.t(uiKeys.history.page.submittedSnapshot)}</summary><dl>${items.join("")}</dl></details>`;
  if (!previews.length) return `<p class="history-empty-note">${options.t(uiKeys.history.detail.noInputSnapshot)}</p>${asset.inputMode === "video" ? metadata : ""}`;
  return `<div class="history-reference-grid">${previews.join("")}</div>${metadata}`;
}

export function renderImageReferenceSnapshotMarkup(
  version: ImageAssetVersion,
  options: Pick<HistoryFragmentRenderOptions, "escapeHtml" | "imageReferenceRoleLabel" | "t" | "icon">
): string {
  if (!version.references.length) return `<p class="history-empty-note">${options.t(uiKeys.history.detail.noInputSnapshot)}</p>`;
  return `<div class="history-reference-grid">${version.references.map((picture) => {
    const previewPath = picture.markup?.renderedPath || picture.crop?.croppedPath || picture.absolutePath;
    const metadata = [picture.absolutePath, picture.crop ? `${picture.crop.x}, ${picture.crop.y} · ${picture.crop.width} × ${picture.crop.height}` : "", picture.markup?.summary, picture.mask?.maskPath].filter(Boolean).join(" · ");
    return `<figure><div class="history-reference-media image-media-loading" data-image-media data-image-media-surface="reference" data-image-media-source="${options.escapeHtml(picture.absolutePath)}" style="aspect-ratio:${picture.crop?.width || picture.width || 1}/${picture.crop?.height || picture.height || 1}">
      <img data-history-reference-preview="${options.escapeHtml(previewPath)}" data-image-media-image alt="Picture ${picture.pictureNumber}" loading="lazy">
      ${renderImageMediaStatus(options)}
      <div class="history-reference-badges">${picture.crop ? `<span>${options.t(uiKeys.create.markup.crop)}</span>` : ""}${picture.markup?.objectCount ? `<span>${options.t(uiKeys.history.detail.canvasMarkup, { count: picture.markup.objectCount })}</span>` : ""}${picture.mask?.regionCount ? `<span>Mask · ${picture.mask.regionCount}</span>` : ""}</div>
    <button type="button" class="history-reference-open" data-history-reference-open="${options.escapeHtml(previewPath)}" data-history-reference-original="${options.escapeHtml(picture.absolutePath)}" data-history-reference-kind="image" aria-label="${options.t(uiKeys.history.page.viewLarge)} · Picture ${picture.pictureNumber}"></button></div><figcaption title="${options.escapeHtml(metadata)}">Picture ${picture.pictureNumber} · ${picture.width || "?"} × ${picture.height || "?"} · ${options.escapeHtml(options.imageReferenceRoleLabel(picture.role ?? "auto"))}</figcaption></figure>`;
  }).join("")}</div>`;
}
