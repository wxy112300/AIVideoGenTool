import type {
  Draft,
  NativeAvArtifactInspection,
  VideoExtensionSourceInspection
} from "../../src/types.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { h3ContinuumModeForSource, isMiniMaxH3ContinuumModel, miniMaxH3ModelAssetNames } from "../../src/core/workflow.js";
import { safeH3OutputRelativePath, validateContinuumSequence } from "../../src/core/h3-av-asset.js";
import type { StateRepository } from "../ports/state-repository.js";
import { NativeAvArtifactService } from "./native-av-artifact.js";

export interface HistoryArtifactServiceDependencies {
  store: StateRepository;
  artifactService: NativeAvArtifactService;
  resolveVideoOutputDirectory(): Promise<string>;
}

/** Reads only the artifact referenced by a known History AssetVersion. */
export class HistoryArtifactService {
  constructor(private readonly deps: HistoryArtifactServiceDependencies) {}

  async inspectExtensionSource(draft: Draft): Promise<VideoExtensionSourceInspection> {
    const route = isMiniMaxH3ContinuumModel(draft.modelId) ? h3ContinuumModeForSource(draft) : "boundary";
    if (!(await fs.stat(draft.sourceVideoPath).catch(() => null))?.isFile()) {
      return { route, status: "missing", reason: "源视频文件不存在。" };
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
