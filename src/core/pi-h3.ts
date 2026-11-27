import type { EnvironmentScanResult, ModelScanProfile, UiLocale } from "../types.js";
import { PI_H3_ADAPTERS, PI_H3_CONTINUUM_ADAPTERS, PI_H3_MODEL_ID, PI_H3_NODE_ID } from "./catalog/models/minimax_h3_pi/definition.js";

export const PI_H3_SCHEDULER = "pi-Flow Scheduler";
export const PI_H3_SAMPLER = "euler";
export const piH3MaxRawTime = (steps: number): number => steps === 2 ? 0.93 : 0.96;

export function piH3AdapterInstalled(profile: ModelScanProfile | undefined, steps: number, continuum = false): boolean {
  const adapter = (continuum ? PI_H3_CONTINUUM_ADAPTERS : PI_H3_ADAPTERS)[steps === 2 ? 2 : 4];
  return profile?.components.some((component) => component.expected === `loras/${adapter}` && component.found) === true;
}

export function piH3StepFallback(scan: EnvironmentScanResult | null, steps: number, continuum = false): 2 | 4 | undefined {
  const profile = scan?.modelProfiles.find((entry) => entry.id === PI_H3_MODEL_ID);
  const otherStep = steps === 2 ? 4 : 2;
  if (!piH3AdapterInstalled(profile, steps, continuum) && piH3AdapterInstalled(profile, otherStep, continuum)) return otherStep;
  return undefined;
}

export function piH3DependencyBlockReason(
  scan: EnvironmentScanResult | null | undefined,
  steps: number | undefined,
  locale: UiLocale = "zh-CN",
  continuum = false
): string {
  if (!scan) return "";
  const node = scan.customNodes.find((entry) => entry.id === PI_H3_NODE_ID);
  if (!node?.installed) {
    return locale === "en-US" ? "Install ComfyUI-piFlow."
      : locale === "zh-TW" ? "請安裝 ComfyUI-piFlow。" : "请安装 ComfyUI-piFlow。";
  }
  const profile = scan.modelProfiles.find((entry) => entry.id === PI_H3_MODEL_ID);
  if ((node.runtimeVerified && !node.loaded) || (profile?.runtimeVerified && !profile.runtimeReady)) {
    return locale === "en-US" ? "Pi-H3 nodes unavailable. Restart ComfyUI and rescan."
      : locale === "zh-TW" ? "Pi-H3 節點不可用。請重啟 ComfyUI 並重新掃描。" : "Pi-H3 节点不可用。请重启 ComfyUI 并重新扫描。";
  }
  const selectedSteps = steps === 2 ? 2 : 4;
  if (!piH3AdapterInstalled(profile, selectedSteps, continuum)) {
    if (continuum) {
      const filename = PI_H3_CONTINUUM_ADAPTERS[selectedSteps];
      return locale === "en-US" ? `Install the Pi-H3 ${selectedSteps}-step VAE adapter for multi-segment generation: ${filename}`
        : locale === "zh-TW" ? `多段生成需要 Pi-H3 ${selectedSteps} 步 VAE 版權重：${filename}` : `多段生成需要 Pi-H3 ${selectedSteps} 步 VAE 版权重：${filename}`;
    }
    return locale === "en-US" ? `Install the Pi-H3 ${selectedSteps}-step DWD adapter.`
      : locale === "zh-TW" ? `請安裝 Pi-H3 ${selectedSteps} 步 DWD adapter。` : `请安装 Pi-H3 ${selectedSteps} 步 DWD adapter。`;
  }
  if (profile?.available) return "";
  return locale === "en-US" ? "Check the shared H3 files in Models."
    : locale === "zh-TW" ? "請在模型頁檢查 H3 共用檔案。" : "请在模型页检查 H3 共用文件。";
}
