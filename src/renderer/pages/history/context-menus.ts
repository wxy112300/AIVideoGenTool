import type {
  AppState,
  AssetVersion,
  HistoryAsset,
  ImageAssetVersion,
  ImageHistoryProject
} from "../../../types";
import { escapeHtml } from "../../shared/dom";
import { icon, renderIcons } from "../../shared/icons";
import type { RendererContext } from "../../contracts";
import {
  imageHistoryMediaUrl,
  preferredImageVersion,
  preferredVersion,
  versionVideoIndex
} from "./helpers";
import { isRetiredVideoModel } from "../../../core/workflow";
import { uiKeys } from "../../../core/i18n-keys";

export interface HistoryContextMenusOptions {
  getState(): AppState | undefined;
  openHistoryDetail(assetId: string): void;
  editHistoryAsset(assetId: string): Promise<void>;
  openImageHistoryDetail(projectId: string): void;
  continueImageEdit(project: ImageHistoryProject, version: ImageAssetVersion): Promise<void>;
  continueImageToVideo(project: ImageHistoryProject, version: ImageAssetVersion): Promise<void>;
  copyHistoryFile(filename: string, successMessage?: string): Promise<void>;
  copyHistoryText(value: string, successMessage: string): Promise<void>;
  requestHistoryDeletion(assetId: string): void;
}

export interface HistoryContextMenus {
  openHistory(assetId: string, clientX: number, clientY: number): void;
  openImageHistory(projectId: string, clientX: number, clientY: number): void;
  close(): void;
}

export function createHistoryContextMenus(
  context: RendererContext,
  options: HistoryContextMenusOptions
): HistoryContextMenus {
  let menuElement: HTMLElement | null = null;
  let menuEvents: AbortController | null = null;

  const close = () => {
    menuEvents?.abort();
    menuEvents = null;
    menuElement?.remove();
    menuElement = null;
  };

  const showMenu = (
    menu: HTMLElement,
    clientX: number,
    clientY: number,
    onAction: (action: string) => Promise<void> | void,
    actionSelector: string
  ) => {
    close();
    menu.style.left = `${clientX}px`;
    menu.style.top = `${clientY}px`;
    document.body.append(menu);
    renderIcons(menu);
    menuElement = menu;
    const events = new AbortController();
    menuEvents = events;
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(clientX, window.innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(clientY, window.innerHeight - rect.height - 8))}px`;
    menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    menu.addEventListener("contextmenu", (event) => event.preventDefault(), { signal: events.signal });
    menu.addEventListener("click", async (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(actionSelector);
      if (!button || button.disabled) return;
      const action = button.dataset.historyAction ?? button.dataset.imageHistoryAction ?? "";
      close();
      await onAction(action);
    }, { signal: events.signal });
    document.addEventListener("pointerdown", (event) => {
      if (!menu.contains(event.target as Node)) close();
    }, { capture: true, signal: events.signal });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    }, { signal: events.signal });
    window.addEventListener("blur", close, { signal: events.signal });
    window.addEventListener("resize", close, { signal: events.signal });
    window.addEventListener("scroll", close, { capture: true, signal: events.signal });
  };

  const openHistory = (assetId: string, clientX: number, clientY: number) => {
    const t = context.t;
    const asset = options.getState()?.history.find((item) => item.id === assetId);
    if (!asset) return;
    const version = preferredVersion(asset);
    const retiredModel = isRetiredVideoModel(asset.modelId);
    const videoIndex = versionVideoIndex(version);
    const videoFile = videoIndex >= 0 ? version.files[videoIndex] : undefined;
    const absolutePath = videoFile?.absolutePath ?? "";
    const menu = document.createElement("section");
    menu.className = "history-context-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", `${asset.title} ${t(uiKeys.history.menu.shortcutActions)}`);
    menu.innerHTML = `
      <div class="history-context-heading"><strong>${escapeHtml(asset.title)}</strong><span>${escapeHtml(videoFile?.filename ?? asset.outputFilename)}</span></div>
      <button role="menuitem" data-history-action="detail"><span class="context-icon">${icon("external-link")}</span><span><strong>${t(uiKeys.history.menu.detail)}</strong><small>${t(uiKeys.history.menu.detailVideoDescription)}</small></span><kbd>Enter</kbd></button>
      ${retiredModel ? "" : `<button role="menuitem" data-history-action="edit"><span class="context-icon">${icon("sparkles")}</span><span><strong>${t(uiKeys.history.menu.useParams)}</strong><small>${t(uiKeys.history.menu.useParamsDescription)}</small></span></button>`}
      <div class="history-context-separator" role="separator"></div>
      <button role="menuitem" data-history-action="copy-file" ${absolutePath ? "" : "disabled"}><span class="context-icon">${icon("copy")}</span><span><strong>${t(uiKeys.history.menu.copyFile)}</strong><small>${absolutePath ? t(uiKeys.history.menu.copyVideoFileDescription) : t(uiKeys.history.menu.noFile)}</small></span></button>
      <button role="menuitem" data-history-action="copy-path" ${absolutePath ? "" : "disabled"}><span class="context-icon">${icon("copy")}</span><span><strong>${t(uiKeys.history.menu.copyPath)}</strong><small>${absolutePath ? t(uiKeys.history.menu.copyVideoPathDescription) : t(uiKeys.history.menu.noFile)}</small></span></button>
      <button role="menuitem" data-history-action="show-file" ${absolutePath ? "" : "disabled"}><span class="context-icon">${icon("folder-open")}</span><span><strong>${t(uiKeys.history.menu.openFolder)}</strong><small>${t(uiKeys.history.menu.locateVideo)}</small></span></button>
      <button role="menuitem" data-history-action="copy-prompt"><span class="context-icon">${icon("file-text")}</span><span><strong>${t(uiKeys.history.menu.copyPrompt)}</strong><small>${t(uiKeys.history.menu.actualPromptDescription)}</small></span></button>
      <div class="history-context-separator" role="separator"></div>
      <button class="danger" role="menuitem" data-history-action="delete"><span class="context-icon">${icon("trash-2")}</span><span><strong>${t(uiKeys.history.menu.deleteVideoRecord)}</strong><small>${t(uiKeys.history.menu.confirmBeforeAction)}</small></span></button>`;
    showMenu(menu, clientX, clientY, async (action) => {
      if (action === "detail") options.openHistoryDetail(assetId);
      else if (action === "edit") await options.editHistoryAsset(assetId);
      else if (action === "copy-file") await options.copyHistoryFile(absolutePath);
      else if (action === "copy-path") await options.copyHistoryText(absolutePath, t(uiKeys.history.menu.videoPathCopied));
      else if (action === "show-file") {
        const shown = await context.studio.showItemInFolder(absolutePath);
        if (!shown) context.notify(t(uiKeys.history.menu.videoMissing), { renderPage: false });
      } else if (action === "copy-prompt") {
        await options.copyHistoryText(asset.prompt, t(uiKeys.history.menu.promptCopied));
      } else if (action === "delete") {
        options.requestHistoryDeletion(assetId);
      }
    }, "[data-history-action]");
  };

  const openImageHistory = (projectId: string, clientX: number, clientY: number) => {
    const t = context.t;
    const project = options.getState()?.imageHistory.find((item) => item.id === projectId);
    if (!project) return;
    const version = preferredImageVersion(project);
    const absolutePath = version.file.absolutePath ?? "";
    const title = project.title.trim() || t(uiKeys.history.card.untitledImage);
    const menu = document.createElement("section");
    menu.className = "history-context-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", `${title} ${t(uiKeys.history.menu.shortcutActions)}`);
    menu.innerHTML = `
      <div class="history-context-heading"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(version.file.filename)}</span></div>
      <button role="menuitem" data-image-history-action="detail"><span class="context-icon">${icon("external-link")}</span><span><strong>${t(uiKeys.history.menu.detail)}</strong><small>${t(uiKeys.history.menu.imageDetailDescription)}</small></span><kbd>Enter</kbd></button>
      <button role="menuitem" data-image-history-action="edit"><span class="context-icon">${icon("wand-sparkles")}</span><span><strong>${t(uiKeys.history.menu.continueEdit)}</strong><small>${t(uiKeys.history.menu.continueEditDescription)}</small></span></button>
      <button role="menuitem" data-image-history-action="video"><span class="context-icon">${icon("video")}</span><span><strong>${t(uiKeys.history.menu.startVideo)}</strong><small>${t(uiKeys.history.menu.startVideoDescription)}</small></span></button>
      <div class="history-context-separator" role="separator"></div>
      <button role="menuitem" data-image-history-action="copy-file" ${absolutePath ? "" : "disabled"}><span class="context-icon">${icon("copy")}</span><span><strong>${t(uiKeys.history.menu.copyFile)}</strong><small>${absolutePath ? t(uiKeys.history.menu.copyImageFileDescription) : t(uiKeys.history.menu.noFile)}</small></span></button>
      <button role="menuitem" data-image-history-action="copy-path" ${absolutePath ? "" : "disabled"}><span class="context-icon">${icon("copy")}</span><span><strong>${t(uiKeys.history.menu.copyPath)}</strong><small>${absolutePath ? t(uiKeys.history.menu.copyImagePathDescription) : t(uiKeys.history.menu.noFile)}</small></span></button>
      <button role="menuitem" data-image-history-action="show-file" ${absolutePath ? "" : "disabled"}><span class="context-icon">${icon("folder-open")}</span><span><strong>${t(uiKeys.history.menu.openFolder)}</strong><small>${t(uiKeys.history.menu.locateImage)}</small></span></button>
      <button role="menuitem" data-image-history-action="copy-prompt" ${version.prompt ? "" : "disabled"}><span class="context-icon">${icon("file-text")}</span><span><strong>${t(uiKeys.history.menu.copyPrompt)}</strong><small>${version.prompt ? t(uiKeys.history.menu.imagePromptDescription) : t(uiKeys.history.menu.originalNoPrompt)}</small></span></button>
      <div class="history-context-separator" role="separator"></div>
      <button class="danger" role="menuitem" data-image-history-action="delete"><span class="context-icon">${icon("trash-2")}</span><span><strong>${t(uiKeys.history.menu.deleteImageProject)}</strong><small>${t(uiKeys.history.menu.confirmBeforeAction)}</small></span></button>`;
    showMenu(menu, clientX, clientY, async (action) => {
      if (action === "detail") options.openImageHistoryDetail(projectId);
      else if (action === "edit") await options.continueImageEdit(project, version);
      else if (action === "video") await options.continueImageToVideo(project, version);
      else if (action === "copy-file") await options.copyHistoryFile(absolutePath, t(uiKeys.history.menu.imageFileCopied));
      else if (action === "copy-path") await options.copyHistoryText(absolutePath, t(uiKeys.history.menu.imagePathCopied));
      else if (action === "show-file") {
        const shown = await context.studio.showItemInFolder(absolutePath);
        if (!shown) context.notify(t(uiKeys.history.menu.imageMissing), { renderPage: false });
      } else if (action === "copy-prompt") {
        await options.copyHistoryText(version.prompt, t(uiKeys.history.menu.promptCopied));
      } else if (action === "delete") {
        options.requestHistoryDeletion(projectId);
      }
    }, "[data-image-history-action]");
  };

  return { openHistory, openImageHistory, close };
}
