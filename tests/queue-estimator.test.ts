import { describe, expect, it } from "vitest";
import type { AssetVersion, HistoryAsset, QueueTask, TaskPerformanceStats } from "../src/types";
import {
  estimateQueueRemainingSeconds,
  estimateQueueTaskRemainingSeconds,
  estimateQueueTaskSeconds
} from "../src/core/queue-estimator";

const performance = (durationSeconds: number) => ({ durationSeconds } as TaskPerformanceStats);

function videoHistory(
  durationSeconds: number,
  options: Partial<AssetVersion> & { resolution?: number; inputMode?: "image" | "video" } = {}
): HistoryAsset {
  const {
    resolution = 480,
    inputMode = "image",
    ...versionOptions
  } = options;
  const version = {
    id: `version-${durationSeconds}-${resolution}`,
    kind: "original",
    createdAt: "2026-08-15T00:02:00.000Z",
    startedAt: "2026-08-15T00:00:00.000Z",
    outputFilename: "output.mp4",
    modelId: "minimax_h3_fl2va",
    width: 848,
    height: resolution === 720 ? 1280 : 848,
    duration: 5,
    fps: 24,
    files: [],
    ...versionOptions,
    performanceStats: performance(durationSeconds)
  } as AssetVersion;
  return {
    mediaKind: "video",
    id: `asset-${durationSeconds}-${resolution}`,
    taskId: `task-${durationSeconds}`,
    title: "test",
    outputFilename: "output.mp4",
    createdAt: version.createdAt,
    updatedAt: version.createdAt,
    modelId: "minimax_h3_fl2va",
    duration: 5,
    resolution,
    prompt: "test",
    seed: 1,
    inputMode,
    comfyPromptId: "prompt",
    comfyOutputs: {},
    files: [],
    versions: [version]
  } as HistoryAsset;
}

function task(overrides: Partial<QueueTask> = {}): QueueTask {
  return {
    id: "task",
    taskType: "generation",
    status: "waiting",
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
    outputFilename: "output.mp4",
    modelId: "minimax_h3_fl2va",
    workflowPath: "workflow",
    prompt: "test",
    promptVersion: 1,
    startImagePath: "start.png",
    sourceWidth: 848,
    sourceHeight: 480,
    endImagePath: "",
    ratio: "16:9",
    resolution: 480,
    duration: 5,
    fps: 24,
    frameInterpolation: "off",
    motion: "natural",
    seed: 1,
    keepSeedOnCopy: false,
    ...overrides
  } as QueueTask;
}

describe("queue duration estimator", () => {
  it("matches the closest model and generation parameters instead of averaging all history", () => {
    const history = {
      video: [
        videoHistory(40, { resolution: 480 }),
        videoHistory(120, { resolution: 720 })
      ]
    };
    expect(estimateQueueTaskSeconds(task({ resolution: 720 }), history)).toBe(120);
  });

  it("uses a robust median for repeated matching runs", () => {
    const history = {
      video: [
        videoHistory(90),
        videoHistory(110),
        videoHistory(1000)
      ]
    };
    expect(estimateQueueTaskSeconds(task(), history)).toBe(110);
  });

  it("blends history with observed progress without trusting a non-linear early step", () => {
    const history = { video: [videoHistory(100)] };
    const running = task({
      status: "running",
      progress: 50,
      startedAt: "2026-08-15T00:01:00.000Z"
    });
    const remaining = estimateQueueTaskRemainingSeconds(
      running,
      history,
      Date.parse("2026-08-15T00:02:00.000Z")
    );
    expect(remaining).toBeGreaterThan(30);
    expect(remaining).toBeLessThan(70);
  });

  it("sums waiting work and includes image batches from image history", () => {
    const imageHistory = [{
      mediaKind: "image",
      id: "project",
      title: "test",
      createdAt: "2026-08-15T00:02:00.000Z",
      updatedAt: "2026-08-15T00:02:00.000Z",
      coverMode: "auto",
      nextVersionNumber: 2,
      versions: [{
        id: "image-version",
        versionNumber: 1,
        kind: "edit",
        createdAt: "2026-08-15T00:02:00.000Z",
        startedAt: "2026-08-15T00:00:00.000Z",
        modelId: "qwen-image-edit-2511",
        workflowPath: "image-workflow",
        prompt: "edit",
        promptVersion: 1,
        references: [{ id: "picture", pictureNumber: 1, absolutePath: "input.png", width: 1024, height: 768 }],
        qualityProfile: "balanced",
        targetResolution: "source",
        outputCount: 1,
        width: 1024,
        height: 768,
        format: "png",
        file: { filename: "image.png", subfolder: "", type: "output" },
        performanceStats: performance(12)
      }]
    }] as const;
    const imageTask = {
      ...task(),
      id: "image-task",
      taskType: "image-generation",
      modelId: "qwen-image-edit-2511",
      pictures: [{ id: "picture", pictureNumber: 1, absolutePath: "input.png", width: 1024, height: 768 }],
      projectId: "project",
      prompt: "edit",
      promptVersion: 1,
      qualityProfile: "balanced",
      targetResolution: "source",
      outputCount: 2,
      outputFormat: "png",
      runs: [
        { id: "run-1", index: 0, seed: 1, status: "waiting" },
        { id: "run-2", index: 1, seed: 2, status: "waiting" }
      ]
    } as QueueTask;
    expect(estimateQueueTaskSeconds(imageTask, { video: [], image: imageHistory })).toBe(24);
    expect(estimateQueueRemainingSeconds([imageTask], { video: [], image: imageHistory })).toBe(24);

    const runningImageTask = {
      ...imageTask,
      status: "running",
      progress: 50,
      startedAt: "2026-08-15T00:01:00.000Z"
    } as QueueTask;
    expect(estimateQueueTaskRemainingSeconds(
      runningImageTask,
      { video: [], image: imageHistory },
      Date.parse("2026-08-15T00:02:00.000Z")
    )).toBeGreaterThan(5);
  });
});
