import type {
  Draft,
  H3PromptMode,
  H3ReferenceRole,
  ImageEditDraft,
  ImagePromptPreset,
  ImageReferenceRole,
  PromptVersion,
  VideoLoraPurpose,
  VideoLoraSelection
} from "../../../types";
import type { H3PromptBuilderInput } from "../../../core/h3-prompt";
import {
  renderCreateModelOptions,
  renderH3PromptBuilderMarkup,
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
  imageResolutionOptionsMarkup: string;
  imageEnhanceMode: ImagePromptPreset;
  imagePromptOptimizeTitle: string;
  imagePromptAiDisabled: boolean;
  releasePromptControlTitle: string;
  releasePromptControlIconName: string;
  releasePromptControlDisabled: boolean;
  markupGuideCount: number;
  imageModelInputCount: number;
  enqueueBlockReason: string;
  count: number;
  imageProfileStatusText: string;
  enqueueBusy: boolean;
}

export interface VideoCreatePageViewModel {
  draft: Draft;
  prompt: PromptVersion;
  promptRuntimeBusy: boolean;
  promptEnhancing: boolean;
  extending: boolean;
  isR2V: boolean;
  isMiniMaxH3: boolean;
  h3Mode?: H3PromptMode;
  enhanceMode: "faithful" | "sulphur-native" | "h3-vision";
  h3PromptEnhanceTitle: string;
  releasePromptControlTitle: string;
  releasePromptControlIconName: string;
  releasePromptControlDisabled: boolean;
  promptAiDisabled: boolean;
  promptEnhanceButtonTitle: string;
  h3PromptPresetOptionsMarkup: string;
  promptSnippetOptionsMarkup: string;
  h3PromptCheckMarkup: string;
  h3PromptBuilder: H3PromptBuilderInput;
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
}

export type CreatePageViewModel = ImageEditPageViewModel | VideoCreatePageViewModel;

export interface CreatePageOptions {
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
  return `
    <section class="page-heading create-page-heading image-edit-page-heading">
      <div class="page-heading-copy"><h1>图片处理</h1><p>先生成可复用的图片素材，再从满意版本开始图生视频或继续编辑。</p></div>
      <div class="create-page-actions">
        <div class="input-mode-switch" role="group" aria-label="创建模式">
          <button class="ghost button-with-icon" data-input-mode="image" aria-pressed="false">${icon("image")}图生视频</button>
          <button class="ghost button-with-icon" data-input-mode="video" aria-pressed="false">${icon("video")}视频续写</button>
          <button class="secondary active button-with-icon" data-input-mode="image-edit" aria-pressed="true">${icon("wand-sparkles")}图片处理</button>
        </div>
        <span class="save-state">自动保存</span>
      </div>
    </section>
    <div class="create-workspace image-edit-workspace">
      <section class="media-panel image-edit-references">
        <div class="section-heading">
          <div><h2>参考图片</h2><span class="muted">Slot ${viewModel.draft.pictures.length}/${viewModel.imageCapabilityMaxPictures}${viewModel.markupGuideCount ? ` · 模型输入 ${viewModel.imageModelInputCount}/${viewModel.imageCapabilityMaxPictures}` : ""} · Picture 1 是基础输入</span></div>
          <button class="secondary button-with-icon" id="add-image-slot" ${viewModel.draft.pictures.length >= viewModel.imageCapabilityMaxPictures ? "disabled" : ""}>${icon("plus")}添加 Slot</button>
        </div>
        <div class="image-picture-list">
          ${viewModel.draft.pictures.length ? viewModel.draft.pictures.map((picture) => `
            <article class="image-picture-card ${picture.pictureNumber === 1 ? "is-base" : "is-reference"} ${picture.absolutePath ? "has-picture" : "is-empty"} ${picture.markup ? "has-markup" : ""}" data-image-picture-card="${escapeHtml(picture.id)}">
              <button class="image-picture-preview ${picture.absolutePath ? "has-image" : ""}" data-image-picture-pick="${escapeHtml(picture.id)}" style="--picture-ratio:${picture.width > 0 && picture.height > 0 ? `${picture.width} / ${picture.height}` : "1 / 1"}" aria-label="${picture.absolutePath ? `替换 Slot ${picture.pictureNumber} 图片` : `选择 Slot ${picture.pictureNumber} 图片`}">
                <img data-image-picture-preview="${escapeHtml(picture.id)}" alt="Slot ${picture.pictureNumber}预览" ${picture.absolutePath ? "" : "hidden"}>
                ${picture.absolutePath ? "" : `<span>${icon("image")}选择图片</span>`}
              </button>
              <div class="image-picture-card-body">
                <div class="image-picture-card-title"><strong>Slot ${picture.pictureNumber}</strong><span class="picture-number">Picture ${picture.pictureNumber}</span><span class="model-badge">${picture.pictureNumber === 1 ? "基础输入" : "参考"}</span>${picture.markup ? `<span class="model-availability available">${icon("pencil")} 已标记 ${picture.markup.objectCount} 处</span>` : ""}</div>
                <code title="${escapeHtml(picture.absolutePath)}">${picture.absolutePath ? escapeHtml(picture.absolutePath.split(/[\\/]/u).pop() ?? picture.absolutePath) : "尚未添加图片"}</code>
                <label>参考作用<select data-image-picture-role="${escapeHtml(picture.id)}" ${picture.pictureNumber === 1 ? "disabled" : ""}>${imageReferenceRoleOptions(options, picture)}</select></label>
              </div>
              <div class="image-picture-card-actions">${picture.absolutePath ? `<button class="icon-button" data-markup-image-picture="${escapeHtml(picture.id)}" aria-label="标记 Picture ${picture.pictureNumber}" title="标记图片">${icon("pencil")}</button>` : ""}<button class="icon-button danger" data-remove-image-picture="${escapeHtml(picture.id)}" aria-label="删除 Slot ${picture.pictureNumber}" title="删除 Slot ${picture.pictureNumber}">${icon("trash-2")}</button></div>
            </article>`).join("") : `<div class="image-picture-empty"><span>${icon("images")}</span><strong>先添加 Picture 1</strong><small>基础画面决定默认构图；后续最多添加两张人物、物体、姿态或风格参考。</small></div>`}
        </div>
        <button class="drop-zone image-picture-drop-zone" id="image-picture-drop-zone" data-image-picture-drop ${viewModel.draft.pictures.length >= viewModel.imageCapabilityMaxPictures ? "disabled" : ""}>
          <span class="drop-icon">${icon("upload")}</span><strong>拖入图片到下一个 Slot</strong><span>PNG、JPG、WEBP、BMP · 也可以点击选择文件</span>
        </button>
      </section>
      <section class="panel composer image-edit-composer">
        <div class="section-heading composer-heading">
          <div class="composer-heading-main"><h2>提示词</h2><span class="muted">${viewModel.draft.activePromptVersion + 1} / ${viewModel.draft.promptVersions.length} · ${escapeHtml(viewModel.prompt.label)}</span><div class="prompt-version-controls"><button class="icon-button" id="image-prompt-prev" aria-label="上一版提示词" ${viewModel.draft.activePromptVersion === 0 ? "disabled" : ""}>${icon("chevron-left")}</button><button class="icon-button" id="image-prompt-next" aria-label="下一版提示词" ${viewModel.draft.activePromptVersion >= viewModel.draft.promptVersions.length - 1 ? "disabled" : ""}>${icon("chevron-right")}</button></div></div>
          <div class="prompt-action-controls">
            <select class="prompt-enhance-mode" id="prompt-enhance-mode" aria-label="图片提示词优化方式" title="只影响优化提示词，不影响图片生成参数；细节增强会补充执行细节，忠实整理尽量保持原意">
              <option value="detail-enhance" ${viewModel.imageEnhanceMode === "detail-enhance" ? "selected" : ""}>细节增强</option>
              <option value="faithful" ${viewModel.imageEnhanceMode === "faithful" ? "selected" : ""}>忠实整理</option>
            </select>
            <button class="icon-button prompt-runtime-button ${viewModel.promptRuntimeBusy ? "busy" : ""}" id="release-prompt-model-create" ${viewModel.releasePromptControlDisabled ? "disabled" : ""} aria-label="${escapeHtml(viewModel.releasePromptControlTitle)}" title="${escapeHtml(viewModel.releasePromptControlTitle)}" aria-busy="${viewModel.promptRuntimeBusy}">${icon(viewModel.releasePromptControlIconName)}</button>
            <button class="secondary button-with-icon" id="enhance-prompt" ${viewModel.imagePromptAiDisabled ? "disabled" : ""} title="${escapeHtml(viewModel.imagePromptOptimizeTitle)}">${icon("sparkles")}${viewModel.promptEnhancing ? "优化中…" : "优化提示词"}</button>
          </div>
        </div>
        <div class="prompt-editor-shell"><textarea id="image-edit-prompt-input" rows="6" spellcheck="true" lang="${/[\u3400-\u9fff]/u.test(viewModel.prompt.text) ? "zh-CN" : "en-US"}">${escapeHtml(viewModel.prompt.text)}</textarea><div id="image-prompt-word-counter" class="prompt-word-counter" aria-live="polite"></div></div>
        <div class="prompt-tool-row"><label class="prompt-snippet-picker"><span>快速插入</span><select id="image-edit-instruction">${renderImageEditPromptInstructionOptions(escapeHtml)}</select></label><button class="secondary button-with-icon" id="insert-image-edit-instruction" disabled>${icon("plus")}插入</button></div>
        <section class="composer-control-group image-edit-output-group"><div class="composer-group-heading"><div><strong>生成设置</strong><span>一个批次顺序生成多张候选图，Seed 和参数会保存到任务快照</span></div></div><div class="composer-control-grid image-edit-settings-grid">
          <label class="settings-field">模型<select id="image-edit-model">${viewModel.imageModelOptionsMarkup}</select></label>
          <label class="settings-field">质量<select id="image-edit-quality">${viewModel.imageQualityOptionsMarkup}</select></label>
          <label class="settings-field">输出分辨率<select id="image-edit-resolution" aria-label="图片输出分辨率">${viewModel.imageResolutionOptionsMarkup}</select></label>
          <label class="settings-field">随机 Seed<div class="inline-field seed-control"><input id="image-edit-seed" type="number" placeholder="留空则每张随机" value="${viewModel.draft.seed ?? ""}"><button class="icon-button" id="random-image-edit-seed" title="生成随机 Seed">${icon("refresh-cw")}</button><button class="icon-button" id="clear-image-edit-seed" title="清空 Seed">${icon("x")}</button></div></label>
          <label class="settings-field range-field"><span class="range-heading"><span>生成数量</span><strong id="image-edit-count-value">${viewModel.count} 张</strong></span><input id="image-edit-count" type="range" min="1" max="10" step="1" value="${viewModel.count}"><span class="range-scale"><span>1</span><span>一个任务，逐张生成</span><span>10</span></span></label>
        </div></section>
        <div class="interpolation-summary settings-summary ${viewModel.enqueueBlockReason ? "unsafe" : ""}"><div><strong>${viewModel.enqueueBlockReason || `一个任务 · ${viewModel.count} 个${viewModel.draft.seed == null ? "随机" : "相同"} Seed 顺序生成`}</strong><span>${escapeHtml(viewModel.imageCapabilityName)} 不执行 AI 超分；高于原图短边的档位已隐藏</span></div><p>${escapeHtml(viewModel.imageProfileStatusText)}</p></div>
        <div class="submit-row composer-submit-row"><button class="ghost danger button-with-icon" id="clear-image-edit-draft">${icon("trash-2")}清空</button><button class="primary button-with-icon enqueue-button ${viewModel.enqueueBusy ? "busy" : ""}" id="enqueue-image-edit" ${viewModel.enqueueBlockReason || viewModel.enqueueBusy ? "disabled" : ""} aria-busy="${viewModel.enqueueBusy}">${icon(viewModel.enqueueBusy ? "refresh-cw" : "plus", "enqueue-spinner")}<span data-enqueue-label>${viewModel.enqueueBusy ? "加入中…" : "加入队列"}</span></button></div>
      </section>
    </div>`;
}

export function renderCreatePage(
  viewModel: VideoCreatePageViewModel,
  options: CreatePageOptions
): string {
  const icon = options.icon;
  const escapeHtml = options.escapeHtml;
  return `
    <section class="page-heading create-page-heading">
      <div class="page-heading-copy"><h1>创建视频</h1><p>${viewModel.extending ? "裁出要保留的视频片段，并从末帧继续生成。" : "导入参考画面，调整提示词，然后加入本地生成队列。"}</p></div>
      <div class="create-page-actions">
        <div class="input-mode-switch" role="group" aria-label="创建模式">
          <button class="${viewModel.extending ? "ghost" : "secondary active"} button-with-icon" data-input-mode="image" aria-pressed="${!viewModel.extending}">${icon("image")}图生视频</button>
          <button class="${viewModel.extending ? "secondary active" : "ghost"} button-with-icon" data-input-mode="video" aria-pressed="${viewModel.extending}">${icon("video")}视频续写</button>
          <button class="ghost button-with-icon" data-input-mode="image-edit" aria-pressed="false">${icon("wand-sparkles")}图片处理</button>
        </div>
        <span class="save-state">自动保存</span>
      </div>
    </section>
    <div class="create-workspace ${viewModel.isR2V ? "r2v-workspace" : ""}">
      <section class="panel media-panel">
      <div class="section-heading">
        <div><h2>${viewModel.extending ? "输入视频" : viewModel.isR2V ? "多参考 Slots" : "参考画面"}</h2><span class="muted">${viewModel.extending ? "选择保留范围，续写将从范围末帧开始" : viewModel.isR2V ? `图片 ${viewModel.r2vImageCount}/9 · 视频 ${viewModel.r2vVideoCount}/3 · 视频会同步使用自身音轨` : viewModel.supportsEndImage ? "当前工作流支持首帧和尾帧" : "当前工作流仅支持首帧"}</span></div>
        ${viewModel.extending
          ? viewModel.draft.sourceVideoPath ? `<button class="secondary button-with-icon" id="remove-video">${icon("x")}移除视频</button>` : ""
          : viewModel.isR2V
            ? viewModel.r2vTotalCount < 12 ? `<button class="secondary button-with-icon" id="add-h3-reference-slot" type="button">${icon("plus")}添加 Slot <small>${viewModel.r2vTotalCount}/12</small></button>` : ""
            : `<button class="secondary button-with-icon" id="toggle-end" ${!viewModel.supportsEndImage && !viewModel.draft.endImagePath ? "disabled" : ""}>${icon(viewModel.draft.endImagePath ? "x" : "images")}${viewModel.draft.endImagePath ? "移除尾帧" : "添加尾帧"}</button>`}
      </div>
      ${viewModel.extending
        ? viewModel.draft.sourceVideoPath
          ? `<div class="video-editor">
              <video id="source-video" src="studio-media://draft/video?source=${encodeURIComponent(viewModel.draft.sourceVideoPath)}" controls muted playsinline preload="metadata"></video>
              ${viewModel.videoReady
                ? `<div class="trim-panel">
                    <div class="trim-heading"><strong>裁剪保留范围</strong><span><output id="trim-start-output">${formatTrimTime(viewModel.draft.trimStartSeconds)}</output> — <output id="trim-end-output">${formatTrimTime(viewModel.draft.trimEndSeconds)}</output></span></div>
                    <div class="trim-editor" id="trim-editor" style="--trim-start:${viewModel.trimStartPercent}%;--trim-end:${viewModel.trimEndPercent}%">
                      <div class="trim-filmstrip" aria-hidden="true">${Array.from({ length: 8 }, () => "<i></i>").join("")}</div>
                      <div class="trim-dim trim-dim-start"></div><div class="trim-dim trim-dim-end"></div><div class="trim-selection"></div>
                      <input class="trim-range" id="trim-start" type="range" min="0" max="${viewModel.draft.sourceVideoDuration}" step="0.1" value="${viewModel.draft.trimStartSeconds}" aria-label="裁剪起点" aria-valuetext="${formatTrimTime(viewModel.draft.trimStartSeconds)}">
                      <input class="trim-range" id="trim-end" type="range" min="0" max="${viewModel.draft.sourceVideoDuration}" step="0.1" value="${viewModel.draft.trimEndSeconds}" aria-label="裁剪终点" aria-valuetext="${formatTrimTime(viewModel.draft.trimEndSeconds)}">
                    </div>
                    <div class="trim-summary" aria-live="polite">
                      <span>保留<strong id="trim-kept">${viewModel.trimDuration.toFixed(1)} 秒</strong></span>
                      <span>裁掉<strong id="trim-discarded">${Math.max(0, viewModel.draft.sourceVideoDuration - viewModel.trimDuration).toFixed(1)} 秒</strong></span>
                      <span>新增<strong id="trim-added">${viewModel.draft.duration.toFixed(1)} 秒</strong></span>
                      <span>预计成片<strong id="trim-total">约 ${(viewModel.trimDuration + viewModel.draft.duration).toFixed(1)} 秒</strong></span>
                    </div>
                    <p class="trim-help">视频保持暂停；拖动左右手柄时预览对应画面。</p>
                  </div>`
                : `<p class="video-loading">正在读取视频时长和画面尺寸…</p>`}
            </div>`
            : `<button class="drop-zone video-drop-zone" id="pick-video" data-drop-video data-drop-label="松开以添加视频">
              <span class="drop-icon">${icon("video")}</span><strong>选择或拖入视频</strong><span>MP4、WebM、MOV、M4V、MKV</span>
            </button>`
        : viewModel.isR2V
          ? renderH3ReferenceSlotsMarkup(viewModel.draft.h3ReferenceSlots, {
              icon,
              escapeHtml,
              h3ReferenceRoleLabels: options.h3ReferenceRoleLabels
            })
          : `<div class="media-grid ${viewModel.draft.endImagePath ? "paired" : ""}">
        <div class="media-slot">
          <button class="drop-zone ${viewModel.draft.startImagePath ? "has-image" : ""}" id="pick-start" data-drop-frame="start" data-paste-frame="start" data-drop-label="${viewModel.draft.startImagePath ? "松开以替换首帧" : "松开以添加首帧"}">
            ${viewModel.draft.startImagePath
              ? `<img id="start-preview" alt="首帧预览"><span class="image-label">点击或拖入替换</span>`
                : `<span class="drop-icon">${icon("image")}</span><strong>选择或拖入首帧</strong><span>PNG、JPG、WEBP、BMP，也可直接粘贴截图</span>`}
          </button>
              ${viewModel.draft.startImagePath ? `<button class="image-remove button-with-icon" data-clear-frame="start" aria-label="删除首帧" title="删除首帧">${icon("x")}<span>删除</span></button>` : ""}
        </div>
        ${viewModel.draft.endImagePath
          ? `<div class="media-slot">
              <button class="drop-zone has-image" id="pick-end" data-drop-frame="end" data-paste-frame="end" data-drop-label="松开以替换尾帧"><img id="end-preview" alt="尾帧预览"><span class="image-label">点击或拖入替换</span></button>
              <button class="image-remove button-with-icon" data-clear-frame="end" aria-label="删除尾帧" title="删除尾帧">${icon("x")}<span>删除</span></button>
            </div>`
          : ""}
          </div>`}
      </section>
      <section class="panel composer">
      <div class="section-heading composer-heading">
        <div class="composer-heading-main">
          <h2>${viewModel.extending ? "描述接下来发生什么" : "提示词"}</h2>
          <span class="muted">${viewModel.draft.activePromptVersion + 1} / ${viewModel.draft.promptVersions.length} · ${escapeHtml(viewModel.prompt.label)}</span>
          <div class="prompt-version-controls">
            <button class="icon-button" id="prompt-prev" aria-label="上一版提示词" title="上一版提示词" ${viewModel.draft.activePromptVersion === 0 ? "disabled" : ""}>${icon("chevron-left")}</button>
            <button class="icon-button" id="prompt-next" aria-label="下一版提示词" title="下一版提示词" ${viewModel.draft.activePromptVersion >= viewModel.draft.promptVersions.length - 1 ? "disabled" : ""}>${icon("chevron-right")}</button>
          </div>
        </div>
        <div class="prompt-action-controls">
          <select class="prompt-enhance-mode" id="prompt-enhance-mode" aria-label="扩写方式" title="${escapeHtml(viewModel.h3PromptEnhanceTitle)}">
            ${viewModel.isMiniMaxH3
              ? viewModel.h3PromptPresetOptionsMarkup
                : `<option value="sulphur-native" ${viewModel.enhanceMode === "sulphur-native" ? "selected" : ""}>Sulphur 原生增强（推荐）</option>
                  <option value="faithful" ${viewModel.enhanceMode === "faithful" ? "selected" : ""}>忠实扩写（需 Instruct 模型）</option>`}
          </select>
             <button class="icon-button prompt-runtime-button ${viewModel.promptRuntimeBusy ? "busy" : ""}" id="release-prompt-model-create" ${viewModel.releasePromptControlDisabled ? "disabled" : ""} aria-label="${escapeHtml(viewModel.releasePromptControlTitle)}" title="${escapeHtml(viewModel.releasePromptControlTitle)}" aria-busy="${viewModel.promptRuntimeBusy}">${icon(viewModel.releasePromptControlIconName)}</button>
             <button class="secondary button-with-icon" id="enhance-prompt" ${viewModel.promptAiDisabled ? "disabled" : ""} title="${escapeHtml(viewModel.promptEnhanceButtonTitle)}">${icon("sparkles")}${viewModel.promptEnhancing ? "优化中…" : "优化提示词"}</button>
        </div>
      </div>
      <div class="prompt-editor-shell">
        <textarea id="prompt-input" rows="6" spellcheck="true" lang="${/[\u3400-\u9fff]/u.test(viewModel.prompt.text) ? "zh-CN" : "en-US"}">${escapeHtml(viewModel.prompt.text)}</textarea>
        <div id="prompt-word-counter" class="prompt-word-counter" aria-live="polite"></div>
      </div>
      <div class="prompt-tool-row">
        <label class="prompt-snippet-picker"><span>快速插入</span><select id="prompt-snippet"><option value="">选择镜头、动作、声音或对白片段</option>${viewModel.promptSnippetOptionsMarkup}</select></label>
        <button class="secondary button-with-icon" id="insert-prompt-snippet" type="button" disabled>${icon("plus")}插入</button>
      </div>
      ${viewModel.isMiniMaxH3 ? viewModel.h3PromptCheckMarkup : ""}
      ${viewModel.extending && viewModel.isMiniMaxH3 ? `<div class="h3-extension-note">
        <strong>${viewModel.isR2V ? "H3 R2V Motion Context（推荐）" : "H3 结尾帧接续（兼容）"}</strong>
        <span>${viewModel.isR2V
          ? `携带上一段最后 22 帧的运动与 32 kHz 音频；头部上下文会自动同步裁掉。${viewModel.draft.h3ContextLatentPath ? "已找到上一段 latent，将跳过有损重编码。" : "当前使用像素/音频回退，完成后会保存 latent 供下一次接续。"} Spectrum 会被强制关闭。`
          : "从保留片段的最后一帧生成新段并保留 H3 原生音轨；不依赖额外节点，但边界动作可能发生变化。"}</span>
      </div>` : ""}
      ${viewModel.isMiniMaxH3 && !viewModel.extending ? `<details class="h3-prompt-helper">
        <summary>
          <span class="h3-helper-heading">
            <strong>H3 提示词助手 <span class="model-badge">可选</span></strong>
            <span>${viewModel.h3Mode === "R2V" ? "R2V 多参考" : viewModel.h3Mode === "FL2VA" ? "FL2VA 首尾帧" : viewModel.h3Mode === "L2VA" ? "L2VA 尾帧" : viewModel.h3Mode === "T2VA" ? "T2VA 纯文本" : "I2VA 首帧"} · 模板、检查和构建器</span>
          </span>
          <span class="h3-helper-toggle"><span class="when-closed">打开</span><span class="when-open">收起</span>${icon("chevron-down")}</span>
        </summary>
        <div class="h3-helper-body">
          <div class="h3-prompt-sections">
            <div><strong>${viewModel.h3Mode === "R2V" ? "参考标签" : viewModel.h3Mode === "T2VA" ? "文字时间轴" : "参考对齐"}</strong><span>${viewModel.h3Mode === "R2V" ? "按顺序使用 Picture / Video 标签，并给每个参考分配作用。" : viewModel.h3Mode === "T2VA" ? "不添加图片对齐句，直接从文字构建完整视听时间轴。" : viewModel.h3Mode === "L2VA" ? "从合理的前置状态逐步收束到尾帧。" : "按官方格式先锁定首帧或首尾帧，再写连续动作。"}</span></div>
            <div><strong>时间轴</strong><span>用 [Shot 1] 开始；后续镜头写明确切时间。</span></div>
            <div><strong>声音与对白</strong><span>对白放入 d 标签；现场声和背景音乐分开描述。</span></div>
          </div>
          <div class="h3-helper-actions h3-helper-quick-actions">
            <span>从模板开始，或打开构建器逐项组合；都会新建版本，不覆盖当前提示词。</span>
            <button class="secondary button-with-icon" id="h3-prompt-template" type="button">${icon("list-ordered")}使用结构模板</button>
          </div>
          <details class="h3-builder-disclosure">
            <summary><span><strong>结构化构建器</strong><small>镜头、动作、连续性、声音和屏幕文字</small></span>${icon("chevron-down")}</summary>
            ${renderH3PromptBuilderMarkup(viewModel.h3PromptBuilder, { icon, escapeHtml })}
          </details>
        </div>
      </details>` : ""}
      <div class="composer-settings">
        <section class="composer-control-group composer-output-group">
          <div class="composer-group-heading"><div><strong>输出设置</strong><span>模型、画面比例和清晰度</span></div></div>
          <div class="composer-control-grid composer-output-grid">
        <label class="settings-field settings-model">模型
          <select id="model">
            ${renderCreateModelOptions(viewModel.modelOptions, escapeHtml)}
          </select>
        </label>
        <label class="settings-field settings-ratio">画面比例
          <select id="ratio" ${viewModel.extending ? "disabled" : ""}>
            ${["source", "16:9", "9:16", "1:1", "4:3"].map((ratio) =>
              `<option value="${ratio}" ${viewModel.draft.ratio === ratio ? "selected" : ""}>${ratio === "source" ? viewModel.extending ? "跟随输入视频" : "原图（未读取时按 16:9）" : ratio}</option>`
            ).join("")}
          </select>
        </label>
        <label class="settings-field settings-resolution">清晰度
          <select id="resolution" ${viewModel.extending && !viewModel.isMiniMaxH3 ? "disabled" : ""}>
            ${viewModel.resolutionOptionsMarkup}
          </select>
        </label>
        ${viewModel.isMiniMaxH3 ? `<label class="settings-field settings-steps">采样步数（H3）
          <select id="steps" aria-label="H3 采样步数" title="${escapeHtml(viewModel.stepsTitle)}">
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
              <div><strong>${viewModel.loraLabelMarkup}</strong><span>${viewModel.draft.videoLoras.length ? `已启用 ${viewModel.draft.videoLoras.length} 个适配层` : "可选，不使用 LoRA 也可以正常生成"}</span></div>
              <div class="video-lora-add">
                <select id="video-lora-to-add" aria-label="选择要添加的 LoRA" ${viewModel.installReadyLoraDefinitions.length ? "" : "disabled"}>
                  ${viewModel.installReadyLoraDefinitions.length
                    ? viewModel.installReadyLoraDefinitions.map((lora) => `<option value="${escapeHtml(lora.id)}">${escapeHtml(lora.name)}</option>`).join("")
                    : `<option value="">${escapeHtml(viewModel.installReadyLoraEmptyLabel)}</option>`}
                </select>
                <button class="secondary button-with-icon" id="add-video-lora" type="button" ${viewModel.installReadyLoraDefinitions.length ? "" : "disabled"}>${icon("plus")}添加</button>
              </div>
            </div>
            ${viewModel.draft.videoLoras.length
              ? `<div class="video-lora-list">${viewModel.draft.videoLoras.map((lora, index) => `
                  <article class="video-lora-row" data-video-lora-id="${escapeHtml(lora.id)}">
                    <div class="video-lora-identity"><span class="video-lora-order">${index + 1}</span><div><span class="video-lora-name-line"><strong>${escapeHtml(lora.name)}</strong>${options.videoLoraInfoButton(lora)}</span><span>${escapeHtml(lora.modelFamily)} · ${options.videoLoraPurposeLabel(lora.purpose)}</span></div></div>
                    <label class="video-lora-strength"><span>强度</span><input type="range" min="0" max="2" step="0.05" value="${lora.strength}" data-video-lora-strength="${escapeHtml(lora.id)}"><input type="number" min="0" max="2" step="0.05" value="${lora.strength}" data-video-lora-strength-number="${escapeHtml(lora.id)}"></label>
                    <div class="video-lora-actions">
                      <button class="icon-button" type="button" data-move-video-lora="${escapeHtml(lora.id)}" data-direction="up" aria-label="上移 ${escapeHtml(lora.name)}" title="上移 LoRA" ${index === 0 ? "disabled" : ""}>${icon("move-up")}</button>
                      <button class="icon-button" type="button" data-move-video-lora="${escapeHtml(lora.id)}" data-direction="down" aria-label="下移 ${escapeHtml(lora.name)}" title="下移 LoRA" ${index === viewModel.draft.videoLoras.length - 1 ? "disabled" : ""}>${icon("move-down")}</button>
                      <button class="icon-button" type="button" data-remove-video-lora="${escapeHtml(lora.id)}" aria-label="移除 ${escapeHtml(lora.name)}" title="移除 LoRA">${icon("x")}</button>
                    </div>
                  </article>`).join("")}</div>`
              : `<div class="video-lora-empty">未使用 LoRA</div>`}
            ${viewModel.loraIssues.length ? `<div class="video-lora-issues">${viewModel.loraIssues.map((issue) => `<div class="video-lora-issue ${issue.severity}">${icon(issue.severity === "error" ? "circle-alert" : "alert-triangle")}<span>${escapeHtml(issue.message)}</span></div>`).join("")}</div>` : ""}
          </div>
        </section>
        <section class="composer-control-group composer-motion-group">
          <div class="composer-group-heading"><div><strong>时间与运动</strong><span>控制片段长度、帧率和运动处理</span></div></div>
          <div class="composer-control-grid composer-motion-grid">
        <label class="settings-field settings-duration">${viewModel.extending ? "新增时长" : "时长"}
          <div class="inline-field"><input id="duration" type="range" min="1" max="${viewModel.safetyMaxDurationSeconds}" value="${viewModel.draft.duration}"><input id="duration-number" type="number" min="1" max="${viewModel.safetyMaxDurationSeconds}" value="${viewModel.draft.duration}"><span>秒</span></div>
        </label>
        <label class="settings-field settings-fps">目标帧率
          <select id="fps" ${viewModel.isMiniMaxH3 ? "disabled" : ""}>
            ${(viewModel.isMiniMaxH3 ? [24] : [8, 12, 16, 24, 25, 30]).map((value) =>
              `<option value="${value}" ${viewModel.draft.fps === value ? "selected" : ""}>${value} FPS</option>`
            ).join("")}
          </select>
        </label>
        ${viewModel.isMiniMaxH3 ? "" : `<label class="settings-field settings-interpolation">Frame Interpolation
          <select id="frame-interpolation" ${viewModel.isMiniMaxH3 ? "disabled" : ""}>
            <option value="off" ${viewModel.draft.frameInterpolation === "off" ? "selected" : ""}>关闭 · 模型直接生成</option>
            <option value="rife2x" ${viewModel.draft.frameInterpolation === "rife2x" ? "selected" : ""}>RIFE 2×</option>
            <option value="rife4x" ${viewModel.draft.frameInterpolation === "rife4x" ? "selected" : ""}>RIFE 4×</option>
          </select>
        </label>
        <label class="settings-field settings-motion">动作幅度
          <select id="motion" ${viewModel.isMiniMaxH3 ? "disabled" : ""}>
            <option value="subtle" ${viewModel.draft.motion === "subtle" ? "selected" : ""}>轻微</option>
            <option value="natural" ${viewModel.draft.motion === "natural" ? "selected" : ""}>自然</option>
            <option value="strong" ${viewModel.draft.motion === "strong" ? "selected" : ""}>强烈</option>
          </select>
        </label>`}
          </div>
        </section>
        <section class="composer-control-group composer-seed-group">
          <div class="composer-group-heading"><div><strong>可复现性</strong><span>控制随机种子</span></div></div>
          <div class="composer-control-grid composer-seed-grid">
        <label class="settings-field settings-seed">随机 Seed
          <div class="inline-field seed-control"><input id="seed" type="number" placeholder="留空则随机" value="${viewModel.draft.seed ?? ""}"><button class="secondary button-with-icon seed-random" id="random-seed" type="button" title="生成一个新的随机 Seed">${icon("refresh-cw")}随机</button><button class="icon-button" id="clear-seed" type="button" aria-label="清空 Seed" title="清空 Seed">${icon("x")}</button></div>
        </label>
          </div>
        </section>
        <div class="interpolation-summary settings-summary ${!viewModel.safetySafe || !viewModel.r2vSlotsReady ? "unsafe" : viewModel.isMiniMaxH3 && (viewModel.draft.duration > 10 || viewModel.draft.resolution >= 768) ? "caution" : viewModel.interpolationMultiplier === 1 ? "disabled" : ""}">
          <div><strong>${!viewModel.r2vSlotsReady ? "请先补齐 R2V 参考 Slot" : !viewModel.safetySafe ? "配置超过显存安全预算" : viewModel.isMiniMaxH3 ? "H3 原生 24 FPS · 同步立体声音频" : viewModel.interpolationMultiplier === 1 ? "未启用插帧" : `生成约 ${viewModel.draft.fps / viewModel.interpolationMultiplier} FPS，再插值到 ${viewModel.draft.fps} FPS`}</strong><span>${viewModel.interpolationGeneratedFrames}/${viewModel.safetyMaxGeneratedFrames} 个模型帧 → ${viewModel.interpolationOutputFrames} 个成片帧</span></div>
          <p>${escapeHtml(!viewModel.r2vSlotsReady ? "R2V 至少需要一张已选择的参考图片；空 Slot 不能提交。" : viewModel.safetyMessage)} ${viewModel.safetySafe && viewModel.r2vSlotsReady && viewModel.interpolationMultiplier !== 1 ? "扩散模型和 VAE 会在 RIFE 前主动卸载；RIFE 使用 BF16、单帧批次。" : ""}</p>
        </div>
      </div>
      <div class="workflow-field composer-workflow-field">
        <div><strong>ComfyUI API 工作流</strong><p class="muted">${viewModel.selectedWorkflowDescription}</p></div>
        <button class="secondary button-with-icon" id="pick-workflow">${icon("workflow")}${viewModel.draft.workflowPath ? "更换 JSON" : "选择 JSON"}</button>
      </div>
      <p class="submit-feedback error" data-enqueue-feedback role="status" ${viewModel.enqueueBlockReason ? "" : "hidden"}>${escapeHtml(viewModel.enqueueBlockReason)}</p>
      <div class="submit-row composer-submit-row">
        <button class="ghost danger button-with-icon" id="clear-draft">${icon("trash-2")}清空</button>
        <button class="primary button-with-icon enqueue-button ${viewModel.enqueueBusy ? "busy" : ""}" id="enqueue" data-enqueue-block-reason="${escapeHtml(viewModel.enqueueBlockReason)}" data-enqueue-ready-title="${escapeHtml(viewModel.isR2V ? "加入 R2V 多参考生成队列" : viewModel.extending ? "加入视频续写队列" : "加入本地生成队列")}" ${viewModel.enqueueDisabled || viewModel.enqueueBusy ? "disabled" : ""} aria-busy="${viewModel.enqueueBusy}" title="${escapeHtml(viewModel.enqueueBlockReason || (viewModel.isR2V ? "加入 R2V 多参考生成队列" : viewModel.extending ? "加入视频续写队列" : "加入本地生成队列"))}">${icon(viewModel.enqueueBusy ? "refresh-cw" : "plus", "enqueue-spinner")}<span data-enqueue-label>${viewModel.enqueueBusy ? "加入中…" : "加入队列"}</span></button>
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
