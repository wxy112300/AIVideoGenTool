import type { WindowCloseRequest } from "../../types";

export type ConfirmationRequest =
  | { kind: "clear-draft" }
  | { kind: "delete-history"; assetId: string; title: string }
  | { kind: "delete-image-version"; projectId: string; versionId: string; title: string }
  | { kind: "remove-queue-task"; taskId: string; title: string }
  | { kind: "cancel-queue-task"; taskId: string; title: string }
  | { kind: "discard-settings"; nextPage: string }
  | { kind: "force-stop-comfy" };

export interface ConfirmationDialogOptions {
  request: ConfirmationRequest | null;
  confirmationBusy: boolean;
  imageHistoryIds: ReadonlySet<string>;
  icon(name: string, className?: string): string;
  escapeHtml(value: unknown): string;
}

export interface WindowCloseDialogOptions {
  request: WindowCloseRequest | null;
  responseBusy: boolean;
  icon(name: string, className?: string): string;
  escapeHtml(value: unknown): string;
}

export function renderConfirmationDialog(options: ConfirmationDialogOptions): string {
  const request = options.request;
  if (!request) return "";
  const deleting = request.kind === "delete-history";
  const deletingImageVersion = request.kind === "delete-image-version";
  const deletingImage = deleting && options.imageHistoryIds.has(request.assetId);
  const removingQueueTask = request.kind === "remove-queue-task";
  const cancellingQueueTask = request.kind === "cancel-queue-task";
  const discardingSettings = request.kind === "discard-settings";
  const forceStoppingComfy = request.kind === "force-stop-comfy";
  const title = deletingImageVersion
    ? `删除“${request.title}”？`
    : deleting
    ? `删除“${request.title}”？`
    : removingQueueTask
      ? `移除任务“${request.title}”？`
      : cancellingQueueTask
        ? `取消当前任务“${request.title}”？`
        : discardingSettings
          ? "放弃未保存的设置？"
          : forceStoppingComfy
            ? "强制终止所有 ComfyUI 进程？"
            : "清空当前草稿？";
  const description = deletingImageVersion
    ? "当前图片版本和对应生成文件会永久删除；同项目的其他版本和原始导入图片不会受影响。"
    : deleting
    ? deletingImage
      ? "图片项目记录和生成的版本文件会从磁盘永久删除；最初导入的原始素材不会删除。"
      : "关联的视频文件会从磁盘永久删除，历史记录也会一并移除。"
    : removingQueueTask
      ? "这会从队列中移除任务，不会删除输入文件或历史作品。"
      : cancellingQueueTask
        ? "当前生成会被中断；如果已经产生可用的部分视频，程序会尝试保留它。"
        : discardingSettings
          ? "当前设置修改尚未保存。放弃后会恢复到上一次保存的值。"
          : forceStoppingComfy
            ? "这会关闭所有识别到的 ComfyUI Desktop/后端进程，立即中断当前任务并释放 CUDA 上下文；不会自动重新启动。"
            : "首帧、尾帧和所有提示词版本都会清空；模型与输出设置会保留。";
  return `
    <div class="dialog-backdrop confirm-backdrop" id="confirm-backdrop">
      <section class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description" tabindex="-1">
        <div class="confirm-icon" aria-hidden="true">${options.icon("alert-triangle")}</div>
        <div class="confirm-copy">
          <span class="eyebrow">此操作无法撤销</span>
          <h2 id="confirm-title">${options.escapeHtml(title)}</h2>
          <p id="confirm-description">${options.escapeHtml(description)}</p>
          ${deletingImageVersion
            ? `<div class="confirm-warning">如果后续版本基于它生成，版本谱系会保留父版本已删除的标记。</div>`
            : deleting
            ? `<div class="confirm-warning">${deletingImage ? "只删除本图片项目的生成版本，不会删除原始导入图片或整个输出目录。" : "只删除本条记录关联的视频，不会删除参考图片、工作流或整个输出目录。"}</div>`
            : removingQueueTask || cancellingQueueTask
              ? `<div class="confirm-warning">任务参数、输入媒体和错误记录会继续保留在本地，之后仍可编辑、重试或移除。</div>`
              : discardingSettings
                ? `<div class="confirm-warning">已经保存的设置不会受到影响；只有当前编辑中的设置草稿会被丢弃。</div>`
                : forceStoppingComfy
                  ? `<div class="confirm-warning danger-warning">这是进程级强制操作，会关闭其它 ComfyUI 实例；未保存的 ComfyUI 工作流状态不会保留。</div>`
                  : ""}
        </div>
        <div class="dialog-actions">
          <button class="secondary button-with-icon" id="cancel-confirmation" ${options.confirmationBusy ? "disabled" : ""}>${options.icon("x")}取消</button>
          <button class="primary destructive button-with-icon" id="accept-confirmation" ${options.confirmationBusy ? "disabled" : ""}>${options.icon(forceStoppingComfy || cancellingQueueTask ? "ban" : discardingSettings ? "rotate-ccw" : "trash-2")}${options.confirmationBusy ? "处理中…" : forceStoppingComfy ? "强制终止进程" : deletingImageVersion ? "删除当前版本" : deleting ? deletingImage ? "删除图片项目" : "删除视频和记录" : removingQueueTask ? "移除任务" : cancellingQueueTask ? "取消当前任务" : discardingSettings ? "放弃更改" : "清空草稿"}</button>
        </div>
      </section>
    </div>`;
}

export function renderWindowCloseDialog(options: WindowCloseDialogOptions): string {
  const request = options.request;
  if (!request) return "";
  const runningWork = request.kind === "running-work";
  const hasUnsavedSettings = request.hasUnsavedSettings === true;
  return `
    <div class="dialog-backdrop confirm-backdrop close-dialog-backdrop" id="window-close-backdrop">
      <section class="confirm-dialog close-dialog" role="alertdialog" aria-modal="true" aria-labelledby="window-close-title" aria-describedby="window-close-description" tabindex="-1">
        <div class="confirm-icon" aria-hidden="true">${options.icon("alert-triangle")}</div>
        <div class="confirm-copy">
          <span class="eyebrow">${runningWork ? "任务仍在运行" : "退出应用"}</span>
          <h2 id="window-close-title">${runningWork ? "当前任务还没有结束" : "有未保存的设置"}</h2>
          <p id="window-close-description">${runningWork ? "结束任务会中断当前 ComfyUI 计算；强制退出不会等待完整清理。" : "当前设置还有未保存更改，退出后这些修改会丢失。"}</p>
          <div class="confirm-warning">${runningWork ? `${hasUnsavedSettings ? "未保存的设置也会被放弃。" : ""} ComfyUI 服务本身不会关闭。` : "已经保存的设置不会受到影响；只有当前编辑中的设置会被放弃。"}</div>
        </div>
        <div class="dialog-actions">
          <button class="secondary button-with-icon" id="cancel-window-close" ${options.responseBusy ? "disabled" : ""}>${options.icon("x")}取消退出</button>
          ${runningWork ? `<button class="primary destructive button-with-icon" id="finish-window-close" ${options.responseBusy ? "disabled" : ""}>${options.icon("power")}${options.responseBusy ? "处理中…" : "结束任务并退出"}</button><button class="ghost danger button-with-icon" id="force-window-close" ${options.responseBusy ? "disabled" : ""}>${options.icon("ban")}强制退出</button>` : `<button class="primary destructive button-with-icon" id="discard-window-close" ${options.responseBusy ? "disabled" : ""}>${options.icon("power")}${options.responseBusy ? "处理中…" : "放弃设置并退出"}</button>`}
        </div>
      </section>
    </div>`;
}
