import { describe, expect, it, vi } from "vitest";
import { createDefaultDraft, createDefaultState } from "../src/core/defaults";
import { extensionTaskFromDraft, queueTaskFromDraft } from "../src/core/queue-task-factory";
import { QueueExecutionSideEffects, type QueueExecutionSideEffectsDependencies } from "../electron/services/queue-execution-side-effects";
import { probeVideoOutputDuration, videoDurationFromProbe } from "../electron/services/video-output-duration";

describe("delivered video duration", () => {
  it("uses the video track rather than a longer audio/container duration", () => {
    expect(videoDurationFromProbe(JSON.stringify({
      streams: [{ duration: "6.625", nb_frames: "159", avg_frame_rate: "24/1" }],
      format: { duration: "6.657" }
    }))).toBe(6.625);
  });

  it("recovers track duration from frame count when the container omits track duration", () => {
    expect(videoDurationFromProbe(JSON.stringify({
      streams: [{ duration: "N/A", nb_frames: "39", avg_frame_rate: "24/1" }]
    }))).toBe(1.625);
    expect(videoDurationFromProbe('{"streams":[{"nb_frames":"39","avg_frame_rate":"0/0"}]}')).toBeNull();
    expect(videoDurationFromProbe('{"streams":[]}')).toBeNull();
  });

  it("keeps missing files and unresolved paths on the compatibility fallback", async () => {
    expect(await probeVideoOutputDuration([{ filename: "video.mp4", subfolder: "", type: "output" }])).toBeNull();
    expect(await probeVideoOutputDuration([{ filename: "video.mp4", absolutePath: "missing-smoke-output/video.mp4", subfolder: "", type: "output" }])).toBeNull();
  });

  it.each([
    ["generation", 1.625, 1.625],
    ["extension", 6.625, 6.625],
    ["generation", null, 1],
    ["extension", null, 2.625]
  ] as const)("completes %s with measured duration %s and preserves the execution request", async (kind, measured, expected) => {
    const state = createDefaultState();
    const draft = { ...createDefaultDraft(), duration: 1, workflowPath: "workflow.json" };
    const task = kind === "generation" ? queueTaskFromDraft(draft, state) : extensionTaskFromDraft({
      ...draft, inputMode: "video", modelId: "minimax_h3_ref2va",
      sourceVideoPath: "source.mp4", sourceVideoDuration: 1.625,
      sourceWidth: 864, sourceHeight: 480, trimStartSeconds: 0, trimEndSeconds: 1.625
    }, state);
    const request = structuredClone(task);
    state.queue = [task];
    const warn = vi.fn();
    const videoOutputDuration = vi.fn(async () => measured);
    const sendState = vi.fn();
    const deps: QueueExecutionSideEffectsDependencies = {
      store: { update: async (mutate: (value: typeof state) => void) => { mutate(state); return state; } } as QueueExecutionSideEffectsDependencies["store"],
      logger: { info: vi.fn(), warn, error: vi.fn(), debug: vi.fn() } as unknown as QueueExecutionSideEffectsDependencies["logger"],
      sendState, videoOutputDuration, updateTask: async () => state,
      resolveTaskOutputDirectory: async () => "output",
      requireExistingImageOutput: async () => [], requireExistingVideoOutput: async () => [],
      prepareQueueRuntimeForTask: async () => true, stabilizeH3RuntimeBetweenTasks: async () => true,
      stopQueueRuntime: async () => true, restartQueueRuntime: async () => ({ ok: true, message: "" }),
      settingsForTask: (_task, settings) => settings, errorMeta: () => ({})
    };
    const files = [{ filename: "final.mp4", subfolder: "", type: "output" as const }];
    await new QueueExecutionSideEffects(deps).completeVideoTask({
      task, files, completedAt: "2026-09-28T00:00:00.000Z", promptId: "output-prompt", comfyOutputs: {}
    });
    expect(videoOutputDuration).toHaveBeenCalledWith(files);
    expect(state.queue).toHaveLength(0);
    expect(state.history[0].duration).toBe(expected);
    expect(state.history[0].versions[0].duration).toBe(expected);
    expect(Math.round(state.history[0].versions[0].duration * state.history[0].versions[0].fps)).toBe(Math.round(expected * 24));
    expect(task).toEqual(request);
    expect(sendState).toHaveBeenCalledWith(state);
    expect(warn).toHaveBeenCalledTimes(measured === null ? 1 : 0);
  });
});
