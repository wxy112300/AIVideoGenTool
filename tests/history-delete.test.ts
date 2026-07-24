import path from "node:path";
import { describe, expect, it } from "vitest";
import { historyVideoPaths } from "../src/core/history-delete";
import type { HistoryAsset } from "../src/types";

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
});
