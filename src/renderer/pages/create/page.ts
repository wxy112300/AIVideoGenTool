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

interface InstallReadyLoraDefinition {
  id: string;
  name: string;
}

interface VideoLoraIssueViewModel {
  severity: "error" | "warning";
  message: string;
}

export interface ImageEditPageViewModel {
  draft: ImageEditDraft;
  prompt: PromptVersion;
  promptRuntimeBusy: boolean;
  promptEnhancing: boolean;
  imageCapabilityName: string;
  imageCapabilityMaxPictures: number;
  imageModelOptionsMarkup: string;
  imageQualityOptionsMarkup: string;
  imageAspectRatioOptionsMarkup: string;
  imageResolutionOptionsMarkup: string;
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
  stepsOptionsMarkup: string;
  stepsTitle: string;
  spectrumLabelMarkup: string;
  spectrumOptionsMarkup: string;
  spectrumTitle: string;
  spectrumModeDisabled: boolean;
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
  safetyMaxGeneratedFrames: number;
  interpolationMultiplier: 1 | 2 | 4;
  interpolationGeneratedFrames: number;
  interpolationOutputFrames: number;
  supportsEndImage: boolean;
  selectedWorkflowDescription: string;
  enqueueBlockReason: string;
  enqueueDisabled: boolean;
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
  const showPictureDropZone = supportsMultiplePictures
    ? !(maskMode && hasBasePicture)
    : !hasBasePicture;
  const renderPictureTools = (picture: ImageEditDraft["pictures"][number]): string => {
    if (!picture.absolutePath) return "";
    const buttons: string[] = [];
    if (maskMode) {
      buttons.push(`<button class="secondary button-with-icon" data-markup-image-picture="${escapeHtml(picture.id)}" aria-label="绘制移除区域" title="绘制或修改 Mask">${icon("brush")}<span>${picture.mask ? "修改 Mask" : "绘制 Mask"}</span></button>`);
    } else if (!viewModel.promptless) {
      buttons.push(`<button class="icon-button" data-markup-image-picture="${escapeHtml(picture.id)}" aria-label="${t(uiKeys.create.imageEdit.markPicture, { index: picture.pictureNumber })}" title="${t(uiKeys.create.imageEdit.markImage)}">${icon("pencil")}</button>`);
    }
    if (!maskMode && viewModel.maskSupported) {
      buttons.push(`<button class="icon-button" data-mask-image-picture="${escapeHtml(picture.id)}" aria-label="绘制 Mask" title="${picture.mask ? "修改 Mask" : "绘制 Mask"}">${icon("brush")}</button>`);
    }
    return buttons.join("");
  };
  return `
    <section class="page-heading create-page-heading image-edit-page-heading">
      <div class="page-heading-copy"><h1>${t(uiKeys.create.imageEditTitle)}</h1><p>${t(uiKeys.create.imageEditDescription)}</p></div>
      <div class="create-page-actions">
        <div class="input-mode-switch" role="group" aria-label="${t(uiKeys.create.modeLabel)}">
          <button class="ghost button-with-icon" data-input-mode="image" aria-pressed="false">${icon("image")}${t(uiKeys.create.imageToVideo)}</button>
          <button class="ghost button-with-icon" data-input-mode="video" aria-pressed="false">${icon("video")}${t(uiKeys.create.videoExtension)}</button>
          <button class="secondary active button-with-icon" data-input-mode="image-edit" aria-pressed="true">${icon("wand-sparkles")}${t(uiKeys.create.imageEditMode)}</button>
        </div>
        <span class="save-state">${t(uiKeys.create.autoSave)}</span>
      </div>
    </section>
    <div class="create-workspace image-edit-workspace">
      <section class="media-panel image-edit-references">
        <div class="section-heading">
          <div><h2>${t(uiKeys.create.imageReferencesTitle)}</h2><span class="muted">${t(uiKeys.create.imageEdit.slotSummary, { count: viewModel.draft.pictures.length, max: viewModel.imageCapabilityMaxPictures })}${viewModel.markupGuideCount ? ` · ${t(uiKeys.create.imageEdit.modelInputSummary, { count: viewModel.imageModelInputCount, max: viewModel.imageCapabilityMaxPictures })}` : ""} · ${t(uiKeys.create.imageEdit.baseInputSummary)}</span></div>
          ${maskMode || !supportsMultiplePictures ? "" : `<button class="secondary button-with-icon" id="add-image-slot" ${viewModel.draft.pictures.length >= viewModel.imageCapabilityMaxPictures ? "disabled" : ""}>${icon("plus")}${t(uiKeys.create.addSlot)}</button>`}
        </div>
        <div class="image-picture-list">
          ${viewModel.draft.pictures.length ? viewModel.draft.pictures.map((picture) => `
            <article class="image-picture-card ${picture.pictureNumber === 1 ? "is-base" : "is-reference"} ${picture.absolutePath ? "has-picture" : "is-empty"} ${picture.markup || picture.mask ? "has-markup" : ""}" data-image-picture-card="${escapeHtml(picture.id)}">
              <button class="image-picture-preview ${picture.absolutePath ? "has-image" : ""}" data-image-picture-pick="${escapeHtml(picture.id)}" data-drop-label="${escapeHtml(t(picture.absolutePath ? uiKeys.create.imageEdit.replaceSlotImage : uiKeys.create.imageEdit.chooseSlotImage, { index: picture.pictureNumber }))}" style="--picture-ratio:${picture.width > 0 && picture.height > 0 ? `${picture.width} / ${picture.height}` : "1 / 1"}" aria-label="${t(picture.absolutePath ? uiKeys.create.imageEdit.replaceSlotImage : uiKeys.create.imageEdit.chooseSlotImage, { index: picture.pictureNumber })}">
                <img data-image-picture-preview="${escapeHtml(picture.id)}" alt="${t(uiKeys.create.imageEdit.previewAlt, { index: picture.pictureNumber })}" ${picture.absolutePath ? "" : "hidden"}>
                ${picture.absolutePath ? "" : `<span>${icon("image")}${t(uiKeys.create.imageEdit.chooseImage)}</span>`}
              </button>
              <div class="image-picture-card-body">
                <div class="image-picture-card-title"><strong>${t(uiKeys.create.imageEdit.slotTitle, { index: picture.pictureNumber })}</strong><span class="picture-number">Picture ${picture.pictureNumber}</span><span class="model-badge">${picture.pictureNumber === 1 ? t(uiKeys.create.imageEdit.baseInput) : t(uiKeys.create.imageEdit.reference)}</span>${picture.crop ? `<span class="model-availability available">裁剪 · ${picture.crop.width} × ${picture.crop.height}</span>` : ""}${picture.mask ? `<span class="model-availability available">${icon("brush")} Mask · ${picture.mask.regionCount}</span>` : picture.markup ? `<span class="model-availability available">${icon("pencil")} ${t(uiKeys.create.imageEdit.markedCount, { count: picture.markup.objectCount })}</span>` : ""}</div>
                <code title="${escapeHtml(picture.absolutePath)}">${picture.absolutePath ? escapeHtml(picture.absolutePath.split(/[\\/]/u).pop() ?? picture.absolutePath) : t(uiKeys.create.imageEdit.notAdded)}</code>
                ${maskMode ? `<span class="muted">${picture.mask ? "Mask 已保存，可以加入队列" : "需要绘制 Mask 后才能加入队列"}</span>` : `<label>${t(uiKeys.create.imageEdit.referenceRole)}<select data-image-picture-role="${escapeHtml(picture.id)}" ${picture.pictureNumber === 1 ? "disabled" : ""}>${imageReferenceRoleOptions(options, picture)}</select></label>`}
              </div>
              <div class="image-picture-card-actions">${renderPictureTools(picture)}<button class="icon-button danger" data-remove-image-picture="${escapeHtml(picture.id)}" aria-label="${t(uiKeys.create.imageEdit.deleteSlot, { index: picture.pictureNumber })}" title="${t(uiKeys.create.imageEdit.deleteSlot, { index: picture.pictureNumber })}">${icon("trash-2")}</button></div>
            </article>`).join("") : `<div class="image-picture-empty"><span>${icon("images")}</span><strong>${t(uiKeys.create.imageEdit.emptyTitle)}</strong><small>${t(uiKeys.create.imageEdit.emptyDescription)}</small></div>`}
        </div>
        ${showPictureDropZone ? `<button class="drop-zone image-picture-drop-zone" id="image-picture-drop-zone" data-image-picture-drop ${supportsMultiplePictures && viewModel.draft.pictures.length >= viewModel.imageCapabilityMaxPictures ? "disabled" : ""}>
          <span class="drop-icon">${icon("upload")}</span><strong>${t(supportsMultiplePictures ? uiKeys.create.imageEdit.dropNextSlot : uiKeys.create.imageEdit.chooseImage)}</strong><span>${t(uiKeys.create.imageEdit.imageFormats)}</span>
        </button>` : ""}
      </section>
      <section class="panel composer image-edit-composer">
        ${viewModel.promptless ? `<div class="section-heading composer-heading"><div><h2>${escapeHtml(viewModel.promptlessTitle)}</h2><span class="muted">${escapeHtml(viewModel.promptlessDescription)}</span></div></div>` : `<div class="section-heading composer-heading">
          <div class="composer-heading-main"><h2>${t(uiKeys.create.promptTitle)}</h2><span class="muted">${viewModel.draft.activePromptVersion + 1} / ${viewModel.draft.promptVersions.length} · ${escapeHtml(viewModel.prompt.label)}</span><div class="prompt-version-controls"><button class="icon-button" id="image-prompt-prev" aria-label="${t(uiKeys.create.imageEdit.previousPrompt)}" ${viewModel.draft.activePromptVersion === 0 ? "disabled" : ""}>${icon("chevron-left")}</button><button class="icon-button" id="image-prompt-next" aria-label="${t(uiKeys.create.imageEdit.nextPrompt)}" ${viewModel.draft.activePromptVersion >= viewModel.draft.promptVersions.length - 1 ? "disabled" : ""}>${icon("chevron-right")}</button><button class="icon-button danger" id="clear-image-prompt" aria-label="${t(uiKeys.create.clearPrompt)}" title="${t(uiKeys.create.clearPrompt)}">${icon("trash-2")}</button></div></div>
          <div class="prompt-action-controls">
            <div class="prompt-mode-control"><select class="prompt-enhance-mode" id="prompt-enhance-mode" aria-label="${t(uiKeys.create.imageEdit.optimizeMethod)}">
              <option value="detail-enhance" title="${escapeHtml(viewModel.imageDetailEnhanceTitle)}" ${viewModel.imageEnhanceMode === "detail-enhance" ? "selected" : ""}>${t(uiKeys.create.imageEdit.detailEnhance)}</option>
              <option value="faithful" title="${escapeHtml(viewModel.imageFaithfulEnhanceTitle)}" ${viewModel.imageEnhanceMode === "faithful" ? "selected" : ""}>${t(uiKeys.create.imageEdit.faithful)}</option>
            </select></div>
            <button class="icon-button prompt-runtime-button ${viewModel.releasePromptControlIconName === "refresh-cw" ? "busy" : ""}" id="release-prompt-model-create" ${viewModel.releasePromptControlDisabled ? "disabled" : ""} aria-label="${escapeHtml(viewModel.releasePromptControlTitle)}" title="${escapeHtml(viewModel.releasePromptControlTitle)}" aria-busy="${viewModel.releasePromptControlIconName === "refresh-cw"}">${icon(viewModel.releasePromptControlIconName)}</button>
            <button class="secondary button-with-icon" id="enhance-prompt" data-prompt-enhance-blocked="${viewModel.imagePromptEnhanceBlocked ? "true" : "false"}" ${viewModel.imagePromptAiDisabled && !viewModel.promptEnhancing ? "disabled" : ""} title="${escapeHtml(viewModel.promptEnhancing ? `${t(uiKeys.create.imageEdit.optimizing)} · ${t(uiKeys.create.promptProgress.cancel)}` : viewModel.imagePromptOptimizeTitle)}" aria-busy="${viewModel.promptEnhancing}">${icon(viewModel.promptEnhancing ? "x" : "sparkles")}${viewModel.promptEnhancing ? t(uiKeys.create.imageEdit.optimizing) : t(uiKeys.create.imageEdit.optimizePrompt)}</button>
          </div>
        </div>`}
        ${viewModel.promptless ? "" : `
        <div class="prompt-editor-shell"><textarea id="image-edit-prompt-input" rows="6" spellcheck="true" aria-keyshortcuts="Control+Z Control+Y Control+Shift+Z" lang="${/[\u3400-\u9fff]/u.test(viewModel.prompt.text) ? "zh-CN" : "en-US"}">${escapeHtml(viewModel.prompt.text)}</textarea><div id="image-prompt-word-counter" class="prompt-word-counter" aria-live="polite"></div></div>
        <div class="prompt-tool-row"><label class="prompt-snippet-picker"><span>${t(uiKeys.create.imageEdit.quickInsert)}</span><select id="image-edit-instruction">${renderImageEditPromptInstructionOptions(escapeHtml, t)}</select></label><button class="secondary button-with-icon" id="insert-image-edit-instruction" disabled>${icon("plus")}${t(uiKeys.create.imageEdit.insert)}</button></div>`}
        <section class="composer-control-group image-edit-output-group"><div class="composer-group-heading"><div><strong>${t(uiKeys.create.imageEdit.generationSettings)}</strong><span>${viewModel.outputCountVisible ? t(uiKeys.create.imageEdit.batchDescription) : escapeHtml(viewModel.promptlessDescription)}</span></div></div><div class="composer-control-grid image-edit-settings-grid">
          <label class="settings-field">${t(uiKeys.create.imageEdit.model)}<select id="image-edit-model">${viewModel.imageModelOptionsMarkup}</select></label>
          <label class="settings-field">${t(uiKeys.create.imageEdit.quality)}<select id="image-edit-quality">${viewModel.imageQualityOptionsMarkup}</select></label>
          ${viewModel.imageAspectRatioVisible ? `<label class="settings-field">${t(uiKeys.create.imageEdit.outputAspectRatio)}<select id="image-edit-aspect-ratio" aria-label="${t(uiKeys.create.imageEdit.outputAspectRatio)}">${viewModel.imageAspectRatioOptionsMarkup}</select></label>` : ""}
          ${viewModel.imageResolutionVisible ? `<label class="settings-field">${t(uiKeys.create.imageEdit.outputResolution)}<select id="image-edit-resolution" aria-label="${t(uiKeys.create.imageEdit.outputResolution)}">${viewModel.imageResolutionOptionsMarkup}</select></label>` : ""}
          ${viewModel.promptless ? "" : `<label class="settings-field">${t(uiKeys.create.imageEdit.randomSeed)}<div class="inline-field seed-control"><input id="image-edit-seed" type="number" placeholder="${t(uiKeys.create.imageEdit.randomPerImage)}" value="${viewModel.draft.seed ?? ""}"><button class="icon-button" id="random-image-edit-seed" title="${t(uiKeys.create.imageEdit.randomizeSeed)}">${icon("refresh-cw")}</button><button class="icon-button" id="clear-image-edit-seed" title="${t(uiKeys.create.imageEdit.clearSeed)}">${icon("x")}</button></div></label>`}
          ${viewModel.outputCountVisible ? `<label class="settings-field range-field"><span class="range-heading"><span>${t(uiKeys.create.imageEdit.outputCount)}</span><strong id="image-edit-count-value">${t(uiKeys.create.imageEdit.outputCountValue, { count: viewModel.count })}</strong></span><input id="image-edit-count" type="range" min="1" max="${imageOutputCountMax}" step="1" value="${viewModel.count}"></label>` : ""}
        </div></section>
        <div class="interpolation-summary settings-summary"><div><strong>${viewModel.promptless ? escapeHtml(viewModel.promptlessSummary) : t(uiKeys.create.imageEdit.summary, { count: viewModel.count, seedMode: t(viewModel.draft.seed == null ? uiKeys.runtime.random : uiKeys.runtime.same) })}</strong><span>${viewModel.promptless ? escapeHtml(viewModel.promptlessResultDescription) : t(uiKeys.create.imageEdit.noUpscale, { capability: escapeHtml(viewModel.imageCapabilityName) })}</span></div><p>${escapeHtml(viewModel.imageProfileStatusText)}</p></div>
        <div class="submit-row composer-submit-row"><p class="composer-submit-status error" data-enqueue-feedback role="status" aria-live="polite" ${viewModel.enqueueBlockReason ? "" : "hidden"}>${icon("circle-alert")}<span>${escapeHtml(viewModel.enqueueBlockReason)}</span></p><div class="composer-submit-actions"><button class="ghost danger button-with-icon" id="clear-image-edit-draft">${icon("trash-2")}${t(uiKeys.create.imageEdit.clear)}</button><button class="primary button-with-icon enqueue-button ${viewModel.enqueueBusy ? "busy" : ""}" id="enqueue-image-edit" ${viewModel.enqueueBlockReason || viewModel.enqueueBusy ? "disabled" : ""} aria-busy="${viewModel.enqueueBusy}">${icon(viewModel.enqueueBusy ? "refresh-cw" : "plus", "enqueue-spinner")}<span data-enqueue-label>${viewModel.enqueueBusy ? t(uiKeys.create.imageEdit.enqueueBusy) : t(uiKeys.create.imageEdit.enqueue)}</span></button></div></div>
      </section>
    </div>`;
}

export function renderCreatePage(
  viewModel: VideoCreatePageViewModel,
  options: CreatePageOptions
): string {
  const icon = options.icon;
  const escapeHtml = options.escapeHtml;
  const t = options.t;
  const promptUi = viewModel.promptUi;
  const showH3InputResolution = viewModel.isMiniMaxH3 && !viewModel.isR2V;
  const formatInputDimensions = (width: number | undefined, height: number | undefined): string =>
    showH3InputResolution && Number.isFinite(width) && Number.isFinite(height) && width! > 0 && height! > 0
      ? `${Math.trunc(width!)} × ${Math.trunc(height!)}`
      : "";
  const startInputResolution = formatInputDimensions(viewModel.draft.sourceWidth, viewModel.draft.sourceHeight);
  const endInputResolution = formatInputDimensions(viewModel.draft.endImageWidth, viewModel.draft.endImageHeight);
  return `
    <section class="page-heading create-page-heading">
      <div class="page-heading-copy"><h1>${t(uiKeys.create.videoTitle)}</h1><p>${t(viewModel.extending ? uiKeys.create.extensionDescription : uiKeys.create.videoDescription)}</p></div>
      <div class="create-page-actions">
        <div class="input-mode-switch" role="group" aria-label="${t(uiKeys.create.modeLabel)}">
          <button class="${viewModel.extending ? "ghost" : "secondary active"} button-with-icon" data-input-mode="image" aria-pressed="${!viewModel.extending}">${icon("image")}${t(uiKeys.create.imageToVideo)}</button>
          <button class="${viewModel.extending ? "secondary active" : "ghost"} button-with-icon" data-input-mode="video" aria-pressed="${viewModel.extending}">${icon("video")}${t(uiKeys.create.videoExtension)}</button>
          <button class="ghost button-with-icon" data-input-mode="image-edit" aria-pressed="false">${icon("wand-sparkles")}${t(uiKeys.create.imageEditMode)}</button>
        </div>
        <span class="save-state">${t(uiKeys.create.autoSave)}</span>
      </div>
    </section>
    <div class="create-workspace ${viewModel.isR2V ? "r2v-workspace" : ""}">
      <section class="panel media-panel">
      <div class="section-heading">
        <div><h2>${t(viewModel.extending ? uiKeys.create.videoInputTitle : viewModel.isR2V ? uiKeys.create.r2vReferencesTitle : uiKeys.create.referencesTitle)}</h2><span class="muted">${viewModel.extending ? t(uiKeys.create.videoMedia.extensionRangeSummary) : viewModel.isR2V ? t(uiKeys.create.videoMedia.r2vSummary, { images: viewModel.r2vImageCount, videos: viewModel.r2vVideoCount }) : viewModel.supportsEndImage ? t(uiKeys.create.videoMedia.supportsEndFrames) : t(uiKeys.create.videoMedia.supportsStartFrame)}</span></div>
        ${viewModel.extending
          ? `<div class="section-heading-actions">
              ${viewModel.isR2V && viewModel.draft.sourceVideoPath && viewModel.r2vTotalCount < 12 ? `<button class="secondary button-with-icon" id="add-h3-reference-slot" type="button">${icon("plus")}${t(uiKeys.create.addSlot)} <small>${viewModel.r2vTotalCount}/12</small></button>` : ""}
              ${viewModel.draft.sourceVideoPath ? `<button class="secondary button-with-icon" id="remove-video">${icon("x")}${t(uiKeys.create.removeVideo)}</button>` : ""}
            </div>`
          : viewModel.isR2V
            ? viewModel.r2vTotalCount < 12 ? `<button class="secondary button-with-icon" id="add-h3-reference-slot" type="button">${icon("plus")}${t(uiKeys.create.addSlot)} <small>${viewModel.r2vTotalCount}/12</small></button>` : ""
            : `<button class="secondary button-with-icon" id="toggle-end" ${!viewModel.supportsEndImage && !viewModel.draft.endImagePath ? "disabled" : ""}>${icon(viewModel.draft.endImagePath ? "x" : "images")}${viewModel.draft.endImagePath ? t(uiKeys.create.removeEndFrame) : t(uiKeys.create.addEndFrame)}</button>`}
      </div>
      ${viewModel.extending
        ? viewModel.draft.sourceVideoPath
          ? `<div class="video-editor">
              <video id="source-video" src="studio-media://draft/video?source=${encodeURIComponent(viewModel.draft.sourceVideoPath)}" controls muted playsinline preload="metadata"></video>
              ${viewModel.videoReady
                ? `<div class="trim-panel">
                    <div class="trim-heading"><strong>${t(uiKeys.create.videoMedia.trimTitle)}</strong><span><output id="trim-start-output">${formatTrimTime(viewModel.draft.trimStartSeconds)}</output> — <output id="trim-end-output">${formatTrimTime(viewModel.draft.trimEndSeconds)}</output></span></div>
                    <div class="trim-editor" id="trim-editor" style="--trim-start:${viewModel.trimStartPercent}%;--trim-end:${viewModel.trimEndPercent}%">
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
                    <p class="trim-help">${t(uiKeys.create.videoMedia.trimHelp)}</p>
                  </div>`
                : `<p class="video-loading">${t(uiKeys.create.videoMedia.loadingVideo)}</p>`}
            </div>`
            : `<button class="drop-zone video-drop-zone" id="pick-video" data-drop-video data-drop-label="${t(uiKeys.create.videoMedia.addVideoDrop)}">
              <span class="drop-icon">${icon("video")}</span><strong>${t(uiKeys.create.videoMedia.chooseOrDropVideo)}</strong><span>${t(uiKeys.create.videoMedia.videoFormats)}</span>
            </button>`
        : viewModel.isR2V
          ? renderH3ReferenceSlotsMarkup(viewModel.draft.h3ReferenceSlots, {
              icon,
              escapeHtml,
              h3ReferenceRoleLabels: options.h3ReferenceRoleLabels,
              t
            })
          : `<div class="media-grid ${viewModel.draft.endImagePath ? "paired" : ""}">
        <div class="media-slot">
          ${viewModel.draft.startImagePath
            ? `<div class="drop-zone has-image" id="pick-start" data-drop-frame="start" data-paste-frame="start" data-drop-label="${t(uiKeys.create.videoMedia.replaceStartFrame)}">
                <img id="start-preview" alt="${t(uiKeys.create.videoMedia.startPreview)}">${startInputResolution ? `<span class="image-resolution-badge" aria-label="${escapeHtml(`${t(uiKeys.history.page.resolution)} ${startInputResolution}`)}">${escapeHtml(startInputResolution)}</span>` : ""}<span class="image-label">${t(uiKeys.create.videoMedia.clickOrDropReplace)}</span>
              </div>`
            : `<button class="drop-zone" id="pick-start" data-drop-frame="start" data-paste-frame="start" data-drop-label="${t(uiKeys.create.videoMedia.addStartFrame)}">
                <span class="drop-icon">${icon("image")}</span><strong>${t(uiKeys.create.videoMedia.chooseOrDropStart)}</strong><span>${t(uiKeys.create.videoMedia.imageFormats)}</span>
              </button>`}
              ${viewModel.draft.startImagePath ? `<button class="image-remove button-with-icon" data-clear-frame="start" aria-label="${t(uiKeys.create.videoMedia.deleteStartFrame)}" title="${t(uiKeys.create.videoMedia.deleteStartFrame)}">${icon("x")}<span>${t(uiKeys.create.imageEdit.clear)}</span></button>` : ""}
        </div>
        ${viewModel.draft.endImagePath
          ? `<div class="media-slot">
              <div class="drop-zone has-image" id="pick-end" data-drop-frame="end" data-paste-frame="end" data-drop-label="${t(uiKeys.create.videoMedia.replaceEndFrame)}"><img id="end-preview" alt="${t(uiKeys.create.videoMedia.endPreview)}">${endInputResolution ? `<span class="image-resolution-badge" aria-label="${escapeHtml(`${t(uiKeys.history.page.resolution)} ${endInputResolution}`)}">${escapeHtml(endInputResolution)}</span>` : ""}<span class="image-label">${t(uiKeys.create.videoMedia.clickOrDropReplace)}</span></div>
              <button class="image-remove button-with-icon" data-clear-frame="end" aria-label="${t(uiKeys.create.videoMedia.deleteEndFrame)}" title="${t(uiKeys.create.videoMedia.deleteEndFrame)}">${icon("x")}<span>${t(uiKeys.create.imageEdit.clear)}</span></button>
            </div>`
          : ""}
          </div>`}
      ${viewModel.extending && viewModel.isR2V && viewModel.r2vTotalCount > 1 ? `<section class="h3-motion-context-references">
        <div class="section-heading">
          <div><h2>${t(uiKeys.create.r2vReferencesTitle)}</h2><span class="muted">${t(uiKeys.create.videoMedia.r2vSummary, { images: viewModel.r2vImageCount, videos: viewModel.r2vVideoCount })}</span></div>
        </div>
        ${renderH3ReferenceSlotsMarkup(
          ensureMotionContextSourceSlot(viewModel.draft.h3ReferenceSlots, viewModel.draft.sourceVideoPath),
          { icon, escapeHtml, h3ReferenceRoleLabels: options.h3ReferenceRoleLabels, t, lockedFirstVideo: true }
        )}
      </section>` : ""}
      </section>
      <section class="panel composer">
      <div class="section-heading composer-heading">
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
          </select>
             <button class="icon-button prompt-runtime-button ${viewModel.releasePromptControlIconName === "refresh-cw" ? "busy" : ""}" id="release-prompt-model-create" ${viewModel.releasePromptControlDisabled ? "disabled" : ""} aria-label="${escapeHtml(viewModel.releasePromptControlTitle)}" title="${escapeHtml(viewModel.releasePromptControlTitle)}" aria-busy="${viewModel.releasePromptControlIconName === "refresh-cw"}">${icon(viewModel.releasePromptControlIconName)}</button>
             <button class="secondary button-with-icon prompt-enhance-button ${viewModel.promptEnhancing ? "prompt-progress-active" : ""}" id="enhance-prompt" ${viewModel.promptAiDisabled && !viewModel.promptEnhancing ? "disabled" : ""} ${viewModel.promptEnhancing ? "aria-describedby=\"prompt-progress-tooltip\"" : `title="${escapeHtml(viewModel.promptEnhanceButtonTitle)}"`} aria-busy="${viewModel.promptEnhancing}">
               <span class="prompt-progress-track" aria-hidden="true"><span class="prompt-progress-bar ${viewModel.promptProgress?.progress == null && viewModel.promptEnhancing ? "indeterminate" : ""}" data-prompt-progress-bar style="width:${viewModel.promptProgress?.progress ?? 0}%"></span></span>
               <span class="prompt-enhance-content">${icon(viewModel.promptEnhancing ? "x" : "sparkles")}<span data-prompt-progress-label>${viewModel.promptEnhancing ? promptElapsedText(viewModel.promptProgress?.elapsedMs ?? 0) : viewModel.referenceAutoPromptAvailable && !viewModel.prompt.text.trim() ? promptUi.t("autoPrompt") : promptUi.t("optimizePrompt")}</span></span>
             </button>
             <span class="prompt-progress-tooltip" id="prompt-progress-tooltip" role="tooltip" data-prompt-progress-tooltip>${viewModel.promptEnhancing ? escapeHtml(viewModel.promptEnhanceButtonTitle) : ""}</span>
        </div>
      </div>
      <div class="prompt-editor-shell">
        <textarea id="prompt-input" rows="6" spellcheck="true" aria-keyshortcuts="Control+Z Control+Y Control+Shift+Z" lang="${/[\u3400-\u9fff]/u.test(viewModel.prompt.text) ? "zh-CN" : "en-US"}">${escapeHtml(viewModel.prompt.text)}</textarea>
        <div id="prompt-word-counter" class="prompt-word-counter" aria-live="polite"></div>
      </div>
      <div class="prompt-tool-row">
        <label class="prompt-snippet-picker"><span>${promptUi.t("snippetPicker")}</span><select id="prompt-snippet"><option value="">${promptUi.t("snippetPlaceholder")}</option>${viewModel.promptSnippetOptionsMarkup}</select></label>
        <button class="secondary button-with-icon" id="insert-prompt-snippet" type="button" disabled>${icon("plus")}${promptUi.t("insertSnippet")}</button>
      </div>
      ${viewModel.isMiniMaxH3 ? viewModel.h3PromptCheckMarkup : ""}
      ${viewModel.extending && viewModel.isMiniMaxH3 ? `<div class="h3-extension-note">
        <strong>${viewModel.isR2V ? promptUi.t("extensionR2vTitle") : promptUi.t("extensionBoundaryTitle")}</strong>
        <span>${viewModel.isR2V
          ? promptUi.t(viewModel.draft.h3ContextLatentPath ? "extensionR2vLatentDescription" : "extensionR2vFallbackDescription")
          : promptUi.t("extensionBoundaryDescription")}</span>
      </div>` : ""}
      <div class="composer-settings">
        <section class="composer-control-group composer-output-group">
          <div class="composer-group-heading"><div><strong>${t(uiKeys.create.videoSettings.outputTitle)}</strong><span>${t(uiKeys.create.videoSettings.outputDescription)}</span></div></div>
          <div class="composer-control-grid composer-output-grid">
        <label class="settings-field settings-model">${t(uiKeys.create.videoSettings.model)}
          <select id="model">
            ${renderCreateModelOptions(viewModel.modelOptions, escapeHtml)}
          </select>
        </label>
        <label class="settings-field settings-ratio">${t(uiKeys.create.videoSettings.ratio)}
          <select id="ratio" ${viewModel.extending ? "disabled" : ""}>
            ${["source", "16:9", "9:16", "1:1", "4:3", "3:4"].map((ratio) =>
              `<option value="${ratio}" ${viewModel.draft.ratio === ratio ? "selected" : ""}>${ratio === "source" ? viewModel.extending ? t(uiKeys.create.videoSettings.followInputVideo) : t(uiKeys.create.videoSettings.originalImageRatio) : ratio}</option>`
            ).join("")}
          </select>
        </label>
        <label class="settings-field settings-resolution">${t(uiKeys.create.videoSettings.resolution)}
          <select id="resolution" ${viewModel.extending && !viewModel.isMiniMaxH3 ? "disabled" : ""}>
            ${viewModel.resolutionOptionsMarkup}
          </select>
        </label>
        ${viewModel.isMiniMaxH3 ? `<label class="settings-field settings-steps">${t(uiKeys.create.videoSettings.h3Steps)}
          <select id="steps" aria-label="${t(uiKeys.create.videoSettings.h3Steps)}" title="${escapeHtml(viewModel.stepsTitle)}">
            ${viewModel.stepsOptionsMarkup}
          </select>
        </label>
        <label class="settings-field settings-spectrum">${viewModel.spectrumLabelMarkup}
          <select id="spectrum-mode" ${viewModel.spectrumModeDisabled ? "disabled" : ""} title="${escapeHtml(viewModel.spectrumTitle)}">
            ${viewModel.spectrumOptionsMarkup}
          </select>
        </label>` : ""}
          </div>
          <div class="video-lora-stack">
            <div class="video-lora-stack-heading">
              <div><strong>${viewModel.loraLabelMarkup}</strong><span>${viewModel.draft.videoLoras.length ? t(uiKeys.create.videoSettings.loraEnabled, { count: viewModel.draft.videoLoras.length }) : t(uiKeys.create.videoSettings.loraOptional)}</span></div>
              <div class="video-lora-add">
                <select id="video-lora-to-add" aria-label="${t(uiKeys.create.videoSettings.chooseLora)}" ${viewModel.installReadyLoraDefinitions.length ? "" : "disabled"}>
                  ${viewModel.installReadyLoraDefinitions.length
                    ? viewModel.installReadyLoraDefinitions.map((lora) => `<option value="${escapeHtml(lora.id)}">${escapeHtml(lora.name)}</option>`).join("")
                    : `<option value="">${escapeHtml(viewModel.installReadyLoraEmptyLabel)}</option>`}
                </select>
                <button class="secondary button-with-icon" id="add-video-lora" type="button" ${viewModel.installReadyLoraDefinitions.length ? "" : "disabled"}>${icon("plus")}${t(uiKeys.create.videoSettings.add)}</button>
              </div>
            </div>
            ${viewModel.draft.videoLoras.length
              ? `<div class="video-lora-list">${viewModel.draft.videoLoras.map((lora, index) => `
                  <article class="video-lora-row" data-video-lora-id="${escapeHtml(lora.id)}">
                    <div class="video-lora-identity"><span class="video-lora-order">${index + 1}</span><div><span class="video-lora-name-line"><strong>${escapeHtml(lora.name)}</strong>${options.videoLoraInfoButton(lora)}</span><span>${escapeHtml(lora.modelFamily)} · ${options.videoLoraPurposeLabel(lora.purpose)}</span></div></div>
                    <label class="video-lora-strength"><span>${t(uiKeys.create.videoSettings.strength)}</span><input type="range" min="0" max="2" step="0.05" value="${lora.strength}" data-video-lora-strength="${escapeHtml(lora.id)}"><input type="number" min="0" max="2" step="0.05" value="${lora.strength}" data-video-lora-strength-number="${escapeHtml(lora.id)}"></label>
                    <div class="video-lora-actions">
                      <button class="icon-button" type="button" data-move-video-lora="${escapeHtml(lora.id)}" data-direction="up" aria-label="${t(uiKeys.create.videoSettings.moveUp)} ${escapeHtml(lora.name)}" title="${t(uiKeys.create.videoSettings.moveUp)} LoRA" ${index === 0 ? "disabled" : ""}>${icon("move-up")}</button>
                      <button class="icon-button" type="button" data-move-video-lora="${escapeHtml(lora.id)}" data-direction="down" aria-label="${t(uiKeys.create.videoSettings.moveDown)} ${escapeHtml(lora.name)}" title="${t(uiKeys.create.videoSettings.moveDown)} LoRA" ${index === viewModel.draft.videoLoras.length - 1 ? "disabled" : ""}>${icon("move-down")}</button>
                      <button class="icon-button" type="button" data-remove-video-lora="${escapeHtml(lora.id)}" aria-label="${t(uiKeys.create.videoSettings.remove)} ${escapeHtml(lora.name)}" title="${t(uiKeys.create.videoSettings.remove)} LoRA">${icon("x")}</button>
                    </div>
                  </article>`).join("")}</div>`
              : `<div class="video-lora-empty">${t(uiKeys.create.videoSettings.unusedLora)}</div>`}
            ${viewModel.loraIssues.length ? `<div class="video-lora-issues">${viewModel.loraIssues.map((issue) => `<div class="video-lora-issue ${issue.severity}">${icon(issue.severity === "error" ? "circle-alert" : "alert-triangle")}<span>${escapeHtml(issue.message)}</span></div>`).join("")}</div>` : ""}
          </div>
        </section>
        <section class="composer-control-group composer-motion-group">
          <div class="composer-group-heading"><div><strong>${t(uiKeys.create.videoSettings.motionTitle)}</strong><span>${t(uiKeys.create.videoSettings.motionDescription)}</span></div></div>
          <div class="composer-control-grid composer-motion-grid">
        <label class="settings-field settings-duration">${viewModel.extending ? t(uiKeys.create.videoSettings.addedDuration) : t(uiKeys.create.videoSettings.duration)}
          <div class="inline-field"><input id="duration" type="range" min="1" max="${viewModel.safetyMaxDurationSeconds}" value="${viewModel.draft.duration}"><input id="duration-number" type="number" min="1" max="${viewModel.safetyMaxDurationSeconds}" value="${viewModel.draft.duration}"><span>${t(uiKeys.create.videoSettings.seconds)}</span></div>
        </label>
        <label class="settings-field settings-fps">${t(uiKeys.create.videoSettings.targetFps)}
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
        <section class="composer-control-group composer-seed-group">
          <div class="composer-group-heading"><div><strong>${t(uiKeys.create.videoSettings.reproducibility)}</strong><span>${t(uiKeys.create.videoSettings.seedDescription)}</span></div></div>
          <div class="composer-control-grid composer-seed-grid">
        <label class="settings-field settings-seed">${t(uiKeys.create.videoSettings.randomSeed)}
          <div class="inline-field seed-control"><input id="seed" type="number" placeholder="${t(uiKeys.create.videoSettings.randomPlaceholder)}" value="${viewModel.draft.seed ?? ""}"><button class="secondary button-with-icon seed-random" id="random-seed" type="button" title="${t(uiKeys.create.videoSettings.newRandomSeed)}">${icon("refresh-cw")}${t(uiKeys.runtime.random)}</button><button class="icon-button" id="clear-seed" type="button" aria-label="${t(uiKeys.create.videoSettings.clearSeed)}" title="${t(uiKeys.create.videoSettings.clearSeed)}">${icon("x")}</button></div>
        </label>
          </div>
        </section>
        <div class="interpolation-summary settings-summary ${!viewModel.safetySafe || !viewModel.r2vSlotsReady ? "unsafe" : viewModel.isMiniMaxH3 && (viewModel.draft.duration > 10 || viewModel.draft.resolution >= 768) ? "caution" : viewModel.interpolationMultiplier === 1 ? "disabled" : ""}">
          <div><strong>${!viewModel.r2vSlotsReady ? t(uiKeys.create.videoSettings.r2vMissing) : !viewModel.safetySafe ? t(uiKeys.create.videoSettings.safetyBudget) : viewModel.isMiniMaxH3 ? t(uiKeys.create.videoSettings.h3NativeAudio) : viewModel.interpolationMultiplier === 1 ? t(uiKeys.create.videoSettings.interpolationOffSummary) : t(uiKeys.create.videoSettings.interpolationSummary, { source: viewModel.draft.fps / viewModel.interpolationMultiplier, target: viewModel.draft.fps })}</strong><span>${t(uiKeys.create.videoSettings.generatedFrames, { generated: viewModel.interpolationGeneratedFrames, max: viewModel.safetyMaxGeneratedFrames, output: viewModel.interpolationOutputFrames })}</span></div>
          <p>${escapeHtml(!viewModel.r2vSlotsReady ? t(uiKeys.create.videoSettings.safetyDetail) : viewModel.safetyMessage)} ${viewModel.safetySafe && viewModel.r2vSlotsReady && viewModel.interpolationMultiplier !== 1 ? t(uiKeys.create.videoSettings.unloadBeforeRife) : ""}</p>
        </div>
      </div>
      <div class="workflow-field composer-workflow-field">
        <div><strong>${t(uiKeys.create.videoSettings.workflow)}</strong><p class="muted">${viewModel.selectedWorkflowDescription}</p></div>
        <button class="secondary button-with-icon" id="pick-workflow">${icon("workflow")}${viewModel.draft.workflowPath ? t(uiKeys.create.videoSettings.replaceJson) : t(uiKeys.create.videoSettings.selectJson)}</button>
      </div>
      <div class="submit-row composer-submit-row">
        <p class="composer-submit-status error" data-enqueue-feedback role="status" aria-live="polite" ${viewModel.enqueueBlockReason ? "" : "hidden"}>${icon("circle-alert")}<span>${escapeHtml(viewModel.enqueueBlockReason)}</span></p>
        <div class="composer-submit-actions"><button class="ghost danger button-with-icon" id="clear-draft">${icon("trash-2")}${t(uiKeys.create.videoSettings.clearDraft)}</button>
        ${viewModel.h3TokenEstimate == null ? "" : `<span class="composer-token-estimate" data-h3-token-estimate>${Math.trunc(viewModel.h3TokenEstimate)} tokens</span>`}
        <button class="primary button-with-icon enqueue-button ${viewModel.enqueueBusy ? "busy" : ""}" id="enqueue" data-enqueue-block-reason="${escapeHtml(viewModel.enqueueBlockReason)}" data-enqueue-ready-title="${escapeHtml(viewModel.isR2V ? t(uiKeys.create.videoSettings.enqueueR2v) : viewModel.extending ? t(uiKeys.create.videoSettings.enqueueExtension) : t(uiKeys.create.videoSettings.enqueueGeneration))}" ${viewModel.enqueueDisabled || viewModel.enqueueBusy ? "disabled" : ""} aria-busy="${viewModel.enqueueBusy}" title="${escapeHtml(viewModel.enqueueBlockReason || (viewModel.isR2V ? t(uiKeys.create.videoSettings.enqueueR2v) : viewModel.extending ? t(uiKeys.create.videoSettings.enqueueExtension) : t(uiKeys.create.videoSettings.enqueueGeneration)))}">${icon(viewModel.enqueueBusy ? "refresh-cw" : "plus", "enqueue-spinner")}<span data-enqueue-label>${viewModel.enqueueBusy ? t(uiKeys.create.videoSettings.enqueueBusy) : t(uiKeys.create.videoSettings.enqueue)}</span></button></div>
      </div>
      </section>
    </div>`;
}

function formatTrimTime(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const remainder = (safe % 60).toFixed(1).padStart(4, "0");
  return `${String(minutes).padStart(2, "0")}:${remainder}`;
}
