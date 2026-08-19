import type {
  H3ReferenceMediaType,
  H3ReferenceRole,
  H3ReferenceSlot
} from "../../../types";
import type {
  H3CameraMotion,
  H3PromptBuilderInput
} from "../../../core/h3-prompt";
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

const h3CameraMotionLabels: Array<[H3CameraMotion, string]> = [
  ["static", uiKeys.create.fragments.cameraMotionStatic],
  ["push-in", uiKeys.create.fragments.cameraMotionPushIn],
  ["pull-out", uiKeys.create.fragments.cameraMotionPullOut],
  ["zoom-in", uiKeys.create.fragments.cameraMotionZoomIn],
  ["zoom-out", uiKeys.create.fragments.cameraMotionZoomOut],
  ["pan-left", uiKeys.create.fragments.cameraMotionPanLeft],
  ["pan-right", uiKeys.create.fragments.cameraMotionPanRight],
  ["truck-left", uiKeys.create.fragments.cameraMotionTruckLeft],
  ["truck-right", uiKeys.create.fragments.cameraMotionTruckRight],
  ["tilt-up", uiKeys.create.fragments.cameraMotionTiltUp],
  ["tilt-down", uiKeys.create.fragments.cameraMotionTiltDown],
  ["pedestal-up", uiKeys.create.fragments.cameraMotionPedestalUp],
  ["pedestal-down", uiKeys.create.fragments.cameraMotionPedestalDown],
  ["tracking", uiKeys.create.fragments.cameraMotionTracking],
  ["arc", uiKeys.create.fragments.cameraMotionArc],
  ["pov", uiKeys.create.fragments.cameraMotionPov],
  ["roll-clockwise", uiKeys.create.fragments.cameraMotionRollClockwise],
  ["roll-counterclockwise", uiKeys.create.fragments.cameraMotionRollCounterclockwise],
  ["shake-slight", uiKeys.create.fragments.cameraMotionShakeSlight]
];

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

function h3BuilderValue(
  builder: H3PromptBuilderInput,
  field: keyof H3PromptBuilderInput,
  escapeHtml: EscapeHtml
): string {
  return escapeHtml(builder[field]);
}

function h3BuilderTextField(
  builder: H3PromptBuilderInput,
  field: keyof H3PromptBuilderInput,
  labelKey: string,
  placeholderKey: string,
  escapeHtml: EscapeHtml,
  t: Translate,
  rows = 2
): string {
  const value = h3BuilderValue(builder, field, escapeHtml);
  return rows > 0
    ? `<label>${t(labelKey)}<textarea rows="${rows}" data-h3-builder="${field}" placeholder="${escapeHtml(t(placeholderKey))}">${value}</textarea></label>`
    : `<label>${t(labelKey)}<input data-h3-builder="${field}" value="${value}" placeholder="${escapeHtml(t(placeholderKey))}"></label>`;
}

function h3BuilderSelect(
  builder: H3PromptBuilderInput,
  field: keyof H3PromptBuilderInput,
  labelKey: string,
  options: ReadonlyArray<readonly [string, string]>,
  escapeHtml: EscapeHtml,
  t: Translate
): string {
  const selected = String(builder[field]);
  return `<label>${t(labelKey)}<select data-h3-builder="${field}">${options
    .map(([value, optionLabel]) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(t(optionLabel))}</option>`)
    .join("")}</select></label>`;
}

function h3ReferenceSlotRoleOptions(
  role: H3ReferenceRole,
  roleLabels: Record<H3ReferenceRole, string>
): string {
  return (Object.entries(roleLabels) as Array<[H3ReferenceRole, string]>)
    .map(([value, label]) => `<option value="${value}" ${value === role ? "selected" : ""}>${label}</option>`)
    .join("");
}

export function renderImageEditPromptInstructionOptions(
  escapeHtml: EscapeHtml,
  t: Translate
): string {
  return imageEditPromptInstructions
    .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(t(label))}</option>`)
    .join("");
}

export function renderH3PromptBuilderMarkup(
  builder: H3PromptBuilderInput,
  options: CreateFragmentRenderOptions
): string {
  const { t, icon, escapeHtml } = options;
  return `
    <div class="h3-prompt-builder">
      <div class="h3-builder-heading"><div><strong>${t(uiKeys.create.fragments.builderTitle)}</strong><span>${t(uiKeys.create.fragments.builderDescription)}</span></div><span class="model-badge">H3 Guide</span></div>
      <div class="h3-builder-grid">
        ${h3BuilderTextField(builder, "style", uiKeys.create.fragments.builderStyleLabel, uiKeys.create.fragments.builderStylePlaceholder, escapeHtml, t, 0)}
        ${h3BuilderTextField(builder, "subject", uiKeys.create.fragments.builderSubjectLabel, uiKeys.create.fragments.builderSubjectPlaceholder, escapeHtml, t)}
        ${h3BuilderTextField(builder, "action", uiKeys.create.fragments.builderActionLabel, uiKeys.create.fragments.builderActionPlaceholder, escapeHtml, t)}
        ${h3BuilderTextField(builder, "continuity", uiKeys.create.fragments.builderContinuityLabel, uiKeys.create.fragments.builderContinuityPlaceholder, escapeHtml, t)}
        ${h3BuilderTextField(builder, "physicalLock", uiKeys.create.fragments.builderPhysicalLockLabel, uiKeys.create.fragments.builderPhysicalLockPlaceholder, escapeHtml, t)}
        ${h3BuilderSelect(builder, "cameraMotion", uiKeys.create.fragments.builderCameraMotionLabel, h3CameraMotionLabels, escapeHtml, t)}
        ${h3BuilderSelect(builder, "cameraAmplitude", uiKeys.create.fragments.builderCameraAmplitudeLabel, [["small", uiKeys.create.fragments.cameraAmplitudeSmall], ["large", uiKeys.create.fragments.cameraAmplitudeLarge]], escapeHtml, t)}
        ${h3BuilderSelect(builder, "cameraSpeed", uiKeys.create.fragments.builderCameraSpeedLabel, [["slow", uiKeys.create.fragments.cameraSpeedSlow], ["fast", uiKeys.create.fragments.cameraSpeedFast]], escapeHtml, t)}
        ${h3BuilderTextField(builder, "framing", uiKeys.create.fragments.builderFramingLabel, uiKeys.create.fragments.builderFramingPlaceholder, escapeHtml, t)}
        ${h3BuilderTextField(builder, "diegeticSound", uiKeys.create.fragments.builderDiegeticSoundLabel, uiKeys.create.fragments.builderDiegeticSoundPlaceholder, escapeHtml, t)}
        ${h3BuilderTextField(builder, "finalState", uiKeys.create.fragments.builderFinalStateLabel, uiKeys.create.fragments.builderFinalStatePlaceholder, escapeHtml, t)}
      </div>
      <details class="h3-builder-optional">
        <summary><strong>${t(uiKeys.create.fragments.builderOptionalTitle)}</strong><span>${t(uiKeys.create.fragments.builderOptionalHint)}</span>${icon("chevron-down")}</summary>
        <div class="h3-builder-grid optional">
          ${h3BuilderTextField(builder, "soundscape", uiKeys.create.fragments.builderSoundscapeLabel, uiKeys.create.fragments.builderSoundscapePlaceholder, escapeHtml, t)}
          ${h3BuilderTextField(builder, "music", uiKeys.create.fragments.builderMusicLabel, uiKeys.create.fragments.builderMusicPlaceholder, escapeHtml, t)}
          ${h3BuilderTextField(builder, "dialogueSpeaker", uiKeys.create.fragments.builderDialogueSpeakerLabel, "S1", escapeHtml, t, 0)}
          ${h3BuilderTextField(builder, "dialogueLanguage", uiKeys.create.fragments.builderDialogueLanguageLabel, "Chinese / English", escapeHtml, t, 0)}
          ${h3BuilderTextField(builder, "dialogueDelivery", uiKeys.create.fragments.builderDialogueDeliveryLabel, "a clear, restrained Mandarin voice", escapeHtml, t, 0)}
          ${h3BuilderTextField(builder, "dialogueText", uiKeys.create.fragments.builderDialogueTextLabel, uiKeys.create.fragments.builderDialogueTextPlaceholder, escapeHtml, t)}
          ${h3BuilderTextField(builder, "onScreenText", uiKeys.create.fragments.builderOnScreenTextLabel, uiKeys.create.fragments.builderOnScreenTextPlaceholder, escapeHtml, t, 0)}
        </div>
      </details>
      <div class="h3-builder-actions"><button class="ghost button-with-icon" id="h3-builder-reset" type="button">${icon("refresh-cw")}${t(uiKeys.create.fragments.builderReset)}</button><button class="primary button-with-icon" id="h3-builder-generate" type="button">${icon("wand-sparkles")}${t(uiKeys.create.fragments.builderGenerate)}</button></div>
    </div>`;
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

export function renderCreateModelOptions(
  modelOptions: ReadonlyArray<CreateModelOptionViewModel>,
  escapeHtml: EscapeHtml
): string {
  return modelOptions
    .map((option) => `<option value="${escapeHtml(option.id)}" ${option.selected ? "selected" : ""} ${option.unavailable ? "disabled" : ""}>${escapeHtml(option.name)}${option.modeLabel}${option.suffix}</option>`)
    .join("");
}
