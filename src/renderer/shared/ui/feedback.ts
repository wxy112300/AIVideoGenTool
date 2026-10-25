/** Reserve the widest observed content width per logical action, not its container. */
export function createStableLabels() {
  const widths = new Map<string, number>();
  const measured = new WeakMap<HTMLButtonElement, string>();
  let locale = document.documentElement.lang;
  return (button: HTMLButtonElement) => {
    // Dependency buttons reserve running/cancel labels locally, only while active.
    // A queue/finalizing label must not widen the later idle install/update action.
    if (button.classList.contains("node-action-main")) {
      button.classList.remove("ui-stable-label");
      button.style.removeProperty("--ui-label-width");
      return;
    }
    if (!button.id && !button.dataset.installNode) return;
    if (locale !== document.documentElement.lang) { widths.clear(); locale = document.documentElement.lang; }
    const signature = `${locale}\0${button.textContent}\0${button.dataset.uiLabelVariants ?? ""}`;
    if (measured.get(button) === signature) return;
    const range = document.createRange(); range.selectNodeContents(button);
    if (typeof range.getBoundingClientRect !== "function") return;
    const style = getComputedStyle(button);
    const width = range.getBoundingClientRect().width + parseFloat(style.paddingLeft || "0") + parseFloat(style.paddingRight || "0") + 2;
    let candidateWidth = width;
    if (button.dataset.uiLabelVariants) {
      const canvas = document.createElement("canvas"); const context = canvas.getContext("2d");
      if (context) {
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        try {
          const candidates: unknown = JSON.parse(button.dataset.uiLabelVariants);
          if (Array.isArray(candidates)) {
            const label = button.querySelector<HTMLElement>("[data-enqueue-label]");
            const currentTextWidth = label?.getBoundingClientRect().width ?? context.measureText(button.textContent ?? "").width;
            for (const text of candidates) if (typeof text === "string") candidateWidth = Math.max(candidateWidth, width - currentTextWidth + context.measureText(text).width);
          }
        } catch { /* Malformed optional candidates do not affect the action. */ }
      }
    }
    const key = button.id || `install:${button.dataset.installNode}`;
    const reserved = Math.max(widths.get(key) ?? 0, candidateWidth);
    widths.set(key, reserved);
    if (button.style.getPropertyValue("--ui-label-width") !== `${Math.ceil(reserved)}px`) button.style.setProperty("--ui-label-width", `${Math.ceil(reserved)}px`);
    button.classList.add("ui-stable-label");
    measured.set(button, signature);
  };
}

export function paintProgressButton(button: HTMLButtonElement, progress?: number, queuePosition?: number): void {
  if (queuePosition && queuePosition > 0) button.dataset.uiQueued = String(queuePosition); else button.removeAttribute("data-ui-queued");
  const busy = button.getAttribute("aria-busy") === "true";
  button.classList.toggle("ui-progress-button", busy);
  if (!busy) { button.style.removeProperty("--ui-progress"); button.removeAttribute("data-ui-indeterminate"); return; }
  const known = typeof progress === "number" && Number.isFinite(progress);
  button.toggleAttribute("data-ui-indeterminate", !known);
  if (known) button.style.setProperty("--ui-progress", `${Math.max(0, Math.min(100, progress))}%`);
  // Do not disable the button or invent a cancel handler: its existing owner decides.
}

export function mountPointerLight(root: HTMLElement): () => void {
  const events = new AbortController();
  let frame = 0;
  let target: Element | null = null;
  let lit: HTMLElement | null = null;
  const clear = () => {
    lit?.classList.remove("ui-lit", "ui-lit-static");
    lit?.style.removeProperty("--ui-pointer-x");
    lit?.style.removeProperty("--ui-pointer-y");
    lit = null;
  };
  let x = 0, y = 0;
  root.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    target = event.target instanceof Element ? event.target : null; x = event.clientX; y = event.clientY;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const item = target?.closest<HTMLElement>(".panel, .ui-button, .drop-zone");
      if (!item || !item.isConnected || item.matches(":disabled") || item.closest(".history-player, .extend-video-player")) { clear(); return; }
      if (lit !== item) clear();
      lit = item;
      if (getComputedStyle(item).position === "static") item.classList.add("ui-lit-static");
      item.classList.add("ui-lit");
      const bounds = item.getBoundingClientRect();
      item.style.setProperty("--ui-pointer-x", `${x - bounds.left}px`);
      item.style.setProperty("--ui-pointer-y", `${y - bounds.top}px`);
    });
  }, { passive: true, signal: events.signal });
  root.addEventListener("pointerleave", clear, { signal: events.signal });
  window.addEventListener("blur", clear, { signal: events.signal });
  return () => { events.abort(); cancelAnimationFrame(frame); clear(); };
}
