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
import { videoPromptForLoras } from "../../../core/video-loras";
import { formatFullHistoryTime, formatVideoDuration } from "../../shared/formatters";
import { modelName } from "../../shared/labels";

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
  toggleHistoryPlayerFullscreen(player: HTMLElement): void;
}

export interface HistoryContextMenus {
  openHistory(assetId: string, clientX: number, clientY: number, returnFocus?: HTMLElement): void;
  openImageHistory(projectId: string, clientX: number, clientY: number, returnFocus?: HTMLElement): void;
  openHistoryPlayer(
    assetId: string,
    versionId: string,
    clientX: number,
    clientY: number,
    player: HTMLElement,
    returnFocus?: HTMLElement
  ): void;
  close(): void;
}

export function createHistoryContextMenus(
  context: RendererContext,
  options: HistoryContextMenusOptions
): HistoryContextMenus {
  let menuElement: HTMLElement | null = null;
  let menuEvents: AbortController | null = null;
  let menuReturnFocus: HTMLElement | null = null;

  const close = (restoreFocus = true) => {
    const returnFocus = menuReturnFocus;
    menuReturnFocus = null;
    menuEvents?.abort();
    menuEvents = null;
    menuElement?.remove();
    menuElement = null;
    if (restoreFocus && returnFocus?.isConnected) returnFocus.focus();
  };

  const showMenu = (
    menu: HTMLElement,
    clientX: number,
    clientY: number,
    onAction: (action: string) => Promise<void> | void,
    actionSelector: string,
    returnFocus?: HTMLElement,
    focusSelector = "button[role=menuitem]",
    mountTarget: HTMLElement = document.body,
    presentation: "context" | "overlay" = "context"
  ) => {
    close(false);
    if (presentation === "context") {
      menu.style.left = `${clientX}px`;
      menu.style.top = `${clientY}px`;
    }
    mountTarget.append(menu);
    renderIcons(menu);
    menuElement = menu;
    const events = new AbortController();
    menuEvents = events;
    if (presentation === "context") {
      const rect = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(8, Math.min(clientX, window.innerWidth - rect.width - 8))}px`;
      menu.style.top = `${Math.max(8, Math.min(clientY, window.innerHeight - rect.height - 8))}px`;
    }
    menuReturnFocus = returnFocus ?? null;
    const menuItems = [...menu.querySelectorAll<HTMLButtonElement>(focusSelector)];
    const enabledMenuItems = menuItems.filter((item) => !item.disabled);
    const focusMenuItem = (index: number) => {
      if (!enabledMenuItems.length) return;
      const nextIndex = (index + enabledMenuItems.length) % enabledMenuItems.length;
      enabledMenuItems.forEach((item, itemIndex) => item.tabIndex = itemIndex === nextIndex ? 0 : -1);
      enabledMenuItems[nextIndex]?.focus();
    };
    focusMenuItem(0);
    menu.addEventListener("contextmenu", (event) => event.preventDefault(), { signal: events.signal });
    menu.addEventListener("click", async (event) => {
      if (presentation === "overlay" && event.target === menu) {
        close();
        return;
      }
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(actionSelector);
      if (!button || button.disabled) return;
      const action = button.dataset.historyAction ??
        button.dataset.imageHistoryAction ??
        button.dataset.historyPlayerAction ??
        (button.dataset.historyPlayerInfoClose !== undefined ? "close" : "");
      close();
      await onAction(action);
    }, { signal: events.signal });
    document.addEventListener("pointerdown", (event) => {
      if (!menu.contains(event.target as Node)) close();
    }, { capture: true, signal: events.signal });
    menu.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
      event.preventDefault();
      event.stopPropagation();
      const current = document.activeElement as HTMLButtonElement | null;
      const currentIndex = Math.max(0, enabledMenuItems.indexOf(current as HTMLButtonElement));
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? enabledMenuItems.length - 1
          : currentIndex + (event.key === "ArrowUp" ? -1 : 1);
      focusMenuItem(nextIndex);
    }, { signal: events.signal });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    }, { signal: events.signal });
    window.addEventListener("blur", () => close(), { signal: events.signal });
    window.addEventListener("resize", () => close(), { signal: events.signal });
    window.addEventListener("scroll", () => close(), { capture: true, signal: events.signal });
  };

  const isHistoryPlayerFullscreen = (player: HTMLElement): boolean => {
    const fullscreenElement = document.fullscreenElement;
    return fullscreenElement === player ||
      Boolean(fullscreenElement && player.contains(fullscreenElement));
  };

  const pauseHistoryPlayer = (player: HTMLElement): void => {
    player.querySelector<HTMLVideoElement>("video")?.pause();
  };

  const openVideoInfoPanel = (
    asset: HistoryAsset,
    version: AssetVersion,
    videoFile: AssetVersion["files"][number] | undefined,
    absolutePath: string,
    player: HTMLElement,
    returnFocus?: HTMLElement
  ): void => {
    const t = context.t;
    const title = asset.title.trim() || videoFile?.filename || asset.outputFilename;
    const filename = videoFile?.filename || asset.outputFilename || t(uiKeys.history.detail.fileNameNotSaved);
    const locale = context.getState()?.settings.uiLocale ?? "zh-CN";
    const versionNumber = Math.max(1, asset.versions.findIndex((item) => item.id === version.id) + 1);
    const hasFps = Number.isFinite(version.fps) && version.fps > 0;
    const hasDuration = Number.isFinite(version.duration) && version.duration >= 0;
    const frameCount = hasFps && hasDuration ? Math.round(version.duration * version.fps) : null;
    const resolution = version.width > 0 && version.height > 0
      ? `${version.width} × ${version.height}`
      : t(uiKeys.history.media.unknownResolution);
    const overlay = document.createElement("div");
    overlay.className = "history-player-info-overlay";
    overlay.setAttribute("data-history-player-info-overlay", "true");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", `${title} · ${t(uiKeys.history.menu.videoInfo)}`);
    overlay.setAttribute("noautohide", "");
    const info = document.createElement("section");
    info.className = "history-player-info-menu";
    info.innerHTML = `
      <div class="history-context-heading">
        <strong>${escapeHtml(t(uiKeys.history.menu.videoInfo))}</strong>
        <span title="${escapeHtml(title)}">${escapeHtml(title)}</span>
        <button type="button" class="history-player-info-close" data-history-player-info-close aria-label="${escapeHtml(t(uiKeys.history.menu.videoInfoClose))}">${icon("x")}</button>
      </div>
      <div class="history-player-info-grid">
        <div class="history-player-info-row"><span class="history-player-info-label">${escapeHtml(t(uiKeys.history.menu.videoInfoFileName))}</span><span class="history-player-info-value" title="${escapeHtml(filename)}">${escapeHtml(filename)}</span></div>
        <div class="history-player-info-row"><span class="history-player-info-label">${escapeHtml(t(uiKeys.history.page.videoVersions))}</span><span class="history-player-info-value">${escapeHtml(t(uiKeys.history.version, { version: versionNumber }))}</span></div>
        <div class="history-player-info-row"><span class="history-player-info-label">${escapeHtml(t(uiKeys.history.page.model))}</span><span class="history-player-info-value" title="${escapeHtml(modelName(version.modelId, locale))}">${escapeHtml(modelName(version.modelId, locale))}</span></div>
        <div class="history-player-info-row"><span class="history-player-info-label">${escapeHtml(t(uiKeys.history.page.resolution))}</span><span class="history-player-info-value">${escapeHtml(resolution)}</span></div>
        <div class="history-player-info-row"><span class="history-player-info-label">${escapeHtml(t(uiKeys.history.page.finalFps))}</span><span class="history-player-info-value">${hasFps ? `${version.fps} FPS` : escapeHtml(t(uiKeys.history.detail.legacyNotSaved))}</span></div>
        <div class="history-player-info-row"><span class="history-player-info-label">${escapeHtml(t(uiKeys.history.page.videoDuration))}</span><span class="history-player-info-value">${hasDuration ? `${formatVideoDuration(version.duration)} · ${version.duration} ${escapeHtml(t(uiKeys.history.detail.seconds))}` : escapeHtml(t(uiKeys.history.detail.legacyNotSaved))}</span></div>
        <div class="history-player-info-row"><span class="history-player-info-label">${escapeHtml(t(uiKeys.history.page.finalFrames))}</span><span class="history-player-info-value">${frameCount == null ? escapeHtml(t(uiKeys.history.detail.legacyNotSaved)) : `${frameCount} ${escapeHtml(t(uiKeys.history.detail.frames))}`}</span></div>
        <div class="history-player-info-row"><span class="history-player-info-label">${escapeHtml(t(uiKeys.history.page.generatedAt))}</span><span class="history-player-info-value">${escapeHtml(formatFullHistoryTime(version.createdAt))}</span></div>
        <div class="history-player-info-row history-player-info-path-row"><span class="history-player-info-label history-player-info-path-label">${escapeHtml(t(uiKeys.history.menu.videoInfoFilePath))}</span><span class="history-player-info-value history-player-info-path-value" title="${escapeHtml(absolutePath)}">${escapeHtml(absolutePath || t(uiKeys.history.page.currentFileUnavailable))}</span></div>
      </div>`;
    overlay.append(info);
    const mountTarget = isHistoryPlayerFullscreen(player) ? player : document.body;
    showMenu(
      overlay,
      0,
      0,
      () => undefined,
      "[data-history-player-info-close]",
      returnFocus,
      "[data-history-player-info-close]",
      mountTarget,
      "overlay"
    );
  };

  const openHistory = (assetId: string, clientX: number, clientY: number, returnFocus?: HTMLElement) => {
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
        const shown = await context.hostCapabilities.showItemInFolder(absolutePath);
        if (!shown) context.notify(t(uiKeys.history.menu.videoMissing), { renderPage: false });
      } else if (action === "copy-prompt") {
        await options.copyHistoryText(
          videoPromptForLoras(asset.prompt, version.videoLoras ?? asset.videoLoras),
          t(uiKeys.history.menu.promptCopied)
        );
      } else if (action === "delete") {
        options.requestHistoryDeletion(assetId);
      }
    }, "[data-history-action]", returnFocus);
  };

  const openImageHistory = (projectId: string, clientX: number, clientY: number, returnFocus?: HTMLElement) => {
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
        const shown = await context.hostCapabilities.showItemInFolder(absolutePath);
        if (!shown) context.notify(t(uiKeys.history.menu.imageMissing), { renderPage: false });
      } else if (action === "copy-prompt") {
        await options.copyHistoryText(version.prompt, t(uiKeys.history.menu.promptCopied));
      } else if (action === "delete") {
        options.requestHistoryDeletion(projectId);
      }
    }, "[data-image-history-action]", returnFocus);
  };

  const openHistoryPlayer = (
    assetId: string,
    versionId: string,
    clientX: number,
    clientY: number,
    player: HTMLElement,
    returnFocus?: HTMLElement
  ): void => {
    const t = context.t;
    const asset = options.getState()?.history.find((item) => item.id === assetId);
    if (!asset) return;
    const version = asset.versions.find((item) => item.id === versionId) ?? preferredVersion(asset);
    const videoIndex = versionVideoIndex(version);
    const videoFile = videoIndex >= 0 ? version.files[videoIndex] : undefined;
    const absolutePath = videoFile?.absolutePath ?? "";
    const title = asset.title.trim() || videoFile?.filename || asset.outputFilename;
    const fullscreen = isHistoryPlayerFullscreen(player);
    const menu = document.createElement("section");
    menu.className = "history-context-menu history-player-context-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", `${escapeHtml(title)} · ${escapeHtml(t(uiKeys.history.menu.shortcutActions))}`);
    menu.innerHTML = `
      <button role="menuitem" data-history-player-action="copy-file" ${absolutePath ? "" : "disabled"}><span class="context-icon">${icon("copy")}</span><span><strong>${escapeHtml(t(uiKeys.history.menu.copyFile))}</strong></span></button>
      <button role="menuitem" data-history-player-action="show-file" ${absolutePath ? "" : "disabled"}><span class="context-icon">${icon("folder-open")}</span><span><strong>${escapeHtml(t(uiKeys.history.menu.openFolder))}</strong></span></button>
      <button role="menuitem" data-history-player-action="open-system-player" ${absolutePath ? "" : "disabled"}><span class="context-icon">${icon("monitor")}</span><span><strong>${escapeHtml(t(uiKeys.history.menu.openSystemPlayer))}</strong></span></button>
      <button role="menuitem" data-history-player-action="video-info"><span class="context-icon">${icon("info")}</span><span><strong>${escapeHtml(t(uiKeys.history.menu.videoInfo))}</strong></span></button>
      <div class="history-context-separator" role="separator"></div>
      <button role="menuitem" data-history-player-action="fullscreen"><span class="context-icon">${icon(fullscreen ? "minimize-2" : "maximize-2")}</span><span><strong>${escapeHtml(t(fullscreen ? uiKeys.history.menu.exitFullscreen : uiKeys.history.menu.fullscreen))}</strong></span></button>`;
    const mountTarget = fullscreen ? player : document.body;
    showMenu(menu, clientX, clientY, async (action) => {
      if (action === "copy-file") {
        await options.copyHistoryFile(absolutePath, t(uiKeys.history.menu.videoFileCopied));
      } else if (action === "show-file") {
        const shown = await context.hostCapabilities.showItemInFolder(absolutePath);
        if (!shown) context.notify(t(uiKeys.history.menu.videoMissing), { renderPage: false });
      } else if (action === "open-system-player") {
        pauseHistoryPlayer(player);
        try {
          const result = await context.hostCapabilities.openSystemPlayer(absolutePath);
          if (!result.ok) context.notify(result.message || t(uiKeys.history.menu.videoMissing), { renderPage: false });
        } catch {
          context.notify(t(uiKeys.history.menu.videoMissing), { renderPage: false });
        }
      } else if (action === "video-info") {
        openVideoInfoPanel(asset, version, videoFile, absolutePath, player, returnFocus);
      } else if (action === "fullscreen") {
        options.toggleHistoryPlayerFullscreen(player);
      }
    }, "[data-history-player-action]", returnFocus, "button[role=menuitem]", mountTarget);
  };

  return { openHistory, openImageHistory, openHistoryPlayer, close };
}
