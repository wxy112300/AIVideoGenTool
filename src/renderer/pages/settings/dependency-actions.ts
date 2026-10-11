import type { Settings } from "../../../types";
import { settingsText } from "./copy";

export interface DependencyActionOptions {
  locale: Settings["uiLocale"];
  escapeHtml(value: string): string;
  icon(name: string): string;
  location: string;
  locationAvailable: boolean;
  menuActions?: string;
  cancellation?: { id: string; queued?: boolean; pending?: boolean };
}

/** Shared install/source button and location/uninstall menu for dependency cards. */
export function renderDependencyActionSplit(mainButton: string, options: DependencyActionOptions): string {
  if (options.cancellation) {
    const { id, queued, pending } = options.cancellation;
    const label = settingsText(options.locale, pending ? "nodes.cancelling" : queued ? "nodes.removeQueued" : "nodes.cancelInstall");
    mainButton = `<button type="button" class="secondary button-with-icon node-action-main" data-cancel-dependency-install="${options.escapeHtml(id)}" aria-busy="${Boolean(pending)}" ${pending ? "disabled" : ""}>${options.icon("x")}${options.escapeHtml(label)}</button>`;
  }
  const hasLocation = options.locationAvailable && Boolean(options.location.trim());
  if (!hasLocation && !options.menuActions) return `<div class="node-action-split">${mainButton}</div>`;
  const s = (key: Parameters<typeof settingsText>[1]) =>
    options.escapeHtml(settingsText(options.locale, key));
  const location = options.escapeHtml(options.location);
  return `<div class="node-action-split">${mainButton}
    <details class="node-action-menu"><summary aria-label="${s("nodes.moreActions")}" title="${s("nodes.moreActions")}">${options.icon("chevron-down")}</summary>
      <div class="node-action-menu-popover">
        ${hasLocation ? `<button type="button" class="node-action-menu-item button-with-icon" data-open-node-location="${location}" title="${location}">${options.icon("folder-open")}${s("nodes.openLocation")}</button>` : ""}
        ${options.menuActions || ""}
      </div>
    </details>
  </div>`;
}
