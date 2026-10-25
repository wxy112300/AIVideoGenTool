import { createTranslator, type Translate } from "../../../core/i18n";
import { icon } from "../../shared/icons";
import { escapeHtml } from "../../shared/dom";

export const markupColors = ["#ff4f55", "#ffd60a", "#30d158", "#64d2ff", "#ffffff"];
export const markupTools = {
  select: "mouse-pointer-2", brush: "brush", highlight: "highlighter", rectangle: "square",
  ellipse: "circle", arrow: "move-up-right", text: "type", eraser: "eraser"
} as const;

export function renderMarkupEditor(picture: number, filename: string, mask: boolean,
  t: Translate = createTranslator().t): string {
  const text = (key: string) => escapeHtml(t(`create.markup.${key}`, { picture }));
  const action = (attribute: string, name: string, glyph: string, className = "ghost icon-button") =>
    `<button type="button" class="${className}" ${attribute} aria-label="${text(name)}" title="${text(name)}">${icon(glyph)}</button>`;
  return `<header class="image-markup-header">
    <div><strong id="image-markup-title">${text(mask ? "maskTitle" : "title")}</strong><span title="${escapeHtml(filename)}">${escapeHtml(filename.split(/[\\/]/u).pop() ?? filename)}</span></div>
    <div class="button-row"><button type="button" class="secondary" data-markup-cancel>${text("cancel")}</button><button type="button" class="primary button-with-icon" data-markup-save>${icon("check")}${text(mask ? "saveMask" : "save")}</button></div>
  </header><div class="image-markup-body">
    <aside class="image-markup-tools" aria-label="${text("tools")}">
      ${action("data-markup-crop", "crop", "crop")}<span class="markup-tool-divider"></span>
      ${Object.entries(markupTools).filter(([name]) => !mask || ["select", "brush", "highlight", "eraser"].includes(name)).map(([name, glyph]) =>
        action(`data-markup-tool="${name}" aria-pressed="${name === (mask ? "highlight" : "select")}"`, name, glyph)).join("")}
      <span class="markup-tool-divider"></span>${action("data-markup-undo", "undo", "undo-2")}${action("data-markup-redo", "redo", "redo-2")}
    </aside><main class="image-markup-stage"><div class="image-markup-canvas-shell"><canvas data-markup-canvas></canvas></div></main>
    <aside class="image-markup-inspector">
      <div class="markup-inspector-heading"><strong>${text(mask ? "maskTitle" : "notes")}</strong>${action("", mask ? "maskHelp" : "noteHelp", "info")}</div>
      <div class="markup-note-list" data-markup-note-list ${mask ? "hidden" : ""}></div>
      <div class="markup-style-controls"><div class="markup-color-field" ${mask ? "hidden" : ""}><span>${text("color")}</span><div class="markup-swatches">${markupColors.map((color, index) => `<button type="button" data-markup-swatch="${color}" style="--swatch:${color}" aria-label="${text(["red", "yellow", "green", "blue", "white"][index]!)}" aria-pressed="${index === 0}"></button>`).join("")}<label class="markup-custom-color" title="${text("customColor")}"><input data-markup-color type="color" value="#ff4f55" aria-label="${text("customColor")}"></label></div></div>
      <label class="markup-width-field"><span>${text("width")}</span><div><input type="range" data-markup-width min="2" max="${mask ? 96 : 28}" value="${mask ? 18 : 8}" aria-label="${text("width")}"><span class="markup-width-number"><input type="number" data-markup-width-number min="2" max="${mask ? 96 : 28}" value="${mask ? 18 : 8}" aria-label="${text("width")}"><span>px</span></span></div></label></div>
    </aside><div class="markup-zoom">${action("data-markup-zoom-out", "zoomOut", "minus")}<span data-markup-zoom-value>100%</span>${action("data-markup-zoom-in", "zoomIn", "plus")}<button type="button" class="ghost button-with-icon" data-markup-fit>${icon("scan")}${text("fit")}</button>${action("", "navigationHelp", "info")}</div>
  </div><div class="image-cropper-dialog" data-image-cropper-dialog hidden role="dialog" aria-modal="true" aria-label="${text("crop")}"><div class="image-cropper-panel">
    <header><strong>${text("crop")} Picture ${picture}</strong><button type="button" class="secondary" data-cropper-cancel>${text("cancel")}</button></header>
    <div class="image-cropper-stage"><img data-image-cropper-image alt="${text("crop")}"></div>
    <footer><label>${text("ratio")}<select data-cropper-aspect><option value="free">${text("free")}</option><option value="original">${text("original")}</option><option value="1">1 : 1</option><option value="1.3333333333">4 : 3</option><option value="1.7777777778">16 : 9</option><option value="0.5625">9 : 16</option></select></label><button type="button" class="secondary" data-cropper-reset>${text("reset")}</button><span class="image-cropper-size" data-cropper-size></span><button type="button" class="primary" data-cropper-apply>${text("apply")}</button></footer>
  </div></div>`;
}
