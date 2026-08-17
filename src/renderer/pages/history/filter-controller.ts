import {
  defaultHistoryFilter,
  normalizeHistoryFilter,
  type HistoryFilterState,
  type HistorySort
} from "../../../core/history-filter";
import type { HistoryRating } from "../../../types";
import type { RendererCleanup, RendererContext } from "../../contracts";

export interface HistoryFilterControllerOptions {
  getFilter(): HistoryFilterState;
  setFilter(filter: HistoryFilterState): void;
  getPanelOpen(): boolean;
  setPanelOpen(open: boolean): void;
}

function stop(event: Event): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function ratingValue(value: string): HistoryRating | null {
  const number = Number(value);
  return number >= 0.5 && number <= 5 && Number.isInteger(number * 2)
    ? number as HistoryRating
    : null;
}

function syncPanelDom(root: ParentNode, open: boolean): void {
  const panel = root.querySelector<HTMLElement>("[data-history-filter-panel]");
  const toggle = root.querySelector<HTMLButtonElement>("[data-history-filter-toggle]");
  if (panel) {
    panel.hidden = !open;
    panel.classList.toggle("is-open", open);
  }
  toggle?.setAttribute("aria-expanded", String(open));
}

export function mountHistoryFilterController(
  context: RendererContext,
  options: HistoryFilterControllerOptions
): RendererCleanup {
  const events = new AbortController();
  const signal = events.signal;
  const root = context.root;
  const commit = (patch: Partial<HistoryFilterState>) => {
    options.setFilter(normalizeHistoryFilter({ ...options.getFilter(), ...patch }));
    context.reportUserAction("history-filter-change", patch as Record<string, unknown>);
    context.requestRender();
  };

  root.querySelector<HTMLButtonElement>("[data-history-filter-toggle]")?.addEventListener("click", (event) => {
    stop(event);
    const open = !options.getPanelOpen();
    options.setPanelOpen(open);
    syncPanelDom(root, open);
  }, { signal });

  document.addEventListener("pointerdown", (event) => {
    if (!options.getPanelOpen()) return;
    const target = event.target;
    if (target instanceof Node && root.querySelector("[data-history-filter-anchor]")?.contains(target)) return;
    options.setPanelOpen(false);
    syncPanelDom(root, false);
  }, { signal });

  root.querySelectorAll<HTMLElement>("[data-history-filter-field]").forEach((field) => {
    field.addEventListener("change", (event) => {
      stop(event);
      const name = field.dataset.historyFilterField;
      if (!name) return;
      if (name === "favoriteOnly" && field instanceof HTMLInputElement) {
        commit({ favoriteOnly: field.checked });
      } else if (name === "minRating" || name === "maxRating") {
        commit({ [name]: ratingValue((field as HTMLSelectElement).value) });
      } else if (name === "minDuration") {
        const value = Number((field as HTMLSelectElement).value);
        commit({ minDuration: Number.isFinite(value) && value >= 0 ? value : null });
      } else if (name === "modelId") {
        commit({ modelId: (field as HTMLSelectElement).value });
      } else if (name === "sort") {
        commit({ sort: (field as HTMLSelectElement).value as HistorySort });
      }
    }, { signal });
  });

  root.querySelector<HTMLButtonElement>("[data-history-filter-clear]")?.addEventListener("click", (event) => {
    stop(event);
    options.setFilter({ ...defaultHistoryFilter });
    context.reportUserAction("history-filter-clear");
    context.requestRender();
  }, { signal });

  return () => events.abort();
}
