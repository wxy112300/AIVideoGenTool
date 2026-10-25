import type { Draft, H3ReferenceSlot, ImageEditDraft } from "../../../types";
import type { RendererCleanup, RendererContext } from "../../contracts";
import { h3ReferenceSlotCounts } from "../../../core/h3-reference";
import { isMiniMaxH3R2vModel } from "../../../core/workflow";
import { uiKeys } from "../../../core/i18n-keys";
import {
  h3ReferenceTag,
  imageFileIsSupported,
  newH3ReferenceSlot
} from "./helpers";

export interface CreateClipboardControllerOptions {
  addImagePicture(path: string, replacePictureId?: string): void;
  updateH3ReferenceSlot(slotId: string, patch: Partial<H3ReferenceSlot>): void;
  patchDraft(patch: Partial<Draft>): void;
}

export function mountCreateClipboardController(
  context: RendererContext,
  options: CreateClipboardControllerOptions
): RendererCleanup {
  const handler = async (event: ClipboardEvent) => {
    const t = context.t;
    if (context.getRoute().page !== "create") return;
    const state = context.getState();
    if (!state) return;
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement ||
      activeElement instanceof HTMLSelectElement ||
      (activeElement instanceof HTMLElement && activeElement.isContentEditable)
    ) return;
    const item = [...(event.clipboardData?.items ?? [])].find(
      (candidate) => candidate.kind === "file" && candidate.type.startsWith("image/")
    );
    const file = item?.getAsFile();
    if (!file) return;
    if (context.getRoute().creationMode === "image-edit") {
      event.preventDefault();
      if (!imageFileIsSupported(file)) {
        context.notify(t(uiKeys.create.interaction.clipboardFormats));
        return;
      }
      const focusedPicture = activeElement instanceof HTMLElement
        ? activeElement.closest<HTMLElement>("[data-image-picture-pick]")
        : null;
      try {
        const filename = await context.hostCapabilities.saveClipboardImage(
          await file.arrayBuffer(),
          file.type || "image/png"
        );
        options.addImagePicture(filename, focusedPicture?.dataset.imagePicturePick);
        context.notify(t(focusedPicture ? uiKeys.create.interaction.replacedPicture : uiKeys.create.interaction.addedPicture));
      } catch (error) {
        context.notify(error instanceof Error ? error.message : t(uiKeys.create.interaction.clipboardReadFailed), { kind: "error" });
      }
      return;
    }
    const referenceAddTarget = activeElement instanceof HTMLElement && activeElement.closest("[data-add-h3-slot]");
    if (state.draft.inputMode !== "image" && !(isMiniMaxH3R2vModel(state.draft.modelId) && referenceAddTarget)) return;
    const supportedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/bmp"]);
    if (!supportedTypes.has(file.type.toLowerCase())) {
      context.notify(t(uiKeys.create.interaction.clipboardFormats));
      return;
    }
    event.preventDefault();
    const focusedPasteTarget = activeElement instanceof HTMLElement
      ? activeElement.closest<HTMLElement>("[data-paste-frame]")
      : null;
    if (isMiniMaxH3R2vModel(state.draft.modelId)) {
      if (activeElement instanceof HTMLElement && activeElement.closest("[data-add-h3-slot]")) {
        const counts = h3ReferenceSlotCounts(state.draft.h3ReferenceSlots);
        if (counts.total >= 12 || counts.imageCount >= 9) { context.notify(t(uiKeys.create.interaction.r2vImageFull)); return; }
        try {
          const filename = await context.hostCapabilities.saveClipboardImage(await file.arrayBuffer(), file.type);
          const draft = context.getState()?.draft;
          if (!draft || draft.modelId !== state.draft.modelId || draft.inputMode !== state.draft.inputMode || draft.sourceVideoPath !== state.draft.sourceVideoPath) return;
          const latest = h3ReferenceSlotCounts(draft.h3ReferenceSlots);
          if (latest.total >= 12 || latest.imageCount >= 9) { context.notify(t(uiKeys.create.interaction.r2vImageFull)); return; }
          options.patchDraft({ h3ReferenceSlots: [...draft.h3ReferenceSlots, newH3ReferenceSlot(filename)] });
          context.requestRender();
        } catch (error) { context.notify(error instanceof Error ? error.message : t(uiKeys.create.interaction.clipboardReadFailed), { kind: "error" }); }
        return;
      }
      const targetSlot = state.draft.h3ReferenceSlots.find(
        (slot) => slot.mediaType === "image" && !slot.mediaPath
      );
      if (!targetSlot) {
        const { imageCount } = h3ReferenceSlotCounts(state.draft.h3ReferenceSlots);
        context.notify(
          imageCount >= 9
            ? t(uiKeys.create.interaction.r2vImageFull)
            : t(uiKeys.create.interaction.r2vEmptySlot)
        );
        return;
      }
      try {
        const filename = await context.hostCapabilities.saveClipboardImage(
          await file.arrayBuffer(),
          file.type
        );
        options.updateH3ReferenceSlot(targetSlot.id, { mediaPath: filename });
        context.requestRender();
        context.notify(t(uiKeys.create.interaction.pastedR2vSlot, { tag: h3ReferenceTag(state.draft.h3ReferenceSlots, targetSlot.id) }));
      } catch (error) {
        context.notify(error instanceof Error ? error.message : t(uiKeys.create.interaction.clipboardReadFailed), { kind: "error" });
      }
      return;
    }
    const field = focusedPasteTarget?.dataset.pasteFrame === "end"
      ? "endImagePath"
      : "startImagePath";
    try {
      const filename = await context.hostCapabilities.saveClipboardImage(
        await file.arrayBuffer(),
        file.type
      );
      options.patchDraft({
        [field]: filename,
        ...(field === "startImagePath"
          ? { sourceWidth: 0, sourceHeight: 0 }
          : { endImageWidth: 0, endImageHeight: 0 })
      });
      context.requestRender();
      context.notify(t(field === "startImagePath" ? uiKeys.create.interaction.pastedStartFrame : uiKeys.create.interaction.pastedEndFrame));
    } catch (error) {
      context.notify(error instanceof Error ? error.message : t(uiKeys.create.interaction.clipboardReadFailed), { kind: "error" });
    }
  };
  window.addEventListener("paste", handler);
  return () => window.removeEventListener("paste", handler);
}
