import { describe, expect, it } from "vitest";
import {
  AETHERSCALE_MODEL_ID,
  AETHERSCALE_RUNTIME_BUNDLE_ID,
  AETHERSCALE_V055_OBJECT_INFO,
  buildAetherScaleUpscaleWorkflow,
  defaultAetherScaleOptions,
  aetherScaleOutputGeometry,
  normalizeAetherScaleOptions,
  normalizeAetherScaleTarget,
  validateAetherScaleObjectInfoSchema,
  validateAetherScaleWorkflow
} from "../src/core/aetherscale";
import type { UpscaleQueueTask } from "../src/types";

function taskFor(mode: Parameters<typeof defaultAetherScaleOptions>[2] = "performance_2x"): UpscaleQueueTask {
  const geometry = aetherScaleOutputGeometry(832, 480, mode);
  return {
    id: "aether-task",
    taskType: "upscale",
    status: "waiting",
    createdAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
    outputFilename: "source-aether-2x-v01.mp4",
    modelId: AETHERSCALE_MODEL_ID,
    workflowPath: "builtin:upscale/aetherscale-dlss5",
    duration: 1,
    fps: 24,
    seed: 1,
    keepSeedOnCopy: true,
    sourceAssetId: "asset",
    sourceVersionId: "version",
    sourceFilePath: "input/source.mp4",
    sourceFilename: "source.mp4",
    sourceWidth: 832,
    sourceHeight: 480,
    targetWidth: geometry.width,
    targetOutputHeight: geometry.height,
    upscaleMode: "pixel",
    tileMode: "auto",
    faceRestore: false,
    aetherScale: defaultAetherScaleOptions(geometry.width, geometry.height, mode),
    progress: 0
  };
}

describe("AetherScale carrier integration contract", () => {
  it("uses the exact carrier modes and rounds output dimensions to even values", () => {
    expect(aetherScaleOutputGeometry(832, 480, "performance_2x")).toMatchObject({
      width: 1664,
      height: 960,
      factor: 2,
      perfQuality: 0
    });
    expect(aetherScaleOutputGeometry(832, 480, "balanced_1_724x")).toMatchObject({
      width: 1434,
      height: 828,
      factor: 1.724,
      perfQuality: 1
    });
  });

  it("keeps the carrier bundle and neural operation immutable", () => {
    const options = defaultAetherScaleOptions(1664, 960, "performance_2x");
    expect(options).toMatchObject({
      provider: "aetherscale-carrier",
      operation: "neural-upscale",
      runtimeBundleId: AETHERSCALE_RUNTIME_BUNDLE_ID,
      motionProfile: "torch-lk-compact-v1",
      warmupFrames: 8,
      sceneCutThreshold: 0.22
    });
    expect(normalizeAetherScaleOptions(options)).toEqual(options);
    expect(normalizeAetherScaleOptions(defaultAetherScaleOptions(832, 480, "native_1x")).operation)
      .toBe("neural-enhance");
  });

  it("rejects legacy/HECer fields, odd targets, and carrier sizes over the 8K boundary", () => {
    expect(() => normalizeAetherScaleTarget({
      modelId: AETHERSCALE_MODEL_ID,
      sourceWidth: 832,
      sourceHeight: 480,
      targetScale: 2,
      aetherScale: defaultAetherScaleOptions(1664, 960)
    })).toThrow("legacy targetHeight/targetScale/dlss5");
    expect(() => normalizeAetherScaleOptions({
      ...defaultAetherScaleOptions(1664, 960),
      targetWidth: 1665
    })).toThrow("even");
    expect(() => aetherScaleOutputGeometry(4096, 2160, "performance_2x")).toThrow("8K boundary");
  });

  it("validates the pinned v0.5.5 node schema fixture", () => {
    expect(validateAetherScaleObjectInfoSchema(AETHERSCALE_V055_OBJECT_INFO)).toMatchObject({ valid: true });
    expect(validateAetherScaleObjectInfoSchema({})).toMatchObject({
      valid: false,
      missingNodes: ["AetherScaleMotionAnalysis", "AetherScaleNeuralRendering"]
    });
  });

  it("builds a five-node carrier graph with connected motion and audio", () => {
    const graph = buildAetherScaleUpscaleWorkflow(taskFor(), "input/source.mp4", AETHERSCALE_V055_OBJECT_INFO);
    expect(Object.keys(graph)).toEqual(["1", "2", "3", "4"]);
    expect(graph["2"]?.inputs).toMatchObject({
      images: ["1", 0],
      engine: "torch_lk",
      motion_mode: "compact_flow",
      scene_cut_threshold: 0.22
    });
    expect(graph["3"]?.inputs).toMatchObject({
      images: ["1", 0],
      motion: ["2", 0],
      backend: "carrier",
      motion_source: "connected_motion",
      auto_bootstrap: false,
      upscale_mode: "performance_2x"
    });
    expect(graph["4"]?.inputs).toMatchObject({ images: ["3", 0], audio: ["1", 2] });
    expect(validateAetherScaleWorkflow(graph, AETHERSCALE_V055_OBJECT_INFO).valid).toBe(true);
  });

  it("fails closed for forbidden runtime/VFX paths and mismatched provider fields", () => {
    const graph = buildAetherScaleUpscaleWorkflow(taskFor(), "input/source.mp4", AETHERSCALE_V055_OBJECT_INFO);
    const invalid = {
      ...graph,
      "5": { class_type: "AetherScaleRuntime", inputs: { action: "install_or_update" } }
    };
    expect(validateAetherScaleWorkflow(invalid, AETHERSCALE_V055_OBJECT_INFO).valid).toBe(false);
    expect(() => buildAetherScaleUpscaleWorkflow({
      ...taskFor(),
      dlss5: undefined,
      aetherScale: undefined
    }, "input/source.mp4", AETHERSCALE_V055_OBJECT_INFO)).toThrow("missing its immutable options");
  });
});
