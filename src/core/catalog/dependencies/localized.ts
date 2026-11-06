import type { Translate } from "../../i18n.js";
import { uiKeys } from "../../i18n-keys.js";

const requirementKeys: Readonly<Record<string, string>> = {
  "comfyui-gguf": uiKeys.nodeRequirement.comfyuiGguf,
  "minimax-h3-prompt-writer": uiKeys.nodeRequirement.minimaxH3PromptWriter,
  "comfyui-multimodal-prompt-nodes": uiKeys.nodeRequirement.comfyuiMultimodalPromptNodes,
  "comfyui-qwenvl-lora": uiKeys.nodeRequirement.comfyuiQwenvlLora,
  "comfyui-dlss-frame-interpolation": uiKeys.nodeRequirement.comfyuiDlssFrameInterpolation,
  "h3-motion-context": uiKeys.nodeRequirement.h3MotionContext,
  "h3-continuum": uiKeys.nodeRequirement.h3Continuum,
  "h3-latent-upscaler": uiKeys.nodeRequirement.h3LatentUpscaler,
  "minimax-h3-learned-upscaler": uiKeys.nodeRequirement.minimaxH3LearnedUpscaler,
  "local-video-studio-h3-av": uiKeys.nodeRequirement.localVideoStudioH3Av,
  "mmh3-ultimate-upscale": uiKeys.nodeRequirement.mmh3UltimateUpscale,
  "plaguekind-h3-sla": uiKeys.nodeRequirement.plaguekindH3Sla,
  "comfyui-gguf-h3": uiKeys.nodeRequirement.comfyuiGgufH3,
};

export function localizeNodeRuntimeRequirement(id: string, fallback: string, t: Translate): string {
  const key = requirementKeys[id];
  return key && fallback ? t(key) : fallback;
}
