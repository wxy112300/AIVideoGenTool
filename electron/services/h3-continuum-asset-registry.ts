import { createHash } from "node:crypto";
import path from "node:path";
import type {
  ExtensionQueueTask,
  GenerationQueueTask,
  H3AvLatentAsset,
  H3AvProducerSnapshot,
  H3ContinuumReceipt,
  H3AvInventoryEntry,
  H3AvInventoryCandidate,
  H3AvReferenceIndex,
  HistoryFile,
  NativeAvContinuationArtifact,
  UpscaleQueueTask
} from "../../src/types.js";
import {
  extensionOutputDimensions,
  miniMaxH3ModelAssetNames
} from "../../src/core/workflow.js";
import { h3VideoVaeFilename } from "../../src/core/h3-video-vae.js";
import {
  continuumChunkCapabilityForStorage,
  isH3AvLatentAsset,
  safeH3OutputRelativePath,
  validateH3AvLatentAsset
} from "../../src/core/h3-av-asset.js";
import { classifyH3AvInventory } from "../../src/core/h3-av-inventory.js";
import {
  parseH3ContinuumManagedReceipt,
  type H3ContinuumManagedReceiptRaw
} from "../../src/core/h3-continuum-managed-receipt.js";
import type { NativeAvArtifactFileSystemPort } from "../ports/native-av-artifact-file-system.js";

const MAX_SAFETENSORS_HEADER_BYTES = 16 * 1024 * 1024;
const tensorDtypeBytes: Record<string, number> = { F16: 2, BF16: 2, F32: 4 };

interface TensorDescriptor {
  dtype: string;
  shape: number[];
  start: number;
  end: number;
}

interface ParsedPayload {
  video: TensorDescriptor;
  audio: TensorDescriptor;
  dataStart: number;
}

interface PayloadInspection extends ParsedPayload {
  bytes: number;
  payloadSha256: string;
  videoTensorSha256: string;
  audioTensorSha256: string;
  frameCount: number;
}

export interface H3ContinuumAssetRegistryDependencies {
  fileSystem: NativeAvArtifactFileSystemPort;
}

export interface H3ContinuumManagedAssetRegistrationRequest {
  outputDirectory: string;
  task: ExtensionQueueTask;
  receipt: H3ContinuumManagedReceiptRaw;
  workflowRevision: string;
  producerNodeId: string;
  producerNodeVersion: string;
  createdAt: string;
}

export interface H3ContinuumManagedAssetRegistrationResult {
  receipt: H3ContinuumReceipt;
  assets: H3AvLatentAsset[];
  assetsByChunkIndex: Record<number, H3AvLatentAsset>;
}

export interface H3NativeAssetRegistrationRequest {
  outputDirectory: string;
  task: GenerationQueueTask | ExtensionQueueTask | UpscaleQueueTask;
  artifact: NativeAvContinuationArtifact;
  createdAt: string;
}

export interface H3AvInventoryResult {
  outputDirectory: string;
  entries: H3AvInventoryEntry[];
  scannedDirectories: string[];
}

function isWithinDirectory(rootDirectory: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(rootDirectory), path.resolve(candidate));
  return relative === "" || (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function safeOutputPath(outputDirectory: string, candidate: string): string {
  const resolved = path.resolve(candidate);
  if (!isWithinDirectory(outputDirectory, resolved)) {
    throw new Error(`Continuum Run Storage 路径越出 output root：${candidate}`);
  }
  return resolved;
}

function historyFile(outputDirectory: string, filename: string, format: string): HistoryFile {
  const absolutePath = safeOutputPath(outputDirectory, filename);
  const relative = path.relative(path.resolve(outputDirectory), absolutePath);
  const parts = relative.split(path.sep).filter(Boolean);
  const basename = parts.pop();
  if (!basename || parts.length === 0 || parts.some((part) => part === "." || part === ".." || part.includes(":"))) {
    throw new Error(`Continuum HistoryFile 路径不安全：${filename}`);
  }
  return {
    filename: basename,
    subfolder: parts.join("/"),
    type: "output",
    format,
    absolutePath
  };
}

async function ensureAlias(
  fileSystem: NativeAvArtifactFileSystemPort,
  outputDirectory: string,
  ownerPath: string,
  assetId: string,
  expectedBytes: number,
  expectedSha256: string
): Promise<{ file: HistoryFile; mode: "hardlink" | "copy-fallback" }> {
  const aliasFilename = `${assetId}.safetensors`;
  const aliasAbsolutePath = path.join(outputDirectory, "h3-native-av", aliasFilename);
  const aliasFile = historyFile(outputDirectory, aliasAbsolutePath, "safetensors");
  const existing = await fileSystem.stat(aliasAbsolutePath);
  if (existing?.isFile()) {
    if (existing.size !== expectedBytes) throw new Error(`Continuum canonical alias 已存在但大小不匹配：${aliasAbsolutePath}`);
    const digest = createHash("sha256");
    let bytes = 0;
    for await (const chunk of fileSystem.readFileStream(aliasAbsolutePath)) {
      const value = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      bytes += value.byteLength;
      digest.update(value);
    }
    if (bytes !== expectedBytes || digest.digest("hex") !== expectedSha256) {
      throw new Error(`Continuum canonical alias 已存在但 SHA-256 不匹配：${aliasAbsolutePath}`);
    }
    return { file: aliasFile, mode: "hardlink" };
  }
  await fileSystem.makeDirectory(path.dirname(aliasAbsolutePath));
  if (fileSystem.hardlink) {
    try {
      await fileSystem.hardlink(ownerPath, aliasAbsolutePath);
      return { file: aliasFile, mode: "hardlink" };
    } catch {
      // Cross-volume or unsupported filesystems use the explicit fallback below.
    }
  }
  const temporary = `${aliasAbsolutePath}.${assetId}.tmp`;
  await fileSystem.copyFile(ownerPath, temporary);
  const copied = await fileSystem.stat(temporary);
  if (!copied?.isFile() || copied.size !== expectedBytes) {
    await fileSystem.remove(temporary).catch(() => undefined);
    throw new Error(`Continuum canonical alias copy fallback 大小不匹配：${aliasAbsolutePath}`);
  }
  const digest = createHash("sha256");
  let bytes = 0;
  for await (const chunk of fileSystem.readFileStream(temporary)) {
    const value = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    bytes += value.byteLength;
    digest.update(value);
  }
  if (bytes !== expectedBytes || digest.digest("hex") !== expectedSha256) {
    await fileSystem.remove(temporary).catch(() => undefined);
    throw new Error(`Continuum canonical alias copy fallback SHA-256 不匹配：${aliasAbsolutePath}`);
  }
  await fileSystem.rename(temporary, aliasAbsolutePath);
  return { file: aliasFile, mode: "copy-fallback" };
}

function parseDescriptor(value: unknown): TensorDescriptor | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const offsets = record.data_offsets;
  if (
    typeof record.dtype !== "string" ||
    !Array.isArray(record.shape) ||
    record.shape.length === 0 ||
    !record.shape.every((item) => typeof item === "number" && Number.isSafeInteger(item) && item > 0) ||
    !Array.isArray(offsets) ||
    offsets.length !== 2 ||
    !offsets.every((item) => typeof item === "number" && Number.isSafeInteger(item) && item >= 0)
  ) return null;
  const [start, end] = offsets as [number, number];
  if (end <= start || !tensorDtypeBytes[record.dtype]) return null;
  return { dtype: record.dtype, shape: record.shape as number[], start, end };
}

function expectedTensorBytes(descriptor: TensorDescriptor): number {
  let elements = 1;
  for (const dimension of descriptor.shape) {
    if (elements > Number.MAX_SAFE_INTEGER / dimension) throw new Error("safetensors shape 溢出");
    elements *= dimension;
  }
  const bytes = elements * tensorDtypeBytes[descriptor.dtype]!;
  if (!Number.isSafeInteger(bytes)) throw new Error("safetensors tensor bytes 溢出");
  return bytes;
}

function parseHeader(prefix: Uint8Array, payloadBytes: number): ParsedPayload {
  if (prefix.byteLength < 8) throw new Error("Continuum chunk safetensors 缺少 header length");
  const view = new DataView(prefix.buffer, prefix.byteOffset, prefix.byteLength);
  const headerLengthBigInt = view.getBigUint64(0, true);
  if (headerLengthBigInt > BigInt(MAX_SAFETENSORS_HEADER_BYTES)) throw new Error("Continuum chunk safetensors header 超出安全上限");
  const headerLength = Number(headerLengthBigInt);
  const dataStart = 8 + headerLength;
  if (dataStart > payloadBytes || dataStart > prefix.byteLength) throw new Error("Continuum chunk safetensors header 不完整");
  let header: unknown;
  try {
    header = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(prefix.subarray(8, dataStart))) as unknown;
  } catch {
    throw new Error("Continuum chunk safetensors header 不是有效 JSON");
  }
  if (!header || typeof header !== "object" || Array.isArray(header)) throw new Error("Continuum chunk safetensors header 无效");
  const entries = Object.entries(header as Record<string, unknown>).filter(([key]) => key !== "__metadata__");
  if (entries.length !== 2 || !entries.some(([key]) => key === "video") || !entries.some(([key]) => key === "audio")) throw new Error("Continuum chunk 必须且只能包含 video/audio tensors");
  const video = parseDescriptor((header as Record<string, unknown>).video);
  const audio = parseDescriptor((header as Record<string, unknown>).audio);
  if (!video || !audio) throw new Error("Continuum chunk video/audio tensor descriptor 无效");
  const dataBytes = payloadBytes - dataStart;
  for (const [name, tensor] of [["video", video], ["audio", audio]] as const) {
    if (tensor.end > dataBytes || tensor.end - tensor.start !== expectedTensorBytes(tensor)) throw new Error(`Continuum chunk ${name} tensor offsets/shape/dtype 不一致`);
  }
  if (Math.max(video.end, audio.end) !== dataBytes) throw new Error("Continuum chunk data 区域与 tensor offsets 不一致");
  return { video, audio, dataStart };
}

async function inspectPayload(
  fileSystem: NativeAvArtifactFileSystemPort,
  filename: string,
  width: number,
  height: number
): Promise<PayloadInspection> {
  const stat = await fileSystem.stat(filename);
  if (!stat?.isFile() || stat.size <= 0) throw new Error(`Continuum chunk payload 不存在：${filename}`);
  const parsed = parseHeader(await fileSystem.readFilePrefix(filename, 8 + MAX_SAFETENSORS_HEADER_BYTES), stat.size);
  if (parsed.video.shape.length !== 5 || parsed.video.shape[0] !== 1 || parsed.video.shape[1] !== 24 || parsed.video.shape[3] !== height / 16 || parsed.video.shape[4] !== width / 16) throw new Error("Continuum chunk video tensor geometry 无效");
  if (parsed.audio.shape.length !== 4 || parsed.audio.shape[0] !== 1 || parsed.audio.shape[1] !== 32 || parsed.audio.shape[2] !== 2) throw new Error("Continuum chunk audio tensor geometry 无效");
  const temporalLatent = parsed.video.shape[2]!;
  if ((temporalLatent - 2) % 5 !== 0) throw new Error("Continuum chunk video temporal latent 不符合 H3 时间网格");
  const frameCount = ((temporalLatent - 2) / 5) * 17 + 5;
  const expectedAudioTemporal = Math.round((frameCount / 24) * 40);
  if (parsed.audio.shape[3] !== expectedAudioTemporal) throw new Error("Continuum chunk audio temporal latent 与 video 不匹配");
  const payloadDigest = createHash("sha256");
  const videoDigest = createHash("sha256");
  const audioDigest = createHash("sha256");
  let offset = 0;
  for await (const chunk of fileSystem.readFileStream(filename)) {
    const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    payloadDigest.update(bytes);
    for (const [digest, descriptor] of [[videoDigest, parsed.video], [audioDigest, parsed.audio]] as const) {
      const start = Math.max(0, parsed.dataStart + descriptor.start - offset);
      const end = Math.min(bytes.byteLength, parsed.dataStart + descriptor.end - offset);
      if (end > start) digest.update(bytes.subarray(start, end));
    }
    offset += bytes.byteLength;
  }
  if (offset !== stat.size) throw new Error("Continuum chunk payload 在校验期间发生变化");
  return {
    ...parsed,
    bytes: stat.size,
    payloadSha256: payloadDigest.digest("hex"),
    videoTensorSha256: videoDigest.digest("hex"),
    audioTensorSha256: audioDigest.digest("hex"),
    frameCount
  };
}

/**
 * Inventory only needs the safetensors header and content digests.  It must
 * not decode video/audio or require a canonical manifest to decide whether a
 * legacy file is malformed or shares tensor content with another file.
 */
async function inspectPayloadHeaderAndDigests(
  fileSystem: NativeAvArtifactFileSystemPort,
  filename: string
): Promise<{
  bytes: number;
  parsed: ParsedPayload;
  payloadSha256: string;
  videoTensorSha256: string;
  audioTensorSha256: string;
}> {
  const stat = await fileSystem.stat(filename);
  if (!stat?.isFile() || stat.size <= 0) throw new Error(`H3 AV inventory payload 不存在：${filename}`);
  const parsed = parseHeader(await fileSystem.readFilePrefix(filename, 8 + MAX_SAFETENSORS_HEADER_BYTES), stat.size);
  const payloadDigest = createHash("sha256");
  const videoDigest = createHash("sha256");
  const audioDigest = createHash("sha256");
  let offset = 0;
  for await (const chunk of fileSystem.readFileStream(filename)) {
    const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    payloadDigest.update(bytes);
    for (const [digest, descriptor] of [[videoDigest, parsed.video], [audioDigest, parsed.audio]] as const) {
      const start = Math.max(0, parsed.dataStart + descriptor.start - offset);
      const end = Math.min(bytes.byteLength, parsed.dataStart + descriptor.end - offset);
      if (end > start) digest.update(bytes.subarray(start, end));
    }
    offset += bytes.byteLength;
  }
  if (offset !== stat.size) throw new Error("H3 AV inventory payload 在校验期间发生变化");
  return {
    bytes: stat.size,
    parsed,
    payloadSha256: payloadDigest.digest("hex"),
    videoTensorSha256: videoDigest.digest("hex"),
    audioTensorSha256: audioDigest.digest("hex")
  };
}

function normalizeReceipt(
  outputDirectory: string,
  raw: H3ContinuumManagedReceiptRaw
): H3ContinuumReceipt {
  const revisionRoot = safeOutputPath(outputDirectory, raw.run_storage_path);
  const runStorageRoot = historyFile(outputDirectory, path.join(revisionRoot, "manifest.json"), "json");
  const chunkRecords = raw.chunk_records.map((record) => ({
    logicalChunkIndex: record.logical_chunk_index,
    recordFilename: record.record_filename,
    payloadPath: historyFile(outputDirectory, record.payload_path, "safetensors"),
    reused: record.reused,
    generated: record.generated
  }));
  return {
    schemaVersion: 1,
    projectId: raw.project_id,
    runName: raw.run_name,
    runStorageRoot,
    revisionId: raw.revision_id,
    packageVersion: raw.package_version,
    runStorageSchemaVersion: raw.run_storage_schema_version,
    generationMode: "Review Each Chunk",
    reviewAction: raw.review_action,
    runStorage: "Save + Auto Resume",
    selectedSource: "run_storage",
    freshFallback: false,
    requestedChunks: raw.requested_chunks,
    reusedCount: raw.reused_count,
    generatedCount: raw.generated_count,
    reusedChunkIndices: [...raw.reused_chunk_indices],
    generatedChunkIndices: [...raw.generated_chunk_indices],
    firstGeneratedChunk: raw.first_generated_chunk,
    chunkRecords,
    actualAssemblyTotalFrames: [...raw.actual_assembly_total_frames],
    actualAssemblyTrims: [...raw.actual_assembly_trims],
    actualAssemblyNetFrames: [...raw.actual_assembly_net_frames],
    actualAssemblyContextFrames: [...raw.actual_assembly_context_frames],
    spectrumMode: raw.spectrum_mode,
    spectrumModelAwareMode: raw.spectrum_model_aware_mode,
    ...(raw.continuum_interop_api === undefined ? {} : { continuumInteropApi: raw.continuum_interop_api }),
    createdAt: raw.created_at
  };
}

function producerFor(
  request: H3ContinuumManagedAssetRegistrationRequest,
  assets: NonNullable<ReturnType<typeof miniMaxH3ModelAssetNames>>,
  width: number,
  height: number,
  frameCount: number
): H3AvProducerSnapshot {
  return {
    workflowId: path.basename(request.task.workflowPath),
    workflowRevision: request.workflowRevision,
    producerNodeId: request.producerNodeId,
    producerNodeVersion: request.producerNodeVersion,
    executionModelId: request.task.modelId,
    diffusionModelFilename: assets.diffusionModel,
    textEncoderFilename: assets.textEncoder,
    videoVaeFilename: h3VideoVaeFilename(request.task.h3VideoVaeMode ?? "fp16"),
    audioVaeFilename: "minimax_h3_audio_vae_fp32.safetensors",
    loraFilenames: (request.task.videoLoras ?? []).map((lora) => lora.filename),
    width,
    height,
    fps: 24,
    frameCount,
    sourceTaskId: request.task.id,
    sourceVersionId: request.task.sourceVersionId
  };
}

function expectedFrameCountForReceiptChunk(
  receipt: H3ContinuumManagedReceiptRaw,
  logicalChunkIndex: number
): number {
  const expected = receipt.actual_assembly_total_frames[logicalChunkIndex - 1];
  if (!Number.isSafeInteger(expected) || expected <= 0) {
    throw new Error(`Continuum chunk ${logicalChunkIndex} 缺少官方 assembly frame count`);
  }
  return expected;
}

export class H3ContinuumAssetRegistry {
  constructor(private readonly deps: H3ContinuumAssetRegistryDependencies) {}

  async registerNativeArtifact(
    request: H3NativeAssetRegistrationRequest
  ): Promise<H3AvLatentAsset> {
    const payloadReference = request.artifact.payload;
    const payloadPath = safeOutputPath(
      request.outputDirectory,
      payloadReference.absolutePath ?? path.join(
        request.outputDirectory,
        payloadReference.subfolder,
        payloadReference.filename
      )
    );
    const inspection = await inspectPayload(
      this.deps.fileSystem,
      payloadPath,
      request.artifact.width,
      request.artifact.height
    );
    if (
      inspection.bytes !== request.artifact.payloadBytes ||
      inspection.payloadSha256 !== request.artifact.payloadSha256 ||
      inspection.frameCount !== request.artifact.frameCount
    ) {
      throw new Error("Native AV artifact 在 canonical asset 登记前发生内容或帧网格不一致");
    }
    const sourceVersionId = request.task.taskType === "extension"
      ? request.task.sourceVersionId
      : undefined;
    const producer: H3AvProducerSnapshot = {
      workflowId: request.artifact.workflowId ?? path.basename(request.task.workflowPath),
      workflowRevision: request.artifact.workflowRevision,
      producerNodeId: request.artifact.producerNodeId ?? "LocalVideoStudioH3SaveJointAV",
      producerNodeVersion: request.artifact.producerNodeVersion ?? "legacy-unverified",
      executionModelId: request.artifact.executionModelId,
      diffusionModelFilename: request.artifact.diffusionModelFilename,
      textEncoderFilename: request.artifact.textEncoderFilename,
      videoVaeFilename: request.artifact.videoVaeFilename,
      audioVaeFilename: request.artifact.audioVaeFilename,
      loraFilenames: (request.task.videoLoras ?? []).map((lora) => lora.filename),
      width: request.artifact.width,
      height: request.artifact.height,
      fps: 24,
      frameCount: inspection.frameCount,
      sourceTaskId: request.artifact.sourceTaskId || request.task.id,
      ...(request.artifact.sourceVersionId ?? sourceVersionId
        ? { sourceVersionId: request.artifact.sourceVersionId ?? sourceVersionId }
        : {})
    };
    const asset: H3AvLatentAsset = {
      schemaVersion: 1,
      assetId: `h3av_${request.artifact.artifactId}`,
      storageKind: "app-canonical",
      ownerPath: payloadReference,
      payloadBytes: inspection.bytes,
      payloadSha256: inspection.payloadSha256,
      videoTensorSha256: inspection.videoTensorSha256,
      audioTensorSha256: inspection.audioTensorSha256,
      videoShape: inspection.video.shape,
      videoDtype: inspection.video.dtype,
      audioShape: inspection.audio.shape,
      audioDtype: inspection.audio.dtype,
      width: request.artifact.width,
      height: request.artifact.height,
      fps: 24,
      frameCount: inspection.frameCount,
      sampleScope: request.task.taskType === "extension"
        ? "extension-segment"
        : "generated-clip",
      artifactRole: request.artifact.role,
      contextFrames: request.artifact.contextFrames,
      producer,
      capabilities: ["native-av"],
      createdAt: request.createdAt
    };
    const assetError = validateH3AvLatentAsset(asset);
    if (assetError) throw new Error(`Native canonical asset 校验失败：${assetError}`);
    return asset;
  }

  private async walkSafetensors(root: string, directory: string, relativeDirectory: string): Promise<string[]> {
    if (!this.deps.fileSystem.listDirectory) throw new Error("当前文件系统适配器不支持 H3 AV inventory 扫描");
    const entries = await this.deps.fileSystem.listDirectory(directory).catch(() => []);
    const files: string[] = [];
    for (const entry of entries) {
      if (entry.name === "." || entry.name === ".." || entry.name.includes("..")) continue;
      const absolute = safeOutputPath(root, path.join(directory, entry.name));
      const relative = path.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.walkSafetensors(root, absolute, relative));
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".safetensors")) {
        files.push(relative);
      }
    }
    return files;
  }

  /**
   * Read-only Phase 5 inventory.  It scans only app-owned latent roots and
   * canonical manifests; it does not decode, relink, import, or delete files.
   */
  async inventoryOutputRoot(
    outputDirectory: string,
    references?: H3AvReferenceIndex
  ): Promise<H3AvInventoryResult> {
    const root = path.resolve(outputDirectory);
    if (!this.deps.fileSystem.listDirectory) {
      throw new Error("当前文件系统适配器不支持 H3 AV inventory 扫描");
    }
    const scannedDirectories = [
      "h3-native-av",
      "h3-motion-context",
      "h3_context",
      "h3-continuum/runs"
    ];
    const manifestDirectory = safeOutputPath(root, path.join(root, "h3-continuum-assets"));
    const manifestEntries = await this.deps.fileSystem.listDirectory(manifestDirectory).catch(() => []);
    const manifests = new Map<string, H3AvLatentAsset>();
    const candidates: H3AvInventoryCandidate[] = [];
    for (const entry of manifestEntries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) continue;
      const manifestAbsolute = safeOutputPath(root, path.join(manifestDirectory, entry.name));
      const manifestFile = historyFile(root, manifestAbsolute, "json");
      try {
        const parsed = JSON.parse(await this.deps.fileSystem.readText(manifestAbsolute)) as unknown;
        if (!isH3AvLatentAsset(parsed)) {
          candidates.push({ referenceId: `manifest:${entry.name}`, path: manifestFile, present: true, validationError: validateH3AvLatentAsset(parsed) ?? "manifest 无效" });
          continue;
        }
        manifests.set(parsed.assetId, parsed);
      } catch (error) {
        candidates.push({ referenceId: `manifest:${entry.name}`, path: manifestFile, present: true, validationError: error instanceof Error ? error.message : "manifest 无法读取" });
      }
    }
    const knownByRelativePath = new Map<string, H3AvLatentAsset>();
    for (const asset of manifests.values()) {
      knownByRelativePath.set(safeH3OutputRelativePath(asset.ownerPath)!, asset);
      for (const alias of asset.aliasPaths ?? []) {
        knownByRelativePath.set(safeH3OutputRelativePath(alias)!, asset);
      }
    }
    const payloadFiles: string[] = [];
    for (const relativeDirectory of scannedDirectories) {
      const directory = safeOutputPath(root, path.join(root, relativeDirectory));
      payloadFiles.push(...await this.walkSafetensors(root, directory, relativeDirectory));
    }
    const seenRelativePaths = new Set(payloadFiles.map((value) => value.replaceAll("\\", "/")));
    for (const relative of payloadFiles) {
      const normalized = relative.replaceAll("\\", "/");
      const file = historyFile(root, safeOutputPath(root, path.join(root, relative)), "safetensors");
      const asset = knownByRelativePath.get(normalized);
      let inspected: Awaited<ReturnType<typeof inspectPayloadHeaderAndDigests>> | undefined;
      let validationError: string | undefined;
      try {
        inspected = await inspectPayloadHeaderAndDigests(
          this.deps.fileSystem,
          safeOutputPath(root, path.join(root, relative))
        );
        if (asset) {
          const mismatches = [
            inspected.bytes !== asset.payloadBytes ? "payloadBytes" : "",
            inspected.payloadSha256 !== asset.payloadSha256 ? "payloadSha256" : "",
            inspected.videoTensorSha256 !== asset.videoTensorSha256 ? "videoTensorSha256" : "",
            inspected.audioTensorSha256 !== asset.audioTensorSha256 ? "audioTensorSha256" : ""
          ].filter(Boolean);
          if (mismatches.length > 0) validationError = `canonical manifest 与 payload 不一致：${mismatches.join(", ")}`;
        }
      } catch (error) {
        validationError = error instanceof Error ? error.message : "safetensors header/digest 无法读取";
      }
      candidates.push({
        referenceId: `payload:${normalized}`,
        path: file,
        ...(asset ? { asset, storageKind: asset.storageKind, payloadSha256: asset.payloadSha256, videoTensorSha256: asset.videoTensorSha256, audioTensorSha256: asset.audioTensorSha256 } : {}),
        present: true,
        ...(inspected ? {
          payloadBytes: inspected.bytes,
          payloadSha256: inspected.payloadSha256,
          videoTensorSha256: inspected.videoTensorSha256,
          audioTensorSha256: inspected.audioTensorSha256
        } : {}),
        ...(validationError ? { validationError } : {}),
        ...(asset ? {} : { legacy: !normalized.startsWith("h3-continuum/runs/") })
      });
    }
    for (const asset of manifests.values()) {
      const ownerRelative = safeH3OutputRelativePath(asset.ownerPath)!;
      if (!seenRelativePaths.has(ownerRelative)) {
        candidates.push({
          referenceId: `payload:${ownerRelative}`,
          path: asset.ownerPath,
          asset,
          storageKind: asset.storageKind,
          present: false,
          payloadSha256: asset.payloadSha256,
          videoTensorSha256: asset.videoTensorSha256,
          audioTensorSha256: asset.audioTensorSha256
        });
      }
    }
    return {
      outputDirectory: root,
      entries: classifyH3AvInventory(candidates, references),
      scannedDirectories
    };
  }

  async registerManagedReceipt(
    request: H3ContinuumManagedAssetRegistrationRequest
  ): Promise<H3ContinuumManagedAssetRegistrationResult> {
    const raw = parseH3ContinuumManagedReceipt(request.receipt);
    const receipt = normalizeReceipt(request.outputDirectory, raw);
    const assets = miniMaxH3ModelAssetNames(request.task.modelId);
    if (!assets) throw new Error(`Continuum managed asset 缺少 ${request.task.modelId} 模型资产映射`);
    const [width, height] = extensionOutputDimensions(request.task);
    const bySha = new Map<string, H3AvLatentAsset>();
    const assetsByChunkIndex: Record<number, H3AvLatentAsset> = {};
    for (const record of receipt.chunkRecords) {
      const filename = record.payloadPath.absolutePath;
      if (!filename) throw new Error(`Continuum chunk 缺少绝对路径：${record.recordFilename}`);
      const inspection = await inspectPayload(this.deps.fileSystem, safeOutputPath(request.outputDirectory, filename), width, height);
      const expectedFrameCount = expectedFrameCountForReceiptChunk(request.receipt, record.logicalChunkIndex);
      if (inspection.frameCount !== expectedFrameCount) {
        throw new Error(`Continuum chunk ${record.logicalChunkIndex} 的帧网格与官方 assembly plan 不一致（实际 ${inspection.frameCount}，应为 ${expectedFrameCount}）`);
      }
      const producer = producerFor(request, assets, width, height, expectedFrameCount);
      const existing = bySha.get(inspection.payloadSha256);
      if (existing) {
        assetsByChunkIndex[record.logicalChunkIndex] = existing;
        continue;
      }
      const assetId = `h3av_${inspection.payloadSha256}`;
      const ownerPath = record.payloadPath;
      const alias = await ensureAlias(
        this.deps.fileSystem,
        request.outputDirectory,
        filename,
        assetId,
        inspection.bytes,
        inspection.payloadSha256
      );
      const manifestPath = path.join(request.outputDirectory, "h3-continuum-assets", `${assetId}.json`);
      const asset: H3AvLatentAsset = {
        schemaVersion: 1,
        assetId,
        storageKind: "continuum-run-chunk",
        ownerPath,
        aliasPaths: [alias.file],
        aliasMode: alias.mode,
        payloadBytes: inspection.bytes,
        payloadSha256: inspection.payloadSha256,
        videoTensorSha256: inspection.videoTensorSha256,
        audioTensorSha256: inspection.audioTensorSha256,
        videoShape: inspection.video.shape,
        videoDtype: inspection.video.dtype,
        audioShape: inspection.audio.shape,
        audioDtype: inspection.audio.dtype,
        width,
        height,
        fps: 24,
        frameCount: inspection.frameCount,
        sampleScope: "continuum-chunk",
        contextFrames: receipt.actualAssemblyContextFrames[record.logicalChunkIndex - 1],
        producer,
        capabilities: continuumChunkCapabilityForStorage("continuum-run-chunk"),
        continuumChunk: {
          projectId: receipt.projectId,
          runName: receipt.runName,
          runStorageRoot: receipt.runStorageRoot,
          revisionId: raw.chunk_records.find((item) => item.logical_chunk_index === record.logicalChunkIndex)?.storage_revision_id ?? receipt.revisionId,
          manifest: receipt.runStorageRoot,
          recordFilename: record.recordFilename,
          logicalChunkIndex: record.logicalChunkIndex,
          physicalGroupStart: record.logicalChunkIndex,
          physicalGroupEnd: record.logicalChunkIndex,
          accepted: true,
          reused: record.reused
        },
        createdAt: request.createdAt
      };
      const assetError = validateH3AvLatentAsset(asset);
      if (assetError) throw new Error(`Continuum managed asset 校验失败：${assetError}`);
      const existingManifest = await this.deps.fileSystem.stat(manifestPath);
      if (existingManifest?.isFile()) {
        const persisted = JSON.parse(await this.deps.fileSystem.readText(manifestPath)) as unknown;
        if (!isH3AvLatentAsset(persisted) || (persisted as H3AvLatentAsset).payloadSha256 !== asset.payloadSha256) {
          throw new Error(`拒绝覆盖不一致的 Continuum asset manifest：${manifestPath}`);
        }
        bySha.set(inspection.payloadSha256, persisted as H3AvLatentAsset);
        assetsByChunkIndex[record.logicalChunkIndex] = persisted as H3AvLatentAsset;
      } else {
        await this.deps.fileSystem.makeDirectory(path.dirname(manifestPath));
        const temporary = `${manifestPath}.${assetId}.tmp`;
        await this.deps.fileSystem.writeFile(temporary, JSON.stringify(asset, null, 2));
        await this.deps.fileSystem.rename(temporary, manifestPath);
        bySha.set(inspection.payloadSha256, asset);
        assetsByChunkIndex[record.logicalChunkIndex] = asset;
      }
    }
    return { receipt, assets: [...bySha.values()], assetsByChunkIndex };
  }
}
