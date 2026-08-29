import type {
  CatalogInstallGuide,
  CatalogModelComponent
} from "../types.js";

const h3OfficialSource = "Comfy-Org / MiniMax-H3";
const h3OfficialBaseUrl = "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main";
const h3Int4Source = "Merserk / MiniMax-H3-INT4-ConvRot";
const h3Int4BaseUrl = "https://huggingface.co/Merserk/MiniMax-H3-INT4-ConvRot/resolve/main";
const h3Q3Source = "Unsloth / MiniMax-H3-GGUF";
const h3Q3BaseUrl = "https://huggingface.co/unsloth/MiniMax-H3-GGUF/resolve/main";
const h3ExperimentalVaeSource = "Kijai / MiniMax-H3-experimental";
const h3ExperimentalVaeBaseUrl = "https://huggingface.co/Kijai/MiniMax-H3-experimental/resolve/main";

function guide(
  sourceLabel: string,
  downloadUrl: string,
  targetSubdirectory: string,
  recommendedFilename: string,
  notes?: string
): CatalogInstallGuide {
  return {
    sourceLabel,
    downloadUrl,
    targetSubdirectory,
    recommendedFilename,
    ...(notes ? { notes } : {})
  };
}

export function h3Component(options: {
  label: string;
  expected: string;
  pattern: RegExp;
  installGuide?: CatalogInstallGuide;
  optional?: boolean;
  alternativeGroup?: string;
}): CatalogModelComponent {
  return {
    label: options.label,
    expected: options.expected,
    patterns: [options.pattern],
    ...(options.installGuide ? { installGuide: options.installGuide } : {}),
    ...(options.optional ? { optional: true } : {}),
    ...(options.alternativeGroup ? { alternativeGroup: options.alternativeGroup } : {})
  };
}

export const h3LivePreviewTae = h3Component({
  label: "MiniMax H3 TAE 实时预览（可选）",
  expected: "vae_approx/taeh3.safetensors",
  pattern: /vae_approx\/taeh3\.safetensors$/i,
  optional: true,
  installGuide: guide(
    "Kijai / MiniMax-H3-TAE",
    "https://huggingface.co/Kijai/MiniMax-H3-TAE/resolve/main/vae_approx/taeh3.safetensors",
    "vae_approx",
    "taeh3.safetensors",
    "供 KJNodes Model Preview Override 在采样期间解码低分辨率 RGB 预览；不参与最终视频 VAE 解码。"
  )
});

export const h3Fl2vaVideoVae = h3Component({
  label: "MiniMax H3 视频 VAE",
  expected: "vae/minimax_h3_video_vae_fp16.safetensors",
  pattern: /vae\/minimax_h3_video_vae_fp16\.safetensors$/i,
  alternativeGroup: "minimax-h3-video-vae",
  installGuide: guide(
    h3OfficialSource,
    `${h3OfficialBaseUrl}/vae/minimax_h3_video_vae_fp16.safetensors`,
    "vae",
    "minimax_h3_video_vae_fp16.safetensors"
  )
});

export const h3Int8ConvRotVideoVae = h3Component({
  label: "MiniMax H3 视频 VAE · INT8 ConvRot",
  expected: "vae/minimax_h3_video_vae_int8_convrot.safetensors",
  pattern: /vae\/minimax_h3_video_vae_int8_convrot\.safetensors$/i,
  alternativeGroup: "minimax-h3-video-vae",
  installGuide: guide(
    h3ExperimentalVaeSource,
    `${h3ExperimentalVaeBaseUrl}/minimax_h3_video_vae_int8_convrot.safetensors`,
    "vae",
    "minimax_h3_video_vae_int8_convrot.safetensors",
    "实验性 H3 视频 VAE 解码后端；需要 ComfyUI 0.31.0 或更高版本。未安装时工作流自动使用 FP16。"
  )
});

export const h3Fl2vaAudioVae = h3Component({
  label: "MiniMax H3 音频 VAE",
  expected: "vae/minimax_h3_audio_vae_fp32.safetensors",
  pattern: /vae\/minimax_h3_audio_vae_fp32\.safetensors$/i,
  installGuide: guide(
    h3OfficialSource,
    `${h3OfficialBaseUrl}/vae/minimax_h3_audio_vae_fp32.safetensors`,
    "vae",
    "minimax_h3_audio_vae_fp32.safetensors",
    "H3 原生立体声音频必须使用此 VAE；与视频 VAE 一起放在 models/vae。"
  )
});

export const h3Nvfp4TextEncoder = h3Component({
  label: "Qwen3-VL 32B H3 文本编码器",
  expected: "text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
  pattern: /text_encoders\/qwen3vl_32b_minimax_h3_nvfp4_awq\.safetensors$/i,
  installGuide: guide(
    h3OfficialSource,
    `${h3OfficialBaseUrl}/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors`,
    "text_encoders",
    "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
    "官方低显存工作流使用 NVFP4 AWQ；是否适合当前设备取决于 GPU 对量化布局的支持和 ComfyUI 的卸载策略。"
  )
});

export const h3Int4TextEncoder = h3Component({
  label: "Qwen3-VL 32B H3 INT4 文本编码器",
  expected: "text_encoders/qwen3vl_32b_minimax_h3_int4_convrot.safetensors",
  pattern: /text_encoders\/qwen3vl_32b_minimax_h3_int4_convrot\.safetensors$/i,
  installGuide: guide(
    h3Int4Source,
    `${h3Int4BaseUrl}/qwen3vl_32b_minimax_h3_int4_convrot.safetensors`,
    "text_encoders",
    "qwen3vl_32b_minimax_h3_int4_convrot.safetensors",
    "与 INT4 ConvRot 扩散模型配套的文本编码器；需要 ComfyUI 0.30.0 或更高版本。"
  )
});

export const h3Fl2vaInt8Model = h3Component({
  label: "MiniMax H3 FL2VA INT8 模型",
  expected: "diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors",
  pattern: /(?:diffusion_models|unet)\/minimax_h3_fl2va_pruned_int8_convrot\.safetensors$/i,
  installGuide: guide(
    h3OfficialSource,
    `${h3OfficialBaseUrl}/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors`,
    "diffusion_models",
    "minimax_h3_fl2va_pruned_int8_convrot.safetensors",
    "图生视频和首尾帧共用此模型。使用官方 pruned INT8 ConvRot 版本；可用分辨率和时长取决于实际 GPU、系统内存与卸载策略。"
  )
});

export const h3Fl2vaInt4Model = h3Component({
  label: "MiniMax H3 FL2VA INT4 ConvRot 模型",
  expected: "diffusion_models/minimax_h3_fl2va_pruned_int4_convrot.safetensors",
  pattern: /(?:diffusion_models|unet)\/minimax_h3_fl2va_pruned_int4_convrot\.safetensors$/i,
  installGuide: guide(
    h3Int4Source,
    `${h3Int4BaseUrl}/minimax_h3_fl2va_pruned_int4_convrot.safetensors`,
    "diffusion_models",
    "minimax_h3_fl2va_pruned_int4_convrot.safetensors",
    "社区 INT4 ConvRot 转换。12GB 显卡建议使用 pruned 版本，并准备 32GB 以上系统内存和快速 NVMe；不要与 NVFP4 编码器混用。"
  )
});

export const h3Q3GgufModel = h3Component({
  label: "MiniMax H3 FL2VA Q3 GGUF 扩散模型",
  expected: "unet/minimax_h3_fl2va_pruned-Q3_K.gguf",
  pattern: /unet\/minimax_h3_fl2va_pruned-Q3_K\.gguf$/i,
  installGuide: guide(
    h3Q3Source,
    `${h3Q3BaseUrl}/minimax_h3_fl2va_pruned-Q3_K.gguf`,
    "unet",
    "minimax_h3_fl2va_pruned-Q3_K.gguf",
    "社区 Q3 GGUF 扩散模型，文件约 8.16 GiB。3080 10GB 仅作为 360p/480p、124 帧、8 步以内和 CPU/RAM offload 实验档；需要独立的 H3-aware ComfyUI-GGUF 包，不能与原生 UNETLoader 混用。"
  )
});

export const h3Q2GgufTextEncoder = h3Component({
  label: "Qwen3-VL 32B H3 Q2 GGUF 文本编码器",
  expected: "text_encoders/qwen3vl_32b_minimax_h3-Q2_K_M.gguf",
  pattern: /text_encoders\/qwen3vl_32b_minimax_h3-Q2_K_M\.gguf$/i,
  installGuide: guide(
    h3Q3Source,
    `${h3Q3BaseUrl}/qwen3vl_32b_minimax_h3-Q2_K_M.gguf`,
    "text_encoders",
    "qwen3vl_32b_minimax_h3-Q2_K_M.gguf",
    "Q2 文本编码器约 12.2 GiB，必须配合 H3 专用 CLIPLoaderGGUF，并放在 CPU/offload 路径；它的文件大小不等于显存峰值。"
  )
});

export const h3Ref2vaInt8Model = h3Component({
  label: "MiniMax H3 Ref2VA INT8 模型",
  expected: "diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors",
  pattern: /(?:diffusion_models|unet)\/minimax_h3_ref2va_pruned_int8_convrot\.safetensors$/i,
  installGuide: guide(
    h3OfficialSource,
    `${h3OfficialBaseUrl}/diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors`,
    "diffusion_models",
    "minimax_h3_ref2va_pruned_int8_convrot.safetensors",
    "R2V 多参考模型，和 FL2VA 首帧/首尾帧模型不是同一套权重。4090 可作为 1-2 张图片参考的起步档；参考素材越多，显存和系统内存压力越大。"
  )
});

export const h3Ref2vaInt4Model = h3Component({
  label: "MiniMax H3 Ref2VA INT4 ConvRot 模型",
  expected: "diffusion_models/minimax_h3_ref2va_pruned_int4_convrot.safetensors",
  pattern: /(?:diffusion_models|unet)\/minimax_h3_ref2va_pruned_int4_convrot\.safetensors$/i,
  installGuide: guide(
    h3Int4Source,
    `${h3Int4BaseUrl}/minimax_h3_ref2va_pruned_int4_convrot.safetensors`,
    "diffusion_models",
    "minimax_h3_ref2va_pruned_int4_convrot.safetensors",
    "社区 R2V INT4 ConvRot 转换；12GB 起步，4090 可作为低显存实验档。建议 32GB 以上系统内存和快速 NVMe。R2V 工作流尚未接入。"
  )
});
