import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultDraft, createDefaultState } from "../src/core/defaults";
import { adjustQueuePauseBoundary } from "../src/core/queue";
import { queueTaskFromDraft } from "../src/core/queue-task-factory";
import { recoverQueueFailure } from "../electron/queue-recovery";
import { VramPressureStallError } from "../src/core/recovery";
import type { AppState, QueueTask } from "../src/types";

const mocks = vi.hoisted(() => ({
  restartLocalService: vi.fn(async () => ({ ok: true, message: "restarted" })),
  forceStopComfyProcesses: vi.fn(async () => ({ ok: true, message: "stopped" }))
}));

vi.mock("../electron/services/environment.js", () => ({
  restartLocalService: mocks.restartLocalService,
  forceStopComfyProcesses: mocks.forceStopComfyProcesses
}));

function queuedTask(state: AppState): QueueTask {
  return queueTaskFromDraft(
    { ...createDefaultDraft(), workflowPath: "workflow.json" },
    state,
    {
      now: () => new Date("2026-08-27T12:00:00.000Z"),
      id: () => "recovery-task",
      random: () => 0.5
    }
  );
}

describe("queue recovery lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("schedules an automatic retry without resuming a paused queue", async () => {
    const state = createDefaultState();
    const task = queuedTask(state);
    task.status = "running";
    state.queue = [task];
    state.queueRunning = false;
    state.settings.autoRetryFailedTasks = true;
    state.settings.autoRetryCount = 2;
    const snapshots: AppState[] = [];
    const store = {
      get: () => structuredClone(state),
      update: async (mutator: (current: AppState) => void) => {
        mutator(state);
        return structuredClone(state);
      }
    };
    const updateTask = async (taskId: string, patch: Partial<QueueTask>): Promise<AppState> => {
      const queued = state.queue.find((item) => item.id === taskId);
      if (queued) Object.assign(queued, patch);
      return structuredClone(state);
    };
    const onRuntimeRestarted = vi.fn();
    const interruptComfyUi = vi.fn(async () => undefined);
    const freeComfyMemory = vi.fn(async () => undefined);

    await recoverQueueFailure({
      store: store as never,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
      sendState: (snapshot) => snapshots.push(snapshot),
      updateTask,
      settingsForTask: (_task, settings) => settings,
      onRuntimeRestarted,
      interruptComfyUi,
      freeComfyMemory,
      errorMeta: () => ({})
    }, {
      task,
      error: new Error("CUDA out of memory"),
      aborted: false,
      stalled: false
    });

    expect(mocks.restartLocalService).toHaveBeenCalledOnce();
  expect(interruptComfyUi).toHaveBeenCalledOnce();
  expect(freeComfyMemory).toHaveBeenCalledOnce();
    expect(onRuntimeRestarted).toHaveBeenCalledOnce();
    expect(state.queueRunning).toBe(false);
    expect(state.queue[0]).toMatchObject({
      id: task.id,
      status: "waiting",
      automaticRetryAttempt: 1,
      comfyPromptId: undefined
    });
    expect(snapshots.at(-1)?.queueRunning).toBe(false);
  });

  it("updates the H3 policy snapshot when CUDA recovery falls back Attention", async () => {
    const state = createDefaultState();
    const task = queuedTask(state);
    task.status = "running";
    state.queue = [task];
    const store = {
      get: () => structuredClone(state),
      update: async (mutator: (current: AppState) => void) => {
        mutator(state);
        return structuredClone(state);
      }
    };
    const updateTask = async (taskId: string, patch: Partial<QueueTask>): Promise<AppState> => {
      const queued = state.queue.find((item) => item.id === taskId);
      if (queued) Object.assign(queued, patch);
      return structuredClone(state);
    };

    await recoverQueueFailure({
      store: store as never,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
      sendState: vi.fn(),
      updateTask,
      settingsForTask: (_task, settings) => settings,
      errorMeta: () => ({})
    }, {
      task,
      error: new Error("illegal memory access"),
      aborted: false,
      stalled: false
    });

    expect(state.queue[0]).toMatchObject({
      attentionMode: "sage-triton",
      h3ExecutionPolicy: {
        attentionMode: "sage-triton",
        attentionOwner: "sage",
        reasons: ["attention-fallback:sage->sage-triton"]
      }
    });
  });

  it("restores a retried task without moving the divider past the next batch task", async () => {
    const state = createDefaultState();
    const failed = queuedTask(state);
    const second = queuedTask(state);
    const third = queuedTask(state);
    const deferred = queuedTask(state);
    failed.id = "failed-above-divider";
    second.id = "second-above-divider";
    third.id = "third-above-divider";
    deferred.id = "deferred-below-divider";
    failed.status = "running";
    state.queue = [failed, second, third, deferred];
    state.queueRunning = true;
    state.queuePauseBoundary = 3;
    state.settings.autoRetryFailedTasks = true;
    state.settings.autoRetryCount = 2;
    const snapshots: AppState[] = [];
    const store = {
      get: () => structuredClone(state),
      update: async (mutator: (current: AppState) => void) => {
        mutator(state);
        return structuredClone(state);
      }
    };
    const updateTask = async (taskId: string, patch: Partial<QueueTask>): Promise<AppState> => {
      const previousQueue = state.queue.map((item) => ({ ...item }));
      const previousBoundary = state.queuePauseBoundary;
      const queued = state.queue.find((item) => item.id === taskId);
      if (queued) Object.assign(queued, patch);
      state.queuePauseBoundary = adjustQueuePauseBoundary(
        previousQueue,
        previousBoundary,
        state.queue
      );
      return structuredClone(state);
    };

    await recoverQueueFailure({
      store: store as never,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
      sendState: (snapshot) => snapshots.push(snapshot),
      updateTask,
      settingsForTask: (_task, settings) => settings,
      errorMeta: () => ({})
    }, {
      task: failed,
      error: new Error("CUDA out of memory"),
      aborted: false,
      stalled: false
    });

    expect(state.queuePauseBoundary).toBe(3);
    expect(state.queue.map((item) => item.id)).toEqual([
      failed.id,
      second.id,
      third.id,
      deferred.id
    ]);
    expect(state.queue[0]).toMatchObject({ status: "waiting" });
    expect(snapshots.at(-1)?.queuePauseBoundary).toBe(3);
  });

  it("retries a watchdog trigger even when ordinary automatic retries are disabled", async () => {
    const state = createDefaultState();
    const task = queuedTask(state);
    task.status = "running";
    task.vramStallWatchdogMinutesApplied = 5;
    state.queue = [task];
    state.settings.autoRetryFailedTasks = false;
    state.settings.autoRetryCount = 1;
    const store = {
      get: () => structuredClone(state),
      update: async (mutator: (current: AppState) => void) => {
        mutator(state);
        return structuredClone(state);
      }
    };
    const updateTask = async (taskId: string, patch: Partial<QueueTask>): Promise<AppState> => {
      const queued = state.queue.find((item) => item.id === taskId);
      if (queued) Object.assign(queued, patch);
      return structuredClone(state);
    };

    await recoverQueueFailure({
      store: store as never,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
      sendState: vi.fn(),
      updateTask,
      settingsForTask: (_task, settings) => settings,
      errorMeta: () => ({})
    }, {
      task,
      error: new VramPressureStallError("watchdog fixture"),
      aborted: false,
      stalled: false
    });

    expect(mocks.forceStopComfyProcesses).toHaveBeenCalledOnce();
    expect(mocks.restartLocalService).toHaveBeenCalledOnce();
    expect(state.queue[0]).toMatchObject({
      status: "waiting",
      automaticRetryAttempt: 1,
      vramStallWatchdogMinutesApplied: 5
    });
  });

  it("does not stop or restart a remote or externally managed endpoint for a watchdog error", async () => {
    const state = createDefaultState();
    state.settings.comfyUrl = "https://remote.example.test";
    const task = queuedTask(state);
    task.status = "running";
    task.vramStallWatchdogMinutesApplied = 5;
    state.queue = [task];
    const store = {
      get: () => structuredClone(state),
      update: async (mutator: (current: AppState) => void) => {
        mutator(state);
        return structuredClone(state);
      }
    };
    const updateTask = async (taskId: string, patch: Partial<QueueTask>): Promise<AppState> => {
      const queued = state.queue.find((item) => item.id === taskId);
      if (queued) Object.assign(queued, patch);
      return structuredClone(state);
    };

    await recoverQueueFailure({
      store: store as never,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
      sendState: vi.fn(),
      updateTask,
      getComfyRuntimeState: () => ({
        phase: "ready",
        ownership: "external",
        endpoint: state.settings.comfyUrl,
        message: "external",
        updatedAt: new Date().toISOString(),
        operationId: 1
      }),
      settingsForTask: (_task, settings) => settings,
      errorMeta: () => ({})
    }, {
      task,
      error: new VramPressureStallError("watchdog fixture"),
      aborted: false,
      stalled: false
    });

    expect(mocks.forceStopComfyProcesses).not.toHaveBeenCalled();
    expect(mocks.restartLocalService).not.toHaveBeenCalled();
    expect(state.queue[0]).toMatchObject({
      status: "failed",
      error: expect.stringContaining("不是应用管理的本地运行时")
    });
  });

});
