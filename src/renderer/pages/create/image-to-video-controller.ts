import type { Draft } from "../../../types";
import type { RendererCleanup, RendererContext } from "../../contracts";
import { uiKeys } from "../../../core/i18n-keys";

export interface ImageToVideoControllerOptions {
  patchDraft(patch: Partial<Draft>): void;
}

function bindFrameDrop(
  context: RendererContext,
  selector: string,
  field: "startImagePath" | "endImagePath",
  options: ImageToVideoControllerOptions,
  signal: AbortSignal
): void {
  const zone = context.root.querySelector<HTMLElement>(selector);
  if (!zone) return;
  const t = context.t;
  const clearDragState = () => zone.classList.remove("drag-over");
  zone.addEventListener("dragenter", (event) => {
    event.preventDefault();
    zone.classList.add("drag-over");
  }, { signal });
  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    zone.classList.add("drag-over");
  }, { signal });
  zone.addEventListener("dragleave", (event) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && zone.contains(nextTarget)) return;
    clearDragState();
  }, { signal });
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    clearDragState();
    const file = event.dataTransfer?.files.item(0);
    if (!file) return;
    if (!file.type.startsWith("image/") && !/\.(png|jpe?g|webp|bmp)$/i.test(file.name)) {
      context.notify(t(uiKeys.create.interaction.invalidImageDrop));
      return;
    }
    const filename = context.studio.getDroppedFilePath(file);
    if (!filename) {
      context.notify(t(uiKeys.create.interaction.imagePathFailed));
      return;
    }
    options.patchDraft({
      [field]: filename,
      ...(field === "startImagePath" ? { sourceWidth: 0, sourceHeight: 0 } : {})
    });
    context.requestRender();
  }, { signal });
}

function bindFramePicker(
  context: RendererContext,
  root: HTMLElement,
  selector: string,
  field: "startImagePath" | "endImagePath",
  options: ImageToVideoControllerOptions,
  signal: AbortSignal
): void {
  const zone = root.querySelector<HTMLElement>(selector);
  if (!zone || zone.classList.contains("has-image")) return;
  zone.addEventListener("click", async (event) => {
    event.stopImmediatePropagation();
    const filename = await context.studio.pickImage();
    if (!filename) return;
    options.patchDraft({
      [field]: filename,
      ...(field === "startImagePath" ? { sourceWidth: 0, sourceHeight: 0 } : {})
    });
    context.requestRender();
  }, { signal });
}

export function mountImageToVideoController(
  context: RendererContext,
  options: ImageToVideoControllerOptions
): RendererCleanup {
  const events = new AbortController();
  const signal = events.signal;
  const root = context.root;

  bindFramePicker(context, root, "#pick-start", "startImagePath", options, signal);
  bindFramePicker(context, root, "#pick-end", "endImagePath", options, signal);

  root.querySelector("#toggle-end")?.addEventListener("click", async (event) => {
    event.stopImmediatePropagation();
    const draft = context.getState()?.draft;
    if (!draft) return;
    if (draft.endImagePath) {
      options.patchDraft({ endImagePath: "" });
      context.requestRender();
      return;
    }
    const filename = await context.studio.pickImage();
    if (!filename) return;
    options.patchDraft({ endImagePath: filename });
    context.requestRender();
  }, { signal });

  root.querySelectorAll<HTMLElement>("[data-clear-frame]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const field = button.dataset.clearFrame === "end"
        ? "endImagePath"
        : "startImagePath";
      options.patchDraft({
        [field]: "",
        ...(field === "startImagePath" ? { sourceWidth: 0, sourceHeight: 0 } : {})
      });
      context.requestRender();
    }, { signal });
  });

  bindFrameDrop(context, "#pick-start", "startImagePath", options, signal);
  bindFrameDrop(context, "#pick-end", "endImagePath", options, signal);

  return () => events.abort();
}
