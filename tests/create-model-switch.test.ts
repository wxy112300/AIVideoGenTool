// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { activateCreationDraft, patchCreationDraftForMode } from "../src/core/creation-drafts";
import { normalizeVideoDraft } from "../src/core/video-draft-normalization";
import { createTranslator } from "../src/core/i18n";
import { loadPromptPacks } from "../src/renderer/prompt-packs";
import { mountCreatePageController, type CreatePageControllerOptions } from "../src/renderer/pages/create/page-controller";
import type { AppState, Draft } from "../src/types";
import type { RendererCleanup } from "../src/renderer/contracts";

function createControllerHarness(routeMode: "image-to-video" | "video-extension" = "video-extension") {
  const state = createDefaultState();
  const extensionDraft = normalizeVideoDraft({
    ...state.draft,
    inputMode: "video",
    modelId: "minimax_h3_ref2va",
    h3LatentSaveMode: "motion-context",
    h3SaveJointAv: false
  });
  state.draft = structuredClone(extensionDraft);
  state.videoExtensionDraft = structuredClone(extensionDraft);
  const root = document.createElement("div");
  root.innerHTML = `<select id="model">
    <option value="minimax_h3_ref2va" selected>R2V</option>
    <option value="minimax_h3_fl2va">FL2VA</option>
    <option value="minimax_h3_continuum">Continuum</option>
  </select>`;
  const translator = createTranslator("zh-CN");
  let resolveBundled: ((value: null) => void) | undefined;
  const bundledWorkflow = new Promise<null>((resolve) => {
    resolveBundled = resolve;
  });
  const patchDraftForMode = vi.fn((mode: "video-extension", update: (draft: Draft) => Partial<Draft>) => {
    expect(mode).toBe("video-extension");
    const next = normalizeVideoDraft({ ...state.videoExtensionDraft!, ...update(state.videoExtensionDraft!) });
    state.draft = structuredClone(next);
    state.videoExtensionDraft = structuredClone(next);
  });
  const options = {
    context: {
      root,
      getState: () => state,
      getRoute: () => ({ page: "create", creationMode: routeMode, historyKind: "video" }),
      t: translator.t,
      requestRender: vi.fn(),
      notify: vi.fn(),
      reportUserAction: vi.fn(),
      application: {
        getBundledWorkflow: vi.fn(() => bundledWorkflow)
      },
      hostCapabilities: {}
    },
    setCreationMode: vi.fn(),
    getEnvironmentScan: () => null,
    bundledWorkflows: {},
    workflowCapabilities: {},
    bundledWorkflowKey: (modelId: string, inputMode: Draft["inputMode"]) => `${modelId}:${inputMode}`,
    setRendererState: vi.fn((nextState: AppState) => Object.assign(state, nextState)),
    patchDraft: vi.fn((patch: Partial<Draft>) => {
      activateCreationDraft(state, normalizeVideoDraft({ ...state.draft, ...patch }));
    }),
    patchDraftForMode,
    patchImageDraft: vi.fn(),
    syncEnqueueUi: vi.fn(),
    enableSpectrumByDefaultIfAvailable: vi.fn(),
    selectDraftVideo: vi.fn(async () => undefined),
    formatTrimTime: (seconds: number) => String(seconds),
    imageEdit: {},
    createPrompt: {
      h3ReferenceRoleLabels: {},
      h3ReferenceRolePromptLabels: {},
      syncPromptEnqueueUi: vi.fn(),
      updateH3PromptCheck: vi.fn(),
      getPromptEnhanceMode: vi.fn(() => "sulphur-native"),
      setPromptEnhanceMode: vi.fn(),
      getH3PromptPreset: vi.fn(() => "official-storyboard"),
      setH3PromptPreset: vi.fn(),
      isPromptEnhancing: vi.fn(() => false),
      setPromptEnhancing: vi.fn(),
      setPromptRuntimeLoaded: vi.fn(),
      clearPromptVersion: vi.fn(),
      undoPromptEdit: vi.fn(() => false),
      redoPromptEdit: vi.fn(() => false),
      invalidatePromptEditHistory: vi.fn(),
      togglePromptModel: vi.fn(async () => undefined)
    },
    isEnqueueBusy: () => false,
    setEnqueueBusy: vi.fn(),
    setEnqueueBusyUi: vi.fn(),
    requestClearDraftConfirmation: vi.fn()
  } as unknown as CreatePageControllerOptions;
  return {
    state,
    root,
    options,
    patchDraft: options.patchDraft as ReturnType<typeof vi.fn>,
    patchDraftForMode,
    resolveBundled: () => resolveBundled?.(null)
  };
}

describe("creation model switching", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("keeps the selected Extend model instead of forcing the R2V Motion Context model", async () => {
    await loadPromptPacks();
    const { state, root, options, patchDraft, resolveBundled } = createControllerHarness();
    const cleanup: RendererCleanup = mountCreatePageController(options);
    const model = root.querySelector<HTMLSelectElement>("#model")!;

    model.value = "minimax_h3_fl2va";
    model.dispatchEvent(new Event("change", { bubbles: true }));
    expect(state.draft.modelId).toBe("minimax_h3_fl2va");
    resolveBundled();
    await Promise.resolve();

    expect(patchDraft).toHaveBeenCalledTimes(1);
    expect(state.videoExtensionDraft?.modelId).toBe("minimax_h3_fl2va");
    cleanup();
  });

  it("switches between the two H3 latent inputs while keeping both draft states in sync", async () => {
    await loadPromptPacks();
    const { state, root, options, resolveBundled } = createControllerHarness();
    const artifact = {
      payload: {
        filename: "h3av_payload.safetensors",
        subfolder: "h3-native-av",
        type: "output",
        absolutePath: "C:/history/h3-native-av/h3av_payload.safetensors"
      },
      manifest: {
        filename: "h3av_payload.json",
        subfolder: "h3-native-av",
        type: "output",
        absolutePath: "C:/history/h3-native-av/h3av_payload.json"
      }
    } as NonNullable<Draft["h3ContinuumArtifact"]>;
    const historyDraft = normalizeVideoDraft({
      ...state.draft,
      inputMode: "video",
      modelId: "minimax_h3_ref2va",
      sourceVideoPath: "C:/history/source.mp4",
      sourceVideoDuration: 8,
      h3LatentSaveMode: "all",
      h3SaveJointAv: true,
      h3ContextLatentPath: "C:/history/h3-motion-context/clip_00001.safetensors",
      h3ContinuumArtifactPath: artifact.payload.absolutePath,
      h3ContinuumArtifact: artifact
    });
    state.draft = structuredClone(historyDraft);
    state.videoExtensionDraft = structuredClone(historyDraft);
    const cleanup: RendererCleanup = mountCreatePageController(options);
    const model = root.querySelector<HTMLSelectElement>("#model")!;

    model.value = "minimax_h3_continuum";
    model.dispatchEvent(new Event("change", { bubbles: true }));
    expect(state.draft.modelId).toBe("minimax_h3_continuum");
    expect(state.videoExtensionDraft?.modelId).toBe("minimax_h3_continuum");
    expect(state.draft.h3ContextLatentPath).toBe(historyDraft.h3ContextLatentPath);
    expect(state.draft.h3ContinuumArtifactPath).toBe(historyDraft.h3ContinuumArtifactPath);

    model.value = "minimax_h3_ref2va";
    model.dispatchEvent(new Event("change", { bubbles: true }));
    expect(state.draft.modelId).toBe("minimax_h3_ref2va");
    expect(state.videoExtensionDraft?.modelId).toBe("minimax_h3_ref2va");
    expect(state.draft.h3ContextLatentPath).toBe(historyDraft.h3ContextLatentPath);
    expect(state.draft.h3ContinuumArtifactPath).toBe(historyDraft.h3ContinuumArtifactPath);
    expect(state.draft.h3ReferenceSlots[0]?.mediaPath).toBe("C:/history/source.mp4");

    resolveBundled();
    await Promise.resolve();
    cleanup();
  });

  it("switches the visible video draft even when the route mode is stale", async () => {
    await loadPromptPacks();
    const { state, root, options } = createControllerHarness("image-to-video");
    const patchDraftForMode = vi.fn((mode: "image-to-video" | "video-extension", update: (draft: Draft) => Partial<Draft>) => {
      patchCreationDraftForMode(
        state,
        "video",
        (draft) => normalizeVideoDraft({ ...draft, ...update(draft) }),
        mode === "image-to-video"
      );
    });
    options.patchDraftForMode = patchDraftForMode;
    const cleanup: RendererCleanup = mountCreatePageController(options);
    const model = root.querySelector<HTMLSelectElement>("#model")!;

    model.value = "minimax_h3_fl2va";
    model.dispatchEvent(new Event("change", { bubbles: true }));

    expect(state.draft.modelId).toBe("minimax_h3_fl2va");
    expect(state.videoExtensionDraft?.modelId).toBe("minimax_h3_fl2va");
    cleanup();
  });
});
