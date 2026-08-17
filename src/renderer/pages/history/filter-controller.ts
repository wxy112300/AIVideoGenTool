import {
  defaultHistoryFilter,
  normalizeHistoryFilter,
  type HistoryFilterState,
  type HistoryRating,
  type HistorySort
} from "../../../core/history-filter";
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
  return number >= 1 && number <= 5 && Number.isInteger(number)
    ? number as HistoryRating
    : null;
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
    options.setPanelOpen(!options.getPanelOpen());
    context.requestRender();
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
