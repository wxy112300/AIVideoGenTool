import type { CatalogModelEntry } from "../../types.js";
import {
  h3Fl2vaAudioVae,
  h3Fl2vaInt8Model,
  h3Fl2vaVideoVae,
  h3Nvfp4TextEncoder
} from "../minimax_h3_shared.js";
import { localeEnUS } from "./locale.en-US.js";
import { localeZhCN } from "./locale.zh-CN.js";
import { localeZhTW } from "./locale.zh-TW.js";

export const minimaxH3Fl2va: CatalogModelEntry = {
  definition: {
    id: "minimax_h3_fl2va",
    family: "minimax-h3",
    variant: "fl2va",
    category: "video",
    adapterId: "minimax-h3",
    promptPackId: "h3",
    order: 100,
    inputModes: ["image", "video"],
    capabilities: {
      supportsEndFrame: true,
      supportsVideoExtension: true,
      supportsSpectrum: true,
      maxDurationSeconds: 15,
      maxGeneratedFrames: 362,
      resolutions: [480, 540, 720, 768]
    },
    scan: {
      vram: "pruned INT8 · DynamicVRAM · 阶段卸载",
      integrated: true,
      components: [h3Fl2vaInt8Model, h3Nvfp4TextEncoder, h3Fl2vaVideoVae, h3Fl2vaAudioVae]
    }
  },
  locales: {
    "zh-CN": localeZhCN,
    "zh-TW": localeZhTW,
    "en-US": localeEnUS
  }
};
