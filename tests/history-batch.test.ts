import { describe, expect, it } from "vitest";
import type { HistoryAsset, ImageHistoryProject } from "../src/types.js";
import {
  applyHistoryBatchTagOperation,
  historyBatchCommonTags,
  historyBatchImageFile,
  historyBatchTagSummaries,
  historyBatchVideoFile,
  selectHistoryBatchIds,
  selectHistoryBatchRange,
  toggleHistoryBatchSelection
} from "../src/core/history-batch.ts";

const video = (id: string, versions: HistoryAsset["versions"]): HistoryAsset => ({
  mediaKind: "video",
  id,
  taskId: id,
  title: id,
  outputFilename: `${id}.mp4`,
  createdAt: "2026-09-20T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
  modelId: "h3",
  favorite: false,
  rating: null,
  tags: [],
  duration: 1,
  resolution: 480,
  prompt: "",
  seed: 1,
  comfyPromptId: id,
  comfyOutputs: {},
  files: [],
  versions
});

const image = (id: string, versions: ImageHistoryProject["versions"]): ImageHistoryProject => ({
  mediaKind: "image",
  id,
  title: id,
  createdAt: "2026-09-20T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
  favorite: false,
  rating: null,
  tags: [],
  coverMode: "auto",
  nextVersionNumber: 3,
  versions
});

describe("history batch helpers", () => {
  it("summarizes common and partial tags case-insensitively", () => {
    const records = [
      { ...video("a", []), tags: ["精选", "Keep"] },
      { ...video("b", []), tags: ["精选", "Other"] }
    ];
    expect(historyBatchCommonTags(records)).toEqual(["精选"]);
    expect(historyBatchTagSummaries(records)).toEqual([
      { tag: "精选", count: 2 },
      { tag: "Keep", count: 1 },
      { tag: "Other", count: 1 }
    ]);
  });

  it("selects the highest-resolution video and newest image version", () => {
    const videoAsset = video("video", [
      {
        id: "low", kind: "original", createdAt: "2026-09-20T00:00:00.000Z", outputFilename: "low.mp4",
        modelId: "h3", width: 640, height: 360, duration: 1, fps: 24, workflowPath: "", comfyPromptId: "", comfyOutputs: {},
        files: [{ filename: "low.mp4", subfolder: "", type: "output" }]
      },
      {
        id: "high", kind: "upscale", createdAt: "2026-09-19T00:00:00.000Z", outputFilename: "high.mp4",
        modelId: "h3", width: 1280, height: 720, duration: 1, fps: 24, workflowPath: "", comfyPromptId: "", comfyOutputs: {},
        files: [{ filename: "high.mp4", subfolder: "", type: "output" }]
      }
    ]);
    expect(historyBatchVideoFile(videoAsset)?.filename).toBe("high.mp4");

    const imageProject = image("image", [
      { id: "v1", versionNumber: 1, kind: "source", createdAt: "2026-09-18T00:00:00.000Z", modelId: "", workflowPath: "", prompt: "", promptVersion: 1, references: [], width: 100, height: 100, format: "png", file: { filename: "source.png", subfolder: "", type: "input" } },
      { id: "v2", versionNumber: 2, kind: "edit", createdAt: "2026-09-19T00:00:00.000Z", modelId: "qwen", workflowPath: "", prompt: "", promptVersion: 1, references: [], width: 100, height: 100, format: "png", file: { filename: "latest.png", subfolder: "", type: "output" } }
    ]);
    expect(historyBatchImageFile(imageProject)?.filename).toBe("latest.png");
  });

  it("does not duplicate tags and applies remove/rename to each selected item", () => {
    expect(applyHistoryBatchTagOperation(["Favorite"], { kind: "add", tag: "favorite" })).toEqual(["Favorite"]);
    expect(applyHistoryBatchTagOperation(["Favorite", "keep"], { kind: "remove", tag: "FAVORITE" })).toEqual(["keep"]);
    expect(applyHistoryBatchTagOperation(["Favorite"], { kind: "rename", from: "favorite", to: "精选" })).toEqual(["精选"]);
  });

  it("toggles only the current filtered set for select all", () => {
    expect(toggleHistoryBatchSelection(["a"], "a")).toEqual([]);
    expect(toggleHistoryBatchSelection([], "a")).toEqual(["a"]);
    expect(selectHistoryBatchIds(["outside"], ["a", "b"])).toEqual(["outside", "a", "b"]);
    expect(selectHistoryBatchIds(["outside", "a", "b"], ["a", "b"])).toEqual(["outside"]);
  });

  it("adds the full visible range without removing existing selections", () => {
    expect(selectHistoryBatchRange(["already"], ["a", "b", "c", "d"], "a", "d"))
      .toEqual(["already", "a", "b", "c", "d"]);
    expect(selectHistoryBatchRange(["c"], ["a", "b", "c", "d"], "d", "b"))
      .toEqual(["c", "b", "d"]);
    expect(selectHistoryBatchRange([], ["a", "b"], "missing", "b"))
      .toEqual(["b"]);
  });
});
