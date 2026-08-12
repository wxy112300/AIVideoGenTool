import type { Page } from "../contracts";

export interface ShellPageOptions {
  page: Page;
  appVersion: string;
  queueCount: number;
  flashMessage: string;
  content: string;
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
        <button class="brand" data-page="create" aria-label="返回创建页">
          <span class="brand-mark">${options.icon("play")}</span><span>Local Video Studio</span><span class="brand-version">${options.appVersion ? `v${options.escapeHtml(options.appVersion)}` : ""}</span>
        </button>
        <nav aria-label="主导航">
          ${(["create", "queue", "history", "settings"] as Array<Exclude<Page, "history-detail" | "image-history-detail">>)
            .map((item) => {
              const labels = { create: "创建", queue: "队列", history: "历史", settings: "设置" };
              const badge = item === "queue" && options.queueCount
                ? `<span class="badge">${options.queueCount}</span>`
                : "";
              const active = options.page === item ||
                (item === "history" && historyShell);
              return `<button class="nav-button ${active ? "active" : ""}" data-page="${item}">${labels[item]}${badge}</button>`;
            })
            .join("")}
        </nav>
      </header>
      <div class="flash ${options.flashMessage ? "visible" : ""}" id="app-flash" role="status" aria-live="polite">${options.escapeHtml(options.flashMessage)}</div>
      <main>${options.content}</main>
    </div>
    <button class="history-back-top" id="history-back-top" type="button" aria-label="返回顶部" title="返回顶部">${options.icon("arrow-up")}</button>
    ${options.confirmationDialog}
    ${options.directoryMigrationDialog}
    ${options.imageAssetLibraryDialog}
    ${options.windowCloseDialog}
    ${options.upscaleDialog}`;
}
