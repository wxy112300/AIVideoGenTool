import type { Settings, StrataPreparationStatus, StrataInstallProgress } from "../../../types";
import { STRATA_VERSION } from "../../../core/catalog/dependencies/strata";
import { strataPreparationMatchesSettings } from "../../../core/strata-preparation";
import { settingsText } from "./copy";
import { renderDependencyActionSplit, renderDependencyVersions } from "./dependency-actions";
import { compareReleaseVersions } from "../../../core/release-version";

export function strataProgressPresentation(locale: Settings["uiLocale"], progress?: StrataInstallProgress, cancelling = false): { label: string; percent: number | null } {
  const stage = progress?.stage ?? "prepare";
  const percent = cancelling ? null : stage === "complete" ? 100 : stage === "download" && Number.isFinite(progress?.percent)
    ? Math.min(100, Math.max(0, progress!.percent!)) : null;
  let label = settingsText(locale, cancelling ? "nodes.cancelling" : `strata.install.${stage}`);
  if (percent !== null && stage === "download") {
    label += ` · ${percent}%`;
    if (Number.isFinite(progress?.receivedBytes) && Number.isFinite(progress?.totalBytes) && progress!.totalBytes! > 0) {
      label += ` · ${(progress!.receivedBytes! / 1_000_000).toFixed(1)} / ${(progress!.totalBytes! / 1_000_000).toFixed(1)} MB`;
    }
  }
  return { label, percent };
}

/** Patch only the live progress region: never remount settings or move focus. */
export function updateStrataInstallProgress(progress: StrataInstallProgress, locale: Settings["uiLocale"]): void {
  const element = document.querySelector<HTMLElement>("#strata-install-progress");
  if (!element || element.hidden) return;
  const cancelling = document.querySelector('[data-cancel-dependency-install="python-runtime:strata"]')?.getAttribute("aria-busy") === "true";
  const state = strataProgressPresentation(locale, progress, cancelling);
  const bar = element.querySelector<HTMLElement>("[role=progressbar]");
  const fill = bar?.querySelector<HTMLElement>("span");
  const label = element.querySelector<HTMLElement>("#strata-install-stage");
  if (label) label.textContent = state.label;
  if (bar && fill) {
    bar.classList.toggle("indeterminate", state.percent === null);
    bar.setAttribute("aria-valuetext", state.label);
    if (state.percent === null) { bar.removeAttribute("aria-valuenow"); fill.style.removeProperty("width"); }
    else { bar.setAttribute("aria-valuenow", String(state.percent)); fill.style.width = `${state.percent}%`; }
  }
}

export function renderStrataPreparationPanel(
  settings: Settings,
  status: StrataPreparationStatus | undefined,
  escape: (value: string) => string,
  operation: { installing?: boolean; cancelling?: boolean; progress?: StrataInstallProgress; log?: string; blocked?: boolean; icon?: (name: string) => string } = {}
): string {
  const s = (key: Parameters<typeof settingsText>[1]) => escape(settingsText(settings.uiLocale, key));
  const directoryField = (id: string, label: string, value: string) => `<label>${label}<div class="input-action"><input id="${id}" type="text" value="${escape(value)}" /><button class="secondary" type="button" data-pick-strata-directory="${id}">${s("strata.choose")}</button></div></label>`;
  const current = strataPreparationMatchesSettings(settings, status) ? status : undefined;
  const installed = current?.managedInstalled && current.sourcePresent && current.enginePresent;
  const needsUpdate = installed && current.installedVersion && compareReleaseVersions(current.installedVersion, STRATA_VERSION) < 0;
  const icon = operation.icon || (() => "");
  const progress = strataProgressPresentation(settings.uiLocale, operation.progress, operation.cancelling);
  return `<article class="panel custom-node-card ${installed && !needsUpdate ? "available" : "warning"}" data-strata-preparation="runtime">
    <div class="custom-node-copy"><div class="model-title"><h3>Strata</h3></div>
    <p class="muted">${s("strata.note")}</p>
    <p class="muted probe-evidence">${s("strata.stage")}</p>
    ${renderDependencyVersions(settings.uiLocale, escape, { current: current?.installedVersion || "", recommended: STRATA_VERSION,
      latest: current?.latestVersion || "", currentFallback: !current ? s("strata.notScanned") : installed ? s("nodes.versionUnread") : s("nodes.notInstalled"), fallback: s("nodes.versionUnavailable") })}
    <div class="dependency-install-progress" id="strata-install-progress" aria-live="polite" ${operation.installing ? "" : "hidden"}>
      <div class="progress ${progress.percent === null ? "indeterminate" : ""}" role="progressbar" aria-label="Strata" aria-valuetext="${escape(progress.label)}" aria-valuemin="0" aria-valuemax="100" ${progress.percent === null ? "" : `aria-valuenow="${progress.percent}"`}><span ${progress.percent === null ? "" : `style="width: ${progress.percent}%"`}></span></div>
      <strong id="strata-install-stage">${escape(progress.label)}</strong>
    </div>
    <details class="node-log"><summary>${s("strata.details")}</summary>
    ${current ? `<code>${escape(current.installDirectory)}</code>` : ""}
    ${directoryField("strata-install-directory", s("strata.root"), settings.strataInstallDirectory)}
    <label>${s("strata.port")}<input id="strata-port" type="number" min="1024" max="65535" step="1" value="${settings.strataPort}" /></label>
    <p class="muted">${s("strata.portNote")}</p>
    <p class="muted">${s("strata.evidence")}</p></details>
    ${(operation.log || operation.installing) ? `<details class="node-log" open><summary>${s("nodes.installLog")}</summary><pre data-dependency-install-log="python-runtime:strata">${escape(operation.log || settingsText(settings.uiLocale, "nodes.installing"))}</pre></details>` : ""}
    </div><div class="custom-node-actions"><span class="model-availability ${installed && !needsUpdate ? "available" : "warning"}" role="status" aria-live="polite">${needsUpdate ? s("nodes.needsUpdate") : installed ? s("strata.installed") : current ? s("strata.missing") : s("strata.notScanned")}</span>
    ${renderDependencyActionSplit(`<button class="primary button-with-icon node-action-main" id="install-strata" aria-busy="${Boolean(operation.installing)}" ${operation.blocked || operation.installing ? "disabled" : ""}>${icon(operation.installing || installed ? "refresh-cw" : "download")}${operation.installing ? s("nodes.installing") : needsUpdate ? s("nodes.update") : installed ? s("nodes.reinstall") : s("nodes.oneClickInstall")}</button>`, {
      locale: settings.uiLocale, escapeHtml: escape, icon,
      location: current?.installDirectory || "",
      locationAvailable: Boolean(current?.sourcePresent || current?.enginePresent),
      menuActions: current?.managedUninstallable ? `<button type="button" class="destructive-menu-action button-with-icon" data-uninstall-strata ${operation.blocked || operation.installing ? "disabled" : ""}>${icon("trash-2")}${s("nodes.uninstall")}</button>` : "",
      cancellation: operation.installing ? { id: "python-runtime:strata", pending: operation.cancelling } : undefined
    })}</div>
  </article>`;
}
