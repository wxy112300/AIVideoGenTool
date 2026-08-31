// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultState } from "../src/core/defaults";
import { createPromptRuntimeState, reducePromptRuntime } from "../src/core/prompt-runtime-state";
import { createTranslator } from "../src/core/i18n";
import { createRendererShellCoordinator, type RendererShellCoordinatorDependencies } from "../src/renderer/shell/coordinator";
import { createRendererUiState } from "../src/renderer/ui-state";
import type { ComfyRuntimeState } from "../src/types";

const runtime: ComfyRuntimeState = {
  phase: "ready",
  ownership: "app",
  endpoint: "http://127.0.0.1:8188",
  message: "ready",
  updatedAt: new Date(0).toISOString(),
  operationId: 1
};

function createCoordinatorHarness() {
  const state = createDefaultState();
  const ui = createRendererUiState();
  const modalRoot = document.createElement("div");
  document.body.append(modalRoot);
  document.body.insertAdjacentHTML(
    "afterbegin",
    '<div id="app-flash"><span data-flash-message></span><div data-flash-actions></div></div>'
  );
  const translator = createTranslator("zh-CN");
  let page: RendererShellCoordinatorDependencies["getPage"] extends () => infer Page ? Page : never = "create";
  let settingsTab = "logs";
  const application = {
    setSettingsDirty: vi.fn(async () => undefined),
    reportNotification: vi.fn(async () => undefined),
    preflightPromptModel: vi.fn(async () => ({
      requiresCpuConfirmation: false,
      vramUsedBytes: null,
      vramTotalBytes: null,
      vramFreeBytes: null,
      requiredFreeVramBytes: null
    })),
    enhancePrompt: vi.fn(async () => "enhanced"),
    startPromptModel: vi.fn(async () => ({ ok: true, message: "started" })),
    releasePromptModel: vi.fn(async () => ({ ok: true, message: "released" })),
    readAppLogs: vi.fn(async () => ({ text: "log", records: [] })),
    forceStopComfyProcesses: vi.fn(async () => ({ ok: true, message: "stopped" })),
    uninstallLlamaCppPython: vi.fn(async () => ({ ok: true, message: "uninstalled" })),
    uninstallCustomNode: vi.fn(async () => ({ ok: true, message: "uninstalled" })),
    removeTask: vi.fn(async () => undefined),
    cancelTask: vi.fn(async () => undefined),
    deleteHistoryAsset: vi.fn(async () => state),
    deleteImageHistoryVersion: vi.fn(async () => state),
    deleteHistoryVersion: vi.fn(async () => state)
  } as unknown as RendererShellCoordinatorDependencies["application"];
  const assets = {
    readImage: vi.fn(async () => null),
    scanImageAssetLibrary: vi.fn(async () => ({
      libraryDirectory: "images",
      totalReferences: 0,
      archiveCandidates: 0,
      archiveBytes: 0,
      missingReferences: [],
      orphanFiles: [],
      orphanBytes: 0
    })),
    organizeImageAssetLibrary: vi.fn(),
    cleanupImageAssetLibrary: vi.fn()
  } as unknown as RendererShellCoordinatorDependencies["assets"];
  const hostCapabilities = {
    respondWindowClose: vi.fn(async () => undefined)
  } as unknown as RendererShellCoordinatorDependencies["hostCapabilities"];
  let currentState = state;
  const dependencies: RendererShellCoordinatorDependencies = {
    modalRoot,
    ui,
    application,
    assets,
    hostCapabilities,
    t: translator.t,
    icon: () => "",
    escapeHtml: (value) => String(value),
    formatAssetBytes: (bytes) => String(bytes),
    getState: () => currentState,
    setState: (nextState) => {
      currentState = nextState;
    },
    getPage: () => page,
    setPage: (nextPage) => {
      page = nextPage;
    },
    getSettings: () => currentState.settings,
    getEnvironmentScan: () => null,
    getSettingsTab: () => settingsTab,
    getFormSettings: () => currentState.settings,
    setSettingsDraft: vi.fn(),
    setServiceForceStopping: vi.fn(),
    setServiceStatusMessage: vi.fn(),
    setLlamaCppPythonInstalling: vi.fn(),
    getLlamaCppPythonLog: () => "",
    setLlamaCppPythonLog: vi.fn(),
    getCustomNodeLog: () => "",
    setCustomNodeLog: vi.fn(),
    scanEnvironment: vi.fn(async () => undefined),
    clearCreationDraft: vi.fn(),
    setHistoryKind: vi.fn(),
    setHistoryScrollRestorePending: vi.fn(),
    setSelectedHistoryAssetId: vi.fn(),
    setSelectedHistoryVersionId: vi.fn(),
    clearImageHistoryThumbnailCache: vi.fn(),
    setQueueActionBusy: vi.fn(),
    releaseHistoryVideo: vi.fn(),
    saveSettings: vi.fn(async () => undefined),
    render: vi.fn(),
    requestRender: vi.fn(),
    reportUserAction: vi.fn()
  };
  const coordinator = createRendererShellCoordinator(dependencies, runtime);
  return { coordinator, dependencies, application, ui, modalRoot, setPage: (nextPage: typeof page) => { page = nextPage; }, setSettingsTab: (nextTab: string) => { settingsTab = nextTab; } };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("renderer shell coordinator", () => {
  it("keeps a visible error ahead of transient notices and drains queued completion", () => {
    const { coordinator, application, ui } = createCoordinatorHarness();

    coordinator.showMessage("扫描失败", { kind: "error" });
    coordinator.showMessage("普通提示", { kind: "info" });
    coordinator.showMessage("队列完成", { kind: "queue-complete" });

    expect(ui.flashMessage).toBe("扫描失败");
    expect(ui.flashNotification?.kind).toBe("error");
    expect(ui.flashNotificationQueue).toHaveLength(1);
    expect(application.reportNotification).toHaveBeenCalledTimes(2);

    coordinator.dismissNotification();

    expect(ui.flashMessage).toBe("队列完成");
    expect(ui.flashNotification?.kind).toBe("queue-complete");
  });

  it("owns prompt runtime projection and derived lifecycle flags", () => {
    const { coordinator } = createCoordinatorHarness();
    const resident = reducePromptRuntime(
      createPromptRuntimeState(runtime),
      { type: "model-updated", modelPhase: "resident", modelId: "prompt-model" }
    );

    coordinator.setPromptRuntimeState(resident);

    expect(coordinator.getPromptRuntimeLoaded()).toBe(true);
    expect(coordinator.getPromptStarting()).toBe(false);
    expect(coordinator.getPromptReleasing()).toBe(false);
    expect(coordinator.promptRuntimeView("image-edit").left.intent).toBe("stop");
    expect(coordinator.promptOperationBelongsTo("image-edit")).toBe(false);
  });

  it("starts and stops app-log polling without leaving an interval outside the logs page", async () => {
    const { coordinator, application, setPage } = createCoordinatorHarness();

    setPage("settings");
    coordinator.syncAppLogPolling();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(application.readAppLogs).toHaveBeenCalledTimes(1);

    setPage("create");
    coordinator.syncAppLogPolling();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(application.readAppLogs).toHaveBeenCalledTimes(1);
  });
});
