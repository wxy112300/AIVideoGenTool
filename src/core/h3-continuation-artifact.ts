import { createTranslator, type Translate } from "./i18n.js";
import { uiKeys } from "./i18n-keys.js";
import type {
  H3ContinuationDataStatus,
  HistoryFile,
  NativeAvContinuationArtifact,
  NativeAvContinuationData,
  NativeAvArtifactRole
} from "../types.js";
import {
  isH3AvLatentAsset,
  validateH3AvLatentAsset
} from "./h3-av-asset.js";

export const H3_CONTINUATION_ARTIFACT_SCHEMA_VERSION = 1 as const;
export const H3_CONTINUATION_ARTIFACT_SUBFOLDER = "h3-native-av";
export const H3_CONTINUATION_ARTIFACT_PAYLOAD_FORMAT = "safetensors";
export const H3_CONTINUATION_ARTIFACT_PAYLOAD_PREFIX = "h3av_";

const continuationStatuses = new Set<H3ContinuationDataStatus>([
  "available",
  "not-supported",
  "save-failed",
  "missing",
  "invalid"
]);

const artifactRoles = new Set<NativeAvArtifactRole>([
  "first-pass-clean-av",
  "final-clean-av",
  "extend-segment-clean-av"
]);

const sha256Pattern = /^[a-f0-9]{64}$/;
const artifactIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const filenamePattern = /^h3av_[A-Za-z0-9][A-Za-z0-9_-]{7,127}\.(?:json|safetensors)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isShape(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.every(isPositiveInteger);
}

function isHistoryFile(value: unknown, expectedExtension: "json" | "safetensors"): value is HistoryFile {
  if (!isRecord(value)) return false;
  const filename = value.filename;
  return typeof filename === "string" &&
    value.subfolder === H3_CONTINUATION_ARTIFACT_SUBFOLDER &&
    value.type === "output" &&
    (value.format === undefined || value.format === expectedExtension) &&
    filenamePattern.test(filename) &&
    filename.toLowerCase().endsWith(`.${expectedExtension}`) &&
    (value.absolutePath === undefined || typeof value.absolutePath === "string");
}

export function continuationArtifactFilenames(artifactId: string, t: Translate = createTranslator().t): {
  payload: string;
  manifest: string;
} {
  if (!artifactIdPattern.test(artifactId)) {
    throw new Error(t(uiKeys.artifactValidation.unsafeId));
  }
  return {
    payload: `${H3_CONTINUATION_ARTIFACT_PAYLOAD_PREFIX}${artifactId}.safetensors`,
    manifest: `${H3_CONTINUATION_ARTIFACT_PAYLOAD_PREFIX}${artifactId}.json`
  };
}

export function isNativeAvArtifactId(value: unknown): value is string {
  return typeof value === "string" && artifactIdPattern.test(value);
}

export function isNativeAvArtifactRole(value: unknown): value is NativeAvArtifactRole {
  return artifactRoles.has(value as NativeAvArtifactRole);
}

export function isH3ContinuationDataStatus(value: unknown): value is H3ContinuationDataStatus {
  return continuationStatuses.has(value as H3ContinuationDataStatus);
}

/**
 * Returns a human-readable validation error. This is intentionally pure so
 * store loading and renderer tests can reject malformed persisted references
 * without importing Node filesystem APIs.
 */
export function validateNativeAvContinuationArtifact(
  value: unknown,
  t: Translate = createTranslator().t
): string | null {
  if (!isRecord(value)) return t(uiKeys.artifactValidation.notObject);
  if (value.schemaVersion !== H3_CONTINUATION_ARTIFACT_SCHEMA_VERSION) return t(uiKeys.artifactValidation.schema);
  if (!isNativeAvArtifactId(value.artifactId)) return t(uiKeys.artifactValidation.id);
  if (!isNativeAvArtifactRole(value.role)) return t(uiKeys.artifactValidation.role);
  if (!isSafeString(value.lineageId)) return t(uiKeys.artifactValidation.lineage);
  if (value.derivedFromArtifactId !== undefined && !isNativeAvArtifactId(value.derivedFromArtifactId)) {
    return t(uiKeys.artifactValidation.derived);
  }
  if (!isHistoryFile(value.manifest, "json")) return t(uiKeys.artifactValidation.manifest);
  if (!isHistoryFile(value.payload, "safetensors")) return t(uiKeys.artifactValidation.payload);
  const filenames = continuationArtifactFilenames(value.artifactId, t);
  if (value.manifest.filename !== filenames.manifest || value.payload.filename !== filenames.payload) {
    return t(uiKeys.artifactValidation.filenames);
  }
  if (typeof value.payloadSha256 !== "string" || !sha256Pattern.test(value.payloadSha256)) {
    return t(uiKeys.artifactValidation.hash);
  }
  if (!isPositiveInteger(value.payloadBytes)) return t(uiKeys.artifactValidation.bytes);
  if (value.modelFamily !== "minimax-h3") return t(uiKeys.artifactValidation.family);
  if (!isSafeString(value.executionModelId)) return t(uiKeys.artifactValidation.execution);
  if (!isSafeString(value.providerId) || !isSafeString(value.providerRevision)) return t(uiKeys.artifactValidation.provider);
  for (const key of ["producerNodeId", "producerNodeVersion", "workflowId", "sourceAssetId"]) {
    if (value[key] !== undefined && !isSafeString(value[key])) return t(uiKeys.artifactValidation.invalidField, { key });
  }
  for (const key of [
    "diffusionModelFilename",
    "textEncoderFilename",
    "videoVaeFilename",
    "audioVaeFilename",
    "workflowRevision",
    "sourceTaskId",
    "createdAt"
  ]) {
    if (!isSafeString(value[key])) return t(uiKeys.nativeAv.missingField, { key });
  }
  for (const key of [
    "diffusionModelSha256",
    "textEncoderSha256",
    "videoVaeSha256",
    "audioVaeSha256"
  ]) {
    if (value[key] !== undefined && (typeof value[key] !== "string" || !sha256Pattern.test(value[key]))) {
      return t(uiKeys.artifactValidation.invalidField, { key });
    }
  }
  if (!isPositiveInteger(value.width) || !isPositiveInteger(value.height)) return t(uiKeys.artifactValidation.geometry);
  if (value.width % 32 !== 0 || value.height % 32 !== 0) return t(uiKeys.artifactValidation.alignment);
  if (value.fps !== 24) return t(uiKeys.artifactValidation.fps);
  if (!isPositiveInteger(value.frameCount)) return t(uiKeys.artifactValidation.invalidField, { key: "frameCount" });
  if ((value.frameCount - 5) % 17 !== 0) return t(uiKeys.nativeAv.frameGrid);
  if (!isShape(value.videoShape) || !isSafeString(value.videoDtype)) return t(uiKeys.artifactValidation.videoShape);
  if (value.audioSampleRate !== 32000 || value.audioChannels !== 2 || value.audioLatentRate !== 40) {
    return t(uiKeys.artifactValidation.audioSampling);
  }
  if (!isShape(value.audioShape) || !isSafeString(value.audioDtype)) return t(uiKeys.artifactValidation.audioShape);
  const contextFrames = value.contextFrames;
  if (!Number.isSafeInteger(contextFrames) || (contextFrames as number) < 0) return t(uiKeys.nativeAv.context);
  if (value.upscalerId !== undefined && !isSafeString(value.upscalerId)) return t(uiKeys.artifactValidation.invalidField, { key: "upscalerId" });
  if (value.upscalerRevision !== undefined && !isSafeString(value.upscalerRevision)) return t(uiKeys.artifactValidation.invalidField, { key: "upscalerRevision" });
  return null;
}

export function isNativeAvContinuationArtifact(
  value: unknown
): value is NativeAvContinuationArtifact {
  return validateNativeAvContinuationArtifact(value) === null;
}

export function normalizeNativeAvContinuationData(
  value: unknown,
  t: Translate = createTranslator().t
): NativeAvContinuationData | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value) || !isH3ContinuationDataStatus(value.status)) {
    return { status: "invalid", reason: t(uiKeys.artifactValidation.state) };
  }
  const reason = typeof value.reason === "string" && value.reason.trim()
    ? value.reason
    : undefined;
  if (value.artifact === undefined) return { status: value.status, ...(reason ? { reason } : {}) };
  const artifactError = validateNativeAvContinuationArtifact(value.artifact, t);
  if (artifactError) {
    return {
      status: "invalid",
      reason: reason ? `${reason}；${artifactError}` : artifactError
    };
  }
  const assetError = value.asset === undefined
    ? undefined
    : validateH3AvLatentAsset(value.asset, t);
  if (assetError) {
    return {
      status: "invalid",
      reason: reason ? `${reason}；${assetError}` : assetError
    };
  }
  return {
    status: value.status,
    ...(reason ? { reason } : {}),
    artifact: value.artifact as NativeAvContinuationArtifact,
    ...(isH3AvLatentAsset(value.asset) ? { asset: value.asset } : {})
  };
}

export function artifactHistoryFile(
  filename: string,
  format: "json" | "safetensors",
  t: Translate = createTranslator().t
): HistoryFile {
  if (!filenamePattern.test(filename) || !filename.toLowerCase().endsWith(`.${format}`)) {
    throw new Error(t(uiKeys.artifactValidation.filename));
  }
  return {
    filename,
    subfolder: H3_CONTINUATION_ARTIFACT_SUBFOLDER,
    type: "output",
    format
  };
}
