import { describe, expect, it } from "vitest";
import type { UpscaleQueueTask } from "../src/types";
import {
  createUpscaleFilename,
  estimateUpscaleResources,
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

  it("uses the short edge for portrait and square sources", () => {
    expect(upscaleDimensions(480, 704, 720)).toEqual([720, 1056]);
    expect(upscaleDimensions(480, 704, 1080)).toEqual([1080, 1584]);
    expect(upscaleDimensions(512, 512, 1080)).toEqual([1080, 1080]);
  });

  it("replaces an existing quality suffix and avoids collisions", () => {
    expect(createUpscaleFilename("clip-720p.mp4", 2160)).toBe("clip-4K-v01.mp4");
    expect(uniqueUpscaleFilename("clip.mp4", 1080, ["clip-1080p-v01.mp4"]))
      .toBe("clip-1080p-v02.mp4");
  });

  it("replaces the resolution in a metadata-based source name", () => {
    expect(
      createUpscaleFilename("SUL2-480p-5s-20260724-143205-v01.mp4", 1080)
    ).toBe("SUL2-1080p-5s-20260724-143205-v01.mp4");
  });
});

describe("upscale resource estimates", () => {
  const input = {
    sourceWidth: 832,
    sourceHeight: 480,
    targetWidth: 1872,
    targetHeight: 1080,
    duration: 5,
    fps: 24
  };

  it("scales the estimate with target pixels and frame count", () => {
    const low = estimateUpscaleResources({
      ...input,
      modelId: "realesrgan",
      targetWidth: 1280,
      targetHeight: 720,
      duration: 2
    });
    const high = estimateUpscaleResources({
      ...input,
      modelId: "realesrgan",
      targetWidth: 3840,
      targetHeight: 2160,
      duration: 10
    });
    expect(low.frameCount).toBe(48);
    expect(high.frameCount).toBe(240);
    expect(high.vramMaxGb).toBeGreaterThan(low.vramMaxGb);
    expect(high.secondsMax).toBeGreaterThan(low.secondsMax);
  });

  it("keeps model estimates distinct and selects FlashVSR 4x", () => {
    const real = estimateUpscaleResources({ ...input, modelId: "realesrgan" });
    const seed = estimateUpscaleResources({ ...input, modelId: "seedvr2" });
    const flash = estimateUpscaleResources({
      ...input,
      modelId: "flashvsr",
      targetWidth: 2160,
      targetHeight: 2160
    });
    expect(seed.vramMinGb).toBeGreaterThan(real.vramMinGb);
    expect(seed.secondsMin).toBeGreaterThan(real.secondsMin);
    expect(flash.internalScale).toBe(4);
    expect(flash.vramMaxGb).toBeGreaterThan(real.vramMaxGb);
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
    expect(workflow["7"]?.inputs.frames_per_batch).toBe(1);
    expect(workflow["1"]?.inputs.meta_batch).toEqual(["7", 0]);
    expect(workflow["6"]?.inputs.meta_batch).toEqual(["7", 0]);
    expect(workflow["8"]?.inputs.image_pass).toEqual(["5", 0]);
    expect(workflow["6"]?.inputs.images).toEqual(["8", 1]);
  });

  it("keeps the actual portrait dimensions when the task stores a short-edge target", () => {
    const portraitTask = {
      ...task("realesrgan"),
      sourceWidth: 480,
      sourceHeight: 864,
      targetWidth: 720,
      targetHeight: 720
    };
    const workflow = renderUpscaleWorkflow(portraitTask, "source.mp4", models);
    expect(workflow["5"]?.inputs).toMatchObject({ width: 720, height: 1296 });
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

  it("builds the current modular SeedVR2 workflow when its nodes are available", () => {
    const workflow = renderUpscaleWorkflow(
      task("seedvr2"),
      "source.mp4",
      models,
      {
        SeedVR2VideoUpscaler: {},
        SeedVR2LoadDiTModel: {},
        SeedVR2LoadVAEModel: {}
      }
    );
    expect(workflow["3"]?.class_type).toBe("SeedVR2LoadDiTModel");
    expect(workflow["4"]?.class_type).toBe("SeedVR2LoadVAEModel");
    expect(workflow["5"]?.inputs).toMatchObject({
      resolution: 1080,
      batch_size: 5,
      dit: ["3", 0],
      vae: ["4", 0]
    });
    expect(workflow["1"]?.inputs.meta_batch).toBeUndefined();
    expect(workflow["6"]?.inputs.meta_batch).toBeUndefined();
    expect(workflow["7"]).toBeUndefined();
    expect(workflow["6"]?.class_type).toBe("VHS_VideoCombine");
    expect(workflow["9"]?.inputs).toMatchObject({ width: 1872, height: 1080 });
    expect(workflow["8"]?.inputs.image_pass).toEqual(["9", 0]);
  });

  it("always builds FlashVSR with the low-VRAM preset", () => {
    const flashTask = { ...task("flashvsr"), tileMode: "fast" as const };
    const workflow = renderUpscaleWorkflow(flashTask, "source.mp4", models);
    expect(workflow["4"]?.class_type).toBe("AILab_FlashVSR");
    expect(workflow["4"]?.inputs).toMatchObject({
      preset: "Long Video (Low VRAM)",
      scale: 2,
      unload_model: true
    });
    expect(workflow["7"]?.inputs.frames_per_batch).toBe(16);
  });

  it("chooses FlashVSR scale from the source short edge", () => {
    const portraitTask = {
      ...task("flashvsr"),
      sourceWidth: 480,
      sourceHeight: 704,
      targetWidth: 2160,
      targetHeight: 2160
    };
    const workflow = renderUpscaleWorkflow(portraitTask, "source.mp4", models);
    expect(workflow["4"]?.inputs.scale).toBe(4);
  });

  it("forces SeedVR2 block swap even when an old task requested fast mode", () => {
    const seedTask = { ...task("seedvr2"), tileMode: "fast" as const };
    const workflow = renderUpscaleWorkflow(seedTask, "source.mp4", models);
    expect(workflow["4"]?.inputs).toMatchObject({
      batch_size: 1,
      preserve_vram: true,
      block_swap_config: ["3", 0]
    });
    expect(workflow["7"]?.inputs.frames_per_batch).toBe(5);
  });
});