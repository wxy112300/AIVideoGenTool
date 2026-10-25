import { uiKeys } from "../../../core/i18n-keys";
import type { CreatePageOptions, VideoCreatePageViewModel } from "./page";

export function renderVideoFrames(view: VideoCreatePageViewModel, options: CreatePageOptions): string {
  const { t, icon, escapeHtml } = options;
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
      <div class="create-media-actions"><button type="button" data-replace-frame="${kind}">${icon("refresh-cw")}${t(uiKeys.create.mediaReplace)}</button><button type="button" data-clear-frame="${kind}" aria-label="${t(start ? uiKeys.create.videoMedia.deleteStartFrame : uiKeys.create.videoMedia.deleteEndFrame)}">${icon("eraser")}${t(start ? uiKeys.create.imageEdit.clear : uiKeys.create.removeEndFrame)}</button></div>
    </div>`;
  };
  return `<div class="create-frame-list">${view.draft.startImagePath ? frame("start") : `<button type="button" class="create-media-drop" id="pick-start" data-drop-frame="start" data-paste-frame="start" data-drop-label="${t(uiKeys.create.videoMedia.addStartFrame)}">${icon("image-plus")}<strong>${t(uiKeys.create.mediaAddStart)}</strong><span>${t(uiKeys.create.mediaAddHint)}</span></button>`}${view.draft.endImagePath ? frame("end") : `<button type="button" class="create-add-tile" id="toggle-end" data-paste-frame="end" ${view.supportsEndImage ? "" : "disabled"}>${icon("plus")}<span><strong>${t(uiKeys.create.addEndFrame)}</strong><small>${t(uiKeys.create.mediaOptional)}</small></span></button>`}</div>`;
}
