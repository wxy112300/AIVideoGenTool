import type { ComfyUiCompatibility } from "../../src/types.js";
import type { DependencyBadRange } from "../../src/core/catalog/dependencies/types.js";
import { availableComfyNodeIds } from "./dependency-scanner.js";

export const MINIMAX_H3_MINIMUM_COMFY_REVISION = "43cb4ff";
export const MINIMAX_H3_MINIMUM_COMFY_VERSION = "0.31.0";
export const MINIMAX_H3_RECOMMENDED_COMFY_VERSION = "0.33.1";

/**
 * Community compatibility evidence which is useful to surface, but is not a
 * blanket reason to reject the current H3 workflows.  The affected H3 Cache
 * path is not enabled by Local Video Studio; users who install that optional
 * path should update past this revision themselves.
 */
export const minimaxH3KnownBadCoreRanges: readonly DependencyBadRange[] = [{
  revisionFrom: "bdcb886",
  revisionTo: "bdcb886",
  reason: "社区已知：该 ComfyUI 提交移除了 H3 Cache 依赖的 time_shift_slope；本项目默认不启用 H3 Cache，主流程仍按当前工作流验证。",
  severity: "warning",
  sourceUrl: "https://github.com/comfyanonymous/ComfyUI/commit/bdcb886"
}];

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

export function evaluateMiniMaxH3CompatibilityState(
  version: string,
  revision: string,
  checkedFrom: ComfyUiCompatibility["checkedFrom"]
): Pick<ComfyUiCompatibility, "compatibilityState" | "compatibilityNotice"> {
  if (version && !versionAtLeast(version, MINIMAX_H3_MINIMUM_COMFY_VERSION)) {
    return {
      compatibilityState: "error",
      compatibilityNotice: `当前 ComfyUI v${version} 低于 H3 最低支持版本 v${MINIMAX_H3_MINIMUM_COMFY_VERSION}。`
    };
  }
  const knownBad = minimaxH3KnownBadCoreRanges.find((range) =>
    Boolean(revision) && (
      range.revisionFrom === revision ||
      range.revisionTo === revision ||
      (range.revisionFrom && range.revisionTo &&
        range.revisionFrom <= revision && revision <= range.revisionTo)
    )
  );
  if (knownBad) {
    return { compatibilityState: "warning", compatibilityNotice: knownBad.reason };
  }
  if (!version && !revision && !checkedFrom) {
    return { compatibilityState: "unknown", compatibilityNotice: "等待连接服务或读取所选核心源码。" };
  }
  if (!version || !revision) {
    return { compatibilityState: "warning", compatibilityNotice: "已找到核心或服务，但版本与 Git 提交信息尚未完整读取。" };
  }
  return { compatibilityState: "supported", compatibilityNotice: "版本与提交信息已读取；是否可用仍以节点扫描和工作流验证为准。" };
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
