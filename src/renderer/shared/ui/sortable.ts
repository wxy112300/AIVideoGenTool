import { animateLayout, captureLayout } from "./motion";

export function moveListItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= items.length || to >= items.length) return [...items];
  const result = [...items]; const [item] = result.splice(from, 1); result.splice(to, 0, item!); return result;
}

/** Small ordered lists; the caller owns persistence and any compatibility checks. */
export function mountSortable(container: HTMLElement, move: (from: number, to: number) => void): () => void {
  const events = new AbortController();
  const { signal } = events;
  let drag: { handle: HTMLElement; item: HTMLElement; from: number; y: number; top: number; height: number; pointer: number; target: number; style: string | null } | null = null;
  const items = () => Array.from(container.querySelectorAll<HTMLElement>(":scope > [data-sortable-item]"));
  const cancel = () => {
    if (!drag) return;
    const previous = drag; drag = null;
    if (previous.style === null) previous.item.removeAttribute("style"); else previous.item.setAttribute("style", previous.style);
    previous.item.classList.remove("ui-sort-dragging");
    if (previous.handle.hasPointerCapture?.(previous.pointer)) previous.handle.releasePointerCapture(previous.pointer);
  };
  container.addEventListener("keydown", (event) => {
    if (!(event.target instanceof HTMLElement) || !event.target.matches("[data-sortable-handle]") || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    const from = items().indexOf(event.target.closest<HTMLElement>("[data-sortable-item]")!);
    const to = from + (event.key === "ArrowUp" ? -1 : 1);
    event.preventDefault(); event.stopPropagation();
    if (from < 0 || to < 0 || to >= items().length) return;
    move(from, to);
  }, { signal });
  container.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    const handle = event.target.closest<HTMLElement>("[data-sortable-handle]");
    const item = handle?.closest<HTMLElement>("[data-sortable-item]");
    if (!handle || !item || !container.contains(item) || handle instanceof HTMLButtonElement && handle.disabled) return;
    const from = items().indexOf(item);
    const rect = item.getBoundingClientRect();
    drag = { handle, item, from, target: from, y: event.clientY, top: rect.top, height: rect.height, pointer: event.pointerId, style: item.getAttribute("style") };
    handle.setPointerCapture?.(event.pointerId); handle.focus({ preventScroll: true }); event.preventDefault();
  }, { signal });
  container.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const bounds = container.getBoundingClientRect();
    const offset = Math.max(bounds.top - drag.top, Math.min(bounds.bottom - drag.top - drag.height, event.clientY - drag.y));
    if (Math.abs(event.clientY - drag.y) < 5) return;
    drag.item.classList.add("ui-sort-dragging");
    drag.item.style.transform = `translateY(${offset}px)`;
    const others = items().filter((item) => item !== drag!.item);
    drag.target = others.filter((item) => event.clientY > item.getBoundingClientRect().top + item.offsetHeight / 2).length;
  }, { signal });
  container.addEventListener("pointerup", (event) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const { from, target } = drag;
    const before = captureLayout(items()); cancel();
    if (from !== target) { move(from, target); animateLayout(before); }
  }, { signal });
  container.addEventListener("pointercancel", cancel, { signal });
  container.addEventListener("lostpointercapture", cancel, { signal });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") cancel(); }, { signal });
  return () => { events.abort(); cancel(); };
}
