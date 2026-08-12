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
    menu.setAttribute("aria-label", `${asset.title} 快捷操作`);
    menu.innerHTML = `
      <div class="history-context-heading"><strong>${escapeHtml(asset.title)}</strong><span>${escapeHtml(videoFile?.filename ?? asset.outputFilename)}</span></div>
      <button role="menuitem" data-history-action="detail"><span class="context-icon">${icon("external-link")}</span><span><strong>查看详情</strong><small>播放视频并查看生成参数</small></span><kbd>Enter</kbd></button>
      ${retiredModel ? "" : `<button role="menuitem" data-history-action="edit"><span class="context-icon">${icon("sparkles")}</span><span><strong>使用此参数再创建</strong><small>带入提示词、模型和 Seed</small></span></button>`}
      <div class="history-context-separator" role="separator"></div>
      <button role="menuitem" data-history-action="copy-file" ${absolutePath ? "" : "disabled"}><span class="context-icon">${icon("copy")}</span><span><strong>复制文件</strong><small>${absolutePath ? "复制视频文件，可在资源管理器中粘贴" : "当前记录没有可用文件"}</small></span></button>
      <button role="menuitem" data-history-action="copy-path" ${absolutePath ? "" : "disabled"}><span class="context-icon">${icon("copy")}</span><span><strong>复制文件路径</strong><small>${absolutePath ? "复制完整视频文件路径" : "当前记录没有可用文件"}</small></span></button>
      <button role="menuitem" data-history-action="show-file" ${absolutePath ? "" : "disabled"}><span class="context-icon">${icon("folder-open")}</span><span><strong>打开所在目录</strong><small>在 Explorer 中定位视频</small></span></button>
      <button role="menuitem" data-history-action="copy-prompt"><span class="context-icon">${icon("file-text")}</span><span><strong>复制提示词</strong><small>复制实际送入模型的文本</small></span></button>
      <div class="history-context-separator" role="separator"></div>
      <button class="danger" role="menuitem" data-history-action="delete"><span class="context-icon">${icon("trash-2")}</span><span><strong>删除视频和记录</strong><small>操作前仍会要求确认</small></span></button>`;
    showMenu(menu, clientX, clientY, async (action) => {
      if (action === "detail") options.openHistoryDetail(assetId);
      else if (action === "edit") await options.editHistoryAsset(assetId);
      else if (action === "copy-file") await options.copyHistoryFile(absolutePath);
      else if (action === "copy-path") await options.copyHistoryText(absolutePath, "视频文件路径已复制。");
      else if (action === "show-file") {
        const shown = await context.studio.showItemInFolder(absolutePath);
        if (!shown) context.notify("视频文件不存在或已经被移动。", { renderPage: false });
      } else if (action === "copy-prompt") {
        await options.copyHistoryText(asset.prompt, "提示词已复制。");
      } else if (action === "delete") {
        options.requestHistoryDeletion(assetId);
      }
    }, "[data-history-action]");
  };

  const openImageHistory = (projectId: string, clientX: number, clientY: number) => {
    const project = options.getState()?.imageHistory.find((item) => item.id === projectId);
    if (!project) return;
    const version = preferredImageVersion(project);
    const absolutePath = version.file.absolutePath ?? "";
    const title = project.title.trim() || "未命名图片";
    const menu = document.createElement("section");
    menu.className = "history-context-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", `${title} 快捷操作`);
    menu.innerHTML = `
      <div class="history-context-heading"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(version.file.filename)}</span></div>
      <button role="menuitem" data-image-history-action="detail"><span class="context-icon">${icon("external-link")}</span><span><strong>查看详情</strong><small>查看版本、Prompt 和项目谱系</small></span><kbd>Enter</kbd></button>
      <button role="menuitem" data-image-history-action="edit"><span class="context-icon">${icon("wand-sparkles")}</span><span><strong>继续编辑图片</strong><small>以当前版本作为下一轮编辑基础</small></span></button>
      <button role="menuitem" data-image-history-action="video"><span class="context-icon">${icon("video")}</span><span><strong>开始创作视频</strong><small>把当前图片放入视频首帧</small></span></button>
      <div class="history-context-separator" role="separator"></div>
      <button role="menuitem" data-image-history-action="copy-file" ${absolutePath ? "" : "disabled"}><span class="context-icon">${icon("copy")}</span><span><strong>复制文件</strong><small>${absolutePath ? "复制图片文件，可在资源管理器中粘贴" : "当前记录没有可用文件"}</small></span></button>
      <button role="menuitem" data-image-history-action="copy-path" ${absolutePath ? "" : "disabled"}><span class="context-icon">${icon("copy")}</span><span><strong>复制文件路径</strong><small>${absolutePath ? "复制完整图片文件路径" : "当前记录没有可用文件"}</small></span></button>
      <button role="menuitem" data-image-history-action="show-file" ${absolutePath ? "" : "disabled"}><span class="context-icon">${icon("folder-open")}</span><span><strong>打开所在目录</strong><small>在 Explorer 中定位图片</small></span></button>
      <button role="menuitem" data-image-history-action="copy-prompt" ${version.prompt ? "" : "disabled"}><span class="context-icon">${icon("file-text")}</span><span><strong>复制 Prompt</strong><small>${version.prompt ? "复制当前版本的编辑要求" : "原始图片没有 Prompt"}</small></span></button>
      <div class="history-context-separator" role="separator"></div>
      <button class="danger" role="menuitem" data-image-history-action="delete"><span class="context-icon">${icon("trash-2")}</span><span><strong>删除图片项目</strong><small>操作前仍会要求确认</small></span></button>`;
    showMenu(menu, clientX, clientY, async (action) => {
      if (action === "detail") options.openImageHistoryDetail(projectId);
      else if (action === "edit") await options.continueImageEdit(project, version);
      else if (action === "video") await options.continueImageToVideo(project, version);
      else if (action === "copy-file") await options.copyHistoryFile(absolutePath, "图片文件已复制。");
      else if (action === "copy-path") await options.copyHistoryText(absolutePath, "图片文件路径已复制。");
      else if (action === "show-file") {
        const shown = await context.studio.showItemInFolder(absolutePath);
        if (!shown) context.notify("图片文件不存在或已经被移动。", { renderPage: false });
      } else if (action === "copy-prompt") {
        await options.copyHistoryText(version.prompt, "Prompt 已复制。");
      } else if (action === "delete") {
        options.requestHistoryDeletion(projectId);
      }
    }, "[data-image-history-action]");
  };

  return { openHistory, openImageHistory, close };
}
