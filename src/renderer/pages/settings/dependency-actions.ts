import type { Settings } from "../../../types";
import { settingsText } from "./copy";
import { compareReleaseVersions } from "../../../core/release-version";

/** One release-version row for nodes and independently managed runtimes. Values are escaped here. */
export function renderDependencyVersions(locale: Settings["uiLocale"], escape: (value: string) => string,
  versions: { current: string; recommended: string; latest: string; latestSource?: string; currentFallback: string; fallback: string }): string {
  const entries = [["nodes.localVersion", versions.current, versions.currentFallback],
    ["nodes.recommendedVersion", versions.recommended, versions.fallback],
    ["nodes.latestVersion", versions.latest, versions.fallback]] as const;
  return `<p class="node-version-line" aria-label="${escape(settingsText(locale, "nodes.versionSummary"))}">${entries.map(([label, version, fallback]) =>
    `<span class="node-version-item"${label === "nodes.latestVersion" && versions.latestSource ? ` title="${escape(versions.latestSource)}"` : ""}><span class="node-version-label">${escape(label === "nodes.latestVersion" && versions.latestSource === "Comfy Registry" ? "Registry" : settingsText(locale, label))}</span><strong class="node-version-value${label === "nodes.localVersion" && version && versions.recommended && compareReleaseVersions(version, versions.recommended) < 0 ? " behind" : label === "nodes.latestVersion" && version && compareReleaseVersions(version, versions.current) > 0 ? " newer" : ""}">${escape(version ? `v${version}` : label === "nodes.latestVersion" ? settingsText(locale, "nodes.versionUnknown") : fallback)}</strong></span>`
  ).join('<span class="node-version-separator" aria-hidden="true">·</span>')}</p>`;
}

export interface DependencyActionOptions {
  locale: Settings["uiLocale"];
  escapeHtml(value: string): string;
  icon(name: string): string;
  location: string;
  locationAvailable: boolean;
  menuActions?: string;
  cancellation?: { id: string; queued?: boolean; pending?: boolean; statusLabel?: string; percent?: number | null };
}

/** Shared install/source button and location/uninstall menu for dependency cards. */
export function renderDependencyActionSplit(mainButton: string, options: DependencyActionOptions): string {
  if (options.cancellation) {
    const { id, queued, pending } = options.cancellation;
    const label = settingsText(options.locale, pending ? "nodes.cancelling" : queued ? "nodes.removeQueued" : "nodes.cancelInstall");
    const statusLabel = options.cancellation.statusLabel;
    const percent = pending ? null : options.cancellation.percent;
    const known = typeof percent === "number" && Number.isFinite(percent);
    const running = statusLabel || (queued ? label : settingsText(options.locale, "nodes.installing"));
    const ring = `<svg class="settings-progress-ring" viewBox="0 0 36 36" aria-hidden="true"><circle class="track" cx="18" cy="18" r="15.9155"/><circle class="bar" cx="18" cy="18" r="15.9155"/><rect class="stop" x="13" y="13" width="10" height="10" rx="1"/></svg>`;
    mainButton = `<button type="button" class="secondary button-with-icon node-action-main" data-cancel-dependency-install="${options.escapeHtml(id)}" ${queued ? "data-install-queued" : `data-install-active data-install-percent="${known ? percent : "indeterminate"}" style="--dependency-progress:${known ? percent : 0}"`} aria-label="${options.escapeHtml(label)}" aria-busy="${!queued}" ${pending ? "disabled" : ""}>${queued ? options.icon("clock-3") : ring}${!pending ? `<span class="node-running-label">${options.escapeHtml(running)}</span><span class="node-cancel-label">${options.escapeHtml(label)}</span>` : options.escapeHtml(label)}</button>`;
  }
  const hasLocation = options.locationAvailable && Boolean(options.location.trim());
  if (!hasLocation && !options.menuActions) return `<div class="node-action-split">${mainButton}</div>`;
  const s = (key: Parameters<typeof settingsText>[1]) =>
    options.escapeHtml(settingsText(options.locale, key));
  const location = options.escapeHtml(options.location);
  return `<div class="node-action-split">${mainButton}
    <details class="node-action-menu"><summary aria-label="${s("nodes.moreActions")}">${options.icon("chevron-down")}</summary>
      <div class="node-action-menu-popover">
        ${hasLocation ? `<button type="button" class="node-action-menu-item button-with-icon" data-open-node-location="${location}" title="${location}">${options.icon("folder-open")}${s("nodes.openLocation")}</button>` : ""}
        ${options.menuActions || ""}
      </div>
    </details>
  </div>`;
}
