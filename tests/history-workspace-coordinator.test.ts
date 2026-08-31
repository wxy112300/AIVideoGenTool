// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { createTranslator } from "../src/core/i18n";
import type {
  AssetVersion,
  HistoryAsset,
  ImageAssetVersion,
  ImageHistoryProject
} from "../src/types";
import type {
  HistoryKind,
  Page,
  RendererContext
} from "../src/renderer/contracts";
import {
  createHistoryWorkspaceCoordinator,
  type HistoryWorkspaceCoordinatorDependencies
} from "../src/renderer/pages/history/coordinator";

const translator = createTranslator("zh-CN");

function videoVersion(id: string, createdAt: string): AssetVersion {
  return {
    id,
    kind: "original",
    createdAt,
    outputFilename: `${id}.mp4`,
    modelId: "minimax_h3_fl2va",
    width: 1280,
    height: 720,
    duration: 4,
    fps: 24,
    workflowPath: "workflow.json",
    comfyPromptId: `${id}-prompt`,
    comfyOutputs: {},
    files: [{ filename: `${id}.mp4`, subfolder: "", type: "output" }]
  };
}

function videoAsset(id: string, updatedAt: string): HistoryAsset {
  const version = videoVersion(`${id}-version`, updatedAt);
  return {
    mediaKind: "video",
    id,
    taskId: `${id}-task`,
    title: id,
    outputFilename: version.outputFilename,
    createdAt: updatedAt,
    updatedAt,
    modelId: "minimax_h3_fl2va",
    favorite: false,
    rating: null,
    tags: [],
    duration: version.duration,
    resolution: 720,
    fps: version.fps,
    prompt: "test prompt",
    seed: 42,
    comfyPromptId: version.comfyPromptId,
    comfyOutputs: {},
    files: version.files,
    defaultVersionId: version.id,
    versions: [version]
  };
}

function imageVersion(id: string, versionNumber: number, createdAt: string): ImageAssetVersion {
  return {
    id,
    versionNumber,
    kind: versionNumber === 0 ? "source" : "edit",
    createdAt,
    modelId: "qwen-image-edit",
    workflowPath: "image-workflow.json",
    prompt: "image prompt",
    promptVersion: 0,
    references: [],
    width: 1024,
    height: 1024,
    format: "png",
    file: { filename: `${id}.png`, subfolder: "", type: "output" }
  };
}

function imageProject(id: string, updatedAt: string): ImageHistoryProject {
  const version = imageVersion(`${id}-version`, 1, updatedAt);
  return {
    mediaKind: "image",
    id,
    title: id,
    createdAt: updatedAt,
    updatedAt,
    favorite: false,
    rating: null,
    tags: [],
    coverMode: "auto",
    nextVersionNumber: 2,
    versions: [version]
  };
}

function createCoordinatorHarness() {
  let currentState = createDefaultState();
  let currentPage: Page = "history";
  let currentHistoryKind: HistoryKind = "video";
  const root = document.createElement("main");
  const application = {
    updateHistoryMetadata: vi.fn(async () => structuredClone(currentState))
  };
  const context = {
    root,
    application,
    events: {},
    assets: {},
    hostCapabilities: {},
    getState: () => currentState,
    getRoute: () => ({
      page: currentPage,
      creationMode: "image-to-video" as const,
      historyKind: currentHistoryKind
    }),
    getTranslator: () => translator,
    t: translator.t,
    requestRender: vi.fn(),
    navigate: vi.fn(),
    notify: vi.fn(),
    reportUserAction: vi.fn()
  } as unknown as RendererContext;
  const dependencies: HistoryWorkspaceCoordinatorDependencies = {
    context,
    ui: {
      appVersion: "",
      flashMessage: "",
      flashNotification: null,
      flashNotificationQueue: [],
      nextFlashNotificationId: 1,
      flashMessageTimer: undefined,
      selectedHistoryAssetId: "",
      selectedHistoryVersionId: "",
      historyFilter: {
        query: "",
        modelIds: [],
        favoriteOnly: false,
        minRating: null,
        tags: [],
        minDuration: null,
        sort: "newest"
      },
      historyFilterPanelOpen: false,
      historyForwardTarget: null,
      upscaleDialog: null,
      pendingConfirmation: null,
      confirmationBusy: false,
      pendingDirectoryMigration: null,
      directoryMigrationBusy: false,
      historyMigrationProgress: null,
      imageAssetLibraryDialog: null,
      imageAssetLibraryProgress: null,
      enqueueBusy: false,
      modalReturnFocus: null,
      modalInitialFocusPending: false,
      modalControlFocusSelector: "",
      pendingWindowCloseRequest: null,
      windowCloseResponseBusy: false
    },
    getState: () => currentState,
    getPage: () => currentPage,
    setPage: (nextPage) => {
      currentPage = nextPage;
    },
    getHistoryKind: () => currentHistoryKind,
    setHistoryKind: (nextKind) => {
      currentHistoryKind = nextKind;
    },
    setState: (nextState) => {
      currentState = nextState;
    },
    addPageCleanup: vi.fn(),
    render: vi.fn(),
    reportUserAction: vi.fn(),
    rememberModalFocus: vi.fn(),
    restoreModalFocus: vi.fn(),
    bindModalFocus: vi.fn(),
    renderOverlay: vi.fn(),
    saveDraftImmediately: vi.fn(async () => undefined),
    selectDraftVideo: vi.fn(async () => undefined),
    navigateToCreationMode: vi.fn()
  };
  const coordinator = createHistoryWorkspaceCoordinator(dependencies);
  return {
    coordinator,
    dependencies,
    getState: () => currentState,
    setPage: (nextPage: Page) => {
      currentPage = nextPage;
    },
    getPage: () => currentPage,
    getHistoryKind: () => currentHistoryKind
  };
}

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("history workspace coordinator", () => {
  it("selects a video detail version and navigates through filtered history", () => {
    const harness = createCoordinatorHarness();
    harness.getState().history = [
      videoAsset("older", "2026-08-30T10:00:00.000Z"),
      videoAsset("newer", "2026-08-31T10:00:00.000Z")
    ];

    harness.coordinator.openHistoryDetail("newer", "newer-version");

    expect(harness.getPage()).toBe("history-detail");
    expect(harness.getHistoryKind()).toBe("video");
    expect(harness.dependencies.ui.selectedHistoryAssetId).toBe("newer");
    expect(harness.dependencies.ui.selectedHistoryVersionId).toBe("newer-version");
    expect(harness.dependencies.ui.historyForwardTarget).toEqual({
      assetId: "newer",
      versionId: "newer-version"
    });

    harness.coordinator.navigateHistoryDetail(1);

    expect(harness.dependencies.ui.selectedHistoryAssetId).toBe("older");
    expect(harness.dependencies.ui.selectedHistoryVersionId).toBe("older-version");
    expect(harness.dependencies.render).toHaveBeenCalledTimes(2);
  });

  it("switches to image detail and restores the last image target from history", () => {
    const harness = createCoordinatorHarness();
    harness.getState().imageHistory = [
      imageProject("image-project", "2026-08-31T11:00:00.000Z")
    ];

    harness.coordinator.openImageHistoryDetail("image-project", "image-project-version");

    expect(harness.getPage()).toBe("image-history-detail");
    expect(harness.getHistoryKind()).toBe("image");
    expect(harness.dependencies.ui.selectedHistoryAssetId).toBe("image-project");
    expect(harness.dependencies.ui.selectedHistoryVersionId).toBe("image-project-version");

    harness.coordinator.returnToHistory();
    expect(harness.getPage()).toBe("history");
    harness.coordinator.returnToLastHistoryDetail();

    expect(harness.getPage()).toBe("image-history-detail");
    expect(harness.dependencies.ui.selectedHistoryAssetId).toBe("image-project");
    expect(harness.dependencies.ui.selectedHistoryVersionId).toBe("image-project-version");
  });

  it("navigates image projects and clears a stale forward target", () => {
    const harness = createCoordinatorHarness();
    harness.getState().imageHistory = [
      imageProject("older-image", "2026-08-30T10:00:00.000Z"),
      imageProject("newer-image", "2026-08-31T10:00:00.000Z")
    ];
    harness.coordinator.openImageHistoryDetail("newer-image");
    harness.coordinator.navigateImageHistoryDetail(1);

    expect(harness.dependencies.ui.selectedHistoryAssetId).toBe("older-image");
    expect(harness.getPage()).toBe("image-history-detail");

    harness.coordinator.returnToHistory();
    harness.dependencies.ui.historyForwardTarget = {
      assetId: "missing-image",
      versionId: "missing-version"
    };
    harness.coordinator.returnToLastHistoryDetail();

    expect(harness.dependencies.ui.historyForwardTarget).toBeNull();
    expect(harness.getPage()).toBe("history");
  });
});
