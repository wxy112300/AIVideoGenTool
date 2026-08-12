import type { AppState } from "../../../types";
import { uiKeys } from "../../../core/i18n-keys";
import { videoPromptForLoras } from "../../../core/video-loras";
import type { RendererCleanup, RendererContext } from "../../contracts";

export interface HistoryActionsControllerOptions {
  setState(nextState: AppState): void;
  getSelectedHistoryAssetId(): string;
  getSelectedHistoryVersionId(): string;
  openUpscaleDialog(): void;
  requestHistoryDeletion(assetId: string): void;
  requestImageVersionDeletion(projectId: string, versionId: string): void;
  copyHistoryText(value: string, successMessage: string): Promise<void>;
  copyHistoryFile(filename: string): Promise<void>;
  copyHistoryImage(filename: string): Promise<void>;
  editHistoryAsset(assetId: string): Promise<void>;
  continueVideoHistory(assetId: string, versionId: string): Promise<void>;
  continueImageEdit(projectId: string, versionId: string): Promise<void>;
  continueImageToVideo(projectId: string, versionId: string): Promise<void>;
}

function stopAction(event: Event): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}

export function mountHistoryActionsController(
  context: RendererContext,
  options: HistoryActionsControllerOptions
): RendererCleanup {
  const events = new AbortController();
  const signal = events.signal;
  const root = context.root;
  const t = context.t;

  root.querySelector("[data-open-upscale]")?.addEventListener("click", (event) => {
    stopAction(event);
    options.openUpscaleDialog();
  }, { signal });

  root.querySelectorAll<HTMLElement>("[data-delete-history]").forEach((button) => {
    button.addEventListener("click", (event) => {
      stopAction(event);
      const assetId = button.dataset.deleteHistory;
      if (assetId) options.requestHistoryDeletion(assetId);
    }, { signal });
  });

  root.querySelector("[data-copy-prompt]")?.addEventListener("click", async (event) => {
    stopAction(event);
    const asset = context.getState()?.history.find(
      (item) => item.id === options.getSelectedHistoryAssetId()
    );
    if (asset) {
      const version = asset.versions.find((item) => item.id === options.getSelectedHistoryVersionId());
      await options.copyHistoryText(
        videoPromptForLoras(asset.prompt, version?.videoLoras ?? asset.videoLoras),
        t(uiKeys.history.menu.promptCopied)
      );
    }
  }, { signal });

  root.querySelector("[data-copy-image-prompt]")?.addEventListener("click", async (event) => {
    stopAction(event);
    const selectedId = options.getSelectedHistoryAssetId();
    const project = context.getState()?.imageHistory.find((item) => item.id === selectedId);
    const versionId = options.getSelectedHistoryVersionId();
    const version = project?.versions.find((item) => item.id === versionId);
    if (!version?.prompt) {
      context.notify(t(uiKeys.history.menu.originalNoPrompt), { renderPage: false });
      return;
    }
    await options.copyHistoryText(version.prompt, t(uiKeys.history.menu.promptCopied));
  }, { signal });

  root.querySelectorAll<HTMLElement>("[data-image-continue-edit-project]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      stopAction(event);
      const projectId = button.dataset.imageContinueEditProject;
      const versionId = button.dataset.imageContinueEditVersion;
      if (projectId && versionId) await options.continueImageEdit(projectId, versionId);
    }, { signal });
  });

  root.querySelectorAll<HTMLElement>("[data-image-continue-video-project]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      stopAction(event);
      const projectId = button.dataset.imageContinueVideoProject;
      const versionId = button.dataset.imageContinueVideoVersion;
      if (projectId && versionId) await options.continueImageToVideo(projectId, versionId);
    }, { signal });
  });

  root.querySelector<HTMLButtonElement>("[data-image-set-cover]")?.addEventListener("click", async (event) => {
    stopAction(event);
    const button = event.currentTarget as HTMLButtonElement;
    const projectId = button.dataset.imageSetCover;
    if (!projectId) return;
    try {
      options.setState(await context.studio.setImageHistoryCover(
        projectId,
        button.dataset.imageCoverVersion || undefined
      ));
      context.notify(
        button.dataset.imageCoverVersion ? t(uiKeys.history.actions.coverSet) : t(uiKeys.history.actions.autoCoverRestored),
        { renderPage: false }
      );
      context.requestRender();
    } catch (error) {
      context.notify(error instanceof Error ? error.message : t(uiKeys.history.actions.coverUpdateFailed), { renderPage: false, kind: "error" });
    }
  }, { signal });

  root.querySelectorAll<HTMLElement>("[data-edit-history]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      stopAction(event);
      const assetId = button.dataset.editHistory;
      if (assetId) await options.editHistoryAsset(assetId);
    }, { signal });
  });

  root.querySelectorAll<HTMLElement>("[data-continue-history]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      stopAction(event);
      const assetId = button.dataset.continueHistory;
      const versionId = button.dataset.sourceVersion;
      if (assetId && versionId) await options.continueVideoHistory(assetId, versionId);
    }, { signal });
  });

  root.querySelectorAll<HTMLElement>("[data-show-file]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      stopAction(event);
      const filename = button.dataset.showFile;
      if (!filename) return;
      context.reportUserAction("history-show-file");
      const shown = await context.studio.showItemInFolder(filename);
      if (!shown) context.notify(t(uiKeys.history.actions.fileMissing), { renderPage: false });
    }, { signal });
  });

  root.querySelectorAll<HTMLElement>("[data-copy-file]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      stopAction(event);
      const filename = button.dataset.copyFile;
      if (!filename) return;
      context.reportUserAction("history-copy-file");
      await options.copyHistoryFile(filename);
    }, { signal });
  });

  root.querySelectorAll<HTMLElement>("[data-copy-image]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      stopAction(event);
      const filename = button.dataset.copyImage;
      if (!filename) return;
      context.reportUserAction("image-history-copy-image");
      await options.copyHistoryImage(filename);
    }, { signal });
  });

  root.querySelectorAll<HTMLElement>("[data-delete-image-version]").forEach((button) => {
    button.addEventListener("click", (event) => {
      stopAction(event);
      if (button.hasAttribute("disabled")) return;
      const projectId = button.dataset.deleteImageVersion;
      const versionId = button.dataset.imageVersionDeleteId;
      if (projectId && versionId) options.requestImageVersionDeletion(projectId, versionId);
    }, { signal });
  });

  return () => events.abort();
}
