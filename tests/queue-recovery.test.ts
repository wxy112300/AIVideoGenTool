import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultDraft, createDefaultState } from "../src/core/defaults";
import { queueTaskFromDraft } from "../src/core/queue-task-factory";
import { recoverQueueFailure } from "../electron/queue-recovery";
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

    await recoverQueueFailure({
      store: store as never,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
      sendState: (snapshot) => snapshots.push(snapshot),
      updateTask,
      settingsForTask: (_task, settings) => settings,
      onRuntimeRestarted,
      errorMeta: () => ({})
    }, {
      task,
      error: new Error("CUDA out of memory"),
      aborted: false,
      stalled: false
    });

    expect(mocks.restartLocalService).toHaveBeenCalledOnce();
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
});
