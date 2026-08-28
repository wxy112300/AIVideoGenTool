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
  const flashActions = (options.flashActions ?? []).map((action) =>
    `<button class="${action.tone ?? "secondary"} flash-action" type="button" data-notification-action="${options.escapeHtml(action.id)}">${options.escapeHtml(action.label)}</button>`
  ).join("");
  return `
    <div class="app-shell ${historyShell ? "history-shell" : ""}">
      <header class="topbar">
        <button class="brand" data-page="create" aria-label="${options.escapeHtml(options.t(uiKeys.app.backToCreate))}">
          <span class="brand-mark">${options.icon("play")}</span><span>${options.escapeHtml(options.t(uiKeys.app.brand))}</span><span class="brand-version">${options.appVersion ? `v${options.escapeHtml(options.appVersion)}` : ""}</span>
        </button>
        <div class="topbar-tools">
          ${renderResourceMonitor(options.performanceMetrics, options.escapeHtml(options.t(uiKeys.queue.performance)))}
          <nav aria-label="${options.escapeHtml(options.t(uiKeys.nav.ariaLabel))}">
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
              return `<button class="nav-button ${active ? "active" : ""}" data-page="${item}"${current}>${options.escapeHtml(options.t(labels[item]))}${badge}</button>`;
            })
            .join("")}
          </nav>
        </div>
      </header>
      <div class="flash flash-${options.flashKind} ${options.flashMessage ? "visible" : ""}" id="app-flash" data-kind="${options.flashKind}" role="${options.flashKind === "error" ? "alert" : "status"}" aria-live="${options.flashKind === "error" ? "assertive" : "polite"}"><span class="flash-message" data-flash-message>${options.escapeHtml(options.flashMessage)}</span><span class="flash-actions" data-flash-actions>${flashActions}</span><button class="icon-button flash-dismiss" id="dismiss-app-flash" type="button" aria-label="${options.escapeHtml(options.t(uiKeys.app.dismissNotification))}" title="${options.escapeHtml(options.t(uiKeys.app.dismissNotification))}">${options.icon("x")}</button></div>
      <main>${options.content}</main>
    </div>
    <button class="history-back-top" id="history-back-top" type="button" aria-label="${options.escapeHtml(options.t(uiKeys.app.returnTop))}" title="${options.escapeHtml(options.t(uiKeys.app.returnTop))}">${options.icon("arrow-up")}</button>`;
}
