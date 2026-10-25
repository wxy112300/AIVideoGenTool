/** Keep decoded thumbnails when a state update requires fresh card markup. */
export function reuseHistoryCovers(root: ParentNode, previous: ParentNode): number {
  const selector = "[data-history-media], [data-image-media-surface=gallery]";
  const key = (surface: HTMLElement): string => {
    const image = surface.querySelector<HTMLImageElement>("img");
    if (surface.hasAttribute("data-history-media") ? !surface.dataset.coverKey : !image?.dataset.imageHistoryCacheKey) return "";
    return surface.hasAttribute("data-history-media")
      ? JSON.stringify(["video", surface.dataset.coverKey, surface.dataset.coverSource, surface.dataset.historySrc])
      : JSON.stringify(["image", image?.dataset.imageHistoryCacheKey, surface.dataset.imageMediaSource, image?.dataset.imageMediaUrl]);
  };
  const cached = new Map([...previous.querySelectorAll<HTMLElement>(selector)].map(surface => [key(surface), surface]));
  let restored = 0;
  for (const surface of root.querySelectorAll<HTMLElement>(selector)) {
    const cacheKey = key(surface);
    if (!cacheKey) continue;
    const old = cached.get(cacheKey);
    const image = old?.querySelector<HTMLImageElement>("img");
    const fresh = surface.querySelector<HTMLImageElement>("img");
    if (!old || !image || !fresh || !image.getAttribute("src") || !image.complete || !image.naturalWidth) continue;
    image.alt = fresh.alt;
    fresh.replaceWith(image);
    if (surface.hasAttribute("data-history-media")) {
      surface.classList.remove("media-loading", "media-error");
      surface.classList.add("has-history-cover");
      for (const name of ["historyCoverCached", "historyCoverRefinement"]) {
        if (old.dataset[name]) surface.dataset[name] = old.dataset[name];
      }
    } else {
      surface.classList.remove("image-media-loading", "image-media-error", "image-media-unavailable");
      surface.classList.add("image-media-ready");
      surface.dataset.imageMediaHasReady = "true";
      surface.dataset.imageMediaPendingState = "ready";
      const status = surface.querySelector<HTMLElement>("[data-image-media-status]");
      if (status) status.hidden = true;
    }
    restored++;
  }
  return restored;
}
