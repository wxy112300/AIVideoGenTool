import type {
  AppState,
  AssetVersion,
  HistoryAsset,
  HistoryFile,
  HistoryRating,
  ImageAssetVersion,
  ImageHistoryProject
} from "../../../types";
import type { HistoryKind } from "../../contracts";
import { uiKeys } from "../../../core/i18n-keys";
import {
  historyFilterIsActive,
  historyTagKey,
  type HistoryFilterState,
  type HistorySort
} from "../../../core/history-filter";
import { videoPromptForLoras } from "../../../core/video-loras";
import {
  renderHistoryHeading,
  renderImageMediaStatus,
  renderImageLightboxMarkup,
  renderImageReferenceSnapshotMarkup,
  renderH3TokenCountMarkup,
  renderPerformanceStatsMarkup,
  renderVideoInputSnapshotMarkup,
  renderVideoLoraSnapshotMarkup
} from "./fragments";

export type HistoryPageLayout = "masonry" | "album";

export interface HistoryPageViewModel {
  state: AppState;
  historyKind: HistoryKind;
  historyLayout: HistoryPageLayout;
  historyFilter: HistoryFilterState;
  historyFilterPanelOpen: boolean;
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
  t: import("../../../core/i18n").Translate;
  uiLocale?: string;
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
  historyAssetsByNewest(history: AppState["history"], filter?: HistoryFilterState): AppState["history"];
  imageProjectsByNewest(imageHistory: AppState["imageHistory"], filter?: HistoryFilterState): ImageHistoryProject[];
  historyFilterModelIds(state: AppState, kind: HistoryKind): string[];
  historyFilterTagNames(state: AppState, kind: HistoryKind): string[];
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

function ratingOptions(
  options: Pick<HistoryPageOptions, "t">,
  selected: number | null,
  placeholder: string,
  attribute: string
): string {
  return `<select class="history-filter-select" data-history-filter-field="${attribute}" aria-label="${options.t(uiKeys.history.filter.rating)}">${[
    `<option value="">${options.t(placeholder)}</option>`,
    ...[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((value) => `<option value="${value}" ${selected === value ? "selected" : ""}>${value} ★</option>`)
  ].join("")}</select>`;
}

function renderHistoryCardCuration(
  rating: HistoryRating | null,
  favorite: boolean,
  options: Pick<HistoryPageOptions, "icon" | "escapeHtml" | "t">
): string {
  if (rating === null && !favorite) return "";
  const label = `${rating === null ? "" : `${rating} ★`}${favorite ? ` · ${options.t(uiKeys.history.filter.favoriteOnly)}` : ""}`;
  return `<span class="history-card-curation-display" aria-label="${options.escapeHtml(label)}">${rating === null ? "" : `<span class="history-card-rating-value">${rating} ★</span>`}${favorite ? `<span class="history-card-favorite-mark" title="${options.escapeHtml(options.t(uiKeys.history.filter.favoriteOnly))}">${options.icon("heart")}</span>` : ""}</span>`;
}

function renderHistoryRatingControl(
  assetId: string,
  rating: HistoryRating | null,
  options: Pick<HistoryPageOptions, "t" | "escapeHtml">
): string {
  const current = rating ?? 0;
  const stars = [1, 2, 3, 4, 5].map((value) => {
    const state = current >= value ? "is-full" : current === value - 0.5 ? "is-half" : "";
    return `<button type="button" class="history-rating-star ${state}" data-history-rating-star="${options.escapeHtml(assetId)}" data-history-rating-value="${value}" aria-pressed="${current >= value}" aria-label="${value} ★">★</button>`;
  }).join("");
  return `<div class="history-rating-control" data-history-rating-control="${options.escapeHtml(assetId)}" data-history-rating-current="${current}" role="group" aria-label="${options.escapeHtml(options.t(uiKeys.history.filter.rating))}"><div class="history-rating-stars">${stars}</div><span class="history-rating-value" data-history-rating-value-label>${current ? `${current} / 5` : options.t(uiKeys.history.filter.ratingUnset)}</span><button type="button" class="history-rating-clear" data-history-rating-clear="${options.escapeHtml(assetId)}" ${current ? "" : "disabled"} aria-label="${options.escapeHtml(options.t(uiKeys.history.filter.clear))}" title="${options.escapeHtml(options.t(uiKeys.history.filter.clear))}">×</button></div>`;
}

function historyPlayerLanguage(options: Pick<HistoryPageOptions, "uiLocale">): string {
  return options.uiLocale === "en-US" || options.uiLocale === "zh-TW"
    ? options.uiLocale
    : "zh-CN";
}

function renderHistoryVideoPlayer(
  asset: HistoryAsset,
  version: AssetVersion,
  mediaUrl: string,
  videoFileName: string,
  detailTitle: string,
  historyIndex: number,
  historyCount: number,
  previousAsset: HistoryAsset | undefined,
  nextAsset: HistoryAsset | undefined,
  options: HistoryPageOptions
): string {
  const positionLabel = options.t(uiKeys.history.page.position, {
    current: historyIndex + 1,
    total: historyCount
  });
  const favoriteLabel = options.t(
    asset.favorite ? uiKeys.history.page.unfavorite : uiKeys.history.page.favorite
  );
  const previousLabel = options.t(uiKeys.history.page.previous);
  const nextLabel = options.t(uiKeys.history.page.next);
  const downloadLabel = options.t(uiKeys.history.page.download);
  const playbackSpeedLabel = options.t(uiKeys.history.page.playbackSpeed);
  const pictureInPictureLabel = options.t(uiKeys.history.page.pictureInPicture);
  const previousTitle = previousAsset
    ? `${previousLabel}：${options.escapeHtml(previousAsset.title)} · Page Up`
    : options.t(uiKeys.history.page.firstItem);
  const nextTitle = nextAsset
    ? `${nextLabel}：${options.escapeHtml(nextAsset.title)} · Page Down`
    : options.t(uiKeys.history.page.lastItem);
  const playerMeta = [
    options.modelName(version.modelId),
    `${version.width} × ${version.height}`,
    `${version.fps} FPS`,
    version.ratio ?? options.historyResolutionLabel(asset, version)
  ].filter((value): value is string => Boolean(value));
  const playerMetaLabel = playerMeta.join(" · ");
  const playerPositionLabel = `${historyIndex + 1} / ${historyCount}`;

  return `<media-controller id="history-player" class="panel history-player" style="--video-aspect: ${version.width} / ${version.height}" autohide="1" lang="${historyPlayerLanguage(options)}" fullscreenelement="history-player" hotkeys="noarrowleft noarrowright" aria-label="${options.escapeHtml(detailTitle)}">
    <video slot="media" loop playsinline preload="metadata" data-history-asset="${options.escapeHtml(asset.id)}" data-history-version="${options.escapeHtml(version.id)}" data-history-download-filename="${options.escapeHtml(videoFileName)}" src="${options.escapeHtml(mediaUrl)}"></video>
    <media-settings-menu id="history-player-settings" hidden anchor="auto" class="history-player-settings-menu">
      <media-chrome-menu-item data-history-player-menu-action="download">
        <span slot="prefix">${options.icon("download")}</span>
        ${options.escapeHtml(downloadLabel)}
      </media-chrome-menu-item>
      <media-settings-menu-item>
        <span slot="prefix">${options.icon("gauge")}</span>
        ${options.escapeHtml(playbackSpeedLabel)}
        <media-playback-rate-menu slot="submenu" hidden rates="0.5 0.75 1 1.25 1.5 2">
          <div slot="header">${options.escapeHtml(playbackSpeedLabel)}</div>
        </media-playback-rate-menu>
      </media-settings-menu-item>
      <media-chrome-menu-item data-history-player-menu-action="pip">
        <span slot="prefix">${options.icon("picture-in-picture-2")}</span>
        ${options.escapeHtml(pictureInPictureLabel)}
      </media-chrome-menu-item>
    </media-settings-menu>
    <div slot="top-chrome" class="history-player-info" data-history-player-info>
      <strong class="history-player-title" title="${options.escapeHtml(detailTitle)}">${options.escapeHtml(detailTitle)}</strong>
      <div class="history-player-meta" role="group" aria-label="${options.escapeHtml(playerMetaLabel)}">${playerMeta.map((value) => `<span>${options.escapeHtml(value)}</span>`).join("")}</div>
    </div>
    <media-control-bar class="history-player-control-bar">
      <div class="history-player-app-controls" data-history-player-actions aria-label="${options.escapeHtml(options.t(uiKeys.history.page.switchHistory))}">
        <button type="button" class="history-player-nav-button" data-history-navigation="-1" aria-keyshortcuts="PageUp" aria-label="${options.escapeHtml(previousLabel)}" ${previousAsset ? "" : "disabled"} title="${options.escapeHtml(previousTitle)}">${options.icon("arrow-left")}</button>
        <span class="history-player-inline-position" aria-label="${options.escapeHtml(positionLabel)}">${options.escapeHtml(playerPositionLabel)}</span>
        <button type="button" class="history-player-nav-button" data-history-navigation="1" aria-keyshortcuts="PageDown" aria-label="${options.escapeHtml(nextLabel)}" ${nextAsset ? "" : "disabled"} title="${options.escapeHtml(nextTitle)}">${options.icon("arrow-right")}</button>
      </div>
      <span class="history-player-control-divider history-player-transport-divider" aria-hidden="true"></span>
      <media-play-button></media-play-button>
      <media-time-display showduration notoggle></media-time-display>
      <media-time-range></media-time-range>
      <div class="history-player-volume">
        <media-mute-button></media-mute-button>
        <media-volume-range></media-volume-range>
      </div>
      <span class="history-player-control-divider history-player-utility-divider" aria-hidden="true"></span>
      <div class="history-player-utility-group">
        <div class="history-player-utility-controls" data-history-player-utility aria-label="${options.escapeHtml(favoriteLabel)}">
          <button type="button" class="history-favorite-button history-player-favorite-button ${asset.favorite ? "is-favorite" : ""}" data-history-favorite="${options.escapeHtml(asset.id)}" aria-pressed="${asset.favorite}" aria-label="${options.escapeHtml(favoriteLabel)}" title="${options.escapeHtml(favoriteLabel)}">${options.icon("heart")}</button>
        </div>
        <media-fullscreen-button></media-fullscreen-button>
        <media-settings-menu-button notooltip></media-settings-menu-button>
      </div>
    </media-control-bar>
  </media-controller>`;
}

function historySortOptions(
  options: Pick<HistoryPageOptions, "t">,
  selected: HistorySort,
  includeDuration: boolean
): string {
  const values: Array<[HistorySort, string]> = [
    ["newest", uiKeys.history.filter.sortNewest],
    ["oldest", uiKeys.history.filter.sortOldest],
    ["rating-desc", uiKeys.history.filter.sortRatingDesc],
    ["rating-asc", uiKeys.history.filter.sortRatingAsc]
  ];
  if (includeDuration) {
    values.push(
      ["duration-desc", uiKeys.history.filter.sortDurationDesc],
      ["duration-asc", uiKeys.history.filter.sortDurationAsc]
    );
  }
  return values.map(([value, key]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${options.t(key)}</option>`).join("");
}

function renderHistoryFilter(
  viewModel: HistoryPageViewModel,
  options: HistoryPageOptions,
  totalCount: number,
  visibleCount: number,
  modelIds: string[],
  tagNames: string[]
): string {
  const filter = viewModel.historyFilter;
  const active = historyFilterIsActive(filter);
  const isVideo = viewModel.historyKind === "video";
  const selectedTags = new Set(filter.tags.map(historyTagKey));
  return `
    <div class="history-filter-anchor" data-history-filter-anchor>
      <div class="history-filter-bar">
        <button type="button" class="ghost icon-button history-filter-toggle" data-history-filter-toggle aria-expanded="${viewModel.historyFilterPanelOpen}" aria-label="${options.t(uiKeys.history.filter.button)}" title="${options.t(uiKeys.history.filter.button)}">${options.icon("sliders-horizontal")}${active ? `<span class="history-filter-active-dot" title="${options.t(uiKeys.history.filter.active)}"></span>` : ""}</button>
        <span class="history-filter-result" title="${options.t(uiKeys.history.filter.result, { visible: visibleCount, total: totalCount })}">${visibleCount}/${totalCount}</span>
      </div>
      <div class="history-filter-panel${viewModel.historyFilterPanelOpen ? " is-open" : ""}" data-history-filter-panel ${viewModel.historyFilterPanelOpen ? "" : "hidden"}>
        <div class="history-filter-panel-heading"><strong>${options.t(uiKeys.history.filter.button)}</strong><span>${options.t(uiKeys.history.filter.result, { visible: visibleCount, total: totalCount })}</span></div>
        <div class="history-filter-form">
          <label class="history-filter-field"><span>${options.t(uiKeys.history.filter.sort)}</span><select data-history-filter-field="sort" aria-label="${options.t(uiKeys.history.filter.sort)}">${historySortOptions(options, filter.sort, isVideo)}</select></label>
          <label class="history-filter-switch"><span class="history-filter-switch-copy">${options.icon("heart")}<span>${options.t(uiKeys.history.filter.favoriteOnly)}</span></span><input type="checkbox" data-history-filter-field="favoriteOnly" ${filter.favoriteOnly ? "checked" : ""}><span class="history-ios-switch" aria-hidden="true"></span></label>
          <label class="history-filter-field history-filter-rating-field"><span>${options.t(uiKeys.history.filter.rating)}</span><span class="history-filter-range">${ratingOptions(options, filter.minRating, "history.filter.ratingAny", "minRating")}<span aria-hidden="true">–</span>${ratingOptions(options, filter.maxRating, "history.filter.ratingAny", "maxRating")}</span></label>
          ${isVideo ? `<label class="history-filter-field"><span>${options.t(uiKeys.history.filter.durationMin)}</span><select class="history-filter-select" data-history-filter-field="minDuration"><option value="">${options.t(uiKeys.history.filter.durationAny)}</option>${[1, 3, 5, 10, 15, 30, 60].map((value) => `<option value="${value}" ${filter.minDuration === value ? "selected" : ""}>${value} 秒</option>`).join("")}</select></label>` : ""}
          <label class="history-filter-field"><span>${options.t(uiKeys.history.filter.model)}</span><select class="history-filter-select history-filter-model" data-history-filter-field="modelId"><option value="">${options.t(uiKeys.history.filter.all)}</option>${modelIds.map((id) => `<option value="${options.escapeHtml(id)}" ${filter.modelId === id ? "selected" : ""}>${options.escapeHtml(options.modelName(id))}</option>`).join("")}</select></label>
          ${tagNames.length ? `<div class="history-filter-field history-filter-tags-field"><span>${options.t(uiKeys.history.filter.tags)}</span><div class="history-filter-tags" role="group" aria-label="${options.escapeHtml(options.t(uiKeys.history.filter.tags))}">${tagNames.map((tag) => `<button type="button" class="history-filter-tag ${selectedTags.has(historyTagKey(tag)) ? "is-selected" : ""}" data-history-filter-tag="${options.escapeHtml(tag)}" aria-pressed="${selectedTags.has(historyTagKey(tag))}">${options.escapeHtml(tag)}</button>`).join("")}</div></div>` : ""}
        </div>
        <div class="history-filter-panel-footer"><button type="button" class="ghost history-filter-clear" data-history-filter-clear ${active ? "" : "disabled"}>${options.icon("x")}${options.t(uiKeys.history.filter.clear)}</button></div>
      </div>
    </div>`;
}

function renderHistoryTags(
  assetId: string,
  tags: string[],
  availableTags: string[],
  options: Pick<HistoryPageOptions, "t" | "icon" | "escapeHtml">
): string {
  const tagMarkup = tags.length
    ? tags.map((tag) => `<span class="history-tag-chip" data-history-tag-chip="${options.escapeHtml(tag)}"><button type="button" class="history-tag-chip-label" data-history-tag-edit="${options.escapeHtml(tag)}" title="${options.escapeHtml(options.t(uiKeys.history.tags.edit))}">${options.escapeHtml(tag)}</button><button type="button" class="history-tag-chip-remove" data-history-tag-remove="${options.escapeHtml(tag)}" aria-label="${options.escapeHtml(options.t(uiKeys.history.tags.remove))}" title="${options.escapeHtml(options.t(uiKeys.history.tags.remove))}">${options.icon("x")}</button></span>`).join("")
    : `<span class="history-tags-empty">${options.t(uiKeys.history.tags.empty)}</span>`;
  const suggestions = availableTags.filter((tag) => !tags.some((current) => historyTagKey(current) === historyTagKey(tag)));
  return `<section class="panel history-detail-tags" data-history-tags-root data-history-tag-asset="${options.escapeHtml(assetId)}">
    <div class="history-detail-tags-heading"><div><h2>${options.t(uiKeys.history.tags.title)}</h2><p class="muted tiny">${options.t(uiKeys.history.tags.description)}</p></div><button type="button" class="ghost button-with-icon history-tag-add" data-history-tag-add>${options.icon("plus")}${options.t(uiKeys.history.tags.add)}</button></div>
    <div class="history-tag-list" data-history-tag-list>${tagMarkup}</div>
    <div class="history-tag-editor" data-history-tag-editor hidden>
      <div class="history-tag-editor-row"><input type="text" data-history-tag-input maxlength="64" placeholder="${options.escapeHtml(options.t(uiKeys.history.tags.placeholder))}" autocomplete="off"><button type="button" class="ghost history-tag-editor-cancel" data-history-tag-cancel>${options.t(uiKeys.history.tags.cancel)}</button></div>
      <div class="history-tag-suggestions" data-history-tag-suggestions>${suggestions.map((tag) => `<button type="button" class="history-tag-suggestion" data-history-tag-suggestion="${options.escapeHtml(tag)}">${options.escapeHtml(tag)}</button>`).join("")}</div>
    </div>
  </section>`;
}

function historyComputeMode(version: AssetVersion, options: HistoryPageOptions): string {
  if (version.spectrumMode === "off") {
    return options.t(uiKeys.history.page.nativeCompute);
  }
  if (version.spectrumMode !== "balanced") {
    return options.t(uiKeys.history.detail.legacyNotSaved);
  }
  const spectrumLabel = options.t(uiKeys.history.page.spectrumBalanced);
  return version.spectrumModelAwareMode && version.spectrumModelAwareMode !== "off"
    ? `${spectrumLabel} · ${options.t(uiKeys.queue.card.modelAware, { mode: version.spectrumModelAwareMode })}`
    : spectrumLabel;
}

export function renderImageHistoryPage(
  viewModel: HistoryPageViewModel,
  options: HistoryPageOptions
): string {
  const projects = options.imageProjectsByNewest(viewModel.state.imageHistory, viewModel.historyFilter);
  const modelIds = options.historyFilterModelIds(viewModel.state, "image");
  const tagNames = options.historyFilterTagNames(viewModel.state, "image");
  const cards = projects.map((project, historyOrder) => {
    const version = options.preferredImageVersion(project);
    const mediaUrl = options.imageHistoryMediaUrl(project, version);
    const sourcePath = version.file.absolutePath ?? "";
    const title = project.title.trim() || options.t(uiKeys.history.card.untitledImage);
    const iterationCount = Math.max(0, project.versions.filter((item) => item.kind !== "source").length);
    return `
      <article class="history-gallery-item panel image-history-gallery-item" data-history="${options.escapeHtml(project.id)}" data-open-image-history="${options.escapeHtml(project.id)}" data-history-kind="image" data-history-order="${historyOrder}" role="button" tabindex="0" aria-keyshortcuts="Enter Space" aria-label="${options.escapeHtml(title)}，${options.t(uiKeys.history.card.openDetailsContext)}">
        <div class="history-media image-history-media ${mediaUrl ? "image-media-loading" : "image-media-unavailable"}" data-image-media data-image-media-surface="gallery" data-image-media-source="${options.escapeHtml(sourcePath)}" style="--media-ratio:${version.width || 1} / ${version.height || 1}">
          ${mediaUrl
            ? `<img src="${options.escapeHtml(mediaUrl)}" data-image-media-url="${options.escapeHtml(mediaUrl)}" loading="lazy" alt="${options.escapeHtml(title)}" data-image-history-preview data-image-media-image data-image-history-cache-key="${options.escapeHtml(options.imageHistoryThumbnailCacheKey(project, version))}" data-image-history-source="${options.escapeHtml(sourcePath)}">`
            : ""}
          ${renderImageMediaStatus(options)}
          <div class="history-media-badges">
            <span class="media-chip history-model-chip">${options.escapeHtml(version.kind === "source" ? options.t(uiKeys.history.card.originalImage) : options.modelName(version.modelId))}</span>
            <span class="media-chip">${version.width > 0 && version.height > 0 ? `${version.width} × ${version.height}` : options.t(uiKeys.history.card.unknownSize)}</span>
            <span class="media-chip history-version-count-chip">${options.t(uiKeys.history.card.versionCount, { count: project.versions.length })}</span>
          </div>
          ${renderHistoryCardCuration(project.rating, project.favorite, options)}
          <span class="image-project-kind">${options.icon("workflow")}${iterationCount ? options.t(uiKeys.history.card.iterationCount, { count: iterationCount }) : options.t(uiKeys.history.card.originalAsset)}</span>
        </div>
        <div class="history-gallery-copy">
          <h3 class="history-card-title" title="${options.escapeHtml(title)}"><span class="history-card-title-track"><span>${options.escapeHtml(title)}</span><span aria-hidden="true">${options.escapeHtml(title)}</span></span></h3>
          <code class="history-card-filename">${options.escapeHtml(version.file.filename)}</code>
          <div class="history-card-meta"><span>${options.escapeHtml(options.formatFullHistoryTime(project.updatedAt || version.createdAt))}</span><span>${options.t(uiKeys.history.card.latestVersion, { version: version.versionNumber })}</span></div>
          <button type="button" class="ghost icon-button history-card-more" data-history-more aria-label="${options.escapeHtml(options.t(uiKeys.history.menu.shortcutActions))}" title="${options.escapeHtml(options.t(uiKeys.history.menu.shortcutActions))}">${options.icon("ellipsis")}</button>
        </div>
      </article>`;
  }).join("");
  return `
    ${renderHistoryHeading({
      activeCount: projects.length,
      historyKind: viewModel.historyKind,
      historyLayout: viewModel.historyLayout,
      description: options.t(uiKeys.history.imageDescription),
      historyFilter: renderHistoryFilter(viewModel, options, viewModel.state.imageHistory.length, projects.length, modelIds, tagNames)
    }, options)}
    <section id="history-panel-image" class="history-gallery ${viewModel.historyLayout}" role="tabpanel" aria-labelledby="history-tab-image">
      ${projects.length === 0
        ? `<div class="empty panel"><h2>${historyFilterIsActive(viewModel.historyFilter) ? options.t(uiKeys.history.filter.noResults) : options.t(uiKeys.history.card.imageEmptyTitle)}</h2><p>${historyFilterIsActive(viewModel.historyFilter) ? "" : options.t(uiKeys.history.card.imageEmptyDescription)}</p></div>`
        : cards}
    </section>`;
}

export function renderHistoryPage(
  viewModel: HistoryPageViewModel,
  options: HistoryPageOptions
): string {
  const orderedAssets = options.historyAssetsByNewest(viewModel.state.history, viewModel.historyFilter);
  const modelIds = options.historyFilterModelIds(viewModel.state, "video");
  const tagNames = options.historyFilterTagNames(viewModel.state, "video");
  const cards = orderedAssets.map((asset, historyOrder) => {
    const version = options.preferredVersion(asset);
    const historyTitle = asset.title.trim() || asset.prompt.trim() || options.t(uiKeys.history.card.untitledVideo);
    const videoIndex = options.versionVideoIndex(version);
    const mediaUrl = options.historyMediaUrl(asset, version);
    const coverKey = options.historyCoverCacheKey(asset, version);
    const coverSeed = options.historyCoverSeed(asset.id, version.id);
    const coverTime = options.historyInitialCoverTime(asset.duration, coverSeed);
    return `
      <article class="history-gallery-item panel" data-history="${asset.id}" data-open-history="${asset.id}" data-history-kind="video" data-history-order="${historyOrder}" role="button" tabindex="0" aria-keyshortcuts="Enter Space" aria-label="${options.escapeHtml(historyTitle)}，${options.t(uiKeys.history.card.openDetailsContext)}">
        <div class="history-media${mediaUrl ? " media-loading" : ""}" style="--media-ratio:${version.width} / ${version.height}" data-history-media data-cover-key="${options.escapeHtml(coverKey)}" data-cover-source="${options.escapeHtml(version.files[videoIndex]?.absolutePath ?? "")}" data-cover-time="${coverTime}" data-cover-seed="${coverSeed}" data-preview-duration="${asset.duration}">
          ${mediaUrl
            ? `<video muted loop playsinline preload="none" data-history-src="${options.escapeHtml(mediaUrl)}"></video>`
            : `<div class="history-media-fallback"><span>${options.icon("play")}</span><small>${options.t(uiKeys.history.card.missingVideo)}</small></div>`}
          ${mediaUrl ? `<img class="history-cover-image" data-history-cover-image="${asset.id}" alt="">` : ""}
          ${mediaUrl ? `<div class="history-media-loading" role="status"><span class="history-loading-spinner" aria-hidden="true"></span><small>${options.t(uiKeys.history.card.loadingCover)}</small></div>` : ""}
          ${mediaUrl ? `<div class="history-media-error" aria-live="polite"><span>${options.icon("film")}</span><small>${options.t(uiKeys.history.card.previewError)}</small></div>` : ""}
          <div class="history-media-badges">
            <span class="media-chip history-model-chip">${options.escapeHtml(options.modelName(version.modelId))}</span>
            <span class="media-chip">${options.historyResolutionLabel(asset, version)}</span>
            <span class="media-chip history-version-count-chip">${options.t(uiKeys.history.card.versionCount, { count: asset.versions.length })}</span>
            <span class="media-chip">${options.formatVideoDuration(asset.duration)}</span>
          </div>
          ${renderHistoryCardCuration(asset.rating, asset.favorite, options)}
          ${mediaUrl ? `<span class="history-preview-state">${options.icon("play")}${options.t(uiKeys.history.card.previewing)}</span><button type="button" class="history-preview-progress" role="slider" aria-label="${options.t(uiKeys.history.card.adjustPreview)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="${options.t(uiKeys.history.card.waitingVideoLoad)}"><i></i></button>` : ""}
        </div>
        <div class="history-gallery-copy">
          <h3 class="history-card-title" title="${options.escapeHtml(historyTitle)}"><span class="history-card-title-track"><span>${options.escapeHtml(historyTitle)}</span><span aria-hidden="true">${options.escapeHtml(historyTitle)}</span></span></h3>
          <code class="history-card-filename">${options.escapeHtml(version.files[videoIndex]?.filename ?? version.outputFilename)}</code>
          <div class="history-card-meta"><span>${options.escapeHtml(options.formatFullHistoryTime(version.createdAt))}</span><span>${options.t(uiKeys.history.card.rendered, { duration: options.escapeHtml(options.historyRenderDuration(version)) })}</span></div>
          <button type="button" class="ghost icon-button history-card-more" data-history-more aria-label="${options.escapeHtml(options.t(uiKeys.history.menu.shortcutActions))}" title="${options.escapeHtml(options.t(uiKeys.history.menu.shortcutActions))}">${options.icon("ellipsis")}</button>
        </div>
      </article>`;
  }).join("");
  return `
    ${renderHistoryHeading({
      activeCount: orderedAssets.length,
      historyKind: viewModel.historyKind,
      historyLayout: viewModel.historyLayout,
      description: options.t(uiKeys.history.videoDescription),
      historyFilter: renderHistoryFilter(viewModel, options, viewModel.state.history.length, orderedAssets.length, modelIds, tagNames)
    }, options)}
    <section id="history-panel-video" class="history-gallery ${viewModel.historyLayout}" role="tabpanel" aria-labelledby="history-tab-video">
      ${orderedAssets.length === 0
        ? `<div class="empty panel"><h2>${historyFilterIsActive(viewModel.historyFilter) ? options.t(uiKeys.history.filter.noResults) : options.t(uiKeys.history.card.videoEmptyTitle)}</h2><p>${historyFilterIsActive(viewModel.historyFilter) ? "" : options.t(uiKeys.history.card.videoEmptyDescription)}</p></div>`
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
  const jointAvArtifact = version.h3ContinuationData?.status === "available"
    ? version.h3ContinuationData.artifact
    : undefined;
  const jointAvSummary = jointAvArtifact
    ? `<span class="history-joint-av-indicator">JointAV</span>`
    : "";
  const fileIdentity = (file: HistoryFile): string => file.absolutePath || `${file.subfolder}/${file.filename}`;
  const jointAvPayloadIdentity = jointAvArtifact ? fileIdentity(jointAvArtifact.payload) : "";
  const outputFiles = [...version.files];
  for (const file of jointAvArtifact ? [jointAvArtifact.payload, jointAvArtifact.manifest] : []) {
    const identity = fileIdentity(file);
    if (!outputFiles.some((candidate) =>
      fileIdentity(candidate) === identity
    )) {
      outputFiles.push(file);
    }
  }
  const orderedHistory = options.historyAssetsByNewest(viewModel.state.history, viewModel.historyFilter);
  const historyIndex = orderedHistory.findIndex((item) => item.id === asset.id);
  const previousAsset = historyIndex > 0 ? orderedHistory[historyIndex - 1] : undefined;
  const nextAsset = historyIndex >= 0 ? orderedHistory[historyIndex + 1] : undefined;
  const detailTitle = asset.title.trim() || asset.prompt.trim() || options.t(uiKeys.history.card.untitledVideo);
  const completedAt = options.formatFullHistoryTime(version.createdAt);
  const fps = version.fps;
  const performanceStats = version.performanceStats;
  const executionPrompt = videoPromptForLoras(
    asset.prompt,
    version.videoLoras ?? asset.videoLoras
  );
  const elapsedSeconds = version.startedAt
    ? Math.max(0, (new Date(version.createdAt).getTime() - new Date(version.startedAt).getTime()) / 1000)
    : null;
  const availableTags = options.historyFilterTagNames(viewModel.state, "video");
  const videoEditAction = (variant: "primary" | "secondary") => retiredModel ? "" : `<button class="${variant} button-with-icon" data-edit-history="${asset.id}" aria-label="${options.t(uiKeys.history.page.adjustInCreate)}" title="${options.t(uiKeys.history.page.adjustInCreate)}">${options.icon("sliders-horizontal")}${options.t(uiKeys.history.page.adjustInCreate)}</button>`;
  const videoContinueAction = (variant: "primary" | "secondary") => !retiredModel && videoFile?.absolutePath ? `<button class="${variant} button-with-icon" data-continue-history="${asset.id}" data-source-version="${version.id}" aria-label="${options.t(uiKeys.history.page.continueCreation)}" title="${options.t(uiKeys.history.page.continueCreation)}">${options.icon("video")}${options.t(uiKeys.history.page.continueCreation)}</button>` : "";
  const videoCopyAction = videoFile?.absolutePath ? `<button class="secondary button-with-icon" data-copy-file="${options.escapeHtml(videoFile.absolutePath)}" aria-label="${options.t(uiKeys.history.menu.copyFile)}" title="${options.t(uiKeys.history.menu.copyFile)}">${options.icon("copy")}${options.t(uiKeys.history.menu.copyFile)}</button>` : "";
  const videoLocateAction = videoFile?.absolutePath ? `<button class="secondary button-with-icon history-file-action" data-show-file="${options.escapeHtml(videoFile.absolutePath)}" aria-label="${options.t(uiKeys.history.menu.openFolder)}" title="${options.t(uiKeys.history.page.locateFile)}">${options.icon("folder-open")}${options.t(uiKeys.history.page.locateFile)}</button>` : "";
  const videoUpscaleAction = `<button class="secondary button-with-icon" data-open-upscale ${videoFile?.absolutePath && options.versionShortEdge(version) < 2160 ? "" : "disabled"}>${options.icon("maximize-2")}${options.versionShortEdge(version) >= 2160 ? options.t(uiKeys.history.page.current4k) : options.t(uiKeys.history.page.improveResolution)}</button>`;
  const videoDeleteVersionAction = asset.versions.length > 1
    ? `<button class="secondary danger history-delete-version-button button-with-icon" data-delete-history-version="${options.escapeHtml(asset.id)}" data-history-version-delete-id="${options.escapeHtml(version.id)}" aria-label="${options.t(uiKeys.history.page.deleteCurrentVersion)}" title="${options.t(uiKeys.history.page.deleteCurrentVersion)}">${options.icon("trash-2")}${options.t(uiKeys.history.page.deleteCurrentVersion)}</button>`
    : "";
  const videoDeleteAction = `<button class="secondary danger history-delete-button button-with-icon" data-delete-history="${asset.id}">${options.icon("trash-2")}${options.t(uiKeys.history.page.deleteVideoRecord)}</button>`;
  const videoHasContinueAction = Boolean(videoContinueAction("primary"));
  const videoPrimaryAction = videoHasContinueAction ? videoContinueAction("primary") : videoEditAction("primary");
  const videoSecondaryActions = [
    videoHasContinueAction ? videoEditAction("secondary") : "",
    videoLocateAction,
    videoUpscaleAction
  ].filter(Boolean).join("");
  const videoMoreActions = [videoCopyAction, videoDeleteVersionAction, videoDeleteAction].filter(Boolean).join("");
  return `
    <div class="history-detail-back">
      <button class="secondary button-with-icon history-detail-back-button" data-page="history">${options.icon("arrow-left")}${options.t(uiKeys.history.page.back)}</button>
      <div class="history-detail-tools">
        <span>${options.t(uiKeys.history.page.readonlySnapshot)}</span>
        <span class="history-detail-position" aria-label="${options.t(uiKeys.history.page.position, { current: historyIndex + 1, total: orderedHistory.length })}">${options.t(uiKeys.history.page.position, { current: historyIndex + 1, total: orderedHistory.length })}</span>
        <div class="history-detail-navigation" aria-label="${options.t(uiKeys.history.page.switchHistory)}">
          <button class="ghost history-detail-nav-button" data-history-navigation="-1" aria-keyshortcuts="PageUp" ${previousAsset ? "" : "disabled"} title="${previousAsset ? `${options.t(uiKeys.history.page.previous)}：${options.escapeHtml(previousAsset.title)} · Page Up` : options.t(uiKeys.history.page.firstItem)}"><span class="history-detail-nav-label">${options.icon("arrow-left")}${options.t(uiKeys.history.page.previous)}</span><span class="history-detail-nav-shortcut"><kbd>Page Up</kbd></span></button>
          <button class="ghost history-detail-nav-button" data-history-navigation="1" aria-keyshortcuts="PageDown" ${nextAsset ? "" : "disabled"} title="${nextAsset ? `${options.t(uiKeys.history.page.next)}：${options.escapeHtml(nextAsset.title)} · Page Down` : options.t(uiKeys.history.page.lastItem)}"><span class="history-detail-nav-label">${options.t(uiKeys.history.page.next)}${options.icon("arrow-right")}</span><span class="history-detail-nav-shortcut"><kbd>Page Down</kbd></span></button>
        </div>
      </div>
    </div>
    <section class="history-detail-hero">
      <div class="history-player-column">
        ${mediaUrl
          ? renderHistoryVideoPlayer(asset, version, mediaUrl, videoFile?.filename ?? version.outputFilename, detailTitle, historyIndex, orderedHistory.length, previousAsset, nextAsset, options)
          : `<div class="panel history-player" style="--video-aspect: ${version.width} / ${version.height}"><div class="history-media-fallback"><span>${options.icon("play")}</span><strong>${options.t(uiKeys.history.page.videoUnavailable)}</strong><small>${options.t(uiKeys.history.page.checkOutputDirectory)}</small></div></div>`}
      </div>
      <aside class="history-detail-sidebar">
        <section class="panel history-summary">
          <div class="history-summary-copy">
          <div class="history-title-line"><h1 class="history-detail-title" title="${options.escapeHtml(detailTitle)}"><span class="history-card-title-track"><span>${options.escapeHtml(detailTitle)}</span><span aria-hidden="true">${options.escapeHtml(detailTitle)}</span></span></h1><span class="status running">${options.t(uiKeys.history.page.completed)}</span></div>
          <code>${options.escapeHtml(videoFile?.filename ?? asset.outputFilename)}</code>
          <div class="history-summary-badges"><span class="model-badge">${options.escapeHtml(options.modelName(version.modelId))}</span><span>${version.kind === "original" ? options.t(uiKeys.history.page.originalGeneration) : options.t(uiKeys.history.page.upscaleVersion)}</span>${jointAvSummary}</div>
          <div class="history-detail-curation"><button type="button" class="history-favorite-button ${asset.favorite ? "is-favorite" : ""}" data-history-favorite="${options.escapeHtml(asset.id)}" aria-pressed="${asset.favorite}" aria-label="${options.t(asset.favorite ? uiKeys.history.page.unfavorite : uiKeys.history.page.favorite)}" title="${options.t(asset.favorite ? uiKeys.history.page.unfavorite : uiKeys.history.page.favorite)}">${options.icon("heart")}</button>${renderHistoryRatingControl(asset.id, asset.rating, options)}</div>
          </div>
          <div class="history-overview-facts">
          <div><span>${options.t(uiKeys.history.page.completedAt)}</span><strong>${completedAt}</strong></div>
          <div><span>${options.t(uiKeys.history.page.generationTime)}</span><strong>${elapsedSeconds == null ? options.t(uiKeys.history.detail.legacyNotSaved) : options.formatElapsedDuration(elapsedSeconds)}</strong></div>
          <div><span>${options.t(uiKeys.history.page.resolution)}</span><strong>${version.width} × ${version.height}</strong></div>
          <div><span>${options.t(uiKeys.history.page.videoDuration)}</span><strong>${options.formatVideoDuration(version.duration)}</strong></div>
          <div><span>${options.t(uiKeys.history.page.finalFps)}</span><strong>${fps} FPS</strong></div>
          <div><span>${options.t(uiKeys.history.page.finalFrames)}</span><strong>${Math.round(version.duration * fps)} ${options.t(uiKeys.history.detail.frames)}</strong></div>
          </div>
          <div class="history-detail-quick-actions">
           ${videoPrimaryAction ? `<div class="history-detail-action-primary">${videoPrimaryAction}</div>` : ""}
          ${videoSecondaryActions ? `<div class="history-detail-action-secondary">${videoSecondaryActions}</div>` : ""}
            ${videoMoreActions ? `<div class="history-detail-more-actions" role="group" aria-label="${options.t(uiKeys.history.menu.shortcutActions)}">${videoMoreActions}</div>` : ""}
          </div>
        </section>
        <section class="panel history-version-panel">
          <div class="history-version-panel-heading"><strong>${options.t(uiKeys.history.page.videoVersions)}</strong><span>${options.t(uiKeys.history.card.versionCount, { count: asset.versions.length })}</span></div>
            <div class="version-switcher history-summary-version-switcher" role="group" aria-label="${options.t(uiKeys.history.page.videoVersions)}">${asset.versions.map((item) => `<button type="button" class="${item.id === version.id ? "primary" : "ghost"}" data-version-id="${item.id}" aria-pressed="${item.id === version.id}" title="${item.kind === "original" ? `${options.t(uiKeys.history.page.originalGeneration)} · ${item.width} × ${item.height}` : `${options.modelName(item.modelId)} · ${item.width} × ${item.height}`}"${item.kind === "original" ? `>${options.t(uiKeys.history.card.originalShort)} · ${options.historyResolutionLabel(asset, item)}` : `>${options.t(uiKeys.history.card.upscaleShort)} · ${options.historyResolutionLabel(asset, item)}`}</button>`).join("")}</div>
        </section>
      </aside>
    </section>
    ${renderHistoryTags(asset.id, asset.tags, availableTags, options)}
    <section class="history-record-section" aria-labelledby="history-generation-record-title">
      <div class="history-record-section-heading"><h2 id="history-generation-record-title">${options.t(uiKeys.history.page.generationRecord)}</h2><span class="history-record-section-meta">${options.t(version.kind === "original" ? uiKeys.history.page.originalGeneration : uiKeys.history.page.upscaleVersion)} · ${options.escapeHtml(options.modelName(version.modelId))}</span></div>
      <section class="history-record-grid">
      <article class="panel history-record full">
        <div class="history-record-heading"><h2>${options.t(uiKeys.history.page.promptHeading)}</h2><button class="ghost button-with-icon" data-copy-prompt>${options.icon("copy")}${options.t(uiKeys.history.page.copyPrompt)}</button></div>
        <span class="muted">${options.t(uiKeys.history.page.fullPrompt)}</span><div class="history-prompt-scroll" tabindex="0" aria-label="${options.t(uiKeys.history.page.fullPrompt)}"><p class="history-prompt">${options.escapeHtml(executionPrompt)}</p></div>
      </article>
      <article class="panel history-record">
        <h2>${options.t(uiKeys.history.page.generationParams)}</h2>
        <dl><dt>${options.t(uiKeys.history.page.model)}</dt><dd>${options.escapeHtml(options.modelName(version.modelId))}</dd><dt>${options.t(uiKeys.history.page.promptVersion)}</dt><dd>${version.promptVersion ?? asset.promptVersion ?? options.t(uiKeys.history.detail.legacyNotSaved)}</dd>${renderH3TokenCountMarkup(performanceStats, options)}${version.kind === "upscale" ? `<dt>${options.t(uiKeys.history.page.tileMode)}</dt><dd>${options.escapeHtml(version.tileMode ?? options.t(uiKeys.history.detail.legacyNotSaved))}</dd><dt>${options.t(uiKeys.history.page.faceRestore)}</dt><dd>${version.faceRestore == null ? options.t(uiKeys.history.detail.legacyNotSaved) : version.faceRestore ? options.t(uiKeys.history.page.enabled) : options.t(uiKeys.history.page.disabled)}</dd>` : `<dt>${options.t(uiKeys.history.page.samplingSteps)}</dt><dd>${version.steps ?? options.t(uiKeys.history.page.workflowDefault)}</dd><dt>${options.t(uiKeys.history.page.attention)}</dt><dd>${options.escapeHtml(version.attentionMode ?? asset.attentionMode ?? options.t(uiKeys.history.detail.legacyNotSaved))}</dd><dt>${options.t(uiKeys.history.page.computeMode)}</dt><dd>${options.escapeHtml(historyComputeMode(version, options))}</dd><dt>${options.t(uiKeys.history.page.motion)}</dt><dd>${options.escapeHtml(version.motion ?? asset.motion ?? options.t(uiKeys.history.detail.legacyNotSaved))}</dd>`}<dt>${options.t(uiKeys.history.page.seed)}</dt><dd><code>${version.seed ?? options.t(uiKeys.history.page.notApplicable)}</code></dd><dt>${options.t(uiKeys.history.page.workflow)}</dt><dd><code>${options.escapeHtml(version.workflowPath || options.t(uiKeys.history.detail.legacyNotSaved))}</code></dd><dt>ComfyUI Prompt ID</dt><dd><code>${options.escapeHtml(version.comfyPromptId)}</code></dd></dl>
      </article>
      <article class="panel history-record">
        <h2>${options.t(uiKeys.history.page.videoOutput)}</h2>
        <dl><dt>${options.t(uiKeys.history.page.resolution)}</dt><dd>${options.historyResolutionLabel(asset, version)} · ${version.width} × ${version.height}</dd><dt>${options.t(uiKeys.history.page.aspectRatio)}</dt><dd>${options.escapeHtml(version.ratio ?? asset.ratio ?? options.t(uiKeys.history.detail.legacyNotSaved))}</dd><dt>${options.t(uiKeys.history.page.versionType)}</dt><dd>${version.kind === "original" ? options.t(uiKeys.history.page.originalGeneration) : options.t(uiKeys.history.page.upscaleVersion)}</dd><dt>${options.t(uiKeys.history.page.videoDuration)}</dt><dd>${options.formatVideoDuration(version.duration)}</dd><dt>${options.t(uiKeys.history.page.finalFps)}</dt><dd>${fps} FPS</dd><dt>${options.t(uiKeys.history.page.frameProcessing)}</dt><dd>${options.escapeHtml(version.frameInterpolation ?? asset.frameInterpolation ?? options.t(uiKeys.history.detail.legacyNotSaved))}</dd><dt>${options.t(uiKeys.history.page.finalFrames)}</dt><dd>${Math.round(version.duration * fps)}</dd><dt>${options.t(uiKeys.history.page.outputDirectory)}</dt><dd><code>${options.escapeHtml(videoFile?.absolutePath ?? viewModel.state.settings.outputDirectory)}</code></dd></dl>
      </article>
      <article class="panel history-record">
        <div class="history-record-heading"><h2>${options.t(uiKeys.history.page.loraStack)}</h2><span>${options.t(uiKeys.history.card.count, { count: version.videoLoras?.length ?? asset.videoLoras?.length ?? 0 })}</span></div>
        ${renderVideoLoraSnapshotMarkup(version.videoLoras ?? asset.videoLoras ?? [], options)}
      </article>
      <article class="panel history-record">
        <div class="history-record-heading"><h2>${options.t(uiKeys.history.page.inputMedia)}</h2><span>${options.t(uiKeys.history.page.submittedSnapshot)}</span></div>
        ${renderVideoInputSnapshotMarkup(asset, options)}
      </article>
      <article class="panel history-record full history-performance-record">
        <div class="history-record-heading"><h2>${options.t(uiKeys.history.page.runtimeStats)}</h2><span class="muted">${options.t(uiKeys.history.page.lowFrequencySummary)}</span></div>
        ${renderPerformanceStatsMarkup(performanceStats, options)}
      </article>
      <article class="panel history-record full">
        <div class="history-record-heading"><h2>${options.t(uiKeys.history.page.outputFiles)}</h2><span>${options.t(uiKeys.history.card.count, { count: outputFiles.length })}</span></div>
      <div class="output-files">
        ${outputFiles.length === 0
          ? `<p class="muted">${options.t(uiKeys.history.page.noRecognizedFiles)}</p>`
          : outputFiles.map((file) => {
              const identity = fileIdentity(file);
              const isJointAvPayload = identity === jointAvPayloadIdentity;
              const sizeBytes = file.sizeBytes ?? (isJointAvPayload ? jointAvArtifact?.payloadBytes : undefined);
              const sizeText = sizeBytes == null
                ? options.t(uiKeys.history.page.fileSizeUnknown)
                : options.formatBytes(sizeBytes);
              const locateAction = file.absolutePath
                ? `<button class="secondary button-with-icon" data-show-file="${options.escapeHtml(file.absolutePath)}">${options.icon("folder-open")}${options.t(uiKeys.history.page.showInExplorer)}</button>`
                : `<span class="muted">${options.t(uiKeys.history.page.fillOutputDirectory)}</span>`;
              const deleteAction = isJointAvPayload
                ? `<button class="secondary danger button-with-icon" data-delete-joint-av="${options.escapeHtml(asset.id)}" data-joint-av-version-id="${options.escapeHtml(version.id)}">${options.icon("trash-2")}${options.t(uiKeys.history.page.deleteJointAv)}</button>`
                : "";
              return `<div class="output-file"><div><strong>${options.escapeHtml(file.filename)}</strong><p class="muted">${options.escapeHtml(file.subfolder || ".")} · ${options.escapeHtml(file.type)} · ${options.escapeHtml(sizeText)}</p></div><div class="output-file-actions">${locateAction}${deleteAction}</div></div>`;
            }).join("")}
      </div>
        <details><summary>${options.t(uiKeys.history.page.rawSnapshot)}</summary><pre>${options.escapeHtml(JSON.stringify(version.comfyOutputs, null, 2))}</pre></details>
      </article>
      </section>
    </section>`;
}

function renderImageHistoryVersionThumb(
  project: ImageHistoryProject,
  item: ImageAssetVersion,
  pinnedVersion: ImageAssetVersion | undefined,
  selectedVersionId: string,
  options: HistoryPageOptions
): string {
  const mediaUrl = options.imageHistoryMediaUrl(project, item);
  const sourcePath = item.file.absolutePath ?? "";
  return `<button type="button" class="image-history-version-thumb ${item.id === selectedVersionId ? "active" : ""}" data-image-version-id="${options.escapeHtml(item.id)}" data-image-media data-image-media-surface="rail" data-image-media-source="${options.escapeHtml(sourcePath)}" aria-pressed="${item.id === selectedVersionId}" title="${options.t(uiKeys.history.version, { version: item.versionNumber })} · ${item.width} × ${item.height}">${mediaUrl ? `<img src="${options.escapeHtml(mediaUrl)}" data-image-media-url="${options.escapeHtml(mediaUrl)}" data-image-media-image loading="lazy" alt="">` : ""}${renderImageMediaStatus(options, false)}<span>${String(item.versionNumber).padStart(2, "0")}</span>${item.id === pinnedVersion?.id ? options.icon("circle-check") : ""}</button>`;
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
  const orderedProjects = options.imageProjectsByNewest(viewModel.state.imageHistory, viewModel.historyFilter);
  const projectIndex = orderedProjects.findIndex((item) => item.id === project.id);
  const previousProject = projectIndex > 0 ? orderedProjects[projectIndex - 1] : undefined;
  const nextProject = projectIndex >= 0 ? orderedProjects[projectIndex + 1] : undefined;
  const title = project.title.trim() || options.t(uiKeys.history.card.untitledImage);
  const mediaUrl = options.imageHistoryMediaUrl(project, version);
  const pinnedVersion = options.imageProjectCoverVersion(project);
  const parent = version.parentVersionId
    ? project.versions.find((item) => item.id === version.parentVersionId)
    : undefined;
  const elapsedSeconds = version.performanceStats?.durationSeconds ?? (version.startedAt
    ? Math.max(0, (Date.parse(version.createdAt) - Date.parse(version.startedAt)) / 1000)
    : null);
  const availableTags = options.historyFilterTagNames(viewModel.state, "image");
  const filePath = version.file.absolutePath ?? "";
  const generationSummary = options.imageHistoryGenerationSummary(version);
  const imageStartVideoAction = (variant: "primary" | "secondary") => `<button class="${variant} button-with-icon" data-image-continue-video-project="${options.escapeHtml(project.id)}" data-image-continue-video-version="${options.escapeHtml(version.id)}">${options.icon("video")}${options.t(uiKeys.history.page.startVideo)}</button>`;
  const imageContinueEditAction = (variant: "primary" | "secondary") => `<button class="${variant} button-with-icon" data-image-continue-edit-project="${options.escapeHtml(project.id)}" data-image-continue-edit-version="${options.escapeHtml(version.id)}">${options.icon("wand-sparkles")}${options.t(uiKeys.history.page.continueEdit)}</button>`;
  const imageCopyImageAction = filePath ? `<button class="secondary button-with-icon" data-copy-image="${options.escapeHtml(filePath)}">${options.icon("copy")}${options.t(uiKeys.history.page.copyImage)}</button>` : "";
  const imageCopyFileAction = filePath ? `<button class="secondary button-with-icon" data-copy-file="${options.escapeHtml(filePath)}">${options.icon("copy")}${options.t(uiKeys.history.menu.copyFile)}</button>` : "";
  const imageLocateAction = filePath ? `<button class="secondary button-with-icon" data-show-file="${options.escapeHtml(filePath)}">${options.icon("folder-open")}${options.t(uiKeys.history.page.openLocation)}</button>` : "";
  const imageSetCoverAction = `<button class="secondary button-with-icon" data-image-set-cover="${options.escapeHtml(project.id)}" data-image-cover-version="${pinnedVersion?.id === version.id ? "" : options.escapeHtml(version.id)}">${options.icon("image")}${pinnedVersion?.id === version.id ? options.t(uiKeys.history.page.restoreAutoCover) : options.t(uiKeys.history.page.setCover)}</button>`;
  const imageDeleteVersionAction = `<button class="secondary danger button-with-icon" data-delete-image-version="${options.escapeHtml(project.id)}" data-image-version-delete-id="${options.escapeHtml(version.id)}" ${version.kind === "source" ? "disabled" : ""}>${options.icon("trash-2")}${version.kind === "source" ? options.t(uiKeys.history.page.originalCannotDelete) : options.t(uiKeys.history.page.deleteCurrentVersion)}</button>`;
  const imageDeleteProjectAction = `<button class="secondary danger history-delete-project-action button-with-icon" data-delete-history="${options.escapeHtml(project.id)}">${options.icon("trash-2")}${options.t(uiKeys.history.page.deleteImageProject)}</button>`;
  const imagePrimaryAction = imageStartVideoAction("primary");
  const imageSecondaryActions = [imageContinueEditAction("secondary"), imageCopyImageAction, imageLocateAction].filter(Boolean).join("");
  const imageMoreActions = [imageCopyFileAction, imageSetCoverAction, imageDeleteVersionAction, imageDeleteProjectAction].filter(Boolean).join("");
  return `
    <div class="history-detail-back">
      <button class="secondary button-with-icon history-detail-back-button" data-page="history">${options.icon("arrow-left")}${options.t(uiKeys.history.page.imageBack)}</button>
      <div class="history-detail-tools">
        <span>${options.t(uiKeys.history.page.projectRetainVersions)}</span>
        <span class="history-detail-position" aria-label="${options.t(uiKeys.history.page.imagePosition, { current: projectIndex + 1, total: orderedProjects.length })}">${options.t(uiKeys.history.page.imagePosition, { current: projectIndex + 1, total: orderedProjects.length })}</span>
        <div class="history-detail-navigation" aria-label="${options.t(uiKeys.history.page.switchProjects)}">
          <button class="ghost history-detail-nav-button" data-history-navigation="-1" ${previousProject ? "" : "disabled"} title="${previousProject ? `${options.t(uiKeys.history.page.previous)}：${options.escapeHtml(previousProject.title)}` : options.t(uiKeys.history.page.firstItem)}"><span class="history-detail-nav-label">${options.icon("arrow-left")}${options.t(uiKeys.history.page.previous)}</span><span class="history-detail-nav-shortcut"><kbd>Page Up</kbd></span></button>
          <button class="ghost history-detail-nav-button" data-history-navigation="1" ${nextProject ? "" : "disabled"} title="${nextProject ? `${options.t(uiKeys.history.page.next)}：${options.escapeHtml(nextProject.title)}` : options.t(uiKeys.history.page.lastItem)}"><span class="history-detail-nav-label">${options.t(uiKeys.history.page.next)}${options.icon("arrow-right")}</span><span class="history-detail-nav-shortcut"><kbd>Page Down</kbd></span></button>
        </div>
      </div>
    </div>
    <section class="image-history-detail-layout">
      <section class="panel image-history-viewer-panel">
        <div class="image-history-viewer-grid">
          <aside class="image-history-version-rail">
            <div><h2>${options.t(uiKeys.history.page.versions)}</h2><p class="muted tiny">${options.t(uiKeys.history.page.newestFirst)}</p></div>
            <div class="image-history-version-list" role="group" aria-label="${options.t(uiKeys.history.page.versions)}">
              ${project.versions.map((item) => renderImageHistoryVersionThumb(project, item, pinnedVersion, version.id, options)).join("")}
            </div>
          </aside>
          <section class="image-history-stage-panel">
            <div class="image-history-stage-toolbar"><div><strong>${options.escapeHtml(version.file.filename)}</strong><p class="muted tiny">${options.t(uiKeys.history.version, { version: version.versionNumber })} · Seed ${version.seed ?? options.t(uiKeys.runtime.random)} · ${options.escapeHtml(version.kind === "source" ? options.t(uiKeys.history.card.originalImage) : options.modelName(version.modelId))}</p></div></div>
            <div class="image-history-stage ${mediaUrl ? "image-media-loading" : "image-media-unavailable"} ${version.width > version.height ? "is-wide" : "is-tall"}" data-image-media data-image-media-surface="detail" data-image-media-source="${options.escapeHtml(filePath)}" data-image-stage="fit" data-image-orientation="${version.width > version.height ? "wide" : "tall"}" style="--image-aspect:${version.width || 1} / ${version.height || 1}">
              ${mediaUrl ? `<img src="${options.escapeHtml(mediaUrl)}" data-image-media-url="${options.escapeHtml(mediaUrl)}" alt="${options.escapeHtml(title)} · ${options.t(uiKeys.history.version, { version: version.versionNumber })}" data-image-history-stage-image data-image-media-image>` : ""}
              ${renderImageMediaStatus(options)}
            </div>
            <div class="image-history-stage-controls" aria-label="${options.t(uiKeys.history.page.switchProjects)}">
              <button class="icon-button image-history-stage-nav" data-image-version-navigation="-1" ${previousVersion ? "" : "disabled"} title="${previousVersion ? `${options.t(uiKeys.history.page.previous)}：${options.t(uiKeys.history.version, { version: previousVersion.versionNumber })}` : options.t(uiKeys.history.page.earliestVersion)}" aria-label="${options.t(uiKeys.history.page.previous)}${options.t(uiKeys.history.page.versions)}">${options.icon("arrow-left")}</button>
              <button class="primary button-with-icon image-history-open-viewer" data-open-image-lightbox ${mediaUrl ? "" : "disabled"}>${options.icon("maximize-2")}${options.t(uiKeys.history.page.viewLarge)}</button>
              <button class="icon-button image-history-stage-nav" data-image-version-navigation="1" ${nextVersion ? "" : "disabled"} title="${nextVersion ? `${options.t(uiKeys.history.page.next)}：${options.t(uiKeys.history.version, { version: nextVersion.versionNumber })}` : options.t(uiKeys.history.page.lastItem)}" aria-label="${options.t(uiKeys.history.page.next)}${options.t(uiKeys.history.page.versions)}">${options.icon("arrow-right")}</button>
            </div>
          </section>
        </div>
      </section>
      <aside class="image-history-detail-sidebar">
        <section class="panel image-history-summary">
          <div class="status-line"><span class="badge ok">${options.t(uiKeys.history.version, { version: version.versionNumber })}${pinnedVersion?.id === version.id ? ` · ${options.t(uiKeys.history.page.currentCover)}` : ""}</span><span class="badge">PNG</span></div>
          <h2>${options.escapeHtml(title)}</h2>
          <div class="history-detail-curation"><button type="button" class="history-favorite-button ${project.favorite ? "is-favorite" : ""}" data-history-favorite="${options.escapeHtml(project.id)}" aria-pressed="${project.favorite}" aria-label="${options.t(project.favorite ? uiKeys.history.page.unfavorite : uiKeys.history.page.favorite)}" title="${options.t(project.favorite ? uiKeys.history.page.unfavorite : uiKeys.history.page.favorite)}">${options.icon("heart")}</button>${renderHistoryRatingControl(project.id, project.rating, options)}</div>
          <p class="muted tiny">${options.escapeHtml(version.prompt || (version.kind === "source" ? options.t(uiKeys.history.page.imageOriginalPrompt) : options.t(uiKeys.history.page.unsavedEditPrompt)))}</p>
          <div class="image-history-facts"><div><span>${options.t(uiKeys.history.page.model)}</span><strong>${options.escapeHtml(version.kind === "source" ? options.t(uiKeys.history.card.originalImage) : options.modelName(version.modelId))}</strong></div><div><span>${options.t(uiKeys.history.page.seed)}</span><strong>${version.seed ?? options.t(uiKeys.runtime.random)}</strong></div><div><span>${options.t(uiKeys.history.page.resolution)}</span><strong>${version.width} × ${version.height}</strong></div><div><span>${options.t(uiKeys.history.page.outputFormat)}</span><strong>${version.format.toUpperCase()}</strong></div><div><span>${options.t(uiKeys.history.page.generatedAt)}</span><strong>${options.escapeHtml(options.formatFullHistoryTime(version.createdAt))}</strong></div><div><span>${options.t(uiKeys.history.page.elapsed)}</span><strong>${elapsedSeconds == null ? options.t(uiKeys.history.detail.legacyNotSaved) : options.escapeHtml(options.formatElapsedDuration(elapsedSeconds))}</strong></div></div>
           <div class="history-detail-quick-actions">
             <div class="history-detail-action-primary">${imagePrimaryAction}</div>
             ${imageSecondaryActions ? `<div class="history-detail-action-secondary">${imageSecondaryActions}</div>` : ""}
             ${imageMoreActions ? `<div class="history-detail-more-actions" role="group" aria-label="${options.t(uiKeys.history.menu.shortcutActions)}">${imageMoreActions}</div>` : ""}
           </div>
        </section>
        <section class="panel image-history-version-panel"><div class="history-version-panel-heading"><strong>${options.t(uiKeys.history.page.imageProjectVersions)}</strong><span>${options.t(uiKeys.history.card.versionCount, { count: project.versions.length })}</span></div><p class="muted tiny">${parent ? options.t(uiKeys.history.page.currentBasedOn, { version: parent.versionNumber }) : version.kind === "source" ? options.t(uiKeys.history.page.initialImage) : options.t(uiKeys.history.page.noParent)}</p></section>
       </aside>
    </section>
    ${renderHistoryTags(project.id, project.tags, availableTags, options)}
    <section class="history-record-section" aria-labelledby="history-generation-record-title">
      <div class="history-record-section-heading"><h2 id="history-generation-record-title">${options.t(uiKeys.history.page.generationRecord)}</h2><span class="history-record-section-meta">${options.t(uiKeys.history.version, { version: version.versionNumber })} · ${options.escapeHtml(version.kind === "source" ? options.t(uiKeys.history.card.originalImage) : options.modelName(version.modelId))}</span></div>
      <section class="history-record-grid image-history-record-grid">
      <article class="panel history-record full"><div class="history-record-heading"><h2>${options.t(uiKeys.history.page.editRequirements)}</h2><button class="ghost button-with-icon" data-copy-image-prompt>${options.icon("copy")}${options.t(uiKeys.history.page.copyPrompt)}</button></div><span class="muted">${options.t(uiKeys.history.page.promptSnapshot)}</span><div class="history-prompt-scroll" tabindex="0" aria-label="${options.t(uiKeys.history.page.editRequirements)}"><p class="history-prompt">${options.escapeHtml(version.prompt || options.t(uiKeys.history.page.imageOriginalPrompt))}</p></div></article>
      <article class="panel history-record"><h2>${options.t(uiKeys.history.page.versionSource)}</h2><dl><dt>${options.t(uiKeys.history.page.belongsProject)}</dt><dd>${options.escapeHtml(title)}</dd><dt>${options.t(uiKeys.history.page.parentVersion)}</dt><dd>${parent ? `v${parent.versionNumber}` : version.kind === "source" ? options.t(uiKeys.history.card.originalImage) : options.t(uiKeys.history.page.noParent)}</dd><dt>${options.t(uiKeys.history.page.versionNumber)}</dt><dd>${version.versionNumber} / ${project.versions.length}</dd><dt>${options.t(uiKeys.history.page.versionType)}</dt><dd>${version.kind === "source" ? options.t(uiKeys.history.page.originalMaterial) : version.kind === "upscale" ? options.t(uiKeys.history.page.upscaleVersion) : options.t(uiKeys.history.page.imageEdit)}</dd></dl></article>
      <article class="panel history-record"><h2>${options.t(uiKeys.history.page.generationInfo)}</h2><dl><dt>${options.t(uiKeys.history.page.model)}</dt><dd>${options.escapeHtml(version.kind === "source" ? options.t(uiKeys.history.card.originalImage) : options.modelName(version.modelId))}</dd><dt>${options.t(uiKeys.history.page.modelFile)}</dt><dd><code>${options.escapeHtml(version.diffusionModelFilename ?? options.t(uiKeys.history.detail.legacyNotSaved))}</code></dd><dt>${options.t(uiKeys.history.page.qualityProfile)}</dt><dd>${options.escapeHtml(version.kind === "source" ? options.t(uiKeys.history.page.notApplicable) : generationSummary.qualityLabel)}</dd><dt>${options.t(uiKeys.history.page.samplingSteps)}</dt><dd>${version.kind === "source" ? options.t(uiKeys.history.page.notApplicable) : generationSummary.steps ?? options.t(uiKeys.history.detail.legacyNotSaved)}</dd><dt>CFG</dt><dd>${version.kind === "source" ? options.t(uiKeys.history.page.notApplicable) : generationSummary.cfg ?? options.t(uiKeys.history.detail.legacyNotSaved)}</dd><dt>${options.t(uiKeys.history.page.imageLora)}</dt><dd>${options.escapeHtml(version.kind === "source" ? options.t(uiKeys.history.page.notApplicable) : generationSummary.loraLabel)}</dd><dt>${options.t(uiKeys.history.page.targetSize)}</dt><dd>${version.targetResolution === "source" ? options.t(uiKeys.history.page.keepOriginal) : version.targetResolution ? `${version.targetResolution}p` : options.t(uiKeys.history.detail.legacyNotSaved)}</dd><dt>${options.t(uiKeys.history.page.batchCandidates)}</dt><dd>${version.outputCount ?? options.t(uiKeys.history.detail.legacyNotSaved)}</dd><dt>${options.t(uiKeys.history.page.promptVersion)}</dt><dd>${version.promptVersion || options.t(uiKeys.history.detail.legacyNotSaved)}</dd><dt>${options.t(uiKeys.history.page.seed)}</dt><dd>${version.seed ?? options.t(uiKeys.runtime.random)}</dd><dt>${options.t(uiKeys.history.page.generatedAt)}</dt><dd>${options.escapeHtml(options.formatFullHistoryTime(version.createdAt))}</dd><dt>${options.t(uiKeys.history.page.outputFormat)}</dt><dd>${version.format.toUpperCase()}</dd><dt>${options.t(uiKeys.history.page.workflow)}</dt><dd><code>${options.escapeHtml(version.workflowPath || options.t(uiKeys.history.page.originalMaterial))}</code></dd><dt>ComfyUI Prompt ID</dt><dd><code>${options.escapeHtml(version.comfyPromptId ?? options.t(uiKeys.history.detail.legacyNotSaved))}</code></dd></dl></article>
      <article class="panel history-record full"><div class="history-record-heading"><h2>${options.t(uiKeys.history.page.inputSnapshot)}</h2><span>${options.t(uiKeys.history.card.pictureCount, { count: version.references.length })}</span></div>${renderImageReferenceSnapshotMarkup(version, options)}</article>
      <article class="panel history-record full"><div class="history-record-heading"><h2>${options.t(uiKeys.history.page.outputFiles)}</h2><span>${options.t(uiKeys.history.card.count, { count: 1 })}</span></div><div class="output-files"><div class="output-file"><div><strong>${options.escapeHtml(version.file.filename)}</strong><p class="muted">${options.escapeHtml(version.file.subfolder || ".")} · ${options.escapeHtml(version.file.type)}</p></div>${filePath ? `<button class="secondary button-with-icon" data-show-file="${options.escapeHtml(filePath)}">${options.icon("folder-open")}${options.t(uiKeys.history.page.showInExplorer)}</button>` : `<span class="muted">${options.t(uiKeys.history.page.currentFileUnavailable)}</span>`}</div></div><details><summary>${options.t(uiKeys.history.page.rawSnapshot)}</summary><pre>${options.escapeHtml(JSON.stringify(version.comfyOutputs, null, 2))}</pre></details></article>
      </section>
    </section>
    ${mediaUrl ? renderImageLightboxMarkup({
      title,
      mediaUrl,
      sourcePath: filePath,
      versionNumber: version.versionNumber,
      width: version.width,
      height: version.height
    }, options) : ""}`;
}
