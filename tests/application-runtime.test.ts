import { describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import type { AppState, Settings } from "../src/types";
import { createStudioEventBus } from "../electron/services/studio-event-bus";
import {
  ApplicationRuntime,
  type ApplicationRuntimeDependencies
} from "../electron/application-runtime";
import type { HistoryFileSystemPort } from "../electron/ports/history-file-system";
import type { ImageInspectionPort } from "../electron/ports/image-inspection";
import type { StateRepository } from "../electron/ports/state-repository";
import type { AppLogger } from "../src/infrastructure/app-logger";
import { ComfyRuntimeStateController } from "../src/infrastructure/comfy-runtime-state";
import { PromptRuntimeManager } from "../electron/services/prompt-runtime-manager";
import type { StudioPaths } from "../electron/services/studio-paths";

function repository(initial: AppState, steps: string[]): StateRepository {
  let state = structuredClone(initial);
  return {
    load: async () => {
      steps.push("store.load");
      return structuredClone(state);
    },
    get: () => structuredClone(state),
    getSettings: () => structuredClone(state.settings),
    update: async (mutator) => {
      mutator(state);
      return structuredClone(state);
    }
  };
}

function paths(): StudioPaths {
  return {
    userDataDirectory: "C:/Studio",
    stateFile: "C:/Studio/studio-state.json",
    historyCoverDirectory: "C:/Studio/history-covers/v3",
    videoHistoryMigrationJournal: "C:/Studio/video-history-migration.json",
    imageGuidesDirectory: "C:/Studio/image-guides",
    imageMasksDirectory: "C:/Studio/image-masks",
    imageCropsDirectory: "C:/Studio/image-crops",
    clipboardInputsDirectory: "C:/Studio/clipboard-inputs",
    clipboardFilesDirectory: "C:/Studio/clipboard-files"
  };
}

function fileSystem(): HistoryFileSystemPort {
  return {
    stat: async () => null,
    readText: async () => "",
    writeFile: async () => undefined,
    makeDirectory: async () => undefined,
    rename: async () => undefined,
    unlink: async () => undefined,
    remove: async () => undefined
  };
}

function runtimeFixture() {
  const steps: string[] = [];
  const state = createDefaultState();
  state.settings = {
    ...state.settings,
    imageInputLibraryDirectory: "C:/Studio/input"
  };
  const store = repository(state, steps);
  const runtimeState = new ComfyRuntimeStateController();
  const promptRuntimeManager = new PromptRuntimeManager(runtimeState.snapshot());
  const log = {
    debug: vi.fn(),
    info: vi.fn((scope: string, event: string) => {
      steps.push(`${scope}.${event}`);
    }),
    warn: vi.fn(),
    error: vi.fn()
  };
  const sendState = vi.fn();
  const forceStopComfyProcesses = vi.fn(async () => ({ ok: true, message: "stopped" }));
  const promptRelease = vi.fn(async () => 0);
  const alignRuntimeProfile = vi.fn(async () => {
    steps.push("runtime.align");
    return {
      ok: true,
      restarted: false,
      desiredProfile: "default",
      previousProfile: "not-running",
      message: "aligned"
    };
  });
  const settings = state.settings;
  const imageInspection: ImageInspectionPort = {
    readDimensions: () => ({ width: 640, height: 360 })
  };
  const dependencies: ApplicationRuntimeDependencies = {
    paths: paths(),
    store,
    events: createStudioEventBus(),
    logger: log as unknown as AppLogger,
    runtimeState,
    promptRuntimeManager,
    historyFileSystem: fileSystem(),
    imageInspection,
    sendState,
    errorMeta: () => ({}),
    waitForWorker: async (worker) => worker === null || (await worker, true),
    settings: {
      videoHistoryMigrationJournal: "C:/Studio/video-history-migration.json",
      resolveComfyOutputDirectory: async () => "C:/Studio/output",
      clearRendererDirty: vi.fn()
    },
    queue: {
      runtime: {
        ensureComfyUiReady: async () => undefined,
        prepareQueueRuntimeForTask: async () => true,
        stabilizeH3RuntimeBetweenTasks: async () => true,
        stopQueueRuntime: async () => true,
        restartQueueRuntime: async () => ({ ok: true, message: "restarted" }),
        resolveH3VideoVaeModeForTask: async () => null,
        settingsForTask: (_task, currentSettings) => currentSettings,
        cleanupCancelledTask: async () => undefined
      }
    },
    lifecycle: {
      interruptComfy: async () => undefined,
      freeMemory: async () => undefined,
      forceStopComfyProcesses,
      alignRuntimeProfile,
      isLocalComfyUrl: (value) => value.startsWith("http://127.0.0.1")
    }
  };
  return {
    dependencies,
    steps,
    settings,
    log,
    forceStopComfyProcesses,
    promptRelease,
    alignRuntimeProfile
  };
}

describe("ApplicationRuntime", () => {
  it("starts without Electron and preserves adapter-before-alignment ordering", async () => {
    const current = runtimeFixture();
    const runtime = new ApplicationRuntime({
      ...current.dependencies,
      lifecycle: {
        ...current.dependencies.lifecycle,
        alignRuntimeProfile: current.alignRuntimeProfile
      }
    });
    const context = await runtime.start({
      onServicesReady: (readyContext) => {
        current.steps.push("adapters.ready");
        expect(readyContext.services.settings).toBeDefined();
        expect(readyContext.queue).toBe(runtime.queue);
      }
    });

    expect(context.services.prompt).toBeDefined();
    expect(runtime.services).toBe(context.services);
    expect(current.steps.indexOf("store.load")).toBeGreaterThanOrEqual(0);
    expect(current.steps.indexOf("app.state-loaded")).toBeGreaterThan(current.steps.indexOf("store.load"));
    expect(current.steps.indexOf("adapters.ready")).toBeGreaterThan(current.steps.indexOf("app.state-loaded"));
    expect(current.steps.indexOf("app.initial-state-ready")).toBeGreaterThan(current.steps.indexOf("adapters.ready"));
    expect(current.steps.indexOf("runtime.align")).toBeGreaterThan(current.steps.indexOf("adapters.ready"));
    expect(current.steps.indexOf("runtime.align")).toBeGreaterThan(current.steps.indexOf("app.initial-state-ready"));
    expect(current.alignRuntimeProfile).toHaveBeenCalledOnce();
  });

  it("creates the adapter boundary before history repair but gates renderer state reads", async () => {
    const current = runtimeFixture();
    let beginRestore!: () => void;
    let releaseRestore!: () => void;
    const restoreStarted = new Promise<void>((resolve) => {
      beginRestore = resolve;
    });
    const restoreGate = new Promise<string>((resolve) => {
      releaseRestore = () => resolve("C:/Studio/output");
    });
    current.dependencies.settings.resolveComfyOutputDirectory = async () => {
      beginRestore();
      return restoreGate;
    };
    const runtime = new ApplicationRuntime(current.dependencies);
    let initialStateReady = false;
    const start = runtime.start({
      onServicesReady: () => {
        current.steps.push("adapters.ready");
        void runtime.waitForInitialState().then(() => {
          initialStateReady = true;
        });
      }
    });

    await restoreStarted;
    expect(current.steps).toContain("adapters.ready");
    await Promise.resolve();
    expect(initialStateReady).toBe(false);

    releaseRestore();
    await start;
    await Promise.resolve();
    expect(initialStateReady).toBe(true);
    expect(current.steps.indexOf("app.initial-state-ready")).toBeGreaterThan(current.steps.indexOf("adapters.ready"));
  });

  it("retains cleanup services when startup fails after adapters are ready", async () => {
    const current = runtimeFixture();
    const failure = new Error("history repair failed");
    current.dependencies.settings.resolveComfyOutputDirectory = async () => {
      throw failure;
    };
    const runtime = new ApplicationRuntime(current.dependencies);

    await expect(runtime.start({ onServicesReady: () => undefined }))
      .rejects.toThrow("history repair failed");
    await expect(runtime.waitForInitialState()).rejects.toThrow("history repair failed");
    expect(runtime.services.settings).toBeDefined();
    await expect(runtime.stop()).resolves.toEqual({ ok: true, message: "stopped" });
    expect(current.forceStopComfyProcesses).toHaveBeenCalledOnce();
  });

  it("shares concurrent start and delegates stop to lifecycle", async () => {
    const current = runtimeFixture();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    current.alignRuntimeProfile.mockImplementationOnce(async () => {
      await gate;
      return {
        ok: true,
        restarted: false,
        desiredProfile: "default",
        previousProfile: "not-running",
        message: "aligned"
      };
    });
    const runtime = new ApplicationRuntime(current.dependencies);
    const first = runtime.start();
    const second = runtime.start();
    const stop = runtime.stop();
    let stopResolved = false;
    void stop.then(() => {
      stopResolved = true;
    });
    expect(current.dependencies.store).toBeDefined();
    await Promise.resolve();
    expect(stopResolved).toBe(false);
    release();
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);

    await expect(stop).resolves.toEqual({ ok: true, message: "stopped" });
    expect(current.alignRuntimeProfile).toHaveBeenCalledOnce();
    expect(current.forceStopComfyProcesses).toHaveBeenCalledOnce();
    expect(current.promptRelease).not.toHaveBeenCalled();
  });
});
