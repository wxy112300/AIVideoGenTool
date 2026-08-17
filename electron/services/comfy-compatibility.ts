import type { ComfyUiCompatibility } from "../../src/types.js";
import { availableComfyNodeIds } from "./dependency-scanner.js";

export const MINIMAX_H3_MINIMUM_COMFY_REVISION = "43cb4ff";
export const MINIMAX_H3_MINIMUM_COMFY_VERSION = "0.31.0";
export const MINIMAX_H3_RECOMMENDED_COMFY_VERSION = "0.33.1";

export const minimaxH3CoreNodes = [
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

export function versionAtLeast(value: string, minimum: string): boolean {
  const parse = (input: string): number[] => {
    const match = input.match(/(?:^|[^\d])(\d+)\.(\d+)\.(\d+)(?:[^\d]|$)/);
    return match ? match.slice(1).map(Number) : [];
  };
  const actual = parse(value);
  const required = parse(minimum);
  if (actual.length !== 3 || required.length !== 3) return false;
  for (let index = 0; index < 3; index += 1) {
    if (actual[index] !== required[index]) return actual[index] > required[index];
  }
  return true;
}

export function evaluateMiniMaxH3CoreSupport(
  objectInfo: unknown
): ComfyUiCompatibility["coreNodes"] {
  const available = availableComfyNodeIds(objectInfo);
  return minimaxH3CoreNodes.map((node) => ({
    ...node,
    available: node.id === "MiniMaxH3SigmaShift"
      ? available.has("MiniMaxH3SigmaShift") || available.has("ModelSamplingMiniMaxH3")
      : available.has(node.id)
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
