// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { uiKeys } from "../src/core/i18n-keys";
import {
  createPromptRuntimeState,
  reducePromptRuntime
} from "../src/core/prompt-runtime-state";
import type {
  AppApi,
  AppState,
  ComfyRuntimeState,
  DependencyInstallProgress,
  HistoryMigrationProgress,
  ImageAssetLibraryProgress,
  PromptProgress,
  QueueTask,
  TaskPreview
} from "../src/types";
import {
  createRenderCoordinator,
  type RenderCoordinatorOptions
} from "../src/renderer/render-coordinator";
import {
  registerRendererEvents,
  type RendererEventOptions
} from "../src/renderer/state-events";
import type {
  CreationMode,
  HistoryKind,
  Page,
  RendererCleanup
} from "../src/renderer/contracts";
import { createRendererUiState } from "../src/renderer/ui-state";
import type { HistoryPlaybackSnapshot } from "../src/renderer/pages/history/page-controller";
import { createHistoryPerformanceFixture } from "./fixtures/history-performance";

type EventListener = (payload: unknown) => void;

const activeCleanups: Array<RendererCleanup> = [];

function createFakeStudio(overrides: Record<string, unknown> = {}): AppApi {
  const target = { ...overrides } as AppApi;
  return new Proxy(target, {
    get(current, property, receiver) {
      if (typeof property !== "string") return Reflect.get(current, property, receiver);
      if (property in current) return Reflect.get(current, property, receiver);
      return vi.fn(() => {
        throw new Error(`Unconfigured studio method: ${property}`);
      });
    }
  });
}

function eventStudio(listeners: Map<string, EventListener>): AppApi {
  const register = (channel: string) => (callback: EventListener): RendererCleanup => {
    listeners.set(channel, callback);
    return () => listeners.delete(channel);
  };
  return createFakeStudio({
    onStateChanged: register("state:changed"),
    onComfyRuntimeStateChanged: register("comfy-runtime:changed"),
    onPromptRuntimeStateChanged: register("prompt-runtime:changed"),
    onTaskPreview: register("task:preview"),
    onPromptProgress: register("prompt:progress"),
    onWindowCloseRequest: register("window:close-requested"),
    onAttentionInstallLog: register("attention-acceleration:log"),
    onDependencyInstallLog: register("dependency-install:log"),
    onHistoryMigrationProgress: register("history-migration:progress"),
    onImageAssetLibraryProgress: register("image-assets:progress"),
    reportRendererError: vi.fn(async () => undefined)
  });
}

function eventComfyRuntime(): ComfyRuntimeState {
  return {
    phase: "ready",
    ownership: "app",
    endpoint: "http://127.0.0.1:8188",
    message: "Fixture ComfyUI ready",
    updatedAt: new Date(0).toISOString(),
    operationId: 1
  };
}

function createEventHarness(initialPage: Page = "create") {
  const root = document.createElement("main");
  document.body.append(root);
  const listeners = new Map<string, EventListener>();
  let currentState = createDefaultState();
  let currentComfyRuntime = eventComfyRuntime();
  let currentPromptRuntime = createPromptRuntimeState();
  let currentPage = initialPage;
  let currentCreationMode: CreationMode = "image-to-video";
  let currentHistoryKind: HistoryKind = "video";
  let draftDirty = false;
  let draftSaveInFlight = 0;
  let imageDraftDirty = false;
  let imageDraftSaveInFlight = 0;
  let pendingDirectoryMigration = false;
  const requestRender = vi.fn();
  const requestOverlayRender = vi.fn();
  const setState = vi.fn((nextState: AppState) => {
    currentState = nextState;
  });
  const setPromptProgress = vi.fn();
  const setHistoryMigrationProgress = vi.fn();
  const setImageAssetLibraryProgress = vi.fn();
  const eventClient = eventStudio(listeners);
  const options: RendererEventOptions = {
    events: eventClient,
    application: eventClient,
    t: (key) => key,
    getState: () => currentState,
    getComfyRuntimeState: () => currentComfyRuntime,
    getEnvironmentScanning: () => false,
    setComfyRuntimeState: (next) => {
      currentComfyRuntime = next;
    },
    setPromptRuntimeState: (next) => {
      currentPromptRuntime = next;
    },
    getPromptRuntimeState: () => currentPromptRuntime,
    getCreationMode: () => currentCreationMode,
    setState,
    getPage: () => currentPage,
    getHistoryKind: () => currentHistoryKind,
    getDraftDirty: () => draftDirty,
    getDraftSaveInFlight: () => draftSaveInFlight,
    getImageDraftDirty: () => imageDraftDirty,
    getImageDraftSaveInFlight: () => imageDraftSaveInFlight,
    setPromptRuntimeLoaded: vi.fn(),
    setPromptProgress,
    rememberModalFocus: vi.fn(),
    setPendingWindowCloseRequest: vi.fn(),
    setWindowCloseResponseBusy: vi.fn(),
    setHistoryMigrationProgress,
    hasPendingDirectoryMigration: () => pendingDirectoryMigration,
    setImageAssetLibraryProgress,
    taskPreviews: {},
    appendAttentionAccelerationLog: vi.fn((message: string) => message),
    appendDependencyInstallLog: vi.fn((progress: DependencyInstallProgress) => progress.message),
    notify: vi.fn(),
    requestRender,
    requestOverlayRender
  };
  const cleanup = registerRendererEvents(options);
  activeCleanups.push(cleanup);

  return {
    root,
    options,
    cleanup,
    listeners,
    requestRender,
    requestOverlayRender,
    setState,
    setPromptProgress,
    setHistoryMigrationProgress,
    setImageAssetLibraryProgress,
    get state() {
      return currentState;
    },
    get promptRuntime() {
      return currentPromptRuntime;
    },
    set promptRuntime(next: typeof currentPromptRuntime) {
      currentPromptRuntime = next;
    },
    set page(next: Page) {
      currentPage = next;
    },
    set creationMode(next: CreationMode) {
      currentCreationMode = next;
    },
    set historyKind(next: HistoryKind) {
      currentHistoryKind = next;
    },
    set draftDirty(next: boolean) {
      draftDirty = next;
    },
    set draftSaveInFlight(next: number) {
      draftSaveInFlight = next;
    },
    set imageDraftDirty(next: boolean) {
      imageDraftDirty = next;
    },
    set imageDraftSaveInFlight(next: number) {
      imageDraftSaveInFlight = next;
    },
    set pendingDirectoryMigration(next: boolean) {
      pendingDirectoryMigration = next;
    },
    emit(channel: string, payload: unknown): void {
      listeners.get(channel)?.(payload);
    }
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function runningTask(id = "running-task"): QueueTask {
  return {
    id,
    taskType: "generation",
    status: "running",
    createdAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:01.000Z",
    outputFilename: "fixture.mp4",
    modelId: "minimax_h3_fl2va",
    workflowPath: "fixture-workflow.json",
    duration: 5,
    steps: 20,
    fps: 24,
    seed: 1,
    keepSeedOnCopy: false,
    attentionMode: "sage",
    spectrumMode: "off",
    spectrumModelAwareMode: "off",
    h3LivePreview: false,
    prompt: "fixture prompt",
    promptVersion: 0,
    h3ReferenceSlots: [],
    startImagePath: "",
    sourceWidth: 1024,
    sourceHeight: 576,
    endImagePath: "",
    endImageWidth: 0,
    endImageHeight: 0,
    ratio: "16:9",
    resolution: 480,
    frameInterpolation: "off",
    motion: "natural",
    videoLoras: [],
    progress: 20,
    stage: "准备任务",
    stageStartedAt: "2026-08-31T00:00:00.000Z",
    startedAt: "2026-08-31T00:00:00.000Z"
  } as QueueTask;
}

function configureRunningQueue(harness: ReturnType<typeof createEventHarness>): QueueTask {
  const task = runningTask();
  harness.state.queue = [task];
  harness.state.queueRunning = true;
  harness.state.queueStartedAt = "2026-08-31T00:00:00.000Z";
  harness.state.queueLifecycle = "running";
  harness.state.queueLifecycleTaskId = task.id;
  harness.state.queueLifecycleStartedAt = "2026-08-31T00:00:00.000Z";
  return task;
}

function mountQueueLiveShell(root: HTMLElement): void {
  root.innerHTML = `
    <span id="queue-active-count"></span>
    <span id="queue-comfy-status"></span>
    <div id="queue-operation-status"><span id="queue-operation-message"></span></div>
    <span id="queue-eta"></span>
    <div id="queue-run-summary"><span id="queue-runtime-elapsed"></span></div>
    <span id="running-elapsed"></span>
    <span id="running-stage-elapsed"></span>
    <span id="running-eta"></span>
    <span id="running-work-progress" hidden></span>
    <span id="running-progress-label"></span>
    <div id="running-progress-bar" role="progressbar"><span></span></div>
    <span id="running-stage"></span>
  `;
}

function promptRuntimeInProgress() {
  const operationId = "prompt-operation-1";
  let state = createPromptRuntimeState();
  state = reducePromptRuntime(state, {
    type: "begin-operation",
    operationId,
    origin: "image-to-video",
    startedAt: 100,
    retainModel: false,
    phase: "submitting"
  });
  return reducePromptRuntime(state, {
    type: "operation-phase",
    operationId,
    phase: "running"
  });
}

afterEach(() => {
  activeCleanups.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

beforeEach(() => {
  const currentCss = (globalThis as typeof globalThis & {
    CSS?: { escape?: (value: string) => string };
  }).CSS;
  if (!currentCss?.escape) {
    vi.stubGlobal("CSS", {
      ...(currentCss ?? {}),
      escape: (value: string) => value
    });
  }
});

describe("renderer boundary characterization", () => {
  it("makes every unconfigured fake studio method fail loudly", async () => {
    const studio = createFakeStudio({
      readImage: vi.fn(async () => "fixture-data-url")
    });

    expect(() => studio.getState()).toThrowError("Unconfigured studio method: getState");
    expect(() => studio.readImageMarkup("missing.json")).toThrowError(
      "Unconfigured studio method: readImageMarkup"
    );
    await expect(studio.readImage("fixture.png")).resolves.toBe("fixture-data-url");
  });

  it("registers every renderer event through the events dependency and cleans them up", () => {
    const harness = createEventHarness();

    expect(harness.listeners.size).toBe(10);

    harness.cleanup();

    expect(harness.listeners.size).toBe(0);
  });

  it("patches stable Queue volatility in place and protects active input/draft saves", () => {
    const queue = createEventHarness("queue");
    const task = configureRunningQueue(queue);
    mountQueueLiveShell(queue.root);
    const next = clone(queue.state);
    const nextTask = next.queue[0]!;
    nextTask.progress = 67;
    nextTask.stage = "渲染关键帧";
    nextTask.workProgress = {
      value: 4,
      max: 20,
      unit: "step",
      startedAt: "2026-08-31T00:00:00.000Z",
      sampledAt: "2026-08-31T00:04:20.000Z"
    };
    nextTask.updatedAt = "2026-08-31T00:00:02.000Z";

    queue.emit("state:changed", next);

    expect(queue.setState).toHaveBeenCalledTimes(1);
    expect(queue.requestRender).not.toHaveBeenCalled();
    expect(queue.root.querySelector("#running-progress-label")?.textContent).toBe("67%");
    expect(queue.root.querySelector("#running-stage")?.textContent).toBe("渲染关键帧");
    expect(queue.root.querySelector("#running-work-progress")?.textContent).toBe(uiKeys.queue.card.workProgress);
    expect(queue.root.querySelector<HTMLElement>("#running-work-progress")?.hidden).toBe(false);
    expect(queue.root.querySelector("#running-progress-bar")?.style.width).toBe("67%");
    expect(queue.state.queue[0]?.id).toBe(task.id);

    const input = document.createElement("textarea");
    input.id = "prompt-input";
    input.value = "keep this selection";
    queue.root.replaceChildren(input);
    input.focus();
    input.setSelectionRange(5, 9, "forward");
    queue.page = "create";
    const inputUpdate = clone(queue.state);
    inputUpdate.draft.promptVersions[0]!.text += " external update";
    queue.emit("state:changed", inputUpdate);

    expect(queue.requestRender).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(5);
    expect(input.selectionEnd).toBe(9);
    expect(input.selectionDirection).toBe("forward");

    queue.draftSaveInFlight = 1;
    const saveUpdate = clone(queue.state);
    saveUpdate.settings.uiLocale = "en-US";
    queue.emit("state:changed", saveUpdate);
    expect(queue.requestRender).not.toHaveBeenCalled();
  });

  it("skips unchanged visible History content and falls back to a full render when it changes", () => {
    const history = createEventHarness("history");
    const fixture = createHistoryPerformanceFixture(1);
    history.state.history = fixture.videos;
    history.state.imageHistory = fixture.images;
    const curationOnly = clone(history.state);
    curationOnly.history[0]!.favorite = !curationOnly.history[0]!.favorite;

    history.emit("state:changed", curationOnly);

    expect(history.requestRender).not.toHaveBeenCalled();

    const contentChanged = clone(curationOnly);
    contentChanged.history[0]!.updatedAt = "2026-08-31T00:00:03.000Z";
    history.emit("state:changed", contentChanged);

    expect(history.requestRender).toHaveBeenCalledTimes(1);
  });

  it("falls back to a full Queue render when a stable live patch target is absent", () => {
    const queue = createEventHarness("queue");
    configureRunningQueue(queue);
    const next = clone(queue.state);
    next.queue[0]!.progress = 40;

    queue.emit("state:changed", next);

    expect(queue.requestRender).toHaveBeenCalledTimes(1);
  });

  it("keeps preview, prompt progress, install logs, migration, and asset progress local", () => {
    const harness = createEventHarness("queue");
    const task = configureRunningQueue(harness);
    harness.root.innerHTML = `
      <img data-live-preview-image="${task.id}" style="display:none">
      <span data-live-preview-indicator="${task.id}" style="display:none"></span>
      <span data-live-preview-spinner="${task.id}"></span>
      <span data-live-preview-empty="${task.id}"></span>
      <div id="attention-install-log-details"><div id="attention-install-log"></div></div>
      <div id="attention-install-progress"><div class="progress"><span></span></div></div>
      <span id="attention-install-stage"></span>
      <div data-dependency-install-log="custom-node:node-1"></div>
      <div data-confirmation-dependency-log="custom-node:node-1"></div>
      <span id="image-assets-progress-message"></span>
      <div id="image-assets-progress" role="progressbar"><span></span></div>
      <span id="image-assets-progress-phase"></span>
      <span id="image-assets-progress-count"></span>
      <button id="enhance-prompt" aria-busy="false">
        <span data-prompt-progress-label></span>
        <span data-prompt-progress-bar></span>
      </button>
      <span data-prompt-progress-tooltip></span>
    `;

    const preview: TaskPreview = {
      taskId: task.id,
      dataUrl: "data:image/png;base64,fixture",
      source: "h3-tae",
      step: 3,
      totalSteps: 10
    };
    harness.emit("task:preview", preview);
    const previewImage = harness.root.querySelector<HTMLImageElement>("[data-live-preview-image]");
    expect(previewImage?.src).toContain("data:image/png;base64,fixture");
    expect(previewImage?.dataset.livePreviewActive).toBe("true");
    expect(harness.requestRender).not.toHaveBeenCalled();

    harness.page = "create";
    harness.creationMode = "image-to-video";
    harness.promptRuntime = promptRuntimeInProgress();
    const promptProgress: PromptProgress = {
      operationId: "prompt-operation-1",
      origin: "image-to-video",
      status: "running",
      stage: "generating",
      progress: 42,
      startedAt: 100,
      elapsedMs: 1_200,
      modelId: "fixture-prompt-model"
    };
    harness.emit("prompt:progress", promptProgress);
    expect(harness.setPromptProgress).toHaveBeenCalledWith(promptProgress);
    expect(harness.root.querySelector("[data-prompt-progress-label]")?.textContent).toBe("00:01");
    expect(harness.root.querySelector("[data-prompt-progress-bar]")?.getAttribute("style")).toContain("42%");
    expect(harness.requestRender).not.toHaveBeenCalled();

    harness.emit("attention-acceleration:log", "下载进度：42%");
    expect(harness.root.querySelector("#attention-install-stage")?.textContent).toBe("下载进度：42%");
    expect(harness.root.querySelector("#attention-install-progress")?.getAttribute("hidden")).toBeNull();
    expect(harness.root.querySelector("#attention-install-progress .progress")?.getAttribute("aria-valuenow")).toBe("42");
    expect(harness.root.querySelector("#attention-install-progress .progress span")?.getAttribute("style")).toContain("42%");

    const dependencyProgress: DependencyInstallProgress = {
      kind: "custom-node",
      id: "node-1",
      message: "正在安装 fixture node"
    };
    harness.emit("dependency-install:log", dependencyProgress);
    expect(harness.root.querySelector("[data-dependency-install-log]")?.textContent).toBe(dependencyProgress.message);
    expect(harness.root.querySelector("[data-confirmation-dependency-log]")?.textContent).toBe(dependencyProgress.message);

    const migrationProgress: HistoryMigrationProgress = {
      phase: "moving",
      current: 2,
      total: 4,
      message: "正在迁移",
      migratedFiles: 2,
      warningCount: 0
    };
    harness.emit("history-migration:progress", migrationProgress);
    expect(harness.setHistoryMigrationProgress).toHaveBeenCalledWith(migrationProgress);
    expect(harness.requestOverlayRender).not.toHaveBeenCalled();
    harness.pendingDirectoryMigration = true;
    harness.emit("history-migration:progress", migrationProgress);
    expect(harness.requestOverlayRender).toHaveBeenCalledTimes(1);

    const assetProgress: ImageAssetLibraryProgress = {
      phase: "scanning",
      current: 2,
      total: 4,
      message: "正在扫描素材"
    };
    harness.emit("image-assets:progress", assetProgress);
    expect(harness.setImageAssetLibraryProgress).toHaveBeenCalledWith(assetProgress);
    expect(harness.root.querySelector("#image-assets-progress-message")?.textContent).toBe(assetProgress.message);
    expect(harness.root.querySelector("#image-assets-progress")?.getAttribute("aria-valuenow")).toBe("13");
    expect(harness.root.querySelector("#image-assets-progress span")?.getAttribute("style")).toContain("13%");
    expect(harness.root.querySelector("#image-assets-progress-count")?.textContent).toBe("2 / 4");
    expect(harness.requestRender).not.toHaveBeenCalled();
  });

  it("restores focus/playback and registers page cleanup across a full render", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const oldInput = document.createElement("input");
    oldInput.id = "history-detail-title";
    oldInput.value = "hello";
    root.append(oldInput);
    const oldPlayer = document.createElement("div");
    oldPlayer.className = "history-player";
    const oldVideo = document.createElement("video");
    oldVideo.dataset.historyAsset = "asset-1";
    oldVideo.dataset.historyVersion = "version-1";
    oldVideo.src = "old.mp4";
    oldPlayer.append(oldVideo);
    root.append(oldPlayer);
    oldInput.focus();
    oldInput.setSelectionRange(1, 4, "forward");
    Object.defineProperties(oldVideo, {
      currentTime: { configurable: true, value: 12 },
      paused: { configurable: true, value: false },
      muted: { configurable: true, writable: true, value: true },
      volume: { configurable: true, writable: true, value: 0.42 },
      playbackRate: { configurable: true, writable: true, value: 1.25 }
    });
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const load = vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const beforeRenderHistory = vi.fn();
    const bindHistory = vi.fn();
    const viewportCleanup = vi.fn();
    let registeredCleanup: RendererCleanup | undefined;
    const state = createDefaultState();
    const ui = createRendererUiState();
    const options: RenderCoordinatorOptions = {
      root,
      addPageCleanup: (cleanup) => {
        registeredCleanup = cleanup;
      },
      getPage: () => "history-detail",
      getState: () => state,
      getUiState: () => ui,
      getPerformanceMetrics: () => null,
      t: ((key: string) => key) as RenderCoordinatorOptions["t"],
      renderPages: {
        create: () => "",
        queue: () => "",
        history: () => "",
        historyDetail: () => `
          <input id="history-detail-title" value="hello">
          <div class="history-player">
            <video data-history-asset="asset-1" data-history-version="version-1" src="next.mp4"></video>
          </div>
        `,
        imageHistoryDetail: () => "",
        settings: () => ""
      },
      beforeRenderHistory,
      closeAppLogContextMenu: vi.fn(),
      bindShell: vi.fn(),
      renderOverlay: vi.fn(),
      beforeRenderQueue: vi.fn(),
      bindCreate: vi.fn(),
      bindQueue: vi.fn(),
      bindHistory,
      bindHistoryNavigation: () => () => undefined,
      bindSettings: vi.fn(),
      bindHistoryViewportControls: () => viewportCleanup,
      restoreQueueScrollPosition: vi.fn(),
      restoreHistoryScrollPosition: vi.fn(),
      ensurePromptPacks: vi.fn(async () => undefined),
      syncAppLogPolling: vi.fn(),
      icon: () => "",
      escapeHtml: (value: unknown) => String(value)
    };

    createRenderCoordinator(options).render();
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

    const restoredInput = root.querySelector<HTMLInputElement>("#history-detail-title");
    const restoredVideo = root.querySelector<HTMLVideoElement>(".history-player video");
    expect(restoredInput).not.toBeNull();
    expect(document.activeElement).toBe(restoredInput);
    expect(restoredInput?.selectionStart).toBe(1);
    expect(restoredInput?.selectionEnd).toBe(4);
    expect(restoredInput?.selectionDirection).toBe("forward");
    expect(oldVideo.getAttribute("src")).toBeNull();
    expect(pause).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
    expect(beforeRenderHistory).toHaveBeenCalledTimes(1);
    expect(bindHistory).toHaveBeenCalledWith(expect.objectContaining<HistoryPlaybackSnapshot>({
      assetId: "asset-1",
      versionId: "version-1",
      currentTime: 12,
      muted: true,
      volume: 0.42,
      playbackRate: 1.25,
      paused: false
    }));
    expect(registeredCleanup).toBeTypeOf("function");
    registeredCleanup?.();
    expect(viewportCleanup).toHaveBeenCalledTimes(1);

    if (!restoredVideo) throw new Error("restored video was not created");
    Object.defineProperties(restoredVideo, {
      readyState: { configurable: true, value: 1 },
      duration: { configurable: true, value: 60 },
      currentTime: { configurable: true, writable: true, value: 0 },
      muted: { configurable: true, writable: true, value: false },
      volume: { configurable: true, writable: true, value: 1 },
      playbackRate: { configurable: true, writable: true, value: 1 }
    });
    restoredVideo.dispatchEvent(new Event("loadedmetadata"));
    await Promise.resolve();
    expect(restoredVideo.volume).toBeCloseTo(0.42);
    expect(restoredVideo.muted).toBe(true);
    expect(restoredVideo.currentTime).toBeCloseTo(12);
    expect(restoredVideo.playbackRate).toBeCloseTo(1.25);
    expect(play).toHaveBeenCalledTimes(1);
  });
});
