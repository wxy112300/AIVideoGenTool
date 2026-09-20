import path from "node:path";
import type {
  AppState,
  AssetVersion,
  Draft,
  HistoryBatchCopyKind,
  HistoryAsset,
  HistoryItem,
  HistoryFile,
  ImageAssetVersion,
  ImageHistoryProject,
  Settings
} from "../../src/types.js";
import {
  removeHistoryVideoVersion
} from "../../src/core/history-delete.js";
import {
  h3MotionContextHistoryFileForPath,
  isH3MotionContextHistoryFile,
  H3_MOTION_CONTEXT_SUBFOLDER
} from "../../src/core/h3-motion-context.js";
import { historyFileCandidates } from "../../src/core/history-media.js";
import type { HistoryFileSystemPort } from "../ports/history-file-system.js";
import type { StateRepository } from "../ports/state-repository.js";
import type { AppLogger } from "../../src/infrastructure/app-logger.js";
import { safeLogErrorMessage } from "../../src/infrastructure/app-logger.js";

class PartialHistoryDeletionError extends Error {
  constructor(
    message: string,
    readonly deletedFiles: string[],
    readonly integrityUncertain: boolean
  ) {
    super(message);
    this.name = "PartialHistoryDeletionError";
  }
}

export interface HistoryDestructiveServiceDependencies {
  store: StateRepository;
  logger: AppLogger;
  sendState(state: AppState): void;
  fileSystem: HistoryFileSystemPort;
  resolveHistoryFile(file: HistoryFile, settings: Settings): Promise<string | null>;
  coverCacheKeysForHistoryItem(item: HistoryItem): string[];
  coverCacheKeyForVideoVersion(asset: HistoryAsset, version: AssetVersion): string;
  coverCacheKeyForImageVersion(project: ImageHistoryProject, version: ImageAssetVersion): string;
  invalidateCoverCacheKeys?(keys: readonly string[]): Promise<void>;
  removeCoverCacheKeys(keys: readonly string[]): Promise<void>;
  errorMeta(error: unknown): Record<string, unknown>;
}

export class HistoryDestructiveService {
  constructor(private readonly deps: HistoryDestructiveServiceDependencies) {}

  async deleteHistory(assetId: string): Promise<AppState> {
    const startedAt = Date.now();
    this.deps.logger.info("history", "delete-started", "History asset deletion started", { assetId });
    const current = this.deps.store.get();
    const asset = current.history.find((item) => item.id === assetId);
    const imageProject = current.imageHistory.find((item) => item.id === assetId);
    if (!asset && !imageProject) return current;
    const coverCacheKeys = [
      ...(asset ? this.deps.coverCacheKeysForHistoryItem(asset) : []),
      ...(imageProject ? this.deps.coverCacheKeysForHistoryItem(imageProject) : [])
    ];
    try {
      await this.deps.invalidateCoverCacheKeys?.(coverCacheKeys);
      const resolvedVideoFiles = asset
        ? await this.videoHistoryFilesToDelete(asset, current.settings)
        : undefined;
      const filesToDelete = resolvedVideoFiles?.paths ??
        await this.imageProjectFilesToDelete(imageProject!, current.settings);
      if (asset) {
        await this.assertPathsExclusive(
          this.deps.store.get(),
          new Set(asset.versions.map((version) => `history:${asset.id}:${version.id}`)),
          resolvedVideoFiles?.referencePaths ?? filesToDelete,
          "视频文件",
          asset.versions.flatMap(version => historyAuxiliaryAssetIds(version))
        );
      }
      // Keep the existing user-facing wording for this legacy whole-record
      // command; version-specific commands use their precise media kind.
      const deletedFiles = await this.unlinkFiles(
        filesToDelete,
        "视频文件",
        Boolean(resolvedVideoFiles?.unresolved.length)
      );
      if (resolvedVideoFiles?.unresolved.length) {
        throw new PartialHistoryDeletionError(
          "视频记录包含无法定位的文件，删除结果不完整。",
          deletedFiles,
          true
        );
      }
      const next = await this.deps.store.update((state) => {
        if (asset) state.history = state.history.filter((item) => item.id !== assetId);
        if (imageProject) {
          state.imageHistory = state.imageHistory.filter((item) => item.id !== assetId);
        }
      });
      await this.deps.removeCoverCacheKeys(coverCacheKeys);
      this.deps.logger.info("history", "delete-succeeded", "History asset deleted", {
        assetId,
        durationMs: Date.now() - startedAt,
        versionCount: asset?.versions.length ?? imageProject?.versions.length ?? 0
      });
      this.deps.sendState(next);
      return next;
    } catch (error) {
      if (asset && error instanceof PartialHistoryDeletionError && error.integrityUncertain) {
        await this.markHistoryAssetAuxiliaryFilesInvalid(assetId, error.message);
      }
      this.logFailure("delete-failed", "History asset deletion failed", assetId, startedAt, error);
      throw error;
    }
  }

  async deleteHistoryBatch(kind: HistoryBatchCopyKind, assetIds: string[]): Promise<AppState> {
    if (kind !== "video" && kind !== "image") throw new Error("历史媒体类型无效。");
    const requestedIds = [...new Set(assetIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())))];
    if (!requestedIds.length) return this.deps.store.get();
    const startedAt = Date.now();
    const current = this.deps.store.get();
    const targets = kind === "video"
      ? current.history.filter((item) => requestedIds.includes(item.id))
      : current.imageHistory.filter((item) => requestedIds.includes(item.id));
    if (!targets.length) return current;
    const coverCacheKeys = targets.flatMap((item) => this.deps.coverCacheKeysForHistoryItem(item));
    this.deps.logger.info("history", "delete-batch-started", "History batch deletion started", {
      kind,
      count: targets.length
    });
    try {
      await this.deps.invalidateCoverCacheKeys?.(coverCacheKeys);
      const resolvedVideo = kind === "video"
        ? await Promise.all((targets as HistoryAsset[]).map((asset) =>
          this.videoHistoryFilesToDelete(asset, current.settings)
        ))
        : [];
      const filesToDelete = kind === "video"
        ? [...new Set(resolvedVideo.flatMap((files) => files.paths))]
        : [...new Set(await Promise.all((targets as ImageHistoryProject[]).map((project) =>
          this.imageProjectFilesToDelete(project, current.settings)
        )).then((groups) => groups.flat()))];
      if (kind === "video") {
        const selectedVersions = (targets as HistoryAsset[]).flatMap((asset) => asset.versions);
        await this.assertPathsExclusive(
          this.deps.store.get(),
          new Set((targets as HistoryAsset[]).flatMap((asset) =>
            asset.versions.map((version) => `history:${asset.id}:${version.id}`)
          )),
          resolvedVideo.flatMap((files) => files.referencePaths),
          "视频文件",
          selectedVersions.flatMap(historyAuxiliaryAssetIds)
        );
      } else {
        await this.assertPathsExclusive(
          this.deps.store.get(),
          new Set(),
          filesToDelete,
          "图片文件"
        );
      }
      const unresolved = resolvedVideo.flatMap((files) => files.unresolved);
      const deletedFiles = await this.unlinkFiles(
        filesToDelete,
        kind === "video" ? "视频文件" : "图片文件",
        Boolean(unresolved.length)
      );
      if (unresolved.length) {
        throw new PartialHistoryDeletionError(
          "视频记录包含无法定位的文件，批量删除结果不完整。",
          deletedFiles,
          true
        );
      }
      const targetIdSet = new Set(targets.map((item) => item.id));
      const next = await this.deps.store.update((state) => {
        if (kind === "video") {
          state.history = state.history.filter((item) => !targetIdSet.has(item.id));
        } else {
          state.imageHistory = state.imageHistory.filter((item) => !targetIdSet.has(item.id));
        }
      });
      await this.deps.removeCoverCacheKeys(coverCacheKeys);
      this.deps.logger.info("history", "delete-batch-succeeded", "History assets deleted in batch", {
        kind,
        count: targets.length,
        durationMs: Date.now() - startedAt
      });
      this.deps.sendState(next);
      return next;
    } catch (error) {
      if (kind === "video" && error instanceof PartialHistoryDeletionError && error.integrityUncertain) {
        await Promise.all(targets.map((item) =>
          this.markHistoryAssetAuxiliaryFilesInvalid(item.id, error.message)
        ));
      }
      this.logFailure("delete-batch-failed", "History batch deletion failed", requestedIds.join(","), startedAt, error, {
        kind,
        count: targets.length
      });
      throw error;
    }
  }

  async deleteVideoVersion(assetId: string, versionId: string): Promise<AppState> {
    const startedAt = Date.now();
    const current = this.deps.store.get();
    const asset = current.history.find((item) => item.id === assetId);
    const version = asset?.versions.find((item) => item.id === versionId);
    if (!asset || !version) throw new Error("视频记录或版本不存在。");
    if (asset.versions.length <= 1) {
      throw new Error("视频记录至少需要保留一个版本；如需全部删除，请删除整条记录。");
    }
    const coverCacheKey = this.deps.coverCacheKeyForVideoVersion(asset, version);
    const resolvedVersionFiles = await this.videoVersionFilesToDelete(version, current.settings);
    const otherVersions = asset.versions.filter((item) => item.id !== versionId);
    const resolvedOtherVersionPaths = await Promise.all(
      otherVersions.map((item) => this.videoVersionFilesToDelete(item, current.settings))
    );
    const otherVersionPaths = new Set(
      resolvedOtherVersionPaths.flatMap((files) => files.referencePaths).map(normalizedHistoryPath)
    );
    const filesToDelete = resolvedVersionFiles.paths.filter((filename) =>
      !otherVersionPaths.has(normalizedHistoryPath(filename))
    );
    await this.assertPathsExclusive(
      this.deps.store.get(),
      new Set([`history:${assetId}:${versionId}`]),
      resolvedVersionFiles.referencePaths,
      "视频文件",
      historyAuxiliaryAssetIds(version)
    );
    this.deps.logger.info("history", "video-version-delete-started", "开始删除视频版本和生成文件", {
      assetId,
      versionId,
      filename: version.outputFilename
    });
    try {
      await this.deps.invalidateCoverCacheKeys?.([coverCacheKey]);
      const deletedFiles = await this.unlinkFiles(
        filesToDelete,
        "视频文件",
        Boolean(resolvedVersionFiles.unresolved.length)
      );
      if (resolvedVersionFiles.unresolved.length) {
        throw new PartialHistoryDeletionError(
          "视频版本包含无法定位的文件，删除结果不完整。",
          deletedFiles,
          true
        );
      }
      const next = await this.deps.store.update((state) => {
        const target = state.history.find((item) => item.id === assetId);
        if (!target) throw new Error("视频记录不存在。");
        Object.assign(target, removeHistoryVideoVersion(target, versionId));
      });
      await this.deps.removeCoverCacheKeys([coverCacheKey]);
      this.deps.logger.info("history", "video-version-delete-succeeded", "视频版本和生成文件已删除", {
        assetId,
        versionId,
        durationMs: Date.now() - startedAt
      });
      this.deps.sendState(next);
      return next;
    } catch (error) {
      if (error instanceof PartialHistoryDeletionError && error.integrityUncertain) {
        await this.markHistoryVersionAuxiliaryFilesInvalid(assetId, versionId, error.message);
      }
      this.logFailure(
        "video-version-delete-failed",
        "Video history version deletion failed",
        assetId,
        startedAt,
        error,
        { versionId }
      );
      throw error;
    }
  }

  private async videoHistoryFilesToDelete(
    asset: HistoryAsset,
    settings: Settings
  ): Promise<ResolvedHistoryDeletionFiles> {
    return this.resolveDeletionFiles(
      asset.versions.flatMap((version) => historyVideoFilesForDeletion(version)),
      settings
    );
  }

  private async videoVersionFilesToDelete(
    version: AssetVersion,
    settings: Settings
  ): Promise<ResolvedHistoryDeletionFiles> {
    return this.resolveDeletionFiles(historyVideoFilesForDeletion(version), settings);
  }

  private async resolveDeletionFiles(
    files: readonly HistoryFile[],
    settings: Settings
  ): Promise<ResolvedHistoryDeletionFiles> {
    const uniqueFiles = uniqueHistoryFiles(files);
    const resolved = await Promise.all(uniqueFiles.map(async (file) => ({
      file,
      filename: await this.deps.resolveHistoryFile(file, settings)
    })));
    return {
      paths: [...new Set(resolved
        .map((entry) => entry.filename)
        .filter((filename): filename is string => Boolean(filename))
        .map((filename) => path.resolve(filename)))],
      referencePaths: [...new Set([
        ...uniqueFiles.flatMap((file) => historyFileCandidates(file, settings)),
        ...resolved
          .map((entry) => entry.filename)
          .filter((filename): filename is string => Boolean(filename))
      ].map(normalizedHistoryPath))],
      unresolved: resolved
        .filter((entry) => !entry.filename)
        .map((entry) => entry.file)
    };
  }

  async deleteJointAv(assetId: string, versionId: string): Promise<AppState> {
    const startedAt = Date.now();
    const current = this.deps.store.get();
    const asset = current.history.find((item) => item.id === assetId);
    const version = asset?.versions.find((item) => item.id === versionId);
    const artifact = version?.h3ContinuationData?.status === "available"
      ? version.h3ContinuationData.artifact
      : undefined;
    if (!asset || !version || !artifact) throw new Error("当前版本没有可删除的 JointAV 文件。");
    const unifiedAsset = version.h3AvAsset;
    if (unifiedAsset?.storageKind === "continuum-run-chunk") {
      throw new Error("官方 Run Storage owner 不能从单个 History 版本删除。");
    }
    const targetFiles = [
      artifact.manifest,
      artifact.payload,
      ...(unifiedAsset ? [unifiedAsset.ownerPath, ...(unifiedAsset.aliasPaths ?? [])] : [])
    ];
    const resolved = await Promise.all([
      ...targetFiles.map((file) => this.deps.resolveHistoryFile(file, current.settings))
    ]);
    const unresolvedTargetFile = resolved.some((filename) => !filename);
    if (unresolvedTargetFile && resolved.every((filename) => !filename)) {
      const degraded = await this.deps.store.update((state) => {
        const target = state.history.find((item) => item.id === assetId)
          ?.versions.find((item) => item.id === versionId);
        if (!target) return;
        target.h3ContinuationData = {
          ...target.h3ContinuationData,
          status: "invalid",
          reason: "JointAV manifest 或 payload 已缺失，无法完成安全删除。"
        };
      });
      this.deps.sendState(degraded);
      throw new Error("JointAV manifest 或 payload 已缺失，无法完成安全删除。");
    }
    await this.assertPathsExclusive(
      this.deps.store.get(),
      new Set([`history:${assetId}:${versionId}`]),
      [
        ...resolved.filter((filename): filename is string => Boolean(filename)),
        ...targetFiles.flatMap((file) => historyFileCandidates(file, current.settings))
      ],
      "JointAV 文件",
      unifiedAsset ? [unifiedAsset.assetId] : []
    );
    try {
      const deletedJointAvFiles = await this.unlinkFiles(
        resolved.filter((filename): filename is string => Boolean(filename)),
        "JointAV 文件",
        unresolvedTargetFile
      );
      if (unresolvedTargetFile) {
        throw new PartialHistoryDeletionError(
          "JointAV manifest 或 payload 已缺失，删除结果不完整。",
          deletedJointAvFiles,
          true
        );
      }
      const next = await this.deps.store.update((state) => {
        const target = state.history.find((item) => item.id === assetId)
          ?.versions.find((item) => item.id === versionId);
        if (!target) throw new Error("视频记录或版本不存在。");
        target.files = target.files.filter((file) =>
          !targetFiles.some((candidate) =>
            file.absolutePath && candidate.absolutePath
              ? path.resolve(file.absolutePath) === path.resolve(candidate.absolutePath)
              : file.filename === candidate.filename && file.subfolder === candidate.subfolder
          )
        );
        target.h3ContinuationData = {
          status: "missing",
          reason: "JointAV 文件已由用户从详情页删除。"
        };
        target.h3AvAsset = undefined;
      });
      this.deps.logger.info("history", "joint-av-delete-succeeded", "JointAV files deleted", {
        assetId,
        versionId,
        durationMs: Date.now() - startedAt
      });
      this.deps.sendState(next);
      return next;
    } catch (error) {
      if (error instanceof PartialHistoryDeletionError && error.integrityUncertain) {
        const degraded = await this.deps.store.update((state) => {
          const target = state.history.find((item) => item.id === assetId)
            ?.versions.find((item) => item.id === versionId);
          if (!target) return;
          target.h3ContinuationData = {
            ...target.h3ContinuationData,
            status: "invalid",
            reason: "JointAV 文件删除不完整，剩余文件需要重新检查。"
          };
        });
        this.deps.sendState(degraded);
      }
      this.logFailure("joint-av-delete-failed", "JointAV deletion failed", assetId, startedAt, error, { versionId });
      throw error;
    }
  }

  async deleteMotionContext(assetId: string, versionId: string): Promise<AppState> {
    const startedAt = Date.now();
    const current = this.deps.store.get();
    const asset = current.history.find((item) => item.id === assetId);
    const version = asset?.versions.find((item) => item.id === versionId);
    const contextFile = version
      ? h3MotionContextHistoryFileForPath(version.h3ContextLatentPath, version.files) ??
        version.files.find(isH3MotionContextHistoryFile)
      : undefined;
    if (!asset || !version || !contextFile) {
      throw new Error("当前版本没有可删除的 Motion Context latent 文件。");
    }
    const resolved = await this.deps.resolveHistoryFile(contextFile, current.settings);
    const filename = resolved && path.extname(resolved).toLowerCase() === ".safetensors"
      ? path.resolve(resolved)
      : null;
    if (!filename) {
      throw new Error("当前版本没有可定位的 Motion Context latent 文件。");
    }
    await this.assertPathsExclusive(
      this.deps.store.get(),
      new Set([`history:${assetId}:${versionId}`]),
      [filename],
      "Motion Context latent 文件"
    );
    this.deps.logger.info("history", "motion-context-delete-started", "开始删除 Motion Context latent 文件", {
      assetId,
      versionId,
      filename: path.basename(filename)
    });
    try {
      await this.unlinkFiles([filename], "Motion Context latent 文件");
      const next = await this.deps.store.update((state) => {
        const targetAsset = state.history.find((item) => item.id === assetId);
        const target = targetAsset?.versions.find((item) => item.id === versionId);
        if (!targetAsset || !target) throw new Error("视频记录或版本不存在。");
        target.files = target.files.filter((file) =>
          !sameMotionContextFile(file, contextFile, filename)
        );
        target.h3ContextLatentPath = undefined;
        if (targetAsset.defaultVersionId === versionId) targetAsset.files = target.files;
      });
      this.deps.logger.info("history", "motion-context-delete-succeeded", "Motion Context latent 文件已删除", {
        assetId,
        versionId,
        durationMs: Date.now() - startedAt
      });
      this.deps.sendState(next);
      return next;
    } catch (error) {
      this.logFailure(
        "motion-context-delete-failed",
        "Motion Context latent deletion failed",
        assetId,
        startedAt,
        error,
        { versionId }
      );
      throw error;
    }
  }

  async deleteImageVersion(projectId: string, versionId: string): Promise<AppState> {
    const startedAt = Date.now();
    const current = this.deps.store.get();
    const project = current.imageHistory.find((item) => item.id === projectId);
    const version = project?.versions.find((item) => item.id === versionId);
    if (!project || !version) throw new Error("图片项目或版本不存在。");
    if (version.kind === "source") throw new Error("原始导入图片不能从项目中删除。");
    const sharedByAnotherVersion = project.versions.some((item) =>
      item.id !== versionId && (
        Boolean(version.file.absolutePath && item.file.absolutePath === version.file.absolutePath) ||
        (item.file.filename === version.file.filename && item.file.subfolder === version.file.subfolder)
      )
    );
    this.deps.logger.info("history", "image-version-delete-started", "开始删除图片版本和生成文件", {
      projectId,
      versionId,
      filename: version.file.filename
    });
    const coverCacheKey = this.deps.coverCacheKeyForImageVersion(project, version);
    try {
      await this.deps.invalidateCoverCacheKeys?.([coverCacheKey]);
      const resolvedFile = sharedByAnotherVersion
        ? null
        : await this.deps.resolveHistoryFile(version.file, current.settings);
      if (resolvedFile) await this.unlinkFiles([resolvedFile], "图片文件");
      const next = await this.deps.store.update((state) => {
        const target = state.imageHistory.find((item) => item.id === projectId);
        if (!target) return;
        target.versions = target.versions.filter((item) => item.id !== versionId);
        if (target.coverVersionId === versionId) {
          target.coverMode = "auto";
          target.coverVersionId = undefined;
        }
        target.updatedAt = [...target.versions]
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]?.createdAt ?? target.createdAt;
      });
      await this.deps.removeCoverCacheKeys([coverCacheKey]);
      this.deps.logger.info("history", "image-version-delete-succeeded", "图片版本和生成文件已删除", {
        projectId,
        versionId,
        durationMs: Date.now() - startedAt
      });
      this.deps.sendState(next);
      return next;
    } catch (error) {
      this.logFailure(
        "image-version-delete-failed",
        "Image history version deletion failed",
        projectId,
        startedAt,
        error,
        { versionId }
      );
      throw error;
    }
  }

  private async imageProjectFilesToDelete(
    project: ImageHistoryProject,
    settings: Settings
  ): Promise<string[]> {
    const resolved = await Promise.all(
      project.versions
        .filter((version) => version.kind !== "source")
        .map((version) => this.deps.resolveHistoryFile(version.file, settings))
    );
    return [...new Set(resolved.filter((filename): filename is string => Boolean(filename)))];
  }

  private async unlinkFiles(
    filenames: readonly string[],
    mediaLabel: string,
    integrityUncertain = false
  ): Promise<string[]> {
    const deletedFiles: string[] = [];
    let missingFileSeen = false;
    for (const filename of [...new Set(filenames)]) {
      try {
        await this.deps.fileSystem.unlink(filename);
        deletedFiles.push(filename);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          missingFileSeen = true;
          continue;
        }
        throw new PartialHistoryDeletionError(
          `无法删除${mediaLabel} ${path.basename(filename)}：${
            error instanceof Error ? error.message : String(error)
          }`,
          deletedFiles,
          integrityUncertain || missingFileSeen || deletedFiles.length > 0
        );
      }
    }
    return deletedFiles;
  }

  private async markHistoryAssetAuxiliaryFilesInvalid(
    assetId: string,
    reason: string
  ): Promise<void> {
    const next = await this.deps.store.update((state) => {
      const asset = state.history.find((item) => item.id === assetId);
      for (const version of asset?.versions ?? []) {
        if (version.h3ContinuationData?.status === "available" || version.h3AvAsset) {
          version.h3ContinuationData = {
            ...version.h3ContinuationData,
            status: "invalid",
            reason: `辅助文件删除不完整，需重新检查：${reason}`
          };
        }
      }
    });
    this.deps.sendState(next);
  }

  private async markHistoryVersionAuxiliaryFilesInvalid(
    assetId: string,
    versionId: string,
    reason: string
  ): Promise<void> {
    const next = await this.deps.store.update((state) => {
      const version = state.history.find((item) => item.id === assetId)
        ?.versions.find((item) => item.id === versionId);
      if (!version) return;
      version.h3ContinuationData = {
        ...version.h3ContinuationData,
        status: "invalid",
        reason: `辅助文件删除不完整，需重新检查：${reason}`
      };
    });
    this.deps.sendState(next);
  }

  private async assertAuxiliaryFilesExclusive(
    state: AppState,
    assetId: string,
    versionId: string,
    targetFiles: readonly HistoryFile[],
    mediaLabel: string,
    targetAssetIds: readonly string[] = []
  ): Promise<void> {
    await this.assertPathsExclusive(
      state,
      new Set([`history:${assetId}:${versionId}`]),
      targetFiles.map((file) => historyReferencePath(file, state.settings.outputDirectory)),
      mediaLabel,
      targetAssetIds
    );
  }

  private async assertPathsExclusive(
    state: AppState,
    allowedReferenceIds: ReadonlySet<string>,
    targetPaths: readonly string[],
    mediaLabel: string,
    targetAssetIds: readonly string[] = []
  ): Promise<void> {
    const targetKeys = new Set(targetPaths.map(normalizedHistoryPath));
    let scanState = state;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const beforeSignature = auxiliaryReferenceStateSignature(scanState);
      const references = await collectHistoryAuxiliaryReferences(
        scanState,
        this.deps.resolveHistoryFile,
        scanState.settings
      );
      const latestState = this.deps.store.get();
      const afterSignature = auxiliaryReferenceStateSignature(latestState);
      if (beforeSignature !== afterSignature) {
        scanState = latestState;
        continue;
      }
      const blockers = references
        .filter((reference) => !allowedReferenceIds.has(reference.referenceId))
        .filter((reference) =>
          reference.assetIds.some((assetId) => targetAssetIds.includes(assetId)) ||
          reference.paths.some((file) => targetKeys.has(file))
        )
        .map((reference) => reference.referenceId);
      if (blockers.length) {
        throw new Error(`${mediaLabel}仍被其他版本、队列或草稿引用，拒绝物理删除：${blockers.join("、")}`);
      }
      return;
    }
    throw new Error(`${mediaLabel}引用状态在检查期间持续变化，拒绝物理删除，请重试。`);
  }

  private logFailure(
    event: string,
    message: string,
    assetId: string,
    startedAt: number,
    error: unknown,
    extra: Record<string, unknown> = {}
  ): void {
    this.deps.logger.error("history", event, safeLogErrorMessage(error), {
      assetId,
      durationMs: Date.now() - startedAt,
      ...extra,
      ...this.deps.errorMeta(error),
      message
    });
  }
}

interface HistoryAuxiliaryReference {
  referenceId: string;
  paths: string[];
  assetIds: string[];
}

interface ResolvedHistoryDeletionFiles {
  paths: string[];
  referencePaths: string[];
  unresolved: HistoryFile[];
}

function historyVideoFilesForDeletion(version: AssetVersion): HistoryFile[] {
  const files = version.files.filter((file) => /\.(mp4|webm|mov|m4v|mkv)$/i.test(file.filename));
  const hasManagedRunOwner = version.h3AvAsset?.storageKind === "continuum-run-chunk" ||
    version.h3ContinuationData?.asset?.storageKind === "continuum-run-chunk";
  if (version.h3ContinuationData?.artifact && !hasManagedRunOwner) {
    files.push(
      version.h3ContinuationData.artifact.manifest,
      version.h3ContinuationData.artifact.payload
    );
  }
  const motionContextFile = h3MotionContextHistoryFileForPath(
    version.h3ContextLatentPath,
    version.files
  ) ?? version.files.find(isH3MotionContextHistoryFile);
  if (motionContextFile) files.push(motionContextFile);
  for (const asset of [version.h3AvAsset, version.h3ContinuationData?.asset]) {
    if (!asset || asset.storageKind === "continuum-run-chunk") continue;
    files.push(asset.ownerPath, ...(asset.aliasPaths ?? []));
  }
  return uniqueHistoryFiles(files);
}

function historyAuxiliaryAssetIds(version: AssetVersion): string[] {
  return [...new Set([
    version.h3AvAsset?.assetId,
    version.h3ContinuationData?.asset?.assetId,
    version.h3MotionContextSourceAsset?.assetId,
    ...(version.h3ContinuumSequence?.chunks ?? []).map((chunk) => chunk.assetId)
  ].filter((assetId): assetId is string => Boolean(assetId)))];
}

function uniqueHistoryFiles(files: readonly HistoryFile[]): HistoryFile[] {
  const seen = new Set<string>();
  return files.filter((file) => {
    const key = file.absolutePath
      ? `absolute:${normalizedHistoryPath(file.absolutePath)}`
      : `logical:${file.type}\u0000${file.subfolder}\u0000${file.filename}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function historyReferencePath(file: HistoryFile, outputDirectory: string): string {
  return normalizedHistoryPath(
    file.absolutePath ?? path.resolve(outputDirectory, file.subfolder, file.filename)
  );
}

function draftAuxiliaryFiles(draft: Draft): HistoryFile[] {
  const files: HistoryFile[] = [];
  if (draft.sourceVideoPath) {
    files.push({
      filename: path.basename(draft.sourceVideoPath),
      subfolder: path.dirname(draft.sourceVideoPath),
      type: "input",
      absolutePath: draft.sourceVideoPath
    });
  }
  if (draft.h3ContextLatentPath) {
    files.push({
      filename: path.basename(draft.h3ContextLatentPath),
      subfolder: path.dirname(draft.h3ContextLatentPath),
      type: "output",
      absolutePath: draft.h3ContextLatentPath
    });
  }
  if (draft.h3ContinuumArtifact) {
    files.push(
      draft.h3ContinuumArtifact.manifest,
      draft.h3ContinuumArtifact.payload
    );
  }
  if (draft.h3ContinuumArtifactPath) {
    files.push({
      filename: path.basename(draft.h3ContinuumArtifactPath),
      subfolder: path.dirname(draft.h3ContinuumArtifactPath),
      type: "output",
      absolutePath: draft.h3ContinuumArtifactPath
    });
  }
  if (draft.h3MotionContextAsset) {
    files.push(
      draft.h3MotionContextAsset.ownerPath,
      ...(draft.h3MotionContextAsset.aliasPaths ?? [])
    );
  }
  return files;
}

async function collectHistoryAuxiliaryReferences(
  state: AppState,
  resolveHistoryFile: HistoryDestructiveServiceDependencies["resolveHistoryFile"],
  settings: Settings
): Promise<HistoryAuxiliaryReference[]> {
  const references: HistoryAuxiliaryReference[] = [];
  const resolvePaths = async (files: readonly HistoryFile[]): Promise<string[]> => {
    const resolved = await Promise.all(files.map((file) => resolveHistoryFile(file, settings)));
    return [...new Set([
      ...files.flatMap((file) => historyFileCandidates(file, settings)),
      ...resolved.filter((filename): filename is string => Boolean(filename))
    ].map(normalizedHistoryPath))];
  };
  for (const asset of state.history) {
    for (const version of asset.versions) {
      const files = [
        ...version.files,
        ...(version.h3ContinuationData?.artifact
          ? [version.h3ContinuationData.artifact.manifest, version.h3ContinuationData.artifact.payload]
          : []),
        ...(version.h3AvAsset
          ? [version.h3AvAsset.ownerPath, ...(version.h3AvAsset.aliasPaths ?? [])]
          : []),
        ...(version.h3ContinuationData?.asset
          ? [
              version.h3ContinuationData.asset.ownerPath,
              ...(version.h3ContinuationData.asset.aliasPaths ?? [])
            ]
          : []),
        ...(version.h3MotionContextSourceAsset
          ? [
              version.h3MotionContextSourceAsset.ownerPath,
              ...(version.h3MotionContextSourceAsset.aliasPaths ?? [])
            ]
          : []),
        ...(version.h3ContextLatentPath
          ? [{
              filename: path.basename(version.h3ContextLatentPath),
              subfolder: path.dirname(version.h3ContextLatentPath),
              type: "output",
              absolutePath: version.h3ContextLatentPath
            }]
          : [])
      ];
      references.push({
        referenceId: `history:${asset.id}:${version.id}`,
        paths: await resolvePaths(files),
        assetIds: [
          ...(version.h3AvAsset ? [version.h3AvAsset.assetId] : []),
          ...(version.h3ContinuationData?.asset ? [version.h3ContinuationData.asset.assetId] : []),
          ...(version.h3MotionContextSourceAsset ? [version.h3MotionContextSourceAsset.assetId] : []),
          ...(version.h3ContinuumSequence?.chunks ?? [])
            .map((chunk) => chunk.assetId)
            .filter((assetId): assetId is string => Boolean(assetId))
        ]
      });
    }
  }
  for (const task of state.queue) {
    const files: HistoryFile[] = [];
    if (task.taskType === "extension" && task.sourceVideoPath) {
      files.push({
        filename: path.basename(task.sourceVideoPath),
        subfolder: path.dirname(task.sourceVideoPath),
        type: "input",
        absolutePath: task.sourceVideoPath
      });
    }
    if (task.taskType === "upscale" && task.sourceFilePath) {
      files.push({
        filename: path.basename(task.sourceFilePath),
        subfolder: path.dirname(task.sourceFilePath),
        type: "input",
        absolutePath: task.sourceFilePath
      });
    }
    if ("h3ContextLatentPath" in task && task.h3ContextLatentPath) {
      files.push({
        filename: path.basename(task.h3ContextLatentPath),
        subfolder: path.dirname(task.h3ContextLatentPath),
        type: "output",
        absolutePath: task.h3ContextLatentPath
      });
    }
    if ("h3ContextSavedPath" in task && task.h3ContextSavedPath) {
      files.push({
        filename: path.basename(task.h3ContextSavedPath),
        subfolder: path.dirname(task.h3ContextSavedPath),
        type: "output",
        absolutePath: task.h3ContextSavedPath
      });
    }
    if ("h3ContinuumArtifact" in task && task.h3ContinuumArtifact) {
      files.push(task.h3ContinuumArtifact.manifest, task.h3ContinuumArtifact.payload);
    }
    if ("h3ContinuumArtifactPath" in task && task.h3ContinuumArtifactPath) {
      files.push({
        filename: path.basename(task.h3ContinuumArtifactPath),
        subfolder: path.dirname(task.h3ContinuumArtifactPath),
        type: "output",
        absolutePath: task.h3ContinuumArtifactPath
      });
    }
    if ("h3MotionContextAsset" in task && task.h3MotionContextAsset) {
      files.push(
        task.h3MotionContextAsset.ownerPath,
        ...(task.h3MotionContextAsset.aliasPaths ?? [])
      );
    }
    if (task.taskType === "upscale" && task.h3NativeInput?.artifact) {
      files.push(
        task.h3NativeInput.artifact.manifest,
        task.h3NativeInput.artifact.payload
      );
    }
    if (task.taskType === "generation" && task.h3FirstPassCheckpoint) {
      files.push(
        task.h3FirstPassCheckpoint.outputFile,
        task.h3FirstPassCheckpoint.artifact.manifest,
        task.h3FirstPassCheckpoint.artifact.payload
      );
    }
    const queueAssetIds = "h3ContinuumSequence" in task
      ? (task.h3ContinuumSequence?.chunks ?? [])
          .map((chunk) => chunk.assetId)
          .filter((assetId): assetId is string => Boolean(assetId))
      : [];
    if ("h3MotionContextAsset" in task && task.h3MotionContextAsset?.assetId) {
      queueAssetIds.push(task.h3MotionContextAsset.assetId);
    }
    if (files.length || queueAssetIds.length) {
      references.push({
        referenceId: `queue:${task.id}`,
        paths: await resolvePaths(files),
        assetIds: queueAssetIds
      });
    }
  }
  for (const [name, draft] of [
    ["draft", state.draft],
    ["image-to-video-draft", state.imageToVideoDraft],
    ["video-extension-draft", state.videoExtensionDraft]
  ] as const) {
    if (!draft) continue;
    const files = draftAuxiliaryFiles(draft);
    const draftAssetIds = (draft.h3ContinuumSequence?.chunks ?? [])
      .map((chunk) => chunk.assetId)
      .filter((assetId): assetId is string => Boolean(assetId));
    if (files.length || draftAssetIds.length) {
      references.push({
        referenceId: `draft:${name}`,
        paths: await resolvePaths(files),
        assetIds: draftAssetIds
      });
    }
  }
  return references;
}

function auxiliaryReferenceStateSignature(state: AppState): string {
  return JSON.stringify({
    settings: {
      outputDirectory: state.settings.outputDirectory,
      imageOutputDirectory: state.settings.imageOutputDirectory,
      modelDirectory: state.settings.modelDirectory,
      comfyInstallDirectory: state.settings.comfyInstallDirectory
    },
    history: state.history.map((asset) => ({
      id: asset.id,
      versions: asset.versions.map((version) => ({
        id: version.id,
        files: version.files,
        h3ContextLatentPath: version.h3ContextLatentPath,
        artifact: version.h3ContinuationData?.artifact,
        h3AvAsset: version.h3AvAsset,
        continuationAsset: version.h3ContinuationData?.asset,
        motionContextSourceAsset: version.h3MotionContextSourceAsset,
        sequence: version.h3ContinuumSequence?.chunks.map((chunk) => chunk.assetId)
      }))
    })),
    queue: state.queue.map((task) => ({
      id: task.id,
      taskType: task.taskType,
      sourceVideoPath: "sourceVideoPath" in task ? task.sourceVideoPath : undefined,
      sourceFilePath: "sourceFilePath" in task ? task.sourceFilePath : undefined,
      h3ContextLatentPath: "h3ContextLatentPath" in task ? task.h3ContextLatentPath : undefined,
      h3ContextSavedPath: "h3ContextSavedPath" in task ? task.h3ContextSavedPath : undefined,
      h3ContinuumArtifactPath: "h3ContinuumArtifactPath" in task ? task.h3ContinuumArtifactPath : undefined,
      h3ContinuumArtifact: "h3ContinuumArtifact" in task ? task.h3ContinuumArtifact : undefined,
      h3MotionContextAsset: "h3MotionContextAsset" in task ? task.h3MotionContextAsset : undefined,
      h3NativeInput: task.taskType === "upscale" ? task.h3NativeInput?.artifact : undefined,
      checkpoint: task.taskType === "generation" ? task.h3FirstPassCheckpoint : undefined,
      sequence: "h3ContinuumSequence" in task
        ? task.h3ContinuumSequence?.chunks.map((chunk) => chunk.assetId)
        : undefined
    })),
    drafts: [state.draft, state.imageToVideoDraft, state.videoExtensionDraft].map((draft) => draft
      ? {
          sourceVideoPath: draft.sourceVideoPath,
          h3ContextLatentPath: draft.h3ContextLatentPath,
          h3ContinuumArtifactPath: draft.h3ContinuumArtifactPath,
          h3ContinuumArtifact: draft.h3ContinuumArtifact,
          h3MotionContextAsset: draft.h3MotionContextAsset,
          sequence: draft.h3ContinuumSequence?.chunks.map((chunk) => chunk.assetId),
          sourceAssetId: draft.sourceAssetId,
          sourceVersionId: draft.sourceVersionId
        }
      : null)
  });
}

function normalizedHistoryPath(filename: string): string {
  const resolved = path.resolve(filename);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function sameMotionContextFile(
  file: HistoryFile,
  candidate: HistoryFile,
  resolvedPath: string
): boolean {
  if (!isH3MotionContextHistoryFile(file)) return false;
  if (file.absolutePath && path.resolve(file.absolutePath) === resolvedPath) return true;
  return file.filename.toLowerCase() === candidate.filename.toLowerCase() &&
    file.subfolder.replaceAll("\\", "/").toLowerCase() ===
      candidate.subfolder.replaceAll("\\", "/").toLowerCase();
}
