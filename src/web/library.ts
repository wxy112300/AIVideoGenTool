import { historyFilterIsActive, type HistoryFilterState } from "../core/history-filter";
import { layoutBrowseTiles, type BrowsePage, type BrowseVideo } from "../core/lan-browser";
import { api, ApiError } from "./api";
import { CoverLoader } from "./covers";
import { duration, escape, icon, renderIcons, text, toast } from "./ui";

/** Only visible tiles own image elements; pages retain lightweight metadata. */
export class Library {
  items: BrowseVideo[] = [];
  queryId = "";
  total = 0;
  mode: "masonry" | "album" = "masonry";
  private pending = false;
  private controller = new AbortController();
  private layout = layoutBrowseTiles([], 390, "masonry");
  private tiles = new Map<number, HTMLElement>();
  private frame = 0;
  private generation = 0;
  private pagingFailed = false;
  private covers = new CoverLoader();
  private releaseCovers = new Map<number, () => void>();
  constructor(private root: HTMLElement, private status: HTMLElement, private open: (item: BrowseVideo, index: number) => void) {
    new ResizeObserver(() => this.relayout()).observe(root);
    window.addEventListener("scroll", () => this.schedule(), { passive: true });
    window.addEventListener("resize", () => this.schedule(), { passive: true });
    root.addEventListener("click", (event) => {
      const tile = (event.target as Element).closest<HTMLElement>("[data-index]");
      const index = Number(tile?.dataset.index);
      if (tile && this.items[index]) this.open(this.items[index]!, index);
    });
  }
  private schedule(): void {
    if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.paint(); });
  }
  async load(filter: HistoryFilterState, preserve = false): Promise<void> {
    const anchor = preserve ? this.visibleAnchor() : null;
    const desired = preserve ? this.items.length : 48;
    this.controller.abort(); this.controller = new AbortController();
    const generation = ++this.generation;
    this.pending = true; this.status.textContent = text("loading");
    this.pagingFailed = false;
    try {
      const first = await api.query(filter, this.controller.signal);
      let items = first.items;
      while (items.length < Math.min(first.total, desired)) {
        const page = await api.page(first.queryId, items.length, 96, this.controller.signal);
        items = [...items, ...page.items];
        if (!page.items.length) break;
      }
      if (generation !== this.generation) return;
      this.queryId = first.queryId; this.total = first.total; this.items = items;
      this.clearTiles(); this.relayout();
      if (!preserve) window.scrollTo(0, 0);
      else if (anchor) {
        const index = this.items.findIndex((item) => item.id === anchor.id);
        const tile = this.layout.tiles[index];
        if (tile) window.scrollTo(0, this.root.offsetTop + tile.y - anchor.top);
      }
      this.status.textContent = !first.total ? text(historyFilterIsActive(filter) ? "noResults" : "empty") : "";
    } catch (error) {
      if (generation !== this.generation || this.controller.signal.aborted) return;
      this.status.replaceChildren();
      const retry = document.createElement("button"); retry.textContent = `${text("network")} · ${text("retry")}`;
      retry.addEventListener("click", () => void this.load(filter, preserve)); this.status.append(retry);
      if (error instanceof ApiError && error.status === 410) toast(text("expired"));
    } finally {
      if (generation === this.generation) { this.pending = false; this.schedule(); }
    }
  }
  private clearTiles(): void {
    this.tiles.clear(); this.root.replaceChildren();
    for (const release of this.releaseCovers.values()) release();
    this.releaseCovers.clear();
  }
  private visibleAnchor(): { id: string; top: number } | null {
    const scroll = window.scrollY - this.root.offsetTop;
    const tile = this.layout.tiles.find((candidate) => candidate.y + candidate.height > scroll);
    return tile && this.items[tile.index] ? { id: this.items[tile.index]!.id, top: tile.y - scroll } : null;
  }
  setMode(mode: "masonry" | "album"): void { this.mode = mode; this.relayout(); }
  update(item: BrowseVideo): void {
    const index = this.items.findIndex((candidate) => candidate.id === item.id);
    if (index < 0) return;
    this.items[index] = item;
    this.releaseCovers.get(index)?.(); this.releaseCovers.delete(index);
    this.tiles.get(index)?.remove(); this.tiles.delete(index); this.schedule();
  }
  private relayout(): void {
    this.layout = layoutBrowseTiles(this.items, this.root.clientWidth, this.mode);
    this.root.style.height = `${this.layout.height}px`;
    this.schedule();
  }
  private paint(): void {
    const scroll = window.scrollY - this.root.offsetTop;
    const min = scroll - 600, max = scroll + window.innerHeight + 600;
    const visible = new Set<number>();
    for (const tile of this.layout.tiles) {
      if (tile.y + tile.height < min || tile.y > max) continue;
      visible.add(tile.index);
      let element = this.tiles.get(tile.index);
      if (!element) {
        const item = this.items[tile.index]!;
        const control = document.createElement("button"); control.type = "button";
        element = control; element.className = "media-tile";
        element.dataset.index = String(tile.index); element.setAttribute("aria-label", item.title || text("play"));
        element.innerHTML = `<span class="cover-placeholder">${icon("film")}<span>${escape(text("loading"))}</span></span><img alt="" decoding="async"><span class="tile-meta"><span>${item.favorite ? icon("heart") : ""}${item.rating ? `★ ${item.rating}` : ""}</span><span>${escape(duration(item.duration))}</span></span>`;
        const image = element.querySelector("img")!;
        const placeholder = element.querySelector<HTMLElement>(".cover-placeholder")!;
        image.addEventListener("load", () => { placeholder.hidden = true; image.classList.add("loaded"); });
        const failed = () => { placeholder.querySelector("span")!.textContent = text("coverUnavailable"); };
        image.addEventListener("error", failed);
        if (item.coverUrl) this.releaseCovers.set(tile.index, this.covers.load(image, item.coverUrl, failed));
        else placeholder.querySelector("span")!.textContent = text("notAvailable");
        this.tiles.set(tile.index, element); this.root.append(element); renderIcons(element);
      }
      Object.assign(element.style, { transform: `translate(${tile.x}px,${tile.y}px)`, width: `${tile.width}px`, height: `${tile.height}px` });
      element.classList.toggle("album", this.mode === "album");
    }
    for (const [index, element] of this.tiles) if (!visible.has(index)) { this.releaseCovers.get(index)?.(); this.releaseCovers.delete(index); element.remove(); this.tiles.delete(index); }
    if (!this.pending && !this.pagingFailed && this.items.length < this.total && max > this.layout.height - 800) void this.more();
  }
  private async more(): Promise<void> {
    this.pending = true; const generation = this.generation;
    this.status.textContent = text("loading");
    try {
      const page: BrowsePage = await api.page(this.queryId, this.items.length, 48, this.controller.signal);
      if (generation !== this.generation) return;
      this.items.push(...page.items); this.relayout(); this.status.textContent = "";
    } catch (error) {
      if (!this.controller.signal.aborted) {
        this.pagingFailed = true;
        this.status.textContent = error instanceof ApiError && error.status === 410 ? text("expired") : text("network");
        // Explicit retry avoids a tight loop when an endpoint is unavailable.
        const retry = document.createElement("button"); retry.textContent = text("retry");
        retry.onclick = () => { this.pagingFailed = false; this.status.textContent = ""; void this.more(); };
        this.status.append(retry);
        return;
      }
    } finally { if (generation === this.generation) this.pending = false; }
  }
}
