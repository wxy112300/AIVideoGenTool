import type { AppState, HistoryFile, ImageGenerationQueueTask, QueueLifecycle, QueueTask, Settings, TaskPerformanceStats, TaskPreview } from "../src/types.js";
import { isImageGenerationQueueTask } from "../src/core/queue.js";
import { isVideoOutputFilename } from "../src/core/comfy-output.js";
import { imageOutputFormatFromFilename } from "../src/core/image-workflow.js";
import {
  activityTimeoutMinutesForTask,
  extensionSafetyForTask,
  generationSafetyForTask,
  isMiniMaxH3Fl2vaModel,
  isMiniMaxH3Model,
  isMiniMaxH3R2vModel
} from "../src/core/workflow.js";
import { hashImageFile } from "./services/image-asset-library.js";
import {
  freeMemory,
  submitImageTask,
  submitTask,
  TaskStalledError,
  waitForTask
} from "./services/comfy-ui.js";
import { finalizeExtensionOutput } from "./services/extension-media.js";
import { startTaskPerformanceMonitor, type TaskPerformanceMonitor } from "./services/performance.js";
import { startAdaptiveVramWatchdog, type VramWatchdogMonitor } from "./services/vram-watchdog.js";
import { safeLogErrorMessage, type AppLogger } from "./services/app-logger.js";
import type { JsonStore } from "./store.js";
import { persistImageHistoryResult, persistVideoHistoryResult } from "./queue-history.js";
import { recoverQueueFailure } from "./queue-recovery.js";
import type { QueueWorkerController } from "./queue-worker.js";

const performanceLogIntervalMs = 30_000;

export interface QueueExecutorDependencies {
  store: JsonStore;
  logger: AppLogger;
  worker: QueueWorkerController;
  sendState(state: AppState): void;
  sendPreview(payload: TaskPreview): void;
  setQueueLifecycle(lifecycle: QueueLifecycle, taskId?: string): Promise<AppState>;
  updateTask(taskId: string, patch: Partial<QueueTask>): Promise<AppState>;
  ensureComfyUiReady(taskId: string, signal?: AbortSignal): Promise<void>;
  resolveTaskOutputDirectory(): Promise<string>;
  requireExistingImageOutput(result: unknown, outputRoot: string, alternateRoots?: string[]): Promise<HistoryFile[]>;
  requireExistingVideoOutput(result: unknown, alternateRoots?: string[]): Promise<HistoryFile[]>;
  releasePromptRuntime(settings: Settings): Promise<number>;
  stabilizeH3RuntimeBetweenTasks(taskId: string, modelId: string, settings: Settings): Promise<boolean>;
  settingsForTask(task: QueueTask | undefined, settings: Settings): Settings;
  errorMeta(error: unknown): Record<string, unknown>;
  taskStageStartedAt: Map<string, { stage: string; startedAt: number }>;
}

export function createQueueExecutor(deps: QueueExecutorDependencies): () => Promise<void> {
  const {
    store,
    logger,
    worker: queueWorkerController,
    sendState,
    sendPreview,
    setQueueLifecycle,
    updateTask,
    ensureComfyUiReady,
    resolveTaskOutputDirectory,
    requireExistingImageOutput,
    requireExistingVideoOutput,
    releasePromptRuntime,
    stabilizeH3RuntimeBetweenTasks,
    settingsForTask: comfyUiSettingsForQueueTask,
    errorMeta: errorLogMeta,
    taskStageStartedAt
  } = deps;

  async function executeImageGenerationQueueTask(
    task: ImageGenerationQueueTask
  ): Promise<void> {
    const controller = queueWorkerController.beginTask();
    const taskStartedAt = Date.now();
    logger.info("queue", "task-started", "Image batch task execution started", {
      taskId: task.id,
      taskType: task.taskType,
      modelId: task.modelId,
      runCount: task.runs.length,
      outputCount: task.outputCount,
      qualityProfile: task.qualityProfile,
      outputFormat: task.outputFormat
    });
    try {
      await updateTask(task.id, {
        status: "running",
        progress: 1,
        stage: "准备图片批次",
        startedAt: new Date().toISOString(),
        error: undefined
      });
      await ensureComfyUiReady(task.id, controller.signal);
      const totalRuns = Math.max(1, task.runs.length);
      for (const plannedRun of task.runs) {
        const current = store.get().queue.find((item) => item.id === task.id);
        if (!current || !isImageGenerationQueueTask(current)) return;
        const run = current.runs.find((item) => item.id === plannedRun.id);
        if (!run || run.status === "completed") continue;
        const runStartedAt = new Date().toISOString();
        await store.update((state) => {
          const queued = state.queue.find((item) => item.id === task.id);
          if (!queued || !isImageGenerationQueueTask(queued)) return;
          const queuedRun = queued.runs.find((item) => item.id === run.id);
          if (!queuedRun) return;
          queuedRun.status = "running";
          queuedRun.startedAt = runStartedAt;
          queuedRun.progress = 1;
          queued.stage = `生成第 ${run.index + 1} / ${totalRuns} 张`;
        });
        sendState(store.get());
        const monitor = startTaskPerformanceMonitor();
        try {
          const submitted = await submitImageTask(
            current,
            { ...run, status: "running" },
            store.get().settings,
            controller.signal
          );
          let lastProgress = -1;
          const result = await waitForTask(
            submitted.promptId,
            submitted.clientId,
            submitted.nodeTypes,
            store.get().settings,
            20,
            controller.signal,
            (progress, stage) => {
              const batchProgress = ((run.index + Math.max(0, progress) / 100) / totalRuns) * 100;
              if (Math.round(batchProgress) < lastProgress + 2 && progress < 100) return;
              lastProgress = Math.round(batchProgress);
              void updateTask(task.id, {
                progress: Math.min(99, batchProgress),
                stage: `第 ${run.index + 1} / ${totalRuns} 张 · ${stage}`
              });
            },
            (dataUrl, source, metadata) => {
              sendPreview({
                taskId: task.id,
                dataUrl,
                source,
                ...metadata
              });
            },
            () => true,
            { taskId: task.id, modelId: task.modelId }
          );
          const files = await requireExistingImageOutput(
            result,
            task.imageOutputRoot ?? await resolveTaskOutputDirectory(),
            [store.get().settings.outputDirectory]
          );
          const file = files.find((candidate) => imageOutputFormatFromFilename(candidate.filename) === "png");
          if (!file) throw new Error("图片工作流没有返回可用图片文件。");
          const performanceStats = monitor.stop();
          const outputContentHash = file.absolutePath
            ? await hashImageFile(file.absolutePath).catch(() => undefined)
            : undefined;
          const completedAt = new Date().toISOString();
          const versionId = crypto.randomUUID();
          const next = await store.update((state) => {
            persistImageHistoryResult(state, {
              taskId: task.id,
              run,
              startedAt: runStartedAt,
              completedAt,
              versionId,
              file,
              outputContentHash,
              promptId: submitted.promptId,
              comfyOutputs: result,
              performanceStats
            });
          });
          sendState(next);
        } catch (error) {
          const performanceStats = monitor.stop();
          await store.update((state) => {
            const queued = state.queue.find((item) => item.id === task.id);
            if (!queued || !isImageGenerationQueueTask(queued)) return;
            const queuedRun = queued.runs.find((item) => item.id === run.id);
            if (!queuedRun) return;
            queuedRun.status = controller.signal.aborted ? "cancelled" : "failed";
            queuedRun.error = error instanceof Error ? error.message : String(error);
            queuedRun.performanceStats = performanceStats;
            queued.error = queuedRun.error;
          });
          throw error;
        }
      }
      const completed = await store.update((state) => {
        state.queue = state.queue.filter((item) => item.id !== task.id);
      });
      logger.info("queue", "task-finished", "Image batch task finished successfully", {
        taskId: task.id,
        taskType: task.taskType,
        modelId: task.modelId,
        runCount: task.runs.length,
        durationSeconds: Math.round((Date.now() - taskStartedAt) / 1000)
      });
      sendState(completed);
    } catch (error) {
      const message = controller.signal.aborted
        ? "图片批次已取消，已保留完成的图片版本。"
        : error instanceof Error
          ? error.message
          : String(error);
      if (!controller.signal.aborted) {
        logger.error("queue", "image-task-failed", "图片任务运行失败，已标记错误并跳过", {
          taskId: task.id,
          modelId: task.modelId,
          error: message,
          durationSeconds: Math.round((Date.now() - taskStartedAt) / 1000),
          ...errorLogMeta(error)
        });
      }
      await updateTask(task.id, {
        status: controller.signal.aborted ? "cancelled" : "failed",
        error: message
      });
    } finally {
      await freeMemory(store.get().settings).catch((error) => {
        logger.warn("comfy", "image-release-failed", "Failed to release image model memory after batch", {
          taskId: task.id,
          error: safeLogErrorMessage(error)
        });
      });
      queueWorkerController.endTask(controller);
    }
  }
  
  async function executeQueue(): Promise<void> {
    let promptModelReleased = false;
    while (store.get().queueRunning) {
      const task = store.get().queue.find((item) => item.status === "waiting");
      if (!task) break;
      await setQueueLifecycle("running", task.id);
      // Claim the task conditionally in the same store mutation. A cancel can
      // arrive after selection; an unconditional later update would otherwise
      // resurrect the cancelled task as running.
      let claimed = false;
      const claimedState = await store.update((state) => {
        const candidate = state.queue.find((item) => item.id === task.id);
        if (!state.queueRunning || candidate?.status !== "waiting") return;
        candidate.status = "running";
        candidate.progress = 1;
        candidate.stage = "准备任务";
        candidate.startedAt = new Date().toISOString();
        candidate.error = undefined;
        candidate.updatedAt = new Date().toISOString();
        claimed = true;
      });
      sendState(claimedState);
      if (!claimed) {
        if (!store.get().queueRunning) break;
        continue;
      }
      // The store write is asynchronous. Re-check after it settles so a cancel
      // handled in that gap cannot be overwritten by the execution branch.
      const claimedTask = store.get().queue.find((item) => item.id === task.id);
      if (!store.get().queueRunning || claimedTask?.status !== "running") continue;
      if (isImageGenerationQueueTask(task)) {
        await executeImageGenerationQueueTask(task);
        continue;
      }
      const executionStartedAt = Date.now();
      logger.info("queue", "task-started", "Queue task execution started", {
        taskId: task.id,
        taskType: task.taskType,
        modelId: task.modelId,
        automaticRetryAttempt: task.automaticRetryAttempt ?? 0,
        automaticRetryLimit: store.get().settings.autoRetryCount,
        duration: task.duration,
        fps: task.fps,
        startedAt: new Date(executionStartedAt).toISOString(),
        attentionMode: task.taskType === "upscale" ? "not-applicable" : task.attentionMode ?? "sage",
        spectrumMode: task.taskType === "upscale" ? "not-applicable" : task.spectrumMode ?? "off",
        ...(task.taskType === "upscale"
          ? {
              sourceWidth: task.sourceWidth,
              sourceHeight: task.sourceHeight,
              targetWidth: task.targetWidth,
              targetHeight: task.targetHeight
            }
          : {})
      });
      const activeController = queueWorkerController.beginTask();
      let vramWatchdog: VramWatchdogMonitor | undefined;
      let taskPerformanceMonitor: TaskPerformanceMonitor | undefined;
      let taskPerformanceStats: TaskPerformanceStats | undefined;
      let performanceLogTimer: ReturnType<typeof setInterval> | undefined;
      let performanceLogInFlight = false;
      const performanceWarnings = new Set<string>();
      let h3LivePreviewActive = false;
      let h3LivePreviewFrames = 0;
      let h3PreviewFirstFrameDelaySeconds: number | undefined;
      let h3PreviewStartedAt = 0;
      let h3PreviewOutcomeLogged = false;
      const logH3PreviewOutcome = (outcome: "completed" | "failed" | "cancelled"): void => {
        if (!h3LivePreviewActive || h3PreviewOutcomeLogged) return;
        h3PreviewOutcomeLogged = true;
        const meta = {
          taskId: task.id,
          modelId: task.modelId,
          outcome,
          frames: h3LivePreviewFrames,
          firstFrameDelaySeconds: h3PreviewFirstFrameDelaySeconds ?? null
        };
        if (h3LivePreviewFrames === 0) {
          logger.warn(
            "comfy",
            "h3-live-preview-no-frame",
            "H3 TAE live preview was enabled, but no preview frame reached the app",
            meta
          );
        } else {
          logger.info("comfy", "h3-live-preview-summary", "H3 TAE live preview summary", meta);
        }
      };
      try {
        if (task.taskType === "generation") {
          const safety = generationSafetyForTask(task, store.get().settings.uiLocale);
          if (!safety.safe) throw new Error(safety.message);
        } else if (task.taskType === "extension") {
          const safety = extensionSafetyForTask(task, store.get().settings.uiLocale);
          if (!safety.safe) throw new Error(safety.message);
        }
        await updateTask(task.id, {
          status: "running",
          progress: 1,
          stage: "提交工作流",
          startedAt: new Date().toISOString(),
          error: undefined
        });
        taskPerformanceMonitor = startTaskPerformanceMonitor();
        const logPerformanceSnapshot = async (): Promise<void> => {
          if (!taskPerformanceMonitor || performanceLogInFlight) return;
          performanceLogInFlight = true;
          try {
            const sample = await taskPerformanceMonitor.snapshot();
            const mib = (bytes: number | null): number | null =>
              bytes == null ? null : Math.round(bytes / 1024 ** 2);
            const warnOnce = (
              key: string,
              message: string,
              meta: Record<string, unknown>
            ): void => {
              if (performanceWarnings.has(key)) return;
              performanceWarnings.add(key);
              logger.warn("performance", key, message, {
                taskId: task.id,
                taskType: task.taskType,
                modelId: task.modelId,
                ...meta
              });
            };
            const memoryRatio = sample.memoryTotalBytes > 0
              ? sample.memoryUsedBytes / sample.memoryTotalBytes
              : 0;
            if (sample.vramUsedBytes == null || sample.vramTotalBytes == null) {
              warnOnce(
                "gpu-telemetry-unavailable",
                "GPU telemetry is unavailable; nvidia-smi returned no usable sample",
                {}
              );
            } else if (sample.vramUsedBytes / sample.vramTotalBytes >= 0.95) {
              warnOnce(
                "vram-near-limit",
                "GPU VRAM is near capacity",
                {
                  vramUsedMiB: mib(sample.vramUsedBytes),
                  vramTotalMiB: mib(sample.vramTotalBytes),
                  usagePercent: Math.round(sample.vramUsedBytes / sample.vramTotalBytes * 100)
                }
              );
            }
            if (sample.sharedGpuMemoryBytes != null && sample.sharedGpuMemoryBytes >= 2 * 1024 ** 3) {
              warnOnce(
                "shared-gpu-memory-high",
                "GPU shared memory usage is high",
                { sharedGpuMemoryMiB: mib(sample.sharedGpuMemoryBytes) }
              );
            }
            if (sample.gpuTemperatureC != null && sample.gpuTemperatureC >= 85) {
              warnOnce(
                "gpu-temperature-high",
                "GPU temperature is high",
                { gpuTemperatureC: Math.round(sample.gpuTemperatureC) }
              );
            }
            if (memoryRatio >= 0.9) {
              warnOnce(
                "system-memory-high",
                "System memory usage is high",
                { memoryUsedMiB: mib(sample.memoryUsedBytes), memoryTotalMiB: mib(sample.memoryTotalBytes), usagePercent: Math.round(memoryRatio * 100) }
              );
            }
            if (sample.cpuPercent != null && sample.cpuPercent >= 95) {
              warnOnce(
                "cpu-usage-high",
                "CPU usage is high",
                { cpuPercent: Math.round(sample.cpuPercent) }
              );
            }
            logger.info("performance", "task-sample", "Task performance sample", {
              taskId: task.id,
              taskType: task.taskType,
              modelId: task.modelId,
              elapsedSeconds: Math.round(sample.elapsedSeconds),
              cpuPercent: sample.cpuPercent == null ? null : Math.round(sample.cpuPercent),
              memoryUsedMiB: mib(sample.memoryUsedBytes),
              memoryTotalMiB: mib(sample.memoryTotalBytes),
              gpuPercent: sample.gpuPercent == null ? null : Math.round(sample.gpuPercent),
              vramUsedMiB: mib(sample.vramUsedBytes),
              vramTotalMiB: mib(sample.vramTotalBytes),
              sharedGpuMemoryMiB: mib(sample.sharedGpuMemoryBytes),
              sharedGpuMemoryPeakMiB: mib(sample.sharedGpuMemoryPeakBytes),
              gpuTemperatureC: sample.gpuTemperatureC == null
                ? null
                : Math.round(sample.gpuTemperatureC)
            });
          } finally {
            performanceLogInFlight = false;
          }
        };
        void logPerformanceSnapshot();
        performanceLogTimer = setInterval(
          () => void logPerformanceSnapshot(),
          performanceLogIntervalMs
        );
        if (!promptModelReleased) {
          await updateTask(task.id, {
            progress: 1,
            stage: "卸载提示词模型并释放显存"
          });
          const unloaded = await releasePromptRuntime(store.get().settings);
          promptModelReleased = true;
          if (unloaded > 0) {
            await updateTask(task.id, {
              progress: 1,
              stage: "已释放 ComfyUI 提示词模型"
            });
          }
        }
        await ensureComfyUiReady(task.id, activeController.signal);
        await updateTask(task.id, {
          progress: 1,
          stage: "提交工作流"
        });
        let lastGpuComputeAt = 0;
        vramWatchdog = startAdaptiveVramWatchdog(
          activeController,
          (pressure, utilization, sample) => {
            taskPerformanceMonitor?.recordGpuSample(sample);
            if (pressure.reason && !performanceWarnings.has("vram-pressure")) {
              performanceWarnings.add("vram-pressure");
              logger.warn("performance", "vram-pressure", "VRAM safety pressure detected", {
                taskId: task.id,
                remainingMiB: Math.round(pressure.remainingMiB),
                requiredReserveMiB: Math.round(pressure.requiredReserveMiB),
                growthMiBPerSecond: Math.round(pressure.growthMiBPerSecond),
                reason: pressure.reason
              });
            }
            if (utilization !== null && utilization >= 10) {
              lastGpuComputeAt = Date.now();
            }
          }
        );
        const submitted = await submitTask(
          task,
          store.get().settings,
          activeController.signal
        );
        const { promptId, clientId, nodeTypes } = submitted;
        h3LivePreviewActive = submitted.h3LivePreviewActive;
        if (h3LivePreviewActive) h3PreviewStartedAt = Date.now();
        if (submitted.h3LivePreviewRequested && !submitted.h3LivePreviewActive) {
          logger.warn(
            "comfy",
            "h3-live-preview-unavailable",
            "H3 live preview was requested but KJNodes ModelPreviewOverrideKJ or taeh3.safetensors is unavailable; generation continues without preview",
            { taskId: task.id, modelId: task.modelId }
          );
        } else if (submitted.h3LivePreviewActive) {
          logger.info("comfy", "h3-live-preview-enabled", "H3 TAE live preview enabled", {
            taskId: task.id,
            modelId: task.modelId,
            maxResolution: 512,
            previewFrames: 1
          });
        }
        logger.info("comfy", "prompt-submitted", "Workflow submitted to ComfyUI", {
          taskId: task.id,
          taskType: task.taskType,
          modelId: task.modelId,
          promptId,
          nodeCount: Object.keys(nodeTypes).length
        });
        await updateTask(task.id, {
          comfyPromptId: promptId,
          progress: 2,
          stage: "等待 ComfyUI"
        });
        let lastLoggedProgress = -5;
        let lastLoggedStage = "";
        const result = await waitForTask(
          promptId,
          clientId,
          nodeTypes,
          store.get().settings,
          activityTimeoutMinutesForTask(
            task,
            store.get().settings.ltxExtensionTimeoutMinutes
          ),
          activeController.signal,
          (progress, stage) => {
            void updateTask(task.id, { progress, stage });
            const roundedProgress = Math.round(progress);
            if (
              stage !== lastLoggedStage ||
              roundedProgress >= lastLoggedProgress + 5 ||
              progress >= 100
            ) {
              lastLoggedProgress = roundedProgress;
              lastLoggedStage = stage;
              logger.info("queue", "task-progress", "Queue task progress", {
                taskId: task.id,
                taskType: task.taskType,
                modelId: task.modelId,
                progress: roundedProgress,
                stage
              });
            }
          },
          (dataUrl, source, metadata) => {
            if (source === "h3-tae") {
              h3LivePreviewFrames += 1;
              if (h3LivePreviewFrames === 1) {
                h3PreviewFirstFrameDelaySeconds = h3PreviewStartedAt > 0
                  ? Math.round((Date.now() - h3PreviewStartedAt) / 1000)
                  : undefined;
              }
            }
            sendPreview({
              taskId: task.id,
              dataUrl,
              source,
              ...metadata
            });
          },
          () => Date.now() - lastGpuComputeAt < 10_000,
          { taskId: task.id, modelId: task.modelId }
        );
        logH3PreviewOutcome("completed");
        logger.info("queue", "task-output-ready", "ComfyUI task completed", {
          taskId: task.id,
          taskType: task.taskType,
          modelId: task.modelId
        });
        const completedTask = store.get().queue.find((item) => item.id === task.id);
        if (!completedTask || isImageGenerationQueueTask(completedTask)) continue;
        const completedAt = new Date().toISOString();
        const files = await requireExistingVideoOutput(
          result,
          [store.get().settings.outputDirectory]
        );
        logger.info("queue", "output-validated", "Task output validated", {
          taskId: task.id,
          outputCount: files.length
        });
        if (completedTask.taskType === "extension") {
          const outputVideo = files.find(
            (file) => file.absolutePath && isVideoOutputFilename(file.filename)
          );
          if (!outputVideo?.absolutePath) {
            throw new Error("续写工作流没有返回可供 FFmpeg 拼接的视频文件");
          }
          await updateTask(task.id, {
            progress: 99,
            stage: isMiniMaxH3R2vModel(completedTask.modelId)
              ? "合并 Motion Context 续写片段与 32 kHz 音轨"
              : isMiniMaxH3Fl2vaModel(completedTask.modelId)
                ? "裁掉重复边界帧并合并原生音轨"
                : "去除重叠帧并拼接成片"
          });
          await finalizeExtensionOutput(
            completedTask,
            outputVideo.absolutePath,
            activeController.signal
          );
        }
        if (taskPerformanceMonitor) {
          taskPerformanceStats = taskPerformanceMonitor.stop();
          taskPerformanceMonitor = undefined;
          logger.info("performance", "task-summary", "Task performance summary", {
            taskId: task.id,
            durationSeconds: Math.round(taskPerformanceStats.durationSeconds),
            vramPeakBytes: taskPerformanceStats.vramPeakBytes,
            vramTotalBytes: taskPerformanceStats.vramTotalBytes,
            gpuPeakPercent: taskPerformanceStats.gpuPeakPercent,
            memoryPeakBytes: taskPerformanceStats.memoryPeakBytes,
            sharedGpuMemoryPeakBytes: taskPerformanceStats.sharedGpuMemoryPeakBytes ?? null
          });
        }
        logger.info("queue", "task-finished", "Queue task finished successfully", {
          taskId: task.id,
          taskType: task.taskType,
          modelId: task.modelId,
          promptId,
          outputCount: files.length,
          durationSeconds: Math.round(taskPerformanceStats?.durationSeconds ?? (Date.now() - executionStartedAt) / 1000),
          performanceCaptured: Boolean(taskPerformanceStats)
        });
        const next = await store.update((state) => {
          persistVideoHistoryResult(state, {
            task: completedTask,
            completedAt,
            promptId,
            comfyOutputs: result,
            files,
            performanceStats: taskPerformanceStats,
            id: () => crypto.randomUUID()
          });
        });
        sendState(next);
        if (isMiniMaxH3Model(completedTask.modelId)) {
          const stable = await stabilizeH3RuntimeBetweenTasks(
            completedTask.id,
            completedTask.modelId,
            comfyUiSettingsForQueueTask(completedTask, next.settings)
          );
          if (!stable) {
            const stopped = await store.update((state) => {
              state.queueRunning = false;
            });
            sendState(stopped);
            logger.error("queue", "h3-stabilization-failed", "Queue stopped because H3 runtime could not be safely released", {
              taskId: completedTask.id,
              modelId: completedTask.modelId
            });
          }
        }
      } catch (error) {
        const aborted = activeController.signal.aborted;
        const stalled = error instanceof TaskStalledError;
        logH3PreviewOutcome(aborted ? "cancelled" : "failed");
        if (!taskPerformanceStats && taskPerformanceMonitor) {
          taskPerformanceStats = taskPerformanceMonitor.stop();
          taskPerformanceMonitor = undefined;
          logger.info("performance", "task-summary", "Failed task performance summary", {
            taskId: task.id,
            durationSeconds: Math.round(taskPerformanceStats.durationSeconds),
            vramPeakBytes: taskPerformanceStats.vramPeakBytes,
            vramTotalBytes: taskPerformanceStats.vramTotalBytes,
            gpuPeakPercent: taskPerformanceStats.gpuPeakPercent,
            memoryPeakBytes: taskPerformanceStats.memoryPeakBytes,
            sharedGpuMemoryPeakBytes: taskPerformanceStats.sharedGpuMemoryPeakBytes ?? null
          });
        }
        logger.error("queue", "task-failed", safeLogErrorMessage(error), {
          taskId: task.id,
          taskType: task.taskType,
          modelId: task.modelId,
          durationSeconds: Math.round(taskPerformanceStats?.durationSeconds ?? (Date.now() - executionStartedAt) / 1000),
          aborted,
          stalled,
          ...errorLogMeta(error)
        });
        await recoverQueueFailure({
          store,
          logger: logger,
          sendState,
          updateTask,
          settingsForTask: comfyUiSettingsForQueueTask,
          errorMeta: errorLogMeta
        }, {
          task,
          error,
          aborted,
          stalled,
          performanceStats: taskPerformanceStats
        });
        const recovered = store.get();
        if (!recovered.queueRunning && recovered.queueLifecycle === "running") {
          await setQueueLifecycle("error", task.id);
        }
      } finally {
        const finalStage = taskStageStartedAt.get(task.id);
        if (finalStage) {
          logger.info("queue", "stage-duration", "Queue task final stage finished", {
            taskId: task.id,
            taskType: task.taskType,
            modelId: task.modelId,
            stage: finalStage.stage,
            durationSeconds: Math.round((Date.now() - finalStage.startedAt) / 1000)
          });
          taskStageStartedAt.delete(task.id);
        }
        if (performanceLogTimer) clearInterval(performanceLogTimer);
        vramWatchdog?.stop();
        taskPerformanceMonitor?.stop();
        queueWorkerController.endTask(activeController);
      }
    }
    const next = await store.update((state) => {
      state.queueRunning = false;
      state.queueStartedAt = undefined;
      if (
        state.queueLifecycle !== "cancelling" &&
        state.queueLifecycle !== "cleaning" &&
        state.queueLifecycle !== "error"
      ) {
        state.queueLifecycle = "idle";
        state.queueLifecycleTaskId = undefined;
      }
    });
    sendState(next);
  }

  return executeQueue;
}
