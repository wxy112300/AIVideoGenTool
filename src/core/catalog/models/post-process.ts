import { component, entry, guide } from "./catalog-helpers.js";
import type { CatalogModelEntry } from "../types.js";
import {
  h3LearnedLatentUpscaler,
  h3Fl2vaInt8Model, h3Nvfp4TextEncoder, h3Int8ConvRotVideoVae, h3Fl2vaAudioVae,
} from "./minimax_h3_shared.js";
import { H3_REFINER_ID, H3_REFINER_FILENAME, H3_REFINER_REVISION, H3_REFINER_TURBO_FILENAME, H3_REFINER_TURBO_REVISION, H3_REFINER_NODES } from "../../h3-refiner.js";
import {
  seedVr2NativeModelFilename,
  seedVr2NativeRequiredNodes,
  seedVr2NativeVaeFilename
} from "../../seedvr2-native.js";
import { KONOHAMARU_NODE_ID } from "../dependencies/konohamaru.js";

export const postProcessModelEntries: CatalogModelEntry[] = [
  entry({
    id: H3_REFINER_ID, family: "h3-refiner", category: "upscale", adapterId: "h3-kijai-refiner",
    order: 106, inputModes: ["video"], capabilities: { resolutions: [1080, 1440, 2160], maxDurationSeconds: 15 },
    scan: {
      integrated: true, vram: "INT8 · tiled · 本机基准待完成", minimumComfyVersion: "0.36.0",
      requiredCustomNodeIds: ["local-video-studio-h3-av", "mmh3-ultimate-upscale", "minimax-h3-learned-upscaler", "kjnodes", "video-helper-suite"],
      runtimeNodeTypes: H3_REFINER_NODES,
      components: [h3Fl2vaInt8Model, h3Nvfp4TextEncoder, h3Int8ConvRotVideoVae, h3Fl2vaAudioVae, h3LearnedLatentUpscaler,
        component("Kijai Open-H3 Refiner rank 384", `loras/${H3_REFINER_FILENAME}`,
          /loras\/minimax_h3_open_regenerate_2k_refiner_rank_384_bf16\.safetensors$/i,
          { ...guide("Kijai / MiniMax-H3-experimental", `https://huggingface.co/Kijai/MiniMax-H3-experimental/resolve/${H3_REFINER_REVISION}/loras/${H3_REFINER_FILENAME}`, "loras", H3_REFINER_FILENAME,
            "仅 Refiner，不含 Turbo/LMS；本模式另配固定 Turbo v1.2，不等同 NV 完整 SoL/LMS 流程。"), revision: H3_REFINER_REVISION,
            sha256: "4bf30291343eef5e51ee867ba37dd31bce3133d1da1ace1a245a7130b88818c2" }),
        component("LightX2V Turbo v1.2 · Refiner 配套", `loras/${H3_REFINER_TURBO_FILENAME}`,
          /loras\/minimax_h3_fl2v_turbo_4step_v1\.2_768p_comfyui_bf16\.safetensors$/i,
          { ...guide("LightX2V / Minimax-h3-Turbo", `https://huggingface.co/lightx2v/Minimax-h3-Turbo/resolve/${H3_REFINER_TURBO_REVISION}/${H3_REFINER_TURBO_FILENAME}`, "loras", H3_REFINER_TURBO_FILENAME,
            "此精修配方固定 v1.2；不要用 Create 当前的 v1.3 或其他蒸馏 LoRA 替换。"), revision: H3_REFINER_TURBO_REVISION,
            sha256: "c8168ebc17bbacc4296103dda2fec1ba85b24392fa08cf2bfbcef0cff0dc3cc8" })]
    }
  }, { name: "H3 Refiner · Kijai", description: "视频精修放大至 4K；最长 15 秒，输出 24 FPS。" },
  { name: "H3 Refiner · Kijai", description: "Video refinement up to 4K; up to 15 seconds, output at 24 FPS." },
  { name: "H3 Refiner · Kijai", description: "影片精修放大至 4K；最長 15 秒，輸出 24 FPS。" }),
  entry({
    id: "minimax_h3_latent_upscaler",
    family: "minimax-h3",
    category: "upscale",
    adapterId: "h3-comfyui-second-sampling",
    order: 105,
    inputModes: ["video"],
    capabilities: { resolutions: [720, 768, 1080, 1440] },
    scan: {
      vram: "RTX 4090 · GPU VAE · 1440p tiled 峰值实测约 22.7 GiB",
      integrated: true,
      requiredCustomNodeIds: ["minimax-h3-learned-upscaler"],
      runtimeNodeTypes: ["MinimaxH3LatentUpscaler3D"],
      components: [h3LearnedLatentUpscaler]
    }
  }, {
    name: "MiniMax H3 Learned 3D Latent Upscaler",
    badge: "H3 Native · 3D",
    description: "H3 原生音画数据放大；1440p 另需 MMH3 Ultimate Upscale。"
  }, {
    name: "MiniMax H3 Learned 3D Latent Upscaler",
    badge: "H3 Native · 3D",
    description: "Native H3 audio/video latent upscaling; 1440p also requires MMH3 Ultimate Upscale."
  }, {
    name: "MiniMax H3 Learned 3D Latent Upscaler",
    badge: "H3 Native · 3D",
    description: "H3 原生音畫資料放大；1440p 另需 MMH3 Ultimate Upscale。"
  }),
  entry({ id: "seedvr2-native-int8", family: "seedvr2", category: "upscale", adapterId: "seedvr2-native-int8", order: 110, inputModes: ["video"], scan: {
    vram: "INT8 · 1 step · 512 tile · 长视频需时间分段",
    runtimeNodeTypes: seedVr2NativeRequiredNodes,
    components: [
      component(
        "SeedVR2 3B INT8 ConvRot",
        `diffusion_models/${seedVr2NativeModelFilename}`,
        new RegExp(`(?:^|\\/)diffusion_models\\/${seedVr2NativeModelFilename.replaceAll(".", "\\.")}$`, "i"),
        guide(
          "Comfy-Org / SeedVR2",
          `https://huggingface.co/Comfy-Org/SeedVR2/resolve/main/diffusion_models/${seedVr2NativeModelFilename}?download=true`,
          "diffusion_models",
          seedVr2NativeModelFilename,
          "原生 ComfyUI SeedVR2 3B INT8 ConvRot 权重；需要支持 SeedVR2 原生节点的 ComfyUI 核心。"
        )
      ),
      component(
        "SeedVR2 EMA VAE FP16",
        `vae/${seedVr2NativeVaeFilename}`,
        new RegExp(`(?:^|\\/)vae\\/${seedVr2NativeVaeFilename.replaceAll(".", "\\.")}$`, "i"),
        guide(
          "Comfy-Org / SeedVR2",
          `https://huggingface.co/Comfy-Org/SeedVR2/resolve/main/vae/${seedVr2NativeVaeFilename}?download=true`,
          "vae",
          seedVr2NativeVaeFilename,
          "与原生 3B INT8 工作流配套的 FP16 EMA VAE。"
        )
      )
    ]
  } },
    {
      name: "SeedVR2 3B INT8 ConvRot · 原生",
      badge: "4090 原生",
      description: "原生单步视频放大；长视频需分段处理。"
    },
    {
      name: "SeedVR2 3B INT8 ConvRot · Native",
      badge: "Native 4090",
      description: "Native one-step video upscaling; segment long videos."
    },
    {
      name: "SeedVR2 3B INT8 ConvRot · 原生",
      badge: "4090 原生",
      description: "原生單步影片放大；長影片需分段處理。"
    }
  ),
  entry({ id: "seedvr2", family: "seedvr2", category: "upscale", adapterId: "seedvr2", order: 100, inputModes: ["video"], scan: { vram: "预计峰值 18–23 GB", components: [
    component("SeedVR2 主模型", "SEEDVR2/seedvr2_ema_3b 或 7b", /(?:^|\/)seedvr2\/.*seedvr2_ema_(?:3b|7b).*\.(safetensors|pt)$/i, guide("numz / SeedVR2_comfyUI", "https://huggingface.co/numz/SeedVR2_comfyUI/resolve/main/seedvr2_ema_3b_fp8_e4m3fn.safetensors", "SEEDVR2", "seedvr2_ema_3b_fp8_e4m3fn.safetensors")),
    component("SeedVR2 VAE", "SEEDVR2/ema_vae*", /seedvr2\/.*ema_vae.*\.(safetensors|pt)$/i, guide("numz / SeedVR2_comfyUI", "https://huggingface.co/numz/SeedVR2_comfyUI/resolve/main/ema_vae_fp16.safetensors", "SEEDVR2", "ema_vae_fp16.safetensors"))
  ] } }, { name: "SeedVR2", badge: "推荐", description: "视频时间一致性优先，适合人物和真实画面。" }, { name: "SeedVR2", badge: "Recommended", description: "Prioritizes temporal consistency for people and realistic footage." }, { name: "SeedVR2", badge: "推薦", description: "優先維持影片時間一致性，適合人物和真實畫面。" }),
  entry({
    id: "dlss5-konohamaru",
    family: "dlss5-konohamaru",
    category: "upscale",
    adapterId: "dlss5-konohamaru",
    order: 115,
    inputModes: ["video"],
    scan: {
      managedBy: "comfyui",
      vram: "NVIDIA RTX · DLSS5 runtime · 本机基准待完成",
      integrated: true,
      requiredCustomNodeIds: [KONOHAMARU_NODE_ID],
      runtimeNodeTypes: [
        "LoadVideo",
        "SaveVideo",
        "NvidiaDLSSVideoUpscale",
        "NvidiaDLSSFrameInterpolation"
      ],
      components: []
    }
  }, {
    name: "Konohamaru DLSS5 Visual Enhancer · Temporal Neural",
    badge: "DLSS5 · 可混合",
    description: "DLSS 视频放大与时序增强，可选补帧。"
  }, {
    name: "Konohamaru DLSS5 Visual Enhancer · Temporal Neural",
    badge: "DLSS5 · Composable",
    description: "DLSS upscaling and temporal enhancement, with optional frame interpolation."
  }, {
    name: "Konohamaru DLSS5 Visual Enhancer · Temporal Neural",
    badge: "DLSS5 · 可混合",
    description: "DLSS 影片放大與時序增強，可選補幀。"
  }),
  entry({
    id: "dlss5-sr",
    family: "dlss5",
    category: "upscale",
    adapterId: "dlss5-sr",
    order: 95,
    inputModes: ["video"],
    retired: true,
    scan: {
      managedBy: "comfyui",
      vram: "Windows + NVIDIA · DLSS SR runtime · 待实机验证",
      integrated: true,
      requiredCustomNodeIds: ["comfyui-dlss5"],
      runtimeNodeTypes: ["DLSSSuperResolution"],
      // DLSS uses source frames plus a separately managed runtime; it has no
      // ComfyUI checkpoint that should be presented as a fake model weight.
      components: []
    }
  }, {
    name: "DLSS Super Resolution · 已归档",
    badge: "Windows + NVIDIA · 已归档",
    description: "HECer 原版 DLSS Super Resolution 历史候选路径，已淘汰；仅保留历史记录与面板替换接缝。"
  }, {
    name: "DLSS Super Resolution · Archived",
    badge: "Windows + NVIDIA · Archived",
    description: "Historical candidate using the original HECer DLSS Super Resolution node; retired and retained only for history and panel replacement."
  }, {
    name: "DLSS Super Resolution · 已歸檔",
    badge: "Windows + NVIDIA · 已歸檔",
    description: "使用 HECer 原版 DLSS Super Resolution 節點的歷史候選路徑；已淘汰，僅保留歷史記錄與面板替換接縫。"
  }),
  entry({
    id: "aetherscale-dlss5",
    family: "aetherscale-dlss5",
    category: "upscale",
    adapterId: "aetherscale-dlss5",
    order: 96,
    inputModes: ["video"],
    retired: true,
    scan: {
      managedBy: "comfyui",
      vram: "Windows + NVIDIA · carrier DLSS5 · 待实机验证",
      integrated: true,
      requiredCustomNodeIds: ["comfyui-aetherscale"],
      runtimeNodeTypes: ["AetherScaleMotionAnalysis", "AetherScaleNeuralRendering"],
      components: []
    }
  }, {
    name: "AetherScale DLSS5 Neural Rendering · 已归档",
    badge: "Carrier · 已归档",
    description: "AetherScale v0.5.5 的历史 carrier-backed Neural Rendering 路径，已淘汰；仅保留历史记录与面板替换接缝。"
  }, {
    name: "AetherScale DLSS5 Neural Rendering · Archived",
    badge: "Carrier · Archived",
    description: "Historical AetherScale v0.5.5 carrier-backed Neural Rendering path; retired and retained only for history and panel replacement."
  }, {
    name: "AetherScale DLSS5 Neural Rendering · 已歸檔",
    badge: "Carrier · 已歸檔",
    description: "AetherScale v0.5.5 temporal motion 與 carrier-backed Neural Rendering 的歷史路徑；已淘汰，僅保留歷史記錄與面板替換接縫。"
  }),
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
