import { parseContinuumGroupReceipt, type ContinuumGroupReceipt } from "./group-checkpoint.js";
import { assertContinuumGroupProfile, type ContinuumGroupProfile } from "./group-workflow.js";
import type { AssetVersion } from "../../types.js";

/** A verified completed group Run; distinct from legacy managed Sequence/JointAV. */
export interface LongVideoRunSource {
  schemaVersion: 1;
  sourceAssetId: string;
  sourceVersionId: string;
  profile: ContinuumGroupProfile;
  receipt: ContinuumGroupReceipt;
}

export function assertLongVideoRunSource(source: LongVideoRunSource): void {
  if (source.schemaVersion !== 1 || ![source.sourceAssetId, source.sourceVersionId].every(id => /^[A-Za-z0-9_-]{1,150}$/u.test(id))) throw new Error("Invalid group Run source identity");
  const receipt = parseContinuumGroupReceipt(source.receipt);
  if (!receipt.sequence_complete || !receipt.final_output || receipt.accepted_chunks !== receipt.planned_chunks || receipt.accepted_chunks >= 16) {
    throw new Error("Group Run source must be complete with remaining capacity");
  }
  assertContinuumGroupProfile(source.profile, receipt.accepted_chunks);
  if (!source.profile.firstImage?.trim()) throw new Error("Group Run source lost its original first image");
}

/** Every sampling input except future prompts stays fixed when adding chunks. */
export function longVideoProfileIdentity(profile: ContinuumGroupProfile): string {
  const h = profile.h3;
  return JSON.stringify([profile.diffusionModel, profile.textEncoder, profile.videoVae, profile.width, profile.height,
    profile.seed, profile.steps, profile.sampler, profile.scheduler, profile.chunkSeconds, profile.firstImage,
    profile.attention, profile.lora?.filename, profile.lora?.strength, profile.spectrumMode ?? "off", ...(h ? [[h.modelId,
      h.videoLoras.map(l => [l.id, l.filename, l.strength, l.promptPrefixes ?? []]), h.sparseAttentionMode, h.runtimeMode,
      h.comfyCompilerMode, h.spectrumModelAwareMode]] : [])]);
}

/** Resolve from a saved version, never from the displayed MP4 or inferred latent. */
export function longVideoRunSourceForVersion(assetId: string, version: AssetVersion): LongVideoRunSource {
  const execution = version.longVideoExecution, receipt = version.longVideoReceipt;
  if (!execution || !receipt || execution.executionId !== receipt.execution_id || execution.projectId !== receipt.project_id || execution.runName !== receipt.run_name ||
      execution.script.layout.totalChunks !== receipt.accepted_chunks) throw new Error("History version has no matching group Run source");
  const source: LongVideoRunSource = { schemaVersion: 1, sourceAssetId: assetId, sourceVersionId: version.id,
    profile: structuredClone(execution.profile), receipt: structuredClone(receipt) };
  assertLongVideoRunSource(source);
  return source;
}
