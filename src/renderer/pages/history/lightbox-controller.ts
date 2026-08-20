import type { RendererCleanup, RendererContext } from "../../contracts";
import { icon, renderIcons } from "../../shared/icons";
import { imageHistoryMediaUrl } from "./helpers";
import { uiKeys } from "../../../core/i18n-keys";

export interface ImageHistoryLightboxControllerOptions {
  getSelectedHistoryAssetId(): string;
  getSelectedHistoryVersionId(): string;
  setSelectedHistoryVersionId(versionId: string): void;
  setHistoryForwardTarget(target: { assetId: string; versionId: string }): void;
}

export function mountImageHistoryLightbox(
  context: RendererContext,
  options: ImageHistoryLightboxControllerOptions
): RendererCleanup {
  const events = new AbortController();
  const signal = events.signal;
  document.body.classList.remove("image-lightbox-open");
  const root = context.root;
  const lightbox = root.querySelector<HTMLElement>("[data-image-lightbox]");
  const openButton = root.querySelector<HTMLButtonElement>("[data-open-image-lightbox]");
  const dialog = lightbox?.querySelector<HTMLElement>(".image-lightbox-dialog");
  const stage = lightbox?.querySelector<HTMLElement>("[data-image-lightbox-stage]");
  const image = lightbox?.querySelector<HTMLImageElement>("[data-image-lightbox-image]");
  if (!lightbox || !openButton || !dialog || !stage || !image) return () => events.abort();

  lightbox.querySelector<HTMLElement>("[data-image-lightbox-version-controls]")?.remove();
  const versionFooter = document.createElement("footer");
  versionFooter.className = "image-lightbox-footer";
  versionFooter.setAttribute("data-image-lightbox-version-controls", "");
  versionFooter.innerHTML = `<div class="image-lightbox-version-controls" aria-label="${context.t(uiKeys.history.lightboxVersionSwitch)}"><button class="secondary button-with-icon" data-image-lightbox-version-navigation="-1">${icon("arrow-left")}${context.t(uiKeys.history.lightboxPrevious)}</button><span data-image-lightbox-version-label></span><button class="secondary button-with-icon" data-image-lightbox-version-navigation="1">${context.t(uiKeys.history.lightboxNext)}${icon("arrow-right")}</button></div>`;
  renderIcons(versionFooter);
  lightbox.querySelector<HTMLElement>(".image-lightbox-hint")?.before(versionFooter);
  const versionMeta = lightbox.querySelector<HTMLElement>(".image-lightbox-toolbar > div:first-child > span");
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let activePointerId: number | null = null;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let lightboxVersionChanged = false;
  const clampScale = (value: number) => Math.min(5, Math.max(1, value));
  const updateTransform = () => {
    image.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scale})`;
    stage.classList.toggle("is-zoomed", scale > 1);
  };
  const reset = () => {
    scale = 1;
    offsetX = 0;
    offsetY = 0;
    updateTransform();
  };
  const syncVersionNavigation = () => {
    const state = context.getState();
    const project = state?.imageHistory.find((item) => item.id === options.getSelectedHistoryAssetId());
    const currentIndex = project?.versions.findIndex((item) => item.id === options.getSelectedHistoryVersionId()) ?? -1;
    const current = currentIndex >= 0 ? project?.versions[currentIndex] : undefined;
    const previousVersion = currentIndex >= 0 ? project?.versions[currentIndex + 1] : undefined;
    const nextVersion = currentIndex >= 0 ? project?.versions[currentIndex - 1] : undefined;
    const entries = [[-1, previousVersion], [1, nextVersion]] as const;
    entries.forEach(([direction, targetVersion]) => {
      const button = versionFooter.querySelector<HTMLButtonElement>(`[data-image-lightbox-version-navigation="${direction}"]`);
      if (!button) return;
      const available = Boolean(project && targetVersion && imageHistoryMediaUrl(project, targetVersion));
      button.disabled = !available;
      button.title = targetVersion
        ? `${direction === -1 ? context.t(uiKeys.history.lightboxPrevious) : context.t(uiKeys.history.lightboxNext)} · ${context.t(uiKeys.history.version, { version: targetVersion.versionNumber })}`
        : direction === -1 ? context.t(uiKeys.history.lightboxEarliest) : context.t(uiKeys.history.lightboxLatest);
    });
    const label = versionFooter.querySelector<HTMLElement>("[data-image-lightbox-version-label]");
    if (label) label.textContent = project && current ? context.t(uiKeys.history.lightboxVersionLabel, { current: current.versionNumber, total: project.versions.length }) : "";
    if (versionMeta && project && current) {
      versionMeta.textContent = `${context.t(uiKeys.history.version, { version: current.versionNumber })} · ${current.width} × ${current.height}`;
    }
  };
  const navigateVersion = (direction: -1 | 1) => {
    const state = context.getState();
    const project = state?.imageHistory.find((item) => item.id === options.getSelectedHistoryAssetId());
    if (!project) return;
    const currentIndex = project.versions.findIndex((item) => item.id === options.getSelectedHistoryVersionId());
    if (currentIndex < 0) return;
    const targetVersion = project.versions[currentIndex - direction];
    const mediaUrl = targetVersion ? imageHistoryMediaUrl(project, targetVersion) : "";
    if (!targetVersion || !mediaUrl) return;
    options.setSelectedHistoryVersionId(targetVersion.id);
    options.setHistoryForwardTarget({ assetId: project.id, versionId: targetVersion.id });
    lightboxVersionChanged = true;
    context.reportUserAction("image-history-lightbox-version-navigation", {
      projectId: project.id,
      versionId: targetVersion.id,
      direction
    });
    const mediaSurface = image.closest<HTMLElement>("[data-image-media]");
    mediaSurface?.setAttribute("data-image-media-source", targetVersion.file.absolutePath ?? "");
    image.dataset.imageMediaUrl = mediaUrl;
    image.dispatchEvent(new Event("image-media-source-change"));
    image.src = mediaUrl;
    image.alt = `${project.title.trim() || context.t(uiKeys.history.card.untitledImage)} · ${context.t(uiKeys.history.version, { version: targetVersion.versionNumber })}`;
    reset();
    syncVersionNavigation();
  };
  const close = () => {
    lightbox.hidden = true;
    document.body.classList.remove("image-lightbox-open");
    if (lightboxVersionChanged) {
      lightboxVersionChanged = false;
      context.requestRender();
      window.requestAnimationFrame(() => {
        root.querySelector<HTMLButtonElement>("[data-open-image-lightbox]")?.focus();
      });
      return;
    }
    openButton.focus();
  };
  const open = () => {
    lightbox.hidden = false;
    document.body.classList.add("image-lightbox-open");
    lightboxVersionChanged = false;
    syncVersionNavigation();
    reset();
    window.requestAnimationFrame(() => dialog.focus());
  };

  openButton.addEventListener("click", open, { signal });
  versionFooter.querySelectorAll<HTMLButtonElement>("[data-image-lightbox-version-navigation]").forEach((button) => {
    button.addEventListener("click", () => {
      const direction = Number(button.dataset.imageLightboxVersionNavigation);
      if (direction === -1 || direction === 1) navigateVersion(direction);
    }, { signal });
  });
  lightbox.querySelectorAll<HTMLElement>("[data-image-lightbox-close]").forEach((button) => {
    button.addEventListener("click", close, { signal });
  });
  lightbox.querySelector<HTMLElement>("[data-image-lightbox-reset]")?.addEventListener("click", reset, { signal });
  stage.addEventListener("wheel", (event) => {
    if (lightbox.hidden) return;
    event.preventDefault();
    const rect = stage.getBoundingClientRect();
    const factor = event.deltaY < 0 ? 1.12 : 0.88;
    const nextScale = clampScale(scale * factor);
    if (nextScale === scale) return;
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
    if (lightbox.hidden || event.button !== 0 || scale <= 1) return;
    activePointerId = event.pointerId;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    stage.setPointerCapture(event.pointerId);
    stage.classList.add("is-panning");
    event.preventDefault();
  }, { signal });
  stage.addEventListener("pointermove", (event) => {
    if (event.pointerId !== activePointerId) return;
    offsetX += event.clientX - lastPointerX;
    offsetY += event.clientY - lastPointerY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    updateTransform();
  }, { signal });
  const stopPanning = (event: PointerEvent) => {
    if (event.pointerId !== activePointerId) return;
    activePointerId = null;
    stage.classList.remove("is-panning");
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
  };
  stage.addEventListener("pointerup", stopPanning, { signal });
  stage.addEventListener("pointercancel", stopPanning, { signal });
  stage.addEventListener("dblclick", (event) => {
    event.preventDefault();
    reset();
  }, { signal });
  document.addEventListener("keydown", (event) => {
    if (lightbox.hidden) return;
    if (event.key === "Escape") close();
    else if (event.key === "0") reset();
    else if (event.key === "ArrowLeft") navigateVersion(-1);
    else if (event.key === "ArrowRight") navigateVersion(1);
  }, { signal });

  return () => {
    events.abort();
    lightbox.hidden = true;
    document.body.classList.remove("image-lightbox-open");
  };
}
