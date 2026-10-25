import type { CatalogModelEntry } from "../../types.js";
import { H3_BASE_RESOLUTIONS, H3_CUSTOM_RESOLUTION_RANGE } from "../../../video-resolution.js";
import { H3_MAX_DURATION_SECONDS, H3_MAX_GENERATED_FRAMES } from "../../../h3-temporal.js";
import {
  h3Fl2vaAudioVae,
  h3Fl2vaInt4Model,
  h3Int8ConvRotVideoVae,
  h3Fl2vaVideoVae,
  h3LivePreviewTae,
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
      maxDurationSeconds: H3_MAX_DURATION_SECONDS,
      maxGeneratedFrames: H3_MAX_GENERATED_FRAMES,
      customResolution: H3_CUSTOM_RESOLUTION_RANGE,
      resolutions: H3_BASE_RESOLUTIONS
    },
    scan: {
      vram: "pruned INT4 · RAM offload",
      integrated: true,
      components: [h3Fl2vaInt4Model, h3Int4TextEncoder, h3Fl2vaVideoVae, h3Int8ConvRotVideoVae, h3Fl2vaAudioVae, h3LivePreviewTae]
    }
  },
  locales: {
    "zh-CN": localeZhCN,
    "zh-TW": localeZhTW,
    "en-US": localeEnUS
  }
};
