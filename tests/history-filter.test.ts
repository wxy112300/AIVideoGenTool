import { describe, expect, it } from "vitest";
import type { HistoryAsset, ImageHistoryProject } from "../src/types.js";
import {
  filterHistoryAssets,
  filterImageHistoryProjects,
  normalizeHistoryFilter
} from "../src/core/history-filter.js";

const video = (id: string, overrides: Partial<HistoryAsset> = {}): HistoryAsset => ({
  mediaKind: "video",
  id,
  taskId: id,
  title: id,
  outputFilename: `${id}.mp4`,
  createdAt: `2026-08-1${id === "a" ? "1" : id === "b" ? "2" : "3"}T00:00:00.000Z`,
  updatedAt: `2026-08-1${id === "a" ? "1" : id === "b" ? "2" : "3"}T00:00:00.000Z`,
  modelId: overrides.modelId ?? "h3",
  favorite: overrides.favorite ?? false,
  rating: overrides.rating ?? null,
  duration: overrides.duration ?? 1,
  resolution: 480,
  prompt: "",
  seed: 1,
  comfyPromptId: id,
  comfyOutputs: {},
  files: [],
  versions: [],
  ...overrides
});

const image = (id: string, overrides: Partial<ImageHistoryProject> = {}): ImageHistoryProject => ({
  mediaKind: "image",
  id,
  title: id,
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
  favorite: false,
  rating: null,
  coverMode: "auto",
  nextVersionNumber: 2,
  versions: [{
    id: `${id}-v1`, versionNumber: 1, kind: "edit", createdAt: "2026-08-11T00:00:00.000Z",
    modelId: "qwen", workflowPath: "", prompt: "", promptVersion: 1, references: [],
    width: 100, height: 100, format: "png", file: { filename: `${id}.png`, subfolder: "", type: "output" }
  }],
  ...overrides
});

describe("history curation filters", () => {
  it("filters favorites, rating range, duration, and model together", () => {
    const records = [
      video("a", { favorite: true, rating: 5, duration: 12, modelId: "h3" }),
      video("b", { favorite: true, rating: 3, duration: 30, modelId: "wan" }),
      video("c", { favorite: false, rating: 5, duration: 30, modelId: "h3" })
    ];
    expect(filterHistoryAssets(records, {
      favoriteOnly: true,
      minRating: 4,
      minDuration: 10,
      modelId: "h3"
    }).map((item) => item.id)).toEqual(["a"]);
  });

  it("accepts half-star ratings and keeps them in rating order", () => {
    const records = [
      video("half", { rating: 3.5 }),
      video("full", { rating: 4 }),
      video("unrated", { rating: null })
    ];
    expect(filterHistoryAssets(records, { minRating: 3.5 }).map((item) => item.id)).toEqual(["full", "half"]);
    expect(filterHistoryAssets(records, { sort: "rating-desc" }).map((item) => item.id)).toEqual(["full", "half", "unrated"]);
  });

  it("uses the same deterministic order for detail navigation", () => {
    const records = [video("a", { rating: 4 }), video("b", { rating: 5 }), video("c", { rating: 5 })];
    expect(filterHistoryAssets(records, { sort: "rating-desc" }).map((item) => item.id)).toEqual(["b", "c", "a"]);
  });

  it("matches image projects by their newest generated model", () => {
    const projects = [image("a", { favorite: true, rating: 4 }), image("b", { favorite: false, rating: 5 })];
    expect(filterImageHistoryProjects(projects, { favoriteOnly: true, minRating: 4 }).map((item) => item.id)).toEqual(["a"]);
  });

  it("normalizes invalid persisted filter values", () => {
    expect(normalizeHistoryFilter({ minRating: 9 as never, sort: "unknown" as never })).toEqual({
      favoriteOnly: false, minRating: null, maxRating: null, minDuration: null, modelId: "", sort: "newest"
    });
  });
});
