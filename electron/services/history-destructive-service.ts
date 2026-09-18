import path from "node:path";
import type {
  AppState,
  AssetVersion,
  Draft,
  HistoryAsset,
  HistoryItem,
  HistoryFile,
  ImageAssetVersion,
  ImageHistoryProject,
  Settings
} from "../../src/types.js";
import {
  historyVideoPaths,
  historyVideoVersionAuxiliaryPaths,
  removeHistoryVideoVersion
} from "../../src/core/history-delete.js";
import {
  h3MotionContextHistoryFileForPath,
  isH3MotionContextHistoryFile,
  H3_MOTION_CONTEXT_SUBFOLDER
} from "../../src/core/h3-motion-context.js";
import type { HistoryFileSystemPort } from "../ports/history-file-system.js";
import type { StateRepository } from "../ports/state-repository.js";
import type { AppLogger } from "../../src/infrastructure/app-logger.js";
import { safeLogErrorMessage } from "../../src/infrastructure/app-logger.js";

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
      const filesToDelete = asset
        ? historyVideoPaths(asset, current.settings.outputDirectory)
        : await this.imageProjectFilesToDelete(imageProject!, current.settings);
      if (asset) {
        await this.assertPathsExclusive(
          this.deps.store.get(),
          new Set(asset.versions.map((version) => `history:${asset.id}:${version.id}`)),
          filesToDelete,
          "视频文件"
        );
      }
      // Keep the existing user-facing wording for this legacy whole-record
      // command; version-specific commands use their precise media kind.
      await this.unlinkFiles(filesToDelete, "视频文件");
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
      this.logFailure("delete-failed", "History asset deletion failed", assetId, startedAt, error);
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
    const versionPaths = await this.videoVersionPaths(version, current.settings);
    const otherVersions = asset.versions.filter((item) => item.id !== versionId);
    const resolvedOtherVersionPaths = await Promise.all(
      otherVersions.map((item) => this.videoVersionPaths(item, current.settings))
    );
    const otherVersionPaths = new Set(
      resolvedOtherVersionPaths.flat().map(normalizedHistoryPath)
    );
    const filesToDelete = versionPaths.filter((filename) =>
      !otherVersionPaths.has(normalizedHistoryPath(filename))
    );
    await this.assertPathsExclusive(
      this.deps.store.get(),
      new Set([`history:${assetId}:${versionId}`]),
      filesToDelete,
      "视频文件"
    );
    this.deps.logger.info("history", "video-version-delete-started", "开始删除视频版本和生成文件", {
      assetId,
      versionId,
      filename: version.outputFilename
    });
    try {
      await this.deps.invalidateCoverCacheKeys?.([coverCacheKey]);
      await this.unlinkFiles(filesToDelete, "视频文件");
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

  private async videoVersionPaths(
    version: AssetVersion,
    settings: Settings
  ): Promise<string[]> {
    const resolvedVideos = await Promise.all(
      version.files
        .filter((file) => /\.(mp4|webm|mov|m4v|mkv)$/i.test(file.filename))
        .map((file) => this.deps.resolveHistoryFile(file, settings))
    );
    return [...new Set([
      ...resolvedVideos.filter((filename): filename is string => Boolean(filename)),
      ...historyVideoVersionAuxiliaryPaths(version, settings.outputDirectory)
    ].map((filename) => path.resolve(filename)))];
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
    await this.assertPathsExclusive(
      this.deps.store.get(),
      new Set([`history:${assetId}:${versionId}`]),
      resolved.filter((filename): filename is string => Boolean(filename)),
      "JointAV 文件",
      unifiedAsset ? [unifiedAsset.assetId] : []
    );
    try {
      await this.unlinkFiles(resolved.filter((filename): filename is string => Boolean(filename)), "JointAV 文件");
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
    const filename = resolved
      ? managedMotionContextPath(resolved, current.settings.outputDirectory)
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
    mediaLabel: string
  ): Promise<void> {
    for (const filename of [...new Set(filenames)]) {
      try {
        await this.deps.fileSystem.unlink(filename);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw new Error(
          `无法删除${mediaLabel} ${path.basename(filename)}：${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
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
    const blockers = (await collectHistoryAuxiliaryReferences(
      state,
      this.deps.resolveHistoryFile,
      state.settings
    ))
      .filter((reference) => !allowedReferenceIds.has(reference.referenceId))
      .filter((reference) =>
        reference.assetIds.some((assetId) => targetAssetIds.includes(assetId)) ||
        reference.paths.some((file) => targetKeys.has(file))
      )
      .map((reference) => reference.referenceId);
    if (blockers.length) {
      throw new Error(`${mediaLabel}仍被其他版本、队列或草稿引用，拒绝物理删除：${blockers.join("、")}`);
    }
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
    return resolved
      .filter((filename): filename is string => Boolean(filename))
      .map(normalizedHistoryPath);
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
    if (files.length) {
      references.push({
        referenceId: `queue:${task.id}`,
        paths: await resolvePaths(files),
        assetIds: task.taskType === "extension"
          ? (task.h3ContinuumSequence?.chunks ?? [])
              .map((chunk) => chunk.assetId)
              .filter((assetId): assetId is string => Boolean(assetId))
          : []
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
    if (files.length) {
      references.push({
        referenceId: `draft:${name}`,
        paths: await resolvePaths(files),
        assetIds: []
      });
    }
  }
  return references;
}

function normalizedHistoryPath(filename: string): string {
  const resolved = path.resolve(filename);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function managedMotionContextPath(filename: string, outputDirectory: string): string | null {
  if (!outputDirectory.trim()) return null;
  const root = path.resolve(outputDirectory);
  const candidate = path.resolve(filename);
  const relative = path.relative(root, candidate);
  const firstSegment = relative.split(path.sep)[0]?.toLowerCase();
  const managedRoots = new Set([H3_MOTION_CONTEXT_SUBFOLDER, "h3_context"]);
  if (
    !firstSegment ||
    !managedRoots.has(firstSegment) ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative) ||
    path.extname(candidate).toLowerCase() !== ".safetensors"
  ) return null;
  return candidate;
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
