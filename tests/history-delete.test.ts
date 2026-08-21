import path from "node:path";
import { describe, expect, it } from "vitest";
import { historyVideoPaths, removeHistoryVideoVersion } from "../src/core/history-delete";
import type { AssetVersion, HistoryAsset } from "../src/types";

const asset = {
  files: [
    {
      filename: "clip.mp4",
      subfolder: "studio",
      type: "output"
    },
    {
      filename: "preview.png",
      subfolder: "studio",
      type: "output"
    },
    {
      filename: "alternate.webm",
      subfolder: "",
      type: "output",
      absolutePath: "D:\\archive\\alternate.webm"
    }
  ]
} as HistoryAsset;

describe("history deletion paths", () => {
  it("returns only video files and resolves missing absolute paths", () => {
    const filenames = historyVideoPaths(asset, "D:\\ComfyUI\\output");
    expect(filenames).toHaveLength(2);
    expect(filenames).toContain(
      path.resolve("D:\\ComfyUI\\output", "studio", "clip.mp4")
    );
    expect(filenames.some((filename) => filename.endsWith("preview.png"))).toBe(false);
  });

  it("does not invent paths when no output directory was recorded", () => {
    const filenames = historyVideoPaths(
      { ...asset, files: [asset.files[0]!] },
      ""
    );
    expect(filenames).toEqual([]);
  });

  it("collects video files from every asset version", () => {
    const filenames = historyVideoPaths(
      {
        ...asset,
        versions: [
          { files: asset.files },
          {
            files: [
              {
                filename: "clip-4K.mp4",
                subfolder: "studio",
                type: "output"
              }
            ]
          }
        ]
      } as HistoryAsset,
      "D:\\ComfyUI\\output"
    );

    expect(filenames).toHaveLength(3);
    expect(filenames).toContain(
      path.resolve("D:\\ComfyUI\\output", "studio", "clip-4K.mp4")
    );
  });

  it("removes one version while keeping the record and selecting a remaining version", () => {
    const original = {
      id: "original",
      kind: "original",
      createdAt: "2026-08-20T00:00:00.000Z",
      outputFilename: "clip.mp4",
      files: [asset.files[0]!]
    } as unknown as AssetVersion;
    const upscale = {
      id: "upscale",
      kind: "upscale",
      createdAt: "2026-08-21T00:00:00.000Z",
      outputFilename: "clip-4K.mp4",
      files: [{ filename: "clip-4K.mp4", subfolder: "studio", type: "output" }]
    } as unknown as AssetVersion;
    const multiVersionAsset = {
      ...asset,
      outputFilename: upscale.outputFilename,
      files: upscale.files,
      defaultVersionId: upscale.id,
      versions: [original, upscale]
    } as HistoryAsset;

    const next = removeHistoryVideoVersion(multiVersionAsset, upscale.id);

    expect(next.versions.map((version) => version.id)).toEqual([original.id]);
    expect(next.defaultVersionId).toBe(original.id);
    expect(next.outputFilename).toBe(original.outputFilename);
    expect(next.files).toEqual(original.files);
  });

  it("does not remove the only video version", () => {
    expect(() => removeHistoryVideoVersion(
      { ...asset, versions: [{ id: "only" }] } as unknown as HistoryAsset,
      "only"
    )).toThrow(/至少需要保留一个版本/);
  });
});
