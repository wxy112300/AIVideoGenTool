/** Pointer capture owns scrubbing; media seeks are coalesced instead of queuing every move. */
export function mountSeek(range: HTMLInputElement, video: HTMLVideoElement, paint: (time: number) => void, state: (active: boolean) => void): { sync(): void; cancel(): void } {
  let pointer: number | null = null;
  let target = 0;
  let pending = false;
  let resume = false;
  let frame = 0;
  // The native range's thumb uses a shorter track than its element width. Capture
  // touch on the full-width wrapper so UA dragging cannot overwrite our exact mapping.
  const hit = range.closest<HTMLElement>("[data-seek]") ?? range;
  const valid = () => Number.isFinite(video.duration) && video.duration > 0;
  const draw = (time: number) => {
    range.value = String(valid() ? time / video.duration * 1000 : 0);
    range.style.setProperty("--progress", `${Number(range.value) / 10}%`);
    range.setAttribute("aria-valuetext", `${time.toFixed(1)} / ${valid() ? video.duration.toFixed(1) : 0}`);
    paint(time);
  };
  const flush = () => {
    frame = 0;
    if (pending && !video.seeking && valid()) { pending = false; video.currentTime = target; }
  };
  const request = () => { if (!frame) frame = requestAnimationFrame(flush); };
  const position = (x: number) => {
    const rect = range.getBoundingClientRect();
    target = Math.max(0, Math.min(1, (x - rect.left) / rect.width)) * video.duration;
    draw(target); pending = true; request();
  };
  const finish = (event?: PointerEvent) => {
    if (pointer === null || event && event.pointerId !== pointer) return;
    if (event?.type === "pointerup") position(event.clientX);
    const id = pointer; pointer = null;
    if (hit.hasPointerCapture?.(id)) hit.releasePointerCapture(id);
    cancelAnimationFrame(frame); frame = 0;
    // Final position is exact, including when an earlier preview seek is still pending.
    pending = false; if (valid()) video.currentTime = target;
    state(false);
    if (resume && !document.hidden) void video.play().catch(() => {});
  };
  hit.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0 || !valid()) return;
    event.preventDefault(); event.stopPropagation();
    pointer = event.pointerId; resume = !video.paused; video.pause();
    hit.setPointerCapture?.(pointer); state(true); position(event.clientX);
  });
  hit.addEventListener("pointermove", (event) => { if (pointer === event.pointerId) { event.preventDefault(); position(event.clientX); } });
  hit.addEventListener("pointerup", finish);
  hit.addEventListener("pointercancel", finish);
  hit.addEventListener("lostpointercapture", finish);
  range.addEventListener("input", () => {
    if (pointer !== null || !valid()) return;
    target = Number(range.value) / 1000 * video.duration; draw(target); video.currentTime = target;
  });
  video.addEventListener("seeked", () => { if (pending) request(); });
  return {
    sync: () => { if (pointer === null) draw(video.currentTime); },
    cancel: () => { pointer = null; pending = false; resume = false; cancelAnimationFrame(frame); frame = 0; state(false); }
  };
}
