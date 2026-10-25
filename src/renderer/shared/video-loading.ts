/** Feedback preserves the player; only an explicit retry reloads its media. */
export function mountVideoLoading(root: ParentNode, label: string, failure?: { label: string; retry: string }): () => void {
  const events = new AbortController();
  const overlays: HTMLElement[] = [];
  root.querySelectorAll<HTMLVideoElement>(".history-player video").forEach(video => {
    const player = video.closest<HTMLElement>(".history-player");
    if (!player) return;
    const overlay = document.createElement("div");
    overlay.className = "video-buffering-status";
    overlay.slot = "centered-chrome";
    overlay.setAttribute("noautohide", "");
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-label", label);
    const spinner = document.createElement("span");
    spinner.className = "history-loading-spinner";
    spinner.setAttribute("aria-hidden", "true");
    overlay.append(spinner);
    const message = document.createElement("span");
    message.className = "video-playback-error";
    message.textContent = failure?.label ?? "";
    message.hidden = true;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "secondary video-playback-retry";
    retry.textContent = failure?.retry ?? "";
    retry.hidden = true;
    overlay.append(message, retry);
    overlay.hidden = true;
    player.append(overlay);
    overlays.push(overlay);
    const waiting = () => {
      overlay.classList.remove("is-error");
      overlay.setAttribute("role", "status");
      overlay.setAttribute("aria-label", label);
      spinner.hidden = false; message.hidden = true; retry.hidden = true;
      overlay.hidden = false; video.setAttribute("aria-busy", "true");
    };
    const ready = () => { overlay.hidden = true; video.removeAttribute("aria-busy"); };
    const failed = () => {
      ready();
      if (!failure) return;
      overlay.hidden = false;
      overlay.classList.add("is-error");
      overlay.setAttribute("role", "alert");
      overlay.setAttribute("aria-label", failure.label);
      spinner.hidden = true; message.hidden = false; retry.hidden = false;
    };
    retry.addEventListener("click", event => {
      event.stopPropagation();
      waiting(); video.load();
      void video.play().catch(() => { if (video.error) failed(); else ready(); });
    }, { signal: events.signal });
    retry.addEventListener("dblclick", event => event.stopPropagation(), { signal: events.signal });
    const check = () => { if (video.readyState < 3 && !video.paused) waiting(); };
    for (const event of ["waiting", "loadstart"]) video.addEventListener(event, waiting, { signal: events.signal });
    for (const event of ["stalled", "seeking", "play"]) video.addEventListener(event, check, { signal: events.signal });
    for (const event of ["playing", "canplay", "seeked", "pause", "ended", "emptied", "abort"]) video.addEventListener(event, () => video.error ? failed() : ready(), { signal: events.signal });
    video.addEventListener("error", failed, { signal: events.signal });
    if (video.getAttribute("src") && video.readyState < 2 && !video.error) waiting();
    else if (video.error) failed();
  });
  return () => {
    events.abort();
    root.querySelectorAll(".history-player video[aria-busy]").forEach(video => video.removeAttribute("aria-busy"));
    overlays.forEach(overlay => overlay.remove());
  };
}
