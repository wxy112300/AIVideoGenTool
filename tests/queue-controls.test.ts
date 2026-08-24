import type { IpcMain } from "electron";
import { describe, expect, it, vi } from "vitest";
import { createDefaultDraft, createDefaultState } from "../src/core/defaults";
import { queueTaskFromDraft } from "../src/core/queue-task-factory";
import { registerQueueMutationIpc } from "../electron/queue-ipc";
import { cleanupCancelledQueueTask } from "../electron/queue-recovery";
import { QueueWorkerController, registerQueueControlIpc } from "../electron/queue-worker";
import type { AppState, QueueTask } from "../src/types";

type Handler = (...args: unknown[]) => Promise<unknown>;

function fakeIpc(): { ipc: IpcMain; handlers: Map<string, Handler> } {
  const handlers = new Map<string, Handler>();
  const ipc = {
    handle(channel: string, handler: Handler) {
      handlers.set(channel, handler);
    }
  } as unknown as IpcMain;
  return { ipc, handlers };
}

function fakeStore(state: AppState) {
  return {
    get: () => state,
    update: async (mutator: (next: AppState) => void) => {
      mutator(state);
      return state;
    }
  } as never;
}

function queuedTask(state: AppState) {
  return queueTaskFromDraft(
    { ...createDefaultDraft(), workflowPath: "workflow.json" },
    state,
    {
      now: () => new Date("2026-08-18T12:00:00.000Z"),
      id: () => "queue-task-1",
      random: () => 0.5
    }
  );
}

describe("queue rapid-operation guards", () => {
  it("finishes cancellation cleanup when ComfyUI is already offline", async () => {
    const state = createDefaultState();
    const task = queuedTask(state);
    task.status = "cancelled";
    state.queue = [task];
    const updateTask = vi.fn(async (_taskId: string, patch: Partial<QueueTask>) => {
      Object.assign(task, patch);
      return state;
    });

    await cleanupCancelledQueueTask(
      {
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
        updateTask,
        getComfyRuntimeState: () => ({
          phase: "stopped", ownership: "none", endpoint: "http://127.0.0.1:8188",
          message: "未连接", updatedAt: new Date().toISOString(), operationId: 1
        })
      },
      task.id,
      state.settings,
      null
    );

    expect(task.stage).toBe("任务已取消，ComfyUI 未连接");
    expect(task.error).toBe("任务已取消");
    expect(updateTask).toHaveBeenCalledOnce();
  });

  it("does not let an old cancellation cleanup undo a reset", async () => {
    const state = createDefaultState();
    const task = queuedTask(state);
    task.status = "waiting";
    state.queue = [task];
    const updateTask = vi.fn(async (_taskId: string, patch: Partial<QueueTask>) => {
      Object.assign(task, patch);
      return state;
    });

    await cleanupCancelledQueueTask(
      {
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
        updateTask,
        getComfyRuntimeState: () => ({
          phase: "stopped", ownership: "none", endpoint: "http://127.0.0.1:8188",
          message: "未连接", updatedAt: new Date().toISOString(), operationId: 1
        }),
        isCancellationCurrent: () => false
      },
      task.id,
      state.settings,
      null
    );

    expect(task.status).toBe("waiting");
    expect(updateTask).not.toHaveBeenCalled();
  });

  it("waits for an in-flight ComfyUI startup instead of reporting that it exited", async () => {
    const state = createDefaultState();
    const task = queuedTask(state);
    task.status = "cancelled";
    state.queue = [task];
    let finishStartup!: (runtime: ReturnType<NonNullable<Parameters<typeof cleanupCancelledQueueTask>[0]["getComfyRuntimeState"]>>) => void;
    const startupSettled = new Promise<ReturnType<NonNullable<Parameters<typeof cleanupCancelledQueueTask>[0]["getComfyRuntimeState"]>>>((resolve) => {
      finishStartup = resolve;
    });
    const updateTask = vi.fn(async (_taskId: string, patch: Partial<QueueTask>) => {
      Object.assign(task, patch);
      return state;
    });

    const cleanup = cleanupCancelledQueueTask(
      {
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
        updateTask,
        getComfyRuntimeState: () => ({
          phase: "starting", ownership: "app", endpoint: "http://127.0.0.1:8188",
          message: "启动中", updatedAt: new Date().toISOString(), operationId: 2
        }),
        waitForComfyRuntimeSettled: async () => startupSettled,
        hasSubmittedPrompt: () => false
      },
      task.id,
      { ...state.settings, safeCancel: false },
      Promise.resolve()
    );

    await Promise.resolve();
    expect(updateTask).not.toHaveBeenCalled();
    finishStartup({
      phase: "ready", ownership: "app", endpoint: "http://127.0.0.1:8188",
      message: "已就绪", updatedAt: new Date().toISOString(), operationId: 2
    });
    await cleanup;
    expect(task.stage).not.toContain("已退出");
  });

  it("restarts ComfyUI when the submitted prompt remains active after interruption", async () => {
    const state = createDefaultState();
    const task = queuedTask(state);
    task.status = "cancelled";
    task.comfyPromptId = "prompt-still-running";
    state.queue = [task];
    const interruptComfyUi = vi.fn(async () => undefined);
    const freeComfyMemory = vi.fn(async () => undefined);
    const restartComfyUi = vi.fn(async () => ({ ok: true, message: "restarted" }));
    const updateTask = vi.fn(async (_taskId: string, patch: Partial<QueueTask>) => {
      Object.assign(task, patch);
      return state;
    });

    await cleanupCancelledQueueTask(
      {
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
        updateTask,
        getComfyRuntimeState: () => ({
          phase: "ready", ownership: "app", endpoint: "http://127.0.0.1:8188",
          message: "已就绪", updatedAt: new Date().toISOString(), operationId: 3
        }),
        getSubmittedPromptId: () => task.comfyPromptId,
        waitForSubmittedPromptToStop: async () => false,
        interruptComfyUi,
        freeComfyMemory,
        restartComfyUi
      },
      task.id,
      { ...state.settings, safeCancel: true },
      Promise.resolve()
    );

    expect(interruptComfyUi).toHaveBeenCalledOnce();
    expect(freeComfyMemory).not.toHaveBeenCalled();
    expect(restartComfyUi).toHaveBeenCalledOnce();
    expect(task.stage).toBe("任务已取消，ComfyUI 已后台重启");
  });

  it("rejects reset while cancellation cleanup is still running", async () => {
    const state = createDefaultState();
    const task = queuedTask(state);
    task.status = "cancelled";
    state.queue = [task];
    state.queueLifecycle = "cleaning";
    state.queueLifecycleTaskId = task.id;
    const { ipc, handlers } = fakeIpc();

    registerQueueMutationIpc({
      ipc,
      store: fakeStore(state),
      logger: { info: vi.fn() } as never,
      sendState: vi.fn()
    });

    await expect(handlers.get("queue:reset")!({}, task.id))
      .rejects.toThrow("任务仍在清理中");
    expect(state.queue[0]?.status).toBe("cancelled");
  });

  it("resets a stale cleaning state when no cleanup worker remains", async () => {
    const state = createDefaultState();
    const task = queuedTask(state);
    task.status = "cancelled";
    state.queue = [task];
    state.queueLifecycle = "cleaning";
    state.queueLifecycleTaskId = task.id;
    const { ipc, handlers } = fakeIpc();

    registerQueueMutationIpc({
      ipc,
      store: fakeStore(state),
      logger: { info: vi.fn() } as never,
      sendState: vi.fn(),
      isQueueCleanupActive: () => false
    });

    const result = await handlers.get("queue:reset")!({}, task.id) as AppState;
    expect(result.queue[0]?.status).toBe("waiting");
    expect(result.queueLifecycle).toBe("idle");
    expect(result.queueLifecycleTaskId).toBeUndefined();
  });

  it("keeps reset blocked while an error lifecycle still has an active worker", async () => {
    const state = createDefaultState();
    const task = queuedTask(state);
    task.status = "failed";
    state.queue = [task];
    state.queueLifecycle = "error";
    state.queueLifecycleTaskId = task.id;
    const { ipc, handlers } = fakeIpc();

    registerQueueMutationIpc({
      ipc,
      store: fakeStore(state),
      logger: { info: vi.fn() } as never,
      sendState: vi.fn(),
      isQueueCleanupActive: () => true
    });

    await expect(handlers.get("queue:reset")!({}, task.id))
      .rejects.toThrow("任务仍在清理中");
    expect(state.queue[0]?.status).toBe("failed");
  });

  it("blocks a second start while the previous worker or cleanup is active", async () => {
    const state = createDefaultState();
    const task = queuedTask(state);
    state.queue = [task];
    state.queueLifecycle = "cleaning";
    const executeQueue = vi.fn(async () => undefined);
    const { ipc, handlers } = fakeIpc();

    registerQueueControlIpc({
      ipc,
      store: fakeStore(state),
      logger: { info: vi.fn() } as never,
      worker: new QueueWorkerController(),
      sendState: vi.fn(),
      executeQueue,
      nativePromptBusy: () => false,
      settingsForTask: (_task, settings) => settings,
      cleanupCancelledTask: async () => undefined,
      updateTask: async () => state
    });

    const result = await handlers.get("queue:start")!({}) as AppState;
    expect(result.queueLifecycle).toBe("cleaning");
    expect(executeQueue).not.toHaveBeenCalled();
  });

  it("returns immediately while cancellation cleanup continues in the background", async () => {
    const state = createDefaultState();
    const task = queuedTask(state);
    task.status = "running";
    state.queue = [task];
    state.queueLifecycle = "running";
    let finishCleanup!: () => void;
    const cleanupDone = new Promise<void>((resolve) => { finishCleanup = resolve; });
    const cleanupCancelledTask = vi.fn(async (taskId: string) => {
      await cleanupDone;
      const current = state.queue.find((item) => item.id === taskId);
      if (current) current.status = "cancelled";
    });
    const { ipc, handlers } = fakeIpc();

    registerQueueControlIpc({
      ipc,
      store: fakeStore(state),
      logger: { info: vi.fn(), error: vi.fn() } as never,
      worker: new QueueWorkerController(),
      sendState: vi.fn(),
      executeQueue: async () => undefined,
      nativePromptBusy: () => false,
      settingsForTask: (_task, settings) => settings,
      cleanupCancelledTask,
      updateTask: async () => state
    });

    const result = await handlers.get("queue:cancel")!({}, task.id) as AppState;
    await vi.waitFor(() => expect(cleanupCancelledTask).toHaveBeenCalledOnce());
    expect(cleanupCancelledTask).toHaveBeenCalledOnce();
    expect(result.queue[0]?.status).toBe("cancelled");
    expect(["cancelling", "cleaning"]).toContain(state.queueLifecycle);
    finishCleanup();
    await vi.waitFor(() => {
      expect(state.queue[0]?.status).toBe("cancelled");
      expect(state.queueLifecycle).toBe("idle");
    });
  });

  it("aborts the active worker and keeps cleanup lifecycle until cleanup settles", async () => {
    const state = createDefaultState();
    const task = queuedTask(state);
    task.status = "running";
    state.queue = [task];
    state.queueRunning = true;
    state.queueLifecycle = "running";
    let releaseWorker!: () => void;
    const workerDone = new Promise<void>((resolve) => { releaseWorker = resolve; });
    const worker = new QueueWorkerController();
    worker.start(async () => workerDone);
    const activeController = worker.beginTask();
    let finishCleanup!: () => void;
    const cleanupDone = new Promise<void>((resolve) => { finishCleanup = resolve; });
    const cleanupCancelledTask = vi.fn(async () => {
      await cleanupDone;
    });
    const { ipc, handlers } = fakeIpc();

    registerQueueControlIpc({
      ipc,
      store: fakeStore(state),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
      worker,
      sendState: vi.fn(),
      executeQueue: async () => undefined,
      nativePromptBusy: () => false,
      settingsForTask: (_task, settings) => settings,
      cleanupCancelledTask,
      updateTask: async () => state
    });

    const result = await handlers.get("queue:cancel")!({}, task.id) as AppState;
    expect(result.queue[0]?.status).toBe("cancelled");
    expect(activeController.signal.aborted).toBe(true);
    await vi.waitFor(() => {
      expect(state.queueLifecycle).toBe("cleaning");
      expect(cleanupCancelledTask).toHaveBeenCalledOnce();
      expect(worker.cleanupWorker).not.toBeNull();
    });

    releaseWorker();
    await vi.waitFor(() => expect(worker.runningWorker).toBeNull());
    finishCleanup();
    await vi.waitFor(() => {
      expect(state.queueLifecycle).toBe("idle");
      expect(worker.cleanupWorker).toBeNull();
    });
  });

  it("does not overlap a paused worker and resumes the same queue session", async () => {
    const state = createDefaultState();
    const task = queuedTask(state);
    state.queue = [task];
    state.queueStartedAt = "2026-08-20T12:00:00.000Z";
    const worker = new QueueWorkerController();
    let releaseFirst!: () => void;
    const firstRun = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const executeQueue = vi.fn()
      .mockImplementationOnce(async () => firstRun)
      .mockResolvedValue(undefined);
    const { ipc, handlers } = fakeIpc();

    registerQueueControlIpc({
      ipc,
      store: fakeStore(state),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
      worker,
      sendState: vi.fn(),
      executeQueue,
      nativePromptBusy: () => false,
      settingsForTask: (_task, settings) => settings,
      cleanupCancelledTask: async () => undefined,
      updateTask: async () => state
    });

    const started = await handlers.get("queue:start")!({}) as AppState;
    expect(started.queueRunning).toBe(true);
    expect(started.queueStartedAt).toBe("2026-08-20T12:00:00.000Z");
    expect(executeQueue).toHaveBeenCalledOnce();

    const paused = await handlers.get("queue:pause")!({}) as AppState;
    expect(paused.queueRunning).toBe(false);
    expect(paused.queueLifecycle).toBe("idle");
    expect(paused.queueStartedAt).toBe("2026-08-20T12:00:00.000Z");

    const blockedResume = await handlers.get("queue:start")!({}) as AppState;
    expect(blockedResume.queueRunning).toBe(false);
    expect(executeQueue).toHaveBeenCalledOnce();
    expect(worker.runningWorker).not.toBeNull();

    releaseFirst();
    await vi.waitFor(() => expect(worker.runningWorker).toBeNull());

    const resumed = await handlers.get("queue:start")!({}) as AppState;
    expect(resumed.queueRunning).toBe(true);
    expect(resumed.queueStartedAt).toBe("2026-08-20T12:00:00.000Z");
    expect(executeQueue).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(worker.runningWorker).toBeNull());
  });
});

describe("queue drag reorder IPC", () => {
  it("commits one absolute waiting position without crossing the active task", async () => {
    const state = createDefaultState();
    const running = queuedTask(state);
    const first = queuedTask(state);
    const second = queuedTask(state);
    const third = queuedTask(state);
    running.id = "running";
    running.status = "running";
    first.id = "first";
    second.id = "second";
    third.id = "third";
    state.queue = [running, first, second, third];
    const { ipc, handlers } = fakeIpc();

    registerQueueMutationIpc({
      ipc,
      store: fakeStore(state),
      logger: { info: vi.fn() } as never,
      sendState: vi.fn()
    });

    const result = await handlers.get("queue:reorder")!({}, "third", 0) as AppState;

    expect(result.queue.map((task) => task.id)).toEqual([
      "running", "third", "first", "second"
    ]);
  });
});
