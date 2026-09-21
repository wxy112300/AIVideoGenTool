import { describe, expect, it } from "vitest";
import type { HistoryAsset, QueueTask } from "../src/types";
import {
  activeQueueTaskIds,
  duplicateQueueTask,
  moveWaitingTaskWithPauseBoundary,
  moveWaitingTask,
  nextQueueWaitingTask,
  normalizeQueuePauseBoundary,
  queuePauseBoundaryAfterCurrent,
  queuePauseBoundaryAfterTaskCompletion,
  queuePauseBoundaryReached,
  queueTaskIsDeferred,
  randomizeQueuedTaskSeed,
  removeQueueTask,
  removeQueueTaskWithPauseBoundary,
  reorderWaitingTaskWithPauseBoundary,
  resetQueueTask,
  syncQueueVideoInputPaths,
  updateQueuedUpscaleTask
} from "../src/core/queue";
import {
  extensionTaskFromDraft,
  imageTaskFromDraft,
  queueTaskFromDraft,
  upscaleTaskFromRequest,
  type QueueTaskFactoryClock
} from "../src/core/queue-task-factory";
import { DEFAULT_DLSS5_UPSCALE_OPTIONS } from "../src/core/dlss5";
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

  it("randomizes only the seed of a waiting video task", () => {
    const queued = task("queued", "wan");
    queued.seed = 7;
    const untouched = task("untouched", "wan");
    const next = randomizeQueuedTaskSeed(
      [queued, untouched],
      "queued",
      {
        now: () => new Date("2026-08-29T12:00:00.000Z"),
        id: () => "unused",
        random: () => 0.25
      }
    );

    expect(next[0]).toMatchObject({
      id: "queued",
      seed: Math.floor(0.25 * Number.MAX_SAFE_INTEGER),
      updatedAt: "2026-08-29T12:00:00.000Z"
    });
    expect(next[0]).not.toBe(queued);
    expect(next[1]).toBe(untouched);

    queued.status = "running";
    expect(randomizeQueuedTaskSeed([queued], "queued", {
      now: () => new Date("2026-08-29T12:00:00.000Z"),
      id: () => "unused",
      random: () => 0.75
    })[0]).toBe(queued);
  });

  it("treats the horizontal pause point as an active-task boundary", () => {
    const queue = [
      task("running", "wan", "running"),
      task("first", "wan"),
      task("second", "wan")
    ];

    expect(nextQueueWaitingTask(queue, 2)?.id).toBe("first");
    expect(nextQueueWaitingTask(queue, 1)).toBeUndefined();
    expect(queueTaskIsDeferred(queue, 2, "second")).toBe(true);
    expect(queueTaskIsDeferred(queue, 2, "first")).toBe(false);
    expect(queuePauseBoundaryAfterCurrent(queue)).toBe(1);
    expect(normalizeQueuePauseBoundary(queue, 0)).toBe(1);

    const staleOrder = [
      task("before-running", "wan"),
      task("running", "wan", "running"),
      task("after-running", "wan")
    ];
    expect(activeQueueTaskIds(staleOrder)).toEqual([
      "running",
      "before-running",
      "after-running"
    ]);
    expect(nextQueueWaitingTask(staleOrder, 1)).toBeUndefined();
    expect(nextQueueWaitingTask(staleOrder, 2)?.id).toBe("before-running");
  });

  it("does not execute a task blocked by an unknown H3 output policy", () => {
    const blocked = task("blocked", "minimax_h3_fl2va");
    blocked.h3AvOutputPolicyError = "unsupported policy";
    expect(nextQueueWaitingTask([blocked], undefined)).toBeUndefined();

    const reset = resetQueueTask([{
      ...blocked,
      status: "failed",
      error: "unsupported policy"
    }], blocked.id, "reset-at");
    expect(reset.reset).toBe(false);
    expect(reset.queue[0]).toMatchObject({
      status: "failed",
      error: "unsupported policy",
      h3AvOutputPolicyError: "unsupported policy"
    });
    expect(nextQueueWaitingTask(reset.queue, undefined)).toBeUndefined();

    const state = createDefaultState();
    state.queue = [{ ...blocked, status: "failed" }];
    const duplicated = duplicateQueueTask(state, blocked.id, clock(["blocked-copy"]));
    expect(duplicated[1]).toMatchObject({
      status: "failed",
      error: "unsupported policy",
      h3AvOutputPolicyError: "unsupported policy"
    });
    expect(nextQueueWaitingTask(duplicated, undefined)).toBeUndefined();
  });

  it("keeps the divider in place when a task crosses it", () => {
    const queue = [task("first", "wan"), task("second", "wan"), task("third", "wan"), task("fourth", "wan")];

    const movedDown = moveWaitingTaskWithPauseBoundary(queue, 2, "first", 1);
    expect(movedDown.queue.map((item) => item.id)).toEqual(["second", "first", "third", "fourth"]);
    expect(movedDown.boundary).toBe(2);

    const movedUp = reorderWaitingTaskWithPauseBoundary(queue, 2, "third", 0);
    expect(movedUp.queue.map((item) => item.id)).toEqual(["third", "first", "second", "fourth"]);
    expect(movedUp.boundary).toBe(3);
  });

  it("moves the divider with removals and restores", () => {
    const queue = [task("first", "wan"), task("second", "wan"), task("third", "wan")];
    const removedAbove = removeQueueTaskWithPauseBoundary(queue, 2, "first");
    expect(removedAbove.queue.map((item) => item.id)).toEqual(["second", "third"]);
    expect(removedAbove.boundary).toBe(1);

    const restored = reorderWaitingTaskWithPauseBoundary(
      removedAbove.queue,
      removedAbove.boundary,
      "third",
      0
    );
    expect(restored.boundary).toBe(2);
  });

  it("detects when completed tasks reach the divider stop line", () => {
    const beforeQueue = [
      task("current", "wan"),
      task("next", "wan"),
      task("later", "wan")
    ];

    expect(queuePauseBoundaryReached(beforeQueue, 1, beforeQueue.slice(1))).toBe(true);
    expect(queuePauseBoundaryReached(beforeQueue, 2, beforeQueue.slice(1))).toBe(false);
    expect(queuePauseBoundaryReached(beforeQueue, 1, [])).toBe(false);
  });

  it("ties the stop-line transition to the task immediately consumed before it", () => {
    const beforeQueue = [
      task("first", "wan"),
      task("second", "wan"),
      task("third", "wan"),
      task("below", "wan")
    ];
    const afterQueue = [beforeQueue[3]!];

    const transition = queuePauseBoundaryAfterTaskCompletion(
      beforeQueue,
      2,
      "below",
      afterQueue
    );

    expect(transition.reached).toBe(false);
    expect(transition.boundary).toBe(1);
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
      h3SaveJointAv: false,
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
      h3SaveJointAv: false,
      spectrumMode: "balanced",
      spectrumModelAwareMode: "off",
      h3ExecutionPolicy: expect.objectContaining({
        attentionMode: "sage",
        attentionOwner: "sage",
        sparseAttentionMode: "off",
        runtimeMode: "compatibility",
        comfyCompilerMode: "disabled",
        spectrumEnabled: true,
        allowed: true
      }),
      createdAt: "2026-08-12T12:00:00.000Z"
    });
    expect(queued).not.toHaveProperty("h3MemoryOptimizationMode");
    expect(queued).not.toHaveProperty("h3MemoryOptimizationUserSet");
    expect(queued).not.toHaveProperty("h3MemoryChunkRows");
    expect(queued).not.toHaveProperty("h3MemoryExecutionPlan");
    expect(queued.h3ReferenceSlots[0]?.mediaPath).toBe("ref.png");

    state.settings.h3LivePreview = true;
    const previewQueued = queueTaskFromDraft(draft, state, clock(["preview-task"]));
    expect(previewQueued.h3LivePreview).toBe(true);
  });

  it("keeps H3 1080 delivery separate from its 720p first-pass snapshot", () => {
    const state = createDefaultState();
    const draft = {
      ...createDefaultDraft(),
      startImagePath: "start.png",
      workflowPath: "workflow.json",
      resolution: 1080 as const,
      h3SaveJointAv: true,
      fps: 12 as const,
      frameInterpolation: "rife2x" as const
    };

    const queued = queueTaskFromDraft(draft, state, clock());

    expect(queued.resolution).toBe(720);
    expect(queued.h3DeliveryResolution).toBe(1080);
    expect(queued.outputFilename).toContain("1080p");
    expect(queued.fps).toBe(24);
    expect(queued.frameInterpolation).toBe("off");
  });

  it("preserves interpolation settings for non-H3 generation snapshots", () => {
    const state = createDefaultState();
    const queued = queueTaskFromDraft({
      ...createDefaultDraft(),
      modelId: "sulphur2",
      startImagePath: "start.png",
      workflowPath: "workflow.json",
      fps: 24,
      frameInterpolation: "rife2x"
    }, state, clock());

    expect(queued.fps).toBe(24);
    expect(queued.frameInterpolation).toBe("rife2x");
  });

  it("rejects catalog models from unsupported immutable task modes", () => {
    const state = createDefaultState();
    expect(() => extensionTaskFromDraft({
      ...createDefaultDraft(),
      modelId: "minimax_h3_fl2va_q3_gguf",
      inputMode: "video"
    }, state, clock())).toThrow("当前模型不支持视频续写");
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

  it("freezes the H3 REF2VA options, ordered notes, and resolved Turbo recipe", () => {
    const draft = createDefaultImageEditDraft();
    draft.modelId = "minimax-h3-reference-edit";
    draft.qualityProfile = "ref2va-turbo-8-768p";
    draft.h3ImageOptions = {
      frameProfile: "recommended-5",
      frameSelection: "decode-recommended",
      sourceFit: "contain-pad",
      referenceDetail: "max-identity-2048",
      sourceFidelity: 0.55
    };
    draft.pictures = [
      { id: "base", pictureNumber: 1, absolutePath: "base.png", width: 1024, height: 768, role: "base" },
      { id: "pose", pictureNumber: 4, absolutePath: "pose.png", width: 1024, height: 768, role: "pose", note: "只参考姿态" }
    ];
    draft.promptVersions[0]!.text = "Use Picture 4 for the pose.";

    const queued = imageTaskFromDraft(
      draft,
      "minimax_h3_ref2va_pruned_int8_convrot.safetensors",
      { root: "C:/output", directory: "C:/output/Images", subfolder: "Images" },
      clock(["task-h3", "project-h3", "run-h3"])
    );

    draft.h3ImageOptions.sourceFit = "stretch";
    draft.pictures[1]!.note = "mutated after enqueue";
    draft.qualityProfile = "base-quality-20";
    expect(queued.h3ImageOptions).toMatchObject({ sourceFit: "contain-pad", sourceFidelity: 0.55 });
    expect(queued.pictures[1]).toMatchObject({ pictureNumber: 4, note: "只参考姿态" });
    expect(queued.h3ImageRecipe).toMatchObject({
      adapter: "ref2va-turbo-8-768p",
      samplingProfile: "REF2VA Turbo v1.0 768p | 8 steps",
      sampler: "euler",
      steps: 8,
      shiftVideo: 12,
      shiftAudio: 3,
      resolutionProfile: "native-detail-0.98mp",
      diffusionModelFilename: "minimax_h3_ref2va_pruned_int8_convrot.safetensors",
      loraFilename: "minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors"
    });
  });

  it("freezes H3 native-detail dimensions instead of stale generic draft resolution", () => {
    const draft = createDefaultImageEditDraft();
    draft.modelId = "minimax-h3-image-i2i";
    draft.qualityProfile = "fl2va-turbo-8";
    draft.aspectRatio = "16:9";
    draft.targetResolution = 2160;
    draft.pictures = [{
      id: "base",
      pictureNumber: 1,
      absolutePath: "landscape.png",
      width: 1920,
      height: 1080,
      role: "base"
    }];
    draft.promptVersions[0]!.text = "Adjust the lighting.";

    const queued = imageTaskFromDraft(
      draft,
      "minimax_h3_fl2va_pruned_int8_convrot.safetensors",
      { root: "C:/output", directory: "C:/output/Images", subfolder: "Images" },
      clock(["task-h3-size", "project-h3-size", "run-h3-size"])
    );

    expect(queued.aspectRatio).toBe("source");
    expect(queued.targetResolution).toBe("source");
    expect(queued.outputWidth).toBe(1344);
    expect(queued.outputHeight).toBe(768);
    expect(queued.h3ImageRecipe).toMatchObject({
      resolutionProfile: "native-detail-0.98mp"
    });
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

  it("keeps Qwen Image 2.1 text-only canvas controls active without a reference", () => {
    const draft = createDefaultImageEditDraft();
    draft.modelId = "qwen-image-2-1";
    draft.qualityProfile = "preview-25";
    draft.aspectRatio = "16:9";
    draft.targetResolution = 720;
    draft.pictures = [];
    draft.promptVersions[0]!.text = "A quiet mountain village at dawn.";

    const queued = imageTaskFromDraft(
      draft,
      "qwen-image-2-1.safetensors",
      { root: "C:/output", directory: "C:/output/Images", subfolder: "Images" },
      clock(["task-qwen-21-t2i-size", "project-qwen-21-t2i-size", "run-qwen-21-t2i-size"])
    );

    expect(queued.aspectRatio).toBe("16:9");
    expect(queued.targetResolution).toBe(720);
    expect(queued.outputWidth).toBe(1280);
    expect(queued.outputHeight).toBe(720);
  });

  it("drops an unfilled Qwen Image 2.1 slot before building a T2I queue snapshot", () => {
    const draft = createDefaultImageEditDraft();
    draft.modelId = "qwen-image-2-1";
    draft.qualityProfile = "preview-25";
    draft.pictures = [{
      id: "picture-slot-1",
      pictureNumber: 1,
      absolutePath: "",
      width: 0,
      height: 0,
      role: "base"
    }];
    draft.promptVersions[0]!.text = "A quiet mountain village at dawn.";

    const queued = imageTaskFromDraft(
      draft,
      "qwen-image-2-1.safetensors",
      { root: "C:/output", directory: "C:/output/Images", subfolder: "Images" },
      clock(["task-qwen-21-empty-slot", "project-qwen-21-empty-slot", "run-qwen-21-empty-slot"])
    );

    expect(queued.pictures).toEqual([]);
    expect(queued.outputWidth).toBe(1024);
    expect(queued.outputHeight).toBe(1024);
  });

  it("enables Qwen Image 2.1 custom canvas mode for a reference upscale", () => {
    const draft = createDefaultImageEditDraft();
    draft.modelId = "qwen-image-2-1";
    draft.qualityProfile = "preview-25";
    draft.aspectRatio = "16:9";
    draft.targetResolution = 720;
    draft.pictures = [{
      id: "picture-1",
      pictureNumber: 1,
      absolutePath: "input.png",
      width: 1024,
      height: 768
    }];
    draft.promptVersions[0]!.text = "Keep Picture 1, change the lighting.";

    const queued = imageTaskFromDraft(
      draft,
      "qwen-image-2-1.safetensors",
      { root: "C:/output", directory: "C:/output/Images", subfolder: "Images" },
      clock(["task-qwen-21-ref-size", "project-qwen-21-ref-size", "run-qwen-21-ref-size"])
    );

    expect(queued.aspectRatio).toBe("16:9");
    expect(queued.targetResolution).toBe(720);
    expect(queued.outputWidth).toBe(1280);
    expect(queued.outputHeight).toBe(736);
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
      h3ContextLatentPath: "source-context.safetensors",
      spectrumMode: "balanced" as const,
      fps: 12 as const,
      frameInterpolation: "rife2x" as const,
      h3SaveJointAv: false,
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
    expect(queued.h3SaveJointAv).toBe(true);
    expect(queued.h3LatentSaveMode).toBe("all");
    expect(queued.h3AvOutputPolicy).toBe("shared");
    expect(queued.maxGeneratedFrames).toBe(362);
    expect(queued.fps).toBe(24);
    expect(queued.frameInterpolation).toBe("off");
    expect(queued.sourceVideoPath).toBe("source.mp4");
    expect(queued.h3ContextLatentPath).toBe("source-context.safetensors");
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
    expect(queued.h3ExecutionPolicy).toMatchObject({
      attentionMode: "sage",
      attentionOwner: "sage",
      sparseAttentionMode: "off",
      spectrumEnabled: true,
      allowed: true
    });
    expect(queued).not.toHaveProperty("h3MemoryOptimizationMode");
    expect(queued).not.toHaveProperty("h3MemoryExecutionPlan");
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

  it("duplicates a DLSS snapshot with its own scale metadata and filename", () => {
    const state = createDefaultState();
    const source = upscaleTaskFromRequest({
      sourceAssetId: "asset-dlss",
      sourceVersionId: "version-dlss",
      sourceFilePath: "source.mp4",
      sourceFilename: "source.mp4",
      sourceWidth: 832,
      sourceHeight: 480,
      duration: 2,
      fps: 24,
      targetScale: 3,
      dlss5: { ...DEFAULT_DLSS5_UPSCALE_OPTIONS, scale: 3 },
      modelId: "dlss5-sr",
      tileMode: "safe",
      faceRestore: true
    }, state, clock(["dlss-source"]));
    state.queue = [source];

    const duplicated = duplicateQueueTask(state, source.id, clock(["dlss-copy"]));
    expect(duplicated[1]).toMatchObject({
      id: "dlss-copy",
      modelId: "dlss5-sr",
      targetScale: 3,
      targetWidth: 2496,
      targetOutputHeight: 1440,
      outputFilename: "source-dlss-3x-v02.mp4"
    });
    expect(duplicated[1]).not.toHaveProperty("targetHeight");
    expect(duplicated[1]?.taskType === "upscale" && duplicated[1].dlss5)
      .not.toBe(source.dlss5);
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
