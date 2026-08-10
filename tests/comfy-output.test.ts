import { describe, expect, it } from "vitest";
import {
  extractComfyOutputFiles
} from "../src/core/comfy-output";
import {
  attachAbsoluteOutputPaths,
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
});
