import type { CatalogModelEntry } from "../../types.js";
import {
  h3Fl2vaAudioVae,
  h3Fl2vaInt4Model,
  h3Fl2vaVideoVae,
  h3Int4TextEncoder
} from "../minimax_h3_shared.js";
import { localeEnUS } from "./locale.en-US.js";
import { localeZhCN } from "./locale.zh-CN.js";
import { localeZhTW } from "./locale.zh-TW.js";

export const minimaxH3Fl2vaInt4: CatalogModelEntry = {
  definition: {
    id: "minimax_h3_fl2va_int4",
    family: "minimax-h3",
    variant: "fl2va",
    category: "video",
    adapterId: "minimax-h3",
    promptPackId: "h3",
    order: 90,
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
      vram: "pruned INT4 · RAM offload",
      integrated: true,
      components: [h3Fl2vaInt4Model, h3Int4TextEncoder, h3Fl2vaVideoVae, h3Fl2vaAudioVae]
    }
  },
  locales: {
    "zh-CN": localeZhCN,
    "zh-TW": localeZhTW,
    "en-US": localeEnUS
  }
};
