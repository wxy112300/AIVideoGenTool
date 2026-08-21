import { describe, expect, it, vi } from "vitest";
import { createDefaultDraft, createDefaultState } from "../src/core/defaults";
import { queueTaskFromDraft } from "../src/core/queue-task-factory";
import { persistVideoHistoryResult } from "../electron/queue-history";
import { QueueWorkerController } from "../electron/queue-worker";
import { queueTaskInput, renderQueueTaskCard } from "../src/renderer/pages/queue/card";
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
