import type { CatalogModelEntry } from "../../types.js";
import { H3_BASE_RESOLUTIONS } from "../../../video-resolution.js";
import { h3Fl2vaAudioVae, h3Fl2vaVideoVae, h3Int8ConvRotVideoVae, h3LivePreviewTae, h3Nvfp4TextEncoder } from "../minimax_h3_shared.js";

export const FASTH3_OMNI_MODEL_ID = "minimax_h3_omni";
export const FASTH3_OMNI_MINIMUM_COMFY_VERSION = "0.42.1";
export const FASTH3_OMNI_WORKFLOW_FILENAME = "minimax_h3_omni_r2v_api.json";
const revision = "82eff2a6eee6c962846879f4bab52610a4df24d3";
const filename = "fasth3_omniref_8step_pruned_int8_convrot.safetensors";

export const minimaxH3Omni: CatalogModelEntry = {
  definition: {
    id: FASTH3_OMNI_MODEL_ID,
    family: "minimax-h3",
    variant: "r2v",
    category: "video",
    adapterId: "minimax-h3",
    promptPackId: "h3",
    order: 75,
    inputModes: ["image"],
    capabilities: {
      supportsVideoExtension: false,
      supportsSpectrum: false,
      supportsReferenceSlots: true,
      maxReferenceImages: 9,
      maxDurationSeconds: 15.1,
      maxGeneratedFrames: 362,
      resolutions: H3_BASE_RESOLUTIONS,
      generationSteps: [8],
      defaultGenerationSteps: 8,
      maxGenerationSteps: 8
    },
    scan: {
      vram: "INT8 ConvRot · 22.2 GB 权重 · DynamicVRAM / RAM offload",
      integrated: true,
      minimumComfyVersion: FASTH3_OMNI_MINIMUM_COMFY_VERSION,
      runtimeNodeTypes: ["UNETLoader", "CLIPLoader", "VAELoader", "MiniMaxH3ReferenceToVideo", "MiniMaxH3SigmaShift", "KSamplerSelect", "BasicScheduler", "BasicGuider", "SamplerCustomAdvanced", "VAEDecode", "VAEDecodeAudio", "CreateVideo", "SaveVideo"],
      components: [
        {
          label: "FastH3 Omni INT8 模型",
          expected: `diffusion_models/${filename}`,
          patterns: [/(?:diffusion_models|unet)\/fasth3_omniref_8step_pruned_int8_convrot\.safetensors$/i],
          installGuide: {
            sourceLabel: "FastVideo / FastH3-Omni-Comfy",
            downloadUrl: `https://huggingface.co/FastVideo/FastH3-Omni-Comfy/resolve/${revision}/diffusion_models/${filename}`,
            targetSubdirectory: "diffusion_models",
            recommendedFilename: filename,
            revision,
            bytes: 22_213_723_064,
            sha256: "851b2dc9670ed864b7f1e951ac9da047d83b1c04ded9bfcc1a9e5bba0ee33f80",
            license: "minimax-h3-community-license-agreement",
            notes: `需要 ComfyUI ${FASTH3_OMNI_MINIMUM_COMFY_VERSION}+ 的完整 PDD checkpoint 支持。8 步 Euler / Simple，video/audio shift 12/3；复用 H3 编码器及音视频 VAE。权重大小不等于显存需求。`
          }
        },
        h3Nvfp4TextEncoder, h3Fl2vaVideoVae, h3Int8ConvRotVideoVae, h3Fl2vaAudioVae, h3LivePreviewTae
      ]
    }
  },
  locales: {
    "zh-CN": {
      name: "FastH3 Omni · 多参考 INT8 · 8 步",
      shortName: "FastH3 Omni",
      badge: "H3 · R2V · 8 步",
      description: "FastVideo 蒸馏 H3 多参考音视频模型。沿用图片/视频参考及视频音轨，固定 8 步；需要 ComfyUI 0.42.1+。独立音频参考、续写和叠加加速尚未开放。"
    },
    "zh-TW": {
      name: "FastH3 Omni · 多參考 INT8 · 8 步",
      shortName: "FastH3 Omni",
      badge: "H3 · R2V · 8 步",
      description: "FastVideo 蒸餾 H3 多參考影音模型。沿用圖片/影片參考及影片音軌，固定 8 步；需要 ComfyUI 0.42.1+。獨立音訊參考、續寫與疊加加速尚未開放。"
    },
    "en-US": {
      name: "FastH3 Omni · multi-reference INT8 · 8 steps",
      shortName: "FastH3 Omni",
      badge: "H3 · R2V · 8 steps",
      description: "FastVideo distilled H3 with image/video references and video soundtracks, fixed at 8 steps. Requires ComfyUI 0.42.1+. Standalone audio references, extension and stacked acceleration are not enabled."
    }
  }
};
