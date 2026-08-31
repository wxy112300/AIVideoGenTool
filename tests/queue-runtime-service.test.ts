import { describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import type {
  AppState,
  EnvironmentScanResult,
  QueueTask,
  Settings
} from "../src/types";
import { ComfyRuntimeStateController } from "../src/infrastructure/comfy-runtime-state";
import type { AppLogger } from "../src/infrastructure/app-logger";
import type { StateRepository } from "../electron/ports/state-repository";
import { QueueRuntimeService } from "../electron/services/queue-runtime-service";

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

function logger(): AppLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  } as unknown as AppLogger;
}

function settings(overrides: Partial<Settings> = {}): Settings {
  return {
    ...createDefaultState().settings,
    comfyUrl: "http://127.0.0.1:8188",
    ...overrides
  };
}

function runtimeFixture(
  state: AppState = createDefaultState(),
  overrides: Partial<ConstructorParameters<typeof QueueRuntimeService>[0]> = {}
) {
  const updateTask = vi.fn(async () => state);
  const alignRuntimeProfile = vi.fn(async () => ({
    ok: true,
    restarted: false,
    desiredProfile: "standard",
    previousProfile: "not-running",
    message: "aligned"
  }));
  const testComfyUi = vi.fn(async () => "ready");
  const startLocalService = vi.fn(async () => ({ ok: true, message: "started" }));
  const forceStopComfyProcesses = vi.fn(async () => ({ ok: true, message: "stopped" }));
  const restartLocalService = vi.fn(async () => ({ ok: true, message: "restarted" }));
  const freeMemory = vi.fn(async () => undefined);
  const getPerformanceMetrics = vi.fn(async () => ({
    sampledAt: new Date().toISOString(),
    cpuPercent: 0,
    memoryUsedBytes: 0,
    memoryTotalBytes: 1,
    gpuPercent: 0,
    vramUsedBytes: 1 * 1024 ** 3,
    vramTotalBytes: 16 * 1024 ** 3,
    gpuTemperature: null,
    comfyConnected: true
  }));
  const scanEnvironment = vi.fn(async () => ({
    modelProfiles: []
  } as unknown as EnvironmentScanResult));
  const service = new QueueRuntimeService({
    store: repository(state),
    logger: logger(),
    runtimeState: new ComfyRuntimeStateController(),
    updateTask,
    isLocalComfyUrl: (value) => value.includes("127.0.0.1") || value.includes("localhost"),
    alignRuntimeProfile,
    testComfyUi,
    startLocalService,
    forceStopComfyProcesses,
    restartLocalService,
    freeMemory,
    getPerformanceMetrics,
    scanEnvironment,
    settingsForTask: (_task, currentSettings) => currentSettings,
    sleep: async () => undefined,
    ...overrides
  });
  return {
    service,
    updateTask,
    alignRuntimeProfile,
    testComfyUi,
    startLocalService,
    forceStopComfyProcesses,
    restartLocalService,
    freeMemory,
    getPerformanceMetrics,
    scanEnvironment
  };
}

describe("QueueRuntimeService", () => {
  it("aligns the task profile and starts a local ComfyUI when the endpoint is unavailable", async () => {
    const state = createDefaultState();
    state.settings = settings();
    const task = { id: "task-1", taskType: "generation", modelId: "h3" } as QueueTask;
    state.queue = [task];
    const current = runtimeFixture(state);
    current.testComfyUi
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce("ready");

    await current.service.ensureComfyUiReady(task.id);

    expect(current.alignRuntimeProfile).toHaveBeenCalledOnce();
    expect(current.testComfyUi).toHaveBeenCalledTimes(2);
    expect(current.startLocalService).toHaveBeenCalledWith("comfy", state.settings, undefined);
    expect(current.updateTask).toHaveBeenCalledWith(task.id, {
      progress: 1,
      stage: "正在启动 ComfyUI，等待服务就绪"
    });
  });

  it("does not manage a remote endpoint and reports connection failures", async () => {
    const state = createDefaultState();
    state.settings = settings({ comfyUrl: "https://remote.example" });
    const current = runtimeFixture(state, {
      isLocalComfyUrl: () => false,
      testComfyUi: vi.fn(async () => {
        throw new Error("remote offline");
      })
    });

    await expect(current.service.ensureComfyUiReady("missing-task"))
      .rejects.toThrow("无法连接 ComfyUI（https://remote.example）：remote offline");
    await expect(current.service.prepareQueueRuntimeForTask("task", "model", state.settings, "always"))
      .resolves.toBe(true);
    await expect(current.service.stopQueueRuntime(state.settings)).resolves.toBe(true);
    await expect(current.service.restartQueueRuntime(state.settings)).resolves.toEqual({
      ok: false,
      message: "远程 ComfyUI 为 connection-only，未执行进程重启。"
    });
    expect(current.startLocalService).not.toHaveBeenCalled();
    expect(current.forceStopComfyProcesses).not.toHaveBeenCalled();
    expect(current.restartLocalService).not.toHaveBeenCalled();
  });

  it("keeps local queue isolation and stop/restart ownership in the capability", async () => {
    const state = createDefaultState();
    state.settings = settings();
    const current = runtimeFixture(state);

    await expect(current.service.prepareQueueRuntimeForTask("task", "model", state.settings, "model-change"))
      .resolves.toBe(true);
    await expect(current.service.stopQueueRuntime(state.settings)).resolves.toBe(true);
    await expect(current.service.restartQueueRuntime(state.settings)).resolves.toEqual({
      ok: true,
      message: "restarted"
    });

    expect(current.restartLocalService).toHaveBeenCalledWith("comfy", state.settings);
    expect(current.forceStopComfyProcesses).toHaveBeenCalledWith(state.settings);
    expect(current.restartLocalService).toHaveBeenCalledTimes(2);
  });

  it("verifies H3 memory release before continuing and performs both LoRA phases", async () => {
    const state = createDefaultState();
    state.settings = settings();
    const current = runtimeFixture(state);

    await expect(current.service.stabilizeH3RuntimeBetweenTasks(
      "task",
      "minimax_h3",
      state.settings,
      true,
      true
    )).resolves.toBe(true);

    expect(current.freeMemory).toHaveBeenCalledTimes(2);
    expect(current.getPerformanceMetrics).toHaveBeenCalledTimes(6);
    expect(current.restartLocalService).not.toHaveBeenCalled();
  });

  it("resolves the claim-time H3 VAE backend from the dependency scan", async () => {
    const state = createDefaultState();
    state.settings = settings({ h3VideoVaeMode: "auto" });
    const scanEnvironment = vi.fn(async () => ({
      modelProfiles: [{
        components: [{
          expected: "vae/minimax_h3_video_vae_int8_convrot.safetensors",
          matches: [],
          found: true
        }]
      }]
    } as unknown as EnvironmentScanResult));
    const current = runtimeFixture(state, {
      scanEnvironment
    });

    await expect(current.service.resolveH3VideoVaeModeForTask(
      {} as QueueTask,
      state.settings
    )).resolves.toBe("int8-convrot");
    expect(scanEnvironment).toHaveBeenCalledWith(state.settings, "dependencies");
  });

  it("uses the runtime stop path for cancellation cleanup and preserves lifecycle guards", async () => {
    const state = createDefaultState();
    state.settings = settings();
    const task = { id: "task-cancel", status: "cancelled" } as QueueTask;
    state.queue = [task];
    state.queueLifecycle = "cancelling";
    state.queueLifecycleTaskId = task.id;
    const current = runtimeFixture(state);

    await current.service.cleanupCancelledTask(task.id, state.settings, null);

    expect(current.forceStopComfyProcesses).toHaveBeenCalledWith(state.settings);
    expect(current.updateTask).toHaveBeenCalledWith(task.id, {
      status: "cancelled",
      stage: "任务已取消，ComfyUI 进程已停止",
      error: "任务已取消"
    });
  });
});
