// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { createPromptRuntimeState } from "../src/core/prompt-runtime-state";
import type { AppApi, ComfyRuntimeState } from "../src/types";
import {
  bootstrapRenderer,
  type RendererBootstrapOptions
} from "../src/renderer/bootstrap";

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
} {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (error: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise
  };
}

function comfyRuntime(): ComfyRuntimeState {
  return {
    phase: "ready",
    ownership: "app",
    endpoint: "http://127.0.0.1:8188",
    message: "ready",
    updatedAt: new Date(0).toISOString(),
    operationId: 1
  };
}

function optionsFor(
  studio: AppApi,
  overrides: Partial<RendererBootstrapOptions> = {}
): RendererBootstrapOptions {
  const state = createDefaultState();
  return {
    studio,
    setState: vi.fn(),
    setComfyRuntimeState: vi.fn(),
    setPromptRuntimeState: vi.fn(),
    getState: () => state,
    setAppVersion: vi.fn(),
    refreshEnvironment: vi.fn(async () => undefined),
    bundledWorkflows: {},
    workflowCapabilities: {},
    bundledWorkflowKey: () => "fixture",
    bundledWorkflowModelId: () => "fixture-model",
    patchDraft: vi.fn(),
    render: vi.fn(),
    refreshPerformanceMetrics: vi.fn(async () => undefined),
    ...overrides
  };
}

describe("renderer bootstrap startup sequencing", () => {
  it("renders persisted state before auxiliary startup IPC settles", async () => {
    const appVersion = deferred<string>();
    const runtime = deferred<ComfyRuntimeState>();
    const promptRuntime = deferred<ReturnType<typeof createPromptRuntimeState>>();
    const bundledWorkflow = deferred<null>();
    const state = createDefaultState();
    const studio = {
      getState: vi.fn(async () => state),
      getAppVersion: vi.fn(() => appVersion.promise),
      getComfyRuntimeState: vi.fn(() => runtime.promise),
      getPromptRuntimeState: vi.fn(() => promptRuntime.promise),
      getBundledWorkflow: vi.fn(() => bundledWorkflow.promise),
      reportRendererError: vi.fn(async () => undefined)
    } as unknown as AppApi;
    const render = vi.fn();
    const bootstrapOptions = optionsFor(studio, { render });

    bootstrapRenderer(bootstrapOptions);
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
    expect(bootstrapOptions.setState).toHaveBeenCalledWith(state);
    expect(studio.getAppVersion).toHaveBeenCalledOnce();
    expect(studio.getComfyRuntimeState).toHaveBeenCalledOnce();
    expect(studio.getPromptRuntimeState).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledTimes(1);

    appVersion.resolve("0.55.0");
    runtime.resolve(comfyRuntime());
    promptRuntime.resolve(createPromptRuntimeState());
    bundledWorkflow.resolve(null);
    await vi.waitFor(() => expect(render.mock.calls.length).toBeGreaterThan(1));
    expect(studio.reportRendererError).not.toHaveBeenCalled();
  });

  it("keeps initial-state failures visible and reported", async () => {
    const failure = new Error("state barrier failed");
    const reportRendererError = vi.fn(async () => undefined);
    const studio = {
      getState: vi.fn(async () => {
        throw failure;
      }),
      reportRendererError
    } as unknown as AppApi;
    const showStartupFailure = vi.fn();

    bootstrapRenderer(optionsFor(studio, { showStartupFailure }));

    await vi.waitFor(() => expect(showStartupFailure).toHaveBeenCalledOnce());
    expect(showStartupFailure).toHaveBeenCalledWith(
      "工作区初始化失败：state barrier failed"
    );
    expect(reportRendererError).toHaveBeenCalledWith(
      "state barrier failed",
      { source: "renderer-bootstrap" }
    );
  });
});
