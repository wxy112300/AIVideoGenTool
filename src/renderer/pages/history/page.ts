import type {
  AppState,
  AssetVersion,
  HistoryAsset,
  HistoryFile,
  HistoryRating,
  HistoryItem,
  ImageAssetVersion,
  ImageHistoryProject,
  NativeAvArtifactInspection
} from "../../../types";
import { videoRecordHeading, videoRecordStats, videoPerformance, videoLoraRecords } from "./video-records";
import { renderVideoDetailSidebar } from "./video-detail";
import { historyVersionOutputFiles } from "../../../core/history-output-files";
import type { HistoryKind } from "../../contracts";
import { uiKeys } from "../../../core/i18n-keys";
import {
  historyFilterIsActive,
  historyFilterForKind,
  historySortTimestamp,
  historyTagKey,
  type HistoryFilterState,
  type HistoryFilterTagMode
} from "../../../core/history-filter";
import {
  historyBatchCommonTags
} from "../../../core/history-batch";
import { videoPromptForLoras } from "../../../core/video-loras";
import {
  h3MotionContextHistoryFileForPath,
  isH3MotionContextHistoryFile
} from "../../../core/h3-motion-context";
import { isMiniMaxH3Model } from "../../../core/workflow";
import {
  renderHistoryHeading,
  renderImageMediaStatus,
  renderImageLightboxMarkup,
  renderImageReferenceSnapshotMarkup,
  renderHistoryTimeline,
  renderVideoInputSnapshotMarkup
} from "./fragments";
import {
  groupHistoryTimelineEntries,
  historyTimelineEntries
} from "./timeline";
import { historyTagChipMarkup } from "./tags-controller";
import { renderHistoryFilterPanel, renderHistoryFilterToggle } from "./filter-view";
import { HISTORY_VIRTUAL_THRESHOLD, registerHistoryWindow } from "./virtual-gallery";

export type HistoryPageLayout = "masonry" | "album";

export interface HistoryPageViewModel {
  state: AppState;
  historyKind: HistoryKind;
  historyLayout: HistoryPageLayout;
  historyFilter: HistoryFilterState;
  historyFilterPanelOpen: boolean;
  historyFilterTagMode?: HistoryFilterTagMode;
  historyBatchMode?: boolean;
  historyBatchSelectedIds?: ReadonlyArray<string>;
  historyBatchTagsPanelOpen?: boolean;
  selectedHistoryAssetId: string;
  selectedHistoryVersionId: string;
  historyArtifactInspection?: NativeAvArtifactInspection;
}

export interface ImageHistoryGenerationSummary {
  steps?: number;
  cfg?: number;
  qualityLabel: string;
  loraLabel: string;
}

type HistoryContinuumAction =
  | "Continue / Next"
  | "Regenerate Current"
  | "Continue From Here";

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
  options: Pick<HistoryPageOptions, "t" | "escapeHtml" | "icon">,
  outlined = false
): string {
  const current = rating ?? 0;
  const stars = [1, 2, 3, 4, 5].map((value) => {
    const state = current >= value ? "is-full" : current === value - 0.5 ? "is-half" : "";
    return `<button type="button" class="history-rating-star ${state}" data-history-rating-star="${options.escapeHtml(assetId)}" data-history-rating-value="${value}" aria-pressed="${current >= value}" aria-label="${value} ★">${outlined ? `<span class="history-rating-glyph">${options.icon("star")}</span><span class="history-rating-half" aria-hidden="true">${options.icon("star")}</span>` : "★"}</button>`;
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

  return `<media-controller id="history-player" class="panel history-player" style="--video-aspect: ${version.width} / ${version.height}" autohide="2" lang="${historyPlayerLanguage(options)}" fullscreenelement="history-player" hotkeys="noarrowleft noarrowright" aria-label="${options.escapeHtml(detailTitle)}">
    <video slot="media" loop playsinline preload="metadata" data-history-asset="${options.escapeHtml(asset.id)}" data-history-version="${options.escapeHtml(version.id)}" data-history-download-filename="${options.escapeHtml(videoFileName)}" src="${options.escapeHtml(mediaUrl)}"></video>
    <media-play-button slot="centered-chrome" class="history-player-center"><span slot="play">${options.icon("play")}</span><span slot="pause">${options.icon("pause")}</span></media-play-button>
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
        <button type="button" class="history-player-nav-button" data-history-navigation="-1" aria-keyshortcuts="PageUp" aria-label="${options.escapeHtml(previousLabel)}" ${previousAsset ? "" : "disabled"} title="${options.escapeHtml(previousTitle)}">${options.icon("skip-back")}</button>
        <span class="history-player-inline-position" aria-label="${options.escapeHtml(positionLabel)}">${options.escapeHtml(playerPositionLabel)}</span>
        <button type="button" class="history-player-nav-button" data-history-navigation="1" aria-keyshortcuts="PageDown" aria-label="${options.escapeHtml(nextLabel)}" ${nextAsset ? "" : "disabled"} title="${options.escapeHtml(nextTitle)}">${options.icon("skip-forward")}</button>
      </div>
      <span class="history-player-control-divider history-player-transport-divider" aria-hidden="true"></span>
      <media-play-button><span slot="play">${options.icon("play")}</span><span slot="pause">${options.icon("pause")}</span></media-play-button>
      <media-time-display showduration notoggle></media-time-display>
      <media-time-range></media-time-range>
      <span class="history-player-control-spacer" aria-hidden="true"></span>
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
        <media-settings-menu-button notooltip><span slot="icon">${options.icon("settings")}</span></media-settings-menu-button>
      </div>
    </media-control-bar>
  </media-controller>`;
}

function renderHistoryTags(
  assetId: string,
  tags: string[],
  availableTags: string[],
  options: Pick<HistoryPageOptions, "t" | "icon" | "escapeHtml">,
  inline = false
): string {
  const tagMarkup = tags.length
    ? tags.map((tag) => historyTagChipMarkup(tag, {
      escapeHtml: options.escapeHtml,
      icon: options.icon,
      editLabel: options.t(uiKeys.history.tags.edit),
      removeLabel: options.t(uiKeys.history.tags.remove)
    })).join("")
    : `<span class="history-tags-empty">${options.t(uiKeys.history.tags.empty)}</span>`;
  const suggestions = availableTags.filter((tag) => !tags.some((current) => historyTagKey(current) === historyTagKey(tag)));
  if (inline) return `<section class="history-detail-tags history-tags-inline" data-history-tags-root data-history-tag-asset="${options.escapeHtml(assetId)}" data-history-tags-inline>
    <div class="history-detail-tag-row"><span class="history-tag-label">${options.icon("tag")}${options.t(uiKeys.history.tags.title)}</span><div class="history-tag-list" data-history-tag-list>${tagMarkup}</div></div>
    <div class="history-detail-tag-row history-detail-tag-add-row"><button type="button" class="ghost history-tag-label" data-history-tag-add>${options.icon("plus")}${options.t(uiKeys.history.tags.addShort)}</button><div class="history-tag-editor" data-history-tag-editor><div class="history-tag-editor-row"><input type="text" data-history-tag-input maxlength="64" placeholder="${options.escapeHtml(options.t(uiKeys.history.tags.placeholder))}" aria-label="${options.escapeHtml(options.t(uiKeys.history.tags.add))}" autocomplete="off"><button type="button" class="ghost history-tag-editor-cancel" data-history-tag-cancel hidden>${options.t(uiKeys.history.tags.cancel)}</button></div></div><div class="history-tag-suggestions" data-history-tag-suggestions>${suggestions.slice(0, 4).map(tag => `<button type="button" class="history-tag-suggestion" data-history-tag-suggestion="${options.escapeHtml(tag)}">${options.escapeHtml(tag)}</button>`).join("")}</div></div>
  </section>`;
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

function historyCodeValue(
  value: string,
  options: Pick<HistoryPageOptions, "escapeHtml">
): string {
  return `<code>${options.escapeHtml(value)}</code>`;
}

function historyRequestedEffectiveValue(
  requested: string | undefined,
  effective: string | undefined,
  options: Pick<HistoryPageOptions, "t" | "escapeHtml">
): string {
  if (requested === undefined && effective === undefined) {
    return options.escapeHtml(options.t(uiKeys.history.detail.legacyNotSaved));
  }
  if (requested !== undefined && effective !== undefined && requested !== effective) {
    return `${historyCodeValue(requested, options)} → ${historyCodeValue(effective, options)}`;
  }
  return historyCodeValue(requested ?? effective ?? "", options);
}

function historyBooleanValue(
  value: boolean | undefined,
  options: Pick<HistoryPageOptions, "t" | "escapeHtml">
): string {
  if (value === undefined) {
    return options.escapeHtml(options.t(uiKeys.history.detail.legacyNotSaved));
  }
  const label = options.t(value ? uiKeys.history.page.enabled : uiKeys.history.page.disabled);
  return `${options.escapeHtml(label)} · ${historyCodeValue(value ? "enabled" : "disabled", options)}`;
}

function renderH3ExecutionStrategyMarkup(
  version: AssetVersion,
  asset: HistoryAsset,
  options: HistoryPageOptions
): string {
  const policy = version.h3ExecutionPolicy ?? asset.h3ExecutionPolicy;
  const rows: string[] = [];
  const addTranslatedRow = (
    key: Parameters<HistoryPageOptions["t"]>[0],
    value: string | undefined
  ) => {
    if (value !== undefined) {
      rows.push(`<dt>${options.t(key)}</dt><dd>${value}</dd>`);
    }
  };
  const attentionRequested = version.attentionMode ?? asset.attentionMode;
  const attentionEffective = policy?.attentionMode;
  if (attentionRequested !== undefined || attentionEffective !== undefined) {
    addTranslatedRow(
      uiKeys.history.page.attentionBackend,
      historyRequestedEffectiveValue(attentionRequested, attentionEffective, options)
    );
  }
  if (policy?.attentionOwner !== undefined) {
    addTranslatedRow(uiKeys.history.page.attentionOwner, historyCodeValue(policy.attentionOwner, options));
  }

  const sparseRequested = version.h3SparseAttentionMode ?? asset.h3SparseAttentionMode;
  if (sparseRequested !== undefined || policy?.sparseAttentionMode !== undefined) {
    addTranslatedRow(
      uiKeys.history.page.sparseAttention,
      historyRequestedEffectiveValue(sparseRequested, policy?.sparseAttentionMode, options)
    );
  }

  const runtimeRequested = version.h3RuntimeMode ?? asset.h3RuntimeMode;
  if (runtimeRequested !== undefined || policy?.runtimeMode !== undefined) {
    addTranslatedRow(
      uiKeys.history.page.runtimePolicy,
      historyRequestedEffectiveValue(runtimeRequested, policy?.runtimeMode, options)
    );
  }

  const compilerRequested = version.h3ComfyCompilerMode ?? asset.h3ComfyCompilerMode;
  if (compilerRequested !== undefined || policy?.comfyCompilerMode !== undefined) {
    addTranslatedRow(
      uiKeys.history.page.comfyCompiler,
      historyRequestedEffectiveValue(compilerRequested, policy?.comfyCompilerMode, options)
    );
  }

  const videoVae = version.h3VideoVaeMode ?? asset.h3VideoVaeMode;
  if (videoVae !== undefined) {
    addTranslatedRow(uiKeys.history.page.videoVae, historyCodeValue(videoVae, options));
  }

  const spectrumRequested = version.spectrumMode ?? asset.spectrumMode;
  const spectrumEffective = policy
    ? policy.spectrumEnabled ? "balanced" : "off"
    : undefined;
  const spectrumModelAware = version.spectrumModelAwareMode ?? asset.spectrumModelAwareMode;
  if (spectrumRequested !== undefined || spectrumEffective !== undefined || spectrumModelAware !== undefined) {
    const spectrumValue = historyRequestedEffectiveValue(spectrumRequested, spectrumEffective, options);
    addTranslatedRow(
      uiKeys.history.page.spectrum,
      spectrumModelAware === undefined
        ? spectrumValue
        : `${spectrumValue} · model-aware=${historyCodeValue(spectrumModelAware, options)}`
    );
  }

  if (policy?.previewEnabled !== undefined) {
    addTranslatedRow(uiKeys.history.page.preview, historyBooleanValue(policy.previewEnabled, options));
  }
  if (policy?.turboProfile !== undefined) {
    addTranslatedRow(uiKeys.history.page.turboProfile, historyCodeValue(policy.turboProfile, options));
  }
  if (policy) {
    const policyReasons = policy.reasons ?? [];
    const status = policy.allowed
      ? `${options.escapeHtml(options.t(uiKeys.history.page.enabled))} · ${historyCodeValue("allowed", options)}`
      : `${options.escapeHtml(options.t(uiKeys.history.page.disabled))} · ${historyCodeValue("rejected", options)}`;
    const reasons = policyReasons.length > 0
      ? ` · ${historyCodeValue(policyReasons.join(", "), options)}`
      : "";
    addTranslatedRow(uiKeys.history.page.policyStatus, `${status}${reasons}`);
  }
  return rows.join("");
}

export function renderImageHistoryPage(
  viewModel: HistoryPageViewModel,
  options: HistoryPageOptions
): string {
  viewModel = { ...viewModel, historyFilter: historyFilterForKind(viewModel.historyFilter, "image") };
  const projects = options.imageProjectsByNewest(viewModel.state.imageHistory, viewModel.historyFilter);
  const modelIds = options.historyFilterModelIds(viewModel.state, "image");
  const tagNames = options.historyFilterTagNames(viewModel.state, "image");
  const timeline = renderHistoryTimeline(
    groupHistoryTimelineEntries(historyTimelineEntries(projects, viewModel.historyFilter.sort, options.uiLocale)),
    options,
    options.uiLocale
  );
  const renderCard = (project: ImageHistoryProject, historyOrder: number) => {
    const version = options.preferredImageVersion(project);
    const mediaUrl = options.imageHistoryMediaUrl(project, version);
    const sourcePath = version.file.absolutePath ?? "";
    const title = project.title.trim() || options.t(uiKeys.history.card.untitledImage);
    const iterationCount = Math.max(0, project.versions.filter((item) => item.kind !== "source").length);
    const selected = (viewModel.historyBatchSelectedIds ?? []).includes(project.id);
    return `
      <article class="history-gallery-item panel image-history-gallery-item${selected ? " history-batch-selected" : ""}" data-history="${options.escapeHtml(project.id)}" data-open-image-history="${options.escapeHtml(project.id)}" data-history-kind="image" data-history-order="${historyOrder}" data-history-timestamp="${options.escapeHtml(historySortTimestamp(project))}" role="button" tabindex="0" aria-keyshortcuts="Enter Space" aria-label="${options.escapeHtml(title)}，${options.t(uiKeys.history.card.openDetailsContext)}">
        ${viewModel.historyBatchMode === true ? `<label class="history-batch-checkbox-wrap"><input type="checkbox" class="history-batch-checkbox" data-history-batch-select="${options.escapeHtml(project.id)}" ${selected ? "checked" : ""} aria-label="${options.escapeHtml(options.t(uiKeys.history.batch.cardSelect))}"><span aria-hidden="true"></span></label>` : ""}
        <div class="history-media image-history-media ${mediaUrl ? "image-media-loading" : "image-media-unavailable"}" data-image-media data-image-media-surface="gallery" data-image-media-source="${options.escapeHtml(sourcePath)}" style="--media-ratio:${version.width || 1} / ${version.height || 1}">
          ${mediaUrl
            ? `<img data-image-media-url="${options.escapeHtml(mediaUrl)}" loading="lazy" alt="${options.escapeHtml(title)}" data-image-history-preview data-image-media-image data-image-history-cache-key="${options.escapeHtml(options.imageHistoryThumbnailCacheKey(project, version))}" data-image-history-source="${options.escapeHtml(sourcePath)}">`
            : ""}
          ${renderImageMediaStatus(options)}
          <div class="history-media-badges">
            <span class="media-chip history-model-chip" title="${options.escapeHtml(version.kind === "source" ? options.t(uiKeys.history.card.originalImage) : options.modelName(version.modelId))}">${options.escapeHtml(version.kind === "source" ? options.t(uiKeys.history.card.originalImage) : options.modelName(version.modelId))}</span>
            <span class="media-chip">${version.width > 0 && version.height > 0 ? `${version.width} × ${version.height}` : options.t(uiKeys.history.card.unknownSize)}</span>
            ${project.versions.length > 1 ? `<span class="media-chip history-version-count-chip">${options.t(uiKeys.history.card.versionCount, { count: project.versions.length })}</span>` : ""}
          </div>
          ${renderHistoryCardCuration(project.rating, project.favorite, options)}
          <span class="image-project-kind">${options.icon("workflow")}${iterationCount ? options.t(uiKeys.history.card.iterationCount, { count: iterationCount }) : options.t(uiKeys.history.card.originalAsset)}</span>
        </div>
        <div class="history-gallery-copy">
          <h3 class="history-card-title" title="${options.escapeHtml(title)} · ${options.escapeHtml(version.file.filename)}"><span class="history-card-title-track"><span>${options.escapeHtml(title)}</span><span aria-hidden="true">${options.escapeHtml(title)}</span></span></h3>
          <div class="history-card-meta"><span>${options.escapeHtml(options.formatFullHistoryTime(project.updatedAt || version.createdAt))}</span><span>${options.t(uiKeys.history.card.latestVersion, { version: version.versionNumber })}</span></div>
          <button type="button" class="ghost icon-button history-card-more" data-history-more aria-label="${options.escapeHtml(options.t(uiKeys.history.menu.shortcutActions))}" title="${options.escapeHtml(options.t(uiKeys.history.menu.shortcutActions))}">${options.icon("ellipsis")}</button>
        </div>
      </article>`;
  };
  const virtual = projects.length > HISTORY_VIRTUAL_THRESHOLD ? registerHistoryWindow(projects.map(project => {
    const v = options.preferredImageVersion(project); return { id: project.id, ratio: (v.width || 1) / (v.height || 1) };
  }), index => renderCard(projects[index]!, index)) : "";
  const cards = virtual ? "" : projects.map(renderCard).join("");
  return `
    ${renderHistoryHeading({
      activeCount: projects.length,
      historyKind: viewModel.historyKind,
      historyLayout: viewModel.historyLayout,
      description: options.t(uiKeys.history.imageDescription),
      totalCount: viewModel.state.imageHistory.length, filtered: historyFilterIsActive(viewModel.historyFilter),
      historyFilter: renderHistoryFilterToggle(viewModel, options)
    }, options)}
    <div class="history-context${viewModel.historyBatchMode ? " is-batching" : ""}" data-history-context ${viewModel.historyFilterPanelOpen || viewModel.historyBatchMode ? "" : "hidden"}>
      ${renderHistoryFilterPanel(viewModel, options, modelIds, tagNames)}
      ${renderHistoryBatchToolbar(viewModel, options, projects)}
    </div>
    <div class="history-list-stage${timeline ? " has-history-timeline" : ""}" data-history-list-stage>
      <section id="history-panel-image" class="history-gallery ${viewModel.historyLayout}" ${virtual ? `data-history-virtual="${virtual}"` : ""} role="tabpanel" aria-labelledby="history-tab-image">
        ${projects.length === 0
          ? `<div class="empty panel"><h2>${historyFilterIsActive(viewModel.historyFilter) ? options.t(uiKeys.history.filter.noResults) : options.t(uiKeys.history.card.imageEmptyTitle)}</h2><p>${historyFilterIsActive(viewModel.historyFilter) ? "" : options.t(uiKeys.history.card.imageEmptyDescription)}</p></div>`
          : cards}
      </section>
      ${timeline}
    </div>
    ${renderHistoryBatchTagsPanel(viewModel, options)}
`;
}

function historyBatchSelectedItems(viewModel: HistoryPageViewModel): HistoryItem[] {
  const selected = new Set(viewModel.historyBatchSelectedIds ?? []);
  return (viewModel.historyKind === "video" ? viewModel.state.history : viewModel.state.imageHistory)
    .filter((item) => selected.has(item.id));
}

function renderHistoryBatchToolbar(
  viewModel: HistoryPageViewModel,
  options: Pick<HistoryPageOptions, "t" | "icon" | "escapeHtml">,
  visibleItems: ReadonlyArray<HistoryItem>
): string {
  if (viewModel.historyBatchMode !== true) return "";
  const visibleIds = new Set(visibleItems.map((item) => item.id));
  const selectedCount = (viewModel.historyBatchSelectedIds ?? []).filter((id) => visibleIds.has(id)).length;
  const allSelected = visibleItems.length > 0 && selectedCount === visibleItems.length;
  return `<div class="history-batch-toolbar" data-history-batch-toolbar role="toolbar" aria-label="${options.escapeHtml(options.t(uiKeys.history.batch.mode))}">
    <span class="history-batch-mode-label">${options.icon("check-square")}${options.t(uiKeys.history.batch.mode)}</span>
    <button type="button" class="ghost button-with-icon history-batch-select-all" data-history-batch-action="select-all" aria-pressed="${allSelected}" ${visibleItems.length ? "" : "disabled"}>${options.icon(allSelected ? "check-square" : "square")}${options.t(uiKeys.history.batch.selectAll)}</button>
    <span class="history-batch-count" data-history-batch-count>${options.escapeHtml(options.t(uiKeys.history.batch.selected, { selected: selectedCount, total: visibleItems.length }))}</span>
    <span class="history-batch-divider" aria-hidden="true"></span>
    <button type="button" class="ghost button-with-icon" data-history-batch-action="copy" ${selectedCount ? "" : "disabled"}>${options.icon("copy")}${options.t(uiKeys.history.batch.copy)}</button>
    <button type="button" class="ghost button-with-icon" data-history-batch-action="tags" ${selectedCount ? "" : "disabled"}>${options.icon("tag")}${options.t(uiKeys.history.batch.addTags)}</button>
    <button type="button" class="ghost danger button-with-icon" data-history-batch-action="delete" ${selectedCount ? "" : "disabled"}>${options.icon("trash-2")}${options.t(uiKeys.history.batch.delete)}</button>
    <button type="button" class="ghost icon-button history-batch-exit" data-history-batch-action="exit" aria-label="${options.escapeHtml(options.t(uiKeys.history.batch.exit))}" title="${options.escapeHtml(options.t(uiKeys.history.batch.exit))}">${options.icon("x")}</button>
  </div>`;
}

function renderHistoryBatchTagsPanel(
  viewModel: HistoryPageViewModel,
  options: Pick<HistoryPageOptions, "t" | "icon" | "escapeHtml">
): string {
  if (viewModel.historyBatchMode !== true) return "";
  const items = historyBatchSelectedItems(viewModel);
  const common = historyBatchCommonTags(items);
  const chipOptions = {
    escapeHtml: options.escapeHtml,
    icon: options.icon,
    editLabel: options.t(uiKeys.history.tags.edit),
    removeLabel: options.t(uiKeys.history.tags.remove)
  };
  const panelOpen = viewModel.historyBatchTagsPanelOpen === true && items.length > 0;
  return `<dialog class="history-batch-tags-panel" aria-labelledby="history-batch-tags-title" data-history-batch-tags-panel data-history-batch-tags-root${panelOpen ? "" : " hidden"}>
    <div class="history-batch-tags-heading"><h2 id="history-batch-tags-title">${options.icon("tag")}${options.t(uiKeys.history.batch.tagsTitle)}</h2><button type="button" class="ghost icon-button" data-history-batch-tags-close aria-label="${options.t(uiKeys.history.batch.done)}">${options.icon("x")}</button></div>
    <div class="history-batch-tag-section"><h3>${options.t("history.list.commonTags")}</h3><div class="history-tag-list" data-history-tag-list>${common.length ? common.map((tag) => historyTagChipMarkup(tag, chipOptions)).join("") : `<span class="history-tags-empty">${options.t(uiKeys.history.batch.noCommonTags)}</span>`}</div></div>
    <div class="history-batch-tag-section"><h3>${options.t("history.list.partialTags")}</h3><div class="history-tag-list" data-history-partial-tags></div></div>
    <div class="history-tag-editor" data-history-tag-editor hidden><div class="history-tag-editor-row"><input type="text" data-history-tag-input maxlength="64" placeholder="${options.escapeHtml(options.t(uiKeys.history.tags.placeholder))}" autocomplete="off"><button type="button" class="ghost history-tag-editor-cancel" data-history-tag-cancel>${options.t(uiKeys.history.tags.cancel)}</button></div><div class="history-tag-suggestions" data-history-tag-suggestions></div></div>
    <div class="dialog-actions"><button type="button" class="primary" data-history-batch-tags-close>${options.t(uiKeys.history.batch.done)}</button></div>
  </dialog>`;
}

export function renderHistoryPage(
  viewModel: HistoryPageViewModel,
  options: HistoryPageOptions
): string {
  const orderedAssets = options.historyAssetsByNewest(viewModel.state.history, viewModel.historyFilter);
  const modelIds = options.historyFilterModelIds(viewModel.state, "video");
  const tagNames = options.historyFilterTagNames(viewModel.state, "video");
  const timeline = renderHistoryTimeline(
    groupHistoryTimelineEntries(historyTimelineEntries(orderedAssets, viewModel.historyFilter.sort, options.uiLocale)),
    options,
    options.uiLocale
  );
  const renderCard = (asset: HistoryAsset, historyOrder: number) => {
    const version = options.preferredVersion(asset);
    const historyTitle = asset.title.trim() || asset.prompt.trim() || options.t(uiKeys.history.card.untitledVideo);
    const videoIndex = options.versionVideoIndex(version);
    const mediaUrl = options.historyMediaUrl(asset, version);
    const coverKey = options.historyCoverCacheKey(asset, version);
    const coverSeed = options.historyCoverSeed(asset.id, version.id);
    const coverTime = options.historyInitialCoverTime(asset.duration, coverSeed);
    const selected = (viewModel.historyBatchSelectedIds ?? []).includes(asset.id);
    return `
      <article class="history-gallery-item panel${selected ? " history-batch-selected" : ""}" data-history="${options.escapeHtml(asset.id)}" data-open-history="${options.escapeHtml(asset.id)}" data-history-kind="video" data-history-order="${historyOrder}" data-history-timestamp="${options.escapeHtml(historySortTimestamp(asset))}" role="button" tabindex="0" aria-keyshortcuts="Enter Space" aria-label="${options.escapeHtml(historyTitle)}，${options.t(uiKeys.history.card.openDetailsContext)}">
        ${viewModel.historyBatchMode === true ? `<label class="history-batch-checkbox-wrap"><input type="checkbox" class="history-batch-checkbox" data-history-batch-select="${options.escapeHtml(asset.id)}" ${selected ? "checked" : ""} aria-label="${options.escapeHtml(options.t(uiKeys.history.batch.cardSelect))}"><span aria-hidden="true"></span></label>` : ""}
        <div class="history-media${mediaUrl ? " media-loading" : ""}" style="--media-ratio:${version.width} / ${version.height}" data-history-media data-history-src="${options.escapeHtml(mediaUrl)}" data-cover-key="${options.escapeHtml(coverKey)}" data-cover-source="${options.escapeHtml(version.files[videoIndex]?.absolutePath ?? "")}" data-cover-time="${coverTime}" data-cover-seed="${coverSeed}" data-preview-duration="${asset.duration}">
          ${mediaUrl
            ? ""
            : `<div class="history-media-fallback"><span>${options.icon("play")}</span><small>${options.t(uiKeys.history.card.missingVideo)}</small></div>`}
          ${mediaUrl ? `<img class="history-cover-image" data-history-cover-image="${asset.id}" alt="">` : ""}
          ${mediaUrl ? `<div class="history-media-loading" role="status"><span class="history-loading-spinner" aria-hidden="true"></span><small>${options.t(uiKeys.history.card.loadingCover)}</small></div>` : ""}
          ${mediaUrl ? `<div class="history-media-error" aria-live="polite"><span>${options.icon("film")}</span><small>${options.t(uiKeys.history.card.previewError)}</small></div>` : ""}
          <div class="history-media-badges">
            <span class="media-chip history-model-chip" title="${options.escapeHtml(options.modelName(version.modelId))}">${options.escapeHtml(options.modelName(version.modelId))}</span>
            <span class="media-chip">${options.historyResolutionLabel(asset, version)}</span>
            <span class="media-chip">${options.formatVideoDuration(asset.duration)}</span>
          </div>
          ${renderHistoryCardCuration(asset.rating, asset.favorite, options)}
          ${mediaUrl ? `<span class="history-preview-state">${options.icon("play")}${options.t(uiKeys.history.card.previewing)}</span><button type="button" class="history-preview-progress" role="slider" aria-label="${options.t(uiKeys.history.card.adjustPreview)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="${options.t(uiKeys.history.card.waitingVideoLoad)}"><i></i></button>` : ""}
        </div>
        <div class="history-gallery-copy">
          <h3 class="history-card-title" title="${options.escapeHtml(historyTitle)} · ${options.escapeHtml(version.files[videoIndex]?.filename ?? version.outputFilename)}"><span class="history-card-title-track"><span>${options.escapeHtml(historyTitle)}</span><span aria-hidden="true">${options.escapeHtml(historyTitle)}</span></span></h3>
          <div class="history-card-meta"><span>${options.escapeHtml(options.formatFullHistoryTime(version.createdAt))}</span><span>${options.t(uiKeys.history.card.rendered, { duration: options.escapeHtml(options.historyRenderDuration(version)) })}</span></div>
          <button type="button" class="ghost icon-button history-card-more" data-history-more aria-label="${options.escapeHtml(options.t(uiKeys.history.menu.shortcutActions))}" title="${options.escapeHtml(options.t(uiKeys.history.menu.shortcutActions))}">${options.icon("ellipsis")}</button>
        </div>
      </article>`;
  };
  const virtual = orderedAssets.length > HISTORY_VIRTUAL_THRESHOLD ? registerHistoryWindow(orderedAssets.map(asset => {
    const v = options.preferredVersion(asset); return { id: asset.id, ratio: v.width > 0 && v.height > 0 ? v.width / v.height : 16 / 9 };
  }), index => renderCard(orderedAssets[index]!, index)) : "";
  const cards = virtual ? "" : orderedAssets.map(renderCard).join("");
  return `
    ${renderHistoryHeading({
      activeCount: orderedAssets.length,
      historyKind: viewModel.historyKind,
      historyLayout: viewModel.historyLayout,
      description: options.t(uiKeys.history.videoDescription),
      totalCount: viewModel.state.history.length, filtered: historyFilterIsActive(viewModel.historyFilter),
      historyFilter: renderHistoryFilterToggle(viewModel, options)
    }, options)}
    <div class="history-context${viewModel.historyBatchMode ? " is-batching" : ""}" data-history-context ${viewModel.historyFilterPanelOpen || viewModel.historyBatchMode ? "" : "hidden"}>
      ${renderHistoryFilterPanel(viewModel, options, modelIds, tagNames)}
      ${renderHistoryBatchToolbar(viewModel, options, orderedAssets)}
    </div>
    <div class="history-list-stage${timeline ? " has-history-timeline" : ""}" data-history-list-stage>
      <section id="history-panel-video" class="history-gallery ${viewModel.historyLayout}" ${virtual ? `data-history-virtual="${virtual}"` : ""} role="tabpanel" aria-labelledby="history-tab-video">
        ${orderedAssets.length === 0
          ? `<div class="empty panel"><h2>${historyFilterIsActive(viewModel.historyFilter) ? options.t(uiKeys.history.filter.noResults) : options.t(uiKeys.history.card.videoEmptyTitle)}</h2><p>${historyFilterIsActive(viewModel.historyFilter) ? "" : options.t(uiKeys.history.card.videoEmptyDescription)}</p></div>`
          : cards}
      </section>
      ${timeline}
    </div>
    ${renderHistoryBatchTagsPanel(viewModel, options)}
`;
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
  const jointAvArtifact = viewModel.historyArtifactInspection?.artifact ??
    version.h3ContinuationData?.artifact;
  const artifactInspectionStatus = viewModel.historyArtifactInspection?.status ??
    version.h3ContinuationData?.status ?? "not-supported";
  const nativeAvStatusLabel = artifactInspectionStatus === "available"
    ? options.t(uiKeys.history.page.nativeAvStatusAvailable)
    : artifactInspectionStatus === "save-failed"
      ? options.t(uiKeys.history.page.nativeAvStatusSaveFailed)
      : artifactInspectionStatus === "missing"
        ? options.t(uiKeys.history.page.nativeAvStatusMissing)
        : artifactInspectionStatus === "invalid"
          ? options.t(uiKeys.history.page.nativeAvStatusInvalid)
          : options.t(uiKeys.history.page.nativeAvStatusNotSupported);
  const nativeAvStatusReason = viewModel.historyArtifactInspection?.reason ??
    version.h3ContinuationData?.reason;
  const nativeAvRole = version.h3AvAsset?.artifactRole ?? jointAvArtifact?.role;
  const nativeAvScope = version.h3AvAsset?.sampleScope ??
    (nativeAvRole === "extend-segment-clean-av" ? "extension-segment" : undefined);
  const nativeAvContextFrames = version.h3AvAsset?.contextFrames ?? jointAvArtifact?.contextFrames;
  const nativeAvSummaryMarkup = version.h3ContinuationData || version.h3AvAsset
    ? `<section class="history-native-av-summary" data-history-av-summary aria-live="polite">
        <details class="history-av-details"><summary><span>${options.icon("database")}${options.t(uiKeys.history.page.avFile)}</span><span class="history-file-badge ${artifactInspectionStatus === "available" ? "" : "warning"}" data-history-av-visible-status>${options.escapeHtml(nativeAvStatusLabel)}</span>${options.icon("chevron-down")}</summary>
        <dl class="history-native-av-facts">
          ${nativeAvRole ? `<div><dt>${options.escapeHtml(options.t(uiKeys.history.page.nativeAvRole))}</dt><dd><code>${options.escapeHtml(nativeAvRole)}</code></dd></div>` : ""}
          ${nativeAvScope ? `<div><dt>${options.escapeHtml(options.t(uiKeys.history.page.nativeAvScope))}</dt><dd><code>${options.escapeHtml(nativeAvScope)}</code></dd></div>` : ""}
          ${nativeAvContextFrames === undefined ? "" : `<div><dt>${options.escapeHtml(options.t(uiKeys.history.page.nativeAvContextFrames))}</dt><dd><code>${nativeAvContextFrames}</code></dd></div>`}
          ${version.h3AvAsset?.storageKind ? `<div><dt>${options.escapeHtml(options.t(uiKeys.history.page.nativeAvStorage))}</dt><dd><code>${options.escapeHtml(version.h3AvAsset.storageKind)}</code></dd></div>` : ""}
        </dl></details>
        ${nativeAvStatusReason ? `<p class="history-native-av-reason" data-history-av-visible-reason>${options.escapeHtml(nativeAvStatusReason)}</p>` : ""}
      </section>`
    : "";
  const jointAvSummary = jointAvArtifact
    ? `<span class="history-joint-av-indicator" title="${options.escapeHtml(nativeAvStatusLabel)}">+ ${options.escapeHtml(options.t(uiKeys.history.page.avFile))}</span>`
    : "";
  const continuumSequence = version.h3ContinuumSequence;
  const continuumCurrentChunk = continuumSequence && continuumSequence.chunks.length > 0
    ? continuumSequence.chunks[continuumSequence.chunks.length - 1]
    : undefined;
  const continuumTakeId = continuumSequence?.canonicalHead.takeId
    ?? continuumCurrentChunk?.takeId
    ?? options.t(uiKeys.history.page.notApplicable);
  const continuumBranchId = continuumSequence?.canonicalHead.branchId
    ?? continuumCurrentChunk?.branchId
    ?? options.t(uiKeys.history.page.notApplicable);
  const continuumReadiness = continuumSequence?.status === "review-ready"
    ? options.t(uiKeys.history.page.continuumStatusReviewReady)
    : continuumSequence?.status === "complete"
      ? options.t(uiKeys.history.page.continuumStatusComplete)
      : continuumSequence?.status === "invalid"
        ? options.t(uiKeys.history.page.continuumStatusInvalid)
        : options.t(uiKeys.history.page.continuumStatusInProgress);
  const continuumTotalDuration = continuumSequence
    ? options.formatVideoDuration(Math.max(0, continuumSequence.acceptedChunks * continuumSequence.chunkSeconds))
    : "";
  const fileIdentity = (file: HistoryFile): string => file.absolutePath || `${file.subfolder}/${file.filename}`;
  const jointAvPayloadIdentity = jointAvArtifact ? fileIdentity(jointAvArtifact.payload) : "";
  const continuumReceipt = version.h3ContinuumReceipt;
  const continuumFileRole = (file: HistoryFile): string => {
    const identity = fileIdentity(file);
    if (continuumReceipt?.runStorageRoot && identity === fileIdentity(continuumReceipt.runStorageRoot)) {
      return options.t(uiKeys.history.page.continuumRunStorageManifest);
    }
    const receiptChunk = continuumReceipt?.chunkRecords.find((record) =>
      identity === fileIdentity(record.payloadPath)
    );
    if (receiptChunk) {
      return options.t(uiKeys.history.page.continuumChunkPayload, { index: receiptChunk.logicalChunkIndex });
    }
    const pointer = version.h3AvAsset?.continuumChunk;
    if (pointer?.manifest && identity === fileIdentity(pointer.manifest)) {
      return options.t(uiKeys.history.page.continuumChunkManifest, { index: pointer.logicalChunkIndex });
    }
    return "";
  };
  const motionContextFile = h3MotionContextHistoryFileForPath(
    version.h3ContextLatentPath,
    version.files
  ) ?? version.files.find(isH3MotionContextHistoryFile);
  const motionContextIdentity = motionContextFile ? fileIdentity(motionContextFile) : "";
  const outputFiles = [...version.files];
  for (const file of [
    ...historyVersionOutputFiles(version),
    ...(motionContextFile ? [motionContextFile] : []),
  ]) {
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
  const videoContinueAction = (
    variant: "primary" | "secondary" | "ghost",
    continuumAction: HistoryContinuumAction = "Continue / Next"
  ) => {
    const label = continuumAction === "Regenerate Current"
      ? options.t(uiKeys.history.page.continuumRetryChunk)
      : continuumAction === "Continue From Here"
        ? options.t(uiKeys.history.page.continuumContinueFromTake)
        : options.t(uiKeys.history.page.continueCreation);
    return !retiredModel && videoFile?.absolutePath && continuumSequence?.status !== "invalid"
      ? `<button class="${variant} button-with-icon" data-continue-history="${asset.id}" data-source-version="${version.id}" data-continuum-action="${continuumAction}" aria-label="${options.escapeHtml(label)}" title="${options.escapeHtml(label)}">${options.icon(continuumAction === "Regenerate Current" ? "rotate-cw" : continuumAction === "Continue From Here" ? "corner-down-right" : "video")}${options.escapeHtml(label)}</button>`
      : "";
  };
  const videoCopyAction = videoFile?.absolutePath ? `<button class="secondary button-with-icon" data-copy-file="${options.escapeHtml(videoFile.absolutePath)}" aria-label="${options.t(uiKeys.history.menu.copyFile)}" title="${options.t(uiKeys.history.menu.copyFile)}">${options.icon("copy")}${options.t(uiKeys.history.menu.copyFile)}</button>` : "";
  const videoLocateAction = videoFile?.absolutePath ? `<button class="secondary button-with-icon history-file-action" data-show-file="${options.escapeHtml(videoFile.absolutePath)}" aria-label="${options.t(uiKeys.history.menu.openFolder)}" title="${options.t(uiKeys.history.page.locateFile)}">${options.icon("folder-open")}${options.t(uiKeys.history.page.locateFile)}</button>` : "";
  const videoUpscaleAction = `<button class="secondary button-with-icon" data-open-upscale ${videoFile?.absolutePath ? "" : "disabled"}>${options.icon("maximize-2")}${options.t(uiKeys.history.page.improveResolution)}</button>`;
  const videoDeleteVersionAction = asset.versions.length > 1
    ? `<button class="secondary danger history-delete-version-button button-with-icon" data-delete-history-version="${options.escapeHtml(asset.id)}" data-history-version-delete-id="${options.escapeHtml(version.id)}" aria-label="${options.t(uiKeys.history.page.deleteCurrentVersion)}" title="${options.t(uiKeys.history.page.deleteCurrentVersion)}">${options.icon("trash-2")}${options.t(uiKeys.history.page.deleteCurrentVersion)}</button>`
    : "";
  const videoDeleteAction = `<button class="secondary danger history-delete-button button-with-icon" data-delete-history="${asset.id}">${options.icon("trash-2")}${options.t(uiKeys.history.page.deleteVideoRecord)}</button>`;
  const videoHasContinueAction = Boolean(videoContinueAction("primary"));
  const videoPrimaryAction = videoHasContinueAction ? videoContinueAction("primary") : videoEditAction("primary");
  const h3PolicySnapshot = version.h3ExecutionPolicy ?? asset.h3ExecutionPolicy;
  const videoGenerationStrategyMarkup = isMiniMaxH3Model(version.modelId)
    ? renderH3ExecutionStrategyMarkup(version, asset, options)
    : `<dt>${options.t(uiKeys.history.page.attention)}</dt><dd>${options.escapeHtml(version.attentionMode ?? asset.attentionMode ?? options.t(uiKeys.history.detail.legacyNotSaved))}</dd><dt>${options.t(uiKeys.history.page.computeMode)}</dt><dd>${options.escapeHtml(historyComputeMode(version, options))}</dd><dt>${options.t(uiKeys.history.page.motion)}</dt><dd>${options.escapeHtml(version.motion ?? asset.motion ?? options.t(uiKeys.history.detail.legacyNotSaved))}</dd>`;
  const generationParameterMarkup = version.kind === "upscale"
    ? `<dt>${options.t(uiKeys.history.page.tileMode)}</dt><dd>${options.escapeHtml(version.tileMode ?? options.t(uiKeys.history.detail.legacyNotSaved))}</dd><dt>${options.t(uiKeys.history.page.faceRestore)}</dt><dd>${version.faceRestore == null ? options.t(uiKeys.history.detail.legacyNotSaved) : version.faceRestore ? options.t(uiKeys.history.page.enabled) : options.t(uiKeys.history.page.disabled)}</dd>`
    : videoGenerationStrategyMarkup;
  const continuumSummaryMarkup = continuumSequence
    ? `<section class="panel history-record history-continuum-panel" aria-labelledby="history-continuum-title">
      <div class="history-continuum-heading"><h2 id="history-continuum-title">${options.icon("layers")}${options.t(uiKeys.history.page.continuumTitle)}</h2><span class="status running">${options.escapeHtml(continuumReadiness)}</span></div>
      <div class="history-record-chunks" style="--chunks:${Math.max(1, continuumSequence.targetChunks)}" aria-label="${continuumSequence.acceptedChunks} / ${continuumSequence.targetChunks}">${Array.from({ length: Math.max(1, continuumSequence.targetChunks) }, (_, i) => `<span class="${i < continuumSequence.acceptedChunks ? "done" : ""} ${i === continuumSequence.acceptedChunks - 1 ? "current" : ""}"></span>`).join("")}</div>
      <dl class="history-continuum-facts">
        <div><dt>${options.t(uiKeys.history.page.continuumRun)}</dt><dd>${options.escapeHtml(continuumSequence.runName)}</dd></div>
        <div><dt>${options.t(uiKeys.history.page.continuumChunks)}</dt><dd>${continuumSequence.acceptedChunks} / ${continuumSequence.targetChunks} · ${continuumTotalDuration}</dd></div>
        <div><dt>${options.t(uiKeys.history.page.continuumTake)}</dt><dd>${options.escapeHtml(continuumTakeId)}</dd></div>
        <div><dt>${options.t(uiKeys.history.page.continuumBranch)}</dt><dd>${options.escapeHtml(continuumBranchId)}</dd></div>
      </dl>

    </section>`
    : "";
  return `
    <div class="history-video-detail history-media-detail">
    <div class="history-detail-back">
      <button class="secondary button-with-icon history-detail-back-button" data-page="history">${options.icon("arrow-left")}${options.t(uiKeys.history.page.back)}</button>
      <div class="history-detail-tools">
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
        ${renderHistoryTags(asset.id, asset.tags, availableTags, options, true)}
      </div>
      ${renderVideoDetailSidebar({ asset, version, title: detailTitle, completedAt,
        elapsed: elapsedSeconds == null ? options.t(uiKeys.history.detail.legacyNotSaved) : options.formatElapsedDuration(elapsedSeconds),
        filename: videoFile?.filename ?? asset.outputFilename, path: videoFile?.absolutePath ?? "",
        rating: renderHistoryRatingControl(asset.id, asset.rating, options, true),
        primary: videoPrimaryAction, edit: videoHasContinueAction ? videoEditAction("secondary") : "",
        continuum: continuumSequence ? `<div class="history-side-continuum"><span title="${options.escapeHtml(continuumSequence.runName)}">${options.icon("layers")}${continuumSequence.acceptedChunks} / ${continuumSequence.targetChunks}</span>${continuumSequence.acceptedChunks > 0 && !retiredModel && videoFile?.absolutePath && continuumSequence.status !== "invalid" ? videoContinueAction("ghost", "Regenerate Current") + videoContinueAction("ghost", "Continue From Here") : ""}</div>` : "",
        av: jointAvSummary, copy: videoCopyAction, locate: videoLocateAction, upscale: videoUpscaleAction,
        deleteVersion: videoDeleteVersionAction, deleteRecord: videoDeleteAction
      }, options)}
    </section>
      <article class="panel history-record history-detail-prompt">
        <div class="history-record-heading"><h2>${options.t(uiKeys.history.page.promptHeading)}</h2><span class="history-prompt-meta">${version.promptVersion == null && asset.promptVersion == null ? "" : options.t(uiKeys.history.version, { version: version.promptVersion ?? asset.promptVersion ?? 0 })}${performanceStats?.h3TokenCount == null ? "" : ` · ${performanceStats.h3TokenCount} tokens`}</span><button class="ghost button-with-icon" data-copy-prompt>${options.icon("copy")}${options.t(uiKeys.history.page.copyPrompt)}</button></div>
        <div class="history-prompt-scroll" tabindex="0" aria-label="${options.t(uiKeys.history.page.fullPrompt)}"><p class="history-prompt">${options.escapeHtml(executionPrompt)}</p></div>
      </article>
    <section class="history-record-section" aria-labelledby="history-generation-record-title">
      <div class="history-record-section-heading"><h2 id="history-generation-record-title">${options.t(uiKeys.history.page.generationRecord)}</h2><span class="history-record-section-meta">${options.t(version.kind === "original" ? uiKeys.history.page.originalGeneration : uiKeys.history.page.upscaleVersion)} · ${options.escapeHtml(options.modelName(version.modelId))}</span></div>
      <section class="history-record-grid" data-history-record-flow>
      <article class="panel history-record">
        ${videoRecordHeading(options.t(uiKeys.history.page.generation), "cpu", options, options.escapeHtml(options.modelName(version.modelId)))}
        ${videoRecordStats([
          ...(version.kind === "original" ? [[options.t(uiKeys.history.page.samplingSteps), version.steps ?? options.t(uiKeys.history.page.workflowDefault)] as [string, string | number]] : []),
          ...(performanceStats?.h3TokenCount == null ? [] : [[options.t(uiKeys.history.page.tokenCount), performanceStats.h3TokenCount] as [string, string | number]]),
          [options.t(uiKeys.history.page.promptVersion), version.promptVersion ?? asset.promptVersion ?? options.t(uiKeys.history.detail.legacyNotSaved)]
        ], options)}
        ${version.kind === "original" ? `<div class="history-policy-preview"><span>Attention</span>${historyRequestedEffectiveValue(version.attentionMode ?? asset.attentionMode, h3PolicySnapshot?.attentionMode, options)}</div>` : ""}
        <dl><dt>${options.t(uiKeys.history.page.seed)}</dt><dd><code>${version.seed ?? options.t(uiKeys.history.page.notApplicable)}</code></dd><dt>${options.t(uiKeys.history.page.workflow)}</dt><dd><code class="history-record-path" title="${options.escapeHtml(version.workflowPath || "")}">${options.escapeHtml(version.workflowPath?.split(/[\\/]/).pop() || options.t(uiKeys.history.detail.legacyNotSaved))}</code></dd><dt>Prompt ID</dt><dd><code class="history-record-path" title="${options.escapeHtml(version.comfyPromptId)}">${options.escapeHtml(version.comfyPromptId)}</code></dd></dl>
        <details class="history-record-disclosure"><summary>${options.t(uiKeys.history.page.executionDetails)}</summary><dl>${generationParameterMarkup}</dl>${isMiniMaxH3Model(version.modelId) && h3PolicySnapshot ? `<p>${options.t(uiKeys.history.page.executionPolicyNote)}</p>` : ""}</details>
      </article>
      ${continuumSummaryMarkup}
      <article class="panel history-record history-performance-record">
        ${videoRecordHeading(options.t(uiKeys.history.page.runtimeStats), "activity", options)}
        ${videoPerformance(performanceStats, options)}
      </article>
      <article class="panel history-record">
        ${videoRecordHeading(options.t(uiKeys.history.page.output), "film", options, options.t(version.kind === "original" ? uiKeys.history.page.originalGeneration : uiKeys.history.page.upscaleVersion))}
        ${videoRecordStats([[options.t(uiKeys.history.page.videoDuration), options.formatVideoDuration(version.duration)], [options.t(uiKeys.history.page.resolution), `${version.width}×${version.height}`], [options.t(uiKeys.history.page.finalFps), fps], [options.t(uiKeys.history.page.finalFrames), Math.round(version.duration * fps)]], options)}
        <dl><dt>${options.t(uiKeys.history.page.aspectRatio)}</dt><dd>${options.escapeHtml(version.ratio ?? asset.ratio ?? options.t(uiKeys.history.detail.legacyNotSaved))}</dd><dt>${options.t(uiKeys.history.page.frameProcessing)}</dt><dd>${options.escapeHtml(version.frameInterpolation ?? asset.frameInterpolation ?? options.t(uiKeys.history.detail.legacyNotSaved))}</dd><dt>${options.t(uiKeys.history.page.outputDirectory)}</dt><dd><code class="history-record-path" title="${options.escapeHtml(videoFile?.absolutePath?.replace(/[/\\][^/\\]+$/, "") ?? viewModel.state.settings.outputDirectory)}">${options.escapeHtml(videoFile?.absolutePath?.replace(/[/\\][^/\\]+$/, "") ?? viewModel.state.settings.outputDirectory)}</code></dd></dl>
      </article>
      <article class="panel history-record">
        ${videoRecordHeading(options.t(uiKeys.history.page.inputMedia), "images", options)}
        ${renderVideoInputSnapshotMarkup(asset, options)}
      </article>
      <article class="panel history-record">
        ${videoRecordHeading("LoRA", "sparkles", options, options.t(uiKeys.history.card.count, { count: version.videoLoras?.length ?? asset.videoLoras?.length ?? 0 }))}
        ${videoLoraRecords(version.videoLoras ?? asset.videoLoras ?? [], options)}
      </article>
      </section>
      <article class="panel history-record history-output-files">
        ${videoRecordHeading(options.t(uiKeys.history.page.outputFiles), "folder-open", options, options.t(uiKeys.history.card.count, { count: outputFiles.length }))}
      ${nativeAvSummaryMarkup}
      <div class="output-files">
        ${outputFiles.length === 0
          ? `<p class="muted">${options.t(uiKeys.history.page.noRecognizedFiles)}</p>`
          : outputFiles.map((file) => {
              const identity = fileIdentity(file);
              const isJointAvPayload = identity === jointAvPayloadIdentity;
              const isMotionContextFile = Boolean(motionContextIdentity) && identity === motionContextIdentity;
              const isUnifiedAssetOwner = version.h3AvAsset?.ownerPath
                ? identity === fileIdentity(version.h3AvAsset.ownerPath)
                : false;
              const isUnifiedAssetAlias = version.h3AvAsset?.aliasPaths?.some((candidate) =>
                identity === fileIdentity(candidate)
              ) ?? false;
              const continuumRole = continuumFileRole(file);
              const sizeBytes = file.sizeBytes ?? (isJointAvPayload ? jointAvArtifact?.payloadBytes : undefined);
              const sizeText = sizeBytes == null
                ? options.t(uiKeys.history.page.fileSizeUnknown)
                : options.formatBytes(sizeBytes);
              const locateAction = file.absolutePath
                ? `<button class="ghost icon-button" data-show-file="${options.escapeHtml(file.absolutePath)}" aria-label="${options.t(uiKeys.history.page.showInExplorer)}" title="${options.t(uiKeys.history.page.showInExplorer)}">${options.icon("folder-open")}</button>`
                : `<button class="ghost icon-button" disabled aria-label="${options.t(uiKeys.history.page.fillOutputDirectory)}" title="${options.t(uiKeys.history.page.fillOutputDirectory)}">${options.icon("folder-open")}</button>`;
              const deleteAction = isJointAvPayload && version.h3AvAsset?.storageKind !== "continuum-run-chunk"
                ? `<button class="ghost danger icon-button" aria-label="${options.t(uiKeys.history.page.deleteJointAv)}" title="${options.t(uiKeys.history.page.deleteJointAv)}" data-delete-joint-av="${options.escapeHtml(asset.id)}" data-joint-av-version-id="${options.escapeHtml(version.id)}">${options.icon("trash-2")}</button>`
                : isMotionContextFile
                  ? `<button class="ghost danger icon-button" aria-label="${options.t(uiKeys.history.page.deleteMotionContext)}" title="${options.t(uiKeys.history.page.deleteMotionContext)}" data-delete-motion-context="${options.escapeHtml(asset.id)}" data-motion-context-version-id="${options.escapeHtml(version.id)}">${options.icon("trash-2")}</button>`
                  : "";
              const metadata = [file.subfolder, file.type, continuumRole, isUnifiedAssetOwner ? `${version.h3AvAsset?.storageKind} owner${version.h3AvAsset?.storageKind === "continuum-run-chunk" ? " · managed owner" : ""}` : "", isUnifiedAssetAlias ? "alias" : ""].filter(Boolean).join(" · ");
              const av = isJointAvPayload || isUnifiedAssetOwner || isUnifiedAssetAlias || isMotionContextFile;
              const label = isMotionContextFile ? "Motion Context" : av ? options.t(uiKeys.history.page.avFile) : /\.(mp4|webm|mov|mkv)$/i.test(file.filename) ? options.t(uiKeys.history.detail.video) : file.filename.split(".").pop()?.toUpperCase() || options.t(uiKeys.history.page.files);
              const icon = av ? "database" : /\.(mp4|webm|mov|mkv)$/i.test(file.filename) ? "film" : "file-text";
              const statusAttribute = av ? ` data-history-av-status="${options.escapeHtml(artifactInspectionStatus)}"` : "";
              return `<div class="output-file" data-history-file-identity="${options.escapeHtml(identity)}"${statusAttribute}>${options.icon(icon)}<code class="history-output-filename" title="${options.escapeHtml([file.absolutePath || file.filename, metadata].join(" · "))}">${options.escapeHtml(file.filename)}</code><span class="history-file-badge" title="${options.escapeHtml(metadata)}">${options.escapeHtml(label)}</span><span class="history-output-size">${options.escapeHtml(sizeText)}</span>${locateAction}${deleteAction || `<span class="history-output-action-slot"></span>`}</div>`;
            }).join("")}
      </div>
        <details><summary>${options.t(uiKeys.history.page.rawSnapshot)}</summary><pre>${options.escapeHtml(JSON.stringify(version.comfyOutputs, null, 2))}</pre></details>
      </article>
    </section>
    </div>`;
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
  const imageCopyImageAction = filePath ? `<button class="secondary button-with-icon" data-copy-image="${options.escapeHtml(filePath)}">${options.icon("clipboard-copy")}${options.t(uiKeys.history.page.copyImage)}</button>` : "";
  const imageCopyFileAction = filePath ? `<button class="secondary button-with-icon" data-copy-file="${options.escapeHtml(filePath)}">${options.icon("copy")}${options.t(uiKeys.history.menu.copyFile)}</button>` : "";
  const imageLocateAction = filePath ? `<button class="secondary button-with-icon" data-show-file="${options.escapeHtml(filePath)}">${options.icon("folder-open")}${options.t(uiKeys.history.page.openLocation)}</button>` : "";
  const imageSetCoverAction = `<button class="secondary button-with-icon" data-image-set-cover="${options.escapeHtml(project.id)}" data-image-cover-version="${pinnedVersion?.id === version.id ? "" : options.escapeHtml(version.id)}" ${project.coverMode === "auto" && pinnedVersion?.id === version.id ? "disabled" : ""}>${options.icon("bookmark")}${project.coverMode === "pinned" && pinnedVersion?.id === version.id ? options.t(uiKeys.history.page.restoreAutoCover) : options.t(uiKeys.history.page.setCover)}</button>`;
  const imageDeleteVersionAction = `<button class="secondary danger button-with-icon" data-delete-image-version="${options.escapeHtml(project.id)}" data-image-version-delete-id="${options.escapeHtml(version.id)}" ${version.kind === "source" ? "disabled" : ""}>${options.icon("trash-2")}${version.kind === "source" ? options.t(uiKeys.history.page.originalCannotDelete) : options.t(uiKeys.history.page.deleteCurrentVersion)}</button>`;
  const imageDeleteProjectAction = `<button class="secondary danger history-delete-project-action button-with-icon" data-delete-history="${options.escapeHtml(project.id)}">${options.icon("trash-2")}${options.t(uiKeys.history.page.deleteImageProject)}</button>`;
  return `
    <div class="history-image-detail history-media-detail">
    <div class="history-detail-back">
      <button class="secondary button-with-icon history-detail-back-button" data-page="history">${options.icon("arrow-left")}${options.t(uiKeys.history.page.imageBack)}</button>
      <div class="history-detail-tools">
        <span class="history-detail-position" aria-label="${options.t(uiKeys.history.page.imagePosition, { current: projectIndex + 1, total: orderedProjects.length })}">${options.t(uiKeys.history.page.imagePosition, { current: projectIndex + 1, total: orderedProjects.length })}</span>
        <div class="history-detail-navigation" aria-label="${options.t(uiKeys.history.page.switchProjects)}">
          <button class="ghost history-detail-nav-button" data-history-navigation="-1" ${previousProject ? "" : "disabled"} title="${previousProject ? `${options.t(uiKeys.history.page.previous)}：${options.escapeHtml(previousProject.title)}` : options.t(uiKeys.history.page.firstItem)}"><span class="history-detail-nav-label">${options.icon("arrow-left")}${options.t(uiKeys.history.page.previous)}</span><span class="history-detail-nav-shortcut"><kbd>Page Up</kbd></span></button>
          <button class="ghost history-detail-nav-button" data-history-navigation="1" ${nextProject ? "" : "disabled"} title="${nextProject ? `${options.t(uiKeys.history.page.next)}：${options.escapeHtml(nextProject.title)}` : options.t(uiKeys.history.page.lastItem)}"><span class="history-detail-nav-label">${options.t(uiKeys.history.page.next)}${options.icon("arrow-right")}</span><span class="history-detail-nav-shortcut"><kbd>Page Down</kbd></span></button>
        </div>
      </div>
    </div>
    <section class="image-history-detail-layout">
      <div class="image-history-main">
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
            <div class="image-history-stage ${mediaUrl ? "image-media-loading" : "image-media-unavailable"} ${version.width > version.height ? "is-wide" : "is-tall"}" data-image-media data-image-media-surface="detail" data-image-media-source="${options.escapeHtml(filePath)}" data-image-stage="fit" ${mediaUrl ? `role="button" tabindex="0" aria-label="${options.t(uiKeys.history.page.viewLarge)}"` : ""} data-image-orientation="${version.width > version.height ? "wide" : "tall"}" style="--image-aspect:${version.width || 1} / ${version.height || 1}">
              ${mediaUrl ? `<img src="${options.escapeHtml(mediaUrl)}" data-image-media-url="${options.escapeHtml(mediaUrl)}" alt="${options.escapeHtml(title)} · ${options.t(uiKeys.history.version, { version: version.versionNumber })}" data-image-history-stage-image data-image-media-image>` : ""}
              ${renderImageMediaStatus(options)}
            </div>
            <div class="image-history-stage-controls" aria-label="${options.t(uiKeys.history.page.switchProjects)}">
              <button class="icon-button image-history-stage-nav" data-image-version-navigation="-1" ${previousVersion ? "" : "disabled"} title="${previousVersion ? `${options.t(uiKeys.history.page.previous)}：${options.t(uiKeys.history.version, { version: previousVersion.versionNumber })}` : options.t(uiKeys.history.page.earliestVersion)}" aria-label="${options.t(uiKeys.history.page.previous)}${options.t(uiKeys.history.page.versions)}">${options.icon("chevron-left")}</button>
              <span class="image-history-version-position">v${version.versionNumber} · ${versionIndex + 1} / ${project.versions.length}</span>
              <button class="secondary button-with-icon image-history-open-viewer" data-open-image-lightbox ${mediaUrl ? "" : "disabled"}>${options.icon("maximize-2")}${options.t(uiKeys.history.page.viewLarge)}</button>
              <button class="icon-button image-history-stage-nav" data-image-version-navigation="1" ${nextVersion ? "" : "disabled"} title="${nextVersion ? `${options.t(uiKeys.history.page.next)}：${options.t(uiKeys.history.version, { version: nextVersion.versionNumber })}` : options.t(uiKeys.history.page.lastItem)}" aria-label="${options.t(uiKeys.history.page.next)}${options.t(uiKeys.history.page.versions)}">${options.icon("chevron-right")}</button>
            </div>
          </section>
        </div>
      </section>
      ${renderHistoryTags(project.id, project.tags, availableTags, options, true)}
      </div>
      <aside class="image-history-detail-sidebar history-detail-sidebar panel">
        <section class="history-side-zone history-side-work">
          <div class="status-line"><span class="badge ok">${options.t(uiKeys.history.version, { version: version.versionNumber })}${pinnedVersion?.id === version.id ? ` · ${options.t(uiKeys.history.page.currentCover)}` : ""}</span><span class="badge">${options.escapeHtml(version.format.toUpperCase())}</span></div>
          <h1 class="history-detail-title" title="${options.escapeHtml(title)}">${options.escapeHtml(title)}</h1>
          <div class="history-detail-curation">${renderHistoryRatingControl(project.id, project.rating, options, true)}<button type="button" class="secondary icon-button history-favorite-button ${project.favorite ? "is-favorite" : ""}" data-history-favorite="${options.escapeHtml(project.id)}" aria-pressed="${project.favorite}" aria-label="${options.t(project.favorite ? uiKeys.history.page.unfavorite : uiKeys.history.page.favorite)}" title="${options.t(project.favorite ? uiKeys.history.page.unfavorite : uiKeys.history.page.favorite)}">${options.icon("heart")}</button></div>
        </section>
        <section class="history-side-zone"><div class="image-history-facts"><div><span>${options.t(uiKeys.history.page.model)}</span><strong>${options.escapeHtml(version.kind === "source" ? options.t(uiKeys.history.card.originalImage) : options.modelName(version.modelId))}</strong></div><div><span>${options.t(uiKeys.history.page.seed)}</span><strong>${version.seed ?? options.t(uiKeys.runtime.random)}</strong></div><div><span>${options.t(uiKeys.history.page.resolution)}</span><strong>${version.width} × ${version.height}</strong></div><div><span>${options.t(uiKeys.history.page.outputFormat)}</span><strong>${version.format.toUpperCase()}</strong></div><div><span>${options.t(uiKeys.history.page.generatedAt)}</span><strong>${options.escapeHtml(options.formatFullHistoryTime(version.createdAt))}</strong></div><div><span>${options.t(uiKeys.history.page.elapsed)}</span><strong>${elapsedSeconds == null ? options.t(uiKeys.history.detail.legacyNotSaved) : options.escapeHtml(options.formatElapsedDuration(elapsedSeconds))}</strong></div></div></section>
        <section class="history-side-zone history-side-create"><div class="history-side-action-pair">${imageStartVideoAction("primary")}${imageContinueEditAction("secondary")}</div></section>
        <section class="history-side-zone history-side-files"><div class="history-side-heading"><h2>${options.t(uiKeys.history.page.files)}</h2></div><div class="image-history-file-actions">${imageCopyImageAction}${imageCopyFileAction}${imageLocateAction}</div></section>
        <section class="history-side-zone history-side-versions">
          <div class="history-side-heading"><h2>${options.t(uiKeys.history.page.versions)}</h2><span>v${version.versionNumber} · ${versionIndex + 1} / ${project.versions.length}</span></div>
          <p class="image-history-version-note">${parent ? options.t(uiKeys.history.page.currentBasedOn, { version: parent.versionNumber }) : version.kind === "source" ? options.t(uiKeys.history.page.initialImage) : options.t(uiKeys.history.page.noParent)}</p>
          <div class="history-side-version-actions">${imageSetCoverAction}${imageDeleteVersionAction}</div>
        </section>
        <section class="history-side-zone history-side-danger">${imageDeleteProjectAction}</section>
      </aside>
    </section>
    ${version.kind === "source" ? "" : `<article class="panel history-record history-detail-prompt"><div class="history-record-heading"><h2>${options.t(uiKeys.history.page.editRequirements)}</h2><button class="secondary button-with-icon" data-copy-image-prompt>${options.icon("copy")}${options.t(uiKeys.history.page.copyPrompt)}</button></div><div class="history-prompt-scroll" tabindex="0" aria-label="${options.t(uiKeys.history.page.editRequirements)}"><p class="history-prompt">${options.escapeHtml(version.prompt || options.t(uiKeys.history.page.unsavedEditPrompt))}</p></div></article>`}
    <section class="history-record-section" aria-labelledby="history-generation-record-title">
      <div class="history-record-section-heading"><h2 id="history-generation-record-title">${options.t(uiKeys.history.page.generationRecord)}</h2><span class="history-record-section-meta">${options.t(uiKeys.history.version, { version: version.versionNumber })} · ${options.escapeHtml(version.kind === "source" ? options.t(uiKeys.history.card.originalImage) : options.modelName(version.modelId))}</span></div>
      <section class="history-record-grid image-history-record-grid" data-history-record-flow>
      <article class="panel history-record">${videoRecordHeading(options.t(uiKeys.history.page.versionSource), "git-branch", options)}<dl><dt>${options.t(uiKeys.history.page.belongsProject)}</dt><dd>${options.escapeHtml(title)}</dd><dt>${options.t(uiKeys.history.page.parentVersion)}</dt><dd>${parent ? `v${parent.versionNumber}` : version.kind === "source" ? options.t(uiKeys.history.card.originalImage) : options.t(uiKeys.history.page.noParent)}</dd><dt>${options.t(uiKeys.history.page.versionNumber)}</dt><dd>${version.versionNumber} / ${project.versions.length}</dd><dt>${options.t(uiKeys.history.page.versionType)}</dt><dd>${version.kind === "source" ? options.t(uiKeys.history.page.originalMaterial) : version.kind === "upscale" ? options.t(uiKeys.history.page.upscaleVersion) : options.t(uiKeys.history.page.imageEdit)}</dd></dl></article>
      ${version.kind === "source" ? "" : `<article class="panel history-record">${videoRecordHeading(options.t(uiKeys.history.page.generationInfo), "cpu", options)}${videoRecordStats([[options.t(uiKeys.history.page.samplingSteps), generationSummary.steps ?? options.t(uiKeys.history.detail.legacyNotSaved)], ["CFG", generationSummary.cfg ?? options.t(uiKeys.history.detail.legacyNotSaved)], [options.t(uiKeys.history.page.batchCandidates), version.outputCount ?? options.t(uiKeys.history.detail.legacyNotSaved)]], options)}<dl><dt>${options.t(uiKeys.history.page.model)}</dt><dd>${options.escapeHtml(options.modelName(version.modelId))}</dd><dt>${options.t(uiKeys.history.page.modelFile)}</dt><dd><code>${options.escapeHtml(version.diffusionModelFilename ?? options.t(uiKeys.history.detail.legacyNotSaved))}</code></dd><dt>${options.t(uiKeys.history.page.qualityProfile)}</dt><dd>${options.escapeHtml(generationSummary.qualityLabel)}</dd><dt>${options.t(uiKeys.history.page.imageLora)}</dt><dd>${options.escapeHtml(generationSummary.loraLabel)}</dd><dt>${options.t(uiKeys.history.page.targetSize)}</dt><dd>${version.targetResolution === "source" ? options.t(uiKeys.history.page.keepOriginal) : version.targetResolution ? `${version.targetResolution}p` : options.t(uiKeys.history.detail.legacyNotSaved)}</dd><dt>${options.t(uiKeys.history.page.promptVersion)}</dt><dd>${version.promptVersion || options.t(uiKeys.history.detail.legacyNotSaved)}</dd><dt>${options.t(uiKeys.history.page.seed)}</dt><dd>${version.seed ?? options.t(uiKeys.runtime.random)}</dd><dt>${options.t(uiKeys.history.page.generatedAt)}</dt><dd>${options.escapeHtml(options.formatFullHistoryTime(version.createdAt))}</dd><dt>${options.t(uiKeys.history.page.outputFormat)}</dt><dd>${version.format.toUpperCase()}</dd><dt>${options.t(uiKeys.history.page.workflow)}</dt><dd><code>${options.escapeHtml(version.workflowPath || options.t(uiKeys.history.page.originalMaterial))}</code></dd><dt>ComfyUI Prompt ID</dt><dd><code>${options.escapeHtml(version.comfyPromptId ?? options.t(uiKeys.history.detail.legacyNotSaved))}</code></dd></dl></article>`}
      ${version.kind === "source" ? "" : `<article class="panel history-record">${videoRecordHeading(options.t(uiKeys.history.page.inputSnapshot), "images", options, options.t(uiKeys.history.card.pictureCount, { count: version.references.length }))}${renderImageReferenceSnapshotMarkup(version, options)}</article>`}
      <article class="panel history-record history-image-output">${videoRecordHeading(options.t(uiKeys.history.page.outputFiles), "folder", options)}<div class="output-files"><div class="output-file">${options.icon("image")}<code class="history-output-filename" title="${options.escapeHtml(filePath || version.file.filename)}">${options.escapeHtml(version.file.filename)}</code><span class="history-file-badge">${options.escapeHtml(version.format.toUpperCase())}</span><span class="history-output-size">${version.file.sizeBytes == null ? "—" : options.formatBytes(version.file.sizeBytes)}</span>${filePath ? `<button class="ghost icon-button" data-show-file="${options.escapeHtml(filePath)}" aria-label="${options.t(uiKeys.history.page.showInExplorer)}" title="${options.t(uiKeys.history.page.showInExplorer)}">${options.icon("folder-open")}</button>` : `<span title="${options.t(uiKeys.history.page.currentFileUnavailable)}">—</span>`}</div></div><details><summary>${options.t(uiKeys.history.page.rawSnapshot)}</summary><pre>${options.escapeHtml(JSON.stringify(version.comfyOutputs, null, 2) ?? options.t(uiKeys.history.detail.legacyNotSaved))}</pre></details></article>
      ${version.performanceStats ? `<article class="panel history-record">${videoRecordHeading(options.t(uiKeys.history.page.runtimeStats), "activity", options)}${videoPerformance(version.performanceStats, options)}</article>` : ""}
      </section>
    </section>
    ${mediaUrl ? renderImageLightboxMarkup({
      title,
      mediaUrl,
      sourcePath: filePath,
      versionNumber: version.versionNumber,
      width: version.width,
      height: version.height
    }, options) : ""}
    </div>`;
}
