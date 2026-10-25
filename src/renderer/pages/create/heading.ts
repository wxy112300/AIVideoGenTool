import { uiKeys } from "../../../core/i18n-keys";
import type { CreatePageOptions } from "./page";

export function renderCreateHeading(mode: "image" | "video" | "image-edit", options: CreatePageOptions): string {
  const { t, icon } = options;
  const choices = [["image", "image", uiKeys.create.imageToVideo], ["video", "video", uiKeys.create.videoExtension], ["image-edit", "wand-sparkles", uiKeys.create.imageEditMode]] as const;
  return `<section class="create-page-heading"><h1>${t(mode === "image-edit" ? uiKeys.create.imageEditTitle : mode === "video" ? uiKeys.create.videoExtension : uiKeys.create.videoTitle)}</h1><div class="input-mode-switch" data-ui-segmented="create-mode" role="group" aria-label="${t(uiKeys.create.modeLabel)}">${choices.map(([value, glyph, label]) => `<button type="button" id="create-mode-${value}" data-input-mode="${value}" aria-pressed="${mode === value}">${icon(glyph)}${t(label)}</button>`).join("")}</div></section>`;
}
