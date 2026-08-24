import { describe, expect, it } from "vitest";
import { createDefaultDraft, createDefaultState } from "../src/core/defaults";
import { queueTaskFromDraft } from "../src/core/queue-task-factory";
import { reorderWaitingTask } from "../src/core/queue";
import type { QueueTask } from "../src/types";

function task(state: ReturnType<typeof createDefaultState>, id: string, status: QueueTask["status"] = "waiting"): QueueTask {
  const next = queueTaskFromDraft(
    { ...createDefaultDraft(), workflowPath: "workflow.json" },
    state,
    {
      now: () => new Date("2026-08-24T12:00:00.000Z"),
      id: () => id,
      random: () => 0.5
    }
  );
  next.id = id;
  next.status = status;
  return next;
}

describe("reorderWaitingTask", () => {
  it("reorders only waiting tasks while preserving non-waiting slots", () => {
    const state = createDefaultState();
    const running = task(state, "running", "running");
    const first = task(state, "first");
    const completed = task(state, "completed", "completed");
    const second = task(state, "second");
    const third = task(state, "third");

    const reordered = reorderWaitingTask(
      [running, first, completed, second, third],
      "third",
      0
    );

    expect(reordered.map((item) => item.id)).toEqual([
      "running", "third", "completed", "first", "second"
    ]);
  });

  it("does not allow stale waiting records before the running boundary to move", () => {
    const state = createDefaultState();
    const stale = task(state, "stale");
    const running = task(state, "running", "running");
    const first = task(state, "first");
    const second = task(state, "second");

    const reordered = reorderWaitingTask(
      [stale, running, first, second],
      "stale",
      1
    );

    expect(reordered.map((item) => item.id)).toEqual([
      "stale", "running", "first", "second"
    ]);
  });

  it("clamps a drop beyond the end of the waiting list", () => {
    const state = createDefaultState();
    const first = task(state, "first");
    const second = task(state, "second");
    const third = task(state, "third");

    const reordered = reorderWaitingTask([first, second, third], "first", 99);

    expect(reordered.map((item) => item.id)).toEqual(["second", "third", "first"]);
  });
});
