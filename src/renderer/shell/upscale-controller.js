import { createUpscaleFilename, upscaleDimensions } from "../../core/upscale";
import { versionVideoIndex } from "../pages/history/helpers";
import { uiKeys } from "../../core/i18n-keys";
export function mountUpscaleController(context, options) {
    const events = new AbortController();
    const signal = events.signal;
    const root = options.root;
    const t = context.t;
    const closeUpscale = () => {
        options.setDialog(null);
        options.renderOverlay();
        options.restoreModalFocus();
    };
    root.querySelector("#close-upscale")?.addEventListener("click", closeUpscale, { signal });
    root.querySelector("#cancel-upscale")?.addEventListener("click", closeUpscale, { signal });
    root.querySelector("#upscale-backdrop")?.addEventListener("click", (event) => {
        if (event.target === event.currentTarget)
            closeUpscale();
    }, { signal });
    const dialogElement = root.querySelector(".upscale-dialog");
    if (dialogElement)
        options.bindModalFocus(dialogElement, closeUpscale, "#cancel-upscale");
    root.querySelectorAll("[data-upscale-height]").forEach((button) => {
        button.addEventListener("click", () => {
            const dialog = options.getDialog();
            if (!dialog)
                return;
            options.rememberModalControlFocus(button);
            options.setDialog({
                ...dialog,
                targetHeight: Number(button.dataset.upscaleHeight)
            });
            options.renderOverlay();
        }, { signal });
    });
    root.querySelector("#upscale-model")?.addEventListener("change", (event) => {
        const dialog = options.getDialog();
        if (!dialog)
            return;
        options.rememberModalControlFocus(event.currentTarget);
        options.setDialog({
            ...dialog,
            modelId: event.currentTarget.value
        });
        options.renderOverlay();
    }, { signal });
    root.querySelector("#upscale-tile")?.addEventListener("change", (event) => {
        const dialog = options.getDialog();
        if (!dialog)
            return;
        options.rememberModalControlFocus(event.currentTarget);
        options.setDialog({
            ...dialog,
            tileMode: event.currentTarget.value
        });
        options.renderOverlay();
    }, { signal });
    root.querySelector("#enqueue-upscale")?.addEventListener("click", async () => {
        const dialog = options.getDialog();
        const state = context.getState();
        if (!dialog || !state)
            return;
        options.reportUserAction(dialog.taskId ? "upscale-task-update" : "upscale-task-enqueue", {
            taskId: dialog.taskId ?? dialog.replaceTaskId,
            modelId: dialog.modelId,
            targetHeight: dialog.targetHeight
        });
        const asset = state.history.find((item) => item.id === dialog.assetId);
        const version = asset?.versions.find((item) => item.id === dialog.versionId);
        const fileIndex = version ? versionVideoIndex(version) : -1;
        const sourceFile = fileIndex >= 0 ? version?.files[fileIndex] : undefined;
        if (!asset || !version || !sourceFile?.absolutePath) {
            context.notify(t(uiKeys.runtime.upscaleSourceMissing), { renderPage: false });
            return;
        }
        try {
            const [targetWidth, targetHeight] = upscaleDimensions(version.width, version.height, dialog.targetHeight);
            const upscalePatch = {
                targetWidth,
                targetHeight: dialog.targetHeight,
                modelId: dialog.modelId,
                workflowPath: `builtin:upscale/${dialog.modelId}`,
                tileMode: dialog.tileMode,
                faceRestore: false,
                outputFilename: createUpscaleFilename(sourceFile.filename, dialog.targetHeight)
            };
            if (dialog.taskId || dialog.replaceTaskId) {
                const nextState = await context.application.updateUpscaleTask(dialog.taskId ?? dialog.replaceTaskId, upscalePatch);
                options.setRendererState(nextState);
                context.notify(dialog.taskId ? t(uiKeys.runtime.upscaleUpdated) : t(uiKeys.runtime.upscaleRecovered), { renderPage: false });
                options.setDialog(null);
                context.requestRender();
            }
            else {
                const nextState = await context.application.enqueueUpscale({
                    sourceAssetId: asset.id,
                    sourceVersionId: version.id,
                    sourceFilePath: sourceFile.absolutePath,
                    sourceFilename: sourceFile.filename,
                    sourceWidth: version.width,
                    sourceHeight: version.height,
                    duration: version.duration,
                    fps: version.fps,
                    targetHeight: dialog.targetHeight,
                    modelId: dialog.modelId,
                    tileMode: dialog.tileMode,
                    faceRestore: false
                });
                options.setRendererState(nextState);
                context.notify(t(uiKeys.runtime.upscaleQueued), { renderPage: false });
                options.setDialog(null);
                context.requestRender();
            }
            options.restoreModalFocus();
        }
        catch (error) {
            context.notify(error instanceof Error ? error.message : String(error), { renderPage: false, kind: "error" });
        }
    }, { signal });
    return () => events.abort();
}
