import type { RendererContext } from "../../contracts";
import { icon, renderIcons } from "../../shared/icons";
import { uiKeys } from "../../../core/i18n-keys";

export interface AppLogContextMenu {
  open(clientX: number, clientY: number): void;
  close(): void;
}

export function createAppLogContextMenu(
  context: RendererContext,
  clearLogScreen: () => void
): AppLogContextMenu {
  let menu: HTMLElement | null = null;
  let events: AbortController | null = null;

  const close = () => {
    events?.abort();
    events = null;
    menu?.remove();
    menu = null;
  };

  const open = (clientX: number, clientY: number) => {
    close();
    const selectedText = window.getSelection()?.toString() ?? "";
    const nextMenu = document.createElement("section");
    nextMenu.className = "history-context-menu app-log-context-menu";
    nextMenu.setAttribute("role", "menu");
    nextMenu.setAttribute("aria-label", context.t(uiKeys.settings.logMenu.ariaLabel));
    nextMenu.innerHTML = `<button role="menuitem" data-app-log-action="copy" ${selectedText.trim() ? "" : "disabled"}><span class="context-icon">${icon("copy")}</span><span><strong>${context.t(uiKeys.settings.logMenu.copy)}</strong><small>${context.t(uiKeys.settings.logMenu.copyDescription)}</small></span></button><button role="menuitem" data-app-log-action="select-all"><span class="context-icon">${icon("list")}</span><span><strong>${context.t(uiKeys.settings.logMenu.selectAll)}</strong><small>${context.t(uiKeys.settings.logMenu.selectAllDescription)}</small></span></button><div class="history-context-separator" role="separator"></div><button class="danger" role="menuitem" data-app-log-action="clear"><span class="context-icon">${icon("trash-2")}</span><span><strong>${context.t(uiKeys.settings.logMenu.clear)}</strong><small>${context.t(uiKeys.settings.logMenu.clearDescription)}</small></span></button>`;
    nextMenu.style.left = `${clientX}px`;
    nextMenu.style.top = `${clientY}px`;
    document.body.append(nextMenu);
    renderIcons(nextMenu);
    menu = nextMenu;
    const controller = new AbortController();
    events = controller;
    const rect = nextMenu.getBoundingClientRect();
    nextMenu.style.left = `${Math.max(8, Math.min(clientX, window.innerWidth - rect.width - 8))}px`;
    nextMenu.style.top = `${Math.max(8, Math.min(clientY, window.innerHeight - rect.height - 8))}px`;
    nextMenu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    nextMenu.addEventListener("contextmenu", (event) => event.preventDefault(), { signal: controller.signal });
    nextMenu.addEventListener("click", async (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-app-log-action]");
      if (!button || button.disabled) return;
      const action = button.dataset.appLogAction;
      close();
      if (action === "copy") {
        try {
          await navigator.clipboard.writeText(selectedText);
          context.reportUserAction("copy-app-log-selection", { length: selectedText.length });
          context.notify(context.t(uiKeys.settings.actions.logCopied), { renderPage: false });
        } catch {
          context.notify(context.t(uiKeys.settings.actions.logCopyFailed), { renderPage: false });
        }
      } else if (action === "select-all") {
        const terminal = document.querySelector<HTMLPreElement>("#app-log-terminal");
        if (terminal) {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(terminal);
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      } else if (action === "clear") {
        clearLogScreen();
      }
    }, { signal: controller.signal });
    document.addEventListener("pointerdown", (event) => {
      if (!nextMenu.contains(event.target as Node)) close();
    }, { capture: true, signal: controller.signal });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    }, { signal: controller.signal });
    window.addEventListener("blur", close, { signal: controller.signal });
  };

  return { open, close };
}
