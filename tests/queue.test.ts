import { describe, expect, it } from "vitest";
import type { HistoryAsset, QueueTask } from "../src/types";
import {
  duplicateQueueTask,
  moveWaitingTask,
  removeQueueTask,
  resetQueueTask,
  syncQueueVideoInputPaths,
  updateQueuedUpscaleTask
} from "../src/core/queue";
import {
  extensionTaskFromDraft,
  imageTaskFromDraft,
  queueTaskFromDraft,
  type QueueTaskFactoryClock
} from "../src/core/queue-task-factory";
import {
  createDefaultDraft,
  createDefaultImageEditDraft,
  createDefaultState
} from "../src/core/defaults";

function clock(ids: string[] = ["task-id"]): QueueTaskFactoryClock {
  let index = 0;
  return {
    now: () => new Date("2026-08-12T12:00:00.000Z"),
    id: () => ids[index++] ?? `id-${index}`,
    random: () => 0.25
  };
}

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

describe("queue execution snapshots", () => {
  it("copies a video draft into an immutable generation snapshot", () => {
    const state = createDefaultState();
    const draft = {
      ...createDefaultDraft(),
      startImagePath: "start.png",
      workflowPath: "workflow.json",
      seed: null,
      h3ReferenceSlots: [{ id: "slot-1", kind: "image" as const, mediaPath: "ref.png" }]
    };
    const queued = queueTaskFromDraft(draft, state, clock());

    draft.h3ReferenceSlots[0]!.mediaPath = "changed.png";
    expect(queued).toMatchObject({
      id: "task-id",
      status: "waiting",
      modelId: "minimax_h3_fl2va",
      seed: Math.floor(0.25 * Number.MAX_SAFE_INTEGER),
      promptVersion: 1,
      createdAt: "2026-08-12T12:00:00.000Z"
    });
    expect(queued.h3ReferenceSlots[0]?.mediaPath).toBe("ref.png");
  });

  it("builds all image runs and clones markup into the queue snapshot", () => {
    const draft = {
      ...createDefaultImageEditDraft(),
      pictures: [{
        id: "picture-1",
        pictureNumber: 1,
        absolutePath: "input.png",
        width: 1024,
        height: 768,
        markup: {
          documentPath: "markup.json",
          renderedPath: "markup.png",
          objectCount: 1,
          prompt: "marked area"
        }
      }],
      promptVersions: [{ id: "prompt-1", label: "original", text: "edit it", createdAt: "now" }],
      outputCount: 2,
      seed: 42
    };
    const queued = imageTaskFromDraft(
      draft,
      "qwen.safetensors",
      { root: "C:/output", directory: "C:/output/Images", subfolder: "Images" },
      clock(["task-image", "project-image", "run-1", "run-2"])
    );

    draft.pictures[0]!.markup!.prompt = "changed";
    expect(queued.runs.map((run) => run.seed)).toEqual([42, 42]);
    expect(queued.runs.map((run) => run.id)).toEqual(["run-1", "run-2"]);
    expect(queued.pictures[0]?.markup?.prompt).toBe("marked area");
    expect(queued.imageOutputSubfolder).toBe("Images");
  });

  it("scopes R2V extension policy while preserving its source snapshot", () => {
    const state = createDefaultState();
    const draft = {
      ...createDefaultDraft(),
      inputMode: "video" as const,
      modelId: "minimax_h3_ref2va",
      sourceVideoPath: "source.mp4",
      sourceVideoDuration: 12,
      trimEndSeconds: 12,
      workflowPath: "extend.json",
      spectrumMode: "balanced" as const
    };
    const queued = extensionTaskFromDraft(draft, state, clock());

    expect(queued.spectrumMode).toBe("off");
    expect(queued.maxGeneratedFrames).toBe(362);
    expect(queued.sourceVideoPath).toBe("source.mp4");
  });
});

describe("queue mutations", () => {
  it("keeps a running task when remove is requested", () => {
    expect(removeQueueTask([task("run", "h3", "running"), task("wait", "h3")], "run"))
      .toHaveLength(2);
    expect(removeQueueTask([task("run", "h3", "running"), task("wait", "h3")], "wait"))
      .toHaveLength(1);
  });

  it("resets failed upscale edits and clears stale runtime state", () => {
    const failed = {
      ...task("upscale", "seedvr2", "failed"),
      taskType: "upscale" as const,
      sourceFilename: "source.mp4",
      sourceFilePath: "source.mp4",
      sourceAssetId: "asset",
      sourceVersionId: "version",
      sourceWidth: 1280,
      sourceHeight: 720,
      targetWidth: 1920,
      targetHeight: 1080,
      tileMode: "safe" as const,
      faceRestore: false,
      error: "failed",
      comfyPromptId: "prompt"
    };
    const updated = updateQueuedUpscaleTask([failed], "upscale", {
      targetWidth: 2560,
      targetHeight: 1440,
      modelId: "flashvsr",
      workflowPath: "builtin:upscale/flashvsr",
      tileMode: "auto",
      faceRestore: true,
      outputFilename: "updated.mp4"
    }, "updated")[0];

    expect(updated).toMatchObject({ status: "waiting", progress: 0, updatedAt: "updated" });
    expect(updated?.error).toBeUndefined();
    expect(updated?.comfyPromptId).toBeUndefined();
  });

  it("duplicates snapshots with a new identity and optionally a new seed", () => {
    const state = createDefaultState();
    state.queue = [task("source", "minimax_h3_fl2va")];
    const duplicated = duplicateQueueTask(state, "source", clock(["copy-id"]));
    expect(duplicated).toHaveLength(2);
    expect(duplicated[1]).toMatchObject({ id: "copy-id", status: "waiting" });
    expect(duplicated[1]?.seed).not.toBe(1);
  });

  it("only resets failed or cancelled tasks", () => {
    const failed = { ...task("failed", "h3", "failed"), error: "boom", progress: 80 };
    const result = resetQueueTask([failed, task("waiting", "h3")], "failed", "reset-at");
    expect(result.reset).toBe(true);
    expect(result.queue[0]).toMatchObject({ status: "waiting", progress: 0, updatedAt: "reset-at" });
    expect(result.queue[0]?.error).toBeUndefined();
  });
});
