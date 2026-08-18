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
        isComfyUiRunning: async () => false
      },
      task.id,
      state.settings,
      null
    );

    expect(task.stage).toBe("任务已取消，ComfyUI 已退出");
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
        isComfyUiRunning: async () => false,
        isCancellationCurrent: () => false
      },
      task.id,
      state.settings,
      null
    );

    expect(task.status).toBe("waiting");
    expect(updateTask).not.toHaveBeenCalled();
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
});