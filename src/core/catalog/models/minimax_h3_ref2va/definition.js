import { h3Fl2vaAudioVae, h3Fl2vaVideoVae, h3Int8ConvRotVideoVae, h3LivePreviewTae, h3Nvfp4TextEncoder, h3Ref2vaInt8Model } from "../minimax_h3_shared.js";
import { localeEnUS } from "./locale.en-US.js";
import { localeZhCN } from "./locale.zh-CN.js";
import { localeZhTW } from "./locale.zh-TW.js";
export const minimaxH3Ref2va = {
    definition: {
        id: "minimax_h3_ref2va",
        family: "minimax-h3",
        variant: "r2v",
        category: "video",
        adapterId: "minimax-h3",
        promptPackId: "h3",
        order: 70,
        inputModes: ["image", "video"],
        capabilities: {
            supportsVideoExtension: true,
            supportsSpectrum: true,
            supportsReferenceSlots: true,
            maxReferenceImages: 9,
            maxDurationSeconds: 15,
            maxGeneratedFrames: 362,
            resolutions: [360, 480, 540, 720, 768]
        },
        scan: {
            vram: "pruned INT8 · DynamicVRAM · 多参考",
            integrated: true,
            components: [h3Ref2vaInt8Model, h3Nvfp4TextEncoder, h3Fl2vaVideoVae, h3Int8ConvRotVideoVae, h3Fl2vaAudioVae, h3LivePreviewTae]
        }
    },
    locales: {
        "zh-CN": localeZhCN,
        "zh-TW": localeZhTW,
        "en-US": localeEnUS
    }
};
