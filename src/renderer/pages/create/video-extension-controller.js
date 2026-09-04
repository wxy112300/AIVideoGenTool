import { uiKeys } from "../../../core/i18n-keys";
import { ensureMotionContextSourceSlot } from "../../../core/h3-reference";
import { isMiniMaxH3ContinuumModel, isMiniMaxH3R2vModel } from "../../../core/workflow";
export function mountVideoExtensionController(context, options) {
    const events = new AbortController();
    const signal = events.signal;
    const root = context.root;
    const getDraft = () => context.getState()?.draft;
    const t = context.t;
    root.querySelector("#pick-video")?.addEventListener("click", async (event) => {
        event.stopImmediatePropagation();
        const filename = await context.hostCapabilities.pickVideo();
        if (filename)
            await options.selectDraftVideo(filename);
    }, { signal });
    root.querySelector("#remove-video")?.addEventListener("click", (event) => {
        event.stopImmediatePropagation();
        const draft = getDraft();
        options.patchDraft({
            sourceVideoPath: "",
            sourceVideoDuration: 0,
            trimStartSeconds: 0,
            trimEndSeconds: 0,
            sourceAssetId: undefined,
            sourceVersionId: undefined,
            h3ContextLatentPath: undefined,
            h3ContinuumArtifactPath: undefined,
            h3ContinuumArtifact: undefined,
            sourceWidth: 0,
            sourceHeight: 0,
            ...(draft && isMiniMaxH3R2vModel(draft.modelId)
                ? { h3ReferenceSlots: ensureMotionContextSourceSlot(draft.h3ReferenceSlots, "") }
                : {})
        });
        context.requestRender();
    }, { signal });
    const continuumArtifactZone = root.querySelector("[data-drop-h3-continuum-av]");
    const setContinuumArtifact = (filename) => {
        if (!/\.safetensors$/iu.test(filename)) {
            context.notify(t(uiKeys.create.validation.continuumArtifactMissing), { kind: "error" });
            return;
        }
        options.patchDraft({
            h3ContinuumArtifactPath: filename,
            h3ContinuumArtifact: undefined
        });
        context.requestRender();
    };
    const pickContinuumArtifact = async () => {
        const filename = await context.hostCapabilities.pickH3NativeAv();
        if (filename)
            setContinuumArtifact(filename);
    };
    if (continuumArtifactZone) {
        continuumArtifactZone.addEventListener("click", (event) => {
            event.stopImmediatePropagation();
            void pickContinuumArtifact();
        }, { signal });
        continuumArtifactZone.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ")
                return;
            event.preventDefault();
            void pickContinuumArtifact();
        }, { signal });
        const clearDragState = () => continuumArtifactZone.classList.remove("drag-over");
        continuumArtifactZone.addEventListener("dragenter", (event) => {
            event.preventDefault();
            continuumArtifactZone.classList.add("drag-over");
        }, { signal });
        continuumArtifactZone.addEventListener("dragover", (event) => {
            event.preventDefault();
            if (event.dataTransfer)
                event.dataTransfer.dropEffect = "copy";
            continuumArtifactZone.classList.add("drag-over");
        }, { signal });
        continuumArtifactZone.addEventListener("dragleave", clearDragState, { signal });
        continuumArtifactZone.addEventListener("drop", (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            clearDragState();
            const file = event.dataTransfer?.files.item(0);
            if (!file || !/\.safetensors$/iu.test(file.name)) {
                context.notify(t(uiKeys.create.validation.continuumArtifactMissing), { kind: "error" });
                return;
            }
            const filename = context.hostCapabilities.getDroppedFilePath(file);
            if (!filename) {
                context.notify(t(uiKeys.create.validation.continuumArtifactMissing), { kind: "error" });
                return;
            }
            setContinuumArtifact(filename);
        }, { signal });
    }
    root.querySelector("#clear-h3-continuum-av")?.addEventListener("click", (event) => {
        event.stopImmediatePropagation();
        options.patchDraft({
            h3ContinuumArtifactPath: undefined,
            h3ContinuumArtifact: undefined
        });
        context.requestRender();
    }, { signal });
    const zone = root.querySelector("[data-drop-video]");
    if (zone) {
        const clearDragState = () => zone.classList.remove("drag-over");
        zone.addEventListener("dragenter", (event) => {
            event.preventDefault();
            zone.classList.add("drag-over");
        }, { signal });
        zone.addEventListener("dragover", (event) => {
            event.preventDefault();
            if (event.dataTransfer)
                event.dataTransfer.dropEffect = "copy";
            zone.classList.add("drag-over");
        }, { signal });
        zone.addEventListener("dragleave", clearDragState, { signal });
        zone.addEventListener("drop", (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            clearDragState();
            const file = event.dataTransfer?.files.item(0);
            if (!file)
                return;
            if (!file.type.startsWith("video/") && !/\.(mp4|webm|mov|m4v|mkv)$/i.test(file.name)) {
                context.notify(t(uiKeys.create.interaction.invalidVideoDrop));
                return;
            }
            const filename = context.hostCapabilities.getDroppedFilePath(file);
            if (!filename) {
                context.notify(t(uiKeys.create.interaction.videoPathFailed));
                return;
            }
            void options.selectDraftVideo(filename).catch((error) => {
                context.notify(error instanceof Error ? error.message : t(uiKeys.create.interaction.videoReadFailed), { kind: "error" });
            });
        }, { signal });
    }
    const video = root.querySelector("#source-video");
    if (!video)
        return () => events.abort();
    video.addEventListener("loadedmetadata", () => {
        video.pause();
        const draft = getDraft();
        if (!draft || !Number.isFinite(video.duration) || video.duration <= 0)
            return;
        const durationChanged = Math.abs(draft.sourceVideoDuration - video.duration) > 0.05;
        const dimensionsChanged = draft.sourceWidth !== video.videoWidth ||
            draft.sourceHeight !== video.videoHeight;
        const continuum = isMiniMaxH3ContinuumModel(draft.modelId);
        const continuumBoundaryChanged = continuum && (Math.abs(draft.trimStartSeconds) > 0.05 ||
            Math.abs(draft.trimEndSeconds - video.duration) > 0.05);
        if (!durationChanged && !dimensionsChanged && !continuumBoundaryChanged)
            return;
        const trimStartSeconds = continuum
            ? 0
            : durationChanged
            ? Math.min(draft.trimStartSeconds, Math.max(0, video.duration - 0.1))
            : draft.trimStartSeconds;
        const trimEndSeconds = continuum
            ? video.duration
            : durationChanged
            ? draft.trimEndSeconds <= 0 || draft.trimEndSeconds > video.duration
                ? video.duration
                : Math.max(trimStartSeconds + 0.1, draft.trimEndSeconds)
            : draft.trimEndSeconds;
        options.patchDraft({
            sourceVideoDuration: video.duration,
            trimStartSeconds,
            trimEndSeconds,
            sourceWidth: video.videoWidth,
            sourceHeight: video.videoHeight
        });
        context.requestRender();
    }, { signal });
    video.addEventListener("play", () => {
        const draft = getDraft();
        if (!draft)
            return;
        const start = draft.trimStartSeconds;
        const end = draft.trimEndSeconds;
        if (video.currentTime < start || video.currentTime >= end)
            video.currentTime = start;
    }, { signal });
    video.addEventListener("timeupdate", () => {
        const end = getDraft()?.trimEndSeconds;
        if (end == null || video.currentTime < end)
            return;
        video.pause();
        video.currentTime = end;
    }, { signal });
    const startInput = root.querySelector("#trim-start");
    const endInput = root.querySelector("#trim-end");
    const editor = root.querySelector("#trim-editor");
    if (!startInput || !endInput || !editor)
        return () => events.abort();
    const updateTrim = (active) => {
        const draft = getDraft();
        if (!draft)
            return;
        const duration = draft.sourceVideoDuration;
        const minimumClip = Math.min(0.1, duration);
        let start = Number(startInput.value);
        let end = Number(endInput.value);
        if (active === "start")
            start = Math.min(start, end - minimumClip);
        else
            end = Math.max(end, start + minimumClip);
        start = Math.max(0, start);
        end = Math.min(duration, end);
        startInput.value = String(start);
        endInput.value = String(end);
        const kept = end - start;
        editor.style.setProperty("--trim-start", `${start / duration * 100}%`);
        editor.style.setProperty("--trim-end", `${end / duration * 100}%`);
        startInput.setAttribute("aria-valuetext", options.formatTrimTime(start));
        endInput.setAttribute("aria-valuetext", options.formatTrimTime(end));
        root.querySelector("#trim-start-output").textContent = options.formatTrimTime(start);
        root.querySelector("#trim-end-output").textContent = options.formatTrimTime(end);
        root.querySelector("#trim-kept").textContent = t(uiKeys.create.interaction.trimAdded, { value: kept.toFixed(1) });
        root.querySelector("#trim-discarded").textContent = t(uiKeys.create.interaction.trimAdded, { value: Math.max(0, duration - kept).toFixed(1) });
        root.querySelector("#trim-total").textContent = t(uiKeys.create.interaction.trimApproxTotal, { value: (kept + draft.duration).toFixed(1) });
        video.pause();
        video.currentTime = active === "start" ? start : end;
        options.patchDraft({ trimStartSeconds: start, trimEndSeconds: end });
        options.syncEnqueueUi();
    };
    startInput.addEventListener("input", () => updateTrim("start"), { signal });
    endInput.addEventListener("input", () => updateTrim("end"), { signal });
    return () => events.abort();
}
