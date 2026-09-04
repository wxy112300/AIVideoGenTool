import { describe, expect, it, vi } from "vitest";
import { createDefaultDraft, createDefaultState } from "../src/core/defaults";
import { queueTaskFromDraft, upscaleTaskFromRequest } from "../src/core/queue-task-factory";
import { DEFAULT_DLSS5_UPSCALE_OPTIONS } from "../src/core/dlss5";
import { persistVideoHistoryResult } from "../electron/queue-history";
import { QueueWorkerController } from "../electron/queue-worker";
import { queueTaskHasRecoveryCheckpoint, queueTaskInput, queueTaskInputUrl, queueWorkProgressText, renderQueueTaskCard } from "../src/renderer/pages/queue/card";
import { queueLayoutSignature } from "../src/renderer/pages/queue/helpers";
import { queueComfyUiStatus, queueOperationStatus } from "../src/renderer/pages/queue/live-status";
import { revealQueueInputVideo } from "../src/renderer/pages/queue/input-previews";
import { renderQueuePage } from "../src/renderer/pages/queue/page";

function queuePageOptions() {
  return {
    t: (key: string, params?: Record<string, string | number>) => `${key}${params ? JSON.stringify(params) : ""}`,
    escapeHtml: (value: unknown) => String(value),
    performanceMetrics: null,
    comfyRuntime: {
      phase: "stopped" as const,
      ownership: "none" as const,
      endpoint: "",
      message: "",
      updatedAt: "2026-08-12T12:00:00.000Z",
      operationId: 0
    },
    queueRemainingSeconds: () => null,
    queueEstimateText: () => "—",
    performanceCard: (label: string, id: string) => `<article class="performance-card" id="${id}">${label}</article>`,
    renderTaskCard: (task: { status: string }) => `<article class="task-card ${task.status}${task.status === "running" ? " expanded" : ""}"></article>`,
    icon: () => ""
  };
}

function queueFixtureTask(state: ReturnType<typeof createDefaultState>, id: string) {
  return queueTaskFromDraft({
    ...createDefaultDraft(),
    startImagePath: "C:/input/start.png",
    workflowPath: "workflow.json"
  }, state, {
    now: () => new Date("2026-08-12T12:00:00.000Z"),
    id: () => id,
    random: () => 0.5
  });
}

describe("queue work progress", () => {
  it("formats determinate ComfyUI progress and average throughput", () => {
    const task = {
      ...queueFixtureTask(createDefaultState(), "work-progress"),
      workProgress: {
        value: 19,
        max: 20,
        unit: "step" as const,
        startedAt: "2026-09-03T00:00:00.000Z",
        sampledAt: "2026-09-03T00:20:35.000Z"
      }
    };
    const text = queueWorkProgressText(
      task,
      (key, params) => `${key}${params ? JSON.stringify(params) : ""}`
    );

    expect(text).toContain('\"value\":\"19\"');
    expect(text).toContain('\"max\":\"20\"');
    expect(text).toContain("65.0");
    expect(queueWorkProgressText({ ...task, workProgress: undefined }, (key) => key)).toBe("");
  });

  it("groups live work, stage elapsed, and ETA above the progress bar", () => {
    const task = queueFixtureTask(createDefaultState(), "running-metrics");
    task.status = "running";
    task.workProgress = {
      value: 6,
      max: 20,
      unit: "step",
      startedAt: "2026-09-03T00:00:00.000Z",
      sampledAt: "2026-09-03T00:05:24.000Z"
    };
    const markup = renderQueueTaskCard(task, 1, {
      t: (key, params) => `${key}${params ? JSON.stringify(params) : ""}`,
      taskPreviews: {},
      queueRunning: true,
      queueActionBusy: null,
      icon: () => "",
      escapeHtml: (value) => String(value),
      modelName: (id) => id,
      frameRateSummary: () => "24 FPS",
      queueStageElapsedText: () => "stage elapsed",
      queueTaskRemainingSeconds: () => 120,
      queueEstimateText: () => "2m",
      elapsedText: () => "5m"
    });
    const progressBarIndex = markup.indexOf('<div class="progress"');
    const taskMetaIndex = markup.indexOf('<div class="task-meta"');

    expect(markup).toContain('class="running-stage-metrics"');
    expect(markup.indexOf('id="running-work-progress"')).toBeLessThan(progressBarIndex);
    expect(markup.indexOf('id="running-stage-elapsed"')).toBeLessThan(progressBarIndex);
    expect(markup.indexOf('id="running-eta"')).toBeLessThan(progressBarIndex);
    expect(markup.slice(taskMetaIndex, markup.indexOf('<div class="running-controls"'))).not.toContain("id=\"running-");
  });
});

describe("queue recovery action", () => {
  it("shows resume only when the failed task has reusable checkpoint work", () => {
    const task = queueFixtureTask(createDefaultState(), "recoverable-task");
    task.status = "failed";
    const options = {
      t: (key: string) => key,
      taskPreviews: {},
      queueRunning: false,
      queueActionBusy: null,
      icon: () => "",
      escapeHtml: (value: unknown) => String(value),
      modelName: (id: string) => id,
      frameRateSummary: () => "24 FPS",
      queueStageElapsedText: () => "—",
      queueTaskRemainingSeconds: () => null,
      queueEstimateText: () => "—",
      elapsedText: () => "—"
    };

    expect(queueTaskHasRecoveryCheckpoint(task)).toBe(false);
    expect(renderQueueTaskCard(task, 1, options)).toContain(">queue.card.reset</span>");

    task.h3FirstPassCheckpoint = {} as NonNullable<typeof task.h3FirstPassCheckpoint>;
    expect(queueTaskHasRecoveryCheckpoint(task)).toBe(true);
    expect(renderQueueTaskCard(task, 1, options)).toContain(">queue.card.resume</span>");
  });

  it("requires completed SeedVR2 segments before offering resume", () => {
    const taskWithoutCompletedSegments = {
      taskType: "upscale",
      seedVr2Checkpoint: { completed: [] }
    } as unknown as Parameters<typeof queueTaskHasRecoveryCheckpoint>[0];
    const taskWithCompletedSegments = {
      taskType: "upscale",
      seedVr2Checkpoint: { completed: [{}] }
    } as unknown as Parameters<typeof queueTaskHasRecoveryCheckpoint>[0];
    expect(queueTaskHasRecoveryCheckpoint(taskWithoutCompletedSegments)).toBe(false);
    expect(queueTaskHasRecoveryCheckpoint(taskWithCompletedSegments)).toBe(true);
  });
});

describe("queue H3 frame metadata", () => {
  it("shows native 24 FPS instead of stale RIFE settings", () => {
    const task = queueFixtureTask(createDefaultState(), "stale-h3-rife");
    task.fps = 12;
    task.frameInterpolation = "rife2x";
    const frameRateSummary = vi.fn(() => "24 FPS");

    renderQueueTaskCard(task, 1, {
      t: (key) => key,
      taskPreviews: {},
      queueRunning: false,
      queueActionBusy: null,
      icon: () => "",
      escapeHtml: (value) => String(value),
      modelName: (id) => id,
      frameRateSummary,
      queueStageElapsedText: () => "—",
      queueTaskRemainingSeconds: () => null,
      queueEstimateText: () => "—",
      elapsedText: () => "—"
    });

    expect(frameRateSummary).toHaveBeenCalledWith(24, "off");
  });
});

describe("queue renderer task priority", () => {
  it("keeps the environment telemetry at the top and the active task before pending work", () => {
    const state = createDefaultState();
    const running = queueFixtureTask(state, "running-task");
    const waiting = queueFixtureTask(state, "waiting-task");
    running.status = "running";
    state.queue = [running, waiting];
    state.queueRunning = true;
    state.queueLifecycle = "running";

    const markup = renderQueuePage(state, queuePageOptions());
    const topTelemetryIndex = markup.indexOf("queue-top-performance-grid");
    const activeTaskIndex = markup.indexOf('class="task-card running expanded"');
    const pendingIndex = markup.indexOf("queue-pending-list");

    expect(topTelemetryIndex).toBeGreaterThan(-1);
    expect(activeTaskIndex).toBeGreaterThan(-1);
    expect(topTelemetryIndex).toBeLessThan(activeTaskIndex);
    expect(activeTaskIndex).toBeLessThan(pendingIndex);
    expect(markup).not.toContain("queue-active-telemetry");
    expect(markup).not.toContain("queue-idle-performance-grid");
    expect((markup.match(/id="metric-cpu"/g) ?? []).length).toBe(1);
  });

  it("keeps top telemetry in waiting and empty states without faking a running task", () => {
    const state = createDefaultState();
    state.queue = [queueFixtureTask(state, "waiting-task")];
    const waitingMarkup = renderQueuePage(state, queuePageOptions());
    expect(waitingMarkup.indexOf("queue-top-performance-grid")).toBeLessThan(waitingMarkup.indexOf("queue-execution-section"));
    expect(waitingMarkup).not.toContain("queue-active-telemetry");
    expect(waitingMarkup).not.toContain("queue-idle-performance-grid");

    state.queue = [];
    const emptyMarkup = renderQueuePage(state, queuePageOptions());
    expect(emptyMarkup).toContain("queue-top-performance-grid");
    expect(emptyMarkup).toContain("queue-empty-state");
    expect(emptyMarkup).not.toContain("queue-active-telemetry");
    expect(emptyMarkup).not.toContain("queue-idle-performance-grid");
  });

  it("keeps the running task at position 1 when persisted order is stale", () => {
    const state = createDefaultState();
    const running = queueFixtureTask(state, "running-task");
    const first = queueFixtureTask(state, "first-task");
    const later = queueFixtureTask(state, "later-task");
    running.status = "running";
    state.queue = [first, running, later];
    state.queueRunning = true;
    state.queuePauseBoundary = 1;
    state.queueLifecycle = "running";

    const taskPositions: string[] = [];
    const markup = renderQueuePage(state, {
      ...queuePageOptions(),
      renderTaskCard: (task, position) => {
        taskPositions.push(`${task.id}:${position}`);
        return `<article data-test-task="${task.id}" data-test-position="${position}"></article>`;
      }
    });

    expect(taskPositions).toEqual([
      "first-task:2",
      "later-task:3",
      "running-task:1"
    ]);
    expect(markup.indexOf('data-test-task="running-task"')).toBeLessThan(markup.indexOf('data-test-task="first-task"'));
    expect(markup.indexOf("data-queue-boundary-marker")).toBeLessThan(markup.indexOf('data-test-task="first-task"'));
  });

  it("renders a horizontal pause divider below the current batch", () => {
    const state = createDefaultState();
    const running = queueFixtureTask(state, "running-task");
    const first = queueFixtureTask(state, "first-task");
    const later = queueFixtureTask(state, "later-task");
    running.status = "running";
    state.queue = [running, first, later];
    state.queuePauseBoundary = 2;
    state.queueLifecycle = "pausing";

    const taskMarkup: string[] = [];
    const markup = renderQueuePage(state, {
      ...queuePageOptions(),
      renderTaskCard: (task, _position, _availability, deferred) => {
        taskMarkup.push(`${task.id}:${deferred ? "deferred" : "current"}`);
        return `<article data-test-task="${task.id}" data-test-deferred="${deferred ? "true" : "false"}"></article>`;
      }
    });

    expect(markup).toContain("data-queue-boundary-marker");
    expect(markup.indexOf('data-test-task="first-task"')).toBeLessThan(markup.indexOf("data-queue-boundary-marker"));
    expect(markup.indexOf("data-queue-boundary-marker")).toBeLessThan(markup.indexOf('data-test-task="later-task"'));
    expect(markup).toContain('data-test-deferred="true"');
    expect(markup).toContain("queue.pauseBoundary.title");
    expect(taskMarkup).toContain("first-task:current");
    expect(taskMarkup).toContain("later-task:deferred");
  });

  it("keeps tasks on both sides of the divider draggable", () => {
    const state = createDefaultState();
    const first = queueFixtureTask(state, "first-task");
    const later = queueFixtureTask(state, "later-task");
    state.queue = [first, later];
    state.queuePauseBoundary = 1;

    const availability: string[] = [];
    renderQueuePage(state, {
      ...queuePageOptions(),
      renderTaskCard: (task, _position, moveAvailability, deferred) => {
        availability.push(`${task.id}:${moveAvailability?.canDrag === true ? "draggable" : "locked"}:${deferred ? "deferred" : "current"}`);
        return `<article data-test-task="${task.id}"></article>`;
      }
    });

    expect(availability).toEqual([
      "first-task:draggable:current",
      "later-task:draggable:deferred"
    ]);
  });

  it("marks non-running image inputs for the square preview layout", () => {
    const state = createDefaultState();
    const task = queueFixtureTask(state, "image-preview-task");
    const markup = renderQueueTaskCard(task, 1, {
      t: (key) => key,
      taskPreviews: {},
      queueRunning: false,
      queueActionBusy: null,
      icon: () => "",
      escapeHtml: (value) => String(value),
      modelName: (id) => id,
      frameRateSummary: () => "24 FPS",
      queueStageElapsedText: () => "—",
      queueTaskRemainingSeconds: () => null,
      queueEstimateText: () => "—",
      elapsedText: () => "—"
    });

    expect(markup).toContain('class="task-input-preview task-input-preview-image"');
    expect(markup).toContain('data-queue-drag-handle="image-preview-task"');
    expect(markup).toContain('data-queue-rank-value="image-preview-task"');
    expect(markup).toContain('data-queue-rank-label="image-preview-task"');
    expect(markup).not.toContain("data-move=");
  });

  it("hides legacy H3 memory metadata on generation cards", () => {
    const state = createDefaultState();
    const task = queueTaskFromDraft({
      ...createDefaultDraft(),
      startImagePath: "C:/input/start.png",
      workflowPath: "workflow.json",
      spectrumMode: "balanced",
      h3MemoryOptimizationMode: "preserve-native"
    }, state, {
      now: () => new Date("2026-08-12T12:00:00.000Z"),
      id: () => "h3-memory-card",
      random: () => 0.5
    });
    const markup = renderQueueTaskCard(task, 1, {
      t: (key, params) => `${key}${params ? JSON.stringify(params) : ""}`,
      taskPreviews: {},
      queueRunning: false,
      queueActionBusy: null,
      icon: () => "",
      escapeHtml: (value) => String(value),
      modelName: (id) => id,
      frameRateSummary: () => "24 FPS",
      queueStageElapsedText: () => "—",
      queueTaskRemainingSeconds: () => null,
      queueEstimateText: () => "—",
      elapsedText: () => "—"
    });

    expect(markup).not.toContain("queue.card.h3MemoryMode");
    expect(markup).not.toContain("create.options.h3MemoryPreserveNative");
  });

  it("shows the effective JointAV save preference on H3 queue cards", () => {
    const state = createDefaultState();
    const task = queueTaskFromDraft({
      ...createDefaultDraft(),
      startImagePath: "C:/input/start.png",
      workflowPath: "workflow.json",
      h3SaveJointAv: false
    }, state, {
      now: () => new Date("2026-09-03T12:00:00.000Z"),
      id: () => "h3-joint-av-card",
      random: () => 0.5
    });
    const render = (queueTask: typeof task) => renderQueueTaskCard(queueTask, 1, {
      t: (key) => key,
      taskPreviews: {},
      queueRunning: false,
      queueActionBusy: null,
      icon: () => "",
      escapeHtml: (value) => String(value),
      modelName: (id) => id,
      frameRateSummary: () => "24 FPS",
      queueStageElapsedText: () => "—",
      queueTaskRemainingSeconds: () => null,
      queueEstimateText: () => "—",
      elapsedText: () => "—"
    });

    expect(render(task)).toContain("queue.card.jointAvDisabled");
    expect(render({ ...task, h3SaveJointAv: undefined })).toContain("queue.card.jointAvEnabled");
  });

  it("shows the final H3 delivery resolution instead of the first-pass resolution", () => {
    const task = {
      ...queueFixtureTask(createDefaultState(), "h3-1080-card"),
      resolution: 720 as const,
      h3DeliveryResolution: 1080 as const
    };
    const markup = renderQueueTaskCard(task, 1, {
      t: (key) => key,
      taskPreviews: {}, queueRunning: false, queueActionBusy: null,
      icon: () => "", escapeHtml: (value) => String(value), modelName: (id) => id,
      frameRateSummary: () => "24 FPS", queueStageElapsedText: () => "—",
      queueTaskRemainingSeconds: () => null, queueEstimateText: () => "—", elapsedText: () => "—"
    });

    expect(markup).toContain("<span>1080p</span>");
  });

  it("shows native SeedVR2 total progress and current segment progress separately", () => {
    const task = {
      ...queueFixtureTask(createDefaultState(), "seedvr2-progress"),
      taskType: "upscale" as const,
      modelId: "seedvr2-native-int8",
      status: "running" as const,
      sourceAssetId: "asset",
      sourceVersionId: "version",
      sourceFilePath: "C:/input/source.mp4",
      sourceFilename: "source.mp4",
      sourceWidth: 768,
      sourceHeight: 1152,
      targetWidth: 2160,
      targetHeight: 2160 as const,
      tileMode: "auto" as const,
      faceRestore: false,
      progress: 37,
      seedVr2Progress: {
        phase: "segments" as const,
        currentSegment: 3,
        totalSegments: 7,
        completedSegments: 2,
        segmentProgress: 42
      }
    };
    const markup = renderQueueTaskCard(task, 1, {
      t: (key, params) => `${key}${params ? JSON.stringify(params) : ""}`,
      taskPreviews: {},
      queueRunning: true,
      queueActionBusy: null,
      icon: () => "",
      escapeHtml: (value) => String(value),
      modelName: (id) => id,
      frameRateSummary: () => "24 FPS",
      queueStageElapsedText: () => "—",
      queueTaskRemainingSeconds: () => null,
      queueEstimateText: () => "—",
      elapsedText: () => "—"
    });

    expect(markup).toContain('id="running-progress-label">37%</strong>');
    expect(markup).toContain('id="seedvr2-segment-progress"');
    expect(markup).toContain('queue.card.seedVrSegment{"current":3,"total":7}');
    expect(markup).toContain('queue.card.seedVrSegmentDetail{"progress":42,"completed":2}');
    expect(markup).toContain('id="seedvr2-segment-progress-bar" style="width:42%"');
  });

  it("reveals the running SeedVR2 source video and hides its preview placeholder", () => {
    const setAttribute = vi.fn();
    const querySelector = vi.fn(() => ({ setAttribute }));
    const video = {
      currentTime: 12,
      closest: vi.fn(() => ({ querySelector }))
    } as unknown as HTMLVideoElement;

    revealQueueInputVideo(video);

    expect(video.currentTime).toBe(0);
    expect(video.closest).toHaveBeenCalledWith("[data-queue-input-preview], .live-preview");
    expect(querySelector).toHaveBeenCalledWith(
      "[data-queue-input-empty], [data-live-preview-empty]"
    );
    expect(setAttribute).toHaveBeenCalledWith("hidden", "");
  });
});

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
      h3ContinuationData: { status: "available" },
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
    expect(state.history[0]?.versions[0]?.h3ContinuationData).toEqual({
      status: "invalid",
      reason: "H3 AV 标记为 available，但没有已提交的 artifact。"
    });
  });

  it("persists DLSS lineage and frozen provider metadata on the derived version", () => {
    const state = createDefaultState();
    state.history = [{
      mediaKind: "video",
      id: "asset-dlss",
      taskId: "source-task",
      title: "source",
      outputFilename: "source.mp4",
      createdAt: "2026-09-03T00:00:00.000Z",
      updatedAt: "2026-09-03T00:00:00.000Z",
      modelId: "realesrgan",
      favorite: false,
      rating: null,
      tags: [],
      duration: 2,
      resolution: 480,
      prompt: "source",
      seed: 1,
      comfyPromptId: "source-prompt",
      comfyOutputs: {},
      files: [],
      versions: [{
        id: "source-version",
        kind: "original",
        createdAt: "2026-09-03T00:00:00.000Z",
        outputFilename: "source.mp4",
        modelId: "realesrgan",
        width: 832,
        height: 480,
        duration: 2,
        fps: 24,
        workflowPath: "source-workflow.json",
        comfyPromptId: "source-prompt",
        comfyOutputs: {},
        files: []
      }]
    }];
    const task = upscaleTaskFromRequest({
      sourceAssetId: "asset-dlss",
      sourceVersionId: "source-version",
      sourceFilePath: "C:/output/source.mp4",
      sourceFilename: "source.mp4",
      sourceWidth: 832,
      sourceHeight: 480,
      duration: 2,
      fps: 24,
      targetScale: 2,
      dlss5: DEFAULT_DLSS5_UPSCALE_OPTIONS,
      modelId: "dlss5-sr",
      tileMode: "safe",
      faceRestore: true
    }, state, {
      now: () => new Date("2026-09-03T00:01:00.000Z"),
      id: () => "dlss-task",
      random: () => 0.25
    });
    state.queue = [task];

    persistVideoHistoryResult(state, {
      task,
      completedAt: "2026-09-03T00:02:00.000Z",
      promptId: "dlss-prompt",
      comfyOutputs: { "5": { output: "source-dlss-2x-v01.mp4" } },
      files: [{
        filename: task.outputFilename,
        subfolder: "",
        type: "output",
        absolutePath: `C:/output/${task.outputFilename}`
      }],
      id: () => "dlss-version"
    });

    expect(state.history[0]?.defaultVersionId).toBe("dlss-version");
    expect(state.history[0]?.versions).toHaveLength(2);
    expect(state.history[0]?.versions[1]).toMatchObject({
      id: "dlss-version",
      kind: "upscale",
      sourceAssetId: "asset-dlss",
      sourceVersionId: "source-version",
      upscaleProvider: "dlss5",
      upscaleOperation: "super-resolution",
      upscaleScale: 2,
      upscaleQuality: "quality",
      upscaleGuideProfile: "depth-anything-v2-small-farneback",
      upscaleNodeRevision: DEFAULT_DLSS5_UPSCALE_OPTIONS.nodeRevision,
      upscaleRuntimeBundleId: DEFAULT_DLSS5_UPSCALE_OPTIONS.runtimeBundleId,
      width: 1664,
      height: 960,
      fps: 24
    });
  });
});

describe("H3 T2VA queue presentation", () => {
  it("snapshots the T2VA workflow and exposes a no-reference placeholder", () => {
    const state = createDefaultState();
    const task = queueTaskFromDraft({
      ...createDefaultDraft(),
      modelId: "minimax_h3_fl2va",
      startImagePath: "",
      endImagePath: "",
      workflowPath: "C:/ComfyUI/workflows/minimax_h3_i2v_api.json"
    }, state, {
      now: () => new Date("2026-08-12T12:00:00.000Z"),
      id: () => "task-t2va",
      random: () => 0.5
    });

    expect(task.workflowPath).toBe("C:/ComfyUI/workflows/minimax_h3_t2va_api.json");
    expect(queueTaskInput(task)).toEqual({ kind: "placeholder" });
  });
});

describe("H3 R2V queue presentation", () => {
  it("uses the first populated reference slot as the queue input preview", () => {
    const state = createDefaultState();
    const task = queueTaskFromDraft({
      ...createDefaultDraft(),
      modelId: "minimax_h3_ref2va",
      startImagePath: "",
      endImagePath: "",
      h3ReferenceSlots: [{
        id: "picture-ref",
        mediaType: "image" as const,
        mediaPath: "C:/input/reference.png",
        role: "subject" as const,
        note: ""
      }]
    }, state, {
      now: () => new Date("2026-08-12T12:00:00.000Z"),
      id: () => "r2v-image-task",
      random: () => 0.5
    });

    expect(queueTaskInput(task)).toEqual({
      kind: "image",
      path: "C:/input/reference.png",
      referenceIndex: 0
    });

    const markup = renderQueueTaskCard(task, 1, {
      t: (key) => key,
      taskPreviews: {},
      queueRunning: false,
      queueActionBusy: null,
      icon: () => "",
      escapeHtml: (value) => String(value),
      modelName: (id) => id,
      frameRateSummary: () => "24 FPS",
      queueStageElapsedText: () => "—",
      queueTaskRemainingSeconds: () => null,
      queueEstimateText: () => "—",
      elapsedText: () => "—"
    });

    expect(markup).toContain('class="task-input-preview task-input-preview-image"');
    expect(markup).toContain('data-queue-input-image="r2v-image-task"');
  });

  it("routes a video reference preview through the queue media protocol", () => {
    const state = createDefaultState();
    const task = queueTaskFromDraft({
      ...createDefaultDraft(),
      modelId: "minimax_h3_ref2va",
      startImagePath: "",
      endImagePath: "",
      h3ReferenceSlots: [{
        id: "video-ref",
        mediaType: "video" as const,
        mediaPath: "C:/input/reference.mp4",
        role: "motion" as const,
        note: ""
      }]
    }, state, {
      now: () => new Date("2026-08-12T12:00:00.000Z"),
      id: () => "r2v-video-task",
      random: () => 0.5
    });

    expect(queueTaskInput(task)).toMatchObject({ kind: "video", path: "C:/input/reference.mp4", referenceIndex: 0 });
    expect(queueTaskInputUrl(task)).toBe("studio-media://queue/r2v-video-task?reference=0");
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

  it("restarts once when resuming races with the current worker exit", async () => {
    const controller = new QueueWorkerController();
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const firstRun = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const secondRun = new Promise<void>((resolve) => { releaseSecond = resolve; });
    const execute = vi.fn()
      .mockImplementationOnce(async () => firstRun)
      .mockImplementationOnce(async () => secondRun);

    controller.start(execute);
    controller.resume(execute, () => true);
    releaseFirst();

    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
    expect(controller.runningWorker).not.toBeNull();

    releaseSecond();
    await vi.waitFor(() => expect(controller.runningWorker).toBeNull());
  });
});

describe("queue renderer layout signature", () => {
  it("ignores progress telemetry but detects task structure changes", () => {
    const state = createDefaultState();
    const task = queueTaskFromDraft({
      ...createDefaultDraft(),
      startImagePath: "C:/input/start.png",
      workflowPath: "workflow.json"
    }, state, {
      now: () => new Date("2026-08-12T12:00:00.000Z"),
      id: () => "task-signature",
      random: () => 0.5
    });
    state.queue = [task];
    const baseline = queueLayoutSignature(state);

    task.progress = 42;
    task.stage = "等待 ComfyUI";
    task.stageStartedAt = "2026-08-12T12:00:10.000Z";
    task.updatedAt = "2026-08-12T12:00:10.000Z";
    task.comfyPromptId = "prompt-1";
    expect(queueLayoutSignature(state)).toBe(baseline);

    state.queueLifecycle = "starting";
    state.queueLifecycleTaskId = task.id;
    expect(queueLayoutSignature(state)).not.toBe(baseline);

    task.status = "running";
    expect(queueLayoutSignature(state)).not.toBe(baseline);

    const beforeBoundary = queueLayoutSignature(state);
    state.queuePauseBoundary = 1;
    expect(queueLayoutSignature(state)).not.toBe(beforeBoundary);
  });
});

describe("queue lifecycle status", () => {
  it("uses live ComfyUI connectivity while the queue is idle", () => {
    const state = createDefaultState();
    const translate = (key: string): string => key;
    expect(queueComfyUiStatus(state, translate, {
      phase: "ready",
      ownership: "external",
      endpoint: "http://127.0.0.1:8188",
      message: "ready",
      updatedAt: new Date().toISOString(),
      operationId: 1
    }).tone).toBe("connected");
  });

  it("shows initialization instead of a runtime error while the startup scan is active", () => {
    const state = createDefaultState();
    const translate = (key: string): string => key;
    const status = queueComfyUiStatus(state, translate, {
      phase: "error",
      ownership: "app",
      endpoint: "http://127.0.0.1:8188",
      message: "runtime is still settling",
      updatedAt: new Date().toISOString(),
      operationId: 2
    }, true);

    expect(status.tone).toBe("initializing");
    expect(status.label).toBe("queue.comfyUi.initializing");
    expect(status.shortLabel).toBe("ComfyUI queue.comfyUi.short.initializing");
  });

  it("keeps a real queue lifecycle error visible during an environment scan", () => {
    const state = createDefaultState();
    state.queueLifecycle = "error";
    const status = queueComfyUiStatus(state, (key) => key, {
      phase: "error",
      ownership: "app",
      endpoint: "http://127.0.0.1:8188",
      message: "runtime error",
      updatedAt: new Date().toISOString(),
      operationId: 3
    }, true);

    expect(status.tone).toBe("error");
    expect(status.label).toBe("runtime error");
  });

  it("shows cleanup progress and elapsed time while restart is blocked", () => {
    const state = createDefaultState();
    state.queueLifecycle = "cleaning";
    state.queueLifecycleTaskId = "task-1";
    state.queueLifecycleStartedAt = new Date(Date.now() - 12_000).toISOString();
    const status = queueOperationStatus(state, (key, params) =>
      `${key}:${String(params?.duration ?? "")}`
    );

    expect(status.visible).toBe(true);
    expect(status.tone).toBe("pending");
    expect(status.message).toContain("queue.operation.cleaning");
    expect(status.message).not.toContain("NaN");
  });
});
