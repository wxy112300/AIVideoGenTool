import path from "node:path";
import type {
  AppState,
  HistoryAsset,
  HistoryMigrationProgress,
  QueueTask,
  Settings,
  SettingsSaveMode
} from "../../src/types.js";
import { normalizeUiLocale } from "../../src/core/i18n.js";
import { isMiniMaxH3Model } from "../../src/core/workflow.js";
import type { StateRepository } from "../ports/state-repository.js";
import type { AppLogger } from "../../src/infrastructure/app-logger.js";
import {
  cleanupVideoHistoryMigration,
  isPathWithinDirectory,
  markVideoHistoryMigrationCommitted,
  planVideoHistoryMigration,
  prepareVideoHistoryMigration,
  rollbackVideoHistoryMigration,
  type PreparedVideoHistoryMigration,
  type VideoHistoryMigrationPlan
} from "../../src/infrastructure/video-history-migration.js";
import type { StudioPaths } from "./studio-paths.js";

export interface SettingsHistoryMigrationPort {
  plan(
    history: HistoryAsset[],
    oldDirectory: string,
    newDirectory: string,
    queue: QueueTask[]
  ): Promise<VideoHistoryMigrationPlan>;
  prepare(
    plan: VideoHistoryMigrationPlan,
    journalFilename: string,
    onProgress: (progress: HistoryMigrationProgress) => void
  ): Promise<PreparedVideoHistoryMigration>;
  markCommitted(preparation: PreparedVideoHistoryMigration): Promise<void>;
  cleanup(
    preparation: PreparedVideoHistoryMigration,
    onProgress: (progress: HistoryMigrationProgress) => void
  ): Promise<string[]>;
  rollback(preparation: PreparedVideoHistoryMigration): Promise<void>;
}

const nativeHistoryMigration: SettingsHistoryMigrationPort = {
  plan: planVideoHistoryMigration,
  prepare: prepareVideoHistoryMigration,
  markCommitted: markVideoHistoryMigrationCommitted,
  cleanup: cleanupVideoHistoryMigration,
  rollback: rollbackVideoHistoryMigration
};

export interface SettingsServiceDependencies {
  store: StateRepository;
  logger: AppLogger;
  videoHistoryMigrationJournal: string;
  resolveComfyOutputDirectory(settings: Settings): Promise<string>;
  sendState(state: AppState): void;
  sendHistoryMigrationProgress(progress: HistoryMigrationProgress): void;
  clearRendererDirty(): void;
  migration?: SettingsHistoryMigrationPort;
}

/**
 * Owns settings validation, persistence and the copy-first video-history
 * migration gate.  UI dirty state and environment scans remain injected
 * effects so this service is directly testable without Electron.
 */
export class SettingsService {
  private readonly migration: SettingsHistoryMigrationPort;
  private historyMigrationRunning = false;

  constructor(private readonly deps: SettingsServiceDependencies) {
    this.migration = deps.migration ?? nativeHistoryMigration;
  }

  isHistoryMigrationRunning(): boolean {
    return this.historyMigrationRunning;
  }

  async effectiveImageInputLibraryDirectory(settings: Settings): Promise<string> {
    const configured = settings.imageInputLibraryDirectory.trim();
    if (configured) return path.resolve(configured);
    const outputRoot = await this.deps.resolveComfyOutputDirectory(settings);
    if (!outputRoot) {
      throw new Error("无法确定 ComfyUI input 目录，请先选择 ComfyUI 实例或手动设置图片素材库目录。");
    }
    return path.join(path.dirname(path.resolve(outputRoot)), "input", "LocalVideoStudio");
  }

  async materializeDefaultImageInputLibraryDirectory(): Promise<void> {
    if (this.deps.store.get().settings.imageInputLibraryDirectory.trim()) return;
    const directory = await this.effectiveImageInputLibraryDirectory(
      this.deps.store.get().settings
    ).catch(() => "");
    if (!directory) return;
    await this.deps.store.update((state) => {
      if (!state.settings.imageInputLibraryDirectory.trim()) {
        state.settings.imageInputLibraryDirectory = directory;
      }
    });
    this.deps.logger.info(
      "settings",
      "image-input-library-defaulted",
      "Default image input library was saved",
      { directory }
    );
  }

  async save(
    input: Settings,
    mode: SettingsSaveMode = "apply"
  ): Promise<AppState> {
    if (mode !== "apply" && mode !== "migrate-video-history") {
      throw new Error("未知的设置保存模式。");
    }
    if (this.historyMigrationRunning) {
      throw new Error("当前正在迁移历史视频，请等待本次操作完成。");
    }

    let settings = input;
    if (!settings.imageInputLibraryDirectory.trim()) {
      settings = {
        ...settings,
        imageInputLibraryDirectory: await this.effectiveImageInputLibraryDirectory(settings)
      };
    }
    settings = {
      ...settings,
      uiLocale: normalizeUiLocale(settings.uiLocale)
    };

    const previous = this.deps.store.get().settings;
    const outputDirectoryChanged =
      previous.outputDirectory.trim() !== settings.outputDirectory.trim();
    const directories = outputDirectoryChanged || mode === "migrate-video-history"
      ? await this.validateVideoOutputDirectoryChange(previous, settings)
      : { oldDirectory: "", newDirectory: "" };
    const shouldMigrate = Boolean(
      mode === "migrate-video-history" &&
      directories.oldDirectory &&
      directories.newDirectory.toLowerCase() !== directories.oldDirectory.toLowerCase()
    );
    const changedKeys = Object.keys(settings).filter((key) =>
      JSON.stringify(previous[key as keyof Settings]) !==
      JSON.stringify(settings[key as keyof Settings])
    );
    let updatedH3TaskCount = 0;
    const commitSettings = (state: AppState): void => {
      state.settings = settings;
      if (previous.h3AttentionMode !== settings.h3AttentionMode) {
        for (const task of state.queue) {
          if (
            task.status === "running" ||
            task.taskType === "upscale" ||
            task.taskType === "image-generation" ||
            !isMiniMaxH3Model(task.modelId)
          ) continue;
          task.attentionMode = settings.h3AttentionMode;
          task.updatedAt = new Date().toISOString();
          updatedH3TaskCount += 1;
        }
      }
    };

    if (shouldMigrate) {
      this.historyMigrationRunning = true;
      let preparation: PreparedVideoHistoryMigration | null = null;
      let stateCommitted = false;
      try {
        this.deps.sendHistoryMigrationProgress({
          phase: "scanning",
          current: 0,
          total: 0,
          message: "正在扫描历史视频文件",
          migratedFiles: 0,
          warningCount: 0
        });
        const current = this.deps.store.get();
        const plan = await this.migration.plan(
          current.history,
          directories.oldDirectory,
          directories.newDirectory,
          current.queue
        );
        this.deps.sendHistoryMigrationProgress({
          phase: "scanning",
          current: 0,
          total: plan.entries.length,
          message: `已找到 ${plan.entries.length} 个历史视频文件，准备迁移`,
          migratedFiles: 0,
          warningCount: plan.missing.length + plan.conflicts.length
        });
        preparation = await this.migration.prepare(
          plan,
          this.deps.videoHistoryMigrationJournal,
          this.deps.sendHistoryMigrationProgress
        );
        this.deps.sendHistoryMigrationProgress({
          phase: "committing",
          current: plan.entries.length,
          total: plan.entries.length,
          message: "目标文件已复核，正在更新历史记录",
          migratedFiles: plan.entries.length,
          warningCount: 0
        });
        const next = await this.deps.store.update((state) => {
          commitSettings(state);
          this.applyVideoMigrationPaths(state, plan);
        });
        stateCommitted = true;
        await this.migration.markCommitted(preparation);
        const warnings = await this.migration.cleanup(
          preparation,
          this.deps.sendHistoryMigrationProgress
        );
        this.deps.sendHistoryMigrationProgress({
          phase: "completed",
          current: plan.entries.length,
          total: plan.entries.length,
          message: warnings.length
            ? "历史视频已迁移，部分旧文件清理失败"
            : "历史视频迁移完成",
          migratedFiles: plan.entries.length,
          warningCount: warnings.length
        });
        this.deps.logger.info(
          "settings",
          "video-history-migrated",
          "Video history was migrated to the new output directory",
          {
            oldDirectory: directories.oldDirectory,
            newDirectory: directories.newDirectory,
            migratedFiles: plan.entries.length,
            warningCount: warnings.length
          }
        );
        this.deps.clearRendererDirty();
        this.deps.sendState(next);
        return next;
      } catch (error) {
        if (preparation && !stateCommitted) {
          await this.migration.rollback(preparation);
        }
        throw error;
      } finally {
        this.historyMigrationRunning = false;
      }
    }

    const next = await this.deps.store.update((state) => {
      commitSettings(state);
    });
    this.deps.logger.info("settings", "saved", "Application settings saved", {
      changedKeys,
      changedCount: changedKeys.length,
      updatedH3TaskCount
    });
    this.deps.clearRendererDirty();
    this.deps.sendState(next);
    return next;
  }

  private async effectiveVideoOutputDirectory(settings: Settings): Promise<string> {
    const configured = settings.outputDirectory.trim();
    if (configured) return path.resolve(configured);
    const detected = await this.deps.resolveComfyOutputDirectory({
      ...settings,
      outputDirectory: ""
    });
    return detected ? path.resolve(detected) : "";
  }

  private async validateVideoOutputDirectoryChange(
    previous: Settings,
    next: Settings
  ): Promise<{ oldDirectory: string; newDirectory: string }> {
    const oldDirectory = await this.effectiveVideoOutputDirectory(previous);
    const newDirectory = await this.effectiveVideoOutputDirectory(next);
    if (!newDirectory) {
      throw new Error("无法确定新的视频输出目录，请先启动或选择 ComfyUI 实例。");
    }
    if (!oldDirectory || oldDirectory.toLowerCase() === newDirectory.toLowerCase()) {
      return { oldDirectory, newDirectory };
    }
    const outputRoot = await this.deps.resolveComfyOutputDirectory({
      ...previous,
      outputDirectory: ""
    }) || oldDirectory;
    if (!isPathWithinDirectory(outputRoot, newDirectory)) {
      throw new Error("视频输出目录必须位于当前 ComfyUI output 目录内。");
    }
    return { oldDirectory, newDirectory };
  }

  private applyVideoMigrationPaths(
    state: AppState,
    plan: VideoHistoryMigrationPlan
  ): void {
    for (const entry of plan.entries) {
      for (const reference of entry.references) {
        if (reference.kind === "queue") {
          const task = state.queue.find((item) => item.id === reference.taskId);
          if (
            task?.taskType === "extension" &&
            reference.field === "sourceVideoPath"
          ) {
            task.sourceVideoPath = entry.targetPath;
            task.updatedAt = new Date().toISOString();
          } else if (
            task?.taskType === "upscale" &&
            reference.field === "sourceFilePath"
          ) {
            task.sourceFilePath = entry.targetPath;
            task.updatedAt = new Date().toISOString();
          }
          continue;
        }
        const asset = state.history.find((item) => item.id === reference.assetId);
        if (!asset) continue;
        if (reference.versionId) {
          const version = asset.versions.find((item) => item.id === reference.versionId);
          if (reference.artifactKind) {
            const file = version?.h3ContinuationData?.artifact?.[reference.artifactKind];
            if (file) file.absolutePath = entry.targetPath;
            for (const task of state.queue) {
              if (
                task.taskType !== "upscale" ||
                task.upscaleMode !== "h3-native" ||
                task.sourceAssetId !== reference.assetId ||
                task.sourceVersionId !== reference.versionId
              ) continue;
              const snapshotFile = task.h3NativeInput?.artifact[reference.artifactKind];
              if (snapshotFile) snapshotFile.absolutePath = entry.targetPath;
            }
            continue;
          }
          const file = version?.files[reference.fileIndex];
          if (file) file.absolutePath = entry.targetPath;
        } else {
          const file = asset.files[reference.fileIndex];
          if (file) file.absolutePath = entry.targetPath;
        }
      }
    }
  }
}
