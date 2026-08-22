import { component, entry, guide } from "./catalog-helpers.js";
import { seedVr2NativeModelFilename, seedVr2NativeRequiredNodes, seedVr2NativeVaeFilename } from "../../seedvr2-native.js";
export const postProcessModelEntries = [
    entry({ id: "seedvr2-native-int8", family: "seedvr2", category: "upscale", adapterId: "seedvr2-native-int8", order: 110, inputModes: ["video"], scan: {
            vram: "INT8 · 1 step · 512 tile · 长视频需时间分段",
            runtimeNodeTypes: seedVr2NativeRequiredNodes,
            components: [
                component("SeedVR2 3B INT8 ConvRot", `diffusion_models/${seedVr2NativeModelFilename}`, new RegExp(`(?:^|\\/)diffusion_models\\/${seedVr2NativeModelFilename.replaceAll(".", "\\.")}$`, "i"), guide("Comfy-Org / SeedVR2", `https://huggingface.co/Comfy-Org/SeedVR2/resolve/main/diffusion_models/${seedVr2NativeModelFilename}?download=true`, "diffusion_models", seedVr2NativeModelFilename, "原生 ComfyUI SeedVR2 3B INT8 ConvRot 权重；需要支持 SeedVR2 原生节点的 ComfyUI 核心。")),
                component("SeedVR2 EMA VAE FP16", `vae/${seedVr2NativeVaeFilename}`, new RegExp(`(?:^|\\/)vae\\/${seedVr2NativeVaeFilename.replaceAll(".", "\\.")}$`, "i"), guide("Comfy-Org / SeedVR2", `https://huggingface.co/Comfy-Org/SeedVR2/resolve/main/vae/${seedVr2NativeVaeFilename}?download=true`, "vae", seedVr2NativeVaeFilename, "与原生 3B INT8 工作流配套的 FP16 EMA VAE。"))
            ]
        } }, {
        name: "SeedVR2 3B INT8 ConvRot · 原生",
        badge: "4090 原生",
        description: "ComfyUI 原生 SeedVR2 单步超分路径，使用 INT8 ConvRot 与 FP16 EMA VAE；长视频按时间分段以控制显存。"
    }, {
        name: "SeedVR2 3B INT8 ConvRot · Native",
        badge: "Native 4090",
        description: "Native ComfyUI one-step SeedVR2 path using INT8 ConvRot and an FP16 EMA VAE; segment long videos to bound VRAM."
    }, {
        name: "SeedVR2 3B INT8 ConvRot · 原生",
        badge: "4090 原生",
        description: "ComfyUI 原生 SeedVR2 單步超分路徑，使用 INT8 ConvRot 與 FP16 EMA VAE；長影片按時間分段以控制顯存。"
    }),
    entry({ id: "seedvr2", family: "seedvr2", category: "upscale", adapterId: "seedvr2", order: 100, inputModes: ["video"], scan: { vram: "预计峰值 18–23 GB", components: [
                component("SeedVR2 主模型", "SEEDVR2/seedvr2_ema_3b 或 7b", /(?:^|\/)seedvr2\/.*seedvr2_ema_(?:3b|7b).*\.(safetensors|pt)$/i, guide("numz / SeedVR2_comfyUI", "https://huggingface.co/numz/SeedVR2_comfyUI/resolve/main/seedvr2_ema_3b_fp8_e4m3fn.safetensors", "SEEDVR2", "seedvr2_ema_3b_fp8_e4m3fn.safetensors")),
                component("SeedVR2 VAE", "SEEDVR2/ema_vae*", /seedvr2\/.*ema_vae.*\.(safetensors|pt)$/i, guide("numz / SeedVR2_comfyUI", "https://huggingface.co/numz/SeedVR2_comfyUI/resolve/main/ema_vae_fp16.safetensors", "SEEDVR2", "ema_vae_fp16.safetensors"))
            ] } }, { name: "SeedVR2", badge: "推荐", description: "视频时间一致性优先，适合人物和真实画面。" }, { name: "SeedVR2", badge: "Recommended", description: "Prioritizes temporal consistency for people and realistic footage." }, { name: "SeedVR2", badge: "推薦", description: "優先維持影片時間一致性，適合人物和真實畫面。" }),
    entry({ id: "flashvsr", family: "flashvsr", category: "upscale", adapterId: "flashvsr", order: 90, inputModes: ["video"], scan: { vram: "预计峰值 14–19 GB", components: [
                component("FlashVSR 模型", "FlashVSR/FlashVSR1_1.safetensors（或上游长文件名）", /flashvsr\/(?:flashvsr1_1|wan2_1-t2v-1\.1_3b_flashvsr_fp32)\.safetensors$/i, guide("1038lab / FlashVSR", "https://huggingface.co/1038lab/FlashVSR/resolve/main/FlashVSR1_1.safetensors", "FlashVSR", "FlashVSR1_1.safetensors", "节点当前运行时会优先读取 FlashVSR1_1.safetensors；上游 README 中的 Wan2_1-T2V-1.1_3B_FlashVSR_fp32.safetensors 也会被识别。")),
                component("Wan 2.1 VAE", "FlashVSR/Wan2.1_VAE.safetensors", /flashvsr\/wan2\.1_vae\.safetensors$/i, guide("1038lab / FlashVSR", "https://huggingface.co/1038lab/FlashVSR/resolve/main/Wan2.1_VAE.safetensors", "FlashVSR", "Wan2.1_VAE.safetensors")),
                component("LQ Projection", "FlashVSR/LQ_proj_in.safetensors（或上游长文件名）", /flashvsr\/(?:lq_proj_in|wan2_1_flashvsr_lq_proj_model_bf16)\.safetensors$/i, guide("1038lab / FlashVSR", "https://huggingface.co/1038lab/FlashVSR/resolve/main/LQ_proj_in.safetensors", "FlashVSR", "LQ_proj_in.safetensors", "兼容上游 Wan2_1_FlashVSR_LQ_proj_model_bf16.safetensors 文件名。")),
                component("TCDecoder", "FlashVSR/TCDecoder.safetensors（或上游长文件名）", /flashvsr\/(?:tcdecoder|wan2_1_flashvsr_tcdecoder_fp32)\.safetensors$/i, guide("1038lab / FlashVSR", "https://huggingface.co/1038lab/FlashVSR/resolve/main/TCDecoder.safetensors", "FlashVSR", "TCDecoder.safetensors", "兼容上游 Wan2_1_FlashVSR_TCDecoder_fp32.safetensors 文件名。")),
                component("Prompt Embedding", "FlashVSR/Prompt.safetensors", /flashvsr\/prompt\.safetensors$/i, guide("1038lab / FlashVSR", "https://huggingface.co/1038lab/FlashVSR/resolve/main/Prompt.safetensors", "FlashVSR", "Prompt.safetensors"))
            ] } }, { name: "FlashVSR", badge: "平衡", description: "质量、速度和时间一致性的平衡选择。" }, { name: "FlashVSR", badge: "Balanced", description: "A balance of quality, speed, and temporal consistency." }, { name: "FlashVSR", badge: "平衡", description: "在品質、速度和時間一致性之間取得平衡。" }),
    entry({ id: "realesrgan", family: "realesrgan", category: "upscale", adapterId: "realesrgan", order: 80, inputModes: ["video"], scan: { vram: "预计峰值 6–9 GB", components: [component("Real-ESRGAN x4 模型", "upscale_models/RealESRGAN*x4*", /upscale_models\/.*realesrgan.*x4.*\.(safetensors|pth|pt)$/i, guide("Real-ESRGAN 官方 Releases", "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth", "upscale_models", "RealESRGAN_x4plus.pth"))] } }, { name: "Real-ESRGAN x4plus", badge: "快速", description: "占用较低，适合快速检查和非人像内容。" }, { name: "Real-ESRGAN x4plus", badge: "Fast", description: "Low resource use for quick checks and non-portrait content." }, { name: "Real-ESRGAN x4plus", badge: "快速", description: "資源占用較低，適合快速檢查和非人像內容。" }),
    entry({ id: "rife", family: "rife", category: "interpolation", adapterId: "rife", order: 70, inputModes: ["video"], scan: { vram: "BF16 · 单帧批次 · 逐帧清缓存", components: [component("RIFE 4.7 插帧模型", "ComfyUI-Frame-Interpolation/ckpts/rife/rife47.pth", /frame_interpolation\/rife47\.pth$/i, guide("ComfyUI Frame Interpolation / RIFE", "https://github.com/Fannovel16/ComfyUI-Frame-Interpolation/releases/download/models/rife47.pth", "custom_nodes/ComfyUI-Frame-Interpolation/ckpts/rife", "rife47.pth"))] } }, { name: "RIFE Frame Interpolation", badge: "插帧", description: "将较少的生成帧插值到目标 FPS，降低视频大模型和 VAE 的总体压力。" }, { name: "RIFE Frame Interpolation", badge: "Interpolation", description: "Interpolates fewer generated frames to the target FPS, reducing total video-model and VAE load." }, { name: "RIFE Frame Interpolation", badge: "插幀", description: "將較少的生成影格插值到目標 FPS，降低影片大模型和 VAE 的整體壓力。" })
];
