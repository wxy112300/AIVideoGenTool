import type { CatalogModelEntry } from "../../types.js";
import {
  h3Fl2vaAudioVae,
  h3Fl2vaVideoVae,
  h3LivePreviewTae,
  h3Q2GgufTextEncoder,
  h3Q3GgufModel
} from "../minimax_h3_shared.js";
import { localeEnUS } from "./locale.en-US.js";
import { localeZhCN } from "./locale.zh-CN.js";
import { localeZhTW } from "./locale.zh-TW.js";

export const minimaxH3Fl2vaQ3Gguf: CatalogModelEntry = {
  definition: {
    id: "minimax_h3_fl2va_q3_gguf",
    family: "minimax-h3",
    variant: "fl2va",
    category: "video",
    adapterId: "minimax-h3",
    promptPackId: "h3",
    order: 80,
    inputModes: ["image"],
    capabilities: {
      supportsEndFrame: true,
      supportsSpectrum: true,
      maxDurationSeconds: 15,
      maxGeneratedFrames: 362,
      resolutions: [480, 540, 720, 768]
    },
    scan: {
      managedBy: "comfyui",
      vram: "Q3 GGUF · CPU 文本编码器 · RAM offload",
      integrated: true,
      runtimeNodeTypes: ["UnetLoaderGGUFAdvanced", "CLIPLoaderGGUF", "MiniMaxH3ImageToVideo"],
      components: [h3Q3GgufModel, h3Q2GgufTextEncoder, h3Fl2vaVideoVae, h3Fl2vaAudioVae, h3LivePreviewTae]
    }
  },
  locales: {
    "zh-CN": localeZhCN,
    "zh-TW": localeZhTW,
    "en-US": localeEnUS
  }
};
