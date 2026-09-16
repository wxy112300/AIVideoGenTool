import { describe, expect, it } from "vitest";
import { createDefaultState } from "../src/core/defaults.js";
import { persistImageHistoryResult } from "../electron/queue-history.js";
import type {
  ImageGenerationQueueTask,
  TaskPerformanceStats
} from "../src/types.js";

const performanceStats: TaskPerformanceStats = {
  durationSeconds: 12,
  sampleCount: 1,
  gpuSampleCount: 1,
  cpuAveragePercent: 5,
  cpuPeakPercent: 8,
  memoryAverageBytes: 100,
  memoryPeakBytes: 120,
  memoryTotalBytes: 200,
  gpuAveragePercent: 90,
  gpuPeakPercent: 98,
  gpuTemperaturePeak: 70,
  vramBaselineBytes: 1000,
  vramAverageBytes: 1200,
  vramPeakBytes: 1400,
  vramTotalBytes: 2000
};

describe("image history H3 snapshots", () => {
  it("persists REF2VA notes, order, options, and resolved recipe", () => {
    const state = createDefaultState();
    const task: ImageGenerationQueueTask = {
      id: "h3-history-task",
      taskType: "image-generation",
      status: "running",
      createdAt: "2026-09-15T00:00:00.000Z",
      updatedAt: "2026-09-15T00:00:01.000Z",
      outputFilename: "ImageEdit-h3",
      modelId: "minimax-h3-reference-edit",
      workflowPath: "builtin:image/minimax-h3-reference-edit",
      projectId: "h3-history-project",
      pictures: [
        { id: "base", pictureNumber: 1, absolutePath: "base.png", width: 1920, height: 1080, role: "base" },
        { id: "style", pictureNumber: 3, absolutePath: "style.png", width: 1024, height: 768, role: "style", note: "只参考光照" },
        { id: "pose", pictureNumber: 8, absolutePath: "pose.png", width: 1024, height: 768, role: "pose", note: "只参考姿态" }
      ],
      prompt: "Use Picture 8 for the pose and Picture 3 for lighting.",
      promptVersion: 1,
      qualityProfile: "ref2va-turbo-8-768p",
      outputFormat: "png",
      outputCount: 1,
      outputWidth: 1024,
      outputHeight: 768,
      h3ImageOptions: {
        frameProfile: "recommended-5",
        frameSelection: "decode-recommended",
        sourceFit: "contain-pad",
        referenceDetail: "max-identity-2048",
        sourceFidelity: 0.55
      },
      h3ImageRecipe: {
        adapter: "ref2va-turbo-8-768p",
        samplingProfile: "REF2VA Turbo v1.0 768p | 8 steps",
        sampler: "euler",
        scheduler: "simple",
        steps: 8,
        shiftVideo: 12,
        shiftAudio: 3,
        frameProfile: "recommended-5",
        frameSelection: "decode-recommended",
        resolutionProfile: "native-detail-0.98mp",
        diffusionModelFilename: "minimax_h3_ref2va_pruned_int8_convrot.safetensors",
        loraFilename: "minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors"
      },
      runs: [{ id: "h3-history-run", index: 0, seed: 77, status: "running" }]
    };
    state.queue = [task];

    persistImageHistoryResult(state, {
      taskId: task.id,
      run: { ...task.runs[0]!, status: "completed" },
      startedAt: "2026-09-15T00:00:02.000Z",
      completedAt: "2026-09-15T00:00:14.000Z",
      versionId: "h3-history-version",
      file: { filename: "h3-result.png", subfolder: "Images", type: "output" },
      outputContentHash: "a".repeat(64),
      promptId: "h3-history-prompt",
      comfyOutputs: { "13": { images: [{ filename: "h3-result.png" }] } },
      performanceStats
    });

    const project = state.imageHistory[0];
    expect(project?.versions).toHaveLength(2);
    const version = project?.versions[0];
    expect(version).toMatchObject({
      modelId: "minimax-h3-reference-edit",
      qualityProfile: "ref2va-turbo-8-768p",
      steps: 8,
      seed: 77,
      h3ImageOptions: {
        sourceFit: "contain-pad",
        referenceDetail: "max-identity-2048",
        sourceFidelity: 0.55
      },
      h3ImageRecipe: {
        adapter: "ref2va-turbo-8-768p",
        sampler: "euler",
        shiftVideo: 12,
        shiftAudio: 3
      }
    });
    expect(version?.references.map((picture) => [picture.pictureNumber, picture.note])).toEqual([
      [1, undefined],
      [3, "只参考光照"],
      [8, "只参考姿态"]
    ]);
    expect(version?.width).toBe(1344);
    expect(version?.height).toBe(768);
    expect(state.queue[0]?.runs[0]).toMatchObject({
      status: "completed",
      outputVersionId: "h3-history-version",
      progress: 100
    });
  });

  it("prefers actual H3 artifact dimensions over the frozen prediction", () => {
    const state = createDefaultState();
    const task: ImageGenerationQueueTask = {
      id: "h3-history-actual-task",
      taskType: "image-generation",
      status: "running",
      createdAt: "2026-09-15T00:00:00.000Z",
      updatedAt: "2026-09-15T00:00:01.000Z",
      outputFilename: "ImageEdit-h3",
      modelId: "minimax-h3-image-i2i",
      workflowPath: "builtin:image/minimax-h3-image-i2i",
      projectId: "h3-history-actual-project",
      pictures: [{ id: "base", pictureNumber: 1, absolutePath: "base.png", width: 1920, height: 1080, role: "base" }],
      prompt: "Adjust the light.",
      promptVersion: 1,
      qualityProfile: "base-quality-20",
      outputFormat: "png",
      outputCount: 1,
      outputWidth: 1344,
      outputHeight: 768,
      runs: [{ id: "h3-history-actual-run", index: 0, seed: 77, status: "running" }]
    };
    state.queue = [task];

    persistImageHistoryResult(state, {
      taskId: task.id,
      run: { ...task.runs[0]!, status: "completed" },
      startedAt: "2026-09-15T00:00:02.000Z",
      completedAt: "2026-09-15T00:00:14.000Z",
      versionId: "h3-history-actual-version",
      file: { filename: "h3-result.png", subfolder: "Images", type: "output" },
      actualDimensions: { width: 1312, height: 736 },
      promptId: "h3-history-actual-prompt",
      comfyOutputs: {},
      performanceStats
    });

    expect(state.imageHistory[0]?.versions[0]).toMatchObject({ width: 1312, height: 736 });
  });
});
