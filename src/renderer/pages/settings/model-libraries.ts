import type { Settings, EnvironmentScanResult } from "../../../types";
import type { Translate } from "../../../core/i18n";
import { uiKeys } from "../../../core/i18n-keys";
import { modelLibraryEntries } from "../../../core/model-libraries";
import { icon } from "../../shared/icons";

export function renderModelLibraries(settings: Settings, fallback: string, t: Translate, escape: (value: string) => string,
  states: EnvironmentScanResult["modelLibraryStates"] = []): string {
  const k = uiKeys.settings.modelLibraries, rows = modelLibraryEntries(settings, fallback);
  const automatic = !settings.modelDirectories?.length && !settings.modelDirectory.trim();
  const tip = (text: string) => `title="${escape(text)}" aria-label="${escape(text)}"`;
  return `<div class="model-libraries" data-model-libraries>
    <div class="button-row"><strong>${t(k.title)}</strong><button type="button" class="ghost icon-button" data-model-library-add ${rows.length >= 32 ? "disabled" : ""} ${tip(t(k.add))}>${icon("plus")}</button></div>
    <div data-model-library-list>${rows.map((directory, index) => {
      const state = states.find(state => state.directory === directory);
      return `<div class="model-library-row" data-sortable-item data-model-library-index="${index}">
      <button type="button" class="ghost icon-button" data-sortable-handle data-model-library-drag="${index}" aria-keyshortcuts="ArrowUp ArrowDown" ${tip(t(k.order))}>${icon("grip-vertical")}</button>
      <div class="input-action"><input ${index === 0 ? 'id="model-directory"' : ""} data-model-library-path value="${escape(directory)}" ${automatic && index === 0 ? `data-auto-directory="${escape(directory)}"` : ""} aria-label="${escape(t(k.path, { index: index + 1 }))}" ${!directory ? 'aria-invalid="true"' : ""} placeholder="${escape(t(k.empty))}"><span class="model-badge" ${index === 0 ? "data-model-library-default" : ""}>${escape(index === 0 ? t(k.defaultLibrary) : t(k.numberedLibrary, { index }))}</span><button type="button" class="secondary icon-button" data-model-library-pick="${index}" ${index === 0 ? 'id="pick-model-directory"' : ""} ${tip(t(k.choose))}>${icon("folder-search")}</button></div>
      <div class="button-row">
        <button type="button" class="ghost icon-button" data-model-library-open="${index}" ${!directory ? "disabled" : ""} ${tip(t(k.open))}>${icon("folder-open")}</button>
        <button type="button" class="ghost icon-button" data-model-library-remove="${index}" ${index === 0 ? "disabled" : ""} ${tip(t(index === 0 ? k.keepDefault : k.remove))}>${icon("trash-2")}</button>
      </div>${directory && state && (!state.available || state.truncated) ? `<span class="muted model-library-status" role="status">${t(state.available ? k.truncated : k.unavailable)}</span>` : ""}</div>`;
    }).join("")}</div>
  </div>`;
}

export function modelLibrariesFromForm(base: Settings): Pick<Settings, "modelDirectory" | "modelDirectories" | "modelDownloadDirectory"> | null {
  const container = document.querySelector<HTMLElement>("[data-model-libraries]");
  if (!container) return null;
  const inputs = [...container.querySelectorAll<HTMLInputElement>("[data-model-library-path]")];
  if (inputs.length === 1 && inputs[0]?.dataset.autoDirectory !== undefined && inputs[0]?.dataset.autoDirectory === inputs[0]?.value.trim() && !base.modelDirectories?.length && !base.modelDirectory.trim())
    return { modelDirectory: "", modelDirectories: base.modelDirectories, modelDownloadDirectory: base.modelDownloadDirectory };
  const rows = inputs.map(input => input.value.trim());
  return { modelDirectories: rows.length ? rows : [""], modelDirectory: rows[0] ?? "", modelDownloadDirectory: base.modelDownloadDirectory };
}
