import { appearanceAccents, appearancePalettes, historyMasonryColumnChoices, historyAlbumColumnChoices, normalizeAppearance, type UiAppearance } from "../../../core/appearance";
import { uiKeys } from "../../../core/i18n-keys";
import type { Translate } from "../../../core/i18n";
import { applyAppearance } from "../../shared/ui/appearance";
import { icon } from "../../shared/icons";

export function renderAppearanceSettings(value: unknown, t: Translate): string {
  const appearance = normalizeAppearance(value);
  const groups = [
    ["accent", appearanceAccents, uiKeys.appearance.accents],
    ["palette", appearancePalettes, uiKeys.appearance.palettes],
    ["depth", ["0", "1", "2"], uiKeys.appearance.depths],
    ["motion", ["system", "standard", "reduced"], uiKeys.appearance.motions]
  ] as const;
  const descriptions = { accent: uiKeys.appearance.accentHint, palette: uiKeys.appearance.paletteHint, motion: uiKeys.appearance.motionHint };
  const historyRows = ([
    ["historyMasonryColumns", historyMasonryColumnChoices],
    ["historyAlbumColumns", historyAlbumColumnChoices]
  ] as const).map(([key, values]) => `<div class="appearance-row"><div class="appearance-copy"><h3 id="appearance-${key}-label">${t(uiKeys.appearance[key])}</h3></div><div class="appearance-options appearance-segment" role="radiogroup" aria-labelledby="appearance-${key}-label">${values.map(value => `<button type="button" id="appearance-${key}-${value}" class="appearance-choice" role="radio" aria-checked="${appearance[key] === value}" tabindex="${appearance[key] === value ? 0 : -1}" data-appearance-key="${key}" data-appearance-value="${value}">${value}</button>`).join("")}</div></div>`).join("");
  return `<section class="appearance-settings"><header class="appearance-heading"><h2>${t(uiKeys.appearance.title)}</h2><span>${t(uiKeys.appearance.immediate)}</span></header><section class="appearance-panel">${groups.map(([key, values, labels]) => {
    const hint = descriptions[key as keyof typeof descriptions];
    return `<div class="appearance-row"><div class="appearance-copy"><h3 id="appearance-${key}-label">${t(uiKeys.appearance[key])}</h3>${hint ? `<p>${t(hint)}</p>` : ""}</div><div class="appearance-options ${key === "accent" ? "appearance-swatches" : "appearance-segment"}" role="radiogroup" aria-labelledby="appearance-${key}-label">${values.map((value) => {
      const label = t((labels as Record<string, string>)[value]!);
      return `<button type="button" id="appearance-${key}-${value}" class="appearance-choice" role="radio" aria-checked="${appearance[key] === value}" tabindex="${appearance[key] === value ? 0 : -1}" data-appearance-key="${key}" data-appearance-value="${value}" ${key === "accent" ? `data-swatch="${value}" aria-label="${label}" title="${label}"` : ""}>${key === "accent" ? "" : label}</button>`;
    }).join("")}</div></div>`;
  }).join("")}${historyRows}<div class="appearance-row"><div class="appearance-copy"><h3 id="appearance-preview-label">${t(uiKeys.appearance.preview)}</h3></div><div class="appearance-preview" role="group" aria-labelledby="appearance-preview-label"><button type="button" class="primary appearance-preview-button">${icon("list-plus")}${t(uiKeys.appearance.previewQueue)}</button><button type="button" class="secondary appearance-preview-button appearance-preview-tinted">${icon("sparkles")}${t(uiKeys.appearance.previewEnhance)}</button><label class="appearance-preview-switch" data-ui-skip><input type="checkbox" checked aria-label="${t(uiKeys.appearance.previewSwitch)}"><span></span></label><div class="appearance-preview-progress" aria-hidden="true"><span></span></div></div></div></section></section>`;
}

export function mountAppearanceSettings(root: HTMLElement, save: (value: UiAppearance) => Promise<void>, failed: () => void): () => void {
  const events = new AbortController();
  const buttons = [...root.querySelectorAll<HTMLButtonElement>("[data-appearance-key]")];
  const segments = [...root.querySelectorAll<HTMLElement>(".appearance-segment")];
  const positionThumbs = () => {
    for (const segment of segments) {
      const selected = segment.querySelector<HTMLElement>('[aria-checked="true"]');
      if (!selected) continue;
      segment.style.setProperty("--thumb-left", `${selected.offsetLeft}px`);
      segment.style.setProperty("--thumb-width", `${selected.offsetWidth}px`);
      segment.classList.add("thumb-ready");
    }
  };
  positionThumbs();
  const resize = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(positionThumbs);
  segments.forEach((segment) => resize?.observe(segment));
  let saving = false;
  const paint = (appearance: UiAppearance) => {
    for (const button of buttons) {
      const key = button.dataset.appearanceKey as keyof UiAppearance;
      const selected = String(appearance[key]) === button.dataset.appearanceValue;
      button.setAttribute("aria-checked", String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    positionThumbs();
  };
  for (const button of buttons) {
    button.addEventListener("click", () => {
      if (saving) return;
      const previous = normalizeAppearance(document.documentElement.dataset);
      const next = normalizeAppearance({ ...previous, [button.dataset.appearanceKey!]: button.dataset.appearanceValue });
      if (JSON.stringify(next) === JSON.stringify(previous)) return;
      saving = true;
      applyAppearance(next);
      paint(next);
      // Keep the focused control focusable while persistence is in flight.
      buttons.forEach((item) => item.setAttribute("aria-disabled", "true"));
      void save(next).catch(() => { applyAppearance(previous); paint(previous); failed(); }).finally(() => {
        saving = false;
        buttons.forEach((item) => item.removeAttribute("aria-disabled"));
      });
    }, { signal: events.signal });
    button.addEventListener("keydown", (event) => {
      const siblings = buttons.filter((item) => item.dataset.appearanceKey === button.dataset.appearanceKey);
      const index = siblings.indexOf(button);
      const next = event.key === "Home" ? 0 : event.key === "End" ? siblings.length - 1 :
        event.key === "ArrowRight" || event.key === "ArrowDown" ? (index + 1) % siblings.length :
        event.key === "ArrowLeft" || event.key === "ArrowUp" ? (index + siblings.length - 1) % siblings.length : -1;
      if (next < 0) return;
      event.preventDefault();
      if (saving) return;
      siblings[next]?.focus();
      siblings[next]?.click();
    }, { signal: events.signal });
  }
  return () => { events.abort(); resize?.disconnect(); };
}
