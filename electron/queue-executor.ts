import type { AppState, GenerationQueueTask, H3MemoryRuntimeEvidence, H3VideoVaeBackend, HistoryFile, ImageGenerationQueueTask, NativeAvContinuationData, QueueLifecycle, QueueTask, Settings, TaskPerformanceStats, TaskPreview, UpscaleQueueTask } from "../src/types.js";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  isImageGenerationQueueTask,
  nextQueueWaitingTask
} from "../src/core/queue.js";
import { isVideoOutputFilename } from "../src/core/comfy-output.js";
import { imageOutputFormatFromFilename } from "../src/core/image-workflow.js";
import {
  activityTimeoutMinutesForTask,
  extensionSafetyForTask,
  generationSafetyForTask,
  isMiniMaxH3Fl2vaModel,
  isMiniMaxH3Model,
  isMiniMaxH3R2vModel,
  normalizeH3Steps,
  outputDimensions
} from "../src/core/workflow.js";
import {
  type PreviewFrameMetadata,
  submitImageTask,
  submitTask,
  TaskStalledError,
  waitForTask
} from "./services/comfy-ui.js";
import { executeNativeSeedVr2Upscale } from "./services/seedvr2-upscale.js";
import { startTaskPerformanceMonitor, type TaskPerformanceMonitor } from "./services/performance.js";
import { startAdaptiveVramWatchdog, type VramWatchdogMonitor } from "./services/vram-watchdog.js";
import { safeLogErrorMessage, type AppLogger } from "../src/infrastructure/app-logger.js";
import { parseH3MemoryAppliedPlan } from "./services/comfy-log-bridge.js";
import { upscaleTaskFromRequest } from "../src/core/queue-task-factory.js";
import type { StateRepository } from "./ports/state-repository.js";
import type { QueueWorkerController } from "./queue-worker.js";
import {
  QueueExecutionSideEffects,
  type QueueExecutionSideEffectsDependencies,
  type QueueIsolationReason
} from "./services/queue-execution-side-effects.js";

const performanceLogIntervalMs = 30_000;

function h3CreateFirstPassTask(task: GenerationQueueTask): GenerationQueueTask {
  return {
    ...task,
    workflowPath: fileURLToPath(new URL(
      "../workflows/minimax_h3_fl2va_first_pass_av_api.json",
      import.meta.url
    )),
    outputFilename: `h3-native-av/first-pass-${task.id}`,
    h3DeliveryResolution: undefined,
    h3FirstPassCheckpoint: undefined
  };
}

function h3CreateSecondPassTask(
  task: GenerationQueueTask,
  checkpoint: NonNullable<GenerationQueueTask["h3FirstPassCheckpoint"]>,
  state: AppState
): UpscaleQueueTask {
  const [targetWidth, targetOutputHeight] = outputDimensions({
    ...task,
    resolution: 1080
  });
  const upscale = upscaleTaskFromRequest({
    upscaleMode: "h3-native",
    sourceAssetId: task.id,
    sourceVersionId: checkpoint.artifact.artifactId,
    sourceFilePath: checkpoint.outputFile.absolutePath ?? "",
    sourceFilename: checkpoint.outputFile.filename,
    sourceWidth: checkpoint.artifact.width,
    sourceHeight: checkpoint.artifact.height,
    duration: task.duration,
    fps: checkpoint.artifact.fps,
    targetHeight: 1080,
    modelId: task.modelId,
    tileMode: "auto",
    faceRestore: false,
    h3NativeInput: {
      provider: "learned-3d",
      artifact: structuredClone(checkpoint.artifact),
      workflowPath: fileURLToPath(new URL(
        "../workflows/minimax_h3_fl2va_learned_3d_second_sample_av_api.json",
        import.meta.url
      )),
      learnedModelFilename: "minimax_h3_latent_upscaler_3d_bf16.safetensors",
      prompt: task.prompt,
      startImagePath: task.startImagePath,
      endImagePath: task.endImagePath,
      scaleBy: 1080 / Math.min(checkpoint.artifact.width, checkpoint.artifact.height),
      h3VideoVaeMode: task.h3VideoVaeMode!,
      attentionMode: task.attentionMode!,
      steps: normalizeH3Steps(task.steps, task.modelId, task.videoLoras),
      videoLoras: task.videoLoras?.map((lora) => ({ ...lora })) ?? []
    }
  }, state, {
    now: () => new Date(task.createdAt),
    id: () => task.id,
    random: () => 0
  });
  return {
    ...upscale,
    outputFilename: task.outputFilename,
    targetWidth,
    targetOutputHeight
  };
}

async function cleanupH3CreateFirstPass(
  checkpoint: NonNullable<GenerationQueueTask["h3FirstPassCheckpoint"]>
): Promise<void> {
  const paths = [
    checkpoint.outputFile.absolutePath,
    checkpoint.artifact.payload.absolutePath,
    checkpoint.artifact.manifest.absolutePath
  ].filter((value): value is string => Boolean(value));
  await Promise.all(paths.map((filename) => fs.unlink(filename).catch(() => undefined)));
}

export interface QueueExecutorDependencies {
  store: StateRepository;
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
  prepareQueueRuntimeForTask(taskId: string, modelId: string, settings: Settings, reason: QueueIsolationReason): Promise<boolean>;
  stabilizeH3RuntimeBetweenTasks(taskId: string, modelId: string, settings: Settings, hasVideoLoras: boolean, queueWillContinue: boolean): Promise<boolean>;
  stopQueueRuntime(settings: Settings): Promise<boolean>;
  restartQueueRuntime(settings: Settings): Promise<{ ok: boolean; message: string }>;
  resolveH3VideoVaeModeForTask(task: QueueTask, settings: Settings): Promise<H3VideoVaeBackend | null>;
  commitH3NativeAvOutput(
    result: unknown,
    serializerNodeId: string,
    task: Exclude<QueueTask, ImageGenerationQueueTask>,
    completedAt: string
  ): Promise<NativeAvContinuationData>;
  settingsForTask(task: QueueTask | undefined, settings: Settings): Settings;
  errorMeta(error: unknown): Record<string, unknown>;
  taskStageStartedAt: Map<string, { stage: string; startedAt: number }>;
  sideEffects?: QueueExecutionSideEffects;
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
    prepareQueueRuntimeForTask: prepareQueueRuntime,
    stabilizeH3RuntimeBetweenTasks,
    stopQueueRuntime,
    restartQueueRuntime,
    resolveH3VideoVaeModeForTask,
    commitH3NativeAvOutput,
    settingsForTask: comfyUiSettingsForQueueTask,
    errorMeta: errorLogMeta,
    taskStageStartedAt
  } = deps;
  const sideEffectsDependencies: QueueExecutionSideEffectsDependencies = {
    store,
    logger,
    sendState,
    updateTask,
    resolveTaskOutputDirectory,
    requireExistingImageOutput,
    requireExistingVideoOutput,
    prepareQueueRuntimeForTask: prepareQueueRuntime,
    stabilizeH3RuntimeBetweenTasks,
    stopQueueRuntime,
    restartQueueRuntime,
    settingsForTask: comfyUiSettingsForQueueTask,
    errorMeta: errorLogMeta
  };
  const sideEffects = deps.sideEffects ?? new QueueExecutionSideEffects(sideEffectsDependencies);

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
      await sideEffects.prepareTaskRuntime(task, controller.signal, false);
      await ensureComfyUiReady(task.id, controller.signal);
      const totalRuns = Math.max(1, task.runs.length);
      for (const plannedRun of task.runs) {
        const current = store.get().queue.find((item) => item.id === task.id);
        if (!current || !isImageGenerationQueueTask(current)) return;
        const run = current.runs.find((item) => item.id === plannedRun.id);
        if (!run || run.status === "completed") continue;
        const runStartedAt = new Date().toISOString();
        await sideEffects.beginImageRun(task.id, run.id, runStartedAt, totalRuns);
        const monitor = startTaskPerformanceMonitor();
        try {
          const submitted = await submitImageTask(
            current,
            { ...run, status: "running" },
            store.get().settings,
            controller.signal
          );
          sideEffects.markTaskSubmitted(task, false);
          let lastProgress = -1;
          const result = await waitForTask(
            submitted.promptId,
            submitted.clientId,
            submitted.nodeTypes,
            store.get().settings,
            20,
            controller.signal,
            (progress, stage, _determinate, workProgress) => {
              const batchProgress = ((run.index + Math.max(0, progress) / 100) / totalRuns) * 100;
              if (Math.round(batchProgress) < lastProgress + 2 && progress < 100) return;
              lastProgress = Math.round(batchProgress);
              void updateTask(task.id, {
                progress: Math.min(99, batchProgress),
                stage: `第 ${run.index + 1} / ${totalRuns} 张 · ${stage}`,
                workProgress
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
          const files = await sideEffects.trackImageOutput(result, task);
          const file = files.find((candidate) => imageOutputFormatFromFilename(candidate.filename) === "png");
          if (!file) throw new Error("图片工作流没有返回可用图片文件。");
          const performanceStats = monitor.stop();
          const completedAt = new Date().toISOString();
          const versionId = crypto.randomUUID();
          await sideEffects.recordImageRun({
            taskId: task.id,
            run,
            startedAt: runStartedAt,
            completedAt,
            versionId,
            file,
            promptId: submitted.promptId,
            comfyOutputs: result,
            performanceStats
          });
        } catch (error) {
          const performanceStats = monitor.stop();
          await sideEffects.failImageRun(
            task.id,
            run.id,
            controller.signal.aborted,
            error,
            performanceStats
          );
          throw error;
        }
      }
      await sideEffects.completeImageTask(task, taskStartedAt);
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
      await sideEffects.releaseImageRuntime(store.get().settings).catch((error) => {
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
      const current = store.get();
      const nextTask = nextQueueWaitingTask(
        current.queue,
        current.queuePauseBoundary
      );
      if (!nextTask) break;
      await setQueueLifecycle("running", nextTask.id);
      // Claim the task conditionally in the same store mutation. A cancel can
      // arrive after selection; an unconditional later update would otherwise
      // resurrect the cancelled task as running.
      const claim = await sideEffects.claimTask(nextTask.id);
      const { claimed, settingsAtClaim } = claim;
      if (!claimed) {
        if (!store.get().queueRunning) break;
        continue;
      }
      // The store write is asynchronous. Re-check after it settles so a cancel
      // handled in that gap cannot be overwritten by the execution branch.
      const claimedTask = store.get().queue.find((item) => item.id === nextTask.id);
      if (!store.get().queueRunning || claimedTask?.status !== "running") continue;
      if (isImageGenerationQueueTask(claimedTask)) {
        await executeImageGenerationQueueTask(claimedTask);
        continue;
      }
      let task: Exclude<QueueTask, ImageGenerationQueueTask> = claimedTask;
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
      let h3TokenCount: number | undefined;
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
        if (isMiniMaxH3Model(task.modelId)) {
          const h3VideoVaeMode = await resolveH3VideoVaeModeForTask(
            task,
            settingsAtClaim ?? store.get().settings
          );
          if (!h3VideoVaeMode) {
            throw new Error("H3 视频 VAE 未找到：请安装 FP16 或 INT8 ConvRot 视频 VAE 后重新扫描。您也可以在设置 → 性能与加速中查看状态。");
          }
          const resolvedState = await updateTask(task.id, {
            h3VideoVaeMode
          });
          const resolvedTask = resolvedState.queue.find((item) => item.id === task.id);
          if (!resolvedTask || resolvedTask.status !== "running" || isImageGenerationQueueTask(resolvedTask)) continue;
          task = resolvedTask;
          logger.info("queue", "h3-video-vae-selected", "Resolved H3 video VAE for the claimed task", {
            taskId: task.id,
            modelId: task.modelId,
            h3VideoVaeMode
          });
        }
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
        const hasVideoLoras = Boolean(task.videoLoras?.length);
        await sideEffects.prepareTaskRuntime(
          task,
          activeController.signal,
          isMiniMaxH3Model(task.modelId) && hasVideoLoras
        );
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
        const previewHandler = (
          dataUrl: string,
          source?: "h3-tae" | "comfy",
          metadata?: PreviewFrameMetadata
        ): void => {
          if (source === "h3-tae") {
            h3LivePreviewFrames += 1;
            if (h3LivePreviewFrames === 1) {
              h3PreviewFirstFrameDelaySeconds = h3PreviewStartedAt > 0
                ? Math.round((Date.now() - h3PreviewStartedAt) / 1000)
                : undefined;
            }
          }
          sendPreview({ taskId: task.id, dataUrl, source, ...metadata });
        };
        const isComputeActive = (): boolean => Date.now() - lastGpuComputeAt < 10_000;
        const h3CompositeTask = task.taskType === "generation" && task.h3DeliveryResolution === 1080
          ? task
          : undefined;
        let h3FirstPassCheckpoint = h3CompositeTask?.h3FirstPassCheckpoint;
        let executionTask: Exclude<QueueTask, ImageGenerationQueueTask> = h3CompositeTask
          ? h3FirstPassCheckpoint
            ? h3CreateSecondPassTask(h3CompositeTask, h3FirstPassCheckpoint, store.get())
            : h3CreateFirstPassTask(h3CompositeTask)
          : task as Exclude<QueueTask, ImageGenerationQueueTask>;
        let artifactCommitTask = executionTask;
        const segmentedSeedVr2 = task.taskType === "upscale"
          ? await executeNativeSeedVr2Upscale(task, {
              settings: store.get().settings,
              logger,
              signal: activeController.signal,
              updateTask: (taskId, patch) => updateTask(taskId, patch),
              getTask: (taskId) => {
                const current = store.get().queue.find((item) => item.id === taskId);
                return current?.taskType === "upscale" ? current : undefined;
              },
              requireExistingVideoOutput,
              isComputeActive,
              onPreview: previewHandler
            })
          : null;
      let promptId: string;
      let result: unknown;
      let files: HistoryFile[];
      let h3MemoryRuntimeEvidence: H3MemoryRuntimeEvidence | undefined;
      let h3AvSerializerNodeId: string | undefined;
        let seedVr2IntermediatePaths: string[] = [];
        if (segmentedSeedVr2) {
          promptId = segmentedSeedVr2.promptId;
          result = segmentedSeedVr2.comfyOutputs;
          files = segmentedSeedVr2.files;
          seedVr2IntermediatePaths = segmentedSeedVr2.intermediatePaths;
          sideEffects.markTaskSubmitted(task, false);
        } else {
          const submitted = await submitTask(
            executionTask,
            store.get().settings,
            activeController.signal
          );
          sideEffects.markTaskSubmitted(task, hasVideoLoras);
          ({ promptId } = submitted);
          const { clientId, nodeTypes } = submitted;
          h3TokenCount = submitted.h3TokenCount;
          h3MemoryRuntimeEvidence = submitted.h3MemoryRuntimeEvidence;
          h3AvSerializerNodeId = submitted.h3AvSerializerNodeId;
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
          let lastH3MemoryPlanSignature = "";
          const initialProgressOffset = h3CompositeTask && executionTask.taskType === "upscale" ? 50 : 0;
          const initialProgressScale = h3CompositeTask ? 0.5 : 1;
          result = await waitForTask(
            promptId,
            clientId,
            nodeTypes,
            store.get().settings,
            activityTimeoutMinutesForTask(
              task,
              store.get().settings.ltxExtensionTimeoutMinutes
            ),
            activeController.signal,
            (progress, stage, _determinate, workProgress) => {
              const aggregateProgress = initialProgressOffset + progress * initialProgressScale;
              const aggregateStage = h3CompositeTask
                ? `${executionTask.taskType === "upscale" ? "1080p 二次采样" : "720p 首遍"} · ${stage}`
                : stage;
              void updateTask(task.id, { progress: aggregateProgress, stage: aggregateStage, workProgress });
              const roundedProgress = Math.round(aggregateProgress);
              if (
                aggregateStage !== lastLoggedStage ||
                roundedProgress >= lastLoggedProgress + 5 ||
                aggregateProgress >= 100
              ) {
                lastLoggedProgress = roundedProgress;
                lastLoggedStage = aggregateStage;
                logger.info("queue", "task-progress", "Queue task progress", {
                  taskId: task.id,
                  taskType: task.taskType,
                  modelId: task.modelId,
                  progress: roundedProgress,
                  stage: aggregateStage
                });
              }
            },
            previewHandler,
            isComputeActive,
            { taskId: task.id, modelId: task.modelId },
            h3MemoryRuntimeEvidence
              ? (line) => {
                  const evidence = parseH3MemoryAppliedPlan(line);
                  if (!evidence) return;
                  const signature = `${evidence.execution}:${evidence.qkvProvider}:${evidence.memoryProvider}`;
                  if (signature === lastH3MemoryPlanSignature) return;
                  lastH3MemoryPlanSignature = signature;
                  h3MemoryRuntimeEvidence = {
                    ...h3MemoryRuntimeEvidence!,
                    execution: evidence.execution,
                    note: evidence.note
                  };
                  void updateTask(task.id, {
                    h3MemoryRuntimeEvidence: h3MemoryRuntimeEvidence
                  });
                  logger.info("comfy", "h3-memory-runtime-evidence", evidence.note, {
                    taskId: task.id,
                    promptId,
                    execution: evidence.execution,
                    qkvProvider: evidence.qkvProvider,
                    memoryProvider: evidence.memoryProvider
                  });
                  if (evidence.execution === "fallback") {
                    throw new Error(
                      `H3 Memory Optimization 未启用 bounded QKV：qkv_provider=${evidence.qkvProvider}，memory=${evidence.memoryProvider}。任务已停止以避免继续占满显存。`
                    );
                  }
                }
              : undefined
          );
          files = await sideEffects.trackVideoOutput(result);
          if (h3CompositeTask && executionTask.taskType === "generation") {
            if (!h3AvSerializerNodeId) {
              throw new Error("H3 1080p 首遍工作流没有返回 JointAV serializer 节点。");
            }
            const firstPassData = await commitH3NativeAvOutput(
              result,
              h3AvSerializerNodeId,
              executionTask,
              new Date().toISOString()
            );
            const firstPassArtifact = firstPassData.status === "available"
              ? firstPassData.artifact
              : undefined;
            const firstPassOutput = files.find((file) =>
              file.absolutePath && isVideoOutputFilename(file.filename)
            );
            if (!firstPassArtifact || !firstPassOutput) {
              throw new Error("H3 1080p 首遍没有提交可恢复的 JointAV artifact 或临时视频。");
            }
            h3FirstPassCheckpoint = {
              promptId,
              outputFile: firstPassOutput,
              artifact: firstPassArtifact
            };
            await updateTask(task.id, {
              h3FirstPassCheckpoint,
              progress: 50,
              stage: "720p 首遍完成 · 准备 1080p learned 二次采样"
            });
            executionTask = h3CreateSecondPassTask(
              h3CompositeTask,
              h3FirstPassCheckpoint,
              store.get()
            );
            artifactCommitTask = executionTask;
            const secondSubmitted = await submitTask(
              executionTask,
              store.get().settings,
              activeController.signal
            );
            promptId = secondSubmitted.promptId;
            h3AvSerializerNodeId = secondSubmitted.h3AvSerializerNodeId;
            await updateTask(task.id, {
              comfyPromptId: promptId,
              progress: 50,
              stage: "1080p learned 二次采样 · 等待 ComfyUI"
            });
            result = await waitForTask(
              promptId,
              secondSubmitted.clientId,
              secondSubmitted.nodeTypes,
              store.get().settings,
              activityTimeoutMinutesForTask(
                executionTask,
                store.get().settings.ltxExtensionTimeoutMinutes
              ),
              activeController.signal,
              (progress, stage, _determinate, workProgress) => {
                void updateTask(task.id, {
                  progress: 50 + progress * 0.5,
                  stage: `1080p 二次采样 · ${stage}`,
                  workProgress
                });
              },
              previewHandler,
              isComputeActive,
              { taskId: task.id, modelId: task.modelId }
            );
            files = await sideEffects.trackVideoOutput(result);
          }
        }
        logH3PreviewOutcome("completed");
        logger.info("queue", "task-output-ready", "ComfyUI task completed", {
          taskId: task.id,
          taskType: task.taskType,
          modelId: task.modelId
        });
        const completedTask = store.get().queue.find((item) => item.id === task.id);
        if (!completedTask || isImageGenerationQueueTask(completedTask)) continue;
        const completedAt = new Date().toISOString();
        const h3ContinuationData = h3AvSerializerNodeId
          ? await commitH3NativeAvOutput(result, h3AvSerializerNodeId, artifactCommitTask, completedAt)
          : undefined;
        if (h3CompositeTask && h3FirstPassCheckpoint) {
          await cleanupH3CreateFirstPass(h3FirstPassCheckpoint);
        }
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
          await sideEffects.finalizeExtension(
            completedTask,
            outputVideo.absolutePath,
            activeController.signal
          );
        }
        if (seedVr2IntermediatePaths.length && completedTask.taskType === "upscale") {
          await updateTask(task.id, {
            seedVr2Progress: {
              phase: "cleaning",
              currentSegment: completedTask.seedVr2Checkpoint?.totalSegments ?? seedVr2IntermediatePaths.length,
              totalSegments: completedTask.seedVr2Checkpoint?.totalSegments ?? seedVr2IntermediatePaths.length,
              completedSegments: completedTask.seedVr2Checkpoint?.totalSegments ?? seedVr2IntermediatePaths.length,
              segmentProgress: 100,
              temporaryFileCount: seedVr2IntermediatePaths.length
            },
            progress: 99,
            stage: `合并完成 · 清理 ${seedVr2IntermediatePaths.length} 个临时切片文件`
          });
          const cleanup = await sideEffects.cleanupSeedVr2Intermediates(seedVr2IntermediatePaths);
          logger.info("queue", "seedvr2-intermediates-cleaned", "Native SeedVR2 temporary segment cleanup finished", {
            taskId: task.id,
            temporaryFileCount: seedVr2IntermediatePaths.length,
            removedCount: cleanup.removed,
            failedCount: cleanup.failed
          });
          if (cleanup.failed > 0) {
            logger.warn("queue", "seedvr2-intermediate-cleanup-incomplete", "Some native SeedVR2 temporary segments could not be removed", {
              taskId: task.id,
              failedCount: cleanup.failed
            });
          }
        }
        if (taskPerformanceMonitor) {
          const measuredStats = taskPerformanceMonitor.stop();
          taskPerformanceStats = h3TokenCount == null
            ? measuredStats
            : { ...measuredStats, h3TokenCount };
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
        const next = await sideEffects.completeVideoTask({
          task: completedTask,
          completedAt,
          promptId,
          comfyOutputs: result,
          files,
          performanceStats: taskPerformanceStats,
          h3MemoryRuntimeEvidence,
          h3ContinuationData
        });
        if (isMiniMaxH3Model(completedTask.modelId)) {
          const nextTask = nextQueueWaitingTask(
            next.queue,
            next.queuePauseBoundary
          );
          const queueWillContinue = next.queueRunning && Boolean(nextTask);
          const stable = await sideEffects.stabilizeRuntime(
            completedTask.id,
            completedTask.modelId,
            comfyUiSettingsForQueueTask(completedTask, next.settings),
            Boolean(completedTask.videoLoras?.length),
            queueWillContinue
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
          const measuredStats = taskPerformanceMonitor.stop();
          taskPerformanceStats = h3TokenCount == null
            ? measuredStats
            : { ...measuredStats, h3TokenCount };
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
        await sideEffects.recoverFailure(
          task,
          error,
          aborted,
          stalled,
          taskPerformanceStats
        );
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
    const queueBeforeStop = store.get();
    const cancellationOwnsRuntime = queueBeforeStop.queueLifecycle === "cancelling" ||
      queueBeforeStop.queueLifecycle === "cleaning";
    if (!cancellationOwnsRuntime) {
      await sideEffects.stopRuntime(queueBeforeStop.settings);
    }
    const next = await store.update((state) => {
      // A continue action may arrive after the loop observes queueRunning=false
      // but before this final cleanup write. Preserve that resumed session; the
      // worker controller will re-enter the executor after this invocation
      // settles if the old worker was already in its exit path.
      if (state.queueRunning && nextQueueWaitingTask(state.queue, state.queuePauseBoundary)) {
        return;
      }
      state.queueRunning = false;
      state.queueStartedAt = undefined;
      if (!state.queue.some((task) =>
        task.status === "waiting" || task.status === "running"
      )) {
        state.queuePauseBoundary = undefined;
      }
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
