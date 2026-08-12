import type { CatalogCustomNodeDefinition } from "./types.js";

export const customNodeCatalog: readonly CatalogCustomNodeDefinition[] = [{
  id: "comfyui-gguf",
  name: "ComfyUI-GGUF",
  purpose: "加载 Remix、SmoothMix 等 GGUF 视频模型",
  repositoryUrl: "https://github.com/city96/ComfyUI-GGUF.git",
  directoryName: "ComfyUI-GGUF",
  aliases: ["comfyui-gguf"],
  nodeTypes: ["UnetLoaderGGUFAdvanced", "CLIPLoaderGGUF"],
  required: true
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
  purpose: "采样后主动卸载模型，为 Wan 分块 VAE 解码释放显存",
  repositoryUrl: "https://github.com/kijai/ComfyUI-KJNodes.git",
  directoryName: "comfyui-kjnodes",
  aliases: ["comfyui-kjnodes"],
  nodeTypes: ["VRAM_Debug"],
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
  id: "minimax-h3-prompt-writer",
  name: "MiniMax H3 Prompt Writer",
  purpose: "在 ComfyUI 内运行 Gemma 4，多模态理解素材并生成 H3 官方格式提示词",
  repositoryUrl: "https://github.com/duckyshell/ComfyUI-MiniMaxH3-Prompt-Writer.git",
  directoryName: "ComfyUI-MiniMaxH3-Prompt-Writer",
  aliases: ["comfyui-minimaxh3-prompt-writer"],
  runtimeEndpoint: "/h3studio/status",
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
  purpose: "用系统内存保存 H3 中间特征并预测部分采样步骤；支持标准 FL2VA / R2V，Turbo 暂不启用",
  repositoryUrl: "https://github.com/xmarre/ComfyUI-Spectrum-MiniMax-H3.git",
  directoryName: "ComfyUI-Spectrum-MiniMax-H3",
  aliases: ["comfyui-spectrum-minimax-h3"],
  nodeTypes: ["SpectrumApplyMiniMaxH3"],
  required: false
}];

export function customNodeDefinition(id: string): CatalogCustomNodeDefinition | undefined {
  return customNodeCatalog.find((definition) => definition.id === id);
}
