import { imageMarkupPromptContext, imageReferenceInputPath } from "../../../core/image-workflow";
import { imageModelCapabilityFor, normalizeImageTargetResolution } from "../../../core/image-workflow";
import { createDefaultImageEditDraft } from "../../../core/draft-defaults";
import type { AppState, ImageEditDraft, ImagePromptPreset, ImageReferenceRole } from "../../../types";
import type { RendererCleanup, RendererContext } from "../../contracts";
import { activeImagePrompt } from "./helpers";
import { uiKeys } from "../../../core/i18n-keys";

export interface ImageEditControllerOptions {
  setState(nextState: AppState): void;
  patchImageDraft(patch: Partial<ImageEditDraft>): void;
  addImageSlot(): void;
  addImagePicture(path: string, replacePictureId?: string): void;
  editImagePictureMarkup(pictureId: string): Promise<void>;
  imageFileIsSupported(file: File): boolean;
  resizePromptInput(input: HTMLTextAreaElement): void;
  updateImagePromptWordCounter(text: string): void;
  syncEnqueueUi(): void;
  getPromptEnhanceMode(): ImagePromptPreset;
  setPromptEnhanceMode(mode: ImagePromptPreset): void;
  isPromptEnhancing(): boolean;
  setPromptEnhancing(value: boolean): void;
  setPromptRuntimeLoaded(value: boolean): void;
  clearPromptVersion(): void;
  undoPromptEdit(): boolean;
  redoPromptEdit(): boolean;
  invalidatePromptEditHistory(): void;
  togglePromptModel(): Promise<void>;
  randomSeedValue(): number;
  isEnqueueBusy(): boolean;
  setEnqueueBusy(value: boolean): void;
  setEnqueueBusyUi(busy: boolean): void;
  imageReferenceRoleLabel(role: ImageReferenceRole): string;
  imageReferenceRolePromptLabel(role: ImageReferenceRole): string;
}

export function mountImageEditController(
  context: RendererContext,
  options: ImageEditControllerOptions
): RendererCleanup {
  const events = new AbortController();
  const signal = events.signal;
  const root = context.root;
  const getDraft = () => context.getState()?.imageDraft;
  const t = context.t;

  const choosePicture = async (pictureId?: string) => {
    const filename = await context.studio.pickImage();
    if (filename) options.addImagePicture(filename, pictureId);
  };
  root.querySelector("#add-image-slot")?.addEventListener("click", (event) => {
    event.stopImmediatePropagation();
    options.addImageSlot();
  }, { signal });
  const bindImageDropZone = (zone: HTMLElement, replacePictureId?: string) => {
    const clearDragState = () => zone.classList.remove("drag-over");
    zone.addEventListener("click", (event) => {
      event.stopImmediatePropagation();
      void choosePicture(replacePictureId);
    }, { signal });
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
      if (!options.imageFileIsSupported(file)) {
        context.notify(t(uiKeys.create.interaction.invalidImageDrop));
        return;
      }
      const filename = context.studio.getDroppedFilePath(file);
      if (!filename) {
        context.notify(t(uiKeys.create.interaction.imagePathFailed));
        return;
      }
      const targetWasOccupied = replacePictureId
        ? Boolean(getDraft()?.pictures.find((picture) => picture.id === replacePictureId)?.absolutePath)
        : false;
      options.addImagePicture(filename, replacePictureId);
      if (replacePictureId) {
        context.notify(t(targetWasOccupied
          ? uiKeys.create.interaction.replacedPicture
          : uiKeys.create.interaction.addedPicture));
      }
    }, { signal });
  };
  root.querySelectorAll<HTMLElement>("[data-image-picture-pick]").forEach((button) => {
    bindImageDropZone(button, button.dataset.imagePicturePick);
  });
  root.querySelectorAll<HTMLElement>("[data-remove-image-picture]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopImmediatePropagation();
      const pictureId = button.dataset.removeImagePicture;
      const draft = getDraft();
      const picture = draft?.pictures.find((item) => item.id === pictureId);
      if (!draft || !pictureId || !picture) return;
      const pictures = picture.pictureNumber === 1
        ? draft.pictures.map((item) =>
            item.id === pictureId
              ? { ...item, absolutePath: "", width: 0, height: 0, role: "base" as const, crop: undefined, markup: undefined, mask: undefined }
              : item
          )
        : draft.pictures.filter((item) => item.id !== pictureId);
      options.patchImageDraft({ pictures });
      context.requestRender();
    }, { signal });
  });
  root.querySelectorAll<HTMLElement>("[data-markup-image-picture]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const pictureId = button.dataset.markupImagePicture;
      if (pictureId) void options.editImagePictureMarkup(pictureId);
    }, { signal });
  });
  root.querySelectorAll<HTMLSelectElement>("[data-image-picture-role]").forEach((select) => {
    select.addEventListener("change", () => {
      const pictureId = select.dataset.imagePictureRole;
      const draft = getDraft();
      if (!pictureId || !draft) return;
      options.patchImageDraft({
        pictures: draft.pictures.map((picture) =>
          picture.id === pictureId
            ? { ...picture, role: select.value as ImageReferenceRole }
            : picture
        )
      });
    }, { signal });
  });

  const dropZone = root.querySelector<HTMLElement>("#image-picture-drop-zone");
  if (dropZone) bindImageDropZone(dropZone);

  const promptInput = root.querySelector<HTMLTextAreaElement>("#image-edit-prompt-input");
  const snippetSelect = root.querySelector<HTMLSelectElement>("#image-edit-instruction");
  const insertSnippet = root.querySelector<HTMLButtonElement>("#insert-image-edit-instruction");
  const syncSnippetButton = () => {
    if (insertSnippet) insertSnippet.disabled = !snippetSelect?.value;
  };
  snippetSelect?.addEventListener("change", syncSnippetButton, { signal });
  insertSnippet?.addEventListener("click", (event) => {
    event.stopImmediatePropagation();
    if (!promptInput || !snippetSelect?.value) return;
    const start = promptInput.selectionStart;
    const prefix = promptInput.value && !/\s$/u.test(promptInput.value) ? "\n" : "";
    const insertion = `${prefix}${snippetSelect.value}`;
    promptInput.setRangeText(insertion, start, promptInput.selectionEnd, "end");
    promptInput.dispatchEvent(new Event("input", { bubbles: true }));
    snippetSelect.value = "";
    syncSnippetButton();
  }, { signal });
  promptInput?.addEventListener("input", () => {
    const draft = getDraft();
    if (!draft) return;
    options.invalidatePromptEditHistory();
    const versions = [...draft.promptVersions];
    const current = versions[draft.activePromptVersion];
    let activePromptVersion = draft.activePromptVersion;
    if (current?.label === t(uiKeys.create.interaction.manualEdit)) {
      versions[activePromptVersion] = { ...current, text: promptInput.value };
    } else {
      versions.splice(activePromptVersion + 1);
      versions.push({
        id: crypto.randomUUID(),
        label: t(uiKeys.create.interaction.manualEdit),
        text: promptInput.value,
        createdAt: new Date().toISOString()
      });
      activePromptVersion = versions.length - 1;
    }
    options.patchImageDraft({ promptVersions: versions, activePromptVersion });
    options.resizePromptInput(promptInput);
    options.updateImagePromptWordCounter(promptInput.value);
    options.syncEnqueueUi();
  }, { signal });
  if (promptInput) {
    options.resizePromptInput(promptInput);
    window.requestAnimationFrame(() => options.resizePromptInput(promptInput));
    options.updateImagePromptWordCounter(promptInput.value);
  }
  const focusPromptInput = () => {
    window.requestAnimationFrame(() => {
      const nextInput = root.querySelector<HTMLTextAreaElement>("#image-edit-prompt-input");
      if (!nextInput) return;
      nextInput.focus();
      nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
    });
  };
  promptInput?.addEventListener("keydown", (event) => {
    const modifier = event.ctrlKey || event.metaKey;
    if (!modifier || event.altKey) return;
    const key = event.key.toLowerCase();
    const undo = key === "z" && !event.shiftKey;
    const redo = key === "y" || (key === "z" && event.shiftKey);
    const handled = undo
      ? options.undoPromptEdit()
      : redo
        ? options.redoPromptEdit()
        : false;
    if (!handled) return;
    event.preventDefault();
    event.stopPropagation();
    context.requestRender();
    focusPromptInput();
  }, { signal });

  root.querySelector("#clear-image-prompt")?.addEventListener("click", (event) => {
    event.stopImmediatePropagation();
    const draft = getDraft();
    if (!draft) return;
    options.clearPromptVersion();
    context.requestRender();
    focusPromptInput();
  }, { signal });

  root.querySelector("#prompt-enhance-mode")?.addEventListener("change", (event) => {
    const select = event.currentTarget as HTMLSelectElement;
    options.setPromptEnhanceMode(
      select.value === "faithful"
        ? "faithful"
        : "detail-enhance"
    );
    const description = select.selectedOptions[0]?.dataset.description ?? "";
    const info = root.querySelector<HTMLElement>("#prompt-enhance-mode-info");
    const tip = root.querySelector<HTMLElement>("#prompt-enhance-mode-tip");
    if (info && description) info.setAttribute("aria-label", description);
    if (tip && description) tip.textContent = description;
  }, { signal });
  root.querySelector("#release-prompt-model-create")?.addEventListener("click", () => {
    void options.togglePromptModel();
  }, { signal });
  root.querySelector("#enhance-prompt")?.addEventListener("click", async (event) => {
    event.stopImmediatePropagation();
    if (options.isPromptEnhancing()) return;
    const draft = getDraft();
    if (!draft) return;
    const requestPrompt = activeImagePrompt(draft, context.getState()?.settings.uiLocale).text.trim();
    if (!requestPrompt) {
      context.notify(t(uiKeys.create.validation.imagePromptEmpty));
      return;
    }
    options.setPromptEnhancing(true);
    context.requestRender();
    try {
      const pictures = draft.pictures.filter((picture) => picture.absolutePath);
      const enhanceMode = options.getPromptEnhanceMode();
      const text = await context.studio.enhancePrompt({
        prompt: requestPrompt,
        modelId: context.getState()?.settings.promptModelId ?? "",
        mode: "image-edit",
        imageEditEnhanceMode: enhanceMode,
        imageEditPresetText: context.getState()?.settings.imagePromptPresets[enhanceMode] ?? "",
        imagePaths: pictures.map(imageReferenceInputPath),
        referenceContext: [
          pictures.map((picture) =>
            `Slot ${picture.pictureNumber} / Picture ${picture.pictureNumber} = ${options.imageReferenceRolePromptLabel(picture.role ?? "auto")}`
          ).join("\n"),
          imageMarkupPromptContext(pictures)
        ].filter(Boolean).join("\n\n")
      });
      options.setPromptRuntimeLoaded(true);
      const nextDraft = getDraft();
      if (!nextDraft) return;
      options.invalidatePromptEditHistory();
      const versions = [
        ...nextDraft.promptVersions.slice(0, nextDraft.activePromptVersion + 1),
        {
          id: crypto.randomUUID(),
          label: t(uiKeys.create.interaction.imageOptimizedVersion, { count: nextDraft.promptVersions.filter((item) => item.label.startsWith(t(uiKeys.create.interaction.imageOptimizedVersion, { count: "" }).trim())).length + 1 }),
          text,
          createdAt: new Date().toISOString()
        }
      ];
      options.patchImageDraft({ promptVersions: versions, activePromptVersion: versions.length - 1 });
    } catch (error) {
      context.notify(error instanceof Error ? error.message : String(error), { kind: "error" });
    } finally {
      options.setPromptEnhancing(false);
      context.requestRender();
    }
  }, { signal });

  root.querySelector("#image-prompt-prev")?.addEventListener("click", (event) => {
    event.stopImmediatePropagation();
    const draft = getDraft();
    if (draft) {
      options.invalidatePromptEditHistory();
      options.patchImageDraft({ activePromptVersion: Math.max(0, draft.activePromptVersion - 1) });
      context.requestRender();
    }
  }, { signal });
  root.querySelector("#image-prompt-next")?.addEventListener("click", (event) => {
    event.stopImmediatePropagation();
    const draft = getDraft();
    if (draft) {
      options.invalidatePromptEditHistory();
      options.patchImageDraft({ activePromptVersion: Math.min(draft.promptVersions.length - 1, draft.activePromptVersion + 1) });
      context.requestRender();
    }
  }, { signal });

  for (const id of ["image-edit-model", "image-edit-quality", "image-edit-resolution", "image-edit-seed"]) {
    root.querySelector(`#${id}`)?.addEventListener("change", (event) => {
      const draft = getDraft();
      if (!draft) return;
      const value = (event.currentTarget as HTMLInputElement | HTMLSelectElement).value;
      const modelCapability = id === "image-edit-model" ? imageModelCapabilityFor(value) : undefined;
      options.patchImageDraft(
        id === "image-edit-model"
          ? {
              modelId: value,
              qualityProfile: modelCapability?.qualityProfiles.some((profile) => profile.id === draft.qualityProfile)
                ? draft.qualityProfile
                : modelCapability?.qualityProfiles[0]?.id ?? "native",
              ...(modelCapability?.maxPictures === 1 ? { pictures: draft.pictures.slice(0, 1) } : {}),
              ...(modelCapability?.sourceResolutionOnly ? { targetResolution: "source" as const } : {}),
              ...(modelCapability?.deterministic ? { outputCount: 1 } : {})
            }
          : id === "image-edit-quality"
            ? { qualityProfile: value }
            : id === "image-edit-resolution"
              ? {
                  targetResolution: normalizeImageTargetResolution(
                    value,
                    draft.pictures[0]?.width ?? 0,
                    draft.pictures[0]?.height ?? 0
                  )
                }
              : { seed: value ? Number(value) : null }
      );
      if (id !== "image-edit-seed") context.requestRender();
    }, { signal });
  }

  const countInput = root.querySelector<HTMLInputElement>("#image-edit-count");
  countInput?.addEventListener("input", () => {
    const outputCount = Math.min(10, Math.max(1, Number(countInput.value) || 1));
    options.patchImageDraft({ outputCount });
    const countValue = root.querySelector("#image-edit-count-value");
    if (countValue) countValue.textContent = t(uiKeys.create.imageEdit.outputCountValue, { count: outputCount });
  }, { signal });
  root.querySelector("#random-image-edit-seed")?.addEventListener("click", (event) => {
    event.stopImmediatePropagation();
    options.patchImageDraft({ seed: options.randomSeedValue() });
    context.requestRender();
  }, { signal });
  root.querySelector("#clear-image-edit-seed")?.addEventListener("click", (event) => {
    event.stopImmediatePropagation();
    options.patchImageDraft({ seed: null });
    context.requestRender();
  }, { signal });
  root.querySelector("#clear-image-edit-draft")?.addEventListener("click", (event) => {
    event.stopImmediatePropagation();
    options.patchImageDraft(createDefaultImageEditDraft());
    context.requestRender();
  }, { signal });
  root.querySelector("#enqueue-image-edit")?.addEventListener("click", async (event) => {
    event.stopImmediatePropagation();
    if (options.isEnqueueBusy()) return;
    const draft = getDraft();
    if (!draft) return;
    options.setEnqueueBusy(true);
    options.setEnqueueBusyUi(true);
    try {
      context.reportUserAction("image-queue-enqueue", {
        modelId: draft.modelId,
        outputCount: draft.outputCount,
        pictureCount: draft.pictures.length
      });
      const nextState = await context.studio.enqueueImageEdit(draft);
      const outputFilename = nextState.queue.at(-1)?.outputFilename ?? "";
      context.notify(t(uiKeys.create.interaction.imageQueueAdded, { filename: outputFilename }));
      options.setState(nextState);
    } catch (error) {
      context.notify(error instanceof Error ? error.message : String(error), { kind: "error" });
    } finally {
      options.setEnqueueBusy(false);
      options.setEnqueueBusyUi(false);
      context.requestRender();
    }
  }, { signal });

  return () => events.abort();
}
