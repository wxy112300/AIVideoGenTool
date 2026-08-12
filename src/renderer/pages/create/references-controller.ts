import type {
  Draft,
  H3ReferenceMediaType,
  H3ReferenceRole,
  H3ReferenceSlot
} from "../../../types";
import type { RendererCleanup, RendererContext } from "../../contracts";
import {
  h3PromptModeForDraft,
  h3ReferenceTag,
  insertPromptSnippet,
  newH3ReferenceSlot,
  updatePromptWordCounter
} from "./helpers";
import { h3ReferenceSlotCounts } from "../../../core/h3-reference";
import { isMiniMaxH3Model } from "../../../core/workflow";
import { uiKeys } from "../../../core/i18n-keys";
import { h3PromptPackFor } from "../../prompt-packs";

export interface H3ReferencesControllerOptions {
  getDraft(): Draft | undefined;
  patchDraft(patch: Partial<Draft>): void;
  requestRender(): void;
  notify(message: string): void;
}

export function mountH3ReferencesController(
  context: RendererContext,
  options: H3ReferencesControllerOptions
): RendererCleanup {
  const events = new AbortController();
  const signal = events.signal;
  const root = context.root;
  const t = context.t;
  const updateSlot = (slotId: string, patch: Partial<H3ReferenceSlot>) => {
    const draft = options.getDraft();
    if (!draft) return;
    options.patchDraft({
      h3ReferenceSlots: draft.h3ReferenceSlots.map((slot) =>
        slot.id === slotId ? { ...slot, ...patch } : slot
      )
    });
  };
  const addSlot = () => {
    const draft = options.getDraft();
    if (!draft) return;
    const counts = h3ReferenceSlotCounts(draft.h3ReferenceSlots);
    if (counts.total >= 12) return;
    options.patchDraft({
      h3ReferenceSlots: [...draft.h3ReferenceSlots, newH3ReferenceSlot("", counts.imageCount < 9 ? "image" : "video")]
    });
    options.requestRender();
  };

  root.querySelector("#add-h3-reference-slot")?.addEventListener("click", addSlot, { signal });
  root.querySelector("#add-h3-reference-slot-empty")?.addEventListener("click", addSlot, { signal });
  root.querySelectorAll<HTMLElement>("[data-remove-h3-slot]").forEach((button) => {
    button.addEventListener("click", () => {
      const draft = options.getDraft();
      const slotId = button.dataset.removeH3Slot;
      if (!draft || !slotId) return;
      options.patchDraft({ h3ReferenceSlots: draft.h3ReferenceSlots.filter((slot) => slot.id !== slotId) });
      options.requestRender();
    }, { signal });
  });
  root.querySelectorAll<HTMLButtonElement>("[data-clear-h3-slot]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const slotId = button.dataset.clearH3Slot;
      if (!slotId) return;
      updateSlot(slotId, { mediaPath: "" });
      options.requestRender();
    }, { signal });
  });
  root.querySelectorAll<HTMLButtonElement>("[data-insert-h3-slot]").forEach((button) => {
    button.addEventListener("click", () => {
      const draft = options.getDraft();
      const slotId = button.dataset.insertH3Slot;
      const promptInput = root.querySelector<HTMLTextAreaElement>("#prompt-input");
      if (!draft || !promptInput || !slotId) return;
      const slotIndex = draft.h3ReferenceSlots.findIndex((slot) => slot.id === slotId);
      if (slotIndex < 0) return;
      updatePromptWordCounter(
        promptInput.value,
        isMiniMaxH3Model(draft.modelId) ? h3PromptModeForDraft(draft) : undefined,
        draft.duration,
        h3PromptPackFor(context.getState()?.settings.uiLocale).ui
      );
      insertPromptSnippet(promptInput, h3ReferenceTag(draft.h3ReferenceSlots, slotId));
    }, { signal });
  });
  root.querySelectorAll<HTMLSelectElement>("[data-h3-slot-type]").forEach((select) => {
    select.addEventListener("change", () => {
      const draft = options.getDraft();
      const slotId = select.dataset.h3SlotType;
      const nextType = select.value as H3ReferenceMediaType;
      const currentSlot = draft?.h3ReferenceSlots.find((slot) => slot.id === slotId);
      if (!draft || !slotId || !currentSlot || currentSlot.mediaType === nextType) return;
      const counts = h3ReferenceSlotCounts(draft.h3ReferenceSlots);
      if (nextType === "image" && counts.imageCount >= 9) {
        select.value = currentSlot.mediaType;
        options.notify(t(uiKeys.create.interaction.r2vMaxImages));
        return;
      }
      if (nextType === "video" && counts.videoCount >= 3) {
        select.value = currentSlot.mediaType;
        options.notify(t(uiKeys.create.interaction.r2vMaxVideos));
        return;
      }
      if (nextType === "video" && currentSlot.mediaPath) {
        options.notify(t(uiKeys.create.interaction.switchVideoReselect));
      }
      updateSlot(slotId, { mediaType: nextType, mediaPath: "" });
      options.requestRender();
    }, { signal });
  });
  root.querySelectorAll<HTMLButtonElement>("[data-pick-h3-slot]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const slotId = button.dataset.pickH3Slot;
      if (!slotId) return;
      const mediaType = button.dataset.h3SlotMediaType === "video" ? "video" : "image";
      const filename = mediaType === "video"
        ? await context.studio.pickVideo()
        : await context.studio.pickImage();
      if (!filename) return;
      updateSlot(slotId, { mediaType, mediaPath: filename });
      options.requestRender();
    }, { signal });
  });
  root.querySelectorAll<HTMLSelectElement>("[data-h3-slot-role]").forEach((select) => {
    select.addEventListener("change", () => {
      const slotId = select.dataset.h3SlotRole;
      if (slotId) updateSlot(slotId, { role: select.value as H3ReferenceRole });
    }, { signal });
  });
  root.querySelectorAll<HTMLInputElement>("[data-h3-slot-note]").forEach((input) => {
    input.addEventListener("input", () => {
      const slotId = input.dataset.h3SlotNote;
      if (slotId) updateSlot(slotId, { note: input.value });
    }, { signal });
  });
  root.querySelectorAll<HTMLElement>("[data-drop-h3-slot]").forEach((zone) => {
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
      event.stopPropagation();
      clearDragState();
      const file = event.dataTransfer?.files.item(0);
      const slotId = zone.dataset.dropH3Slot;
      const slot = options.getDraft()?.h3ReferenceSlots.find((item) => item.id === slotId);
      if (!file || !slotId || !slot) return;
      const isVideo = slot.mediaType === "video";
      const isSupported = isVideo
        ? file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|mkv|gif)$/i.test(file.name)
        : file.type.startsWith("image/") || /\.(png|jpe?g|webp|bmp)$/i.test(file.name);
        if (!isSupported) {
          options.notify(t(isVideo ? uiKeys.create.interaction.videoSlotFormats : uiKeys.create.interaction.imageSlotFormats));
        return;
      }
      const filename = context.studio.getDroppedFilePath(file);
      if (!filename) {
          options.notify(t(uiKeys.create.interaction.mediaPathFailed, { type: isVideo ? t(uiKeys.create.fragments.video) : t(uiKeys.create.fragments.image) }));
        return;
      }
      updateSlot(slotId, { mediaPath: filename });
      options.requestRender();
    }, { signal });
  });

  return () => events.abort();
}
