import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import type { AppState } from "../src/types";
import type { HistoryFileSystemPort } from "../electron/ports/history-file-system";
import type { StateRepository } from "../electron/ports/state-repository";
import { ComfyOutputService } from "../electron/services/comfy-output-service";

function repository(initial: AppState): StateRepository {
  return {
    load: async () => structuredClone(initial),
    get: () => structuredClone(initial),
    getSettings: () => structuredClone(initial.settings),
    update: async (mutator) => {
      const next = structuredClone(initial);
      mutator(next);
      return next;
    }
  };
}

function fileSystem(isExisting: (filename: string) => boolean): HistoryFileSystemPort {
  return {
    stat: async (filename) => isExisting(filename)
      ? { size: 1, mtimeMs: 0, isFile: () => true }
      : null,
    readText: async () => "",
    writeFile: async () => undefined,
    makeDirectory: async () => undefined,
    rename: async () => undefined,
    unlink: async () => undefined,
    remove: async () => undefined
  };
}

function service(
  state: AppState,
  isExisting: (filename: string) => boolean
): ComfyOutputService {
  return new ComfyOutputService({
    store: repository(state),
    fileSystem: fileSystem(isExisting),
    resolveComfyOutputDirectory: async () => state.settings.outputDirectory
  });
}

describe("ComfyOutputService", () => {
  it("prefers the detected output directory and verifies returned video files", async () => {
    const state = createDefaultState();
    state.settings.outputDirectory = "C:/Configured/output";
    const outputRoot = "C:/Detected/output";
    const current = new ComfyOutputService({
      store: repository(state),
      fileSystem: fileSystem((filename) => filename.toLowerCase().endsWith("clip.mp4")),
      resolveComfyOutputDirectory: async () => outputRoot
    });

    const files = await current.requireExistingVideoOutput({
      videos: [{ filename: "clip.mp4", subfolder: "", type: "output" }]
    });

    expect(files[0]).toMatchObject({
      filename: "clip.mp4",
      absolutePath: path.resolve(outputRoot, "clip.mp4")
    });
    await expect(current.resolveTaskOutputDirectory()).resolves.toBe(outputRoot);
  });

  it("keeps image parent-root fallback and rejects missing or empty output", async () => {
    const state = createDefaultState();
    state.settings.outputDirectory = "C:/Configured/output";
    const current = service(
      state,
      (filename) => filename.toLowerCase().endsWith("frame.png")
    );

    const files = await current.requireExistingImageOutput(
      { images: [{ filename: "frame.png", subfolder: "", type: "output" }] },
      "C:/Configured/output/images"
    );
    expect(files[0]?.absolutePath).toBe(
      path.resolve("C:/Configured/output/images/frame.png")
    );

    const missing = service(state, () => false);
    await expect(missing.requireExistingVideoOutput({
      videos: [{ filename: "missing.mp4", subfolder: "", type: "output" }]
    })).rejects.toThrow("输出视频不存在或为空");
  });

  it("preserves the VideoHelperSuite -audio filename fallback", async () => {
    const state = createDefaultState();
    state.settings.outputDirectory = "C:/ComfyUI/output";
    const current = service(
      state,
      (filename) => filename.toLowerCase().endsWith("clip.mp4")
    );

    await expect(current.requireExistingVideoOutput({
      videos: [{ filename: "clip-audio.mp4", subfolder: "", type: "output" }]
    })).resolves.toHaveLength(1);
  });

  it("requires a native AV descriptor from the expected serializer node", async () => {
    const state = createDefaultState();
    state.settings.outputDirectory = "C:/ComfyUI/output";
    const current = service(
      state,
      (filename) => filename.toLowerCase().endsWith("h3av_first.safetensors")
    );
    const result = {
      outputs: {
        "31": {
          h3_native_av: [{
            filename: "h3av_first.safetensors",
            subfolder: "h3-native-av",
            type: "output",
            format: "safetensors"
          }]
        },
        "99": {
          ui: {
            h3_native_av: [{
              filename: "wrong-node.safetensors",
              subfolder: "h3-native-av",
              type: "output",
              format: "safetensors"
            }]
          }
        }
      }
    };

    await expect(current.requireExistingNativeAvOutput(result, "31"))
      .resolves.toEqual([expect.objectContaining({
        filename: "h3av_first.safetensors",
        absolutePath: path.resolve("C:/ComfyUI/output/h3-native-av/h3av_first.safetensors")
      })]);
    await expect(current.requireExistingNativeAvOutput(result, "99"))
      .rejects.toThrow("H3 AV serializer 输出不存在或为空");
  });
});
