import { describe, expect, it } from "vitest";
import type { QueueTask } from "../src/types";
import { moveWaitingTask, optimizeWaitingTasks } from "../src/core/queue";

function task(
  id: string,
  modelId: string,
  status: QueueTask["status"] = "waiting"
): QueueTask {
  return {
    id,
    status,
    createdAt: id,
    updatedAt: id,
    outputFilename: `${id}.mp4`,
    prompt: id,
    promptVersion: 1,
    startImagePath: "start.png",
    endImagePath: "",
    modelId,
    workflowPath: `${modelId}.json`,
    ratio: "16:9",
    resolution: 480,
    duration: 5,
    motion: "natural",
    seed: 1,
    keepSeedOnCopy: false
  };
}

describe("queue ordering", () => {
  it("moves waiting tasks without crossing a running task", () => {
    const queue = [
      task("running", "wan", "running"),
      task("a", "wan"),
      task("failed", "wan", "failed"),
      task("b", "sulphur")
    ];
    expect(moveWaitingTask(queue, "b", -1).map((item) => item.id)).toEqual([
      "running",
      "b",
      "failed",
      "a"
    ]);
  });

  it("groups waiting tasks and keeps non-waiting slots fixed", () => {
    const queue = [
      task("z1", "wan"),
      task("running", "sulphur", "running"),
      task("a1", "hunyuan"),
      task("z2", "wan"),
      task("a2", "hunyuan")
    ];
    const optimized = optimizeWaitingTasks(queue);
    expect(optimized.map((item) => item.id)).toEqual([
      "a1",
      "running",
      "a2",
      "z1",
      "z2"
    ]);
  });
});
