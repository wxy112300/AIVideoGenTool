import type { CatalogCustomNodeDefinition } from "./types.js";
import {
  DLSS5_NODE_DIRECTORY,
  DLSS5_NODE_ID,
  DLSS5_NODE_REQUIRED_NODE_TYPES,
  DLSS5_NODE_REPOSITORY,
  DLSS5_NODE_REVISION,
  DLSS5_NODE_VERSION
} from "./dlss5.js";
import {
  AETHERSCALE_NODE_DIRECTORY,
  AETHERSCALE_NODE_ID,
  AETHERSCALE_NODE_REQUIRED_NODE_TYPES,
  AETHERSCALE_NODE_REPOSITORY,
  AETHERSCALE_NODE_REVISION,
  AETHERSCALE_NODE_VERSION,
  AETHERSCALE_RUNTIME_BUNDLE_ID
} from "./aetherscale.js";
import {
  KONOHAMARU_NODE_DIRECTORY,
  KONOHAMARU_NODE_ID,
  KONOHAMARU_NODE_REQUIRED_NODE_TYPES,
  KONOHAMARU_NODE_REPOSITORY,
  KONOHAMARU_NODE_REVISION,
  KONOHAMARU_NEURAL_UPSTREAM_ADDON,
  KONOHAMARU_NEURAL_UPSTREAM_RELEASE,
  KONOHAMARU_NEURAL_UPSTREAM_SOURCE_URL,
  KONOHAMARU_VIDEO2DLSSNR_DOWNLOAD_URL,
  KONOHAMARU_VIDEO2DLSSNR_RELEASE,
  KONOHAMARU_RUNTIME_BUNDLE_ID,
  KONOHAMARU_RUNTIME_SOURCE_URL
} from "./konohamaru.js";

export const SPECTRUM_MINIMUM_VERSION = "0.2.1";
export const SPECTRUM_TURBO_MINIMUM_VERSION = "0.2.6";
export const SPECTRUM_MODEL_AWARE_MINIMUM_VERSION = "0.2.7";
export const SPECTRUM_RECOMMENDED_VERSION = "0.2.24";
export const MINIMAX_H3_PROMPT_WRITER_MINIMUM_VERSION = "0.3.1";
export const MINIMAX_H3_PROMPT_WRITER_RECOMMENDED_VERSION = "0.4.5";
export const MULTIMODAL_PROMPT_NODES_MINIMUM_VERSION = "1.0.15";
export const H3_MOTION_CONTEXT_MINIMUM_VERSION = "0.3.1";
export const H3_MOTION_CONTEXT_RECOMMENDED_VERSION = "0.6.2";
export const H3_MOTION_CONTEXT_RECOMMENDED_COMFYUI_VERSION = "0.34.0";
export const H3_SLA_ATTENTION_MINIMUM_VERSION = "1.3.8";
export const H3_SLA_ATTENTION_RECOMMENDED_VERSION = "1.3.8";
export const H3_MEMORY_MINIMUM_VERSION = "0.2.16";
export const H3_MEMORY_RECOMMENDED_VERSION = "0.2.20";
export const H3_MEMORY_LATEST_VERSION = H3_MEMORY_RECOMMENDED_VERSION;
export const H3_MEMORY_UPSTREAM_COMMIT = "e15f6534bb5841ff4e6a92ea5f9b42fca0e32746";
export const H3_LATENT_UPSCALER_REVISION = "a5ed6e9586f0b14250a0018f78568e0076e4bd9d";
export const H3_ULTIMATE_UPSCALE_REVISION = "d91be5ac41797a3789b4765cdb6eb6d9129a4a4d";
export const H3_AV_SERIALIZER_REVISION = "0.3.0";
export const H3_CONTINUUM_MINIMUM_VERSION = "3.8.0";
export const H3_CONTINUUM_RECOMMENDED_VERSION = "3.8.0";
export const H3_CONTINUUM_REVISION = "b10804f78ca67fdeb3eb09fa5f2ebab2f3abc3c3";

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
  id: KONOHAMARU_NODE_ID,
  priority: 132,
  name: "ComfyUI NVIDIA DLSS 5 Visual Enhancer · Temporal Neural",
  purpose: "Konohamaru04 的 DLSS5 视频超分、时序 Neural enhancement 与 DLSSG 补帧节点",
  repositoryUrl: KONOHAMARU_NODE_REPOSITORY,
  directoryName: KONOHAMARU_NODE_DIRECTORY,
  aliases: ["comfyui-dlss-frame-interpolation", "ComfyUI-DLSS-Frame-Interpolation"],
  installRevision: KONOHAMARU_NODE_REVISION,
  runtimeBundleId: KONOHAMARU_RUNTIME_BUNDLE_ID,
  nodeTypes: KONOHAMARU_NODE_REQUIRED_NODE_TYPES,
  requiresGitLfs: true,
  bulkInstall: false,
  appInstallable: true,
  runtimeRequirement: `需要当前 ComfyUI Python、FFmpeg/FFprobe、NVIDIA RTX 与兼容驱动；DLSS SR/DLSSG DLL、worker、旧 image-path DLSSNR runtime 由上游 Git LFS 管理，${KONOHAMARU_NEURAL_UPSTREAM_ADDON} 由应用固定下载 ${KONOHAMARU_NEURAL_UPSTREAM_RELEASE} 并校验 SHA-256。视频时序 Neural enhancement 使用应用固定下载并校验的 video2dlssnr ${KONOHAMARU_VIDEO2DLSSNR_RELEASE} 四文件 runtime，不复制其内置 FFmpeg；视频链为 LoadVideo → video2dlssnr temporal Neural enhancement/upscale → 可选 DLSS Frame Interpolation → SaveVideo。`,
  compatibilityEvidence: [{
    verifiedAt: "2026-09-09",
    sourceUrl: KONOHAMARU_RUNTIME_SOURCE_URL,
    note: "固定 upstream commit；静态复核确认三个节点使用原生 VIDEO/IMAGE 类型，README 提供 3× 视频超分与 120 FPS 补帧组合示例。上游公开样例不是本机 RTX 4090 smoke 证据。",
    commit: KONOHAMARU_NODE_REVISION,
    checks: ["static"]
  }, {
    verifiedAt: "2026-09-10",
    sourceUrl: KONOHAMARU_NEURAL_UPSTREAM_SOURCE_URL,
    note: `本机 RTX 4090 的 neural-upstream ${KONOHAMARU_NEURAL_UPSTREAM_RELEASE} 结果保留为历史 image-path 证据；render resolution 的 feature 18 产生并执行成功，但视频路径未继续采用其固定 jitter carrier。`,
    checks: ["static", "minimal-run"]
  }, {
    verifiedAt: "2026-09-10",
    sourceUrl: KONOHAMARU_VIDEO2DLSSNR_DOWNLOAD_URL,
    note: `本机 RTX 4090 使用 video2dlssnr ${KONOHAMARU_VIDEO2DLSSNR_RELEASE} 对同一段 124 帧素材实测：124/124 帧输出，约 5.9 fps，首帧后的帧差持续正常；这是时序 feature-18 minimal-run 证据，不代表所有片源的画质验收。`,
    checks: ["static", "minimal-run"]
  }],
  required: false
}, {
  id: DLSS5_NODE_ID,
  retired: true,
  priority: 135,
  name: "ComfyUI DLSS5",
  purpose: "HECer 原版 NVIDIA DLSS 5 Super Resolution 节点与 Depth/Optical Flow 导引节点",
  repositoryUrl: DLSS5_NODE_REPOSITORY,
  directoryName: DLSS5_NODE_DIRECTORY,
  aliases: ["comfyui-dlss5", "ComfyUI-DLSS5"],
  releaseSource: "github-release",
  installRevision: DLSS5_NODE_REVISION,
  nodeTypes: DLSS5_NODE_REQUIRED_NODE_TYPES,
  minimumVersion: DLSS5_NODE_VERSION,
  recommendedVersion: DLSS5_NODE_VERSION,
  latestVersion: DLSS5_NODE_VERSION,
  bulkInstall: false,
  appInstallable: true,
  runtimeRequirement: "HECer v0.2.2 的 requirements 必须安装到当前选中的 ComfyUI Python（Python 3.10–3.13）；SR 还需要 Windows/NVIDIA/D3D12、VapourKit Python、vsdlsssr.dll 与 nvngx_dlss.dll。本条只记录固定来源和静态要求，尚无本机运行证据。",
  compatibilityEvidence: [{
    verifiedAt: "2026-09-03",
    sourceUrl: `https://github.com/HECer/ComfyUI-DLSS5/tree/${DLSS5_NODE_REVISION}`,
    note: "固定 HECer v0.2.2 revision；首发只登记 DLSSSuperResolution、Depth Anything V2 和 Farneback Optical Flow 所需节点。",
    commit: DLSS5_NODE_REVISION,
    checks: ["static"]
  }],
  required: false
}, {
  id: AETHERSCALE_NODE_ID,
  retired: true,
  priority: 136,
  name: "ComfyUI AetherScale",
  purpose: "AetherScale v0.5.5 的 Motion Analysis 与 carrier-backed Neural Rendering 节点",
  repositoryUrl: AETHERSCALE_NODE_REPOSITORY,
  directoryName: AETHERSCALE_NODE_DIRECTORY,
  aliases: ["comfyui-aetherscale", "ComfyUI-AetherScale"],
  releaseSource: "github-release",
  installRevision: AETHERSCALE_NODE_REVISION,
  runtimeBundleId: AETHERSCALE_RUNTIME_BUNDLE_ID,
  nodeTypes: AETHERSCALE_NODE_REQUIRED_NODE_TYPES,
  minimumVersion: AETHERSCALE_NODE_VERSION,
  recommendedVersion: AETHERSCALE_NODE_VERSION,
  latestVersion: AETHERSCALE_NODE_VERSION,
  bulkInstall: false,
  appInstallable: true,
  runtimeRequirement: "需要当前选中的 ComfyUI Python（Python 3.10+）；requirements.txt 按上游 v0.5.5 保持为空。carrier runtime 单独由应用按固定 Merserk Visual Enhancer v1.0 白名单安装，生产 workflow 禁止自动 bootstrap；nvidia-vfx 仅是可选 VFX 能力，不阻塞 carrier。",
  compatibilityEvidence: [{
    verifiedAt: "2026-09-04",
    sourceUrl: `https://github.com/vizart-vj/ComfyUI-AetherScale/tree/${AETHERSCALE_NODE_REVISION}`,
    note: "固定 AetherScale v0.5.5 commit；生产图只允许 Motion Analysis 与 carrier-backed Neural Rendering，Runtime/VFX/Diagnostics 节点不参与应用 workflow。",
    commit: AETHERSCALE_NODE_REVISION,
    checks: ["static"]
  }],
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
    verifiedAt: "2026-09-07",
    sourceUrl: "https://github.com/duckyshell/ComfyUI-MiniMaxH3-Prompt-Writer/releases/tag/v0.4.5",
    note: "0.4.5 保留应用依赖的 /h3studio/status、/models、/runtime/gguf/diagnostics、/media/upload、/media、/generate、/cancel 和 /unload 接口；新增 Auto VRAM、媒体编辑/拼贴、浮动媒体面板、主题/界面尺寸和外部 llama.cpp 路由器能力。应用兼容补丁已对 v0.4.5 后端源码回放并通过 Python 语法检查；尚未把这项静态证据当作本机真实 Prompt Writer generation smoke。",
    commit: "862ae053ae649acf1db8106bdfbcbf911ab89b4e",
    checks: ["static"]
  }],
  runtimeRequirement: "上游 0.4.x 的 Direct GGUF 依赖由本应用统一安装；Gemma GGUF 需要当前 ComfyUI Python 中的 llama-cpp-python CUDA 后端。旧版 0.3.x 可通过应用修复流程回补输出预算与卸载兼容层。更新节点不会覆盖已通过自检的后端；请在设置 → 节点与依赖中安装或重装/修复，不要重复安装第二个版本。",
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
  runtimeRequirement: "推荐 v0.6.2（v0.6 增加手工画布 Chain 自动串联、segments 和槽位清理，v0.6.2 修复旧画布的空 segments）需要 ComfyUI 0.34.0+；ComfyUI 0.32/0.33 继续保留 v0.3.1 回退线。本应用 API workflow 仍使用四个基础节点，不依赖 Chain；安装或更新后必须重启所选 ComfyUI，并通过 /object_info 与最小真实 H3 续写复检。",
  compatibilityEvidence: [{
    verifiedAt: "2026-09-10",
    sourceUrl: "https://github.com/NikoDemon80/ComfyUI-H3-Motion-Context/releases/tag/v0.6.2",
    note: "v0.6.2 要求 ComfyUI 0.34.0+，修复旧 Chain 画布中空字符串 segments 无法通过 INT 校验的问题，并更新官方示例为 segments=0；v0.6.1 还为槽位检查/清理接口增加同源保护并限制 latent 路径在 output 目录内，v0.6.0 增加 Chain 自动串联、segments 和 Clear latents。上游变更主要影响手工画布串联；本应用 API workflow 仍不引入 Chain。本条是上游发布与静态证据，不代表本机 object-info 或真实 smoke 已通过。",
    comfyUi: H3_MOTION_CONTEXT_RECOMMENDED_COMFYUI_VERSION,
    commit: "5335715",
    workflowIds: ["minimax_h3_r2v_extend_api"],
    checks: ["static"]
  }, {
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
  purpose: "使用 H3 Continuum V3.8 的公开 sampler、Video Guide 和 Finalize 进行分块长视频与接续；History JointAV 作为边界资产保留",
  repositoryUrl: "https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum.git",
  directoryName: "ComfyUI-H3-Continuum",
  aliases: ["ComfyUI-H3-Continuum", "comfyui-h3-continuum"],
  releaseSource: "github-release",
  installRevision: H3_CONTINUUM_REVISION,
  license: "MIT",
  nodeTypes: [
    "H3ContinuumSamplerV38",
    "H3ContinuumLoadVideo",
    "H3ContinuumAssembleSeamV35"
  ],
  minimumVersion: H3_CONTINUUM_MINIMUM_VERSION,
  recommendedVersion: H3_CONTINUUM_RECOMMENDED_VERSION,
  latestVersion: H3_CONTINUUM_RECOMMENDED_VERSION,
  bulkInstall: false,
  appInstallable: true,
  runtimeRequirement: "要求 ComfyUI >=0.34.0；当前固定 H3 Continuum v3.8.0。V3.8 公开运行面为 Sampler V3.8 + Core Video/Audio Decode + Finalize；安装后必须重启并通过 /object_info 与真实 H3 smoke 验证。旧 V3.7 Join/Finish/SaveState 图不属于当前支持路径。",
  compatibilityEvidence: [{
    verifiedAt: "2026-09-10",
    sourceUrl: "https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/commit/b10804f78ca67fdeb3eb09fa5f2ebab2f3abc3c3",
    note: "v3.8.0 发布后的当前 main 已包含 Review/continuation 热修；本应用安装 pin 到该提交。公开主路径仍为 H3ContinuumSamplerV38 → Core Video/Audio VAE Decode → H3ContinuumAssembleSeamV35（Finalize），并提供 H3ContinuumLoadVideo 作为 Video Guide 输入；上游 README 标注 ComfyUI 0.34.2 验证。旧 Join/Finish/SaveState ID 不在当前公开节点面内。本条是上游发布与静态证据，不代表本机 object-info 或真实 smoke 已通过。",
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
  purpose: "在 output root 下安全保存/加载 H3 joint AV safetensors artifact，并桥接到 H3 Continuum state",
  repositoryUrl: "builtin://LocalVideoStudio-H3",
  directoryName: "LocalVideoStudio-H3",
  aliases: ["local-video-studio-h3-av", "LocalVideoStudio-H3"],
  source: "bundled",
  installRevision: H3_AV_SERIALIZER_REVISION,
  license: "MIT",
  nodeTypes: [
    "LocalVideoStudioH3SaveJointAV",
    "LocalVideoStudioH3LoadJointAV",
    "LocalVideoStudioH3ArtifactToContinuumState",
    "LocalVideoStudioRequireGpuVAE",
    "LocalVideoStudioH3RequireGpuVAE",
    "LocalVideoStudioH3AnchorConditioning"
  ],
  runtimeRequirement: "应用原创节点；安装后必须用所选 ComfyUI Python 检查 safetensors 依赖，并通过 /object_info 与 load/save round-trip 验证。Continuum bridge 只在 ComfyUI-H3-Continuum 已加载时工作，并委托其 state contract，不复制采样逻辑。",
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
    verifiedAt: "2026-09-07",
    sourceUrl: "https://github.com/xmarre/ComfyUI-Spectrum-MiniMax-H3/releases/tag/v0.2.24",
    note: "v0.2.18–v0.2.20 增加并修复可选 MiniMax H3 RefDelta Solver v0.2.0+ API-v1 互操作；v0.2.21 兼容 ComfyUI 0.34+ PDD H3 FinalLayer 新接口；v0.2.22 新增原生 SEEDS-2/SEEDS-3 与 SA-Solver 的状态感知 forecast；v0.2.23 完成 active SA-Solver PECE 与 RefDelta 多后端互操作，并将 active-PECE 默认策略设为 balanced；v0.2.24 移除已验证 few-step/progressive 流程中不必要的 actual-evaluation barriers：active PECE 的终端 Untwist 延后仅在明确的安全元数据和窄边界下生效，corrector 仍保持 actual；RES Multistep 不再隐式把 final tail 提升到 3，现有工作流传入的 tail_actual_steps 按原值生效。当前内置 H3 仍使用 RES/ER-SDE，不切换为 SA/PECE；现有模型、LoRA、Continuum、Diff-Aid、Untwisting RoPE 与工作流结构保持兼容。",
    comfyUi: "0.33.1",
    commit: "a360f64",
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
  customNodeDefinitions
    .filter((definition) => definition.retired !== true)
    .sort(compareCustomNodeDefinitions);

export function customNodeDefinition(id: string): CatalogCustomNodeDefinition | undefined {
  return customNodeDefinitions.find((definition) => definition.id === id);
}
