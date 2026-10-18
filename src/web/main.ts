import "../styles/00-tokens.css";
import "../styles/palette.css";
import "./style.css";
import { defaultHistoryFilter, historyFilterIsActive, normalizeHistoryFilter, type HistoryFilterState, type HistorySort } from "../core/history-filter";
import type { BrowseLibraryInfo, BrowseVideo } from "../core/lan-browser";
import { api } from "./api";
import { showFilters, sortOptions } from "./filters";
import { Library } from "./library";
import { Player } from "./player";
import { button, escape, icon, renderIcons, setLocale, text, toast } from "./ui";

let filter: HistoryFilterState = { ...defaultHistoryFilter };
try { filter = normalizeHistoryFilter(JSON.parse(new URL(location.href).searchParams.get("q") ?? "null")); } catch { /* Invalid shared query uses defaults. */ }
let info: BrowseLibraryInfo;
let library: Library;
let player: Player;
let refreshTimer = 0;
const root = document.querySelector<HTMLElement>("#app")!;
const updateUrl = (item?: BrowseVideo) => {
  const url = new URL(location.href); url.searchParams.set("q", JSON.stringify(filter));
  if (item) { url.searchParams.set("watch", item.id); url.searchParams.set("version", item.versionId); }
  else { url.searchParams.delete("watch"); url.searchParams.delete("version"); }
  return url;
};
async function refresh(preserve = false): Promise<void> {
  await library.load(filter, preserve);
  root.querySelector<HTMLSelectElement>("#sort")!.value = filter.sort;
  root.querySelector('[data-action="filter"]')!.classList.toggle("active", historyFilterIsActive(filter));
}
function apply(next: HistoryFilterState): void { filter = next; history.replaceState({}, "", updateUrl()); void refresh(); }
function closePlayer(): void {
  player.close();
  if (player.dirty) { player.dirty = false; void refresh(true); }
}
async function openFromUrl(): Promise<void> {
  const url = new URL(location.href); const id = url.searchParams.get("watch");
  if (!id) { closePlayer(); return; }
  try {
    const item = await api.detail(id, url.searchParams.get("version") ?? undefined);
    const page = await api.around(library.queryId, id);
    const offset = page.items.findIndex((candidate) => candidate.id === id);
    await player.show(item, offset >= 0 ? page.offset + offset : 0, offset >= 0 ? page.total : 1, offset >= 0 ? page.queryId : "");
  } catch { toast(text("notAvailable")); closePlayer(); history.replaceState({}, "", updateUrl()); }
}
async function boot(): Promise<void> {
  root.innerHTML = `<div class="boot-status">${escape(text("loading"))}</div>`;
  try {
    info = await api.info(); await setLocale(info.locale);
    root.innerHTML = `<main id="library-shell"><header class="library-header"><h1>${text("library")}</h1><div class="library-tools"><label class="sort-control"><span class="sr-only">${text("sort")}</span><select id="sort">${sortOptions(filter.sort)}</select></label>${button("filter", icon("sliders-horizontal"), text("filter"))}${button("layout", icon("columns-3"), text("album"))}${button("refresh", icon("refresh-cw"), text("refresh"))}</div></header><button id="new-content" hidden>${text("newContent")}</button><div id="media-wall"></div><div id="library-status" role="status"></div></main><section id="watch" aria-label="${text("play")}" tabindex="-1" hidden></section><div id="toast" role="status" hidden></div>`;
    library = new Library(root.querySelector("#media-wall")!, root.querySelector("#library-status")!, (item, index) => {
      history.pushState({ viewer: true }, "", updateUrl(item)); void player.show(item, index, library.total, library.queryId);
    });
    player = new Player(root.querySelector("#watch")!, () => info, (item) => library.update(item), () => {
      if (history.state?.viewer) history.back(); else { history.replaceState({}, "", updateUrl()); closePlayer(); }
    }, (item) => history.replaceState(history.state, "", updateUrl(item)));
    root.querySelector("#sort")!.addEventListener("change", (event) => apply({ ...filter, sort: (event.target as HTMLSelectElement).value as HistorySort }));
    root.querySelector('[data-action="filter"]')!.addEventListener("click", () => showFilters(filter, info, apply));
    root.querySelector('[data-action="layout"]')!.addEventListener("click", (event) => {
      const mode = library.mode === "masonry" ? "album" : "masonry"; library.setMode(mode);
      const control = event.currentTarget as HTMLButtonElement; control.innerHTML = icon(mode === "album" ? "columns-3" : "layout-grid"); control.title = text(mode === "album" ? "masonry" : "album"); control.setAttribute("aria-label", control.title); renderIcons(control);
    });
    const refreshAll = async () => {
      try { info = await api.info(); root.querySelector<HTMLElement>("#new-content")!.hidden = true; await refresh(true); } catch { toast(text("network")); }
    };
    root.querySelector('[data-action="refresh"]')!.addEventListener("click", () => { void refreshAll(); });
    root.querySelector("#new-content")!.addEventListener("click", () => { void refreshAll(); });
    window.addEventListener("popstate", () => {
      try { filter = normalizeHistoryFilter(JSON.parse(new URL(location.href).searchParams.get("q") ?? "null")); } catch { filter = { ...defaultHistoryFilter }; }
      void openFromUrl();
    });
    renderIcons(root); await refresh(); await openFromUrl();
    window.clearInterval(refreshTimer);
    refreshTimer = window.setInterval(() => {
      if (document.hidden || player.active || document.querySelector("dialog[open]")) return;
      void api.info().then((next) => { root.querySelector<HTMLElement>("#new-content")!.hidden = next.revision === info.revision; }).catch(() => {});
    }, 20000);
  } catch {
    root.innerHTML = `<div class="boot-status"><p>${text("network")}</p><button id="boot-retry">${text("retry")}</button></div>`;
    root.querySelector("button")!.addEventListener("click", () => { void boot(); });
  }
}
void boot();
