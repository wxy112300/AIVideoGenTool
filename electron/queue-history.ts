import type {
  AppState,
  AssetVersion,
  HistoryAsset,
  HistoryFile,
  ImageAssetVersion,
  ImageGenerationQueueTask,
  ImageGenerationRun,
  QueueTask,
  TaskPerformanceStats
} from "../src/types.js";
import { createImageSourceVersion, nextImageVersionNumber } from "../src/core/image-project.js";
import { imageModelAdapterFor } from "../src/core/image-workflow.js";
import { extensionOutputDimensions, outputDimensions } from "../src/core/workflow.js";
import { videoLoraSelection } from "../src/core/video-loras.js";
import { upscaleDimensions } from "../src/core/upscale.js";

export interface ImageHistoryResult {
  taskId: string;
  run: ImageGenerationRun;
  startedAt: string;
  completedAt: string;
  versionId: string;
  file: HistoryFile;
  outputContentHash?: string;
  promptId: string;
  comfyOutputs: unknown;
  performanceStats: TaskPerformanceStats;
}

export function persistImageHistoryResult(
  state: AppState,
  result: ImageHistoryResult
): void {
  const queued = state.queue.find((item) => item.id === result.taskId);
  if (!queued || queued.taskType !== "image-generation") return;
  let project = state.imageHistory.find((item) => item.id === queued.projectId);
  const projectCreated = !project;
  if (!project) {
    project = {
      mediaKind: "image",
      id: queued.projectId,
      title: queued.prompt.slice(0, 32) || "未命名图片",
      createdAt: result.completedAt,
      updatedAt: result.completedAt,
      coverMode: "auto",
      nextVersionNumber: 1,
      versions: []
    };
    state.imageHistory.unshift(project);
  }
  if (projectCreated && project.versions.length === 0) {
    const sourcePicture = queued.pictures[0];
    if (sourcePicture?.absolutePath) {
      const sourceVersion = createImageSourceVersion(sourcePicture, queued.createdAt);
      sourceVersion.versionNumber = nextImageVersionNumber(project);
      project.versions.unshift(sourceVersion);
      project.nextVersionNumber = sourceVersion.versionNumber + 1;
    }
  }
  const versionNumber = nextImageVersionNumber(project);
  const quality = imageModelAdapterFor(queued.modelId)?.qualityProfiles.find(
    (profile) => profile.id === queued.qualityProfile
  );
  const version: ImageAssetVersion = {
    id: result.versionId,
    versionNumber,
    kind: "edit",
    parentVersionId: queued.parentVersionId,
    taskId: queued.id,
    runId: result.run.id,
    createdAt: result.completedAt,
    startedAt: result.startedAt,
    modelId: queued.modelId,
    workflowPath: queued.workflowPath,
    prompt: queued.prompt,
    promptVersion: queued.promptVersion,
    references: queued.pictures.map((picture) => ({ ...picture })),
    qualityProfile: queued.qualityProfile,
    ...(quality ? { steps: quality.steps, cfg: quality.cfg } : {}),
    targetResolution: queued.targetResolution,
    outputCount: queued.outputCount,
    diffusionModelFilename: queued.diffusionModelFilename,
    seed: result.run.seed,
    width: queued.outputWidth ?? queued.pictures[0]?.width ?? 0,
    height: queued.outputHeight ?? queued.pictures[0]?.height ?? 0,
    format: "png",
    ...(result.outputContentHash ? { contentHash: result.outputContentHash } : {}),
    file: result.file,
    comfyPromptId: result.promptId,
    comfyOutputs: result.comfyOutputs,
    performanceStats: result.performanceStats
  };
  project.versions.unshift(version);
  project.nextVersionNumber = versionNumber + 1;
  project.updatedAt = result.completedAt;
  const queuedRun = queued.runs.find((item) => item.id === result.run.id);
  if (queuedRun) {
    queuedRun.status = "completed";
    queuedRun.progress = 100;
    queuedRun.completedAt = result.completedAt;
    queuedRun.comfyPromptId = result.promptId;
    queuedRun.outputVersionId = result.versionId;
    queuedRun.performanceStats = result.performanceStats;
  }
  queued.progress = ((result.run.index + 1) / Math.max(1, queued.runs.length)) * 100;
  queued.stage = `已完成第 ${result.run.index + 1} / ${Math.max(1, queued.runs.length)} 张`;
}

type VideoQueueTask = Exclude<QueueTask, ImageGenerationQueueTask>;

export interface VideoHistoryResult {
  task: VideoQueueTask;
  completedAt: string;
  promptId: string;
  comfyOutputs: unknown;
  files: HistoryFile[];
  performanceStats?: TaskPerformanceStats;
  id(): string;
}

export function persistVideoHistoryResult(
  state: AppState,
  result: VideoHistoryResult
): void {
  const task = result.task;
  state.queue = state.queue.filter((item) => item.id !== task.id);
  if (task.taskType === "generation") {
    const [width, height] = outputDimensions(task);
    const version: AssetVersion = {
      id: result.id(), kind: "original", createdAt: result.completedAt,
      outputFilename: task.outputFilename, modelId: task.modelId,
      videoLoras: task.videoLoras?.map((lora) => videoLoraSelection(lora)), width, height,
      duration: task.duration, promptVersion: task.promptVersion, steps: task.steps,
      attentionMode: task.attentionMode, spectrumMode: task.spectrumMode, fps: task.fps,
      frameInterpolation: task.frameInterpolation, ratio: task.ratio, motion: task.motion,
      seed: task.seed, performanceStats: result.performanceStats,
      workflowPath: task.workflowPath, comfyPromptId: result.promptId,
      comfyOutputs: result.comfyOutputs, files: result.files, startedAt: task.startedAt
    };
    const asset: HistoryAsset = {
      mediaKind: "video", id: result.id(), taskId: task.id,
      title: task.prompt.slice(0, 28) || "未命名视频",
      outputFilename: task.outputFilename, createdAt: result.completedAt,
      updatedAt: result.completedAt, modelId: task.modelId,
      videoLoras: task.videoLoras?.map((lora) => videoLoraSelection(lora)), duration: task.duration,
      resolution: task.resolution, steps: task.steps, fps: task.fps,
      frameInterpolation: task.frameInterpolation, ratio: task.ratio,
      promptVersion: task.promptVersion, attentionMode: task.attentionMode,
      motion: task.motion, prompt: task.prompt, seed: task.seed, inputMode: "image",
      h3ReferenceSlots: task.h3ReferenceSlots?.map((slot) => ({ ...slot })),
      sourceWidth: task.sourceWidth, sourceHeight: task.sourceHeight,
      startImagePath: task.startImagePath, endImagePath: task.endImagePath,
      workflowPath: task.workflowPath, startedAt: task.startedAt,
      comfyPromptId: result.promptId, comfyOutputs: result.comfyOutputs,
      files: result.files, defaultVersionId: version.id, versions: [version]
    };
    state.history.unshift(asset);
    return;
  }
  if (task.taskType === "extension") {
    const [width, height] = extensionOutputDimensions(task);
    const totalDuration = task.trimEndSeconds - task.trimStartSeconds + task.duration;
    const version: AssetVersion = {
      id: result.id(), kind: "original", createdAt: result.completedAt,
      outputFilename: task.outputFilename, modelId: task.modelId,
      videoLoras: task.videoLoras?.map((lora) => videoLoraSelection(lora)), width, height,
      duration: totalDuration, promptVersion: task.promptVersion, steps: task.steps,
      attentionMode: task.attentionMode, spectrumMode: task.spectrumMode, fps: task.fps,
      frameInterpolation: task.frameInterpolation, ratio: "source", motion: task.motion,
      seed: task.seed, performanceStats: result.performanceStats,
      workflowPath: task.workflowPath, comfyPromptId: result.promptId,
      comfyOutputs: result.comfyOutputs, files: result.files, startedAt: task.startedAt,
      h3ContextLatentPath: task.h3ContextSavedPath
    };
    const asset: HistoryAsset = {
      mediaKind: "video", id: result.id(), taskId: task.id,
      title: task.prompt.slice(0, 28) || "视频续写",
      outputFilename: task.outputFilename, createdAt: result.completedAt,
      updatedAt: result.completedAt, modelId: task.modelId,
      videoLoras: task.videoLoras?.map((lora) => videoLoraSelection(lora)), duration: totalDuration,
      resolution: task.resolution, steps: task.steps, fps: task.fps,
      frameInterpolation: task.frameInterpolation, ratio: "source",
      promptVersion: task.promptVersion, attentionMode: task.attentionMode,
      motion: task.motion, prompt: task.prompt, seed: task.seed, inputMode: "video",
      sourceWidth: task.sourceWidth, sourceHeight: task.sourceHeight,
      sourceAssetId: task.sourceAssetId, sourceVersionId: task.sourceVersionId,
      h3ContextLatentPath: task.h3ContextSavedPath,
      sourceVideoPath: task.sourceVideoPath, sourceVideoDuration: task.sourceVideoDuration,
      trimStartSeconds: task.trimStartSeconds, trimEndSeconds: task.trimEndSeconds,
      workflowPath: task.workflowPath, startedAt: task.startedAt,
      comfyPromptId: result.promptId, comfyOutputs: result.comfyOutputs,
      files: result.files, defaultVersionId: version.id, versions: [version]
    };
    state.history.unshift(asset);
    return;
  }
  const assetIndex = state.history.findIndex((asset) => asset.id === task.sourceAssetId);
  if (assetIndex < 0) throw new Error("源作品已不存在，无法保存提升版本");
  const asset = state.history[assetIndex]!;
  const [targetWidth, targetHeight] = upscaleDimensions(
    task.sourceWidth, task.sourceHeight, task.targetHeight
  );
  const version: AssetVersion = {
    id: result.id(), kind: "upscale", createdAt: result.completedAt,
    outputFilename: task.outputFilename, modelId: task.modelId,
    width: targetWidth, height: targetHeight, duration: task.duration,
    fps: task.fps, seed: task.seed, performanceStats: result.performanceStats,
    workflowPath: task.workflowPath, comfyPromptId: result.promptId,
    comfyOutputs: result.comfyOutputs, files: result.files,
    tileMode: task.tileMode, faceRestore: task.faceRestore, startedAt: task.startedAt
  };
  asset.versions.push(version);
  asset.updatedAt = result.completedAt;
  asset.defaultVersionId = version.id;
  state.history.splice(assetIndex, 1);
  state.history.unshift(asset);
}
