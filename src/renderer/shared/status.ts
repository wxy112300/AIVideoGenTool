import {
  isComfyMultimodalPromptModel,
  isGemmaPromptModel,
  isQwenVlPeftPromptModel
} from "../../core/prompt-models";
import { createTranslator, type Translate } from "../../core/i18n";
import { uiKeys } from "../../core/i18n-keys";
import type {
  EnvironmentItem,
  EnvironmentScanResult,
  CustomNodeStatus,
  ModelScanProfile,
  Settings
} from "../../types";

export type SettingsStatusTone = "available" | "warning" | "missing";

export interface PromptModelStatus {
  ready: boolean;
  detail: string;
}

export interface ModelProfileEvidence {
  files: "ready" | "missing";
  nodePackage: "not-required" | "ready" | "warning" | "incompatible" | "missing";
  runtime: "not-required" | "pending" | "ready" | "missing";
  integration: "ready" | "pending";
}

export function modelProfileEvidence(profile: ModelScanProfile): ModelProfileEvidence {
  return {
    files: profile.available ? "ready" : "missing",
    nodePackage: !profile.requiredCustomNodeIds?.length
      ? "not-required"
      : profile.missingCustomNodeIds?.length
        ? "missing"
        : profile.customNodeCompatibility === "error"
          ? "incompatible"
          : profile.customNodeCompatibility === "warning"
            ? "warning"
            : "ready",
    runtime: profile.runtimeVerified === undefined
      ? "not-required"
      : profile.runtimeVerified === false
        ? "pending"
        : profile.runtimeReady
          ? "ready"
          : "missing",
    integration: profile.integrated ? "ready" : "pending"
  };
}

/**
 * Settings uses a deliberately small status vocabulary.  A file scan can be
 * complete while runtime validation is still waiting for ComfyUI, so that
 * state must not be rendered as an error.
 */
export function modelProfileStatusTone(
  profile: ModelScanProfile
): SettingsStatusTone {
  const evidence = modelProfileEvidence(profile);
  if (
    evidence.files === "missing" ||
    evidence.nodePackage === "missing" ||
    evidence.nodePackage === "incompatible" ||
    evidence.runtime === "missing"
  ) {
    return "missing";
  }
  if (evidence.nodePackage === "warning" || evidence.integration === "pending") return "warning";
  return "available";
}

export function customNodeStatusTone(
  node: CustomNodeStatus,
  installPending = false
): SettingsStatusTone {
  if (installPending) return "warning";
  if (node.compatibilityState === "error") return "missing";
  if (node.compatibilityState === "warning") return "warning";
  if (node.loadError) return "missing";
  if (!node.installed) return "missing";
  if (!node.loaded || node.updateAvailable) return "warning";
  return "available";
}

export function environmentItemStatusTone(item: EnvironmentItem): SettingsStatusTone {
  if (item.status) return item.status;
  if (item.ok) return "available";
  return item.optional ? "warning" : "missing";
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
  const evidence = modelProfileEvidence(profile);
  if (evidence.nodePackage === "missing") {
    const nodes = profile.missingCustomNodeNames?.join("、") ||
      profile.missingCustomNodeIds?.join("、") ||
      profile.requiredCustomNodeIds?.join("、") || "-";
    return {
      ready: false,
      detail: t(uiKeys.status.promptMissingNodes, { nodes })
    };
  }
  if (evidence.nodePackage === "incompatible" || evidence.runtime === "missing") {
    return { ready: false, detail: t(uiKeys.status.promptRuntimeFailed) };
  }
  if (evidence.integration === "pending") {
    return { ready: false, detail: t(uiKeys.status.promptPendingIntegration) };
  }
  return {
    ready: true,
    detail: isQwenVlPeftPromptModel(settings.promptModelId)
      ? t(uiKeys.status.promptQwenVlPeft)
      : isComfyMultimodalPromptModel(settings.promptModelId)
        ? t(uiKeys.status.promptQwenMultimodal)
      : isGemmaPromptModel(settings.promptModelId)
        ? t(uiKeys.status.promptGemma)
        : t(uiKeys.status.promptQwen)
  };
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
  if (!profile.runtimeVerified) return t(uiKeys.status.imageRuntimePending);
  if (!profile.runtimeReady) {
    return profile.runtimeMissingNodes?.length
      ? t(uiKeys.status.imageMissingNodes, { nodes: profile.runtimeMissingNodes.join("、") })
      : t(uiKeys.status.imageRuntimeFailed);
  }
  return t(uiKeys.status.imageVerified);
}
