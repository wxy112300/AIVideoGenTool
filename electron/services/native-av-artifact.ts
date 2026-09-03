import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import type {
  H3ContinuationDataStatus,
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

function artifactDirectory(outputDirectory: string): string {
  const root = outputDirectory.trim();
  if (!root) throw new Error("视频输出目录为空，无法保存 H3 AV artifact");
  const directory = path.resolve(root, H3_CONTINUATION_ARTIFACT_SUBFOLDER);
  if (!isWithinDirectory(root, directory)) throw new Error("H3 AV artifact 目录越界");
  return directory;
}

function safeArtifactPath(outputDirectory: string, filename: string): string {
  const directory = artifactDirectory(outputDirectory);
  if (!filename || path.basename(filename) !== filename || filename.includes("..")) {
    throw new Error("H3 AV artifact 文件名不安全");
  }
  const candidate = path.resolve(directory, filename);
  if (!isWithinDirectory(directory, candidate)) throw new Error("H3 AV artifact 路径越界");
  return candidate;
}

function safeProducedFilePath(
  outputDirectory: string,
  descriptor: NativeAvArtifactProducedFileDescriptor
): string {
  if (
    descriptor.type !== "output" ||
    descriptor.subfolder !== H3_CONTINUATION_ARTIFACT_SUBFOLDER ||
    (descriptor.format !== undefined && descriptor.format !== H3_CONTINUATION_ARTIFACT_PAYLOAD_FORMAT)
  ) {
    throw new Error("Comfy H3 AV output descriptor 不属于受管 output/h3-native-av safetensors");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}\.safetensors$/u.test(descriptor.filename)) {
    throw new Error("Comfy H3 AV output descriptor 文件名不安全");
  }
  return safeArtifactPath(outputDirectory, descriptor.filename);
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

function parseSafetensorsJointHeader(payload: Uint8Array): ParsedJointAvPayload {
  if (payload.byteLength < 8) throw new Error("safetensors payload 截断：缺少 header length");
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const headerLengthBigInt = view.getBigUint64(0, true);
  if (headerLengthBigInt > BigInt(MAX_SAFETENSORS_HEADER_BYTES)) {
    throw new Error("safetensors header 超出安全上限");
  }
  const headerLength = Number(headerLengthBigInt);
  const dataStart = 8 + headerLength;
  if (dataStart > payload.byteLength) throw new Error("safetensors payload 截断：header 不完整");

  let header: unknown;
  try {
    const headerBytes = payload.subarray(8, dataStart);
    const headerText = new TextDecoder("utf-8", { fatal: true }).decode(headerBytes);
    header = JSON.parse(headerText) as unknown;
  } catch {
    throw new Error("safetensors header 不是有效 JSON");
  }
  if (!header || typeof header !== "object" || Array.isArray(header)) {
    throw new Error("safetensors header 格式无效");
  }
  const entries = Object.entries(header as Record<string, unknown>)
    .filter(([key]) => key !== "__metadata__");
  if (entries.length !== 2 || !entries.some(([key]) => key === "video") || !entries.some(([key]) => key === "audio")) {
    throw new Error("safetensors 必须且只能包含 video/audio 两个 tensor");
  }
  const video = tensorDescriptor((header as Record<string, unknown>).video);
  const audio = tensorDescriptor((header as Record<string, unknown>).audio);
  if (!video || !audio) throw new Error("video/audio tensor descriptor 无效");
  return { video, audio, dataStart };
}

function validateSafetensorsPayloadLayout(
  payload: ParsedJointAvPayload,
  payloadBytes: number
): void {
  if (!Number.isSafeInteger(payloadBytes) || payloadBytes < payload.dataStart) {
    throw new Error("safetensors payload 截断：data 区域不完整");
  }
  const dataBytes = payloadBytes - payload.dataStart;
  let maxDataOffset = 0;
  for (const [key, descriptor] of [["video", payload.video], ["audio", payload.audio]] as const) {
    const [start, end] = descriptor.dataOffsets;
    if (start < 0 || end > dataBytes) throw new Error(`${key} tensor data_offsets 越界`);
    maxDataOffset = Math.max(maxDataOffset, end);
    const expectedBytes = expectedTensorBytes(descriptor);
    if (expectedBytes === null || expectedBytes !== end - start) {
      throw new Error(`${key} tensor data size 与 shape/dtype 不匹配`);
    }
  }
  if (maxDataOffset !== dataBytes) {
    throw new Error("safetensors data 区域长度与 header offsets 不匹配");
  }
}

function parseSafetensorsJointPayload(payload: Uint8Array): ParsedJointAvPayload {
  const parsed = parseSafetensorsJointHeader(payload);
  validateSafetensorsPayloadLayout(parsed, payload.byteLength);
  return parsed;
}

function validateJointPayloadGeometry(
  payload: ParsedJointAvPayload,
  request: Pick<NativeAvArtifactCommitRequest, "width" | "height" | "frameCount">
): void {
  if (payload.video.shape.length !== 5 || payload.video.shape[0] !== 1 || payload.video.shape[1] !== 24) {
    throw new Error("video tensor 必须为 [1,24,T,H/16,W/16]");
  }
  const expectedVideoTemporal = ((request.frameCount - 5) / 17) * 5 + 2;
  if (payload.video.shape[2] !== expectedVideoTemporal) {
    throw new Error(`video tensor 的时间 shape 必须为 ${expectedVideoTemporal}`);
  }
  if (
    payload.video.shape[3] !== request.height / 16 ||
    payload.video.shape[4] !== request.width / 16
  ) {
    throw new Error("video tensor 的空间 shape 与 artifact 几何不匹配");
  }
  if (payload.audio.shape.length !== 4 || payload.audio.shape[0] !== 1 || payload.audio.shape[1] !== 32 || payload.audio.shape[2] !== 2) {
    throw new Error("audio tensor 必须为 [1,32,2,T40]");
  }
  const expectedAudioTemporal = Math.round((request.frameCount / 24) * 40);
  if (payload.audio.shape[3] !== expectedAudioTemporal) {
    throw new Error(`audio tensor 的时间 shape 必须为 ${expectedAudioTemporal}`);
  }
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
  outputDirectory: string
): NativeAvContinuationArtifact {
  const manifestPath = safeArtifactPath(outputDirectory, artifact.manifest.filename);
  const payloadPath = safeArtifactPath(outputDirectory, artifact.payload.filename);
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
      absolutePath: undefined
    },
    payload: {
      ...artifact.payload,
      format: artifact.payload.format ?? "safetensors",
      absolutePath: undefined
    }
  };
}

export class NativeAvArtifactService {
  constructor(private readonly deps: NativeAvArtifactServiceDependencies) {}

  /**
   * Commit a file already produced by a ComfyUI serializer node. The payload
   * stays on disk throughout this path: Electron only reads the bounded
   * safetensors header and streams bytes for the hash before publishing the
   * manifest commit marker.
   */
  async commitProducedFile(
    request: NativeAvArtifactProducedFileCommitRequest
  ): Promise<NativeAvContinuationData> {
    let payloadPath = "";
    let manifestPath = "";
    let payloadTemporary = "";
    let manifestTemporary = "";
    let payloadCopied = false;
    let manifestCommitted = false;
    try {
      if (request.width <= 0 || request.height <= 0 || request.width % 32 !== 0 || request.height % 32 !== 0) {
        return failure("save-failed", "H3 AV artifact 几何必须为正数且 32 对齐");
      }
      if (request.fps !== undefined && request.fps !== 24) {
        return failure("save-failed", "H3 AV artifact 只接受 24 FPS");
      }
      if (!Number.isSafeInteger(request.frameCount) || request.frameCount <= 0 || (request.frameCount - 5) % 17 !== 0) {
        return failure("save-failed", "frameCount 不符合 H3 时间网格");
      }
      if (!Number.isSafeInteger(request.contextFrames) || request.contextFrames < 0) {
        return failure("save-failed", "contextFrames 无效");
      }
      if (request.providerId !== "comfyui") {
        return failure("save-failed", "新的 H3 AV artifact 只能由 ComfyUI provider 提交");
      }
      for (const [key, value] of [
        ["producerNodeId", request.producerNodeId],
        ["producerNodeVersion", request.producerNodeVersion],
        ["workflowId", request.workflowId]
      ] as const) {
        if (!value.trim()) return failure("save-failed", `缺少 ${key}`);
      }

      const sourcePath = safeProducedFilePath(request.outputDirectory, request.producedFile);
      const sourceStat = await this.deps.fileSystem.stat(sourcePath);
      if (!sourceStat?.isFile() || sourceStat.size <= 0) {
        return failure("missing", "Comfy H3 AV serializer 没有产出可提交的 safetensors 文件");
      }
      const artifactId = request.artifactId ?? randomUUID();
      const filenames = continuationArtifactFilenames(artifactId);
      const directory = artifactDirectory(request.outputDirectory);
      payloadPath = safeArtifactPath(request.outputDirectory, filenames.payload);
      manifestPath = safeArtifactPath(request.outputDirectory, filenames.manifest);
      const existingManifest = await this.deps.fileSystem.stat(manifestPath);
      const existingPayload = await this.deps.fileSystem.stat(payloadPath);
      if (existingManifest || (existingPayload && sourcePath !== payloadPath)) {
        return failure("save-failed", `artifact ${artifactId} 已存在，拒绝覆盖旧结果`);
      }

      const header = parseSafetensorsJointHeader(await this.deps.fileSystem.readFilePrefix(
        sourcePath,
        8 + MAX_SAFETENSORS_HEADER_BYTES
      ));
      validateSafetensorsPayloadLayout(header, sourceStat.size);
      validateJointPayloadGeometry(header, request);
      const digest = await hashFileStream(this.deps.fileSystem, sourcePath);
      const afterStat = await this.deps.fileSystem.stat(sourcePath);
      if (digest.bytes !== sourceStat.size || !afterStat?.isFile() || afterStat.size !== digest.bytes) {
        return failure("save-failed", "Comfy H3 AV payload 在校验期间发生变化，拒绝提交");
      }

      const baseArtifact = buildArtifactManifest(
        request,
        artifactId,
        filenames,
        header,
        digest.sha256,
        digest.bytes
      );
      const artifactError = validateNativeAvContinuationArtifact(baseArtifact);
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
          throw new Error("复制 H3 AV payload 后的字节数或 SHA-256 不匹配");
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
      return { status: "available", artifact: artifactWithAbsolutePaths(baseArtifact, request.outputDirectory) };
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
    let payloadPath = "";
    let manifestPath = "";
    let payloadTemporary = "";
    let manifestTemporary = "";
    let payloadCommitted = false;
    let manifestCommitted = false;
    try {
      if (request.width <= 0 || request.height <= 0 || request.width % 32 !== 0 || request.height % 32 !== 0) {
        return failure("save-failed", "H3 AV artifact 几何必须为正数且 32 对齐");
      }
      if (request.fps !== undefined && request.fps !== 24) {
        return failure("save-failed", "H3 AV artifact 只接受 24 FPS");
      }
      if (!Number.isSafeInteger(request.frameCount) || request.frameCount <= 0 || (request.frameCount - 5) % 17 !== 0) {
        return failure("save-failed", "frameCount 不符合 H3 时间网格");
      }
      if (!Number.isSafeInteger(request.contextFrames) || request.contextFrames < 0) {
        return failure("save-failed", "contextFrames 无效");
      }
      const artifactId = request.artifactId ?? randomUUID();
      const filenames = continuationArtifactFilenames(artifactId);
      const directory = artifactDirectory(request.outputDirectory);
      payloadPath = safeArtifactPath(request.outputDirectory, filenames.payload);
      manifestPath = safeArtifactPath(request.outputDirectory, filenames.manifest);
      payloadTemporary = path.join(directory, `.${filenames.payload}.${randomUUID()}.partial`);
      manifestTemporary = path.join(directory, `.${filenames.manifest}.${randomUUID()}.tmp`);
      if (await this.deps.fileSystem.stat(payloadPath) || await this.deps.fileSystem.stat(manifestPath)) {
        return failure("save-failed", `artifact ${artifactId} 已存在，拒绝覆盖旧结果`);
      }

      const payload = new Uint8Array(request.payload);
      const parsedPayload = parseSafetensorsJointPayload(payload);
      validateJointPayloadGeometry(parsedPayload, request);
      const payloadHash = sha256(payload);
      const baseArtifact = buildArtifactManifest(
        request,
        artifactId,
        filenames,
        parsedPayload,
        payloadHash,
        payload.byteLength
      );
      const artifactError = validateNativeAvContinuationArtifact(baseArtifact);
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
      return { status: "available", artifact: artifactWithAbsolutePaths(baseArtifact, request.outputDirectory) };
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
    const referenceError = validateNativeAvContinuationArtifact(reference);
    if (referenceError) return failure("invalid", referenceError);
    let manifestPath = "";
    let payloadPath = "";
    try {
      manifestPath = safeArtifactPath(outputDirectory, reference.manifest.filename);
      payloadPath = safeArtifactPath(outputDirectory, reference.payload.filename);
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
        reason: "manifest 或 payload 文件不存在",
        manifestPath,
        payloadPath
      };
    }
    try {
      const manifest = JSON.parse(await this.deps.fileSystem.readText(manifestPath)) as unknown;
      if (!isNativeAvContinuationArtifact(manifest)) {
        return failure("invalid", `manifest 无效：${validateNativeAvContinuationArtifact(manifest) ?? "未知错误"}`);
      }
      const manifestArtifact = artifactWithAbsolutePaths(manifest, outputDirectory);
      if (!sameArtifactReference(reference, manifestArtifact)) {
        return failure("invalid", "持久化引用与 manifest 不匹配");
      }
      if (payloadStat.size !== manifestArtifact.payloadBytes) {
        return failure("invalid", "payload 字节数与 manifest 不匹配");
      }
      const parsedPayload = parseSafetensorsJointHeader(await this.deps.fileSystem.readFilePrefix(
        payloadPath,
        8 + MAX_SAFETENSORS_HEADER_BYTES
      ));
      validateSafetensorsPayloadLayout(parsedPayload, payloadStat.size);
      const payloadDigest = await hashFileStream(this.deps.fileSystem, payloadPath);
      const payloadAfterStat = await this.deps.fileSystem.stat(payloadPath);
      if (
        !payloadAfterStat?.isFile() ||
        payloadDigest.bytes !== payloadStat.size ||
        payloadAfterStat.size !== payloadDigest.bytes
      ) {
        return failure("invalid", "payload 在校验期间发生变化");
      }
      if (!sha256Pattern.test(payloadDigest.sha256) || payloadDigest.sha256 !== manifestArtifact.payloadSha256) {
        return failure("invalid", "payload SHA-256 校验失败");
      }
      validateJointPayloadGeometry(parsedPayload, manifestArtifact);
      if (
        JSON.stringify(parsedPayload.video.shape) !== JSON.stringify(manifestArtifact.videoShape) ||
        parsedPayload.video.dtype !== manifestArtifact.videoDtype ||
        JSON.stringify(parsedPayload.audio.shape) !== JSON.stringify(manifestArtifact.audioShape) ||
        parsedPayload.audio.dtype !== manifestArtifact.audioDtype
      ) {
        return failure("invalid", "payload tensor shape/dtype 与 manifest 不匹配");
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
