import type { WindowCloseRequest } from "../../types";
import { uiKeys } from "../../core/i18n-keys";
import type { Translate } from "../../core/i18n";
import { formatElapsedDuration } from "../shared/formatters";

export type ConfirmationRequest =
  | { kind: "clear-draft" }
  | { kind: "delete-history"; assetId: string; title: string }
  | { kind: "delete-image-version"; projectId: string; versionId: string; title: string }
  | { kind: "delete-video-version"; assetId: string; versionId: string; title: string }
  | { kind: "remove-queue-task"; taskId: string; title: string }
  | { kind: "cancel-queue-task"; taskId: string; title: string }
  | { kind: "discard-settings"; nextPage: string }
  | { kind: "force-stop-comfy" }
  | { kind: "uninstall-custom-node"; nodeId: string; name: string };

export interface ConfirmationDialogOptions {
  request: ConfirmationRequest | null;
  confirmationBusy: boolean;
  imageHistoryIds: ReadonlySet<string>;
  t: Translate;
  icon(name: string, className?: string): string;
  escapeHtml(value: unknown): string;
}

export interface WindowCloseDialogOptions {
  request: WindowCloseRequest | null;
  responseBusy: boolean;
  t: Translate;
  icon(name: string, className?: string): string;
  escapeHtml(value: unknown): string;
}

export function renderConfirmationDialog(options: ConfirmationDialogOptions): string {
  const request = options.request;
  if (!request) return "";
  const deleting = request.kind === "delete-history";
  const deletingImageVersion = request.kind === "delete-image-version";
  const deletingVideoVersion = request.kind === "delete-video-version";
  const deletingVersion = deletingImageVersion || deletingVideoVersion;
  const deletingImage = deleting && options.imageHistoryIds.has(request.assetId);
  const removingQueueTask = request.kind === "remove-queue-task";
  const cancellingQueueTask = request.kind === "cancel-queue-task";
  const discardingSettings = request.kind === "discard-settings";
  const forceStoppingComfy = request.kind === "force-stop-comfy";
  const uninstallingNode = request.kind === "uninstall-custom-node";
  const t = options.t;
  const title = deletingVersion
    ? t(uiKeys.dialog.deleteVersionTitle, { title: request.title })
    : deleting
    ? t(deletingImage ? uiKeys.dialog.deleteImageTitle : uiKeys.dialog.deleteVideoTitle, { title: request.title })
    : removingQueueTask
      ? t(uiKeys.dialog.removeTaskTitle, { title: request.title })
      : cancellingQueueTask
        ? t(uiKeys.dialog.cancelTaskTitle, { title: request.title })
        : discardingSettings
          ? t(uiKeys.dialog.discardSettingsTitle)
          : uninstallingNode
            ? t(uiKeys.dialog.uninstallNodeTitle, { name: request.name })
          : forceStoppingComfy
            ? t(uiKeys.dialog.forceStopTitle)
            : t(uiKeys.dialog.clearDraftTitle);
  const description = deletingVersion
    ? t(deletingVideoVersion ? uiKeys.dialog.deleteVideoVersionDescription : uiKeys.dialog.deleteVersionDescription)
    : deleting
    ? deletingImage
      ? t(uiKeys.dialog.deleteImageDescription)
      : t(uiKeys.dialog.deleteVideoDescription)
    : removingQueueTask
      ? t(uiKeys.dialog.removeTaskDescription)
      : cancellingQueueTask
        ? t(uiKeys.dialog.cancelTaskDescription)
        : discardingSettings
          ? t(uiKeys.dialog.discardSettingsDescription)
          : uninstallingNode
            ? t(uiKeys.dialog.uninstallNodeDescription)
          : forceStoppingComfy
            ? t(uiKeys.dialog.forceStopDescription)
            : t(uiKeys.dialog.clearDraftDescription);
  return `
    <div class="dialog-backdrop confirm-backdrop" id="confirm-backdrop">
      <section class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description" tabindex="-1">
        <div class="confirm-icon" aria-hidden="true">${options.icon("alert-triangle")}</div>
        <div class="confirm-copy">
          <span class="eyebrow">${t(uninstallingNode ? uiKeys.dialog.recoverable : uiKeys.dialog.irreversible)}</span>
          <h2 id="confirm-title">${options.escapeHtml(title)}</h2>
          <p id="confirm-description">${options.escapeHtml(description)}</p>
          ${deletingVersion
            ? `<div class="confirm-warning">${t(deletingVideoVersion ? uiKeys.dialog.deleteVideoVersionWarning : uiKeys.dialog.deleteVersionWarning)}</div>`
            : deleting
            ? `<div class="confirm-warning">${t(deletingImage ? uiKeys.dialog.deleteImageWarning : uiKeys.dialog.deleteVideoWarning)}</div>`
            : removingQueueTask || cancellingQueueTask
              ? `<div class="confirm-warning">${t(uiKeys.dialog.removeTaskWarning)}</div>`
              : discardingSettings
                ? `<div class="confirm-warning">${t(uiKeys.dialog.discardSettingsWarning)}</div>`
                : uninstallingNode
                  ? `<div class="confirm-warning">${t(uiKeys.dialog.uninstallNodeWarning)}</div>`
                : forceStoppingComfy
                  ? `<div class="confirm-warning danger-warning">${t(uiKeys.dialog.forceStopWarning)}</div>`
                  : ""}
        </div>
        <div class="dialog-actions">
          <button class="secondary button-with-icon" id="cancel-confirmation" ${options.confirmationBusy ? "disabled" : ""}>${options.icon("x")}${t(uiKeys.dialog.cancel)}</button>
          <button class="primary destructive button-with-icon" id="accept-confirmation" ${options.confirmationBusy ? "disabled" : ""}>${options.icon(forceStoppingComfy || cancellingQueueTask ? "ban" : discardingSettings ? "rotate-ccw" : "trash-2")}${options.confirmationBusy ? t(uiKeys.dialog.processing) : uninstallingNode ? t(uiKeys.dialog.uninstallNode) : forceStoppingComfy ? t(uiKeys.dialog.forceStop) : deletingVersion ? t(uiKeys.dialog.deleteCurrentVersion) : deleting ? deletingImage ? t(uiKeys.dialog.deleteImageProject) : t(uiKeys.dialog.deleteVideoRecord) : removingQueueTask ? t(uiKeys.dialog.removeTask) : cancellingQueueTask ? t(uiKeys.dialog.cancelTask) : discardingSettings ? t(uiKeys.dialog.discardChanges) : t(uiKeys.dialog.clearDraft)}</button>
        </div>
      </section>
    </div>`;
}

export function renderWindowCloseDialog(options: WindowCloseDialogOptions): string {
  const request = options.request;
  if (!request) return "";
  const runningWork = request.kind === "running-work";
  const queueCleanupOnly = runningWork && request.queueCleanupOnly === true;
  const hasUnsavedSettings = request.hasUnsavedSettings === true;
  const t = options.t;
  const cleanupStartedAt = request.queueLifecycleStartedAt
    ? Date.parse(request.queueLifecycleStartedAt)
    : Number.NaN;
  const cleanupDuration = Number.isFinite(cleanupStartedAt)
    ? formatElapsedDuration(Math.max(0, (Date.now() - cleanupStartedAt) / 1000), t)
    : t(uiKeys.format.waitingTimer);
  return `
    <div class="dialog-backdrop confirm-backdrop close-dialog-backdrop" id="window-close-backdrop">
      <section class="confirm-dialog close-dialog" role="alertdialog" aria-modal="true" aria-labelledby="window-close-title" aria-describedby="window-close-description" tabindex="-1">
        <div class="confirm-icon" aria-hidden="true">${options.icon("alert-triangle")}</div>
        <div class="confirm-copy">
          <span class="eyebrow">${runningWork ? (queueCleanupOnly ? t(uiKeys.dialog.queueCleanup) : t(uiKeys.dialog.runningTask)) : t(uiKeys.dialog.exitApp)}</span>
          <h2 id="window-close-title">${runningWork ? (queueCleanupOnly ? t(uiKeys.dialog.queueCleanupTitle) : t(uiKeys.dialog.currentTaskNotFinished)) : t(uiKeys.dialog.unsavedSettings)}</h2>
          <p id="window-close-description">${runningWork ? (queueCleanupOnly ? t(uiKeys.dialog.queueCleanupDescription, { duration: cleanupDuration }) : t(uiKeys.dialog.runningTaskDescription)) : t(uiKeys.dialog.unsavedSettingsDescription)}</p>
          <div class="confirm-warning">${runningWork ? queueCleanupOnly ? (request.queueCleanupTimedOut ? t(uiKeys.dialog.queueCleanupTimedOutWarning) : t(uiKeys.dialog.queueCleanupWarning)) : `${hasUnsavedSettings ? t(uiKeys.dialog.unsavedWillDrop) : ""} ${t(uiKeys.dialog.serviceStays)}` : t(uiKeys.dialog.discardSettingsWarning)}</div>
        </div>
        <div class="dialog-actions">
          <button class="secondary button-with-icon" id="cancel-window-close" ${options.responseBusy ? "disabled" : ""}>${options.icon("x")}${t(uiKeys.dialog.cancelExit)}</button>
          ${runningWork ? `<button class="primary destructive button-with-icon" id="finish-window-close" ${options.responseBusy ? "disabled" : ""}>${options.icon("power")}${options.responseBusy ? t(uiKeys.dialog.processing) : queueCleanupOnly ? t(uiKeys.dialog.waitForCleanupExit) : t(uiKeys.dialog.finishTaskExit)}</button><button class="ghost danger button-with-icon" id="force-window-close" ${options.responseBusy ? "disabled" : ""}>${options.icon("ban")}${t(uiKeys.dialog.forceExit)}</button>` : `<button class="primary destructive button-with-icon" id="discard-window-close" ${options.responseBusy ? "disabled" : ""}>${options.icon("power")}${options.responseBusy ? t(uiKeys.dialog.processing) : t(uiKeys.dialog.discardAndExit)}</button>`}
        </div>
      </section>
    </div>`;
}
