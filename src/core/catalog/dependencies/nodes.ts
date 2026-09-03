import type { CatalogCustomNodeDefinition } from "./types.js";

export const SPECTRUM_MINIMUM_VERSION = "0.2.1";
export const SPECTRUM_TURBO_MINIMUM_VERSION = "0.2.6";
export const SPECTRUM_MODEL_AWARE_MINIMUM_VERSION = "0.2.7";
export const SPECTRUM_RECOMMENDED_VERSION = "0.2.23";
export const MINIMAX_H3_PROMPT_WRITER_MINIMUM_VERSION = "0.3.1";
export const MINIMAX_H3_PROMPT_WRITER_RECOMMENDED_VERSION = "0.4.1";
export const MULTIMODAL_PROMPT_NODES_MINIMUM_VERSION = "1.0.15";
export const H3_MOTION_CONTEXT_MINIMUM_VERSION = "0.3.1";
export const H3_MOTION_CONTEXT_RECOMMENDED_VERSION = "0.5.1";
export const H3_MOTION_CONTEXT_RECOMMENDED_COMFYUI_VERSION = "0.34.0";
export const H3_SLA_ATTENTION_MINIMUM_VERSION = "1.3.8";
export const H3_SLA_ATTENTION_RECOMMENDED_VERSION = "1.3.8";
export const H3_MEMORY_MINIMUM_VERSION = "0.2.16";
export const H3_MEMORY_RECOMMENDED_VERSION = "0.2.20";
export const H3_MEMORY_LATEST_VERSION = H3_MEMORY_RECOMMENDED_VERSION;
export const H3_MEMORY_UPSTREAM_COMMIT = "e15f6534bb5841ff4e6a92ea5f9b42fca0e32746";
export const H3_LATENT_UPSCALER_REVISION = "a5ed6e9586f0b14250a0018f78568e0076e4bd9d";
export const H3_ULTIMATE_UPSCALE_REVISION = "d91be5ac41797a3789b4765cdb6eb6d9129a4a4d";
export const H3_AV_SERIALIZER_REVISION = "0.2.3";
export const H3_CONTINUUM_MINIMUM_VERSION = "3.6.0";
export const H3_CONTINUUM_RECOMMENDED_VERSION = "3.7.0";
export const H3_CONTINUUM_REVISION = "fe4ff9c20c2cc8bb375625d1534f5673a737d1be";

const customNodeDefinitions: CatalogCustomNodeDefinition[] = [{
  id: "inpaint-nodes",
  priority: 90,
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
  priority: 100,
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
  priority: 20,
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
  priority: 170,
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
  priority: 10,
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
  priority: 40,
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
  priority: 110,
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
  priority: 120,
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
  priority: 30,
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
  priority: 130,
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
  priority: 70,
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
  id: "comfyui-qwenvl-lora",
  priority: 80,
  name: "ComfyUI Qwen-VL LoRA",
  purpose: "在 ComfyUI 内加载 Qwen3-VL 基座与 PEFT Prompt LoRA，输出 H3 提示词文本",
  repositoryUrl: "https://github.com/Dangocan/comfyui_qwenvl_lora.git",
  directoryName: "comfyui_qwenvl_lora",
  aliases: ["comfyui-qwenvl-lora", "comfyui_qwenvl_lora"],
  releaseSource: "github-release",
  nodeTypes: ["QwenVLModelLoader", "QwenVLLoRALoader", "QwenVLCaption"],
  runtimeRequirement: "需要当前 ComfyUI Python 中的 transformers、peft、accelerate、safetensors、Pillow 和 bitsandbytes；4090 建议 4-bit + SDPA。显式启动后模型会在连续扩写期间驻留，并在手动退出、开始队列或关闭应用时释放。",
  compatibilityEvidence: [{
    verifiedAt: "2026-08-19",
    sourceUrl: "https://github.com/Dangocan/comfyui_qwenvl_lora",
    note: "节点提供 Qwen-VL Model Loader、Qwen-VL LoRA Loader 与 Qwen-VL Caption；当前条目用于 Qwen3-VL-8B-Instruct + MiniMax H3 Prompt Rewriter LoRA 的工作流。",
    checks: ["static", "object-info"]
  }],
  required: false
}, {
  id: "minimax-h3-prompt-writer",
  priority: 50,
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
    verifiedAt: "2026-08-26",
    sourceUrl: "https://github.com/duckyshell/ComfyUI-MiniMaxH3-Prompt-Writer",
    note: "0.4.1 包含非 Thinking 输出预算、Direct GGUF 卸载和 Windows 运行时兼容修复；本项目只记录静态/API 证据，不把社区版本当作运行通过。",
    commit: "0.4.1",
    checks: ["static", "object-info"]
  }],
  runtimeRequirement: "上游 0.4.1+ 的 Direct GGUF 依赖由本应用统一安装；Gemma GGUF 需要当前 ComfyUI Python 中的 llama-cpp-python CUDA 后端。旧版 0.3.x 可通过应用修复流程回补输出预算与卸载兼容层。更新节点不会覆盖已通过自检的后端；请在设置 → 节点与依赖中安装或重装/修复，不要重复安装第二个版本。",
  required: false
}, {
  id: "h3-motion-context",
  priority: 140,
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
  runtimeRequirement: "推荐 v0.5.1（包含 v0.5.0 的核心升级）需要 ComfyUI 0.34.0+；ComfyUI 0.32/0.33 继续保留 v0.3.1 回退线。v0.5 的 Chain 仅用于手工画布串联，本应用 API workflow 不依赖它；安装或更新后必须重启所选 ComfyUI，并通过 /object_info 与最小真实 H3 续写复检。",
  compatibilityEvidence: [{
    verifiedAt: "2026-09-03",
    sourceUrl: "https://github.com/NikoDemon80/ComfyUI-H3-Motion-Context/releases/tag/v0.5.1",
    note: "v0.5.1 是 v0.5.0 核心升级后的补充发布，更新官方 example workflow；仍要求 ComfyUI 0.34.0+。本应用 API workflow 不依赖上游示例图，因此不改变现有四个基础节点、显式正数 slot 或 Chain 不参与应用执行的判断。本条是上游发布与静态证据，不代表本机 object-info 或真实 smoke 已通过。",
    comfyUi: H3_MOTION_CONTEXT_RECOMMENDED_COMFYUI_VERSION,
    commit: "429e952",
    workflowIds: ["minimax_h3_r2v_extend_api"],
    checks: ["static"]
  }, {
    verifiedAt: "2026-09-03",
    sourceUrl: "https://github.com/NikoDemon80/ComfyUI-H3-Motion-Context/releases/tag/v0.5.0",
    note: "v0.5.0 要求 ComfyUI 0.34.0+，改用原生 H3 keyframe layout contract，不再修改 ComfyUI 的 layout/payload；Load 0 表示首个 clip 的无 context，新增 Chain 用于画布中的 Load/Save 槽位顺序。本应用 API workflow 仍使用四个基础节点和显式正数 slot，不依赖 Chain。本条是上游发布与静态证据，不代表本机 object-info 或真实 smoke 已通过。",
    comfyUi: H3_MOTION_CONTEXT_RECOMMENDED_COMFYUI_VERSION,
    commit: "6a8267e",
    workflowIds: ["minimax_h3_r2v_extend_api"],
    checks: ["static"]
  }, {
    verifiedAt: "2026-08-18",
    sourceUrl: "https://github.com/NikoDemon80/ComfyUI-H3-Motion-Context",
    note: "v0.3.1 作为 ComfyUI 0.32/0.33 的回退线，兼容旧 H3 layout；修复 ComfyUI 0.33 的 PackedLayout frame_count 变化，并保留 Ref2VA 音频 latent。",
    comfyUi: "0.33.1",
    commit: "725a731",
    workflowIds: ["minimax_h3_r2v"],
    checks: ["static", "object-info"]
  }],
  required: false
}, {
  id: "h3-continuum",
  priority: 142,
  name: "ComfyUI H3 Continuum",
  purpose: "使用 H3 原生 AV latent 连续采样、分块长视频和可恢复续写；后续用于 History JointAV Extend",
  repositoryUrl: "https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum.git",
  directoryName: "ComfyUI-H3-Continuum",
  aliases: ["ComfyUI-H3-Continuum", "comfyui-h3-continuum"],
  releaseSource: "github-release",
  installRevision: H3_CONTINUUM_REVISION,
  license: "MIT",
  nodeTypes: [
    "H3ContinuumSamplerV3",
    "H3ContinuumAdvancedV3",
    "H3ContinuumAssembleV3",
    "H3ContinuumJoin",
    "H3ContinuumFinish",
    "H3ContinuumSaveState",
    "H3ContinuumLoadState"
  ],
  minimumVersion: H3_CONTINUUM_MINIMUM_VERSION,
  recommendedVersion: H3_CONTINUUM_RECOMMENDED_VERSION,
  latestVersion: H3_CONTINUUM_RECOMMENDED_VERSION,
  bulkInstall: false,
  appInstallable: true,
  runtimeRequirement: "要求 ComfyUI >=0.32.0；当前固定 v3.7.0。节点包无额外 Python 依赖，但安装后必须重启所选 ComfyUI，并通过 /object_info 和真实 H3 smoke 验证；文件安装成功不等于 Native Masked AV 可运行。",
  compatibilityEvidence: [{
    verifiedAt: "2026-09-03",
    sourceUrl: "https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/releases/tag/v3.7.0",
    note: "v3.7.0 发布包包含 V3 sampler、Advanced、Assemble 以及可恢复 state 节点；上游发布页声明 ComfyUI 0.34.2 runtime verification。本条只记录上游静态发布证据，不代表本机运行已通过。",
    comfyUi: "0.34.2",
    commit: H3_CONTINUUM_REVISION,
    checks: ["static"]
  }],
  required: false
}, {
  id: "plaguekind-h3-sla",
  priority: 160,
  name: "ComfyUI-PlagueKind H3 SLA Attention",
  purpose: "为 MiniMax H3 Turbo-SLA LoRA 提供块稀疏注意力；选择 Turbo-SLA 后由应用自动插入。",
  repositoryUrl: "https://github.com/PlagueKind/ComfyUI-PlagueKind-Nodes.git",
  directoryName: "ComfyUI-PlagueKind-Nodes",
  aliases: ["comfyui-plaguekind-nodes", "ComfyUI-PlagueKind-Nodes"],
  releaseSource: "github-release",
  nodeTypes: ["H3SLAAttention"],
  minimumVersion: H3_SLA_ATTENTION_MINIMUM_VERSION,
  recommendedVersion: H3_SLA_ATTENTION_RECOMMENDED_VERSION,
  latestVersion: H3_SLA_ATTENTION_RECOMMENDED_VERSION,
  features: [{
    id: "h3-sla-attention",
    name: "H3 SLA Attention",
    nodeTypes: ["H3SLAAttention"],
    description: "仅在创建页选择 MiniMax H3 Turbo-SLA 时使用；应用会自动插入，不提供独立开关。"
  }],
  compatibilityEvidence: [{
    verifiedAt: "2026-08-26",
    sourceUrl: "https://github.com/PlagueKind/ComfyUI-PlagueKind-Nodes",
    note: "H3SLAAttention 来自 ComfyUI-H3-SLA-Attention；节点通过 comfy_api.latest 注册，导入或运行环境不兼容时会安全回退到 dense。",
    checks: ["static"]
  }],
  runtimeRequirement: "需要支持 comfy_api.latest 的 ComfyUI。当前应用为 H3 Turbo-SLA 固定 block_size 64、sparsity 0.85、保护音频，并在 Triton、显卡或接口不兼容时允许 dense 回退；回退时不会获得稀疏加速。",
  required: false
}, {
  id: "h3-optimizations",
  priority: 155,
  name: "H3 Optimizations",
  purpose: "为 MiniMax H3 提供可选的 QKV streaming、MLP chunking 和精度策略节点",
  repositoryUrl: "https://github.com/Zironic/H3-Optimizations.git",
  directoryName: "H3-Optimizations",
  aliases: ["h3-optimizations", "H3-Optimizations", "h3_optimizations"],
  nodeTypes: ["H3MemoryOptimization"],
  minimumVersion: H3_MEMORY_MINIMUM_VERSION,
  recommendedVersion: H3_MEMORY_RECOMMENDED_VERSION,
  latestVersion: H3_MEMORY_LATEST_VERSION,
  bulkInstall: false,
  appInstallable: true,
  runtimeRequirement: "可选观察项，当前不参与应用工作流或批量安装；可手动安装以跟踪上游更新。上游声明 ComfyUI >=0.33.0、Python >=3.10。",
  features: [{
    id: "h3-memory-optimization",
    name: "H3 Memory Optimization",
    nodeTypes: ["H3MemoryOptimization"],
    description: "当前产品功能已隐藏并强制关闭；保留安装入口仅用于观察上游兼容性更新。"
  }],
  compatibilityEvidence: [{
    verifiedAt: "2026-08-27",
    sourceUrl: "https://github.com/Zironic/H3-Optimizations",
    note: "静态复核上游 main 的 pyproject.toml（version 0.2.20）与当前发布提交：H3MemoryOptimization 输出 MODEL，提供 precision_mode、qkv_streaming_mode、mlp_memory、chunk_rows 及 legacy hidden inputs。GitHub Releases 当前没有独立条目，因此 Settings 的 latestVersion 跟随上游发布版本；commit 仅作证据。应用按用户显式安装请求直接获取上游节点代码，不内置源码或二进制。",
    comfyUi: ">=0.33.0",
    python: ">=3.10",
    commit: H3_MEMORY_UPSTREAM_COMMIT,
    checks: ["static"]
  }],
  required: false
}, {
  id: "h3-latent-upscaler",
  priority: 145,
  name: "ComfyUI H3 Latent Upscaler",
  purpose: "拆分/拼接 H3 joint AV latent，并分别处理二次采样的 video/audio noise 与 sigma",
  repositoryUrl: "https://github.com/rockerBOO/h3-latent-upscaler.git",
  directoryName: "h3-latent-upscaler",
  aliases: ["h3-latent-upscaler", "ComfyUI-H3-Latent-Upscaler"],
  installRevision: H3_LATENT_UPSCALER_REVISION,
  license: "GPL-3.0",
  nodeTypes: [
    "MiniMaxH3LatentUpscale",
    "MiniMaxH3ConditioningUpscale",
    "MiniMaxH3AddNoise",
    "MiniMaxH3ShiftSigmas"
  ],
  runtimeRequirement: "仅作为 H3 二次采样的受管外部节点安装；必须固定到登记 commit，并在 ComfyUI /object_info 与真实 workflow smoke 中分别验证。",
  compatibilityEvidence: [{
    verifiedAt: "2026-09-03",
    sourceUrl: "https://github.com/rockerBOO/h3-latent-upscaler/tree/a5ed6e9586f0b14250a0018f78568e0076e4bd9d",
    note: "已核对 pinned commit 的四个节点 class mapping；本项目不复制第三方源码。当前只完成 catalog/static 证据，object-info、workflow 和真实 smoke 仍是后续 Gate。",
    commit: H3_LATENT_UPSCALER_REVISION,
    checks: ["static"]
  }],
  required: false
}, {
  id: "minimax-h3-learned-upscaler",
  priority: 146,
  name: "MiniMax H3 Learned Latent Upscaler",
  purpose: "加载 H3 learned 3D latent upscaler 权重并放大分离后的 24 通道 video latent",
  repositoryUrl: "https://github.com/LBH-123-AI/Comfyui_Minimax_h3_latent_Upscaler",
  directoryName: "Comfyui_Minimax_h3_latent_Upscaler",
  aliases: ["Comfyui_Minimax_h3_latent_Upscaler", "ComfyUI-Minimax-H3-Latent-Upscaler"],
  installRevision: "d7c01b9011f2e8439493f6c02c29995a27df276f",
  nodeTypes: ["MinimaxH3LatentUpscaler3D"],
  bulkInstall: false,
  appInstallable: true,
  runtimeRequirement: "用户可从设置页主动将固定 commit 克隆到所选 ComfyUI；节点源码和权重不随应用分发，权重仍由用户按来源链接下载。运行前必须通过 /object_info schema 校验。",
  compatibilityEvidence: [{
    verifiedAt: "2026-09-02",
    sourceUrl: "https://github.com/LBH-123-AI/Comfyui_Minimax_h3_latent_Upscaler/tree/d7c01b9011f2e8439493f6c02c29995a27df276f",
    note: "在 ComfyUI 0.33.0、Python 3.12.11、Torch 2.10.0+cu130 和 RTX 4090 上通过 /object_info、24-channel Conv3D minimal run 及应用完整 1952x1088 二次采样 smoke；DynamicCombo API 使用扁平 mode/mode.width/mode.height。设置页只在用户主动操作时克隆该固定 commit，不随应用分发节点源码或权重。",
    comfyUi: "0.33.0",
    python: "3.12.11",
    pytorch: "2.10.0+cu130",
    cuda: "13.0",
    commit: "d7c01b9011f2e8439493f6c02c29995a27df276f",
    workflowIds: ["minimax_h3_fl2va_learned_3d_second_sample_av_api.json"],
    checks: ["static", "object-info", "minimal-run"]
  }],
  required: false
}, {
  id: "mmh3-ultimate-upscale",
  priority: 148,
  name: "MMH3 Ultimate Upscale",
  purpose: "通过时间分块和空间 tile 逐块二次采样 H3 joint AV latent，降低 1440p 峰值显存",
  repositoryUrl: "https://github.com/bbaudio-2025/Comfyui-MMH3-UltimateUpscale.git",
  directoryName: "Comfyui-MMH3-UltimateUpscale",
  aliases: ["comfyui-mmh3-ultimateupscale", "Comfyui-MMH3-UltimateUpscale"],
  installRevision: H3_ULTIMATE_UPSCALE_REVISION,
  license: "MIT",
  nodeTypes: [
    "MMH3UltimateUpscale",
    "MMH3LatentUpscaleWithModelParams",
    "MMH3TemporalSplitParams",
    "MMH3SpatialSplitParams"
  ],
  bulkInstall: false,
  appInstallable: true,
  runtimeRequirement: "1440p 路径固定使用 d91be5a 并应用程序管理的首块 source-anchor 与聚合进度补丁。安装后必须重启 ComfyUI 并通过 /object_info schema；模型权重许可证独立于节点源码。",
  compatibilityEvidence: [{
    verifiedAt: "2026-09-02",
    sourceUrl: "https://github.com/bbaudio-2025/Comfyui-MMH3-UltimateUpscale/tree/d91be5ac41797a3789b4765cdb6eb6d9129a4a4d",
    note: "固定 commit 加应用补丁后完成第二次 RTX 4090 2592x1440、124 帧、20 steps 全流程：12 个空间 tile 的聚合进度单调可见，耗时 1274.815 秒，GPU 平均 94.62%、峰值 100%，VRAM 峰值约 22.67 GiB；GPU 视频/音频 VAE、MP4、JointAV 与同一 History 资产持久化通过。输出画面仍有异常，质量根因按用户要求留待后续排查，不影响本条运行与设置证据。",
    commit: H3_ULTIMATE_UPSCALE_REVISION,
    checks: ["static", "object-info", "minimal-run"]
  }],
  required: false
}, {
  id: "local-video-studio-h3-av",
  priority: 147,
  name: "Local Video Studio H3 AV Serializer",
  purpose: "在 output root 下安全保存/加载 H3 joint AV safetensors artifact",
  repositoryUrl: "builtin://LocalVideoStudio-H3",
  directoryName: "LocalVideoStudio-H3",
  aliases: ["local-video-studio-h3-av", "LocalVideoStudio-H3"],
  source: "bundled",
  installRevision: H3_AV_SERIALIZER_REVISION,
  license: "MIT",
  nodeTypes: [
    "LocalVideoStudioH3SaveJointAV",
    "LocalVideoStudioH3LoadJointAV",
    "LocalVideoStudioRequireGpuVAE",
    "LocalVideoStudioH3RequireGpuVAE",
    "LocalVideoStudioH3AnchorConditioning"
  ],
  runtimeRequirement: "应用原创节点；安装后必须用所选 ComfyUI Python 检查 safetensors 依赖，并通过 /object_info 与 load/save round-trip 验证。",
  required: false
}, {
  id: "spectrum-minimax-h3",
  priority: 150,
  name: "Spectrum MiniMax H3",
  purpose: "预测部分 H3 采样步骤；支持标准 FL2VA / R2V、LightX2V Turbo，并可选互操作 H3 Continuum、Diff-Aid 与 Untwisting RoPE",
  repositoryUrl: "https://github.com/xmarre/ComfyUI-Spectrum-MiniMax-H3.git",
  directoryName: "ComfyUI-Spectrum-MiniMax-H3",
  aliases: ["comfyui-spectrum-minimax-h3"],
  releaseSource: "github-release",
  nodeTypes: ["SpectrumApplyMiniMaxH3"],
  minimumVersion: SPECTRUM_MINIMUM_VERSION,
  recommendedVersion: SPECTRUM_RECOMMENDED_VERSION,
  compatibilityEvidence: [{
    verifiedAt: "2026-08-31",
    sourceUrl: "https://github.com/xmarre/ComfyUI-Spectrum-MiniMax-H3/releases/tag/v0.2.23",
    note: "v0.2.18–v0.2.20 增加并修复可选 MiniMax H3 RefDelta Solver v0.2.0+ API-v1 互操作；v0.2.21 兼容 ComfyUI 0.34+ PDD H3 FinalLayer 新接口；v0.2.22 新增原生 SEEDS-2/SEEDS-3 与 SA-Solver 的状态感知 forecast；v0.2.23 完成 active SA-Solver PECE 与 RefDelta 多后端互操作，并将 active-PECE 默认策略设为 balanced。现有 Euler、RES、ER-SDE、普通 SA-Solver、Continuum、Diff-Aid、Untwisting RoPE 与工作流参数不变。",
    comfyUi: "0.33.1",
    commit: "987be55",
    workflowIds: ["minimax_h3_i2v", "minimax_h3_r2v"],
    checks: ["static"]
  }],
  required: false
}];

export const LLAMA_CPP_PYTHON_DEPENDENCY_ID = "llama-cpp-python";
export const LLAMA_CPP_PYTHON_DEPENDENCY_PRIORITY = 60;
/** Synthetic capability card for the H3 runtime package set managed together. */
export const H3_ACCELERATION_DEPENDENCY_ID = "h3-acceleration-runtime";
export const H3_ACCELERATION_DEPENDENCY_PRIORITY = 35;

export function compareCustomNodeDefinitions(
  left: Pick<CatalogCustomNodeDefinition, "id" | "name" | "priority">,
  right: Pick<CatalogCustomNodeDefinition, "id" | "name" | "priority">
): number {
  return left.priority - right.priority ||
    left.name.localeCompare(right.name, "zh-CN") ||
    left.id.localeCompare(right.id);
}

export function customNodePriority(id: string): number {
  if (id === H3_ACCELERATION_DEPENDENCY_ID) return H3_ACCELERATION_DEPENDENCY_PRIORITY;
  if (id === LLAMA_CPP_PYTHON_DEPENDENCY_ID) return LLAMA_CPP_PYTHON_DEPENDENCY_PRIORITY;
  return customNodeDefinitions.find((definition) => definition.id === id)?.priority ?? Number.MAX_SAFE_INTEGER;
}

export function compareDependencyIds(leftId: string, rightId: string): number {
  return customNodePriority(leftId) - customNodePriority(rightId) ||
    leftId.localeCompare(rightId);
}

export const customNodeCatalog: readonly CatalogCustomNodeDefinition[] =
  [...customNodeDefinitions].sort(compareCustomNodeDefinitions);

export function customNodeDefinition(id: string): CatalogCustomNodeDefinition | undefined {
  return customNodeCatalog.find((definition) => definition.id === id);
}
