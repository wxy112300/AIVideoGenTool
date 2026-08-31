import { escapeHtml } from "../../shared/dom";
import { icon, renderIcons } from "../../shared/icons";
import { preferredImageVersion, preferredVersion, versionVideoIndex } from "./helpers";
import { isRetiredVideoModel } from "../../../core/workflow";
import { uiKeys } from "../../../core/i18n-keys";
import { videoPromptForLoras } from "../../../core/video-loras";
export function createHistoryContextMenus(context, options) {
    let menuElement = null;
    let menuEvents = null;
    let menuReturnFocus = null;
    const close = (restoreFocus = true) => {
        const returnFocus = menuReturnFocus;
        menuReturnFocus = null;
        menuEvents?.abort();
        menuEvents = null;
        menuElement?.remove();
        menuElement = null;
        if (restoreFocus && returnFocus?.isConnected)
            returnFocus.focus();
    };
    const showMenu = (menu, clientX, clientY, onAction, actionSelector, returnFocus) => {
        close(false);
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
        menuReturnFocus = returnFocus ?? null;
        const menuItems = [...menu.querySelectorAll("button[role=menuitem]")];
        const enabledMenuItems = menuItems.filter((item) => !item.disabled);
        const focusMenuItem = (index) => {
            if (!enabledMenuItems.length)
                return;
            const nextIndex = (index + enabledMenuItems.length) % enabledMenuItems.length;
            enabledMenuItems.forEach((item, itemIndex) => item.tabIndex = itemIndex === nextIndex ? 0 : -1);
            enabledMenuItems[nextIndex]?.focus();
        };
        focusMenuItem(0);
        menu.addEventListener("contextmenu", (event) => event.preventDefault(), { signal: events.signal });
        menu.addEventListener("click", async (event) => {
            const button = event.target.closest(actionSelector);
            if (!button || button.disabled)
                return;
            const action = button.dataset.historyAction ?? button.dataset.imageHistoryAction ?? "";
            close();
            await onAction(action);
        }, { signal: events.signal });
        document.addEventListener("pointerdown", (event) => {
            if (!menu.contains(event.target))
                close();
        }, { capture: true, signal: events.signal });
        menu.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                close();
                return;
            }
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End")
                return;
            event.preventDefault();
            event.stopPropagation();
            const current = document.activeElement;
            const currentIndex = Math.max(0, enabledMenuItems.indexOf(current));
            const nextIndex = event.key === "Home"
                ? 0
                : event.key === "End"
                    ? enabledMenuItems.length - 1
                    : currentIndex + (event.key === "ArrowUp" ? -1 : 1);
            focusMenuItem(nextIndex);
        }, { signal: events.signal });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape")
                close();
        }, { signal: events.signal });
        window.addEventListener("blur", () => close(), { signal: events.signal });
        window.addEventListener("resize", () => close(), { signal: events.signal });
        window.addEventListener("scroll", () => close(), { capture: true, signal: events.signal });
    };
    const openHistory = (assetId, clientX, clientY, returnFocus) => {
        const t = context.t;
        const asset = options.getState()?.history.find((item) => item.id === assetId);
        if (!asset)
            return;
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
            if (action === "detail")
                options.openHistoryDetail(assetId);
            else if (action === "edit")
                await options.editHistoryAsset(assetId);
            else if (action === "copy-file")
                await options.copyHistoryFile(absolutePath);
            else if (action === "copy-path")
                await options.copyHistoryText(absolutePath, t(uiKeys.history.menu.videoPathCopied));
            else if (action === "show-file") {
                const shown = await context.hostCapabilities.showItemInFolder(absolutePath);
                if (!shown)
                    context.notify(t(uiKeys.history.menu.videoMissing), { renderPage: false });
            }
            else if (action === "copy-prompt") {
                await options.copyHistoryText(videoPromptForLoras(asset.prompt, version.videoLoras ?? asset.videoLoras), t(uiKeys.history.menu.promptCopied));
            }
            else if (action === "delete") {
                options.requestHistoryDeletion(assetId);
            }
        }, "[data-history-action]", returnFocus);
    };
    const openImageHistory = (projectId, clientX, clientY, returnFocus) => {
        const t = context.t;
        const project = options.getState()?.imageHistory.find((item) => item.id === projectId);
        if (!project)
            return;
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
            if (action === "detail")
                options.openImageHistoryDetail(projectId);
            else if (action === "edit")
                await options.continueImageEdit(project, version);
            else if (action === "video")
                await options.continueImageToVideo(project, version);
            else if (action === "copy-file")
                await options.copyHistoryFile(absolutePath, t(uiKeys.history.menu.imageFileCopied));
            else if (action === "copy-path")
                await options.copyHistoryText(absolutePath, t(uiKeys.history.menu.imagePathCopied));
            else if (action === "show-file") {
                const shown = await context.hostCapabilities.showItemInFolder(absolutePath);
                if (!shown)
                    context.notify(t(uiKeys.history.menu.imageMissing), { renderPage: false });
            }
            else if (action === "copy-prompt") {
                await options.copyHistoryText(version.prompt, t(uiKeys.history.menu.promptCopied));
            }
            else if (action === "delete") {
                options.requestHistoryDeletion(projectId);
            }
        }, "[data-image-history-action]", returnFocus);
    };
    return { openHistory, openImageHistory, close };
}
