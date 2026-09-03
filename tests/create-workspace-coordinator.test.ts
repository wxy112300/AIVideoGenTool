// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultState } from "../src/core/defaults";
import { createPromptRuntimeState } from "../src/core/prompt-runtime-state";
import { createTranslator } from "../src/core/i18n";
import {
  createCreateWorkspaceCoordinator,
  type CreateWorkspaceCoordinatorDependencies
} from "../src/renderer/pages/create/coordinator";
import type { AppState, ComfyRuntimeState } from "../src/types";
import type { RendererContext } from "../src/renderer/contracts";

const runtime: ComfyRuntimeState = {
  phase: "ready",
  ownership: "app",
  endpoint: "http://127.0.0.1:8188",
  message: "ready",
  updatedAt: new Date(0).toISOString(),
  operationId: 1
};

function createCoordinatorHarness() {
  let currentState = createDefaultState();
  let creationMode: CreateWorkspaceCoordinatorDependencies["getCreationMode"] extends () => infer Mode ? Mode : never = "image-to-video";
  let page: CreateWorkspaceCoordinatorDependencies["getPage"] extends () => infer CurrentPage ? CurrentPage : never = "create";
  let enqueueBusy = false;
  const translator = createTranslator("zh-CN");
  const application = {
    saveDraft: vi.fn(async (_draft, _snapshots) => structuredClone(currentState)),
    saveImageDraft: vi.fn(async (_draft) => structuredClone(currentState)),
    getBundledWorkflow: vi.fn(async () => null),
    inspectWorkflow: vi.fn(async () => ({ supportsEndImage: false, supportsVideoExtension: false })),
    reportRendererError: vi.fn(async () => undefined)
  };
  const assets = {
    readImage: vi.fn(async () => null),
    readImageMarkup: vi.fn(async () => null),
    saveImageMarkup: vi.fn(),
    saveImageMask: vi.fn(),
    saveImageCrop: vi.fn()
  };
  const context = {
    root: document.createElement("div"),
    application,
    events: {},
    assets,
    hostCapabilities: {},
    enhancePrompt: vi.fn(async () => "enhanced"),
    getState: () => currentState,
    getRoute: () => ({ page, creationMode, historyKind: "video" as const }),
    getTranslator: () => translator,
    t: translator.t,
    requestRender: vi.fn(),
    navigate: vi.fn(),
    notify: vi.fn(),
    reportUserAction: vi.fn()
  } as unknown as RendererContext;
  const dependencies: CreateWorkspaceCoordinatorDependencies = {
    context,
    getState: () => currentState,
    getPage: () => page,
    getCreationMode: () => creationMode,
    setCreationMode: (mode) => {
      creationMode = mode;
    },
    getEnvironmentScan: () => null,
    getPerformanceMetrics: () => null,
    bundledWorkflows: {},
    workflowCapabilities: {},
    bundledWorkflowKey: (modelId, inputMode) => `${modelId}:${inputMode}`,
    setRendererState: (nextState: AppState) => {
      currentState = nextState;
    },
    addPageCleanup: vi.fn(),
    render: vi.fn(),
    getEnqueueBusy: () => enqueueBusy,
    setEnqueueBusy: (value) => {
      enqueueBusy = value;
    },
    requestClearDraftConfirmation: vi.fn(),
    promptRuntimeControlIcon: () => "play",
    promptRuntimeControlTitle: () => "Prompt",
    promptRuntimeView: () => ({
      left: { intent: "none", label: "Prompt", action: "none" },
      right: { intent: "none", label: "Prompt", action: "none" }
    }),
    promptOperationBelongsTo: () => false,
    getPromptStarting: () => false,
    getPromptReleasing: () => false,
    getPromptRuntimeLoaded: () => false,
    getPromptProgress: () => null,
    setPromptEnhancing: vi.fn(),
    setPromptRuntimeLoaded: vi.fn(),
    togglePromptModel: vi.fn(async () => undefined)
  };
  const coordinator = createCreateWorkspaceCoordinator(dependencies);
  return { coordinator, dependencies, application, assets, getState: () => currentState, setPage: (nextPage: typeof page) => { page = nextPage; } };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("create workspace coordinator", () => {
  it("keeps draft mutations local until the debounced owner persists them", async () => {
    const { coordinator, application, getState } = createCoordinatorHarness();

    coordinator.patchDraft({ duration: 8, seed: 42 });

    expect(getState().draft.duration).toBe(8);
    expect(getState().draft.seed).toBe(42);
    expect(coordinator.getDraftDirty()).toBe(true);
    expect(application.saveDraft).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(350);

    expect(application.saveDraft).toHaveBeenCalledTimes(1);
    expect(application.saveDraft.mock.calls[0]?.[0]).toMatchObject({ duration: 8, seed: 42 });
    expect(coordinator.getDraftDirty()).toBe(false);
    expect(coordinator.getDraftSaveInFlight()).toBe(0);
  });

  it("normalizes active and mode-specific video drafts as they are patched", () => {
    const { coordinator, getState } = createCoordinatorHarness();
    getState().videoExtensionDraft = {
      ...structuredClone(getState().draft),
      inputMode: "video"
    };

    coordinator.patchDraft({ fps: 12, frameInterpolation: "rife2x" });
    coordinator.patchDraftForMode("video-extension", () => ({
      modelId: "minimax_h3_ref2va",
      fps: 12,
      frameInterpolation: "rife4x"
    }));

    expect(getState().draft).toMatchObject({ fps: 24, frameInterpolation: "off" });
    expect(getState().imageToVideoDraft).toMatchObject({ fps: 24, frameInterpolation: "off" });
    expect(getState().videoExtensionDraft).toMatchObject({
      modelId: "minimax_h3_ref2va",
      fps: 24,
      frameInterpolation: "off"
    });
  });

  it("keeps image draft persistence and clearing separate from video snapshots", async () => {
    const { coordinator, application, getState } = createCoordinatorHarness();
    const originalVideoPrompt = getState().draft.promptVersions[0]?.text;

    coordinator.patchImageDraft({ outputCount: 3 });
    expect(getState().imageDraft.outputCount).toBe(3);
    expect(coordinator.getImageDraftDirty()).toBe(true);

    await vi.advanceTimersByTimeAsync(350);

    expect(application.saveImageDraft).toHaveBeenCalledTimes(1);
    expect(coordinator.getImageDraftDirty()).toBe(false);
    coordinator.clearDraft("image-edit");

    expect(getState().imageDraft.pictures).toEqual([]);
    expect(getState().draft.promptVersions[0]?.text).toBe(originalVideoPrompt);
    expect(coordinator.getImageDraftDirty()).toBe(true);
  });

  it("saves a history video as an immutable extension draft snapshot", async () => {
    const { coordinator, application, getState } = createCoordinatorHarness();

    await coordinator.selectDraftVideo("history.mp4", {
      assetId: "asset-1",
      versionId: "version-1",
      duration: 12,
      width: 1280,
      height: 720,
      resolution: 720,
      resetSeed: true
    });

    expect(application.saveDraft).toHaveBeenCalledTimes(1);
    expect(getState().draft.inputMode).toBe("video");
    expect(getState().draft.sourceVideoPath).toBe("history.mp4");
    expect(getState().draft.sourceAssetId).toBe("asset-1");
    expect(getState().draft.seed).toBeNull();
    expect(getState().videoExtensionDraft?.sourceVideoPath).toBe("history.mp4");
    expect(coordinator.getDraftDirty()).toBe(false);
  });
});
