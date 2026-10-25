import type {
  H3ReferenceMediaType,
  H3ReferenceRole,
  H3ReferenceSlot
} from "../../../types";
import type { Translate } from "../../../core/i18n";
import { uiKeys } from "../../../core/i18n-keys";

type EscapeHtml = (value: unknown) => string;
type IconRenderer = (name: string, className?: string) => string;

export interface CreateModelOptionViewModel {
  id: string;
  name: string;
  selected: boolean;
  unavailable: boolean;
  modeLabel: string;
  suffix: string;
  group?: string;
  description?: string;
}

interface CreateFragmentRenderOptions {
  t: Translate;
  icon: IconRenderer;
  escapeHtml: EscapeHtml;
}

interface H3ReferenceSlotsRenderOptions extends CreateFragmentRenderOptions {
  h3ReferenceRoleLabels: Record<H3ReferenceRole, string>;
  lockedFirstVideo?: boolean;
}

const imageEditPromptInstructions: Array<[string, string]> = [
  ["", uiKeys.create.fragments.imageInstructionPlaceholder],
  ["Keep the subject identity, composition, lighting direction, and background structure of Picture 1 unchanged.", uiKeys.create.fragments.imageInstructionKeepBase],
  ["Use every annotation note on the marked Picture as a concrete edit checklist and execute only those notes. Do not add or replace any annotation requirement; if this instruction conflicts with an annotation note, follow the annotation note. Keep all unmarked regions and unmentioned content unchanged except for local adjustments required to complete the annotations.", uiKeys.create.fragments.imageInstructionMarkedEdit],
  ["Only modify the explicitly specified region; do not change anything else in the image.", uiKeys.create.fragments.imageInstructionExplicitOnly],
  ["Remove the specified element and naturally fill the area using the surrounding texture, lighting, and perspective.", uiKeys.create.fragments.imageInstructionRemove],
  ["Add the specified element and match the original perspective, scale, lighting, shadows, depth of field, and grain.", uiKeys.create.fragments.imageInstructionAdd],
  ["Fix compositing artifacts caused by inconsistent cutout edges, color temperature, light direction, contact shadows, perspective, depth of field, or sharpness.", uiKeys.create.fragments.imageInstructionFix],
  ["Do not add text, logos, watermarks, or new elements the user did not request.", uiKeys.create.fragments.imageInstructionProhibit]
];

function h3ReferenceSlotRoleOptions(
  role: H3ReferenceRole,
  roleLabels: Record<H3ReferenceRole, string>
): string {
  return (Object.entries(roleLabels) as Array<[H3ReferenceRole, string]>)
    .map(([value, label]) => `<option value="${value}" ${value === role ? "selected" : ""}>${label}</option>`)
    .join("");
}

function imageDimensionsSuffix(slot: H3ReferenceSlot): string {
  if (slot.mediaType !== "image" || !Number.isFinite(slot.width) || !Number.isFinite(slot.height) || slot.width! <= 0 || slot.height! <= 0) {
    return "";
  }
  return ` · ${Math.trunc(slot.width!)} × ${Math.trunc(slot.height!)}`;
}

export function renderImageEditPromptInstructionOptions(
  escapeHtml: EscapeHtml,
  t: Translate
): string {
  return imageEditPromptInstructions
    .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(t(label))}</option>`)
    .join("");
}

export function renderH3ReferenceSlotsMarkup(
  slots: ReadonlyArray<H3ReferenceSlot>,
  options: H3ReferenceSlotsRenderOptions
): string {
  const { t, icon, escapeHtml, h3ReferenceRoleLabels } = options;
  const referenceOrdinals = new Map<string, number>();
  const typeCounts: Record<H3ReferenceMediaType, number> = { image: 0, video: 0 };
  slots.forEach((slot) => {
    typeCounts[slot.mediaType] += 1;
    referenceOrdinals.set(slot.id, typeCounts[slot.mediaType]);
  });
  return `
    <div class="create-reference-list">${slots.map((slot, index) => `
      <article class="create-reference-card ${options.lockedFirstVideo && index === 0 && slot.mediaType === "video" ? "is-locked-source" : ""}" data-h3-slot="${escapeHtml(slot.id)}">
        <div class="create-slot-heading">
          <span class="create-slot-number">${index + 1}</span><strong>&lt;${slot.mediaType === "video" ? "Video" : "Picture"} ${referenceOrdinals.get(slot.id)}&gt;</strong><span class="create-slot-dimensions">${imageDimensionsSuffix(slot).replace(/^ · /u, "")}</span>
          <div class="create-slot-actions">${options.lockedFirstVideo && index === 0 && slot.mediaType === "video" ? "" : `<select class="h3-slot-type" data-h3-slot-type="${escapeHtml(slot.id)}" aria-label="${t(uiKeys.create.fragments.referenceSlot, { index: index + 1 })} ${t(uiKeys.create.fragments.mediaType)}"><option value="image" ${slot.mediaType === "image" ? "selected" : ""}>${t(uiKeys.create.fragments.image)}</option><option value="video" ${slot.mediaType === "video" ? "selected" : ""}>${t(uiKeys.create.fragments.video)}</option></select>`}<button class="ghost icon-button" data-insert-h3-slot="${escapeHtml(slot.id)}" type="button" aria-label="${t(uiKeys.create.fragments.insertTag)}" title="${t(uiKeys.create.fragments.insertTag)}">${icon("text-cursor-input")}</button>${options.lockedFirstVideo && index === 0 && slot.mediaType === "video" ? "" : `<button class="ghost icon-button" data-remove-h3-slot="${escapeHtml(slot.id)}" aria-label="${t(uiKeys.create.fragments.removeSlot)} ${index + 1}" title="${t(uiKeys.create.fragments.removeSlot)}">${icon("trash-2")}</button>`}</div>
        </div>
        ${options.lockedFirstVideo && index === 0 && slot.mediaType === "video"
            ? `<div class="h3-reference-locked-source"><span class="drop-icon">${icon("video")}</span><div><strong>${t(uiKeys.create.fragments.motionContextSourceSlot)}</strong><span>${t(uiKeys.create.fragments.motionContextSourceDescription)}</span>${slot.mediaPath ? `<code title="${escapeHtml(slot.mediaPath)}">${escapeHtml(slot.mediaPath.split(/[\\/]/u).pop() ?? slot.mediaPath)}</code>` : ""}</div></div>`
          : slot.mediaType === "video" && slot.mediaPath
            ? `<div class="create-slot-media create-slot-video" data-drop-h3-slot="${escapeHtml(slot.id)}" data-drop-label="${t(uiKeys.create.fragments.replaceReferenceVideo)}">
              <video controls playsinline preload="metadata" src="studio-media://draft/reference-video?source=${encodeURIComponent(slot.mediaPath)}" aria-label="${t(uiKeys.create.fragments.referenceVideo)} ${referenceOrdinals.get(slot.id)}"></video>
              <div class="create-media-actions"><button type="button" data-pick-h3-slot="${escapeHtml(slot.id)}" data-h3-slot-media-type="video">${icon("refresh-cw")}${t(uiKeys.create.mediaReplace)}</button><button type="button" data-clear-h3-slot="${escapeHtml(slot.id)}">${icon("eraser")}${t(uiKeys.create.mediaClear)}</button></div>
            </div>`
          : slot.mediaPath
            ? `<div class="create-slot-media" style="--media-ratio:${slot.width && slot.height ? slot.width / slot.height : 16 / 9};--media-r:${slot.width && slot.height ? slot.width / slot.height : 16 / 9}">
                <button class="drop-zone has-image create-frame-surface" id="pick-h3-slot-${escapeHtml(slot.id)}" data-pick-h3-slot="${escapeHtml(slot.id)}" data-h3-slot-media-type="${slot.mediaType}" data-drop-h3-slot="${escapeHtml(slot.id)}" data-drop-label="${t(uiKeys.create.fragments.replaceReferenceImage)}" aria-label="${t(uiKeys.create.mediaReplace)} Picture ${referenceOrdinals.get(slot.id)}">
                  <img id="h3-slot-preview-${escapeHtml(slot.id)}" alt="${t(uiKeys.create.fragments.referenceImage)} ${index + 1}${t(uiKeys.create.fragments.referencePreview)}">
                </button>
                <div class="create-media-actions"><button type="button" data-pick-h3-slot="${escapeHtml(slot.id)}" data-h3-slot-media-type="image">${icon("refresh-cw")}${t(uiKeys.create.mediaReplace)}</button><button type="button" data-clear-h3-slot="${escapeHtml(slot.id)}">${icon("eraser")}${t(uiKeys.create.mediaClear)}</button></div>
              </div>`
            : `<button class="create-empty-slot" id="pick-h3-slot-${escapeHtml(slot.id)}" data-pick-h3-slot="${escapeHtml(slot.id)}" data-h3-slot-media-type="${slot.mediaType}" data-drop-h3-slot="${escapeHtml(slot.id)}" data-drop-label="${t(slot.mediaType === "video" ? uiKeys.create.fragments.addReferenceVideo : uiKeys.create.fragments.addReferenceImage)}">
                ${icon(slot.mediaType === "video" ? "video" : "image-plus")}<span>${t(slot.mediaType === "video" ? uiKeys.create.fragments.addReferenceVideo : uiKeys.create.fragments.addReferenceImage)}</span>
              </button>`}
        <div class="create-slot-fields"><label><select aria-label="${t(uiKeys.create.fragments.referenceRole)}" data-h3-slot-role="${escapeHtml(slot.id)}" ${options.lockedFirstVideo && index === 0 && slot.mediaType === "video" ? "disabled" : ""}>${h3ReferenceSlotRoleOptions(slot.role, h3ReferenceRoleLabels)}</select></label>
        <label><input aria-label="${t(uiKeys.create.fragments.note)}" data-h3-slot-note="${escapeHtml(slot.id)}" value="${escapeHtml(slot.note)}" placeholder="${t(uiKeys.create.fragments.notePlaceholder)}"></label></div>
      </article>`).join("")}${slots.length < 12 ? `<button type="button" class="create-add-tile" id="${slots.length ? "add-h3-reference-slot" : "add-h3-reference-slot-empty"}" data-add-h3-slot>${icon("plus")}<span><strong>${t(slots.length ? uiKeys.create.addSlot : uiKeys.create.fragments.addFirstSlot)}</strong><small>${slots.length}/12 · ${t(uiKeys.create.mediaAddHint)}</small></span></button>` : ""}</div>`;
}

export function renderCreateModelOptions(
  modelOptions: ReadonlyArray<CreateModelOptionViewModel>,
  escapeHtml: EscapeHtml
): string {
  const renderOption = (option: CreateModelOptionViewModel) => `<option value="${escapeHtml(option.id)}" data-note="${escapeHtml([option.modeLabel, option.suffix, option.description].map(value => value?.replace(/^[\s·]+/u, "")).filter(Boolean).join(" · "))}" ${option.selected ? "selected" : ""} ${option.unavailable ? "disabled" : ""}>${escapeHtml(option.name)}</option>`;
  return [...new Set(modelOptions.map(option => option.group))].map(group => {
    const content = modelOptions.filter(option => option.group === group).map(renderOption).join("");
    return group ? `<optgroup label="${escapeHtml(group)}">${content}</optgroup>` : content;
  }).join("");
}
