import { createNativeTranslator } from "../ui-translator.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
import type { Translate } from "../../src/core/i18n.js";
import { historyDiagnosticForDisplay } from "../../src/core/history-diagnostic.js";
import type {
  Draft,
  NativeAvArtifactInspection,
  VideoExtensionSourceInspection
} from "../../src/types.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { h3ContinuumModeForSource, isMiniMaxH3ContinuumModel, isMiniMaxH3R2vModel, miniMaxH3ModelAssetNames, outputDimensions } from "../../src/core/workflow.js";
import { safeH3OutputRelativePath, validateContinuumSequence } from "../../src/core/h3-av-asset.js";
import type { StateRepository } from "../ports/state-repository.js";
import { NativeAvArtifactService } from "./native-av-artifact.js";

export interface HistoryArtifactServiceDependencies {
  store: StateRepository;
  artifactService: NativeAvArtifactService;
  resolveVideoOutputDirectory(): Promise<string>;
}

const MAX_MOTION_HEADER_BYTES = 16 * 1024 * 1024;
const motionDtypes = new Set(["F16", "BF16", "F32"]);

interface MotionTensorDescriptor {
  dtype: string;
  shape: number[];
  dataOffsets: [number, number];
}

async function readMotionContextHeader(filename: string, t: Translate): Promise<{
  header: Record<string, unknown>;
  payloadBytes: number;
  dataStart: number;
}> {
  const handle = await fs.open(filename, "r");
  try {
    const lengthBuffer = Buffer.alloc(8);
    const lengthRead = await handle.read(lengthBuffer, 0, lengthBuffer.length, 0);
    if (lengthRead.bytesRead !== lengthBuffer.length) throw new Error(t(uiKeys.extensionInspection.headerLengthMissing));
    const headerLengthBigInt = lengthBuffer.readBigUInt64LE(0);
    if (headerLengthBigInt > BigInt(MAX_MOTION_HEADER_BYTES)) throw new Error(t(uiKeys.extensionInspection.headerTooLarge));
    const headerLength = Number(headerLengthBigInt);
    const headerBuffer = Buffer.alloc(headerLength);
    const headerRead = await handle.read(headerBuffer, 0, headerLength, 8);
    if (headerRead.bytesRead !== headerLength) throw new Error(t(uiKeys.extensionInspection.headerIncomplete));
    let header: unknown;
    try {
      header = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(headerBuffer)) as unknown;
    } catch {
      throw new Error(t(uiKeys.extensionInspection.headerJsonInvalid));
    }
    if (!header || typeof header !== "object" || Array.isArray(header)) {
      throw new Error(t(uiKeys.extensionInspection.headerInvalid));
    }
    const stat = await handle.stat();
    return { header: header as Record<string, unknown>, payloadBytes: stat.size, dataStart: 8 + headerLength };
  } finally {
    await handle.close();
  }
}

function motionTensorDescriptor(value: unknown, label: string, t: Translate): MotionTensorDescriptor {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(t(uiKeys.extensionInspection.tensorInvalid, { label }));
  const record = value as Record<string, unknown>;
  const shape = record.shape;
  const offsets = record.data_offsets;
  if (!motionDtypes.has(String(record.dtype)) ||
      !Array.isArray(shape) || shape.length === 0 ||
      !shape.every((item) => Number.isSafeInteger(item) && Number(item) > 0) ||
      !Array.isArray(offsets) || offsets.length !== 2 ||
      !offsets.every((item) => Number.isSafeInteger(item) && Number(item) >= 0) ||
      Number(offsets[1]) <= Number(offsets[0])) {
    throw new Error(t(uiKeys.extensionInspection.tensorFieldsInvalid, { label }));
  }
  return {
    dtype: String(record.dtype),
    shape: shape.map(Number),
    dataOffsets: [Number(offsets[0]), Number(offsets[1])]
  };
}

function bytesPerMotionDtype(dtype: string): number {
  return dtype === "F32" ? 4 : 2;
}

function validateMotionTensorBytes(
  descriptor: MotionTensorDescriptor,
  dataStart: number,
  payloadBytes: number,
  label: string,
  t: Translate
): void {
  const [start, end] = descriptor.dataOffsets;
  const availableBytes = payloadBytes - dataStart;
  let elements = 1;
  for (const dimension of descriptor.shape) elements *= dimension;
  if (start < 0 || end > availableBytes || elements * bytesPerMotionDtype(descriptor.dtype) !== end - start) {
    throw new Error(t(uiKeys.extensionInspection.tensorBytesInvalid, { label }));
  }
}

async function inspectMotionContextLatent(
  filename: string,
  draft: Draft,
  allowCanonicalWrapper: boolean,
  t: Translate
): Promise<NonNullable<VideoExtensionSourceInspection["motionContext"]>> {
  const { header, payloadBytes, dataStart } = await readMotionContextHeader(filename, t);
  const metadata = header.__metadata__;
  const format = metadata && typeof metadata === "object"
    ? (metadata as Record<string, unknown>).format
    : undefined;
  const isMotionContextFormat = format === "h3_motion_context_av_v1";
  const isCanonicalWrapperFormat = allowCanonicalWrapper && format === "local-video-studio-h3-joint-av";
  if (!isMotionContextFormat && !isCanonicalWrapperFormat) {
    throw new Error(t(uiKeys.extensionInspection.schemaMissing));
  }
  const keys = Object.keys(header).filter((key) => key !== "__metadata__").sort();
  if (keys.join(",") !== "audio,video") throw new Error(t(uiKeys.extensionInspection.tensorsMissing));
  const video = motionTensorDescriptor(header.video, "video", t);
  const audio = motionTensorDescriptor(header.audio, "audio", t);
  validateMotionTensorBytes(video, dataStart, payloadBytes, "video", t);
  validateMotionTensorBytes(audio, dataStart, payloadBytes, "audio", t);
  if (video.shape.length !== 5 || video.shape[0] !== 1 || video.shape[1] !== 24 ||
      audio.shape.length !== 4 || audio.shape[0] !== 1 || audio.shape[1] !== 32 || audio.shape[2] !== 2) {
    throw new Error(t(uiKeys.extensionInspection.shapeInvalid));
  }
  if (video.shape[2] < 2 || (video.shape[2] - 2) % 5 !== 0) {
    throw new Error(t(uiKeys.extensionInspection.temporalInvalid));
  }
  const frameCount = ((video.shape[2] - 2) / 5) * 17 + 5;
  const expectedAudioFrames = Math.round(frameCount / 24 * 40);
  if (audio.shape[3] !== expectedAudioFrames) {
    throw new Error(t(uiKeys.extensionInspection.audioMismatch, { audioFrames: audio.shape[3], frameCount }));
  }
  const [expectedWidth, expectedHeight] = outputDimensions({
    modelId: draft.modelId,
    ratio: draft.ratio,
    sourceWidth: draft.sourceWidth,
    sourceHeight: draft.sourceHeight,
    resolution: draft.resolution
  });
  if (video.shape[3] !== expectedHeight / 16 || video.shape[4] !== expectedWidth / 16) {
    throw new Error(t(uiKeys.extensionInspection.motionGeometryMismatch, { width: video.shape[4] * 16, height: video.shape[3] * 16, expectedWidth, expectedHeight }));
  }
  return {
    format: isCanonicalWrapperFormat ? "h3_native_av_wrapper" : "h3_motion_context_av_v1",
    videoShape: video.shape,
    videoDtype: video.dtype,
    audioShape: audio.shape,
    audioDtype: audio.dtype,
    frameCount,
    contextFrames: 22
  };
}

/** Reads only the artifact referenced by a known History AssetVersion. */
export class HistoryArtifactService {
  constructor(private readonly deps: HistoryArtifactServiceDependencies) {}

  async inspectExtensionSource(draft: Draft): Promise<VideoExtensionSourceInspection> {
    const t = createNativeTranslator(this.deps.store.get().settings.uiLocale).t;
    const route = isMiniMaxH3ContinuumModel(draft.modelId)
      ? h3ContinuumModeForSource(draft)
      : isMiniMaxH3R2vModel(draft.modelId) ? "motion-context" : "boundary";
    if (!(await fs.stat(draft.sourceVideoPath).catch(() => null))?.isFile()) {
      return { route, status: "missing", reason: t(uiKeys.extensionInspection.sourceMissing) };
    }
    if (route === "motion-context") {
      const latentPath = draft.h3ContextLatentPath?.trim();
      if (!latentPath) return { route, status: "available", reason: t(uiKeys.extensionInspection.motionFallback) };
      const latentStat = await fs.stat(latentPath).catch(() => undefined);
      if (!latentStat?.isFile()) return { route, status: "missing", reason: t(uiKeys.extensionInspection.motionMissing) };
      try {
        const motionContext = await inspectMotionContextLatent(
          latentPath,
          draft,
          Boolean(draft.h3MotionContextAsset),
          t
        );
        return {
          route,
          status: "available",
          reason: t(uiKeys.extensionInspection.motionReady),
          payloadPath: latentPath,
          payloadBytes: latentStat.size,
          motionContext
        };
      } catch (error) {
        return {
          route,
          status: "invalid",
          reason: error instanceof Error ? error.message : String(error),
          payloadPath: latentPath,
          payloadBytes: latentStat.size
        };
      }
    }
    if (route === "boundary") return { route, status: "not-supported" };
    const outputDirectory = await this.deps.resolveVideoOutputDirectory();
    if (!outputDirectory.trim()) return { route, status: "missing", reason: t(uiKeys.extensionInspection.outputMissing) };
    if (route === "managed") {
      if (draft.h3ContinuumTakeAction && draft.h3ContinuumTakeAction !== "Automatic") {
        return { route, status: "invalid", reason: t(uiKeys.extensionInspection.takeUnsupported) };
      }
      const sequence = draft.h3ContinuumSequence;
      if (!sequence?.acceptedChunks) {
        return { route, status: "missing", reason: t(uiKeys.extensionInspection.prefixMissing) };
      }
      const invalid = validateContinuumSequence(sequence, t);
      if (invalid) return { route, status: "invalid", reason: invalid };
      if (!sequence.firstFrameSource ||
          !(await fs.stat(sequence.firstFrameSource.sourceVideoPath).catch(() => null))?.isFile()) {
        return { route, status: "missing", reason: t(uiKeys.extensionInspection.firstFrameMissing) };
      }
      const version = this.deps.store.get().history.find((asset) => asset.id === draft.sourceAssetId)
        ?.versions.find((candidate) => candidate.id === draft.sourceVersionId);
      if (!version?.h3ContinuumSequence ||
          version.h3ContinuumSequence.sequenceId !== sequence.sequenceId ||
          version.h3ContinuumSequence.canonicalHead.revisionId !== sequence.canonicalHead.revisionId) {
        return { route, status: "invalid", reason: t(uiKeys.extensionInspection.headMismatch) };
      }
      const receipt = version.h3ContinuumReceipt;
      if (!receipt || receipt.revisionId !== sequence.canonicalHead.revisionId ||
          receipt.chunkRecords.length < sequence.acceptedChunks) {
        return { route, status: "invalid", reason: t(uiKeys.extensionInspection.receiptMissing) };
      }
      const root = await fs.realpath(outputDirectory);
      for (const file of [receipt.runStorageRoot, ...receipt.chunkRecords.map((record) => record.payloadPath)]) {
        const relative = safeH3OutputRelativePath(file);
        const filename = relative ? path.resolve(root, relative) : "";
        const real = filename ? await fs.realpath(filename).catch(() => "") : "";
        const resolvedRelative = real ? path.relative(root, real) : "..";
        if (!relative || !real || resolvedRelative.startsWith("..") || path.isAbsolute(resolvedRelative) ||
            !(await fs.stat(real).catch(() => null))?.isFile()) {
          return { route, status: "missing", reason: t(uiKeys.extensionInspection.prefixFilesMissing) };
        }
      }
      const manifestPath = path.resolve(root, safeH3OutputRelativePath(receipt.runStorageRoot)!);
      const manifest = await fs.readFile(manifestPath, "utf8")
        .then((text) => JSON.parse(text) as Record<string, unknown>).catch(() => null);
      if (!manifest || manifest.revision_id !== receipt.revisionId) {
        return { route, status: "invalid", reason: t(uiKeys.extensionInspection.manifestInvalid) };
      }
      if (manifest.sampling_contract_version === 5) {
        return { route, status: "invalid", reason: t(uiKeys.extensionInspection.legacyRun) };
      }
      if (manifest.sampling_contract_version !== 6 || manifest.resume_safe !== true) {
        return { route, status: "invalid", reason: t(uiKeys.extensionInspection.unsafeContract) };
      }
      if (typeof manifest.contract_sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(manifest.contract_sha256) ||
          (receipt.contractSha256 !== undefined && receipt.contractSha256 !== manifest.contract_sha256) ||
          (receipt.samplingContractVersion !== undefined && receipt.samplingContractVersion !== manifest.sampling_contract_version)) {
        return { route, status: "invalid", reason: t(uiKeys.extensionInspection.contractMismatch) };
      }
      const projectPath = path.join(path.dirname(path.dirname(path.dirname(manifestPath))), "project.json");
      const project = await fs.readFile(projectPath, "utf8").then((text) => JSON.parse(text) as { canonical_storage_revision_id?: string }).catch(() => null);
      if (project?.canonical_storage_revision_id !== sequence.canonicalHead.revisionId) {
        return { route, status: "invalid", reason: t(uiKeys.extensionInspection.staleHead) };
      }
      return { route, status: "available", reason: t(uiKeys.extensionInspection.prefixReady) };
    }
    const inspection = draft.h3ContinuumArtifact
      ? await this.deps.artifactService.inspect(draft.h3ContinuumArtifact, outputDirectory)
      : draft.h3ContinuumArtifactPath?.trim()
        ? await this.deps.artifactService.inspectPath(draft.h3ContinuumArtifactPath, outputDirectory)
        : { status: "missing" as const, reason: t(uiKeys.extensionInspection.avMissing) };
    if (inspection.status !== "available" || !inspection.artifact) return { ...inspection, route };
    const artifact = inspection.artifact;
    if (artifact.diffusionModelFilename !== miniMaxH3ModelAssetNames(draft.modelId)?.diffusionModel) {
      return { ...inspection, route, status: "invalid", reason: t(uiKeys.extensionInspection.modelMismatch) };
    }
    if (draft.sourceWidth > 0 && draft.sourceHeight > 0 &&
        (artifact.width !== draft.sourceWidth || artifact.height !== draft.sourceHeight)) {
      return { ...inspection, route, status: "invalid", reason: t(uiKeys.extensionInspection.geometryMismatch, { width: artifact.width, height: artifact.height, sourceWidth: draft.sourceWidth, sourceHeight: draft.sourceHeight }) };
    }
    return { ...inspection, route };
  }

  async inspect(
    assetId: string,
    versionId: string
  ): Promise<NativeAvArtifactInspection> {
    const t = createNativeTranslator(this.deps.store.get().settings.uiLocale).t;
    const asset = this.deps.store.get().history.find((item) => item.id === assetId);
    const version = asset?.versions.find((item) => item.id === versionId);
    if (!asset || !version) {
      return { status: "missing", reason: t(uiKeys.extensionInspection.historyMissing) };
    }
    const continuation = version.h3ContinuationData;
    if (!continuation?.artifact) {
      return {
        status: continuation?.status ?? "not-supported",
        ...(continuation?.reason ? { reason: historyDiagnosticForDisplay(continuation.reason, t) } : {})
      };
    }
    const outputDirectory = await this.deps.resolveVideoOutputDirectory();
    if (!outputDirectory.trim()) {
      return { status: "missing", reason: t(uiKeys.extensionInspection.historyOutputMissing) };
    }
    return this.deps.artifactService.inspect(continuation.artifact, outputDirectory);
  }
}
