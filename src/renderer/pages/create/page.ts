import type {
  Draft,
  H3PromptMode,
  H3ReferenceRole,
  ImageEditDraft,
  ImagePromptPreset,
  ImageReferenceRole,
  PromptVersion,
  PromptProgress,
  VideoLoraPurpose,
  VideoLoraSelection
} from "../../../types";
import type { Translate } from "../../../core/i18n";
import type { PromptUi } from "../../../core/prompts/types.js";
import { uiKeys } from "../../../core/i18n-keys";
import { ensureMotionContextSourceSlot } from "../../../core/h3-reference";
import { imageOutputCountMax } from "../../../core/image-workflow";
import {
  renderCreateModelOptions,
  renderH3ReferenceSlotsMarkup,
  renderImageEditPromptInstructionOptions,
  type CreateModelOptionViewModel
} from "./fragments";
import { fieldLabelWithTip, promptButtonWithTip } from "../../shared/markup";
import { renderCreateHeading } from "./heading";
import { renderVideoFrames } from "./media-frames";
import { renderImageOutput } from "./image-output";

interface InstallReadyLoraDefinition {
  id: string;
  name: string;
  purpose: VideoLoraPurpose;
  modelFamily: string;
}

interface VideoLoraIssueViewModel {
  severity: "error" | "warning";
  message: string;
}

export interface ContinuumDependencyFileViewModel {
  kind: "payload" | "manifest" | "run-storage" | "chunk-payload";
  filename: string;
  location: string;
  status: "available" | "missing" | "checking" | "not-created";
  chunkIndex?: number;
}

export interface ImageEditPageViewModel {
  draft: ImageEditDraft;
  prompt: PromptVersion;
  imagePromptTokenEstimate?: number;
  promptRuntimeBusy: boolean;
  promptEnhancing: boolean;
  imageCapabilityName: string;
  imageCapabilityDescription?: string;
  imageCapabilityMaxPictures: number;
  imageModelOptionsMarkup: string;
  imageQualityOptionsMarkup: string;
  imageAspectRatioOptionsMarkup: string;
  imageResolutionOptionsMarkup: string;
  imageLoraVisible: boolean;
  imageLoraAddOptionsMarkup: string;
  imageLoraAddDisabled: boolean;
  imageLoraOptionsMarkup: string;
  imageEnhanceMode: ImagePromptPreset;
  imageDetailEnhanceTitle: string;
  imageFaithfulEnhanceTitle: string;
  imagePromptOptimizeTitle: string;
  imagePromptEnhanceBlocked: boolean;
  imagePromptAiDisabled: boolean;
  releasePromptControlTitle: string;
  releasePromptControlIconName: string;
  releasePromptControlDisabled: boolean;
  markupGuideCount: number;
  imageModelInputCount: number;
  enqueueBlockReason: string;
  enqueuePending?: boolean;
  count: number;
  outputCountVisible: boolean;
  promptlessTitle: string;
  promptlessDescription: string;
  promptlessSummary: string;
  promptlessResultDescription: string;
  imageProfileStatusText: string;
  enqueueBusy: boolean;
  promptless: boolean;
  maskRequired: boolean;
  sourceResolutionOnly: boolean;
  imageAspectRatioVisible: boolean;
  imageResolutionVisible: boolean;
  supportsTextOnly: boolean;
  maskSupported: boolean;
  annotationSupported: boolean;
}

export interface VideoCreatePageViewModel {
  draft: Draft;
  prompt: PromptVersion;
  promptVersionIndex: number;
  promptVersionCount: number;
  promptRuntimeBusy: boolean;
  promptEnhancing: boolean;
  promptProgress: PromptProgress | null;
  extending: boolean;
  isR2V: boolean;
  isMiniMaxH3: boolean;
  h3LongDurationWarning: boolean;
  isContinuum: boolean;
  continuumManaged: boolean;
  continuumStatusTone: "success" | "info" | "warning" | "error";
  continuumStatusLabel: string;
  continuumStatusDetail: string;
  continuumFileStatus: { tone: "success" | "info" | "warning" | "error"; label: string };
  continuumArtifactReady: boolean;
  continuumArtifactFilename: string;
  continuumArtifactHistoryBound: boolean;
  continuumDependencyRoute: string;
  continuumDependencyProgress: string;
  continuumDependencyFiles: ReadonlyArray<ContinuumDependencyFileViewModel>;
  motionContextLatentReady: boolean;
  motionContextLatentFilename: string;
  motionContextLatentHistoryBound: boolean;
  motionContextStatusTone: "success" | "info" | "warning" | "error";
  motionContextStatusLabel: string;
  motionContextStatusDetail: string;
  h3Mode?: H3PromptMode;
  enhanceMode: "faithful" | "sulphur-native" | "h3-vision";
  h3PromptEnhanceTitle: string;
  referenceAutoPromptAvailable: boolean;
  releasePromptControlTitle: string;
  releasePromptControlIconName: string;
  releasePromptControlDisabled: boolean;
  promptAiDisabled: boolean;
  promptEnhanceButtonTitle: string;
  promptUi: PromptUi;
  h3PromptPresetOptionsMarkup: string;
  promptSnippetOptionsMarkup: string;
  h3PromptCheckMarkup: string;
  modelOptions: ReadonlyArray<CreateModelOptionViewModel>;
  resolutionOptionsMarkup: string;
  resolutionChoices: readonly number[];
  selectedResolution: number;
  customResolution?: { min: number; max: number; step: number };
  outputWidth: number;
  outputHeight: number;
  stepsOptionsMarkup: string;
  stepsTitle: string;
  spectrumLabelMarkup: string;
  spectrumOptionsMarkup: string;
  spectrumTitle: string;
  spectrumModeDisabled: boolean;
  jointAvLabelMarkup: string;
  latentSaveModeOptionsMarkup: string;
  latentSaveDisabled: boolean;
  loraLabelMarkup: string;
  installReadyLoraDefinitions: ReadonlyArray<InstallReadyLoraDefinition>;
  installReadyLoraEmptyLabel: string;
  loraIssues: ReadonlyArray<VideoLoraIssueViewModel>;
  trimDuration: number;
  trimStartPercent: number;
  trimEndPercent: number;
  videoReady: boolean;
  r2vImageCount: number;
  r2vVideoCount: number;
  r2vTotalCount: number;
  r2vSlotsReady: boolean;
  safetySafe: boolean;
  safetyMessage: string;
  safetyMaxDurationSeconds: number;
  nativeMaxDurationSeconds: number;
  unlockedMaxDurationSeconds: number;
  safetyMaxGeneratedFrames: number;
  interpolationMultiplier: 1 | 2 | 4;
  interpolationGeneratedFrames: number;
  interpolationOutputFrames: number;
  supportsEndImage: boolean;
  selectedWorkflowDescription: string;
  enqueueBlockReason: string;
  enqueueDisabled: boolean;
  enqueuePending?: boolean;
  enqueueBusy: boolean;
  h3TokenEstimate?: number;
}

function promptElapsedText(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export type CreatePageViewModel = ImageEditPageViewModel | VideoCreatePageViewModel;

export interface CreatePageOptions {
  t: Translate;
  icon(name: string, className?: string): string;
  escapeHtml(value: unknown): string;
  h3ReferenceRoleLabels: Record<H3ReferenceRole, string>;
  imageReferenceRoleLabels: Record<ImageReferenceRole, string>;
  videoLoraInfoButton(lora: VideoLoraSelection): string;
  videoLoraPurposeLabel(purpose: VideoLoraPurpose): string;
}

function imageReferenceRoleOptions(
  options: CreatePageOptions,
  picture: ImageEditDraft["pictures"][number]
): string {
  return (Object.entries(options.imageReferenceRoleLabels) as Array<[ImageReferenceRole, string]>)
    .map(([value, label]) =>
      `<option value="${value}" ${picture.role === value || (picture.pictureNumber === 1 && value === "base") ? "selected" : ""}>${label}</option>`
    )
    .join("");
}

export function renderImageEditPage(
  viewModel: ImageEditPageViewModel,
  options: CreatePageOptions
): string {
  const icon = options.icon;
  const escapeHtml = options.escapeHtml;
  const t = options.t;
  const maskMode = viewModel.maskRequired;
  const supportsMultiplePictures = viewModel.imageCapabilityMaxPictures > 1;
  const hasBasePicture = Boolean(
    viewModel.draft.pictures.find((picture) => picture.pictureNumber === 1)?.absolutePath
  );
  const showPictureDropZone = viewModel.imageCapabilityMaxPictures > 0 && (supportsMultiplePictures
    ? !(maskMode && hasBasePicture)
    : !hasBasePicture);
  const renderPictureTools = (picture: ImageEditDraft["pictures"][number]): string => {
    if (!picture.absolutePath) return "";
    const buttons: string[] = [];
    if (maskMode) {
      buttons.push(`<button class="secondary button-with-icon" data-markup-image-picture="${escapeHtml(picture.id)}" aria-label="${t(uiKeys.create.markup.maskTitle)}" title="${t(picture.mask ? uiKeys.create.finish.editMask : uiKeys.create.finish.drawMask)}">${icon("brush")}<span>${t(picture.mask ? uiKeys.create.finish.editMask : uiKeys.create.finish.drawMask)}</span></button>`);
    } else if (!viewModel.promptless && viewModel.annotationSupported) {
      buttons.push(`<button class="icon-button" data-markup-image-picture="${escapeHtml(picture.id)}" aria-label="${t(uiKeys.create.imageEdit.markPicture, { index: picture.pictureNumber })}" title="${t(uiKeys.create.imageEdit.markImage)}">${icon("pencil")}</button>`);
    }
    if (!maskMode && viewModel.maskSupported) {
      buttons.push(`<button class="icon-button" data-mask-image-picture="${escapeHtml(picture.id)}" aria-label="${t(uiKeys.create.finish.drawMask)}" title="${t(picture.mask ? uiKeys.create.finish.editMask : uiKeys.create.finish.drawMask)}">${icon("brush")}</button>`);
    }
    return buttons.join("");
  };
  return `
    ${renderCreateHeading("image-edit", options)}
    <div class="create-workspace image-edit-workspace">
      <section class="media-panel image-edit-references create-image-media">
        <div class="section-heading create-media-heading">
          ${viewModel.imageCapabilityMaxPictures === 0
            ? `<div><h2>${escapeHtml(viewModel.imageCapabilityName)}</h2></div>`
            : `<div><h2>${t(uiKeys.create.imageReferencesTitle)}</h2><span class="muted">${t(uiKeys.create.imageEdit.slotSummary, { count: viewModel.draft.pictures.length, max: viewModel.imageCapabilityMaxPictures })}${viewModel.markupGuideCount ? ` · ${t(uiKeys.create.imageEdit.modelInputSummary, { count: viewModel.imageModelInputCount, max: viewModel.imageCapabilityMaxPictures })}` : ""}</span></div>`}
          ${maskMode || !supportsMultiplePictures ? "" : `<button class="secondary button-with-icon" id="add-image-slot" ${viewModel.draft.pictures.length >= viewModel.imageCapabilityMaxPictures ? "disabled" : ""}>${icon("plus")}${t(uiKeys.create.addSlot)}</button>`}
        </div>
        ${viewModel.imageCapabilityMaxPictures === 0 ? `<p class="muted">${escapeHtml(viewModel.imageCapabilityDescription ?? "")}</p>` : ""}
        ${viewModel.imageCapabilityMaxPictures === 0 && !viewModel.draft.pictures.some(picture => picture.absolutePath) ? "" : `<div class="image-picture-list">
          ${viewModel.draft.pictures.length ? viewModel.draft.pictures.map((picture) => `
            <article class="image-picture-card ${picture.pictureNumber === 1 ? "is-base" : "is-reference"} ${picture.absolutePath ? "has-picture" : "is-empty"} ${picture.markup || picture.mask ? "has-markup" : ""}" data-image-picture-card="${escapeHtml(picture.id)}">
              <div class="create-image-surface create-slot-media" style="--media-ratio:${picture.width > 0 && picture.height > 0 ? `${picture.width} / ${picture.height}` : "16 / 7"};--media-r:${picture.width > 0 && picture.height > 0 ? picture.width / picture.height : 16 / 7}">
              <button class="image-picture-preview ${picture.absolutePath ? "has-image" : ""}" ${viewModel.imageCapabilityMaxPictures === 0 ? "disabled" : ""} data-image-picture-pick="${escapeHtml(picture.id)}" data-drop-label="${escapeHtml(t(picture.absolutePath ? uiKeys.create.imageEdit.replaceSlotImage : uiKeys.create.imageEdit.chooseSlotImage, { index: picture.pictureNumber }))}" style="--picture-ratio:${picture.width > 0 && picture.height > 0 ? `${picture.width} / ${picture.height}` : "1 / 1"}" aria-label="${t(picture.absolutePath ? uiKeys.create.imageEdit.replaceSlotImage : uiKeys.create.imageEdit.chooseSlotImage, { index: picture.pictureNumber })}">
                <img data-image-picture-preview="${escapeHtml(picture.id)}" alt="${t(uiKeys.create.imageEdit.previewAlt, { index: picture.pictureNumber })}" ${picture.absolutePath ? "" : "hidden"}>
                ${picture.absolutePath ? "" : `<span>${icon("image-plus")}${t(uiKeys.create.imageEdit.chooseImage)}</span>`}
              </button>
              <span class="create-image-badges">${picture.crop ? `<span title="${picture.crop.width} × ${picture.crop.height}">${icon("crop")}${t(uiKeys.create.markup.crop)}</span>` : ""}${picture.mask ? `<span>${icon("brush")}Mask · ${picture.mask.regionCount}</span>` : picture.markup ? `<span>${icon("pencil")}${t(uiKeys.create.imageEdit.markedCount, { count: picture.markup.objectCount })}</span>` : ""}</span>
              ${picture.absolutePath ? `<div class="create-media-actions"><button type="button" data-image-picture-pick="${escapeHtml(picture.id)}">${icon("refresh-cw")}${t(uiKeys.create.mediaReplace)}</button><button type="button" data-clear-image-picture="${escapeHtml(picture.id)}">${icon("x")}${t(uiKeys.create.mediaClear)}</button></div>` : ""}
              </div>
              <div class="image-picture-card-body">
                <div class="image-picture-card-title"><span class="create-picture-index">${picture.pictureNumber}</span><span class="picture-number">Picture ${picture.pictureNumber}</span>${picture.pictureNumber === 1 ? `<span class="model-badge">${t(uiKeys.create.imageEdit.baseInput)}</span>` : ""}</div>
                <code title="${escapeHtml(picture.absolutePath)}">${picture.absolutePath ? escapeHtml((picture.originalPath || picture.absolutePath).split(/[\\/]/u).pop() ?? picture.absolutePath) : t(uiKeys.create.imageEdit.notAdded)}</code>
                ${maskMode || picture.pictureNumber === 1 ? "" : `<label><select aria-label="${t(uiKeys.create.imageEdit.referenceRole)}" data-image-picture-role="${escapeHtml(picture.id)}">${imageReferenceRoleOptions(options, picture)}</select></label>`}
              </div>
              <div class="image-picture-card-actions">${renderPictureTools(picture)}<button class="icon-button danger" data-remove-image-picture="${escapeHtml(picture.id)}" aria-label="${t(uiKeys.create.imageEdit.deleteSlot, { index: picture.pictureNumber })}" title="${t(uiKeys.create.imageEdit.deleteSlot, { index: picture.pictureNumber })}">${icon("trash-2")}</button></div>
            </article>`).join("") : `<div class="image-picture-empty"><span>${icon("images")}</span><strong>${t(viewModel.supportsTextOnly ? uiKeys.create.finish.optionalReference : uiKeys.create.imageEdit.emptyTitle)}</strong>${viewModel.supportsTextOnly ? "" : `<small>${t(uiKeys.create.imageEdit.emptyDescription)}</small>`}</div>`}
        </div>
        `}
        ${showPictureDropZone ? `<button class="drop-zone image-picture-drop-zone" id="image-picture-drop-zone" data-image-picture-drop ${supportsMultiplePictures && viewModel.draft.pictures.length >= viewModel.imageCapabilityMaxPictures ? "disabled" : ""}>
          <span class="drop-icon">${icon("upload")}</span><strong>${t(supportsMultiplePictures ? uiKeys.create.imageEdit.dropNextSlot : uiKeys.create.imageEdit.chooseImage)}</strong><span>${t(uiKeys.create.imageEdit.imageFormats)}</span>
        </button>` : ""}
      </section>
      <section class="panel composer image-edit-composer create-editor">
        <section class="create-prompt-card">
        ${viewModel.promptless ? `<div class="section-heading composer-heading"><div><h2>${escapeHtml(viewModel.promptlessTitle)}</h2><span class="muted">${escapeHtml(viewModel.promptlessDescription)}</span></div></div>` : `<div class="section-heading composer-heading">
          <div class="composer-heading-main"><h2>${t(uiKeys.create.promptTitle)}</h2><span class="muted">${viewModel.draft.activePromptVersion + 1} / ${viewModel.draft.promptVersions.length} · ${escapeHtml(viewModel.prompt.label)}</span><div class="prompt-version-controls"><button class="icon-button" id="image-prompt-prev" aria-label="${t(uiKeys.create.imageEdit.previousPrompt)}" ${viewModel.draft.activePromptVersion === 0 ? "disabled" : ""}>${icon("chevron-left")}</button><button class="icon-button" id="image-prompt-next" aria-label="${t(uiKeys.create.imageEdit.nextPrompt)}" ${viewModel.draft.activePromptVersion >= viewModel.draft.promptVersions.length - 1 ? "disabled" : ""}>${icon("chevron-right")}</button><button class="icon-button danger" id="clear-image-prompt" aria-label="${t(uiKeys.create.clearPrompt)}" title="${t(uiKeys.create.clearPrompt)}">${icon("trash-2")}</button></div></div>
          <div class="prompt-action-controls">
            <div class="prompt-mode-control"><select class="prompt-enhance-mode" id="prompt-enhance-mode" aria-label="${t(uiKeys.create.imageEdit.optimizeMethod)}">
              <option value="detail-enhance" title="${escapeHtml(viewModel.imageDetailEnhanceTitle)}" ${viewModel.imageEnhanceMode === "detail-enhance" ? "selected" : ""}>${t(uiKeys.create.imageEdit.detailEnhance)}</option>
              <option value="faithful" title="${escapeHtml(viewModel.imageFaithfulEnhanceTitle)}" ${viewModel.imageEnhanceMode === "faithful" ? "selected" : ""}>${t(uiKeys.create.imageEdit.faithful)}</option>
            </select></div>
            ${promptButtonWithTip(`<button class="icon-button prompt-runtime-button ${viewModel.releasePromptControlIconName === "refresh-cw" ? "busy" : ""}" id="release-prompt-model-create" ${viewModel.releasePromptControlDisabled ? "disabled" : ""} aria-label="${escapeHtml(viewModel.releasePromptControlTitle)}" aria-describedby="prompt-runtime-tooltip" aria-busy="${viewModel.releasePromptControlIconName === "refresh-cw"}">${icon(viewModel.releasePromptControlIconName)}</button>`, viewModel.releasePromptControlTitle, "prompt-runtime-tooltip", viewModel.releasePromptControlDisabled)}
            ${promptButtonWithTip(`<button class="secondary button-with-icon" id="enhance-prompt" data-prompt-enhance-blocked="${viewModel.imagePromptEnhanceBlocked ? "true" : "false"}" ${viewModel.imagePromptAiDisabled && !viewModel.promptEnhancing ? "disabled" : ""} aria-describedby="prompt-progress-tooltip" aria-busy="${viewModel.promptEnhancing}">${icon(viewModel.promptEnhancing ? "x" : "sparkles")}${viewModel.promptEnhancing ? t(uiKeys.create.imageEdit.optimizing) : t(uiKeys.create.imageEdit.optimizePrompt)}</button>`, viewModel.promptEnhancing ? `${t(uiKeys.create.imageEdit.optimizing)} · ${t(uiKeys.create.promptProgress.cancel)}` : viewModel.imagePromptOptimizeTitle, "prompt-progress-tooltip", viewModel.imagePromptAiDisabled && !viewModel.promptEnhancing, true)}
          </div>
        </div>`}
        ${viewModel.promptless ? "" : `
        <div class="prompt-editor-shell"><textarea id="image-edit-prompt-input" rows="6" spellcheck="true" aria-keyshortcuts="Control+Z Control+Y Control+Shift+Z" lang="${/[\u3400-\u9fff]/u.test(viewModel.prompt.text) ? "zh-CN" : "en-US"}">${escapeHtml(viewModel.prompt.text)}</textarea></div>
        `}
        ${viewModel.promptless ? "" : `<div class="create-prompt-footer">${viewModel.imageCapabilityMaxPictures > 0 ? `<select id="image-edit-instruction" hidden data-native-select>${renderImageEditPromptInstructionOptions(escapeHtml, t)}</select><button id="insert-image-edit-instruction" hidden disabled></button><button class="secondary button-with-icon" id="image-prompt-insert-trigger" type="button" aria-haspopup="dialog" aria-expanded="false" data-search-label="${t(uiKeys.create.insertSearch)}" data-empty-label="${t(uiKeys.create.insertEmpty)}">${icon("text-cursor-input")}${t(uiKeys.create.imageEdit.quickInsert)}${icon("chevron-down")}</button>` : ""}<span class="create-prompt-spacer"></span><div id="image-prompt-word-counter" class="prompt-word-counter" aria-live="polite"></div></div>`}
        </section>
        ${renderImageOutput(viewModel, options)}
      </section>
    </div>`;
}

const STANDARD_VIDEO_RATIO_OPTIONS: ReadonlyArray<Draft["ratio"]> = [
  "source", "16:9", "9:16", "1:1", "4:3", "3:4"
];
const H3_VIDEO_RATIO_OPTIONS: ReadonlyArray<Draft["ratio"]> = [
  "source", "16:9", "21:9", "9:16", "1:1", "4:3", "3:4"
];

export function videoRatioOptionsFor(
  isMiniMaxH3: boolean
): ReadonlyArray<Draft["ratio"]> {
  return isMiniMaxH3 ? H3_VIDEO_RATIO_OPTIONS : STANDARD_VIDEO_RATIO_OPTIONS;
}

export function renderCreatePage(
  viewModel: VideoCreatePageViewModel,
  options: CreatePageOptions
): string {
  const icon = options.icon;
  const escapeHtml = options.escapeHtml;
  const t = options.t;
  const promptUi = viewModel.promptUi;
  const continuumDependencyLabelFor = (file: ContinuumDependencyFileViewModel): string => {
    if (file.kind === "payload") return t(uiKeys.create.continuumArtifact.dependencyPayload);
    if (file.kind === "manifest") return t(uiKeys.create.continuumArtifact.dependencyManifest);
    if (file.kind === "run-storage") return t(uiKeys.create.continuumArtifact.dependencyRunStorage);
    return t(uiKeys.create.continuumArtifact.dependencyChunkPayload, { index: file.chunkIndex ?? 0 });
  };
  const continuumDependencyStatusLabelFor = (status: ContinuumDependencyFileViewModel["status"]): string => {
    if (status === "available") return t(uiKeys.create.continuumArtifact.dependencyAvailable);
    if (status === "checking") return t(uiKeys.create.continuumArtifact.dependencyChecking);
    if (status === "not-created") return t(uiKeys.create.continuumArtifact.dependencyNotCreated);
    return t(uiKeys.create.continuumArtifact.dependencyMissing);
  };
  const continuumDependencyActionsFor = (file: ContinuumDependencyFileViewModel): string => {
    if (viewModel.continuumManaged) {
      return "";
    }
    if (file.kind === "manifest") {
      return "";
    }
    if (file.kind !== "payload") return "";
    const chooseLabel = viewModel.continuumArtifactFilename
      ? t(uiKeys.create.continuumArtifact.change)
      : t(uiKeys.create.continuumArtifact.choose);
    return `<div class="continuum-source-row continuum-dependency-actions">
      <button class="ghost icon-button" type="button" id="pick-h3-continuum-av" data-drop-h3-continuum-av title="${escapeHtml(chooseLabel)}" aria-label="${escapeHtml(chooseLabel)}">${icon("folder-open")}</button>
      ${viewModel.continuumArtifactFilename ? `<button class="ghost icon-button danger" id="clear-h3-continuum-av" data-clear-h3-continuum-av type="button" title="${escapeHtml(t(uiKeys.create.continuumArtifact.clear))}" aria-label="${escapeHtml(t(uiKeys.create.continuumArtifact.clear))}">${icon("x")}</button>` : ""}
    </div>`;
  };
  const continuumDependencyFilesMarkup = viewModel.continuumDependencyFiles.map((file) =>
    `<div class="continuum-dependency-file" data-continuum-dependency-file="${file.kind}:${file.chunkIndex ?? ""}" data-continuum-file-status="${file.status}">
      <span class="continuum-dependency-status-dot" aria-hidden="true"></span>
      <div class="continuum-dependency-file-copy"><strong>${escapeHtml(continuumDependencyLabelFor(file))}</strong><span data-continuum-file-name title="${escapeHtml(file.location || file.filename)}">${escapeHtml(file.filename)}</span></div>
      <span class="continuum-dependency-file-status" data-continuum-file-status-label>${escapeHtml(continuumDependencyStatusLabelFor(file.status))}</span>
      ${continuumDependencyActionsFor(file)}
    </div>`
  ).join("");
  const continuumDependencyEmptyMarkup = !viewModel.continuumManaged && viewModel.continuumDependencyFiles.length === 0
    ? `<div class="continuum-source-row continuum-dependency-empty">
        <button class="secondary button-with-icon" type="button" id="pick-h3-continuum-av" data-drop-h3-continuum-av title="${escapeHtml(t(uiKeys.create.continuumArtifact.choose))}" aria-label="${escapeHtml(t(uiKeys.create.continuumArtifact.choose))}">${icon("folder-open")}${escapeHtml(t(uiKeys.create.continuumArtifact.choose))}</button>
      </div>`
    : "";
  return `
    ${renderCreateHeading(viewModel.extending ? "video" : "image", options)}
    <div class="create-workspace ${viewModel.isR2V ? "r2v-workspace" : ""} ${viewModel.isContinuum ? "continuum-workspace" : ""}">
      <section class="panel media-panel create-video-media">
      <div class="create-media-heading">
        <h2>${t(viewModel.extending ? uiKeys.create.videoInputTitle : viewModel.isR2V ? uiKeys.create.r2vReferencesTitle : uiKeys.create.referencesTitle)}</h2>${viewModel.isR2V ? `<span title="${escapeHtml(t(uiKeys.create.videoMedia.r2vSummary, { images: viewModel.r2vImageCount, videos: viewModel.r2vVideoCount }))}">${t(uiKeys.create.mediaReferenceCounts, { images: viewModel.r2vImageCount, videos: viewModel.r2vVideoCount })}</span>` : ""}
        ${viewModel.extending && viewModel.draft.sourceVideoPath ? `<button class="ghost button-with-icon" id="remove-video">${icon("x")}${t(uiKeys.create.removeVideo)}</button>` : ""}
      </div>
      ${viewModel.extending
        ? viewModel.draft.sourceVideoPath
          ? `<div class="video-editor">
              <media-controller id="extend-video-player" class="panel history-player extend-video-player" autohide="1" fullscreenelement="extend-video-player" aria-label="${escapeHtml(t(uiKeys.create.videoExtension))}">
                <video id="source-video" slot="media" src="studio-media://draft/video?source=${encodeURIComponent(viewModel.draft.sourceVideoPath)}" muted playsinline preload="metadata"></video>
                <media-control-bar class="history-player-control-bar extend-video-control-bar">
                  <media-play-button></media-play-button>
                  <button class="history-player-nav-button extend-video-boundary-button" id="preview-extension-boundary" type="button" ${!viewModel.videoReady ? "disabled" : ""} aria-label="${escapeHtml(t(uiKeys.create.videoMedia.previewExtensionBoundary))}" title="${escapeHtml(t(uiKeys.create.videoMedia.previewExtensionBoundary))}">${icon("skip-forward")}</button>
                  <media-time-range></media-time-range>
                  <div class="history-player-volume">
                    <media-mute-button></media-mute-button>
                    <media-volume-range></media-volume-range>
                  </div>
                  <span class="history-player-control-divider history-player-utility-divider" aria-hidden="true"></span>
                  <div class="history-player-utility-group">
                    <media-fullscreen-button></media-fullscreen-button>
                  </div>
                </media-control-bar>
              </media-controller>
              ${viewModel.videoReady
                ? viewModel.isContinuum
                  ? ""
                  : `<div class="trim-panel">
                    <div class="trim-heading"><strong>${t(uiKeys.create.videoMedia.trimTitle)}</strong><span><output id="trim-start-output">${formatTrimTime(viewModel.draft.trimStartSeconds)}</output> — <output id="trim-end-output">${formatTrimTime(viewModel.draft.trimEndSeconds)}</output></span></div>
                    <div class="trim-editor" id="trim-editor" data-ui-skip style="--trim-start:${viewModel.trimStartPercent}%;--trim-end:${viewModel.trimEndPercent}%">
                      <div class="trim-filmstrip" aria-hidden="true">${Array.from({ length: 8 }, () => "<i></i>").join("")}</div>
                      <div class="trim-dim trim-dim-start"></div><div class="trim-dim trim-dim-end"></div><div class="trim-selection"></div>
                      <input class="trim-range" id="trim-start" type="range" min="0" max="${viewModel.draft.sourceVideoDuration}" step="0.1" value="${viewModel.draft.trimStartSeconds}" aria-label="${t(uiKeys.create.videoMedia.trimStart)}" aria-valuetext="${formatTrimTime(viewModel.draft.trimStartSeconds)}">
                      <input class="trim-range" id="trim-end" type="range" min="0" max="${viewModel.draft.sourceVideoDuration}" step="0.1" value="${viewModel.draft.trimEndSeconds}" aria-label="${t(uiKeys.create.videoMedia.trimEnd)}" aria-valuetext="${formatTrimTime(viewModel.draft.trimEndSeconds)}">
                    </div>
                    <div class="trim-summary" aria-live="polite">
                      <span>${t(uiKeys.create.videoMedia.kept)}<strong id="trim-kept">${viewModel.trimDuration.toFixed(1)} ${t(uiKeys.create.videoMedia.seconds)}</strong></span>
                      <span>${t(uiKeys.create.videoMedia.discarded)}<strong id="trim-discarded">${Math.max(0, viewModel.draft.sourceVideoDuration - viewModel.trimDuration).toFixed(1)} ${t(uiKeys.create.videoMedia.seconds)}</strong></span>
                      <span>${t(uiKeys.create.videoMedia.added)}<strong id="trim-added">${viewModel.draft.duration.toFixed(1)} ${t(uiKeys.create.videoMedia.seconds)}</strong></span>
                      <span>${t(uiKeys.create.videoMedia.estimatedOutput)}<strong id="trim-total">${t(uiKeys.create.videoSettings.approximateSeconds, { value: (viewModel.trimDuration + viewModel.draft.duration).toFixed(1) })}</strong></span>
                    </div>
                  </div>`
                : `<p class="video-loading">${t(uiKeys.create.videoMedia.loadingVideo)}</p>`}
            </div>`
            : `<button class="drop-zone video-drop-zone" id="pick-video" data-drop-video data-drop-label="${t(uiKeys.create.videoMedia.addVideoDrop)}">
              <span class="drop-icon">${icon("video")}</span><strong>${t(uiKeys.create.videoMedia.chooseOrDropVideo)}</strong>
            </button>`
        : viewModel.isR2V
          ? renderH3ReferenceSlotsMarkup(viewModel.draft.h3ReferenceSlots, {
              icon,
              escapeHtml,
              h3ReferenceRoleLabels: options.h3ReferenceRoleLabels,
              t
            })
          : renderVideoFrames(viewModel, options)}
        ${viewModel.extending && viewModel.isContinuum && !viewModel.draft.longVideoRunSource ? `<section class="continuum-artifact-panel continuum-source-check" aria-labelledby="continuum-dependency-title">
        <div class="continuum-dependency-heading"><h3 id="continuum-dependency-title">${escapeHtml(t(uiKeys.create.continuumArtifact.dependencyTitle))}</h3><span class="continuum-route-value" data-continuum-route>${escapeHtml(viewModel.continuumDependencyRoute)}</span></div>
<div class="continuum-status continuum-dependency-summary" data-continuum-source-status data-tone="${viewModel.continuumFileStatus.tone}" role="status"><strong><span class="continuum-source-state-icon" data-continuum-status-icon aria-hidden="true">${icon(viewModel.continuumFileStatus.tone === "success" ? "circle-check" : viewModel.continuumFileStatus.tone === "error" ? "circle-alert" : "info")}</span><span data-continuum-status-label>${escapeHtml(viewModel.continuumFileStatus.label)}</span></strong><span data-continuum-progress>${escapeHtml(viewModel.continuumDependencyProgress)}</span></div>
        ${viewModel.continuumDependencyFiles.length > 0 ? `<div class="continuum-dependency-files" aria-label="${escapeHtml(t(uiKeys.create.continuumArtifact.dependencyTitle))}">${continuumDependencyFilesMarkup}</div>` : ""}
        ${continuumDependencyEmptyMarkup}
      </section>` : ""}
      ${viewModel.extending && viewModel.isR2V ? `<section class="continuum-artifact-panel h3-motion-context-latent-panel" aria-labelledby="motion-context-latent-title">
        <div class="section-heading">
          <div><h2 id="motion-context-latent-title" title="${escapeHtml(t(uiKeys.create.motionContextLatent.description))}">${t(uiKeys.create.motionContextLatent.title)}</h2></div>
        </div>
        <div class="create-context-file"><span class="create-context-dot" data-tone="${viewModel.motionContextStatusTone}"></span><code title="${escapeHtml(viewModel.draft.h3ContextLatentPath ?? "")}">${escapeHtml(viewModel.motionContextLatentFilename || t(uiKeys.create.motionContextLatent.empty))}</code><button class="ghost" type="button" id="pick-h3-motion-context-latent" data-drop-h3-motion-context-latent>${t(viewModel.motionContextLatentReady ? uiKeys.create.motionContextLatent.change : uiKeys.create.motionContextLatent.choose)}</button>${viewModel.motionContextLatentReady ? `<button class="ghost icon-button" id="clear-h3-motion-context-latent" type="button" aria-label="${t(uiKeys.create.motionContextLatent.clear)}">${icon("x")}</button>` : ""}</div>
        <div class="continuum-status" data-motion-context-status data-tone="${viewModel.motionContextStatusTone}" role="status" ${!viewModel.motionContextLatentReady || viewModel.motionContextStatusTone === "success" ? "hidden" : ""}>
          <strong>${escapeHtml(viewModel.motionContextStatusLabel)}</strong><span>${escapeHtml(viewModel.motionContextStatusDetail)}</span>
        </div>
      </section>` : ""}
      ${viewModel.extending && viewModel.isR2V && viewModel.draft.sourceVideoPath ? `<section class="h3-motion-context-references">
        <div class="section-heading">
          <div><h2>${t(uiKeys.create.r2vReferencesTitle)}</h2></div>
        </div>
        ${renderH3ReferenceSlotsMarkup(
          ensureMotionContextSourceSlot(viewModel.draft.h3ReferenceSlots, viewModel.draft.sourceVideoPath),
          { icon, escapeHtml, h3ReferenceRoleLabels: options.h3ReferenceRoleLabels, t, lockedFirstVideo: true }
        )}
      </section>` : ""}
      </section>
      <div class="composer create-editor">
      <section class="create-prompt-card">
      <div class="create-prompt-toolbar">
        <div class="composer-heading-main">
          <h2>${t(viewModel.extending ? uiKeys.create.extensionPromptTitle : uiKeys.create.promptTitle)}</h2>
          <span class="muted">${viewModel.promptVersionIndex + 1} / ${viewModel.promptVersionCount} · ${escapeHtml(viewModel.prompt.label)}</span>
          <div class="prompt-version-controls">
            <button class="icon-button" id="prompt-prev" aria-label="${promptUi.t("previousVersion")}" title="${promptUi.t("previousVersion")}" ${viewModel.promptVersionIndex === 0 ? "disabled" : ""}>${icon("chevron-left")}</button>
            <button class="icon-button" id="prompt-next" aria-label="${promptUi.t("nextVersion")}" title="${promptUi.t("nextVersion")}" ${viewModel.promptVersionIndex >= viewModel.promptVersionCount - 1 ? "disabled" : ""}>${icon("chevron-right")}</button>
            <button class="icon-button danger" id="clear-prompt" aria-label="${t(uiKeys.create.clearPrompt)}" title="${t(uiKeys.create.clearPrompt)}">${icon("trash-2")}</button>
          </div>
        </div>
        <div class="prompt-action-controls">
          <div class="prompt-mode-control"><select class="prompt-enhance-mode" id="prompt-enhance-mode" aria-label="${promptUi.t("enhanceMode")}">
            ${viewModel.isMiniMaxH3
              ? viewModel.h3PromptPresetOptionsMarkup
                : `<option value="sulphur-native" ${viewModel.enhanceMode === "sulphur-native" ? "selected" : ""}>${promptUi.t("sulphurNativeEnhance")}</option>
                  <option value="faithful" ${viewModel.enhanceMode === "faithful" ? "selected" : ""}>${promptUi.t("faithfulEnhance")}</option>`}
          </select></div>
             ${promptButtonWithTip(`<button class="icon-button prompt-runtime-button ${viewModel.releasePromptControlIconName === "refresh-cw" ? "busy" : ""}" id="release-prompt-model-create" ${viewModel.releasePromptControlDisabled ? "disabled" : ""} aria-label="${escapeHtml(viewModel.releasePromptControlTitle)}" aria-describedby="prompt-runtime-tooltip" aria-busy="${viewModel.releasePromptControlIconName === "refresh-cw"}">${icon(viewModel.releasePromptControlIconName)}</button>`, viewModel.releasePromptControlTitle, "prompt-runtime-tooltip", viewModel.releasePromptControlDisabled)}
             ${promptButtonWithTip(`<button class="secondary button-with-icon prompt-enhance-button ${viewModel.promptEnhancing ? "prompt-progress-active" : ""}" id="enhance-prompt" ${viewModel.promptAiDisabled && !viewModel.promptEnhancing ? "disabled" : ""} aria-describedby="prompt-progress-tooltip" aria-busy="${viewModel.promptEnhancing}">
               <span class="prompt-progress-track" aria-hidden="true"><span class="prompt-progress-bar ${viewModel.promptProgress?.progress == null && viewModel.promptEnhancing ? "indeterminate" : ""}" data-prompt-progress-bar style="width:${viewModel.promptProgress?.progress ?? 0}%"></span></span>
               <span class="prompt-enhance-content">${icon(viewModel.promptEnhancing ? "x" : "sparkles")}<span data-prompt-progress-label>${viewModel.promptEnhancing ? promptElapsedText(viewModel.promptProgress?.elapsedMs ?? 0) : viewModel.referenceAutoPromptAvailable && !viewModel.prompt.text.trim() ? promptUi.t("autoPrompt") : promptUi.t("optimizePrompt")}</span></span>
             </button>`, viewModel.promptEnhanceButtonTitle, "prompt-progress-tooltip", viewModel.promptAiDisabled && !viewModel.promptEnhancing, true)}
        </div>
      </div>
      <div class="prompt-editor-shell">
        <textarea id="prompt-input" rows="4" spellcheck="true" aria-keyshortcuts="Control+Z Control+Y Control+Shift+Z" lang="${/[\u3400-\u9fff]/u.test(viewModel.prompt.text) ? "zh-CN" : "en-US"}">${escapeHtml(viewModel.prompt.text)}</textarea>
      </div>
      <div class="create-prompt-footer">
        <select id="prompt-snippet" hidden data-native-select aria-label="${promptUi.t("snippetPicker")}">${viewModel.promptSnippetOptionsMarkup}</select>
        <button class="secondary button-with-icon" id="insert-prompt-snippet" type="button" aria-haspopup="dialog" aria-expanded="false" data-search-label="${t(uiKeys.create.insertSearch)}" data-empty-label="${t(uiKeys.create.insertEmpty)}">${icon("text-cursor-input")}${promptUi.t("snippetPicker")}${icon("chevron-down")}</button>
        <span class="create-prompt-spacer"></span>${viewModel.h3PromptCheckMarkup}<div id="prompt-word-counter" class="prompt-word-counter" aria-live="polite"></div>
      </div>
      </section>
      <div class="create-remaining-controls">
      <div class="composer-settings">
        <section class="composer-control-group composer-output-group">
          <div class="create-card-heading"><h3>${t(uiKeys.create.videoSettings.outputTitle)}</h3></div>
          <div class="composer-control-grid composer-output-grid">
        <label class="settings-field settings-model create-span-2">${t(uiKeys.create.videoSettings.model)}
          <select id="model">
            ${renderCreateModelOptions(viewModel.modelOptions, escapeHtml)}
          </select>
        </label>
        <label class="settings-field settings-ratio">${t(uiKeys.create.videoSettings.ratio)}
          <select id="ratio" ${viewModel.extending ? "disabled" : ""}>
            ${videoRatioOptionsFor(viewModel.isMiniMaxH3).map((ratio) =>
              `<option value="${ratio}" ${viewModel.draft.ratio === ratio ? "selected" : ""}>${ratio === "source" ? viewModel.extending ? t(uiKeys.create.videoSettings.followInputVideo) : t(uiKeys.create.videoSettings.originalImageRatio) : ratio}</option>`
            ).join("")}
          </select>
        </label>
        <div class="settings-field settings-resolution create-span-3"><span class="create-field-label">${t(uiKeys.create.videoSettings.resolution)}<output class="create-caption" data-output-dimensions>${viewModel.outputWidth} × ${viewModel.outputHeight}</output></span>
          <select id="resolution" hidden data-native-select aria-label="${t(uiKeys.create.videoSettings.resolution)}" ${viewModel.extending && !viewModel.isMiniMaxH3 ? "disabled" : ""}>
            ${viewModel.resolutionOptionsMarkup}
          </select><div class="create-resolution-segment" data-ui-segmented="video-resolution" role="group" aria-label="${t(uiKeys.create.videoSettings.resolution)}">${viewModel.resolutionChoices.map(value => `<button type="button" id="video-resolution-${value}" data-video-resolution="${value}" aria-pressed="${value === viewModel.selectedResolution}" ${viewModel.extending && !viewModel.isMiniMaxH3 ? "disabled" : ""}>${value}p</button>`).join("")}<button type="button" id="video-resolution-custom" data-custom-resolution aria-pressed="false">${icon("sliders-horizontal")}${t(uiKeys.create.editor.custom)}</button></div>
          <div class="create-custom-resolution" data-custom-resolution-panel data-range='${escapeHtml(JSON.stringify(viewModel.customResolution ?? { min: Math.min(...viewModel.resolutionChoices), max: Math.max(...viewModel.resolutionChoices), step: 1 }))}' ${viewModel.customResolution ? "data-continuous" : `title="${t(uiKeys.create.editor.customRestricted)}"`} hidden><input type="range" min="${viewModel.customResolution?.min ?? Math.min(...viewModel.resolutionChoices)}" max="${viewModel.customResolution?.max ?? Math.max(...viewModel.resolutionChoices)}" step="${viewModel.customResolution?.step ?? 1}" value="${viewModel.selectedResolution}" aria-label="${t(uiKeys.create.editor.shortEdge)}"><input type="number" min="${viewModel.customResolution?.min ?? Math.min(...viewModel.resolutionChoices)}" max="${viewModel.customResolution?.max ?? Math.max(...viewModel.resolutionChoices)}" step="${viewModel.customResolution?.step ?? 1}" value="${viewModel.selectedResolution}" aria-label="${t(uiKeys.create.editor.shortEdge)}"><span>px</span></div>
        </div>
        ${viewModel.isMiniMaxH3 ? `<label class="settings-field settings-steps"><span data-steps-help>${fieldLabelWithTip(t(uiKeys.create.videoSettings.h3Steps), viewModel.stepsTitle)}</span>
          <select id="steps" aria-label="${t(uiKeys.create.videoSettings.h3Steps)}">
            ${viewModel.stepsOptionsMarkup}
          </select>
        </label>
        <label class="settings-field settings-spectrum">${viewModel.spectrumLabelMarkup}
          <select id="spectrum-mode" ${viewModel.spectrumModeDisabled ? "disabled" : ""}>
            ${viewModel.spectrumOptionsMarkup}
          </select>
        </label>
        <label class="settings-field settings-latent-save">${viewModel.jointAvLabelMarkup}
          <select id="h3-latent-save-mode" ${viewModel.latentSaveDisabled ? "disabled" : ""} aria-label="${escapeHtml(t(uiKeys.create.videoSettings.saveLatentData))}">
            ${viewModel.latentSaveModeOptionsMarkup}
          </select>
        </label>` : ""}
          </div>
        </section>
        <section class="composer-control-group composer-motion-group">
          <div class="create-card-heading"><h3>${t(uiKeys.create.videoSettings.motionTitle)}</h3>${viewModel.isMiniMaxH3 ? `<span class="create-caption">24 FPS</span>` : ""}</div>
          <div class="composer-control-grid composer-motion-grid">${viewModel.isMiniMaxH3 ? `<label class="settings-field">${t(uiKeys.create.editor.generationMode)}<select id="generation-mode" data-native-max="${viewModel.nativeMaxDurationSeconds}" data-safe-max="${viewModel.unlockedMaxDurationSeconds}" ${viewModel.continuumManaged && viewModel.draft.h3ContinuumSequence ? `data-fixed-duration="${viewModel.draft.h3ContinuumSequence.chunkSeconds}"` : ""} aria-label="${t(uiKeys.create.editor.generationMode)}">
            <option value="native" data-note="${t(uiKeys.create.editor.nativeNote, { max: viewModel.nativeMaxDurationSeconds })}" ${viewModel.draft.duration <= viewModel.nativeMaxDurationSeconds ? "selected" : ""}>${t(uiKeys.create.editor.native)}</option>
            ${viewModel.unlockedMaxDurationSeconds > viewModel.nativeMaxDurationSeconds ? `<option value="unlocked" data-note="${t(uiKeys.create.editor.unlockedNote, { max: viewModel.unlockedMaxDurationSeconds })}" ${viewModel.draft.duration > viewModel.nativeMaxDurationSeconds ? "selected" : ""}>${t(uiKeys.create.editor.unlocked)}</option>` : ""}
            ${viewModel.extending && viewModel.isR2V ? "" : `<option value="preview" data-note="${t(uiKeys.create.editor.multiNote)}">${t(uiKeys.create.editor.multi)}</option>`}
          </select></label>` : ""}
        <label class="settings-field settings-duration create-span-2"><span class="settings-duration-heading"><span class="field-label-row"><span>${viewModel.extending ? t(uiKeys.create.videoSettings.addedDuration) : t(uiKeys.create.videoSettings.duration)}</span><span class="field-info settings-duration-warning" data-h3-duration-warning data-tooltip-toggle tabindex="0" aria-expanded="false" aria-describedby="h3-duration-warning-tip" aria-label="${escapeHtml(t(uiKeys.create.videoSettings.longDurationWarning))}" ${viewModel.h3LongDurationWarning ? "" : "hidden"}>${icon("alert-triangle")}<span class="field-info-tip" id="h3-duration-warning-tip" role="tooltip">${escapeHtml(t(uiKeys.create.videoSettings.longDurationWarning))}</span></span></span><output id="duration-frames" for="duration duration-number">${t(uiKeys.create.videoSettings.durationFrames, { count: viewModel.interpolationGeneratedFrames })}</output></span>
          <div class="inline-field"><div class="create-duration-slider"><input id="duration" type="range" step="0.1" min="${viewModel.isContinuum ? 4 : 1}" max="${viewModel.isMiniMaxH3 && viewModel.draft.duration <= 15.1 ? Math.min(15.1, viewModel.safetyMaxDurationSeconds) : viewModel.safetyMaxDurationSeconds}" value="${viewModel.draft.duration}"><div class="create-duration-ticks" aria-hidden="true">${[...new Set([viewModel.isContinuum ? 4 : 1, 5, 10, viewModel.isMiniMaxH3 && viewModel.draft.duration <= 15.1 ? Math.min(15.1, viewModel.safetyMaxDurationSeconds) : viewModel.safetyMaxDurationSeconds])].filter(value => value <= viewModel.safetyMaxDurationSeconds).sort((a,b) => a-b).map(value => `<span>${value}</span>`).join("")}</div></div><input id="duration-number" type="number" step="0.1" min="${viewModel.isContinuum ? 4 : 1}" max="${viewModel.isMiniMaxH3 && viewModel.draft.duration <= 15.1 ? Math.min(15.1, viewModel.safetyMaxDurationSeconds) : viewModel.safetyMaxDurationSeconds}" value="${viewModel.draft.duration}"><span>${t(uiKeys.create.videoSettings.seconds)}</span></div>
        </label>
        <label class="settings-field settings-fps" ${viewModel.isMiniMaxH3 ? "hidden" : ""}>${t(uiKeys.create.videoSettings.targetFps)}
          <select id="fps" ${viewModel.isMiniMaxH3 ? "disabled" : ""}>
            ${(viewModel.isMiniMaxH3 ? [24] : [8, 12, 16, 24, 25, 30]).map((value) =>
              `<option value="${value}" ${viewModel.draft.fps === value ? "selected" : ""}>${value} FPS</option>`
            ).join("")}
          </select>
        </label>
        ${viewModel.isMiniMaxH3 ? "" : `<label class="settings-field settings-interpolation">${t(uiKeys.create.videoSettings.interpolation)}
          <select id="frame-interpolation" ${viewModel.isMiniMaxH3 ? "disabled" : ""}>
            <option value="off" ${viewModel.draft.frameInterpolation === "off" ? "selected" : ""}>${t(uiKeys.create.videoSettings.interpolationOff)}</option>
            <option value="rife2x" ${viewModel.draft.frameInterpolation === "rife2x" ? "selected" : ""}>RIFE 2×</option>
            <option value="rife4x" ${viewModel.draft.frameInterpolation === "rife4x" ? "selected" : ""}>RIFE 4×</option>
          </select>
        </label>
        <label class="settings-field settings-motion">${t(uiKeys.create.videoSettings.motionLabel)}
          <select id="motion" ${viewModel.isMiniMaxH3 ? "disabled" : ""}>
            <option value="subtle" ${viewModel.draft.motion === "subtle" ? "selected" : ""}>${t(uiKeys.create.videoSettings.subtle)}</option>
            <option value="natural" ${viewModel.draft.motion === "natural" ? "selected" : ""}>${t(uiKeys.create.videoSettings.natural)}</option>
            <option value="strong" ${viewModel.draft.motion === "strong" ? "selected" : ""}>${t(uiKeys.create.videoSettings.strong)}</option>
          </select>
        </label>`}
          </div>
        </section>
        <section class="create-lora-card">
          <div class="create-lora-heading"><h3>LoRA</h3><span class="create-caption">${viewModel.draft.videoLoras.length > 1 ? t(uiKeys.create.editor.loraOrder) : ""}</span></div>
          <div class="create-lora-list" ${viewModel.draft.videoLoras.length ? "" : "hidden"}>${viewModel.draft.videoLoras.map(lora => `
            <article class="create-lora-row" data-sortable-item data-video-lora-id="${escapeHtml(lora.id)}">
              <button type="button" class="create-lora-grip" data-sortable-handle id="video-lora-grip-${escapeHtml(lora.id)}" aria-label="${escapeHtml(lora.name)} · ${t(uiKeys.create.editor.loraDrag)}" title="${t(uiKeys.create.editor.loraDrag)}">${icon("grip-vertical")}</button>
              <div class="create-lora-name"><strong>${escapeHtml(lora.name)}${options.videoLoraInfoButton(lora)}</strong><span class="create-caption">${escapeHtml(lora.modelFamily)} · ${options.videoLoraPurposeLabel(lora.purpose)}</span></div>
              <div class="create-lora-strength"><input aria-label="${escapeHtml(lora.name)} · ${t(uiKeys.create.videoSettings.strength)}" type="range" min="0" max="2" step="0.05" value="${lora.strength}" data-video-lora-strength="${escapeHtml(lora.id)}"><input aria-label="${t(uiKeys.create.videoSettings.strength)}" type="number" min="0" max="2" step="0.05" value="${lora.strength}" data-video-lora-strength-number="${escapeHtml(lora.id)}"></div>
              <button class="ghost icon-button" type="button" data-remove-video-lora="${escapeHtml(lora.id)}" aria-label="${t(uiKeys.create.videoSettings.remove)} ${escapeHtml(lora.name)}" title="${t(uiKeys.create.videoSettings.remove)}">${icon("x")}</button>
            </article>`).join("")}</div>
          <div class="create-lora-footer"><select id="video-lora-to-add" hidden data-native-select aria-label="${t(uiKeys.create.videoSettings.chooseLora)}">${[...viewModel.draft.videoLoras, ...viewModel.installReadyLoraDefinitions].map(lora => `<option value="${escapeHtml(lora.id)}" ${viewModel.draft.videoLoras.some(selected => selected.id === lora.id) ? "disabled" : ""} data-group="${escapeHtml(options.videoLoraPurposeLabel(lora.purpose))}" data-family="${escapeHtml(lora.modelFamily)}">${escapeHtml(lora.name)}</option>`).join("")}</select>
            <button class="secondary button-with-icon" id="add-video-lora" type="button" aria-haspopup="dialog" aria-expanded="false" data-search-label="${t(uiKeys.create.editor.loraSearch)}" data-no-results-label="${t(uiKeys.create.editor.loraEmpty)}" data-empty-label="${escapeHtml(viewModel.installReadyLoraEmptyLabel)}">${icon("plus")}${t(uiKeys.create.editor.addLora)}${icon("chevron-down")}</button>
          </div>
          ${viewModel.loraIssues.length ? `<div class="create-lora-issues">${viewModel.loraIssues.map(issue => `<p class="${issue.severity}">${icon(issue.severity === "error" ? "circle-alert" : "alert-triangle")}${escapeHtml(issue.message)}</p>`).join("")}</div>` : ""}
        </section>
        <section class="composer-control-group composer-seed-group">

          <div class="composer-control-grid composer-seed-grid">
        <label class="settings-field settings-seed">${t(uiKeys.create.videoSettings.randomSeed)}
          <div class="inline-field seed-control"><input id="seed" type="number" placeholder="${t(uiKeys.create.videoSettings.randomPlaceholder)}" value="${viewModel.draft.seed ?? ""}"><button class="ghost icon-button seed-random" id="random-seed" type="button" title="${t(uiKeys.create.videoSettings.newRandomSeed)}">${icon("dices")}</button><button class="icon-button" id="clear-seed" type="button" aria-label="${t(uiKeys.create.videoSettings.clearSeed)}" title="${t(uiKeys.create.videoSettings.clearSeed)}">${icon("x")}</button></div>
        </label>
        <div class="settings-field create-span-2"><span>${t(uiKeys.create.videoSettings.workflow)}</span><div class="create-workflow-row">${icon("workflow")}<code title="${escapeHtml(viewModel.draft.workflowPath)}">${viewModel.selectedWorkflowDescription}</code><button class="secondary button-with-icon" id="pick-workflow">${icon("folder-open")}${t(uiKeys.create.videoSettings.replaceJson)}</button></div></div>
          </div>
        </section>
      </div>
      <div class="create-submit-bar">
        <div class="create-submit-copy"><span class="create-submit-summary" data-submit-summary ${viewModel.enqueueBlockReason ? "hidden" : ""}>${viewModel.outputWidth} × ${viewModel.outputHeight} · ${viewModel.draft.duration.toFixed(1)}s · ${viewModel.draft.fps} FPS</span><p class="composer-submit-status ${viewModel.enqueuePending ? "pending" : "error"}" data-enqueue-feedback role="status" aria-live="polite" ${viewModel.enqueueBlockReason ? "" : "hidden"}>${icon(viewModel.enqueuePending ? "refresh-cw" : "circle-alert")}<span>${escapeHtml(viewModel.enqueueBlockReason)}</span></p></div>
        <span class="create-draft-alert" data-draft-save-error role="alert" hidden><span>${icon("alert-triangle")}${t(uiKeys.create.editor.draftFailed)}</span><button class="ghost button-with-icon" type="button" data-retry-draft-save>${icon("refresh-cw")}${t(uiKeys.create.editor.retry)}</button></span><div class="composer-submit-actions"><button class="ghost danger button-with-icon" id="clear-draft">${icon("trash-2")}${t(uiKeys.create.videoSettings.clearDraft)}</button>
        ${viewModel.h3TokenEstimate == null ? "" : `<span class="composer-token-estimate" data-h3-token-estimate>${Math.trunc(viewModel.h3TokenEstimate)} tokens</span>`}
        <button class="primary button-with-icon enqueue-button ${viewModel.enqueueBusy ? "busy" : ""}" id="enqueue" data-ui-label-variants="${escapeHtml(JSON.stringify([t(uiKeys.create.videoSettings.enqueue), t(uiKeys.create.videoSettings.enqueueBusy)]))}" data-enqueue-block-reason="${escapeHtml(viewModel.enqueueBlockReason)}" data-enqueue-ready-title="${escapeHtml(viewModel.isR2V ? t(uiKeys.create.videoSettings.enqueueR2v) : viewModel.extending ? t(uiKeys.create.videoSettings.enqueueExtension) : t(uiKeys.create.videoSettings.enqueueGeneration))}" ${viewModel.enqueueDisabled || viewModel.enqueueBusy ? "disabled" : ""} aria-busy="${viewModel.enqueueBusy}" title="${escapeHtml(viewModel.enqueueBlockReason || (viewModel.isR2V ? t(uiKeys.create.videoSettings.enqueueR2v) : viewModel.extending ? t(uiKeys.create.videoSettings.enqueueExtension) : t(uiKeys.create.videoSettings.enqueueGeneration)))}">${icon(viewModel.enqueueBusy ? "refresh-cw" : "list-plus", "enqueue-spinner")}<span data-enqueue-label>${viewModel.enqueueBusy ? t(uiKeys.create.videoSettings.enqueueBusy) : t(uiKeys.create.videoSettings.enqueue)}</span></button></div>
      </div>
      </div>
      </div>
    </div>`;
}

function formatTrimTime(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const remainder = (safe % 60).toFixed(1).padStart(4, "0");
  return `${String(minutes).padStart(2, "0")}:${remainder}`;
}
