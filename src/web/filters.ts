import { defaultHistoryFilter, type HistoryFilterState, type HistorySort } from "../core/history-filter";
import type { BrowseLibraryInfo } from "../core/lan-browser";
import { normalizeBrowseFilter } from "../core/lan-browser";
import { tagInput } from "./tag-input";
import { button, escape, icon, renderIcons, text } from "./ui";

export const sorts: Array<[HistorySort, "newest" | "oldest" | "ratingDesc" | "ratingAsc" | "durationDesc" | "durationAsc"]> = [
  ["newest", "newest"], ["oldest", "oldest"], ["rating-desc", "ratingDesc"], ["rating-asc", "ratingAsc"], ["duration-desc", "durationDesc"], ["duration-asc", "durationAsc"]
];
const sortOptions = (selected: string) => sorts.map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${escape(text(label))}</option>`).join("");
const ratings = (selected: number | null) => `<option value="">${escape(text("all"))}</option>` + Array.from({ length: 10 }, (_, i) => (i + 1) / 2).map((value) => `<option ${value === selected ? "selected" : ""}>${value}</option>`).join("");

export function showFilters(filter: HistoryFilterState, info: BrowseLibraryInfo, apply: (filter: HistoryFilterState) => void): void {
  const dialog = document.createElement("dialog");
  dialog.className = "sheet";
  const render = (value: HistoryFilterState) => {
    dialog.innerHTML = `<form method="dialog"><header><h2>${text("filter")}</h2>${button("cancel", icon("x"), text("close"))}</header>
      <label class="check switch-field"><span>${text("favorite")}</span><input name="favorite" type="checkbox" role="switch" ${value.favoriteOnly ? "checked" : ""}><span class="switch-track" aria-hidden="true"></span></label>
      <label>${text("sort")}<select name="sort">${sortOptions(value.sort)}</select></label>
      <div class="field-pair"><label>${text("minRating")}<select name="minRating">${ratings(value.minRating)}</select></label><label>${text("maxRating")}<select name="maxRating">${ratings(value.maxRating)}</select></label></div>
      <label>${text("minDuration")}<input name="minDuration" type="number" min="0" step="1" value="${value.minDuration ?? ""}"></label>
      <label>${text("model")}<select name="model" multiple>${info.models.map((model) => `<option value="${escape(model.id)}" ${value.modelIds.includes(model.id) ? "selected" : ""}>${escape(model.name)}</option>`).join("")}</select></label>
      <section><h3>${text("includeTags")}</h3><div data-tags="include"></div></section><section><h3>${text("excludeTags")}</h3><div data-tags="exclude"></div></section>
      <footer><button type="button" data-reset>${text("reset")}</button><button type="submit" class="primary">${text("apply")}</button></footer></form>`;
    const include = tagInput(dialog.querySelector<HTMLElement>('[data-tags="include"]')!, value.tags, info.tags);
    const exclude = tagInput(dialog.querySelector<HTMLElement>('[data-tags="exclude"]')!, value.excludedTags, info.tags);
    dialog.querySelector('[data-action="cancel"]')!.addEventListener("click", () => dialog.close());
    dialog.querySelector("[data-reset]")!.addEventListener("click", () => render({ ...defaultHistoryFilter }));
    dialog.querySelector("form")!.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget as HTMLFormElement);
      const numeric = (name: string) => data.get(name) === "" ? null : Number(data.get(name));
      apply(normalizeBrowseFilter({ favoriteOnly: data.has("favorite"), sort: data.get("sort") as HistorySort, minRating: numeric("minRating") as HistoryFilterState["minRating"], maxRating: numeric("maxRating") as HistoryFilterState["maxRating"], minDuration: numeric("minDuration"), modelIds: data.getAll("model").map(String), tags: include.values(), excludedTags: exclude.values() }));
      dialog.close();
    });
    renderIcons(dialog);
  };
  render(filter);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  document.body.append(dialog); dialog.showModal();
}
