import { reducedMotion } from "./motion";

export interface SegmentPosition { left: number; width: number; value: string; }

/** Keep the selected indicator continuous across renderer tree replacements. */
export function mountSegmented(group: HTMLElement, previous: SegmentPosition | undefined, remember: (position: SegmentPosition) => void): () => void {
  const events = new AbortController();
  let last = previous;
  let animation: Animation | undefined;
  const measure = () => {
    const selected = group.querySelector<HTMLButtonElement>('[aria-pressed="true"], [role="tab"][aria-selected="true"]');
    if (!selected) return;
    const next = { left: selected.offsetLeft, width: selected.offsetWidth, value: selected.id || String([...group.querySelectorAll("button")].indexOf(selected)) };
    const current = animation?.playState === "running" ? getComputedStyle(group, "::before") : undefined;
    const from = current ? { transform: current.transform, width: current.width } : last ? { transform: `translateX(${last.left}px)`, width: `${last.width}px` } : undefined;
    group.style.setProperty("--segment-left", `${next.left}px`);
    group.style.setProperty("--segment-width", `${next.width}px`);
    group.dataset.segmentReady = "";
    const heading = group.parentElement;
    if (heading?.classList.contains("create-page-heading")) document.documentElement.style.setProperty("--create-heading-h", `${heading.getBoundingClientRect().height}px`);
    if (last && last.value !== next.value && !reducedMotion()) {
      animation?.cancel();
      animation = group.animate?.([from!, { transform: `translateX(${next.left}px)`, width: `${next.width}px` }],
        { duration: 240, easing: getComputedStyle(group).getPropertyValue("--ease-spring").trim() || "cubic-bezier(.2,.8,.2,1)", pseudoElement: "::before" });
    }
    last = next; remember(next);
  };
  measure();
  const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
  observer?.observe(group);
  const selectionObserver = new MutationObserver(measure);
  selectionObserver.observe(group, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-pressed", "aria-selected"] });
  if (group.parentElement) observer?.observe(group.parentElement);
  group.addEventListener("keydown", event => {
    // Tab lists own their existing orientation and roving-tabindex behavior.
    if ((event.target as HTMLElement).getAttribute("role") === "tab") return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = [...group.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 :
      (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    event.preventDefault(); buttons[next]?.focus(); buttons[next]?.click();
  }, { signal: events.signal });
  return () => { events.abort(); observer?.disconnect(); selectionObserver.disconnect(); animation?.cancel(); };
}
