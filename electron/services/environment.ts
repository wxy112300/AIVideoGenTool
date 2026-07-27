import { execFile, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type {
  CustomNodeStatus,
  EnvironmentIssue,
  EnvironmentItem,
  EnvironmentItemId,
  EnvironmentScanResult,
  LocalServiceKind,
  ModelComponentStatus,
  ModelScanProfile,
  Settings
} from "../../src/types.js";

const execFileAsync = promisify(execFile);

const customNodeCatalog = [
  {
    id: "comfyui-gguf",
    name: "ComfyUI-GGUF",
    purpose: "加载 Remix、SmoothMix 等 GGUF 视频模型",
    repositoryUrl: "https://github.com/city96/ComfyUI-GGUF.git",
    directoryName: "ComfyUI-GGUF",
    aliases: ["comfyui-gguf"],
    required: true
  },
  {
    id: "video-helper-suite",
    name: "VideoHelperSuite",
    purpose: "视频读取、合成、编码和音频封装",
    repositoryUrl: "https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git",
    directoryName: "comfyui-videohelpersuite",
    aliases: ["comfyui-videohelpersuite"],
    required: true
  },
  {
    id: "ltx-video",
    name: "ComfyUI-LTXVideo",
    purpose: "Sulphur 2 原生视频续写、低显存加载与分阶段卸载",
    repositoryUrl: "https://github.com/Lightricks/ComfyUI-LTXVideo.git",
    directoryName: "ComfyUI-LTXVideo",
    aliases: ["comfyui-ltxvideo"],
    required: false
  },
  {
    id: "seedvr2",
    name: "SeedVR2 Video Upscaler",
    purpose: "SeedVR2 视频超分工作流",
    repositoryUrl: "https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler.git",
    directoryName: "ComfyUI-SeedVR2_VideoUpscaler",
    aliases: ["comfyui-seedvr2_videoupscaler", "seedvr2_videoupscaler"],
    required: true
  },
  {
    id: "flashvsr",
    name: "ComfyUI-FlashVSR",
    purpose: "FlashVSR 视频超分工作流",
    repositoryUrl: "https://github.com/1038lab/ComfyUI-FlashVSR.git",
    directoryName: "ComfyUI-FlashVSR",
    aliases: ["comfyui-flashvsr"],
    required: true
  },
  {
    id: "kjnodes",
    name: "ComfyUI-KJNodes",
    purpose: "采样后主动卸载模型，为 Wan 分块 VAE 解码释放显存",
    repositoryUrl: "https://github.com/kijai/ComfyUI-KJNodes.git",
    directoryName: "comfyui-kjnodes",
    aliases: ["comfyui-kjnodes"],
    required: true
  },
  {
    id: "frame-interpolation",
    name: "ComfyUI Frame Interpolation",
    purpose: "使用 RIFE/FILM 将快速模式生成帧插值到 24 或 30 FPS",
    repositoryUrl: "https://github.com/Fannovel16/ComfyUI-Frame-Interpolation.git",
    directoryName: "ComfyUI-Frame-Interpolation",
    aliases: ["comfyui-frame-interpolation"],
    required: false
  }
] as const;

interface CandidateContext {
  homeDirectory: string;
  localAppData: string;
  modelDirectory?: string;
  outputDirectory?: string;
  driveRoots?: string[];
}

interface DesktopCandidateContext {
  homeDirectory: string;
  localAppData: string;
  programFiles?: string;
  driveRoots?: string[];
}

function uniqueWindowsPaths(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (!value) return false;
    const key = path.resolve(value).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeProxyUrl(value: string): string {
  const raw = value.trim();
  if (!raw) throw new Error("代理已开启，但代理地址为空。");
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(raw)
    ? raw
    : `http://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error(`代理地址无效：${raw}`);
  }
  if (!["http:", "https:", "socks5:", "socks5h:"].includes(parsed.protocol)) {
    throw new Error(`不支持的代理协议：${parsed.protocol}`);
  }
  if (!parsed.hostname || !parsed.port) {
    throw new Error("代理地址需要包含主机和端口，例如 127.0.0.1:7890。");
  }
  if ((parsed.pathname && parsed.pathname !== "/") || parsed.search || parsed.hash) {
    throw new Error("代理地址不能包含路径、查询参数或锚点。");
  }
  return parsed.toString().replace(/\/$/, "");
}

function downloadEnvironment(settings: Settings): NodeJS.ProcessEnv {
  if (!settings.proxyEnabled) return process.env;
  const proxy = normalizeProxyUrl(settings.proxyUrl);
  return {
    ...process.env,
    HTTP_PROXY: proxy,
    HTTPS_PROXY: proxy,
    ALL_PROXY: proxy,
    PIP_PROXY: proxy,
    http_proxy: proxy,
    https_proxy: proxy,
    all_proxy: proxy
  };
}

function proxyLogLabel(settings: Settings): string {
  if (!settings.proxyEnabled) return "代理：关闭";
  const parsed = new URL(normalizeProxyUrl(settings.proxyUrl));
  return `代理：${parsed.protocol}//${parsed.host}`;
}

function rootFromConfiguredDirectory(directory: string | undefined): string {
  if (!directory) return "";
  const resolved = path.resolve(directory);
  return ["models", "output", "input"].includes(path.basename(resolved).toLowerCase())
    ? path.dirname(resolved)
    : resolved;
}

export function buildComfyCandidates(context: CandidateContext): string[] {
  const { homeDirectory, localAppData } = context;
  const driveRoots = context.driveRoots ?? ["C:\\", "D:\\", "E:\\", "F:\\"];
  return uniqueWindowsPaths([
    rootFromConfiguredDirectory(context.modelDirectory),
    rootFromConfiguredDirectory(context.outputDirectory),
    path.join(homeDirectory, "Documents", "ComfyUI"),
    path.join(homeDirectory, "ComfyUI"),
    path.join(homeDirectory, "Desktop", "ComfyUI"),
    path.join(homeDirectory, "Downloads", "ComfyUI"),
    path.join(homeDirectory, "Downloads", "ComfyUI_windows_portable", "ComfyUI"),
    path.join(localAppData, "ComfyUI"),
    path.join(localAppData, "Programs", "ComfyUI"),
    path.join(localAppData, "Programs", "ComfyUI Desktop", "resources", "ComfyUI"),
    ...driveRoots.map((root) => path.join(root, "ComfyUI")),
    ...driveRoots.map((root) =>
      path.join(root, "ComfyUI_windows_portable", "ComfyUI")
    )
  ]);
}

export function buildComfyDesktopCandidates(
  context: DesktopCandidateContext
): string[] {
  const programFiles = context.programFiles ?? "C:\\Program Files";
  const driveRoots = context.driveRoots ?? ["C:\\", "D:\\"];
  return uniqueWindowsPaths([
    path.join(context.localAppData, "Programs", "ComfyUI", "ComfyUI.exe"),
    path.join(context.localAppData, "ComfyUI", "ComfyUI.exe"),
    path.join(programFiles, "ComfyUI", "ComfyUI.exe"),
    ...driveRoots.map((root) =>
      path.join(root, "Program Files", "ComfyUI", "ComfyUI.exe")
    ),
    path.join(context.homeDirectory, "AppData", "Local", "Programs", "ComfyUI", "ComfyUI.exe")
  ]);
}

interface ModelProfileDefinition {
  id: string;
  name: string;
  category: "video" | "upscale" | "interpolation";
  badge: string;
  description: string;
  vram: string;
  components: Array<{
    label: string;
    expected: string;
    patterns: RegExp[];
  }>;
}

const installGuides: Record<string, ModelComponentStatus["installGuide"]> = {
  "sulphur2:Sulphur 2 Q2_K distilled GGUF": {
    sourceLabel: "szwagros / sulphur-2-gguf",
    downloadUrl: "https://huggingface.co/szwagros/sulphur-2-gguf/tree/main",
    targetSubdirectory: "unet",
    recommendedFilename: "sulphur-2-distilled-Q2_K.gguf",
    notes: "约 7.93 GB 的 8GB 兼容档。依赖 CPU offload、足够的系统内存和页面文件；质量低于 Q3/Q4。"
  },
  "sulphur2:Sulphur 2 Q3_K_M dev GGUF": {
    sourceLabel: "vantagewithai / Sulphur-2-Base-GGUF",
    downloadUrl: "https://huggingface.co/vantagewithai/Sulphur-2-Base-GGUF/tree/main",
    targetSubdirectory: "unet",
    recommendedFilename: "sulphur_dev-Q3_K_M.gguf",
    notes: "约 11.13 GB，作为 24GB 显卡的默认均衡档。"
  },
  "sulphur2:Sulphur 2 Q4_K_M dev GGUF": {
    sourceLabel: "vantagewithai / Sulphur-2-Base-GGUF",
    downloadUrl: "https://huggingface.co/vantagewithai/Sulphur-2-Base-GGUF/tree/main",
    targetSubdirectory: "unet",
    recommendedFilename: "sulphur_dev-Q4_K_M.gguf",
    notes: "约 14.30 GB 的质量档。运行前应关闭占用显存的其他程序。"
  },
  "sulphur2:Gemma 3 文本编码器": {
    sourceLabel: "Comfy-Org / ltx-2",
    downloadUrl: "https://huggingface.co/Comfy-Org/ltx-2/tree/main/split_files/text_encoders",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "gemma_3_12B_it_fp4_mixed.safetensors"
  },
  "sulphur2:LTX 2.3 文本连接器": {
    sourceLabel: "vantagewithai / LTX-2.3-Split",
    downloadUrl: "https://huggingface.co/vantagewithai/LTX-2.3-Split/tree/main/text_encoder",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "ltx-2-3-22b-text_encoder.safetensors"
  },
  "sulphur2:LTX 2.3 视频 VAE": {
    sourceLabel: "vantagewithai / LTX-2.3-Split",
    downloadUrl: "https://huggingface.co/vantagewithai/LTX-2.3-Split/tree/main/vae",
    targetSubdirectory: "vae",
    recommendedFilename: "ltx-2-3-22b-VAE.safetensors"
  },
  "sulphur2:LTX 2.3 音频 VAE": {
    sourceLabel: "vantagewithai / LTX-2.3-Split",
    downloadUrl: "https://huggingface.co/vantagewithai/LTX-2.3-Split/tree/main/audio_vae",
    targetSubdirectory: "checkpoints",
    recommendedFilename: "ltx-2-3-22b-audio_vae.safetensors",
    notes: "必须放在 models/checkpoints，由 ComfyUI-LTXVideo 的 LowVRAMAudioVAELoader 读取；通用 VAELoader 无法识别音频 VAE。"
  },
  "sulphur2:LTX 2.3 蒸馏 LoRA": {
    sourceLabel: "SulphurAI / Sulphur-2-base",
    downloadUrl: "https://huggingface.co/SulphurAI/Sulphur-2-base/tree/main/distill_loras",
    targetSubdirectory: "loras",
    recommendedFilename: "ltx-2.3-22b-distilled-lora-1.1_fro90_ceil72_condsafe.safetensors"
  },
  "sulphur2:LTX 2.3 Latent Upscaler": {
    sourceLabel: "Lightricks / LTX-2.3",
    downloadUrl: "https://huggingface.co/Lightricks/LTX-2.3/tree/main",
    targetSubdirectory: "latent_upscale_models",
    recommendedFilename: "ltx-2.3-spatial-upscaler-x2-1.0.safetensors"
  },
  "wan22_5b:Wan 2.2 5B 扩散模型": {
    sourceLabel: "Comfy-Org / Wan_2.2_ComfyUI_Repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main/split_files/diffusion_models",
    targetSubdirectory: "diffusion_models",
    recommendedFilename: "wan2.2_ti2v_5B_fp16.safetensors"
  },
  "wan22_5b:UMT5 文本编码器": {
    sourceLabel: "Comfy-Org / Wan_2.2_ComfyUI_Repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main/split_files/text_encoders",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "umt5_xxl_fp8_e4m3fn_scaled.safetensors"
  },
  "wan22_5b:Wan VAE": {
    sourceLabel: "Comfy-Org / Wan_2.2_ComfyUI_Repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main/split_files/vae",
    targetSubdirectory: "vae",
    recommendedFilename: "wan2.2_vae.safetensors"
  },
  "hunyuan15:HunyuanVideo 1.5 I2V 模型": {
    sourceLabel: "Comfy-Org / HunyuanVideo_1.5_repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/tree/main/split_files/diffusion_models",
    targetSubdirectory: "diffusion_models",
    recommendedFilename: "hunyuanvideo1.5_720p_i2v_fp16.safetensors",
    notes: "内置工作流按官方 720p I2V FP16 权重配置；已放在 models/unet 中的同名文件也会被扫描到。"
  },
  "hunyuan15:HunyuanVideo 1.5 VAE": {
    sourceLabel: "Comfy-Org / HunyuanVideo_1.5_repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/tree/main/split_files/vae",
    targetSubdirectory: "vae",
    recommendedFilename: "hunyuanvideo15_vae_fp16.safetensors"
  },
  "hunyuan15:Qwen 2.5 VL 7B 文本编码器": {
    sourceLabel: "Comfy-Org / HunyuanVideo_1.5_repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/tree/main/split_files/text_encoders",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "qwen_2.5_vl_7b_fp8_scaled.safetensors",
    notes: "下载页如有多个精度版本，4090 优先选择 FP8 scaled。"
  },
  "hunyuan15:ByT5 文本编码器": {
    sourceLabel: "Comfy-Org / HunyuanVideo_1.5_repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/tree/main/split_files/text_encoders",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "byt5_small_glyphxl_fp16.safetensors"
  },
  "hunyuan15:SigCLIP 视觉编码器": {
    sourceLabel: "Comfy-Org / HunyuanVideo_1.5_repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/tree/main/split_files/clip_vision",
    targetSubdirectory: "clip_vision",
    recommendedFilename: "sigclip_vision_patch14_384.safetensors"
  },
  "wan22_14b_nsfw:14B 高噪声模型": {
    sourceLabel: "Comfy-Org / Wan_2.2_ComfyUI_Repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main/split_files/diffusion_models",
    targetSubdirectory: "diffusion_models",
    recommendedFilename: "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors"
  },
  "wan22_14b_nsfw:14B 低噪声模型": {
    sourceLabel: "Comfy-Org / Wan_2.2_ComfyUI_Repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main/split_files/diffusion_models",
    targetSubdirectory: "diffusion_models",
    recommendedFilename: "wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors"
  },
  "wan22_14b_nsfw:NSFW UMT5 编码器": {
    sourceLabel: "NSFW-API / NSFW-Wan-UMT5-XXL",
    downloadUrl: "https://huggingface.co/NSFW-API/NSFW-Wan-UMT5-XXL/tree/main",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "nsfw_wan_umt5-xxl_fp8_scaled.safetensors"
  },
  "wan22_14b_nsfw:Wan VAE": {
    sourceLabel: "Comfy-Org / Wan_2.2_ComfyUI_Repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main/split_files/vae",
    targetSubdirectory: "vae",
    recommendedFilename: "wan_2.1_vae.safetensors",
    notes: "Wan 2.2 14B I2V 官方工作流使用 Wan 2.1 VAE；不要与 5B 工作流的 wan2.2_vae 混用。"
  },
  "wan22_remix:Remix v3 High": {
    sourceLabel: "BigDannyPt / Wan-2.2-Remix-GGUF",
    downloadUrl: "https://huggingface.co/BigDannyPt/Wan-2.2-Remix-GGUF/tree/main/I2V/v3.0/High",
    targetSubdirectory: "unet",
    recommendedFilename: "wan22RemixT2VI2V_i2vHighV30-Q5_K_M.gguf"
  },
  "wan22_remix:Remix v3 Low": {
    sourceLabel: "BigDannyPt / Wan-2.2-Remix-GGUF",
    downloadUrl: "https://huggingface.co/BigDannyPt/Wan-2.2-Remix-GGUF/tree/main/I2V/v3.0/Low",
    targetSubdirectory: "unet",
    recommendedFilename: "wan22RemixT2VI2V_i2vLowV30-Q5_K_M.gguf"
  },
  "wan22_remix:UMT5 文本编码器": {
    sourceLabel: "Comfy-Org / Wan_2.2_ComfyUI_Repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main/split_files/text_encoders",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "umt5_xxl_fp8_e4m3fn_scaled.safetensors"
  },
  "wan22_remix:Wan VAE": {
    sourceLabel: "Comfy-Org / Wan_2.2_ComfyUI_Repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main/split_files/vae",
    targetSubdirectory: "vae",
    recommendedFilename: "wan_2.1_vae.safetensors"
  },
  "wan22_smoothmix:SmoothMix High": {
    sourceLabel: "Bedovyy / smoothMixWan22-I2V-GGUF",
    downloadUrl: "https://huggingface.co/Bedovyy/smoothMixWan22-I2V-GGUF/tree/main/HighNoise",
    targetSubdirectory: "unet",
    recommendedFilename: "smoothMixWan22I2VT2V_i2vHigh-Q5_K_M.gguf"
  },
  "wan22_smoothmix:SmoothMix Low": {
    sourceLabel: "Bedovyy / smoothMixWan22-I2V-GGUF",
    downloadUrl: "https://huggingface.co/Bedovyy/smoothMixWan22-I2V-GGUF/tree/main/LowNoise",
    targetSubdirectory: "unet",
    recommendedFilename: "smoothMixWan22I2VT2V_i2vLow-Q5_K_M.gguf"
  },
  "wan22_smoothmix:UMT5 文本编码器": {
    sourceLabel: "Comfy-Org / Wan_2.2_ComfyUI_Repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main/split_files/text_encoders",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "umt5_xxl_fp8_e4m3fn_scaled.safetensors"
  },
  "wan22_smoothmix:Wan VAE": {
    sourceLabel: "Comfy-Org / Wan_2.2_ComfyUI_Repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main/split_files/vae",
    targetSubdirectory: "vae",
    recommendedFilename: "wan_2.1_vae.safetensors"
  },
  "wan22_dasiwa:DaSiWa v9 High": {
    sourceLabel: "darksidewalker / DaSiWa-WAN2.2-I2V",
    downloadUrl: "https://huggingface.co/darksidewalker/DaSiWa-WAN2.2-I2V/tree/main/Distilled/GGUF/v09",
    targetSubdirectory: "unet",
    recommendedFilename: "DasiwaWAN22I2V14BSynthseduction_q4High.gguf",
    notes: "该仓库可能要求登录 Hugging Face 并同意访问条款。"
  },
  "wan22_dasiwa:DaSiWa v9 Low": {
    sourceLabel: "darksidewalker / DaSiWa-WAN2.2-I2V",
    downloadUrl: "https://huggingface.co/darksidewalker/DaSiWa-WAN2.2-I2V/tree/main/Distilled/GGUF/v09",
    targetSubdirectory: "unet",
    recommendedFilename: "DasiwaWAN22I2V14BSynthseduction_q4Low.gguf",
    notes: "High 与 Low 必须使用同一 v9、同一量化等级。"
  },
  "wan22_dasiwa:UMT5 文本编码器": {
    sourceLabel: "Comfy-Org / Wan_2.2_ComfyUI_Repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main/split_files/text_encoders",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "umt5_xxl_fp8_e4m3fn_scaled.safetensors"
  },
  "wan22_dasiwa:Wan VAE": {
    sourceLabel: "Comfy-Org / Wan_2.2_ComfyUI_Repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main/split_files/vae",
    targetSubdirectory: "vae",
    recommendedFilename: "wan_2.1_vae.safetensors"
  },
  "seedvr2:SeedVR2 主模型": {
    sourceLabel: "numz / SeedVR2_comfyUI",
    downloadUrl: "https://huggingface.co/numz/SeedVR2_comfyUI/tree/main",
    targetSubdirectory: "SEEDVR2",
    recommendedFilename: "seedvr2_ema_3b_fp8_e4m3fn.safetensors",
    notes: "当前项目安装的 SeedVR2 节点固定从 models/SEEDVR2 读取权重。"
  },
  "seedvr2:SeedVR2 VAE": {
    sourceLabel: "numz / SeedVR2_comfyUI",
    downloadUrl: "https://huggingface.co/numz/SeedVR2_comfyUI/tree/main",
    targetSubdirectory: "SEEDVR2",
    recommendedFilename: "ema_vae_fp16.safetensors"
  },
  "flashvsr:FlashVSR 模型": {
    sourceLabel: "1038lab / FlashVSR",
    downloadUrl: "https://huggingface.co/1038lab/FlashVSR/tree/main",
    targetSubdirectory: "FlashVSR",
    recommendedFilename: "FlashVSR1_1.safetensors",
    notes: "FlashVSR 的 5 个权重必须放在同一个 models/FlashVSR 目录。"
  },
  "flashvsr:Wan 2.1 VAE": {
    sourceLabel: "1038lab / FlashVSR",
    downloadUrl: "https://huggingface.co/1038lab/FlashVSR/tree/main",
    targetSubdirectory: "FlashVSR",
    recommendedFilename: "Wan2.1_VAE.safetensors"
  },
  "flashvsr:LQ Projection": {
    sourceLabel: "1038lab / FlashVSR",
    downloadUrl: "https://huggingface.co/1038lab/FlashVSR/tree/main",
    targetSubdirectory: "FlashVSR",
    recommendedFilename: "LQ_proj_in.safetensors"
  },
  "flashvsr:TCDecoder": {
    sourceLabel: "1038lab / FlashVSR",
    downloadUrl: "https://huggingface.co/1038lab/FlashVSR/tree/main",
    targetSubdirectory: "FlashVSR",
    recommendedFilename: "TCDecoder.safetensors"
  },
  "flashvsr:Prompt Embedding": {
    sourceLabel: "1038lab / FlashVSR",
    downloadUrl: "https://huggingface.co/1038lab/FlashVSR/tree/main",
    targetSubdirectory: "FlashVSR",
    recommendedFilename: "Prompt.safetensors"
  },
  "hunyuan15_sr:Hunyuan 1080p SR 模型": {
    sourceLabel: "Comfy-Org / HunyuanVideo_1.5_repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/tree/main/split_files/diffusion_models",
    targetSubdirectory: "diffusion_models",
    recommendedFilename: "hunyuanvideo1.5_1080p_sr_distilled_fp16.safetensors"
  },
  "hunyuan15_sr:Hunyuan 1080p Latent Upsampler": {
    sourceLabel: "Comfy-Org / HunyuanVideo_1.5_repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/tree/main/split_files/latent_upscale_models",
    targetSubdirectory: "latent_upscale_models",
    recommendedFilename: "hunyuanvideo15_latent_upsampler_1080p.safetensors",
    notes: "该后端只适用于 HunyuanVideo 1.5 的 latent 双阶段 SR，不是通用视频放大模型。"
  },
  "realesrgan:Real-ESRGAN x4 模型": {
    sourceLabel: "Real-ESRGAN 官方 Releases",
    downloadUrl: "https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.2.5.0",
    targetSubdirectory: "upscale_models",
    recommendedFilename: "RealESRGAN_x4plus.pth"
  },
  "rife:RIFE 4.7 插帧模型": {
    sourceLabel: "ComfyUI Frame Interpolation / RIFE",
    downloadUrl: "https://github.com/Fannovel16/ComfyUI-Frame-Interpolation/releases/download/models/rife47.pth",
    targetSubdirectory: "custom_nodes/ComfyUI-Frame-Interpolation/ckpts/rife",
    recommendedFilename: "rife47.pth",
    notes: "节点首次使用时也会自动下载；网络受限时请先在系统设置开启代理，再由本工具重启 ComfyUI。"
  }
};

function sulphurComponentsFor(
  modelProfile: Settings["ltxExtensionModelProfile"]
): ModelProfileDefinition["components"] {
  const transformer = {
    q2_distilled: {
      label: "Sulphur 2 Q2_K distilled GGUF",
      expected: "unet/sulphur-2-distilled-Q2_K.gguf",
      patterns: [/unet\/sulphur-2-distilled-q2_k\.gguf$/i]
    },
    q3_k_m: {
      label: "Sulphur 2 Q3_K_M dev GGUF",
      expected: "unet/sulphur_dev-Q3_K_M.gguf",
      patterns: [/unet\/sulphur_dev-q3_k_m\.gguf$/i]
    },
    q4_k_m: {
      label: "Sulphur 2 Q4_K_M dev GGUF",
      expected: "unet/sulphur_dev-Q4_K_M.gguf",
      patterns: [/unet\/sulphur_dev-q4_k_m\.gguf$/i]
    }
  }[modelProfile];
  const components: ModelProfileDefinition["components"] = [
    transformer,
    {
      label: "Gemma 3 文本编码器",
      expected: "text_encoders/gemma_3_12B_it_fp4_mixed.safetensors",
      patterns: [/text_encoders\/gemma_3_12b_it_fp4_mixed\.safetensors$/i]
    },
    {
      label: "LTX 2.3 文本连接器",
      expected: "text_encoders/ltx-2-3-22b-text_encoder.safetensors",
      patterns: [/text_encoders\/ltx-2-3-22b-text_encoder\.safetensors$/i]
    },
    {
      label: "LTX 2.3 视频 VAE",
      expected: "vae/ltx-2-3-22b-VAE.safetensors",
      patterns: [/vae\/ltx-2-3-22b-vae\.safetensors$/i]
    },
    {
      label: "LTX 2.3 音频 VAE",
      expected: "checkpoints/ltx-2-3-22b-audio_vae.safetensors",
      patterns: [/checkpoints\/ltx-2-3-22b-audio_vae\.safetensors$/i]
    }
  ];
  if (modelProfile !== "q2_distilled") {
    components.push({
      label: "LTX 2.3 蒸馏 LoRA",
      expected: "loras/ltx-2.3-22b-distilled-lora-1.1*",
      patterns: [/loras\/ltx-2\.3-22b-distilled-lora-1\.1.*\.safetensors$/i]
    });
  }
  components.push({
    label: "LTX 2.3 Latent Upscaler",
    expected: "latent_upscale_models/ltx-2.3-spatial-upscaler-x2-1.0.safetensors",
    patterns: [/latent_upscale_models\/ltx-2\.3-spatial-upscaler-x2-1\.0\.safetensors$/i]
  });
  return components;
}

const modelProfileDefinitions: ModelProfileDefinition[] = [
  {
    id: "sulphur2",
    name: "Sulphur 2 GGUF",
    category: "video",
    badge: "GGUF · 低显存",
    description: "I2V 与原生 Extend 共用分离式 GGUF 部署。",
    vram: "Q3 默认 · CPU offload · 独立 VAE",
    components: sulphurComponentsFor("q3_k_m")
  },
  {
    id: "wan22_5b",
    name: "Wan 2.2 I2V 5B",
    category: "video",
    badge: "快速草稿",
    description: "适合 480p/540p 快速草稿和本机联调。",
    vram: "预计峰值 14–18 GB",
    components: [
      {
        label: "Wan 2.2 5B 扩散模型",
        expected: "wan2.2_*i2v/ti2v*_5B",
        patterns: [/wan2\.?2.*(?:i2v|ti2v).*5b.*\.(safetensors|gguf)$/i]
      },
      {
        label: "UMT5 文本编码器",
        expected: "text_encoders/umt5*",
        patterns: [/text_encoders\/.*umt5.*\.(safetensors|gguf)$/i]
      },
      {
        label: "Wan VAE",
        expected: "vae/wan*vae*",
        patterns: [/vae\/.*wan.*vae.*\.(safetensors|pt|ckpt)$/i]
      }
    ]
  },
  {
    id: "hunyuan15",
    name: "HunyuanVideo 1.5 I2V",
    category: "video",
    badge: "质量",
    description: "质量优先，默认启用 VAE 分块和 CPU 卸载。",
    vram: "预计峰值 21–23 GB",
    components: [
      {
        label: "HunyuanVideo 1.5 I2V 模型",
        expected: "hunyuanvideo1.5_*i2v*",
        patterns: [/hunyuanvideo1\.?5.*i2v.*\.(safetensors|gguf)$/i]
      },
      {
        label: "HunyuanVideo 1.5 VAE",
        expected: "vae/hunyuanvideo15_vae*",
        patterns: [/vae\/.*hunyuanvideo1?5.*vae.*\.(safetensors|pt|ckpt)$/i]
      },
      {
        label: "Qwen 2.5 VL 7B 文本编码器",
        expected: "text_encoders/qwen_2.5_vl_7b*",
        patterns: [/text_encoders\/.*qwen[_ .-]?2\.?5[_ .-]?vl[_ .-]?7b.*\.(safetensors|gguf)$/i]
      },
      {
        label: "ByT5 文本编码器",
        expected: "text_encoders/byt5_small_glyphxl*",
        patterns: [/text_encoders\/.*byt5[_ .-]?small[_ .-]?glyphxl.*\.(safetensors|gguf)$/i]
      },
      {
        label: "SigCLIP 视觉编码器",
        expected: "clip_vision/sigclip_vision_patch14_384*",
        patterns: [/clip_vision\/.*sigclip[_ .-]?vision[_ .-]?patch14[_ .-]?384.*\.(safetensors|gguf)$/i]
      }
    ]
  },
  {
    id: "wan22_14b_nsfw",
    name: "Wan 2.2 I2V 14B + NSFW",
    category: "video",
    badge: "无审查",
    description: "需要高/低噪声模型及无审查文本编码器完整匹配。",
    vram: "建议 FP8 分块与保守卸载",
    components: [
      {
        label: "14B 高噪声模型",
        expected: "wan2.2*i2v*high*14B*",
        patterns: [/wan2\.?2.*i2v.*high.*14b.*\.(safetensors|gguf)$/i]
      },
      {
        label: "14B 低噪声模型",
        expected: "wan2.2*i2v*low*14B*",
        patterns: [/wan2\.?2.*i2v.*low.*14b.*\.(safetensors|gguf)$/i]
      },
      {
        label: "NSFW UMT5 编码器",
        expected: "text_encoders/nsfw*umt5*",
        patterns: [/text_encoders\/.*nsfw.*umt5.*\.(safetensors|gguf)$/i]
      },
      {
        label: "Wan VAE",
        expected: "vae/wan_2.1_vae*",
        patterns: [/vae\/.*wan[_ .-]?2\.?1[_ .-]?vae.*\.(safetensors|pt|ckpt)$/i]
      }
    ]
  },
  {
    id: "wan22_remix",
    name: "Wan 2.2 Remix v3",
    category: "video",
    badge: "合并模型",
    description: "需要 Remix v3 High/Low 两阶段文件成对存在。",
    vram: "推荐 Q5_K_M · 保守卸载",
    components: [
      {
        label: "Remix v3 High",
        expected: "wan22Remix*High*V30*",
        patterns: [/wan22remix.*high.*v?3(?:\.0|0)?.*\.(safetensors|gguf)$/i]
      },
      {
        label: "Remix v3 Low",
        expected: "wan22Remix*Low*V30*",
        patterns: [/wan22remix.*low.*v?3(?:\.0|0)?.*\.(safetensors|gguf)$/i]
      },
      {
        label: "UMT5 文本编码器",
        expected: "text_encoders/*umt5*",
        patterns: [/text_encoders\/.*umt5.*\.(safetensors|gguf)$/i]
      },
      {
        label: "Wan VAE",
        expected: "vae/wan_2.1_vae*",
        patterns: [/vae\/.*wan[_ .-]?2\.?1[_ .-]?vae.*\.(safetensors|pt|ckpt)$/i]
      }
    ]
  },
  {
    id: "wan22_smoothmix",
    name: "Wan 2.2 SmoothMix I2V",
    category: "video",
    badge: "写实合并模型",
    description: "SmoothMix High/Low 两阶段模型，偏写实人物与自然运动。",
    vram: "推荐 Q5_K_M · 约 20–23 GB",
    components: [
      {
        label: "SmoothMix High",
        expected: "smoothMixWan22*High*Q5_K_M",
        patterns: [/smoothmixwan22.*high.*\.(safetensors|gguf)$/i]
      },
      {
        label: "SmoothMix Low",
        expected: "smoothMixWan22*Low*Q5_K_M",
        patterns: [/smoothmixwan22.*low.*\.(safetensors|gguf)$/i]
      },
      {
        label: "UMT5 文本编码器",
        expected: "text_encoders/*umt5*",
        patterns: [/text_encoders\/.*umt5.*\.(safetensors|gguf)$/i]
      },
      {
        label: "Wan VAE",
        expected: "vae/wan_2.1_vae*",
        patterns: [/vae\/.*wan[_ .-]?2\.?1[_ .-]?vae.*\.(safetensors|pt|ckpt)$/i]
      }
    ]
  },
  {
    id: "wan22_dasiwa",
    name: "DaSiWa SynthSeduction v9",
    category: "video",
    badge: "专用合并模型",
    description: "DaSiWa v9 High/Low 成对工作；4090 使用 Q4 版本更保守。",
    vram: "Q4 · 约 19–22 GB",
    components: [
      {
        label: "DaSiWa v9 High",
        expected: "Dasiwa*Synthseduction*q4High",
        patterns: [/dasiwa.*synthseduction.*high.*\.(safetensors|gguf)$/i]
      },
      {
        label: "DaSiWa v9 Low",
        expected: "Dasiwa*Synthseduction*q4Low",
        patterns: [/dasiwa.*synthseduction.*low.*\.(safetensors|gguf)$/i]
      },
      {
        label: "UMT5 文本编码器",
        expected: "text_encoders/*umt5*",
        patterns: [/text_encoders\/.*umt5.*\.(safetensors|gguf)$/i]
      },
      {
        label: "Wan VAE",
        expected: "vae/wan_2.1_vae*",
        patterns: [/vae\/.*wan[_ .-]?2\.?1[_ .-]?vae.*\.(safetensors|pt|ckpt)$/i]
      }
    ]
  },
  {
    id: "seedvr2",
    name: "SeedVR2",
    category: "upscale",
    badge: "推荐",
    description: "视频时间一致性优先，适合人物和真实画面。",
    vram: "预计峰值 18–23 GB",
    components: [
      {
        label: "SeedVR2 主模型",
        expected: "SEEDVR2/seedvr2_ema_3b 或 7b",
        patterns: [/(?:^|\/)seedvr2\/.*seedvr2_ema_(?:3b|7b).*\.(safetensors|pt)$/i]
      },
      {
        label: "SeedVR2 VAE",
        expected: "SEEDVR2/ema_vae*",
        patterns: [/seedvr2\/.*ema_vae.*\.(safetensors|pt)$/i]
      }
    ]
  },
  {
    id: "flashvsr",
    name: "FlashVSR",
    category: "upscale",
    badge: "平衡",
    description: "质量、速度和时间一致性的平衡选择。",
    vram: "预计峰值 14–19 GB",
    components: [
      {
        label: "FlashVSR 模型",
        expected: "FlashVSR/FlashVSR1_1.safetensors",
        patterns: [/flashvsr\/flashvsr1_1\.safetensors$/i]
      },
      {
        label: "Wan 2.1 VAE",
        expected: "FlashVSR/Wan2.1_VAE.safetensors",
        patterns: [/flashvsr\/wan2\.1_vae\.safetensors$/i]
      },
      {
        label: "LQ Projection",
        expected: "FlashVSR/LQ_proj_in.safetensors",
        patterns: [/flashvsr\/lq_proj_in\.safetensors$/i]
      },
      {
        label: "TCDecoder",
        expected: "FlashVSR/TCDecoder.safetensors",
        patterns: [/flashvsr\/tcdecoder\.safetensors$/i]
      },
      {
        label: "Prompt Embedding",
        expected: "FlashVSR/Prompt.safetensors",
        patterns: [/flashvsr\/prompt\.safetensors$/i]
      }
    ]
  },
  {
    id: "hunyuan15_sr",
    name: "HunyuanVideo 1.5 I2V + 1080p SR",
    category: "video",
    badge: "双阶段 1080p",
    description: "先生成 720p latent，再使用官方 8 步 SR 分支输出 1080p。",
    vram: "双阶段工作流 · 4090 需模型间卸载",
    components: [
      {
        label: "HunyuanVideo 1.5 I2V 模型",
        expected: "hunyuanvideo1.5_*i2v*",
        patterns: [/hunyuanvideo1\.?5.*i2v.*\.(safetensors|gguf)$/i]
      },
      {
        label: "HunyuanVideo 1.5 VAE",
        expected: "vae/hunyuanvideo15_vae*",
        patterns: [/vae\/.*hunyuanvideo1?5.*vae.*\.(safetensors|pt|ckpt)$/i]
      },
      {
        label: "Qwen 2.5 VL 7B 文本编码器",
        expected: "text_encoders/qwen_2.5_vl_7b*",
        patterns: [/text_encoders\/.*qwen[_ .-]?2\.?5[_ .-]?vl[_ .-]?7b.*\.(safetensors|gguf)$/i]
      },
      {
        label: "ByT5 文本编码器",
        expected: "text_encoders/byt5_small_glyphxl*",
        patterns: [/text_encoders\/.*byt5[_ .-]?small[_ .-]?glyphxl.*\.(safetensors|gguf)$/i]
      },
      {
        label: "SigCLIP 视觉编码器",
        expected: "clip_vision/sigclip_vision_patch14_384*",
        patterns: [/clip_vision\/.*sigclip[_ .-]?vision[_ .-]?patch14[_ .-]?384.*\.(safetensors|gguf)$/i]
      },
      {
        label: "Hunyuan 1080p SR 模型",
        expected: "diffusion_models/hunyuanvideo1.5_1080p_sr*",
        patterns: [/(?:diffusion_models|unet)\/hunyuanvideo1\.5_1080p_sr.*\.(safetensors|gguf)$/i]
      },
      {
        label: "Hunyuan 1080p Latent Upsampler",
        expected: "latent_upscale_models/hunyuanvideo15_latent_upsampler_1080p*",
        patterns: [/latent_upscale_models\/hunyuanvideo15_latent_upsampler_1080p.*\.safetensors$/i]
      }
    ]
  },
  {
    id: "realesrgan",
    name: "Real-ESRGAN x4plus",
    category: "upscale",
    badge: "快速",
    description: "占用较低，适合快速检查和非人像内容。",
    vram: "预计峰值 6–9 GB",
    components: [
      {
        label: "Real-ESRGAN x4 模型",
        expected: "upscale_models/RealESRGAN*x4*",
        patterns: [/upscale_models\/.*realesrgan.*x4.*\.(safetensors|pth|pt)$/i]
      }
    ]
  },
  {
    id: "rife",
    name: "RIFE Frame Interpolation",
    category: "interpolation",
    badge: "插帧",
    description: "将较少的生成帧插值到目标 FPS，降低视频大模型和 VAE 的总体压力。",
    vram: "BF16 · 单帧批次 · 逐帧清缓存",
    components: [
      {
        label: "RIFE 4.7 插帧模型",
        expected: "ComfyUI-Frame-Interpolation/ckpts/rife/rife47.pth",
        patterns: [/frame_interpolation\/rife47\.pth$/i]
      }
    ]
  }
];

export function evaluateModelProfiles(
  modelFiles: string[],
  ltxModelProfile: Settings["ltxExtensionModelProfile"] = "q3_k_m"
): ModelScanProfile[] {
  const normalizedFiles = modelFiles.map((filename) =>
    filename.replaceAll("\\", "/")
  );
  return modelProfileDefinitions.map((baseProfile) => {
    const profile = baseProfile.id === "sulphur2"
      ? {
          ...baseProfile,
          name: `Sulphur 2 ${ltxModelProfile.replaceAll("_", " ").toUpperCase()}`,
          components: sulphurComponentsFor(ltxModelProfile)
        }
      : baseProfile;
    const components = profile.components.map((component) => {
      const matches = normalizedFiles.filter((filename) =>
        component.patterns.some((pattern) => pattern.test(filename))
      );
      return {
        label: component.label,
        found: matches.length > 0,
        expected: component.expected,
        matches,
        installGuide:
          installGuides[`${profile.id}:${component.label}`] ??
          installGuides[`hunyuan15:${component.label}`]
      };
    });
    return {
      id: profile.id,
      name: profile.name,
      category: profile.category,
      badge: profile.badge,
      description: profile.description,
      vram: profile.vram,
      available: components.every((component) => component.found),
      components
    };
  });
}

async function exists(filename: string): Promise<boolean> {
  return Boolean(await fs.stat(filename).catch(() => null));
}

const RETRYABLE_RENAME_ERRORS = new Set(["EACCES", "EBUSY", "ENOTEMPTY", "EPERM"]);

interface RenameRetryOptions {
  attempts?: number;
  retryDelayMs?: number;
  rename?: (source: string, destination: string) => Promise<void>;
  wait?: (milliseconds: number) => Promise<void>;
}

function retryableRenameError(error: unknown): boolean {
  return (
    error instanceof Error &&
    RETRYABLE_RENAME_ERRORS.has((error as NodeJS.ErrnoException).code ?? "")
  );
}

export async function renameWithRetry(
  source: string,
  destination: string,
  options: RenameRetryOptions = {}
): Promise<void> {
  const attempts = Math.max(1, options.attempts ?? 8);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 150);
  const rename = options.rename ?? fs.rename;
  const wait =
    options.wait ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      if (!retryableRenameError(error) || attempt === attempts) throw error;
      await wait(retryDelayMs * attempt);
    }
  }
}

async function listModelFiles(modelDirectory: string): Promise<string[]> {
  if (!modelDirectory || !(await exists(modelDirectory))) return [];
  const files: string[] = [];
  const pending = [modelDirectory];
  while (pending.length > 0 && files.length < 20_000) {
    const current = pending.pop()!;
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const filename = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(filename);
      else if (entry.isFile()) files.push(path.relative(modelDirectory, filename));
    }
  }
  return files;
}

export function patchVideoHelperBatchCompatibility(
  utilsSource: string,
  nodesSource: string,
  loadVideoSource: string
): { utilsSource: string; nodesSource: string; loadVideoSource: string } {
  let patchedUtils = utilsSource;
  if (!patchedUtils.includes("if len(value) == 6")) {
    patchedUtils = patchedUtils
      .replace(
        "    (_, _, prompt, extra_data, outputs_to_execute) = next(iter(currently_running.values()))",
        "    value = next(iter(currently_running.values()))\n    if len(value) == 6:\n        (_, prompt_id, prompt, extra_data, outputs_to_execute, _) = value\n    else:\n        (_, prompt_id, prompt, extra_data, outputs_to_execute) = value"
      )
      .replace(
        "    prompt_queue.put((number, prompt_id, prompt, extra_data, outputs_to_execute))",
        "    sensitive = value[5] if len(value) > 5 else {}\n    prompt_queue.put((number, prompt_id, prompt, extra_data, outputs_to_execute, sensitive))"
      )
      .replace(
        "    (run_number, _, prompt, _, _) = next(iter(prompt_queue.currently_running.values()))",
        "    value = next(iter(prompt_queue.currently_running.values()))\n    if len(value) == 6:\n        (run_number, _, prompt, extra_data, outputs_to_execute, _) = value\n    else:\n        (run_number, _, prompt, extra_data, outputs_to_execute) = value"
      );
  }
  let patchedNodes = nodesSource;
  if (!patchedNodes.includes("batch_manager_states = {}")) {
    patchedNodes = patchedNodes.replace(
      /(^|\r?\n)class BatchManager:/,
      "$1batch_manager_states = {}\n\nclass BatchManager:"
    );
  }
  if (!patchedNodes.includes("frames_per_batch = int(frames_per_batch)")) {
    patchedNodes = patchedNodes.replace(
      /(    def update_batch\(self, frames_per_batch, prompt=None, unique_id=None\):\r?\n)(        if unique_id is not None and prompt is not None:)/,
      "$1        frames_per_batch = int(frames_per_batch)\n$2"
    );
  }
  patchedNodes = patchedNodes.replace(
    /(        frames_per_batch = int\(frames_per_batch\)\r?\n)        self\.frames_per_batch = frames_per_batch\r?\n/,
    "$1"
  );
  if (!patchedNodes.includes("batch_manager_states.get(self.unique_id) is self")) {
    patchedNodes = patchedNodes.replace(
      /(    def reset\(self\):\r?\n)(        self\.close_inputs\(\))/,
      "$1        if self.unique_id is not None and batch_manager_states.get(self.unique_id) is self:\n            batch_manager_states.pop(self.unique_id, None)\n$2"
    );
  }
  if (!patchedNodes.includes("batch_manager_states[unique_id] = self")) {
    patchedNodes = patchedNodes.replace(
      /(            self\.unique_id = unique_id\r?\n)(        else:\r?\n)/,
      "$1            batch_manager_states[unique_id] = self\n$2            if unique_id not in batch_manager_states:\n                raise RuntimeError(\"Meta-Batch state was lost before the workflow completed\")\n            self = batch_manager_states[unique_id]\n            self.frames_per_batch = frames_per_batch\n"
    );
  }
  if (!patchedNodes.includes("previous = batch_manager_states.pop(unique_id, None)")) {
    patchedNodes = patchedNodes.replace(
      /(        if requeue == 0:\r?\n)(            self\.reset\(\))/,
      "$1            previous = batch_manager_states.pop(unique_id, None)\n            if previous is not None and previous is not self:\n                previous.reset()\n$2"
    );
  }
  let patchedLoadVideo = loadVideoSource;
  if (
    !patchedLoadVideo.includes(
      "meta_batch.frames_per_batch = int(meta_batch.frames_per_batch)"
    )
  ) {
    patchedLoadVideo = patchedLoadVideo.replace(
      /(    if meta_batch is not None:\r?\n)(        if 'frames' in format:)/,
      "$1        meta_batch.frames_per_batch = int(meta_batch.frames_per_batch)\n$2"
    );
  }
  patchedLoadVideo = patchedLoadVideo.replace(
    "gen = itertools.islice(gen, meta_batch.frames_per_batch)",
    "gen = itertools.islice(gen, int(meta_batch.frames_per_batch))"
  );
  if (!videoHelperBatchCompatible(patchedUtils, patchedNodes, patchedLoadVideo)) {
    throw new Error(
      "VideoHelperSuite 源码结构与兼容补丁不匹配，已停止安装以避免损坏节点。"
    );
  }
  return {
    utilsSource: patchedUtils,
    nodesSource: patchedNodes,
    loadVideoSource: patchedLoadVideo
  };
}

export function videoHelperBatchCompatible(
  utilsSource: string,
  nodesSource: string,
  loadVideoSource: string
): boolean {
  return (
    utilsSource.includes("if len(value) == 6") &&
    utilsSource.includes("sensitive = value[5]") &&
    nodesSource.includes("frames_per_batch = int(frames_per_batch)") &&
    nodesSource.includes("batch_manager_states = {}") &&
    nodesSource.includes("batch_manager_states[unique_id] = self") &&
    nodesSource.includes("self = batch_manager_states[unique_id]") &&
    nodesSource.includes("batch_manager_states.pop(self.unique_id, None)") &&
    nodesSource.includes("previous = batch_manager_states.pop(unique_id, None)") &&
    loadVideoSource.includes(
      "meta_batch.frames_per_batch = int(meta_batch.frames_per_batch)"
    ) &&
    loadVideoSource.includes(
      "itertools.islice(gen, int(meta_batch.frames_per_batch))"
    )
  );
}

async function prepareVideoHelperSuite(
  targetDirectory: string,
  installLog: string[]
): Promise<void> {
  const utilsPath = path.join(targetDirectory, "videohelpersuite", "utils.py");
  const nodesPath = path.join(targetDirectory, "videohelpersuite", "nodes.py");
  const loadVideoPath = path.join(
    targetDirectory,
    "videohelpersuite",
    "load_video_nodes.py"
  );
  const [utilsSource, nodesSource, loadVideoSource] = await Promise.all([
    fs.readFile(utilsPath, "utf8"),
    fs.readFile(nodesPath, "utf8"),
    fs.readFile(loadVideoPath, "utf8")
  ]);
  const patched = patchVideoHelperBatchCompatibility(
    utilsSource,
    nodesSource,
    loadVideoSource
  );
  await Promise.all([
    fs.writeFile(utilsPath, patched.utilsSource, "utf8"),
    fs.writeFile(nodesPath, patched.nodesSource, "utf8"),
    fs.writeFile(loadVideoPath, patched.loadVideoSource, "utf8")
  ]);
  await fs.rm(path.join(targetDirectory, ".git"), {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200
  });
  installLog.push(
    "已应用并锁定当前 ComfyUI 分批队列兼容层；后续更新由本应用备份替换"
  );
}

async function scanCustomNodes(comfyRoot: string): Promise<CustomNodeStatus[]> {
  const customNodesDirectory = comfyRoot
    ? path.join(comfyRoot, "custom_nodes")
    : "";
  const entries = customNodesDirectory
    ? await fs.readdir(customNodesDirectory, { withFileTypes: true }).catch(() => [])
    : [];
  const installedDirectories = new Map(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => [entry.name.toLowerCase(), path.join(customNodesDirectory, entry.name)])
  );
  const appData =
    process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  const log = await fs
    .readFile(path.join(appData, "ComfyUI", "logs", "comfyui.log"), "utf8")
    .catch(() => "");
  const logLines = log.split(/\r?\n/);

  return Promise.all(customNodeCatalog.map(async (definition) => {
    const matchedName = definition.aliases.find((alias) =>
      installedDirectories.has(alias.toLowerCase())
    );
    const directory = matchedName
      ? installedDirectories.get(matchedName.toLowerCase()) ?? ""
      : "";
    const failed =
      Boolean(directory) &&
      (logLines.some((line) =>
        line.trim().endsWith(`(IMPORT FAILED): ${directory}`)
      ) ||
        logLines.some((line) =>
          line.includes(`Cannot import ${directory} module`)
        ));
    const importErrorLine = failed
      ? [...logLines]
          .reverse()
          .find((line) => line.includes(`Cannot import ${directory} module`))
          ?.replace(/^.*?Cannot import /, "Cannot import ")
      : "";
    const compatibilityError =
      definition.id === "video-helper-suite" && directory
        ? await Promise.all([
            fs.readFile(path.join(directory, "videohelpersuite", "utils.py"), "utf8"),
            fs.readFile(path.join(directory, "videohelpersuite", "nodes.py"), "utf8"),
            fs.readFile(
              path.join(directory, "videohelpersuite", "load_video_nodes.py"),
              "utf8"
            )
          ])
            .then(([utilsSource, nodesSource, loadVideoSource]) =>
              videoHelperBatchCompatible(
                utilsSource,
                nodesSource,
                loadVideoSource
              )
                ? ""
                : "版本过旧：不兼容当前 ComfyUI 的分批视频队列，请更新节点"
            )
            .catch(() => "无法读取 VideoHelperSuite 版本文件")
        : "";
    return {
      id: definition.id,
      name: definition.name,
      purpose: definition.purpose,
      repositoryUrl: definition.repositoryUrl,
      installed: Boolean(directory),
      loadError:
        compatibilityError ||
        importErrorLine ||
        (failed ? "最近一次启动时导入失败" : ""),
      directory,
      required: definition.required
    };
  }));
}

async function readLatestComfyLog(
  comfyRoot: string
): Promise<{ content: string; modifiedAt: number }> {
  const appData =
    process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  const candidates = [path.join(appData, "ComfyUI", "logs", "comfyui.log")];
  const userDirectory = comfyRoot ? path.join(comfyRoot, "user") : "";
  if (userDirectory) {
    const entries = await fs.readdir(userDirectory, { withFileTypes: true }).catch(() => []);
    candidates.push(
      ...entries
        .filter((entry) => entry.isFile() && /^comfyui.*\.log$/i.test(entry.name))
        .map((entry) => path.join(userDirectory, entry.name))
    );
  }
  const available = (
    await Promise.all(
      candidates.map(async (filename) => ({
        filename,
        stat: await fs.stat(filename).catch(() => null)
      }))
    )
  )
    .filter((item) => item.stat?.isFile() && (item.stat.size ?? 0) > 0)
    .sort((left, right) => (right.stat?.mtimeMs ?? 0) - (left.stat?.mtimeMs ?? 0));
  return available[0]
    ? {
        content: await fs.readFile(available[0].filename, "utf8").catch(() => ""),
        modifiedAt: available[0].stat?.mtimeMs ?? 0
      }
    : { content: "", modifiedAt: 0 };
}

async function scanEnvironmentIssues(comfyRoot: string): Promise<EnvironmentIssue[]> {
  const issues: EnvironmentIssue[] = [];
  if (comfyRoot) {
    const fantasyNodes = path.join(
      comfyRoot,
      "custom_nodes",
      "ComfyUI-GGUF-FantasyTalking",
      "nodes.py"
    );
    const fantasySource = await fs.readFile(fantasyNodes, "utf8").catch(() => "");
    if (/\r?\n"""\r?\n!!! Exception during processing !!!/.test(fantasySource)) {
      issues.push({
        id: "fantasytalking-unicodeescape",
        label: "FantasyTalking 节点源码损坏",
        detail: "nodes.py 末尾混入了 Windows 报错文本，导致 unicodeescape 语法错误。",
        severity: "error",
        repairable: true,
        repairLabel: "自动修复源码"
      });
    }
  }
  const log = await readLatestComfyLog(comfyRoot);
  const databaseStat = comfyRoot
    ? await fs.stat(path.join(comfyRoot, "user", "comfyui.db")).catch(() => null)
    : null;
  const databaseWasRebuiltAfterLog =
    Boolean(databaseStat) && (databaseStat?.mtimeMs ?? 0) > log.modifiedAt;
  if (
    /Failed to initialize database|Can't locate revision identified by|unable to open database file/i.test(
      log.content
    ) &&
    !databaseWasRebuiltAfterLog
  ) {
    issues.push({
      id: "comfy-database",
      label: "ComfyUI 数据库初始化失败",
      detail: "数据库迁移版本或文件状态异常；修复时会先备份原数据库，再重建索引并重启服务。",
      severity: "warning",
      repairable: true,
      repairLabel: "备份并重建"
    });
  }
  return issues;
}

async function isComfyRoot(directory: string): Promise<boolean> {
  if (!(await exists(directory))) return false;
  return (
    (await exists(path.join(directory, "main.py"))) ||
    (await exists(path.join(directory, "models")))
  );
}

async function discoverNamedComfyDirectories(homeDirectory: string): Promise<string[]> {
  const bases = ["Documents", "Desktop", "Downloads"].map((folder) =>
    path.join(homeDirectory, folder)
  );
  const discovered: string[] = [];
  for (const base of bases) {
    const entries = await fs.readdir(base, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory() || !/comfyui/i.test(entry.name)) continue;
      const candidate = path.join(base, entry.name);
      discovered.push(candidate, path.join(candidate, "ComfyUI"));
    }
  }
  return discovered;
}

async function findComfyRoot(settings: Settings): Promise<string> {
  const homeDirectory = os.homedir();
  const localAppData =
    process.env.LOCALAPPDATA ?? path.join(homeDirectory, "AppData", "Local");
  const candidates = uniqueWindowsPaths([
    ...buildComfyCandidates({
      homeDirectory,
      localAppData,
      modelDirectory: settings.modelDirectory,
      outputDirectory: settings.outputDirectory
    }),
    ...(await discoverNamedComfyDirectories(homeDirectory))
  ]);
  for (const candidate of candidates) {
    if (await isComfyRoot(candidate)) return candidate;
  }
  return "";
}

async function findComfyDesktopExecutable(): Promise<string> {
  const homeDirectory = os.homedir();
  const localAppData =
    process.env.LOCALAPPDATA ?? path.join(homeDirectory, "AppData", "Local");
  const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
  const candidates = buildComfyDesktopCandidates({
    homeDirectory,
    localAppData,
    programFiles,
    driveRoots: ["C:\\", "D:\\"]
  });
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return "";
}

interface ComfyInstallation {
  type: "desktop" | "manual" | "portable";
  directory: string;
  sourceDirectory: string;
  executable: string;
}

async function findComfyInstallation(
  settings: Settings
): Promise<ComfyInstallation | null> {
  const desktopExecutable = await findComfyDesktopExecutable();
  if (desktopExecutable) {
    const directory = path.dirname(desktopExecutable);
    const sourceDirectory = path.join(directory, "resources", "ComfyUI");
    return {
      type: "desktop",
      directory,
      sourceDirectory: (await exists(path.join(sourceDirectory, "main.py")))
        ? sourceDirectory
        : "",
      executable: desktopExecutable
    };
  }

  const homeDirectory = os.homedir();
  const localAppData =
    process.env.LOCALAPPDATA ?? path.join(homeDirectory, "AppData", "Local");
  const candidates = buildComfyCandidates({
    homeDirectory,
    localAppData,
    modelDirectory: settings.modelDirectory,
    outputDirectory: settings.outputDirectory,
    driveRoots: ["C:\\", "D:\\"]
  });
  for (const candidate of candidates) {
    if (!(await exists(path.join(candidate, "main.py")))) continue;
    const portablePython = path.join(
      path.dirname(candidate),
      "python_embeded",
      "python.exe"
    );
    return {
      type: (await exists(portablePython)) ? "portable" : "manual",
      directory: candidate,
      sourceDirectory: candidate,
      executable: (await exists(portablePython)) ? portablePython : ""
    };
  }
  return null;
}

async function findExecutable(command: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("where.exe", [command], {
      encoding: "utf8",
      timeout: 4000,
      windowsHide: true
    });
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? "";
  } catch {
    return "";
  }
}

async function commandItem(
  id: EnvironmentItemId,
  label: string,
  command: string,
  args: string[],
  optional = false
): Promise<EnvironmentItem> {
  const executable = await findExecutable(command);
  if (!executable) {
    return { id, label, ok: false, detail: "未找到", optional };
  }
  try {
    const { stdout, stderr } = await execFileAsync(executable, args, {
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true
    });
    const detail = `${stdout}${stderr}`
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? "已安装";
    return { id, label, ok: true, detail, path: executable, optional };
  } catch {
    return { id, label, ok: true, detail: "已安装", path: executable, optional };
  }
}

async function nvidiaItem(): Promise<EnvironmentItem> {
  const executable = await findExecutable("nvidia-smi.exe");
  if (!executable) {
    return {
      id: "nvidia",
      label: "NVIDIA GPU",
      ok: false,
      detail: "未找到 nvidia-smi"
    };
  }
  try {
    const { stdout } = await execFileAsync(
      executable,
      [
        "--query-gpu=name,driver_version,memory.total",
        "--format=csv,noheader"
      ],
      { encoding: "utf8", timeout: 5000, windowsHide: true }
    );
    return {
      id: "nvidia",
      label: "NVIDIA GPU",
      ok: true,
      detail: stdout.trim() || "已检测到 NVIDIA GPU",
      path: executable
    };
  } catch {
    return {
      id: "nvidia",
      label: "NVIDIA GPU",
      ok: true,
      detail: "已找到 nvidia-smi",
      path: executable
    };
  }
}

async function localServiceItem(
  id: "comfyui-api" | "lmstudio-api",
  label: string,
  url: string
): Promise<EnvironmentItem> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { id, label, ok: true, detail: `运行中 · ${url}` };
  } catch {
    return { id, label, ok: false, detail: `未运行或无法连接 · ${url}` };
  }
}

async function firstReachableServiceBase(
  baseUrls: string[],
  healthPath: string
): Promise<string> {
  const uniqueBases = [...new Set(baseUrls.map((url) => url.replace(/\/+$/, "")))];
  const checks = await Promise.all(
    uniqueBases.map(async (baseUrl) => {
      try {
        const response = await fetch(`${baseUrl}${healthPath}`, {
          signal: AbortSignal.timeout(1800)
        });
        return response.ok;
      } catch {
        return false;
      }
    })
  );
  return uniqueBases[checks.findIndex(Boolean)] ?? "";
}

export function buildLmStudioCandidates(options: {
  homeDirectory: string;
  localAppData: string;
  installDirectory?: string;
  driveRoots?: string[];
}): string[] {
  const configured = options.installDirectory?.trim() ?? "";
  const roots = options.driveRoots ?? ["C:\\", "D:\\"];
  return [
    ...(configured
      ? [
          configured,
          path.join(configured, "LM Studio.exe"),
          path.join(configured, "LM Studio", "LM Studio.exe"),
          path.join(configured, "LM-Studio", "LM Studio.exe")
        ]
      : []),
    path.join(options.localAppData, "Programs", "LM Studio", "LM Studio.exe"),
    path.join(options.localAppData, "LM-Studio", "LM Studio.exe"),
    ...roots.flatMap((root) => [
      path.join(root, "Program Files", "LM Studio", "LM Studio.exe"),
      path.join(root, "Program Files", "LM-Studio", "LM Studio.exe"),
      path.join(root, "LM Studio", "LM Studio.exe")
    ])
  ].filter((candidate, index, candidates) => {
    if (path.extname(candidate).toLowerCase() !== ".exe") return false;
    return candidates.findIndex(
      (value) => value.toLowerCase() === candidate.toLowerCase()
    ) === index;
  });
}

async function findLmStudioInstallation(settings: Settings): Promise<string> {
  const homeDirectory = os.homedir();
  const localAppData =
    process.env.LOCALAPPDATA ?? path.join(homeDirectory, "AppData", "Local");
  const candidates = buildLmStudioCandidates({
    homeDirectory,
    localAppData,
    installDirectory: settings.lmStudioInstallDirectory
  });
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return "";
}

async function lmStudioItem(settings: Settings): Promise<EnvironmentItem> {
  const installation = await findLmStudioInstallation(settings);
  if (installation) {
    return {
      id: "lmstudio",
      label: "LM Studio",
      ok: true,
      detail: "已找到 LM Studio.exe",
      path: installation,
      optional: true
    };
  }
  return {
    id: "lmstudio",
    label: "LM Studio",
    ok: false,
    detail: settings.lmStudioInstallDirectory
      ? "手动设置的目录中没有找到 LM Studio.exe"
      : "常见安装目录中未找到，请点击选择目录",
    optional: true
  };
}

function localEndpoint(rawUrl: string, fallbackPort: number): {
  host: string;
  port: number;
} | null {
  try {
    const url = new URL(rawUrl);
    if (
      url.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    ) {
      return null;
    }
    const port = Number(url.port || fallbackPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    return { host: "127.0.0.1", port };
  } catch {
    return null;
  }
}

async function launchDetached(
  executable: string,
  args: string[],
  cwd?: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env,
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

async function waitForService(
  url: string,
  timeoutMs = 120_000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(1500)
      });
      if (response.ok) return true;
    } catch {
      // The process may still be importing models and custom nodes.
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return false;
}

export function comfyUiMemoryArgs(
  settings: Pick<Settings, "vramReserveGb">
): string[] {
  const configuredReserve = Number.isFinite(settings.vramReserveGb)
    ? settings.vramReserveGb
    : 2;
  return [
    "--cache-none",
    "--reserve-vram",
    String(Math.max(0.5, configuredReserve))
  ];
}

async function startComfyUi(settings: Settings): Promise<string> {
  const endpoint = localEndpoint(settings.comfyUrl, 8188);
  if (!endpoint) {
    throw new Error("一键启动只支持本机 ComfyUI 地址（localhost 或 127.0.0.1）。");
  }
  const comfyRoot = await findComfyRoot(settings);
  const installation = await findComfyInstallation(settings);
  const sourceRoot = installation?.sourceDirectory || comfyRoot;
  if (!sourceRoot) throw new Error("没有找到 ComfyUI 核心程序目录。");

  const mainPy = path.join(sourceRoot, "main.py");
  if (!(await exists(mainPy))) {
    throw new Error(
      `找到了 ComfyUI 目录 ${sourceRoot}，但缺少 main.py；请先安装完整的 ComfyUI 程序。`
    );
  }

  const pythonCandidates = [
    comfyRoot ? path.join(comfyRoot, ".venv", "Scripts", "python.exe") : "",
    path.join(sourceRoot, ".venv", "Scripts", "python.exe"),
    path.join(path.dirname(sourceRoot), "python_embeded", "python.exe"),
    installation?.executable && installation.type !== "desktop"
      ? installation.executable
      : "",
    await findExecutable("python.exe")
  ];
  const python = (
    await Promise.all(
      pythonCandidates.filter(Boolean).map(async (candidate) => ({
        candidate,
        found: await exists(candidate)
      }))
    )
  ).find((item) => item.found)?.candidate;
  if (!python) {
    throw new Error("找到了 ComfyUI main.py，但没有找到可用的 Python 运行环境。");
  }

  const args = [
    "-s",
    mainPy,
    "--listen",
    endpoint.host,
    "--port",
    String(endpoint.port),
    "--disable-auto-launch",
    "--preview-method",
    "auto",
    ...comfyUiMemoryArgs(settings)
  ];
  if (comfyRoot && comfyRoot !== sourceRoot) {
    args.push(
      "--base-directory",
      comfyRoot,
      "--user-directory",
      path.join(comfyRoot, "user"),
      "--input-directory",
      path.join(comfyRoot, "input"),
      "--output-directory",
      path.join(comfyRoot, "output"),
      "--temp-directory",
      path.join(comfyRoot, "temp"),
      "--database-url",
      `sqlite:///${path.join(comfyRoot, "user", "comfyui.db").replaceAll("\\", "/")}`
    );
  }
  await launchDetached(python, args, sourceRoot, downloadEnvironment(settings));
  return `${settings.comfyUrl.replace(/\/+$/, "")}/system_stats`;
}

function listeningPid(netstatOutput: string, port: number): number | null {
  for (const line of netstatOutput.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 5 || fields[0]?.toUpperCase() !== "TCP") continue;
    if (fields[3]?.toUpperCase() !== "LISTENING") continue;
    const localAddress = fields[1] ?? "";
    if (!localAddress.endsWith(`:${port}`)) continue;
    const pid = Number(fields[4]);
    if (Number.isInteger(pid) && pid > 0) return pid;
  }
  return null;
}

async function stopComfyUi(settings: Settings): Promise<void> {
  const endpoint = localEndpoint(settings.comfyUrl, 8188);
  if (!endpoint) {
    throw new Error("重启只支持本机 ComfyUI 地址（localhost 或 127.0.0.1）。");
  }
  const healthUrl = `${settings.comfyUrl.replace(/\/+$/, "")}/system_stats`;
  const response = await fetch(healthUrl, {
    signal: AbortSignal.timeout(3000)
  }).catch(() => null);
  if (!response?.ok) {
    throw new Error("当前地址没有检测到运行中的 ComfyUI 服务。");
  }
  const { stdout } = await execFileAsync("netstat.exe", ["-ano", "-p", "tcp"], {
    encoding: "utf8",
    timeout: 5000,
    windowsHide: true
  });
  const pid = listeningPid(stdout, endpoint.port);
  if (!pid) throw new Error(`无法定位占用端口 ${endpoint.port} 的 ComfyUI 进程。`);
  await execFileAsync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true
  });
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const check = await fetch(healthUrl, {
        signal: AbortSignal.timeout(800)
      });
      if (!check.ok) return;
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function findLmStudioCli(settings: Settings): Promise<string> {
  const homeDirectory = os.homedir();
  const configured = settings.lmStudioInstallDirectory.trim();
  const candidates = [
    await findExecutable("lms.exe"),
    path.join(homeDirectory, ".lmstudio", "bin", "lms.exe"),
    configured ? path.join(configured, "lms.exe") : "",
    configured ? path.join(configured, "bin", "lms.exe") : ""
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return "";
}

async function startLmStudio(settings: Settings): Promise<string> {
  const endpoint = localEndpoint(settings.lmStudioUrl, 1234);
  if (!endpoint) {
    throw new Error("一键启动只支持本机 LM Studio 地址（localhost 或 127.0.0.1）。");
  }
  const executable = await findLmStudioCli(settings);
  if (!executable) {
    throw new Error(
      "没有找到 LM Studio 的 lms 命令。请先安装并至少启动一次 LM Studio。"
    );
  }
  await launchDetached(executable, [
    "server",
    "start",
    "--port",
    String(endpoint.port),
    "--bind",
    endpoint.host
  ]);
  return `${settings.lmStudioUrl.replace(/\/+$/, "")}/models`;
}

export async function startLocalService(
  kind: LocalServiceKind,
  settings: Settings
): Promise<{ ok: boolean; message: string }> {
  try {
    const healthUrl =
      kind === "comfy"
        ? await startComfyUi(settings)
        : await startLmStudio(settings);
    const ready = await waitForService(healthUrl);
    return ready
      ? {
          ok: true,
          message: `${kind === "comfy" ? "ComfyUI" : "LM Studio"} 服务已启动。`
        }
      : {
          ok: false,
          message: "已等待 2 分钟，但接口仍未就绪。ComfyUI 可能仍在加载，请稍后重新扫描。"
        };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function restartLocalService(
  kind: LocalServiceKind,
  settings: Settings
): Promise<{ ok: boolean; message: string }> {
  if (kind !== "comfy") {
    return { ok: false, message: "目前只支持重启 ComfyUI 服务。" };
  }
  try {
    await stopComfyUi(settings);
    const healthUrl = await startComfyUi(settings);
    const ready = await waitForService(healthUrl);
    return ready
      ? { ok: true, message: "ComfyUI 服务已重启并连接成功。" }
      : {
          ok: false,
          message: "ComfyUI 已重新启动，但等待 2 分钟后接口仍未就绪。"
        };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function repairEnvironmentIssue(
  issueId: EnvironmentIssue["id"],
  settings: Settings
): Promise<{ ok: boolean; message: string; log?: string }> {
  const repairLog: string[] = [];
  try {
    const comfyRoot = await findComfyRoot(settings);
    if (!comfyRoot) throw new Error("没有找到 ComfyUI 数据目录。");

    if (issueId === "fantasytalking-unicodeescape") {
      const nodesFile = path.join(
        comfyRoot,
        "custom_nodes",
        "ComfyUI-GGUF-FantasyTalking",
        "nodes.py"
      );
      const source = await fs.readFile(nodesFile, "utf8");
      const marker = /\r?\n"""\r?\n!!! Exception during processing !!!/;
      if (!marker.test(source)) {
        return { ok: true, message: "FantasyTalking 源码已经是可解析状态，无需修复。" };
      }
      const repaired = source.replace(
        marker,
        '\nr"""\n!!! Exception during processing !!!'
      );
      await fs.writeFile(nodesFile, repaired, "utf8");
      repairLog.push(`已将误粘贴的报错块改为 Python 原始字符串：${nodesFile}`);
      const python = path.join(comfyRoot, ".venv", "Scripts", "python.exe");
      if (await exists(python)) {
        await execFileAsync(python, ["-m", "py_compile", nodesFile], {
          encoding: "utf8",
          timeout: 30_000,
          windowsHide: true
        });
        repairLog.push("Python 语法检查通过");
      }
      return {
        ok: true,
        message: "FantasyTalking 源码已修复。请重启 ComfyUI 以重新加载节点。",
        log: repairLog.join("\n")
      };
    }

    if (issueId === "comfy-database") {
      const healthUrl = `${settings.comfyUrl.replace(/\/+$/, "")}/system_stats`;
      const running = await fetch(healthUrl, {
        signal: AbortSignal.timeout(2000)
      }).then((response) => response.ok).catch(() => false);
      if (running) {
        repairLog.push("停止当前 ComfyUI 服务");
        await stopComfyUi(settings);
      }
      const userDirectory = path.join(comfyRoot, "user");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      for (const filename of ["comfyui.db", "comfyui.db.lock"]) {
        const source = path.join(userDirectory, filename);
        if (!(await exists(source))) continue;
        const backup = path.join(userDirectory, `${filename}.backup-${timestamp}`);
        await fs.rename(source, backup);
        repairLog.push(`已备份 ${source} -> ${backup}`);
      }
      const nextHealthUrl = await startComfyUi(settings);
      const ready = await waitForService(nextHealthUrl);
      if (!ready) throw new Error("数据库已备份，但 ComfyUI 重启后 2 分钟内未就绪。");
      const rebuiltDatabase = path.join(userDirectory, "comfyui.db");
      const databaseReady = await exists(rebuiltDatabase);
      if (!databaseReady) {
        throw new Error("ComfyUI API 已恢复，但新数据库文件没有生成。");
      }
      repairLog.push("ComfyUI 已重建数据库并恢复连接");
      return {
        ok: true,
        message: "ComfyUI 数据库已备份重建，服务已恢复。",
        log: repairLog.join("\n")
      };
    }

    return { ok: false, message: "未知的环境问题，已拒绝修复。" };
  } catch (error) {
    const processError = error as Error & { stdout?: string; stderr?: string };
    repairLog.push(
      [processError.message, processError.stdout, processError.stderr]
        .filter(Boolean)
        .join("\n")
    );
    if (issueId === "comfy-database") {
      const healthUrl = `${settings.comfyUrl.replace(/\/+$/, "")}/system_stats`;
      const running = await fetch(healthUrl, {
        signal: AbortSignal.timeout(1500)
      }).then((response) => response.ok).catch(() => false);
      if (!running) {
        try {
          repairLog.push("修复未完成，尝试恢复启动 ComfyUI");
          const recoveryUrl = await startComfyUi(settings);
          await waitForService(recoveryUrl);
        } catch (recoveryError) {
          repairLog.push(
            `恢复启动失败：${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}`
          );
        }
      }
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      log: repairLog.join("\n")
    };
  }
}

export async function installCustomNode(
  nodeId: string,
  settings: Settings
): Promise<{ ok: boolean; message: string; log?: string }> {
  const definition = customNodeCatalog.find((item) => item.id === nodeId);
  if (!definition) return { ok: false, message: "未知的节点包，已拒绝安装。" };

  const installLog: string[] = [];
  try {
    const commandEnvironment = downloadEnvironment(settings);
    installLog.push(proxyLogLabel(settings));
    const comfyRoot = await findComfyRoot(settings);
    if (!comfyRoot) throw new Error("没有找到 ComfyUI 数据目录。");
    const customNodesDirectory = path.join(comfyRoot, "custom_nodes");
    const targetDirectory = path.join(customNodesDirectory, definition.directoryName);
    const git = await findExecutable("git.exe");
    if (!git) throw new Error("缺少 Git，无法下载节点包。");
    await fs.mkdir(customNodesDirectory, { recursive: true });
    let videoHelperPrepared = false;

    if (await exists(targetDirectory)) {
      if (await exists(path.join(targetDirectory, ".git"))) {
        installLog.push(`更新 ${definition.repositoryUrl}`);
        const gitResult = await execFileAsync(git, ["-C", targetDirectory, "pull", "--ff-only"], {
          encoding: "utf8",
          timeout: 180_000,
          windowsHide: true,
          env: commandEnvironment
        });
        installLog.push(`${gitResult.stdout}${gitResult.stderr}`.trim() || "Git：已是最新版本");
      } else {
        const replacementDirectory = `${targetDirectory}.update-${crypto.randomUUID()}`;
        const backupRoot = path.join(comfyRoot, "node-backups");
        const backupDirectory = path.join(
          backupRoot,
          `${definition.directoryName}-${Date.now()}`
        );
        installLog.push(`目录由 ComfyUI Manager 管理，下载上游副本后安全替换`);
        try {
          const gitResult = await execFileAsync(
            git,
            ["clone", "--depth", "1", definition.repositoryUrl, replacementDirectory],
            {
              encoding: "utf8",
              timeout: 180_000,
              windowsHide: true,
              env: commandEnvironment
            }
          );
          installLog.push(`${gitResult.stdout}${gitResult.stderr}`.trim() || "Git：克隆完成");
          if (definition.id === "video-helper-suite") {
            await prepareVideoHelperSuite(replacementDirectory, installLog);
            videoHelperPrepared = true;
          }
          await fs.mkdir(backupRoot, { recursive: true });
          await renameWithRetry(targetDirectory, backupDirectory);
          try {
            try {
              await renameWithRetry(replacementDirectory, targetDirectory);
            } catch (error) {
              if (!retryableRenameError(error)) throw error;
              installLog.push(
                "Windows 持续占用新目录，自动改用文件复制完成替换"
              );
              await fs.cp(replacementDirectory, targetDirectory, {
                recursive: true,
                force: false,
                errorOnExist: true
              });
            }
          } catch (error) {
            await fs
              .rm(targetDirectory, {
                recursive: true,
                force: true,
                maxRetries: 5,
                retryDelay: 200
              })
              .catch(() => undefined);
            await renameWithRetry(backupDirectory, targetDirectory).catch(
              () => undefined
            );
            throw error;
          }
          installLog.push(`旧目录已备份：${backupDirectory}`);
        } finally {
          await fs.rm(replacementDirectory, {
            recursive: true,
            force: true,
            maxRetries: 5,
            retryDelay: 200
          });
        }
      }
    } else {
      installLog.push(`克隆 ${definition.repositoryUrl}`);
      const gitResult = await execFileAsync(
        git,
        ["clone", "--depth", "1", definition.repositoryUrl, targetDirectory],
        {
          encoding: "utf8",
          timeout: 180_000,
          windowsHide: true,
          env: commandEnvironment
        }
      );
      installLog.push(`${gitResult.stdout}${gitResult.stderr}`.trim() || "Git：克隆完成");
    }

    if (definition.id === "video-helper-suite" && !videoHelperPrepared) {
      await prepareVideoHelperSuite(targetDirectory, installLog);
    }

    const requirements = path.join(targetDirectory, "requirements.txt");
    if (await exists(requirements)) {
      const python = path.join(comfyRoot, ".venv", "Scripts", "python.exe");
      if (!(await exists(python))) {
        throw new Error("节点已下载，但没有找到 ComfyUI Desktop 的 Python 环境。");
      }
      installLog.push(`安装依赖 ${requirements}`);
      const pipResult = await execFileAsync(
        python,
        ["-m", "pip", "install", "-r", requirements],
        {
          encoding: "utf8",
          timeout: 600_000,
          windowsHide: true,
          env: commandEnvironment
        }
      );
      installLog.push(`${pipResult.stdout}${pipResult.stderr}`.trim() || "pip：依赖已满足");
    } else {
      installLog.push("未发现 requirements.txt，无需安装额外 Python 依赖");
    }
    return {
      ok: true,
      message: `${definition.name} 已安装或更新。请重启 ComfyUI 后复检。`,
      log: installLog.join("\n\n")
    };
  } catch (error) {
    const processError = error as Error & { stdout?: string; stderr?: string };
    const details = [
      processError.message,
      processError.stdout,
      processError.stderr
    ].filter(Boolean).join("\n");
    installLog.push(details);
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      log: installLog.join("\n\n")
    };
  }
}

export async function scanEnvironment(
  settings: Settings
): Promise<EnvironmentScanResult> {
  const userHome = os.homedir();
  const [comfyRoot, comfyInstallation] = await Promise.all([
    findComfyRoot(settings),
    findComfyInstallation(settings)
  ]);
  const modelDirectory = comfyRoot ? path.join(comfyRoot, "models") : "";
  const outputDirectory = comfyRoot ? path.join(comfyRoot, "output") : "";
  const modelFiles = await listModelFiles(modelDirectory);
  if (
    comfyRoot &&
    await exists(
      path.join(
        comfyRoot,
        "custom_nodes",
        "ComfyUI-Frame-Interpolation",
        "ckpts",
        "rife",
        "rife47.pth"
      )
    )
  ) {
    modelFiles.push("frame_interpolation/rife47.pth");
  }
  const modelProfiles = evaluateModelProfiles(
    modelFiles,
    settings.ltxExtensionModelProfile
  );
  const customNodes = await scanCustomNodes(comfyRoot);
  const issues = await scanEnvironmentIssues(comfyRoot);
  const comfyItem: EnvironmentItem = comfyRoot || comfyInstallation
    ? {
        id: "comfyui",
        label: "ComfyUI",
        ok: true,
        detail: comfyInstallation
          ? `${
              comfyInstallation.type === "desktop"
                ? "桌面版"
                : comfyInstallation.type === "portable"
                  ? "便携版"
                  : "手动安装"
            } · 数据目录 ${comfyRoot || "等待初始化"}`
          : "已找到数据目录，尚未找到程序入口",
        path: comfyInstallation?.directory || comfyRoot
      }
    : {
        id: "comfyui",
        label: "ComfyUI",
        ok: false,
        detail: `未在 ${userHome} 及常见磁盘目录中找到`
      };

  const configuredComfyBaseUrl = settings.comfyUrl.replace(/\/+$/, "");
  const desktopComfyBaseUrl = "http://127.0.0.1:8000";
  const reachableComfyBaseUrl = await firstReachableServiceBase(
    [
      configuredComfyBaseUrl,
      ...(comfyInstallation?.type === "desktop" ? [desktopComfyBaseUrl] : [])
    ],
    "/system_stats"
  );
  const detectedComfyBaseUrl =
    reachableComfyBaseUrl || configuredComfyBaseUrl;
  const comfyHealthUrl = `${detectedComfyBaseUrl}/system_stats`;
  const lmStudioUrl = `${settings.lmStudioUrl.replace(/\/+$/, "")}/models`;
  const items = await Promise.all([
    commandItem("node", "Node.js", "node.exe", ["--version"]),
    commandItem("git", "Git", "git.exe", ["--version"], true),
    commandItem("ffmpeg", "FFmpeg", "ffmpeg.exe", ["-version"], true),
    nvidiaItem(),
    Promise.resolve(comfyItem),
    localServiceItem("comfyui-api", "ComfyUI 服务", comfyHealthUrl),
    lmStudioItem(settings),
    localServiceItem("lmstudio-api", "LM Studio 服务", lmStudioUrl)
  ]);

  return {
    scannedAt: new Date().toISOString(),
    userHome,
    comfyRoot,
    comfyUrl: detectedComfyBaseUrl,
    comfyInstallDirectory: comfyInstallation?.directory ?? "",
    comfySourceDirectory: comfyInstallation?.sourceDirectory ?? "",
    comfyInstallType: comfyInstallation?.type ?? "",
    modelDirectory,
    outputDirectory,
    items,
    modelProfiles,
    customNodes,
    issues
  };
}
