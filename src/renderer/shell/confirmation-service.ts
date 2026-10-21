import type { AppState, Settings } from "../../types";
import type { CreationMode, Page, RendererNotifyOptions } from "../contracts";
import { uiKeys } from "../../core/i18n-keys";
import type { Translate } from "../../core/i18n";
import type { RendererApplicationApi } from "../studio-client";
import { historyDeleteImpactFromError, type HistoryDeleteApproval, type HistoryDeleteImpact } from "../../core/history-delete-confirmation";

export type ConfirmationRequest =
  | { kind: "clear-draft"; mode: CreationMode }
  | { kind: "delete-history"; assetId: string; title: string; deletionImpact?: HistoryDeleteImpact }
  | { kind: "delete-history-batch"; historyKind: "video" | "image"; assetIds: string[]; count: number; deletionImpact?: HistoryDeleteImpact }
  | { kind: "delete-image-version"; projectId: string; versionId: string; title: string }
  | { kind: "delete-video-version"; assetId: string; versionId: string; title: string; deletionImpact?: HistoryDeleteImpact }
  | { kind: "delete-joint-av"; assetId: string; versionId: string; title: string; deletionImpact?: HistoryDeleteImpact }
  | { kind: "delete-motion-context"; assetId: string; versionId: string; title: string; deletionImpact?: HistoryDeleteImpact }
  | { kind: "remove-queue-task"; taskId: string; title: string }
  | { kind: "cancel-queue-task"; taskId: string; title: string }
  | { kind: "discard-settings"; nextPage: Page }
  | { kind: "force-stop-comfy" }
  | {
      kind: "prompt-cpu-fallback";
      usedVram: string;
      totalVram: string;
      freeVram: string;
      requiredVram: string;
    }
  | { kind: "uninstall-custom-node"; nodeId: string; name: string }
  | { kind: "uninstall-llama-cpp-python" }
  | { kind: "uninstall-strata"; directory: string };

export type ConfirmationApplicationApi = Pick<RendererApplicationApi,
  | "forceStopComfyProcesses"
  | "uninstallLlamaCppPython"
  | "uninstallStrata"
  | "uninstallCustomNode"
  | "removeTask"
  | "cancelTask"
  | "setSettingsDirty"
  | "deleteHistoryAsset"
  | "deleteHistoryAssets"
  | "deleteImageHistoryVersion"
  | "deleteHistoryVersion"
  | "deleteHistoryJointAv"
  | "deleteHistoryMotionContext"
>;

export interface ConfirmationRuntimeContext {
  application: ConfirmationApplicationApi;
  t: Translate;
}

export interface ConfirmationServiceOptions {
  getRequest(): ConfirmationRequest | null;
  setRequest(request: ConfirmationRequest | null): void;
  setBusy(value: boolean): void;
  isBusy(): boolean;
  getState(): AppState;
  setState(nextState: AppState): void;
  getFormSettings(): Settings;
  clearCreationDraft(mode: CreationMode): void;
  setServiceForceStopping(value: boolean): void;
  setServiceStatusMessage(message: string): void;
  setLlamaCppPythonInstalling(value: boolean): void;
  getLlamaCppPythonLog(): string;
  setLlamaCppPythonLog(log: string): void;
  setCustomNodeLog(nodeId: string, log: string): void;
  scanEnvironment(settings: Settings): Promise<void>;
  setSettingsDraft(settings: Settings | null): void;
  setPage(page: Page): void;
  setHistoryKind(kind: "video" | "image"): void;
  setHistoryScrollRestorePending(value: boolean): void;
  setSelectedHistoryAssetId(assetId: string): void;
  setSelectedHistoryVersionId(versionId: string): void;
  clearImageHistoryThumbnailCache(): void;
  clearHistoryBatchSelection?(): void;
  invalidateHistoryMediaForAsset?(assetId: string): void;
  setQueueActionBusy(value: { taskId: string; action: "remove" | "cancel" } | null): void;
  releaseHistoryVideo(assetId: string): void;
  rememberModalFocus(): void;
  restoreModalFocus(): void;
  overlayRoot: HTMLElement;
  render(): void;
  renderOverlay(): void;
  notify(message: string, options?: RendererNotifyOptions): void;
  getPage(): Page;
}

export async function acceptConfirmation(
  context: ConfirmationRuntimeContext,
  options: ConfirmationServiceOptions
): Promise<void> {
  const request = options.getRequest();
  const t = context.t;
  if (!request || options.isBusy()) return;
  const approvalArgs: [HistoryDeleteApproval?] = "deletionImpact" in request && request.deletionImpact
    ? [{ referenceToken: request.deletionImpact.referenceToken }]
    : [];
  const preserveHistoryScrollOnReturn =
    (request.kind === "delete-history" &&
      (options.getPage() === "history-detail" || options.getPage() === "image-history-detail"));
  if (preserveHistoryScrollOnReturn) options.setHistoryScrollRestorePending(true);
  options.setBusy(true);
  const acceptButton = options.overlayRoot.querySelector<HTMLButtonElement>("#accept-confirmation");
  const cancelButton = options.overlayRoot.querySelector<HTMLButtonElement>("#cancel-confirmation");
  if (acceptButton) {
    acceptButton.disabled = true;
    acceptButton.textContent = t(uiKeys.dialog.processing);
  }
  if (cancelButton) cancelButton.disabled = true;
  if (request.kind === "uninstall-custom-node") {
    options.setCustomNodeLog(request.nodeId, "");
    options.renderOverlay();
  }
  try {
    if (request.kind === "clear-draft") {
      options.clearCreationDraft(request.mode);
    } else if (request.kind === "force-stop-comfy") {
      options.setServiceForceStopping(true);
      options.setServiceStatusMessage(t(uiKeys.runtime.forceStopStatus));
      const settings = options.getFormSettings();
      const result = await context.application.forceStopComfyProcesses(settings);
      options.setServiceForceStopping(false);
      options.setServiceStatusMessage(result.message);
      await options.scanEnvironment(settings);
      if (!result.ok) throw new Error(result.message);
      options.setRequest(null);
      options.setBusy(false);
      options.notify(result.message);
      options.render();
      options.restoreModalFocus();
      return;
    } else if (request.kind === "uninstall-llama-cpp-python") {
      const settings = options.getFormSettings();
      options.setLlamaCppPythonInstalling(true);
      options.setLlamaCppPythonLog("");
      const result = await context.application.uninstallLlamaCppPython(settings);
      options.setLlamaCppPythonLog(result.log || result.message);
      if (!result.ok) throw new Error(result.message);
      await options.scanEnvironment(settings);
      options.setLlamaCppPythonInstalling(false);
      options.setRequest(null);
      options.setBusy(false);
      options.notify(result.message);
      options.render();
      options.restoreModalFocus();
      return;
    } else if (request.kind === "uninstall-strata") {
      const settings = options.getFormSettings();
      const result = await context.application.uninstallStrata(settings);
      await options.scanEnvironment(settings);
      if (!result.ok) throw new Error(result.message);
      options.setRequest(null);
      options.setBusy(false);
      options.notify(result.message);
      options.render();
      options.restoreModalFocus();
      return;
    } else if (request.kind === "uninstall-custom-node") {
      const settings = options.getFormSettings();
      const result = await context.application.uninstallCustomNode(request.nodeId, settings);
      if (!result.ok) throw new Error(result.message);
      await options.scanEnvironment(settings);
      options.setRequest(null);
      options.setBusy(false);
      options.notify(result.message);
      options.render();
      options.restoreModalFocus();
      return;
    } else if (request.kind === "remove-queue-task") {
      options.setQueueActionBusy({ taskId: request.taskId, action: "remove" });
      options.setState(await context.application.removeTask(request.taskId));
      options.setQueueActionBusy(null);
      options.notify(t(uiKeys.runtime.queueTaskRemoved, { title: request.title }));
    } else if (request.kind === "cancel-queue-task") {
      options.setQueueActionBusy({ taskId: request.taskId, action: "cancel" });
      options.setState(await context.application.cancelTask(request.taskId));
      options.setQueueActionBusy(null);
      options.notify(t(uiKeys.runtime.queueTaskCancelled, { title: request.title }), {
        kind: "warning"
      });
    } else if (request.kind === "discard-settings") {
      options.setSettingsDraft(null);
      void context.application.setSettingsDirty(false).catch(() => undefined);
      options.setPage(request.nextPage);
      options.setRequest(null);
      options.setBusy(false);
      options.render();
      options.restoreModalFocus();
      if (request.nextPage !== "history") window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
      return;
    } else if (request.kind === "delete-history") {
      options.releaseHistoryVideo(request.assetId);
      options.invalidateHistoryMediaForAsset?.(request.assetId);
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
      options.setState(await context.application.deleteHistoryAsset(request.assetId, ...approvalArgs));
      options.setSelectedHistoryAssetId("");
      if (options.getPage() === "history-detail" || options.getPage() === "image-history-detail") {
        if (options.getPage() === "image-history-detail") options.setHistoryKind("image");
        options.setHistoryScrollRestorePending(true);
        options.setPage("history");
      }
      options.notify(t(uiKeys.runtime.historyAssetDeleted, { title: request.title }));
    } else if (request.kind === "delete-history-batch") {
      options.setState(await context.application.deleteHistoryAssets(request.historyKind, request.assetIds, ...approvalArgs));
      options.clearHistoryBatchSelection?.();
      options.notify(t(uiKeys.history.batch.deleted, { count: request.count }));
    } else if (request.kind === "delete-image-version") {
      options.invalidateHistoryMediaForAsset?.(request.projectId);
      options.setState(await context.application.deleteImageHistoryVersion(request.projectId, request.versionId));
      options.clearImageHistoryThumbnailCache();
      options.setSelectedHistoryVersionId("");
      const remainingProject = options.getState().imageHistory.find((item) => item.id === request.projectId);
      if (!remainingProject) {
        options.setSelectedHistoryAssetId("");
        options.setHistoryKind("image");
        options.setHistoryScrollRestorePending(true);
        options.setPage("history");
      }
      options.notify(t(uiKeys.runtime.imageVersionDeleted));
    } else if (request.kind === "delete-video-version") {
      options.releaseHistoryVideo(request.assetId);
      options.invalidateHistoryMediaForAsset?.(request.assetId);
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
      options.setState(await context.application.deleteHistoryVersion(request.assetId, request.versionId, ...approvalArgs));
      options.setSelectedHistoryVersionId("");
      options.notify(t(uiKeys.runtime.historyVersionDeleted));
    } else if (request.kind === "delete-joint-av") {
      options.setState(await context.application.deleteHistoryJointAv(request.assetId, request.versionId, ...approvalArgs));
      options.notify(t(uiKeys.runtime.jointAvDeleted));
    } else if (request.kind === "delete-motion-context") {
      options.setState(await context.application.deleteHistoryMotionContext(request.assetId, request.versionId, ...approvalArgs));
      options.notify(t(uiKeys.runtime.motionContextDeleted));
    }
    options.setRequest(null);
    options.setBusy(false);
    options.render();
    options.restoreModalFocus();
  } catch (error) {
    const impact = historyDeleteImpactFromError(error);
    if (impact && (request.kind === "delete-history" || request.kind === "delete-history-batch" ||
      request.kind === "delete-video-version" || request.kind === "delete-joint-av" || request.kind === "delete-motion-context")) {
      if (preserveHistoryScrollOnReturn) options.setHistoryScrollRestorePending(false);
      options.setRequest({ ...request, deletionImpact: impact });
      options.setBusy(false);
      options.renderOverlay();
      // A changed consequence is a new decision, not a retry of the focused
      // destructive button. Keep Enter from accepting the second step.
      options.overlayRoot.querySelector<HTMLButtonElement>("#cancel-confirmation")?.focus();
      return;
    }
    options.setQueueActionBusy(null);
    if (request.kind === "force-stop-comfy") options.setServiceForceStopping(false);
    if (request.kind === "uninstall-llama-cpp-python") {
      options.setLlamaCppPythonInstalling(false);
      if (!options.getLlamaCppPythonLog()) {
        options.setLlamaCppPythonLog(error instanceof Error ? error.message : String(error));
      }
    }
    if (preserveHistoryScrollOnReturn) options.setHistoryScrollRestorePending(false);
    options.setBusy(false);
    options.notify(error instanceof Error ? error.message : String(error), { kind: "error" });
    if (request.kind === "uninstall-llama-cpp-python") {
      options.render();
    } else {
      options.renderOverlay();
    }
  }
}
