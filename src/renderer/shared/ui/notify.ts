import type { AppNotification, NotificationAction } from "../../notifications";
import { animateLayout, animateUi, captureLayout } from "./motion";
import { icon, renderIcons } from "../icons";

interface NoticeEntry {
  notice: AppNotification;
  element: HTMLElement;
  timer?: number;
  remaining: number;
  started: number;
  hovered: boolean;
  focused: boolean;
  events: AbortController;
}

export interface NotificationStackOptions {
  dismissLabel(): string;
  changed(visible: AppNotification[], pending: AppNotification[]): void;
  action(notice: AppNotification, action: NotificationAction): void;
}

export function createNotificationStack(options: NotificationStackOptions) {
  const container = document.createElement("div");
  container.className = "ui-notifications";
  const entries: NoticeEntry[] = [];
  const pending: AppNotification[] = [];
  const dismissedProgress = new Set<string>();
  const animations = new Set<Animation>();
  let disposed = false;
  const track = (animation: Animation | undefined) => {
    if (!animation) return;
    animations.add(animation);
    void animation.finished.catch(() => undefined).finally(() => animations.delete(animation));
  };
  const changed = () => options.changed(entries.map((entry) => entry.notice), [...pending]);
  const pause = (entry: NoticeEntry) => {
    if (entry.timer !== undefined) entry.remaining = Math.max(0, entry.remaining - (Date.now() - entry.started));
    window.clearTimeout(entry.timer); entry.timer = undefined;
  };
  const arm = (entry: NoticeEntry) => {
    if (entry.notice.persistent || entry.hovered || entry.focused || disposed) return;
    entry.started = Date.now();
    entry.timer = window.setTimeout(() => dismiss(entry.notice.id), entry.remaining);
  };
  const syncProgress = (element: HTMLElement, notice: AppNotification) => {
    element.classList.toggle("ui-notice-has-progress", Boolean(notice.progress));
    let bar = element.querySelector<HTMLProgressElement>(".ui-notice-progress");
    if (!notice.progress) { bar?.remove(); return; }
    if (!bar) {
      bar = document.createElement("progress");
      bar.className = "ui-notice-progress";
      element.append(bar);
    }
    bar.max = Math.max(1, notice.progress.total);
    bar.value = Math.max(0, Math.min(bar.max, notice.progress.completed));
    bar.setAttribute("aria-label", notice.message);
    bar.setAttribute("aria-valuetext", `${bar.value}/${bar.max}`);
  };
  const display = (notice: AppNotification) => {
    if (!container.isConnected) document.body.append(container);
    const before = captureLayout(entries.map((entry) => entry.element));
    const element = document.createElement("div");
    element.className = `ui-notice ui-notice-${notice.kind}`;
    element.dataset.notificationId = String(notice.id);
    element.dataset.kind = notice.kind;
    element.setAttribute("role", notice.kind === "error" ? "alert" : "status");
    const status = document.createElement("span");
    status.className = "ui-notice-icon";
    status.setAttribute("aria-hidden", "true");
    status.innerHTML = icon(notice.kind === "error" ? "circle-alert" : notice.kind === "warning" ? "alert-triangle" : notice.kind === "info" ? "info" : "circle-check");
    renderIcons(status);
    const message = document.createElement("span");
    message.className = "ui-notice-message"; message.textContent = notice.message;
    element.append(status, message);
    syncProgress(element, notice);
    const entry: NoticeEntry = { notice, element, remaining: notice.durationMs, started: 0, hovered: false, focused: false, events: new AbortController() };
    const { signal } = entry.events;
    for (const action of notice.actions) {
      const button = document.createElement("button");
      button.type = "button"; button.className = "ui-button ghost ui-notice-action"; button.textContent = action.label;
      button.dataset.notificationAction = action.id;
      button.addEventListener("click", () => {
        if (action.dismissOnInvoke !== false) dismiss(notice.id);
        options.action(notice, action);
      }, { signal });
      element.append(button);
    }
    const close = document.createElement("button");
    close.type = "button"; close.className = "ui-button ghost ui-notice-close";
    close.textContent = "×"; close.setAttribute("aria-label", options.dismissLabel());
    close.addEventListener("click", () => dismiss(notice.id), { signal });
    element.append(close);
    element.addEventListener("pointerenter", () => { entry.hovered = true; pause(entry); }, { signal });
    element.addEventListener("pointerleave", () => { entry.hovered = false; arm(entry); }, { signal });
    element.addEventListener("focusin", () => { entry.focused = true; pause(entry); }, { signal });
    element.addEventListener("focusout", (event) => {
      if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;
      entry.focused = false; arm(entry);
    }, { signal });
    entries.unshift(entry); container.prepend(element);
    animateLayout(before).forEach(track);
    track(animateUi(element, [{ opacity: 0, transform: "translateY(-8px)" }, { opacity: 1, transform: "translateY(0)" }], 240));
    arm(entry); changed();
  };
  function dismiss(id: number) {
    const index = entries.findIndex((entry) => entry.notice.id === id);
    if (index < 0) {
      const pendingIndex = pending.findIndex((notice) => notice.id === id);
      if (pendingIndex >= 0) pending.splice(pendingIndex, 1);
      changed(); return;
    }
    const before = captureLayout(entries.map((entry) => entry.element));
    const [entry] = entries.splice(index, 1);
    if (!entry) return;
    if (entry.notice.sourceKey && entry.notice.progress) dismissedProgress.add(entry.notice.sourceKey);
    pause(entry); entry.events.abort();
    entry.element.setAttribute("aria-hidden", "true"); entry.element.removeAttribute("role"); entry.element.style.pointerEvents = "none";
    const finish = () => { entry.element.remove(); if (!disposed) animateLayout(before).forEach(track); };
    const exit = animateUi(entry.element, [
      { opacity: 1, height: `${entry.element.getBoundingClientRect().height}px` },
      { opacity: 0, height: "0px", paddingTop: "0px", paddingBottom: "0px", borderWidth: "0px" }
    ]);
    if (exit) { track(exit); void exit.finished.catch(() => undefined).then(finish); } else finish();
    const next = pending.shift();
    if (next) display(next); else changed();
  }
  return {
    push(notice: AppNotification) {
      if (disposed || [...entries.map((entry) => entry.notice), ...pending].some((item) => item.dedupeKey === notice.dedupeKey)) return;
      if (notice.sourceKey) {
        if (notice.progress && dismissedProgress.has(notice.sourceKey)) return;
        if (!notice.progress) dismissedProgress.delete(notice.sourceKey);
        const existing = entries.find((entry) => entry.notice.sourceKey === notice.sourceKey &&
          !entry.notice.persistent && !entry.notice.actions.length && !notice.actions.length);
        if (existing) {
          pause(existing);
          // Retain the DOM node/id so progress does not replay enter/exit motion,
          // replace focused controls, or invalidate action/close listeners.
          existing.notice = { ...notice, id: existing.notice.id };
          existing.remaining = notice.durationMs;
          existing.element.className = `ui-notice ui-notice-${notice.kind}`;
          existing.element.setAttribute("role", notice.kind === "error" ? "alert" : "status");
          existing.element.querySelector(".ui-notice-message")!.textContent = notice.message;
          const status = existing.element.querySelector<HTMLElement>(".ui-notice-icon")!;
          if (existing.element.dataset.kind !== notice.kind) {
            status.innerHTML = icon(notice.kind === "error" ? "circle-alert" : notice.kind === "warning" ? "alert-triangle" : notice.kind === "info" ? "info" : "circle-check");
            renderIcons(status);
          }
          existing.element.dataset.kind = notice.kind;
          syncProgress(existing.element, existing.notice);
          arm(existing); changed(); return;
        }
        for (let index = pending.length - 1; index >= 0; index--) {
          const previous = pending[index]!;
          if (previous.sourceKey === notice.sourceKey && !previous.persistent && !previous.actions.length) pending.splice(index, 1);
        }
        for (const entry of [...entries]) {
          if (entry.notice.sourceKey === notice.sourceKey && !entry.notice.persistent && !entry.notice.actions.length) dismiss(entry.notice.id);
        }
      }
      if (entries.length >= 4) {
        // Never evict an error or a still-actionable undo/retry notice.
        const oldest = [...entries].reverse().find((entry) => !entry.notice.persistent && !entry.notice.actions.length);
        if (oldest) dismiss(oldest.notice.id);
        if (entries.length >= 4) { pending.push(notice); changed(); return; }
      }
      display(notice);
    },
    dismiss,
    dispose() {
      disposed = true;
      entries.forEach((entry) => { pause(entry); entry.events.abort(); });
      entries.length = 0; pending.length = 0;
      animations.forEach((animation) => animation.cancel()); animations.clear(); container.remove();
    }
  };
}
