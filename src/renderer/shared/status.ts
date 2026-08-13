import {
  isComfyMultimodalPromptModel,
  isGemmaPromptModel
} from "../../core/prompt-models";
import { createTranslator, type Translate } from "../../core/i18n";
import { uiKeys } from "../../core/i18n-keys";
import type { EnvironmentScanResult, ModelScanProfile, Settings } from "../../types";

export interface PromptModelStatus {
  ready: boolean;
  detail: string;
}

export function promptModelStatus(
  settings: Settings,
  environmentScan: EnvironmentScanResult | null,
  t: Translate = createTranslator("zh-CN").t
): PromptModelStatus {
  if (!environmentScan) {
    return { ready: false, detail: t(uiKeys.status.promptWaitingScan) };
  }
  const profile = environmentScan.modelProfiles.find(
    (item) => item.category === "prompt" && item.id === settings.promptModelId
  );
  if (!profile) {
    return { ready: false, detail: t(uiKeys.status.promptNotFound) };
  }
  if (!profile.available) {
    const missing = profile.components
      .filter((component) => !component.found)
      .map((component) => component.expected)
      .join("、");
    return {
      ready: false,
      detail: `${t(uiKeys.status.promptIncomplete, { missing: missing ? `：${t(uiKeys.status.promptMissing, { missing })}` : "" })}`
    };
  }
  return {
    ready: true,
    detail: isComfyMultimodalPromptModel(settings.promptModelId)
      ? t(uiKeys.status.promptQwenMultimodal)
      : isGemmaPromptModel(settings.promptModelId)
        ? t(uiKeys.status.promptGemma)
        : t(uiKeys.status.promptQwen)
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
  return Boolean(profile?.category === "image" && profile.integrated && profile.available);
}

export function imageWorkflowStatus(profile?: ModelScanProfile, t: Translate = createTranslator("zh-CN").t): string {
  if (!profile) return t(uiKeys.status.imageWaitingScan);
  if (!profile.available) return t(uiKeys.status.imageIncomplete);
  if (!profile.integrated) return t(uiKeys.status.imagePendingIntegration);
  if (profile.missingCustomNodeNames?.length) {
    return t(uiKeys.status.imageMissingNodes, { nodes: profile.missingCustomNodeNames.join("、") });
  }
  if (!profile.runtimeVerified) return t(uiKeys.status.imageNotStarted);
  if (!profile.runtimeReady) {
    return profile.runtimeMissingNodes?.length
      ? t(uiKeys.status.imageMissingNodes, { nodes: profile.runtimeMissingNodes.join("、") })
      : t(uiKeys.status.imageRuntimeFailed);
  }
  return t(uiKeys.status.imageVerified);
}
