import type { CatalogModelEntry } from "../../types.js";
import { localeEnUS } from "./locale.en-US.js";
import { localeZhCN } from "./locale.zh-CN.js";
import { localeZhTW } from "./locale.zh-TW.js";

export const minimaxH3Fl2vaTurbo: CatalogModelEntry = {
  definition: {
    id: "minimax_h3_fl2va_turbo",
    family: "minimax-h3",
    variant: "turbo",
    category: "video",
    adapterId: "minimax-h3",
    promptPackId: "h3",
    order: 0,
    inputModes: ["image", "video"],
    retired: true,
    capabilities: {
      supportsEndFrame: true,
      supportsVideoExtension: true,
      maxDurationSeconds: 15,
      maxGeneratedFrames: 362,
      resolutions: [360, 480, 540, 720, 768]
    }
  },
  locales: {
    "zh-CN": localeZhCN,
    "zh-TW": localeZhTW,
    "en-US": localeEnUS
  }
};
