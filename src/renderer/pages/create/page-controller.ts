import type {
  AppState,
  BundledWorkflow,
  Draft,
  EnvironmentScanResult,
  H3PromptPreset,
  ImageEditDraft,
  ImagePromptPreset,
  PromptEnhanceMode,
  WorkflowCapabilities
} from "../../../types";
import type { CreationMode, RendererCleanup, RendererContext } from "../../contracts";
import { bundledWorkflowModelId, isH3TurboEnabled, reorderVideoLoras, videoLoraSelection, videoLoraCompatibleWithDraft, BUILTIN_VIDEO_LORAS, detectedVideoLoraFilename } from "../../../core/video-loras";
import { generationSafetyForTask, isMiniMaxH3Fl2vaModel, isMiniMaxH3Model, isMiniMaxH3Q3GgufModel, isMiniMaxH3R2vModel, motionContextMaxDurationSeconds, normalizeH3Steps } from "../../../core/workflow";
import { ensureMotionContextSourceSlot, h3ReferenceSlotCounts } from "../../../core/h3-reference";
import { extensionSafetyForDraft, modelSupportsCreateInputMode, newH3ReferenceSlot } from "./helpers";
import { mountCreatePromptController, type CreatePromptControllerOptions } from "./prompt-controller";
import { mountImageEditController, type ImageEditControllerOptions } from "./image-edit-controller";
import { mountImageToVideoController } from "./image-to-video-controller";
import { mountVideoExtensionController } from "./video-extension-controller";
import { uiKeys } from "../../../core/i18n-keys";
import { creationDraftForMode } from "../../../core/creation-drafts";

let creationModeTransitionRevision = 0;

export interface CreatePageControllerOptions {
  context: RendererContext;
  setCreationMode(mode: CreationMode): void;
  getEnvironmentScan(): EnvironmentScanResult | null;
  bundledWorkflows: Record<string, BundledWorkflow>;
  workflowCapabilities: Record<string, WorkflowCapabilities>;
  bundledWorkflowKey(modelId: string, inputMode: Draft["inputMode"]): string;
  setRendererState(nextState: AppState): void;
  patchDraft(patch: Partial<Draft>): void;
  patchDraftForMode(
    mode: Exclude<CreationMode, "image-edit">,
    update: (draft: Draft) => Partial<Draft>
  ): void;
  patchImageDraft(patch: Partial<ImageEditDraft>): void;
  syncEnqueueUi(): void;
  enableSpectrumByDefaultIfAvailable(mode?: Exclude<CreationMode, "image-edit">): void;
  selectDraftVideo(filename: string): Promise<void>;
  formatTrimTime(seconds: number): string;
  imageEdit: Omit<ImageEditControllerOptions, "setState" | "patchImageDraft" | "resizePromptInput" | "updateImagePromptWordCounter" | "setPromptEnhanceMode" | "setPromptEnhancing" | "setPromptRuntimeLoaded" | "togglePromptModel" | "isEnqueueBusy" | "setEnqueueBusy" | "setEnqueueBusyUi"> & {
    resizePromptInput(input: HTMLTextAreaElement): void;
    updateImagePromptWordCounter(text: string): void;
    getPromptEnhanceMode(): ImagePromptPreset;
    setPromptEnhanceMode(mode: ImagePromptPreset): void;
    setPromptEnhancing(value: boolean): void;
    setPromptRuntimeLoaded(value: boolean): void;
    clearPromptVersion(): void;
    undoPromptEdit(): boolean;
    redoPromptEdit(): boolean;
    invalidatePromptEditHistory(): void;
    togglePromptModel(): Promise<void>;
    isEnqueueBusy(): boolean;
    setEnqueueBusy(value: boolean): void;
    setEnqueueBusyUi(busy: boolean): void;
  };
  createPrompt: Omit<CreatePromptControllerOptions, "context" | "patchDraft" | "patchDraftForMode" | "setWorkflowCapability" | "syncPromptEnqueueUi" | "updateH3PromptCheck" | "isPromptEnhancing" | "setPromptEnhancing" | "setPromptRuntimeLoaded" | "togglePromptModel" | "getPromptEnhanceMode" | "setPromptEnhanceMode" | "getH3PromptPreset" | "setH3PromptPreset"> & {
    syncPromptEnqueueUi(promptText: string): void;
    updateH3PromptCheck(promptText: string, hasEndImage: boolean, mode?: import("../../../types").H3PromptMode, hasVideoReference?: boolean): void;
    getPromptEnhanceMode(): PromptEnhanceMode;
    setPromptEnhanceMode(mode: PromptEnhanceMode): void;
    getH3PromptPreset(): H3PromptPreset;
    setH3PromptPreset(preset: H3PromptPreset): void;
    isPromptEnhancing(): boolean;
    setPromptEnhancing(value: boolean): void;
    setPromptRuntimeLoaded(value: boolean): void;
    clearPromptVersion(): void;
    undoPromptEdit(): boolean;
    redoPromptEdit(): boolean;
    invalidatePromptEditHistory(): void;
    togglePromptModel(): Promise<void>;
  };
  isEnqueueBusy(): boolean;
  setEnqueueBusy(value: boolean): void;
  setEnqueueBusyUi(busy: boolean): void;
  requestClearDraftConfirmation(): void;
}

export function mountCreatePageController(
  options: CreatePageControllerOptions
): RendererCleanup {
  const events = new AbortController();
  const signal = events.signal;
  const root = options.context.root;
  const getState = () => options.context.getState();
  const t = options.context.t;

  root.querySelectorAll<HTMLElement>("[data-input-mode]").forEach((button) => {
    button.addEventListener("click", async () => {
      const transitionRevision = ++creationModeTransitionRevision;
      const requestedMode = button.dataset.inputMode;
      if (requestedMode === "image-edit") {
        options.setCreationMode("image-edit");
        options.context.requestRender();
        return;
      }
      const state = getState();
      if (!state) return;
      const inputMode = requestedMode === "video" ? "video" : "image";
      const storedDraft = creationDraftForMode(state, inputMode);
      if (storedDraft) {
        const workflowModelId = bundledWorkflowModelId(storedDraft);
        const key = options.bundledWorkflowKey(workflowModelId, inputMode);
        const bundled = options.bundledWorkflows[key] ??
          await options.context.studio.getBundledWorkflow(workflowModelId, inputMode);
        if (bundled) {
          options.bundledWorkflows[key] = bundled;
          options.workflowCapabilities[bundled.path] = {
            supportsEndImage: bundled.supportsEndImage,
            supportsVideoExtension: bundled.supportsVideoExtension
          };
        }
        if (storedDraft.workflowPath && storedDraft.workflowPath !== bundled?.path) {
          options.workflowCapabilities[storedDraft.workflowPath] =
            await options.context.studio.inspectWorkflow(
              storedDraft.workflowPath,
              storedDraft.modelId
            );
        }
        if (transitionRevision !== creationModeTransitionRevision) return;
        options.setCreationMode(inputMode === "video" ? "video-extension" : "image-to-video");
        options.patchDraft(storedDraft);
        options.context.requestRender();
        return;
      }
      const wasVideoExtension = state.draft.inputMode === "video";
      // Switching to image creation intentionally clears video-only fields on
      // the active draft. Restore the last unfinished extension draft when the
      // user comes back, so a history continuation (including its source slot)
      // is not lost just because they inspected another creation mode.
      const restoringVideoDraft = inputMode === "video" && !wasVideoExtension
        ? state.videoExtensionDraft
        : undefined;
      const videoSourceDraft = restoringVideoDraft ?? state.draft;
      options.setCreationMode(inputMode === "video" ? "video-extension" : "image-to-video");
      const environmentScan = options.getEnvironmentScan();
      const modelId = inputMode === "video"
        ? restoringVideoDraft
          ? restoringVideoDraft.modelId
          : (() => {
              const configuredModel = state.settings.defaultExtensionModel;
              if (configuredModel && modelSupportsCreateInputMode(
                configuredModel,
                "video",
                false,
                "",
                options.workflowCapabilities,
                options.bundledWorkflows
              )) {
                return configuredModel;
              }
              if (isMiniMaxH3R2vModel(state.draft.modelId) || isMiniMaxH3Fl2vaModel(state.draft.modelId)) {
                return state.draft.modelId;
              }
              const node = environmentScan?.customNodes.find((item) => item.id === "h3-motion-context");
              return node?.installed || node?.loaded
                ? "minimax_h3_ref2va"
                : "minimax_h3_fl2va";
            })()
          : wasVideoExtension
            ? state.settings.defaultVideoModel
            : state.draft.modelId;
      const videoLoras = inputMode === "video"
        ? (restoringVideoDraft ? restoringVideoDraft.videoLoras.map((lora) => ({ ...lora })) : [])
        : wasVideoExtension
          ? []
          : state.draft.videoLoras;
      const workflowModelId = bundledWorkflowModelId({ modelId, videoLoras });
      const key = options.bundledWorkflowKey(workflowModelId, inputMode);
      const bundled = options.bundledWorkflows[key] ??
        await options.context.studio.getBundledWorkflow(workflowModelId, inputMode);
      if (bundled) {
        options.bundledWorkflows[key] = bundled;
        options.workflowCapabilities[bundled.path] = {
          supportsEndImage: bundled.supportsEndImage,
          supportsVideoExtension: bundled.supportsVideoExtension
        };
      }
      if (transitionRevision !== creationModeTransitionRevision) return;
      const nextMotionSlots = inputMode === "video" && isMiniMaxH3R2vModel(modelId)
        ? ensureMotionContextSourceSlot(
            restoringVideoDraft || wasVideoExtension ? videoSourceDraft.h3ReferenceSlots : [],
            restoringVideoDraft || wasVideoExtension ? videoSourceDraft.sourceVideoPath : ""
          )
        : inputMode === "image" && !wasVideoExtension
          ? state.draft.h3ReferenceSlots
          : [];
      options.patchDraft({
        ...(restoringVideoDraft ? structuredClone(restoringVideoDraft) : {}),
        inputMode,
        modelId,
        videoLoras,
        workflowPath: bundled?.path ?? (restoringVideoDraft ? restoringVideoDraft.workflowPath : ""),
        h3ReferenceSlots: nextMotionSlots,
        ...(inputMode === "video"
          ? {
              startImagePath: "",
              endImagePath: "",
              ...(wasVideoExtension || restoringVideoDraft
                ? {}
                : {
                    sourceVideoPath: "",
                    sourceVideoDuration: 0,
                    trimStartSeconds: 0,
                    trimEndSeconds: 0,
                    sourceAssetId: undefined,
                    sourceVersionId: undefined,
                    h3ContextLatentPath: undefined,
                    sourceWidth: 0,
                    sourceHeight: 0
                  }),
              ratio: "source" as const,
              duration: isMiniMaxH3R2vModel(modelId)
                ? Math.min(
                    videoSourceDraft.duration,
                    motionContextMaxDurationSeconds()
                  )
                : videoSourceDraft.duration,
              spectrumMode: isMiniMaxH3R2vModel(modelId)
                ? "off" as const
                : videoSourceDraft.spectrumMode
            }
          : wasVideoExtension
            ? {
                sourceVideoPath: "",
                sourceVideoDuration: 0,
                trimStartSeconds: 0,
                trimEndSeconds: 0,
                sourceAssetId: undefined,
                sourceVersionId: undefined,
                h3ContextLatentPath: undefined,
                sourceWidth: 0,
                sourceHeight: 0
              }
            : {})
      });
      options.context.requestRender();
    }, { signal });
  });

  if (options.context.getRoute().creationMode === "image-edit") {
    const imageEditOptions: ImageEditControllerOptions = {
      ...options.imageEdit,
      setState: options.setRendererState,
      patchImageDraft: options.patchImageDraft,
      resizePromptInput: options.imageEdit.resizePromptInput,
      updateImagePromptWordCounter: options.imageEdit.updateImagePromptWordCounter,
      setPromptEnhanceMode: options.imageEdit.setPromptEnhanceMode,
      setPromptEnhancing: options.imageEdit.setPromptEnhancing,
      setPromptRuntimeLoaded: options.imageEdit.setPromptRuntimeLoaded,
      togglePromptModel: options.imageEdit.togglePromptModel,
      isEnqueueBusy: options.imageEdit.isEnqueueBusy,
      setEnqueueBusy: options.imageEdit.setEnqueueBusy,
      setEnqueueBusyUi: options.imageEdit.setEnqueueBusyUi
    };
    const cleanup = mountImageEditController(options.context, imageEditOptions);
    return () => {
      events.abort();
      cleanup();
    };
  }

  const draft = getState()?.draft;
  if (!draft) return () => events.abort();
  const childCleanups: RendererCleanup[] = [];
  if (draft.inputMode === "video") {
    childCleanups.push(mountVideoExtensionController(options.context, {
      selectDraftVideo: options.selectDraftVideo,
      patchDraft: options.patchDraft,
      syncEnqueueUi: options.syncEnqueueUi,
      formatTrimTime: options.formatTrimTime
    }));
  } else {
    childCleanups.push(mountImageToVideoController(options.context, {
      patchDraft: options.patchDraft
    }));
  }

  childCleanups.push(mountCreatePromptController({
    ...options.createPrompt,
    context: options.context,
    patchDraft: options.patchDraft,
    patchDraftForMode: options.patchDraftForMode,
    setWorkflowCapability: (path, capability) => {
      options.workflowCapabilities[path] = capability;
    },
    isPromptEnhancing: options.createPrompt.isPromptEnhancing,
    setPromptEnhancing: options.createPrompt.setPromptEnhancing,
    setPromptRuntimeLoaded: options.createPrompt.setPromptRuntimeLoaded,
    togglePromptModel: options.createPrompt.togglePromptModel,
    getPromptEnhanceMode: options.createPrompt.getPromptEnhanceMode,
    setPromptEnhanceMode: options.createPrompt.setPromptEnhanceMode,
    getH3PromptPreset: options.createPrompt.getH3PromptPreset,
    setH3PromptPreset: options.createPrompt.setH3PromptPreset
  }));

  const applyVideoLoraStack = async (videoLoras: Draft["videoLoras"]): Promise<void> => {
    const state = getState();
    if (!state) return;
    const wasTurboEnabled = isH3TurboEnabled(state.draft);
    const turboWillBeEnabled = isH3TurboEnabled({ modelId: state.draft.modelId, videoLoras });
    const turboStateChanged = wasTurboEnabled !== turboWillBeEnabled;
    const previousWorkflowModelId = bundledWorkflowModelId(state.draft);
    const workflowModelId = bundledWorkflowModelId({ modelId: state.draft.modelId, videoLoras });
    const key = options.bundledWorkflowKey(workflowModelId, state.draft.inputMode);
    const bundled = options.bundledWorkflows[key] ??
      await options.context.studio.getBundledWorkflow(workflowModelId, state.draft.inputMode);
    if (bundled) {
      options.bundledWorkflows[key] = bundled;
      options.workflowCapabilities[bundled.path] = {
        supportsEndImage: bundled.supportsEndImage,
        supportsVideoExtension: bundled.supportsVideoExtension
      };
    }
    const previousBundledPath = options.bundledWorkflows[
      options.bundledWorkflowKey(previousWorkflowModelId, state.draft.inputMode)
    ]?.path;
    const currentWorkflowIsBundled = !state.draft.workflowPath || state.draft.workflowPath === previousBundledPath;
    const shouldSwitchWorkflow = turboStateChanged && currentWorkflowIsBundled;
    options.patchDraft({
      videoLoras,
      steps: turboWillBeEnabled
        ? normalizeH3Steps(state.draft.steps, state.draft.modelId, videoLoras)
        : wasTurboEnabled ? 20 : state.draft.steps,
      spectrumMode: state.draft.spectrumMode,
      workflowPath: shouldSwitchWorkflow ? bundled?.path ?? state.draft.workflowPath : state.draft.workflowPath
    });
    options.context.requestRender();
    if (turboStateChanged && !currentWorkflowIsBundled) {
      options.context.notify(turboWillBeEnabled
        ? t(uiKeys.create.interaction.customWorkflowTurbo)
        : t(uiKeys.create.interaction.customWorkflowStandard));
    } else if (turboStateChanged && shouldSwitchWorkflow) {
      options.context.notify(turboWillBeEnabled
        ? t(uiKeys.create.interaction.turboEnabled)
        : t(uiKeys.create.interaction.turboDisabled));
    }
  };

  root.querySelector("#add-video-lora")?.addEventListener("click", async () => {
    const state = getState();
    if (!state) return;
    const id = root.querySelector<HTMLSelectElement>("#video-lora-to-add")?.value ?? "";
    const lora = BUILTIN_VIDEO_LORAS.find((item) => item.id === id);
    if (!lora || state.draft.videoLoras.some((item) => item.id === id)) return;
    const profile = options.getEnvironmentScan()?.modelProfiles.find((item) => item.id === id);
    const detectedFilename = detectedVideoLoraFilename(profile);
    if (!detectedFilename) {
      options.context.notify(t(uiKeys.create.interaction.loraFileMissing, { name: lora.name }), { renderPage: false });
      return;
    }
    await applyVideoLoraStack([...state.draft.videoLoras, videoLoraSelection(lora, lora.strength, detectedFilename)]);
  }, { signal });

  root.querySelectorAll<HTMLButtonElement>("[data-remove-video-lora]").forEach((button) => {
    button.addEventListener("click", async () => {
      const state = getState();
      const id = button.dataset.removeVideoLora;
      if (!state || !id) return;
      await applyVideoLoraStack(state.draft.videoLoras.filter((lora) => lora.id !== id));
    }, { signal });
  });
  root.querySelectorAll<HTMLButtonElement>("[data-move-video-lora]").forEach((button) => {
    button.addEventListener("click", async () => {
      const state = getState();
      const id = button.dataset.moveVideoLora;
      const direction = button.dataset.direction === "up" ? -1 : 1;
      if (!state || !id) return;
      await applyVideoLoraStack(reorderVideoLoras(state.draft.videoLoras, id, direction));
    }, { signal });
  });

  const updateLoraStrength = (id: string, rawValue: string): void => {
    const state = getState();
    if (!state) return;
    const strength = Math.max(0, Math.min(2, Number(rawValue) || 0));
    options.patchDraft({
      videoLoras: state.draft.videoLoras.map((lora) => lora.id === id ? { ...lora, strength } : lora)
    });
    root.querySelector<HTMLInputElement>(`[data-video-lora-strength="${CSS.escape(id)}"]`)!.value = String(strength);
    root.querySelector<HTMLInputElement>(`[data-video-lora-strength-number="${CSS.escape(id)}"]`)!.value = String(strength);
  };
  root.querySelectorAll<HTMLInputElement>("[data-video-lora-strength]").forEach((input) => {
    input.addEventListener("input", () => updateLoraStrength(input.dataset.videoLoraStrength ?? "", input.value), { signal });
  });
  root.querySelectorAll<HTMLInputElement>("[data-video-lora-strength-number]").forEach((input) => {
    input.addEventListener("change", () => updateLoraStrength(input.dataset.videoLoraStrengthNumber ?? "", input.value), { signal });
  });

  for (const id of ["model", "ratio", "resolution", "steps", "spectrum-mode", "spectrum-model-aware-mode", "fps", "frame-interpolation", "motion", "seed"]) {
    root.querySelector(`#${id}`)?.addEventListener("change", async (event) => {
      const state = getState();
      if (!state) return;
      const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
      if (id === "model") {
        const requestMode = state.draft.inputMode === "video"
          ? "video-extension"
          : "image-to-video";
        const oldKey = options.bundledWorkflowKey(bundledWorkflowModelId(state.draft), state.draft.inputMode);
        const nextKey = options.bundledWorkflowKey(value, state.draft.inputMode);
        const oldBundledPath = options.bundledWorkflows[oldKey]?.path;
        const nextIsR2V = isMiniMaxH3R2vModel(value);
        const oldWasR2V = isMiniMaxH3R2vModel(state.draft.modelId);
        const existingSlots = state.draft.h3ReferenceSlots;
        const slotsForR2V = nextIsR2V && state.draft.inputMode === "video"
          ? ensureMotionContextSourceSlot(existingSlots, state.draft.sourceVideoPath)
          : nextIsR2V && state.draft.inputMode !== "video" && !existingSlots.length
            ? [state.draft.startImagePath, state.draft.endImagePath].filter(Boolean).map((imagePath) => newH3ReferenceSlot(imagePath))
            : existingSlots;
        const restoredStartImage = oldWasR2V
          ? existingSlots.find((slot) => slot.mediaType === "image")?.mediaPath ?? ""
          : state.draft.startImagePath;
        const restoredEndImage = oldWasR2V
          ? existingSlots.filter((slot) => slot.mediaType === "image")[1]?.mediaPath ?? ""
          : state.draft.endImagePath;
        const bundled = options.bundledWorkflows[nextKey] ??
          await options.context.studio.getBundledWorkflow(value, state.draft.inputMode);
        if (bundled) {
          options.bundledWorkflows[nextKey] = bundled;
          options.workflowCapabilities[bundled.path] = {
            supportsEndImage: bundled.supportsEndImage,
            supportsVideoExtension: bundled.supportsVideoExtension
          };
        }
        options.patchDraftForMode(requestMode, () => ({
          modelId: value,
          videoLoras: [],
          h3ReferenceSlots: slotsForR2V,
          startImagePath: nextIsR2V && state.draft.inputMode !== "video" ? "" : restoredStartImage,
          endImagePath: nextIsR2V && state.draft.inputMode !== "video" ? "" : restoredEndImage,
          ...(isMiniMaxH3Model(value)
            ? {
                ratio: "source" as const,
                resolution: 480 as const,
                duration: 5,
                steps: isMiniMaxH3Q3GgufModel(value) ? 8 as const : 20 as const,
                fps: 24 as const,
                frameInterpolation: "off" as const,
                motion: "natural" as const,
                spectrumMode: isMiniMaxH3Q3GgufModel(value) || state.draft.inputMode === "video" && nextIsR2V
                  ? "off" as const
                  : state.draft.spectrumMode
              }
            : {}),
          ...(!bundled?.supportsEndImage && !nextIsR2V ? { endImagePath: "" } : {}),
          workflowPath: bundled?.path ?? (state.draft.workflowPath === oldBundledPath ? "" : state.draft.workflowPath)
        }));
        options.enableSpectrumByDefaultIfAvailable(requestMode);
        options.context.requestRender();
        return;
      }
      const patch =
        id === "ratio" ? { ratio: value as Draft["ratio"] } :
        id === "resolution" ? { resolution: Number(value) as Draft["resolution"] } :
        id === "steps" ? { steps: normalizeH3Steps(Number(value), state.draft.modelId, state.draft.videoLoras) } :
        id === "spectrum-mode" ? { spectrumMode: value as Draft["spectrumMode"], spectrumModeUserSet: true } :
        id === "spectrum-model-aware-mode" ? { spectrumModelAwareMode: value as Draft["spectrumModelAwareMode"] } :
        id === "fps" ? { fps: Number(value) as Draft["fps"] } :
        id === "frame-interpolation" ? { frameInterpolation: value as Draft["frameInterpolation"] } :
        id === "motion" ? { motion: value as Draft["motion"] } :
        { seed: value ? Number(value) : null };
      options.patchDraft(patch);
      options.syncEnqueueUi();
      if (id === "fps" || id === "frame-interpolation" || id === "spectrum-mode") {
        options.context.requestRender();
      }
    }, { signal });
  }

  root.querySelector<HTMLButtonElement>("#clear-seed")?.addEventListener("click", () => {
    options.patchDraft({ seed: null });
    options.context.requestRender();
  }, { signal });
  root.querySelector<HTMLButtonElement>("#random-seed")?.addEventListener("click", () => {
    options.patchDraft({ seed: options.imageEdit.randomSeedValue() });
    options.context.requestRender();
  }, { signal });

  const range = root.querySelector<HTMLInputElement>("#duration");
  const number = root.querySelector<HTMLInputElement>("#duration-number");
  const updateDuration = (value: string) => {
    const state = getState();
    if (!state) return;
    const maxDuration = state.draft.inputMode === "video"
      ? extensionSafetyForDraft(state.draft, state.settings).maxDurationSeconds
      : generationSafetyForTask(state.draft, state.settings.uiLocale).maxDurationSeconds;
    const duration = Math.max(1, Math.min(maxDuration, Number(value) || 1));
    options.patchDraft({ duration });
    options.syncEnqueueUi();
    if (range) range.value = String(duration);
    if (number) number.value = String(duration);
    const added = root.querySelector("#trim-added");
    const total = root.querySelector("#trim-total");
    const kept = state.draft.trimEndSeconds - state.draft.trimStartSeconds;
    if (added) added.textContent = t(uiKeys.create.interaction.trimAdded, { value: duration.toFixed(1) });
    if (total) total.textContent = t(uiKeys.create.interaction.trimApproxTotal, { value: (kept + duration).toFixed(1) });
  };
  range?.addEventListener("input", () => updateDuration(range.value), { signal });
  number?.addEventListener("input", () => updateDuration(number.value), { signal });
  range?.addEventListener("change", () => options.context.requestRender(), { signal });
  number?.addEventListener("change", () => options.context.requestRender(), { signal });

  root.querySelector("#clear-draft")?.addEventListener("click", () => {
    options.requestClearDraftConfirmation();
  }, { signal });
  root.querySelector("#enqueue")?.addEventListener("click", async () => {
    const state = getState();
    if (!state || options.isEnqueueBusy()) return;
    options.setEnqueueBusy(true);
    options.setEnqueueBusyUi(true);
    try {
      options.context.reportUserAction("queue-enqueue", {
        taskType: state.draft.inputMode === "video" ? "extension" : "generation",
        modelId: state.draft.modelId,
        duration: state.draft.duration,
        fps: state.draft.fps
      });
      const nextState = state.draft.inputMode === "video"
        ? await options.context.studio.enqueueExtension(state.draft)
        : await options.context.studio.enqueue(state.draft);
      options.setRendererState(nextState);
      options.context.notify(
        state.draft.inputMode === "video"
          ? t(uiKeys.create.interaction.extensionQueueAdded, { filename: nextState.queue.at(-1)?.outputFilename ?? "" })
          : t(uiKeys.create.interaction.queueAdded, { filename: nextState.queue.at(-1)?.outputFilename ?? "" })
      );
    } catch (error) {
      options.context.notify(error instanceof Error ? error.message : String(error), { kind: "error" });
    } finally {
      options.setEnqueueBusy(false);
      options.context.requestRender();
    }
  }, { signal });

  return () => {
    events.abort();
    childCleanups.reverse().forEach((cleanup) => cleanup());
  };
}
