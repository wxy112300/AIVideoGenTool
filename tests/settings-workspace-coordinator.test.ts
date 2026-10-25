// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { createTranslator } from "../src/core/i18n";
import type { AppState, ComfyRuntimeState, EnvironmentScanResult } from "../src/types";
import type { Page, RendererContext } from "../src/renderer/contracts";
import { loadPromptPacks } from "../src/renderer/prompt-packs";
import {
  createSettingsWorkspaceCoordinator,
  type SettingsWorkspaceCoordinatorDependencies
} from "../src/renderer/pages/settings/coordinator";

const translator = createTranslator("zh-CN");

beforeAll(async () => {
  await loadPromptPacks();
});

function createCoordinatorHarness() {
  let currentState = createDefaultState();
  let currentPage: Page = "settings";
  let comfyRuntime: ComfyRuntimeState = {
    phase: "stopped",
    ownership: "none",
    endpoint: "http://127.0.0.1:8188",
    message: "stopped",
    updatedAt: new Date(0).toISOString(),
    operationId: 1
  };
  const application = {
    saveSettings: vi.fn(async (settings: typeof currentState.settings) => ({
      ...currentState,
      settings
    })),
    saveImageDraft: vi.fn(async () => currentState),
    saveDraft: vi.fn(async () => currentState),
    getBundledWorkflow: vi.fn(async () => null),
    scanEnvironment: vi.fn(async () => ({} as EnvironmentScanResult)),
    setSettingsDirty: vi.fn(async () => undefined)
  };
  const context = {
    root: document.createElement("main"),
    application,
    events: { onAppCacheProgress: vi.fn(() => () => undefined) },
    assets: {},
    hostCapabilities: {},
    getState: () => currentState,
    getRoute: () => ({
      page: currentPage,
      creationMode: "image-to-video" as const,
      historyKind: "video" as const
    }),
    getTranslator: () => translator,
    t: translator.t,
    requestRender: vi.fn(),
    navigate: vi.fn(),
    notify: vi.fn(),
    reportUserAction: vi.fn()
  } as unknown as RendererContext;
  const dependencies: SettingsWorkspaceCoordinatorDependencies = {
    modalRoot: document.createElement("div"),
    context,
    getState: () => currentState,
    getPage: () => currentPage,
    getComfyRuntimeState: () => comfyRuntime,
    setState: (nextState: AppState) => {
      currentState = nextState;
    },
    addPageCleanup: vi.fn(),
    render: vi.fn(),
    renderOverlay: vi.fn(),
    showMessage: vi.fn(),
    reportUserAction: vi.fn(),
    enableSpectrumByDefaultIfAvailable: vi.fn(),
    bundledWorkflows: {},
    workflowCapabilities: {},
    bundledWorkflowKey: (modelId, inputMode) => `${modelId}:${inputMode}`,
    requestConfirmation: vi.fn(),
    requestDirectoryMigration: vi.fn(),
    openImageAssetLibrary: vi.fn(),
    rememberModalFocus: vi.fn(),
    restoreModalFocus: vi.fn(),
    bindModalFocus: vi.fn(),
    getPromptRuntimeLoaded: () => false,
    getPromptStarting: () => false,
    getPromptEnhancing: () => false,
    getPromptReleasing: () => false,
    promptRuntimeControlIcon: () => "play",
    promptRuntimeControlTitle: () => "Prompt model",
    togglePromptModel: vi.fn(async () => undefined),
    getAppLogs: () => null,
    getAppLogsLoading: () => false,
    getAppLogsError: () => "",
    getAppLogScreenClearedAt: () => null,
    loadAppLogs: vi.fn(async () => undefined),
    clearAppLogScreen: vi.fn(),
    setAppLogFollowTail: vi.fn()
  };
  const coordinator = createSettingsWorkspaceCoordinator(dependencies);
  return {
    coordinator,
    root: context.root,
    dependencies,
    application,
    getState: () => currentState,
    setPage: (page: Page) => { currentPage = page; },
    setComfyRuntime: (nextRuntime: ComfyRuntimeState) => {
      comfyRuntime = nextRuntime;
    }
  };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("settings workspace coordinator", () => {
  it("opens cache inspection before clearing and submits only once after confirmation", async () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const harness = createCoordinatorHarness();
    const snapshot = { currentSessionBytes: 10, temporaryBytes: 20, temporaryDirectoryCount: 2, totalBytes: 30, scannedAt: "now" };
    let finish!: (result: unknown) => void;
    const clear = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    Object.assign(harness.application, { getAppCache: vi.fn(async () => snapshot), clearAppCache: clear });
    harness.application.scanEnvironment.mockResolvedValue({ modelProfiles: [], customNodes: [], gpus: [], items: [], issues: [], comfyInstallations: [], pythonRuntimes: [] } as unknown as EnvironmentScanResult);
    await harness.coordinator.runEnvironmentScan(harness.getState().settings);
    harness.root.innerHTML = '<button data-settings-tab="system">System</button>';
    let cleanup = harness.coordinator.bind(); harness.root.querySelector<HTMLButtonElement>("button")!.click(); cleanup?.();
    harness.root.innerHTML = harness.coordinator.renderPage(); cleanup = harness.coordinator.bind();
    await vi.waitFor(() => expect(harness.coordinator.renderPage()).toContain("30 B")); cleanup?.();
    harness.root.innerHTML = harness.coordinator.renderPage(); cleanup = harness.coordinator.bind();
    try {
      harness.root.querySelector<HTMLButtonElement>("#clear-app-cache")!.click(); expect(clear).not.toHaveBeenCalled();
      harness.dependencies.modalRoot.innerHTML = harness.coordinator.cacheDialogHtml(); harness.coordinator.bindCacheDialog();
      const confirm = harness.dependencies.modalRoot.querySelector<HTMLButtonElement>("#confirm-clear-app-cache")!;
      confirm.click(); confirm.click(); expect(clear).toHaveBeenCalledTimes(1);
      expect(harness.coordinator.cacheDialogHtml()).toContain('id="settings-cache-close" disabled');
      finish({ before: snapshot, after: snapshot, clearedBytes: 10, currentSessionCleared: true, skippedTemporaryDirectories: 0, errors: [] });
      await vi.waitFor(() => expect(harness.coordinator.cacheDialogHtml()).toContain("已清理缓存"));
    } finally { cleanup?.(); }
  });
  it.each(["history-detail", "image-history-detail"] as const)("keeps %s mounted while a scan finishes", async page => {
    const harness = createCoordinatorHarness();
    harness.setPage(page);
    let finish!: (scan: EnvironmentScanResult) => void;
    harness.application.scanEnvironment.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = harness.coordinator.runEnvironmentScan(harness.getState().settings, "startup");
    expect(harness.dependencies.render).not.toHaveBeenCalled();
    finish({ scannedAt: "2026-10-23" } as EnvironmentScanResult);
    await pending;
    expect(harness.dependencies.render).not.toHaveBeenCalled();
    expect(harness.coordinator.getEnvironmentScan()?.scannedAt).toBe("2026-10-23");
    expect(harness.dependencies.showMessage).toHaveBeenCalledTimes(2);
  });

  it("refreshes an open upscale readiness overlay without rebuilding History detail", async () => {
    const harness = createCoordinatorHarness();
    harness.setPage("history-detail");
    harness.dependencies.modalRoot.innerHTML = '<section class="upscale-dialog"></section>';
    await harness.coordinator.runEnvironmentScan(harness.getState().settings);
    expect(harness.dependencies.render).not.toHaveBeenCalled();
    expect(harness.dependencies.renderOverlay).toHaveBeenCalledOnce();
  });

  it("renders Settings through the page owner and keeps dirty state local", () => {
    const harness = createCoordinatorHarness();
    const markup = harness.coordinator.renderPage();

    expect(markup).toContain("settings-layout");
    expect(harness.coordinator.settingsHaveUnsavedChanges()).toBe(false);
    expect(harness.coordinator.formSettings()).toEqual(harness.getState().settings);

    harness.coordinator.setSettingsDraft({
      ...harness.getState().settings,
      proxyEnabled: !harness.getState().settings.proxyEnabled
    });

    expect(harness.coordinator.settingsHaveUnsavedChanges()).toBe(true);
  });

  it("owns environment refresh state and commits the newest scan result", async () => {
    const harness = createCoordinatorHarness();
    const scan = { scannedAt: "2026-08-31T12:00:00.000Z" } as EnvironmentScanResult;
    harness.application.scanEnvironment.mockResolvedValue(scan);

    const pending = harness.coordinator.runEnvironmentScan(harness.getState().settings, "manual");
    expect(harness.coordinator.isEnvironmentScanning()).toBe(true);

    await expect(pending).resolves.toBe(scan);
    expect(harness.coordinator.isEnvironmentScanning()).toBe(false);
    expect(harness.coordinator.getEnvironmentScan()).toBe(scan);
    expect(harness.dependencies.enableSpectrumByDefaultIfAvailable).toHaveBeenCalledTimes(1);
  });

  it("routes saves and dependency logs through the coordinator owner", async () => {
    const harness = createCoordinatorHarness();
    const nextSettings = {
      ...harness.getState().settings,
      proxyEnabled: !harness.getState().settings.proxyEnabled
    };
    harness.coordinator.setSettingsDraft(nextSettings);

    await expect(harness.coordinator.requestSaveSettings(nextSettings)).resolves.toBe("saved");

    expect(harness.application.saveSettings).toHaveBeenCalledWith(nextSettings, "apply");
    expect(harness.coordinator.settingsHaveUnsavedChanges()).toBe(false);
    expect(harness.coordinator.appendAttentionAccelerationLog("attention step")).toBe("attention step");
    expect(harness.coordinator.appendDependencyInstallLog({
      kind: "python-runtime",
      id: "llama",
      message: "python step"
    })).toBe("python step");
    expect(harness.coordinator.getLlamaCppPythonLog()).toBe("python step");
    harness.application.scanEnvironment.mockResolvedValue({ modelProfiles: [], customNodes: [], gpus: [], items: [], issues: [], comfyInstallations: [], pythonRuntimes: [] } as unknown as EnvironmentScanResult);
    await harness.coordinator.runEnvironmentScan(harness.getState().settings);
    harness.root.innerHTML = '<button data-settings-tab="nodes">节点</button>';
    harness.coordinator.bind();
    harness.root.querySelector<HTMLButtonElement>("[data-settings-tab=nodes]")!.click();
    harness.coordinator.appendDependencyInstallLog({ kind: "python-runtime", id: "strata", message: "", progress: { stage: "download", percent: 42 } });
    expect(harness.coordinator.renderPage()).toContain("下载引擎 · 42%");
    harness.coordinator.appendDependencyInstallLog({ kind: "python-runtime", id: "strata", message: "pip output" });
    expect(harness.coordinator.renderPage()).toContain("下载引擎 · 42%");
  });
});
