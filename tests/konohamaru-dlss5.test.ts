import { describe, expect, it } from "vitest";
import {
  KONOHAMARU_DLSS_ENGINES,
  KONOHAMARU_FRAME_FPS_VALUES,
  KONOHAMARU_MODE_SPECS,
  KONOHAMARU_NR_PRESETS,
  KONOHAMARU_NR_STYLES,
  KONOHAMARU_DLSS_MODEL_PRESETS,
  KONOHAMARU_MODEL_ID,
  KONOHAMARU_RUNTIME_BUNDLE_ID,
  buildKonohamaruUpscaleWorkflow,
  defaultKonohamaruOptions,
  konohamaruFrameFpsOptions,
  konohamaruOutputGeometry,
  normalizeKonohamaruTarget,
  validateKonohamaruObjectInfoSchema,
  validateKonohamaruWorkflow
} from "../src/core/konohamaru-dlss5";
import {
  KONOHAMARU_LEGACY_RUNTIME_BUNDLE_ID,
  KONOHAMARU_NODE_ID,
  KONOHAMARU_NODE_REVISION
} from "../src/core/catalog/dependencies/konohamaru";
import type { UpscaleQueueTask } from "../src/types";

function stringInput(): [string, Record<string, never>] {
  return ["STRING", {}];
}

function videoInput(): [string, Record<string, never>] {
  return ["VIDEO", {}];
}

function enumInput(values: readonly (string | number)[]): [(string | number)[], Record<string, never>] {
  return [[...values], {}];
}

const konohamaruObjectInfo = {
  LoadVideo: {
    input: { required: { file: stringInput() } },
    output: ["VIDEO", "AUDIO", "FLOAT", "INT"]
  },
  SaveVideo: {
    input: {
      required: {
        video: videoInput(),
        filename_prefix: stringInput(),
        format: enumInput(["mp4"])
      }
    },
    output: []
  },
  NvidiaDLSSVideoUpscale: {
    input: {
      required: {
        video: videoInput(),
        upscale_mode: enumInput(KONOHAMARU_MODE_SPECS.map((spec) => spec.label)),
        require_neural_upscaling: ["BOOLEAN", {}],
        nr_preset: enumInput(KONOHAMARU_NR_PRESETS),
        nr_style: enumInput(KONOHAMARU_NR_STYLES),
        nr_intensity: ["FLOAT", {}],
        local_tone_strength: ["FLOAT", {}],
        local_structure_strength: ["FLOAT", {}],
        skin_structure_strength: ["FLOAT", {}],
        automatic_mask: ["BOOLEAN", {}],
        dlss_model_preset: enumInput(KONOHAMARU_DLSS_MODEL_PRESETS),
        encoding_quality: enumInput(["Auto (Default)", "Max"]),
        video_codec: enumInput(["H.264"]),
        container: enumInput(["MP4"]),
        rename: enumInput(["Auto"]),
        custom_suffix: stringInput(),
        hdr_mode: ["BOOLEAN", {}],
        output_detail_strength: ["FLOAT", {}]
      }
    },
    output: ["VIDEO", "STRING"]
  },
  NvidiaDLSSFrameInterpolation: {
    input: {
      required: {
        video: videoInput(),
        output_fps: enumInput(KONOHAMARU_FRAME_FPS_VALUES.map(String)),
        dlss_engine: enumInput(KONOHAMARU_DLSS_ENGINES),
        encoding_quality: enumInput(["Auto (Default)", "Max"]),
        video_codec: enumInput(["H.264"]),
        container: enumInput(["MP4"]),
        rename: enumInput(["Auto"]),
        custom_suffix: stringInput(),
        hdr_mode: ["BOOLEAN", {}]
      }
    },
    output: ["VIDEO", "STRING"]
  }
} as const;

function modernComboObjectInfo(): typeof konohamaruObjectInfo {
  const clone = structuredClone(konohamaruObjectInfo) as unknown as Record<string, {
    input: { required: Record<string, unknown> };
  }>;
  for (const nodeType of ["NvidiaDLSSVideoUpscale", "NvidiaDLSSFrameInterpolation"]) {
    const required = clone[nodeType]?.input.required;
    if (!required) continue;
    for (const [name, spec] of Object.entries(required)) {
      if (Array.isArray(spec) && Array.isArray(spec[0])) {
        required[name] = ["COMBO", { options: spec[0] }];
      }
    }
  }
  return clone as unknown as typeof konohamaruObjectInfo;
}

function taskFor(
  mode: Parameters<typeof defaultKonohamaruOptions>[0] = "quality_1_5x",
  frameInterpolation = false
): UpscaleQueueTask {
  const geometry = konohamaruOutputGeometry(832, 480, mode);
  return {
    id: "kono-task",
    taskType: "upscale",
    status: "waiting",
    createdAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:00:00.000Z",
    outputFilename: frameInterpolation
      ? "source-dlss5-kono-1.5x-fg120-v01.mp4"
      : "source-dlss5-kono-1.5x-v01.mp4",
    modelId: KONOHAMARU_MODEL_ID,
    workflowPath: "builtin:upscale/dlss5-konohamaru",
    duration: 5,
    fps: 24,
    seed: 1,
    keepSeedOnCopy: true,
    sourceAssetId: "asset",
    sourceVersionId: "version",
    sourceFilePath: "C:\\input\\source.mp4",
    sourceFilename: "source.mp4",
    sourceWidth: 832,
    sourceHeight: 480,
    targetWidth: geometry.width,
    targetOutputHeight: geometry.height,
    upscaleMode: "pixel",
    tileMode: "auto",
    faceRestore: false,
    konohamaru: defaultKonohamaruOptions(mode, frameInterpolation, 120, "Cinematic", 1.4),
    progress: 0
  };
}

describe("Konohamaru DLSS5 composition contract", () => {
  it("supports the upstream 1x/1.5x/1.724x/2x/3x geometry and rejects oversized output", () => {
    expect(konohamaruOutputGeometry(832, 480, "quality_1_5x")).toMatchObject({
      width: 1248,
      height: 720,
      factor: 1.5
    });
    expect(konohamaruOutputGeometry(832, 480, "balanced_1_724x")).toMatchObject({
      width: 1434,
      height: 828,
      factor: 1.724
    });
    expect(() => konohamaruOutputGeometry(4096, 2160, "performance_2x")).toThrow("7680×4320");
  });

  it("offers only valid higher output frame rates for the source video", () => {
    expect(konohamaruFrameFpsOptions(24)).toEqual(["off", 60, 120]);
    expect(konohamaruFrameFpsOptions(30)).toEqual(["off", 60, 120]);
    expect(konohamaruFrameFpsOptions(60)).toEqual(["off", 120]);
    expect(konohamaruFrameFpsOptions(120)).toEqual(["off"]);
  });

  it("freezes the provider, runtime bundle and output geometry", () => {
    const options = defaultKonohamaruOptions("performance_2x", true, 120, "Natural", 1.2);
    expect(options).toMatchObject({
      provider: "konohamaru",
      operation: "video-upscale",
      requireNeuralUpscaling: true,
      runtimeBundleId: KONOHAMARU_RUNTIME_BUNDLE_ID,
      nodeRevision: KONOHAMARU_NODE_REVISION,
      frameInterpolation: { enabled: true, outputFps: 120, dlssEngine: "Auto" }
    });
    expect(normalizeKonohamaruTarget({
      modelId: KONOHAMARU_MODEL_ID,
      sourceWidth: 832,
      sourceHeight: 480,
      targetWidth: 1664,
      targetOutputHeight: 960,
      konohamaru: options
    })).toMatchObject({
      targetWidth: 1664,
      targetOutputHeight: 960,
      options
    });
    expect(() => normalizeKonohamaruTarget({
      modelId: KONOHAMARU_MODEL_ID,
      sourceWidth: 832,
      sourceHeight: 480,
      targetWidth: 1664,
      targetOutputHeight: 960,
      targetScale: 2,
      konohamaru: options
    })).toThrow("legacy, HECer or AetherScale");
  });

  it("validates the three upstream node schemas and fails closed when one is missing", () => {
    expect(validateKonohamaruObjectInfoSchema(konohamaruObjectInfo, { frameInterpolation: true }))
      .toMatchObject({ valid: true });
    expect(validateKonohamaruObjectInfoSchema({ ...konohamaruObjectInfo, NvidiaDLSSFrameInterpolation: undefined }, { frameInterpolation: true }))
      .toMatchObject({ valid: false, missingNodes: ["NvidiaDLSSFrameInterpolation"] });
  });

  it("accepts the current ComfyUI V3 COMBO object_info encoding", () => {
    expect(validateKonohamaruObjectInfoSchema(modernComboObjectInfo(), { frameInterpolation: true }))
      .toMatchObject({ valid: true });
  });

  it("chains neural upscale/NR before optional DLSSG frame interpolation", () => {
    const noFrame = buildKonohamaruUpscaleWorkflow(taskFor(), "input/source.mp4", konohamaruObjectInfo);
    expect(Object.keys(noFrame)).toEqual(["1", "2", "3"]);
    expect(noFrame["2"]?.inputs).toMatchObject({
      video: ["1", 0],
      upscale_mode: "1.5× (Quality)",
      require_neural_upscaling: true,
      nr_style: "Cinematic",
      nr_intensity: 1.4,
      encoding_quality: "Auto (Default)",
      video_codec: "H.264"
    });
    expect(noFrame["3"]?.inputs).toMatchObject({ video: ["2", 0], format: "mp4" });
    expect(validateKonohamaruWorkflow(noFrame, konohamaruObjectInfo).valid).toBe(true);

    const withFrame = buildKonohamaruUpscaleWorkflow(
      taskFor("quality_1_5x", true),
      "input/source.mp4",
      konohamaruObjectInfo
    );
    expect(Object.keys(withFrame)).toEqual(["1", "2", "3", "4"]);
    expect(withFrame["3"]?.inputs).toMatchObject({
      video: ["2", 0],
      output_fps: "120",
      dlss_engine: "Auto",
      encoding_quality: "Auto (Default)",
      video_codec: "H.264"
    });
    expect(withFrame["4"]?.inputs).toMatchObject({ video: ["3", 0], format: "mp4" });
    expect(validateKonohamaruWorkflow(withFrame, konohamaruObjectInfo).valid).toBe(true);
  });

  it("keeps the install catalog tied to the Git LFS-backed runtime", async () => {
    const dependency = await import("../src/core/catalog/dependencies/konohamaru");
    expect(dependency.KONOHAMARU_NODE_ID).toBe(KONOHAMARU_NODE_ID);
    expect(dependency.KONOHAMARU_RUNTIME_FILES).toEqual(expect.arrayContaining([
      "bin/runtime/host/dxgi.dll",
      "bin/runtime/dlss/nvngx_dlss.dll",
      "bin/runtime/dlssg/dlssg-worker.exe"
    ]));
  });

  it("keeps legacy queue snapshots readable without making them the new default", () => {
    const options = defaultKonohamaruOptions();
    const legacy = normalizeKonohamaruTarget({
      modelId: KONOHAMARU_MODEL_ID,
      sourceWidth: 832,
      sourceHeight: 480,
      targetWidth: 1248,
      targetOutputHeight: 720,
      konohamaru: { ...options, runtimeBundleId: KONOHAMARU_LEGACY_RUNTIME_BUNDLE_ID }
    });
    expect(legacy.options.runtimeBundleId).toBe(KONOHAMARU_LEGACY_RUNTIME_BUNDLE_ID);
    expect(defaultKonohamaruOptions().runtimeBundleId).not.toBe(KONOHAMARU_LEGACY_RUNTIME_BUNDLE_ID);
  });
});
