import type { CatalogModelEntry } from "../../types.js";
import {
  h3Fl2vaAudioVae,
  h3Fl2vaInt8Model,
  h3Int8ConvRotVideoVae,
  h3Fl2vaVideoVae,
  h3LivePreviewTae,
  h3Nvfp4TextEncoder
} from "../minimax_h3_shared.js";
import { localeEnUS } from "./locale.en-US.js";
import { localeZhCN } from "./locale.zh-CN.js";
import { localeZhTW } from "./locale.zh-TW.js";

const continuumRuntimeNodeTypes = [
  "UNETLoader",
  "CLIPLoader",
  "VAELoader",
  "MiniMaxH3ImageToVideo",
  "PathchSageAttentionKJ",
  "KSamplerSelect",
  "BasicScheduler",
  "RandomNoise",
  "BasicGuider",
  "SamplerCustomAdvanced",
  "VAEDecode",
  "VAEDecodeAudio",
  "CreateVideo",
  "SaveVideo",
  "LocalVideoStudioH3LoadJointAV",
  "LocalVideoStudioH3ArtifactToContinuumState",
  "H3ContinuumJoin",
  "H3ContinuumFinish",
  "LocalVideoStudioH3SaveJointAV"
] as const;

export const minimaxH3Continuum: CatalogModelEntry = {
  definition: {
    id: "minimax_h3_continuum",
    family: "minimax-h3",
    variant: "continuum",
    category: "video",
    adapterId: "minimax-h3",
    promptPackId: "h3",
    order: 85,
    inputModes: ["video"],
    capabilities: {
      supportsVideoExtension: true,
      supportsSpectrum: true,
      maxDurationSeconds: 14,
      maxGeneratedFrames: 362,
      resolutions: [360, 480, 540, 720, 768]
    },
    scan: {
      vram: "pruned INT8 · Native AV Continuum · 阶段卸载",
      integrated: true,
      requiredCustomNodeIds: ["h3-continuum", "local-video-studio-h3-av"],
      runtimeNodeTypes: continuumRuntimeNodeTypes,
      components: [
        h3Fl2vaInt8Model,
        h3Nvfp4TextEncoder,
        h3Fl2vaVideoVae,
        h3Int8ConvRotVideoVae,
        h3Fl2vaAudioVae,
        h3LivePreviewTae
      ]
    }
  },
  locales: {
    "zh-CN": localeZhCN,
    "zh-TW": localeZhTW,
    "en-US": localeEnUS
  }
};
