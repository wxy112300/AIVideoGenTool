import type { BrowseLibraryInfo, BrowseVideo } from "../core/lan-browser";
import type { HistoryMetadataPatch, HistoryRating } from "../types";
import { api, ApiError } from "./api";
import { mountWatchGestures } from "./gestures";
import { mountSeek } from "./seek";
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
  private closing = false;
  private saving = false;
  private speedBefore: number | null = null;
  private seek: ReturnType<typeof mountSeek>;
  private stage: HTMLElement;
  private dragOffset = 0;
  private animation: Animation | null = null;
  private pauseTimer = 0;
  private progressFrame = 0;
  private adjacent = new Map<number, BrowseVideo>();
  private adjacentController: AbortController | null = null;
  private resumeVisible = false;
  private returnFocus: HTMLElement | null = null;
  private dialog: HTMLDialogElement | null = null;
  dirty = false;
  get active(): boolean { return !this.root.hidden; }
  constructor(private root: HTMLElement, private info: () => BrowseLibraryInfo, private update: (item: BrowseVideo) => void, private back: () => void, private route: (item: BrowseVideo, index: number) => void) {
    root.innerHTML = `<div class="watch-stage"><img class="watch-neighbor previous" alt=""><video playsinline loop muted preload="auto" disablepictureinpicture></video><img class="watch-neighbor next" alt=""></div>
      <div class="watch-loading" role="status" hidden><span class="loading-ring"></span><span class="sr-only">${text("loading")}</span></div>
      <div class="watch-top watch-chrome">${button("back", icon("arrow-left"), text("back"))}<span class="watch-count"></span>${button("sound", icon("volume-x"), text("unmute"), "sound-button")}</div>
      <div class="watch-center"><button type="button" class="play-button" data-action="play" aria-label="${escape(text("play"))}">${icon("play")}</button></div>
      <div class="watch-error" role="status" hidden><p></p><button type="button" data-action="retry">${text("retry")}</button><button type="button" data-action="next">${text("next")}</button><button type="button" data-action="back">${text("back")}</button></div>
      <div class="watch-details watch-chrome"><p class="watch-caption"></p><div class="watch-tags"></div></div>
      <div class="watch-actions watch-chrome">${button("favorite", icon("heart"), text("favorite"))}${button("rating", `${icon("star")}<span class="watch-rating"></span>`, text("rating"), "rating-button")}${button("tags", icon("tag"), text("tags"))}${button("info", icon("info"), text("info"))}</div>
      <div class="watch-bottom watch-chrome"><span class="watch-time">0:00</span><div class="watch-seek" data-seek><input class="watch-progress" type="range" min="0" max="1000" step="0.1" value="0" aria-label="${escape(text("seek"))}"></div><span class="watch-duration">0:00</span></div>
      <div class="watch-nav watch-chrome">${button("previous", icon("arrow-up"), text("previous"))}${button("next", icon("chevron-down"), text("next"))}</div><div class="speed-indicator" hidden>2×</div>`;
    this.video = root.querySelector("video")!;
    if (this.info().readOnly) {
      root.querySelectorAll('[data-action="favorite"], [data-action="rating"], [data-action="tags"]').forEach((control) => control.remove());
    }
    this.stage = root.querySelector(".watch-stage")!;
    this.seek = mountSeek(root.querySelector(".watch-progress")!, this.video,
      (time) => { root.querySelector(".watch-time")!.textContent = root.classList.contains("scrubbing") ? `${Math.floor(time / 60)}:${(time % 60).toFixed(1).padStart(4, "0")}` : duration(time); },
      (active) => { root.classList.toggle("scrubbing", active); if (active) { this.speed(false); this.hidePause(); } });
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
    this.video.addEventListener("timeupdate", () => this.seek.sync());
    this.video.addEventListener("loadedmetadata", () => { root.querySelector(".watch-duration")!.textContent = duration(this.video.duration); });
    this.video.addEventListener("play", () => { root.classList.remove("paused", "pause-hidden"); this.trackProgress(); });
    this.video.addEventListener("pause", () => {
      root.classList.add("paused"); cancelAnimationFrame(this.progressFrame);
      this.hidePause();
      if (!root.classList.contains("scrubbing")) {
        root.classList.remove("pause-hidden");
        this.pauseTimer = window.setTimeout(() => root.classList.add("pause-hidden"), 2000);
      }
    });
    for (const name of ["loadstart", "waiting", "seeking"]) this.video.addEventListener(name, () => {
      if (this.active && this.video.getAttribute("src")) this.loading(true);
    });
    for (const name of ["playing", "canplay", "seeked"]) this.video.addEventListener(name, () => this.loading(false));
    this.video.addEventListener("error", () => { if (this.active && this.video.error && this.video.getAttribute("src")) this.error(this.video.error.code === 4 ? text("unsupported") : text("notAvailable")); });
    document.addEventListener("visibilitychange", () => {
      if (!this.active) return;
      if (document.hidden) { this.seek.cancel(); this.resumeVisible = !this.video.paused; this.video.pause(); this.speed(false); }
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
    if (!this.active || this.closing) {
      if (!this.closing) this.returnFocus = document.activeElement as HTMLElement;
      this.closing = false;
      this.animation?.cancel(); this.animation = null; this.dragOffset = 0; this.stage.style.transform = "none";
      this.root.classList.remove("immersive");
      this.root.querySelectorAll<HTMLElement>(".watch-chrome").forEach((element) => { element.inert = false; });
      this.root.hidden = false; document.body.classList.add("watching");
      document.querySelector<HTMLElement>("#library-shell")!.inert = true;
      this.cleanup = mountWatchGestures(this.root, { tap: (center) => center ? this.togglePlay() : this.toggleInfo(), move: (direction) => { void this.move(direction); }, speed: (active) => this.speed(active), drag: (distance) => this.drag(distance) });
      this.root.focus({ preventScroll: true });
      this.animate(this.root, [{ opacity: 0, transform: "translateY(16px) scale(.97)" }, { opacity: 1, transform: "none" }], 200);
    }
    this.item = item; this.index = index; this.total = total; this.queryId = queryId;
    this.seek.cancel(); this.speed(false); this.video.pause();
    // Assign the new source once; empty/load/src used to tear down the decoder twice.
    this.loading(true);
    this.root.querySelector<HTMLElement>(".watch-error")!.hidden = true;
    this.root.querySelector<HTMLInputElement>(".watch-progress")!.value = "0";
    this.root.querySelector(".watch-time")!.textContent = "0:00";
    this.root.querySelector(".watch-duration")!.textContent = duration(item.duration);
    this.paint();
    this.video.poster = item.coverUrl;
    if (!item.mediaUrl) { this.error(text("notAvailable")); return; }
    this.video.src = item.mediaUrl;
    this.primeNeighbors();
    try { await this.video.play(); } catch { if (generation === this.generation) this.root.classList.add("paused"); }
  }
  async close(): Promise<void> {
    if (!this.active) return;
    if (this.closing) return;
    this.closing = true;
    const generation = ++this.generation; this.seek.cancel(); this.speed(false); this.video.pause(); this.hidePause();
    this.adjacentController?.abort(); this.adjacent.clear(); this.animation?.cancel();
    this.cleanup?.(); this.cleanup = null;
    this.resumeVisible = false; this.dialog?.close();
    await this.animate(this.root, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(24px) scale(.96)" }], 190);
    if (generation !== this.generation) return;
    this.closing = false;
    this.root.hidden = true; this.video.removeAttribute("src"); this.video.removeAttribute("poster"); this.video.load();
    this.animation = null; this.dragOffset = 0; this.stage.style.transform = "none";
    document.body.classList.remove("watching"); document.querySelector<HTMLElement>("#library-shell")!.inert = false;
    this.returnFocus?.focus({ preventScroll: true });
  }
  private async play(): Promise<void> { const generation = this.generation; try { await this.video.play(); } catch { if (generation === this.generation) this.root.classList.add("paused"); } }
  private hidePause(): void { clearTimeout(this.pauseTimer); this.root.classList.add("pause-hidden"); }
  private loading(active: boolean): void {
    this.root.classList.toggle("loading", active);
    this.root.querySelector<HTMLElement>(".watch-loading")!.hidden = !active;
  }
  private trackProgress(): void {
    cancelAnimationFrame(this.progressFrame);
    const frame = () => { if (!this.active || this.video.paused) return; this.seek.sync(); this.progressFrame = requestAnimationFrame(frame); };
    this.progressFrame = requestAnimationFrame(frame);
  }
  private togglePlay(): void { if (this.video.paused) void this.play(); else this.video.pause(); }
  private toggleInfo(): void {
    const hidden = this.root.classList.toggle("immersive");
    if (this.video.paused) this.hidePause();
    this.root.querySelectorAll<HTMLElement>(".watch-chrome").forEach((element) => { element.inert = hidden; });
    if (hidden) this.root.focus({ preventScroll: true });
  }
  private speed(active: boolean): void {
    if (active && !this.video.paused && !this.video.seeking && !this.changing && this.speedBefore === null) { this.speedBefore = this.video.playbackRate; this.video.playbackRate = 2; }
    if (!active && this.speedBefore !== null) { this.video.playbackRate = this.speedBefore; this.speedBefore = null; }
    this.root.querySelector<HTMLElement>(".speed-indicator")!.hidden = this.speedBefore === null;
  }
  private paintSound(): void {
    const control = this.root.querySelector<HTMLButtonElement>('[data-action="sound"]')!;
    control.innerHTML = icon(this.video.muted ? "volume-x" : "volume-2");
    control.title = text(this.video.muted ? "unmute" : "mute"); control.setAttribute("aria-label", control.title);
    control.setAttribute("aria-pressed", String(!this.video.muted)); renderIcons(control);
  }
  private paint(): void {
    if (!this.item) return;
    this.root.querySelector(".watch-count")!.textContent = `${this.index + 1} / ${this.total}`;
    const favorite = this.root.querySelector<HTMLButtonElement>('[data-action="favorite"]');
    if (favorite) {
      favorite.classList.toggle("selected", this.item.favorite); favorite.setAttribute("aria-pressed", String(this.item.favorite));
      favorite.setAttribute("aria-label", text(this.item.favorite ? "unfavorite" : "favorite"));
      this.root.querySelector(".watch-rating")!.textContent = this.item.rating ? String(this.item.rating) : "";
      const rating = this.root.querySelector<HTMLButtonElement>('[data-action="rating"]')!;
      rating.title = `${text("rating")}${this.item.rating ? ` ${this.item.rating}` : ""}`;
      rating.setAttribute("aria-label", rating.title);
    }
    this.root.querySelector(".watch-caption")!.textContent = this.item.title;
    this.root.querySelector(".watch-tags")!.textContent = this.item.tags.map((tag) => `#${tag}`).join("  ");
    this.root.querySelector<HTMLButtonElement>('[data-action="previous"]')!.disabled = this.index <= 0;
    this.root.querySelector<HTMLButtonElement>('.watch-nav [data-action="next"]')!.disabled = this.index >= this.total - 1;
    this.paintSound();
  }
  private error(message: string): void { this.loading(false); const panel = this.root.querySelector<HTMLElement>(".watch-error")!; panel.hidden = false; panel.querySelector("p")!.textContent = message; }
  private animate(element: HTMLElement, frames: Keyframe[], durationMs: number): Promise<void> {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return Promise.resolve();
    return element.animate(frames, { duration: durationMs, easing: "cubic-bezier(.22,.75,.25,1)" }).finished.then(() => {}, () => {});
  }
  private drag(distance: number): void {
    if (this.changing) return;
    const blocked = distance > 0 ? this.index === 0 : this.index >= this.total - 1;
    this.dragOffset = Math.max(-this.root.clientHeight, Math.min(this.root.clientHeight, distance * (blocked ? .18 : 1)));
    this.animation?.cancel();
    if (!distance) {
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
        this.animation = this.stage.animate([{ transform: this.stage.style.transform }, { transform: "none" }], { duration: 200, easing: "ease-out" });
      }
    }
    this.stage.style.transform = `translateY(${this.dragOffset}px)`;
  }
  private primeNeighbors(): void {
    this.adjacentController?.abort(); const controller = this.adjacentController = new AbortController();
    this.adjacent.clear();
    for (const direction of [-1, 1] as const) {
      const image = this.root.querySelector<HTMLImageElement>(direction === 1 ? ".watch-neighbor.next" : ".watch-neighbor.previous")!;
      image.removeAttribute("src");
      const index = this.index + direction;
      if (index < 0 || index >= this.total || !this.queryId) continue;
      void api.page(this.queryId, index, 1, controller.signal).then((page) => {
        if (controller.signal.aborted || !this.active) return;
        const item = page.items[0]; if (!item) return;
        this.adjacent.set(index, item); image.src = item.coverUrl;
      }).catch(() => {});
    }
  }
  private async move(direction: -1 | 1): Promise<void> {
    if (this.changing || this.closing) return;
    if (this.saving || document.querySelector("dialog[open]")) { this.drag(0); return; }
    const index = this.index + direction;
    if (index < 0 || index >= this.total) { this.drag(0); toast(text(direction === 1 ? "last" : "first")); return; }
    const generation = this.generation; this.changing = true;
    try {
      const cached = this.adjacent.get(index);
      const page = cached ? { items: [cached] } : await api.page(this.queryId, index, 1);
      if (generation !== this.generation || !this.active) return;
      const item = page.items[0];
      if (item) {
        const image = this.root.querySelector<HTMLImageElement>(direction === 1 ? ".watch-neighbor.next" : ".watch-neighbor.previous")!;
        image.src = item.coverUrl;
        this.speed(false);
        if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
          this.animation?.cancel();
          this.animation = this.stage.animate([{ transform: `translateY(${this.dragOffset}px)` }, { transform: `translateY(${-direction * this.root.clientHeight}px)` }], { duration: 240, easing: "cubic-bezier(.22,.75,.25,1)", fill: "forwards" });
          await this.animation.finished.catch(() => {});
        }
        if (generation !== this.generation || !this.active) return;
        this.route(item, index); const showing = this.show(item, index, this.total, this.queryId);
        this.animation?.cancel(); this.animation = null; this.dragOffset = 0; this.stage.style.transform = "none";
        // A buffering video must remain skippable; show owns its asynchronous play result.
        void showing;
      }
    } catch (error) { if (this.active) { this.changing = false; this.drag(0); toast(text(error instanceof ApiError && error.status === 410 ? "expired" : "network")); } }
    finally { this.changing = false; }
  }
  private async save(patch: HistoryMetadataPatch): Promise<boolean> {
    if (this.info().readOnly || !this.item || this.saving) return false;
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
    if (this.info().readOnly || !this.item || this.saving || this.dialog?.open) return;
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
