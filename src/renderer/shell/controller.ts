import type { RendererCleanup } from "../contracts";
import type { Page } from "../contracts";

export interface ShellControllerOptions {
  getPage(): Page;
  settingsHaveUnsavedChanges(): boolean;
  rememberModalFocus(): void;
  requestDiscardSettings(nextPage: Page): void;
  returnToHistory(): void;
  returnToLastHistoryDetail(): void;
  navigateHistoryDetail(direction: -1 | 1): void;
  navigateImageHistoryDetail(direction: -1 | 1): void;
  setHistoryScrollPosition(position: number): void;
  setHistoryScrollRestorePending(value: boolean): void;
  clearHistoryForwardTarget(): void;
  setPage(page: Page): void;
  dismissNotification(): void;
  reportUserAction(action: string, meta?: Record<string, unknown>): void;
  render(): void;
  bindConfirmationDialog(): void;
  bindDirectoryMigrationDialog(): void;
  bindImageAssetLibraryDialog(): void;
  bindWindowCloseDialog(): void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable;
}

export function mountShellController(
  options: ShellControllerOptions
): RendererCleanup {
  const events = new AbortController();
  const signal = events.signal;
  const page = options.getPage();
  document.querySelectorAll<HTMLElement>("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextPage = button.dataset.page as Page;
      const previousPage = options.getPage();
      if (previousPage === "settings" && nextPage !== "settings" && options.settingsHaveUnsavedChanges()) {
        options.rememberModalFocus();
        options.requestDiscardSettings(nextPage);
        return;
      }
      if ((previousPage === "history-detail" || previousPage === "image-history-detail") && nextPage === "history") {
        options.returnToHistory();
        return;
      }
      if (previousPage === "history") options.setHistoryScrollPosition(window.scrollY);
      if (nextPage === "history" && previousPage !== "history") options.clearHistoryForwardTarget();
      if (nextPage !== "history") options.clearHistoryForwardTarget();
      if (nextPage === "history" && previousPage !== "history") options.setHistoryScrollRestorePending(true);
      options.reportUserAction("navigate-panel", { from: previousPage, to: nextPage });
      options.setPage(nextPage);
      options.render();
      if (nextPage !== "history") {
        window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
      }
    }, { signal });
  });

  document.querySelector<HTMLButtonElement>("#dismiss-app-flash")?.addEventListener("click", () => {
    options.reportUserAction("dismiss-notification");
    options.dismissNotification();
  }, { signal });

  if (page === "history-detail" || page === "image-history-detail") {
    const handleKeyboardBack = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const isBrowserBack = event.key === "BrowserBack" ||
        event.key === "GoBack" ||
        event.code === "BrowserBack" ||
        (event.altKey && event.key === "ArrowLeft") ||
        (event.key === "Backspace" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey);
      if (!isBrowserBack) return;
      event.preventDefault();
      event.stopPropagation();
      options.returnToHistory();
    };
    const handleMouseBack = (event: MouseEvent) => {
      if (event.button !== 3) return;
      event.preventDefault();
      event.stopPropagation();
      options.returnToHistory();
    };
    const handleHistoryVideoNavigation = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat || isEditableTarget(event.target)) return;
      if (document.querySelector(".dialog-backdrop")) return;
      const direction = event.key === "[" || event.code === "BracketLeft" || event.key === "PageUp" || event.code === "PageUp"
        ? -1
        : event.key === "]" || event.code === "BracketRight" || event.key === "PageDown" || event.code === "PageDown"
          ? 1
          : 0;
      if (direction !== -1 && direction !== 1) return;
      event.preventDefault();
      event.stopPropagation();
      if (options.getPage() === "image-history-detail") options.navigateImageHistoryDetail(direction);
      else options.navigateHistoryDetail(direction);
    };
    window.addEventListener("keydown", handleKeyboardBack, { signal });
    window.addEventListener("keydown", handleHistoryVideoNavigation, { signal });
    window.addEventListener("auxclick", handleMouseBack, { signal });
    window.addEventListener("mouseup", handleMouseBack, { signal });
  }

  if (page === "history") {
    const handleKeyboardForward = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const isBrowserForward = event.key === "BrowserForward" ||
        event.key === "GoForward" ||
        event.code === "BrowserForward" ||
        (event.altKey && event.key === "ArrowRight") ||
        (event.key === "Backspace" && event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey);
      if (!isBrowserForward) return;
      event.preventDefault();
      event.stopPropagation();
      options.returnToLastHistoryDetail();
    };
    const handleMouseForward = (event: MouseEvent) => {
      if (event.button !== 4) return;
      event.preventDefault();
      event.stopPropagation();
      options.returnToLastHistoryDetail();
    };
    window.addEventListener("keydown", handleKeyboardForward, { signal });
    window.addEventListener("auxclick", handleMouseForward, { signal });
    window.addEventListener("mouseup", handleMouseForward, { signal });
  }

  options.bindConfirmationDialog();
  options.bindDirectoryMigrationDialog();
  options.bindImageAssetLibraryDialog();
  options.bindWindowCloseDialog();

  return () => events.abort();
}
