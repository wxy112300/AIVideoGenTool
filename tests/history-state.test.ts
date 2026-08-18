import { describe, expect, it } from "vitest";
import type { HistoryAsset, ImageHistoryProject } from "../src/types";
import {
  historyContentStateChanged,
  historyStateChanged,
  imageHistoryContentStateChanged,
  imageHistoryStateChanged
} from "../src/renderer/pages/history/helpers";

function videoAsset(overrides: Partial<HistoryAsset> = {}): HistoryAsset {
  return {
    mediaKind: "video",
    id: "video-1",
    taskId: "task-1",
    title: "Test",
    outputFilename: "test.mp4",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    modelId: "minimax_h3_fl2va",
    favorite: false,
    rating: null,
    duration: 1,
    resolution: 480,
    fps: 24,
    prompt: "test",
    seed: 1,
    comfyPromptId: "prompt-1",
    comfyOutputs: {},
    files: [],
    versions: [] as HistoryAsset["versions"],
    ...overrides
  };
}

function imageProject(overrides: Partial<ImageHistoryProject> = {}): ImageHistoryProject {
  return {
    mediaKind: "image",
    id: "image-1",
    title: "Test",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    favorite: false,
    rating: null,
    coverMode: "auto",
    nextVersionNumber: 1,
    versions: [],
    ...overrides
  };
}

describe("history render change classification", () => {
  it("treats video curation-only changes as in-place updates", () => {
    const previous = [videoAsset()];
    const next = [videoAsset({ favorite: true, rating: 4.5 })];

    expect(historyStateChanged(previous, next)).toBe(true);
    expect(historyContentStateChanged(previous, next)).toBe(false);
  });

  it("still renders when video media metadata changes", () => {
    const previous = [videoAsset()];
    const next = [videoAsset({ updatedAt: "2026-01-01T00:01:00.000Z" })];

    expect(historyContentStateChanged(previous, next)).toBe(true);
  });

  it("treats image-project curation-only changes as in-place updates", () => {
    const previous = [imageProject()];
    const next = [imageProject({ favorite: true, rating: 3.5 })];

    expect(imageHistoryStateChanged(previous, next)).toBe(true);
    expect(imageHistoryContentStateChanged(previous, next)).toBe(false);
  });
});
