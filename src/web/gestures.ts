export interface WatchGestureActions {
  tap(center: boolean): void;
  move(direction: -1 | 1): void;
  speed(active: boolean): void;
}

/** One pointer owns one action. Cancelling always releases temporary playback speed. */
export function mountWatchGestures(root: HTMLElement, actions: WatchGestureActions): () => void {
  const events = new AbortController();
  const signal = events.signal;
  let pointer: { id: number; x: number; y: number; time: number; moved: boolean; long: boolean } | null = null;
  let timer = 0;
  let wheelTime = 0;
  const cancel = () => {
    clearTimeout(timer);
    if (pointer?.long) actions.speed(false);
    pointer = null;
  };
  root.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0 || (event.target as Element).closest("button,input,select,dialog,a")) return;
    const rect = root.getBoundingClientRect();
    // Leave the browser edges and iOS Home indicator region to native navigation.
    const safeBottom = Number.parseFloat(getComputedStyle(root).getPropertyValue("--watch-safe-bottom")) || 0;
    if (event.clientX - rect.left < 18 || rect.right - event.clientX < 18 || event.clientY >= rect.bottom - safeBottom) return;
    cancel();
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(), moved: false, long: false };
    root.setPointerCapture?.(event.pointerId);
    timer = window.setTimeout(() => {
      if (pointer && !pointer.moved) { pointer.long = true; actions.speed(true); }
    }, 350);
  }, { signal });
  root.addEventListener("pointermove", (event) => {
    if (!pointer || pointer.id !== event.pointerId || pointer.long) return;
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 10) {
      pointer.moved = true; clearTimeout(timer);
    }
  }, { signal });
  root.addEventListener("pointerup", (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const start = pointer;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const elapsed = Math.max(1, performance.now() - start.time);
    cancel();
    if (start.long) return;
    if (start.moved) {
      if (Math.abs(dy) > Math.abs(dx) * 1.25 && (Math.abs(dy) >= 56 || (Math.abs(dy) > 24 && Math.abs(dy) / elapsed > 0.5))) {
        actions.move(dy < 0 ? 1 : -1);
      }
      return;
    }
    const rect = root.getBoundingClientRect();
    const x = (start.x - rect.left) / rect.width;
    const y = (start.y - rect.top) / rect.height;
    actions.tap(x >= 0.28 && x <= 0.72 && y >= 0.3 && y <= 0.7);
  }, { signal });
  root.addEventListener("pointercancel", cancel, { signal });
  root.addEventListener("lostpointercapture", (event) => {
    // A deferred loss from a prior tap must not cancel a newly captured hold.
    if (!pointer || pointer.id !== event.pointerId || root.hasPointerCapture?.(event.pointerId)) return;
    cancel();
  }, { signal });
  root.addEventListener("wheel", (event) => {
    if ((event.target as Element).closest("dialog,input,select")) return;
    event.preventDefault();
    if (Math.abs(event.deltaY) > 32 && performance.now() - wheelTime > 450) {
      wheelTime = performance.now(); actions.move(event.deltaY > 0 ? 1 : -1);
    }
  }, { signal, passive: false });
  window.addEventListener("blur", cancel, { signal });
  document.addEventListener("visibilitychange", cancel, { signal });
  return () => { cancel(); events.abort(); };
}
