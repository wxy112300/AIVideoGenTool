import type { Draft, EnvironmentScanResult, Settings } from "../../types.js";
import { createTranslator } from "../i18n.js";
import { uiKeys } from "../i18n-keys.js";
import { releaseVersionAtLeast } from "../release-version.js";
import { commitScriptText } from "./script-buffers.js";
import { freezeLongVideoScript } from "./script.js";
import { assertLongVideoRunSource } from "./run-source.js";
import { continuumProfileLoras } from "./group-workflow.js";
import { videoLoraConfigurationIssues } from "../video-loras.js";
import { resolveH3ExecutionPolicy } from "../h3-execution-policy.js";

/** A remembered editor for another model must not hijack the selected native route. */
export function isLongVideoDraftActive(draft: Draft): boolean {
  return draft.longVideoEditor?.active === true && [ `${draft.modelId}:${draft.inputMode}`, `${draft.modelId}:undefined` ].includes(draft.longVideoEditor.key);
}

/** Narrow first executable route; unsupported choices remain available natively. */
export function longVideoBlockReason(draft: Draft, settings: Settings): string | null {
  const t = createTranslator(settings.uiLocale).t, k = uiKeys.create.editor;
  const source = draft.inputMode === "video" ? draft.longVideoRunSource : undefined;
  if (source) {
    try { assertLongVideoRunSource(source); } catch { return t(k.blockRunSource); }
    if (draft.modelId !== "minimax_h3_continuum" || !draft.sourceVideoPath || draft.sourceAssetId !== source.sourceAssetId || draft.sourceVersionId !== source.sourceVersionId ||
        Math.abs(draft.trimStartSeconds) > 1e-6 || Math.abs(draft.trimEndSeconds - draft.sourceVideoDuration) > 1 / 24) return t(k.blockRunSource);
    const profile = source.profile;
    if (draft.seed !== profile.seed || draft.steps !== profile.steps || Math.round(draft.resolution / 32) * 32 !== Math.min(profile.width, profile.height) ||
        draft.sourceWidth !== profile.width || draft.sourceHeight !== profile.height ||
        JSON.stringify(draft.videoLoras.map(l => [l.filename, l.strength])) !== JSON.stringify(continuumProfileLoras(profile).map(l => [l.filename, l.strength])) ||
        draft.spectrumMode !== (profile.spectrumMode ?? "off")) return t(k.blockRunProfile);
  } else {
    if (draft.inputMode !== "image" || draft.modelId !== "minimax_h3_fl2va") return t(k.blockRoute);
    if (!draft.startImagePath) return t(k.blockFirstImage);
  }
  if (draft.endImagePath || draft.h3ReferenceSlots.length) return t(k.blockReferences);
  if (!source) {
    const issue = videoLoraConfigurationIssues({ modelId: draft.modelId, inputMode: "image", videoLoras: draft.videoLoras,
      spectrumMode: draft.spectrumMode, attentionMode: settings.h3AttentionMode, locale: settings.uiLocale }).find(i => i.severity === "error");
    if (issue) return issue.message;
    const policy = resolveH3ExecutionPolicy({ modelId: draft.modelId, inputMode: "image", videoLoras: draft.videoLoras,
      attentionMode: settings.h3AttentionMode, sparseAttentionMode: settings.h3SparseAttentionMode, runtimeMode: settings.h3RuntimeMode,
      comfyCompilerMode: settings.h3ComfyCompilerMode, spectrumMode: draft.spectrumMode });
    if (!policy.allowed) return t(k.blockSparseWeights);
  }
  if (draft.frameInterpolation !== "off" || draft.resolution > 720) return t(k.blockDelivery);
  if (!draft.longVideoEditor?.confirmed || !draft.longVideoScript) return t(k.blockLayout);
  try {
    const frozen = freezeLongVideoScript(commitScriptText(draft.longVideoScript, () => crypto.randomUUID()));
    if (source && (frozen.layout.origin !== "extend" || frozen.layout.prefixChunks !== source.receipt.accepted_chunks || frozen.layout.chunkSeconds !== source.profile.chunkSeconds)) return t(k.blockLayout);
  }
  catch { return t(k.blockScript); }
  return null;
}

/** Offline files/version readiness only. Actual node schema is checked before POST. */
export function longVideoDependencyBlockReason(scan: EnvironmentScanResult | null | undefined, settings: Settings): string | null {
  if (!scan) return null; // Existing Queue policy defers absent scans to preparation.
  const node = (id: string, version: string) => scan.customNodes.some(n => n.id === id && n.installed && n.compatibilityState !== "error" && releaseVersionAtLeast(n.version, version));
  if (!scan.modelProfiles.some(p => p.id === "minimax_h3_fl2va" && p.available) || !node("h3-continuum", "3.10.2") || !node("local-video-studio-h3-av", "0.4.0")) {
    return createTranslator(settings.uiLocale).t(uiKeys.create.editor.blockDependencies);
  }
  return null;
}
