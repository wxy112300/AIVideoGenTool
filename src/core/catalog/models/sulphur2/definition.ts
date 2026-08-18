import type { CatalogModelEntry } from "../../types.js";
import { localeEnUS } from "./locale.en-US.js";
import { localeZhCN } from "./locale.zh-CN.js";
import { localeZhTW } from "./locale.zh-TW.js";

const sulphurScan = (profile: "q2_distilled" | "q3_k_m" | "q4_k_m") => ({
  vram: profile === "q2_distilled"
    ? "Q2 distilled · CPU offload · 独立 VAE"
    : profile === "q3_k_m"
      ? "Q3 默认 · CPU offload · 独立 VAE"
      : "Q4 dev · CPU offload · 独立 VAE",
  components: [
    {
      label: profile === "q2_distilled" ? "Sulphur 2 Q2_K distilled GGUF" : profile === "q3_k_m" ? "Sulphur 2 Q3_K_M dev GGUF" : "Sulphur 2 Q4_K_M dev GGUF",
      expected: profile === "q2_distilled" ? "unet/sulphur-2-distilled-Q2_K.gguf" : profile === "q3_k_m" ? "unet/sulphur_dev-Q3_K_M.gguf" : "unet/sulphur_dev-Q4_K_M.gguf",
      patterns: [profile === "q2_distilled" ? /unet\/sulphur-2-distilled-q2_k\.gguf$/i : profile === "q3_k_m" ? /unet\/sulphur_dev-q3_k_m\.gguf$/i : /unet\/sulphur_dev-q4_k_m\.gguf$/i]
    },
    { label: "Gemma 3 文本编码器", expected: "text_encoders/gemma_3_12B_it_fp4_mixed.safetensors", patterns: [/text_encoders\/gemma_3_12b_it_fp4_mixed\.safetensors$/i] },
    { label: "LTX 2.3 文本连接器", expected: "text_encoders/ltx-2-3-22b-text_encoder.safetensors", patterns: [/text_encoders\/ltx-2-3-22b-text_encoder\.safetensors$/i] },
    { label: "LTX 2.3 视频 VAE", expected: "vae/ltx-2-3-22b-VAE.safetensors", patterns: [/vae\/ltx-2-3-22b-vae\.safetensors$/i] },
    { label: "LTX 2.3 音频 VAE", expected: "checkpoints/ltx-2-3-22b-audio_vae.safetensors", patterns: [/checkpoints\/ltx-2-3-22b-audio_vae\.safetensors$/i] },
    ...(profile === "q2_distilled" ? [] : [{ label: "LTX 2.3 蒸馏 LoRA", expected: "loras/ltx-2.3-22b-distilled-lora-1.1*", patterns: [/loras\/ltx-2\.3-22b-distilled-lora-1\.1.*\.safetensors$/i] }]),
    { label: "LTX 2.3 Latent Upscaler", expected: "latent_upscale_models/ltx-2-spatial-upscaler-x2-1.0.safetensors", patterns: [/latent_upscale_models\/ltx-2-spatial-upscaler-x2-1\.0\.safetensors$/i] }
  ]
});

export const sulphur2: CatalogModelEntry = {
  definition: {
    id: "sulphur2",
    family: "sulphur2",
    category: "video",
    adapterId: "sulphur2",
    order: 50,
    inputModes: ["image", "video"],
    capabilities: {
      supportsVideoExtension: true,
      maxDurationSeconds: 10,
      maxGeneratedFrames: 121,
      resolutions: [360, 480, 720]
    },
    scanVariants: {
      q2_distilled: sulphurScan("q2_distilled"),
      q3_k_m: sulphurScan("q3_k_m"),
      q4_k_m: sulphurScan("q4_k_m")
    }
  },
  locales: {
    "zh-CN": localeZhCN,
    "zh-TW": localeZhTW,
    "en-US": localeEnUS
  }
};
