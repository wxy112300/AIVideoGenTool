import type { AppCacheSnapshot, AppCacheClearResult } from "../../../types";
import type { Translate } from "../../../core/i18n";
import { uiKeys } from "../../../core/i18n-keys";

/** The existing operation clears both scopes; do not render unsupported scope checkboxes. */
export function renderSettingsCacheDialog(state: {
  open: boolean; snapshot: AppCacheSnapshot | null; loading: boolean; clearing: boolean;
  error: string; running: boolean; result: AppCacheClearResult | null;
}, options: { t: Translate; icon(name: string): string; escapeHtml(value: string): string; formatBytes(bytes: number): string }): string {
  if (!state.open) return "";
  const { t, icon, escapeHtml: escape, formatBytes } = options;
  const summary = state.result ? t(state.result.skippedTemporaryDirectories || state.result.errors.length ? uiKeys.settings.actions.cacheClearPartial : uiKeys.settings.actions.cacheClearCompleted,
    { size: formatBytes(state.result.clearedBytes), count: state.result.skippedTemporaryDirectories + state.result.errors.length }) : "";
  return `<div class="dialog-backdrop" id="settings-cache-backdrop"><section class="settings-maintenance-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-cache-title" tabindex="-1">
    <div class="settings-maintenance-head"><span class="settings-maintenance-icon danger">${icon("trash-2")}</span><h2 id="settings-cache-title" tabindex="-1">${t(uiKeys.settings.system.cacheClear)}</h2><button class="ghost icon-button" id="settings-cache-close-icon" aria-label="${t(uiKeys.assetLibrary.close)}" ${state.clearing ? "disabled" : ""}>${icon("x")}</button></div>
    ${!state.clearing && !state.result ? `<div class="settings-cache-scopes"><div><span>${t(uiKeys.settings.system.cacheSession)}</span><strong>${state.snapshot ? formatBytes(state.snapshot.currentSessionBytes) : "—"}</strong></div><div><span>${t(uiKeys.settings.system.cacheTemporary)}</span><strong>${state.snapshot ? formatBytes(state.snapshot.temporaryBytes) : "—"}</strong></div></div><p class="muted">${t(uiKeys.settings.system.cacheDescription)}</p>` : ""}
    ${state.running ? `<p class="settings-maintenance-warning" role="status">${icon("alert-triangle")}${t(uiKeys.settings.system.cacheBusy)}</p>` : ""}
    <div id="app-cache-progress" class="app-cache-progress" role="status" aria-live="polite" ${state.clearing ? "" : "hidden"}><div class="app-cache-progress-head"><strong id="app-cache-progress-stage">${t(uiKeys.settings.system.cacheProgressScanning)}</strong><span id="app-cache-progress-elapsed"></span></div><div id="app-cache-progress-bar" class="app-cache-progress-bar indeterminate" role="progressbar" aria-label="${t(uiKeys.settings.system.cacheClear)}" aria-valuemin="0" aria-valuemax="100"><span></span></div><div class="app-cache-progress-detail"><span id="app-cache-progress-count"></span><span id="app-cache-progress-bytes"></span><span id="app-cache-progress-remaining"></span></div></div>
    ${summary ? `<div class="settings-maintenance-result${state.result!.skippedTemporaryDirectories || state.result!.errors.length ? " warning" : ""}" role="status">${icon(state.result!.skippedTemporaryDirectories || state.result!.errors.length ? "alert-triangle" : "circle-check")}<strong>${escape(summary)}</strong></div>` : ""}
    ${state.error ? `<p class="settings-maintenance-warning" role="alert">${escape(state.error)}</p>` : ""}
    <div class="dialog-actions"><button class="ghost" id="settings-cache-close" ${state.clearing ? "disabled" : ""}>${t(uiKeys.assetLibrary.close)}</button>${!state.result ? `<button class="primary destructive button-with-icon" id="confirm-clear-app-cache" aria-busy="${state.clearing}" ${state.running || state.clearing || state.loading || !state.snapshot ? "disabled" : ""}>${icon("trash-2")}${t(state.clearing ? uiKeys.settings.system.cacheClearing : uiKeys.settings.system.cacheClear)}${state.snapshot && !state.clearing ? ` · ${formatBytes(state.snapshot.totalBytes)}` : ""}</button>` : ""}</div>
  </section></div>`;
}
