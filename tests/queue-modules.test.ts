import { describe, expect, it, vi } from "vitest";
import { createDefaultDraft, createDefaultState } from "../src/core/defaults";
import { queueTaskFromDraft } from "../src/core/queue-task-factory";
import { persistVideoHistoryResult } from "../electron/queue-history";
import { QueueWorkerController } from "../electron/queue-worker";

describe("queue history persistence", () => {
  it("atomically removes a completed generation task and records its history snapshot", () => {
    const state = createDefaultState();
    const task = queueTaskFromDraft({
      ...createDefaultDraft(),
      startImagePath: "C:/input/start.png",
      workflowPath: "workflow.json",
      seed: 42
    }, state, {
      now: () => new Date("2026-08-12T12:00:00.000Z"),
      id: () => "task-1",
      random: () => 0.5
    });
    state.queue = [task];

    persistVideoHistoryResult(state, {
      task,
      completedAt: "2026-08-12T12:30:00.000Z",
      promptId: "prompt-1",
      comfyOutputs: { output: true },
      files: [{
        filename: task.outputFilename,
        subfolder: "Videos",
        type: "output",
        absolutePath: `C:/output/Videos/${task.outputFilename}`
      }],
      id: (() => {
        const ids = ["version-1", "asset-1"];
        return () => ids.shift()!;
      })()
    });

    expect(state.queue).toHaveLength(0);
    expect(state.history[0]).toMatchObject({
      id: "asset-1",
      taskId: "task-1",
      defaultVersionId: "version-1",
      seed: 42,
      comfyPromptId: "prompt-1"
    });
    expect(state.history[0]?.versions[0]).toMatchObject({
      id: "version-1",
      seed: 42,
      comfyPromptId: "prompt-1"
    });
  });
});

describe("queue worker lifecycle", () => {
  it("runs only one worker and clears task state after completion", async () => {
    const controller = new QueueWorkerController();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const execute = vi.fn(() => pending);

    controller.start(execute);
    controller.start(execute);
    const taskController = controller.beginTask();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(controller.activeController).toBe(taskController);

    controller.abort(new Error("cancel"));
    expect(taskController.signal.aborted).toBe(true);
    release();
    await controller.runningWorker;
    expect(controller.runningWorker).toBeNull();
    expect(controller.activeController).toBeNull();
  });
});
