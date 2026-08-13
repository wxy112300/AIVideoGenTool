import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { notificationDuration, queueCompletionChange } from "../src/renderer/notifications";
import { registerRendererEvents } from "../src/renderer/state-events";
import { mountSettingsEnvironmentController } from "../src/renderer/pages/settings/environment-controller";
import type { RendererContext } from "../src/renderer/contracts";
import type { AppApi, AppState, ConnectionResult } from "../src/types";

afterEach(() => vi.unstubAllGlobals());

describe("renderer notifications", () => {
  it("uses longer semantic durations for warnings, errors and completions", () => {
    expect(notificationDuration.info).toBeGreaterThan(3_500);
    expect(notificationDuration.warning).toBeGreaterThan(notificationDuration.info);
    expect(notificationDuration.error).toBeGreaterThan(notificationDuration.warning);
    expect(notificationDuration["task-complete"]).toBeGreaterThan(notificationDuration.info);
    expect(notificationDuration["queue-complete"]).toBeGreaterThan(notificationDuration.info);
  });

  it("detects a newly persisted video task without treating initial state as completion", () => {
    const previous = createDefaultState();
    const next = structuredClone(previous);
    next.history.unshift({
      mediaKind: "video",
      id: "asset-1",
      taskId: "task-1",
      title: "Finished clip",
      outputFilename: "clip.mp4",
      createdAt: "now",
      updatedAt: "now",
      modelId: "minimax_h3_fl2va",
      duration: 5,
      resolution: 480,
      fps: 24,
      ratio: "source",
      promptVersion: 1,
      motion: "natural",
      prompt: "prompt",
      seed: 1,
      inputMode: "image",
      workflowPath: "workflow.json",
      files: [],
      versions: []
    });

    expect(queueCompletionChange(undefined, next).completedTasks).toEqual([]);
    expect(queueCompletionChange(previous, next).completedTasks).toEqual([
      { taskId: "task-1", title: "Finished clip" }
    ]);
  });

  it("reports queue completion only after running work has ended", () => {
    const previous = createDefaultState();
    previous.queueRunning = true;
    const next = structuredClone(previous);
    next.queueRunning = false;

    expect(queueCompletionChange(previous, next).queueCompleted).toBe(true);
    next.queue.push({ id: "waiting", status: "waiting" } as never);
    expect(queueCompletionChange(previous, next).queueCompleted).toBe(false);
  });

  it("detects a newly failed task once and keeps its detailed runtime error", () => {
    const previous = createDefaultState();
    previous.queue.push({
      id: "image-task",
      taskType: "image-generation",
      status: "running",
      outputFilename: "LaMa-test"
    } as never);
    const next = structuredClone(previous);
    Object.assign(next.queue[0]!, {
      status: "failed",
      error: "节点版本不兼容：INPAINT_ExpandMask 缺少输入 blur_type"
    });

    expect(queueCompletionChange(previous, next).failedTasks).toEqual([{
      taskId: "image-task",
      title: "LaMa-test",
      error: "节点版本不兼容：INPAINT_ExpandMask 缺少输入 blur_type"
    }]);
    expect(queueCompletionChange(next, structuredClone(next)).failedTasks).toEqual([]);
  });

  it("delivers completion notifications without rerendering a focused form", () => {
    class FakeInput {}
    vi.stubGlobal("HTMLInputElement", FakeInput);
    vi.stubGlobal("HTMLTextAreaElement", class {});
    vi.stubGlobal("HTMLSelectElement", class {});
    vi.stubGlobal("document", {
      activeElement: new FakeInput(),
      querySelector: () => null
    });
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    });

    let state: AppState | undefined = createDefaultState();
    state.queueRunning = true;
    let onStateChanged: ((next: AppState) => void) | undefined;
    const subscribe = () => () => undefined;
    const studio = {
      onWindowCloseRequest: subscribe,
      onStateChanged: (callback: (next: AppState) => void) => {
        onStateChanged = callback;
        return () => undefined;
      },
      onHistoryMigrationProgress: subscribe,
      onImageAssetLibraryProgress: subscribe,
      onTaskPreview: subscribe,
      onAttentionInstallLog: subscribe,
      onDependencyInstallLog: subscribe,
      reportRendererError: async () => undefined
    } as unknown as AppApi;
    const notify = vi.fn();
    const requestRender = vi.fn();
    const cleanup = registerRendererEvents({
      studio,
      t: (key, params) => params?.title ? `${key}:${params.title}` : key,
      getState: () => state,
      setState: (next) => { state = next; },
      getPage: () => "create",
      getHistoryKind: () => "video",
      getDraftDirty: () => false,
      getDraftSaveInFlight: () => 0,
      setPromptRuntimeLoaded: vi.fn(),
      rememberModalFocus: vi.fn(),
      setPendingWindowCloseRequest: vi.fn(),
      setWindowCloseResponseBusy: vi.fn(),
      setHistoryMigrationProgress: vi.fn(),
      hasPendingDirectoryMigration: () => false,
      setImageAssetLibraryProgress: vi.fn(),
      taskPreviews: {},
      appendAttentionAccelerationLog: (message) => message,
      appendDependencyInstallLog: (progress) => progress.message,
      notify,
      requestRender
    });
    const next = structuredClone(state);
    next.queueRunning = false;
    next.history.push({
      mediaKind: "video",
      id: "completed-asset",
      taskId: "completed-task",
      title: "Completed task",
      outputFilename: "completed.mp4",
      createdAt: "now",
      updatedAt: "now",
      modelId: "minimax_h3_fl2va",
      duration: 5,
      resolution: 480,
      fps: 24,
      ratio: "source",
      promptVersion: 1,
      motion: "natural",
      prompt: "prompt",
      seed: 1,
      inputMode: "image",
      workflowPath: "workflow.json",
      files: [],
      versions: []
    });

    onStateChanged?.(next);

    expect(notify).toHaveBeenCalledTimes(2);
    expect(requestRender).not.toHaveBeenCalled();
    cleanup();
  });

  it("does not rerender another page when a settings operation finishes", async () => {
    let routePage: "settings" | "create" = "settings";
    let clickHandler: (() => Promise<void>) | undefined;
    let resolveStart: ((result: ConnectionResult) => void) | undefined;
    const startResult = new Promise<ConnectionResult>((resolve) => {
      resolveStart = resolve;
    });
    const button = {
      dataset: { startService: "comfy" },
      addEventListener: (_type: string, handler: () => Promise<void>) => {
        clickHandler = handler;
      }
    };
    const root = {
      querySelectorAll: (selector: string) => selector === "[data-start-service]" ? [button] : [],
      querySelector: () => null
    };
    const requestRender = vi.fn();
    const notify = vi.fn();
    const state = createDefaultState();
    const context = {
      root,
      studio: {
        startLocalService: () => startResult,
        scanEnvironment: async () => ({})
      },
      getState: () => state,
      getRoute: () => ({
        page: routePage,
        creationMode: "image-to-video",
        historyKind: "video"
      }),
      t: (key: string) => key,
      notify,
      reportUserAction: vi.fn(),
      requestRender
    } as unknown as RendererContext;
    const noop = () => undefined;
    const cleanup = mountSettingsEnvironmentController(context, {
      formSettings: () => state.settings,
      getEnvironmentScan: () => null,
      setEnvironmentScan: noop,
      setSettingsDraft: noop,
      setServiceStarting: noop,
      setServiceRestarting: noop,
      setServiceStatusMessage: noop,
      setComfyUpdating: noop,
      getComfyUpdateLog: () => "",
      setComfyUpdateLog: noop,
      setAttentionAccelerationInstalling: noop,
      getAttentionAccelerationLog: () => "",
      setAttentionAccelerationLog: noop,
      setCoreDependencyRepairing: noop,
      setEnvironmentRepairing: noop,
      setEnvironmentRepairLog: noop,
      enqueueCustomNodeInstall: () => ({ accepted: true, position: 1 }),
      setWorkflowDependencyInstalling: noop,
      getWorkflowDependencyLog: () => "",
      setWorkflowDependencyLog: noop,
      requestForceStopConfirmation: noop,
      rememberModalFocus: noop
    });

    const operation = clickHandler?.();
    await Promise.resolve();
    routePage = "create";
    resolveStart?.({ ok: true, message: "ComfyUI started" });
    await operation;

    expect(requestRender).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("ComfyUI started", { kind: "info" });
    cleanup();
  });
});
