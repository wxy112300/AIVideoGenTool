import { icon, renderIcons } from "../../shared/icons";
import { imageHistoryMediaUrl } from "./helpers";
import { uiKeys } from "../../../core/i18n-keys";
function inertLightboxBackground(dialog, root) {
    const previous = new Map();
    let branch = dialog;
    while (branch && branch !== root) {
        const ancestor = branch.parentElement;
        if (!ancestor)
            break;
        for (const child of Array.from(ancestor.children)) {
            if (child === branch || !(child instanceof HTMLElement))
                continue;
            if (previous.has(child))
                continue;
            previous.set(child, child.inert);
            child.inert = true;
        }
        branch = ancestor;
    }
    return () => {
        for (const [element, wasInert] of previous)
            element.inert = wasInert;
    };
}
export function imageLightboxFitSize(naturalWidth, naturalHeight, stageWidth, stageHeight) {
    if (![naturalWidth, naturalHeight, stageWidth, stageHeight].every((value) => Number.isFinite(value) && value > 0)) {
        return { width: 0, height: 0 };
    }
    const fitScale = Math.min(stageWidth / naturalWidth, stageHeight / naturalHeight);
    return {
        width: naturalWidth * fitScale,
        height: naturalHeight * fitScale
    };
}
export function imageLightboxPanLimits(fittedWidth, fittedHeight, stageWidth, stageHeight, scale) {
    return {
        x: Math.max(0, (fittedWidth * scale - stageWidth) / 2),
        y: Math.max(0, (fittedHeight * scale - stageHeight) / 2)
    };
}
export function clampImageLightboxOffset(offsetX, offsetY, limits) {
    return {
        x: Math.min(limits.x, Math.max(-limits.x, offsetX)),
        y: Math.min(limits.y, Math.max(-limits.y, offsetY))
    };
}
export function imageLightboxZoomPercent(naturalWidth, fittedWidth, scale) {
    if (![naturalWidth, fittedWidth, scale].every((value) => Number.isFinite(value) && value > 0)) {
        return 100;
    }
    return Math.max(1, Math.round((fittedWidth * scale / naturalWidth) * 100));
}
export function mountImageHistoryLightbox(context, options) {
    const events = new AbortController();
    const signal = events.signal;
    document.body.classList.remove("image-lightbox-open");
    const root = context.root;
    const lightbox = root.querySelector("[data-image-lightbox]");
    const openButton = root.querySelector("[data-open-image-lightbox]");
    const dialog = lightbox?.querySelector(".image-lightbox-dialog");
    const stage = lightbox?.querySelector("[data-image-lightbox-stage]");
    const image = lightbox?.querySelector("[data-image-lightbox-image]");
    if (!lightbox || !openButton || !dialog || !stage || !image)
        return () => events.abort();
    const versionControls = lightbox.querySelector("[data-image-lightbox-version-controls]");
    if (!versionControls)
        return () => events.abort();
    versionControls.innerHTML = `<button class="secondary button-with-icon" data-image-lightbox-version-navigation="-1">${icon("arrow-left")}${context.t(uiKeys.history.lightboxPrevious)}</button><span data-image-lightbox-version-label></span><button class="secondary button-with-icon" data-image-lightbox-version-navigation="1">${context.t(uiKeys.history.lightboxNext)}${icon("arrow-right")}</button>`;
    renderIcons(versionControls);
    const versionMeta = lightbox.querySelector(".image-lightbox-toolbar > div:first-child > span");
    const zoomIndicator = lightbox.querySelector("[data-image-lightbox-zoom]");
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let fittedImageWidth = 0;
    let fittedImageHeight = 0;
    let activePointerId = null;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let lightboxVersionChanged = false;
    let releaseBackgroundInert = null;
    let resizeObserver = null;
    const clampScale = (value) => Math.min(12, Math.max(1, value));
    const stageSize = () => {
        const bounds = stage.getBoundingClientRect();
        return {
            width: stage.clientWidth || bounds.width,
            height: stage.clientHeight || bounds.height
        };
    };
    const updateTransform = () => {
        const size = stageSize();
        const limits = imageLightboxPanLimits(fittedImageWidth, fittedImageHeight, size.width, size.height, scale);
        const clampedOffset = clampImageLightboxOffset(offsetX, offsetY, limits);
        offsetX = clampedOffset.x;
        offsetY = clampedOffset.y;
        image.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scale})`;
        stage.classList.toggle("is-zoomed", scale > 1);
        if (zoomIndicator) {
            const percent = imageLightboxZoomPercent(image.naturalWidth, fittedImageWidth, scale);
            const label = context.t(uiKeys.history.lightboxZoom, { percent: `${percent}%` });
            zoomIndicator.textContent = `${percent}%`;
            zoomIndicator.title = label;
            zoomIndicator.setAttribute("aria-label", label);
        }
    };
    const clearImageFitSizing = () => {
        fittedImageWidth = 0;
        fittedImageHeight = 0;
        image.style.removeProperty("width");
        image.style.removeProperty("height");
        image.style.removeProperty("max-width");
        image.style.removeProperty("max-height");
    };
    const fitImageToStage = (preserveZoom = false) => {
        const size = stageSize();
        const fittedSize = imageLightboxFitSize(image.naturalWidth, image.naturalHeight, size.width, size.height);
        if (!fittedSize.width || !fittedSize.height) {
            clearImageFitSizing();
            if (!preserveZoom) {
                scale = 1;
                offsetX = 0;
                offsetY = 0;
            }
            updateTransform();
            return;
        }
        fittedImageWidth = fittedSize.width;
        fittedImageHeight = fittedSize.height;
        image.style.width = `${fittedSize.width}px`;
        image.style.height = `${fittedSize.height}px`;
        image.style.maxWidth = "none";
        image.style.maxHeight = "none";
        if (!preserveZoom) {
            scale = 1;
            offsetX = 0;
            offsetY = 0;
        }
        else {
            scale = clampScale(scale);
        }
        updateTransform();
    };
    const reset = () => {
        fitImageToStage();
    };
    const syncVersionNavigation = () => {
        const state = context.getState();
        const project = state?.imageHistory.find((item) => item.id === options.getSelectedHistoryAssetId());
        const currentIndex = project?.versions.findIndex((item) => item.id === options.getSelectedHistoryVersionId()) ?? -1;
        const current = currentIndex >= 0 ? project?.versions[currentIndex] : undefined;
        const previousVersion = currentIndex >= 0 ? project?.versions[currentIndex + 1] : undefined;
        const nextVersion = currentIndex >= 0 ? project?.versions[currentIndex - 1] : undefined;
        const entries = [[-1, previousVersion], [1, nextVersion]];
        entries.forEach(([direction, targetVersion]) => {
            const button = versionControls.querySelector(`[data-image-lightbox-version-navigation="${direction}"]`);
            if (!button)
                return;
            const available = Boolean(project && targetVersion && imageHistoryMediaUrl(project, targetVersion));
            button.disabled = !available;
            button.title = targetVersion
                ? `${direction === -1 ? context.t(uiKeys.history.lightboxPrevious) : context.t(uiKeys.history.lightboxNext)} · ${context.t(uiKeys.history.version, { version: targetVersion.versionNumber })}`
                : direction === -1 ? context.t(uiKeys.history.lightboxEarliest) : context.t(uiKeys.history.lightboxLatest);
        });
        const label = versionControls.querySelector("[data-image-lightbox-version-label]");
        if (label)
            label.textContent = project && current ? context.t(uiKeys.history.lightboxVersionLabel, { current: current.versionNumber, total: project.versions.length }) : "";
        if (versionMeta && project && current) {
            versionMeta.textContent = `${context.t(uiKeys.history.version, { version: current.versionNumber })} · ${current.width} × ${current.height}`;
        }
    };
    const navigateVersion = (direction) => {
        const state = context.getState();
        const project = state?.imageHistory.find((item) => item.id === options.getSelectedHistoryAssetId());
        if (!project)
            return;
        const currentIndex = project.versions.findIndex((item) => item.id === options.getSelectedHistoryVersionId());
        if (currentIndex < 0)
            return;
        const targetVersion = project.versions[currentIndex - direction];
        const mediaUrl = targetVersion ? imageHistoryMediaUrl(project, targetVersion) : "";
        if (!targetVersion || !mediaUrl)
            return;
        options.setSelectedHistoryVersionId(targetVersion.id);
        options.setHistoryForwardTarget({ assetId: project.id, versionId: targetVersion.id });
        lightboxVersionChanged = true;
        context.reportUserAction("image-history-lightbox-version-navigation", {
            projectId: project.id,
            versionId: targetVersion.id,
            direction
        });
        const mediaSurface = image.closest("[data-image-media]");
        mediaSurface?.setAttribute("data-image-media-source", targetVersion.file.absolutePath ?? "");
        clearImageFitSizing();
        image.dataset.imageMediaUrl = mediaUrl;
        image.dispatchEvent(new Event("image-media-source-change"));
        image.src = mediaUrl;
        image.alt = `${project.title.trim() || context.t(uiKeys.history.card.untitledImage)} · ${context.t(uiKeys.history.version, { version: targetVersion.versionNumber })}`;
        reset();
        const wasVersionNavigationFocused = document.activeElement instanceof HTMLElement && document.activeElement.matches("[data-image-lightbox-version-navigation]");
        syncVersionNavigation();
        if (wasVersionNavigationFocused) {
            const focused = versionControls.querySelector(":focus");
            const fallback = [...versionControls.querySelectorAll("[data-image-lightbox-version-navigation]")]
                .find((button) => !button.disabled);
            (focused && !focused.disabled ? focused : fallback)?.focus();
        }
    };
    const close = () => {
        releaseBackgroundInert?.();
        releaseBackgroundInert = null;
        lightbox.hidden = true;
        document.body.classList.remove("image-lightbox-open");
        if (lightboxVersionChanged) {
            lightboxVersionChanged = false;
            context.requestRender();
            options.restoreModalFocus();
            window.requestAnimationFrame(() => {
                root.querySelector("[data-open-image-lightbox]")?.focus();
            });
            return;
        }
        options.restoreModalFocus();
    };
    const open = () => {
        options.rememberModalFocus();
        lightbox.hidden = false;
        document.body.classList.add("image-lightbox-open");
        releaseBackgroundInert?.();
        releaseBackgroundInert = inertLightboxBackground(dialog, root);
        lightboxVersionChanged = false;
        syncVersionNavigation();
        reset();
        window.requestAnimationFrame(() => {
            const initial = lightbox.querySelector("button[data-image-lightbox-close]");
            (initial ?? dialog).focus();
        });
    };
    options.bindModalFocus(dialog, close, "button[data-image-lightbox-close]", false);
    openButton.addEventListener("click", open, { signal });
    versionControls.querySelectorAll("[data-image-lightbox-version-navigation]").forEach((button) => {
        button.addEventListener("click", () => {
            const direction = Number(button.dataset.imageLightboxVersionNavigation);
            if (direction === -1 || direction === 1)
                navigateVersion(direction);
        }, { signal });
    });
    lightbox.querySelectorAll("[data-image-lightbox-close]").forEach((button) => {
        button.addEventListener("click", close, { signal });
    });
    lightbox.querySelector("[data-image-lightbox-reset]")?.addEventListener("click", reset, { signal });
    image.addEventListener("load", () => {
        if (!lightbox.hidden)
            fitImageToStage(scale > 1);
    }, { signal });
    const handleStageResize = () => {
        if (!lightbox.hidden)
            fitImageToStage(scale > 1);
    };
    if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(handleStageResize);
        resizeObserver.observe(stage);
    }
    else {
        window.addEventListener("resize", handleStageResize, { signal });
    }
    stage.addEventListener("wheel", (event) => {
        if (lightbox.hidden)
            return;
        event.preventDefault();
        const rect = stage.getBoundingClientRect();
        const factor = event.deltaY < 0 ? 1.12 : 0.88;
        const nextScale = clampScale(scale * factor);
        if (nextScale === scale)
            return;
        const pointerX = event.clientX - rect.left - rect.width / 2 - offsetX;
        const pointerY = event.clientY - rect.top - rect.height / 2 - offsetY;
        const scaleRatio = nextScale / scale;
        offsetX -= pointerX * (scaleRatio - 1);
        offsetY -= pointerY * (scaleRatio - 1);
        scale = nextScale;
        if (scale === 1) {
            offsetX = 0;
            offsetY = 0;
        }
        updateTransform();
    }, { passive: false, signal });
    stage.addEventListener("pointerdown", (event) => {
        if (lightbox.hidden || event.button !== 0 || scale <= 1)
            return;
        activePointerId = event.pointerId;
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
        stage.setPointerCapture(event.pointerId);
        stage.classList.add("is-panning");
        event.preventDefault();
    }, { signal });
    stage.addEventListener("pointermove", (event) => {
        if (event.pointerId !== activePointerId)
            return;
        offsetX += event.clientX - lastPointerX;
        offsetY += event.clientY - lastPointerY;
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
        updateTransform();
    }, { signal });
    const stopPanning = (event) => {
        if (event.pointerId !== activePointerId)
            return;
        activePointerId = null;
        stage.classList.remove("is-panning");
        if (stage.hasPointerCapture(event.pointerId))
            stage.releasePointerCapture(event.pointerId);
    };
    stage.addEventListener("pointerup", stopPanning, { signal });
    stage.addEventListener("pointercancel", stopPanning, { signal });
    stage.addEventListener("dblclick", (event) => {
        event.preventDefault();
        reset();
    }, { signal });
    document.addEventListener("keydown", (event) => {
        if (lightbox.hidden)
            return;
        if (event.key === "Escape")
            close();
        else if (event.key === "0")
            reset();
        else if (event.key === "ArrowLeft")
            navigateVersion(-1);
        else if (event.key === "ArrowRight")
            navigateVersion(1);
    }, { signal });
    return () => {
        events.abort();
        resizeObserver?.disconnect();
        resizeObserver = null;
        releaseBackgroundInert?.();
        releaseBackgroundInert = null;
        lightbox.hidden = true;
        document.body.classList.remove("image-lightbox-open");
    };
}
