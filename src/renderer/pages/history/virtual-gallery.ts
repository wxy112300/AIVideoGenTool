import type { RendererCleanup } from "../../contracts";
import { primeSharedUi, refreshSharedUi } from "../../shared/ui/runtime";
import { renderIcons } from "../../shared/icons";
import { reuseHistoryCovers } from "./retained-covers";
import { historyWindowIndexes, layoutHistoryWindow, type HistoryVirtualItem, type HistoryVirtualLayout } from "./virtual-layout";

interface Plan { items: HistoryVirtualItem[]; render(index: number): string }
interface State extends Plan {
  layout: HistoryVirtualLayout;
  indexes: Map<string, number>;
  cache: Map<number, HTMLElement>;
  mounted: Map<number, RendererCleanup>;
  width: number;
  mode: string;
  source?: ParentNode;
  update?: () => void;
}
const pending = new Map<string, Plan>();
const states = new WeakMap<HTMLElement, State>();
let sequence = 0;
export const HISTORY_VIRTUAL_THRESHOLD = 80;

/** Only metadata/closures, never an HTML tree for every record. Plans are consumed on commit. */
export function registerHistoryWindow(items: HistoryVirtualItem[], render: Plan["render"]): string {
  const token = String(++sequence);
  pending.set(token, { items, render });
  while (pending.size > 8) pending.delete(pending.keys().next().value!);
  return token;
}

function stateFor(gallery: HTMLElement): State | undefined {
  const existing = states.get(gallery);
  if (existing) return existing;
  const plan = pending.get(gallery.dataset.historyVirtual ?? "");
  if (!plan) return;
  pending.delete(gallery.dataset.historyVirtual!);
  const state: State = { ...plan, indexes: new Map(plan.items.map((item, i) => [item.id, i])), layout: { boxes: [], height: 0 }, cache: new Map(), mounted: new Map(), width: 0, mode: "" };
  states.set(gallery, state);
  gallery.dataset.historyVirtualCount = String(plan.items.length);
  return state;
}

function calculate(gallery: HTMLElement, state: State): void {
  const width = gallery.clientWidth || 1;
  const mode = gallery.classList.contains("album") ? "album" : "masonry";
  if (state.width === width && state.mode === mode) return;
  state.width = width; state.mode = mode;
  state.layout = layoutHistoryWindow(state.items, width, mode);
  gallery.style.height = `${state.layout.height}px`;
  gallery.dispatchEvent(new Event("history-virtual-layout", { bubbles: true }));
}

export function virtualHistoryBox(gallery: HTMLElement | null, id: string) {
  const state = gallery && stateFor(gallery);
  if (!state) return;
  calculate(gallery!, state);
  const index = state.indexes.get(id);
  return index === undefined ? undefined : state.layout.boxes[index];
}

export function refreshVirtualHistory(gallery: HTMLElement): void { states.get(gallery)?.update?.(); }

/** Called before early scroll restoration; no media subscriptions are started here. */
export function prepareVirtualHistory(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>("[data-history-virtual]").forEach(gallery => {
    const state = stateFor(gallery);
    if (state) calculate(gallery, state);
  });
}

export function retainVirtualHistoryCovers(root: ParentNode, previous: ParentNode): void {
  const gallery = root.querySelector<HTMLElement>("[data-history-virtual]");
  if (!gallery) return;
  const state = stateFor(gallery);
  if (!state) return;
  const source = document.createDocumentFragment();
  previous.querySelectorAll<HTMLElement>(".history-gallery-item").forEach(card => source.append(card));
  state.source = source;
}

export function mountVirtualHistory(root: HTMLElement, mountCard: (card: HTMLElement) => RendererCleanup): RendererCleanup {
  const gallery = root.querySelector<HTMLElement>("[data-history-virtual]");
  const state = gallery && stateFor(gallery);
  if (!gallery || !state) return () => undefined;
  const events = new AbortController(), { signal } = events;
  let frame = 0;
  const update = () => {
    frame = 0;
    calculate(gallery, state);
    const origin = gallery.getBoundingClientRect().top;
    const active = document.activeElement?.closest<HTMLElement>(".history-gallery-item");
    const pinned = active && gallery.contains(active) ? state.indexes.get(active.dataset.history ?? "") ?? -1 : -1;
    const buffer = Math.max(600, window.innerHeight);
    const indexes = historyWindowIndexes(state.layout, -origin - buffer, -origin + window.innerHeight + buffer, pinned);
    const wanted = new Set(indexes);
    let changed = false;
    for (const [index, cleanup] of state.mounted) if (!wanted.has(index)) {
      cleanup(); state.mounted.delete(index); state.cache.get(index)?.remove();
      changed = true;
    }
    // A preserved detail-return fragment still contains its former window,
    // but its subscriptions were disposed. Drop stale nodes after a viewport
    // or anchor change even when they are no longer in the mounted map.
    for (const node of [...gallery.children]) if (!wanted.has(Number((node as HTMLElement).dataset.historyOrder))) {
      node.remove(); changed = true;
    }
    for (const index of indexes) {
      let card = state.cache.get(index);
      if (!card) {
        const template = document.createElement("template"); template.innerHTML = state.render(index);
        primeSharedUi(template.content); renderIcons(template.content);
        card = template.content.firstElementChild as HTMLElement;
        state.cache.set(index, card);
        if (state.source) reuseHistoryCovers(card, state.source);
      }
      const box = state.layout.boxes[index]!;
      card.style.width = `${box.width}px`; card.style.left = `${box.left}px`; card.style.top = `${box.top}px`;
      if (!state.mounted.has(index)) {
        // Keep DOM order chronological even when the shortest column differs.
        const next = [...gallery.children].find(node => Number((node as HTMLElement).dataset.historyOrder) > index);
        gallery.insertBefore(card, next ?? null);
        state.mounted.set(index, mountCard(card)); refreshSharedUi(card); changed = true;
      }
    }
    // A bounded detached cache keeps decoded covers warm without retaining the library DOM.
    for (const [index, card] of state.cache) if (state.cache.size > 100 && !state.mounted.has(index)) { card.remove(); state.cache.delete(index); }
    if (changed) gallery.dispatchEvent(new Event("history-window-change", { bubbles: true }));
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  state.update = update;
  update();
  window.addEventListener("scroll", schedule, { signal, passive: true });
  const resize = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => {
    if (gallery.clientWidth === state.width) return;
    const origin = gallery.getBoundingClientRect().top;
    const anchor = [...state.mounted.keys()].find(i => { const b = state.layout.boxes[i]!; return b.top + origin >= 0; });
    const oldTop = anchor === undefined ? 0 : state.layout.boxes[anchor]!.top + origin;
    update();
    if (anchor !== undefined) { window.scrollBy({ top: state.layout.boxes[anchor]!.top + gallery.getBoundingClientRect().top - oldTop, behavior: "auto" }); update(); }
  });
  resize?.observe(gallery);
  gallery.addEventListener("keydown", event => {
    if (event.key !== "Tab") return;
    const card = (event.target as Element).closest<HTMLElement>(".history-gallery-item");
    const index = card ? state.indexes.get(card.dataset.history ?? "") : undefined;
    if (!card || index === undefined) return;
    const focusable = [card, ...card.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]')];
    if (event.target !== (event.shiftKey ? focusable[0] : focusable.at(-1))) return;
    const next = index + (event.shiftKey ? -1 : 1), box = state.layout.boxes[next];
    if (!box) return;
    event.preventDefault();
    const top = gallery.getBoundingClientRect().top + window.scrollY + box.top;
    if (top < window.scrollY + 150 || top + box.height > window.scrollY + window.innerHeight) window.scrollTo({ top: Math.max(0, top - 160), behavior: "auto" });
    update();
    const target = state.cache.get(next);
    const last = target?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]');
    (event.shiftKey ? last?.[last.length - 1] ?? target : target)?.focus({ preventScroll: true });
  }, { signal });
  return () => {
    events.abort(); resize?.disconnect(); cancelAnimationFrame(frame); state.update = undefined;
    for (const cleanup of state.mounted.values()) cleanup();
    state.mounted.clear();
  };
}
