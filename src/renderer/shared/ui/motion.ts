export function reducedMotion(): boolean {
  const mode = document.documentElement.dataset.motion;
  return mode === "reduced" || (mode !== "standard" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));
}

/** Animation ownership follows the element; callers cancel on disposal. */
export function animateUi(element: HTMLElement, frames: Keyframe[], duration = 160, delay = 0): Animation | undefined {
  if (!element.animate) return;
  return element.animate(reducedMotion() ? [{ opacity: frames[0]?.opacity ?? 1 }, { opacity: frames.at(-1)?.opacity ?? 1 }] : frames,
    { duration: reducedMotion() ? Math.min(duration, 120) : duration, delay: reducedMotion() ? 0 : delay, fill: "backwards", easing: "cubic-bezier(.2,.8,.2,1)" });
}

export function captureLayout(elements: Iterable<HTMLElement>): Map<HTMLElement, DOMRect> {
  return new Map(Array.from(elements, (element) => [element, element.getBoundingClientRect()]));
}

export function animateLayout(before: Map<HTMLElement, DOMRect>): Animation[] {
  if (reducedMotion()) return [];
  return [...before].flatMap(([element, old]) => {
    if (!element.isConnected) return [];
    const next = element.getBoundingClientRect();
    const x = old.left - next.left, y = old.top - next.top;
    if (!x && !y) return [];
    const animation = animateUi(element, [{ transform: `translate(${x}px,${y}px)` }, { transform: "translate(0,0)" }], 240);
    return animation ? [animation] : [];
  });
}
