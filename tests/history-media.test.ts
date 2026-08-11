import { describe, expect, it } from "vitest";
import { historyFileCandidates } from "../src/core/history-media.js";

describe("history media path recovery", () => {
  it("keeps the recorded path and adds current-machine ComfyUI output candidates", () => {
    expect(historyFileCandidates({
      filename: "result.mp4",
      subfolder: "studio",
      type: "output",
      absolutePath: "C:\\OldComputer\\ComfyUI\\output\\studio\\result.mp4"
    }, {
      outputDirectory: "D:\\VideoOutput",
      modelDirectory: "D:\\Comfy-Desktop\\ComfyUI-Installs\\ComfyUI\\models",
      comfyInstallDirectory: "D:\\Comfy-Desktop\\ComfyUI-Installs\\ComfyUI"
    })).toEqual([
      "C:\\OldComputer\\ComfyUI\\output\\studio\\result.mp4",
      "D:\\VideoOutput\\studio\\result.mp4",
      "D:\\Comfy-Desktop\\ComfyUI-Installs\\ComfyUI\\output\\studio\\result.mp4",
      "D:\\Comfy-Desktop\\ComfyUI-Installs\\ComfyUI\\ComfyUI\\output\\studio\\result.mp4"
    ]);
  });

  it("deduplicates equivalent output roots", () => {
    const candidates = historyFileCandidates({
      filename: "result.mp4",
      subfolder: "",
      type: "output"
    }, {
      outputDirectory: "D:\\ComfyUI\\output",
      modelDirectory: "D:\\ComfyUI\\models",
      comfyInstallDirectory: "D:\\ComfyUI"
    });

    expect(candidates).toEqual([
      "D:\\ComfyUI\\output\\result.mp4",
      "D:\\ComfyUI\\ComfyUI\\output\\result.mp4"
    ]);
  });

  it("checks the configured image output directory before video and ComfyUI roots", () => {
    const candidates = historyFileCandidates({
      filename: "edited.png",
      subfolder: "LocalVideoStudio/Image",
      type: "output"
    }, {
      imageOutputDirectory: "E:\\ImageOutput",
      outputDirectory: "E:\\VideoOutput",
      modelDirectory: "D:\\ComfyUI\\models",
      comfyInstallDirectory: "D:\\ComfyUI"
    });

    expect(candidates[0]).toBe("E:\\ImageOutput\\LocalVideoStudio\\Image\\edited.png");
  });
});
