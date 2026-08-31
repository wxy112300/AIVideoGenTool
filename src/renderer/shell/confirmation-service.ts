import type { AppState, Settings } from "../../types";
import type { CreationMode, Page, RendererContext, RendererNotifyOptions } from "../contracts";
import { uiKeys } from "../../core/i18n-keys";

export type ConfirmationRequest =
  | { kind: "clear-draft"; mode: CreationMode }
  | { kind: "delete-history"; assetId: string; title: string }
  | { kind: "delete-image-version"; projectId: string; versionId: string; title: string }
  | { kind: "delete-video-version"; assetId: string; versionId: string; title: string }
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
  | { kind: "uninstall-llama-cpp-python" };

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
  context: RendererContext,
  options: ConfirmationServiceOptions
): Promise<void> {
  const request = options.getRequest();
  const t = context.t;
  if (!request || options.isBusy()) return;
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
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
      options.setState(await context.application.deleteHistoryAsset(request.assetId));
      options.setSelectedHistoryAssetId("");
      if (options.getPage() === "history-detail" || options.getPage() === "image-history-detail") {
        if (options.getPage() === "image-history-detail") options.setHistoryKind("image");
        options.setHistoryScrollRestorePending(true);
        options.setPage("history");
      }
      options.notify(t(uiKeys.runtime.historyAssetDeleted, { title: request.title }));
    } else if (request.kind === "delete-image-version") {
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
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
      options.setState(await context.application.deleteHistoryVersion(request.assetId, request.versionId));
      options.setSelectedHistoryVersionId("");
      options.notify(t(uiKeys.runtime.historyVersionDeleted));
    }
    options.setRequest(null);
    options.setBusy(false);
    options.render();
    options.restoreModalFocus();
  } catch (error) {
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
