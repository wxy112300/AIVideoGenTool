import type { Draft, H3TimedGuide } from "../../../types";
import { activeH3TimedGuides, orderedH3GuideSlots, restoreH3GuideEditor, supportsH3ReferenceGuides } from "../../../core/h3-timed-guides";
import type { RendererCleanup, RendererContext } from "../../contracts";
import { uiKeys } from "../../../core/i18n-keys";

export interface ImageToVideoControllerOptions {
  patchDraft(patch: Partial<Draft>): void;
}

const pendingGuideTimes = new WeakMap<HTMLElement, Map<number, { original: H3TimedGuide["seconds"]; text: string }>>();

function bindH3GuideEditor(context: RendererContext, options: ImageToVideoControllerOptions, signal: AbortSignal) {
  const root = context.root;
  const pending = pendingGuideTimes.get(root) ?? new Map<number, { original: H3TimedGuide["seconds"]; text: string }>();
  pendingGuideTimes.set(root, pending);
  const editor = () => {
    const draft = context.getState()?.draft;
    return draft && activeH3TimedGuides(draft);
  };
  const save = (next: Draft["h3GuideEditor"]) => {
    if (next && orderedH3GuideSlots(next.slots).some((slot, index) => slot.picture !== index + 1)) pending.clear();
    options.patchDraft({ h3GuideEditor: next });
    context.requestRender();
  };
  root.querySelector<HTMLInputElement>("#toggle-h3-guides")?.addEventListener("change", event => {
    const draft = context.getState()?.draft;
    if (!draft) return;
    const enabled = (event.currentTarget as HTMLInputElement).checked;
    if (supportsH3ReferenceGuides(draft)) {
      options.patchDraft({ h3ReferenceGuidesEnabled: enabled });
      context.requestRender();
      return;
    }
    pending.clear();
    if (draft.h3GuideEditor) {
      save({ ...draft.h3GuideEditor, active: enabled });
      return;
    }
    const slots: H3TimedGuide[] = [{ picture: 1, mediaPath: draft.startImagePath, seconds: 0 }];
    if (draft.endImagePath) slots.push({ picture: 2, mediaPath: draft.endImagePath, seconds: "end" });
    save(restoreH3GuideEditor(slots));
  }, { signal });
  const add = (mediaPath = "") => {
    const current = editor();
    if (!current) return;
    save({ ...current, nextPicture: current.nextPicture + 1, slots: [
      ...current.slots,
      { picture: current.nextPicture, mediaPath, seconds: current.slots.length ? null : 0 }
    ] });
  };
  const bindDrop = (element: HTMLElement, onImage: (filename: string) => void) => {
    element.addEventListener("dragover", event => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    }, { signal });
    element.addEventListener("drop", event => {
      event.preventDefault();
      event.stopPropagation();
      const file = event.dataTransfer?.files.item(0);
      if (!file) return;
      const t = context.t;
      if (!file.type.startsWith("image/") && !/\.(png|jpe?g|webp|bmp)$/i.test(file.name)) {
        context.notify(t(uiKeys.create.interaction.invalidImageDrop));
        return;
      }
      const filename = context.hostCapabilities.getDroppedFilePath(file);
      if (filename) onImage(filename);
      else context.notify(t(uiKeys.create.interaction.imagePathFailed));
    }, { signal });
  };
  const addButton = root.querySelector<HTMLElement>("#add-h3-guide");
  if (addButton) {
    addButton.addEventListener("click", () => add(), { signal });
    bindDrop(addButton, add);
  }
  const current = editor();
  if (!current) return;
  for (const slot of current.slots) {
    const card = root.querySelector<HTMLElement>(`[data-guide-slot="${slot.picture}"]`);
    if (!card) continue;
    const update = (patch: Partial<H3TimedGuide>) => {
      const latest = editor();
      if (!latest?.slots.some(item => item.picture === slot.picture)) return;
      save({ ...latest, slots: latest.slots.map(item => item.picture === slot.picture ? { ...item, ...patch } : item) });
    };
    const input = card.querySelector<HTMLInputElement>("[data-guide-time]")!;
    const buffered = pending.get(slot.picture);
    if (buffered && buffered.original === slot.seconds) input.value = buffered.text;
    input.addEventListener("input", () => pending.set(slot.picture, { original: slot.seconds, text: input.value }), { signal });
    const readTimePatch = () => {
      pending.delete(slot.picture);
      const seconds = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : null;
      const previous = editor()?.slots.find(item => item.picture === slot.picture)?.seconds;
      return seconds !== previous && (previous !== "end" || seconds !== null) ? { seconds } : undefined;
    };
    let picking = false;
    const commitTime = () => {
      if (picking) return;
      const patch = readTimePatch();
      if (patch) update(patch);
    };
    input.addEventListener("change", () => {
      commitTime();
    }, { signal });
    input.addEventListener("blur", () => {
      if (pending.has(slot.picture)) commitTime();
    }, { signal });
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") input.blur();
    }, { signal });
    const button = card.querySelector<HTMLButtonElement>("[data-guide-pick]")!;
    const replace = card.querySelector("[data-guide-replace]");
    const clear = card.querySelector("[data-guide-clear]");
    const remove = card.querySelector("[data-guide-remove]");
    for (const action of [button, replace, clear, remove]) {
      action?.addEventListener("pointerdown", event => {
        // Keep the clicked control mounted until its action can apply the pending time.
        if (input.matches(":focus") && pending.has(slot.picture)) event.preventDefault();
      }, { signal });
    }
    const pickImage = async () => {
      const time = readTimePatch();
      picking = true;
      try {
        const filename = await context.hostCapabilities.pickImage();
        if (!signal.aborted && (filename || time)) update({ ...time, ...(filename ? { mediaPath: filename } : {}) });
      } finally {
        picking = false;
      }
    };
    button.addEventListener("click", pickImage, { signal });
    replace?.addEventListener("click", pickImage, { signal });
    clear?.addEventListener("click", () => update({ ...readTimePatch(), mediaPath: "" }), { signal });
    bindDrop(button, mediaPath => update({ mediaPath }));
    remove?.addEventListener("click", () => {
      pending.delete(slot.picture);
      const latest = editor();
      if (latest) save({ ...latest, slots: latest.slots.filter(item => item.picture !== slot.picture) });
    }, { signal });
    const preview = card.querySelector("img");
    if (preview && slot.mediaPath) {
      const resolution = card.querySelector<HTMLElement>("[data-guide-resolution]");
      preview.addEventListener("load", () => {
        const { naturalWidth, naturalHeight } = preview;
        if (!naturalWidth || !naturalHeight) return;
        const ratio = naturalWidth / naturalHeight;
        card.style.setProperty("--media-ratio", String(ratio));
        card.style.setProperty("--media-r", String(ratio));
        if (resolution) {
          resolution.textContent = `${naturalWidth} × ${naturalHeight}`;
          resolution.hidden = false;
        }
      }, { signal });
      void context.assets.readImage(slot.mediaPath).then(url => {
        if (url && preview.isConnected && !signal.aborted) preview.src = url;
      }).catch(() => undefined);
    }
  }
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
    if (zone instanceof HTMLButtonElement && zone.disabled) return;
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
    if (zone instanceof HTMLButtonElement && zone.disabled) return;
    const file = event.dataTransfer?.files.item(0);
    if (!file) return;
    if (!file.type.startsWith("image/") && !/\.(png|jpe?g|webp|bmp)$/i.test(file.name)) {
      context.notify(t(uiKeys.create.interaction.invalidImageDrop));
      return;
    }
    const filename = context.hostCapabilities.getDroppedFilePath(file);
    if (!filename) {
      context.notify(t(uiKeys.create.interaction.imagePathFailed));
      return;
    }
    options.patchDraft({
      [field]: filename,
      ...(field === "startImagePath"
        ? { sourceWidth: 0, sourceHeight: 0 }
        : { endImageWidth: 0, endImageHeight: 0 })
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
    const filename = await context.hostCapabilities.pickImage();
    if (!filename) return;
    options.patchDraft({
      [field]: filename,
      ...(field === "startImagePath"
        ? { sourceWidth: 0, sourceHeight: 0 }
        : { endImageWidth: 0, endImageHeight: 0 })
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

  bindH3GuideEditor(context, options, signal);
  bindFramePicker(context, root, "#pick-start", "startImagePath", options, signal);
  bindFramePicker(context, root, "#pick-end", "endImagePath", options, signal);
  bindFramePicker(context, root, '[data-replace-frame="start"]', "startImagePath", options, signal);
  bindFramePicker(context, root, '[data-replace-frame="end"]', "endImagePath", options, signal);

  root.querySelector("#toggle-end")?.addEventListener("click", async (event) => {
    event.stopImmediatePropagation();
    const draft = context.getState()?.draft;
    if (!draft) return;
    if (draft.endImagePath) {
      options.patchDraft({ endImagePath: "", endImageWidth: 0, endImageHeight: 0 });
      context.requestRender();
      return;
    }
    const filename = await context.hostCapabilities.pickImage();
    if (!filename) return;
    options.patchDraft({ endImagePath: filename, endImageWidth: 0, endImageHeight: 0 });
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
        ...(field === "startImagePath"
          ? { sourceWidth: 0, sourceHeight: 0 }
          : { endImageWidth: 0, endImageHeight: 0 })
      });
      context.requestRender();
    }, { signal });
  });

  bindFrameDrop(context, "#pick-start", "startImagePath", options, signal);
  bindFrameDrop(context, "#pick-end, #toggle-end", "endImagePath", options, signal);

  return () => events.abort();
}
