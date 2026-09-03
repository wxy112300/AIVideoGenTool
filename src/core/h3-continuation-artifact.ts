import type {
  H3ContinuationDataStatus,
  HistoryFile,
  NativeAvContinuationArtifact,
  NativeAvContinuationData,
  NativeAvArtifactRole
} from "../types.js";

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

export function continuationArtifactFilenames(artifactId: string): {
  payload: string;
  manifest: string;
} {
  if (!artifactIdPattern.test(artifactId)) {
    throw new Error("H3 AV artifactId 不是安全的文件名 ID");
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
  value: unknown
): string | null {
  if (!isRecord(value)) return "artifact 不是对象";
  if (value.schemaVersion !== H3_CONTINUATION_ARTIFACT_SCHEMA_VERSION) return "artifact schema 版本不受支持";
  if (!isNativeAvArtifactId(value.artifactId)) return "artifactId 不安全或无效";
  if (!isNativeAvArtifactRole(value.role)) return "artifact role 无效";
  if (!isSafeString(value.lineageId)) return "缺少 lineageId";
  if (value.derivedFromArtifactId !== undefined && !isNativeAvArtifactId(value.derivedFromArtifactId)) {
    return "derivedFromArtifactId 无效";
  }
  if (!isHistoryFile(value.manifest, "json")) return "manifest 文件引用无效";
  if (!isHistoryFile(value.payload, "safetensors")) return "payload 文件引用无效";
  const filenames = continuationArtifactFilenames(value.artifactId);
  if (value.manifest.filename !== filenames.manifest || value.payload.filename !== filenames.payload) {
    return "manifest/payload 文件名与 artifactId 不匹配";
  }
  if (typeof value.payloadSha256 !== "string" || !sha256Pattern.test(value.payloadSha256)) {
    return "payload SHA-256 无效";
  }
  if (!isPositiveInteger(value.payloadBytes)) return "payload 字节数无效";
  if (value.modelFamily !== "minimax-h3") return "model family 不受支持";
  if (!isSafeString(value.executionModelId)) return "缺少 execution model identity";
  if (!isSafeString(value.providerId) || !isSafeString(value.providerRevision)) return "缺少 provider identity";
  for (const key of ["producerNodeId", "producerNodeVersion", "workflowId", "sourceAssetId"]) {
    if (value[key] !== undefined && !isSafeString(value[key])) return `${key} 无效`;
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
    if (!isSafeString(value[key])) return `缺少 ${key}`;
  }
  for (const key of [
    "diffusionModelSha256",
    "textEncoderSha256",
    "videoVaeSha256",
    "audioVaeSha256"
  ]) {
    if (value[key] !== undefined && (typeof value[key] !== "string" || !sha256Pattern.test(value[key]))) {
      return `${key} 无效`;
    }
  }
  if (!isPositiveInteger(value.width) || !isPositiveInteger(value.height)) return "artifact 几何无效";
  if (value.width % 32 !== 0 || value.height % 32 !== 0) return "artifact 几何必须 32 对齐";
  if (value.fps !== 24) return "artifact 只支持 24 FPS";
  if (!isPositiveInteger(value.frameCount)) return "frameCount 无效";
  if ((value.frameCount - 5) % 17 !== 0) return "frameCount 不符合 H3 时间网格";
  if (!isShape(value.videoShape) || !isSafeString(value.videoDtype)) return "video shape/dtype 无效";
  if (value.audioSampleRate !== 32000 || value.audioChannels !== 2 || value.audioLatentRate !== 40) {
    return "audio 采样参数不符合 H3 契约";
  }
  if (!isShape(value.audioShape) || !isSafeString(value.audioDtype)) return "audio shape/dtype 无效";
  const contextFrames = value.contextFrames;
  if (!Number.isSafeInteger(contextFrames) || (contextFrames as number) < 0) return "contextFrames 无效";
  if (value.upscalerId !== undefined && !isSafeString(value.upscalerId)) return "upscalerId 无效";
  if (value.upscalerRevision !== undefined && !isSafeString(value.upscalerRevision)) return "upscalerRevision 无效";
  return null;
}

export function isNativeAvContinuationArtifact(
  value: unknown
): value is NativeAvContinuationArtifact {
  return validateNativeAvContinuationArtifact(value) === null;
}

export function normalizeNativeAvContinuationData(
  value: unknown
): NativeAvContinuationData | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value) || !isH3ContinuationDataStatus(value.status)) {
    return { status: "invalid", reason: "artifact 状态记录格式无效" };
  }
  const reason = typeof value.reason === "string" && value.reason.trim()
    ? value.reason
    : undefined;
  if (value.artifact === undefined) return { status: value.status, ...(reason ? { reason } : {}) };
  const artifactError = validateNativeAvContinuationArtifact(value.artifact);
  if (artifactError) {
    return {
      status: "invalid",
      reason: reason ? `${reason}；${artifactError}` : artifactError
    };
  }
  return {
    status: value.status,
    ...(reason ? { reason } : {}),
    artifact: value.artifact as NativeAvContinuationArtifact
  };
}

export function artifactHistoryFile(
  filename: string,
  format: "json" | "safetensors"
): HistoryFile {
  if (!filenamePattern.test(filename) || !filename.toLowerCase().endsWith(`.${format}`)) {
    throw new Error("H3 AV artifact 文件名无效");
  }
  return {
    filename,
    subfolder: H3_CONTINUATION_ARTIFACT_SUBFOLDER,
    type: "output",
    format
  };
}
