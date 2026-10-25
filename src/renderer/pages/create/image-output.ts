import { clampCustomImageResolution, imageModelCapabilityFor, imageOutputCountMax, imageOutputDimensions, imageTargetResolutionRange } from "../../../core/image-workflow";
import { uiKeys } from "../../../core/i18n-keys";
import type { ImageEditDraft } from "../../../types";
import type { Translate } from "../../../core/i18n";
import type { CreatePageOptions, ImageEditPageViewModel } from "./page";
import { paintRangeFill } from "../../shared/ui/runtime";
import { icon, renderIcons } from "../../shared/icons";

const resolutionChoices = new WeakMap<HTMLElement, { modelId: string; custom: boolean }>();

export function imageOutputSummary(draft: ImageEditDraft, t: Translate, name?: string): string {
  const capability = imageModelCapabilityFor(draft.modelId), base = draft.pictures[0];
  const dimensions = imageOutputDimensions(base?.width ?? 0, base?.height ?? 0, draft.targetResolution,
    capability.textOnlyOutputWidth, capability.textOnlyOutputHeight, draft.aspectRatio,
    capability.outputMultiple ?? (base ? capability.customOutputMultiple ?? 8 : 8));
  return [name ?? capability.name, t(uiKeys.create.imageEdit.outputCountValue, { count: capability.deterministic ? 1 : draft.outputCount }),
    dimensions.every(value => value > 0) ? dimensions.join(" × ") : ""].filter(Boolean).join(" · ");
}

export function renderImageOutput(vm: ImageEditPageViewModel, options: CreatePageOptions): string {
  const { icon, t, escapeHtml: e } = options;
  const capability = imageModelCapabilityFor(vm.draft.modelId);
  return `<section class="composer-control-group image-edit-output-group" data-image-model-name="${e(vm.imageCapabilityName)}">
    <div class="create-card-heading"><h3>${t(uiKeys.create.imageEdit.generationSettings)}</h3></div>
    <div class="composer-control-grid">
      <label class="settings-field create-span-2">${t(uiKeys.create.imageEdit.model)}<select id="image-edit-model">${vm.imageModelOptionsMarkup}</select></label>
      <label class="settings-field" ${capability.deterministic ? "hidden" : ""}>${t(uiKeys.create.imageEdit.quality)}<select id="image-edit-quality">${vm.imageQualityOptionsMarkup}</select></label>
      ${vm.imageAspectRatioVisible ? `<label class="settings-field">${t(uiKeys.create.imageEdit.outputAspectRatio)}<select id="image-edit-aspect-ratio">${vm.imageAspectRatioOptionsMarkup}</select></label>` : ""}
      ${!vm.promptless && capability.supportsSeed !== false ? `<label class="settings-field create-span-2">${t(uiKeys.create.imageEdit.randomSeed)}<div class="seed-control"><input id="image-edit-seed" type="number" placeholder="${t(uiKeys.create.imageEdit.randomPerImage)}" value="${vm.draft.seed ?? ""}"><button class="icon-button" id="random-image-edit-seed" title="${t(uiKeys.create.imageEdit.randomizeSeed)}">${icon("dices")}</button><button class="icon-button" id="clear-image-edit-seed" title="${t(uiKeys.create.imageEdit.clearSeed)}">${icon("x")}</button></div></label>` : ""}
      ${vm.imageResolutionVisible ? `<div class="settings-field create-span-3 image-resolution-control"><div class="create-field-label"><span>${t(uiKeys.create.imageEdit.outputResolution)}</span><output data-image-output-dimensions></output></div>
        <select id="image-edit-resolution" hidden data-native-select>${vm.imageResolutionOptionsMarkup}</select>
        <div class="create-resolution-segment" data-ui-segmented="image-resolution" data-image-resolution-presets role="group" aria-label="${t(uiKeys.create.imageEdit.outputResolution)}"></div>
        <div class="image-slider-row" data-image-custom-resolution-panel hidden><div class="create-duration-slider"><input type="range" data-image-resolution-slider aria-label="${t(uiKeys.create.imageEdit.outputResolution)}"><div class="create-duration-ticks" data-image-resolution-ticks aria-hidden="true"></div></div><input type="number" data-image-resolution-number aria-label="${t(uiKeys.create.imageEdit.outputResolution)}"><span>px</span></div></div>` : ""}
      ${vm.outputCountVisible ? `<div class="settings-field create-span-3"><span>${t(uiKeys.create.imageEdit.outputCount)}</span><div class="image-slider-row"><div class="create-duration-slider"><input id="image-edit-count" type="range" min="1" max="${imageOutputCountMax}" step="1" value="${vm.count}" aria-label="${t(uiKeys.create.imageEdit.outputCount)}"><div class="create-duration-ticks" aria-hidden="true">${Array.from({ length: imageOutputCountMax }, (_, index) => `<span>${index + 1}</span>`).join("")}</div></div><input type="number" data-image-count-number min="1" max="${imageOutputCountMax}" value="${vm.count}" aria-label="${t(uiKeys.create.imageEdit.outputCount)}"><span>${t(uiKeys.create.imageEdit.outputCountValue, { count: "" })}</span><output id="image-edit-count-value" hidden>${t(uiKeys.create.imageEdit.outputCountValue, { count: vm.count })}</output></div></div>` : ""}
    </div></section>
    ${vm.imageLoraVisible ? `<section class="create-lora-card"><div class="create-lora-heading"><h3>${t(uiKeys.create.finish.imageLora)}</h3></div>${vm.imageLoraOptionsMarkup}<div class="create-lora-footer"><select id="image-lora-to-add" hidden data-native-select>${vm.imageLoraAddOptionsMarkup}</select><button id="add-image-lora" hidden ${vm.imageLoraAddDisabled ? "disabled" : ""}></button><button class="secondary button-with-icon" id="image-lora-menu-trigger" type="button" aria-haspopup="dialog" aria-expanded="false" data-search-label="${t(uiKeys.create.editor.loraSearch)}" data-no-results-label="${t(uiKeys.create.editor.loraEmpty)}" data-empty-label="${t(uiKeys.create.validation.loraNoMore)}">${icon("plus")}${t(uiKeys.create.editor.addLora)}${icon("chevron-down")}</button></div></section>` : ""}
<div class="create-submit-bar"><div class="create-submit-copy"><span class="create-submit-summary" data-image-submit-summary>${e(imageOutputSummary(vm.draft, t, vm.imageCapabilityName))}</span><p class="composer-submit-status ${vm.enqueuePending ? "pending" : "error"}" data-enqueue-feedback role="status" aria-live="polite" ${vm.enqueueBlockReason ? "" : "hidden"}>${icon(vm.enqueuePending ? "refresh-cw" : "circle-alert")}<span>${e(vm.enqueueBlockReason)}</span></p></div><span class="create-draft-alert" data-draft-save-error role="alert" hidden><span>${icon("alert-triangle")}${t(uiKeys.create.editor.draftFailed)}</span><button class="ghost button-with-icon" type="button" data-retry-draft-save>${icon("refresh-cw")}${t(uiKeys.create.editor.retry)}</button></span><div class="composer-submit-actions"><button class="ghost danger button-with-icon" id="clear-image-edit-draft">${icon("trash-2")}${t(uiKeys.create.imageEdit.clear)}</button>${vm.imagePromptTokenEstimate == null ? "" : `<span class="composer-token-estimate" data-image-token-estimate title="${t(uiKeys.create.imageEdit.tokenEstimate)}">${vm.imagePromptTokenEstimate} tokens</span>`}<button class="primary button-with-icon enqueue-button" id="enqueue-image-edit" data-ui-label-variants="${e(JSON.stringify([t(uiKeys.create.imageEdit.enqueue), t(uiKeys.create.imageEdit.enqueueBusy)]))}" ${vm.enqueueBlockReason || vm.enqueueBusy ? "disabled" : ""} aria-busy="${vm.enqueueBusy}">${icon(vm.enqueueBusy ? "refresh-cw" : "list-plus", "enqueue-spinner")}<span data-enqueue-label>${t(vm.enqueueBusy ? uiKeys.create.imageEdit.enqueueBusy : uiKeys.create.imageEdit.enqueue)}</span></button></div></div>`;
}

/** Quick presets and free short-edge input share the existing numeric draft field. */
export function mountImageOutput(root: HTMLElement, getDraft: () => ImageEditDraft | undefined, t: Translate): () => void {
  const source = root.querySelector<HTMLSelectElement>("#image-edit-resolution");
  const slider = root.querySelector<HTMLInputElement>("[data-image-resolution-slider]");
  const number = root.querySelector<HTMLInputElement>("[data-image-resolution-number]");
  const group = root.querySelector<HTMLElement>("[data-image-resolution-presets]");
  const panel = root.querySelector<HTMLElement>("[data-image-custom-resolution-panel]");
  const events = new AbortController(), { signal } = events;
  const values = source ? [...source.options].map(option => option.value).filter(value => value !== "source").map(Number).sort((a,b) => a-b) : [];
  const presets = ["source", "720", "1024", "1080", "1536", "2160"];
  const initial = getDraft();
  const previous = resolutionChoices.get(root);
  const selected = previous && previous.modelId === initial?.modelId ? previous : {
    modelId: initial?.modelId ?? "", custom: !presets.includes(String(initial?.targetResolution ?? "source"))
  };
  resolutionChoices.set(root, selected);
  const step = () => {
    const draft = getDraft(); if (!draft) return 8;
    const cap = imageModelCapabilityFor(draft.modelId);
    return cap.outputMultiple ?? (draft.pictures.some(picture => picture.absolutePath.trim()) ? cap.customOutputMultiple ?? 8 : 8);
  };
  const ensureValue = (value: string) => {
    if (!source) return;
    if (![...source.options].some(option => option.value === value)) source.add(new Option(value, value));
    source.value = value;
  };
  const dimensions = () => {
    const draft = getDraft(); if (!draft) return [0,0];
    const cap = imageModelCapabilityFor(draft.modelId), base = draft.pictures[0];
    return imageOutputDimensions(base?.width ?? 0, base?.height ?? 0, draft.targetResolution,
      cap.textOnlyOutputWidth, cap.textOnlyOutputHeight, draft.aspectRatio, cap.outputMultiple ?? (base ? cap.customOutputMultiple ?? 8 : 8));
  };
  const sync = () => {
    const draft = getDraft(); if (!draft) return;
    const dims = dimensions();
    const output = root.querySelector("[data-image-output-dimensions]"); if (output) output.textContent = dims.every(v => v > 0) ? dims.join(" × ") : "";
    const summary = root.querySelector("[data-image-submit-summary]"); if (summary) summary.textContent = imageOutputSummary(draft, t, root.querySelector<HTMLElement>("[data-image-model-name]")?.dataset.imageModelName);
    if (source && slider && number && group && values.length) {
      ensureValue(String(draft.targetResolution));
      const size = draft.targetResolution === "source" ? Math.min(...dims) : draft.targetResolution;
      for (const [key, value] of [["min", imageTargetResolutionRange.min], ["max", imageTargetResolutionRange.max], ["step", "any"]] as const) if (slider[key] !== String(value)) slider[key] = String(value);
      if (slider.value !== String(size)) slider.value = String(size); paintRangeFill(slider);
      number.min = String(imageTargetResolutionRange.min); number.max = String(imageTargetResolutionRange.max); number.step = String(step()); number.value = String(size);
      if (panel) panel.hidden = !selected.custom;
      group.querySelector("[data-image-custom-resolution]")?.setAttribute("aria-pressed", String(selected.custom));
      group.querySelectorAll<HTMLElement>("[data-image-resolution]").forEach(button => button.setAttribute("aria-pressed", String(!selected.custom && button.dataset.imageResolution === source.value)));
    }
    const count = root.querySelector<HTMLInputElement>("[data-image-count-number]"); if (count) count.value = String(draft.outputCount);
  };
  if (source && group) for (const option of [...source.options].sort((a,b) => (a.value === "source" ? 0 : Number(a.value)) - (b.value === "source" ? 0 : Number(b.value)))) {
    if (!presets.includes(option.value)) continue;
    const button = document.createElement("button"); button.type = "button"; button.dataset.imageResolution = option.value;
    button.textContent = option.value === "source" ? option.textContent!.split(" · ")[0]! : option.value;
    button.addEventListener("click", () => { selected.custom = false; source.value = option.value; source.dispatchEvent(new Event("change", { bubbles: true })); sync(); }, { signal }); group.append(button);
  }
  const commit = (value: number) => { if (!source || !Number.isFinite(value) || !values.length) return;
    selected.custom = true;
    const next = String(clampCustomImageResolution(value, step()));
    const changed = source.value !== next;
    ensureValue(next);
    if (changed) source.dispatchEvent(new Event("change", { bubbles: true }));
    sync(); };
  if (source && group) {
    const button = document.createElement("button"); button.type = "button"; button.dataset.imageCustomResolution = "";
    button.innerHTML = `${icon("sliders-horizontal")}<span>${t(uiKeys.create.editor.custom)}</span>`;
    button.addEventListener("click", () => {
      const draft = getDraft(); if (!draft) return;
      commit(draft.targetResolution === "source" ? Math.min(...dimensions()) : draft.targetResolution);
    }, { signal });
    group.append(button); renderIcons(group);
  }
  slider?.addEventListener("input", () => commit(slider.valueAsNumber), { signal });
  slider?.addEventListener("keydown", event => {
    const current = slider.valueAsNumber;
    const value = event.key === "Home" ? imageTargetResolutionRange.min : event.key === "End" ? imageTargetResolutionRange.max
      : ["ArrowRight", "ArrowUp"].includes(event.key) ? current + step()
      : ["ArrowLeft", "ArrowDown"].includes(event.key) ? current - step() : undefined;
    if (value === undefined) return;
    event.preventDefault(); commit(value);
  }, { signal });
  let pointer: number | undefined;
  const move = (event: PointerEvent) => {
    if (!slider || pointer !== event.pointerId) return;
    const rect = slider.getBoundingClientRect(), fraction = Math.max(0, Math.min(1, (event.clientX-rect.left-9)/Math.max(1,rect.width-18)));
    slider.value = String(Number(slider.min)+fraction*(Number(slider.max)-Number(slider.min)));
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  };
  slider?.addEventListener("pointerdown", event => {
    if (event.button !== 0 || slider.disabled) return;
    pointer = event.pointerId; slider.setPointerCapture(pointer); event.preventDefault(); slider.focus({ preventScroll: true }); move(event);
  }, { signal });
  slider?.addEventListener("pointermove", move, { signal });
  const release = (event: PointerEvent) => {
    if (!slider || pointer !== event.pointerId) return;
    if (slider.hasPointerCapture(pointer)) slider.releasePointerCapture(pointer);
    pointer = undefined;
  };
  slider?.addEventListener("pointerup", release, { signal }); slider?.addEventListener("pointercancel", release, { signal });
  number?.addEventListener("change", () => { commit(number.valueAsNumber); sync(); }, { signal });
  const ticks = root.querySelector("[data-image-resolution-ticks]"); if (ticks && values.length) ticks.innerHTML = `<span>${imageTargetResolutionRange.min}</span><span>${imageTargetResolutionRange.max}</span>`;
  root.addEventListener("image-controls-updated", sync, { signal }); sync();
  return () => events.abort();
}
