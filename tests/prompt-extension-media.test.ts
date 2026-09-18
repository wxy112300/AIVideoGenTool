import { describe, expect, it, vi } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { EnhanceRequest, ExtensionQueueTask } from "../src/types";
import { withPromptExtensionMedia } from "../electron/services/prompt-extension-media";
import {
  continuumExtensionFrameBudget,
  extensionGeneratedTrimStart,
  finalizeExtensionOutput,
  promptExtensionFrameTime
} from "../electron/services/extension-media";

const baseRequest = (): EnhanceRequest => ({
  prompt: "Continue the motion.",
  modelId: "minimax_h3_ref2va",
  mode: "h3-vision",
  h3PromptMode: "R2V",
  imagePaths: ["picture-1.png"],
  referenceMediaPaths: ["picture-1.png", "video-1.mp4"],
  referenceContext: "<Picture 1> = character reference",
  extensionSource: {
    filePath: "source.mp4",
    trimStartSeconds: 2,
    trimEndSeconds: 8
  }
});

describe("extension prompt boundary media", () => {
  it("does not trim Continuum V3.8 overlap twice after node-side assembly", () => {
    expect(extensionGeneratedTrimStart({
      modelId: "minimax_h3_continuum",
      workflowPath: "workflows/minimax_h3_continuum_v38_extend_api.json",
      fps: 24,
      frameInterpolation: "off",
      overlapFrames: 22
    })).toBe(0);

    expect(extensionGeneratedTrimStart({
      modelId: "ltx23_22b_distilled",
      workflowPath: "workflows/ltx23_extend_api.json",
      fps: 24,
      frameInterpolation: "off",
      overlapFrames: 22
    })).toBeCloseTo(22 / 24);
  });

  it("preserves the exact source and continuation frame budget for Continuum concat", () => {
    expect(continuumExtensionFrameBudget({
      fps: 24,
      duration: 14,
      trimStartSeconds: 0,
      trimEndSeconds: 24.125
    })).toEqual({
      retainedFrames: 579,
      continuationFrames: 336,
      totalFrames: 915
    });
  });

  it.skipIf(spawnSync("ffmpeg", ["-version"]).status !== 0 || spawnSync("ffprobe", ["-version"]).status !== 0)(
    "preserves frames when extending a previously concatenated Continuum video",
    async () => {
      const directory = await mkdtemp(path.join(os.tmpdir(), "continuum-frame-regression-"));
      const sourcePath = path.join(directory, "source.mp4");
      const firstPath = path.join(directory, "first.mp4");
      const secondPath = path.join(directory, "second.mp4");
      const makeVideo = (filename: string, duration: number) => execFileSync("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", "testsrc2=size=96x64:rate=24",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=32000",
        "-t", String(duration), "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-ac", "2", filename
      ], { windowsHide: true });
      const frameCount = (filename: string) => Number(execFileSync("ffprobe", [
        "-v", "error", "-select_streams", "v:0", "-count_frames",
        "-show_entries", "stream=nb_read_frames", "-of", "default=noprint_wrappers=1:nokey=1", filename
      ], { encoding: "utf8", windowsHide: true }).trim());
      try {
        makeVideo(sourcePath, 362 / 24);
        makeVideo(firstPath, 14);
        makeVideo(secondPath, 14);
        const task: ExtensionQueueTask = {
          id: path.basename(directory), taskType: "extension", modelId: "minimax_h3_continuum",
          status: "waiting", createdAt: "2026-09-19T00:00:00.000Z", updatedAt: "2026-09-19T00:00:00.000Z",
          outputFilename: "continuation.mp4", prompt: "Continue the motion.", promptVersion: 0,
          ratio: "source", motion: "natural", seed: 1, keepSeedOnCopy: false,
          modelProfile: "q4_k_m", maxGeneratedFrames: 362, unloadBetweenStages: true,
          workflowPath: "workflows/minimax_h3_continuum_v38_extend_api.json",
          sourceVideoPath: sourcePath, sourceVideoDuration: 362 / 24,
          sourceWidth: 96, sourceHeight: 64, trimStartSeconds: 0, trimEndSeconds: 362 / 24,
          duration: 14, fps: 24, frameInterpolation: "off", resolution: 480, overlapFrames: 22
        };
        const signal = new AbortController().signal;
        await finalizeExtensionOutput(task, firstPath, signal);
        expect(frameCount(firstPath)).toBe(698);
        await finalizeExtensionOutput({
          ...task, sourceVideoPath: firstPath, sourceVideoDuration: 29.083333, trimEndSeconds: 29.083333
        }, secondPath, signal);
        expect(frameCount(secondPath)).toBe(1034);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    30000
  );

  it("samples one frame before the selected crop end", () => {
    expect(promptExtensionFrameTime({
      trimStartSeconds: 2,
      trimEndSeconds: 8
    })).toBeCloseTo(8 - 1 / 24);
    expect(promptExtensionFrameTime({
      trimStartSeconds: 2,
      trimEndSeconds: 2.01
    })).toBe(2);
    expect(promptExtensionFrameTime({
      trimStartSeconds: 2,
      trimEndSeconds: 8
    }, 7.96)).toBeCloseTo(7.96 - 1 / 24);
  });

  it("keeps ordinary prompt requests unchanged", async () => {
    const request = { ...baseRequest(), extensionSource: undefined };
    const prepareFrame = vi.fn();
    const run = vi.fn(async (prepared: EnhanceRequest) => prepared);

    const result = await withPromptExtensionMedia(
      request,
      "operation-1",
      new AbortController().signal,
      run,
      { prepareFrame }
    );

    expect(result).toBe(request);
    expect(run).toHaveBeenCalledWith(request);
    expect(prepareFrame).not.toHaveBeenCalled();
  });

  it("places the cropped final frame first without renumbering references", async () => {
    const cleanup = vi.fn(async () => undefined);
    const prepareFrame = vi.fn(async () => ({
      filePath: "extension-boundary.png",
      cleanup
    }));

    const result = await withPromptExtensionMedia(
      baseRequest(),
      "operation-2",
      new AbortController().signal,
      async (prepared) => prepared,
      { prepareFrame }
    );

    expect(prepareFrame).toHaveBeenCalledWith(
      baseRequest().extensionSource,
      "operation-2",
      expect.any(AbortSignal)
    );
    expect(result.imagePath).toBe("extension-boundary.png");
    expect(result.imagePaths).toEqual(["extension-boundary.png", "picture-1.png"]);
    expect(result.referenceMediaPaths).toEqual([
      "picture-1.png",
      "video-1.mp4",
      "extension-boundary.png"
    ]);
    expect(result.referenceContext).toContain("exact final frame at the selected trim end");
    expect(result.referenceContext).toContain("silent inspection aid");
    expect(result.referenceContext).toContain("<Video 1> remains the locked source video");
    expect(result.referenceContext).toContain("Do not create a <Picture N>");
    expect(result.referenceContext).toContain("<Picture 1> = character reference");
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("uses a Continuum boundary frame only for native-state visual inspection", async () => {
    const request = {
      ...baseRequest(),
      modelId: "minimax_h3_continuum",
      h3PromptMode: "I2VA" as const,
      imagePaths: [],
      referenceMediaPaths: [],
      referenceContext: "The boundary shows the current subject state."
    };
    const result = await withPromptExtensionMedia(
      request,
      "operation-i2va",
      new AbortController().signal,
      async (prepared) => prepared,
      {
        prepareFrame: async () => ({
          filePath: "extension-boundary.png",
          cleanup: async () => undefined
        })
      }
    );

    expect(result.imagePaths).toEqual(["extension-boundary.png"]);
    expect(result.referenceContext).toContain("silent visual inspection aid for the native continuation boundary");
    expect(result.referenceContext).toContain("preceding JointAV latent state directly");
    expect(result.referenceContext).toContain("final prompt uses the T2VA field shape");
    expect(result.referenceContext).toContain("start the generated timeline with the next physical increment");
    expect(result.referenceContext).not.toContain("concrete first-frame anchor, <Picture 1>");
    expect(result.referenceContext).not.toContain("must begin with the exact I2VA first-frame alignment declaration");
  });

  it("removes the temporary frame when the prompt backend fails", async () => {
    const cleanup = vi.fn(async () => undefined);

    await expect(withPromptExtensionMedia(
      baseRequest(),
      "operation-3",
      new AbortController().signal,
      async () => { throw new Error("backend failed"); },
      {
        prepareFrame: async () => ({
          filePath: "extension-boundary.png",
          cleanup
        })
      }
    )).rejects.toThrow("backend failed");

    expect(cleanup).toHaveBeenCalledOnce();
  });
});
