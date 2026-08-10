import { describe, expect, it } from "vitest";
import type { HistoryAsset, QueueTask } from "../src/types";
import { moveWaitingTask, syncQueueVideoInputPaths } from "../src/core/queue";

function task(
  id: string,
  modelId: string,
  status: QueueTask["status"] = "waiting"
): QueueTask {
  return {
    id,
    taskType: "generation",
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
    fps: 24,
    frameInterpolation: "off",
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

  it("syncs queued video inputs to the migrated history version path", () => {
    const history = [{
      id: "asset-1",
      versions: [{
        id: "version-1",
        files: [{
          filename: "clip.mp4",
          subfolder: "",
          type: "output",
          absolutePath: "C:\\ComfyUI\\output\\Videos\\clip.mp4"
        }]
      }]
    }] as HistoryAsset[];
    const queue = [{
      id: "upscale-1",
      taskType: "upscale",
      status: "waiting",
      sourceAssetId: "asset-1",
      sourceVersionId: "version-1",
      sourceFilePath: "C:\\ComfyUI\\output\\clip.mp4"
    }] as QueueTask[];

    const synced = syncQueueVideoInputPaths(queue, history);
    expect(synced[0]?.taskType === "upscale" ? synced[0].sourceFilePath : "").toBe(
      "C:\\ComfyUI\\output\\Videos\\clip.mp4"
    );
  });
});
