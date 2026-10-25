import { defaultHistoryFilter, historyTagKey, normalizeHistoryFilter, type HistoryFilterState, type HistoryFilterTagMode } from "../../../core/history-filter";
import type { RendererCleanup, RendererContext } from "../../contracts";
import { positionFloating } from "../../shared/ui/floating";
import { historyDurationStops } from "./filter-view";

export interface HistoryFilterControllerOptions {
  getFilter(): HistoryFilterState;
  setFilter(filter: HistoryFilterState): void;
  getPanelOpen(): boolean;
  setPanelOpen(open: boolean): void;
  getTagMode(): HistoryFilterTagMode;
  setTagMode(mode: HistoryFilterTagMode): void;
  clearBatchSelection?(): void;
}

export function mountHistoryFilterController(context: RendererContext, options: HistoryFilterControllerOptions): RendererCleanup {
  const events = new AbortController(), { signal } = events, root = context.root;
  const panel = root.querySelector<HTMLElement>("[data-history-filter-panel]");
  if (!panel) return () => events.abort();
  const t = context.t;
  const fields = () => normalizeHistoryFilter(options.getFilter());
  const query = <T extends Element>(selector: string) => panel.querySelector<T>(selector);
  const picker = (kind: string) => query<HTMLElement>('[data-history-picker="' + kind + '"]');
  const trigger = (kind: string) => query<HTMLButtonElement>('[data-history-picker-trigger="' + kind + '"]');
  const paintRating = () => {
    const min = query<HTMLInputElement>('[data-history-filter-field="minRating"]');
    const max = query<HTMLInputElement>('[data-history-filter-field="maxRating"]');
    if (!min || !max) return;
    const low = Number(min.value), high = Number(max.value);
    const range = query<HTMLElement>("[data-history-rating-range]");
    range?.style.setProperty("--lo", String(low / 5));
    range?.style.setProperty("--hi", String(high / 5));
    min.style.zIndex = low >= 4.5 ? "2" : "1";
    const text = query<HTMLElement>("[data-history-rating-label]");
    if (text) text.textContent = low === 0 && high === 5 ? t("history.filter.ratingAny")
      : high === 5 ? `≥ ${low}★` : low === 0 ? `≤ ${high}★` : `${low}–${high}★`;
  };
  const close = (focus = false) => {
    for (const kind of ["models", "tags"]) {
      const pop = picker(kind), button = trigger(kind);
      if (pop && !pop.hidden && focus) button?.focus({ preventScroll: true });
      if (pop) pop.hidden = true;
      button?.setAttribute("aria-expanded", "false");
    }
  };
  const position = () => {
    for (const kind of ["models", "tags"]) {
      const pop = picker(kind), button = trigger(kind);
      if (pop && !pop.hidden && button) positionFloating(button, pop, 420);
    }
  };
  const sync = () => {
    const f = fields();
    panel.hidden = !options.getPanelOpen();
    root.querySelector("[data-history-filter-toggle]")?.setAttribute("aria-expanded", String(!panel.hidden));
    const area = root.querySelector<HTMLElement>("[data-history-context]");
    if (area) area.hidden = panel.hidden && !area.querySelector("[data-history-batch-toolbar]");
    const min = query<HTMLInputElement>('[data-history-filter-field="minRating"]');
    const max = query<HTMLInputElement>('[data-history-filter-field="maxRating"]');
    if (min && max) {
      min.value = String(f.minRating ?? 0); max.value = String(f.maxRating ?? 5);
      paintRating();
    }
    const duration = query<HTMLElement>("[data-history-duration-label]");
    if (duration) duration.textContent = f.minDuration === null ? t("history.filter.durationAny") : t("history.list.seconds", { count: f.minDuration });
    const modelValue = query<HTMLElement>('[data-history-picker-value="models"]');
    if (modelValue) {
      const name = [...panel.querySelectorAll<HTMLInputElement>("[data-history-model]")].find(input => input.dataset.historyModel === f.modelIds[0])?.parentElement?.textContent?.trim();
      modelValue.textContent = !f.modelIds.length ? t("history.filter.all") : f.modelIds.length === 1 ? name || f.modelIds[0] || "" : t("history.list.models", { count: f.modelIds.length });
      modelValue.title = modelValue.textContent;
    }
    const count = query<HTMLElement>("[data-history-model-count]");
    if (count) count.textContent = t("history.list.models", { count: f.modelIds.length });
    panel.querySelectorAll<HTMLInputElement>("[data-history-model]").forEach(input => { input.checked = f.modelIds.includes(input.dataset.historyModel ?? ""); });
    const tagValue = query<HTMLElement>('[data-history-picker-value="tags"]');
    if (tagValue) tagValue.textContent = f.tags.length || f.excludedTags.length ? "+" + f.tags.length + " / −" + f.excludedTags.length : t("history.filter.all");
    const tagCount = query<HTMLElement>("[data-history-tag-count]");
    if (tagCount) tagCount.textContent = t("history.list.tags", { count: f.tags.length + f.excludedTags.length });
    const picked = query<HTMLElement>("[data-history-tag-picked]");
    const pickedSignature = JSON.stringify([f.tags, f.excludedTags]);
    const updatePicked = picked?.dataset.selection !== pickedSignature;
    const focusedTag = picked?.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.historyFilterTag : undefined;
    if (updatePicked) { picked?.replaceChildren(); if (picked) picked.dataset.selection = pickedSignature; }
    if (updatePicked) for (const [mode, tags] of [["include", f.tags], ["exclude", f.excludedTags]] as const) for (const tag of tags) {
      const chip = document.createElement("span"); chip.className = "history-picked-tag " + mode;
      const toggle = document.createElement("button"); toggle.type = "button"; toggle.textContent = (mode === "include" ? "+" : "−") + " " + tag;
      toggle.dataset.historyFilterTag = tag; toggle.dataset.historyTagOperation = mode === "include" ? "exclude" : "include";
      const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "×"; remove.dataset.historyFilterTag = tag; remove.dataset.historyTagOperation = "remove";
      remove.setAttribute("aria-label", tag + " · " + t("history.tags.remove")); chip.append(toggle, remove); picked?.append(chip);
    }
    if (focusedTag) {
      const replacement = [...(picked?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(button => button.dataset.historyFilterTag === focusedTag);
      (replacement ?? trigger("tags"))?.focus({ preventScroll: true });
    }
    const search = query<HTMLInputElement>("[data-history-tag-search]")?.value.toLocaleLowerCase() ?? "";
    panel.querySelectorAll<HTMLElement>("[data-history-tag-row]").forEach(row => {
      const key = historyTagKey(row.dataset.historyTagRow);
      const included = f.tags.some(tag => historyTagKey(tag) === key), excluded = f.excludedTags.some(tag => historyTagKey(tag) === key);
      row.classList.toggle("is-included", included); row.classList.toggle("is-excluded", excluded);
      row.hidden = !row.dataset.historyTagRow?.toLocaleLowerCase().includes(search);
      row.querySelector('[data-history-tag-operation="include"]')?.setAttribute("aria-pressed", String(included));
      row.querySelector('[data-history-tag-operation="exclude"]')?.setAttribute("aria-pressed", String(excluded));
    });
    query("[data-history-filter-favorite]")?.setAttribute("aria-pressed", String(f.favoriteOnly));
    position();
  };
  const commit = (patch: Partial<HistoryFilterState>) => {
    options.setFilter(normalizeHistoryFilter({ ...fields(), ...patch }));
    if (Object.keys(patch).some(key => key !== "sort")) options.clearBatchSelection?.();
    // Preserve connected controls, keyboard selection and picker scroll across result refresh.
    root.dataset.historyPreserveFilter = "true"; sync();
    context.reportUserAction("history-filter-change", patch as Record<string, unknown>);
    context.requestRender();
  };
  const tagOperation = (tag: string, mode: string) => {
    const f = fields(), key = historyTagKey(tag);
    const wasSelected = (mode === "include" ? f.tags : f.excludedTags).some(value => historyTagKey(value) === key);
    const tags = f.tags.filter(value => historyTagKey(value) !== key), excludedTags = f.excludedTags.filter(value => historyTagKey(value) !== key);
    if (!wasSelected && mode !== "remove") (mode === "include" ? tags : excludedTags).push(tag);
    commit({ tags, excludedTags });
  };
  root.querySelector("[data-history-filter-toggle]")?.addEventListener("click", event => {
    event.preventDefault(); options.setPanelOpen(!options.getPanelOpen()); close(); sync();
  }, { signal });
  panel.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest<HTMLButtonElement>("button"); if (!button) return;
    const kind = button.dataset.historyPickerTrigger;
    if (kind) {
      const pop = picker(kind), open = pop?.hidden; close();
      if (pop && open) { pop.hidden = false; button.setAttribute("aria-expanded", "true"); position(); (pop.querySelector<HTMLInputElement>('input[type="search"]') ?? pop.querySelector<HTMLElement>("input, button"))?.focus({ preventScroll: true }); }
    } else if (button.hasAttribute("data-history-filter-favorite")) commit({ favoriteOnly: !fields().favoriteOnly });
    else if (button.hasAttribute("data-history-model-clear")) commit({ modelIds: [] });
    else if (button.hasAttribute("data-history-tags-clear")) commit({ tags: [], excludedTags: [] });
    else if (button.dataset.historyFilterTag) tagOperation(button.dataset.historyFilterTag, button.dataset.historyTagOperation ?? "include");
    else if (button.hasAttribute("data-history-filter-clear")) {
      options.setTagMode("include"); commit({ ...defaultHistoryFilter });
      const sort = query<HTMLSelectElement>('[data-history-filter-field="sort"]'); if (sort) { sort.value = "newest"; sort.dispatchEvent(new Event("change", { bubbles: true })); }
      const dur = query<HTMLInputElement>('[data-history-filter-field="minDuration"]'); if (dur) dur.value = "0";
    }
  }, { signal });
  panel.addEventListener("input", event => {
    const field = event.target as HTMLInputElement;
    if (field.hasAttribute("data-history-tag-search")) { sync(); return; }
    if (field.type !== "range") return;
    const name = field.dataset.historyFilterField;
    const min = query<HTMLInputElement>('[data-history-filter-field="minRating"]'), max = query<HTMLInputElement>('[data-history-filter-field="maxRating"]');
    if (name === "minRating" && min && max) min.value = String(Math.min(Number(min.value), Number(max.value)));
    if (name === "maxRating" && min && max) max.value = String(Math.max(Number(min.value), Number(max.value)));
    if (name === "minRating" || name === "maxRating") paintRating();
    if (name === "minDuration") { const label = query<HTMLElement>("[data-history-duration-label]"); const value = historyDurationStops[Number(field.value)]; if (label) label.textContent = value ? t("history.list.seconds", { count: value }) : t("history.filter.durationAny"); }
  }, { signal });
  panel.addEventListener("change", event => {
    const field = event.target as HTMLInputElement, name = field.dataset.historyFilterField;
    if (field.dataset.historyModel !== undefined) {
      const id = field.dataset.historyModel, ids = fields().modelIds;
      commit({ modelIds: field.checked ? [...ids.filter(value => value !== id), id] : ids.filter(value => value !== id) });
    } else if (name === "minRating") commit({ minRating: Number(field.value) === 0 ? null : Number(field.value) as HistoryFilterState["minRating"] });
    else if (name === "maxRating") commit({ maxRating: Number(field.value) === 5 ? null : Number(field.value) as HistoryFilterState["maxRating"] });
    else if (name === "minDuration") commit({ minDuration: historyDurationStops[Number(field.value)] || null });
    else if (name === "sort") commit({ sort: field.value as HistoryFilterState["sort"] });
  }, { signal });
  panel.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); return; }
    const tags = picker("tags"); if (tags?.hidden || !tags?.contains(event.target as Node)) return;
    const rows = [...tags.querySelectorAll<HTMLElement>("[data-history-tag-row]")].filter(row => !row.hidden);
    const active = (event.target as Element)?.closest<HTMLElement>("[data-history-tag-row]"), index = rows.indexOf(active!);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); const next = Math.max(0, Math.min(rows.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))); rows[next]?.querySelector<HTMLButtonElement>("button")?.focus();
    } else if (event.key === "Enter") {
      event.preventDefault(); const row = active ?? rows[0]; if (row?.dataset.historyTagRow) tagOperation(row.dataset.historyTagRow, event.shiftKey ? "exclude" : "include");
    }
  }, { signal });
  document.addEventListener("pointerdown", event => { if (!(event.target instanceof Node) || !panel.contains(event.target)) close(); }, { signal });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && ["models", "tags"].some(kind => picker(kind)?.hidden === false)) { event.preventDefault(); close(true); }
  }, { signal });
  window.addEventListener("resize", position, { signal });
  window.addEventListener("scroll", position, { signal, passive: true });
  const heading = root.querySelector<HTMLElement>(".history-heading");
  const measureHeading = () => { if (heading) document.documentElement.style.setProperty("--history-heading-height", heading.getBoundingClientRect().height + "px"); };
  const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measureHeading);
  if (heading) resize?.observe(heading);
  measureHeading();
  sync();
  return () => { events.abort(); resize?.disconnect(); };
}
