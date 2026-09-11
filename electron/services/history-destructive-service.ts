import path from "node:path";
import type {
  AppState,
  AssetVersion,
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
    const resolved = await Promise.all([
      this.deps.resolveHistoryFile(artifact.manifest, current.settings),
      this.deps.resolveHistoryFile(artifact.payload, current.settings)
    ]);
    try {
      await this.unlinkFiles(resolved.filter((filename): filename is string => Boolean(filename)), "JointAV 文件");
      const next = await this.deps.store.update((state) => {
        const target = state.history.find((item) => item.id === assetId)
          ?.versions.find((item) => item.id === versionId);
        if (!target) throw new Error("视频记录或版本不存在。");
        target.files = target.files.filter((file) =>
          ![artifact.manifest, artifact.payload].some((candidate) =>
            file.absolutePath && candidate.absolutePath
              ? path.resolve(file.absolutePath) === path.resolve(candidate.absolutePath)
              : file.filename === candidate.filename && file.subfolder === candidate.subfolder
          )
        );
        target.h3ContinuationData = {
          status: "missing",
          reason: "JointAV 文件已由用户从详情页删除。"
        };
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
