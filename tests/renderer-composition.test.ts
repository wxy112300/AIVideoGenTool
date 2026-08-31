// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { motionContextMaxDurationSeconds } from "../src/core/workflow";
import { createTranslator } from "../src/core/i18n";
import {
  createQueueWorkspaceCoordinator,
  createRendererNavigation
} from "../src/renderer/composition";
import { createRendererUiState } from "../src/renderer/ui-state";
import type {
  AppState,
  Draft,
  ImageGenerationQueueTask,
  QueueTask,
  UpscaleQueueTask
} from "../src/types";
import type { RendererContext } from "../src/renderer/contracts";

const translator = createTranslator("zh-CN");

function queueGenerationTask(): QueueTask {
  return {
    id: "queue-task-1",
    taskType: "generation",
    status: "waiting",
    createdAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:00.000Z",
    outputFilename: "queue-task-1.mp4",
    modelId: "minimax_h3_fl2va",
    workflowPath: "workflow.json",
    prompt: "queue prompt",
    promptVersion: 1,
    h3ReferenceSlots: [],
    startImagePath: "C:/input/start.png",
    sourceWidth: 1280,
    sourceHeight: 720,
    endImagePath: "",
    ratio: "source",
    resolution: 720,
    duration: 7,
    steps: 20,
    fps: 24,
    frameInterpolation: "off",
    motion: "natural",
    seed: 42,
    keepSeedOnCopy: false
  } as QueueTask;
}

function createQueueHarness() {
  let currentState = createDefaultState();
  const ui = createRendererUiState();
  const savedDrafts: Draft[] = [];
  const application = {
    saveImageDraft: vi.fn(async () => currentState),
    removeTask: vi.fn(async () => currentState)
  };
  const context = {
    root: document.createElement("main"),
    application,
    events: {},
    assets: {},
    hostCapabilities: {},
    enhancePrompt: vi.fn(async () => ""),
    getState: () => currentState,
    getRoute: () => ({ page: "queue" as const, creationMode: "image-to-video" as const, historyKind: "video" as const }),
    getTranslator: () => translator,
    t: translator.t,
    requestRender: vi.fn(),
    navigate: vi.fn(),
    notify: vi.fn(),
    reportUserAction: vi.fn()
  } as unknown as RendererContext;
  const render = vi.fn();
  const renderOverlay = vi.fn();
  const rememberModalFocus = vi.fn();
  const navigateToCreationMode = vi.fn();
  const coordinator = createQueueWorkspaceCoordinator({
    context,
    application,
    ui,
    getState: () => currentState,
    setState: (nextState: AppState) => {
      currentState = nextState;
    },
    render,
    renderOverlay,
    rememberModalFocus,
    saveDraftImmediately: vi.fn(async (draft: Draft) => {
      savedDrafts.push(draft);
      currentState = { ...currentState, draft };
    }),
    navigateToCreationMode
  });
  return {
    application,
    context,
    coordinator,
    currentState: () => currentState,
    navigateToCreationMode,
    render,
    renderOverlay,
    rememberModalFocus,
    savedDrafts,
    ui
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("renderer composition", () => {
  it("normalizes Motion Context duration while navigating to creation", () => {
    const state = createDefaultState();
    state.draft.duration = 15;
    state.draft.modelId = "minimax_h3_ref2va";
    const ui = createRendererUiState();
    const setCreationMode = vi.fn();
    const setPage = vi.fn();
    const patchDraft = vi.fn();
    const render = vi.fn();
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const navigation = createRendererNavigation({
      getState: () => state,
      ui,
      setCreationMode,
      setPage,
      patchDraft,
      render
    });

    navigation.navigateToCreationMode("video-extension");

    expect(patchDraft).toHaveBeenCalledWith({ duration: motionContextMaxDurationSeconds() });
    expect(setCreationMode).toHaveBeenCalledWith("video-extension");
    expect(setPage).toHaveBeenCalledWith("create");
    expect(ui.historyForwardTarget).toBeNull();
    expect(render).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
  });

  it("owns queue confirmation and action busy state", () => {
    const harness = createQueueHarness();
    harness.currentState().queue = [queueGenerationTask()];

    harness.coordinator.setActionBusy({ taskId: "queue-task-1", action: "edit" });
    expect(harness.coordinator.getActionBusy()).toEqual({ taskId: "queue-task-1", action: "edit" });

    harness.coordinator.requestConfirmation("queue-task-1", "remove");

    expect(harness.rememberModalFocus).toHaveBeenCalledTimes(1);
    expect(harness.renderOverlay).toHaveBeenCalledTimes(1);
    expect(harness.ui.pendingConfirmation).toEqual({
      kind: "remove-queue-task",
      taskId: "queue-task-1",
      title: "queue-task-1.mp4"
    });
    expect(harness.ui.confirmationBusy).toBe(false);
  });

  it("returns a queued generation to Create and clears the edit action", async () => {
    const harness = createQueueHarness();
    harness.currentState().queue = [queueGenerationTask()];

    await harness.coordinator.editTask("queue-task-1");

    expect(harness.render).toHaveBeenCalledTimes(1);
    expect(harness.savedDrafts[0]).toMatchObject({
      inputMode: "image",
      startImagePath: "C:/input/start.png",
      sourceWidth: 1280,
      sourceHeight: 720,
      duration: 7,
      seed: 42
    });
    expect(harness.application.removeTask).toHaveBeenCalledWith("queue-task-1");
    expect(harness.navigateToCreationMode).toHaveBeenCalledWith("image-to-video");
    expect(harness.coordinator.getActionBusy()).toBeNull();
    expect(harness.context.notify).toHaveBeenCalled();
  });

  it("returns a queued image generation to image edit", async () => {
    const harness = createQueueHarness();
    const task = {
      id: "image-task-1",
      taskType: "image-generation",
      status: "waiting",
      createdAt: "2026-08-31T00:00:00.000Z",
      updatedAt: "2026-08-31T00:00:00.000Z",
      outputFilename: "image-task-1.png",
      modelId: "qwen-image-edit-2511",
      workflowPath: "image-workflow.json",
      projectId: "project-1",
      pictures: [],
      prompt: "image prompt",
      promptVersion: 1,
      qualityProfile: "balanced-20",
      outputFormat: "png",
      outputCount: 1,
      runs: [{ seed: 42 }]
    } as ImageGenerationQueueTask;
    harness.currentState().queue = [task];

    await harness.coordinator.editTask("image-task-1");

    expect(harness.application.saveImageDraft).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project-1", promptVersions: expect.any(Array) })
    );
    expect(harness.application.removeTask).toHaveBeenCalledWith("image-task-1");
    expect(harness.navigateToCreationMode).toHaveBeenCalledWith("image-edit");
    expect(harness.coordinator.getActionBusy()).toBeNull();
  });

  it("opens a completed upscale task in replace mode", () => {
    const harness = createQueueHarness();
    const task = {
      id: "upscale-task-1",
      taskType: "upscale",
      status: "completed",
      createdAt: "2026-08-31T00:00:00.000Z",
      updatedAt: "2026-08-31T00:00:00.000Z",
      outputFilename: "upscale.mp4",
      modelId: "seedvr2",
      workflowPath: "upscale.json",
      duration: 4,
      steps: 8,
      fps: 24,
      seed: 42,
      keepSeedOnCopy: false,
      sourceAssetId: "asset-1",
      sourceVersionId: "version-1",
      sourceFilePath: "C:/input/source.mp4",
      sourceFilename: "source.mp4",
      sourceWidth: 640,
      sourceHeight: 360,
      targetWidth: 1280,
      targetHeight: 720,
      tileMode: "safe",
      faceRestore: false
    } as UpscaleQueueTask;

    harness.coordinator.editUpscaleTask(task);

    expect(harness.ui.upscaleDialog).toEqual({
      replaceTaskId: "upscale-task-1",
      assetId: "asset-1",
      versionId: "version-1",
      targetHeight: 720,
      modelId: "seedvr2",
      tileMode: "safe"
    });
    expect(harness.renderOverlay).toHaveBeenCalledTimes(1);
  });
});
