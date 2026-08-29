import { describe, expect, it } from "vitest";
import { createDefaultDraft, createDefaultState } from "../src/core/defaults";
import {
  extensionTaskFromDraft,
  queueTaskFromDraft
} from "../src/core/queue-task-factory";
import {
  H3_VIDEO_VAE_FP16_FILENAME,
  H3_VIDEO_VAE_INT8_CONVROT_FILENAME,
  h3VideoVaeFilename,
  normalizeH3VideoVaeMode,
  resolveH3VideoVaeMode
} from "../src/core/h3-video-vae";

const clock = {
  now: () => new Date("2026-08-29T12:00:00.000Z"),
  id: () => "h3-vae-task",
  random: () => 0.5
};

describe("MiniMax H3 video VAE selection", () => {
  it("normalizes and resolves the selected backend against availability", () => {
    expect(normalizeH3VideoVaeMode("unknown")).toBe("fp16");
    expect(normalizeH3VideoVaeMode("auto")).toBe("auto");
    expect(h3VideoVaeFilename("fp16")).toBe(H3_VIDEO_VAE_FP16_FILENAME);
    expect(h3VideoVaeFilename("int8-convrot")).toBe(H3_VIDEO_VAE_INT8_CONVROT_FILENAME);
    expect(resolveH3VideoVaeMode("auto", { fp16: true, int8Convrot: true })).toBe("int8-convrot");
    expect(resolveH3VideoVaeMode("auto", { fp16: true, int8Convrot: false })).toBe("fp16");
    expect(resolveH3VideoVaeMode("auto", { fp16: false, int8Convrot: true })).toBe("int8-convrot");
    expect(resolveH3VideoVaeMode("auto", { fp16: false, int8Convrot: false })).toBeNull();
    expect(resolveH3VideoVaeMode("int8-convrot", { fp16: true, int8Convrot: false })).toBe("fp16");
    expect(resolveH3VideoVaeMode("fp16", { fp16: false, int8Convrot: true })).toBe("int8-convrot");
    expect(resolveH3VideoVaeMode("fp16", { fp16: false, int8Convrot: false })).toBeNull();
  });

  it("snapshots the selected backend into generation and extension tasks", () => {
    const state = createDefaultState();
    state.settings.h3VideoVaeMode = "int8-convrot";
    const generationDraft = {
      ...createDefaultDraft(),
      startImagePath: "start.png",
      workflowPath: "workflow.json"
    };
    const generation = queueTaskFromDraft(generationDraft, state, clock);
    const extension = extensionTaskFromDraft({
      ...generationDraft,
      inputMode: "video" as const,
      sourceVideoPath: "source.mp4",
      sourceVideoDuration: 10,
      trimEndSeconds: 10
    }, state, clock);

    expect(generation.h3VideoVaeMode).toBe("int8-convrot");
    expect(extension.h3VideoVaeMode).toBe("int8-convrot");
    expect(queueTaskFromDraft(generationDraft, state, clock, { h3VideoVaeMode: "fp16" }).h3VideoVaeMode)
      .toBe("fp16");
    expect(queueTaskFromDraft({ ...generationDraft, modelId: "sulphur2" }, state, clock).h3VideoVaeMode)
      .toBeUndefined();
  });
});
