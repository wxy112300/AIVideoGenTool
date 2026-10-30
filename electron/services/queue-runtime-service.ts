import { createNativeTranslator } from "../ui-translator.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
import type {
  AppState,
  ConnectionResult,
  EnvironmentScanResult,
  EnvironmentScanScope,
  H3VideoVaeBackend,
  PerformanceMetrics,
  QueueTask,
  Settings
} from "../../src/types.js";
import {
  h3VideoVaeAvailabilityFromModelProfiles,
  resolveH3VideoVaeMode
} from "../../src/core/h3-video-vae.js";
import { AETHERSCALE_MODEL_ID } from "../../src/core/aetherscale.js";
import {
  cleanupCancelledQueueTask,
  type QueueRecoveryDependencies
} from "../queue-recovery.js";
import type { StateRepository } from "../ports/state-repository.js";
import type { QueueRuntimeCapability } from "../ports/queue-runtime.js";
import type { ComfyRuntimeStateController } from "../../src/infrastructure/comfy-runtime-state.js";
import { safeLogErrorMessage, type AppLogger } from "../../src/infrastructure/app-logger.js";
import type { QueueIsolationReason } from "./queue-execution-side-effects.js";
import { terminateAetherScaleWorker } from "./aetherscale-runtime.js";
import type { ComfyRuntimeMemory } from "./comfy-runtime-memory.js";

export interface QueueRuntimeProfileAlignmentResult {
  ok: boolean;
  restarted: boolean;
  desiredProfile: string;
  previousProfile: string;
  message: string;
}

export interface QueueRuntimeServiceDependencies {
  store: StateRepository;
  logger: AppLogger;
  runtimeState: Pick<ComfyRuntimeStateController, "snapshot" | "waitForSettled">;
  updateTask(taskId: string, patch: Partial<QueueTask>): Promise<AppState>;
  isLocalComfyUrl(value: string): boolean;
  alignRuntimeProfile(settings: Settings): Promise<QueueRuntimeProfileAlignmentResult>;
  testComfyUi(settings: Settings): Promise<string>;
  startLocalService(
    kind: "comfy",
    settings: Settings,
    signal?: AbortSignal
  ): Promise<ConnectionResult>;
  forceStopComfyProcesses(settings: Settings): Promise<ConnectionResult>;
  restartLocalService(kind: "comfy", settings: Settings): Promise<ConnectionResult>;
  freeMemory(settings: Settings): Promise<void>;
  getPerformanceMetrics(settings: Settings): Promise<PerformanceMetrics>;
  readComfyRuntimeMemory(settings: Settings): Promise<ComfyRuntimeMemory | null>;
  scanEnvironment(
    settings: Settings,
    scope: EnvironmentScanScope
  ): Promise<EnvironmentScanResult>;
  settingsForTask(task: QueueTask | undefined, settings: Settings): Settings;
  sleep?(milliseconds: number): Promise<void>;
}

const defaultSleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export class QueueRuntimeService implements QueueRuntimeCapability {
  constructor(private readonly deps: QueueRuntimeServiceDependencies) {}

  settingsForTask(task: QueueTask | undefined, settings: Settings): Settings {
    return this.deps.settingsForTask(task, settings);
  }

  async ensureComfyUiReady(taskId: string, signal?: AbortSignal): Promise<void> {
    const throwIfCancelled = (): void => {
      if (!signal?.aborted) return;
      throw signal.reason instanceof Error ? signal.reason : new Error(createNativeTranslator(this.deps.store.get().settings.uiLocale).t(uiKeys.runtimeService.queueCancelled));
    };
    throwIfCancelled();
    const settings = this.deps.store.get().settings;
    const t = createNativeTranslator(settings.uiLocale).t;
    const queuedTask = this.deps.store.get().queue.find((item) => item.id === taskId);
    const serviceSettings = this.settingsForTask(queuedTask, settings);
    let profile: QueueRuntimeProfileAlignmentResult;
    try {
      profile = await this.deps.alignRuntimeProfile(serviceSettings);
    } catch (error) {
      throwIfCancelled();
      throw error;
    }
    throwIfCancelled();
    if (!profile.ok) {
      throw new Error(t(uiKeys.runtimeService.profileFailed, { message: profile.message }));
    }
    if (profile.restarted) {
      this.deps.logger.info("service", "runtime-profile-aligned", "ComfyUI runtime profile was aligned for the queue task", {
        taskId,
        taskType: queuedTask?.taskType ?? "unknown",
        modelId: queuedTask?.modelId ?? "unknown",
        previousProfile: profile.previousProfile,
        desiredProfile: profile.desiredProfile
      });
    }
    try {
      await this.deps.testComfyUi(serviceSettings);
      throwIfCancelled();
      return;
    } catch (connectionError) {
      this.deps.logger.warn("service", "connection-unavailable", "ComfyUI was not ready", {
        taskId,
        local: this.deps.isLocalComfyUrl(settings.comfyUrl),
        error: safeLogErrorMessage(connectionError)
      });
      if (!this.deps.isLocalComfyUrl(settings.comfyUrl)) {
        throw new Error(
          t(uiKeys.runtimeService.connectionFailed, { url: settings.comfyUrl, message: connectionError instanceof Error
              ? connectionError.message
              : String(connectionError)
          })
        );
      }
    }

    throwIfCancelled();
    await this.deps.updateTask(taskId, {
      progress: 1,
      stage: t(uiKeys.runtimeService.starting)
    });
    this.deps.logger.info("service", "auto-start-requested", "Queue requested automatic ComfyUI startup", {
      taskId
    });
    const started = await this.deps.startLocalService("comfy", serviceSettings, signal);
    this.deps.logger.info(
      "service",
      started.ok ? "auto-start-succeeded" : "auto-start-failed",
      started.message,
      { taskId, ok: started.ok }
    );
    if (!started.ok) {
      throw new Error(t(uiKeys.runtimeService.autoStartFailed, { message: started.message }));
    }
    throwIfCancelled();
    await this.deps.testComfyUi(serviceSettings);
  }

  async stabilizeH3RuntimeBetweenTasks(
    taskId: string,
    modelId: string,
    settings: Settings,
    hasVideoLoras: boolean,
    queueWillContinue: boolean
  ): Promise<boolean> {
    if (!queueWillContinue && this.deps.isLocalComfyUrl(settings.comfyUrl)) {
      this.deps.logger.info("comfy", "h3-release-deferred-to-queue-stop", "The queue will not continue; runtime cleanup is deferred to queue shutdown", {
        taskId,
        modelId,
        hasVideoLoras
      });
      return true;
    }
    if (hasVideoLoras) {
      this.deps.logger.info("comfy", "h3-lora-release-started", "H3 LoRA task will use API memory release independently from queue process isolation", {
        taskId,
        modelId
      });
    }

    const gib = 1024 ** 3;
    const before = await this.deps.getPerformanceMetrics(settings).catch(() => null);
    this.deps.logger.info("comfy", "h3-release-started", "Releasing H3 runtime before the next queue task", {
      taskId,
      modelId,
      hasVideoLoras,
      vramUsedBytes: before?.vramUsedBytes ?? null,
      vramTotalBytes: before?.vramTotalBytes ?? null
    });

    const waitForIdleRelease = async (requiredSamples: number) => {
      const deadline = Date.now() + 20_000;
      let stableSamples = 0;
      let lastSample = before;
      let processMemory: ComfyRuntimeMemory | null = null;
      let highProcessSamples = 0;
      let unknownSamples = 0;
      for (let attempt = 0; attempt < 20 && Date.now() < deadline; attempt++) {
        await (this.deps.sleep?.(1_000) ?? defaultSleep(1_000));
        const [sample, memory] = await Promise.all([
          this.deps.getPerformanceMetrics(settings).catch(() => null),
          this.deps.readComfyRuntimeMemory(settings).catch(() => null)
        ]);
        if (sample) lastSample = sample;
        processMemory = memory;
        const processIdle = memory?.devices.every(device => device.allocatedBytes <= Math.min(5 * gib, device.totalBytes * 0.2));
        const adapterIdle = sample?.vramUsedBytes != null && sample.vramTotalBytes != null && sample.vramTotalBytes > 0 &&
          sample.vramUsedBytes <= Math.min(5 * gib, sample.vramTotalBytes * 0.2) && (sample.gpuPercent == null || sample.gpuPercent < 10);
        // Unknown process telemetry cannot turn another application's VRAM into
        // evidence of a ComfyUI leak. Low adapter usage remains a legacy fallback.
        stableSamples = (processIdle ?? adapterIdle) ? stableSamples + 1 : 0;
        highProcessSamples = processIdle === false ? highProcessSamples + 1 : 0;
        unknownSamples = memory ? 0 : unknownSamples + 1;
        if (stableSamples >= requiredSamples) {
          return { verified: true, lastSample, idleVramLimit: sample?.vramTotalBytes ? Math.min(5 * gib, sample.vramTotalBytes * 0.2) : null, processMemory, processLeak: false };
        }
        if (unknownSamples >= 3) break;
      }
      const idleVramLimit = lastSample?.vramTotalBytes
        ? Math.min(5 * gib, lastSample.vramTotalBytes * 0.2)
        : null;
      return { verified: false, lastSample, idleVramLimit, processMemory, processLeak: highProcessSamples >= 2 };
    };

    const requestRelease = async (phase: "initial" | "lora-final") => {
      try {
        await this.deps.freeMemory(settings);
        return true;
      } catch (error) {
        this.deps.logger.warn("comfy", "h3-release-request-failed", "H3 runtime release request failed; restarting ComfyUI", {
          taskId,
          modelId,
          phase,
          error: safeLogErrorMessage(error)
        });
        return false;
      }
    };

    let release = await requestRelease("initial");
    let result = release
      ? await waitForIdleRelease(2)
      : { verified: false, lastSample: before, idleVramLimit: null, processMemory: null, processLeak: false };
    if (result.verified && hasVideoLoras) {
      release = await requestRelease("lora-final");
      result = release
        ? await waitForIdleRelease(3)
        : { verified: false, lastSample: result.lastSample, idleVramLimit: result.idleVramLimit, processMemory: null, processLeak: false };
    }

    if (result.verified) {
      this.deps.logger.info("comfy", "h3-release-verified", "H3 runtime release was verified before continuing the queue", {
        taskId,
        modelId,
        hasVideoLoras,
        releasePhases: hasVideoLoras ? 2 : 1,
        vramBeforeBytes: before?.vramUsedBytes ?? null,
        vramAfterBytes: result.lastSample?.vramUsedBytes ?? null,
        vramTotalBytes: result.lastSample?.vramTotalBytes ?? null,
        idleVramLimitBytes: result.idleVramLimit,
        gpuPercent: result.lastSample?.gpuPercent ?? null
      });
      return true;
    }

    if (release && !result.processLeak) {
      this.deps.logger.warn("comfy", "h3-release-telemetry-unavailable", "ComfyUI accepted model unload; adapter-wide usage cannot establish a process leak, continuing without an unrequested restart", {
        taskId, modelId, hasVideoLoras, vramUsedBytes: result.lastSample?.vramUsedBytes ?? null
      });
      return true;
    }

    this.deps.logger.warn("comfy", "h3-release-unverified", "H3 VRAM did not reach a safe idle level; applying endpoint-appropriate recovery", {
      taskId,
      modelId,
      hasVideoLoras,
      processMemory: result.processMemory,
      vramBeforeBytes: before?.vramUsedBytes ?? null,
      vramAfterBytes: result.lastSample?.vramUsedBytes ?? null,
      vramTotalBytes: result.lastSample?.vramTotalBytes ?? null,
      idleVramLimitBytes: result.idleVramLimit,
      gpuPercent: result.lastSample?.gpuPercent ?? null
    });
    if (!this.deps.isLocalComfyUrl(settings.comfyUrl)) {
      this.deps.logger.error("comfy", "h3-remote-release-failed", "Remote ComfyUI memory release could not be verified; stopping the application queue without process management", {
        taskId,
        modelId
      });
      return false;
    }
    const recovery = await this.deps.restartLocalService("comfy", settings).catch((error) => ({
      ok: false,
      message: safeLogErrorMessage(error)
    }));
    this.deps.logger.info("comfy", recovery.ok ? "h3-release-restart-succeeded" : "h3-release-restart-failed", recovery.message, {
      taskId,
      modelId,
      recoveryOk: recovery.ok
    });
    return recovery.ok;
  }

  async stopQueueRuntime(settings: Settings): Promise<boolean> {
    if (!this.deps.isLocalComfyUrl(settings.comfyUrl)) {
      this.deps.logger.info("comfy", "queue-runtime-stop-skipped", "Remote ComfyUI remains connection-only when the queue stops");
      return true;
    }
    const stopped = await this.deps.forceStopComfyProcesses(settings).catch((error) => ({
      ok: false,
      message: safeLogErrorMessage(error)
    }));
    this.deps.logger.info(
      "comfy",
      stopped.ok ? "queue-runtime-stop-succeeded" : "queue-runtime-stop-failed",
      stopped.message,
      { ok: stopped.ok }
    );
    return stopped.ok;
  }

  restartQueueRuntime(settings: Settings): Promise<{ ok: boolean; message: string }> {
    if (!this.deps.isLocalComfyUrl(settings.comfyUrl)) {
      return Promise.resolve({ ok: false, message: createNativeTranslator(settings.uiLocale).t(uiKeys.runtimeService.remoteNoRestart) });
    }
    return this.deps.restartLocalService("comfy", settings);
  }

  async prepareQueueRuntimeForTask(
    taskId: string,
    modelId: string,
    settings: Settings,
    reason: QueueIsolationReason
  ): Promise<boolean> {
    if (!this.deps.isLocalComfyUrl(settings.comfyUrl)) {
      this.deps.logger.warn("comfy", "queue-isolation-restart-skipped", "Remote ComfyUI remains connection-only at the requested queue isolation boundary", {
        taskId,
        modelId,
        reason
      });
      return true;
    }
    this.deps.logger.info("comfy", "queue-isolation-restart-started", "Restarting ComfyUI at a queue isolation boundary", {
      taskId,
      modelId,
      reason
    });
    const recovery = await this.deps.restartLocalService("comfy", settings);
    this.deps.logger.info(
      "comfy",
      recovery.ok ? "queue-isolation-restart-succeeded" : "queue-isolation-restart-failed",
      recovery.message,
      { taskId, modelId, reason, recoveryOk: recovery.ok }
    );
    return recovery.ok;
  }

  async resolveH3VideoVaeModeForTask(
    _task: QueueTask,
    settings: Settings
  ): Promise<H3VideoVaeBackend | null> {
    // The dependency-scoped scan reuses the latest file inventory when one is
    // available, while still falling back to a full scan on a cold start or
    // after the selected ComfyUI/model paths change.
    const scan = await this.deps.scanEnvironment(settings, "dependencies");
    return resolveH3VideoVaeMode(
      settings.h3VideoVaeMode,
      h3VideoVaeAvailabilityFromModelProfiles(scan.modelProfiles)
    );
  }

  cleanupCancelledTask(
    taskId: string,
    settings: Settings,
    worker: Promise<void> | null
  ): Promise<void> {
    const recoveryDependencies: Pick<
      QueueRecoveryDependencies,
      "logger" | "updateTask" | "getComfyRuntimeState" |
      "waitForComfyRuntimeSettled" | "hasSubmittedPrompt" | "getSubmittedPromptId" |
      "restartComfyUi" | "stopComfyRuntime" | "isCancellationCurrent"
      | "isAetherScaleTask" | "terminateAetherScaleWorker"
    > = {
      logger: this.deps.logger,
      updateTask: this.deps.updateTask,
      getComfyRuntimeState: () => this.deps.runtimeState.snapshot(),
      waitForComfyRuntimeSettled: (timeoutMs) => this.deps.runtimeState.waitForSettled(timeoutMs),
      hasSubmittedPrompt: (currentTaskId) => Boolean(
        this.deps.store.get().queue.find((item) => item.id === currentTaskId)?.comfyPromptId
      ),
      getSubmittedPromptId: (currentTaskId) =>
        this.deps.store.get().queue.find((item) => item.id === currentTaskId)?.comfyPromptId,
      stopComfyRuntime: async (currentSettings) => {
        if (!this.deps.isLocalComfyUrl(currentSettings.comfyUrl)) return false;
        const stopped = await this.deps.forceStopComfyProcesses(currentSettings);
        if (!stopped.ok) throw new Error(stopped.message);
        return true;
      },
      restartComfyUi: async (kind, currentSettings) => {
        if (!this.deps.isLocalComfyUrl(currentSettings.comfyUrl)) {
          return { ok: false, message: createNativeTranslator(currentSettings.uiLocale).t(uiKeys.runtimeService.remoteNoRestart) };
        }
        return this.deps.restartLocalService(kind, currentSettings);
      },
      isCancellationCurrent: (currentTaskId) => {
        const current = this.deps.store.get();
        const task = current.queue.find((item) => item.id === currentTaskId);
        return current.queueLifecycleTaskId === currentTaskId &&
          (current.queueLifecycle === "cancelling" || current.queueLifecycle === "cleaning") &&
          task?.status === "cancelled";
      },
      isAetherScaleTask: (currentTaskId) =>
        this.deps.store.get().queue.find((item) => item.id === currentTaskId)?.modelId === AETHERSCALE_MODEL_ID,
      terminateAetherScaleWorker: async (currentTaskId, currentSettings) => {
        const task = this.deps.store.get().queue.find((item) => item.id === currentTaskId);
        if (task?.modelId !== AETHERSCALE_MODEL_ID) {
          return { ok: true, message: createNativeTranslator(currentSettings.uiLocale).t(uiKeys.runtimeService.notAetherScale) };
        }
        const scan = await this.deps.scanEnvironment(currentSettings, "dependencies");
        const nodeDirectory = scan.customNodes.find((node) => node.id === "comfyui-aetherscale")?.directory ?? "";
        if (!scan.comfyRoot || !nodeDirectory) {
          return {
            ok: false,
            verified: false,
            message: createNativeTranslator(currentSettings.uiLocale).t(uiKeys.runtimeService.aetherScaleNodeMissing)
          };
        }
        return terminateAetherScaleWorker(scan.comfyRoot, nodeDirectory, undefined, createNativeTranslator(currentSettings.uiLocale).t);
      }
    };
    return cleanupCancelledQueueTask(recoveryDependencies, taskId, settings, worker);
  }
}
