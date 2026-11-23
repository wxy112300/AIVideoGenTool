import { uiKeys } from "../../../core/i18n-keys";
import { activeH3TimedGuides, isH3TimedGuideConfigured, orderedH3GuideSlots, supportsH3ReferenceGuides, supportsH3TimedGuides } from "../../../core/h3-timed-guides";
import type { CreatePageOptions, VideoCreatePageViewModel } from "./page";

export function renderH3GuideToggle(view: VideoCreatePageViewModel, options: CreatePageOptions): string {
  const reference = supportsH3ReferenceGuides(view.draft);
  if (!reference && !supportsH3TimedGuides(view.draft)) return "";
  const enabled = reference ? view.draft.h3ReferenceGuidesEnabled : Boolean(activeH3TimedGuides(view.draft));
  const keys = uiKeys.create.guides;
  const help = options.escapeHtml(options.t(reference ? keys.referenceModeHelp : keys.frameModeHelp));
  return `<div class="create-guide-control" data-ui-skip>
    <div class="create-guide-caption">
      <label for="toggle-h3-guides">${options.t(keys.mode)}</label>
      <button class="field-info" type="button" id="h3-guide-help" data-tooltip-toggle data-ui-tooltip="${help}" aria-label="${options.escapeHtml(options.t(keys.modeHelpLabel))}">${options.icon("info")}</button>
    </div>
    <label class="ios-switch-field create-guide-switch">
      <input id="toggle-h3-guides" type="checkbox" role="switch" ${enabled ? "checked" : ""}><span class="ios-switch" aria-hidden="true"></span>
    </label>
  </div>`;
}

export function renderH3GuideTime(
  options: Pick<CreatePageOptions, "t" | "escapeHtml">,
  picture: string,
  seconds: number | "end" | null | undefined,
  field: string
): string {
  const { t, escapeHtml } = options;
  return `<label class="h3-guide-time"><input ${field} type="number" min="0" step="any" value="${typeof seconds === "number" ? seconds : ""}" placeholder="${seconds === "end" ? escapeHtml(t(uiKeys.create.guides.end)) : ""}" aria-label="${escapeHtml(t(uiKeys.create.guides.seconds, { picture }))}"> <span>${t(uiKeys.create.videoMedia.seconds)}</span></label>`;
}

export function renderVideoFrames(view: VideoCreatePageViewModel, options: CreatePageOptions): string {
  const { t, icon, escapeHtml } = options;
  const mediaActions = (replace: string, clear: string, clearLabel: string, clearText: string) =>
    `<div class="create-media-actions"><button type="button" ${replace}>${icon("refresh-cw")}${t(uiKeys.create.mediaReplace)}</button><button type="button" ${clear} aria-label="${escapeHtml(clearLabel)}">${icon("eraser")}${clearText}</button></div>`;
  const editor = activeH3TimedGuides(view.draft);
  if (editor) {
    const slots = orderedH3GuideSlots(editor.slots);
    const keys = uiKeys.create.guides;
    return `<div class="create-frame-list h3-guide-list">${slots.map(slot => {
      const picture = `Picture ${slot.picture}`;
      const width = slot.mediaPath === view.draft.startImagePath ? view.draft.sourceWidth
        : slot.mediaPath === view.draft.endImagePath ? view.draft.endImageWidth : undefined;
      const height = slot.mediaPath === view.draft.startImagePath ? view.draft.sourceHeight
        : slot.mediaPath === view.draft.endImagePath ? view.draft.endImageHeight : undefined;
      const ratio = width && height ? width / height : 16 / 9;
      const remove = t(keys.remove, { picture });
      return `<div class="h3-guide-card ${slot.mediaPath ? "create-frame" : "h3-guide-empty"}" data-guide-slot="${slot.picture}" style="--media-ratio:${ratio};--media-r:${ratio}">
        <button class="${slot.mediaPath ? "drop-zone has-image create-frame-surface" : "create-media-drop"}" type="button" data-guide-pick
          aria-label="${escapeHtml(`${picture} · ${slot.mediaPath ? t(uiKeys.create.mediaReplace) : t(keys.choose)}`)}">
          ${slot.mediaPath ? `<img id="h3-guide-preview-${slot.picture}" alt="${picture}">` : `${icon("image-plus")}${t(keys.choose)}`}
        </button>
        <div class="h3-guide-header" data-ui-skip>
          <div class="h3-guide-identity">
            <span class="create-frame-label">${picture}</span>
            <button class="h3-guide-remove" type="button" data-guide-remove aria-label="${escapeHtml(remove)}" title="${escapeHtml(remove)}">${icon("trash-2")}</button>
          </div>
          <div class="h3-guide-metadata">
            ${renderH3GuideTime(options, picture, slot.seconds, `id="h3-guide-time-${slot.picture}" data-guide-time`)}
            <span class="create-caption" data-guide-incomplete ${isH3TimedGuideConfigured(slot) ? "hidden" : ""}>${t(keys.ignoredGuide)}</span>
            ${slot.mediaPath ? `<span class="create-frame-resolution" data-guide-resolution ${width && height ? "" : "hidden"}>${width && height ? `${width} × ${height}` : ""}</span>` : ""}
          </div>
        </div>
        ${slot.mediaPath ? mediaActions("data-guide-replace", "data-guide-clear",
          `${t(uiKeys.create.mediaClear)} · ${picture}`, t(uiKeys.create.imageEdit.clear)) : ""}
      </div>`;
    }).join("")}<button class="create-add-tile" type="button" id="add-h3-guide">${icon("plus")}${t(keys.add)}</button></div>`;
  }
  const frame = (kind: "start" | "end") => {
    const start = kind === "start";
    const width = start ? view.draft.sourceWidth : view.draft.endImageWidth;
    const height = start ? view.draft.sourceHeight : view.draft.endImageHeight;
    const dimensions = width && height ? `${width} × ${height}` : "";
    const ratio = width && height ? width / height : 16 / 9;
    const label = t(start ? uiKeys.create.mediaStart : uiKeys.create.mediaEnd);
    return `<div class="create-frame" data-paste-frame="${kind}" style="--media-ratio:${ratio};--media-r:${ratio}">
      <div class="drop-zone has-image create-frame-surface" id="pick-${kind}" data-drop-frame="${kind}" data-paste-frame="${kind}" data-drop-label="${t(start ? uiKeys.create.videoMedia.replaceStartFrame : uiKeys.create.videoMedia.replaceEndFrame)}"><img id="${kind}-preview" alt="${t(start ? uiKeys.create.videoMedia.startPreview : uiKeys.create.videoMedia.endPreview)}"></div>
      <span class="create-frame-label">${label}</span>${dimensions ? `<span class="create-frame-resolution">${escapeHtml(dimensions)}</span>` : ""}
      ${mediaActions(`data-replace-frame="${kind}"`, `data-clear-frame="${kind}"`,
        t(start ? uiKeys.create.videoMedia.deleteStartFrame : uiKeys.create.videoMedia.deleteEndFrame),
        t(start ? uiKeys.create.imageEdit.clear : uiKeys.create.removeEndFrame))}
    </div>`;
  };
  return `<div class="create-frame-list">${view.draft.startImagePath ? frame("start") : `<button type="button" class="create-media-drop" id="pick-start" data-drop-frame="start" data-paste-frame="start" data-drop-label="${t(uiKeys.create.videoMedia.addStartFrame)}">${icon("image-plus")}<strong>${t(uiKeys.create.mediaAddStart)}</strong><span>${t(uiKeys.create.mediaAddHint)}</span></button>`}${view.draft.endImagePath ? frame("end") : `<button type="button" class="create-add-tile" id="toggle-end" data-paste-frame="end" ${view.supportsEndImage ? "" : "disabled"}>${icon("plus")}<span><strong>${t(uiKeys.create.addEndFrame)}</strong><small>${t(uiKeys.create.mediaOptional)}</small></span></button>`}</div>`;
}
