import type { Draft, H3ReferenceSlot, ImageEditDraft } from "../../../types";
import type { RendererCleanup, RendererContext } from "../../contracts";
import { h3ReferenceSlotCounts } from "../../../core/h3-reference";
import { isMiniMaxH3R2vModel } from "../../../core/workflow";
import {
  h3ReferenceTag,
  imageFileIsSupported
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
        context.notify("剪贴板图片仅支持 PNG、JPG、WEBP 或 BMP");
        return;
      }
      const focusedPicture = activeElement instanceof HTMLElement
        ? activeElement.closest<HTMLElement>("[data-image-picture-pick]")
        : null;
      try {
        const filename = await context.studio.saveClipboardImage(
          await file.arrayBuffer(),
          file.type || "image/png"
        );
        options.addImagePicture(filename, focusedPicture?.dataset.imagePicturePick);
        context.notify(focusedPicture ? "已替换选中的 Picture。" : "已添加到下一个 Picture。");
      } catch (error) {
        context.notify(error instanceof Error ? error.message : "无法读取剪贴板图片");
      }
      return;
    }
    if (state.draft.inputMode !== "image") return;
    const supportedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/bmp"]);
    if (!supportedTypes.has(file.type.toLowerCase())) {
      context.notify("剪贴板图片仅支持 PNG、JPG、WEBP 或 BMP");
      return;
    }
    event.preventDefault();
    const focusedPasteTarget = activeElement instanceof HTMLElement
      ? activeElement.closest<HTMLElement>("[data-paste-frame]")
      : null;
    if (isMiniMaxH3R2vModel(state.draft.modelId)) {
      const targetSlot = state.draft.h3ReferenceSlots.find(
        (slot) => slot.mediaType === "image" && !slot.mediaPath
      );
      if (!targetSlot) {
        const { imageCount } = h3ReferenceSlotCounts(state.draft.h3ReferenceSlots);
        context.notify(
          imageCount >= 9
            ? "R2V 的图片 Slot 已满，请添加图片 Slot 后再粘贴。"
            : "R2V 当前没有空 Slot，请先添加一个 Slot。"
        );
        return;
      }
      try {
        const filename = await context.studio.saveClipboardImage(
          await file.arrayBuffer(),
          file.type
        );
        options.updateH3ReferenceSlot(targetSlot.id, { mediaPath: filename });
        context.requestRender();
        context.notify(`已粘贴到下一个空的 R2V Slot（${h3ReferenceTag(state.draft.h3ReferenceSlots, targetSlot.id)}）。`);
      } catch (error) {
        context.notify(error instanceof Error ? error.message : "无法读取剪贴板图片");
      }
      return;
    }
    const field = focusedPasteTarget?.dataset.pasteFrame === "end"
      ? "endImagePath"
      : "startImagePath";
    try {
      const filename = await context.studio.saveClipboardImage(
        await file.arrayBuffer(),
        file.type
      );
      options.patchDraft({
        [field]: filename,
        ...(field === "startImagePath" ? { sourceWidth: 0, sourceHeight: 0 } : {})
      });
      context.requestRender();
      context.notify(field === "startImagePath" ? "已粘贴为首帧图片。" : "已粘贴为尾帧图片。");
    } catch (error) {
      context.notify(error instanceof Error ? error.message : "无法读取剪贴板图片");
    }
  };
  window.addEventListener("paste", handler);
  return () => window.removeEventListener("paste", handler);
}
