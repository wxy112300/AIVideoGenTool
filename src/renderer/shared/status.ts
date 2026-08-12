import { isGemmaPromptModel } from "../../core/prompt-models";
import type { EnvironmentScanResult, ModelScanProfile, Settings } from "../../types";

export interface PromptModelStatus {
  ready: boolean;
  detail: string;
}

export function promptModelStatus(
  settings: Settings,
  environmentScan: EnvironmentScanResult | null
): PromptModelStatus {
  if (!environmentScan) {
    return { ready: false, detail: "等待环境扫描确认提示词模型" };
  }
  const profile = environmentScan.modelProfiles.find(
    (item) => item.category === "prompt" && item.id === settings.promptModelId
  );
  if (!profile) {
    return { ready: false, detail: "当前提示词模型未在设置扫描结果中" };
  }
  if (!profile.available) {
    const missing = profile.components
      .filter((component) => !component.found)
      .map((component) => component.expected)
      .join("、");
    return {
      ready: false,
      detail: `模型未配置完整${missing ? `：缺少 ${missing}` : ""}`
    };
  }
  return {
    ready: true,
    detail: isGemmaPromptModel(settings.promptModelId)
      ? "检查 ComfyUI H3 Prompt Writer"
      : "启动 ComfyUI 提示词模型"
  };
}

export function isImageWorkflowReady(profile?: ModelScanProfile): boolean {
  return Boolean(
    profile?.category === "image" &&
    profile.available &&
    profile.integrated &&
    profile.runtimeVerified &&
    profile.runtimeReady
  );
}

export function isImageModelSelectable(profile?: ModelScanProfile): boolean {
  return Boolean(profile?.category === "image" && profile.integrated);
}

export function imageWorkflowStatus(profile?: ModelScanProfile): string {
  if (!profile) return "等待环境扫描";
  if (!profile.available) return "组件不完整";
  if (!profile.integrated) return "工作流待接入";
  if (!profile.runtimeVerified) return "未启动，入队时自动启动并验证";
  if (!profile.runtimeReady) {
    return profile.runtimeMissingNodes?.length
      ? `缺少节点：${profile.runtimeMissingNodes.join("、")}`
      : "运行时节点验证未通过";
  }
  return "工作流节点已验证";
}
