import type { VideoLoraPurpose } from "../../types";

export function videoLoraPurposeLabel(purpose: VideoLoraPurpose): string {
  return ({
    performance: "性能",
    style: "风格",
    content: "内容",
    character: "人物",
    motion: "动作",
    quality: "质量"
  } satisfies Record<VideoLoraPurpose, string>)[purpose];
}

export function modelName(id: string): string {
  return ({
    minimax_h3_fl2va: "MiniMax H3 FL2VA",
    minimax_h3_fl2va_int4: "MiniMax H3 FL2VA · INT4 低显存",
    minimax_h3_fl2va_q3_gguf: "MiniMax H3 FL2VA · Q3 GGUF · 低显存实验",
    minimax_h3_fl2va_turbo: "MiniMax H3 LightX2V Turbo · 首尾帧",
    minimax_h3_ref2va: "MiniMax H3 R2V · 多参考",
    minimax_h3_ref2va_int4: "MiniMax H3 R2V · 多参考 INT4",
    sulphur2: "Sulphur 2 GGUF",
    wan22_5b: "Wan 2.2 I2V 5B",
    hunyuan15: "HunyuanVideo 1.5",
    hunyuan15_sr: "HunyuanVideo 1.5 1080p",
    wan22_14b_nsfw: "Wan 2.2 I2V 14B + NSFW",
    wan22_remix: "Wan 2.2 Remix v3",
    wan22_smoothmix: "Wan 2.2 SmoothMix I2V",
    wan22_dasiwa: "DaSiWa SynthSeduction v9",
    "qwen-image-edit-2511": "Qwen-Image-Edit-2511",
    "flux2-klein-4b": "FLUX.2 Klein 4B",
    seedvr2: "SeedVR2",
    flashvsr: "FlashVSR",
    realesrgan: "Real-ESRGAN x4plus"
  }[id] ?? id);
}
