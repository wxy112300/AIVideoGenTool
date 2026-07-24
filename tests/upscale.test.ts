import { describe, expect, it } from "vitest";
import type { UpscaleQueueTask } from "../src/types";
import {
  createUpscaleFilename,
  renderUpscaleWorkflow,
  uniqueUpscaleFilename,
  upscaleDimensions
} from "../src/core/upscale";

function task(modelId: UpscaleQueueTask["modelId"]): UpscaleQueueTask {
  return {
    id: "upscale-1",
    taskType: "upscale",
    status: "waiting",
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
    outputFilename: "WAN5-test-20260724-120000-1080p.mp4",
    modelId,
    workflowPath: `builtin:upscale/${modelId}`,
    duration: 5,
    fps: 24,
    seed: 100,
    keepSeedOnCopy: true,
    sourceAssetId: "asset-1",
    sourceVersionId: "version-1",
    sourceFilePath: "D:\\output\\source.mp4",
    sourceFilename: "source.mp4",
    sourceWidth: 832,
    sourceHeight: 480,
    targetWidth: 1872,
    targetHeight: 1080,
    tileMode: "auto",
    faceRestore: false
  };
}

describe("upscale dimensions and filenames", () => {
  it("preserves aspect ratio and aligns width to 16 pixels", () => {
    expect(upscaleDimensions(832, 480, 1080)).toEqual([1872, 1080]);
  });

  it("replaces an existing quality suffix and avoids collisions", () => {
    expect(createUpscaleFilename("clip-720p.mp4", 2160)).toBe("clip-4K.mp4");
    expect(uniqueUpscaleFilename("clip.mp4", 1080, ["clip-1080p.mp4"]))
      .toBe("clip-1080p-02.mp4");
  });
});

describe("upscale workflows", () => {
  const models = {
    seedVr2: "seedvr2_ema_3b_fp8_e4m3fn.safetensors",
    realEsrgan: "RealESRGAN_x4plus.safetensors"
  };

  it("builds a Real-ESRGAN video workflow with exact output scaling", () => {
    const workflow = renderUpscaleWorkflow(task("realesrgan"), "source.mp4", models);
    expect(workflow["1"]?.class_type).toBe("VHS_LoadVideo");
    expect(workflow["3"]?.inputs.model_name).toBe(models.realEsrgan);
    expect(workflow["4"]?.class_type).toBe("ImageUpscaleWithModel");
    expect(workflow["5"]?.inputs).toMatchObject({ width: 1872, height: 1080 });
    expect(workflow["6"]?.inputs.audio).toEqual(["1", 2]);
  });

  it("builds a VRAM-safe SeedVR2 workflow", () => {
    const seedTask = { ...task("seedvr2"), tileMode: "safe" as const };
    const workflow = renderUpscaleWorkflow(seedTask, "source.mp4", models);
    expect(workflow["3"]?.class_type).toBe("SeedVR2BlockSwap");
    expect(workflow["4"]?.inputs).toMatchObject({
      model: models.seedVr2,
      batch_size: 1,
      preserve_vram: true,
      block_swap_config: ["3", 0]
    });
  });

  it("builds a FlashVSR workflow using the selected memory preset", () => {
    const flashTask = { ...task("flashvsr"), tileMode: "fast" as const };
    const workflow = renderUpscaleWorkflow(flashTask, "source.mp4", models);
    expect(workflow["4"]?.class_type).toBe("AILab_FlashVSR");
    expect(workflow["4"]?.inputs).toMatchObject({
      preset: "Fast (2x Speed)",
      scale: 2,
      unload_model: true
    });
  });
});