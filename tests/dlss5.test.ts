import { describe, expect, it } from "vitest";
import {
  DEFAULT_DLSS5_UPSCALE_OPTIONS,
  assertDlss5ObjectInfoSchema,
  buildDlss5UpscaleWorkflow,
  dlss5OutputDimensions,
  normalizeDlss5Options,
  normalizeUpscaleTarget,
  validateDlss5ObjectInfoSchema,
  validateDlss5Workflow
} from "../src/core/dlss5";
import { modelCatalog } from "../src/core/catalog";
import {
  DEPTH_ANYTHING_V2_SMALL_MODEL_FILENAME,
  DEPTH_ANYTHING_V2_SMALL_MODEL_SUBDIRECTORY,
  DEPTH_ANYTHING_V2_SMALL_REVISION
} from "../src/core/catalog/models/depth-anything";
import { createDefaultState } from "../src/core/defaults";
import { upscaleTaskFromRequest } from "../src/core/queue-task-factory";
import { createModelOptionViewModels, orderVideoProfiles } from "../src/renderer/pages/create/helpers";
import type { EnvironmentScanResult } from "../src/types";

describe("DLSS5 phase A catalog and pure contracts", () => {
  it("registers the provider without pretending it owns a checkpoint", () => {
    expect(modelCatalog.get("dlss5-sr")?.definition).toMatchObject({
      category: "upscale",
      adapterId: "dlss5-sr",
      inputModes: ["video"]
    });
    expect(modelCatalog.get("dlss5-sr")?.definition.scan?.components).toEqual([]);
    expect(modelCatalog.get("depth-anything-v2")?.definition).toMatchObject({
      category: "video",
      role: "guide",
      adapterId: "depth-anything-v2"
    });
    const depthComponent = modelCatalog.get("depth-anything-v2")?.definition.scan?.components;
    expect(depthComponent).toHaveLength(1);
    expect(depthComponent?.map((component) => component.installGuide?.revision))
      .toEqual([DEPTH_ANYTHING_V2_SMALL_REVISION]);
    expect(depthComponent?.[0]?.expected).toBe(
      `${DEPTH_ANYTHING_V2_SMALL_MODEL_SUBDIRECTORY}/${DEPTH_ANYTHING_V2_SMALL_MODEL_FILENAME}`
    );
    expect(orderVideoProfiles([
      { id: "depth-anything-v2" },
      { id: "minimax_h3_fl2va" }
    ]).at(-1)?.id).toBe("depth-anything-v2");
  });

  it("keeps guide profiles out of Create while Settings can still scan them", () => {
    const scan = {
      modelProfiles: [{
        id: "depth-anything-v2",
        name: "Depth Anything V2 Small · 深度导引",
        category: "video",
        role: "guide",
        badge: "Guide model",
        description: "",
        vram: "",
        available: true,
        integrated: true,
        components: []
      }, {
        id: "minimax_h3_fl2va",
        name: "MiniMax H3",
        category: "video",
        badge: "H3",
        description: "",
        vram: "",
        available: true,
        integrated: true,
        components: []
      }]
    } as unknown as EnvironmentScanResult;
    const draft = { ...createDefaultState().draft, inputMode: "video" as const };
    const options = createModelOptionViewModels(draft, scan, {}, {}, (key) => key);
    expect(options.some((option) => option.id === "depth-anything-v2")).toBe(false);
  });

  it("computes exact source geometry for DLSS 2x, 3x and 4x", () => {
    expect(dlss5OutputDimensions(832, 480, 2)).toEqual([1664, 960]);
    expect(dlss5OutputDimensions(832, 480, 3)).toEqual([2496, 1440]);
    expect(dlss5OutputDimensions(832, 480, 4)).toEqual([3328, 1920]);
  });

  it("normalizes pinned options and rejects invalid combinations", () => {
    expect(normalizeDlss5Options(DEFAULT_DLSS5_UPSCALE_OPTIONS))
      .toEqual(DEFAULT_DLSS5_UPSCALE_OPTIONS);
    expect(() => normalizeDlss5Options({
      ...DEFAULT_DLSS5_UPSCALE_OPTIONS,
      scale: 5
    })).toThrow("scale must be 2, 3 or 4");
    expect(() => normalizeDlss5Options({
      ...DEFAULT_DLSS5_UPSCALE_OPTIONS,
      runtimeBundleId: "latest"
    })).toThrow("runtimeBundleId");
    expect(() => normalizeDlss5Options({
      ...DEFAULT_DLSS5_UPSCALE_OPTIONS,
      nodeRevision: "a".repeat(40)
    })).toThrow("pinned commit");

    const dlssTarget = normalizeUpscaleTarget({
      modelId: "dlss5-sr",
      sourceWidth: 832,
      sourceHeight: 480,
      targetScale: 3,
      dlss5: { ...DEFAULT_DLSS5_UPSCALE_OPTIONS, scale: 3 }
    });
    expect(dlssTarget).toMatchObject({
      provider: "dlss5",
      targetScale: 3,
      targetWidth: 2496,
      targetOutputHeight: 1440
    });
    expect(() => normalizeUpscaleTarget({
      modelId: "dlss5-sr",
      sourceWidth: 832,
      sourceHeight: 480,
      targetScale: 2,
      targetHeight: 1080,
      dlss5: DEFAULT_DLSS5_UPSCALE_OPTIONS
    })).toThrow("must not depend on legacy targetHeight");
    expect(() => normalizeUpscaleTarget({
      modelId: "realesrgan",
      sourceWidth: 832,
      sourceHeight: 480,
      targetScale: 2,
      dlss5: DEFAULT_DLSS5_UPSCALE_OPTIONS
    })).toThrow("only valid for modelId dlss5-sr");
  });

  it("preserves legacy short-edge records without adding DLSS fields", () => {
    expect(normalizeUpscaleTarget({
      modelId: "realesrgan",
      sourceWidth: 832,
      sourceHeight: 480,
      targetHeight: 1080
    })).toEqual({
      provider: "legacy",
      modelId: "realesrgan",
      targetHeight: 1080
    });
    expect(() => normalizeUpscaleTarget({
      modelId: "realesrgan",
      sourceWidth: 832,
      sourceHeight: 480
    })).toThrow("targetHeight is missing or invalid");
  });

  it("validates the frozen SR object_info contract without a runtime call", () => {
    const schema = {
      DLSSSuperResolution: {
        input: { required: {
          image: ["IMAGE"],
          depth: ["IMAGE"],
          motion_vectors: ["IMAGE"],
          scale: [["2x", "3x", "4x"]],
          quality: [["Quality", "Balanced", "Performance", "Ultra Quality"]]
        } },
        output: ["IMAGE", "STRING"]
      },
      DLSS5DepthAnythingV2: {
        input: { required: {
          images: ["IMAGE"],
          model: [["Small (recommended)", "Base", "Large"]],
          temporal_normalization: ["BOOLEAN", { default: true }],
          chunk_size: ["INT", { default: 4, min: 1, max: 32 }]
        } },
        output: ["IMAGE"]
      },
      DLSS5OpticalFlow: {
        input: { required: {
          images: ["IMAGE"],
          pyramid_scale: ["FLOAT", { default: 0.5 }],
          levels: ["INT", { default: 5 }],
          window_size: ["INT", { default: 21 }]
        } },
        output: ["IMAGE"]
      }
    };
    expect(validateDlss5ObjectInfoSchema(schema).valid).toBe(true);
    expect(() => assertDlss5ObjectInfoSchema(schema)).not.toThrow();
    expect(validateDlss5ObjectInfoSchema({}).missingNodes).toEqual([
      "DLSSSuperResolution",
      "DLSS5DepthAnythingV2",
      "DLSS5OpticalFlow"
    ]);

    const task = upscaleTaskFromRequest({
      sourceAssetId: "asset-1",
      sourceVersionId: "version-1",
      sourceFilePath: "C:/input/source.mp4",
      sourceFilename: "source.mp4",
      sourceWidth: 832,
      sourceHeight: 480,
      duration: 2,
      fps: 24,
      targetScale: 2,
      dlss5: DEFAULT_DLSS5_UPSCALE_OPTIONS,
      modelId: "dlss5-sr",
      tileMode: "safe",
      faceRestore: true
    }, createDefaultState(), {
      now: () => new Date("2026-09-03T00:00:00.000Z"),
      id: () => "task-1",
      random: () => 0.5
    });
    expect(task).not.toHaveProperty("targetHeight");
    expect(task).toMatchObject({
      modelId: "dlss5-sr",
      targetScale: 2,
      targetWidth: 1664,
      targetOutputHeight: 960,
      upscaleMode: "pixel",
      tileMode: "auto",
      faceRestore: false,
      outputFilename: "source-dlss-2x-v01.mp4"
    });
    const workflow = buildDlss5UpscaleWorkflow(task, "studio-input-source.mp4", schema);
    expect(validateDlss5Workflow(workflow, schema).valid).toBe(true);
    expect(Object.values(workflow).map((node) => node.class_type)).toEqual([
      "VHS_LoadVideo",
      "DLSS5DepthAnythingV2",
      "DLSS5OpticalFlow",
      "DLSSSuperResolution",
      "VHS_VideoCombine"
    ]);
    expect(workflow["4"]?.inputs).toMatchObject({
      image: ["1", 0],
      depth: ["2", 0],
      motion_vectors: ["3", 0],
      scale: "2x",
      quality: "Quality"
    });
    expect(workflow["5"]?.inputs).toMatchObject({
      images: ["4", 0],
      audio: ["1", 2],
      frame_rate: 24
    });
    expect(Object.values(workflow).some((node) =>
      node.class_type === "ImageScale" || node.class_type === "VRAM_Debug"
    )).toBe(false);
    const badWorkflow = structuredClone(workflow);
    badWorkflow["5"]!.inputs.audio = ["1", 3];
    expect(validateDlss5Workflow(badWorkflow, schema)).toMatchObject({ valid: false });
    expect(() => buildDlss5UpscaleWorkflow(
      { ...task, targetWidth: 1 },
      "studio-input-source.mp4",
      schema
    )).toThrow("geometry");
  });
});
