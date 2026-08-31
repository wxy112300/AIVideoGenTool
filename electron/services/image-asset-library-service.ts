import { randomUUID } from "node:crypto";
import type {
  AppState,
  ImageAssetLibraryProgress,
  ImageAssetLibraryResult,
  ImageAssetLibraryScan,
  Settings
} from "../../src/types.js";
import { safeLogErrorMessage, type AppLogger } from "../../src/infrastructure/app-logger.js";
import type { StateRepository } from "../ports/state-repository.js";
import type { ImageAssetLibraryFileSystemPort } from "../ports/image-asset-library.js";
import { nativeImageAssetLibrary } from "./native-image-asset-library.js";
import type { StudioEventBus } from "./studio-event-bus.js";

export type ImageAssetLibraryOperationResult = ImageAssetLibraryResult & {
  operationId: string;
};

export interface ImageAssetLibraryServiceDependencies {
  store: StateRepository;
  logger: Pick<AppLogger, "error" | "info">;
  events: Pick<StudioEventBus, "publish">;
  resolveLibraryDirectory(settings: Settings): Promise<string>;
  sendState(state: AppState): void;
  fileSystem?: ImageAssetLibraryFileSystemPort;
}

/**
 * Owns image-library orchestration and persisted reference updates.  The
 * filesystem capability is injected so this service remains independent of
 * Electron and can be exercised against temporary or synthetic fixtures.
 */
export class ImageAssetLibraryService {
  private readonly fileSystem: ImageAssetLibraryFileSystemPort;
  private operationRunning = false;

  constructor(private readonly deps: ImageAssetLibraryServiceDependencies) {
    this.fileSystem = deps.fileSystem ?? nativeImageAssetLibrary;
  }

  isRunning(): boolean {
    return this.operationRunning;
  }

  scan(): Promise<ImageAssetLibraryScan> {
    return this.runExclusive(async () => {
      const operationId = randomUUID().slice(0, 8);
      try {
        const snapshot = this.deps.store.get();
        const library = await this.deps.resolveLibraryDirectory(snapshot.settings);
        this.deps.logger.info("assets", "image-library-scan-started", "开始扫描图片素材库", {
          operationId,
          imageProjectCount: snapshot.imageHistory.length,
          videoHistoryCount: snapshot.history.length,
          queueCount: snapshot.queue.filter((task) =>
            task.taskType === "image-generation" || task.taskType === "generation"
          ).length
        });
        const result = await this.fileSystem.scan(
          snapshot,
          library,
          (progress) => this.report(progress)
        );
        this.deps.logger.info("assets", "image-library-scan-completed", "图片素材库扫描完成", {
          operationId,
          totalReferences: result.totalReferences,
          managedReferences: result.managedReferences,
          archiveCandidates: result.archiveCandidates,
          missingReferences: result.missingReferences.length,
          orphanCount: result.orphanFiles.length
        });
        return result;
      } catch (error) {
        this.deps.logger.error("assets", "image-library-scan-failed", "图片素材库扫描失败", {
          operationId,
          error: safeLogErrorMessage(error)
        });
        throw error;
      }
    });
  }

  organize(): Promise<ImageAssetLibraryOperationResult> {
    return this.runExclusive(async () => {
      if (this.deps.store.get().queueRunning) {
        throw new Error("队列运行期间不能整理图片素材库，请先暂停或等待任务完成。");
      }
      const operationId = randomUUID().slice(0, 8);
      try {
        const snapshot = this.deps.store.get();
        const library = await this.deps.resolveLibraryDirectory(snapshot.settings);
        this.deps.logger.info("assets", "image-library-organize-started", "开始归档并修复图片素材库", {
          operationId,
          imageProjectCount: snapshot.imageHistory.length,
          videoHistoryCount: snapshot.history.length,
          queueCount: snapshot.queue.filter((task) =>
            task.taskType === "image-generation" || task.taskType === "generation"
          ).length
        });
        const prepared = await this.fileSystem.organize(
          snapshot,
          library,
          (progress) => this.report(progress)
        );
        const next = await this.deps.store.update((state) => {
          this.applyPreparedState(state, prepared.state);
        });
        this.deps.sendState(next);
        this.report({
          phase: "completed",
          current: 1,
          total: 1,
          message: "图片素材库整理完成"
        });
        this.deps.logger.info(
          "assets",
          "image-library-organize-completed",
          "图片素材库整理完成，历史引用已保存，原文件和旧分片副本未删除",
          {
            operationId,
            archivedCount: prepared.result.archivedFiles,
            reorganizedCount: prepared.result.reorganizedFiles,
            updatedReferences: prepared.result.updatedReferences,
            remainingArchiveCandidates: prepared.result.scan.archiveCandidates,
            missingReferences: prepared.result.scan.missingReferences.length,
            orphanCount: prepared.result.scan.orphanFiles.length
          }
        );
        return { ...prepared.result, operationId };
      } catch (error) {
        this.deps.logger.error(
          "assets",
          "image-library-organize-failed",
          "图片素材库归档修复失败，历史引用未提交",
          { operationId, error: safeLogErrorMessage(error) }
        );
        throw error;
      }
    });
  }

  cleanup(paths: string[]): Promise<ImageAssetLibraryOperationResult> {
    return this.runExclusive(async () => {
      if (this.deps.store.get().queueRunning) {
        throw new Error("队列运行期间不能清理图片素材库，请先暂停或等待任务完成。");
      }
      const operationId = randomUUID().slice(0, 8);
      try {
        const snapshot = this.deps.store.get();
        const library = await this.deps.resolveLibraryDirectory(snapshot.settings);
        this.deps.logger.info("assets", "image-library-cleanup-started", "开始清理未被引用的图片素材", {
          operationId,
          requestedCount: paths.length
        });
        const result = await this.fileSystem.cleanup(
          snapshot,
          library,
          paths,
          (progress) => this.report(progress)
        );
        this.report({
          phase: "completed",
          current: 1,
          total: 1,
          message: "素材库清理完成"
        });
        this.deps.logger.info("assets", "image-library-cleanup-completed", "图片素材库清理完成", {
          operationId,
          cleanedCount: result.cleanedFiles,
          cleanedDirectoryCount: result.cleanedDirectories,
          cleanedBytes: result.cleanedBytes,
          remainingOrphanCount: result.scan.orphanFiles.length
        });
        return { ...result, operationId };
      } catch (error) {
        this.deps.logger.error("assets", "image-library-cleanup-failed", "图片素材库清理失败", {
          operationId,
          error: safeLogErrorMessage(error)
        });
        throw error;
      }
    });
  }

  private report(progress: ImageAssetLibraryProgress): void {
    this.deps.events.publish("image-assets:progress", progress);
  }

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.operationRunning) throw new Error("图片素材库正在处理中，请稍候。");
    this.operationRunning = true;
    try {
      return await operation();
    } finally {
      this.operationRunning = false;
    }
  }

  private applyPreparedState(state: AppState, prepared: AppState): void {
    state.imageDraft = prepared.imageDraft;
    state.imageHistory = prepared.imageHistory;
    state.draft.startImagePath = prepared.draft.startImagePath;
    state.draft.endImagePath = prepared.draft.endImagePath;
    state.draft.h3ReferenceSlots = prepared.draft.h3ReferenceSlots.map((slot) => ({ ...slot }));
    const preparedTasks = new Map(prepared.queue.map((task) => [task.id, task]));
    for (const task of state.queue) {
      const preparedTask = preparedTasks.get(task.id);
      if (task.taskType === "image-generation" && preparedTask?.taskType === "image-generation") {
        task.pictures = preparedTask.pictures;
      } else if (task.taskType === "generation" && preparedTask?.taskType === "generation") {
        task.startImagePath = preparedTask.startImagePath;
        task.endImagePath = preparedTask.endImagePath;
        task.h3ReferenceSlots = preparedTask.h3ReferenceSlots?.map((slot) => ({ ...slot }));
      } else if (task.taskType === "extension" && preparedTask?.taskType === "extension") {
        task.h3ReferenceSlots = preparedTask.h3ReferenceSlots?.map((slot) => ({ ...slot }));
      }
    }
    const preparedHistory = new Map(prepared.history.map((asset) => [asset.id, asset]));
    for (const asset of state.history) {
      const preparedAsset = preparedHistory.get(asset.id);
      if (!preparedAsset) continue;
      asset.startImagePath = preparedAsset.startImagePath;
      asset.endImagePath = preparedAsset.endImagePath;
      asset.h3ReferenceSlots = preparedAsset.h3ReferenceSlots?.map((slot) => ({ ...slot }));
    }
  }
}
