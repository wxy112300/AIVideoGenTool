import path from "node:path";
import { LAN_BROWSER_DEFAULT_PORT } from "../../src/core/lan-browser.js";
import { normalizeStrataSettings, validStrataPort } from "../../src/core/strata-preparation.js";
import { isStrataUncensoredMode } from "../../src/core/strata-uncensored.js";
import type {
  AppState,
  HistoryAsset,
  HistoryMigrationProgress,
  QueueTask,
  Settings,
  SettingsSaveMode
} from "../../src/types.js";
import { normalizeUiLocale, type Translate } from "../../src/core/i18n.js";
import { createNativeTranslator } from "../ui-translator.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
import { normalizeAppearance } from "../../src/core/appearance.js";
import { MODEL_DOWNLOAD_INVALID, modelDownloadOrigin, modelDownloadSource, modelDownloadSources } from "../../src/core/download-url.js";
import {
  applyH3AccelerationSettingsToWaitingTask,
  normalizeH3GlobalSparseAttentionMode
} from "../../src/core/h3-execution-policy.js";
import type { StateRepository } from "../ports/state-repository.js";
import type { AppLogger } from "../../src/infrastructure/app-logger.js";
import {
  cleanupVideoHistoryMigration,
  remapVideoMigrationConsumers,
  isPathWithinDirectory,
  markVideoHistoryMigrationCommitted,
  planVideoHistoryMigration,
  prepareVideoHistoryMigration,
  rollbackVideoHistoryMigration,
  type PreparedVideoHistoryMigration,
  type VideoHistoryMigrationPlan
} from "../../src/infrastructure/video-history-migration.js";
import type { StudioPaths } from "./studio-paths.js";
import { migrateStorageSettings, validateMediaDirectories } from "./settings-storage-migration.js";

export interface SettingsHistoryMigrationPort {
  plan(
    history: HistoryAsset[],
    oldDirectory: string,
    newDirectory: string,
    queue: QueueTask[],
    t?: Translate
  ): Promise<VideoHistoryMigrationPlan>;
  prepare(
    plan: VideoHistoryMigrationPlan,
    journalFilename: string,
    onProgress: (progress: HistoryMigrationProgress) => void,
    t?: Translate
  ): Promise<PreparedVideoHistoryMigration>;
  markCommitted(preparation: PreparedVideoHistoryMigration): Promise<void>;
  cleanup(
    preparation: PreparedVideoHistoryMigration,
    onProgress: (progress: HistoryMigrationProgress) => void,
    t?: Translate
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
  stateFile?: string;
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
    const t = createNativeTranslator(settings.uiLocale).t;
    const configured = settings.imageInputLibraryDirectory.trim();
    if (configured) return path.resolve(configured);
    const outputRoot = await this.deps.resolveComfyOutputDirectory(settings);
    if (!outputRoot) {
      throw new Error(t(uiKeys.serviceError.inputDirectoryUnknown));
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
    const t = createNativeTranslator(input.uiLocale ?? this.deps.store.get().settings.uiLocale).t;
    // Immediate visual preferences must never apply an unrelated settings draft,
    // clear the native dirty guard, scan files, or touch queued execution policy.
    if (mode === "appearance") {
      if (this.historyMigrationRunning) throw new Error(t(uiKeys.serviceError.migrationBusy));
      await this.deps.store.update((state) => {
        state.settings.appearance = normalizeAppearance(input.appearance);
      });
      const state = this.deps.store.get();
      this.deps.sendState(state);
      return state;
    }
    if (mode !== "apply" && mode !== "migrate-video-history" && mode !== "migrate-storage") {
      throw new Error(t(uiKeys.serviceError.saveModeInvalid));
    }
    if (this.historyMigrationRunning) {
      throw new Error(t(uiKeys.serviceError.migrationBusy));
    }

    if (input.lanBrowserEnabled !== undefined && typeof input.lanBrowserEnabled !== "boolean") {
      throw new Error(t(uiKeys.serviceError.lanSwitchInvalid));
    }
    if (input.lanBrowserPort !== undefined && (!Number.isInteger(input.lanBrowserPort) || input.lanBrowserPort < 1024 || input.lanBrowserPort > 65535)) {
      throw new Error(t(uiKeys.serviceError.lanPortInvalid));
    }

    if (input.strataPort !== undefined && !validStrataPort(input.strataPort)) {
      throw new Error(t(uiKeys.serviceError.strataPortInvalid));
    }
    if (input.strataUncensored !== undefined && typeof input.strataUncensored !== "boolean") {
      throw new Error(t(uiKeys.serviceError.uncensoredInvalid));
    }
    if (input.strataUncensoredMode !== undefined && !isStrataUncensoredMode(input.strataUncensoredMode)) {
      throw new Error(t(uiKeys.serviceError.uncensoredModeInvalid));
    }
    if (input.modelDownloadSource !== undefined && !modelDownloadSources.some(source => source.id === input.modelDownloadSource)) throw new Error(MODEL_DOWNLOAD_INVALID);
    if (modelDownloadSource(input) === "custom" && !modelDownloadOrigin(input.modelDownloadCustomUrl ?? "")) throw new Error(MODEL_DOWNLOAD_INVALID);
    let settings = { ...input, ...normalizeStrataSettings(input), appearance: normalizeAppearance(input.appearance ?? this.deps.store.get().settings.appearance) };
    settings.modelDownloadSource = modelDownloadSource(input);
    settings.hfMirrorEnabled = settings.modelDownloadSource !== "huggingface";
    if (settings.modelDownloadSource === "custom") settings.modelDownloadCustomUrl = modelDownloadOrigin(input.modelDownloadCustomUrl!)!;
    settings.lanBrowserEnabled = input.lanBrowserEnabled === true;
    settings.lanBrowserPort = input.lanBrowserPort ?? LAN_BROWSER_DEFAULT_PORT;
    if (!settings.imageInputLibraryDirectory.trim()) {
      settings = {
        ...settings,
        imageInputLibraryDirectory: await this.effectiveImageInputLibraryDirectory(settings)
      };
    }
    settings = {
      ...settings,
      uiLocale: normalizeUiLocale(settings.uiLocale),
      h3SparseAttentionMode: normalizeH3GlobalSparseAttentionMode(settings.h3SparseAttentionMode)
    };

    const previous = this.deps.store.get().settings;
    const storageChanged = (["libraryDirectory", "outputDirectory", "imageOutputDirectory"] as const).some(key =>
      (previous[key] ?? "").trim().replace(/[\\/]+$/u, "").toLowerCase() !== (settings[key] ?? "").trim().replace(/[\\/]+$/u, "").toLowerCase());
    if (storageChanged && mode === "apply") throw new Error(t(uiKeys.serviceError.storageMoveRequired));
    const outputDirectoryChanged =
      previous.outputDirectory.trim() !== settings.outputDirectory.trim();
    const directories = mode !== "migrate-storage" && (outputDirectoryChanged || mode === "migrate-video-history")
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
    const h3AccelerationChanged =
      previous.h3AttentionMode !== settings.h3AttentionMode ||
      previous.h3SparseAttentionMode !== settings.h3SparseAttentionMode ||
      previous.h3RuntimeMode !== settings.h3RuntimeMode ||
      previous.h3ComfyCompilerMode !== settings.h3ComfyCompilerMode;
    let updatedH3TaskCount = 0;
    const commitSettings = (state: AppState): void => {
      state.settings = settings;
      if (!h3AccelerationChanged) return;
      for (const task of state.queue) {
        if (!applyH3AccelerationSettingsToWaitingTask(task, settings)) continue;
        task.updatedAt = new Date().toISOString();
        updatedH3TaskCount += 1;
      }
    };

    if (mode === "migrate-storage" || (mode === "migrate-video-history" && this.deps.stateFile)) {
      if (!this.deps.stateFile) throw new Error(t(uiKeys.serviceError.migrationStateMissing));
      this.historyMigrationRunning = true;
      try {
        const changes = await validateMediaDirectories(previous, settings, this.deps.resolveComfyOutputDirectory);
        const next = await migrateStorageSettings({
          store: this.deps.store, stateFile: this.deps.stateFile, settings, changes,
          progress: this.deps.sendHistoryMigrationProgress, commit: commitSettings, sendState: this.deps.sendState
        });
        this.deps.clearRendererDirty();
        return next;
      } finally { this.historyMigrationRunning = false; }
    }

    if (shouldMigrate) {
      this.historyMigrationRunning = true;
      let preparation: PreparedVideoHistoryMigration | null = null;
      let stateCommitted = false;
      try {
        this.deps.sendHistoryMigrationProgress({
          phase: "scanning",
          current: 0,
          total: 0,
          message: t(uiKeys.serviceError.migrationScanning),
          migratedFiles: 0,
          warningCount: 0
        });
        const current = this.deps.store.get();
        const plan = await this.migration.plan(
          current.history,
          directories.oldDirectory,
          directories.newDirectory,
          current.queue,
          t
        );
        this.deps.sendHistoryMigrationProgress({
          phase: "scanning",
          current: 0,
          total: plan.entries.length,
          message: t(uiKeys.serviceError.migrationFound, { count: plan.entries.length }),
          migratedFiles: 0,
          warningCount: plan.missing.length + plan.conflicts.length
        });
        preparation = await this.migration.prepare(
          plan,
          this.deps.videoHistoryMigrationJournal,
          this.deps.sendHistoryMigrationProgress,
          t
        );
        this.deps.sendHistoryMigrationProgress({
          phase: "committing",
          current: plan.entries.length,
          total: plan.entries.length,
          message: t(uiKeys.serviceError.migrationCommitting),
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
          this.deps.sendHistoryMigrationProgress,
          t
        );
        this.deps.sendHistoryMigrationProgress({
          phase: "completed",
          current: plan.entries.length,
          total: plan.entries.length,
          message: warnings.length
            ? t(uiKeys.storageMigration.cleanupWarning)
            : t(uiKeys.storageMigration.complete),
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
    const t = createNativeTranslator(next.uiLocale).t;
    const oldDirectory = await this.effectiveVideoOutputDirectory(previous);
    const newDirectory = await this.effectiveVideoOutputDirectory(next);
    if (!newDirectory) {
      throw new Error(t(uiKeys.serviceError.outputDirectoryUnknown));
    }
    if (!oldDirectory || oldDirectory.toLowerCase() === newDirectory.toLowerCase()) {
      return { oldDirectory, newDirectory };
    }
    const outputRoot = await this.deps.resolveComfyOutputDirectory({
      ...previous,
      outputDirectory: ""
    }) || oldDirectory;
    if (!isPathWithinDirectory(outputRoot, newDirectory)) {
      throw new Error(t(uiKeys.serviceError.outputOutsideComfy));
    }
    return { oldDirectory, newDirectory };
  }

  private applyVideoMigrationPaths(
    state: AppState,
    plan: VideoHistoryMigrationPlan
  ): void {
    remapVideoMigrationConsumers(state, plan);
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
