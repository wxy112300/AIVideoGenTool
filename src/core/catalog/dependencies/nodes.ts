import type { CatalogCustomNodeDefinition } from "./types.js";

export const SPECTRUM_MINIMUM_VERSION = "0.2.1";
export const SPECTRUM_TURBO_MINIMUM_VERSION = "0.2.6";
export const SPECTRUM_MODEL_AWARE_MINIMUM_VERSION = "0.2.7";
export const SPECTRUM_RECOMMENDED_VERSION = "0.2.15";
export const MINIMAX_H3_PROMPT_WRITER_MINIMUM_VERSION = "0.3.1";
export const MINIMAX_H3_PROMPT_WRITER_RECOMMENDED_VERSION = "0.3.2";
export const MULTIMODAL_PROMPT_NODES_MINIMUM_VERSION = "1.0.15";
export const H3_MOTION_CONTEXT_MINIMUM_VERSION = "0.3.1";
export const H3_MOTION_CONTEXT_RECOMMENDED_VERSION = "0.3.1";

export const customNodeCatalog: readonly CatalogCustomNodeDefinition[] = [{
  id: "inpaint-nodes",
  name: "ComfyUI Inpaint Nodes",
  purpose: "加载 LaMa 局部修补模型、扩张 Mask 并移除目标",
  repositoryUrl: "https://github.com/Acly/comfyui-inpaint-nodes.git",
  directoryName: "comfyui-inpaint-nodes",
  aliases: ["comfyui-inpaint-nodes"],
  releaseSource: "github-release",
  nodeTypes: ["INPAINT_LoadInpaintModel", "INPAINT_ExpandMask", "INPAINT_InpaintWithModel"],
  required: false
}, {
  id: "inpaint-cropandstitch",
  name: "ComfyUI Inpaint Crop & Stitch",
  purpose: "按 Mask 裁剪局部上下文，供 Qwen 重绘后无缝拼回原图",
  repositoryUrl: "https://github.com/lquesada/ComfyUI-Inpaint-CropAndStitch.git",
  directoryName: "ComfyUI-Inpaint-CropAndStitch",
  aliases: ["comfyui-inpaint-cropandstitch", "ComfyUI-Inpaint-CropAndStitch", "comfyui-crop-and-stitch"],
  releaseSource: "github-release",
  nodeTypes: ["InpaintCropImproved", "InpaintStitchImproved"],
  required: false
}, {
  id: "comfyui-gguf",
  name: "ComfyUI-GGUF",
  purpose: "加载 Remix、SmoothMix、Wan 和 Sulphur 等历史 GGUF 视频模型",
  repositoryUrl: "https://github.com/city96/ComfyUI-GGUF.git",
  directoryName: "ComfyUI-GGUF",
  aliases: ["comfyui-gguf"],
  releaseSource: "github-release",
  nodeTypes: ["UnetLoaderGGUFAdvanced", "CLIPLoaderGGUF"],
  required: true
}, {
  id: "comfyui-gguf-h3",
  name: "ComfyUI-GGUF H3",
  purpose: "为 MiniMax H3 Q3 3080 实验档加载 H3 GGUF 扩散模型和文本编码器",
  repositoryUrl: "https://github.com/molbal/ComfyUI-GGUF.git",
  directoryName: "ComfyUI-GGUF-H3",
  aliases: ["comfyui-gguf-h3"],
  releaseSource: "github-release",
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
  releaseSource: "github-release",
  nodeTypes: [
    "VHS_LoadVideo",
    "VHS_LoadVideoFFmpeg",
    "VHS_VideoCombine",
    "VHS_VideoInfoSource",
    "VHS_BatchManager"
  ],
  required: true
}, {
  id: "ltx-video",
  name: "ComfyUI-LTXVideo",
  purpose: "Sulphur 2 原生视频续写、低显存加载与分阶段卸载",
  repositoryUrl: "https://github.com/Lightricks/ComfyUI-LTXVideo.git",
  directoryName: "ComfyUI-LTXVideo",
  aliases: ["comfyui-ltxvideo"],
  releaseSource: "github-release",
  nodeTypes: ["LTXVExtendSampler", "LTXVSpatioTemporalTiledVAEDecode"],
  required: false
}, {
  id: "seedvr2",
  name: "SeedVR2 Video Upscaler",
  purpose: "SeedVR2 视频超分工作流",
  repositoryUrl: "https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler.git",
  directoryName: "ComfyUI-SeedVR2_VideoUpscaler",
  aliases: ["comfyui-seedvr2_videoupscaler", "seedvr2_videoupscaler"],
  releaseSource: "github-release",
  nodeTypes: ["SeedVR2LoadDiTModel", "SeedVR2LoadVAEModel", "SeedVR2VideoUpscaler"],
  minimumVersion: "2.5.24",
  recommendedVersion: "2.5.24",
  required: true
}, {
  id: "flashvsr",
  name: "ComfyUI-FlashVSR",
  purpose: "FlashVSR 视频超分工作流",
  repositoryUrl: "https://github.com/1038lab/ComfyUI-FlashVSR.git",
  directoryName: "ComfyUI-FlashVSR",
  aliases: ["comfyui-flashvsr"],
  releaseSource: "github-release",
  nodeTypes: ["AILab_FlashVSR"],
  required: true
}, {
  id: "kjnodes",
  name: "ComfyUI-KJNodes",
  purpose: "模型补丁、显存调试与 MiniMax H3 TAE 实时预览",
  repositoryUrl: "https://github.com/kijai/ComfyUI-KJNodes.git",
  directoryName: "comfyui-kjnodes",
  aliases: ["comfyui-kjnodes"],
  releaseSource: "github-release",
  nodeTypes: ["VRAM_Debug", "PathchSageAttentionKJ"],
  features: [{
    id: "h3-sage-attention",
    name: "H3 SageAttention",
    nodeTypes: ["PathchSageAttentionKJ"],
    description: "仅在 H3 Attention 选择 SageAttention 时需要。"
  }, {
    id: "h3-live-preview",
    name: "H3 TAE 实时预览",
    nodeTypes: ["ModelPreviewOverrideKJ"],
    description: "仅在启用 H3 实时预览时尝试使用；缺少时预览自动降级，不阻塞生成。"
  }, {
    id: "vram-debug",
    name: "显存调试",
    nodeTypes: ["VRAM_Debug"],
    description: "用于运行统计与显存调试，不是生成必需节点。"
  }],
  required: false
}, {
  id: "frame-interpolation",
  name: "ComfyUI Frame Interpolation",
  purpose: "使用 RIFE/FILM 将快速模式生成帧插值到 24 或 30 FPS",
  repositoryUrl: "https://github.com/Fannovel16/ComfyUI-Frame-Interpolation.git",
  directoryName: "ComfyUI-Frame-Interpolation",
  aliases: ["comfyui-frame-interpolation"],
  releaseSource: "github-release",
  nodeTypes: ["RIFE VFI"],
  required: false
}, {
  id: "comfyui-multimodal-prompt-nodes",
  name: "ComfyUI MultiModal Prompt Nodes",
  purpose: "在 ComfyUI 内运行 Qwen3.6/Qwen3.8 GGUF 与 vision 投影文件，按参考图片和文字生成提示词",
  repositoryUrl: "https://github.com/kantan-kanto/ComfyUI-MultiModal-Prompt-Nodes.git",
  directoryName: "ComfyUI-MultiModal-Prompt-Nodes",
  aliases: ["comfyui-multimodal-prompt-nodes", "ComfyUI-MultiModal-Prompt-Nodes"],
  releaseSource: "github-release",
  nodeTypes: ["VisionLLMNode"],
  minimumVersion: MULTIMODAL_PROMPT_NODES_MINIMUM_VERSION,
  runtimeRequirement: "可选节点：Qwen3.6/Qwen3.8 vision 与 Gemma Prompt Writer 共用固定的 JamePeng llama-cpp-python GPU 后端；Windows 使用预编译 wheel，不需要另装 CUDA Toolkit、Visual Studio 或 llama-server。支持 Python 3.10–3.14 和已登记的 CUDA 12/13 组合，安装后必须通过 CUDA 自检。",
  required: false
}, {
  id: "minimax-h3-prompt-writer",
  name: "MiniMax H3 Prompt Writer",
  purpose: "在 ComfyUI 内运行 Gemma 4，多模态理解素材并生成 H3 官方格式提示词",
  repositoryUrl: "https://github.com/duckyshell/ComfyUI-MiniMaxH3-Prompt-Writer.git",
  directoryName: "ComfyUI-MiniMaxH3-Prompt-Writer",
  aliases: ["comfyui-minimaxh3-prompt-writer"],
  releaseSource: "github-release",
  runtimeEndpoint: "/h3studio/status",
  minimumVersion: MINIMAX_H3_PROMPT_WRITER_MINIMUM_VERSION,
  recommendedVersion: MINIMAX_H3_PROMPT_WRITER_RECOMMENDED_VERSION,
  compatibilityEvidence: [{
    verifiedAt: "2026-08-17",
    sourceUrl: "https://github.com/duckyshell/ComfyUI-MiniMaxH3-Prompt-Writer",
    note: "0.3.2 的 GGUF 适配与当前 Prompt Writer 安装器兼容；本项目只记录静态/API 证据，不把社区版本当作运行通过。",
    commit: "0.3.2",
    checks: ["static", "object-info"]
  }],
  runtimeRequirement: "上游 0.3.2 的 Direct GGUF 依赖由本应用统一安装；Gemma GGUF 需要当前 ComfyUI Python 中的共享 llama-cpp-python CUDA 后端。更新节点不会覆盖已通过自检的后端；请在设置 → 提示词扩展的运行依赖卡片中一键安装和自检，不要重复安装第二个版本。",
  required: false
}, {
  id: "h3-motion-context",
  name: "H3 Motion Context",
  purpose: "让 H3 R2V 续写继承上一段的运动方向、速度和 32 kHz 音频，并保存 latent 供下一次无损接续",
  repositoryUrl: "https://github.com/NikoDemon80/ComfyUI-H3-Motion-Context.git",
  directoryName: "ComfyUI-H3-Motion-Context",
  aliases: ["comfyui-h3-motion-context"],
  releaseSource: "github-release",
  nodeTypes: [
    "MiniMaxH3MotionContext",
    "MiniMaxH3MotionContextTrim",
    "MiniMaxH3MotionContextSaveLatent",
    "MiniMaxH3MotionContextLoadLatent"
  ],
  minimumVersion: H3_MOTION_CONTEXT_MINIMUM_VERSION,
  recommendedVersion: H3_MOTION_CONTEXT_RECOMMENDED_VERSION,
  latestVersion: H3_MOTION_CONTEXT_RECOMMENDED_VERSION,
  compatibilityEvidence: [{
    verifiedAt: "2026-08-18",
    sourceUrl: "https://github.com/NikoDemon80/ComfyUI-H3-Motion-Context",
    note: "v0.3.1 同时兼容 ComfyUI 0.32/0.33 的 H3 layout；修复 ComfyUI 0.33 的 PackedLayout frame_count 变化，并保留 Ref2VA 音频 latent。",
    comfyUi: "0.33.1",
    commit: "725a731",
    workflowIds: ["minimax_h3_r2v"],
    checks: ["static", "object-info"]
  }],
  required: false
}, {
  id: "spectrum-minimax-h3",
  name: "Spectrum MiniMax H3",
  purpose: "预测部分 H3 采样步骤；支持标准 FL2VA / R2V、LightX2V Turbo，并在推荐版本上可选互操作 H3 Continuum",
  repositoryUrl: "https://github.com/xmarre/ComfyUI-Spectrum-MiniMax-H3.git",
  directoryName: "ComfyUI-Spectrum-MiniMax-H3",
  aliases: ["comfyui-spectrum-minimax-h3"],
  releaseSource: "github-release",
  nodeTypes: ["SpectrumApplyMiniMaxH3"],
  minimumVersion: SPECTRUM_MINIMUM_VERSION,
  recommendedVersion: SPECTRUM_RECOMMENDED_VERSION,
  compatibilityEvidence: [{
    verifiedAt: "2026-08-17",
    sourceUrl: "https://github.com/xmarre/ComfyUI-Spectrum-MiniMax-H3",
    note: "Spectrum 的最低版本、Turbo 共存和 model_aware_mode 约束已纳入本项目工作流基线；推荐版本不是硬性最低版本。",
    comfyUi: "0.33.1",
    workflowIds: ["minimax_h3_i2v", "minimax_h3_r2v"],
    checks: ["static"]
  }],
  required: false
}];

export function customNodeDefinition(id: string): CatalogCustomNodeDefinition | undefined {
  return customNodeCatalog.find((definition) => definition.id === id);
}
