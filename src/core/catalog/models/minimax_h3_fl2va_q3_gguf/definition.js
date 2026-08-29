import { h3Fl2vaAudioVae, h3Fl2vaVideoVae, h3Int8ConvRotVideoVae, h3LivePreviewTae, h3Q2GgufTextEncoder, h3Q3GgufModel } from "../minimax_h3_shared.js";
import { localeEnUS } from "./locale.en-US.js";
import { localeZhCN } from "./locale.zh-CN.js";
import { localeZhTW } from "./locale.zh-TW.js";
export const minimaxH3Fl2vaQ3Gguf = {
    definition: {
        id: "minimax_h3_fl2va_q3_gguf",
        family: "minimax-h3",
        variant: "fl2va",
        category: "video",
        adapterId: "minimax-h3",
        promptPackId: "h3",
        order: 80,
        runtimeProfile: "h3-q3-3080",
        inputModes: ["image"],
        capabilities: {
            supportsEndFrame: true,
            supportsSpectrum: false,
            supportsLivePreview: false,
            maxDurationSeconds: 5,
            maxGeneratedFrames: 124,
            resolutions: [360, 480],
            generationSteps: [4, 6, 8],
            defaultGenerationSteps: 8,
            maxGenerationSteps: 8
        },
        scan: {
            managedBy: "comfyui",
            vram: "Q3 GGUF · CPU 文本编码器 · RAM offload",
            integrated: true,
            requiredCustomNodeIds: ["comfyui-gguf-h3"],
            runtimeNodeTypes: ["H3UnetLoaderGGUFAdvanced", "H3CLIPLoaderGGUF", "MiniMaxH3ImageToVideo"],
            components: [h3Q3GgufModel, h3Q2GgufTextEncoder, h3Fl2vaVideoVae, h3Int8ConvRotVideoVae, h3Fl2vaAudioVae, h3LivePreviewTae]
        }
    },
    locales: {
        "zh-CN": localeZhCN,
        "zh-TW": localeZhTW,
        "en-US": localeEnUS
    }
};
