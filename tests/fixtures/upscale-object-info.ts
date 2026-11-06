import { KONOHAMARU_MODE_SPECS, KONOHAMARU_NR_PRESETS, KONOHAMARU_NR_STYLES, KONOHAMARU_DLSS_MODEL_PRESETS, KONOHAMARU_FRAME_FPS_VALUES, KONOHAMARU_DLSS_ENGINES } from "../../src/core/konohamaru-dlss5.js";

function stringInput(): [string, Record<string, never>] {
  return ["STRING", {}];
}

function videoInput(): [string, Record<string, never>] {
  return ["VIDEO", {}];
}

function enumInput(values: readonly (string | number)[]): [(string | number)[], Record<string, never>] {
  return [[...values], {}];
}

export const konohamaruObjectInfo = {
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


export const dlss5ObjectInfo = {
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
