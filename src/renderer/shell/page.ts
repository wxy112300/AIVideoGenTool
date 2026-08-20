import type { Page } from "../contracts";
import type { NotificationKind } from "../../types";
import type { Translate } from "../../core/i18n";
import { uiKeys } from "../../core/i18n-keys";

export interface ShellPageOptions {
  page: Page;
  appVersion: string;
  queueCount: number;
  flashMessage: string;
  flashKind: NotificationKind;
  content: string;
  t: Translate;
  icon(name: string, className?: string): string;
  escapeHtml(value: unknown): string;
  confirmationDialog: string;
  directoryMigrationDialog: string;
  imageAssetLibraryDialog: string;
  windowCloseDialog: string;
  upscaleDialog: string;
}

export function renderShell(options: ShellPageOptions): string {
  const historyShell = options.page === "history" ||
    options.page === "history-detail" ||
    options.page === "image-history-detail";
  return `
    <div class="app-shell ${historyShell ? "history-shell" : ""}">
      <header class="topbar">
        <button class="brand" data-page="create" aria-label="${options.escapeHtml(options.t(uiKeys.app.backToCreate))}">
          <span class="brand-mark">${options.icon("play")}</span><span>${options.escapeHtml(options.t(uiKeys.app.brand))}</span><span class="brand-version">${options.appVersion ? `v${options.escapeHtml(options.appVersion)}` : ""}</span>
        </button>
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
      </header>
      <div class="flash flash-${options.flashKind} ${options.flashMessage ? "visible" : ""}" id="app-flash" data-kind="${options.flashKind}" role="${options.flashKind === "error" ? "alert" : "status"}" aria-live="${options.flashKind === "error" ? "assertive" : "polite"}">${options.escapeHtml(options.flashMessage)}</div>
      <main>${options.content}</main>
    </div>
    <button class="history-back-top" id="history-back-top" type="button" aria-label="${options.escapeHtml(options.t(uiKeys.app.returnTop))}" title="${options.escapeHtml(options.t(uiKeys.app.returnTop))}">${options.icon("arrow-up")}</button>
    ${options.confirmationDialog}
    ${options.directoryMigrationDialog}
    ${options.imageAssetLibraryDialog}
    ${options.windowCloseDialog}
    ${options.upscaleDialog}`;
}
