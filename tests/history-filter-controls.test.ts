// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultHistoryFilter, normalizeHistoryFilter } from "../src/core/history-filter";
import { createTranslator } from "../src/core/i18n";
import { renderHistoryFilterPanel, renderHistoryFilterToggle } from "../src/renderer/pages/history/filter-view";
import { mountHistoryFilterController } from "../src/renderer/pages/history/filter-controller";
import { mountHistoryActionsController, type HistoryActionsControllerOptions } from "../src/renderer/pages/history/actions-controller";
import type { HistoryPageOptions, HistoryPageViewModel } from "../src/renderer/pages/history/page";
import type { RendererContext } from "../src/renderer/contracts";

let cleanup: (() => void) | undefined;
afterEach(() => { cleanup?.(); document.body.replaceChildren(); });
function setup() {
  let filter = normalizeHistoryFilter(defaultHistoryFilter), open = true;
  const view = { historyFilter: filter, historyFilterPanelOpen: true, historyKind: "video" } as HistoryPageViewModel;
  const options = { t: createTranslator("zh-CN").t, escapeHtml: (s: string) => s, icon: () => "", modelName: (id: string) => id } as HistoryPageOptions;
  const root = document.createElement("main"); document.body.append(root);
  root.innerHTML = renderHistoryFilterToggle(view, options) + '<div data-history-context>' + renderHistoryFilterPanel(view, options, ["h3", "moss"], ["scene", "draft"]) + '</div>';
  const requestRender = vi.fn(), clearBatchSelection = vi.fn();
  const context = { root, t: options.t, requestRender, reportUserAction: vi.fn() } as unknown as RendererContext;
  cleanup = mountHistoryFilterController(context, { getFilter: () => filter, setFilter: f => { filter = f; }, getPanelOpen: () => open, setPanelOpen: value => { open = value; }, getTagMode: () => "include", setTagMode: vi.fn(), clearBatchSelection });
  const click = (s: string) => root.querySelector<HTMLButtonElement>(s)!.click();
  return { root, context, click, requestRender, clearBatchSelection, filter: () => filter };
}
describe("History prototype filter controls", () => {
  it("toggles favorites without the artwork favorite controller intercepting the filter click", () => {
    const h = setup(), updateHistoryMetadata = vi.fn();
    const disposeActions = mountHistoryActionsController(h.context, { updateHistoryMetadata } as unknown as HistoryActionsControllerOptions);
    const disposeFilter = cleanup;
    cleanup = () => { disposeActions(); disposeFilter?.(); };
    h.click('[data-history-filter-favorite]');
    expect(h.filter().favoriteOnly).toBe(true);
    expect(h.root.querySelector('[data-history-filter-favorite]')!.getAttribute("aria-pressed")).toBe("true");
    h.click('[data-history-filter-favorite]');
    expect(h.filter().favoriteOnly).toBe(false);
    expect(h.requestRender).toHaveBeenCalledTimes(2);
    expect(updateHistoryMetadata).not.toHaveBeenCalled();
  });
  it("shows prototype rating bounds and leaves them unchanged when duration is dragged", () => {
    const h = setup();
    const label = () => h.root.querySelector('[data-history-rating-label]')!.textContent;
    const change = (name: string, value: string) => {
      const field = h.root.querySelector<HTMLInputElement>(`[data-history-filter-field="${name}"]`)!;
      field.value = value; field.dispatchEvent(new Event("input", { bubbles: true }));
    };
    expect(label()).toBe("不限");
    change("minDuration", "3"); expect(label()).toBe("不限");
    change("minRating", "3.5"); expect(label()).toBe("≥ 3.5★");
    change("maxRating", "4.5"); expect(label()).toBe("3.5–4.5★");
    change("minDuration", "4"); expect(label()).toBe("3.5–4.5★");
    change("minRating", "0"); expect(label()).toBe("≤ 4.5★");
    change("maxRating", "5"); expect(label()).toBe("不限");
    change("minRating", "5"); expect(label()).toBe("≥ 5★");
    expect(h.root.querySelector<HTMLInputElement>('[data-history-filter-field="minRating"]')!.style.zIndex).toBe("2");
  });
  it("keeps multi-select pickers open and marks result refresh for DOM preservation", () => {
    const h = setup(); h.click('[data-history-picker-trigger="models"]');
    h.root.querySelector<HTMLInputElement>('[data-history-model="h3"]')!.click();
    h.root.querySelector<HTMLInputElement>('[data-history-model="moss"]')!.click();
    expect(h.filter().modelIds).toEqual(["h3", "moss"]);
    expect(h.root.querySelector<HTMLElement>('[data-history-picker="models"]')!.hidden).toBe(false);
    expect(h.root.dataset.historyPreserveFilter).toBe("true");
    expect(h.clearBatchSelection).toHaveBeenCalledTimes(2);
    const sort = h.root.querySelector<HTMLSelectElement>('[data-history-filter-field="sort"]')!;
    sort.value = "oldest"; sort.dispatchEvent(new Event("change", { bubbles: true }));
    expect(h.clearBatchSelection).toHaveBeenCalledTimes(2);
  });
  it("switches each tag independently, preserves list order and search, and restores focus on Escape", () => {
    const h = setup(); h.click('[data-history-picker-trigger="tags"]');
    const search = h.root.querySelector<HTMLInputElement>('[data-history-tag-search]')!;
    search.value = "sc"; search.dispatchEvent(new Event("input", { bubbles: true }));
    h.click('[data-history-tag-row="scene"] [data-history-tag-operation="include"]');
    expect(h.filter().tags).toEqual(["scene"]);
    h.click('[data-history-tag-picked] [data-history-tag-operation="exclude"]');
    expect(h.filter().tags).toEqual([]); expect(h.filter().excludedTags).toEqual(["scene"]);
    const chip = h.root.querySelector<HTMLButtonElement>('[data-history-tag-picked] button')!;
    chip.focus();
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(h.root.querySelector('[data-history-tag-picked] button')).toBe(chip);
    expect(document.activeElement).toBe(chip);
    expect(search.value).toBe("sc");
    expect([...h.root.querySelectorAll<HTMLElement>('[data-history-tag-row]')].map(row => row.dataset.historyTagRow)).toEqual(["scene", "draft"]);
    search.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.activeElement).toBe(h.root.querySelector('[data-history-picker-trigger="tags"]'));
  });
  it("updates drag feedback without replacing the slider; commits once on release", () => {
    const h = setup(), slider = h.root.querySelector<HTMLInputElement>('[data-history-filter-field="minRating"]')!;
    slider.value = "3.5"; slider.dispatchEvent(new Event("input", { bubbles: true }));
    expect(h.requestRender).not.toHaveBeenCalled();
    expect(h.root.querySelector('[data-history-rating-label]')!.textContent).toContain("3.5");
    slider.dispatchEvent(new Event("change", { bubbles: true }));
    expect(h.filter().minRating).toBe(3.5); expect(h.requestRender).toHaveBeenCalledTimes(1);
    expect(h.root.querySelector('[data-history-filter-field="minRating"]')).toBe(slider);
    h.click('[data-history-filter-toggle]');
    expect(h.root.querySelector<HTMLElement>('[data-history-filter-panel]')!.hidden).toBe(true);
    expect(h.filter().minRating).toBe(3.5);
  });
});
