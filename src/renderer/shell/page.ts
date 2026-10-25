import type { Page } from "../contracts";
import type { NotificationKind, PerformanceMetrics } from "../../types";
import type { NotificationAction } from "../notifications";
import type { Translate } from "../../core/i18n";
import { uiKeys } from "../../core/i18n-keys";
import { renderResourceMonitor } from "./resource-monitor";

export interface ShellPageOptions {
  page: Page;
  appVersion: string;
  queueCount: number;
  performanceMetrics: PerformanceMetrics | null;
  flashMessage: string;
  flashKind: NotificationKind;
  flashActions?: ReadonlyArray<NotificationAction>;
  content: string;
  t: Translate;
  icon(name: string, className?: string): string;
  escapeHtml(value: unknown): string;
}

export function renderShell(options: ShellPageOptions): string {
  const historyShell = options.page === "history" ||
    options.page === "history-detail" ||
    options.page === "image-history-detail";
  return `
    <div class="app-shell ${historyShell ? "history-shell" : ""}">
      <header class="topbar">
        <button class="brand" id="app-brand" data-page="create" aria-label="${options.escapeHtml(options.t(uiKeys.app.backToCreate))}">
          <span class="brand-mark">${options.icon("play")}</span><span>${options.escapeHtml(options.t(uiKeys.app.brand))}</span><span class="brand-version">${options.appVersion ? `v${options.escapeHtml(options.appVersion)}` : ""}</span>
        </button>
        <div class="topbar-tools">
          ${renderResourceMonitor(options.performanceMetrics, options.escapeHtml(options.t(uiKeys.queue.performance)))}
          <nav class="app-nav" aria-label="${options.escapeHtml(options.t(uiKeys.nav.ariaLabel))}">
          ${(["create", "queue", "history", "settings"] as Array<Exclude<Page, "history-detail" | "image-history-detail">>)
            .map((item) => {
              const labels = {
                create: uiKeys.nav.create,
                queue: uiKeys.nav.queue,
                history: uiKeys.nav.history,
                settings: uiKeys.nav.settings
              };
              const badge = item === "queue" && options.queueCount
                ? `<span class="badge">${options.queueCount}</span>`
                : "";
              const active = options.page === item ||
                (item === "history" && historyShell);
              const current = active ? ` aria-current="page"` : "";
              const icons = { create: "wand-sparkles", queue: "list-video", history: "images", settings: "settings-2" };
              return `<button id="app-nav-${item}" class="nav-button ${active ? "active" : ""}" data-page="${item}"${current}>${options.icon(icons[item])}${options.escapeHtml(options.t(labels[item]))}${badge}</button>`;
            })
            .join("")}
          </nav>
        </div>
      </header>
      <main data-route="${options.page}">${options.content}</main>
    </div>
    <button class="history-back-top" id="history-back-top" type="button" tabindex="-1" aria-hidden="true" aria-label="${options.escapeHtml(options.t(uiKeys.app.returnTop))}" title="${options.escapeHtml(options.t(uiKeys.app.returnTop))}">${options.icon("arrow-up")}</button>`;
}
