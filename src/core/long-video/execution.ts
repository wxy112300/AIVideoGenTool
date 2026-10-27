import { compileLongVideoPrompts, freezeLongVideoScript, type LongVideoScript } from "./script.js";
import { assertContinuumGroupProfile, type ContinuumGroupProfile } from "./group-workflow.js";
import { assertLongVideoLayout } from "./layout.js";
import { assertLongVideoRunSource, longVideoProfileIdentity, type LongVideoRunSource } from "./run-source.js";
import { videoPromptForLoras } from "../video-loras.js";

export interface LongVideoExecutionSnapshot {
  schemaVersion: 1;
  taskId: string;
  executionId: string;
  projectId: string;
  runName: string;
  script: ReturnType<typeof freezeLongVideoScript>;
  /** Explicit adopted sampler prompts/profile; no live Draft or Settings reads. */
  profile: ContinuumGroupProfile;
  parent?: LongVideoRunSource;
}

/** Internal new-Run snapshot. Existing managed Extend stays on its old path until adapted. */
export function freezeLongVideoExecution(taskId: string, executionId: string, script: LongVideoScript, profile: ContinuumGroupProfile): LongVideoExecutionSnapshot {
  const frozen = freezeLongVideoScript(script);
  const snapshot: LongVideoExecutionSnapshot = structuredClone({ schemaVersion: 1, taskId, executionId, projectId: `lvs_${executionId}`, runName: `lvs_${executionId}`, script: frozen, profile });
  assertLongVideoExecutionSnapshot(snapshot);
  return snapshot;
}

/** Add only future prompts; the original image/seed/profile and Run identity are inherited. */
export function freezeLongVideoExtension(taskId: string, executionId: string, script: LongVideoScript, input: LongVideoRunSource): LongVideoExecutionSnapshot {
  return freezeLongVideoExtensionPlan(taskId, executionId, freezeLongVideoScript(script), input);
}

export function freezeLongVideoExtensionPlan(taskId: string, executionId: string, plan: ReturnType<typeof freezeLongVideoScript>, input: LongVideoRunSource): LongVideoExecutionSnapshot {
  const parent = structuredClone(input);
  assertLongVideoRunSource(parent);
  const frozen = structuredClone(plan);
  const snapshot: LongVideoExecutionSnapshot = { schemaVersion: 1, taskId, executionId, parent,
    projectId: parent.receipt.project_id, runName: parent.receipt.run_name, script: frozen,
    profile: { ...parent.profile, prompts: [...parent.profile.prompts, ...compileLongVideoPrompts(frozen).map(p => videoPromptForLoras(p, parent.profile.h3?.videoLoras))] } };
  assertLongVideoExecutionSnapshot(snapshot);
  return structuredClone(snapshot);
}

export function assertLongVideoExecutionSnapshot(snapshot: LongVideoExecutionSnapshot): void {
  if (snapshot.schemaVersion !== 1 || ![snapshot.taskId, snapshot.executionId].every(id => /^[A-Za-z0-9_-]{1,150}$/u.test(id))) throw new Error("Invalid parent execution identity");
  assertLongVideoLayout(snapshot.script.layout);
  const parent = snapshot.parent;
  if (snapshot.script.layout.origin === "create") {
    if (parent || snapshot.projectId !== `lvs_${snapshot.executionId}` || snapshot.runName !== snapshot.projectId) throw new Error("Invalid parent execution identity");
  } else {
    if (!parent) throw new Error("Existing-Run execution requires a verified source");
    assertLongVideoRunSource(parent);
    if (parent.receipt.execution_id === snapshot.executionId || snapshot.projectId !== parent.receipt.project_id || snapshot.runName !== parent.receipt.run_name ||
        snapshot.script.layout.prefixChunks !== parent.receipt.accepted_chunks || snapshot.script.layout.chunkSeconds !== parent.profile.chunkSeconds ||
        longVideoProfileIdentity(snapshot.profile) !== longVideoProfileIdentity(parent.profile) ||
        parent.profile.prompts.some((prompt, index) => snapshot.profile.prompts[index] !== prompt)) throw new Error("Existing-Run frozen source/profile changed");
  }
  const pages = snapshot.script.pages;
  const adopted = compileLongVideoPrompts(snapshot.script);
  const samplingPrompts = snapshot.profile.h3 ? adopted.map(p => videoPromptForLoras(p, snapshot.profile.h3!.videoLoras)) : adopted;
  if (pages.length !== snapshot.script.layout.chunks + 1 || new Set(pages.map(p => p.pageId)).size !== pages.length ||
      pages.some(page => !page.pageId || !page.versionId) || !snapshot.profile.firstImage?.trim() || snapshot.profile.chunkSeconds !== snapshot.script.layout.chunkSeconds ||
      snapshot.profile.prompts.slice(snapshot.script.layout.prefixChunks).some((prompt, index) => prompt !== samplingPrompts[index])) throw new Error("Incomplete or mismatched adopted new-Run profile/image");
  assertContinuumGroupProfile(snapshot.profile, snapshot.script.layout.totalChunks);
}

export interface LongVideoMediaEvidence {
  files: Array<{ path: string; bytes: number; sha256: string }>;
  videoFrames: number;
  audioContentSamples: number;
  audioSampleRate: number;
  codecPaddingSamples: number;
  fullDecode: true;
}

/** Extend requests new seconds, while the saved movie covers the entire accepted Run. */
export function longVideoOutputFrames(snapshot: LongVideoExecutionSnapshot): number {
  return snapshot.script.layout.origin === "extend" ? Math.round(snapshot.script.layout.totalChunks * snapshot.profile.chunkSeconds * 24) : snapshot.script.layout.targetFrames;
}

export function assertLongVideoMediaEvidence(snapshot: LongVideoExecutionSnapshot, evidence: LongVideoMediaEvidence): void {
  const target = longVideoOutputFrames(snapshot);
  if (evidence.fullDecode !== true || !evidence.files.length || evidence.files.some(file => !file.path.trim() || !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || !/^[a-f0-9]{64}$/u.test(file.sha256)) ||
      !Number.isSafeInteger(evidence.videoFrames) || Math.abs(evidence.videoFrames - target) > 1 ||
      !Number.isSafeInteger(evidence.audioSampleRate) || evidence.audioSampleRate < 1 ||
      !Number.isSafeInteger(evidence.audioContentSamples) || Math.abs(evidence.audioContentSamples - Math.round(target * evidence.audioSampleRate / 24)) > 1 ||
      !Number.isSafeInteger(evidence.codecPaddingSamples) || evidence.codecPaddingSamples < 0) throw new Error("Unverified final video/audio evidence");
}
