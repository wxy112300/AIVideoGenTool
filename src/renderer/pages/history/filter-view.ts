import { normalizeHistoryFilter } from "../../../core/history-filter";
import type { HistoryPageViewModel, HistoryPageOptions } from "./page";
import { uiKeys } from "../../../core/i18n-keys";

export const historyDurationStops = [0, 1, 3, 5, 10, 15, 30, 60];

export function historyFilterCount(view: HistoryPageViewModel): number {
  const f = normalizeHistoryFilter(view.historyFilter);
  return Number(f.sort !== "newest") + Number(f.favoriteOnly) + Number(f.minRating !== null || f.maxRating !== null)
    + Number(view.historyKind === "video" && f.minDuration !== null) + f.modelIds.length + f.tags.length + f.excludedTags.length;
}

export function renderHistoryFilterToggle(view: HistoryPageViewModel, o: HistoryPageOptions): string {
  const count = historyFilterCount(view);
  return `<button type="button" class="secondary icon-button history-filter-toggle" data-history-filter-toggle aria-controls="history-filter-panel" aria-expanded="${view.historyFilterPanelOpen}" aria-label="${o.t(uiKeys.history.filter.button)}" title="${o.t(uiKeys.history.filter.button)}">${o.icon("sliders-horizontal")}${count ? `<span class="history-filter-badge">${count}</span>` : ""}</button>`;
}

export function renderHistoryFilterPanel(view: HistoryPageViewModel, o: HistoryPageOptions, models: string[], tags: string[]): string {
  const f = normalizeHistoryFilter(view.historyFilter), t = o.t, e = o.escapeHtml;
  models = [...new Set([...models, ...f.modelIds])];
  const label = (key: string) => e(t(key));
  const sorts = ["newest", "oldest", "rating-desc", "rating-asc", ...(view.historyKind === "video" ? ["duration-desc", "duration-asc"] : [])];
  const sortKeys: Record<string, string> = { newest: "sortNewest", oldest: "sortOldest", "rating-desc": "sortRatingDesc", "rating-asc": "sortRatingAsc", "duration-desc": "sortDurationDesc", "duration-asc": "sortDurationAsc" };
  const picker = (kind: string, text: string, body: string) => `<div class="history-picker-anchor"><button type="button" class="history-filter-drop" data-history-picker-trigger="${kind}" aria-expanded="false" aria-haspopup="dialog"><span data-history-picker-value="${kind}">${text}</span>${o.icon("chevrons-up-down")}</button><div class="history-filter-picker" data-history-picker="${kind}" role="dialog" aria-label="${label(`history.filter.${kind === "models" ? "model" : "tags"}`)}" hidden>${body}</div></div>`;
  return `<div id="history-filter-panel" class="history-filter-panel" data-history-filter-panel data-history-filter-context="${view.historyKind}:${e(o.uiLocale ?? "")}" ${view.historyFilterPanelOpen ? "" : "hidden"}>
    <div class="history-filter-form">
      <label class="history-filter-field"><span>${label("history.filter.sort")}</span><select id="history-filter-sort" data-history-filter-field="sort" aria-label="${label("history.filter.sort")}">${sorts.map(s => `<option value="${s}" ${f.sort === s ? "selected" : ""}>${label(`history.filter.${sortKeys[s]}`)}</option>`).join("")}</select></label>
      <button type="button" class="history-filter-pill" data-history-filter-favorite aria-pressed="${f.favoriteOnly}">${o.icon("heart")}${label("history.filter.favoriteOnly")}</button>
      <div class="history-filter-field"><span>${label("history.filter.rating")}</span><div class="history-rating-range" data-history-rating-range data-ui-skip style="--lo:${(f.minRating ?? 0) / 5};--hi:${(f.maxRating ?? 5) / 5}"><input id="history-filter-min-rating" type="range" min="0" max="5" step="0.5" value="${f.minRating ?? 0}" data-history-filter-field="minRating" aria-label="${label("history.list.minRating")}"><input id="history-filter-max-rating" type="range" min="0" max="5" step="0.5" value="${f.maxRating ?? 5}" data-history-filter-field="maxRating" aria-label="${label("history.list.maxRating")}"></div><span class="history-filter-value" data-history-rating-label></span></div>
      ${view.historyKind === "video" ? `<label class="history-filter-field"><span>${label("history.filter.durationMin")}</span><input id="history-filter-duration" class="history-duration-range" type="range" min="0" max="${historyDurationStops.length - 1}" step="1" value="${Math.max(0, historyDurationStops.indexOf(f.minDuration ?? 0))}" data-history-filter-field="minDuration" aria-label="${label("history.filter.durationMin")}"><span class="history-filter-value" data-history-duration-label></span></label>` : ""}
      <div class="history-filter-field"><span>${label("history.filter.model")}</span>${picker("models", e(t("history.filter.all")), `<div class="history-picker-head"><span data-history-model-count></span><button type="button" class="ghost" data-history-model-clear>${label("history.list.allModels")}</button></div><div class="history-picker-list">${models.map(id => `<label class="history-model-row"><input type="checkbox" data-history-model="${e(id)}" ${f.modelIds.includes(id) ? "checked" : ""}><span>${e(o.modelName(id))}</span></label>`).join("")}</div>`)}</div>
      <div class="history-filter-field"><span>${label("history.filter.tags")}</span>${picker("tags", label("history.filter.tags"), `<div class="history-picker-head"><span data-history-tag-count></span><button type="button" class="ghost" data-history-tags-clear>${label("history.filter.clear")}</button></div><div class="history-tag-picked" data-history-tag-picked></div><input id="history-filter-tag-search" type="search" data-history-tag-search placeholder="${label("history.list.searchTags")}" aria-label="${label("history.list.searchTags")}" autocomplete="off"><div class="history-picker-list" data-history-tag-list>${[...new Set([...f.tags, ...f.excludedTags, ...tags])].map(tag => `<div class="history-tag-row" data-history-tag-row="${e(tag)}"><span>${e(tag)}</span><button type="button" data-history-filter-tag="${e(tag)}" data-history-tag-operation="include" title="${label("history.filter.tagInclude")}" aria-label="${e(tag)} · ${label("history.filter.tagInclude")}">+</button><button type="button" data-history-filter-tag="${e(tag)}" data-history-tag-operation="exclude" title="${label("history.filter.tagExclude")}" aria-label="${e(tag)} · ${label("history.filter.tagExclude")}">−</button></div>`).join("")}</div><div class="history-picker-foot">↵ ${label("history.filter.tagInclude")} · ⇧↵ ${label("history.filter.tagExclude")}</div>`)}</div>
      <span class="history-filter-spacer"></span><button type="button" class="ghost button-with-icon" data-history-filter-clear>${o.icon("rotate-ccw")}${label("history.filter.clear")}</button>
      <button type="button" class="history-filter-pill" data-history-batch-toggle aria-pressed="${view.historyBatchMode === true}">${o.icon("check-square")}${label("history.batch.mode")}</button>
    </div>
  </div>`;
}
