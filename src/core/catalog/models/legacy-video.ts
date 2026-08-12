import { component, entry, guide, comfyHunyuanBase, comfyHunyuanSource, comfyWanBase, comfyWanSource, comfyWanUmt5, comfyWanVae } from "./catalog-helpers.js";
import type { CatalogModelEntry } from "../types.js";

export const legacyVideoModelEntries: CatalogModelEntry[] = [
  entry({
    id: "wan22_5b", family: "wan22", category: "video", adapterId: "legacy-video", order: 20, inputModes: ["image"], retired: true, capabilities: { maxDurationSeconds: 10, resolutions: [480, 540] },
    scan: { vram: "预计峰值 14–18 GB", components: [
      component("Wan 2.2 5B 扩散模型", "wan2.2_*i2v/ti2v*_5B", /wan2\.?2.*(?:i2v|ti2v).*5b.*\.(safetensors|gguf)$/i, guide(comfyWanSource, `${comfyWanBase}/diffusion_models`, "diffusion_models", "wan2.2_ti2v_5B_fp16.safetensors")),
      component("UMT5 文本编码器", "text_encoders/umt5*", /text_encoders\/.*umt5.*\.(safetensors|gguf)$/i, comfyWanUmt5),
      component("Wan VAE", "vae/wan*vae*", /vae\/.*wan.*vae.*\.(safetensors|pt|ckpt)$/i, guide(comfyWanSource, `${comfyWanBase}/vae`, "vae", "wan2.2_vae.safetensors"))
    ] }
  }, { name: "Wan 2.2 I2V 5B", badge: "快速草稿", description: "适合 480p/540p 快速草稿和本机联调。" }, { name: "Wan 2.2 I2V 5B", badge: "Fast draft", description: "For fast 480p/540p drafts and local integration testing." }, { name: "Wan 2.2 I2V 5B", badge: "快速草稿", description: "適合 480p/540p 快速草稿和本機整合測試。" }),
  entry({
    id: "hunyuan15", family: "hunyuan15", category: "video", adapterId: "legacy-video", order: 19, inputModes: ["image"], retired: true, capabilities: { maxDurationSeconds: 10, resolutions: [480, 720] },
    scan: { vram: "预计峰值 21–23 GB", components: [
      component("HunyuanVideo 1.5 I2V 模型", "hunyuanvideo1.5_*i2v*", /hunyuanvideo1\.?5.*i2v.*\.(safetensors|gguf)$/i, guide(comfyHunyuanSource, `${comfyHunyuanBase}/diffusion_models`, "diffusion_models", "hunyuanvideo1.5_720p_i2v_fp16.safetensors")),
      component("HunyuanVideo 1.5 VAE", "vae/hunyuanvideo15_vae*", /vae\/.*hunyuanvideo1?5.*vae.*\.(safetensors|pt|ckpt)$/i, guide(comfyHunyuanSource, `${comfyHunyuanBase}/vae`, "vae", "hunyuanvideo15_vae_fp16.safetensors")),
      component("Qwen 2.5 VL 7B 文本编码器", "text_encoders/qwen_2.5_vl_7b*", /text_encoders\/.*qwen[_ .-]?2\.?5[_ .-]?vl[_ .-]?7b.*\.(safetensors|gguf)$/i, guide(comfyHunyuanSource, `${comfyHunyuanBase}/text_encoders`, "text_encoders", "qwen_2.5_vl_7b_fp8_scaled.safetensors")),
      component("ByT5 文本编码器", "text_encoders/byt5_small_glyphxl*", /text_encoders\/.*byt5[_ .-]?small[_ .-]?glyphxl.*\.(safetensors|gguf)$/i, guide(comfyHunyuanSource, `${comfyHunyuanBase}/text_encoders`, "text_encoders", "byt5_small_glyphxl_fp16.safetensors")),
      component("SigCLIP 视觉编码器", "clip_vision/sigclip_vision_patch14_384*", /clip_vision\/.*sigclip[_ .-]?vision[_ .-]?patch14[_ .-]?384.*\.(safetensors|gguf)$/i, guide(comfyHunyuanSource, `${comfyHunyuanBase}/clip_vision`, "clip_vision", "sigclip_vision_patch14_384.safetensors"))
    ] }
  }, { name: "HunyuanVideo 1.5 I2V", badge: "质量", description: "质量优先，默认启用 VAE 分块和 CPU 卸载。" }, { name: "HunyuanVideo 1.5 I2V", badge: "Quality", description: "Quality-first profile with tiled VAE decoding and CPU offload enabled by default." }, { name: "HunyuanVideo 1.5 I2V", badge: "品質", description: "品質優先，預設啟用 VAE 分塊和 CPU 卸載。" }),
  entry({
    id: "wan22_14b_nsfw", family: "wan22", category: "video", adapterId: "legacy-video", order: 18, inputModes: ["image"], capabilities: { maxDurationSeconds: 10, resolutions: [480, 720] },
    scan: { vram: "建议 FP8 分块与保守卸载", components: [
      component("14B 高噪声模型", "wan2.2*i2v*high*14B*", /wan2\.?2.*i2v.*high.*14b.*\.(safetensors|gguf)$/i, guide(comfyWanSource, `${comfyWanBase}/diffusion_models`, "diffusion_models", "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors")),
      component("14B 低噪声模型", "wan2.2*i2v*low*14B*", /wan2\.?2.*i2v.*low.*14b.*\.(safetensors|gguf)$/i, guide(comfyWanSource, `${comfyWanBase}/diffusion_models`, "diffusion_models", "wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors")),
      component("NSFW UMT5 编码器", "text_encoders/nsfw*umt5*", /text_encoders\/.*nsfw.*umt5.*\.(safetensors|gguf)$/i, guide("NSFW-API / NSFW-Wan-UMT5-XXL", "https://huggingface.co/NSFW-API/NSFW-Wan-UMT5-XXL/tree/main", "text_encoders", "nsfw_wan_umt5-xxl_fp8_scaled.safetensors")),
      component("Wan VAE", "vae/wan_2.1_vae*", /vae\/.*wan[_ .-]?2\.?1[_ .-]?vae.*\.(safetensors|pt|ckpt)$/i, guide(comfyWanSource, `${comfyWanBase}/vae`, "vae", "wan_2.1_vae.safetensors"))
    ] }
  }, { name: "Wan 2.2 I2V 14B + NSFW", badge: "无审查", description: "需要高/低噪声模型及无审查文本编码器完整匹配。" }, { name: "Wan 2.2 I2V 14B + NSFW", badge: "Uncensored", description: "Requires matching high/low-noise models and the uncensored text encoder." }, { name: "Wan 2.2 I2V 14B + NSFW", badge: "無審查", description: "需要高／低噪聲模型及無審查文字編碼器完整匹配。" }),
  entry({
    id: "wan22_remix", family: "wan22", category: "video", adapterId: "legacy-video", order: 17, inputModes: ["image"], retired: true,
    scan: { vram: "推荐 Q5_K_M · 保守卸载", components: [
      component("Remix v3 High", "wan22Remix*High*V30*", /wan22remix.*high.*v?3(?:\.0|0)?.*\.(safetensors|gguf)$/i, guide("BigDannyPt / Wan-2.2-Remix-GGUF", "https://huggingface.co/BigDannyPt/Wan-2.2-Remix-GGUF/tree/main/I2V/v3.0/High", "unet", "wan22RemixT2VI2V_i2vHighV30-Q5_K_M.gguf")),
      component("Remix v3 Low", "wan22Remix*Low*V30*", /wan22remix.*low.*v?3(?:\.0|0)?.*\.(safetensors|gguf)$/i, guide("BigDannyPt / Wan-2.2-Remix-GGUF", "https://huggingface.co/BigDannyPt/Wan-2.2-Remix-GGUF/tree/main/I2V/v3.0/Low", "unet", "wan22RemixT2VI2V_i2vLowV30-Q5_K_M.gguf")),
      component("UMT5 文本编码器", "text_encoders/*umt5*", /text_encoders\/.*umt5.*\.(safetensors|gguf)$/i, comfyWanUmt5),
      component("Wan VAE", "vae/wan_2.1_vae*", /vae\/.*wan[_ .-]?2\.?1[_ .-]?vae.*\.(safetensors|pt|ckpt)$/i, comfyWanVae)
    ] }
  }, { name: "Wan 2.2 Remix v3", badge: "合并模型", description: "需要 Remix v3 High/Low 两阶段文件成对存在。" }, { name: "Wan 2.2 Remix v3", badge: "Blended model", description: "Requires matching Remix v3 High and Low two-stage files." }, { name: "Wan 2.2 Remix v3", badge: "合併模型", description: "需要 Remix v3 High/Low 兩階段檔案成對存在。" }),
  entry({
    id: "wan22_smoothmix", family: "wan22", category: "video", adapterId: "legacy-video", order: 16, inputModes: ["image"], retired: true,
    scan: { vram: "推荐 Q5_K_M · 约 20–23 GB", components: [
      component("SmoothMix High", "smoothMixWan22*High*Q5_K_M", /smoothmixwan22.*high.*\.(safetensors|gguf)$/i, guide("Bedovyy / smoothMixWan22-I2V-GGUF", "https://huggingface.co/Bedovyy/smoothMixWan22-I2V-GGUF/tree/main/HighNoise", "unet", "smoothMixWan22I2VT2V_i2vHigh-Q5_K_M.gguf")),
      component("SmoothMix Low", "smoothMixWan22*Low*Q5_K_M", /smoothmixwan22.*low.*\.(safetensors|gguf)$/i, guide("Bedovyy / smoothMixWan22-I2V-GGUF", "https://huggingface.co/Bedovyy/smoothMixWan22-I2V-GGUF/tree/main/LowNoise", "unet", "smoothMixWan22I2VT2V_i2vLow-Q5_K_M.gguf")),
      component("UMT5 文本编码器", "text_encoders/*umt5*", /text_encoders\/.*umt5.*\.(safetensors|gguf)$/i, comfyWanUmt5),
      component("Wan VAE", "vae/wan_2.1_vae*", /vae\/.*wan[_ .-]?2\.?1[_ .-]?vae.*\.(safetensors|pt|ckpt)$/i, comfyWanVae)
    ] }
  }, { name: "Wan 2.2 SmoothMix I2V", badge: "写实合并模型", description: "SmoothMix High/Low 两阶段模型，偏写实人物与自然运动。" }, { name: "Wan 2.2 SmoothMix I2V", badge: "Realistic blend", description: "High/Low SmoothMix stages tuned for realistic people and natural motion." }, { name: "Wan 2.2 SmoothMix I2V", badge: "寫實合併模型", description: "SmoothMix High/Low 兩階段模型，偏寫實人物與自然運動。" }),
  entry({
    id: "wan22_dasiwa", family: "wan22", category: "video", adapterId: "legacy-video", order: 15, inputModes: ["image"], retired: true,
    scan: { vram: "Q4 · 约 19–22 GB", components: [
      component("DaSiWa v9 High", "Dasiwa*Synthseduction*q4High", /dasiwa.*synthseduction.*high.*\.(safetensors|gguf)$/i, guide("darksidewalker / DaSiWa-WAN2.2-I2V", "https://huggingface.co/darksidewalker/DaSiWa-WAN2.2-I2V/tree/main/Distilled/GGUF/v09", "unet", "DasiwaWAN22I2V14BSynthseduction_q4High.gguf")),
      component("DaSiWa v9 Low", "Dasiwa*Synthseduction*q4Low", /dasiwa.*synthseduction.*low.*\.(safetensors|gguf)$/i, guide("darksidewalker / DaSiWa-WAN2.2-I2V", "https://huggingface.co/darksidewalker/DaSiWa-WAN2.2-I2V/tree/main/Distilled/GGUF/v09", "unet", "DasiwaWAN22I2V14BSynthseduction_q4Low.gguf")),
      component("UMT5 文本编码器", "text_encoders/*umt5*", /text_encoders\/.*umt5.*\.(safetensors|gguf)$/i, comfyWanUmt5),
      component("Wan VAE", "vae/wan_2.1_vae*", /vae\/.*wan[_ .-]?2\.?1[_ .-]?vae.*\.(safetensors|pt|ckpt)$/i, comfyWanVae)
    ] }
  }, { name: "DaSiWa SynthSeduction v9", badge: "专用合并模型", description: "DaSiWa v9 High/Low 成对工作，偏写实人物与自然运动。" }, { name: "DaSiWa SynthSeduction v9", badge: "Dedicated blend", description: "DaSiWa v9 High/Low stages work as a pair for realistic people and natural motion." }, { name: "DaSiWa SynthSeduction v9", badge: "專用合併模型", description: "DaSiWa v9 High/Low 成對運作，偏寫實人物與自然運動。" }),
  entry({
    id: "hunyuan15_sr", family: "hunyuan15", category: "video", adapterId: "legacy-video", order: 14, inputModes: ["image"], retired: true,
    scan: { vram: "双阶段工作流 · 模型间卸载", components: [
      component("HunyuanVideo 1.5 I2V 模型", "hunyuanvideo1.5_*i2v*", /hunyuanvideo1\.?5.*i2v.*\.(safetensors|gguf)$/i, guide(comfyHunyuanSource, `${comfyHunyuanBase}/diffusion_models`, "diffusion_models", "hunyuanvideo1.5_720p_i2v_fp16.safetensors")),
      component("HunyuanVideo 1.5 VAE", "vae/hunyuanvideo15_vae*", /vae\/.*hunyuanvideo1?5.*vae.*\.(safetensors|pt|ckpt)$/i, guide(comfyHunyuanSource, `${comfyHunyuanBase}/vae`, "vae", "hunyuanvideo15_vae_fp16.safetensors")),
      component("Qwen 2.5 VL 7B 文本编码器", "text_encoders/qwen_2.5_vl_7b*", /text_encoders\/.*qwen[_ .-]?2\.?5[_ .-]?vl[_ .-]?7b.*\.(safetensors|gguf)$/i, guide(comfyHunyuanSource, `${comfyHunyuanBase}/text_encoders`, "text_encoders", "qwen_2.5_vl_7b_fp8_scaled.safetensors")),
      component("ByT5 文本编码器", "text_encoders/byt5_small_glyphxl*", /text_encoders\/.*byt5[_ .-]?small[_ .-]?glyphxl.*\.(safetensors|gguf)$/i, guide(comfyHunyuanSource, `${comfyHunyuanBase}/text_encoders`, "text_encoders", "byt5_small_glyphxl_fp16.safetensors")),
      component("SigCLIP 视觉编码器", "clip_vision/sigclip_vision_patch14_384*", /clip_vision\/.*sigclip[_ .-]?vision[_ .-]?patch14[_ .-]?384.*\.(safetensors|gguf)$/i, guide(comfyHunyuanSource, `${comfyHunyuanBase}/clip_vision`, "clip_vision", "sigclip_vision_patch14_384.safetensors")),
      component("Hunyuan 1080p SR 模型", "diffusion_models/hunyuanvideo1.5_1080p_sr*", /(?:diffusion_models|unet)\/hunyuanvideo1\.5_1080p_sr.*\.(safetensors|gguf)$/i, guide(comfyHunyuanSource, `${comfyHunyuanBase}/diffusion_models`, "diffusion_models", "hunyuanvideo1.5_1080p_sr_distilled_fp16.safetensors")),
      component("Hunyuan 1080p Latent Upsampler", "latent_upscale_models/hunyuanvideo15_latent_upsampler_1080p*", /latent_upscale_models\/hunyuanvideo15_latent_upsampler_1080p.*\.safetensors$/i, guide(comfyHunyuanSource, `${comfyHunyuanBase}/latent_upscale_models`, "latent_upscale_models", "hunyuanvideo15_latent_upsampler_1080p.safetensors"))
    ] }
  }, { name: "HunyuanVideo 1.5 I2V + 1080p SR", badge: "双阶段 1080p", description: "先生成 720p latent，再使用官方 8 步 SR 分支输出 1080p。" }, { name: "HunyuanVideo 1.5 I2V + 1080p SR", badge: "Two-stage 1080p", description: "Generate a 720p latent first, then use the official eight-step SR branch for 1080p output." }, { name: "HunyuanVideo 1.5 I2V + 1080p SR", badge: "雙階段 1080p", description: "先生成 720p latent，再使用官方 8 步 SR 分支輸出 1080p。" })
];
