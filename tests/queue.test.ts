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

  it("keeps an active task as a hard boundary in either direction", () => {
    const queue = [
      task("before", "wan"),
      task("running", "wan", "running"),
      task("after", "wan")
    ];
    expect(moveWaitingTask(queue, "before", 1).map((item) => item.id)).toEqual([
      "before",
      "running",
      "after"
    ]);
    expect(moveWaitingTask(queue, "after", -1).map((item) => item.id)).toEqual([
      "before",
      "running",
      "after"
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
      spectrumMode: "balanced" as const,
      spectrumModelAwareMode: "full" as const,
      h3MemoryOptimizationMode: "preserve-native" as const,
      h3MemoryOptimizationUserSet: true,
      h3MemoryChunkRows: 4096,
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
      h3LivePreview: false,
      spectrumMode: "balanced",
      spectrumModelAwareMode: "off",
      h3MemoryOptimizationMode: "off",
      h3MemoryOptimizationUserSet: false,
      h3MemoryChunkRows: 4096,
      h3MemoryExecutionPlan: expect.objectContaining({
        memory: "off",
        spectrumEnabled: true,
        allowed: true
      }),
      createdAt: "2026-08-12T12:00:00.000Z"
    });
    expect(queued.h3ReferenceSlots[0]?.mediaPath).toBe("ref.png");

    state.settings.h3LivePreview = true;
    const previewQueued = queueTaskFromDraft(draft, state, clock(["preview-task"]));
    expect(previewQueued.h3LivePreview).toBe(true);
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

  it("keeps a Z-Image text-only task runnable without a source picture", () => {
    const draft = createDefaultImageEditDraft();
    draft.modelId = "z-image-turbo";
    draft.qualityProfile = "turbo-8";
    draft.pictures = [];
    draft.promptVersions[0]!.text = "A quiet mountain village at dawn.";

    const queued = imageTaskFromDraft(
      draft,
      "z_image_turbo_bf16.safetensors",
      { root: "C:/output", directory: "C:/output/Images", subfolder: "Images" },
      clock(["task-z-image", "project-z-image", "run-z-image"])
    );

    expect(queued.pictures).toEqual([]);
    expect(queued.outputWidth).toBe(1024);
    expect(queued.outputHeight).toBe(1024);
    expect(queued.workflowPath).toBe("builtin:image/z-image-turbo");
  });

  it("snapshots an independent ratio and short-edge resolution for text-only generation", () => {
    const draft = createDefaultImageEditDraft();
    draft.modelId = "z-image-turbo";
    draft.qualityProfile = "turbo-8";
    draft.aspectRatio = "16:9";
    draft.targetResolution = 720;
    draft.pictures = [];
    draft.promptVersions[0]!.text = "A quiet mountain village at dawn.";

    const queued = imageTaskFromDraft(
      draft,
      "z_image_turbo_bf16.safetensors",
      { root: "C:/output", directory: "C:/output/Images", subfolder: "Images" },
      clock(["task-z-image-ratio", "project-z-image-ratio", "run-z-image-ratio"])
    );

    expect(queued.aspectRatio).toBe("16:9");
    expect(queued.targetResolution).toBe(720);
    expect(queued.outputWidth).toBe(1280);
    expect(queued.outputHeight).toBe(720);
  });

  it("keeps a HiDream-O1 text-only task on its native 2048 fallback", () => {
    const draft = createDefaultImageEditDraft();
    draft.modelId = "hidream-o1-image";
    draft.qualityProfile = "native";
    draft.pictures = [];
    draft.promptVersions[0]!.text = "A quiet mountain village at dawn.";

    const queued = imageTaskFromDraft(
      draft,
      "hidream_o1_image_fp8_scaled.safetensors",
      { root: "C:/output", directory: "C:/output/Images", subfolder: "Images" },
      clock(["task-hidream", "project-hidream", "run-hidream"])
    );

    expect(queued.pictures).toEqual([]);
    expect(queued.outputWidth).toBe(2048);
    expect(queued.outputHeight).toBe(2048);
    expect(queued.workflowPath).toBe("builtin:image/hidream-o1-image");
  });

  it("keeps an OmniGen2 text-only task on its native 1024 fallback", () => {
    const draft = createDefaultImageEditDraft();
    draft.modelId = "omnigen2";
    draft.qualityProfile = "native";
    draft.pictures = [];
    draft.promptVersions[0]!.text = "A quiet mountain village at dawn.";

    const queued = imageTaskFromDraft(
      draft,
      "omnigen2_fp16.safetensors",
      { root: "C:/output", directory: "C:/output/Images", subfolder: "Images" },
      clock(["task-omnigen2", "project-omnigen2", "run-omnigen2"])
    );

    expect(queued.pictures).toEqual([]);
    expect(queued.outputWidth).toBe(1024);
    expect(queued.outputHeight).toBe(1024);
    expect(queued.workflowPath).toBe("builtin:image/omnigen2");
  });

  it("never carries a hidden prompt into a promptless LaMa task snapshot", () => {
    const draft = createDefaultImageEditDraft();
    draft.modelId = "lama-inpaint";
    draft.qualityProfile = "natural";
    draft.promptVersions[0]!.text = "stale prompt from Qwen";
    draft.pictures = [{
      id: "picture-1",
      pictureNumber: 1,
      absolutePath: "input.png",
      width: 1024,
      height: 768,
      mask: {
        documentPath: "mask.json",
        maskPath: "mask.png",
        revision: 1,
        regionCount: 1,
        updatedAt: "now"
      }
    }];

    const queued = imageTaskFromDraft(
      draft,
      undefined,
      { root: "C:/output", directory: "C:/output/Images", subfolder: "Images" },
      clock(["task-lama", "project-lama", "run-lama"])
    );

    expect(queued.prompt).toBe("");
    expect(queued.promptVersion).toBe(1);
    expect(queued.outputCount).toBe(1);
    expect(queued.aspectRatio).toBe("source");
    expect(queued.outputWidth).toBe(1024);
    expect(queued.outputHeight).toBe(768);
  });

  it("forces deterministic BiRefNet cutouts to one output even when the draft count is stale", () => {
    const draft = createDefaultImageEditDraft();
    draft.modelId = "birefnet-background-removal";
    draft.outputCount = 10;
    draft.promptVersions[0]!.text = "stale prompt from an editor";
    draft.pictures = [{
      id: "picture-1",
      pictureNumber: 1,
      absolutePath: "input.png",
      width: 1024,
      height: 768
    }];

    const queued = imageTaskFromDraft(
      draft,
      undefined,
      { root: "C:/output", directory: "C:/output/Images", subfolder: "Images" },
      clock(["task-birefnet", "project-birefnet", "run-birefnet"])
    );

    expect(queued.outputCount).toBe(1);
    expect(queued.runs).toHaveLength(1);
    expect(queued.prompt).toBe("");
    expect(queued.targetResolution).toBe("source");
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
      spectrumMode: "balanced" as const,
      h3ReferenceSlots: [{
        id: "picture-ref",
        mediaType: "image" as const,
        mediaPath: "subject.png",
        role: "subject" as const,
        note: ""
      }]
    };
    const queued = extensionTaskFromDraft(draft, state, clock());

    expect(queued.spectrumMode).toBe("off");
    expect(queued.maxGeneratedFrames).toBe(362);
    expect(queued.sourceVideoPath).toBe("source.mp4");
    expect(queued.h3ReferenceSlots?.map((slot) => [slot.mediaType, slot.mediaPath])).toEqual([
      ["video", "source.mp4"],
      ["image", "subject.png"]
    ]);
  });

  it("uses standard Spectrum for new H3 extension snapshots", () => {
    const state = createDefaultState();
    const draft = {
      ...createDefaultDraft(),
      inputMode: "video" as const,
      sourceVideoPath: "source.mp4",
      sourceVideoDuration: 12,
      trimEndSeconds: 12,
      workflowPath: "extend.json",
      spectrumMode: "balanced" as const,
      spectrumModelAwareMode: "full" as const,
      h3MemoryOptimizationMode: "preserve-native" as const,
      h3MemoryOptimizationUserSet: true,
      h3MemoryChunkRows: 4096
    };

    const queued = extensionTaskFromDraft(draft, state, clock());

    expect(queued.spectrumMode).toBe("balanced");
    expect(queued.spectrumModelAwareMode).toBe("off");
    expect(queued.h3MemoryOptimizationMode).toBe("off");
    expect(queued.h3MemoryOptimizationUserSet).toBe(false);
    expect(queued.h3MemoryChunkRows).toBe(4096);
    expect(queued.h3MemoryExecutionPlan).toMatchObject({
      memory: "off",
      spectrumEnabled: true,
      allowed: true
    });
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
      comfyPromptId: "prompt",
      seedVr2Checkpoint: {
        planVersion: 1 as const,
        framesPerSegment: 49,
        totalFrames: 96,
        totalSegments: 2,
        completed: []
      }
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
    expect(updated?.taskType === "upscale" ? updated.seedVr2Checkpoint : undefined).toBeUndefined();
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

  it("preserves native SeedVR2 segment checkpoints when only resetting status", () => {
    const checkpoint = {
      planVersion: 1 as const,
      framesPerSegment: 49,
      totalFrames: 96,
      totalSegments: 2,
      completed: []
    };
    const failed = {
      ...task("failed-upscale", "seedvr2-native-int8", "failed"),
      taskType: "upscale" as const,
      sourceFilename: "source.mp4",
      sourceFilePath: "source.mp4",
      sourceAssetId: "asset",
      sourceVersionId: "version",
      sourceWidth: 1280,
      sourceHeight: 720,
      targetWidth: 3840,
      targetHeight: 2160 as const,
      tileMode: "auto" as const,
      faceRestore: false,
      seedVr2Checkpoint: checkpoint
    };
    const result = resetQueueTask([failed], failed.id, "reset-at");
    const reset = result.queue[0];
    expect(reset).toMatchObject({ status: "waiting", seedVr2Checkpoint: checkpoint });
  });
});
