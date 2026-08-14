import type { CatalogCustomNodeDefinition } from "./types.js";

export const SPECTRUM_MINIMUM_VERSION = "0.2.1";
export const SPECTRUM_TURBO_MINIMUM_VERSION = "0.2.6";
export const SPECTRUM_MODEL_AWARE_MINIMUM_VERSION = "0.2.7";
export const SPECTRUM_RECOMMENDED_VERSION = "0.2.7";
export const MINIMAX_H3_PROMPT_WRITER_MINIMUM_VERSION = "0.3.1";
export const MULTIMODAL_PROMPT_NODES_MINIMUM_VERSION = "1.0.15";

export const customNodeCatalog: readonly CatalogCustomNodeDefinition[] = [{
  id: "inpaint-nodes",
  name: "ComfyUI Inpaint Nodes",
  purpose: "加载 LaMa 局部修补模型、扩张 Mask 并移除目标",
  repositoryUrl: "https://github.com/Acly/comfyui-inpaint-nodes.git",
  directoryName: "comfyui-inpaint-nodes",
  aliases: ["comfyui-inpaint-nodes"],
  nodeTypes: ["INPAINT_LoadInpaintModel", "INPAINT_ExpandMask", "INPAINT_InpaintWithModel"],
  required: false
}, {
  id: "inpaint-cropandstitch",
  name: "ComfyUI Inpaint Crop & Stitch",
  purpose: "按 Mask 裁剪局部上下文，供 Qwen 重绘后无缝拼回原图",
  repositoryUrl: "https://github.com/lquesada/ComfyUI-Inpaint-CropAndStitch.git",
  directoryName: "ComfyUI-Inpaint-CropAndStitch",
  aliases: ["comfyui-inpaint-cropandstitch", "ComfyUI-Inpaint-CropAndStitch", "comfyui-crop-and-stitch"],
  nodeTypes: ["InpaintCropImproved", "InpaintStitchImproved"],
  required: false
}, {
  id: "comfyui-gguf",
  name: "ComfyUI-GGUF",
  purpose: "加载 Remix、SmoothMix、Wan 和 Sulphur 等历史 GGUF 视频模型",
  repositoryUrl: "https://github.com/city96/ComfyUI-GGUF.git",
  directoryName: "ComfyUI-GGUF",
  aliases: ["comfyui-gguf"],
  nodeTypes: ["UnetLoaderGGUFAdvanced", "CLIPLoaderGGUF"],
  required: true
}, {
  id: "comfyui-gguf-h3",
  name: "ComfyUI-GGUF H3",
  purpose: "为 MiniMax H3 Q3 3080 实验档加载 H3 GGUF 扩散模型和文本编码器",
  repositoryUrl: "https://github.com/molbal/ComfyUI-GGUF.git",
  directoryName: "ComfyUI-GGUF-H3",
  aliases: ["comfyui-gguf-h3"],
  nodeTypes: ["H3UnetLoaderGGUFAdvanced", "H3CLIPLoaderGGUF"],
  runtimeRequirement: "只注册 H3 专用 loader 名称，与通用 ComfyUI-GGUF 并存；Q3_K 扩散模型仍需 CPU/RAM offload。",
  required: false
}, {
  id: "video-helper-suite",
  name: "VideoHelperSuite",
  purpose: "视频读取、合成、编码和音频封装",
  repositoryUrl: "https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git",
  directoryName: "comfyui-videohelpersuite",
  aliases: ["comfyui-videohelpersuite"],
  nodeTypes: ["VHS_LoadVideo", "VHS_VideoCombine", "VHS_BatchManager"],
  required: true
}, {
  id: "ltx-video",
  name: "ComfyUI-LTXVideo",
  purpose: "Sulphur 2 原生视频续写、低显存加载与分阶段卸载",
  repositoryUrl: "https://github.com/Lightricks/ComfyUI-LTXVideo.git",
  directoryName: "ComfyUI-LTXVideo",
  aliases: ["comfyui-ltxvideo"],
  nodeTypes: ["LTXVExtendSampler", "LTXVSpatioTemporalTiledVAEDecode"],
  required: false
}, {
  id: "seedvr2",
  name: "SeedVR2 Video Upscaler",
  purpose: "SeedVR2 视频超分工作流",
  repositoryUrl: "https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler.git",
  directoryName: "ComfyUI-SeedVR2_VideoUpscaler",
  aliases: ["comfyui-seedvr2_videoupscaler", "seedvr2_videoupscaler"],
  nodeTypes: ["SeedVR2LoadDiTModel", "SeedVR2LoadVAEModel", "SeedVR2VideoUpscaler"],
  minimumVersion: "2.5.24",
  required: true
}, {
  id: "flashvsr",
  name: "ComfyUI-FlashVSR",
  purpose: "FlashVSR 视频超分工作流",
  repositoryUrl: "https://github.com/1038lab/ComfyUI-FlashVSR.git",
  directoryName: "ComfyUI-FlashVSR",
  aliases: ["comfyui-flashvsr"],
  nodeTypes: ["AILab_FlashVSR"],
  required: true
}, {
  id: "kjnodes",
  name: "ComfyUI-KJNodes",
  purpose: "模型补丁、显存调试与 MiniMax H3 TAE 实时预览",
  repositoryUrl: "https://github.com/kijai/ComfyUI-KJNodes.git",
  directoryName: "comfyui-kjnodes",
  aliases: ["comfyui-kjnodes"],
  nodeTypes: ["VRAM_Debug", "PathchSageAttentionKJ"],
  required: true
}, {
  id: "frame-interpolation",
  name: "ComfyUI Frame Interpolation",
  purpose: "使用 RIFE/FILM 将快速模式生成帧插值到 24 或 30 FPS",
  repositoryUrl: "https://github.com/Fannovel16/ComfyUI-Frame-Interpolation.git",
  directoryName: "ComfyUI-Frame-Interpolation",
  aliases: ["comfyui-frame-interpolation"],
  nodeTypes: ["RIFE VFI"],
  required: false
}, {
  id: "comfyui-multimodal-prompt-nodes",
  name: "ComfyUI MultiModal Prompt Nodes",
  purpose: "在 ComfyUI 内运行 Qwen3.6 GGUF 与 mmproj，按参考图片和文字生成提示词",
  repositoryUrl: "https://github.com/kantan-kanto/ComfyUI-MultiModal-Prompt-Nodes.git",
  directoryName: "ComfyUI-MultiModal-Prompt-Nodes",
  aliases: ["comfyui-multimodal-prompt-nodes", "ComfyUI-MultiModal-Prompt-Nodes"],
  nodeTypes: ["VisionLLMNode"],
  minimumVersion: MULTIMODAL_PROMPT_NODES_MINIMUM_VERSION,
  runtimeRequirement: "可选节点：Qwen3.6 vision 与 Gemma Prompt Writer 共用固定的 JamePeng llama-cpp-python GPU 后端；Windows 使用预编译 wheel，不需要另装 CUDA Toolkit、Visual Studio 或 llama-server。支持 Python 3.10–3.14 和已登记的 CUDA 12/13 组合，安装后必须通过 CUDA 自检。",
  required: false
}, {
  id: "minimax-h3-prompt-writer",
  name: "MiniMax H3 Prompt Writer",
  purpose: "在 ComfyUI 内运行 Gemma 4，多模态理解素材并生成 H3 官方格式提示词",
  repositoryUrl: "https://github.com/duckyshell/ComfyUI-MiniMaxH3-Prompt-Writer.git",
  directoryName: "ComfyUI-MiniMaxH3-Prompt-Writer",
  aliases: ["comfyui-minimaxh3-prompt-writer"],
  runtimeEndpoint: "/h3studio/status",
  minimumVersion: MINIMAX_H3_PROMPT_WRITER_MINIMUM_VERSION,
  runtimeRequirement: "Gemma GGUF 需要当前 ComfyUI Python 中的 llama-cpp-python CUDA 后端；请在设置 → 提示词扩展的运行依赖卡片中一键安装和自检，不要重复安装第二个版本。",
  required: false
}, {
  id: "h3-motion-context",
  name: "H3 Motion Context",
  purpose: "让 H3 R2V 续写继承上一段的运动方向、速度和 32 kHz 音频，并保存 latent 供下一次无损接续",
  repositoryUrl: "https://github.com/NikoDemon80/ComfyUI-H3-Motion-Context.git",
  directoryName: "ComfyUI-H3-Motion-Context",
  aliases: ["comfyui-h3-motion-context"],
  nodeTypes: [
    "MiniMaxH3MotionContext",
    "MiniMaxH3MotionContextTrim",
    "MiniMaxH3MotionContextSaveLatent",
    "MiniMaxH3MotionContextLoadLatent"
  ],
  required: false
}, {
  id: "spectrum-minimax-h3",
  name: "Spectrum MiniMax H3",
  purpose: "预测部分 H3 采样步骤；支持标准 FL2VA / R2V，并在推荐版本上支持 LightX2V Turbo",
  repositoryUrl: "https://github.com/xmarre/ComfyUI-Spectrum-MiniMax-H3.git",
  directoryName: "ComfyUI-Spectrum-MiniMax-H3",
  aliases: ["comfyui-spectrum-minimax-h3"],
  nodeTypes: ["SpectrumApplyMiniMaxH3"],
  minimumVersion: SPECTRUM_MINIMUM_VERSION,
  recommendedVersion: SPECTRUM_RECOMMENDED_VERSION,
  required: false
}];

export function customNodeDefinition(id: string): CatalogCustomNodeDefinition | undefined {
  return customNodeCatalog.find((definition) => definition.id === id);
}
