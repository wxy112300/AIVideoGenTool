import { clampCustomVideoResolution, nearestSupportedVideoResolution, type VideoResolutionRange } from "../../../core/video-resolution";
import { outputDimensions } from "../../../core/workflow";
import type { Draft } from "../../../types";
import { paintRangeFill } from "../../shared/ui/runtime";

const choices = new WeakMap<HTMLElement, { key: string; custom: boolean }>();
export function mountResolutionControl(root: HTMLElement, getDraft: () => Draft | undefined): () => void {
  const source = root.querySelector<HTMLSelectElement>("#resolution");
  const panel = root.querySelector<HTMLElement>("[data-custom-resolution-panel]");
  const trigger = root.querySelector<HTMLButtonElement>("[data-custom-resolution]");
  if (!source || !panel || !trigger) return () => undefined;
  const key = `${getDraft()?.modelId}:${getDraft()?.inputMode}`;
  const previous = choices.get(root);
  const presets = () => [...root.querySelectorAll<HTMLButtonElement>("[data-video-resolution]")];
  const selected = previous?.key === key ? previous : { key, custom: !presets().some(button => Number(button.dataset.videoResolution) === Number(source.value)) };
  choices.set(root, selected);
  const slider = panel.querySelector<HTMLInputElement>('input[type="range"]')!;
  const number = panel.querySelector<HTMLInputElement>('input[type="number"]')!;
  const track = document.createElement("div"); track.className = "create-duration-slider";
  const ticks = document.createElement("div"); ticks.className = "create-duration-ticks"; ticks.setAttribute("aria-hidden", "true");
  slider.before(track); track.append(slider, ticks);
  const events = new AbortController(), { signal } = events;
  const bounds = () => JSON.parse(panel.dataset.range!) as VideoResolutionRange;
  const supported = () => presets().map(button => Number(button.dataset.videoResolution));
  const normalize = (value: number) => {
    const range = bounds(), options = supported();
    if (options.includes(value)) return value;
    return panel.hasAttribute("data-continuous") ? clampCustomVideoResolution(value, range) : nearestSupportedVideoResolution(value, options, options[0]!);
  };
  const paint = () => {
    const range = bounds(), maximum = range.max;
    for (const input of [slider, number]) {
      for (const [key, value] of [["min", range.min], ["max", maximum], ["step", input === slider ? "any" : range.step]] as const) if (input[key] !== String(value)) input[key] = String(value);
    }
    if (ticks.textContent !== `${range.min}${maximum}`) {
      ticks.replaceChildren();
      for (const value of [range.min, maximum]) { const tick = document.createElement("span"); tick.textContent = String(value); ticks.append(tick); }
    }
    panel.hidden = !selected.custom;
    trigger.setAttribute("aria-pressed", String(selected.custom));
    presets().forEach(button => button.setAttribute("aria-pressed", String(!selected.custom && Number(button.dataset.videoResolution) === Number(source.value))));
    for (const input of [slider, number]) if (input.value !== source.value) input.value = source.value;
    for (const input of [slider, number]) if (input.disabled !== source.disabled) input.disabled = source.disabled;
    paintRangeFill(slider);
  };
  const commit = (raw: number) => {
    if (!Number.isFinite(raw) || source.disabled) return;
    const value = normalize(raw);
    if (![...source.options].some(option => Number(option.value) === value)) source.add(new Option(`${value}p`, String(value)));
    if (source.value !== String(value)) {
      source.value = String(value);
      source.dispatchEvent(new Event("change", { bubbles: true }));
    }
    for (const input of [slider, number]) if (input.value !== String(value)) input.value = String(value);
    const draft = getDraft();
    const dimensions = root.querySelector("[data-output-dimensions]");
    if (draft && dimensions) dimensions.textContent = outputDimensions(draft).join(" × ");
    paint();
  };
  trigger.addEventListener("click", () => { selected.custom = true; commit(Number(source.value)); }, { signal });
  root.addEventListener("click", event => {
    const button = (event.target as Element).closest<HTMLButtonElement>("[data-video-resolution]");
    if (!button || button.disabled) return;
    selected.custom = false; commit(Number(button.dataset.videoResolution));
  }, { signal });
  root.addEventListener("create-controls-updated", paint, { signal });
  source.addEventListener("change", paint, { signal });
  slider.addEventListener("input", () => commit(slider.valueAsNumber), { signal });
  slider.addEventListener("keydown", event => {
    const range = bounds();
    const value = event.key === "Home" ? range.min : event.key === "End" ? range.max
      : ["ArrowRight", "ArrowUp"].includes(event.key) ? slider.valueAsNumber + range.step
      : ["ArrowLeft", "ArrowDown"].includes(event.key) ? slider.valueAsNumber - range.step : undefined;
    if (value === undefined || slider.disabled) return;
    event.preventDefault(); commit(value);
  }, { signal });
  let dragPointer: number | undefined;
  const move = (event: PointerEvent) => {
    if (dragPointer !== event.pointerId) return;
    const rect = slider.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left - 9) / Math.max(1, rect.width - 18)));
    slider.value = String(normalize(Number(slider.min) + fraction * (Number(slider.max) - Number(slider.min))));
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  };
  slider.addEventListener("pointerdown", event => {
    if (event.button !== 0 || slider.disabled) return;
    dragPointer = event.pointerId; slider.setPointerCapture(event.pointerId);
    event.preventDefault(); slider.focus({ preventScroll: true }); move(event);
  }, { signal });
  slider.addEventListener("pointermove", move, { signal });
  const release = (event: PointerEvent) => {
    if (dragPointer !== event.pointerId) return;
    if (slider.hasPointerCapture(event.pointerId)) slider.releasePointerCapture(event.pointerId);
    dragPointer = undefined;
  };
  slider.addEventListener("pointerup", release, { signal });
  slider.addEventListener("pointercancel", release, { signal });
  number.addEventListener("change", () => commit(number.value ? number.valueAsNumber : bounds().min), { signal });
  paint();
  return () => events.abort();
}
