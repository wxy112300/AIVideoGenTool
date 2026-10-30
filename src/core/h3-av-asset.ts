import { createTranslator, type Translate } from "./i18n.js";
import { uiKeys } from "./i18n-keys.js";
import type {
  ContinuumChunkPointer,
  ContinuumSequence,
  ContinuumSequenceChunk,
  H3AvCapability,
  H3AvLatentAsset,
  H3AvSampleScope,
  H3AvStorageKind,
  H3ContinuumReceipt,
  HistoryFile,
  NativeAvArtifactRole
} from "../types.js";

import { validateContinuumSamplingEvidence } from "./h3-continuum-managed-receipt.js";

export const H3_AV_LATENT_ASSET_SCHEMA_VERSION = 1 as const;
export const H3_CONTINUUM_SEQUENCE_SCHEMA_VERSION = 1 as const;
export const H3_CONTINUUM_RECEIPT_SCHEMA_VERSION = 1 as const;

const sha256Pattern = /^[a-f0-9]{64}$/u;
const assetIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/u;
const storageKinds = new Set<H3AvStorageKind>([
  "app-canonical",
  "continuum-run-chunk",
  "legacy-joint-av",
  "legacy-motion-context"
]);
const capabilities = new Set<H3AvCapability>([
  "native-av",
  "motion-context",
  "continuum-bootstrap",
  "continuum-managed-chunk"
]);
const sampleScopes = new Set<H3AvSampleScope>([
  "generated-clip",
  "extension-segment",
  "continuum-chunk"
]);
const artifactRoles = new Set<NativeAvArtifactRole>([
  "first-pass-clean-av",
  "final-clean-av",
  "extend-segment-clean-av"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isShape(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.every(isPositiveInteger);
}

function isHistoryFile(value: unknown): value is HistoryFile {
  return isRecord(value) &&
    isSafeString(value.filename) &&
    isSafeString(value.subfolder) &&
    value.type === "output" &&
    (value.absolutePath === undefined || isSafeString(value.absolutePath));
}

/** Return a root-relative output path, or null for an unsafe persisted path. */
export function safeH3OutputRelativePath(value: unknown): string | null {
  if (!isHistoryFile(value)) return null;
  const subfolder = value.subfolder.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "");
  const filename = value.filename.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "");
  const combined = `${subfolder}/${filename}`;
  const parts = combined.split("/");
  if (!subfolder || !filename || parts.some((part) => !part || part === "." || part === ".." || part.includes(":"))) {
    return null;
  }
  if (combined.startsWith("/") || /^[A-Za-z]:/u.test(combined)) return null;
  return combined;
}

function validateProducer(value: unknown, t: Translate): string | null {
  if (!isRecord(value)) return t(uiKeys.h3Validation.object, { subject: "producer" });
  for (const field of [
    "workflowId",
    "workflowRevision",
    "producerNodeId",
    "producerNodeVersion",
    "executionModelId",
    "diffusionModelFilename",
    "textEncoderFilename",
    "videoVaeFilename",
    "audioVaeFilename"
  ]) {
    if (!isSafeString(value[field])) return t(uiKeys.h3Validation.missing, { field: `producer.${field}` });
  }
  if (!Array.isArray(value.loraFilenames) || !value.loraFilenames.every(isSafeString)) {
    return t(uiKeys.h3Validation.invalid, { field: "producer.loraFilenames" });
  }
  if (!isPositiveInteger(value.width) || !isPositiveInteger(value.height)) return t(uiKeys.h3Validation.producerGeometry);
  if (value.width % 32 !== 0 || value.height % 32 !== 0) return t(uiKeys.h3Validation.producerAlignment);
  if (value.fps !== 24 || !isPositiveInteger(value.frameCount)) return t(uiKeys.h3Validation.invalid, { field: "producer fps/frameCount" });
  if (value.sourceTaskId !== undefined && !isSafeString(value.sourceTaskId)) return t(uiKeys.h3Validation.invalid, { field: "producer.sourceTaskId" });
  if (value.sourceVersionId !== undefined && !isSafeString(value.sourceVersionId)) return t(uiKeys.h3Validation.invalid, { field: "producer.sourceVersionId" });
  if (value.legacyUnverified !== undefined && typeof value.legacyUnverified !== "boolean") {
    return t(uiKeys.h3Validation.invalid, { field: "producer.legacyUnverified" });
  }
  return null;
}

function validateChunkPointer(value: unknown, t: Translate): string | null {
  if (!isRecord(value)) return t(uiKeys.h3Validation.object, { subject: "continuumChunk" });
  for (const field of ["projectId", "runName", "revisionId", "recordFilename"]) {
    if (!isSafeString(value[field])) return t(uiKeys.h3Validation.missing, { field: `continuumChunk.${field}` });
  }
  if (!isHistoryFile(value.runStorageRoot) || !safeH3OutputRelativePath(value.runStorageRoot)) {
    return t(uiKeys.h3Validation.invalid, { field: "continuumChunk.runStorageRoot" });
  }
  if (!isHistoryFile(value.manifest) || !safeH3OutputRelativePath(value.manifest)) {
    return t(uiKeys.h3Validation.invalid, { field: "continuumChunk.manifest" });
  }
  for (const field of ["logicalChunkIndex", "physicalGroupStart", "physicalGroupEnd"]) {
    if (!isPositiveInteger(value[field])) return t(uiKeys.h3Validation.invalid, { field: `continuumChunk.${field}` });
  }
  const physicalGroupStart = value.physicalGroupStart;
  const physicalGroupEnd = value.physicalGroupEnd;
  if (!isPositiveInteger(physicalGroupStart) || !isPositiveInteger(physicalGroupEnd)) return t(uiKeys.h3Validation.invalid, { field: "continuumChunk physical group" });
  if (physicalGroupEnd < physicalGroupStart) return t(uiKeys.h3Validation.groupOrder);
  if (value.takeId !== undefined && !isSafeString(value.takeId)) return t(uiKeys.h3Validation.invalid, { field: "continuumChunk.takeId" });
  if (value.branchId !== undefined && !isSafeString(value.branchId)) return t(uiKeys.h3Validation.invalid, { field: "continuumChunk.branchId" });
  if (typeof value.accepted !== "boolean" || typeof value.reused !== "boolean") {
    return t(uiKeys.h3Validation.invalid, { field: "continuumChunk accepted/reused" });
  }
  return null;
}

function validateCapabilities(
  value: unknown,
  storageKind: H3AvStorageKind,
  producer: Record<string, unknown>,
  t: Translate
): string | null {
  if (!Array.isArray(value) || value.length === 0 || !value.every((item) => capabilities.has(item as H3AvCapability))) {
    return t(uiKeys.h3Validation.invalid, { field: "capabilities" });
  }
  const entries = value as H3AvCapability[];
  if (storageKind === "continuum-run-chunk" && !entries.includes("continuum-managed-chunk")) {
    return t(uiKeys.h3Validation.managedCapability);
  }
  if (storageKind === "legacy-joint-av" && !entries.includes("continuum-bootstrap") && !entries.includes("native-av")) {
    return t(uiKeys.h3Validation.legacyCapability);
  }
  if (storageKind === "legacy-motion-context" && !entries.includes("motion-context")) {
    return t(uiKeys.h3Validation.motionCapability);
  }
  if ((storageKind === "legacy-joint-av" || storageKind === "legacy-motion-context") && producer.legacyUnverified !== true) {
    return t(uiKeys.h3Validation.legacyFlag);
  }
  return null;
}

export function validateH3AvLatentAsset(value: unknown, t: Translate = createTranslator().t): string | null {
  if (!isRecord(value)) return t(uiKeys.h3Validation.object, { subject: "H3 AV asset" });
  if (value.schemaVersion !== H3_AV_LATENT_ASSET_SCHEMA_VERSION) return t(uiKeys.h3Validation.schema, { subject: "H3 AV asset" });
  if (!isSafeString(value.assetId) || !assetIdPattern.test(value.assetId)) return t(uiKeys.h3Validation.invalid, { field: "assetId" });
  if (!storageKinds.has(value.storageKind as H3AvStorageKind)) return t(uiKeys.h3Validation.invalid, { field: "storageKind" });
  if (!isHistoryFile(value.ownerPath) || !safeH3OutputRelativePath(value.ownerPath)) return t(uiKeys.h3Validation.ownerUnsafe);
  if (value.aliasPaths !== undefined && (!Array.isArray(value.aliasPaths) || !value.aliasPaths.every((item) => isHistoryFile(item) && safeH3OutputRelativePath(item)))) {
    return t(uiKeys.h3Validation.invalid, { field: "aliasPaths" });
  }
  if (value.aliasMode !== undefined && value.aliasMode !== "hardlink" && value.aliasMode !== "copy-fallback") {
    return t(uiKeys.h3Validation.invalid, { field: "aliasMode" });
  }
  if (value.aliasMode !== undefined && (!Array.isArray(value.aliasPaths) || value.aliasPaths.length === 0)) {
    return t(uiKeys.h3Validation.aliasesRequired);
  }
  if (!isPositiveInteger(value.payloadBytes)) return t(uiKeys.h3Validation.invalid, { field: "payloadBytes" });
  for (const field of ["payloadSha256", "videoTensorSha256", "audioTensorSha256"]) {
    if (!sha256Pattern.test(String(value[field] ?? ""))) return t(uiKeys.h3Validation.invalid, { field: `${field}` });
  }
  if (!isShape(value.videoShape) || !isSafeString(value.videoDtype)) return t(uiKeys.h3Validation.invalid, { field: "video shape/dtype" });
  if (!isShape(value.audioShape) || !isSafeString(value.audioDtype)) return t(uiKeys.h3Validation.invalid, { field: "audio shape/dtype" });
  if (!isPositiveInteger(value.width) || !isPositiveInteger(value.height) || value.width % 32 !== 0 || value.height % 32 !== 0) {
    return t(uiKeys.h3Validation.assetGeometry);
  }
  if (value.fps !== 24 || !isPositiveInteger(value.frameCount)) return t(uiKeys.h3Validation.invalid, { field: "asset fps/frameCount" });
  if (value.sampleScope !== undefined && !sampleScopes.has(value.sampleScope as H3AvSampleScope)) {
    return t(uiKeys.h3Validation.invalid, { field: "sampleScope" });
  }
  if (value.artifactRole !== undefined && !artifactRoles.has(value.artifactRole as NativeAvArtifactRole)) {
    return t(uiKeys.h3Validation.invalid, { field: "artifactRole" });
  }
  if (value.contextFrames !== undefined && !isNonNegativeInteger(value.contextFrames)) {
    return t(uiKeys.h3Validation.invalid, { field: "contextFrames" });
  }
  const producerError = validateProducer(value.producer, t);
  if (producerError) return producerError;
  const capabilityError = validateCapabilities(value.capabilities, value.storageKind as H3AvStorageKind, value.producer as Record<string, unknown>, t);
  if (capabilityError) return capabilityError;
  if (value.storageKind === "continuum-run-chunk") {
    const pointerError = validateChunkPointer(value.continuumChunk, t);
    if (pointerError) return pointerError;
  } else if (value.continuumChunk !== undefined) {
    return t(uiKeys.h3Validation.unexpectedPointer);
  }
  if (!isSafeString(value.createdAt)) return t(uiKeys.h3Validation.missing, { field: "createdAt" });
  return null;
}

export function isH3AvLatentAsset(value: unknown): value is H3AvLatentAsset {
  return validateH3AvLatentAsset(value) === null;
}

function validateReceiptChunk(value: unknown, t: Translate): string | null {
  if (!isRecord(value)) return t(uiKeys.h3Validation.object, { subject: "receipt chunk" });
  if (!isPositiveInteger(value.logicalChunkIndex) || !isSafeString(value.recordFilename)) return t(uiKeys.h3Validation.invalid, { field: "receipt chunk index/record" });
  if (!isHistoryFile(value.payloadPath) || !safeH3OutputRelativePath(value.payloadPath)) return t(uiKeys.h3Validation.invalid, { field: "receipt chunk payloadPath" });
  if (value.payloadSha256 !== undefined && !sha256Pattern.test(String(value.payloadSha256))) return t(uiKeys.h3Validation.invalid, { field: "receipt chunk payloadSha256" });
  if (typeof value.reused !== "boolean" || typeof value.generated !== "boolean") return t(uiKeys.h3Validation.invalid, { field: "receipt chunk reused/generated" });
  if (value.reused === value.generated) return t(uiKeys.h3Validation.chunkExclusive);
  return null;
}

export function validateH3ContinuumReceipt(value: unknown, t: Translate = createTranslator().t): string | null {
  if (!isRecord(value)) return t(uiKeys.h3Validation.object, { subject: "Continuum receipt" });
  if (value.schemaVersion !== H3_CONTINUUM_RECEIPT_SCHEMA_VERSION) return t(uiKeys.h3Validation.schema, { subject: "Continuum receipt" });
  for (const field of ["projectId", "runName", "revisionId", "packageVersion"]) {
    if (!isSafeString(value[field])) return t(uiKeys.h3Validation.missing, { field: `receipt.${field}` });
  }
  if (!isHistoryFile(value.runStorageRoot) || !safeH3OutputRelativePath(value.runStorageRoot)) return t(uiKeys.h3Validation.invalid, { field: "receipt.runStorageRoot" });
  if (value.generationMode !== "Review Each Chunk" || value.runStorage !== "Save + Auto Resume") return t(uiKeys.h3Validation.reviewProof);
  if (value.reviewAction !== undefined && value.reviewAction !== "Continue / Next" && value.reviewAction !== "Regenerate Current" && value.reviewAction !== "Finish Remaining") return t(uiKeys.h3Validation.invalid, { field: "receipt.reviewAction" });
  if (value.selectedSource !== "run_storage" || value.freshFallback !== false) return t(uiKeys.h3Validation.sourceProof);
  for (const field of ["runStorageSchemaVersion", "requestedChunks", "reusedCount", "generatedCount", "firstGeneratedChunk"]) {
    if (!isNonNegativeInteger(value[field])) return t(uiKeys.h3Validation.invalid, { field: `receipt.${field}` });
  }
  const samplingError = validateContinuumSamplingEvidence(value, t);
  if (samplingError) return samplingError;
  const requestedChunks = value.requestedChunks;
  const reusedCount = value.reusedCount;
  const generatedCount = value.generatedCount;
  if (!isNonNegativeInteger(requestedChunks) || !isNonNegativeInteger(reusedCount) || !isNonNegativeInteger(generatedCount)) return t(uiKeys.h3Validation.invalid, { field: "managed receipt counts" });
  if (requestedChunks <= 0 || generatedCount !== 1 || reusedCount + generatedCount !== requestedChunks) {
    return t(uiKeys.h3Validation.singleGroup);
  }
  for (const field of ["reusedChunkIndices", "generatedChunkIndices"]) {
    if (!Array.isArray(value[field]) || !value[field].every(isPositiveInteger)) return t(uiKeys.h3Validation.invalid, { field: `receipt.${field}` });
  }
  const generatedChunkIndices = value.generatedChunkIndices;
  const firstGeneratedChunk = value.firstGeneratedChunk;
  if (!Array.isArray(generatedChunkIndices) || !isNonNegativeInteger(firstGeneratedChunk)) return t(uiKeys.h3Validation.invalid, { field: "receipt generated chunk facts" });
  if (generatedChunkIndices.length !== 1 || generatedChunkIndices[0] !== firstGeneratedChunk) return t(uiKeys.h3Validation.generatedMismatch);
  if (firstGeneratedChunk !== reusedCount + 1 || (value.reusedChunkIndices as unknown[]).length !== reusedCount) return t(uiKeys.h3Validation.prefixMismatch);
  if (!Array.isArray(value.chunkRecords) || value.chunkRecords.length !== requestedChunks) return t(uiKeys.h3Validation.recordsMismatch);
  for (let index = 0; index < value.chunkRecords.length; index += 1) {
    const record = value.chunkRecords[index]!;
    const error = validateReceiptChunk(record, t);
    if (error) return error;
    if (record.logicalChunkIndex !== index + 1 ||
        record.reused !== (index + 1 <= reusedCount) ||
        record.generated !== (index + 1 === firstGeneratedChunk)) {
      return t(uiKeys.h3Validation.recordPrefix);
    }
  }
  for (const field of ["actualAssemblyTotalFrames", "actualAssemblyTrims", "actualAssemblyNetFrames", "actualAssemblyContextFrames"]) {
    if (!Array.isArray(value[field]) || value[field].length === 0 || !value[field].every(isNonNegativeInteger)) return t(uiKeys.h3Validation.invalid, { field: `receipt.${field}` });
  }
  if (typeof value.spectrumMode !== "string" || !value.spectrumMode.trim() || typeof value.spectrumModelAwareMode !== "string" || !value.spectrumModelAwareMode.trim()) return t(uiKeys.h3Validation.invalid, { field: "receipt Spectrum facts" });
  if (value.continuumInteropApi !== undefined && !isPositiveInteger(value.continuumInteropApi)) return t(uiKeys.h3Validation.invalid, { field: "receipt continuumInteropApi" });
  if (!isSafeString(value.createdAt)) return t(uiKeys.h3Validation.missing, { field: "receipt.createdAt" });
  return null;
}

export function isH3ContinuumReceipt(value: unknown): value is H3ContinuumReceipt {
  return validateH3ContinuumReceipt(value) === null;
}

/** Validate a managed sequence without changing or importing old history. */
export function validateContinuumSequence(value: unknown, t: Translate = createTranslator().t): string | null {
  if (!isRecord(value)) return t(uiKeys.sequenceValidation.notObject);
  if (value.schemaVersion !== H3_CONTINUUM_SEQUENCE_SCHEMA_VERSION) return t(uiKeys.sequenceValidation.schema);
  for (const field of ["sequenceId", "projectId", "runName", "packageVersion", "workflowRevision"]) {
    if (!isSafeString(value[field])) return t(uiKeys.sequenceValidation.missingField, { field });
  }
  if (!isSafeString(value.promptFormat) || value.promptFormat !== "Timeline") return t(uiKeys.sequenceValidation.promptFormat);
  for (const field of ["runStorageSchemaVersion", "targetChunks", "acceptedChunks"]) {
    if (!isNonNegativeInteger(value[field])) return t(uiKeys.sequenceValidation.invalidField, { field });
  }
  if (!isPositiveNumber(value.chunkSeconds) || value.fps !== 24 || !isPositiveInteger(value.width) || !isPositiveInteger(value.height) || !isNonNegativeInteger(value.baseSeed)) return t(uiKeys.sequenceValidation.sampling);
  const samplingError = validateContinuumSamplingEvidence(value, t);
  if (samplingError) return samplingError;
  const targetChunks = value.targetChunks;
  const acceptedChunks = value.acceptedChunks;
  if (!isNonNegativeInteger(targetChunks) || !isNonNegativeInteger(acceptedChunks)) return t(uiKeys.sequenceValidation.target);
  if (value.width % 32 !== 0 || value.height % 32 !== 0 || targetChunks < 1 || acceptedChunks > targetChunks) return t(uiKeys.sequenceValidation.geometry);
  if (!isRecord(value.canonicalHead) || !isSafeString(value.canonicalHead.revisionId)) return t(uiKeys.sequenceValidation.head);
  if (!Array.isArray(value.chunks)) return t(uiKeys.sequenceValidation.chunks);
  let previousIndex = 0;
  for (const chunk of value.chunks) {
    if (!isRecord(chunk) || !isPositiveInteger(chunk.logicalChunkIndex) || chunk.logicalChunkIndex !== previousIndex + 1) return t(uiKeys.sequenceValidation.indices);
    previousIndex = chunk.logicalChunkIndex;
    if (!isRecord(chunk.prompt) || !isSafeString(chunk.prompt.userPrompt) || !isSafeString(chunk.prompt.finalPrompt) || !isSafeString(chunk.prompt.promptHash)) return t(uiKeys.sequenceValidation.prompt);
  }
  if (!isSafeString(value.updatedAt)) return t(uiKeys.sequenceValidation.updatedAt);
  return null;
}

export function isManagedContinuumSequence(value: unknown): value is ContinuumSequence {
  return validateContinuumSequence(value) === null;
}

/** A managed extend may only append one final Chunk to an accepted prefix. */
export function validateContinuumAppend(
  previous: ContinuumSequence,
  next: ContinuumSequence,
  t: Translate = createTranslator().t
): string | null {
  const previousError = validateContinuumSequence(previous, t);
  if (previousError) return t(uiKeys.h3Validation.previousInvalid, { reason: previousError });
  const nextError = validateContinuumSequence(next, t);
  if (nextError) return t(uiKeys.h3Validation.nextInvalid, { reason: nextError });
  if (previous.sequenceId !== next.sequenceId || previous.projectId !== next.projectId || previous.runName !== next.runName) return t(uiKeys.h3Validation.identityChanged);
  if (next.targetChunks !== previous.targetChunks + 1) return t(uiKeys.h3Validation.oneChunk);
  if (next.chunks.length !== previous.chunks.length + 1) return t(uiKeys.h3Validation.oneRecord);
  for (let index = 0; index < previous.chunks.length; index += 1) {
    const before = previous.chunks[index]!;
    const after = next.chunks[index]!;
    if (before.prompt.promptHash !== after.prompt.promptHash || before.assetId !== after.assetId || before.status !== after.status) {
      return t(uiKeys.h3Validation.acceptedChanged, { index: index + 1 });
    }
  }
  return null;
}

export interface ContinuumSequencePromptInput {
  userPrompt: string;
  finalPrompt: string;
  promptHash: string;
  createdAt: string;
  enhancerId?: string;
  enhancerRevision?: string;
}

export interface ContinuumMutationIdentity {
  /** Selected parent Take/branch, if the queue was created from an older head. */
  parentTakeId?: string;
  parentBranchId?: string;
}

/** Apply one verified managed receipt to the immutable History sequence head. */
export function sequenceAfterManagedReceipt(
  previous: ContinuumSequence,
  receipt: H3ContinuumReceipt,
  prompt: ContinuumSequencePromptInput,
  assetId: string | undefined,
  outputVersionId: string,
  updatedAt: string,
  identity: ContinuumMutationIdentity = {},
  t: Translate = createTranslator().t
): ContinuumSequence {
  const previousError = validateContinuumSequence(previous, t);
  if (previousError) throw new Error(t(uiKeys.h3Validation.previousContinuum, { reason: previousError }));
  const receiptError = validateH3ContinuumReceipt(receipt, t);
  if (receiptError) throw new Error(t(uiKeys.h3Validation.receiptInvalid, { reason: receiptError }));
  const action = receipt.reviewAction ?? "Continue / Next";
  const generatedRecord = receipt.chunkRecords.find((record) => record.logicalChunkIndex === receipt.firstGeneratedChunk);
  if (!generatedRecord) throw new Error(t(uiKeys.h3Validation.generatedMissing));
  const takeId = `take-${receipt.revisionId}`;
  const branchId = identity.parentBranchId ??
    (identity.parentTakeId ? `branch-${identity.parentTakeId}` : undefined) ??
    previous.canonicalHead.branchId ?? `branch-${previous.sequenceId}`;
  const nextChunks = previous.chunks.map((chunk) => ({ ...chunk, prompt: { ...chunk.prompt } }));
  const nextChunk: ContinuumSequenceChunk = {
    logicalChunkIndex: receipt.firstGeneratedChunk,
    physicalGroupStart: receipt.firstGeneratedChunk,
    physicalGroupEnd: receipt.firstGeneratedChunk,
    parentVersionId: previous.canonicalHead.historyVersionId,
    prompt: { chunkIndex: receipt.firstGeneratedChunk, ...prompt },
    ...(assetId ? { assetId } : {}),
    runRevisionId: receipt.revisionId,
    takeId,
    branchId,
    status: "accepted",
    reused: false,
    generated: true,
    outputVersionId,
    receipt
  };
  if (action === "Regenerate Current") {
    if (receipt.firstGeneratedChunk < 1 || receipt.firstGeneratedChunk > nextChunks.length) {
      throw new Error(t(uiKeys.h3Validation.regenerateMissing));
    }
    nextChunks[receipt.firstGeneratedChunk - 1] = nextChunk;
  } else {
    if (receipt.firstGeneratedChunk !== previous.acceptedChunks + 1) {
      throw new Error(t(uiKeys.h3Validation.headGap));
    }
    nextChunks.push(nextChunk);
  }
  const targetChunks = action === "Regenerate Current"
    ? previous.targetChunks
    : Math.max(previous.targetChunks + (previous.chunks.length === 0 ? 0 : 1), receipt.requestedChunks);
  const next: ContinuumSequence = {
    ...previous,
    status: "review-ready",
    packageVersion: receipt.packageVersion,
    runStorageSchemaVersion: receipt.runStorageSchemaVersion,
    ...(receipt.samplingContractVersion === undefined ? {} : {
      samplingContractVersion: receipt.samplingContractVersion,
      contractSha256: receipt.contractSha256,
      resumeSafe: receipt.resumeSafe
    }),
    targetChunks,
    acceptedChunks: nextChunks.length,
    canonicalHead: {
      revisionId: receipt.revisionId,
      takeId,
      branchId,
      historyVersionId: outputVersionId
    },
    chunks: nextChunks,
    updatedAt
  };
  const error = validateContinuumSequence(next, t);
  if (error) throw new Error(t(uiKeys.h3Validation.updatedInvalid, { reason: error }));
  return next;
}

export function continuumChunkCapabilityForStorage(storageKind: H3AvStorageKind): H3AvCapability[] {
  switch (storageKind) {
    // The Run Storage file remains the official owner. Native/Motion loader
    // contracts are not implied by a managed chunk's raw video/audio keys.
    case "continuum-run-chunk": return ["continuum-managed-chunk"];
    case "legacy-joint-av": return ["native-av", "continuum-bootstrap"];
    case "legacy-motion-context": return ["motion-context"];
    default: return ["native-av"];
  }
}
