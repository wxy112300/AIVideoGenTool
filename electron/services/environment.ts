import { execFile, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type {
  AttentionAccelerationStatus,
  ConnectionResult,
  ComfyUiCompatibility,
  ComfyUiInstallationSummary,
  CustomNodeStatus,
  EnvironmentIssue,
  EnvironmentItem,
  EnvironmentItemId,
  EnvironmentScanResult,
  GpuDeviceInfo,
  LlamaServerStatus,
  LocalServiceKind,
  ModelComponentStatus,
  ModelScanProfile,
  Settings,
  WorkflowDependencyStatus
} from "../../src/types.js";
import {
  unconcernedPromptModelFilename,
  unconcernedPromptMmprojFilename,
  unconcernedPromptModelId,
  unconcernedPromptModelSource
} from "../../src/core/prompt-models.js";

const execFileAsync = promisify(execFile);

export const MINIMAX_H3_MINIMUM_COMFY_REVISION = "57500fc5";
const minimaxH3I2vWorkflowUrl =
  "https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/templates/video_minimax_h3_i2v.json";
const sageAttentionVersion = "2.2.0";
const comfyWheelsIndex = "https://comfy-org.github.io/wheels/";
const llamaServerReleaseApiUrl =
  "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest";
const llamaServerCudaVariants = ["12.4", "13.3"] as const;

function formatGpuMemory(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

const minimaxH3CoreNodes = [
  { id: "MiniMaxH3ImageToVideo", label: "H3 FL2VA 首帧 / 首尾帧图生视频" },
  { id: "MiniMaxH3ReferenceToVideo", label: "H3 R2V 多参考图生视频" },
  { id: "MiniMaxH3SigmaShift", label: "H3 Turbo 视频 / 音频 Sigma Shift" }
] as const;

const promptCoreNodes = [
  { id: "CLIPLoader", label: "CLIPLoader · 加载文本编码器" },
  { id: "TextGenerate", label: "TextGenerate · 生成提示词" },
  { id: "LoadImage", label: "LoadImage · 读取参考图" },
  { id: "ImageBatch", label: "ImageBatch · 合并多张参考图" },
  { id: "PreviewAny", label: "PreviewAny · 输出提示词文本" }
] as const;

function availableComfyNodeIds(objectInfo: unknown): Set<string> {
  return objectInfo && typeof objectInfo === "object" && !Array.isArray(objectInfo)
    ? new Set(Object.keys(objectInfo as Record<string, unknown>))
    : new Set<string>();
}

export function evaluateMiniMaxH3CoreSupport(
  objectInfo: unknown
): ComfyUiCompatibility["coreNodes"] {
  const available = availableComfyNodeIds(objectInfo);
  return minimaxH3CoreNodes.map((node) => ({
    ...node,
    available: available.has(node.id)
  }));
}

export function evaluatePromptCoreSupport(
  objectInfo: unknown
): ComfyUiCompatibility["promptCoreNodes"] {
  const available = availableComfyNodeIds(objectInfo);
  return promptCoreNodes.map((node) => ({
    ...node,
    available: available.has(node.id)
  }));
}

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
  installDirectory?: string;
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
    rootFromConfiguredDirectory(context.installDirectory),
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
    path.join(context.localAppData, "Programs", "ComfyUI", "Comfy Desktop", "Comfy Desktop.exe"),
    path.join(context.localAppData, "ComfyUI", "Comfy Desktop", "Comfy Desktop.exe"),
    path.join(programFiles, "ComfyUI", "Comfy Desktop", "Comfy Desktop.exe"),
    ...driveRoots.map((root) =>
      path.join(root, "Program Files", "ComfyUI", "Comfy Desktop", "Comfy Desktop.exe")
    ),
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
  category: "video" | "upscale" | "interpolation" | "prompt";
  managedBy?: "comfyui" | "lmstudio" | "llama-server";
  badge: string;
  description: string;
  vram: string;
  integrated?: boolean;
  components: Array<{
    label: string;
    expected: string;
    patterns: RegExp[];
  }>;
}

const installGuides: Record<string, ModelComponentStatus["installGuide"]> = {
  [`${unconcernedPromptModelId}:Unconcerned Qwen3.5 4B GGUF`]: {
    sourceLabel: `${unconcernedPromptModelSource} · Q6_K GGUF`,
    downloadUrl: "https://huggingface.co/HauhauCS/Qwen3.5-4B-Uncensored-HauhauCS-Aggressive/resolve/main/Qwen3.5-4B-Uncensored-HauhauCS-Aggressive-Q6_K.gguf?download=true",
    targetSubdirectory: "prompt_models",
    recommendedFilename: unconcernedPromptModelFilename,
    notes: "应用自管理 llama-server 使用的主模型；需要同时下载 mmproj 文件。Apache-2.0。"
  },
  [`${unconcernedPromptModelId}:Unconcerned Qwen3.5 4B mmproj`]: {
    sourceLabel: `${unconcernedPromptModelSource} · BF16 vision projector`,
    downloadUrl: "https://huggingface.co/HauhauCS/Qwen3.5-4B-Uncensored-HauhauCS-Aggressive/resolve/main/mmproj-Qwen3.5-4B-Uncensored-HauhauCS-Aggressive-BF16.gguf?download=true",
    targetSubdirectory: "prompt_models",
    recommendedFilename: unconcernedPromptMmprojFilename,
    notes: "图片/视频理解投影文件；必须与同名 GGUF 主模型一起使用。Apache-2.0。"
  },
  "qwen/qwen3.5-2b:Qwen3.5 2B ComfyUI 文本编码器": {
    sourceLabel: "Hugging Face · Comfy-Org/Qwen3.5",
    downloadUrl: "https://huggingface.co/Comfy-Org/Qwen3.5/resolve/main/text_encoders/qwen3.5_2b_bf16.safetensors?download=true",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "qwen3.5_2b_bf16.safetensors",
    notes: "更快、更省显存的提示词助手备选；仍支持文字和参考图理解，但复杂动作分析与提示词细节能力低于 4B。"
  },
  "qwen/qwen3.5-4b:Qwen3.5 4B ComfyUI 文本编码器": {
    sourceLabel: "Hugging Face · Comfy-Org/Qwen3.5",
    downloadUrl: "https://huggingface.co/Comfy-Org/Qwen3.5/resolve/main/text_encoders/qwen3.5_4b_bf16.safetensors?download=true",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "qwen3.5_4b_bf16.safetensors",
    notes: "4090 推荐的唯一提示词助手模型。它同时支持文字生成和图片/视频理解；官方 ComfyUI TextGenerate 工作流使用此文件。"
  },
  "minimax_h3_fl2va:MiniMax H3 FL2VA INT8 模型": {
    sourceLabel: "Comfy-Org / MiniMax-H3",
    downloadUrl: "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors",
    targetSubdirectory: "diffusion_models",
    recommendedFilename: "minimax_h3_fl2va_pruned_int8_convrot.safetensors",
    notes: "图生视频和首尾帧共用此模型。使用官方 pruned INT8 ConvRot 版本；可用分辨率和时长取决于实际 GPU、系统内存与卸载策略。"
  },
  "minimax_h3_fl2va:Qwen3-VL 32B H3 文本编码器": {
    sourceLabel: "Comfy-Org / MiniMax-H3",
    downloadUrl: "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
    notes: "官方低显存工作流使用 NVFP4 AWQ；是否适合当前设备取决于 GPU 对量化布局的支持和 ComfyUI 的卸载策略。"
  },
  "minimax_h3_fl2va:MiniMax H3 视频 VAE": {
    sourceLabel: "Comfy-Org / MiniMax-H3",
    downloadUrl: "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_video_vae_fp16.safetensors",
    targetSubdirectory: "vae",
    recommendedFilename: "minimax_h3_video_vae_fp16.safetensors"
  },
  "minimax_h3_fl2va:MiniMax H3 音频 VAE": {
    sourceLabel: "Comfy-Org / MiniMax-H3",
    downloadUrl: "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_audio_vae_fp32.safetensors",
    targetSubdirectory: "vae",
    recommendedFilename: "minimax_h3_audio_vae_fp32.safetensors",
    notes: "H3 原生立体声音频必须使用此 VAE；与视频 VAE 一起放在 models/vae。"
  },
  "minimax_h3_fl2va_turbo:MiniMax H3 Turbo pruned LoRA": {
    sourceLabel: "drbaph / MiniMax-H3-Turbo-Lora-ComfyUI",
    downloadUrl: "https://huggingface.co/drbaph/MiniMax-H3-Turbo-Lora-ComfyUI/resolve/main/minimax_h3_turbo_4step_ckpt500_pruned_comfyui.safetensors",
    targetSubdirectory: "loras",
    recommendedFilename: "minimax_h3_turbo_4step_ckpt500_pruned_comfyui.safetensors",
    notes: "首版 Turbo 推荐使用 ckpt500 pruned 转换版；建议 res_multistep、音频 shift 6、8-10 步。4 步属于实验档。"
  },
  "minimax_h3_fl2va_int4:MiniMax H3 FL2VA INT4 ConvRot 模型": {
    sourceLabel: "Merserk / MiniMax-H3-INT4-ConvRot",
    downloadUrl: "https://huggingface.co/Merserk/MiniMax-H3-INT4-ConvRot/resolve/main/minimax_h3_fl2va_pruned_int4_convrot.safetensors",
    targetSubdirectory: "diffusion_models",
    recommendedFilename: "minimax_h3_fl2va_pruned_int4_convrot.safetensors",
    notes: "社区 INT4 ConvRot 转换。12GB 显卡建议使用 pruned 版本，并准备 32GB 以上系统内存和快速 NVMe；不要与 NVFP4 编码器混用。"
  },
  "minimax_h3_fl2va_int4:Qwen3-VL 32B H3 INT4 文本编码器": {
    sourceLabel: "Merserk / MiniMax-H3-INT4-ConvRot",
    downloadUrl: "https://huggingface.co/Merserk/MiniMax-H3-INT4-ConvRot/resolve/main/qwen3vl_32b_minimax_h3_int4_convrot.safetensors",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "qwen3vl_32b_minimax_h3_int4_convrot.safetensors",
    notes: "与 INT4 ConvRot FL2VA 扩散模型配套的文本编码器；需要 ComfyUI 0.30.0 或更高版本。"
  },
  "minimax_h3_ref2va:MiniMax H3 Ref2VA INT8 模型": {
    sourceLabel: "Comfy-Org / MiniMax-H3",
    downloadUrl: "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors",
    targetSubdirectory: "diffusion_models",
    recommendedFilename: "minimax_h3_ref2va_pruned_int8_convrot.safetensors",
    notes: "R2V 多参考模型，和 FL2VA 首帧/首尾帧模型不是同一套权重。4090 可作为 1-2 张图片参考的起步档；参考素材越多，显存和系统内存压力越大。"
  },
  "minimax_h3_ref2va_int4:MiniMax H3 Ref2VA INT4 ConvRot 模型": {
    sourceLabel: "Merserk / MiniMax-H3-INT4-ConvRot",
    downloadUrl: "https://huggingface.co/Merserk/MiniMax-H3-INT4-ConvRot/resolve/main/minimax_h3_ref2va_pruned_int4_convrot.safetensors",
    targetSubdirectory: "diffusion_models",
    recommendedFilename: "minimax_h3_ref2va_pruned_int4_convrot.safetensors",
    notes: "社区 R2V INT4 ConvRot 转换；12GB 起步，4090 可作为低显存实验档。建议 32GB 以上系统内存和快速 NVMe。R2V 工作流尚未接入。"
  },
  "minimax_h3_ref2va:Qwen3-VL 32B H3 文本编码器": {
    sourceLabel: "Comfy-Org / MiniMax-H3",
    downloadUrl: "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
    notes: "R2V 与官方 FL2VA 共用此文本编码器。"
  },
  "minimax_h3_ref2va:MiniMax H3 视频 VAE": {
    sourceLabel: "Comfy-Org / MiniMax-H3",
    downloadUrl: "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_video_vae_fp16.safetensors",
    targetSubdirectory: "vae",
    recommendedFilename: "minimax_h3_video_vae_fp16.safetensors"
  },
  "minimax_h3_ref2va:MiniMax H3 音频 VAE": {
    sourceLabel: "Comfy-Org / MiniMax-H3",
    downloadUrl: "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_audio_vae_fp32.safetensors",
    targetSubdirectory: "vae",
    recommendedFilename: "minimax_h3_audio_vae_fp32.safetensors",
    notes: "R2V 原生立体声音频使用此 VAE。"
  },
  "minimax_h3_ref2va_int4:Qwen3-VL 32B H3 INT4 文本编码器": {
    sourceLabel: "Merserk / MiniMax-H3-INT4-ConvRot",
    downloadUrl: "https://huggingface.co/Merserk/MiniMax-H3-INT4-ConvRot/resolve/main/qwen3vl_32b_minimax_h3_int4_convrot.safetensors",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "qwen3vl_32b_minimax_h3_int4_convrot.safetensors",
    notes: "R2V INT4 与 FL2VA INT4 共用此文本编码器。"
  },
  "minimax_h3_ref2va_int4:MiniMax H3 视频 VAE": {
    sourceLabel: "Comfy-Org / MiniMax-H3",
    downloadUrl: "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_video_vae_fp16.safetensors",
    targetSubdirectory: "vae",
    recommendedFilename: "minimax_h3_video_vae_fp16.safetensors"
  },
  "minimax_h3_ref2va_int4:MiniMax H3 音频 VAE": {
    sourceLabel: "Comfy-Org / MiniMax-H3",
    downloadUrl: "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_audio_vae_fp32.safetensors",
    targetSubdirectory: "vae",
    recommendedFilename: "minimax_h3_audio_vae_fp32.safetensors"
  },
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
    id: unconcernedPromptModelId,
    name: "Qwen3.5 4B Unconcerned · 应用自管理",
    category: "prompt",
    managedBy: "llama-server",
    badge: "GGUF · 无拒答实验",
    description: "由应用自己启动 llama-server，使用 Qwen3.5 4B GGUF 与 mmproj 处理文字和参考图；不依赖 LM Studio，也不能通过 ComfyUI TextGenerate 加载。",
    vram: "Q6_K · GGUF 约 3.5 GB + mmproj",
    integrated: false,
    components: [
      {
        label: "Unconcerned Qwen3.5 4B GGUF",
        expected: `prompt_models/${unconcernedPromptModelFilename}`,
        patterns: [new RegExp(`(?:prompt_models|llama|llm)/${unconcernedPromptModelFilename.replaceAll(".", "\\.")}$`, "i")]
      },
      {
        label: "Unconcerned Qwen3.5 4B mmproj",
        expected: `prompt_models/${unconcernedPromptMmprojFilename}`,
        patterns: [new RegExp(`(?:prompt_models|llama|llm)/${unconcernedPromptMmprojFilename.replaceAll(".", "\\.")}$`, "i")]
      }
    ]
  },
  {
    id: "qwen/qwen3.5-4b",
    name: "Qwen3.5 4B · H3 提示词助手",
    category: "prompt",
    managedBy: "comfyui",
    badge: "4090 推荐 · BF16",
    description: "同时处理文字和参考图/视频，并按 H3 提示词规则生成更适合视频生成的描述。",
    vram: "BF16 · 文件约 9.3 GB",
    integrated: false,
    components: [
      {
        label: "Qwen3.5 4B ComfyUI 文本编码器",
        expected: "text_encoders/qwen3.5_4b_bf16.safetensors",
        patterns: [/text_encoders\/qwen3\.5_4b_bf16\.safetensors$/i]
      }
    ]
  },
  {
    id: "qwen/qwen3.5-2b",
    name: "Qwen3.5 2B · 快速提示词助手",
    category: "prompt",
    managedBy: "comfyui",
    badge: "低显存 · BF16",
    description: "更快的文字和参考图理解备选，适合 12GB 显存或需要快速迭代的设备。",
    vram: "BF16 · 文件约 4.55 GB",
    integrated: false,
    components: [
      {
        label: "Qwen3.5 2B ComfyUI 文本编码器",
        expected: "text_encoders/qwen3.5_2b_bf16.safetensors",
        patterns: [/text_encoders\/qwen3\.5_2b_bf16\.safetensors$/i]
      }
    ]
  },
  {
    id: "minimax_h3_fl2va",
    name: "MiniMax H3 FL2VA · 首帧 / 首尾帧",
    category: "video",
    badge: "FL2VA · 原生音视频",
    description: "只接入首帧或首尾帧图生视频，原生 24 FPS 同步立体声音频；不提供纯文本流程。",
    vram: "pruned INT8 · DynamicVRAM",
    integrated: true,
    components: [
      {
        label: "MiniMax H3 FL2VA INT8 模型",
        expected: "diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors",
        patterns: [/(?:diffusion_models|unet)\/minimax_h3_fl2va_pruned_int8_convrot\.safetensors$/i]
      },
      {
        label: "Qwen3-VL 32B H3 文本编码器",
        expected: "text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
        patterns: [/text_encoders\/qwen3vl_32b_minimax_h3_nvfp4_awq\.safetensors$/i]
      },
      {
        label: "MiniMax H3 视频 VAE",
        expected: "vae/minimax_h3_video_vae_fp16.safetensors",
        patterns: [/vae\/minimax_h3_video_vae_fp16\.safetensors$/i]
      },
      {
        label: "MiniMax H3 音频 VAE",
        expected: "vae/minimax_h3_audio_vae_fp32.safetensors",
        patterns: [/vae\/minimax_h3_audio_vae_fp32\.safetensors$/i]
      }
    ]
  },
  {
    id: "minimax_h3_fl2va_int4",
    name: "MiniMax H3 FL2VA · INT4 低显存",
    category: "video",
    badge: "INT4 · 低显存",
    description: "社区 pruned INT4 ConvRot 档，复用 H3 原生音视频节点；建议 12GB 起步并准备充足系统内存。",
    vram: "pruned INT4 · 12GB 起步 · RAM offload",
    integrated: true,
    components: [
      {
        label: "MiniMax H3 FL2VA INT4 ConvRot 模型",
        expected: "diffusion_models/minimax_h3_fl2va_pruned_int4_convrot.safetensors",
        patterns: [/(?:diffusion_models|unet)\/minimax_h3_fl2va_pruned_int4_convrot\.safetensors$/i]
      },
      {
        label: "Qwen3-VL 32B H3 INT4 文本编码器",
        expected: "text_encoders/qwen3vl_32b_minimax_h3_int4_convrot.safetensors",
        patterns: [/text_encoders\/qwen3vl_32b_minimax_h3_int4_convrot\.safetensors$/i]
      },
      {
        label: "MiniMax H3 视频 VAE",
        expected: "vae/minimax_h3_video_vae_fp16.safetensors",
        patterns: [/vae\/minimax_h3_video_vae_fp16\.safetensors$/i]
      },
      {
        label: "MiniMax H3 音频 VAE",
        expected: "vae/minimax_h3_audio_vae_fp32.safetensors",
        patterns: [/vae\/minimax_h3_audio_vae_fp32\.safetensors$/i]
      }
    ]
  },
  {
    id: "minimax_h3_fl2va_turbo",
    name: "MiniMax H3 Turbo · 首尾帧",
    category: "video",
    badge: "Turbo · pruned 首尾帧",
    description: "基于 pruned INT8 FL2VA 的 Turbo 首尾帧模式；使用原生 H3 音视频节点、res_multistep 和 ckpt500 pruned LoRA。仅支持图片生成，不提供视频续写。",
    vram: "pruned INT8 + Turbo LoRA · 4090 推荐",
    integrated: true,
    components: [
      {
        label: "MiniMax H3 FL2VA INT8 模型",
        expected: "diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors",
        patterns: [/(?:diffusion_models|unet)\/minimax_h3_fl2va_pruned_int8_convrot\.safetensors$/i]
      },
      {
        label: "Qwen3-VL 32B H3 文本编码器",
        expected: "text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
        patterns: [/text_encoders\/qwen3vl_32b_minimax_h3_nvfp4_awq\.safetensors$/i]
      },
      {
        label: "MiniMax H3 视频 VAE",
        expected: "vae/minimax_h3_video_vae_fp16.safetensors",
        patterns: [/vae\/minimax_h3_video_vae_fp16\.safetensors$/i]
      },
      {
        label: "MiniMax H3 音频 VAE",
        expected: "vae/minimax_h3_audio_vae_fp32.safetensors",
        patterns: [/vae\/minimax_h3_audio_vae_fp32\.safetensors$/i]
      },
      {
        label: "MiniMax H3 Turbo pruned LoRA",
        expected: "loras/minimax_h3_turbo_4step_ckpt500_pruned_comfyui.safetensors",
        patterns: [/loras\/minimax_h3_turbo_4step_ckpt500_pruned_comfyui\.safetensors$/i]
      }
    ]
  },
  {
    id: "minimax_h3_ref2va",
    name: "MiniMax H3 R2V · 多参考 INT8",
    category: "video",
    badge: "R2V · 多参考",
    description: "官方 Ref2VA 多参考档，当前支持最多 9 张图片参考；视频和音频 Slot 将在后续扩展。",
    vram: "pruned INT8 · 4090/24GB 起步 · DynamicVRAM",
    integrated: true,
    components: [
      {
        label: "MiniMax H3 Ref2VA INT8 模型",
        expected: "diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors",
        patterns: [/(?:diffusion_models|unet)\/minimax_h3_ref2va_pruned_int8_convrot\.safetensors$/i]
      },
      {
        label: "Qwen3-VL 32B H3 文本编码器",
        expected: "text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
        patterns: [/text_encoders\/qwen3vl_32b_minimax_h3_nvfp4_awq\.safetensors$/i]
      },
      {
        label: "MiniMax H3 视频 VAE",
        expected: "vae/minimax_h3_video_vae_fp16.safetensors",
        patterns: [/vae\/minimax_h3_video_vae_fp16\.safetensors$/i]
      },
      {
        label: "MiniMax H3 音频 VAE",
        expected: "vae/minimax_h3_audio_vae_fp32.safetensors",
        patterns: [/vae\/minimax_h3_audio_vae_fp32\.safetensors$/i]
      }
    ]
  },
  {
    id: "minimax_h3_ref2va_int4",
    name: "MiniMax H3 R2V · 多参考 INT4",
    category: "video",
    badge: "R2V · INT4 低显存",
    description: "社区 Ref2VA INT4 ConvRot 档，支持多张图片参考；视频和音频 Slot 将在后续扩展。",
    vram: "pruned INT4 · 12GB 起步 · 4090 可试 · RAM offload",
    integrated: true,
    components: [
      {
        label: "MiniMax H3 Ref2VA INT4 ConvRot 模型",
        expected: "diffusion_models/minimax_h3_ref2va_pruned_int4_convrot.safetensors",
        patterns: [/(?:diffusion_models|unet)\/minimax_h3_ref2va_pruned_int4_convrot\.safetensors$/i]
      },
      {
        label: "Qwen3-VL 32B H3 INT4 文本编码器",
        expected: "text_encoders/qwen3vl_32b_minimax_h3_int4_convrot.safetensors",
        patterns: [/text_encoders\/qwen3vl_32b_minimax_h3_int4_convrot\.safetensors$/i]
      },
      {
        label: "MiniMax H3 视频 VAE",
        expected: "vae/minimax_h3_video_vae_fp16.safetensors",
        patterns: [/vae\/minimax_h3_video_vae_fp16\.safetensors$/i]
      },
      {
        label: "MiniMax H3 音频 VAE",
        expected: "vae/minimax_h3_audio_vae_fp32.safetensors",
        patterns: [/vae\/minimax_h3_audio_vae_fp32\.safetensors$/i]
      }
    ]
  },
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
          installGuides[`minimax_h3_fl2va:${component.label}`] ??
          installGuides[`hunyuan15:${component.label}`]
      };
    });
    return {
      id: profile.id,
      name: profile.name,
      category: profile.category,
      managedBy: profile.managedBy,
      badge: profile.badge,
      description: profile.description,
      vram: profile.vram,
      available: components.every((component) => component.found),
      integrated: profile.integrated !== false,
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

function appManagedLlamaServerDirectory(): string {
  const localAppData =
    process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
  return path.join(localAppData, "Local Video Studio", "llama-server");
}

async function findFile(root: string, basename: string): Promise<string> {
  if (!root || !(await exists(root))) return "";
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop()!;
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const filename = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(filename);
      else if (entry.isFile() && entry.name.toLowerCase() === basename.toLowerCase()) {
        return filename;
      }
    }
  }
  return "";
}

async function findFileMatching(
  root: string,
  predicate: (basename: string) => boolean
): Promise<string> {
  if (!root || !(await exists(root))) return "";
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop()!;
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const filename = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(filename);
      else if (entry.isFile() && predicate(entry.name)) return filename;
    }
  }
  return "";
}

function llamaServerStatus(
  executablePath: string,
  source: LlamaServerStatus["source"]
): LlamaServerStatus {
  return {
    found: Boolean(executablePath),
    path: executablePath,
    directory: executablePath ? path.dirname(executablePath) : "",
    source
  };
}

export async function scanLlamaServer(
  settings: Pick<Settings, "promptLlamaServerPath" | "promptModelDirectory" | "modelDirectory">,
  comfyRoot = ""
): Promise<LlamaServerStatus> {
  const configured = settings.promptLlamaServerPath.trim();
  const configuredStat = configured
    ? await fs.stat(configured).catch(() => null)
    : null;
  if (configuredStat?.isFile()) {
    return llamaServerStatus(path.resolve(configured), "configured");
  }

  const promptDirectories = [
    settings.promptModelDirectory.trim(),
    settings.modelDirectory.trim()
      ? path.join(settings.modelDirectory.trim(), "prompt_models")
      : "",
    comfyRoot ? path.join(comfyRoot, "models", "prompt_models") : ""
  ].filter(Boolean);
  for (const directory of promptDirectories) {
    const executable = await findFile(path.resolve(directory), "llama-server.exe");
    if (executable) return llamaServerStatus(executable, "prompt-models");
  }

  const managed = await findFile(appManagedLlamaServerDirectory(), "llama-server.exe");
  if (managed) return llamaServerStatus(managed, "app-managed");

  const fromPath = await findExecutable("llama-server.exe");
  return fromPath ? llamaServerStatus(fromPath, "path") : llamaServerStatus("", "");
}

async function downloadFileWithCurl(
  url: string,
  destination: string,
  settings: Settings
): Promise<void> {
  const curl = await findExecutable("curl.exe");
  if (!curl) throw new Error("没有找到 curl，无法下载 llama-server。请安装 Windows 10/11 自带 curl 或手动下载。" );
  const args = ["-fL", "--retry", "2", "--connect-timeout", "20", url, "--output", destination];
  if (settings.proxyEnabled) {
    args.splice(1, 0, "--proxy", normalizeProxyUrl(settings.proxyUrl));
  }
  await execFileAsync(curl, args, {
    encoding: "utf8",
    timeout: 600_000,
    windowsHide: true,
    env: downloadEnvironment(settings)
  });
}

async function expandZipArchive(archive: string, destination: string): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("llama-server 一键安装目前只支持 Windows。" );
  }
  const script =
    "& { param([string]$archive, [string]$destination); Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force }";
  await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
    archive,
    destination
  ], {
    encoding: "utf8",
    timeout: 300_000,
    windowsHide: true
  });
}

async function copyDirectoryContents(source: string, destination: string): Promise<void> {
  const entries = await fs.readdir(source, { withFileTypes: true });
  await fs.mkdir(destination, { recursive: true });
  for (const entry of entries) {
    await fs.cp(
      path.join(source, entry.name),
      path.join(destination, entry.name),
      { recursive: true, force: true }
    );
  }
}

interface LlamaReleaseAsset {
  name?: string;
  browser_download_url?: string;
}

export function selectLlamaServerReleaseAssets(
  release: { assets?: LlamaReleaseAsset[] }
): { variant: string; binaryUrl: string; cudartUrl: string } | null {
  const assets = release.assets ?? [];
  for (const variant of llamaServerCudaVariants) {
    const binaryAsset = assets.find((asset) =>
      asset.name?.match(new RegExp(`^llama-b[^/]+-bin-win-cuda-${variant.replace(".", "\\.")}-x64\\.zip$`))
    );
    const cudartAsset = assets.find((asset) =>
      asset.name === `cudart-llama-bin-win-cuda-${variant}-x64.zip`
    );
    if (
      binaryAsset?.browser_download_url &&
      cudartAsset?.browser_download_url
    ) {
      return {
        variant,
        binaryUrl: binaryAsset.browser_download_url,
        cudartUrl: cudartAsset.browser_download_url
      };
    }
  }
  return null;
}

export async function installLlamaServer(
  settings: Settings
): Promise<ConnectionResult> {
  if (process.platform !== "win32") {
    return { ok: false, message: "llama-server 一键安装目前只支持 Windows。" };
  }
  const installLog = [proxyLogLabel(settings)];
  const temporaryRoot = path.join(
    os.tmpdir(),
    `local-video-studio-llama-${crypto.randomUUID()}`
  );
  let installedDirectory = "";
  let installationSucceeded = false;
  try {
    await fs.mkdir(temporaryRoot, { recursive: true });
    const releaseJson = path.join(temporaryRoot, "release.json");
    await downloadFileWithCurl(llamaServerReleaseApiUrl, releaseJson, settings);
    const release = JSON.parse(await fs.readFile(releaseJson, "utf8")) as {
      tag_name?: string;
      assets?: LlamaReleaseAsset[];
    };
    const selected = selectLlamaServerReleaseAssets(release);
    if (!selected) {
      throw new Error("官方最新版本没有找到 Windows x64 CUDA 12.4/13.3 发布包。" );
    }
    installLog.push(`准备安装 llama.cpp ${release.tag_name ?? "latest"} · CUDA ${selected.variant}`);
    const binaryArchive = path.join(temporaryRoot, "llama-server.zip");
    const cudartArchive = path.join(temporaryRoot, "cudart.zip");
    await downloadFileWithCurl(selected.binaryUrl, binaryArchive, settings);
    await downloadFileWithCurl(selected.cudartUrl, cudartArchive, settings);
    const binaryExtract = path.join(temporaryRoot, "binary");
    const cudartExtract = path.join(temporaryRoot, "cudart");
    await expandZipArchive(binaryArchive, binaryExtract);
    await expandZipArchive(cudartArchive, cudartExtract);
    const sourceExecutable = await findFile(binaryExtract, "llama-server.exe");
    if (!sourceExecutable) throw new Error("下载包中没有找到 llama-server.exe。" );
    const sourceCudart = await findFileMatching(
      cudartExtract,
      (basename) => /^cudart64.*\.dll$/i.test(basename)
    );
    const releaseDirectory = (release.tag_name || `latest-${Date.now()}`)
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    const targetDirectory = path.join(
      appManagedLlamaServerDirectory(),
      `${releaseDirectory}-${crypto.randomUUID()}`
    );
    installedDirectory = targetDirectory;
    await fs.mkdir(targetDirectory, { recursive: true });
    await copyDirectoryContents(path.dirname(sourceExecutable), targetDirectory);
    if (sourceCudart) await copyDirectoryContents(path.dirname(sourceCudart), targetDirectory);
    const installedExecutable = path.join(targetDirectory, "llama-server.exe");
    if (!(await exists(installedExecutable))) {
      throw new Error("llama-server.exe 安装后没有出现在目标目录。" );
    }
    try {
      await execFileAsync(installedExecutable, ["--version"], {
        encoding: "utf8",
        timeout: 10_000,
        windowsHide: true
      });
    } catch (error) {
      throw new Error(
        `llama-server 已解压，但无法启动验证：${error instanceof Error ? error.message : String(error)}`
      );
    }
    installLog.push(`已安装：${installedExecutable}`);
    installationSucceeded = true;
    return {
      ok: true,
      message: "llama-server 已自动安装并完成启动检查。",
      log: installLog.join("\n\n"),
      executablePath: installedExecutable
    };
  } catch (error) {
    installLog.push(error instanceof Error ? error.message : String(error));
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      log: installLog.join("\n\n")
    };
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true }).catch(() => undefined);
    if (!installationSucceeded && installedDirectory) {
      await fs.rm(installedDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
  }
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

export function patchLtxAudioVaeCompatibility(source: string): string {
  if (!source.includes("audio_vae = AudioVAE(sd, metadata)")) return source;
  const patched = source
    .replace(
      "from comfy.ldm.lightricks.vae.audio_vae import AudioVAE",
      "from comfy.sd import VAE"
    )
    .replace(
      "        audio_vae = AudioVAE(sd, metadata)",
      [
        "        sd_audio = comfy.utils.state_dict_prefix_replace(",
        '            dict(sd), {"audio_vae.": "autoencoder.", "vocoder.": "vocoder."}, filter_keys=True',
        "        )",
        "        audio_vae = VAE(sd=sd_audio, metadata=metadata)",
        "        audio_vae.throw_exception_if_invalid()"
      ].join("\n")
    );
  if (!ltxAudioVaeCompatible(patched)) {
    throw new Error(
      "ComfyUI-LTXVideo 源码结构与 AudioVAE 兼容补丁不匹配，已停止修改以避免损坏节点。"
    );
  }
  return patched;
}

export function ltxAudioVaeCompatible(source: string): boolean {
  return !source.includes("AudioVAE(sd, metadata)");
}

async function prepareLtxVideo(
  targetDirectory: string,
  installLog: string[]
): Promise<void> {
  const loaderPath = path.join(targetDirectory, "low_vram_loaders.py");
  const source = await fs.readFile(loaderPath, "utf8");
  const patched = patchLtxAudioVaeCompatibility(source);
  if (patched !== source) {
    await fs.writeFile(loaderPath, patched, "utf8");
    installLog.push(
      "已应用 ComfyUI 0.22+ AudioVAE 加载兼容层（comfy.sd.VAE wrapper）"
    );
  } else {
    installLog.push("AudioVAE 加载接口已兼容当前 ComfyUI");
  }
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
    let compatibilityError = "";
    if (definition.id === "video-helper-suite" && directory) {
      compatibilityError = await Promise.all([
        fs.readFile(path.join(directory, "videohelpersuite", "utils.py"), "utf8"),
        fs.readFile(path.join(directory, "videohelpersuite", "nodes.py"), "utf8"),
        fs.readFile(
          path.join(directory, "videohelpersuite", "load_video_nodes.py"),
          "utf8"
        )
      ])
        .then(([utilsSource, nodesSource, loadVideoSource]) =>
          videoHelperBatchCompatible(utilsSource, nodesSource, loadVideoSource)
            ? ""
            : "版本过旧：不兼容当前 ComfyUI 的分批视频队列，请更新节点"
        )
        .catch(() => "无法读取 VideoHelperSuite 版本文件");
    } else if (definition.id === "ltx-video" && directory) {
      compatibilityError = await fs
        .readFile(path.join(directory, "low_vram_loaders.py"), "utf8")
        .then((source) =>
          ltxAudioVaeCompatible(source)
            ? ""
            : "AudioVAE 加载接口过旧：不兼容当前 ComfyUI，请修复/更新节点"
        )
        .catch(() => "无法读取 ComfyUI-LTXVideo 版本文件");
    }
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
      installDirectory: settings.comfyInstallDirectory,
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

type ComfyInstallation = Omit<
  ComfyUiInstallationSummary,
  "desktopVersion" | "version" | "revision" | "selected"
>;

export function buildComfyDesktopSourceCandidates(executable: string): string[] {
  const directory = path.dirname(executable);
  return uniqueWindowsPaths([
    path.join(directory, "resources", "ComfyUI"),
    path.join(path.dirname(directory), "resources", "ComfyUI")
  ]);
}

async function readWindowsProductVersion(executable: string): Promise<string> {
  if (!executable || !(await exists(executable))) return "";
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "(Get-Item -LiteralPath ([Environment]::GetEnvironmentVariable('AIVIDEO_COMFY_EXE'))).VersionInfo.ProductVersion"
      ],
      {
        encoding: "utf8",
        timeout: 5000,
        windowsHide: true,
        env: { ...process.env, AIVIDEO_COMFY_EXE: executable }
      }
    );
    return stdout.trim();
  } catch {
    return "";
  }
}

async function desktopInstallation(executable: string): Promise<ComfyInstallation> {
  const directory = path.dirname(executable);
  const sourceCandidates = buildComfyDesktopSourceCandidates(executable);
  const sourceDirectory = (await Promise.all(
    sourceCandidates.map(async (candidate) =>
      (await exists(path.join(candidate, "main.py"))) ? candidate : ""
    )
  )).find(Boolean) ?? "";
  return { type: "desktop", directory, sourceDirectory, executable };
}

interface ComfyDesktop2RegistryEntry {
  id: string;
  name: string;
  installPath: string;
  status: string;
  sourceId: string;
  comfyVersion?: { commit?: string; baseTag?: string; commitsAhead?: number };
}

export function parseComfyDesktop2Registry(source: string): ComfyDesktop2RegistryEntry[] {
  try {
    const parsed = JSON.parse(source) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is ComfyDesktop2RegistryEntry => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
      const record = entry as Record<string, unknown>;
      return typeof record.id === "string" &&
        typeof record.name === "string" &&
        typeof record.installPath === "string" &&
        typeof record.status === "string" &&
        typeof record.sourceId === "string";
    });
  } catch {
    return [];
  }
}

async function desktop2ManagedInstallations(
  executable: string
): Promise<Array<{ installation: ComfyInstallation; revision: string }>> {
  const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  const registryPath = path.join(appData, "Comfy Desktop", "installations.json");
  const entries = parseComfyDesktop2Registry(
    await fs.readFile(registryPath, "utf8").catch(() => "")
  );
  const results: Array<{ installation: ComfyInstallation; revision: string }> = [];
  for (const entry of entries) {
    if (entry.sourceId === "cloud" || entry.status !== "installed") continue;
    const directory = path.resolve(entry.installPath);
    const sourceCandidates = [path.join(directory, "ComfyUI"), directory];
    const sourceDirectory = (await Promise.all(sourceCandidates.map(async (candidate) =>
      (await exists(path.join(candidate, "main.py"))) ? candidate : ""
    ))).find(Boolean) ?? "";
    if (!sourceDirectory) continue;
    results.push({
      installation: {
        type: "desktop",
        directory,
        sourceDirectory,
        executable
      },
      revision: entry.comfyVersion?.commit?.slice(0, 8) ?? ""
    });
  }
  return results;
}

async function installationFromDirectory(directory: string | undefined): Promise<ComfyInstallation | null> {
  if (!directory?.trim()) return null;
  const selected = path.resolve(directory.trim());
  const desktopExecutables = [
    path.join(selected, "Comfy Desktop", "Comfy Desktop.exe"),
    path.join(selected, "Comfy Desktop.exe"),
    path.join(selected, "ComfyUI.exe")
  ];
  for (const executable of desktopExecutables) {
    if (await exists(executable)) return desktopInstallation(executable);
  }
  const sourceCandidates = [
    selected,
    path.join(selected, "ComfyUI"),
    path.join(selected, "resources", "ComfyUI")
  ];
  for (const sourceDirectory of sourceCandidates) {
    if (!(await exists(path.join(sourceDirectory, "main.py")))) continue;
    const portablePython = path.join(
      path.dirname(sourceDirectory),
      "python_embeded",
      "python.exe"
    );
    const portable = await exists(portablePython);
    return {
      type: portable ? "portable" : "manual",
      directory: sourceDirectory,
      sourceDirectory,
      executable: portable ? portablePython : ""
    };
  }
  return null;
}

async function discoverComfyInstallations(
  settings: Settings
): Promise<ComfyUiInstallationSummary[]> {
  const homeDirectory = os.homedir();
  const localAppData =
    process.env.LOCALAPPDATA ?? path.join(homeDirectory, "AppData", "Local");
  const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
  const desktopExecutables = buildComfyDesktopCandidates({
    homeDirectory,
    localAppData,
    programFiles,
    driveRoots: ["C:\\", "D:\\"]
  });
  const existingDesktopExecutables = (
    await Promise.all(desktopExecutables.map(async (executable) => ({
      executable,
      exists: await exists(executable)
    })))
  ).filter((candidate) => candidate.exists).map((candidate) => candidate.executable);
  const modernDesktopExecutable = existingDesktopExecutables.find(
    (executable) => path.basename(executable).toLowerCase() === "comfy desktop.exe"
  ) ?? "";
  const managed = modernDesktopExecutable
    ? await desktop2ManagedInstallations(modernDesktopExecutable)
    : [];
  const configuredPath = settings.comfyInstallDirectory?.trim()
    ? path.resolve(settings.comfyInstallDirectory.trim()).toLowerCase()
    : "";
  const managedMatch = managed.find(({ installation }) =>
    installation.directory.toLowerCase() === configuredPath ||
    installation.sourceDirectory.toLowerCase() === configuredPath
  ) ?? (
    configuredPath && modernDesktopExecutable &&
    path.dirname(modernDesktopExecutable).toLowerCase() === configuredPath
      ? managed[0]
      : undefined
  );
  const configured = managedMatch?.installation ??
    await installationFromDirectory(settings.comfyInstallDirectory);
  const installations: ComfyInstallation[] = configured ? [configured] : [];
  installations.push(...managed.map((item) => item.installation));

  for (const executable of existingDesktopExecutables) {
    if (managed.length && executable.toLowerCase() === modernDesktopExecutable.toLowerCase()) {
      continue;
    }
    installations.push(await desktopInstallation(executable));
  }
  const sourceCandidates = uniqueWindowsPaths([
    ...buildComfyCandidates({
      homeDirectory,
      localAppData,
      installDirectory: settings.comfyInstallDirectory,
      modelDirectory: settings.modelDirectory,
      outputDirectory: settings.outputDirectory,
      driveRoots: ["C:\\", "D:\\"]
    }),
    ...(await discoverNamedComfyDirectories(homeDirectory))
  ]);
  for (const candidate of sourceCandidates) {
    const installation = await installationFromDirectory(candidate);
    if (installation) installations.push(installation);
  }

  const selectedKey = configured?.directory.toLowerCase() ?? "";
  const seen = new Set<string>();
  const unique = installations.filter((installation) => {
    const key = `${installation.type}:${installation.directory.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return Promise.all(unique.map(async (installation) => ({
    ...installation,
    desktopVersion: installation.type === "desktop"
      ? await readWindowsProductVersion(installation.executable)
      : "",
    version: await readComfySourceVersion(installation.sourceDirectory),
    revision: managed.find(({ installation: candidate }) =>
      candidate.directory.toLowerCase() === installation.directory.toLowerCase()
    )?.revision || await readComfyGitRevision(installation.sourceDirectory),
    selected: Boolean(selectedKey) && installation.directory.toLowerCase() === selectedKey
  })));
}

async function findComfyInstallation(settings: Settings): Promise<ComfyInstallation | null> {
  const installations = await discoverComfyInstallations(settings);
  const selected = installations.find((installation) => installation.selected);
  const installation = selected ?? installations[0];
  if (!installation) return null;
  const {
    desktopVersion: _desktopVersion,
    version: _version,
    revision: _revision,
    selected: _selected,
    ...result
  } = installation;
  return result;
}

async function findComfyPython(
  settings: Settings,
  comfyRoot = "",
  installation: ComfyInstallation | null = null
): Promise<string> {
  const root = comfyRoot || await findComfyRoot(settings);
  const selected = installation || await findComfyInstallation(settings);
  const sourceRoot = selected?.sourceDirectory || root;
  const candidates = uniqueWindowsPaths([
    root ? path.join(root, ".venv", "Scripts", "python.exe") : "",
    sourceRoot ? path.join(sourceRoot, ".venv", "Scripts", "python.exe") : "",
    sourceRoot ? path.join(path.dirname(sourceRoot), "python_embeded", "python.exe") : "",
    selected?.executable && selected.type !== "desktop" ? selected.executable : ""
  ]);
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return await findExecutable("python.exe");
}

interface AttentionPythonProbe {
  pythonVersion?: string;
  torchVersion?: string;
  cudaVersion?: string;
  gpuName?: string;
  gpuArchitecture?: string;
  sageAttentionVersion?: string;
  tritonVersion?: string;
}

export function attentionWheelForProbe(
  probe: AttentionPythonProbe
): { version: string; filename: string; url: string } | null {
  const python = probe.pythonVersion?.match(/^(\d+)\.(\d+)/);
  const torch = probe.torchVersion?.match(/^(\d+)\.(\d+)/);
  const cuda = probe.cudaVersion?.match(/^(\d+)\.(\d+)/);
  if (!python || !torch || !cuda || process.platform !== "win32") return null;
  const pythonVersion = `${python[1]}.${python[2]}`;
  const torchVersion = `${torch[1]}.${torch[2]}`;
  const cudaVersion = `${cuda[1]}.${cuda[2]}`;
  const officialBuildMatrix: Record<string, readonly string[]> = {
    "12.4|2.4": ["3.10", "3.11", "3.12"],
    "12.4|2.5": ["3.10", "3.11", "3.12", "3.13"],
    "12.4|2.6": ["3.10", "3.11", "3.12", "3.13"],
    "12.6|2.6": ["3.10", "3.11", "3.12", "3.13"],
    "12.6|2.7": ["3.10", "3.11", "3.12", "3.13"],
    "12.6|2.8": ["3.10", "3.11", "3.12", "3.13"],
    "12.6|2.9": ["3.10", "3.11", "3.12", "3.13", "3.14"],
    "12.6|2.10": ["3.10", "3.11", "3.12", "3.13", "3.14"],
    "12.6|2.11": ["3.10", "3.11", "3.12", "3.13", "3.14"],
    "12.8|2.7": ["3.10", "3.11", "3.12", "3.13"],
    "12.8|2.8": ["3.10", "3.11", "3.12", "3.13"],
    "12.8|2.9": ["3.10", "3.11", "3.12", "3.13", "3.14"],
    "12.8|2.10": ["3.10", "3.11", "3.12", "3.13", "3.14"],
    "12.8|2.11": ["3.10", "3.11", "3.12", "3.13", "3.14"],
    "12.9|2.8": ["3.10", "3.11", "3.12", "3.13"],
    "12.9|2.9": ["3.10", "3.11", "3.12", "3.13", "3.14"],
    "12.9|2.10": ["3.10", "3.11", "3.12", "3.13", "3.14"],
    "13.0|2.9": ["3.10", "3.11", "3.12", "3.13", "3.14"],
    "13.0|2.10": ["3.10", "3.11", "3.12", "3.13", "3.14"],
    "13.0|2.11": ["3.10", "3.11", "3.12", "3.13", "3.14"]
  };
  if (!officialBuildMatrix[`${cudaVersion}|${torchVersion}`]?.includes(pythonVersion)) {
    return null;
  }
  const cp = `cp${python[1]}${python[2]}`;
  const cudaTag = `cu${cuda[1]}${cuda[2]}`;
  // ComfyUI publishes the package local-version tag as e.g. `torch2.8`.
  // Do not normalize the dot away here: pip normalizes distribution filenames,
  // but exact version matching still uses the dotted package version.
  const torchTag = `torch${torch[1]}.${torch[2]}`;
  const version = `${sageAttentionVersion}+${cudaTag}${torchTag}`;
  const filename = `sageattention-${version}-${cp}-${cp}-win_amd64.whl`;
  return {
    version,
    filename,
    // Let pip resolve the asset from ComfyUI's PEP 503 index. Release asset
    // names are not guaranteed to use the same normalized local-version tag.
    url: comfyWheelsIndex
  };
}

async function inspectAttentionPython(python: string): Promise<AttentionPythonProbe> {
  if (!python) return {};
  const script = [
    "import json, platform, importlib.metadata as md",
    "def version(name):",
    "    try: return md.version(name)",
    "    except md.PackageNotFoundError: return ''",
    "result={'pythonVersion':platform.python_version(),'sageAttentionVersion':version('sageattention'),'tritonVersion':version('triton-windows') or version('triton')}",
    "try:",
    "    import torch",
    "    result['torchVersion']=torch.__version__",
    "    result['cudaVersion']=torch.version.cuda or ''",
    "    if torch.cuda.is_available():",
    "        result['gpuName']=torch.cuda.get_device_name(0)",
    "        cap=torch.cuda.get_device_capability(0)",
    "        result['gpuArchitecture']=f'{cap[0]}.{cap[1]}'",
    "except Exception as error: result['probeError']=str(error)",
    "print(json.dumps(result))"
  ].join("\n");
  try {
    const { stdout } = await execFileAsync(python, ["-c", script], {
      encoding: "utf8",
      timeout: 30_000,
      windowsHide: true
    });
    return JSON.parse(stdout.trim()) as AttentionPythonProbe;
  } catch {
    return {};
  }
}

async function kjNodesSupportsModelAttention(comfyRoot: string): Promise<boolean> {
  if (!comfyRoot) return false;
  const candidates = [
    "ComfyUI-KJNodes",
    "comfyui-kjnodes"
  ].map((directory) => path.join(
    comfyRoot,
    "custom_nodes",
    directory,
    "nodes",
    "model_optimization_nodes.py"
  ));
  for (const filename of candidates) {
    const source = await fs.readFile(filename, "utf8").catch(() => "");
    if (
      source.includes("PathchSageAttentionKJ") &&
      source.includes("optimized_attention_override")
    ) return true;
  }
  return false;
}

async function inspectAttentionAcceleration(
  settings: Settings,
  comfyRoot: string,
  installation: ComfyInstallation | null
): Promise<AttentionAccelerationStatus> {
  const pythonPath = await findComfyPython(settings, comfyRoot, installation);
  const probe = await inspectAttentionPython(pythonPath);
  const wheel = attentionWheelForProbe(probe);
  const kjNodesInstalled = Boolean(comfyRoot) && (
    await exists(path.join(comfyRoot, "custom_nodes", "ComfyUI-KJNodes")) ||
    await exists(path.join(comfyRoot, "custom_nodes", "comfyui-kjnodes"))
  );
  const kjNodesCompatible = await kjNodesSupportsModelAttention(comfyRoot);
  const sageReady = Boolean(
    wheel && probe.sageAttentionVersion?.toLowerCase() === wheel.version.toLowerCase()
  );
  const tritonReady = Boolean(probe.tritonVersion);
  const gpuArchitecture = Number.parseFloat(probe.gpuArchitecture ?? "");
  const gpuSupported = Number.isFinite(gpuArchitecture) && gpuArchitecture >= 8;
  const ready = Boolean(
    pythonPath && wheel && gpuSupported && sageReady && tritonReady && kjNodesCompatible
  );
  const missing = [
    !pythonPath ? "ComfyUI Python" : "",
    !gpuSupported ? "SM 8.0+ NVIDIA GPU" : "",
    !wheel ? "匹配的 Windows wheel" : "",
    !sageReady ? `SageAttention ${sageAttentionVersion}` : "",
    !tritonReady ? "Triton" : "",
    !kjNodesCompatible ? "新版 KJNodes 模型级补丁" : ""
  ].filter(Boolean);
  return {
    pythonPath,
    pythonVersion: probe.pythonVersion ?? "",
    torchVersion: probe.torchVersion ?? "",
    cudaVersion: probe.cudaVersion ?? "",
    gpuName: probe.gpuName ?? "",
    gpuArchitecture: probe.gpuArchitecture ?? "",
    sageAttentionVersion: probe.sageAttentionVersion ?? "",
    tritonVersion: probe.tritonVersion ?? "",
    kjNodesInstalled,
    kjNodesCompatible,
    recommendedSageVersion: wheel?.version ?? "",
    recommendedWheel: wheel?.filename ?? "",
    supported: Boolean(pythonPath && wheel && gpuSupported),
    ready,
    detail: ready ? "H3 模型级 SageAttention CUDA FP16 已就绪" :
      missing.length ? `待补齐：${missing.join("、")}` : "无法识别 Attention 运行环境"
  };
}

function readStatsString(value: unknown, keys: string[]): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

async function readComfySourceVersion(sourceDirectory: string): Promise<string> {
  if (!sourceDirectory) return "";
  const source = await fs.readFile(
    path.join(sourceDirectory, "comfyui_version.py"),
    "utf8"
  ).catch(() => "");
  return source.match(/__version__\s*=\s*["']([^"']+)["']/)?.[1] ?? "";
}

async function readComfyGitRevision(sourceDirectory: string): Promise<string> {
  if (!sourceDirectory || !(await exists(path.join(sourceDirectory, ".git")))) {
    return "";
  }
  try {
    const git = await findExecutable("git.exe");
    if (!git) return "";
    const { stdout } = await execFileAsync(
      git,
      ["-C", sourceDirectory, "rev-parse", "--short=8", "HEAD"],
      { encoding: "utf8", timeout: 5000, windowsHide: true }
    );
    return stdout.trim();
  } catch {
    return "";
  }
}

async function inspectComfyCompatibility(
  baseUrl: string,
  installation: ComfyInstallation | null
): Promise<ComfyUiCompatibility> {
  const sourceDirectory = installation?.sourceDirectory ?? "";
  let version = "";
  let revision = "";
  let objectInfo: unknown = null;
  let checkedFrom: ComfyUiCompatibility["checkedFrom"] = "";
  const [statsResult, objectInfoResult] = await Promise.allSettled([
      fetch(`${baseUrl}/system_stats`, { signal: AbortSignal.timeout(3500) }),
      fetch(`${baseUrl}/object_info`, { signal: AbortSignal.timeout(8000) })
  ]);
  if (statsResult.status === "fulfilled") {
    const statsResponse = statsResult.value;
    if (statsResponse.ok) {
      const stats = await statsResponse.json() as Record<string, unknown>;
      const system = stats.system;
      version = readStatsString(system, ["comfyui_version", "version"]);
      revision = readStatsString(system, [
        "comfyui_revision",
        "git_revision",
        "commit_hash"
      ]).slice(0, 8);
    }
  }
  if (objectInfoResult.status === "fulfilled") {
    const objectInfoResponse = objectInfoResult.value;
    if (objectInfoResponse.ok) {
      objectInfo = await objectInfoResponse.json();
      checkedFrom = "api";
    }
  }

  if (!version) version = await readComfySourceVersion(sourceDirectory);
  if (!revision) revision = await readComfyGitRevision(sourceDirectory);
  if (!objectInfo && sourceDirectory) {
    const [h3Source, textgenSource, previewSource, nodesSource] = await Promise.all([
      fs.readFile(path.join(sourceDirectory, "comfy_extras", "nodes_minimax_h3.py"), "utf8").catch(() => ""),
      fs.readFile(path.join(sourceDirectory, "comfy_extras", "nodes_textgen.py"), "utf8").catch(() => ""),
      fs.readFile(path.join(sourceDirectory, "comfy_extras", "nodes_preview_any.py"), "utf8").catch(() => ""),
      fs.readFile(path.join(sourceDirectory, "nodes.py"), "utf8").catch(() => "")
    ]);
    const sourceNodeIds = [
      ...minimaxH3CoreNodes
        .filter((node) => h3Source.includes(`node_id="${node.id}"`))
        .map((node) => node.id),
      ...(textgenSource.includes('node_id="TextGenerate"') ? ["TextGenerate"] : []),
      ...(nodesSource.includes("class CLIPLoader") ? ["CLIPLoader"] : []),
      ...(nodesSource.includes("class LoadImage") ? ["LoadImage"] : []),
      ...(nodesSource.includes("class ImageBatch") ? ["ImageBatch"] : []),
      ...(previewSource.includes("class PreviewAny") ? ["PreviewAny"] : [])
    ];
    if (sourceNodeIds.length > 0) {
      objectInfo = Object.fromEntries(
        sourceNodeIds.map((nodeId) => [nodeId, {}])
      );
      checkedFrom = "source";
    }
  }
  const coreNodes = evaluateMiniMaxH3CoreSupport(objectInfo);
  const h3CoreSupported = coreNodes.every((node) => node.available);
  const promptNodes = evaluatePromptCoreSupport(objectInfo);
  const promptCoreSupported = promptNodes.every((node) => node.available);
  const updateMode: ComfyUiCompatibility["updateMode"] = installation?.type === "desktop"
    ? "desktop"
    : sourceDirectory && await exists(path.join(sourceDirectory, ".git"))
      ? "git"
      : "unsupported";
  const updateHint = checkedFrom === "api"
    ? "版本信息来自当前已连接的服务；更新后需要重启该服务再复检。"
    : sourceDirectory
      ? "版本信息来自所选安装的本地核心源码。"
      : "此 Desktop 安装未暴露核心源码；启动服务后将通过 API 读取实际版本。";
  return {
    version,
    revision,
    h3MinimumRevision: MINIMAX_H3_MINIMUM_COMFY_REVISION,
    h3CoreSupported,
    coreNodes,
    promptCoreSupported,
    promptCoreNodes: promptNodes,
    checkedFrom,
    updateMode,
    updateHint
  };
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

export function parseNvidiaGpuQuery(output: string): GpuDeviceInfo[] {
  return output.split(/\r?\n/).flatMap((line, lineIndex) => {
    const fields = line.split(",").map((field) => field.trim());
    if (fields.length < 4) return [];
    const [indexText, name, driverVersion, memoryText] = fields;
    const index = Number.parseInt(indexText ?? "", 10);
    const memoryMiB = Number.parseFloat(
      (memoryText ?? "").replace(/[^\d.+-]/g, "")
    );
    if (!name || !Number.isFinite(memoryMiB) || memoryMiB <= 0) return [];
    return [{
      index: Number.isInteger(index) ? index : lineIndex,
      name,
      driverVersion: driverVersion ?? "",
      vramTotalBytes: Math.round(memoryMiB * 1024 ** 2)
    }];
  });
}

interface NvidiaProbe {
  item: EnvironmentItem;
  devices: GpuDeviceInfo[];
}

async function nvidiaItem(): Promise<NvidiaProbe> {
  const executable = await findExecutable("nvidia-smi.exe");
  if (!executable) {
    return {
      item: {
        id: "nvidia",
        label: "NVIDIA GPU",
        ok: false,
        detail: "未找到 nvidia-smi"
      },
      devices: []
    };
  }
  try {
    const { stdout } = await execFileAsync(
      executable,
      [
        "--query-gpu=index,name,driver_version,memory.total",
        "--format=csv,noheader,nounits"
      ],
      { encoding: "utf8", timeout: 5000, windowsHide: true }
    );
    const devices = parseNvidiaGpuQuery(stdout);
    return {
      item: {
        id: "nvidia",
        label: "NVIDIA GPU",
        ok: true,
        detail: devices.length
          ? devices.map((device) =>
              `GPU ${device.index} · ${device.name} · ${formatGpuMemory(device.vramTotalBytes)} · 驱动 ${device.driverVersion || "未知"}`
            ).join("；")
          : stdout.trim() || "已检测到 NVIDIA GPU",
        path: executable
      },
      devices
    };
  } catch {
    return {
      item: {
        id: "nvidia",
        label: "NVIDIA GPU",
        ok: true,
        detail: "已找到 nvidia-smi，但暂时无法读取显卡详情",
        path: executable
      },
      devices: []
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
    : 1;
  return [
    "--cache-none",
    "--reserve-vram",
    String(Math.max(0.5, Math.min(1, configuredReserve))),
    // On Windows with 24 GB cards, H3's 21 GB transformer plus the 32B
    // encoder can make pinned/async offload commit over 90 GB and page every
    // layer. The synchronous path completed the same graph at normal speed.
    "--disable-pinned-memory",
    "--disable-async-offload"
  ];
}

export function availableVramBytesForReserve(
  totalBytes: number,
  reserveGb: number
): number {
  const configuredReserve = Number.isFinite(reserveGb)
    ? Math.max(0.5, Math.min(1, reserveGb))
    : 1;
  return Math.max(0, totalBytes - configuredReserve * 1024 ** 3);
}

export async function resolveComfyOutputDirectory(
  settings: Settings
): Promise<string> {
  const configured = settings.outputDirectory.trim();
  if (configured) return path.resolve(configured);
  const comfyRoot = await findComfyRoot(settings);
  return comfyRoot ? path.join(comfyRoot, "output") : "";
}

export function comfyDataDirectories(
  settings: Pick<Settings, "modelDirectory" | "outputDirectory">,
  comfyRoot: string
): { modelDirectory: string; outputDirectory: string } {
  return {
    modelDirectory: settings.modelDirectory.trim()
      ? path.resolve(settings.modelDirectory)
      : path.join(comfyRoot, "models"),
    outputDirectory: settings.outputDirectory.trim()
      ? path.resolve(settings.outputDirectory)
      : path.join(comfyRoot, "output")
  };
}

export function mergeComfyDesktopSettings(
  value: unknown,
  settings: Pick<Settings, "modelDirectory" | "outputDirectory">
): Record<string, unknown> {
  const current = value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
  const modelDirectory = settings.modelDirectory.trim();
  const outputDirectory = settings.outputDirectory.trim();
  const currentModels = Array.isArray(current.modelsDirs)
    ? current.modelsDirs.filter((item): item is string => typeof item === "string")
    : [];
  return {
    ...current,
    ...(modelDirectory
      ? { modelsDirs: uniqueWindowsPaths([modelDirectory, ...currentModels]) }
      : {}),
    ...(outputDirectory ? { outputDir: path.resolve(outputDirectory) } : {})
  };
}

async function applyComfyDesktopSettings(settings: Settings): Promise<void> {
  if (!settings.modelDirectory.trim() && !settings.outputDirectory.trim()) return;
  const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  const filename = path.join(appData, "Comfy Desktop", "settings.json");
  const source = await fs.readFile(filename, "utf8").catch(() => "");
  if (!source) return;
  const current = JSON.parse(source) as unknown;
  const next = mergeComfyDesktopSettings(current, settings);
  if (JSON.stringify(current) === JSON.stringify(next)) return;
  await fs.writeFile(filename, JSON.stringify(next, null, 2), "utf8");
}

export function comfyUiBundledFrontendArgs(
  sourceRoot: string,
  bundledFrontendAvailable: boolean
): string[] {
  return bundledFrontendAvailable
    ? [
        "--front-end-root",
        path.join(sourceRoot, "web_custom_versions", "desktop_app")
      ]
    : [];
}

async function startComfyUi(settings: Settings): Promise<string> {
  const endpoint = localEndpoint(settings.comfyUrl, 8188);
  if (!endpoint) {
    throw new Error("一键启动只支持本机 ComfyUI 地址（localhost 或 127.0.0.1）。");
  }
  const comfyRoot = await findComfyRoot(settings);
  const installation = await findComfyInstallation(settings);
  if (installation?.type === "desktop" && !installation.sourceDirectory) {
    await applyComfyDesktopSettings(settings);
    await launchDetached(
      installation.executable,
      [],
      installation.directory,
      downloadEnvironment(settings)
    );
    return `${settings.comfyUrl.replace(/\/+$/, "")}/system_stats`;
  }
  const sourceRoot = installation?.sourceDirectory || comfyRoot;
  if (!sourceRoot) throw new Error("没有找到 ComfyUI 核心程序目录。");

  const mainPy = path.join(sourceRoot, "main.py");
  if (!(await exists(mainPy))) {
    throw new Error(
      `找到了 ComfyUI 目录 ${sourceRoot}，但缺少 main.py；请先安装完整的 ComfyUI 程序。`
    );
  }

  const python = await findComfyPython(settings, comfyRoot, installation);
  if (!python) {
    throw new Error("找到了 ComfyUI main.py，但没有找到可用的 Python 运行环境。");
  }

  const bundledFrontend = path.join(
    sourceRoot,
    "web_custom_versions",
    "desktop_app",
    "index.html"
  );
  const directories = comfyDataDirectories(settings, comfyRoot || sourceRoot);
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
  if (settings.modelDirectory.trim()) {
    args.push("--models-directory", directories.modelDirectory);
  }
  args.push(
    ...comfyUiBundledFrontendArgs(sourceRoot, await exists(bundledFrontend))
  );
  if (comfyRoot && comfyRoot !== sourceRoot) {
    args.push(
      "--base-directory",
      comfyRoot,
      "--user-directory",
      path.join(comfyRoot, "user"),
      "--input-directory",
      path.join(comfyRoot, "input"),
      "--output-directory",
      directories.outputDirectory,
      "--temp-directory",
      path.join(comfyRoot, "temp"),
      "--database-url",
      `sqlite:///${path.join(comfyRoot, "user", "comfyui.db").replaceAll("\\", "/")}`
    );
  } else if (settings.outputDirectory.trim()) {
    args.push("--output-directory", directories.outputDirectory);
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

async function processIdsForExecutable(executable: string): Promise<number[]> {
  if (!executable || !(await exists(executable))) return [];
  const script = [
    "$target = (Resolve-Path -LiteralPath $env:AIVIDEO_COMFY_EXE).Path.ToLower()",
    "$ids = Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.ToLower() -eq $target } | Select-Object -ExpandProperty ProcessId",
    "$ids | ConvertTo-Json -Compress"
  ].join("; ");
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        encoding: "utf8",
        timeout: 10_000,
        windowsHide: true,
        env: { ...process.env, AIVIDEO_COMFY_EXE: executable }
      }
    );
    const parsed = JSON.parse(stdout.trim()) as unknown;
    const values = Array.isArray(parsed) ? parsed : [parsed];
    return values.filter((value): value is number =>
      typeof value === "number" && Number.isInteger(value) && value > 0
    );
  } catch {
    return [];
  }
}

export function parseComfyProcessIds(output: string): number[] {
  try {
    const parsed = JSON.parse(output.trim()) as unknown;
    const values = Array.isArray(parsed) ? parsed : [parsed];
    return [...new Set(values.flatMap((value) => {
      if (typeof value === "number") return [value];
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const processId = (value as { ProcessId?: unknown; processId?: unknown }).ProcessId ??
        (value as { processId?: unknown }).processId;
      return typeof processId === "number" ? [processId] : [];
    }).filter((value) => Number.isInteger(value) && value > 0))];
  } catch {
    return [];
  }
}

async function allComfyProcessIds(settings: Settings): Promise<number[]> {
  const python = await findComfyPython(settings).catch(() => "");
  const script = [
    "$python = $env:AIVIDEO_COMFY_PYTHON.ToLower()",
    "$items = Get-CimInstance Win32_Process | Where-Object {",
    "  $_.Name -ieq 'ComfyUI.exe' -or",
    "  ($_.Name -match '^(python|pythonw)(\\.exe)?$' -and (",
    "    ($python -and $_.ExecutablePath -and $_.ExecutablePath.ToLower() -eq $python -and $_.CommandLine -match '(?i)main\\.py') -or",
    "    $_.CommandLine -match '(?i)ComfyUI'",
    "  ))",
    "} | Select-Object -ExpandProperty ProcessId",
    "$items | ConvertTo-Json -Compress"
  ].join(" ");
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        encoding: "utf8",
        timeout: 10_000,
        windowsHide: true,
        env: { ...process.env, AIVIDEO_COMFY_PYTHON: python }
      }
    );
    return parseComfyProcessIds(stdout);
  } catch {
    return [];
  }
}

export async function forceStopComfyProcesses(
  settings: Settings
): Promise<{ ok: boolean; message: string }> {
  if (process.platform !== "win32") {
    return { ok: false, message: "强制终止目前只支持 Windows。" };
  }
  const processIds = new Set(await allComfyProcessIds(settings));
  const endpoint = localEndpoint(settings.comfyUrl, 8188);
  if (endpoint) {
    const netstat = await execFileAsync(
      "netstat.exe",
      ["-ano", "-p", "tcp"],
      { encoding: "utf8", timeout: 5000, windowsHide: true }
    ).catch(() => ({ stdout: "" }));
    const listening = listeningPid(netstat.stdout, endpoint.port);
    if (listening) processIds.add(listening);
  }
  let taskkillError = "";
  try {
    await execFileAsync(
      "taskkill.exe",
      ["/IM", "ComfyUI.exe", "/T", "/F"],
      { encoding: "utf8", timeout: 15_000, windowsHide: true }
    );
  } catch (error) {
    const processError = error as Error & { stderr?: string };
    taskkillError = processError.stderr || processError.message;
  }
  for (const processId of processIds) {
    await execFileAsync(
      "taskkill.exe",
      ["/PID", String(processId), "/T", "/F"],
      { encoding: "utf8", timeout: 10_000, windowsHide: true }
    ).catch(() => undefined);
  }
  if (!processIds.size && taskkillError && !/not found|no running instance/i.test(taskkillError)) {
    return { ok: false, message: `强制终止 ComfyUI 失败：${taskkillError}` };
  }
  return {
    ok: true,
    message: processIds.size
      ? `已强制终止 ${processIds.size} 个 ComfyUI 进程树。请等待几秒后再重新启动服务。`
      : "未发现正在运行的 ComfyUI 进程。"
  };
}

async function stopOrphanedComfyProcesses(settings: Settings): Promise<void> {
  const result = await forceStopComfyProcesses(settings);
  if (!result.ok) throw new Error(result.message);
}

async function stopComfyUi(settings: Settings): Promise<void> {
  const endpoint = localEndpoint(settings.comfyUrl, 8188);
  if (!endpoint) {
    throw new Error("重启只支持本机 ComfyUI 地址（localhost 或 127.0.0.1）。");
  }
  // An overloaded ComfyUI often stops answering /system_stats while its process
  // and CUDA allocation are still alive. Port ownership is the authoritative
  // signal here; requiring HTTP health made automatic recovery unable to kill
  // exactly the process it was intended to recover.
  const deadline = Date.now() + 20_000;
  let portClearSince = 0;
  while (Date.now() < deadline) {
    const { stdout } = await execFileAsync(
      "netstat.exe",
      ["-ano", "-p", "tcp"],
      { encoding: "utf8", timeout: 5000, windowsHide: true }
    );
    const pid = listeningPid(stdout, endpoint.port);
    if (!pid) {
      if (!portClearSince) portClearSince = Date.now();
      // ComfyUI Desktop can briefly re-spawn its worker after the listener is
      // killed. Require a stable free-port window before starting a replacement.
      if (Date.now() - portClearSince >= 1_500) {
        await stopOrphanedComfyProcesses(settings);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      continue;
    }
    portClearSince = 0;
    try {
      await execFileAsync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
        encoding: "utf8",
        timeout: 10_000,
        windowsHide: true
      });
    } catch {
      // The process may have exited between netstat and taskkill. Re-check the
      // port instead of turning that harmless race into a failed restart.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`端口 ${endpoint.port} 的 ComfyUI 进程仍未退出。`);
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

export async function updateComfyUi(
  settings: Settings
): Promise<{ ok: boolean; message: string; log?: string }> {
  const installation = await findComfyInstallation(settings);
  if (!installation) {
    return { ok: false, message: "没有找到可更新的 ComfyUI 安装。" };
  }
  if (installation.type === "desktop") {
    try {
      await launchDetached(installation.executable, []);
      return {
        ok: true,
        message: "已打开 ComfyUI Desktop。请在服务器配置的更新页面确认 Update Now，完成后重启服务并重新扫描。",
        log: "Desktop 安装由官方更新器维护，本工具不会直接覆盖 Program Files 中的核心文件。"
      };
    } catch (error) {
      return {
        ok: false,
        message: `无法打开 ComfyUI Desktop：${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  const sourceDirectory = installation.sourceDirectory;
  if (!sourceDirectory || !(await exists(path.join(sourceDirectory, ".git")))) {
    return {
      ok: false,
      message: "当前安装没有 Git 元数据，无法安全地原地更新；请使用 ComfyUI 官方安装器。"
    };
  }
  const git = await findExecutable("git.exe");
  if (!git) return { ok: false, message: "没有找到 Git，无法更新 ComfyUI。" };
  try {
    const status = await execFileAsync(
      git,
      ["-C", sourceDirectory, "status", "--porcelain"],
      { encoding: "utf8", timeout: 10_000, windowsHide: true }
    );
    if (status.stdout.trim()) {
      return {
        ok: false,
        message: "ComfyUI 源码目录存在未提交修改，为避免覆盖修改，本次更新已取消。",
        log: status.stdout.trim()
      };
    }
    const result = await execFileAsync(
      git,
      ["-C", sourceDirectory, "pull", "--ff-only"],
      {
        encoding: "utf8",
        timeout: 180_000,
        windowsHide: true,
        env: downloadEnvironment(settings)
      }
    );
    return {
      ok: true,
      message: "ComfyUI 源码已快进更新。请重启 ComfyUI 后重新扫描环境。",
      log: `${result.stdout}${result.stderr}`.trim()
    };
  } catch (error) {
    const processError = error as Error & { stdout?: string; stderr?: string };
    return {
      ok: false,
      message: `ComfyUI 更新失败：${processError.message}`,
      log: [processError.stdout, processError.stderr].filter(Boolean).join("\n")
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
    if (definition.id === "ltx-video") {
      await prepareLtxVideo(targetDirectory, installLog);
    }

    const requirements = path.join(targetDirectory, "requirements.txt");
    if (await exists(requirements)) {
      const python = await findComfyPython(settings, comfyRoot);
      if (!python) throw new Error("节点已下载，但没有找到所选 ComfyUI 的 Python 环境。");
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
      if (definition.id === "seedvr2") {
        const peftResult = await execFileAsync(
          python,
          ["-m", "pip", "install", "--upgrade", "peft==0.20.0"],
          {
            encoding: "utf8",
            timeout: 600_000,
            windowsHide: true,
            env: commandEnvironment
          }
        );
        installLog.push(
          `${peftResult.stdout}${peftResult.stderr}`.trim() ||
          "SeedVR2：PEFT 兼容版本已确认"
        );
      }
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

export function tritonRequirementForTorch(torchVersion: string): string {
  const match = torchVersion.match(/^(\d+)\.(\d+)/);
  if (!match) throw new Error(`无法识别 PyTorch 版本：${torchVersion || "未知"}`);
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major !== 2 || minor < 4 || minor > 11) {
    throw new Error(`当前自动安装尚不支持 PyTorch ${torchVersion}`);
  }
  const tritonMinor = minor - 4;
  return `triton-windows>=3.${tritonMinor},<3.${tritonMinor + 1}`;
}

async function runLoggedProcess(
  executable: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    onLog?: (message: string) => void;
  }
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const output: string[] = [];
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const append = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      output.push(text);
      for (const line of text.split(/\r?\n/).filter(Boolean)) {
        options.onLog?.(line);
      }
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`命令运行超过 ${Math.round((options.timeoutMs ?? 900_000) / 60_000)} 分钟`));
    }, options.timeoutMs ?? 900_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      const text = output.join("").trim();
      if (code === 0) resolve(text);
      else reject(Object.assign(new Error(`命令退出，代码 ${code}`), { stdout: text }));
    });
  });
}

export async function installAttentionAcceleration(
  settings: Settings,
  onLog?: (message: string) => void
): Promise<{ ok: boolean; message: string; log?: string }> {
  const log: string[] = [];
  const report = (message: string) => {
    log.push(message);
    onLog?.(message);
  };
  let wasRunning = false;
  try {
    report(proxyLogLabel(settings));
    const comfyRoot = await findComfyRoot(settings);
    const installation = await findComfyInstallation(settings);
    if (!comfyRoot || !installation) {
      throw new Error("请先在设置中选择完整的 ComfyUI 安装和数据目录。");
    }
    const python = await findComfyPython(settings, comfyRoot, installation);
    if (!python) throw new Error("没有找到所选 ComfyUI 的 Python 环境。");
    const before = await inspectAttentionPython(python);
    const gpuArchitecture = Number.parseFloat(before.gpuArchitecture ?? "");
    if (!Number.isFinite(gpuArchitecture) || gpuArchitecture < 8) {
      throw new Error(
        `SageAttention 2.2 需要 SM 8.0+ NVIDIA GPU；当前检测结果为 ${before.gpuName || "未知 GPU"} / SM ${before.gpuArchitecture || "未知"}。`
      );
    }
    const wheel = attentionWheelForProbe(before);
    if (!wheel) {
      throw new Error(
        `没有找到适用于 Python ${before.pythonVersion || "未知"} / ` +
        `PyTorch ${before.torchVersion || "未知"} / CUDA ${before.cudaVersion || "未知"} 的官方 Windows wheel。`
      );
    }
    report(`ComfyUI Python：${python}`);
    report(`运行时：Python ${before.pythonVersion} · PyTorch ${before.torchVersion} · CUDA ${before.cudaVersion}`);
    report(`目标：${wheel.filename}`);

    const healthUrl = `${settings.comfyUrl.replace(/\/+$/, "")}/system_stats`;
    wasRunning = await fetch(healthUrl, {
      signal: AbortSignal.timeout(2000)
    }).then((response) => response.ok).catch(() => false);
    if (wasRunning) {
      report("正在停止 ComfyUI，避免更新节点和 Python 扩展时文件被占用……");
      await stopComfyUi(settings);
      report("ComfyUI 已停止");
    }

    if (await kjNodesSupportsModelAttention(comfyRoot)) {
      report("KJNodes 已支持模型级 SageAttention，无需重复更新");
    } else {
      report("正在安装或更新 KJNodes 模型级 Attention 补丁……");
      const kjResult = await installCustomNode("kjnodes", settings);
      if (kjResult.log) {
        log.push(kjResult.log);
        for (const line of kjResult.log.split(/\r?\n/).filter(Boolean)) onLog?.(line);
      }
      if (!kjResult.ok) throw new Error(kjResult.message);
      if (!(await kjNodesSupportsModelAttention(comfyRoot))) {
        throw new Error("KJNodes 已安装，但没有检测到模型级 SageAttention 节点；请查看安装日志。");
      }
    }

    const environment = downloadEnvironment(settings);
    const commonPipArgs = ["-m", "pip", "install", "--disable-pip-version-check", "--no-input"];
    const tritonRequirement = tritonRequirementForTorch(before.torchVersion ?? "");
    report(`正在安装 ${tritonRequirement}……`);
    await runLoggedProcess(
      python,
      [...commonPipArgs, "--upgrade", tritonRequirement],
      { env: environment, timeoutMs: 900_000, onLog }
    );
    report("Triton 安装完成");

    report("正在从 ComfyUI 官方 wheel 仓库安装 SageAttention……");
    await runLoggedProcess(
      python,
      [
        ...commonPipArgs,
        "--upgrade",
        "--extra-index-url",
        wheel.url,
        `sageattention==${wheel.version}`
      ],
      { env: environment, timeoutMs: 900_000, onLog }
    );
    report("SageAttention 安装完成");

    report("正在运行 CUDA Attention 自检……");
    const selfTest = [
      "import json, torch",
      "from sageattention import sageattn_qk_int8_pv_fp16_cuda as sage",
      "q=torch.randn(1,8,128,64,device='cuda',dtype=torch.float16)",
      "k=torch.randn_like(q); v=torch.randn_like(q)",
      "out=sage(q,k,v,tensor_layout='HND',is_causal=False,pv_accum_dtype='fp32')",
      "torch.cuda.synchronize()",
      "assert out.shape == q.shape and torch.isfinite(out).all()",
      "print(json.dumps({'ok':True,'shape':list(out.shape),'dtype':str(out.dtype),'gpu':torch.cuda.get_device_name(0)}))"
    ].join("\n");
    const selfTestOutput = await runLoggedProcess(
      python,
      ["-c", selfTest],
      { env: environment, timeoutMs: 180_000, onLog }
    );
    report(`CUDA 自检通过：${selfTestOutput}`);

    const after = await inspectAttentionAcceleration(settings, comfyRoot, installation);
    if (!after.ready) throw new Error(`安装后复检未通过：${after.detail}`);
    report(`环境复检通过：SageAttention ${after.sageAttentionVersion} · Triton ${after.tritonVersion}`);

    if (wasRunning) {
      report("正在重新启动 ComfyUI 并加载更新后的节点……");
      const health = await startComfyUi(settings);
      if (!(await waitForService(health))) {
        throw new Error("依赖安装成功，但 ComfyUI 在 2 分钟内没有恢复就绪。");
      }
      report("ComfyUI 已重新启动");
    }
    return {
      ok: true,
      message: "H3 推理加速环境已安装并通过 CUDA 自检。",
      log: log.join("\n")
    };
  } catch (error) {
    const processError = error as Error & { stdout?: string; stderr?: string };
    const details = [processError.message, processError.stdout, processError.stderr]
      .filter(Boolean).join("\n");
    report(details);
    if (wasRunning) {
      try {
        report("安装未完整结束，正在尝试恢复 ComfyUI……");
        const health = await startComfyUi(settings);
        await waitForService(health);
      } catch (recoveryError) {
        report(`恢复启动失败：${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}`);
      }
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      log: log.join("\n")
    };
  }
}

function workflowDependenciesFor(comfyRoot: string): WorkflowDependencyStatus[] {
  const target = comfyRoot
    ? path.join(comfyRoot, "user", "default", "workflows", "video_minimax_h3_i2v.json")
    : "";
  return [{
    id: "minimax_h3_i2v",
    name: "MiniMax H3 Image-to-Video 官方工作流",
    purpose: "安装到 ComfyUI 用户工作流目录，可在 ComfyUI 中打开并导出 API 格式。",
    installed: false,
    path: target,
    sourceUrl: minimaxH3I2vWorkflowUrl
  }];
}

async function scanWorkflowDependencies(
  comfyRoot: string
): Promise<WorkflowDependencyStatus[]> {
  return Promise.all(workflowDependenciesFor(comfyRoot).map(async (workflow) => ({
    ...workflow,
    installed: Boolean(workflow.path) && await exists(workflow.path)
  })));
}

export async function installWorkflowDependency(
  workflowId: WorkflowDependencyStatus["id"],
  settings: Settings
): Promise<{ ok: boolean; message: string; log?: string }> {
  if (workflowId !== "minimax_h3_i2v") {
    return { ok: false, message: "未知的工作流依赖，已拒绝安装。" };
  }
  const installLog = [proxyLogLabel(settings)];
  let temporaryFile = "";
  try {
    const comfyRoot = await findComfyRoot(settings);
    if (!comfyRoot) throw new Error("没有找到 ComfyUI 数据目录。");
    const workflow = workflowDependenciesFor(comfyRoot)[0];
    const targetDirectory = path.dirname(workflow.path);
    await fs.mkdir(targetDirectory, { recursive: true });
    temporaryFile = path.join(
      targetDirectory,
      `.video_minimax_h3_i2v-${crypto.randomUUID()}.download`
    );
    const curl = await findExecutable("curl.exe");
    if (!curl) throw new Error("没有找到 curl，无法下载官方工作流。");
    const args = ["-fL", "--retry", "2", "--connect-timeout", "20"];
    if (settings.proxyEnabled) {
      args.push("--proxy", normalizeProxyUrl(settings.proxyUrl));
    }
    args.push(workflow.sourceUrl, "--output", temporaryFile);
    const result = await execFileAsync(curl, args, {
      encoding: "utf8",
      timeout: 120_000,
      windowsHide: true,
      env: downloadEnvironment(settings)
    });
    installLog.push(`${result.stdout}${result.stderr}`.trim() || "官方工作流下载完成");
    const source = await fs.readFile(temporaryFile, "utf8");
    const parsed = JSON.parse(source) as unknown;
    if (!parsed || typeof parsed !== "object") {
      throw new Error("下载的工作流不是有效 JSON 对象。");
    }
    await fs.copyFile(temporaryFile, workflow.path);
    installLog.push(`已安装：${workflow.path}`);
    return {
      ok: true,
      message: "MiniMax H3 I2V 官方工作流已安装到 ComfyUI。",
      log: installLog.join("\n\n")
    };
  } catch (error) {
    installLog.push(error instanceof Error ? error.message : String(error));
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      log: installLog.join("\n\n")
    };
  } finally {
    if (temporaryFile) await fs.rm(temporaryFile, { force: true }).catch(() => undefined);
  }
}

export async function scanEnvironment(
  settings: Settings
): Promise<EnvironmentScanResult> {
  const userHome = os.homedir();
  const [comfyRoot, comfyInstallations] = await Promise.all([
    findComfyRoot(settings),
    discoverComfyInstallations(settings)
  ]);
  const comfyInstallationSummary =
    comfyInstallations.find((installation) => installation.selected) ??
    comfyInstallations[0];
  const comfyInstallation: ComfyInstallation | null = comfyInstallationSummary
    ? {
        type: comfyInstallationSummary.type,
        directory: comfyInstallationSummary.directory,
        sourceDirectory: comfyInstallationSummary.sourceDirectory,
        executable: comfyInstallationSummary.executable
      }
    : null;
  const directories = comfyRoot
    ? comfyDataDirectories(settings, comfyRoot)
    : {
        modelDirectory: settings.modelDirectory.trim(),
        outputDirectory: settings.outputDirectory.trim()
      };
  const modelDirectory = directories.modelDirectory;
  const outputDirectory = directories.outputDirectory;
  const modelFiles = await listModelFiles(modelDirectory);
  if (settings.promptModelDirectory.trim()) {
    const promptDirectory = path.resolve(settings.promptModelDirectory);
    if (promptDirectory.toLowerCase() !== path.resolve(modelDirectory).toLowerCase()) {
      const promptFiles = await listModelFiles(promptDirectory);
      modelFiles.push(...promptFiles.map((filename) => `prompt_models/${filename}`));
    }
  }
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
  const [customNodes, workflowDependencies, attentionAcceleration, llamaServer] = await Promise.all([
    scanCustomNodes(comfyRoot),
    scanWorkflowDependencies(comfyRoot),
    inspectAttentionAcceleration(settings, comfyRoot, comfyInstallation),
    scanLlamaServer(settings, comfyRoot)
  ]);
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
  const comfyCompatibility = await inspectComfyCompatibility(
    detectedComfyBaseUrl,
    comfyInstallation
  );
  const comfyHealthUrl = `${detectedComfyBaseUrl}/system_stats`;
  const lmStudioUrl = `${settings.lmStudioUrl.replace(/\/+$/, "")}/models`;
  const [
    nodeItem,
    gitItem,
    ffmpegItem,
    nvidiaProbe,
    comfyEnvironmentItem,
    comfyApiItem,
    lmStudioEnvironmentItem,
    lmStudioApiItem
  ] = await Promise.all([
    commandItem("node", "Node.js", "node.exe", ["--version"]),
    commandItem("git", "Git", "git.exe", ["--version"], true),
    commandItem("ffmpeg", "FFmpeg", "ffmpeg.exe", ["-version"], true),
    nvidiaItem(),
    Promise.resolve(comfyItem),
    localServiceItem("comfyui-api", "ComfyUI 服务", comfyHealthUrl),
    lmStudioItem(settings),
    localServiceItem("lmstudio-api", "LM Studio 服务", lmStudioUrl)
  ]);
  const items = [
    nodeItem,
    gitItem,
    ffmpegItem,
    nvidiaProbe.item,
    comfyEnvironmentItem,
    comfyApiItem,
    lmStudioEnvironmentItem,
    lmStudioApiItem
  ];

  return {
    scannedAt: new Date().toISOString(),
    userHome,
    comfyRoot,
    comfyUrl: detectedComfyBaseUrl,
    comfyInstallDirectory: comfyInstallation?.directory ?? "",
    comfySourceDirectory: comfyInstallation?.sourceDirectory ?? "",
    comfyInstallType: comfyInstallation?.type ?? "",
    comfyInstallations,
    gpus: nvidiaProbe.devices,
    modelDirectory,
    outputDirectory,
    llamaServer,
    comfyCompatibility,
    attentionAcceleration,
    items,
    modelProfiles,
    customNodes,
    workflowDependencies,
    issues
  };
}
