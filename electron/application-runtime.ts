import type { AppState, HistoryMigrationProgress, Settings } from "../src/types.js";
import type { ImageInspectionPort } from "./ports/image-inspection.js";
import type { HistoryFileSystemPort } from "./ports/history-file-system.js";
import type { StateRepository } from "./ports/state-repository.js";
import type { AppLogger } from "../src/infrastructure/app-logger.js";
import {
  LifecycleCoordinator,
  type ExitInterruptionResult,
  type LifecycleCoordinatorDependencies
} from "./services/lifecycle-coordinator.js";
import {
  HistoryDestructiveService
} from "./services/history-destructive-service.js";
import { HistoryMetadataService } from "./services/history-metadata-service.js";
import { HistoryQueryService } from "./services/history-query-service.js";
import { MediaReadService } from "./services/media-read-service.js";
import { ImageDocumentService } from "./services/image-document-service.js";
import { DraftService } from "./services/draft-service.js";
import { SettingsService, type SettingsServiceDependencies } from "./services/settings-service.js";
import { EnvironmentQueryService } from "./services/environment-query-service.js";
import { PromptApplicationService } from "./services/prompt-application-service.js";
import { RuntimeAdminService } from "./services/runtime-admin-service.js";
import { QueueService } from "./services/queue-service.js";
import { ComfyOutputService } from "./services/comfy-output-service.js";
import { ImageAssetLibraryService } from "./services/image-asset-library-service.js";
import { PromptRuntimeManager } from "./services/prompt-runtime-manager.js";
import { HistoryArtifactService } from "./services/history-artifact-service.js";
import { NativeAvArtifactService } from "./services/native-av-artifact.js";
import {
  H3NativeAvArtifactCollector,
  nativeAvArtifactMetadataForTask
} from "./services/h3-native-av-collector.js";
import { nativeAvArtifactFileSystem } from "./services/native-av-artifact-file-system.js";
import { scanEnvironment } from "./services/environment.js";
import type { QueueRuntimeCapability } from "./ports/queue-runtime.js";
import type { NativeAvArtifactFileSystemPort } from "./ports/native-av-artifact-file-system.js";
import type { ComfyRuntimeStateController } from "../src/infrastructure/comfy-runtime-state.js";
import type { StudioEventBus } from "./services/studio-event-bus.js";
import type { StudioPaths } from "./services/studio-paths.js";

export interface HistoryApplicationServices {
  query: HistoryQueryService;
  metadata: HistoryMetadataService;
  destructive: HistoryDestructiveService;
  artifacts: HistoryArtifactService;
}

export interface ApplicationServices {
  draft: DraftService;
  settings: SettingsService;
  media: MediaReadService;
  imageDocument: ImageDocumentService;
  imageAssets: ImageAssetLibraryService;
  prompt: PromptApplicationService;
  lifecycle: LifecycleCoordinator;
  environment: {
    query: EnvironmentQueryService;
    admin: RuntimeAdminService;
  };
  history: HistoryApplicationServices;
}

export type ApplicationRuntimeQueueDependencies = {
  runtime: QueueRuntimeCapability;
};

export type ApplicationRuntimeSettingsDependencies = Pick<
  SettingsServiceDependencies,
  | "videoHistoryMigrationJournal"
  | "resolveComfyOutputDirectory"
  | "clearRendererDirty"
>;

export type ApplicationRuntimeLifecycleDependencies = Pick<
  LifecycleCoordinatorDependencies,
  | "interruptComfy"
  | "freeMemory"
  | "forceStopComfyProcesses"
  | "alignRuntimeProfile"
  | "isLocalComfyUrl"
>;

export interface ApplicationRuntimeDependencies {
  paths: StudioPaths;
  store: StateRepository;
  events: StudioEventBus;
  logger: AppLogger;
  runtimeState: ComfyRuntimeStateController;
  promptRuntimeManager: PromptRuntimeManager;
  historyFileSystem: HistoryFileSystemPort;
  nativeAvArtifactFileSystem?: NativeAvArtifactFileSystemPort;
  imageInspection: ImageInspectionPort;
  sendState(state: AppState): void;
  errorMeta(error: unknown): Record<string, unknown>;
  waitForWorker(worker: Promise<unknown> | null, timeoutMs: number): Promise<boolean>;
  settings: ApplicationRuntimeSettingsDependencies;
  queue: ApplicationRuntimeQueueDependencies;
  lifecycle: ApplicationRuntimeLifecycleDependencies;
}

export interface ApplicationRuntimeContext {
  readonly paths: StudioPaths;
  readonly store: StateRepository;
  readonly events: StudioEventBus;
  readonly queue: QueueService;
  readonly services: ApplicationServices;
}

export interface ApplicationRuntimeStartHooks {
  /**
   * Electron adapters register after state loading and service composition,
   * before history restoration and lifecycle runtime alignment.
   */
  onServicesReady?(context: ApplicationRuntimeContext): void | Promise<void>;
}

/**
 * Embedded application composition for Local Video Studio.
 *
 * This module only assembles application services and injected ports. It has
 * no Electron, window shell, instance-lock, signal, daemon, or HTTP policy.
 */
export class ApplicationRuntime {
  private context: ApplicationRuntimeContext | null = null;
  private startPromise: Promise<ApplicationRuntimeContext> | null = null;
  private initialStateReadyPromise: Promise<void> | null = null;

  constructor(private readonly deps: ApplicationRuntimeDependencies) {}

  get servicesOrNull(): ApplicationServices | null {
    return this.context?.services ?? null;
  }

  get services(): ApplicationServices {
    return this.requireContext().services;
  }

  get queue(): QueueService {
    return this.requireContext().queue;
  }

  /**
   * IPC can be registered as soon as the service graph exists, but renderer
   * state reads remain behind the one-time history/path-repair barrier.
   */
  waitForInitialState(): Promise<void> {
    if (this.initialStateReadyPromise) return this.initialStateReadyPromise;
    if (this.context) return Promise.resolve();
    return this.startPromise?.then(() => undefined) ?? Promise.reject(
      new Error("Application runtime startup has not begun")
    );
  }

  async start(
    hooks: ApplicationRuntimeStartHooks = {}
  ): Promise<ApplicationRuntimeContext> {
    if (this.context) return this.context;
    if (this.startPromise) return this.startPromise;
    const operation = this.startImpl(hooks);
    this.startPromise = operation;
    try {
      return await operation;
    } finally {
      if (this.startPromise === operation) this.startPromise = null;
    }
  }

  interruptForExit(
    waitForWorker: boolean,
    queueCleanupOnly = false
  ): Promise<ExitInterruptionResult> {
    return this.requireContext().services.lifecycle.interruptForExit(
      waitForWorker,
      queueCleanupOnly
    );
  }

  async stop(): Promise<{ ok: boolean; message: string }> {
    const pendingStart = this.startPromise;
    if (pendingStart) await pendingStart.catch(() => undefined);
    const context = this.context;
    if (!context) {
      return { ok: true, message: "Application runtime was not initialized" };
    }
    return context.services.lifecycle.stopOwnedRuntime(context.store.get().settings);
  }

  private async startImpl(
    hooks: ApplicationRuntimeStartHooks
  ): Promise<ApplicationRuntimeContext> {
    await this.deps.store.load();

    const draftService = new DraftService({
      store: this.deps.store,
      sendState: this.deps.sendState
    });
    const settingsService = new SettingsService({
      store: this.deps.store,
      logger: this.deps.logger,
      videoHistoryMigrationJournal: this.deps.settings.videoHistoryMigrationJournal,
      resolveComfyOutputDirectory: this.deps.settings.resolveComfyOutputDirectory,
      sendState: this.deps.sendState,
      sendHistoryMigrationProgress: (progress: HistoryMigrationProgress) => {
        this.deps.events.publish("history-migration:progress", progress);
      },
      clearRendererDirty: this.deps.settings.clearRendererDirty
    });
    await settingsService.materializeDefaultImageInputLibraryDirectory();
    const imageAssetLibraryService = new ImageAssetLibraryService({
      store: this.deps.store,
      logger: this.deps.logger,
      events: this.deps.events,
      resolveLibraryDirectory: (settings) =>
        settingsService.effectiveImageInputLibraryDirectory(settings),
      sendState: this.deps.sendState
    });
    const loadedState = this.deps.store.get();
    this.deps.logger.info("app", "state-loaded", "Application state loaded", {
      queueCount: loadedState.queue.length,
      historyCount: loadedState.history.length,
      queueRunning: loadedState.queueRunning
    });

    let queueService: QueueService | null = null;
    const activeQueueService = (): QueueService => {
      if (!queueService) throw new Error("Queue service is not initialized");
      return queueService;
    };
    const promptService = new PromptApplicationService({
      store: this.deps.store,
      logger: this.deps.logger,
      promptRuntimeManager: this.deps.promptRuntimeManager,
      isQueueBusy: () => Boolean(
        this.deps.store.get().queueRunning ||
        activeQueueService().activeController ||
        activeQueueService().runningWorker
      ),
      sendProgress: (progress) => this.deps.events.publish("prompt:progress", progress),
      errorMeta: this.deps.errorMeta
    });

    const comfyOutputService = new ComfyOutputService({
      store: this.deps.store,
      fileSystem: this.deps.historyFileSystem,
      resolveComfyOutputDirectory: this.deps.settings.resolveComfyOutputDirectory
    });
    const historyQuery = new HistoryQueryService({
      store: this.deps.store,
      logger: this.deps.logger,
      paths: this.deps.paths,
      fileSystem: this.deps.historyFileSystem,
      resolveTaskOutputDirectory: () => comfyOutputService.resolveTaskOutputDirectory()
    });
    const nativeAvArtifactService = new NativeAvArtifactService({
      fileSystem: this.deps.nativeAvArtifactFileSystem ?? nativeAvArtifactFileSystem
    });
    const nativeAvArtifactCollector = new H3NativeAvArtifactCollector(nativeAvArtifactService);
    const historyArtifactService = new HistoryArtifactService({
      store: this.deps.store,
      artifactService: nativeAvArtifactService,
      resolveVideoOutputDirectory: () => comfyOutputService.resolveTaskOutputDirectory()
    });
    const environmentQuery = new EnvironmentQueryService({
      logger: this.deps.logger,
      errorMeta: this.deps.errorMeta,
      scanEnvironment: (settings, scope) => scanEnvironment(settings, scope)
    });
    const mediaReadService = new MediaReadService({
      store: this.deps.store,
      historyQuery
    });
    const imageDocumentService = new ImageDocumentService({
      paths: this.deps.paths,
      fileSystem: this.deps.historyFileSystem
    });
    queueService = new QueueService({
      store: this.deps.store,
      logger: this.deps.logger,
      sendState: this.deps.sendState,
      sendPreview: (payload) => this.deps.events.publish("task:preview", payload),
      queueRuntime: this.deps.queue.runtime,
      resolveTaskOutputDirectory: () => comfyOutputService.resolveTaskOutputDirectory(),
      requireExistingImageOutput: (result, outputRoot, alternateRoots) =>
        comfyOutputService.requireExistingImageOutput(result, outputRoot, alternateRoots),
      requireExistingVideoOutput: (result, alternateRoots) =>
        comfyOutputService.requireExistingVideoOutput(result, alternateRoots),
      commitH3NativeAvOutput: async (result, serializerNodeId, task, completedAt) => {
        const outputDirectory = await comfyOutputService.resolveTaskOutputDirectory();
        return nativeAvArtifactCollector.commitCompletion(
          result,
          serializerNodeId,
          nativeAvArtifactMetadataForTask(
            task,
            outputDirectory,
            completedAt
          )
        );
      },
      releasePromptRuntime: (settings) => promptService.releaseRuntime(settings),
      nativePromptBusy: () => promptService.isWorkerBusy(),
      effectiveImageInputLibraryDirectory: (settings) =>
        settingsService.effectiveImageInputLibraryDirectory(settings),
      imageInspection: this.deps.imageInspection,
      errorMeta: this.deps.errorMeta,
      taskStageStartedAt: new Map()
    });
    const runtimeAdmin = new RuntimeAdminService({
      store: this.deps.store,
      logger: this.deps.logger,
      runtimeState: this.deps.runtimeState,
      isGenerationBusy: () => Boolean(
        this.deps.store.get().queueRunning ||
        activeQueueService().activeController ||
        activeQueueService().runningWorker
      ),
      isQueueWorkerRunning: () => Boolean(activeQueueService().runningWorker),
      isPromptControllerActive: () => Boolean(promptService.activeController),
      isPromptBusy: () => promptService.isPromptBusy(),
      getQueueWorker: () => activeQueueService().runningWorker,
      abortQueue: (reason) => activeQueueService().abort(reason),
      abortPrompt: (reason) => promptService.abort(reason),
      interruptComfy: this.deps.lifecycle.interruptComfy,
      sendState: this.deps.sendState,
      waitForWorker: this.deps.waitForWorker,
      errorMeta: this.deps.errorMeta
    });
    const lifecycleService = new LifecycleCoordinator({
      store: this.deps.store,
      logger: this.deps.logger,
      runtimeState: this.deps.runtimeState,
      getQueue: () => activeQueueService(),
      prompt: promptService,
      sendState: this.deps.sendState,
      ...this.deps.lifecycle
    });
    const historyMetadataService = new HistoryMetadataService({
      store: this.deps.store,
      logger: this.deps.logger,
      sendState: this.deps.sendState
    });
    const historyDestructiveService = new HistoryDestructiveService({
      store: this.deps.store,
      logger: this.deps.logger,
      sendState: this.deps.sendState,
      fileSystem: this.deps.historyFileSystem,
      resolveHistoryFile: (file, settings) => historyQuery.resolveHistoryFile(file, settings),
      coverCacheKeysForHistoryItem: (item) => historyQuery.coverCacheKeysForHistoryItem(item),
      coverCacheKeyForVideoVersion: (asset, version) =>
        historyQuery.coverCacheKeyForVideoVersion(asset, version),
      coverCacheKeyForImageVersion: (project, version) =>
        historyQuery.coverCacheKeyForImageVersion(project, version),
      removeCoverCacheKeys: (keys) => historyQuery.removeCoverCacheKeys(keys),
      errorMeta: this.deps.errorMeta
    });
    const services: ApplicationServices = {
      draft: draftService,
      settings: settingsService,
      media: mediaReadService,
      imageDocument: imageDocumentService,
      imageAssets: imageAssetLibraryService,
      prompt: promptService,
      lifecycle: lifecycleService,
      environment: {
        query: environmentQuery,
        admin: runtimeAdmin
      },
      history: {
        query: historyQuery,
        metadata: historyMetadataService,
        destructive: historyDestructiveService,
        artifacts: historyArtifactService
      }
    };
    const context: ApplicationRuntimeContext = {
      paths: this.deps.paths,
      store: this.deps.store,
      events: this.deps.events,
      queue: queueService,
      services
    };
    this.context = context;

    let resolveInitialState!: () => void;
    let rejectInitialState!: (reason?: unknown) => void;
    const initialStateReadyPromise = new Promise<void>((resolve, reject) => {
      resolveInitialState = resolve;
      rejectInitialState = reject;
    });
    this.initialStateReadyPromise = initialStateReadyPromise;
    // The startup operation also observes this promise below. Keep the
    // rejected barrier handled when no renderer state request was made.
    void initialStateReadyPromise.catch(() => undefined);

    let adaptersReady = false;
    try {
      await hooks.onServicesReady?.(context);
      adaptersReady = true;
      this.deps.logger.info(
        "app",
        "history-restore-started",
        "History output path restoration started"
      );
      await historyQuery.restoreHistoryOutputPaths();
      await historyQuery.restoreHistoryFileSizes();
      this.deps.logger.info(
        "app",
        "history-restore-settled",
        "History output path restoration settled"
      );
      const readyState = this.deps.store.get();
      this.deps.logger.info(
        "app",
        "initial-state-ready",
        "Initial application state is ready for renderer reads",
        {
          queueCount: readyState.queue.length,
          historyCount: readyState.history.length
        }
      );
      resolveInitialState();
      this.deps.logger.info(
        "app",
        "startup-background-started",
        "Startup background alignment started"
      );
      await lifecycleService.start(this.deps.store.get().settings);
      this.deps.logger.info(
        "app",
        "startup-background-settled",
        "Startup background alignment settled"
      );
      return context;
    } catch (error) {
      rejectInitialState(error);
      // Once the Electron adapters have been registered, keep the context so
      // a visible window can still run the normal lifecycle cleanup path
      // after a startup-stage failure.
      if (!adaptersReady && this.context === context) this.context = null;
      throw error;
    }
  }

  private requireContext(): ApplicationRuntimeContext {
    if (!this.context) throw new Error("Application runtime is not initialized");
    return this.context;
  }
}
