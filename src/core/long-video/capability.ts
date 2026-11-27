import type { Draft, EnvironmentScanResult, Settings } from "../../types.js";
import { createTranslator } from "../i18n.js";
import { uiKeys } from "../i18n-keys.js";
import { releaseVersionAtLeast } from "../release-version.js";
import { commitScriptText } from "./script-buffers.js";
import { freezeLongVideoScript } from "./script.js";
import { assertLongVideoRunSource } from "./run-source.js";
import { continuumProfileLoras, isContinuumFl2vaModel, isContinuumReferenceModel } from "./group-workflow.js";
import { PI_H3_MODEL_ID } from "../catalog/models/minimax_h3_pi/definition.js";
import { piH3DependencyBlockReason } from "../pi-h3.js";
import { videoLoraConfigurationIssues } from "../video-loras.js";
import { resolveH3ExecutionPolicy } from "../h3-execution-policy.js";
import { activeH3TimedGuides, h3ReferenceTimedGuides, isH3TimedGuideConfigured, missingH3GuideReference } from "../h3-timed-guides.js";
import { missingH3VideoReference } from "../h3-reference.js";
import { longVideoGuideIssue } from "./timed-guides.js";

/** A remembered editor for another model must not hijack the selected native route. */
export function isLongVideoDraftActive(draft: Pick<Draft, "modelId" | "longVideoEditor"> & Partial<Pick<Draft, "inputMode">>): boolean {
  return draft.longVideoEditor?.active === true && [ `${draft.modelId}:${draft.inputMode}`, `${draft.modelId}:undefined` ].includes(draft.longVideoEditor.key);
}

export function longVideoUsesTimedGuides(draft: Draft): boolean {
  if (draft.inputMode === "video") {
    const profile = draft.longVideoRunSource?.profile;
    return Boolean(profile?.timedGuides?.some(guide => guide.absoluteFrame !== 0 || !profile.firstImage));
  }
  return Boolean(activeH3TimedGuides(draft)?.slots.some(slot => slot.mediaPath &&
    (slot.seconds === "end" || (typeof slot.seconds === "number" && Math.round(slot.seconds * 24) !== 0))) ||
    h3ReferenceTimedGuides(draft).length);
}

/** Narrow first executable route; unsupported choices remain available natively. */
export function longVideoBlockReason(draft: Draft, settings: Settings): string | null {
  const t = createTranslator(settings.uiLocale).t, k = uiKeys.create.editor;
  const guides = activeH3TimedGuides(draft);
  const referenceModel = isContinuumReferenceModel(draft.modelId);
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
    if (draft.inputMode !== "image" || (!referenceModel && !isContinuumFl2vaModel(draft.modelId))) return t(k.blockRoute);
    if (referenceModel) {
      const filled = draft.h3ReferenceSlots.filter(slot => slot.mediaPath.trim());
      if (filled.some(slot => slot.mediaType === "video")) return t(k.blockReferences);
      if (filled.length > 9) return t(uiKeys.taskSubmission.r2vLimit);
    }
  }
  if (!source) {
    const issue = videoLoraConfigurationIssues({ modelId: draft.modelId, inputMode: "image", videoLoras: draft.videoLoras,
      spectrumMode: draft.spectrumMode, attentionMode: settings.h3AttentionMode, locale: settings.uiLocale }).find(i => i.severity === "error");
    if (issue) return issue.message;
    const policy = resolveH3ExecutionPolicy({ modelId: draft.modelId, inputMode: "image", videoLoras: draft.videoLoras,
      attentionMode: settings.h3AttentionMode, sparseAttentionMode: settings.h3SparseAttentionMode, runtimeMode: settings.h3RuntimeMode,
      comfyCompilerMode: settings.h3ComfyCompilerMode, spectrumMode: draft.spectrumMode });
    if (!policy.allowed) return t(k.blockSparseWeights);
  }
  if (!draft.longVideoEditor?.confirmed || !draft.longVideoScript) return t(k.blockLayout);
  try {
    const frozen = freezeLongVideoScript(commitScriptText(draft.longVideoScript, () => crypto.randomUUID()));
    const referenceGuides = referenceModel ? h3ReferenceTimedGuides(draft) : [];
    const timed = guides?.slots ?? referenceGuides;
    if (guides || timed.length) {
      const issue = longVideoGuideIssue(timed, frozen.layout);
      if (issue) return t(uiKeys.create.guides[issue]);
    }
    const pictures = guides?.slots.filter(isH3TimedGuideConfigured);
    for (const page of frozen.pages) {
      const reference = referenceModel ? missingH3VideoReference(page.text, draft.h3ReferenceSlots) : undefined;
      if (reference) return t(uiKeys.create.guides.invalidReference, { reference });
      const picture = pictures && missingH3GuideReference(page.text, pictures);
      if (picture) return t(uiKeys.create.guides.reference, { picture });
    }
    if (source && (frozen.layout.origin !== "extend" || frozen.layout.prefixChunks !== source.receipt.accepted_chunks || frozen.layout.chunkSeconds !== source.profile.chunkSeconds)) return t(k.blockLayout);
  }
  catch { return t(k.blockScript); }
  return null;
}

/** Offline files/version readiness only. Actual node schema is checked before POST. */
export function longVideoDependencyBlockReason(
  scan: EnvironmentScanResult | null | undefined, settings: Settings, modelId = "minimax_h3_fl2va", timedGuides = false, steps?: number
): string | null {
  if (!scan) return null; // Existing Queue policy defers absent scans to preparation.
  if (modelId === PI_H3_MODEL_ID) {
    const reason = piH3DependencyBlockReason(scan, steps, settings.uiLocale, true);
    if (reason) return reason;
  }
  const node = (id: string, version: string) => scan.customNodes.some(n => n.id === id && n.installed && n.compatibilityState !== "error" && releaseVersionAtLeast(n.version, version));
  if (!scan.modelProfiles.some(p => p.id === modelId && p.available) || !node("h3-continuum", "3.10.2") || !node("local-video-studio-h3-av", "0.4.0")) {
    return createTranslator(settings.uiLocale).t(uiKeys.create.editor.blockDependencies);
  }
  if (timedGuides && !node("local-video-studio-h3-av", "0.4.4")) {
    return createTranslator(settings.uiLocale).t(uiKeys.create.editor.blockTimedDependencies);
  }
  return null;
}
