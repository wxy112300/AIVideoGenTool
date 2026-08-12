import type { AppState, Settings } from "../../types";
import type { Page, RendererContext } from "../contracts";
import { createClearedDraft } from "../../core/draft-defaults";
import { uiKeys } from "../../core/i18n-keys";

export type ConfirmationRequest =
  | { kind: "clear-draft" }
  | { kind: "delete-history"; assetId: string; title: string }
  | { kind: "delete-image-version"; projectId: string; versionId: string; title: string }
  | { kind: "remove-queue-task"; taskId: string; title: string }
  | { kind: "cancel-queue-task"; taskId: string; title: string }
  | { kind: "discard-settings"; nextPage: Page }
  | { kind: "force-stop-comfy" };

export interface ConfirmationServiceOptions {
  getRequest(): ConfirmationRequest | null;
  setRequest(request: ConfirmationRequest | null): void;
  setBusy(value: boolean): void;
  isBusy(): boolean;
  getState(): AppState;
  setState(nextState: AppState): void;
  getFormSettings(): Settings;
  clearDraftSaveTimer(): void;
  setDraftDirty(value: boolean): void;
  bumpDraftRevision(): void;
  setServiceForceStopping(value: boolean): void;
  setServiceStatusMessage(message: string): void;
  scanEnvironment(settings: Settings): Promise<void>;
  setSettingsDraft(settings: Settings | null): void;
  setPage(page: Page): void;
  setHistoryKind(kind: "video" | "image"): void;
  setSelectedHistoryAssetId(assetId: string): void;
  setSelectedHistoryVersionId(versionId: string): void;
  clearImageHistoryThumbnailCache(): void;
  setQueueActionBusy(value: { taskId: string; action: "remove" | "cancel" } | null): void;
  releaseHistoryVideo(assetId: string): void;
  rememberModalFocus(): void;
  restoreModalFocus(): void;
  render(): void;
  notify(message: string): void;
  getPage(): Page;
}

export async function acceptConfirmation(
  context: RendererContext,
  options: ConfirmationServiceOptions
): Promise<void> {
  const request = options.getRequest();
  const t = context.t;
  if (!request || options.isBusy()) return;
  options.setBusy(true);
  const acceptButton = context.root.querySelector<HTMLButtonElement>("#accept-confirmation");
  const cancelButton = context.root.querySelector<HTMLButtonElement>("#cancel-confirmation");
  if (acceptButton) {
    acceptButton.disabled = true;
    acceptButton.textContent = t(uiKeys.dialog.processing);
  }
  if (cancelButton) cancelButton.disabled = true;
  try {
    if (request.kind === "clear-draft") {
      options.clearDraftSaveTimer();
      options.bumpDraftRevision();
      options.setDraftDirty(false);
      options.setState(await context.studio.saveDraft(
        createClearedDraft(options.getState().draft)
      ));
    } else if (request.kind === "force-stop-comfy") {
      options.setServiceForceStopping(true);
      options.setServiceStatusMessage(t(uiKeys.runtime.forceStopStatus));
      const settings = options.getFormSettings();
      const result = await context.studio.forceStopComfyProcesses(settings);
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
    } else if (request.kind === "remove-queue-task") {
      options.setQueueActionBusy({ taskId: request.taskId, action: "remove" });
      options.setState(await context.studio.removeTask(request.taskId));
      options.setQueueActionBusy(null);
    } else if (request.kind === "cancel-queue-task") {
      options.setQueueActionBusy({ taskId: request.taskId, action: "cancel" });
      options.setState(await context.studio.cancelTask(request.taskId));
      options.setQueueActionBusy(null);
    } else if (request.kind === "discard-settings") {
      options.setSettingsDraft(null);
      void context.studio.setSettingsDirty(false).catch(() => undefined);
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
      options.setState(await context.studio.deleteHistoryAsset(request.assetId));
      options.setSelectedHistoryAssetId("");
      if (options.getPage() === "history-detail" || options.getPage() === "image-history-detail") {
        if (options.getPage() === "image-history-detail") options.setHistoryKind("image");
        options.setPage("history");
      }
    } else if (request.kind === "delete-image-version") {
      options.setState(await context.studio.deleteImageHistoryVersion(request.projectId, request.versionId));
      options.clearImageHistoryThumbnailCache();
      options.setSelectedHistoryVersionId("");
      const remainingProject = options.getState().imageHistory.find((item) => item.id === request.projectId);
      if (!remainingProject) {
        options.setSelectedHistoryAssetId("");
        options.setHistoryKind("image");
        options.setPage("history");
      }
      options.notify(t(uiKeys.runtime.imageVersionDeleted));
    }
    options.setRequest(null);
    options.setBusy(false);
    options.render();
    options.restoreModalFocus();
  } catch (error) {
    options.setQueueActionBusy(null);
    if (request.kind === "force-stop-comfy") options.setServiceForceStopping(false);
    options.setBusy(false);
    options.notify(error instanceof Error ? error.message : String(error));
  }
}
