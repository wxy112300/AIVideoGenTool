import type { AssetVersion, Draft } from "../../types.js";
import { H3_BASE_RESOLUTIONS } from "../video-resolution.js";
import { normalizeH3Steps } from "../workflow.js";
import { proposeLongVideoExtension } from "./layout.js";
import { longVideoRunSourceForVersion } from "./run-source.js";
import { createLongVideoScript, type ScriptIdFactory } from "./script.js";
import { continuumProfileLoras } from "./group-workflow.js";

/** History Continue preserves the Run, rather than resetting seed or re-encoding its tail. */
export function longVideoContinuationDraft(current: Draft, assetId: string, version: AssetVersion, filename: string, id: ScriptIdFactory): Draft {
  const source = longVideoRunSourceForVersion(assetId, version), profile = source.profile;
  const resolution = H3_BASE_RESOLUTIONS.find(value => Math.round(value / 32) * 32 === Math.min(profile.width, profile.height));
  const videoLoras = continuumProfileLoras(profile);
  const steps = normalizeH3Steps(profile.steps, profile.h3?.modelId ?? "minimax_h3_continuum", videoLoras);
  if (!resolution || steps !== profile.steps) throw new Error("This group Run size/steps cannot be edited by the continuation route");
  const script = createLongVideoScript(proposeLongVideoExtension(profile.chunkSeconds, source.receipt.accepted_chunks, profile.chunkSeconds).layout, id);
  if (version.longVideoExecution?.script.sharedPreamble) {
    script.brief.versions[0]!.text = version.longVideoExecution.script.pages[0]?.text ?? "";
    script.sharedPreamble = true;
  }
  return { ...current, inputMode: "video", modelId: "minimax_h3_continuum", sourceVideoPath: filename,
    sourceVideoDuration: version.duration, trimStartSeconds: 0, trimEndSeconds: version.duration,
    sourceAssetId: assetId, sourceVersionId: version.id, sourceWidth: profile.width, sourceHeight: profile.height,
    startImagePath: "", endImagePath: "", endImageWidth: 0, endImageHeight: 0, h3ReferenceSlots: [],
    h3ContinuumArtifactPath: undefined, h3ContinuumArtifact: undefined, h3ContinuumMode: undefined,
    h3ContinuumSequence: undefined, h3ContextLatentPath: undefined, h3MotionContextAsset: undefined,
    h3ContinuumReviewAction: undefined, h3ContinuumRerollFromChunk: undefined, h3ContinuumTakeGroup: undefined,
    h3ContinuumTakeRevisionId: undefined, h3ContinuumTakeAction: undefined,
    spectrumMode: profile.spectrumMode ?? "off", spectrumModeUserSet: true, videoLoras, frameInterpolation: "off", ratio: "source",
    spectrumModelAwareMode: profile.h3?.spectrumModelAwareMode ?? "off",
    seed: profile.seed, steps, resolution, longVideoRunSource: source, longVideoScript: script,
    longVideoEditor: { key: "minimax_h3_continuum:video", active: true, confirmed: false, seeded: true, seconds: profile.chunkSeconds, count: 1 } };
}
