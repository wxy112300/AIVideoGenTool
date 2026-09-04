import { createAetherScaleUpscaleFilename, createDlss5UpscaleFilename, createUpscaleFilename, h3NativeUpscaleDimensions, upscaleDimensions } from "../../core/upscale";
import { DEFAULT_DLSS5_UPSCALE_OPTIONS, DLSS5_MODEL_ID, dlss5OutputDimensions, isDlss5Quality, isDlss5Scale, requireLegacyUpscaleTargetHeight } from "../../core/dlss5";
import { AETHERSCALE_DEFAULT_MODE, AETHERSCALE_DEFAULT_STYLE_PROFILE, AETHERSCALE_MODEL_ID, aetherScaleOutputGeometry, defaultAetherScaleOptions, isAetherScaleMode, isAetherScaleStyleProfile } from "../../core/aetherscale";
import { versionVideoIndex } from "../pages/history/helpers";
import { uiKeys } from "../../core/i18n-keys";
function renderedAetherScaleMode(root, dialog) {
    const selectedButton = root.querySelector('[data-aetherscale-mode].primary');
    const renderedMode = selectedButton?.dataset.aetherscaleMode;
    return isAetherScaleMode(renderedMode)
        ? renderedMode
        : isAetherScaleMode(dialog.aetherScaleMode)
            ? dialog.aetherScaleMode
            : AETHERSCALE_DEFAULT_MODE;
}
export function mountUpscaleController(context, options) {
    const events = new AbortController();
    const signal = events.signal;
    const root = options.root;
    const t = context.t;
    const closeUpscale = () => {
        if (options.getDialog()?.busy)
            return;
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
    root.querySelectorAll("[data-upscale-scale]").forEach((button) => {
        button.addEventListener("click", () => {
            const dialog = options.getDialog();
            const scale = Number(button.dataset.upscaleScale);
            if (!dialog || !isDlss5Scale(scale))
                return;
            options.rememberModalControlFocus(button);
            options.setDialog({
                ...dialog,
                targetScale: scale
            });
            options.renderOverlay();
        }, { signal });
    });
    root.querySelectorAll("[data-aetherscale-mode]").forEach((button) => {
        button.addEventListener("click", () => {
            const dialog = options.getDialog();
            const mode = button.dataset.aetherscaleMode;
            if (!dialog || !isAetherScaleMode(mode))
                return;
            options.rememberModalControlFocus(button);
            options.setDialog({
                ...dialog,
                aetherScaleMode: mode
            });
            options.renderOverlay();
        }, { signal });
    });
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
        const modelId = event.currentTarget.value;
        const h3Selected = modelId === "minimax_h3_latent_upscaler";
        const aetherScaleSelected = modelId === AETHERSCALE_MODEL_ID;
        options.rememberModalControlFocus(event.currentTarget);
        options.setDialog({
            ...dialog,
            modelId,
            targetHeight: h3Selected
                ? (dialog.targetHeight === 768 ? 768 : 720)
                : aetherScaleSelected
                    ? undefined
                    : (dialog.targetHeight === 768 ? 1080 : dialog.targetHeight ?? 1080),
            targetScale: isDlss5Scale(dialog.targetScale) ? dialog.targetScale : 2,
            dlss5Quality: isDlss5Quality(dialog.dlss5Quality) ? dialog.dlss5Quality : "quality",
            aetherScaleMode: isAetherScaleMode(dialog.aetherScaleMode) ? dialog.aetherScaleMode : AETHERSCALE_DEFAULT_MODE,
            aetherStyleProfile: isAetherScaleStyleProfile(dialog.aetherStyleProfile) ? dialog.aetherStyleProfile : AETHERSCALE_DEFAULT_STYLE_PROFILE,
            tileMode: dialog.tileMode
        });
        options.renderOverlay();
    }, { signal });
    root.querySelector("#upscale-aetherscale-style")?.addEventListener("change", (event) => {
        const dialog = options.getDialog();
        const styleProfile = event.currentTarget.value;
        if (!dialog || !isAetherScaleStyleProfile(styleProfile))
            return;
        options.rememberModalControlFocus(event.currentTarget);
        options.setDialog({
            ...dialog,
            aetherStyleProfile: styleProfile
        });
        options.renderOverlay();
    }, { signal });
    root.querySelector("#upscale-dlss-quality")?.addEventListener("change", (event) => {
        const dialog = options.getDialog();
        const quality = event.currentTarget.value;
        if (!dialog || !isDlss5Quality(quality))
            return;
        options.rememberModalControlFocus(event.currentTarget);
        options.setDialog({
            ...dialog,
            dlss5Quality: quality
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
        if (!dialog || dialog.busy || !state)
            return;
        const selectedAetherMode = dialog.modelId === AETHERSCALE_MODEL_ID
            ? renderedAetherScaleMode(root, dialog)
            : AETHERSCALE_DEFAULT_MODE;
        options.reportUserAction(dialog.taskId ? "upscale-task-update" : "upscale-task-enqueue", {
            taskId: dialog.taskId ?? dialog.replaceTaskId,
            modelId: dialog.modelId,
            ...(dialog.modelId === AETHERSCALE_MODEL_ID
                ? { aetherScaleMode: selectedAetherMode }
                : dialog.modelId === DLSS5_MODEL_ID
                    ? { targetScale: isDlss5Scale(dialog.targetScale) ? dialog.targetScale : 2 }
                    : { targetHeight: dialog.targetHeight })
        });
        const asset = state.history.find((item) => item.id === dialog.assetId);
        const version = asset?.versions.find((item) => item.id === dialog.versionId);
        const fileIndex = version ? versionVideoIndex(version) : -1;
        const sourceFile = fileIndex >= 0 ? version?.files[fileIndex] : undefined;
        if (!asset || !version || !sourceFile?.absolutePath) {
            context.notify(t(uiKeys.runtime.upscaleSourceMissing), { renderPage: false });
            return;
        }
        options.setDialog({ ...dialog, busy: true });
        options.renderOverlay();
        try {
            const dlss5Selected = dialog.modelId === DLSS5_MODEL_ID;
            const aetherScaleSelected = dialog.modelId === AETHERSCALE_MODEL_ID;
            const selectedScale = isDlss5Scale(dialog.targetScale) ? dialog.targetScale : 2;
            const selectedQuality = isDlss5Quality(dialog.dlss5Quality) ? dialog.dlss5Quality : "quality";
            const selectedAetherStyle = isAetherScaleStyleProfile(dialog.aetherStyleProfile) ? dialog.aetherStyleProfile : AETHERSCALE_DEFAULT_STYLE_PROFILE;
            const legacyTargetHeight = dlss5Selected || aetherScaleSelected
                ? undefined
                : requireLegacyUpscaleTargetHeight(dialog.targetHeight);
            const h3Native = dialog.modelId === "minimax_h3_latent_upscaler";
            const [targetWidth, targetOutputHeight] = aetherScaleSelected
                ? (() => {
                    const geometry = aetherScaleOutputGeometry(version.width, version.height, selectedAetherMode);
                    return [geometry.width, geometry.height];
                })()
                : dlss5Selected
                    ? dlss5OutputDimensions(version.width, version.height, selectedScale)
                    : h3Native
                        ? h3NativeUpscaleDimensions(version.width, version.height, legacyTargetHeight === 2160 ? 1440 : legacyTargetHeight)
                        : upscaleDimensions(version.width, version.height, legacyTargetHeight);
            const h3Artifact = version.h3ContinuationData?.status === "available"
                ? version.h3ContinuationData.artifact
                : undefined;
            if (h3Native && !h3Artifact) {
                throw new Error(t(uiKeys.h3Native.reasonArtifactMissing));
            }
            const dlss5 = {
                ...DEFAULT_DLSS5_UPSCALE_OPTIONS,
                scale: selectedScale,
                quality: selectedQuality
            };
            const aetherScale = defaultAetherScaleOptions(targetWidth, targetOutputHeight, selectedAetherMode, selectedAetherStyle);
            const upscalePatch = aetherScaleSelected
                ? {
                    targetWidth,
                    targetOutputHeight,
                    aetherScale,
                    upscaleMode: "pixel",
                    modelId: AETHERSCALE_MODEL_ID,
                    workflowPath: "builtin:upscale/aetherscale-dlss5",
                    tileMode: "auto",
                    faceRestore: false,
                    outputFilename: createAetherScaleUpscaleFilename(sourceFile.filename, selectedAetherMode)
                }
                : dlss5Selected
                ? {
                    targetWidth,
                    targetOutputHeight,
                    targetScale: selectedScale,
                    dlss5,
                    upscaleMode: "pixel",
                    modelId: DLSS5_MODEL_ID,
                    workflowPath: "builtin:upscale/dlss5-sr",
                    tileMode: "auto",
                    faceRestore: false,
                    outputFilename: createDlss5UpscaleFilename(sourceFile.filename, selectedScale)
                }
                : {
                    targetWidth,
                    targetHeight: legacyTargetHeight,
                    targetOutputHeight,
                    upscaleMode: h3Native ? "h3-native" : "pixel",
                    modelId: h3Native ? h3Artifact.executionModelId : dialog.modelId,
                    workflowPath: h3Native
                        ? "builtin:upscale/h3-native-second-sample"
                        : `builtin:upscale/${dialog.modelId}`,
                    tileMode: dialog.tileMode,
                    faceRestore: false,
                    outputFilename: createUpscaleFilename(sourceFile.filename, legacyTargetHeight)
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
                    faceRestore: false,
                    ...(aetherScaleSelected
                        ? {
                            targetWidth,
                            targetOutputHeight,
                            aetherScale,
                            upscaleMode: "pixel",
                            modelId: AETHERSCALE_MODEL_ID,
                            tileMode: "auto"
                        }
                        : dlss5Selected
                        ? {
                            targetScale: selectedScale,
                            dlss5,
                            upscaleMode: "pixel",
                            modelId: DLSS5_MODEL_ID,
                            tileMode: "auto"
                        }
                        : {
                            targetHeight: legacyTargetHeight,
                            upscaleMode: h3Native ? "h3-native" : "pixel",
                            modelId: h3Native ? h3Artifact.executionModelId : dialog.modelId,
                            tileMode: dialog.tileMode
                        })
                });
                options.setRendererState(nextState);
                context.notify(t(uiKeys.runtime.upscaleQueued), { renderPage: false });
                options.setDialog(null);
                context.requestRender();
            }
            options.restoreModalFocus();
        }
        catch (error) {
            const currentDialog = options.getDialog();
            if (currentDialog) {
                options.setDialog({ ...currentDialog, busy: false });
                options.renderOverlay();
            }
            context.notify(error instanceof Error ? error.message : String(error), { renderPage: false, kind: "error" });
        }
    }, { signal });
    return () => events.abort();
}
