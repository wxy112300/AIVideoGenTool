import type {
  AppState,
  BundledWorkflow,
  Draft,
  EnvironmentScanResult,
  H3PromptMode,
  H3PromptPreset,
  H3ReferenceSlot,
  ImageEditDraft,
  ImagePromptPreset,
  ImageReference,
  PerformanceMetrics,
  PromptEnhanceMode,
  Settings,
  NativeAvContinuationArtifact,
  VideoLoraSelection,
  WorkflowCapabilities
} from "../../../types";
import type {
  CreationMode,
  Page,
  RendererCleanup,
  RendererContext
} from "../../contracts";
import { activateCreationDraft, creationDraftForMode, patchCreationDraftForMode, preserveLocalCreationDrafts } from "../../../core/creation-drafts";
import { clearPromptVersion, activePromptIndexForDraft, promptPatchForDraft, promptVersionsForDraft } from "../../../core/draft-prompts";
import { createClearedDraft, createDefaultImageEditDraft } from "../../../core/draft-defaults";
import { checkH3Prompt } from "../../../core/h3-prompt-check";
import { ensureMotionContextSourceSlot } from "../../../core/h3-reference";
import {
  imageModelCapabilityFor,
  imageOutputCountMax,
  imageReferenceInputPath,
  normalizeImageTargetResolution
} from "../../../core/image-workflow";
import { nextImagePictureNumber, normalizeImageEditDraft } from "../../../core/image-project";
import { normalizeVideoDraft } from "../../../core/video-draft-normalization";
import { PromptEditHistory, type PromptHistoryScope, type PromptHistorySnapshot } from "../../../core/prompt-edit-history";
import {
  isMiniMaxH3R2vModel,
  motionContextMaxDurationSeconds
} from "../../../core/workflow";
import { modelCatalog } from "../../../core/catalog";
import { shouldEnableSpectrumByDefault } from "../../../core/video-policy";
import { nearestSupportedVideoResolution } from "../../../core/video-resolution";
import { bundledWorkflowModelId } from "../../../core/video-loras";
import { h3PromptPackFor, qwenImagePromptPackFor } from "../../prompt-packs";
import { escapeHtml } from "../../shared/dom";
import { icon, renderIcons } from "../../shared/icons";
import { videoLoraInfoButton } from "../../shared/markup";
import { videoLoraPurposeLabel } from "../../shared/labels";
import { formatTrimTime } from "../../shared/formatters";
import { loadImagePreview, imageFileIsSupported, imageReferenceRolePromptLabels, h3ReferenceRolePromptLabels, resizePromptInput, updateImagePromptWordCounter } from "./helpers";
import { mountCreateAssembly } from "./assembly";
import { mountH3ReferencesController } from "./references-controller";
import { renderCreatePage, renderImageEditPage, type CreatePageOptions } from "./page";
import { buildImageEditPageViewModel, buildVideoCreatePageViewModel, imageEditEnqueueBlockReason, type CreateViewModelDependencies } from "./view-model";

export interface CreateWorkspaceCoordinatorDependencies {
  context: RendererContext;
  getState(): AppState;
  getPage(): Page;
  getCreationMode(): CreationMode;
  setCreationMode(mode: CreationMode): void;
  getEnvironmentScan(): EnvironmentScanResult | null;
  getPerformanceMetrics(): PerformanceMetrics | null;
  bundledWorkflows: Record<string, BundledWorkflow>;
  workflowCapabilities: Record<string, WorkflowCapabilities>;
  bundledWorkflowKey(modelId: string, inputMode: Draft["inputMode"]): string;
  setRendererState(nextState: AppState): void;
  addPageCleanup(cleanup: RendererCleanup): void;
  render(): void;
  getEnqueueBusy(): boolean;
  setEnqueueBusy(value: boolean): void;
  requestClearDraftConfirmation(mode: CreationMode): void;
  promptRuntimeControlIcon(): string;
  promptRuntimeControlTitle(settings?: Settings): string;
  promptRuntimeView(origin: CreationMode): CreateViewModelDependencies["promptRuntimeView"];
  promptOperationBelongsTo(origin: CreationMode): boolean;
  getPromptStarting(): boolean;
  getPromptReleasing(): boolean;
  getPromptRuntimeLoaded(): boolean;
  getPromptProgress(): CreateViewModelDependencies["promptProgress"];
  setPromptEnhancing(value: boolean): void;
  setPromptRuntimeLoaded(value: boolean): void;
  togglePromptModel(): Promise<void>;
}

export interface CreateWorkspaceCoordinator {
  renderPage(): string;
  bind(): void;
  patchDraft(patch: Partial<Draft>): void;
  patchDraftForMode(
    mode: Exclude<CreationMode, "image-edit">,
    update: (draft: Draft) => Partial<Draft>
  ): void;
  patchImageDraft(patch: Partial<ImageEditDraft>): void;
  clearDraft(mode: CreationMode): void;
  saveDraftImmediately(draft: Draft): Promise<void>;
  selectDraftVideo(
    filename: string,
    source?: {
      assetId: string;
      versionId: string;
      duration: number;
      width: number;
      height: number;
      modelId?: string;
      h3ContextLatentPath?: string;
      h3ContinuumArtifactPath?: string;
      h3ContinuumArtifact?: NativeAvContinuationArtifact;
      resolution?: number;
      resetSeed?: boolean;
    },
    renderAfterSave?: boolean
  ): Promise<void>;
  enableSpectrumByDefaultIfAvailable(mode?: Exclude<CreationMode, "image-edit">): void;
  getDraftDirty(): boolean;
  getDraftSaveInFlight(): number;
  getImageDraftDirty(): boolean;
  getImageDraftSaveInFlight(): number;
}

interface CreationModeUiState {
  promptEnhanceMode: PromptEnhanceMode;
  h3PromptPreset: H3PromptPreset;
}

export function createCreateWorkspaceCoordinator(
  deps: CreateWorkspaceCoordinatorDependencies
): CreateWorkspaceCoordinator {
  const creationModeUiState: Record<CreationMode, CreationModeUiState> = {
    "image-to-video": {
      promptEnhanceMode: "sulphur-native",
      h3PromptPreset: "official-storyboard"
    },
    "video-extension": {
      promptEnhanceMode: "sulphur-native",
      h3PromptPreset: "official-storyboard"
    },
    "image-edit": {
      promptEnhanceMode: "sulphur-native",
      h3PromptPreset: "official-storyboard"
    }
  };
  const promptEditHistory = new PromptEditHistory();
  let draftSaveTimer: number | undefined;
  let draftRevision = 0;
  let draftSaveInFlight = 0;
  let draftDirty = false;
  let imageDraftSaveTimer: number | undefined;
  let imageDraftRevision = 0;
  let imageDraftSaveInFlight = 0;
  let imageDraftDirty = false;
  let enqueueBusy = deps.getEnqueueBusy();

  const getState = () => deps.getState();
  const uiText = (key: string, params?: import("../../../core/i18n").TranslationParams, fallback?: string): string =>
    deps.context.t(key, params, fallback);
  const activeCreationModeUiState = (): CreationModeUiState => creationModeUiState[deps.getCreationMode()];

  const createPageOptions: CreatePageOptions = {
    t: (key, params, fallback) => deps.context.t(key, params, fallback),
    icon,
    escapeHtml,
    get h3ReferenceRoleLabels() {
      return h3PromptPackFor(getState().settings.uiLocale).referenceRoleLabels;
    },
    get imageReferenceRoleLabels() {
      return qwenImagePromptPackFor(getState().settings.uiLocale).referenceRoleLabels;
    },
    videoLoraInfoButton: (lora) => videoLoraInfoButton(lora, uiText, getState().settings.uiLocale),
    videoLoraPurposeLabel: (purpose) => videoLoraPurposeLabel(purpose, uiText)
  };

  function videoPromptSnapshot(): PromptHistorySnapshot {
    const state = getState();
    return {
      promptVersions: promptVersionsForDraft(state.draft).map((version) => ({ ...version })),
      activePromptVersion: activePromptIndexForDraft(state.draft)
    };
  }

  function imagePromptSnapshot(): PromptHistorySnapshot {
    const state = getState();
    return {
      promptVersions: state.imageDraft.promptVersions.map((version) => ({ ...version })),
      activePromptVersion: state.imageDraft.activePromptVersion
    };
  }

  function clearPromptVersionForScope(scope: PromptHistoryScope): void {
    const before = scope === "video" ? videoPromptSnapshot() : imagePromptSnapshot();
    if (before.promptVersions.length === 1 && !before.promptVersions[0]?.text) return;
    const cleared = clearPromptVersion(before.promptVersions, before.activePromptVersion);
    const after = {
      promptVersions: cleared.promptVersions,
      activePromptVersion: cleared.activePromptVersion
    };
    promptEditHistory.record(scope, before, after);
    if (scope === "video") {
      patchDraft(promptPatchForDraft(getState().draft, after.promptVersions, after.activePromptVersion));
    } else {
      patchImageDraft(after);
    }
  }

  function applyPromptHistorySnapshot(scope: PromptHistoryScope, snapshot: PromptHistorySnapshot): void {
    if (scope === "video") {
      patchDraft(promptPatchForDraft(
        getState().draft,
        snapshot.promptVersions.map((version) => ({ ...version })),
        snapshot.activePromptVersion
      ));
    } else {
      patchImageDraft({
        promptVersions: snapshot.promptVersions.map((version) => ({ ...version })),
        activePromptVersion: snapshot.activePromptVersion
      });
    }
  }

  function undoPromptEdit(scope: PromptHistoryScope): boolean {
    const snapshot = promptEditHistory.undo(scope);
    if (!snapshot) return false;
    applyPromptHistorySnapshot(scope, snapshot);
    return true;
  }

  function redoPromptEdit(scope: PromptHistoryScope): boolean {
    const snapshot = promptEditHistory.redo(scope);
    if (!snapshot) return false;
    applyPromptHistorySnapshot(scope, snapshot);
    return true;
  }

  function invalidatePromptEditHistory(scope: PromptHistoryScope): void {
    promptEditHistory.invalidate(scope);
  }

  function updateH3PromptCheck(
    promptText: string,
    hasEndImage: boolean,
    mode?: H3PromptMode,
    hasVideoReference = false,
    videoLoras: readonly VideoLoraSelection[] = []
  ): void {
    const element = document.querySelector<HTMLElement>("#h3-prompt-check");
    if (!element) return;
    const state = getState();
    const result = checkH3Prompt(promptText, {
      hasEndImage,
      mode,
      hasImageReference: state.draft.h3ReferenceSlots.some((slot) => slot.mediaType === "image"),
      hasVideoReference,
      durationSeconds: state.draft.duration,
      videoLoras
    });
    element.className = `h3-prompt-check ${result.valid ? "valid" : "warning"}`;
    element.innerHTML = `<div class="h3-prompt-check-heading"><strong>${uiText("runtime.h3PromptCheck")}</strong><span>${escapeHtml(result.summary)}</span></div>
      ${result.items.length ? `<ul>${result.items.map((item) => `<li>${escapeHtml(item.message)}</li>`).join("")}</ul>` : ""}`;
  }

  function createViewModelDependencies(): CreateViewModelDependencies {
    const origin = deps.getCreationMode();
    const modeUiState = activeCreationModeUiState();
    const promptRuntimeView = deps.promptRuntimeView(origin);
    const ownsActivePrompt = deps.promptOperationBelongsTo(origin);
    return {
      t: uiText,
      state: getState(),
      environmentScan: deps.getEnvironmentScan(),
      performanceMetrics: deps.getPerformanceMetrics(),
      workflowCapabilities: deps.workflowCapabilities,
      bundledWorkflows: deps.bundledWorkflows,
      promptEnhanceMode: modeUiState.promptEnhanceMode,
      h3PromptPreset: modeUiState.h3PromptPreset,
      promptEnhancing: promptRuntimeView.right.action === "cancel",
      promptStarting: deps.getPromptStarting(),
      promptReleasing: deps.getPromptReleasing(),
      promptRuntimeLoaded: deps.getPromptRuntimeLoaded(),
      promptProgress: ownsActivePrompt ? deps.getPromptProgress() : null,
      enqueueBusy,
      promptRuntimeControlTitle: deps.promptRuntimeControlTitle,
      promptRuntimeControlIcon: deps.promptRuntimeControlIcon,
      promptRuntimeView
    };
  }

  function renderPage(): string {
    return deps.getCreationMode() === "image-edit"
      ? renderImageEditPage(buildImageEditPageViewModel(createViewModelDependencies()), createPageOptions)
      : renderCreatePage(buildVideoCreatePageViewModel(createViewModelDependencies()), createPageOptions);
  }

  function scheduleDraftSave(): void {
    window.clearTimeout(draftSaveTimer);
    draftSaveTimer = window.setTimeout(async () => {
      const revision = draftRevision;
      const state = getState();
      const draftToSave = state.draft;
      draftSaveInFlight += 1;
      try {
        const savedState = await deps.context.application.saveDraft(draftToSave, {
          imageToVideoDraft: state.imageToVideoDraft,
          videoExtensionDraft: state.videoExtensionDraft
        });
        const currentState = getState();
        deps.setRendererState({
          ...savedState,
          draft: currentState.draft,
          imageToVideoDraft: currentState.imageToVideoDraft,
          videoExtensionDraft: currentState.videoExtensionDraft
        });
        if (revision === draftRevision) draftDirty = false;
      } finally {
        draftSaveInFlight -= 1;
      }
    }, 350);
  }

  function scheduleImageDraftSave(): void {
    window.clearTimeout(imageDraftSaveTimer);
    imageDraftSaveTimer = window.setTimeout(async () => {
      const revision = imageDraftRevision;
      const state = getState();
      const draftToSave = state.imageDraft;
      imageDraftSaveInFlight += 1;
      try {
        const savedState = await deps.context.application.saveImageDraft(draftToSave);
        if (revision === imageDraftRevision) {
          deps.setRendererState({
            ...preserveLocalCreationDrafts(savedState, getState()),
            imageDraft: draftToSave
          });
          imageDraftDirty = false;
        }
      } catch (error) {
        deps.context.notify(error instanceof Error ? error.message : uiText("runtime.imageDraftSaveFailed"), { kind: "error" });
      } finally {
        imageDraftSaveInFlight -= 1;
      }
    }, 350);
  }

  async function ensureDraftWorkflowCapability(draft: Draft): Promise<void> {
    try {
      const workflowModelId = bundledWorkflowModelId(draft);
      const key = deps.bundledWorkflowKey(workflowModelId, draft.inputMode);
      const bundled = deps.bundledWorkflows[key] ??
        await deps.context.application.getBundledWorkflow(workflowModelId, draft.inputMode);
      if (bundled) {
        deps.bundledWorkflows[key] = bundled;
        deps.workflowCapabilities[bundled.path] = {
          supportsEndImage: bundled.supportsEndImage,
          supportsVideoExtension: bundled.supportsVideoExtension
        };
      }
      if (draft.workflowPath && draft.workflowPath !== bundled?.path) {
        const capability = await deps.context.application.inspectWorkflow(draft.workflowPath, draft.modelId);
        const currentState = getState();
        if (currentState.draft.workflowPath === draft.workflowPath && currentState.draft.modelId === draft.modelId) {
          deps.workflowCapabilities[draft.workflowPath] = capability;
        }
      }
    } catch (error) {
      await deps.context.application.reportRendererError(
        error instanceof Error ? error.message : String(error),
        { source: "draft-workflow-capability" }
      ).catch(() => undefined);
    }
  }

  async function saveDraftImmediately(draft: Draft): Promise<void> {
    window.clearTimeout(draftSaveTimer);
    draftRevision += 1;
    const revision = draftRevision;
    draftDirty = false;
    const state = getState();
    activateCreationDraft(state, draft);
    const workflowCapabilityPromise = ensureDraftWorkflowCapability(draft);
    draftSaveInFlight += 1;
    try {
      const [savedState] = await Promise.all([
        deps.context.application.saveDraft(state.draft, {
          imageToVideoDraft: state.imageToVideoDraft,
          videoExtensionDraft: state.videoExtensionDraft
        }),
        workflowCapabilityPromise
      ]);
      deps.setRendererState(preserveLocalCreationDrafts(savedState, getState()));
      if (revision === draftRevision) draftDirty = false;
    } finally {
      draftSaveInFlight -= 1;
    }
  }

  function patchDraft(patch: Partial<Draft>): void {
    const state = getState();
    activateCreationDraft(state, normalizeVideoDraft({ ...state.draft, ...patch }));
    draftRevision += 1;
    draftDirty = true;
    scheduleDraftSave();
  }

  function patchDraftForMode(
    mode: Exclude<CreationMode, "image-edit">,
    update: (draft: Draft) => Partial<Draft>
  ): void {
    const inputMode = mode === "video-extension" ? "video" : "image";
    const nextDraft = patchCreationDraftForMode(
      getState(),
      inputMode,
      (draft) => normalizeVideoDraft({ ...draft, ...update(draft) }),
      deps.getCreationMode() === mode
    );
    if (!nextDraft) return;
    draftRevision += 1;
    draftDirty = true;
    scheduleDraftSave();
  }

  function patchImageDraft(patch: Partial<ImageEditDraft>): void {
    const state = getState();
    state.imageDraft = normalizeImageEditDraft({ ...state.imageDraft, ...patch });
    imageDraftRevision += 1;
    imageDraftDirty = true;
    scheduleImageDraftSave();
  }

  async function loadImageEditPreviews(): Promise<void> {
    const state = getState();
    const pictures = state.imageDraft.pictures;
    let dimensionsChanged = false;
    await Promise.all(pictures.map(async (picture) => {
      const image = document.querySelector<HTMLImageElement>(
        `[data-image-picture-preview="${CSS.escape(picture.id)}"]`
      );
      if (!image || !picture.absolutePath) return;
      const previewPath = picture.markup?.renderedPath || imageReferenceInputPath(picture);
      const dataUrl = await deps.context.assets.readImage(previewPath).catch(() => null);
      if (!dataUrl || !image.isConnected) return;
      await new Promise<void>((resolve) => {
        image.addEventListener("load", () => {
          if (image.naturalWidth && image.naturalHeight) {
            const preview = image.closest<HTMLButtonElement>(".image-picture-preview");
            preview?.style.setProperty("--picture-ratio", `${image.naturalWidth} / ${image.naturalHeight}`);
            const current = getState().imageDraft.pictures.find((item) => item.id === picture.id);
            if (current && (current.width !== image.naturalWidth || current.height !== image.naturalHeight)) {
              const nextPictures = getState().imageDraft.pictures.map((item) =>
                item.id === picture.id
                  ? { ...item, width: image.naturalWidth, height: image.naturalHeight }
                  : item
              );
              const basePicture = nextPictures[0];
              patchImageDraft({
                pictures: nextPictures,
                targetResolution: normalizeImageTargetResolution(
                  getState().imageDraft.targetResolution,
                  basePicture?.width ?? 0,
                  basePicture?.height ?? 0
                )
              });
              dimensionsChanged = true;
            }
          }
          resolve();
        }, { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
        image.src = dataUrl;
      });
    }));
    if (dimensionsChanged && deps.getPage() === "create" && deps.getCreationMode() === "image-edit") deps.render();
  }

  function randomSeedValue(): number {
    const values = new Uint32Array(2);
    crypto.getRandomValues(values);
    const high = (values[0] ?? 0) & 0x001fffff;
    return high * 0x100000000 + (values[1] ?? 0);
  }

  function sameImageCrop(
    left: ImageReference["crop"] | null | undefined,
    right: { x: number; y: number; width: number; height: number; sourceWidth: number; sourceHeight: number } | null
  ): boolean {
    if (!left || !right) return !left && !right;
    return left.x === right.x && left.y === right.y &&
      left.width === right.width && left.height === right.height &&
      left.sourceWidth === right.sourceWidth && left.sourceHeight === right.sourceHeight;
  }

  async function editImagePictureMarkup(
    pictureId: string,
    requestedMode: "annotation" | "mask" = "annotation"
  ): Promise<void> {
    const state = getState();
    const picture = state.imageDraft.pictures.find((item) => item.id === pictureId);
    if (!picture?.absolutePath) return;
    const maskMode = requestedMode === "mask" ||
      (requestedMode === "annotation" && imageModelCapabilityFor(state.imageDraft.modelId).requiresMask === true);
    try {
      const { openImageMarkupEditor } = await import("../../../image-markup-editor");
      const [sourceDataUrl, existingDocument] = await Promise.all([
        deps.context.assets.readImage(picture.absolutePath),
        (maskMode ? picture.mask?.documentPath : picture.markup?.documentPath)
          ? deps.context.assets.readImageMarkup((maskMode ? picture.mask?.documentPath : picture.markup?.documentPath)!)
          : Promise.resolve(null)
      ]);
      if (!sourceDataUrl) throw new Error(uiText("runtime.readOriginalImageFailed"));
      const result = await openImageMarkupEditor({
        pictureNumber: picture.pictureNumber,
        filename: picture.absolutePath,
        sourceDataUrl,
        existingDocument,
        existingCrop: picture.crop,
        mode: maskMode ? "mask" : "annotation"
      });
      if (!result) return;
      const cropChanged = !sameImageCrop(picture.crop, result.crop);
      let crop = picture.crop;
      if (cropChanged) {
        crop = result.crop
          ? (await deps.context.assets.saveImageCrop({
              pictureId: picture.id,
              sourcePath: picture.absolutePath,
              crop: result.crop,
              croppedPng: result.croppedPng,
              previousRevision: picture.crop?.revision
            })) ?? undefined
          : undefined;
      }
      const width = result.crop?.width ?? picture.crop?.sourceWidth ?? picture.width;
      const height = result.crop?.height ?? picture.crop?.sourceHeight ?? picture.height;
      if (maskMode) {
        const mask = result.objectCount > 0
          ? await deps.context.assets.saveImageMask({
              pictureId: picture.id,
              sourcePath: picture.absolutePath,
              document: result.document,
              maskPng: result.renderedPng,
              regionCount: result.objectCount,
              previousRevision: picture.mask?.revision
            })
          : undefined;
        patchImageDraft({
          pictures: getState().imageDraft.pictures.map((item) =>
            item.id === pictureId ? { ...item, crop, width, height, mask } : item
          )
        });
        deps.render();
        void loadImageEditPreviews();
        deps.context.notify(mask ? `Mask 已保存 · ${mask.regionCount} 个区域` : "Mask 已清除");
        return;
      }
      const markup = result.objectCount > 0
        ? await deps.context.assets.saveImageMarkup({
            pictureId: picture.id,
            sourcePath: picture.absolutePath,
            document: result.document,
            renderedPng: result.renderedPng,
            summary: result.summary,
            objectCount: result.objectCount,
            previousRevision: picture.markup?.revision
          })
        : undefined;
      patchImageDraft({
        pictures: getState().imageDraft.pictures.map((item) =>
          item.id === pictureId ? { ...item, crop, width, height, markup } : item
        )
      });
      deps.render();
      void loadImageEditPreviews();
      deps.context.notify(markup
        ? uiText("runtime.markupSaved", { count: markup.objectCount })
        : uiText("runtime.markupCleared"));
    } catch (error) {
      deps.context.notify(error instanceof Error ? error.message : uiText("runtime.markupSaveFailed"), { kind: "error" });
    }
  }

  function addImageSlot(): void {
    const state = getState();
    const pictures = state.imageDraft.pictures;
    const capability = imageModelCapabilityFor(state.imageDraft.modelId);
    if (pictures.length >= capability.maxPictures) {
      deps.context.notify(uiText("runtime.maxPictureSlots", { name: capability.name, count: capability.maxPictures }), { kind: "warning" });
      return;
    }
    const pictureNumber = nextImagePictureNumber(state.imageDraft);
    const slot: ImageReference = {
      id: crypto.randomUUID(),
      pictureNumber,
      absolutePath: "",
      width: 0,
      height: 0,
      role: pictureNumber === 1 ? "base" : "auto"
    };
    patchImageDraft({
      pictures: [...pictures, slot].sort((left, right) => left.pictureNumber - right.pictureNumber),
      nextPictureNumber: pictureNumber + 1
    });
    deps.render();
  }

  function addImagePicture(path: string, replacePictureId?: string): void {
    if (!path) return;
    const state = getState();
    const pictures = state.imageDraft.pictures;
    const targetPicture = replacePictureId
      ? pictures.find((picture) => picture.id === replacePictureId)
      : pictures.find((picture) => !picture.absolutePath);
    if (targetPicture) {
      patchImageDraft({
        pictures: pictures.map((picture) =>
          picture.id === targetPicture.id
            ? { ...picture, absolutePath: path, width: 0, height: 0, crop: undefined, markup: undefined, mask: undefined }
            : picture
        )
      });
      deps.render();
      return;
    }
    const capability = imageModelCapabilityFor(state.imageDraft.modelId);
    if (pictures.length >= capability.maxPictures) {
      deps.context.notify(uiText("runtime.maxPictureReferences", { name: capability.name, count: capability.maxPictures }), { kind: "warning" });
      return;
    }
    const pictureNumber = nextImagePictureNumber(state.imageDraft);
    const picture: ImageReference = {
      id: crypto.randomUUID(),
      pictureNumber,
      absolutePath: path,
      width: 0,
      height: 0,
      role: pictureNumber === 1 ? "base" : "auto"
    };
    patchImageDraft({
      pictures: [...pictures, picture].sort((left, right) => left.pictureNumber - right.pictureNumber),
      nextPictureNumber: pictureNumber + 1
    });
    deps.render();
  }

  function updateH3ReferenceSlot(slotId: string, patch: Partial<H3ReferenceSlot>): void {
    const state = getState();
    patchDraft({
      h3ReferenceSlots: state.draft.h3ReferenceSlots.map((slot) =>
        slot.id === slotId
          ? {
              ...slot,
              ...patch,
              ...((patch.mediaType !== undefined && patch.mediaType !== slot.mediaType) ||
                (patch.mediaPath !== undefined && patch.mediaPath !== slot.mediaPath)
                ? { width: undefined, height: undefined }
                : {})
            }
          : slot
      )
    });
  }

  function bindH3ReferenceSlots(): void {
    deps.addPageCleanup(mountH3ReferencesController(deps.context, {
      getDraft: () => deps.context.getState()?.draft,
      patchDraft,
      requestRender: deps.render,
      notify: (message) => deps.context.notify(message),
      lockedFirstVideo: Boolean(getState().draft.inputMode === "video" && isMiniMaxH3R2vModel(getState().draft.modelId))
    }));
  }

  async function selectDraftVideo(
    filename: string,
    source?: {
      assetId: string;
      versionId: string;
      duration: number;
      width: number;
      height: number;
      modelId?: string;
      h3ContextLatentPath?: string;
      h3ContinuumArtifactPath?: string;
      h3ContinuumArtifact?: NativeAvContinuationArtifact;
      resolution?: number;
      resetSeed?: boolean;
    },
    renderAfterSave = true
  ): Promise<void> {
    const state = getState();
    const selectedModelId = source?.modelId ?? state.draft.modelId;
    const preserveMotionContextDraft = state.draft.inputMode === "video" && isMiniMaxH3R2vModel(state.draft.modelId);
    let selectedWorkflowPath = state.draft.workflowPath;
    if (source?.modelId) {
      const workflowModelId = bundledWorkflowModelId({
        modelId: selectedModelId,
        videoLoras: []
      });
      const key = deps.bundledWorkflowKey(workflowModelId, "video");
      const bundled = deps.bundledWorkflows[key] ??
        await deps.context.application.getBundledWorkflow(workflowModelId, "video");
      if (bundled) {
        deps.bundledWorkflows[key] = bundled;
        deps.workflowCapabilities[bundled.path] = {
          supportsEndImage: bundled.supportsEndImage,
          supportsVideoExtension: bundled.supportsVideoExtension
        };
        selectedWorkflowPath = bundled.path;
      }
    }
    const draft: Draft = {
      ...state.draft,
      inputMode: "video",
      modelId: selectedModelId,
      startImagePath: "",
      endImagePath: "",
      endImageWidth: 0,
      endImageHeight: 0,
      sourceVideoPath: filename,
      sourceVideoDuration: source?.duration ?? 0,
      trimStartSeconds: 0,
      trimEndSeconds: source?.duration ?? 0,
      sourceAssetId: source?.assetId,
      sourceVersionId: source?.versionId,
      h3ContextLatentPath: source?.h3ContextLatentPath,
      h3ContinuumArtifactPath: source?.h3ContinuumArtifactPath,
      h3ContinuumArtifact: source?.h3ContinuumArtifact
        ? structuredClone(source.h3ContinuumArtifact)
        : undefined,
      sourceWidth: source?.width ?? 0,
      sourceHeight: source?.height ?? 0,
      videoLoras: source?.modelId ? [] : state.draft.videoLoras,
      workflowPath: selectedWorkflowPath,
      ratio: "source",
      h3ReferenceSlots: isMiniMaxH3R2vModel(selectedModelId)
        ? ensureMotionContextSourceSlot(preserveMotionContextDraft ? state.draft.h3ReferenceSlots : [], filename)
        : [],
      ...(source?.resolution != null
        ? {
            resolution: nearestSupportedVideoResolution(
              source.resolution,
              modelCatalog.get(selectedModelId)?.definition.capabilities?.resolutions ??
                modelCatalog.get(state.settings.defaultExtensionModel)?.definition.capabilities?.resolutions ??
                [360, 480, 540, 720, 768],
              state.draft.resolution
            ) as Draft["resolution"]
          }
        : {}),
      ...(source?.resetSeed ? { seed: null } : {})
    };
    await saveDraftImmediately(draft);
    if (renderAfterSave) deps.render();
  }

  function setEnqueueBusyUi(busy: boolean): void {
    const button = document.querySelector<HTMLButtonElement>(
      deps.getCreationMode() === "image-edit" ? "#enqueue-image-edit" : "#enqueue"
    );
    if (!button) return;
    button.disabled = busy;
    button.classList.toggle("busy", busy);
    button.setAttribute("aria-busy", String(busy));
    const buttonIcon = button.querySelector<HTMLElement>(".enqueue-spinner");
    if (buttonIcon) {
      buttonIcon.outerHTML = icon(busy ? "refresh-cw" : "plus", "enqueue-spinner");
      renderIcons(button);
    }
    const label = button.querySelector<HTMLElement>("[data-enqueue-label]");
    if (label) label.textContent = busy ? uiText("runtime.enqueueing") : uiText("runtime.enqueue");
  }

  function syncVideoEnqueueUi(): void {
    const button = document.querySelector<HTMLButtonElement>("#enqueue");
    if (!button) return;
    const viewModel = buildVideoCreatePageViewModel(createViewModelDependencies());
    const reason = viewModel.enqueueBlockReason;
    button.dataset.enqueueBlockReason = reason;
    button.disabled = Boolean(reason) || enqueueBusy;
    button.title = reason || button.dataset.enqueueReadyTitle || uiText("runtime.enqueue");
    const tokenEstimate = document.querySelector<HTMLElement>("[data-h3-token-estimate]");
    if (tokenEstimate) tokenEstimate.textContent = viewModel.h3TokenEstimate == null ? "" : `${Math.trunc(viewModel.h3TokenEstimate)} tokens`;
    const feedback = document.querySelector<HTMLElement>("[data-enqueue-feedback]");
    if (feedback) {
      feedback.hidden = !reason;
      const message = feedback.querySelector<HTMLElement>("span");
      if (message) message.textContent = reason;
    }
  }

  function syncImageEditEnqueueUi(): void {
    const state = getState();
    const draft = state.imageDraft;
    const imageProfile = deps.getEnvironmentScan()?.modelProfiles.find((profile) => profile.id === draft.modelId);
    const reason = imageEditEnqueueBlockReason(draft, imageProfile, uiText);
    const imageCapability = imageModelCapabilityFor(draft.modelId);
    const button = document.querySelector<HTMLButtonElement>("#enqueue-image-edit");
    if (button) {
      button.disabled = Boolean(reason) || enqueueBusy;
      button.title = reason || uiText("runtime.imageEnqueue");
      button.dataset.enqueueBlockReason = reason;
    }
    const feedback = document.querySelector<HTMLElement>("[data-enqueue-feedback]");
    if (feedback) {
      feedback.hidden = !reason;
      const message = feedback.querySelector<HTMLElement>("span");
      if (message) message.textContent = reason;
    }
    const summaryTitle = document.querySelector<HTMLElement>(".image-edit-composer .interpolation-summary strong");
    if (summaryTitle) {
      const count = imageCapability.deterministic ? 1 : Math.min(imageOutputCountMax, Math.max(1, draft.outputCount));
      summaryTitle.textContent = imageCapability.requiresPrompt === false
        ? uiText(imageCapability.operation === "background-removal"
          ? "create.imageEdit.promptlessBackgroundRemovalSummary"
          : "create.imageEdit.promptlessLocalRemovalSummary", { count })
        : uiText("create.imageEdit.summary", {
            count,
            seedMode: draft.seed == null ? uiText("runtime.random") : uiText("runtime.same")
          });
    }
  }

  function bind(): void {
    deps.addPageCleanup(mountCreateAssembly(deps.context, {
      clipboard: {
        addImagePicture,
        updateH3ReferenceSlot,
        patchDraft
      },
      context: deps.context,
      setCreationMode: deps.setCreationMode,
      getEnvironmentScan: deps.getEnvironmentScan,
      bundledWorkflows: deps.bundledWorkflows,
      workflowCapabilities: deps.workflowCapabilities,
      bundledWorkflowKey: deps.bundledWorkflowKey,
      setRendererState: deps.setRendererState,
      patchDraft,
      patchDraftForMode,
      patchImageDraft,
      syncEnqueueUi: syncVideoEnqueueUi,
      enableSpectrumByDefaultIfAvailable,
      selectDraftVideo: (filename) => selectDraftVideo(filename),
      formatTrimTime,
      imageEdit: {
        addImageSlot,
        addImagePicture,
        editImagePictureMarkup,
        imageFileIsSupported,
        imageReferenceRoleLabel: (role) => qwenImagePromptPackFor(getState().settings.uiLocale).referenceRoleLabels[role],
        imageReferenceRolePromptLabel: (role) => imageReferenceRolePromptLabels[role],
        resizePromptInput,
        updateImagePromptWordCounter,
        syncEnqueueUi: syncImageEditEnqueueUi,
        getPromptEnhanceMode: () => activeCreationModeUiState().promptEnhanceMode === "faithful" ? "faithful" : "detail-enhance",
        setPromptEnhanceMode: (mode) => {
          activeCreationModeUiState().promptEnhanceMode = mode === "faithful" ? "faithful" : "sulphur-native";
        },
        isPromptEnhancing: () => deps.promptOperationBelongsTo("image-edit"),
        setPromptEnhancing: deps.setPromptEnhancing,
        setPromptRuntimeLoaded: deps.setPromptRuntimeLoaded,
        clearPromptVersion: () => clearPromptVersionForScope("image"),
        undoPromptEdit: () => undoPromptEdit("image"),
        redoPromptEdit: () => redoPromptEdit("image"),
        invalidatePromptEditHistory: () => invalidatePromptEditHistory("image"),
        togglePromptModel: deps.togglePromptModel,
        randomSeedValue,
        isEnqueueBusy: () => enqueueBusy,
        setEnqueueBusy: (value) => {
          enqueueBusy = value;
          deps.setEnqueueBusy(value);
        },
        setEnqueueBusyUi,
        requestClearDraftConfirmation: () => deps.requestClearDraftConfirmation("image-edit")
      },
      createPrompt: {
        h3ReferenceRoleLabels: h3PromptPackFor(getState().settings.uiLocale).referenceRoleLabels,
        h3ReferenceRolePromptLabels,
        getPromptEnhanceMode: () => activeCreationModeUiState().promptEnhanceMode,
        setPromptEnhanceMode: (mode) => {
          activeCreationModeUiState().promptEnhanceMode = mode;
        },
        getH3PromptPreset: () => activeCreationModeUiState().h3PromptPreset,
        setH3PromptPreset: (preset) => {
          activeCreationModeUiState().h3PromptPreset = preset;
        },
        isPromptEnhancing: () => deps.promptOperationBelongsTo(deps.getCreationMode()),
        setPromptEnhancing: deps.setPromptEnhancing,
        setPromptRuntimeLoaded: deps.setPromptRuntimeLoaded,
        clearPromptVersion: () => clearPromptVersionForScope("video"),
        undoPromptEdit: () => undoPromptEdit("video"),
        redoPromptEdit: () => redoPromptEdit("video"),
        invalidatePromptEditHistory: () => invalidatePromptEditHistory("video"),
        togglePromptModel: deps.togglePromptModel,
        syncPromptEnqueueUi: (_promptText) => syncVideoEnqueueUi(),
        updateH3PromptCheck
      },
      isEnqueueBusy: () => enqueueBusy,
      setEnqueueBusy: (value) => {
        enqueueBusy = value;
        deps.setEnqueueBusy(value);
      },
      setEnqueueBusyUi,
      requestClearDraftConfirmation: () => deps.requestClearDraftConfirmation(deps.getCreationMode())
    }));

    if (deps.getCreationMode() === "image-edit") {
      void loadImageEditPreviews();
      return;
    }
    const state = getState();
    void loadImagePreview(deps.context, state.draft.startImagePath, "start-preview", patchDraft);
    const endImagePath = state.draft.endImagePath;
    void loadImagePreview(
      deps.context,
      endImagePath,
      "end-preview",
      patchDraft,
      ({ width, height }) => {
        const currentState = deps.context.getState();
        const currentDraft = currentState?.draft;
        if (!currentDraft || currentDraft.endImagePath !== endImagePath ||
          (currentDraft.endImageWidth === width && currentDraft.endImageHeight === height)) return undefined;
        return { endImageWidth: width, endImageHeight: height };
      }
    );
    if (isMiniMaxH3R2vModel(state.draft.modelId)) {
      bindH3ReferenceSlots();
      for (const slot of state.draft.h3ReferenceSlots) {
        if (slot.mediaType !== "image") continue;
        const slotId = slot.id;
        const slotPath = slot.mediaPath;
        void loadImagePreview(
          deps.context,
          slotPath,
          `h3-slot-preview-${slotId}`,
          patchDraft,
          ({ width, height }) => {
            const currentDraft = deps.context.getState()?.draft;
            const currentSlot = currentDraft?.h3ReferenceSlots.find((item) => item.id === slotId);
            if (!currentDraft || !currentSlot || currentSlot.mediaType !== "image" ||
              currentSlot.mediaPath !== slotPath ||
              (currentSlot.width === width && currentSlot.height === height)) return undefined;
            return {
              h3ReferenceSlots: currentDraft.h3ReferenceSlots.map((item) =>
                item.id === slotId ? { ...item, width, height } : item
              )
            };
          }
        );
      }
    }
  }

  function clearDraft(mode: CreationMode): void {
    if (mode === "image-edit") patchImageDraft(createDefaultImageEditDraft());
    else patchDraftForMode(mode, (draft) => createClearedDraft(draft));
  }

  function enableSpectrumByDefaultIfAvailable(mode?: Exclude<CreationMode, "image-edit">): void {
    const spectrumNode = deps.getEnvironmentScan()?.customNodes.find((node) => node.id === "spectrum-minimax-h3");
    const draft = mode
      ? creationDraftForMode(getState(), mode === "video-extension" ? "video" : "image")
      : getState().draft;
    if (!draft || !shouldEnableSpectrumByDefault(draft, spectrumNode)) return;
    if (mode) patchDraftForMode(mode, () => ({ spectrumMode: "balanced" }));
    else patchDraft({ spectrumMode: "balanced" });
  }

  return {
    renderPage,
    bind,
    patchDraft,
    patchDraftForMode,
    patchImageDraft,
    clearDraft,
    saveDraftImmediately,
    selectDraftVideo,
    enableSpectrumByDefaultIfAvailable,
    getDraftDirty: () => draftDirty,
    getDraftSaveInFlight: () => draftSaveInFlight,
    getImageDraftDirty: () => imageDraftDirty,
    getImageDraftSaveInFlight: () => imageDraftSaveInFlight
  };
}
