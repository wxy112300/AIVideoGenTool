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

async function readMotionContextHeader(filename: string): Promise<{
  header: Record<string, unknown>;
  payloadBytes: number;
  dataStart: number;
}> {
  const handle = await fs.open(filename, "r");
  try {
    const lengthBuffer = Buffer.alloc(8);
    const lengthRead = await handle.read(lengthBuffer, 0, lengthBuffer.length, 0);
    if (lengthRead.bytesRead !== lengthBuffer.length) throw new Error("Motion Context latent 缺少 safetensors header length。");
    const headerLengthBigInt = lengthBuffer.readBigUInt64LE(0);
    if (headerLengthBigInt > BigInt(MAX_MOTION_HEADER_BYTES)) throw new Error("Motion Context latent header 超出安全上限。");
    const headerLength = Number(headerLengthBigInt);
    const headerBuffer = Buffer.alloc(headerLength);
    const headerRead = await handle.read(headerBuffer, 0, headerLength, 8);
    if (headerRead.bytesRead !== headerLength) throw new Error("Motion Context latent header 不完整。");
    let header: unknown;
    try {
      header = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(headerBuffer)) as unknown;
    } catch {
      throw new Error("Motion Context latent header 不是有效 JSON。");
    }
    if (!header || typeof header !== "object" || Array.isArray(header)) {
      throw new Error("Motion Context latent header 格式无效。");
    }
    const stat = await handle.stat();
    return { header: header as Record<string, unknown>, payloadBytes: stat.size, dataStart: 8 + headerLength };
  } finally {
    await handle.close();
  }
}

function motionTensorDescriptor(value: unknown, label: string): MotionTensorDescriptor {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} tensor descriptor 无效。`);
  const record = value as Record<string, unknown>;
  const shape = record.shape;
  const offsets = record.data_offsets;
  if (!motionDtypes.has(String(record.dtype)) ||
      !Array.isArray(shape) || shape.length === 0 ||
      !shape.every((item) => Number.isSafeInteger(item) && Number(item) > 0) ||
      !Array.isArray(offsets) || offsets.length !== 2 ||
      !offsets.every((item) => Number.isSafeInteger(item) && Number(item) >= 0) ||
      Number(offsets[1]) <= Number(offsets[0])) {
    throw new Error(`${label} tensor 的 dtype、shape 或 data_offsets 无效。`);
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
  label: string
): void {
  const [start, end] = descriptor.dataOffsets;
  const availableBytes = payloadBytes - dataStart;
  let elements = 1;
  for (const dimension of descriptor.shape) elements *= dimension;
  if (start < 0 || end > availableBytes || elements * bytesPerMotionDtype(descriptor.dtype) !== end - start) {
    throw new Error(`${label} tensor 数据区与 shape/dtype 不匹配。`);
  }
}

async function inspectMotionContextLatent(
  filename: string,
  draft: Draft,
  allowCanonicalWrapper: boolean
): Promise<NonNullable<VideoExtensionSourceInspection["motionContext"]>> {
  const { header, payloadBytes, dataStart } = await readMotionContextHeader(filename);
  const metadata = header.__metadata__;
  const format = metadata && typeof metadata === "object"
    ? (metadata as Record<string, unknown>).format
    : undefined;
  const isMotionContextFormat = format === "h3_motion_context_av_v1";
  const isCanonicalWrapperFormat = allowCanonicalWrapper && format === "local-video-studio-h3-joint-av";
  if (!isMotionContextFormat && !isCanonicalWrapperFormat) {
    throw new Error("文件不是 H3 Motion Context v1 latent，缺少 h3_motion_context_av_v1 schema。");
  }
  const keys = Object.keys(header).filter((key) => key !== "__metadata__").sort();
  if (keys.join(",") !== "audio,video") throw new Error("Motion Context latent 必须同时且仅包含 video/audio tensor。");
  const video = motionTensorDescriptor(header.video, "video");
  const audio = motionTensorDescriptor(header.audio, "audio");
  validateMotionTensorBytes(video, dataStart, payloadBytes, "video");
  validateMotionTensorBytes(audio, dataStart, payloadBytes, "audio");
  if (video.shape.length !== 5 || video.shape[0] !== 1 || video.shape[1] !== 24 ||
      audio.shape.length !== 4 || audio.shape[0] !== 1 || audio.shape[1] !== 32 || audio.shape[2] !== 2) {
    throw new Error("Motion Context latent 的 video/audio shape 不符合 H3 AV 合同。");
  }
  if (video.shape[2] < 2 || (video.shape[2] - 2) % 5 !== 0) {
    throw new Error("Motion Context video temporal shape 不符合 H3 17-frame 时间网格。");
  }
  const frameCount = ((video.shape[2] - 2) / 5) * 17 + 5;
  const expectedAudioFrames = Math.round(frameCount / 24 * 40);
  if (audio.shape[3] !== expectedAudioFrames) {
    throw new Error(`Motion Context audio shape ${audio.shape[3]} 与 video frameCount ${frameCount} 不匹配。`);
  }
  const [expectedWidth, expectedHeight] = outputDimensions({
    modelId: draft.modelId,
    ratio: draft.ratio,
    sourceWidth: draft.sourceWidth,
    sourceHeight: draft.sourceHeight,
    resolution: draft.resolution
  });
  if (video.shape[3] !== expectedHeight / 16 || video.shape[4] !== expectedWidth / 16) {
    throw new Error(`Motion Context latent 几何 ${video.shape[4] * 16}×${video.shape[3] * 16} 与当前续写 ${expectedWidth}×${expectedHeight} 不一致。`);
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
    const route = isMiniMaxH3ContinuumModel(draft.modelId)
      ? h3ContinuumModeForSource(draft)
      : isMiniMaxH3R2vModel(draft.modelId) ? "motion-context" : "boundary";
    if (!(await fs.stat(draft.sourceVideoPath).catch(() => null))?.isFile()) {
      return { route, status: "missing", reason: "源视频文件不存在。" };
    }
    if (route === "motion-context") {
      const latentPath = draft.h3ContextLatentPath?.trim();
      if (!latentPath) return { route, status: "available", reason: "未选择 Motion Context latent，将使用源视频上下文。" };
      const latentStat = await fs.stat(latentPath).catch(() => undefined);
      if (!latentStat?.isFile()) return { route, status: "missing", reason: "所选 Motion Context latent 文件不存在。" };
      try {
        const motionContext = await inspectMotionContextLatent(
          latentPath,
          draft,
          Boolean(draft.h3MotionContextAsset)
        );
        return {
          route,
          status: "available",
          reason: "Motion Context latent 已通过 schema、音视频 shape、几何和 H3 时间网格检查。",
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
    if (!outputDirectory.trim()) return { route, status: "missing", reason: "无法确定 ComfyUI output 目录。" };
    if (route === "managed") {
      if (draft.h3ContinuumTakeAction && draft.h3ContinuumTakeAction !== "Automatic") {
        return { route, status: "invalid", reason: "当前应用尚未接通官方 group revision 选择，不能从旧 Take 建立分支；旧 Take 与文件均保留。" };
      }
      const sequence = draft.h3ContinuumSequence;
      if (!sequence?.acceptedChunks) {
        return { route, status: "missing", reason: "该视频没有已接受的 Continuum Run 前缀。不能把新建 Run 当作续写；请选择旧 AV 兼容导入，或改用普通接续模型。" };
      }
      const invalid = validateContinuumSequence(sequence);
      if (invalid) return { route, status: "invalid", reason: invalid };
      if (!sequence.firstFrameSource ||
          !(await fs.stat(sequence.firstFrameSource.sourceVideoPath).catch(() => null))?.isFile()) {
        return { route, status: "missing", reason: "Run 最初的首帧来源缺失，不能用当前视频末帧替换后继续。" };
      }
      const version = this.deps.store.get().history.find((asset) => asset.id === draft.sourceAssetId)
        ?.versions.find((candidate) => candidate.id === draft.sourceVersionId);
      if (!version?.h3ContinuumSequence ||
          version.h3ContinuumSequence.sequenceId !== sequence.sequenceId ||
          version.h3ContinuumSequence.canonicalHead.revisionId !== sequence.canonicalHead.revisionId) {
        return { route, status: "invalid", reason: "所选历史版本与 Continuum Run head 不一致，请从该历史版本重新继续。" };
      }
      const receipt = version.h3ContinuumReceipt;
      if (!receipt || receipt.revisionId !== sequence.canonicalHead.revisionId ||
          receipt.chunkRecords.length < sequence.acceptedChunks) {
        return { route, status: "invalid", reason: "所选版本缺少完整的 Run Storage receipt，不能确认前缀复用。" };
      }
      const root = await fs.realpath(outputDirectory);
      for (const file of [receipt.runStorageRoot, ...receipt.chunkRecords.map((record) => record.payloadPath)]) {
        const relative = safeH3OutputRelativePath(file);
        const filename = relative ? path.resolve(root, relative) : "";
        const real = filename ? await fs.realpath(filename).catch(() => "") : "";
        const resolvedRelative = real ? path.relative(root, real) : "..";
        if (!relative || !real || resolvedRelative.startsWith("..") || path.isAbsolute(resolvedRelative) ||
            !(await fs.stat(real).catch(() => null))?.isFile()) {
          return { route, status: "missing", reason: "Run Storage manifest 或 Chunk 文件缺失，不能恢复所选前缀。" };
        }
      }
      const manifestPath = path.resolve(root, safeH3OutputRelativePath(receipt.runStorageRoot)!);
      const projectPath = path.join(path.dirname(path.dirname(path.dirname(manifestPath))), "project.json");
      const project = await fs.readFile(projectPath, "utf8").then((text) => JSON.parse(text) as { canonical_storage_revision_id?: string }).catch(() => null);
      if (project?.canonical_storage_revision_id !== sequence.canonicalHead.revisionId) {
        return { route, status: "invalid", reason: "所选 Take 已不是官方 Run 的当前 head，不能自动改用其他前缀；请打开最新已接受的历史版本。" };
      }
      return { route, status: "available", reason: "Run Storage 前缀文件存在；执行时仍须验证采样契约和实际复用 receipt。" };
    }
    const inspection = draft.h3ContinuumArtifact
      ? await this.deps.artifactService.inspect(draft.h3ContinuumArtifact, outputDirectory)
      : draft.h3ContinuumArtifactPath?.trim()
        ? await this.deps.artifactService.inspectPath(draft.h3ContinuumArtifactPath, outputDirectory)
        : { status: "missing" as const, reason: "没有 AV latent。Continuum 不会自动回退到普通接续；请选择 AV 文件或切换接续模型。" };
    if (inspection.status !== "available" || !inspection.artifact) return { ...inspection, route };
    const artifact = inspection.artifact;
    if (artifact.diffusionModelFilename !== miniMaxH3ModelAssetNames(draft.modelId)?.diffusionModel) {
      return { ...inspection, route, status: "invalid", reason: "AV latent 的模型与当前 Continuum 模型不兼容。" };
    }
    if (draft.sourceWidth > 0 && draft.sourceHeight > 0 &&
        (artifact.width !== draft.sourceWidth || artifact.height !== draft.sourceHeight)) {
      return { ...inspection, route, status: "invalid", reason: `AV latent 尺寸 ${artifact.width}×${artifact.height} 与源视频 ${draft.sourceWidth}×${draft.sourceHeight} 不一致。` };
    }
    return { ...inspection, route };
  }

  async inspect(
    assetId: string,
    versionId: string
  ): Promise<NativeAvArtifactInspection> {
    const asset = this.deps.store.get().history.find((item) => item.id === assetId);
    const version = asset?.versions.find((item) => item.id === versionId);
    if (!asset || !version) {
      return { status: "missing", reason: "视频历史版本不存在。" };
    }
    const continuation = version.h3ContinuationData;
    if (!continuation?.artifact) {
      return {
        status: continuation?.status ?? "not-supported",
        ...(continuation?.reason ? { reason: continuation.reason } : {})
      };
    }
    const outputDirectory = await this.deps.resolveVideoOutputDirectory();
    if (!outputDirectory.trim()) {
      return { status: "missing", reason: "当前没有可解析的视频输出目录。" };
    }
    return this.deps.artifactService.inspect(continuation.artifact, outputDirectory);
  }
}
