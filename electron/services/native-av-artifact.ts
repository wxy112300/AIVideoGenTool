import type { Translate } from "../../src/core/i18n.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
import { createNativeTranslator } from "../ui-translator.js";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import type {
  H3ContinuationDataStatus,
  UiLocale,
  NativeAvArtifactInspection,
  NativeAvArtifactRole,
  NativeAvContinuationArtifact,
  NativeAvContinuationData
} from "../../src/types.js";
import {
  H3_CONTINUATION_ARTIFACT_SCHEMA_VERSION,
  H3_CONTINUATION_ARTIFACT_SUBFOLDER,
  H3_CONTINUATION_ARTIFACT_PAYLOAD_FORMAT,
  artifactHistoryFile,
  continuationArtifactFilenames,
  isNativeAvContinuationArtifact,
  validateNativeAvContinuationArtifact
} from "../../src/core/h3-continuation-artifact.js";
import type { NativeAvArtifactFileSystemPort } from "../ports/native-av-artifact-file-system.js";
import { resolveNativeAvArtifactFilePath } from "../../src/core/native-av-artifact-paths.js";

const MAX_SAFETENSORS_HEADER_BYTES = 16 * 1024 * 1024;
const sha256Pattern = /^[a-f0-9]{64}$/;

const safetensorsDtypeBytes: Record<string, number> = {
  F16: 2,
  BF16: 2,
  F32: 4
};

interface SafetensorsTensorDescriptor {
  dtype: string;
  shape: number[];
  dataOffsets: [number, number];
}

interface ParsedJointAvPayload {
  video: SafetensorsTensorDescriptor;
  audio: SafetensorsTensorDescriptor;
  dataStart: number;
}

export interface NativeAvArtifactMetadata {
  outputDirectory: string;
  artifactId?: string;
  role: NativeAvArtifactRole;
  lineageId: string;
  derivedFromArtifactId?: string;
  executionModelId: string;
  providerId: string;
  providerRevision: string;
  /** Required for newly committed ComfyUI-produced artifacts. */
  producerNodeId: string;
  producerNodeVersion: string;
  workflowId: string;
  diffusionModelFilename: string;
  diffusionModelSha256?: string;
  textEncoderFilename: string;
  textEncoderSha256?: string;
  videoVaeFilename: string;
  videoVaeSha256?: string;
  audioVaeFilename: string;
  audioVaeSha256?: string;
  upscalerId?: string;
  upscalerRevision?: string;
  width: number;
  height: number;
  fps?: 24;
  frameCount: number;
  contextFrames: number;
  workflowRevision: string;
  sourceTaskId: string;
  sourceAssetId?: string;
  sourceVersionId?: string;
  /** New shared tasks must commit the serializer's canonical owner in place. */
  sharedOutput?: boolean;
  createdAt?: string;
}

export interface NativeAvArtifactCommitRequest extends NativeAvArtifactMetadata {
  payload: Uint8Array;
}

export interface NativeAvArtifactProducedFileDescriptor {
  filename: string;
  subfolder: string;
  type: "output";
  format?: string;
}

export interface NativeAvArtifactProducedFileCommitRequest extends NativeAvArtifactMetadata {
  producedFile: NativeAvArtifactProducedFileDescriptor;
}

export interface NativeAvArtifactServiceDependencies {
  fileSystem: NativeAvArtifactFileSystemPort;
  getUiLocale?: () => UiLocale | undefined;
}

function isWithinDirectory(rootDirectory: string, candidate: string): boolean {
  const root = path.resolve(rootDirectory);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(root, resolvedCandidate);
  return relative === "" || (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function artifactDirectory(outputDirectory: string, t: Translate): string {
  const root = outputDirectory.trim();
  if (!root) throw new Error(t(uiKeys.nativeAv.outputEmpty));
  const directory = path.resolve(root, H3_CONTINUATION_ARTIFACT_SUBFOLDER);
  if (!isWithinDirectory(root, directory)) throw new Error(t(uiKeys.nativeAv.directoryOutside));
  return directory;
}

function safeArtifactPath(outputDirectory: string, filename: string, t: Translate): string {
  const directory = artifactDirectory(outputDirectory, t);
  if (!filename || path.basename(filename) !== filename || filename.includes("..")) {
    throw new Error(t(uiKeys.nativeAv.filenameUnsafe));
  }
  const candidate = path.resolve(directory, filename);
  if (!isWithinDirectory(directory, candidate)) throw new Error(t(uiKeys.nativeAv.pathOutside));
  return candidate;
}

function safeProducedFilePath(
  outputDirectory: string,
  descriptor: NativeAvArtifactProducedFileDescriptor,
  t: Translate
): string {
  if (
    descriptor.type !== "output" ||
    descriptor.subfolder !== H3_CONTINUATION_ARTIFACT_SUBFOLDER ||
    (descriptor.format !== undefined && descriptor.format !== H3_CONTINUATION_ARTIFACT_PAYLOAD_FORMAT)
  ) {
    throw new Error(t(uiKeys.nativeAv.descriptorOutside));
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}\.safetensors$/u.test(descriptor.filename)) {
    throw new Error(t(uiKeys.nativeAv.descriptorUnsafe));
  }
  return safeArtifactPath(outputDirectory, descriptor.filename, t);
}

function sha256(payload: Uint8Array): string {
  return createHash("sha256").update(payload).digest("hex");
}

async function hashFileStream(
  fileSystem: NativeAvArtifactFileSystemPort,
  filename: string
): Promise<{ bytes: number; sha256: string }> {
  const digest = createHash("sha256");
  let bytes = 0;
  for await (const chunk of fileSystem.readFileStream(filename)) {
    const value = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    bytes += value.byteLength;
    digest.update(value);
  }
  return { bytes, sha256: digest.digest("hex") };
}

function positiveShape(shape: unknown): shape is number[] {
  return Array.isArray(shape) && shape.length > 0 && shape.every((value) =>
    typeof value === "number" && Number.isSafeInteger(value) && value > 0
  );
}

function tensorDescriptor(value: unknown): SafetensorsTensorDescriptor | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const offsets = record.data_offsets;
  if (
    typeof record.dtype !== "string" ||
    !positiveShape(record.shape) ||
    !Array.isArray(offsets) ||
    offsets.length !== 2 ||
    !offsets.every((item) => typeof item === "number" && Number.isSafeInteger(item) && item >= 0)
  ) return null;
  const [start, end] = offsets as [number, number];
  if (end <= start) return null;
  return { dtype: record.dtype, shape: record.shape, dataOffsets: [start, end] };
}

function expectedTensorBytes(descriptor: SafetensorsTensorDescriptor): number | null {
  const bytesPerElement = safetensorsDtypeBytes[descriptor.dtype];
  if (!bytesPerElement) return null;
  let elements = 1;
  for (const dimension of descriptor.shape) {
    if (elements > Number.MAX_SAFE_INTEGER / dimension) return null;
    elements *= dimension;
  }
  if (elements > Number.MAX_SAFE_INTEGER / bytesPerElement) return null;
  return elements * bytesPerElement;
}

function parseSafetensorsJointHeader(payload: Uint8Array, t: Translate): ParsedJointAvPayload {
  if (payload.byteLength < 8) throw new Error(t(uiKeys.nativeAv.headerLengthMissing));
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const headerLengthBigInt = view.getBigUint64(0, true);
  if (headerLengthBigInt > BigInt(MAX_SAFETENSORS_HEADER_BYTES)) {
    throw new Error(t(uiKeys.nativeAv.headerTooLarge));
  }
  const headerLength = Number(headerLengthBigInt);
  const dataStart = 8 + headerLength;
  if (dataStart > payload.byteLength) throw new Error(t(uiKeys.nativeAv.headerIncomplete));

  let header: unknown;
  try {
    const headerBytes = payload.subarray(8, dataStart);
    const headerText = new TextDecoder("utf-8", { fatal: true }).decode(headerBytes);
    header = JSON.parse(headerText) as unknown;
  } catch {
    throw new Error(t(uiKeys.nativeAv.headerJson));
  }
  if (!header || typeof header !== "object" || Array.isArray(header)) {
    throw new Error(t(uiKeys.nativeAv.headerInvalid));
  }
  const entries = Object.entries(header as Record<string, unknown>)
    .filter(([key]) => key !== "__metadata__");
  if (entries.length !== 2 || !entries.some(([key]) => key === "video") || !entries.some(([key]) => key === "audio")) {
    throw new Error(t(uiKeys.nativeAv.tensorKeys));
  }
  const video = tensorDescriptor((header as Record<string, unknown>).video);
  const audio = tensorDescriptor((header as Record<string, unknown>).audio);
  if (!video || !audio) throw new Error(t(uiKeys.nativeAv.tensorDescriptor));
  return { video, audio, dataStart };
}

function validateSafetensorsPayloadLayout(
  payload: ParsedJointAvPayload,
  payloadBytes: number,
  t: Translate
): void {
  if (!Number.isSafeInteger(payloadBytes) || payloadBytes < payload.dataStart) {
    throw new Error(t(uiKeys.nativeAv.dataIncomplete));
  }
  const dataBytes = payloadBytes - payload.dataStart;
  let maxDataOffset = 0;
  for (const [key, descriptor] of [["video", payload.video], ["audio", payload.audio]] as const) {
    const [start, end] = descriptor.dataOffsets;
    if (start < 0 || end > dataBytes) throw new Error(t(uiKeys.nativeAv.offsetOutside, { key }));
    maxDataOffset = Math.max(maxDataOffset, end);
    const expectedBytes = expectedTensorBytes(descriptor);
    if (expectedBytes === null || expectedBytes !== end - start) {
      throw new Error(t(uiKeys.nativeAv.tensorBytes, { key }));
    }
  }
  if (maxDataOffset !== dataBytes) {
    throw new Error(t(uiKeys.nativeAv.dataLength));
  }
}

function parseSafetensorsJointPayload(payload: Uint8Array, t: Translate): ParsedJointAvPayload {
  const parsed = parseSafetensorsJointHeader(payload, t);
  validateSafetensorsPayloadLayout(parsed, payload.byteLength, t);
  return parsed;
}

function validateJointPayloadGeometry(
  payload: ParsedJointAvPayload,
  request: Pick<NativeAvArtifactCommitRequest, "width" | "height" | "frameCount">,
  t: Translate
): void {
  if (payload.video.shape.length !== 5 || payload.video.shape[0] !== 1 || payload.video.shape[1] !== 24) {
    throw new Error(t(uiKeys.nativeAv.videoShape));
  }
  const expectedVideoTemporal = ((request.frameCount - 5) / 17) * 5 + 2;
  if (payload.video.shape[2] !== expectedVideoTemporal) {
    throw new Error(t(uiKeys.nativeAv.videoTemporal, { frames: expectedVideoTemporal }));
  }
  if (
    payload.video.shape[3] !== request.height / 16 ||
    payload.video.shape[4] !== request.width / 16
  ) {
    throw new Error(t(uiKeys.nativeAv.videoSpatial));
  }
  if (payload.audio.shape.length !== 4 || payload.audio.shape[0] !== 1 || payload.audio.shape[1] !== 32 || payload.audio.shape[2] !== 2) {
    throw new Error(t(uiKeys.nativeAv.audioShape));
  }
  const expectedAudioTemporal = Math.round((request.frameCount / 24) * 40);
  if (payload.audio.shape[3] !== expectedAudioTemporal) {
    throw new Error(t(uiKeys.nativeAv.audioTemporal, { frames: expectedAudioTemporal }));
  }
}

function frameCountFromJointPayload(payload: ParsedJointAvPayload, t: Translate): number {
  const temporal = payload.video.shape[2];
  if (!Number.isSafeInteger(temporal) || temporal < 2 || (temporal - 2) % 5 !== 0) {
    throw new Error(t(uiKeys.nativeAv.videoGrid));
  }
  return 5 + ((temporal - 2) / 5) * 17;
}

function buildArtifactManifest(
  request: NativeAvArtifactMetadata,
  artifactId: string,
  filenames: ReturnType<typeof continuationArtifactFilenames>,
  parsedPayload: ParsedJointAvPayload,
  payloadHash: string,
  payloadBytes: number
): NativeAvContinuationArtifact {
  return {
    schemaVersion: H3_CONTINUATION_ARTIFACT_SCHEMA_VERSION,
    artifactId,
    role: request.role,
    lineageId: request.lineageId,
    ...(request.derivedFromArtifactId ? { derivedFromArtifactId: request.derivedFromArtifactId } : {}),
    manifest: artifactHistoryFile(filenames.manifest, "json"),
    payload: artifactHistoryFile(filenames.payload, "safetensors"),
    payloadSha256: payloadHash,
    payloadBytes,
    modelFamily: "minimax-h3",
    executionModelId: request.executionModelId,
    providerId: request.providerId,
    providerRevision: request.providerRevision,
    producerNodeId: request.producerNodeId,
    producerNodeVersion: request.producerNodeVersion,
    workflowId: request.workflowId,
    diffusionModelFilename: request.diffusionModelFilename,
    ...(request.diffusionModelSha256 ? { diffusionModelSha256: request.diffusionModelSha256 } : {}),
    textEncoderFilename: request.textEncoderFilename,
    ...(request.textEncoderSha256 ? { textEncoderSha256: request.textEncoderSha256 } : {}),
    videoVaeFilename: request.videoVaeFilename,
    ...(request.videoVaeSha256 ? { videoVaeSha256: request.videoVaeSha256 } : {}),
    audioVaeFilename: request.audioVaeFilename,
    ...(request.audioVaeSha256 ? { audioVaeSha256: request.audioVaeSha256 } : {}),
    ...(request.upscalerId ? { upscalerId: request.upscalerId } : {}),
    ...(request.upscalerRevision ? { upscalerRevision: request.upscalerRevision } : {}),
    width: request.width,
    height: request.height,
    fps: 24,
    frameCount: request.frameCount,
    videoShape: parsedPayload.video.shape,
    videoDtype: parsedPayload.video.dtype,
    audioSampleRate: 32000,
    audioChannels: 2,
    audioLatentRate: 40,
    audioShape: parsedPayload.audio.shape,
    audioDtype: parsedPayload.audio.dtype,
    contextFrames: request.contextFrames,
    workflowRevision: request.workflowRevision,
    sourceTaskId: request.sourceTaskId,
    ...(request.sourceAssetId ? { sourceAssetId: request.sourceAssetId } : {}),
    ...(request.sourceVersionId ? { sourceVersionId: request.sourceVersionId } : {}),
    createdAt: request.createdAt ?? new Date().toISOString()
  };
}

function failure(status: H3ContinuationDataStatus, reason: string): NativeAvContinuationData {
  return { status, reason };
}

function artifactWithAbsolutePaths(
  artifact: NativeAvContinuationArtifact,
  outputDirectory: string,
  t: Translate
): NativeAvContinuationArtifact {
  const manifestPath = safeArtifactPath(outputDirectory, artifact.manifest.filename, t);
  const payloadPath = safeArtifactPath(outputDirectory, artifact.payload.filename, t);
  return {
    ...artifact,
    manifest: { ...artifact.manifest, absolutePath: manifestPath },
    payload: { ...artifact.payload, absolutePath: payloadPath }
  };
}

function sameArtifactReference(
  left: NativeAvContinuationArtifact,
  right: NativeAvContinuationArtifact
): boolean {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, entry]) => [key, canonical(entry)])
    );
  };
  return JSON.stringify(canonical(manifestWithoutCachedPaths(left))) ===
    JSON.stringify(canonical(manifestWithoutCachedPaths(right)));
}

function manifestWithoutCachedPaths(artifact: NativeAvContinuationArtifact): NativeAvContinuationArtifact {
  return {
    ...artifact,
    manifest: {
      ...artifact.manifest,
      format: artifact.manifest.format ?? "json",
      absolutePath: undefined,
      sizeBytes: undefined
    },
    payload: {
      ...artifact.payload,
      format: artifact.payload.format ?? "safetensors",
      absolutePath: undefined,
      sizeBytes: undefined
    }
  };
}

export class NativeAvArtifactService {
  constructor(private readonly deps: NativeAvArtifactServiceDependencies) {}

  /**
   * Resolve and inspect a user-selected payload. Manual selection is kept
   * inside the managed output/h3-native-av directory and requires the
   * adjacent manifest, so a random safetensors file cannot enter a queue
   * snapshot as if it were a verified H3 artifact.
   */
  async inspectPath(
    referencePath: string,
    outputDirectory: string
  ): Promise<NativeAvArtifactInspection> {
    const t = createNativeTranslator(this.deps.getUiLocale?.()).t;
    const requested = referencePath.trim();
    if (!requested) return failure("invalid", t(uiKeys.nativeAv.pathEmpty));
    const directory = artifactDirectory(outputDirectory, t);
    const candidate = path.resolve(path.isAbsolute(requested)
      ? requested
      : path.join(outputDirectory, requested));
    if (!isWithinDirectory(directory, candidate) || path.extname(candidate).toLowerCase() !== ".safetensors") {
      return failure("invalid", t(uiKeys.nativeAv.selectManaged));
    }
    const payloadFilename = path.basename(candidate);
    const manifestPath = safeArtifactPath(
      outputDirectory,
      payloadFilename.replace(/\.safetensors$/iu, ".json"),
      t
    );
    const [payloadStat, manifestStat] = await Promise.all([
      this.deps.fileSystem.stat(candidate),
      this.deps.fileSystem.stat(manifestPath)
    ]);
    if (!payloadStat?.isFile() || !manifestStat?.isFile()) {
      return {
        status: "missing",
        reason: t(uiKeys.nativeAv.adjacentMissing),
        payloadPath: candidate,
        manifestPath
      };
    }
    try {
      const manifest = JSON.parse(await this.deps.fileSystem.readText(manifestPath)) as unknown;
      if (!isNativeAvContinuationArtifact(manifest)) {
        return failure("invalid", t(uiKeys.nativeAv.manifestInvalid, { reason: validateNativeAvContinuationArtifact(manifest, t) ?? t(uiKeys.nativeAv.unknown) }));
      }
      if (manifest.payload.filename !== payloadFilename) {
        return failure("invalid", t(uiKeys.nativeAv.selectedMismatch));
      }
      return this.inspect(manifest, outputDirectory);
    } catch (error) {
      return failure("invalid", error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Commit a file already produced by a ComfyUI serializer node. The payload
   * stays on disk throughout this path: Electron only reads the bounded
   * safetensors header and streams bytes for the hash before publishing the
   * manifest commit marker.
   */
  async commitProducedFile(
    request: NativeAvArtifactProducedFileCommitRequest
  ): Promise<NativeAvContinuationData> {
    const t = createNativeTranslator(this.deps.getUiLocale?.()).t;
    let payloadPath = "";
    let manifestPath = "";
    let payloadTemporary = "";
    let manifestTemporary = "";
    let payloadCopied = false;
    let manifestCommitted = false;
    try {
      if (request.width <= 0 || request.height <= 0 || request.width % 32 !== 0 || request.height % 32 !== 0) {
        return failure("save-failed", t(uiKeys.nativeAv.geometry));
      }
      if (request.fps !== undefined && request.fps !== 24) {
        return failure("save-failed", t(uiKeys.nativeAv.fps));
      }
      if (!Number.isSafeInteger(request.contextFrames) || request.contextFrames < 0) {
        return failure("save-failed", t(uiKeys.nativeAv.context));
      }
      if (request.providerId !== "comfyui") {
        return failure("save-failed", t(uiKeys.nativeAv.provider));
      }
      for (const [key, value] of [
        ["producerNodeId", request.producerNodeId],
        ["producerNodeVersion", request.producerNodeVersion],
        ["workflowId", request.workflowId]
      ] as const) {
        if (!value.trim()) return failure("save-failed", t(uiKeys.nativeAv.missingField, { key }));
      }

      const sourcePath = safeProducedFilePath(request.outputDirectory, request.producedFile, t);
      const sourceStat = await this.deps.fileSystem.stat(sourcePath);
      if (!sourceStat?.isFile() || sourceStat.size <= 0) {
        return failure("missing", t(uiKeys.nativeAv.noOutput));
      }
      const artifactId = request.artifactId ?? randomUUID();
      if (request.sharedOutput && !request.artifactId) {
        return failure("save-failed", t(uiKeys.nativeAv.sharedFilename));
      }
      const filenames = continuationArtifactFilenames(artifactId, t);
      const directory = artifactDirectory(request.outputDirectory, t);
      payloadPath = safeArtifactPath(request.outputDirectory, filenames.payload, t);
      manifestPath = safeArtifactPath(request.outputDirectory, filenames.manifest, t);
      if (request.sharedOutput && sourcePath !== payloadPath) {
        return failure("save-failed", t(uiKeys.nativeAv.sharedOwner));
      }
      const existingManifest = await this.deps.fileSystem.stat(manifestPath);
      const existingPayload = await this.deps.fileSystem.stat(payloadPath);
      if (existingManifest || (existingPayload && sourcePath !== payloadPath)) {
        return failure("save-failed", t(uiKeys.nativeAv.exists, { id: artifactId }));
      }

      const header = parseSafetensorsJointHeader(await this.deps.fileSystem.readFilePrefix(
        sourcePath,
        8 + MAX_SAFETENSORS_HEADER_BYTES
      ), t);
      validateSafetensorsPayloadLayout(header, sourceStat.size, t);
      // Comfy nodes may quantize a requested pixel-frame length to the H3 VAE
      // grid. The serialized tensor is the authoritative artifact timeline;
      // derive its frame count from the validated header instead of persisting
      // a pre-render estimate that can be off-grid (notably Motion Context).
      const committedRequest = {
        ...request,
        frameCount: frameCountFromJointPayload(header, t)
      };
      validateJointPayloadGeometry(header, committedRequest, t);
      const digest = await hashFileStream(this.deps.fileSystem, sourcePath);
      const afterStat = await this.deps.fileSystem.stat(sourcePath);
      if (digest.bytes !== sourceStat.size || !afterStat?.isFile() || afterStat.size !== digest.bytes) {
        return failure("save-failed", t(uiKeys.nativeAv.producedChanged));
      }

      const baseArtifact = buildArtifactManifest(
        committedRequest,
        artifactId,
        filenames,
        header,
        digest.sha256,
        digest.bytes
      );
      const artifactError = validateNativeAvContinuationArtifact(baseArtifact, t);
      if (artifactError) return failure("save-failed", artifactError);

      await this.deps.fileSystem.makeDirectory(directory);
      if (sourcePath !== payloadPath) {
        payloadTemporary = path.join(directory, `.${filenames.payload}.${randomUUID()}.partial`);
        await this.deps.fileSystem.copyFile(sourcePath, payloadTemporary);
        const copiedStat = await this.deps.fileSystem.stat(payloadTemporary);
        const copiedDigest = await hashFileStream(this.deps.fileSystem, payloadTemporary);
        const copiedAfterStat = await this.deps.fileSystem.stat(payloadTemporary);
        if (
          !copiedStat?.isFile() ||
          !copiedAfterStat?.isFile() ||
          copiedStat.size !== digest.bytes ||
          copiedAfterStat.size !== copiedDigest.bytes ||
          copiedDigest.bytes !== digest.bytes ||
          copiedDigest.sha256 !== digest.sha256
        ) {
          throw new Error(t(uiKeys.nativeAv.copyMismatch));
        }
        await this.deps.fileSystem.rename(payloadTemporary, payloadPath);
        payloadCopied = true;
      }
      manifestTemporary = path.join(directory, `.${filenames.manifest}.${randomUUID()}.tmp`);
      await this.deps.fileSystem.writeFile(
        manifestTemporary,
        JSON.stringify(manifestWithoutCachedPaths(baseArtifact), null, 2)
      );
      await this.deps.fileSystem.rename(manifestTemporary, manifestPath);
      manifestCommitted = true;
      return { status: "available", artifact: artifactWithAbsolutePaths(baseArtifact, request.outputDirectory, t) };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return failure("save-failed", reason);
    } finally {
      if (!manifestCommitted) {
        await Promise.all([
          payloadPath && payloadCopied ? this.deps.fileSystem.remove(payloadPath) : Promise.resolve(),
          payloadTemporary ? this.deps.fileSystem.remove(payloadTemporary) : Promise.resolve(),
          manifestTemporary ? this.deps.fileSystem.remove(manifestTemporary) : Promise.resolve()
        ]).catch(() => undefined);
      }
    }
  }

  async commit(request: NativeAvArtifactCommitRequest): Promise<NativeAvContinuationData> {
    const t = createNativeTranslator(this.deps.getUiLocale?.()).t;
    let payloadPath = "";
    let manifestPath = "";
    let payloadTemporary = "";
    let manifestTemporary = "";
    let payloadCommitted = false;
    let manifestCommitted = false;
    try {
      if (request.width <= 0 || request.height <= 0 || request.width % 32 !== 0 || request.height % 32 !== 0) {
        return failure("save-failed", t(uiKeys.nativeAv.geometry));
      }
      if (request.fps !== undefined && request.fps !== 24) {
        return failure("save-failed", t(uiKeys.nativeAv.fps));
      }
      if (!Number.isSafeInteger(request.frameCount) || request.frameCount <= 0 || (request.frameCount - 5) % 17 !== 0) {
        return failure("save-failed", t(uiKeys.nativeAv.frameGrid));
      }
      if (!Number.isSafeInteger(request.contextFrames) || request.contextFrames < 0) {
        return failure("save-failed", t(uiKeys.nativeAv.context));
      }
      const artifactId = request.artifactId ?? randomUUID();
      const filenames = continuationArtifactFilenames(artifactId, t);
      const directory = artifactDirectory(request.outputDirectory, t);
      payloadPath = safeArtifactPath(request.outputDirectory, filenames.payload, t);
      manifestPath = safeArtifactPath(request.outputDirectory, filenames.manifest, t);
      payloadTemporary = path.join(directory, `.${filenames.payload}.${randomUUID()}.partial`);
      manifestTemporary = path.join(directory, `.${filenames.manifest}.${randomUUID()}.tmp`);
      if (await this.deps.fileSystem.stat(payloadPath) || await this.deps.fileSystem.stat(manifestPath)) {
        return failure("save-failed", t(uiKeys.nativeAv.exists, { id: artifactId }));
      }

      const payload = new Uint8Array(request.payload);
      const parsedPayload = parseSafetensorsJointPayload(payload, t);
      validateJointPayloadGeometry(parsedPayload, request, t);
      const payloadHash = sha256(payload);
      const baseArtifact = buildArtifactManifest(
        request,
        artifactId,
        filenames,
        parsedPayload,
        payloadHash,
        payload.byteLength
      );
      const artifactError = validateNativeAvContinuationArtifact(baseArtifact, t);
      if (artifactError) return failure("save-failed", artifactError);

      await this.deps.fileSystem.makeDirectory(directory);
      await this.deps.fileSystem.writeFile(payloadTemporary, payload);
      await this.deps.fileSystem.writeFile(
        manifestTemporary,
        JSON.stringify(manifestWithoutCachedPaths(baseArtifact), null, 2)
      );
      await this.deps.fileSystem.rename(payloadTemporary, payloadPath);
      payloadCommitted = true;
      await this.deps.fileSystem.rename(manifestTemporary, manifestPath);
      manifestCommitted = true;
      return { status: "available", artifact: artifactWithAbsolutePaths(baseArtifact, request.outputDirectory, t) };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return failure("save-failed", reason);
    } finally {
      // A manifest is the commit marker. If its rename failed, remove every
      // file created by this attempt; an older committed pair is never touched.
      if (!manifestCommitted) {
        await Promise.all([
          payloadPath && payloadCommitted ? this.deps.fileSystem.remove(payloadPath) : Promise.resolve(),
          payloadTemporary ? this.deps.fileSystem.remove(payloadTemporary) : Promise.resolve(),
          manifestTemporary ? this.deps.fileSystem.remove(manifestTemporary) : Promise.resolve()
        ]).catch(() => undefined);
      }
    }
  }

  async inspect(
    reference: NativeAvContinuationArtifact,
    outputDirectory: string
  ): Promise<NativeAvArtifactInspection> {
    const t = createNativeTranslator(this.deps.getUiLocale?.()).t;
    const referenceError = validateNativeAvContinuationArtifact(reference, t);
    if (referenceError) return failure("invalid", referenceError);
    let manifestPath = "";
    let payloadPath = "";
    try {
      manifestPath = resolveNativeAvArtifactFilePath(outputDirectory, reference.manifest) ?? "";
      payloadPath = resolveNativeAvArtifactFilePath(outputDirectory, reference.payload) ?? "";
      if (!manifestPath || !payloadPath) throw new Error(t(uiKeys.nativeAv.pathInvalid));
    } catch (error) {
      return failure("invalid", error instanceof Error ? error.message : String(error));
    }
    const [manifestStat, payloadStat] = await Promise.all([
      this.deps.fileSystem.stat(manifestPath),
      this.deps.fileSystem.stat(payloadPath)
    ]);
    if (!manifestStat?.isFile() || !payloadStat?.isFile()) {
      return {
        status: "missing",
        reason: t(uiKeys.nativeAv.filesMissing),
        manifestPath,
        payloadPath
      };
    }
    try {
      const manifest = JSON.parse(await this.deps.fileSystem.readText(manifestPath)) as unknown;
      if (!isNativeAvContinuationArtifact(manifest)) {
        return failure("invalid", t(uiKeys.nativeAv.manifestInvalid, { reason: validateNativeAvContinuationArtifact(manifest, t) ?? t(uiKeys.nativeAv.unknown) }));
      }
      // Hydrate from the files actually inspected, never from cached paths inside the manifest.
      const manifestArtifact = {
        ...manifest,
        manifest: { ...manifest.manifest, absolutePath: manifestPath },
        payload: { ...manifest.payload, absolutePath: payloadPath }
      };
      if (!sameArtifactReference(reference, manifestArtifact)) {
        return failure("invalid", t(uiKeys.nativeAv.referenceMismatch));
      }
      if (payloadStat.size !== manifestArtifact.payloadBytes) {
        return failure("invalid", t(uiKeys.nativeAv.bytesMismatch));
      }
      const parsedPayload = parseSafetensorsJointHeader(await this.deps.fileSystem.readFilePrefix(
        payloadPath,
        8 + MAX_SAFETENSORS_HEADER_BYTES
      ), t);
      validateSafetensorsPayloadLayout(parsedPayload, payloadStat.size, t);
      const payloadDigest = await hashFileStream(this.deps.fileSystem, payloadPath);
      const payloadAfterStat = await this.deps.fileSystem.stat(payloadPath);
      if (
        !payloadAfterStat?.isFile() ||
        payloadDigest.bytes !== payloadStat.size ||
        payloadAfterStat.size !== payloadDigest.bytes
      ) {
        return failure("invalid", t(uiKeys.nativeAv.payloadChanged));
      }
      if (!sha256Pattern.test(payloadDigest.sha256) || payloadDigest.sha256 !== manifestArtifact.payloadSha256) {
        return failure("invalid", t(uiKeys.nativeAv.hashMismatch));
      }
      validateJointPayloadGeometry(parsedPayload, manifestArtifact, t);
      if (
        JSON.stringify(parsedPayload.video.shape) !== JSON.stringify(manifestArtifact.videoShape) ||
        parsedPayload.video.dtype !== manifestArtifact.videoDtype ||
        JSON.stringify(parsedPayload.audio.shape) !== JSON.stringify(manifestArtifact.audioShape) ||
        parsedPayload.audio.dtype !== manifestArtifact.audioDtype
      ) {
        return failure("invalid", t(uiKeys.nativeAv.tensorMismatch));
      }
      return {
        status: "available",
        artifact: manifestArtifact,
        payloadPath,
        manifestPath,
        payloadBytes: payloadDigest.bytes
      };
    } catch (error) {
      return failure("invalid", error instanceof Error ? error.message : String(error));
    }
  }
}
