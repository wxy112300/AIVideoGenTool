import { uiKeys } from "../../../core/i18n-keys";
import { videoPromptForLoras } from "../../../core/video-loras";
function stopAction(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
}
function clampRating(value) {
    if (!Number.isFinite(value) || value <= 0)
        return null;
    const rounded = Math.round(value * 2) / 2;
    return rounded >= 0.5 && rounded <= 5 ? rounded : null;
}
function updateRatingVisual(control, rating, unsetLabel) {
    const value = rating ?? 0;
    control.querySelectorAll("[data-history-rating-star]").forEach((star) => {
        const starValue = Number(star.dataset.historyRatingValue);
        star.classList.toggle("is-full", value >= starValue);
        star.classList.toggle("is-half", value === starValue - 0.5);
        star.setAttribute("aria-pressed", String(value >= starValue));
    });
    const label = control.querySelector("[data-history-rating-value-label]");
    if (label)
        label.textContent = value ? `${value} / 5` : unsetLabel;
    const clear = control.querySelector("[data-history-rating-clear]");
    if (clear)
        clear.disabled = value === 0;
    control.dataset.historyRatingPreview = String(value);
}
export function mountHistoryActionsController(context, options) {
    const events = new AbortController();
    const signal = events.signal;
    const root = context.root;
    const t = context.t;
    root.querySelector("[data-open-upscale]")?.addEventListener("click", (event) => {
        stopAction(event);
        options.openUpscaleDialog();
    }, { signal });
    root.querySelectorAll("[data-delete-history]").forEach((button) => {
        button.addEventListener("click", (event) => {
            stopAction(event);
            const assetId = button.dataset.deleteHistory;
            if (assetId)
                options.requestHistoryDeletion(assetId);
        }, { signal });
    });
    root.querySelectorAll("[data-delete-history-version]").forEach((button) => {
        button.addEventListener("click", (event) => {
            stopAction(event);
            if (button.hasAttribute("disabled"))
                return;
            const assetId = button.dataset.deleteHistoryVersion;
            const versionId = button.dataset.historyVersionDeleteId;
            if (assetId && versionId)
                options.requestHistoryVersionDeletion(assetId, versionId);
        }, { signal });
    });
    const patchFavoriteButtons = (assetId, favorite) => {
        root.querySelectorAll("[data-history-favorite]").forEach((button) => {
            if (button.dataset.historyFavorite !== assetId)
                return;
            button.classList.toggle("is-favorite", favorite);
            button.setAttribute("aria-pressed", String(favorite));
        });
    };
    root.querySelectorAll("[data-history-favorite]").forEach((button) => {
        button.addEventListener("click", async (event) => {
            stopAction(event);
            const assetId = button.dataset.historyFavorite;
            if (!assetId)
                return;
            const current = context.getState()?.history.find((item) => item.id === assetId) ??
                context.getState()?.imageHistory.find((item) => item.id === assetId);
            if (!current)
                return;
            try {
                const favorite = !current.favorite;
                options.setState(await options.updateHistoryMetadata(assetId, { favorite }));
                // Curation is a local metadata mutation. Patch its controls in place
                // so a playing detail video keeps its media element and audio state.
                patchFavoriteButtons(assetId, favorite);
            }
            catch (error) {
                context.notify(error instanceof Error ? error.message : "收藏状态更新失败。", { renderPage: false, kind: "error" });
            }
        }, { signal });
    });
    const commitRating = async (assetId, rating) => {
        try {
            options.setState(await options.updateHistoryMetadata(assetId, { rating }));
            root.querySelectorAll("[data-history-rating-control]").forEach((control) => {
                if (control.dataset.historyRatingControl !== assetId)
                    return;
                const unsetLabel = t(uiKeys.history.filter.ratingUnset);
                control.dataset.historyRatingCurrent = String(rating ?? 0);
                updateRatingVisual(control, rating, unsetLabel);
            });
        }
        catch (error) {
            context.notify(error instanceof Error ? error.message : "评分更新失败。", { renderPage: false, kind: "error" });
        }
    };
    root.querySelectorAll("[data-history-rating-control]").forEach((control) => {
        const unsetLabel = t(uiKeys.history.filter.ratingUnset);
        const readPreview = () => clampRating(Number(control.dataset.historyRatingPreview ?? control.dataset.historyRatingCurrent ?? 0));
        const previewFromPointer = (button, event) => {
            const value = Number(button.dataset.historyRatingValue);
            const rect = button.getBoundingClientRect();
            return clampRating(value - (event.clientX - rect.left < rect.width / 2 ? 0.5 : 0)) ?? 0.5;
        };
        control.querySelectorAll("[data-history-rating-star]").forEach((button) => {
            button.addEventListener("pointermove", (event) => {
                updateRatingVisual(control, previewFromPointer(button, event), unsetLabel);
            }, { signal });
            button.addEventListener("click", async (event) => {
                stopAction(event);
                const assetId = button.dataset.historyRatingStar;
                if (!assetId)
                    return;
                const rating = previewFromPointer(button, event);
                control.dataset.historyRatingCurrent = String(rating);
                await commitRating(assetId, rating);
            }, { signal });
            button.addEventListener("keydown", (event) => {
                const key = event.key;
                if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Enter", " "].includes(key))
                    return;
                stopAction(event);
                const assetId = button.dataset.historyRatingStar;
                if (!assetId)
                    return;
                const current = readPreview() ?? 0;
                if (key === "Enter" || key === " ") {
                    const rating = readPreview();
                    void commitRating(assetId, rating);
                    control.dataset.historyRatingCurrent = String(rating ?? 0);
                    return;
                }
                const next = key === "Home" ? null : key === "End" ? 5 : clampRating(current + ((key === "ArrowLeft" || key === "ArrowDown") ? -0.5 : 0.5));
                updateRatingVisual(control, next, unsetLabel);
            }, { signal });
        });
        control.addEventListener("pointerleave", () => {
            updateRatingVisual(control, clampRating(Number(control.dataset.historyRatingCurrent ?? 0)), unsetLabel);
        }, { signal });
    });
    root.querySelectorAll("[data-history-rating-clear]").forEach((button) => {
        button.addEventListener("click", async (event) => {
            stopAction(event);
            const assetId = button.dataset.historyRatingClear;
            if (assetId)
                await commitRating(assetId, null);
        }, { signal });
    });
    root.querySelector("[data-copy-prompt]")?.addEventListener("click", async (event) => {
        stopAction(event);
        const asset = context.getState()?.history.find((item) => item.id === options.getSelectedHistoryAssetId());
        if (asset) {
            const version = asset.versions.find((item) => item.id === options.getSelectedHistoryVersionId());
            await options.copyHistoryText(videoPromptForLoras(asset.prompt, version?.videoLoras ?? asset.videoLoras), t(uiKeys.history.menu.promptCopied));
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
    root.querySelectorAll("[data-image-continue-edit-project]").forEach((button) => {
        button.addEventListener("click", async (event) => {
            stopAction(event);
            const projectId = button.dataset.imageContinueEditProject;
            const versionId = button.dataset.imageContinueEditVersion;
            if (projectId && versionId)
                await options.continueImageEdit(projectId, versionId);
        }, { signal });
    });
    root.querySelectorAll("[data-image-continue-video-project]").forEach((button) => {
        button.addEventListener("click", async (event) => {
            stopAction(event);
            const projectId = button.dataset.imageContinueVideoProject;
            const versionId = button.dataset.imageContinueVideoVersion;
            if (projectId && versionId)
                await options.continueImageToVideo(projectId, versionId);
        }, { signal });
    });
    root.querySelector("[data-image-set-cover]")?.addEventListener("click", async (event) => {
        stopAction(event);
        const button = event.currentTarget;
        const projectId = button.dataset.imageSetCover;
        if (!projectId)
            return;
        try {
            options.setState(await context.application.setImageHistoryCover(projectId, button.dataset.imageCoverVersion || undefined));
            context.notify(button.dataset.imageCoverVersion ? t(uiKeys.history.actions.coverSet) : t(uiKeys.history.actions.autoCoverRestored), { renderPage: false });
            context.requestRender();
        }
        catch (error) {
            context.notify(error instanceof Error ? error.message : t(uiKeys.history.actions.coverUpdateFailed), { renderPage: false, kind: "error" });
        }
    }, { signal });
    root.querySelectorAll("[data-edit-history]").forEach((button) => {
        button.addEventListener("click", async (event) => {
            stopAction(event);
            const assetId = button.dataset.editHistory;
            if (assetId)
                await options.editHistoryAsset(assetId);
        }, { signal });
    });
    root.querySelectorAll("[data-continue-history]").forEach((button) => {
        button.addEventListener("click", async (event) => {
            stopAction(event);
            const assetId = button.dataset.continueHistory;
            const versionId = button.dataset.sourceVersion;
            if (assetId && versionId)
                await options.continueVideoHistory(assetId, versionId);
        }, { signal });
    });
    root.querySelectorAll("[data-show-file]").forEach((button) => {
        button.addEventListener("click", async (event) => {
            stopAction(event);
            const filename = button.dataset.showFile;
            if (!filename)
                return;
            context.reportUserAction("history-show-file");
            const shown = await context.hostCapabilities.showItemInFolder(filename);
            if (!shown)
                context.notify(t(uiKeys.history.actions.fileMissing), { renderPage: false });
        }, { signal });
    });
    root.querySelectorAll("[data-copy-file]").forEach((button) => {
        button.addEventListener("click", async (event) => {
            stopAction(event);
            const filename = button.dataset.copyFile;
            if (!filename)
                return;
            context.reportUserAction("history-copy-file");
            await options.copyHistoryFile(filename);
        }, { signal });
    });
    root.querySelectorAll("[data-copy-image]").forEach((button) => {
        button.addEventListener("click", async (event) => {
            stopAction(event);
            const filename = button.dataset.copyImage;
            if (!filename)
                return;
            context.reportUserAction("image-history-copy-image");
            await options.copyHistoryImage(filename);
        }, { signal });
    });
    root.querySelectorAll("[data-delete-image-version]").forEach((button) => {
        button.addEventListener("click", (event) => {
            stopAction(event);
            if (button.hasAttribute("disabled"))
                return;
            const projectId = button.dataset.deleteImageVersion;
            const versionId = button.dataset.imageVersionDeleteId;
            if (projectId && versionId)
                options.requestImageVersionDeletion(projectId, versionId);
        }, { signal });
    });
    return () => events.abort();
}
