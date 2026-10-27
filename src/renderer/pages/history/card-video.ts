/** Gallery covers do not need a media element. Create one only for interaction. */
export function historyCardVideo(media: HTMLElement, create = false): HTMLVideoElement | null {
  const existing = media.querySelector<HTMLVideoElement>("video");
  if (existing || !create || !media.dataset.historySrc) return existing;
  const video = document.createElement("video");
  video.dataset.historySrc = media.dataset.historySrc;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "none";
  media.prepend(video);
  return video;
}

/** Keep the decoded cover until the requested preview frame reaches the compositor. */
export function historyPreviewPresentation(media: HTMLElement, video: HTMLVideoElement, signal: AbortSignal) {
  let generation = 0;
  let active = false;
  let frame: number | null = null;
  let fallback: number | null = null;
  let pending: number | null = null;
  const cancel = () => {
    if (frame !== null) video.cancelVideoFrameCallback?.(frame);
    if (fallback !== null) cancelAnimationFrame(fallback);
    if (pending !== null) clearTimeout(pending);
    frame = fallback = pending = null;
  };
  const stop = () => {
    active = false; generation++; cancel();
    media.classList.remove("preview-ready", "preview-pending");
  };
  const requestFrame = () => {
    if (!active || signal.aborted || frame !== null || fallback !== null) return;
    const current = generation;
    const ready = () => {
      if (!active || signal.aborted || generation !== current || !media.isConnected) return;
      if (video.readyState < 2 || video.seeking) { requestFrame(); return; }
      if (pending !== null) clearTimeout(pending);
      pending = null;
      media.classList.remove("preview-pending");
      media.classList.add("preview-ready");
    };
    if (typeof video.requestVideoFrameCallback === "function") {
      frame = video.requestVideoFrameCallback(() => {
        if (generation !== current) return;
        frame = null; ready();
      });
    } else if (video.readyState >= 2 && !video.seeking) {
      fallback = requestAnimationFrame(() => { if (generation !== current) return; fallback = null; ready(); });
    }
  };
  for (const name of ["playing", "loadeddata", "seeked"]) video.addEventListener(name, requestFrame, { signal });
  video.addEventListener("error", stop, { signal });
  signal.addEventListener("abort", stop, { once: true });
  return {
    start() {
      stop(); active = true;
      pending = window.setTimeout(() => {
        pending = null;
        if (active && !signal.aborted) media.classList.add("preview-pending");
      }, 250);
      requestFrame();
      return generation;
    },
    isCurrent(attempt: number) { return active && generation === attempt; },
    stop
  };
}
