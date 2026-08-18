import { imageModelCapabilityFor } from "../../../core/image-workflow";
import {
  isMiniMaxH3Model,
  isMiniMaxH3R2vModel,
  normalizeH3Steps
} from "../../../core/workflow";
import { upscaleDimensions } from "../../../core/upscale";
import type { Draft, QueueLifecycle, QueueTask } from "../../../types";
import type { Translate } from "../../../core/i18n";
import { uiKeys } from "../../../core/i18n-keys";
import { videoPromptForLoras } from "../../../core/video-loras";

export type QueueTaskInput =
  | { kind: "image"; path: string }
  | { kind: "video"; path: string }
  | { kind: "placeholder" };

export type QueueActionBusy = {
  taskId: string;
  action: "remove" | "cancel" | "edit";
} | null;

export interface QueueCardRenderOptions {
  t: Translate;
  taskPreviews: Readonly<Record<string, string>>;
  queueRunning: boolean;
  queueLifecycle?: QueueLifecycle;
  queueLifecycleTaskId?: string;
  queueActionBusy: QueueActionBusy;
  icon(name: string, className?: string): string;
  escapeHtml(value: unknown): string;
  modelName(id: string): string;
  frameRateSummary(
    fps: number,
    interpolation: Draft["frameInterpolation"] | undefined
  ): string;
  queueStageElapsedText(task: QueueTask): string;
  queueTaskRemainingSeconds(task: QueueTask): number | null;
  queueEstimateText(seconds: number | null): string;
  elapsedText(startedAt?: string): string;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}

export function queueTaskInput(task: QueueTask): QueueTaskInput | null {
  if (task.taskType === "image-generation" && task.pictures[0]?.absolutePath) {
    return { kind: "image", path: task.pictures[0].absolutePath };
  }
  if (task.taskType === "generation" && task.startImagePath) {
    return { kind: "image", path: task.startImagePath };
  }
  if (
    task.taskType === "generation" &&
    isMiniMaxH3Model(task.modelId) &&
    !isMiniMaxH3R2vModel(task.modelId) &&
    !task.startImagePath &&
    !task.endImagePath
  ) {
    return { kind: "placeholder" };
  }
  if (task.taskType === "extension" && task.sourceVideoPath) {
    return { kind: "video", path: task.sourceVideoPath };
  }
  if (task.taskType === "upscale" && task.sourceFilePath) {
    return { kind: "video", path: task.sourceFilePath };
  }
  return null;
}

export function queueTaskInputUrl(task: QueueTask): string {
  return queueTaskInput(task)?.kind === "video"
    ? `studio-media://queue/${encodeURIComponent(task.id)}`
    : "";
}

function statusLabel(status: string, t: Translate): string {
  const keys: Record<string, string> = {
    waiting: uiKeys.task.waiting,
    running: uiKeys.task.running,
    completed: uiKeys.task.completed,
    failed: uiKeys.task.failed,
    cancelled: uiKeys.task.cancelled
  };
  return keys[status] ? t(keys[status]!) : status;
}

export function renderQueueTaskCard(
  task: QueueTask,
  queuePosition: number,
  options: QueueCardRenderOptions
): string {
  const t = options.t;
  const executionPrompt = task.taskType === "generation" || task.taskType === "extension"
    ? videoPromptForLoras(task.prompt, task.videoLoras)
    : task.taskType === "image-generation"
      ? task.prompt
      : "";
  const description = task.taskType === "image-generation"
    ? `${executionPrompt} · ${t(uiKeys.queue.card.imageCandidates, { count: task.outputCount })}`
    : task.taskType === "generation"
    ? executionPrompt
    : task.taskType === "extension"
      ? `${executionPrompt} · ${t(uiKeys.queue.card.extensionRetain, { start: task.trimStartSeconds.toFixed(1), end: task.trimEndSeconds.toFixed(1) })}`
      : `${task.sourceFilename} → ${task.outputFilename}`;
  const upscaleOutput = task.taskType === "upscale"
    ? upscaleDimensions(task.sourceWidth, task.sourceHeight, task.targetHeight)
    : null;
  const h3ComputeSummary = task.taskType !== "upscale" && task.taskType !== "image-generation" && isMiniMaxH3Model(task.modelId)
    ? task.spectrumMode === "balanced"
        ? `<span title="${t(uiKeys.queue.card.spectrumOnTitle)}">${normalizeH3Steps(task.steps, task.modelId, task.videoLoras)} ${t(uiKeys.queue.card.steps)} · ${t(uiKeys.queue.card.spectrumOn)}${task.spectrumModelAwareMode && task.spectrumModelAwareMode !== "off" ? ` · ${t(uiKeys.queue.card.modelAware, { mode: task.spectrumModelAwareMode })}` : ""}</span>`
        : `<span title="${t(uiKeys.queue.card.spectrumOffTitle)}">${normalizeH3Steps(task.steps, task.modelId, task.videoLoras)} ${t(uiKeys.queue.card.steps)} · ${t(uiKeys.queue.card.spectrumOff)}</span>`
    : "";
  const loraSummary = task.taskType !== "image-generation" && task.videoLoras?.length
    ? task.videoLoras.map((lora, index) => `<span class="task-meta-lora" title="${options.escapeHtml(lora.filename)}">${t(uiKeys.queue.card.loraStrength, { index: index + 1, name: options.escapeHtml(lora.name), strength: lora.strength })}</span>`).join("")
    : "";
  const imageQueueQuality = task.taskType === "image-generation"
    ? imageModelCapabilityFor(task.modelId).qualityProfiles.find(
        (profile) => profile.id === task.qualityProfile
      )
    : undefined;
  const seedText = task.taskType === "image-generation" ? t(uiKeys.queue.card.batchIndependent) : String(task.seed);
  const metadata = task.taskType === "image-generation"
    ? `<span>${t(uiKeys.queue.card.imageProcessing)}</span><span>${options.escapeHtml(options.modelName(task.modelId))}</span><span>${t(uiKeys.queue.card.imageCandidates, { count: task.outputCount })}</span><span>${options.escapeHtml(imageQueueQuality?.label ?? task.qualityProfile)}${imageQueueQuality ? ` · ${imageQueueQuality.steps} ${t(uiKeys.queue.card.steps)} · CFG ${imageQueueQuality.cfg}` : ""}</span>${imageQueueQuality?.lightning ? `<span>${t(uiKeys.queue.card.lightningLora)}</span>` : ""}<span>${t(uiKeys.queue.card.pictureCanvas, { pictures: task.pictures.length, markings: task.pictures.reduce((count, picture) => count + (picture.markup?.objectCount ?? 0), 0) })}</span><span>${t(uiKeys.queue.card.pngIntermediate)}</span>`
    : task.taskType === "generation"
    ? `<span>${options.escapeHtml(options.modelName(task.modelId))}</span>${loraSummary}<span>${task.resolution}p</span><span>${task.duration}${t(uiKeys.queue.card.seconds)}</span><span>${options.frameRateSummary(task.fps, task.frameInterpolation)}</span>${h3ComputeSummary}<span>Seed ${options.escapeHtml(seedText)}</span>`
    : task.taskType === "extension"
      ? `<span>${t(uiKeys.queue.card.extension)}</span><span>${options.escapeHtml(options.modelName(task.modelId))}</span><span>${task.resolution}p</span><span>${t(uiKeys.queue.card.maxModelFrames, { count: task.maxGeneratedFrames })}</span><span>${t(uiKeys.queue.card.contextFrames, { count: task.overlapFrames })}</span>${h3ComputeSummary}`
      : `<span>${t(uiKeys.queue.card.upscale)}</span><span>${options.escapeHtml(options.modelName(task.modelId))}</span><span>${upscaleOutput![0]} × ${upscaleOutput![1]}</span><span>${t(uiKeys.queue.card.batchUnload)}</span>`;
  const attentionTask = task.status === "failed" || task.status === "cancelled";
  const queueCleanupActive =
    options.queueLifecycleTaskId === task.id &&
    (options.queueLifecycle === "cancelling" || options.queueLifecycle === "cleaning");
  const retrySummary = task.automaticRetryAttempt
    ? `<span class="queue-retry-status">${t(uiKeys.queue.card.autoRetry, { count: task.automaticRetryAttempt })}</span>`
    : "";
  const rankMarkup = queuePosition > 0
    ? `<strong>${String(queuePosition).padStart(2, "0")}</strong><small>${t(uiKeys.queue.card.rank)}</small>`
    : `<strong>!</strong><small>${t(uiKeys.queue.card.needsAttention)}</small>`;
  if (task.status === "running") {
    const preview = options.taskPreviews[task.id] ?? "";
    const livePreviewRequested =
      (task.taskType === "generation" || task.taskType === "extension") &&
      task.h3LivePreview === true &&
      isMiniMaxH3Model(task.modelId);
    const input = queueTaskInput(task);
    const inputVideoUrl = input?.kind === "video" ? queueTaskInputUrl(task) : "";
    const inputPlaceholder = input?.kind === "placeholder"
      ? t(uiKeys.queue.card.noReferenceImage)
      : "";
    return `
      <article class="task-card panel running expanded">
        <div class="expanded-task-head">
          <div class="queue-task-heading"><div class="queue-rank running" aria-label="${t(uiKeys.queue.card.queuePosition, { count: queuePosition })}"><strong>${String(queuePosition).padStart(2, "0")}</strong><small>${t(uiKeys.queue.card.current)}</small></div><div><div class="running-status-line"><span class="status running">${t(uiKeys.queue.card.running)}</span><span class="running-elapsed-prominent" id="running-elapsed">${options.elapsedText(task.startedAt)}</span></div><h3>${options.escapeHtml(task.outputFilename)}</h3></div></div>
          <div class="running-progress-value"><span>${t(uiKeys.queue.card.totalProgress)}</span><strong id="running-progress-label">${Math.round(task.progress ?? 0)}%</strong></div>
        </div>
        <div class="running-layout">
          <div class="live-preview${livePreviewRequested ? " live-preview-enabled" : ""}" data-live-preview-surface="${options.escapeHtml(task.id)}">
            <span class="live-preview-live-dot" data-live-preview-indicator="${options.escapeHtml(task.id)}" aria-label="${t(uiKeys.queue.card.livePreviewActive)}" title="${t(uiKeys.queue.card.livePreviewActive)}" style="${preview ? "" : "display:none"}"></span>
            <span class="live-preview-spinner" data-live-preview-spinner="${options.escapeHtml(task.id)}" role="status" aria-label="${t(uiKeys.queue.card.livePreviewLoading)}" title="${t(uiKeys.queue.card.livePreviewLoading)}" style="${livePreviewRequested && !preview ? "" : "display:none"}"></span>
            <img id="live-preview-image-${options.escapeHtml(task.id)}" data-live-preview-image="${options.escapeHtml(task.id)}" data-live-preview-active="${preview ? "true" : "false"}" ${input?.kind === "image" ? `data-queue-input-image="${options.escapeHtml(task.id)}"` : ""} alt="${input ? t(uiKeys.queue.card.userInputPreview) : t(uiKeys.queue.card.comfyPreview)}" src="${preview ? options.escapeHtml(preview) : ""}" style="${preview ? "" : "display:none"}">
            ${inputVideoUrl ? `<video data-queue-input-video="${options.escapeHtml(task.id)}" muted playsinline preload="metadata" src="${inputVideoUrl}" style="${preview ? "display:none" : ""}"></video>` : ""}
            <div id="live-preview-empty-${options.escapeHtml(task.id)}" data-live-preview-empty="${options.escapeHtml(task.id)}" style="${preview || inputVideoUrl ? "display:none" : ""}"><span>${options.icon(input ? input.kind === "image" ? "image" : "film" : "film")}</span>${inputPlaceholder ? `<small>${options.escapeHtml(inputPlaceholder)}</small>` : ""}</div>
          </div>
          <div class="running-copy">
            <span class="eyebrow">${t(uiKeys.queue.card.currentStep)} · <span id="running-stage">${options.escapeHtml(task.stage ?? t(uiKeys.queue.card.preparing))}</span></span>
            <div class="progress" role="progressbar" aria-label="${t(uiKeys.queue.card.taskProgress)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(task.progress ?? 0)}"><span id="running-progress-bar" style="width:${task.progress ?? 0}%"></span></div>
            <p class="task-description">${options.escapeHtml(description)}</p>
            <div class="task-meta">${metadata}<span id="running-stage-elapsed">${options.queueStageElapsedText(task)}</span><span id="running-eta">${t(uiKeys.queue.card.eta, { time: options.queueEstimateText(options.queueTaskRemainingSeconds(task)) })}</span></div>
            <div class="running-controls">
              <button class="secondary button-with-icon" id="${options.queueRunning ? "pause-queue" : "continue-queue"}">${options.icon(options.queueRunning ? "pause" : "play")}${options.queueRunning ? t(uiKeys.queue.pauseAfterCurrent) : t(uiKeys.queue.card.continueTasks)}</button>
              <button class="danger secondary button-with-icon" data-cancel="${task.id}" ${options.queueActionBusy?.taskId === task.id ? "disabled" : ""}>${options.icon("ban")}${options.queueActionBusy?.taskId === task.id && options.queueActionBusy.action === "cancel" ? t(uiKeys.queue.card.cancelling) : t(uiKeys.queue.card.cancelCurrent)}</button>
            </div>
            <p class="control-hint">${options.queueRunning ? t(uiKeys.queue.card.pauseHint) : t(uiKeys.queue.card.runningHint)}</p>
          </div>
        </div>
      </article>`;
  }
  const input = queueTaskInput(task);
  const inputVideoUrl = input?.kind === "video" ? queueTaskInputUrl(task) : "";
  const inputPreview = input
    ? `<div class="task-input-preview" data-queue-input-preview="${options.escapeHtml(task.id)}">${input.kind === "image" ? `<img data-queue-input-image="${options.escapeHtml(task.id)}" alt="${t(uiKeys.queue.card.inputImage)}" style="display:none">` : input.kind === "video" ? `<video data-queue-input-video="${options.escapeHtml(task.id)}" muted playsinline preload="metadata" src="${inputVideoUrl}"></video>` : ""}<div data-queue-input-empty><span>${options.icon(input.kind === "image" ? "image" : "film")}</span><small>${input.kind === "image" ? t(uiKeys.queue.card.inputImage) : input.kind === "video" ? t(uiKeys.queue.card.sourceVideo) : t(uiKeys.queue.card.noReferenceImage)}</small></div></div>`
    : "";
  return `
    <article class="task-card panel ${task.status}${inputPreview ? " task-card-with-preview" : ""}">
      ${inputPreview}
      <div class="task-main">
        <div class="queue-task-heading"><div class="queue-rank ${attentionTask ? "attention" : task.status}" aria-label="${attentionTask ? t(uiKeys.queue.card.needsAttention) : t(uiKeys.queue.card.queuePosition, { count: queuePosition })}">${rankMarkup}</div><div><span class="status ${task.status}">${statusLabel(task.status, t)}</span><h3>${options.escapeHtml(task.outputFilename)}</h3></div></div>
        <p class="task-description">${options.escapeHtml(description)}</p>
        <div class="task-meta">${metadata}${retrySummary}</div>
        ${task.error ? `<p class="error">${options.escapeHtml(task.error)}</p>` : ""}
      </div>
      <div class="task-actions queue-task-actions">
        ${task.status === "waiting" ? `<div class="queue-reorder-controls" aria-label="${t(uiKeys.queue.card.moveUp)} / ${t(uiKeys.queue.card.moveDown)}"><button class="icon-button" data-move="${task.id}" data-direction="-1" aria-label="${t(uiKeys.queue.card.moveUp)}" aria-keyshortcuts="ArrowUp" title="${t(uiKeys.queue.card.moveUp)} (↑)" ${options.canMoveUp === false ? "disabled" : ""}>${options.icon("move-up")}</button><button class="icon-button" data-move="${task.id}" data-direction="1" aria-label="${t(uiKeys.queue.card.moveDown)}" aria-keyshortcuts="ArrowDown" title="${t(uiKeys.queue.card.moveDown)} (↓)" ${options.canMoveDown === false ? "disabled" : ""}>${options.icon("move-down")}</button></div>` : ""}
        ${task.status === "waiting" || task.status === "failed" || task.status === "cancelled"
          ? task.taskType === "upscale"
            ? `<button class="secondary button-with-icon queue-action-primary" data-edit-upscale-task="${task.id}" ${options.queueActionBusy?.taskId === task.id && options.queueActionBusy.action === "edit" ? "disabled" : ""} title="${t(uiKeys.queue.card.editUpscaleTitle)}">${options.icon("sliders-horizontal")}<span class="queue-action-label">${options.queueActionBusy?.taskId === task.id && options.queueActionBusy.action === "edit" ? t(uiKeys.queue.card.opening) : t(uiKeys.queue.card.edit)}</span></button>`
            : `<button class="secondary button-with-icon queue-action-primary" data-edit-task="${task.id}" ${options.queueActionBusy?.taskId === task.id && options.queueActionBusy.action === "edit" ? "disabled" : ""} title="${t(uiKeys.queue.card.editTitle)}">${options.icon("sliders-horizontal")}<span class="queue-action-label">${options.queueActionBusy?.taskId === task.id && options.queueActionBusy.action === "edit" ? t(uiKeys.queue.card.opening) : t(uiKeys.queue.card.edit)}</span></button>`
          : ""}
        ${task.status === "failed" || task.status === "cancelled" ? `<button class="secondary button-with-icon queue-action-primary queue-action-reset" data-reset-task="${task.id}" ${queueCleanupActive ? "disabled" : ""} title="${t(uiKeys.queue.card.resetTitle)}">${options.icon("rotate-ccw")}<span class="queue-action-label">${t(uiKeys.queue.card.reset)}</span></button>` : ""}
        <button class="secondary button-with-icon queue-action-quiet" data-duplicate="${task.id}" aria-label="${t(uiKeys.queue.card.duplicate)}" title="${t(uiKeys.queue.card.duplicate)}">${options.icon("copy")}<span class="queue-action-label">${t(uiKeys.queue.card.duplicate)}</span></button>
        <button class="ghost danger button-with-icon queue-action-quiet" data-remove="${task.id}" aria-label="${options.queueActionBusy?.taskId === task.id && options.queueActionBusy.action === "remove" ? t(uiKeys.queue.card.removing) : t(uiKeys.queue.card.remove)}" title="${options.queueActionBusy?.taskId === task.id && options.queueActionBusy.action === "remove" ? t(uiKeys.queue.card.removing) : t(uiKeys.queue.card.remove)}" ${options.queueActionBusy?.taskId === task.id ? "disabled" : ""}>${options.icon("trash-2")}<span class="queue-action-label">${options.queueActionBusy?.taskId === task.id && options.queueActionBusy.action === "remove" ? t(uiKeys.queue.card.removing) : t(uiKeys.queue.card.remove)}</span></button>
      </div>
    </article>`;
}
