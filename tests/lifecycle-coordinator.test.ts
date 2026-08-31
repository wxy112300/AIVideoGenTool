import { describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import type { AppState, Settings } from "../src/types";
import type { StateRepository } from "../electron/ports/state-repository";
import { ComfyRuntimeStateController } from "../src/infrastructure/comfy-runtime-state";
import {
  LifecycleCoordinator,
  type LifecycleCoordinatorDependencies,
  type LifecyclePromptPort,
  type LifecycleQueuePort
} from "../electron/services/lifecycle-coordinator";

function repository(initial: AppState): StateRepository {
  let state = structuredClone(initial);
  return {
    load: async () => structuredClone(state),
    get: () => structuredClone(state),
    getSettings: () => structuredClone(state.settings),
    update: async (mutator) => {
      mutator(state);
      return structuredClone(state);
    }
  };
}

function logger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
}

interface LifecycleFixture {
  state: AppState;
  settings: Settings;
  queue: {
    cleanupWorker: Promise<unknown> | null;
    runningWorker: Promise<unknown> | null;
    abort: ReturnType<typeof vi.fn>;
  };
  prompt: LifecyclePromptPort & {
    runningWorker: Promise<unknown> | null;
    abort: ReturnType<typeof vi.fn>;
    handleComfyRuntimeFailure: ReturnType<typeof vi.fn>;
    releaseRuntime: ReturnType<typeof vi.fn>;
  };
  runtimeState: ComfyRuntimeStateController;
  logger: ReturnType<typeof logger>;
  sendState: ReturnType<typeof vi.fn>;
  interruptComfy: ReturnType<typeof vi.fn>;
  freeMemory: ReturnType<typeof vi.fn>;
  forceStopComfyProcesses: ReturnType<typeof vi.fn>;
  alignRuntimeProfile: ReturnType<typeof vi.fn>;
  coordinator: LifecycleCoordinator;
}

function fixture(settingsPatch: Partial<Settings> = {}): LifecycleFixture {
  const state = createDefaultState();
  state.settings = { ...state.settings, ...settingsPatch };
  const settings = structuredClone(state.settings);
  const queue = {
    cleanupWorker: null as Promise<unknown> | null,
    runningWorker: null as Promise<unknown> | null,
    abort: vi.fn()
  };
  const prompt = {
    runningWorker: null as Promise<unknown> | null,
    abort: vi.fn(),
    handleComfyRuntimeFailure: vi.fn(),
    releaseRuntime: vi.fn(async () => 0)
  };
  const runtimeState = new ComfyRuntimeStateController();
  const log = logger();
  const sendState = vi.fn();
  const interruptComfy = vi.fn(async () => undefined);
  const freeMemory = vi.fn(async () => undefined);
  const forceStopComfyProcesses = vi.fn(async () => ({ ok: true, message: "stopped" }));
  const alignRuntimeProfile = vi.fn(async () => ({
    ok: true,
    restarted: false,
    desiredProfile: "default",
    previousProfile: "not-running",
    message: "aligned"
  }));
  const dependencies: LifecycleCoordinatorDependencies = {
    store: repository(state),
    logger: log as unknown as LifecycleCoordinatorDependencies["logger"],
    runtimeState,
    getQueue: () => queue as LifecycleQueuePort,
    prompt,
    sendState,
    interruptComfy,
    freeMemory,
    forceStopComfyProcesses,
    alignRuntimeProfile,
    isLocalComfyUrl: (value) => value.startsWith("http://127.0.0.1")
  };
  return {
    state,
    settings,
    queue,
    prompt,
    runtimeState,
    logger: log,
    sendState,
    interruptComfy,
    freeMemory,
    forceStopComfyProcesses,
    alignRuntimeProfile,
    coordinator: new LifecycleCoordinator(dependencies)
  };
}

describe("LifecycleCoordinator", () => {
  it("shares concurrent startup takeover and records its result", async () => {
    const current = fixture();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    current.alignRuntimeProfile.mockImplementationOnce(async () => {
      await gate;
      return {
        ok: true,
        restarted: true,
        desiredProfile: "low-vram",
        previousProfile: "default",
        message: "restarted"
      };
    });

    const first = current.coordinator.start(current.settings);
    const second = current.coordinator.start(current.settings);
    expect(current.alignRuntimeProfile).toHaveBeenCalledOnce();
    release();

    await expect(Promise.all([first, second])).resolves.toEqual([
      {
        ok: true,
        restarted: true,
        desiredProfile: "low-vram",
        previousProfile: "default",
        message: "restarted"
      },
      {
        ok: true,
        restarted: true,
        desiredProfile: "low-vram",
        previousProfile: "default",
        message: "restarted"
      }
    ]);
    expect(current.logger.info).toHaveBeenCalledWith(
      "comfy",
      "startup-runtime-takeover-succeeded",
      "restarted",
      expect.objectContaining({ restarted: true, desiredProfile: "low-vram" })
    );
  });

  it("contains startup alignment failures without breaking app startup", async () => {
    const current = fixture();
    current.alignRuntimeProfile.mockRejectedValueOnce(new Error("alignment failed"));

    await expect(current.coordinator.start(current.settings)).resolves.toBeNull();
    expect(current.logger.error).toHaveBeenCalledWith(
      "comfy",
      "startup-runtime-takeover-failed",
      "alignment failed"
    );
  });

  it("interrupts queue and prompt work before a normal exit", async () => {
    const current = fixture();
    current.queue.runningWorker = Promise.resolve();
    current.prompt.runningWorker = Promise.resolve();

    await expect(current.coordinator.interruptForExit(true)).resolves.toEqual({
      interrupted: true,
      workerSettled: true
    });
    expect(current.sendState).toHaveBeenCalledWith(expect.objectContaining({ queueRunning: false }));
    expect(current.queue.abort).toHaveBeenCalledWith(expect.any(Error));
    expect(current.prompt.abort).toHaveBeenCalledWith(expect.any(Error));
    expect(current.interruptComfy).toHaveBeenCalledWith(current.settings);
    expect(current.freeMemory).toHaveBeenCalledWith(current.settings);
  });

  it("does not wait for unsettled workers during a forced exit", async () => {
    const current = fixture();
    current.queue.runningWorker = new Promise(() => undefined);
    current.prompt.runningWorker = new Promise(() => undefined);

    await expect(current.coordinator.interruptForExit(false)).resolves.toEqual({
      interrupted: true,
      workerSettled: false
    });
    expect(current.queue.abort).toHaveBeenCalledWith(expect.any(Error));
    expect(current.prompt.abort).toHaveBeenCalledWith(expect.any(Error));
    expect(current.interruptComfy).toHaveBeenCalledWith(current.settings);
  });

  it("waits only for cleanup workers when the shell selected queue-cleanup-only", async () => {
    const current = fixture();
    current.queue.cleanupWorker = Promise.resolve();
    current.queue.runningWorker = Promise.resolve();

    await expect(current.coordinator.interruptForExit(true, true)).resolves.toEqual({
      interrupted: true,
      workerSettled: true
    });
    expect(current.interruptComfy).not.toHaveBeenCalled();
    expect(current.queue.abort).not.toHaveBeenCalled();
    expect(current.prompt.abort).not.toHaveBeenCalled();
  });

  it("never force-stops a remote ComfyUI during forced queue cleanup", async () => {
    const current = fixture({ comfyUrl: "http://192.168.1.20:8188" });

    await expect(current.coordinator.interruptForExit(false, true)).resolves.toEqual({
      interrupted: false,
      workerSettled: false
    });
    expect(current.forceStopComfyProcesses).not.toHaveBeenCalled();
    expect(current.logger.info).toHaveBeenCalledWith(
      "service",
      "cleanup-force-stop-failed",
      "远程 ComfyUI 仅支持连接，应用不会终止远程或本机进程。",
      { ok: false }
    );
  });

  it("releases the prompt lease and stops local owned runtime once", async () => {
    const current = fixture();
    const order: string[] = [];
    current.prompt.releaseRuntime.mockImplementation(async () => {
      order.push("prompt");
      return 1;
    });
    current.forceStopComfyProcesses.mockImplementation(async () => {
      order.push("comfy");
      return { ok: true, message: "stopped" };
    });

    await expect(Promise.all([
      current.coordinator.stopOwnedRuntime(current.settings),
      current.coordinator.stopOwnedRuntime(current.settings)
    ])).resolves.toEqual([
      { ok: true, message: "stopped" },
      { ok: true, message: "stopped" }
    ]);
    expect(order).toEqual(["prompt", "comfy"]);
    expect(current.prompt.releaseRuntime).toHaveBeenCalledOnce();
    expect(current.forceStopComfyProcesses).toHaveBeenCalledOnce();
  });

  it("treats an expected restart exit differently from an unexpected process exit", () => {
    const current = fixture();
    current.runtimeState.begin("restarting", "http://127.0.0.1:8188", "restarting", "app");
    current.coordinator.handleOwnedComfyProcessExit({ processId: 1001, code: 0, signal: null });
    expect(current.prompt.handleComfyRuntimeFailure).not.toHaveBeenCalled();
    expect(current.runtimeState.snapshot().phase).toBe("restarting");

    current.runtimeState.markStopped("http://127.0.0.1:8188", "ready", "app");
    current.coordinator.handleOwnedComfyProcessExit({ processId: 1002, code: 1, signal: null });
    expect(current.prompt.handleComfyRuntimeFailure).toHaveBeenCalledWith("ComfyUI 已退出。");
    expect(current.runtimeState.snapshot()).toMatchObject({
      phase: "stopped",
      ownership: "none",
      endpoint: "http://127.0.0.1:8188",
      message: "ComfyUI 进程已退出（PID 1002，退出码 1）。"
    });
  });
});
