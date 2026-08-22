import { uiKeys } from "../../../core/i18n-keys";
const imageEditPromptInstructions = [
    ["", uiKeys.create.fragments.imageInstructionPlaceholder],
    ["Keep the subject identity, composition, lighting direction, and background structure of Picture 1 unchanged.", uiKeys.create.fragments.imageInstructionKeepBase],
    ["Use every annotation note on the marked Picture as a concrete edit checklist and execute only those notes. Do not add or replace any annotation requirement; if this instruction conflicts with an annotation note, follow the annotation note. Keep all unmarked regions and unmentioned content unchanged except for local adjustments required to complete the annotations.", uiKeys.create.fragments.imageInstructionMarkedEdit],
    ["Only modify the explicitly specified region; do not change anything else in the image.", uiKeys.create.fragments.imageInstructionExplicitOnly],
    ["Remove the specified element and naturally fill the area using the surrounding texture, lighting, and perspective.", uiKeys.create.fragments.imageInstructionRemove],
    ["Add the specified element and match the original perspective, scale, lighting, shadows, depth of field, and grain.", uiKeys.create.fragments.imageInstructionAdd],
    ["Fix compositing artifacts caused by inconsistent cutout edges, color temperature, light direction, contact shadows, perspective, depth of field, or sharpness.", uiKeys.create.fragments.imageInstructionFix],
    ["Do not add text, logos, watermarks, or new elements the user did not request.", uiKeys.create.fragments.imageInstructionProhibit]
];
function h3ReferenceSlotRoleOptions(role, roleLabels) {
    return Object.entries(roleLabels)
        .map(([value, label]) => `<option value="${value}" ${value === role ? "selected" : ""}>${label}</option>`)
        .join("");
}
export function renderImageEditPromptInstructionOptions(escapeHtml, t) {
    return imageEditPromptInstructions
        .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(t(label))}</option>`)
        .join("");
}
export function renderH3ReferenceSlotsMarkup(slots, options) {
    const { t, icon, escapeHtml, h3ReferenceRoleLabels } = options;
    const referenceOrdinals = new Map();
    const typeCounts = { image: 0, video: 0 };
    slots.forEach((slot) => {
        typeCounts[slot.mediaType] += 1;
        referenceOrdinals.set(slot.id, typeCounts[slot.mediaType]);
    });
    return `
    ${slots.length ? `<div class="h3-reference-grid">${slots.map((slot, index) => `
      <article class="h3-reference-slot ${options.lockedFirstVideo && index === 0 && slot.mediaType === "video" ? "is-locked-source" : ""}" data-h3-slot="${escapeHtml(slot.id)}">
        <div class="h3-reference-slot-head">
          <div><strong>${t(uiKeys.create.fragments.referenceSlot, { index: index + 1 })}</strong><span>&lt;${slot.mediaType === "video" ? "Video" : "Picture"} ${referenceOrdinals.get(slot.id)}&gt; · ${t(slot.mediaType === "video" ? uiKeys.create.fragments.referenceVideo : uiKeys.create.fragments.referenceImage)}</span></div>
          <div class="h3-reference-slot-actions">${options.lockedFirstVideo && index === 0 && slot.mediaType === "video" ? "" : `<select class="h3-slot-type" data-h3-slot-type="${escapeHtml(slot.id)}" aria-label="${t(uiKeys.create.fragments.referenceSlot, { index: index + 1 })} ${t(uiKeys.create.fragments.mediaType)}"><option value="image" ${slot.mediaType === "image" ? "selected" : ""}>${t(uiKeys.create.fragments.image)}</option><option value="video" ${slot.mediaType === "video" ? "selected" : ""}>${t(uiKeys.create.fragments.video)}</option></select>`}<button class="secondary" data-insert-h3-slot="${escapeHtml(slot.id)}" type="button">${t(uiKeys.create.fragments.insertTag)}</button>${options.lockedFirstVideo && index === 0 && slot.mediaType === "video" ? "" : `<button class="icon-button" data-remove-h3-slot="${escapeHtml(slot.id)}" aria-label="${t(uiKeys.create.fragments.removeSlot)} ${index + 1}" title="${t(uiKeys.create.fragments.removeSlot)}">${icon("x")}</button>`}</div>
        </div>
        ${options.lockedFirstVideo && index === 0 && slot.mediaType === "video"
        ? `<div class="h3-reference-locked-source"><span class="drop-icon">${icon("video")}</span><div><strong>${t(uiKeys.create.fragments.motionContextSourceSlot)}</strong><span>${t(uiKeys.create.fragments.motionContextSourceDescription)}</span>${slot.mediaPath ? `<code title="${escapeHtml(slot.mediaPath)}">${escapeHtml(slot.mediaPath.split(/[\\/]/u).pop() ?? slot.mediaPath)}</code>` : ""}</div></div>`
        : slot.mediaType === "video" && slot.mediaPath
            ? `<div class="drop-zone h3-reference-drop has-image h3-video-reference" data-drop-h3-slot="${escapeHtml(slot.id)}" data-drop-label="${t(uiKeys.create.fragments.replaceReferenceVideo)}">
              <video controls playsinline preload="metadata" src="studio-media://draft/reference-video?source=${encodeURIComponent(slot.mediaPath)}" aria-label="${t(uiKeys.create.fragments.referenceVideo)} ${referenceOrdinals.get(slot.id)}"></video>
              <button class="image-remove button-with-icon" data-clear-h3-slot="${escapeHtml(slot.id)}" aria-label="${t(uiKeys.create.fragments.deleteReferenceVideo)} ${referenceOrdinals.get(slot.id)}" title="${t(uiKeys.create.fragments.deleteReferenceVideo)}">${icon("x")}<span>${t(uiKeys.create.fragments.deleteReferenceVideo)}</span></button>
            </div>`
            : slot.mediaPath
                ? `<div class="h3-reference-media-shell">
                <button class="drop-zone h3-reference-drop has-image" id="pick-h3-slot-${escapeHtml(slot.id)}" data-pick-h3-slot="${escapeHtml(slot.id)}" data-h3-slot-media-type="${slot.mediaType}" data-drop-h3-slot="${escapeHtml(slot.id)}" data-drop-label="${t(uiKeys.create.fragments.replaceReferenceImage)}">
                  <img id="h3-slot-preview-${escapeHtml(slot.id)}" alt="${t(uiKeys.create.fragments.referenceImage)} ${index + 1}${t(uiKeys.create.fragments.referencePreview)}"><span class="image-label">${t(uiKeys.create.fragments.clickOrDropReplaceImage)}</span>
                </button>
                <button class="image-remove button-with-icon" data-clear-h3-slot="${escapeHtml(slot.id)}" aria-label="${t(uiKeys.create.fragments.deleteReferenceImage)} ${referenceOrdinals.get(slot.id)}" title="${t(uiKeys.create.fragments.deleteReferenceImage)}">${icon("x")}<span>${t(uiKeys.create.fragments.deleteReferenceImage)}</span></button>
              </div>`
                : `<button class="drop-zone h3-reference-drop" id="pick-h3-slot-${escapeHtml(slot.id)}" data-pick-h3-slot="${escapeHtml(slot.id)}" data-h3-slot-media-type="${slot.mediaType}" data-drop-h3-slot="${escapeHtml(slot.id)}" data-drop-label="${t(slot.mediaType === "video" ? uiKeys.create.fragments.addReferenceVideo : uiKeys.create.fragments.addReferenceImage)}">
                <span class="drop-icon">${icon(slot.mediaType === "video" ? "video" : "image")}</span><strong>${t(slot.mediaType === "video" ? uiKeys.create.fragments.addReferenceVideo : uiKeys.create.fragments.addReferenceImage)}</strong><span>${slot.mediaType === "video" ? "MP4、MOV、WEBM、MKV" : "PNG、JPG、WEBP、BMP"}</span>
              </button>`}
        <label>${t(uiKeys.create.fragments.referenceRole)}<select data-h3-slot-role="${escapeHtml(slot.id)}" ${options.lockedFirstVideo && index === 0 && slot.mediaType === "video" ? "disabled" : ""}>${h3ReferenceSlotRoleOptions(slot.role, h3ReferenceRoleLabels)}</select></label>
        <label>${t(uiKeys.create.fragments.note)}<input data-h3-slot-note="${escapeHtml(slot.id)}" value="${escapeHtml(slot.note)}" placeholder="${t(uiKeys.create.fragments.notePlaceholder)}"></label>
      </article>`).join("")}</div>` : `
      <div class="h3-slot-empty"><span class="drop-icon">${icon("images")}</span><strong>${t(uiKeys.create.fragments.emptyTitle)}</strong><span>${t(uiKeys.create.fragments.emptyDescription)}</span><button class="secondary button-with-icon" id="add-h3-reference-slot-empty" type="button">${icon("plus")}${t(uiKeys.create.fragments.addFirstSlot)}</button></div>`}`;
}
export function renderCreateModelOptions(modelOptions, escapeHtml) {
    return modelOptions
        .map((option) => `<option value="${escapeHtml(option.id)}" ${option.selected ? "selected" : ""} ${option.unavailable ? "disabled" : ""}>${escapeHtml(option.name)}${option.modeLabel}${option.suffix}</option>`)
        .join("");
}
