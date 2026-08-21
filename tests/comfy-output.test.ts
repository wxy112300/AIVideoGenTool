import { describe, expect, it } from "vitest";
import {
  extractComfyOutputFiles,
  isVideoOutputFilename
} from "../src/core/comfy-output";
import {
  attachAbsoluteOutputPaths,
  isSegmentedSeedVr2Output,
  restoreSegmentedSeedVr2OutputPaths,
  safeOutputFilePath
} from "../src/core/comfy-output-paths";

describe("ComfyUI output parsing", () => {
  it("extracts and deduplicates common media collections", () => {
    const response = {
      outputs: {
        "42": {
          images: [
            { filename: "cover.png", subfolder: "studio", type: "output" }
          ],
          gifs: [
            {
              filename: "result.mp4",
              subfolder: "studio",
              type: "output",
              format: "video/h264-mp4"
            }
          ]
        },
        "43": {
          files: [
            {
              filename: "result.mp4",
              subfolder: "studio",
              type: "output"
            }
          ]
        }
      },
      unrelated: { filename: "should-not-be-collected.txt" }
    };
    const files = extractComfyOutputFiles(response);
    expect(files.map((file) => file.filename)).toEqual(["cover.png", "result.mp4"]);
  });

  it("recognizes SaveVideo MP4 files reported through the images collection", () => {
    const response = {
      outputs: {
        "22": {
          images: [{
            filename: "H3-R2V-480p-13s-v01_00001_.mp4",
            subfolder: "",
            type: "output"
          }],
          animated: [true]
        }
      }
    };

    const files = extractComfyOutputFiles(response);

    expect(files).toHaveLength(1);
    expect(isVideoOutputFilename(files[0]!.filename)).toBe(true);
    expect(isVideoOutputFilename("cover.png")).toBe(false);
  });

  it("attaches paths relative to the configured ComfyUI output directory", () => {
    const [file] = attachAbsoluteOutputPaths(
      [{ filename: "result.mp4", subfolder: "studio", type: "output" }],
      "C:\\ComfyUI\\output"
    );
    expect(file?.absolutePath).toContain("studio");
    expect(file?.absolutePath).toContain("result.mp4");
  });

  it("does not attach paths that escape the configured output directory", () => {
    expect(safeOutputFilePath("C:\\ComfyUI\\output", "..\\models", "model.safetensors")).toBeNull();
    expect(safeOutputFilePath("C:\\ComfyUI\\output", "studio", "C:\\outside.png")).toBeNull();
    expect(attachAbsoluteOutputPaths([
      { filename: "..\\..\\outside.png", subfolder: "studio", type: "output" }
    ], "C:\\ComfyUI\\output")[0]?.absolutePath).toBeUndefined();
  });

  it("recognizes native segmented SeedVR2 result metadata", () => {
    expect(isSegmentedSeedVr2Output({ segmentedSeedVr2: true })).toBe(true);
    expect(isSegmentedSeedVr2Output({ segmentedSeedVr2: false })).toBe(false);
    expect(isSegmentedSeedVr2Output(null)).toBe(false);
  });

  it("keeps the durable merged SeedVR2 file instead of raw segment reports", () => {
    const restored = restoreSegmentedSeedVr2OutputPaths(
      [{
        filename: "clip-4K-v01_00001_.mp4",
        subfolder: "",
        type: "output",
        absolutePath: "C:\\ComfyUI\\output\\clip-4K-v01_00001_.mp4"
      }],
      [{
        filename: "clip-4K-v01.__lvs-segment-0001_00001_.mp4",
        subfolder: "",
        type: "output"
      }],
      "C:\\ComfyUI\\output"
    );

    expect(restored).toEqual([expect.objectContaining({
      filename: "clip-4K-v01_00001_.mp4",
      absolutePath: "C:\\ComfyUI\\output\\clip-4K-v01_00001_.mp4"
    })]);
  });

  it("collapses previously persisted SeedVR2 segment paths back to one merged file", () => {
    const restored = restoreSegmentedSeedVr2OutputPaths(
      [1, 2, 3].map((index) => ({
        filename: `clip-4K-v01.__lvs-segment-000${index}_00001_.mp4`,
        subfolder: "",
        type: "output",
        absolutePath: `C:\\ComfyUI\\output\\clip-4K-v01.__lvs-segment-000${index}_00001_.mp4`
      })),
      [],
      "C:\\ComfyUI\\output"
    );

    expect(restored).toEqual([expect.objectContaining({
      filename: "clip-4K-v01_00001_.mp4",
      absolutePath: "C:\\ComfyUI\\output\\clip-4K-v01_00001_.mp4"
    })]);
  });
});
