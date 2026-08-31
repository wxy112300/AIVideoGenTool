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
  historyVideoVersionPaths,
  removeHistoryVideoVersion
} from "../../src/core/history-delete.js";
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
    try {
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
      await this.deps.removeCoverCacheKeys([
        ...(asset ? this.deps.coverCacheKeysForHistoryItem(asset) : []),
        ...(imageProject ? this.deps.coverCacheKeysForHistoryItem(imageProject) : [])
      ]);
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
    const versionPaths = historyVideoVersionPaths(version, current.settings.outputDirectory);
    const otherVersionPaths = new Set(
      asset.versions
        .filter((item) => item.id !== versionId)
        .flatMap((item) => historyVideoVersionPaths(item, current.settings.outputDirectory))
    );
    const filesToDelete = versionPaths.filter((filename) => !otherVersionPaths.has(filename));
    this.deps.logger.info("history", "video-version-delete-started", "开始删除视频版本和生成文件", {
      assetId,
      versionId,
      filename: version.outputFilename
    });
    try {
      await this.unlinkFiles(filesToDelete, "视频文件");
      const next = await this.deps.store.update((state) => {
        const target = state.history.find((item) => item.id === assetId);
        if (!target) throw new Error("视频记录不存在。");
        Object.assign(target, removeHistoryVideoVersion(target, versionId));
      });
      await this.deps.removeCoverCacheKeys([
        this.deps.coverCacheKeyForVideoVersion(asset, version)
      ]);
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
    try {
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
      await this.deps.removeCoverCacheKeys([
        this.deps.coverCacheKeyForImageVersion(project, version)
      ]);
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
