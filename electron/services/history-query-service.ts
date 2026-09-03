import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import type {
  AppState,
  AssetVersion,
  HistoryAsset,
  HistoryFile,
  HistoryItem,
  ImageAssetVersion,
  ImageHistoryProject,
  NativeAvContinuationArtifact,
  Settings
} from "../../src/types.js";
import {
  extractComfyOutputFiles
} from "../../src/core/comfy-output.js";
import {
  attachAbsoluteOutputPaths,
  isSegmentedSeedVr2Output,
  restoreSegmentedSeedVr2OutputPaths
} from "../../src/core/comfy-output-paths.js";
import { syncQueueVideoInputPaths } from "../../src/core/queue.js";
import { createHistoryCoverCacheKey } from "../../src/core/history-cover.js";
import { historyFileCandidates } from "../../src/core/history-media.js";
import {
  H3_CONTINUATION_ARTIFACT_SUBFOLDER,
  validateNativeAvContinuationArtifact
} from "../../src/core/h3-continuation-artifact.js";
import type { HistoryFileSystemPort } from "../ports/history-file-system.js";
import type { StateRepository } from "../ports/state-repository.js";
import type { AppLogger } from "../../src/infrastructure/app-logger.js";
import type { StudioPaths } from "./studio-paths.js";

const videoPattern = /\.(mp4|webm|mov|m4v|mkv)$/i;

export interface HistoryCoverMetadata {
  sourceSize: number;
  sourceMtimeMs: number;
  generatedAt: string;
}

export interface HistoryQueryServiceDependencies {
  store: StateRepository;
  logger: AppLogger;
  paths: Pick<StudioPaths, "historyCoverDirectory">;
  fileSystem: HistoryFileSystemPort;
  resolveTaskOutputDirectory(): Promise<string>;
}

export function historyCoverDigest(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function historyCoverExtension(key: string): ".jpg" | ".png" {
  return key.startsWith("image-history:") ? ".png" : ".jpg";
}

export function historyCoverPathFromDigest(
  historyCoverDirectory: string,
  digest: string,
  extension = ".jpg"
): string {
  return path.join(historyCoverDirectory, `${digest}${extension}`);
}

export function restoreRecordedHistoryFiles(
  reportedFiles: HistoryFile[],
  recordedFiles: HistoryFile[],
  outputDirectory: string
): HistoryFile[] {
  const recordedPaths = new Map(
    recordedFiles
      .filter((file) => file.absolutePath)
      .map((file) => [
        `${file.subfolder}\u0000${file.filename}\u0000${file.type}`,
        file.absolutePath!
      ])
  );
  const files = reportedFiles.length ? reportedFiles : recordedFiles;
  return files.map((file) => {
    const recordedPath = recordedPaths.get(
      `${file.subfolder}\u0000${file.filename}\u0000${file.type}`
    );
    if (recordedPath) return { ...file, absolutePath: recordedPath };
    return attachAbsoluteOutputPaths([file], outputDirectory)[0] ?? file;
  });
}

function historyFilesEqual(left: HistoryFile[], right: HistoryFile[]): boolean {
  return left.length === right.length && left.every((file, index) => {
    const candidate = right[index];
    return Boolean(candidate) &&
      file.filename === candidate.filename &&
      file.subfolder === candidate.subfolder &&
      file.type === candidate.type &&
      file.format === candidate.format &&
      file.absolutePath === candidate.absolutePath;
  });
}

function restoredNativeAvArtifact(
  artifact: NativeAvContinuationArtifact | undefined,
  outputDirectory: string
): NativeAvContinuationArtifact | undefined {
  if (!artifact || !outputDirectory.trim() || validateNativeAvContinuationArtifact(artifact)) return artifact;
  const root = path.resolve(outputDirectory);
  const resolve = (file: HistoryFile): string | undefined => {
    if (file.subfolder !== H3_CONTINUATION_ARTIFACT_SUBFOLDER || path.basename(file.filename) !== file.filename) {
      return undefined;
    }
    const candidate = path.resolve(root, file.subfolder, file.filename);
    const relative = path.relative(root, candidate);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return undefined;
    return candidate;
  };
  const manifestPath = resolve(artifact.manifest);
  const payloadPath = resolve(artifact.payload);
  if (!manifestPath || !payloadPath) return artifact;
  return {
    ...artifact,
    manifest: { ...artifact.manifest, absolutePath: manifestPath },
    payload: { ...artifact.payload, absolutePath: payloadPath }
  };
}

function nativeAvArtifactPathsEqual(
  left: NativeAvContinuationArtifact | undefined,
  right: NativeAvContinuationArtifact | undefined
): boolean {
  if (!left || !right) return left === right;
  return left.manifest.absolutePath === right.manifest.absolutePath &&
    left.payload.absolutePath === right.payload.absolutePath;
}

function restoredHistoryVersionFiles(
  version: AssetVersion,
  outputDirectory: string
): HistoryFile[] {
  const originalVersionFiles = extractComfyOutputFiles(version.comfyOutputs);
  return isSegmentedSeedVr2Output(version.comfyOutputs)
    ? restoreSegmentedSeedVr2OutputPaths(
        version.files,
        originalVersionFiles,
        outputDirectory
      )
    : restoreRecordedHistoryFiles(
        originalVersionFiles.length ? originalVersionFiles : version.files,
        version.files,
        outputDirectory
      );
}

function restoredHistoryAssetFiles(
  asset: HistoryAsset,
  outputDirectory: string
): HistoryFile[] {
  const originalAssetFiles = extractComfyOutputFiles(asset.comfyOutputs);
  return restoreRecordedHistoryFiles(
    originalAssetFiles.length ? originalAssetFiles : asset.files,
    asset.files,
    outputDirectory
  );
}

function historyPathRepairNeeded(
  state: AppState,
  outputDirectory: string
): boolean {
  if (state.history.some((asset) =>
    !historyFilesEqual(asset.files, restoredHistoryAssetFiles(asset, outputDirectory)) ||
    asset.versions.some((version) =>
      !historyFilesEqual(
        version.files,
        restoredHistoryVersionFiles(version, outputDirectory)
      ) ||
      !nativeAvArtifactPathsEqual(
        version.h3ContinuationData?.artifact,
        restoredNativeAvArtifact(version.h3ContinuationData?.artifact, outputDirectory)
      )
    )
  )) return true;

  // syncQueueVideoInputPaths returns the existing task object when no path
  // changes are needed, so identity is a cheap and side-effect-free no-op
  // check for the queue records coupled to history.
  const syncedQueue = syncQueueVideoInputPaths(state.queue, state.history);
  return syncedQueue.some((task, index) => task !== state.queue[index]);
}

export class HistoryQueryService {
  constructor(private readonly deps: HistoryQueryServiceDependencies) {}

  coverPathFromDigest(digest: string, extension = ".jpg"): string {
    return historyCoverPathFromDigest(
      this.deps.paths.historyCoverDirectory,
      digest,
      extension
    );
  }

  coverCacheKeyForVideoVersion(asset: HistoryAsset, version: AssetVersion): string {
    const file = version.files.find((item) => videoPattern.test(item.filename));
    return createHistoryCoverCacheKey({
      assetId: asset.id,
      versionId: version.id,
      createdAt: version.createdAt,
      filename: file?.filename ?? version.outputFilename,
      absolutePath: file?.absolutePath ?? ""
    });
  }

  coverCacheKeyForImageVersion(
    project: ImageHistoryProject,
    version: ImageAssetVersion
  ): string {
    return `image-history:${createHistoryCoverCacheKey({
      assetId: project.id,
      versionId: version.id,
      createdAt: version.createdAt,
      filename: version.file.filename,
      absolutePath: version.file.absolutePath ?? ""
    })}`;
  }

  coverCacheKeysForHistoryItem(item: HistoryItem): string[] {
    return item.mediaKind === "video"
      ? item.versions.map((version) => this.coverCacheKeyForVideoVersion(item, version))
      : item.versions.map((version) => this.coverCacheKeyForImageVersion(item, version));
  }

  async removeCoverCacheKeys(keys: readonly string[]): Promise<void> {
    await Promise.all([...new Set(keys)].flatMap((key) => [
      this.deps.fileSystem.remove(this.coverPath(key)).catch(() => undefined),
      this.deps.fileSystem.remove(this.coverMetadataPath(key)).catch(() => undefined)
    ]));
  }

  async resolveHistoryFile(
    file: HistoryFile,
    settings: Settings = this.deps.store.get().settings
  ): Promise<string | null> {
    return this.resolveExistingHistoryFile([
      file.absolutePath ?? "",
      ...historyFileCandidates(file, settings)
    ]);
  }

  async resolveHistorySourcePath(sourcePath: string): Promise<string | null> {
    if (typeof sourcePath !== "string" || !sourcePath.trim()) return null;
    const direct = await this.resolveExistingHistoryFile([sourcePath]);
    if (direct) return direct;

    const state = this.deps.store.get();
    const normalizedSource = path.resolve(sourcePath).toLowerCase();
    const files = [
      ...state.history.flatMap((asset) =>
        asset.versions.flatMap((version) => version.files)
      ),
      ...state.imageHistory.map((project) =>
        project.versions.map((version) => version.file)
      ).flat()
    ];
    const file = files.find((candidate) =>
      candidate.absolutePath &&
      path.resolve(candidate.absolutePath).toLowerCase() === normalizedSource
    );
    return file ? this.resolveHistoryFile(file, state.settings) : null;
  }

  async restoreHistoryOutputPaths(): Promise<void> {
    const outputDirectory = await this.deps.resolveTaskOutputDirectory();
    if (!outputDirectory) return;
    if (!historyPathRepairNeeded(this.deps.store.get(), outputDirectory)) return;

    let repairedSegmentedSeedVr2Versions = 0;
    await this.deps.store.update((state) => {
      for (const asset of state.history) {
        asset.files = restoredHistoryAssetFiles(asset, outputDirectory);
        for (const version of asset.versions) {
          const before = version.files.map((file) =>
            `${file.filename}\0${file.absolutePath ?? ""}`
          );
          version.files = restoredHistoryVersionFiles(version, outputDirectory);
          if (version.h3ContinuationData?.artifact) {
            version.h3ContinuationData.artifact = restoredNativeAvArtifact(
              version.h3ContinuationData.artifact,
              outputDirectory
            );
          }
          if (isSegmentedSeedVr2Output(version.comfyOutputs)) {
            const after = version.files.map((file) =>
              `${file.filename}\0${file.absolutePath ?? ""}`
            );
            if (before.join("\n") !== after.join("\n")) {
              repairedSegmentedSeedVr2Versions += 1;
            }
          }
        }
      }
      state.queue = syncQueueVideoInputPaths(state.queue, state.history);
    });
    if (repairedSegmentedSeedVr2Versions > 0) {
      this.deps.logger.info(
        "history",
        "seedvr2-merged-paths-restored",
        "已恢复被旧启动逻辑覆写的 SeedVR2 合并视频路径",
        { repairedVersionCount: repairedSegmentedSeedVr2Versions }
      );
    }
  }

  async restoreHistoryFileSizes(): Promise<void> {
    const current = this.deps.store.get();
    const files = current.history.flatMap((asset) => asset.versions.flatMap((version) => [
      ...version.files,
      ...(version.h3ContinuationData?.artifact
        ? [version.h3ContinuationData.artifact.manifest, version.h3ContinuationData.artifact.payload]
        : [])
    ]));
    const paths = [...new Set(files.map((file) => file.absolutePath).filter((value): value is string => Boolean(value)))];
    const sizes = new Map<string, number>();
    await Promise.all(paths.map(async (filename) => {
      const stat = await this.safeStat(filename);
      if (stat?.isFile()) sizes.set(filename, stat.size);
    }));
    if (!sizes.size) return;
    await this.deps.store.update((state) => {
      for (const asset of state.history) {
        for (const version of asset.versions) {
          for (const file of version.files) {
            if (file.absolutePath && sizes.has(file.absolutePath)) file.sizeBytes = sizes.get(file.absolutePath);
          }
          const artifact = version.h3ContinuationData?.artifact;
          if (!artifact) continue;
          for (const file of [artifact.manifest, artifact.payload]) {
            if (file.absolutePath && sizes.has(file.absolutePath)) file.sizeBytes = sizes.get(file.absolutePath);
          }
        }
      }
    });
  }

  async readHistoryCover(key: string, sourcePath: string): Promise<string | null> {
    if (!key || !sourcePath) return null;
    const resolvedSource = await this.resolveHistorySourcePath(sourcePath);
    const sourceStat = resolvedSource ? await this.safeStat(resolvedSource) : null;
    if (!sourceStat?.isFile()) return null;
    const [coverStat, metadataText] = await Promise.all([
      this.safeStat(this.coverPath(key)),
      this.deps.fileSystem.readText(this.coverMetadataPath(key)).catch(() => "")
    ]);
    if (!coverStat?.isFile() || coverStat.size <= 0 || !metadataText) return null;
    let metadata: HistoryCoverMetadata;
    try {
      metadata = JSON.parse(metadataText) as HistoryCoverMetadata;
    } catch {
      return null;
    }
    if (
      metadata.sourceSize !== sourceStat.size ||
      Math.abs(metadata.sourceMtimeMs - sourceStat.mtimeMs) > 1
    ) return null;
    const digest = historyCoverDigest(key);
    return `studio-media://cover/${digest}${historyCoverExtension(key)}?v=${Math.round(coverStat.mtimeMs)}`;
  }

  async saveHistoryCover(
    key: string,
    sourcePath: string,
    data: ArrayBuffer | Uint8Array
  ): Promise<boolean> {
    const bytes = data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : null;
    if (!key || !sourcePath || !bytes?.byteLength) return false;
    if (bytes.byteLength > 2 * 1024 * 1024) {
      throw new Error("历史封面缓存不能超过 2 MB");
    }
    const resolvedSource = await this.resolveHistorySourcePath(sourcePath);
    const sourceStat = resolvedSource ? await this.safeStat(resolvedSource) : null;
    if (!sourceStat?.isFile()) return false;
    await this.deps.fileSystem.makeDirectory(this.deps.paths.historyCoverDirectory);
    const filename = this.coverPath(key);
    const metadataFilename = this.coverMetadataPath(key);
    const temporary = `${filename}.${randomUUID()}.tmp`;
    const metadataTemporary = `${metadataFilename}.${randomUUID()}.tmp`;
    const metadata: HistoryCoverMetadata = {
      sourceSize: sourceStat.size,
      sourceMtimeMs: sourceStat.mtimeMs,
      generatedAt: new Date().toISOString()
    };
    try {
      await this.deps.fileSystem.writeFile(temporary, bytes);
      await this.deps.fileSystem.writeFile(metadataTemporary, JSON.stringify(metadata));
      await this.deps.fileSystem.remove(filename);
      await this.deps.fileSystem.remove(metadataFilename);
      await this.deps.fileSystem.rename(temporary, filename);
      await this.deps.fileSystem.rename(metadataTemporary, metadataFilename);
    } finally {
      await this.deps.fileSystem.remove(temporary).catch(() => undefined);
      await this.deps.fileSystem.remove(metadataTemporary).catch(() => undefined);
    }
    return true;
  }

  private coverPath(key: string): string {
    return historyCoverPathFromDigest(
      this.deps.paths.historyCoverDirectory,
      historyCoverDigest(key),
      historyCoverExtension(key)
    );
  }

  private coverMetadataPath(key: string): string {
    return path.join(
      this.deps.paths.historyCoverDirectory,
      `${historyCoverDigest(key)}.json`
    );
  }

  private async safeStat(filename: string) {
    return this.deps.fileSystem.stat(filename).catch(() => null);
  }

  private async resolveExistingHistoryFile(
    filenames: readonly string[]
  ): Promise<string | null> {
    const requested = filenames
      .map((candidate) => candidate.trim())
      .filter(Boolean)
      .map((candidate) => path.resolve(candidate));
    if (!requested.length) return null;
    const candidates = requested.flatMap((resolved) => [
      resolved,
      // VideoHelperSuite can report an `-audio.mp4` output while its finalized
      // file on disk is the otherwise identical `.mp4` path.
      resolved.replace(/-audio(?=\.[^.]+$)/i, "")
    ]);
    for (const candidate of new Set(candidates)) {
      const stat = await this.safeStat(candidate);
      if (stat?.isFile()) return candidate;
    }
    return null;
  }
}
