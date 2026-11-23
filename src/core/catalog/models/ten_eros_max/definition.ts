import type { CatalogModelEntry } from "../../types.js";
import { H3_BASE_RESOLUTIONS, H3_CUSTOM_RESOLUTION_RANGE } from "../../../video-resolution.js";
import { h3NativeVsaR2vNodes, h3NativeVsaR2vSharedComponents } from "../minimax_h3_omni/definition.js";

export const TEN_EROS_MAX_MODEL_ID = "ten_eros_max";
export const TEN_EROS_MAX_CHECKPOINT = "10Eros_Max_8stepTurbo_v1.0_hybrid-int8_HQ.safetensors";
const revision = "875036a9e9c363483095c82ee5da18fee3cef08b";

export const tenErosMax: CatalogModelEntry = {
  definition: {
    id: TEN_EROS_MAX_MODEL_ID,
    family: "minimax-h3",
    variant: "r2v",
    category: "video",
    adapterId: "minimax-h3",
    promptPackId: "h3",
    order: 76,
    inputModes: ["image"],
    capabilities: {
      supportsVideoExtension: false,
      supportsSpectrum: false,
      supportsReferenceSlots: true,
      maxReferenceImages: 9,
      maxDurationSeconds: 15.1,
      maxGeneratedFrames: 362,
      customResolution: H3_CUSTOM_RESOLUTION_RANGE,
      resolutions: H3_BASE_RESOLUTIONS,
      generationSteps: [8, 10, 12],
      defaultGenerationSteps: 8,
      maxGenerationSteps: 12
    },
    scan: {
      vram: "INT8 HQ · 22.9 GB",
      integrated: true,
      minimumComfyVersion: "0.42.0",
      runtimeNodeTypes: h3NativeVsaR2vNodes,
      components: [
        {
          label: "10Eros-Max v1.0 INT8 HQ",
          expected: `diffusion_models/${TEN_EROS_MAX_CHECKPOINT}`,
          patterns: [/(?:diffusion_models|unet)\/10Eros_Max_8stepTurbo_v1\.0_hybrid-int8_HQ\.safetensors$/i],
          installGuide: {
            sourceLabel: "TenStrip / 10Eros-Max",
            downloadUrl: `https://huggingface.co/TenStrip/10Eros-Max/resolve/${revision}/${TEN_EROS_MAX_CHECKPOINT}`,
            targetSubdirectory: "diffusion_models",
            recommendedFilename: TEN_EROS_MAX_CHECKPOINT,
            revision,
            bytes: 22_893_198_448,
            sha256: "776194990379ecaf81f8c56925164894f78f3ab27d905c23d85c1164f20ec5bc",
            license: "minimax-h3-community-license-agreement"
          }
        },
        ...h3NativeVsaR2vSharedComponents
      ]
    }
  },
  locales: {
    "zh-CN": {
      name: "10Eros-Max v1.0 · INT8 HQ",
      shortName: "10Eros-Max v1.0",
      badge: "H3 · R2V",
      description: "多参考音视频，单阶段 LCM / Simple，8–12 步。"
    },
    "zh-TW": {
      name: "10Eros-Max v1.0 · INT8 HQ",
      shortName: "10Eros-Max v1.0",
      badge: "H3 · R2V",
      description: "多參考影音，單階段 LCM / Simple，8–12 步。"
    },
    "en-US": {
      name: "10Eros-Max v1.0 · INT8 HQ",
      shortName: "10Eros-Max v1.0",
      badge: "H3 · R2V",
      description: "Multi-reference audio-video with single-pass LCM / Simple at 8–12 steps."
    }
  }
};
