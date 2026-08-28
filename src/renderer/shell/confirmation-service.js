import { uiKeys } from "../../core/i18n-keys";
export async function acceptConfirmation(context, options) {
    const request = options.getRequest();
    const t = context.t;
    if (!request || options.isBusy())
        return;
    const preserveHistoryScrollOnReturn = request.kind === "delete-history" &&
        (options.getPage() === "history-detail" || options.getPage() === "image-history-detail");
    if (preserveHistoryScrollOnReturn)
        options.setHistoryScrollRestorePending(true);
    options.setBusy(true);
    const acceptButton = options.overlayRoot.querySelector("#accept-confirmation");
    const cancelButton = options.overlayRoot.querySelector("#cancel-confirmation");
    if (acceptButton) {
        acceptButton.disabled = true;
        acceptButton.textContent = t(uiKeys.dialog.processing);
    }
    if (cancelButton)
        cancelButton.disabled = true;
    try {
        if (request.kind === "clear-draft") {
            options.clearCreationDraft(request.mode);
        }
        else if (request.kind === "force-stop-comfy") {
            options.setServiceForceStopping(true);
            options.setServiceStatusMessage(t(uiKeys.runtime.forceStopStatus));
            const settings = options.getFormSettings();
            const result = await context.studio.forceStopComfyProcesses(settings);
            options.setServiceForceStopping(false);
            options.setServiceStatusMessage(result.message);
            await options.scanEnvironment(settings);
            if (!result.ok)
                throw new Error(result.message);
            options.setRequest(null);
            options.setBusy(false);
            options.notify(result.message);
            options.render();
            options.restoreModalFocus();
            return;
        }
        else if (request.kind === "uninstall-llama-cpp-python") {
            const settings = options.getFormSettings();
            options.setLlamaCppPythonInstalling(true);
            options.setLlamaCppPythonLog("");
            const result = await context.studio.uninstallLlamaCppPython(settings);
            options.setLlamaCppPythonLog(result.log || result.message);
            if (!result.ok)
                throw new Error(result.message);
            await options.scanEnvironment(settings);
            options.setLlamaCppPythonInstalling(false);
            options.setRequest(null);
            options.setBusy(false);
            options.notify(result.message);
            options.render();
            options.restoreModalFocus();
            return;
        }
        else if (request.kind === "uninstall-custom-node") {
            const settings = options.getFormSettings();
            const result = await context.studio.uninstallCustomNode(request.nodeId, settings);
            if (!result.ok)
                throw new Error(result.message);
            await options.scanEnvironment(settings);
            options.setRequest(null);
            options.setBusy(false);
            options.notify(result.message);
            options.render();
            options.restoreModalFocus();
            return;
        }
        else if (request.kind === "remove-queue-task") {
            options.setQueueActionBusy({ taskId: request.taskId, action: "remove" });
            options.setState(await context.studio.removeTask(request.taskId));
            options.setQueueActionBusy(null);
            options.notify(t(uiKeys.runtime.queueTaskRemoved, { title: request.title }));
        }
        else if (request.kind === "cancel-queue-task") {
            options.setQueueActionBusy({ taskId: request.taskId, action: "cancel" });
            options.setState(await context.studio.cancelTask(request.taskId));
            options.setQueueActionBusy(null);
            options.notify(t(uiKeys.runtime.queueTaskCancelled, { title: request.title }), {
                kind: "warning"
            });
        }
        else if (request.kind === "discard-settings") {
            options.setSettingsDraft(null);
            void context.studio.setSettingsDirty(false).catch(() => undefined);
            options.setPage(request.nextPage);
            options.setRequest(null);
            options.setBusy(false);
            options.render();
            options.restoreModalFocus();
            if (request.nextPage !== "history")
                window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
            return;
        }
        else if (request.kind === "delete-history") {
            options.releaseHistoryVideo(request.assetId);
            await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
            options.setState(await context.studio.deleteHistoryAsset(request.assetId));
            options.setSelectedHistoryAssetId("");
            if (options.getPage() === "history-detail" || options.getPage() === "image-history-detail") {
                if (options.getPage() === "image-history-detail")
                    options.setHistoryKind("image");
                options.setHistoryScrollRestorePending(true);
                options.setPage("history");
            }
            options.notify(t(uiKeys.runtime.historyAssetDeleted, { title: request.title }));
        }
        else if (request.kind === "delete-image-version") {
            options.setState(await context.studio.deleteImageHistoryVersion(request.projectId, request.versionId));
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
        }
        else if (request.kind === "delete-video-version") {
            options.releaseHistoryVideo(request.assetId);
            await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
            options.setState(await context.studio.deleteHistoryVersion(request.assetId, request.versionId));
            options.setSelectedHistoryVersionId("");
            options.notify(t(uiKeys.runtime.historyVersionDeleted));
        }
        options.setRequest(null);
        options.setBusy(false);
        options.render();
        options.restoreModalFocus();
    }
    catch (error) {
        options.setQueueActionBusy(null);
        if (request.kind === "force-stop-comfy")
            options.setServiceForceStopping(false);
        if (preserveHistoryScrollOnReturn)
            options.setHistoryScrollRestorePending(false);
        options.setBusy(false);
        options.notify(error instanceof Error ? error.message : String(error), { kind: "error" });
        options.renderOverlay();
    }
}
