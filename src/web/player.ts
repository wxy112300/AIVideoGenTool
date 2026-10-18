import type { BrowseLibraryInfo, BrowseVideo } from "../core/lan-browser";
import type { HistoryMetadataPatch, HistoryRating } from "../types";
import { api, ApiError } from "./api";
import { mountWatchGestures } from "./gestures";
import { tagInput } from "./tag-input";
import { button, duration, escape, icon, renderIcons, text, toast } from "./ui";

export class Player {
  private video: HTMLVideoElement;
  private item: BrowseVideo | null = null;
  private index = 0;
  private total = 0;
  private queryId = "";
  private generation = 0;
  private cleanup: (() => void) | null = null;
  private changing = false;
  private saving = false;
  private speedBefore: number | null = null;
  private resumeVisible = false;
  private returnFocus: HTMLElement | null = null;
  private dialog: HTMLDialogElement | null = null;
  dirty = false;
  get active(): boolean { return !this.root.hidden; }
  constructor(private root: HTMLElement, private info: () => BrowseLibraryInfo, private update: (item: BrowseVideo) => void, private back: () => void, private route: (item: BrowseVideo, index: number) => void) {
    root.innerHTML = `<video playsinline loop muted preload="metadata" disablepictureinpicture></video>
      <div class="watch-top watch-chrome">${button("back", icon("arrow-left"), text("back"))}<span class="watch-count"></span><button type="button" class="sound-button" data-action="sound">${text("unmute")}</button></div>
      <div class="watch-center"><button type="button" class="play-button" data-action="play" aria-label="${escape(text("play"))}">${icon("play")}</button></div>
      <div class="watch-error" role="status" hidden><p></p><button type="button" data-action="retry">${text("retry")}</button><button type="button" data-action="next">${text("next")}</button><button type="button" data-action="back">${text("back")}</button></div>
      <div class="watch-details watch-chrome"><p class="watch-caption"></p><div class="watch-tags"></div></div>
      <div class="watch-actions watch-chrome">${button("favorite", icon("heart"), text("favorite"))}${button("rating", `${icon("star")}<span class="watch-rating"></span>`, text("rating"), "rating-button")}${button("tags", icon("tag"), text("tags"))}${button("info", icon("info"), text("info"))}</div>
      <div class="watch-bottom watch-chrome"><span class="watch-time">0:00</span><input class="watch-progress" type="range" min="0" max="1000" value="0" aria-label="${escape(text("seek"))}"><span class="watch-duration">0:00</span></div>
      <div class="watch-nav watch-chrome">${button("previous", icon("arrow-up"), text("previous"))}${button("next", icon("chevron-down"), text("next"))}</div><div class="speed-indicator" hidden>2×</div>`;
    this.video = root.querySelector("video")!;
    renderIcons(root);
    root.addEventListener("click", (event) => {
      const action = (event.target as Element).closest<HTMLElement>("[data-action]")?.dataset.action;
      if (action === "back") this.back();
      if (action === "play") this.togglePlay();
      if (action === "sound") { this.video.muted = !this.video.muted; this.paintSound(); }
      if (action === "next") void this.move(1);
      if (action === "previous") void this.move(-1);
      if (action === "retry" && this.item) void this.show(this.item, this.index, this.total, this.queryId);
      if (action === "favorite" && this.item) void this.save({ favorite: !this.item.favorite });
      if (action === "rating" || action === "tags") this.edit(action);
      if (action === "info") this.showPrompt();
    });
    this.video.addEventListener("timeupdate", () => {
      root.querySelector(".watch-time")!.textContent = duration(this.video.currentTime);
      const range = root.querySelector<HTMLInputElement>(".watch-progress")!;
      if (document.activeElement !== range) range.value = String(this.video.duration ? this.video.currentTime / this.video.duration * 1000 : 0);
    });
    root.querySelector<HTMLInputElement>(".watch-progress")!.addEventListener("input", (event) => {
      if (Number.isFinite(this.video.duration)) this.video.currentTime = Number((event.target as HTMLInputElement).value) / 1000 * this.video.duration;
    });
    this.video.addEventListener("loadedmetadata", () => { root.querySelector(".watch-duration")!.textContent = duration(this.video.duration); });
    this.video.addEventListener("play", () => { root.classList.remove("paused"); });
    this.video.addEventListener("pause", () => { root.classList.add("paused"); });
    this.video.addEventListener("error", () => { if (this.active && this.video.error && this.video.getAttribute("src")) this.error(this.video.error.code === 4 ? text("unsupported") : text("notAvailable")); });
    document.addEventListener("visibilitychange", () => {
      if (!this.active) return;
      if (document.hidden) { this.resumeVisible = !this.video.paused; this.video.pause(); this.speed(false); }
      else if (this.resumeVisible && !document.querySelector("dialog[open]")) { this.resumeVisible = false; void this.play(); }
    });
    document.addEventListener("keydown", (event) => {
      if (!this.active || document.querySelector("dialog[open]")) return;
      if (event.key === "Escape") { event.preventDefault(); this.back(); return; }
      if ((event.target as Element)?.closest("input,select,textarea,button")) return;
      if ([" ", "ArrowUp", "ArrowDown", "Escape"].includes(event.key)) event.preventDefault();
      if (event.key === " ") this.togglePlay();
      if (event.key === "ArrowUp") void this.move(-1);
      if (event.key === "ArrowDown") void this.move(1);
    });
  }
  async show(item: BrowseVideo, index: number, total: number, queryId: string): Promise<void> {
    const generation = ++this.generation;
    if (!this.active) {
      this.returnFocus = document.activeElement as HTMLElement;
      this.root.hidden = false; document.body.classList.add("watching");
      document.querySelector<HTMLElement>("#library-shell")!.inert = true;
      this.cleanup = mountWatchGestures(this.root, { tap: (center) => center ? this.togglePlay() : this.toggleInfo(), move: (direction) => { void this.move(direction); }, speed: (active) => this.speed(active) });
      this.root.focus({ preventScroll: true });
    }
    this.item = item; this.index = index; this.total = total; this.queryId = queryId;
    this.speed(false); this.video.pause(); this.video.removeAttribute("src"); this.video.load();
    this.root.querySelector<HTMLElement>(".watch-error")!.hidden = true;
    this.root.querySelector<HTMLInputElement>(".watch-progress")!.value = "0";
    this.root.querySelector(".watch-time")!.textContent = "0:00";
    this.root.querySelector(".watch-duration")!.textContent = duration(item.duration);
    this.paint();
    this.video.poster = item.coverUrl;
    if (!item.mediaUrl) { this.error(text("notAvailable")); return; }
    this.video.src = item.mediaUrl;
    try { await this.video.play(); } catch { if (generation === this.generation) this.root.classList.add("paused"); }
  }
  close(): void {
    if (!this.active) return;
    ++this.generation; this.speed(false); this.video.pause(); this.video.removeAttribute("src"); this.video.removeAttribute("poster"); this.video.load();
    this.cleanup?.(); this.cleanup = null; this.root.hidden = true;
    this.resumeVisible = false; this.dialog?.close();
    document.body.classList.remove("watching"); document.querySelector<HTMLElement>("#library-shell")!.inert = false;
    this.returnFocus?.focus({ preventScroll: true });
  }
  private async play(): Promise<void> { try { await this.video.play(); } catch { this.root.classList.add("paused"); } }
  private togglePlay(): void { if (this.video.paused) void this.play(); else this.video.pause(); }
  private toggleInfo(): void {
    const hidden = this.root.classList.toggle("immersive");
    this.root.querySelectorAll<HTMLElement>(".watch-chrome").forEach((element) => { element.inert = hidden; });
    if (hidden) this.root.focus({ preventScroll: true });
  }
  private speed(active: boolean): void {
    if (active && !this.video.paused && this.speedBefore === null) { this.speedBefore = this.video.playbackRate; this.video.playbackRate = 2; }
    if (!active && this.speedBefore !== null) { this.video.playbackRate = this.speedBefore; this.speedBefore = null; }
    this.root.querySelector<HTMLElement>(".speed-indicator")!.hidden = this.speedBefore === null;
  }
  private paintSound(): void { this.root.querySelector('[data-action="sound"]')!.textContent = text(this.video.muted ? "unmute" : "mute"); }
  private paint(): void {
    if (!this.item) return;
    this.root.querySelector(".watch-count")!.textContent = `${this.index + 1} / ${this.total}`;
    const favorite = this.root.querySelector<HTMLButtonElement>('[data-action="favorite"]')!;
    favorite.classList.toggle("selected", this.item.favorite); favorite.setAttribute("aria-pressed", String(this.item.favorite));
    favorite.setAttribute("aria-label", text(this.item.favorite ? "unfavorite" : "favorite"));
    this.root.querySelector(".watch-rating")!.textContent = this.item.rating ? String(this.item.rating) : "";
    const rating = this.root.querySelector<HTMLButtonElement>('[data-action="rating"]')!;
    rating.title = `${text("rating")}${this.item.rating ? ` ${this.item.rating}` : ""}`;
    rating.setAttribute("aria-label", rating.title);
    this.root.querySelector(".watch-caption")!.textContent = this.item.title;
    this.root.querySelector(".watch-tags")!.textContent = this.item.tags.map((tag) => `#${tag}`).join("  ");
    this.root.querySelector<HTMLButtonElement>('[data-action="previous"]')!.disabled = this.index <= 0;
    this.root.querySelector<HTMLButtonElement>('.watch-nav [data-action="next"]')!.disabled = this.index >= this.total - 1;
    this.paintSound();
  }
  private error(message: string): void { const panel = this.root.querySelector<HTMLElement>(".watch-error")!; panel.hidden = false; panel.querySelector("p")!.textContent = message; }
  private async move(direction: -1 | 1): Promise<void> {
    if (this.changing || this.saving || document.querySelector("dialog[open]")) return;
    const index = this.index + direction;
    if (index < 0 || index >= this.total) { toast(text(direction === 1 ? "last" : "first")); return; }
    const generation = this.generation; this.changing = true;
    try {
      const page = await api.page(this.queryId, index, 1);
      if (generation !== this.generation || !this.active) return;
      const item = page.items[0];
      if (item) { this.route(item, index); await this.show(item, index, this.total, this.queryId); }
    } catch (error) { if (this.active) toast(text(error instanceof ApiError && error.status === 410 ? "expired" : "network")); }
    finally { this.changing = false; }
  }
  private async save(patch: HistoryMetadataPatch): Promise<boolean> {
    if (!this.item || this.saving) return false;
    this.saving = true; const original = this.item;
    this.root.querySelectorAll<HTMLButtonElement>(".watch-actions button").forEach((button) => { button.disabled = true; });
    try {
      const item = await api.update(original, patch);
      this.update(item); this.dirty = true;
      if (this.item?.id === item.id) { this.item = item; this.paint(); }
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        try { const item = await api.detail(original.id, original.versionId); this.update(item); if (this.item?.id === item.id) { this.item = item; this.paint(); } } catch { /* Keep the draft available. */ }
        toast(text("conflict"));
      } else toast(text("saveError"));
      return false;
    } finally { this.saving = false; this.root.querySelectorAll<HTMLButtonElement>(".watch-actions button").forEach((button) => { button.disabled = false; }); }
  }
  private edit(kind: "rating" | "tags"): void {
    if (!this.item || this.saving || this.dialog?.open) return;
    const resume = !this.video.paused; this.video.pause(); this.speed(false);
    const dialog = document.createElement("dialog"); dialog.className = kind === "rating" ? "sheet rating-popover" : "sheet";
    dialog.innerHTML = `<form method="dialog"><header><h2>${text(kind)}</h2>${button("close", icon("x"), text("close"))}</header><div class="edit-body"></div><footer><button type="button" data-cancel>${text("cancel")}</button><button class="primary" type="submit">${text("save")}</button></footer><p class="edit-status" role="status"></p></form>`;
    const body = dialog.querySelector<HTMLElement>(".edit-body")!;
    const tags = kind === "tags" ? tagInput(body, this.item.tags, this.info().tags) : null;
    if (kind === "rating") {
      body.innerHTML = `<div class="rating-options"><label><input type="radio" name="rating" value="" ${this.item.rating === null ? "checked" : ""}><span>${text("clearRating")}</span></label>${Array.from({ length: 10 }, (_, i) => (i + 1) / 2).map((value) => `<label><input type="radio" name="rating" value="${value}" ${this.item!.rating === value ? "checked" : ""}><span>★ ${value}</span></label>`).join("")}</div>`;
    }
    dialog.querySelector('[data-action="close"]')!.addEventListener("click", () => dialog.close());
    dialog.querySelector("[data-cancel]")!.addEventListener("click", () => dialog.close());
    dialog.querySelector("form")!.addEventListener("submit", (event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget as HTMLFormElement);
      const patch: HistoryMetadataPatch = tags ? { tags: tags.values() } : { rating: data.get("rating") ? Number(data.get("rating")) as HistoryRating : null };
      const submit = dialog.querySelector<HTMLButtonElement>('[type="submit"]')!; submit.disabled = true;
      void this.save(patch).then((saved) => { if (saved) dialog.close(); else dialog.querySelector(".edit-status")!.textContent = text("saveError"); }).finally(() => { submit.disabled = false; });
    });
    this.presentDialog(dialog, resume);
  }
  private showPrompt(): void {
    if (!this.item || this.dialog?.open) return;
    const item = this.item;
    const resume = !this.video.paused; this.video.pause(); this.speed(false);
    const dialog = document.createElement("dialog"); dialog.className = "sheet info-sheet";
    dialog.innerHTML = `<header><h2>${text("prompt")}</h2>${button("close", icon("x"), text("close"))}</header><div class="prompt-body" role="status" aria-live="polite"></div>`;
    dialog.querySelector('[data-action="close"]')!.addEventListener("click", () => dialog.close());
    const body = dialog.querySelector<HTMLElement>(".prompt-body")!;
    let controller: AbortController | null = null;
    const load = async () => {
      controller?.abort(); controller = new AbortController(); const signal = controller.signal;
      body.textContent = text("loading");
      try {
        const result = await api.prompt(item, signal);
        if (signal.aborted || this.dialog !== dialog || !this.active) return;
        const prompt = document.createElement("p"); prompt.className = "watch-prompt";
        prompt.textContent = result.prompt || text("noPrompt"); body.replaceChildren(prompt);
      } catch (error) {
        if (signal.aborted || this.dialog !== dialog || !this.active) return;
        const message = document.createElement("p"); message.textContent = text(error instanceof ApiError && error.status === 404 ? "notAvailable" : "network");
        const retry = document.createElement("button"); retry.type = "button"; retry.textContent = text("retry");
        retry.addEventListener("click", () => { void load(); }); body.replaceChildren(message, retry);
      }
    };
    dialog.addEventListener("close", () => controller?.abort(), { once: true });
    this.presentDialog(dialog, resume); void load();
  }
  private presentDialog(dialog: HTMLDialogElement, resume: boolean): void {
    const generation = this.generation; this.dialog = dialog;
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    dialog.addEventListener("close", () => {
      dialog.remove(); if (this.dialog === dialog) this.dialog = null;
      if (resume && this.active && generation === this.generation && !this.dialog?.open) void this.play();
    }, { once: true });
    document.body.append(dialog); renderIcons(dialog); dialog.showModal();
  }
}
