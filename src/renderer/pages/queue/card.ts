import { imageModelCapabilityFor } from "../../../core/image-workflow";
import {
  isMiniMaxH3Model,
  normalizeH3Steps
} from "../../../core/workflow";
import { upscaleDimensions } from "../../../core/upscale";
import type { Draft, QueueTask } from "../../../types";

export type QueueTaskInput =
  | { kind: "image"; path: string }
  | { kind: "video"; path: string };

export type QueueActionBusy = {
  taskId: string;
  action: "remove" | "cancel" | "edit";
} | null;

export interface QueueCardRenderOptions {
  taskPreviews: Readonly<Record<string, string>>;
  queueRunning: boolean;
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
}

export function queueTaskInput(task: QueueTask): QueueTaskInput | null {
  if (task.taskType === "image-generation" && task.pictures[0]?.absolutePath) {
    return { kind: "image", path: task.pictures[0].absolutePath };
  }
  if (task.taskType === "generation" && task.startImagePath) {
    return { kind: "image", path: task.startImagePath };
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
  return queueTaskInput(task)
    ? `studio-media://queue/${encodeURIComponent(task.id)}`
    : "";
}

function statusLabel(status: string): string {
  return {
    waiting: "等待",
    running: "运行中",
    completed: "完成",
    failed: "失败",
    cancelled: "已取消"
  }[status] ?? status;
}

export function renderQueueTaskCard(
  task: QueueTask,
  queuePosition: number,
  options: QueueCardRenderOptions
): string {
  const description = task.taskType === "image-generation"
    ? `${task.prompt} · ${task.outputCount} 张候选图`
    : task.taskType === "generation"
    ? task.prompt
    : task.taskType === "extension"
      ? `${task.prompt} · 保留 ${task.trimStartSeconds.toFixed(1)}–${task.trimEndSeconds.toFixed(1)} 秒`
      : `${task.sourceFilename} → ${task.outputFilename}`;
  const upscaleOutput = task.taskType === "upscale"
    ? upscaleDimensions(task.sourceWidth, task.sourceHeight, task.targetHeight)
    : null;
  const h3ComputeSummary = task.taskType !== "upscale" && task.taskType !== "image-generation" && isMiniMaxH3Model(task.modelId)
    ? task.spectrumMode === "balanced"
        ? `<span title="Spectrum 已开启；H3 特征历史保存在系统内存">${normalizeH3Steps(task.steps, task.modelId, task.videoLoras)} 步 · Spectrum 开</span>`
        : `<span title="Spectrum 已关闭；使用 H3 原生完整计算">${normalizeH3Steps(task.steps, task.modelId, task.videoLoras)} 步 · Spectrum 关</span>`
    : "";
  const loraSummary = task.taskType !== "image-generation" && task.videoLoras?.length
    ? task.videoLoras.map((lora, index) => `<span class="task-meta-lora" title="${options.escapeHtml(lora.filename)}">LoRA ${index + 1} · ${options.escapeHtml(lora.name)} · 强度 ${lora.strength}</span>`).join("")
    : "";
  const imageQueueQuality = task.taskType === "image-generation"
    ? imageModelCapabilityFor(task.modelId).qualityProfiles.find(
        (profile) => profile.id === task.qualityProfile
      )
    : undefined;
  const seedText = task.taskType === "image-generation" ? "批次内独立" : String(task.seed);
  const metadata = task.taskType === "image-generation"
    ? `<span>图片处理</span><span>${options.escapeHtml(options.modelName(task.modelId))}</span><span>${task.outputCount} 张候选图</span><span>${options.escapeHtml(imageQueueQuality?.label ?? task.qualityProfile)}${imageQueueQuality ? ` · ${imageQueueQuality.steps} 步 · CFG ${imageQueueQuality.cfg}` : ""}</span>${imageQueueQuality?.lightning ? `<span>LoRA · Qwen Lightning</span>` : ""}<span>${task.pictures.length} 张 Picture · ${task.pictures.reduce((count, picture) => count + (picture.markup?.objectCount ?? 0), 0)} 处 Canvas 标记</span><span>PNG 中间输出</span>`
    : task.taskType === "generation"
    ? `<span>${options.escapeHtml(options.modelName(task.modelId))}</span>${loraSummary}<span>${task.resolution}p</span><span>${task.duration}秒</span><span>${options.frameRateSummary(task.fps, task.frameInterpolation)}</span>${h3ComputeSummary}<span>Seed ${options.escapeHtml(seedText)}</span>`
    : task.taskType === "extension"
      ? `<span>视频续写</span><span>${options.escapeHtml(options.modelName(task.modelId))}</span><span>${task.resolution}p</span><span>最多 ${task.maxGeneratedFrames} 模型帧</span><span>${task.overlapFrames} 帧上下文</span>${h3ComputeSummary}`
      : `<span>分辨率提升</span><span>${options.escapeHtml(options.modelName(task.modelId))}</span><span>${upscaleOutput![0]} × ${upscaleOutput![1]}</span><span>分批处理 · 每批卸载</span>`;
  const attentionTask = task.status === "failed" || task.status === "cancelled";
  const retrySummary = task.automaticRetryAttempt
    ? `<span class="queue-retry-status">自动重试第 ${task.automaticRetryAttempt} 次</span>`
    : "";
  const rankMarkup = queuePosition > 0
    ? `<strong>${String(queuePosition).padStart(2, "0")}</strong><small>队位</small>`
    : `<strong>!</strong><small>需处理</small>`;
  if (task.status === "running") {
    const preview = options.taskPreviews[task.id] ?? "";
    const input = queueTaskInput(task);
    const inputVideoUrl = input?.kind === "video" ? queueTaskInputUrl(task) : "";
    return `
      <article class="task-card panel running expanded">
        <div class="expanded-task-head">
          <div class="queue-task-heading"><div class="queue-rank running" aria-label="队列第 ${queuePosition} 项"><strong>${String(queuePosition).padStart(2, "0")}</strong><small>当前</small></div><div><div class="running-status-line"><span class="status running">正在运行</span><span class="running-elapsed-prominent" id="running-elapsed">${options.elapsedText(task.startedAt)}</span></div><h3>${options.escapeHtml(task.outputFilename)}</h3></div></div>
          <div class="running-progress-value"><span>总进度</span><strong id="running-progress-label">${Math.round(task.progress ?? 0)}%</strong></div>
        </div>
        <div class="running-layout">
          <div class="live-preview">
            <img id="live-preview-image" ${input?.kind === "image" ? `data-queue-input-image="${options.escapeHtml(task.id)}"` : ""} alt="${input ? "用户输入或 ComfyUI 实时预览" : "ComfyUI 实时预览"}" src="${preview ? options.escapeHtml(preview) : ""}" style="${preview ? "" : "display:none"}">
            ${inputVideoUrl ? `<video data-queue-input-video="${options.escapeHtml(task.id)}" muted playsinline preload="metadata" src="${inputVideoUrl}" style="${preview ? "display:none" : ""}"></video>` : ""}
            <div id="live-preview-empty" style="${preview || inputVideoUrl ? "display:none" : ""}"><span>${options.icon(input ? input.kind === "image" ? "image" : "film" : "film")}</span><strong>${input ? "正在读取输入画面" : "等待 ComfyUI 预览帧"}</strong><small>${input ? "ComfyUI 返回实时帧后会自动替换" : "部分节点只会在采样过程中发送预览"}</small></div>
          </div>
          <div class="running-copy">
            <span class="eyebrow">当前步骤 · <span id="running-stage">${options.escapeHtml(task.stage ?? "准备中")}</span></span>
            <div class="progress" role="progressbar" aria-label="任务总进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(task.progress ?? 0)}"><span id="running-progress-bar" style="width:${task.progress ?? 0}%"></span></div>
            <p class="task-description">${options.escapeHtml(description)}</p>
            <div class="task-meta">${metadata}<span id="running-stage-elapsed">${options.queueStageElapsedText(task)}</span><span id="running-eta">预计剩余 ${options.queueEstimateText(options.queueTaskRemainingSeconds(task))}</span></div>
            <div class="running-controls">
              <button class="secondary button-with-icon" id="${options.queueRunning ? "pause-queue" : "start-queue"}">${options.icon(options.queueRunning ? "pause" : "play")}${options.queueRunning ? "本条完成后暂停" : "继续执行后续任务"}</button>
              <button class="danger secondary button-with-icon" data-cancel="${task.id}" ${options.queueActionBusy?.taskId === task.id ? "disabled" : ""}>${options.icon("ban")}${options.queueActionBusy?.taskId === task.id && options.queueActionBusy.action === "cancel" ? "取消中…" : "取消当前任务"}</button>
            </div>
            <p class="control-hint">${options.queueRunning ? "暂停不会冻结当前 GPU 计算；当前任务完成后不会启动下一条。" : "当前任务仍会继续运行，后续任务已暂停。"}</p>
          </div>
        </div>
      </article>`;
  }
  const input = queueTaskInput(task);
  const inputVideoUrl = input?.kind === "video" ? queueTaskInputUrl(task) : "";
  const inputPreview = input
    ? `<div class="task-input-preview" data-queue-input-preview="${options.escapeHtml(task.id)}">${input.kind === "image" ? `<img data-queue-input-image="${options.escapeHtml(task.id)}" alt="用户输入图片" style="display:none">` : `<video data-queue-input-video="${options.escapeHtml(task.id)}" muted playsinline preload="metadata" src="${inputVideoUrl}"></video>`}<div data-queue-input-empty><span>${options.icon(input.kind === "image" ? "image" : "film")}</span><small>${input.kind === "image" ? "输入画面" : "源视频"}</small></div></div>`
    : "";
  return `
    <article class="task-card panel ${task.status}${inputPreview ? " task-card-with-preview" : ""}">
      ${inputPreview}
      <div class="task-main">
        <div class="queue-task-heading"><div class="queue-rank ${attentionTask ? "attention" : task.status}" aria-label="${attentionTask ? "需要处理的任务" : `队列第 ${queuePosition} 项`}">${rankMarkup}</div><div><span class="status ${task.status}">${statusLabel(task.status)}</span><h3>${options.escapeHtml(task.outputFilename)}</h3></div></div>
        <p class="task-description">${options.escapeHtml(description)}</p>
        <div class="task-meta">${metadata}${retrySummary}</div>
        ${task.error ? `<p class="error">${options.escapeHtml(task.error)}</p>` : ""}
      </div>
      <div class="task-actions">
        ${task.status === "waiting" ? `<div class="button-row"><button class="icon-button" data-move="${task.id}" data-direction="-1" aria-label="上移" title="上移">${options.icon("move-up")}</button><button class="icon-button" data-move="${task.id}" data-direction="1" aria-label="下移" title="下移">${options.icon("move-down")}</button></div>` : ""}
        ${task.status === "waiting" || task.status === "failed" || task.status === "cancelled"
          ? task.taskType === "upscale"
            ? `<button class="secondary button-with-icon" data-edit-upscale-task="${task.id}" ${options.queueActionBusy?.taskId === task.id && options.queueActionBusy.action === "edit" ? "disabled" : ""} title="带回提升设置并重新加入队列">${options.icon("sliders-horizontal")}${options.queueActionBusy?.taskId === task.id && options.queueActionBusy.action === "edit" ? "打开中…" : task.status === "waiting" ? "编辑" : "编辑并重新加入"}</button>`
            : `<button class="secondary button-with-icon" data-edit-task="${task.id}" ${options.queueActionBusy?.taskId === task.id && options.queueActionBusy.action === "edit" ? "disabled" : ""} title="带回创建页调整参数并重新加入队列">${options.icon("sliders-horizontal")}${options.queueActionBusy?.taskId === task.id && options.queueActionBusy.action === "edit" ? "带回中…" : "编辑并重新加入"}</button>`
          : ""}
        <button class="secondary button-with-icon" data-duplicate="${task.id}">${options.icon("copy")}复制</button>
        ${task.status === "failed" || task.status === "cancelled" ? `<button class="secondary button-with-icon" data-reset-task="${task.id}" title="清除失败状态并恢复为普通等待任务">${options.icon("rotate-ccw")}重置状态</button>` : ""}
        <button class="ghost danger button-with-icon" data-remove="${task.id}" ${options.queueActionBusy?.taskId === task.id ? "disabled" : ""}>${options.icon("trash-2")}${options.queueActionBusy?.taskId === task.id && options.queueActionBusy.action === "remove" ? "移除中…" : "移除"}</button>
      </div>
    </article>`;
}
