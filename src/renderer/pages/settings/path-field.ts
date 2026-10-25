import { escapeHtml } from "../../shared/dom";

/** Editable paths keep the existing picker IDs and automatic-directory semantics. */
export function renderSettingsPathField(options: {
  id: string;
  pickerId: string;
  label: string;
  value: string;
  automatic?: string;
  placeholder: string;
  chooseLabel: string;
  openLabel: string;
  icon(name: string): string;
}): string {
  const e = escapeHtml;
  return `<div class="settings-path-row">
    <label for="${e(options.id)}">${e(options.label)}</label>
    <button type="button" class="secondary icon-button" id="${e(options.pickerId)}" aria-label="${e(options.chooseLabel)}" title="${e(options.chooseLabel)}">${options.icon("folder-search")}</button>
    <button type="button" class="secondary icon-button" data-settings-open-path="${e(options.id)}" aria-label="${e(options.openLabel)}" title="${e(options.openLabel)}">${options.icon("folder-open")}</button>
    <input id="${e(options.id)}" ${options.automatic === undefined ? "" : `data-auto-directory="${e(options.automatic)}"`} value="${e(options.value)}" placeholder="${e(options.placeholder)}">
  </div>`;
}
