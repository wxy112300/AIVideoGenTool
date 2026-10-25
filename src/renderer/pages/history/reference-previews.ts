import type { RendererContext, RendererCleanup } from "../../contracts";
import { uiKeys } from "../../../core/i18n-keys";

/** Read only visible snapshot previews; ignore late results after leaving detail. */
export function mountHistoryReferencePreviews(context: RendererContext): RendererCleanup {
  let disposed = false;
  let dialog: HTMLDialogElement | undefined;
  let viewerRevision = 0;
  const reads = new Map<string, Promise<string | null>>();
  const load = (image: HTMLImageElement) => {
    const path = image.dataset.historyReferencePreview;
    if (!path || disposed) return;
    let read = reads.get(path);
    if (!read) {
      read = context.assets.readImage(path).catch(() => null);
      reads.set(path, read);
    }
    void read.then(url => {
      if (disposed || !image.isConnected) return;
      image.dataset.imageMediaUrl = url ?? "";
      image.dispatchEvent(new Event("image-media-source-change"));
      if (url) image.src = url;
      const surface = image.closest<HTMLElement>("[data-history-reference-open]");
      const fallback = surface?.querySelector<HTMLElement>(".history-reference-fallback");
      if (fallback) fallback.hidden = Boolean(url);
    });
  };
  const show = async (event: Event) => {
    const trigger = (event.target as Element).closest<HTMLElement>("[data-history-reference-open]");
    if (!trigger || !context.root.contains(trigger)) return;
    dialog?.close(); dialog?.remove();
    const revision = ++viewerRevision;
    const current = document.createElement("dialog"); dialog = current;
    const playing = Array.from(context.root.querySelectorAll<HTMLVideoElement>(".history-player video")).filter(video => !video.paused);
    playing.forEach(video => video.pause());
    current.className = "history-reference-viewer";
    current.setAttribute("aria-label", trigger.getAttribute("aria-label") ?? "");
    const header = document.createElement("header");
    const title = document.createElement("strong");
    title.textContent = trigger.closest("figure")?.querySelector("figcaption")?.textContent ?? "";
    const close = document.createElement("button"); close.type = "button";
    close.className = "ghost"; close.textContent = "×";
    close.setAttribute("aria-label", context.t(uiKeys.history.lightboxClose));
    close.onclick = () => current.close();
    header.append(title, close); current.append(header);
    const stage = document.createElement("div"); stage.className = "history-reference-viewer-stage";
    const status = document.createElement("p"); status.setAttribute("role", "status");
    status.textContent = context.t(uiKeys.history.card.loadingCover); stage.append(status); current.append(stage);
    current.addEventListener("close", () => { ++viewerRevision; current.querySelector("video")?.pause(); current.remove(); if (!disposed && trigger.isConnected) { trigger.focus({ preventScroll: true }); playing.forEach(video => { if (video.isConnected) void video.play().catch(() => undefined); }); } });
    current.addEventListener("click", e => { if (e.target === current) current.close(); });
    context.root.append(current); current.showModal(); close.focus();
    const path = trigger.dataset.historyReferenceOpen!;
    const video = trigger.dataset.historyReferenceKind === "video";
    const url = video ? `studio-media://draft/reference-video?source=${encodeURIComponent(path)}` : await context.assets.readImage(path).catch(() => null);
    if (disposed || viewerRevision !== revision || !current.isConnected) return;
    if (!url) status.textContent = context.t(uiKeys.history.page.currentFileUnavailable);
    const media = document.createElement(video ? "video" : "img");
    media.addEventListener(video ? "loadeddata" : "load", () => { status.hidden = true; });
    media.addEventListener("error", () => { status.hidden = false; status.textContent = context.t(uiKeys.history.page.currentFileUnavailable); media.hidden = true; });
    if (media instanceof HTMLVideoElement) { media.controls = true; media.playsInline = true; }
    else media.alt = title.textContent;
    if (url) media.src = url; else media.hidden = true;
    stage.append(media);
    const original = trigger.dataset.historyReferenceOriginal;
    if (original && original !== path) {
      const button = document.createElement("button"); button.type = "button"; button.className = "ghost";
      button.textContent = context.t(uiKeys.history.page.originalMaterial); header.insertBefore(button, close);
      button.onclick = async () => {
        const source = await context.assets.readImage(original).catch(() => null);
        if (disposed || !current.isConnected) return;
        if (source) { status.hidden = false; media.hidden = false; media.src = source; button.disabled = true; }
        else { status.hidden = false; status.textContent = context.t(uiKeys.history.page.currentFileUnavailable); }
      };
    }
  };
  context.root.addEventListener("click", show);
  const images = context.root.querySelectorAll<HTMLImageElement>("[data-history-reference-preview]");
  const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      observer?.unobserve(entry.target); load(entry.target as HTMLImageElement);
    }
  }, { rootMargin: "200px" });
  images.forEach(image => {
    image.addEventListener("error", () => { const fallback = image.parentElement?.querySelector<HTMLElement>(".history-reference-fallback"); if (fallback) { fallback.hidden = false; image.hidden = true; } });
    if (observer) observer.observe(image); else load(image);
  });
  const videos = context.root.querySelectorAll<HTMLVideoElement>("[data-history-reference-video]");
  const videoObserver = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) { videoObserver?.unobserve(entry.target); const video = entry.target as HTMLVideoElement; video.preload = "metadata"; video.src = video.dataset.historyReferenceVideo!; } });
  }, { rootMargin: "200px" });
  videos.forEach(video => {
    video.addEventListener("error", () => { const fallback = video.parentElement?.querySelector<HTMLElement>(".history-reference-fallback"); if (fallback) fallback.hidden = false; });
    if (videoObserver) videoObserver.observe(video);
    else { video.preload = "metadata"; video.src = video.dataset.historyReferenceVideo!; }
  });
  return () => { disposed = true; ++viewerRevision; dialog?.close(); dialog?.remove(); context.root.removeEventListener("click", show); observer?.disconnect(); videoObserver?.disconnect(); reads.clear(); videos.forEach(video => { video.removeAttribute("src"); video.load(); }); };
}
