import type {
  AssetVersion,
  HistoryAsset,
  ImageAssetVersion,
  ImageHistoryProject,
  QueueTask
} from "../types.js";
import { modelCatalog } from "./catalog/index.js";

/**
 * Completed history used to estimate future queue work. Keeping this input
 * separate from AppState makes the estimator deterministic and easy to test.
 */
export interface QueueEstimateHistory {
  video: ReadonlyArray<HistoryAsset>;
  image?: ReadonlyArray<ImageHistoryProject>;
}

interface EstimateSample {
  taskType: QueueTask["taskType"];
  modelId: string;
  modelFamily: string;
  modelVariant?: string;
  seconds: number;
  workload: number;
  recordedAt?: string;
  features: Record<string, string | number | boolean | undefined>;
}

const MAX_REASONABLE_SECONDS = 24 * 60 * 60;
const BASE_VIDEO_PIXELS = 480 ** 2;
const BASE_VIDEO_DURATION = 5;
const BASE_VIDEO_STEPS = 20;
const BASE_VIDEO_FPS = 24;
const BASE_IMAGE_PIXELS = 1024 * 768;

function modelInfo(modelId: string): { family: string; variant?: string } {
  const definition = modelCatalog.get(modelId)?.definition;
  return {
    family: definition?.family ?? modelId,
    variant: definition?.variant
  };
}

function validSeconds(value: unknown): number | null {
  const seconds = typeof value === "number" ? value : Number(value);
  return Number.isFinite(seconds) && seconds > 0 && seconds <= MAX_REASONABLE_SECONDS
    ? seconds
    : null;
}

function durationBetween(startedAt: string | undefined, completedAt: string | undefined): number | null {
  if (!startedAt || !completedAt) return null;
  const started = Date.parse(startedAt);
  const completed = Date.parse(completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed)) return null;
  return validSeconds((completed - started) / 1000);
}

function sampleSeconds(
  performanceDuration: number | undefined,
  startedAt: string | undefined,
  completedAt: string | undefined
): number | null {
  return validSeconds(performanceDuration) ?? durationBetween(startedAt, completedAt);
}

function loraSignature(
  loras: ReadonlyArray<{ id: string; strength?: number }> | undefined
): string {
  return (loras ?? [])
    .map((lora) => {
      const strength = typeof lora.strength === "number" && Number.isFinite(lora.strength)
        ? `@${lora.strength.toFixed(3)}`
        : "";
      return `${lora.id}${strength}`;
    })
    .sort()
    .join(",");
}

function numericFeature(
  features: Record<string, string | number | boolean | undefined>,
  key: string,
  fallback: number
): number {
  const value = features[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function interpolationCost(value: string | undefined): number {
  if (value === "rife4x") return 1.3;
  if (value === "rife2x") return 1.15;
  return 1;
}

function videoWorkload(features: Record<string, string | number | boolean | undefined>): number {
  const resolution = numericFeature(features, "resolution", 480);
  const duration = numericFeature(features, "duration", BASE_VIDEO_DURATION);
  const steps = numericFeature(features, "steps", BASE_VIDEO_STEPS);
  const fps = numericFeature(features, "fps", BASE_VIDEO_FPS);
  const references = numericFeature(features, "referenceCount", 1);
  const referenceCost = 1 + Math.max(0, references - 1) * 0.06;
  const endFrameCost = features.hasEndImage === true ? 1.04 : 1;
  return Math.max(
    0.001,
    (resolution / 480) ** 2
      * (duration / BASE_VIDEO_DURATION)
      * (steps / BASE_VIDEO_STEPS)
      * (fps / BASE_VIDEO_FPS)
      * interpolationCost(typeof features.frameInterpolation === "string" ? features.frameInterpolation : undefined)
      * referenceCost
      * endFrameCost
  );
}

function imageWorkload(features: Record<string, string | number | boolean | undefined>): number {
  const width = numericFeature(features, "width", 1024);
  const height = numericFeature(features, "height", 768);
  const references = numericFeature(features, "pictureCount", 1);
  return Math.max(0.001, (width * height / BASE_IMAGE_PIXELS) * (1 + Math.max(0, references - 1) * 0.08));
}

function upscaleWorkload(features: Record<string, string | number | boolean | undefined>): number {
  const targetHeight = numericFeature(features, "targetHeight", 720);
  const duration = numericFeature(features, "duration", BASE_VIDEO_DURATION);
  const fps = numericFeature(features, "fps", BASE_VIDEO_FPS);
  return Math.max(0.001, (targetHeight / 720) ** 2 * (duration / BASE_VIDEO_DURATION) * (fps / BASE_VIDEO_FPS));
}

function taskWorkload(task: QueueTask): number {
  if (task.taskType === "image-generation") {
    return imageWorkload({
      width: task.outputWidth ?? task.pictures[0]?.width,
      height: task.outputHeight ?? task.pictures[0]?.height,
      pictureCount: task.pictures.length
    });
  }
  if (task.taskType === "upscale") {
    return upscaleWorkload({
      targetHeight: task.targetHeight,
      duration: task.duration,
      fps: task.fps
    });
  }
  return videoWorkload({
    resolution: task.resolution,
    duration: task.duration,
    steps: task.steps,
    fps: task.fps,
    frameInterpolation: task.frameInterpolation,
    referenceCount: task.taskType === "generation"
      ? (task.h3ReferenceSlots?.filter((slot) => Boolean(slot.mediaPath)).length || (task.startImagePath ? 1 : 0))
      : 0,
    hasEndImage: task.taskType === "generation" && Boolean(task.endImagePath)
  });
}

function scaledSampleSeconds(sample: EstimateSample, task: QueueTask): number {
  const ratio = taskWorkload(task) / Math.max(0.001, sample.workload);
  if (!Number.isFinite(ratio) || ratio <= 0 || Math.abs(ratio - 1) < 0.001) return sample.seconds;
  // Keep model load, graph compilation, and final muxing from being scaled as
  // if they were per-frame work. This is deliberately conservative and capped
  // so a sparse history cannot turn into an implausible multi-hour estimate.
  const startup = Math.min(180, Math.max(1, sample.seconds * 0.18));
  const variable = Math.max(0, sample.seconds - startup);
  return Math.max(1, startup + variable * Math.max(0.35, Math.min(4, ratio)));
}

function videoSample(
  asset: HistoryAsset,
  version: AssetVersion,
  seconds: number
): EstimateSample {
  const taskType: QueueTask["taskType"] = version.kind === "upscale"
    ? "upscale"
    : asset.inputMode === "video" ? "extension" : "generation";
  const modelId = version.modelId || asset.modelId;
  const model = modelInfo(modelId);
  const retainedDuration = taskType === "extension"
    ? Math.max(0, (asset.trimEndSeconds ?? asset.sourceVideoDuration ?? 0) - (asset.trimStartSeconds ?? 0))
    : 0;
  const generatedDuration = taskType === "extension" && retainedDuration > 0
    ? Math.max(0.1, version.duration - retainedDuration)
    : version.duration;
  const referenceCount = taskType === "generation"
    ? (asset.h3ReferenceSlots?.filter((slot) => Boolean(slot.mediaPath)).length
      || [asset.startImagePath, asset.endImagePath].filter(Boolean).length)
    : 0;
  const features = taskType === "upscale"
    ? {
        targetHeight: version.height,
        duration: version.duration,
        fps: version.fps,
        tileMode: version.tileMode,
        faceRestore: version.faceRestore
      }
    : {
        resolution: asset.resolution,
        duration: generatedDuration,
        steps: version.steps ?? asset.steps,
        fps: version.fps,
        frameInterpolation: version.frameInterpolation ?? asset.frameInterpolation,
        spectrumMode: version.spectrumMode ?? asset.spectrumMode,
        spectrumModelAwareMode: version.spectrumModelAwareMode ?? asset.spectrumModelAwareMode,
        loras: loraSignature(version.videoLoras ?? asset.videoLoras),
        sourceMode: asset.inputMode,
        referenceCount,
        hasEndImage: taskType === "generation" && Boolean(asset.endImagePath)
      };
  return {
    taskType,
    modelId,
    modelFamily: model.family,
    modelVariant: model.variant,
    seconds,
    workload: taskType === "upscale" ? upscaleWorkload(features) : videoWorkload(features),
    recordedAt: version.createdAt || asset.updatedAt || asset.createdAt,
    features
  };
}

function imageSample(
  version: ImageAssetVersion,
  seconds: number
): EstimateSample {
  const model = modelInfo(version.modelId);
  const features = {
    qualityProfile: version.qualityProfile,
    aspectRatio: version.aspectRatio,
    targetResolution: version.targetResolution,
    width: version.width,
    height: version.height,
    pictureCount: version.references.length,
    outputCount: version.outputCount
  };
  return {
    taskType: "image-generation",
    modelId: version.modelId,
    modelFamily: model.family,
    modelVariant: model.variant,
    seconds,
    workload: imageWorkload(features),
    recordedAt: version.createdAt,
    features
  };
}

function videoHistorySamples(history: ReadonlyArray<HistoryAsset>): EstimateSample[] {
  const samples: EstimateSample[] = [];
  for (const asset of history) {
    for (const version of asset.versions) {
      const seconds = sampleSeconds(
        version.performanceStats?.durationSeconds,
        version.startedAt ?? asset.startedAt,
        version.createdAt || asset.updatedAt || asset.createdAt
      );
      if (seconds != null) samples.push(videoSample(asset, version, seconds));
    }
  }
  return samples;
}

function imageHistorySamples(history: ReadonlyArray<ImageHistoryProject>): EstimateSample[] {
  const samples: EstimateSample[] = [];
  for (const project of history) {
    for (const version of project.versions) {
      // Source versions are user inputs, not generated work and therefore do
      // not teach the estimator anything about model execution.
      if (version.kind === "source") continue;
      const seconds = sampleSeconds(
        version.performanceStats?.durationSeconds,
        version.startedAt,
        version.createdAt
      );
      if (seconds != null) samples.push(imageSample(version, seconds));
    }
  }
  return samples;
}

function numericDistance(left: number | undefined, right: number | undefined): number {
  if (left == null || right == null || !Number.isFinite(left) || !Number.isFinite(right)) return 0;
  if (left === right) return 0;
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  const relative = Math.abs(left - right) / scale;
  return relative <= 0.1 ? 0.5 : relative <= 0.35 ? 1 : relative <= 0.75 ? 2 : 4;
}

function featureDistance(
  task: QueueTask,
  sample: EstimateSample
): number {
  if (task.taskType !== sample.taskType) return Number.POSITIVE_INFINITY;
  const taskModel = modelInfo(task.modelId);
  if (task.modelId !== sample.modelId) {
    // A quantized/precision variant can borrow a family history, but an
    // unrelated model must never teach its timing to this task.
    if (taskModel.family !== sample.modelFamily) return Number.POSITIVE_INFINITY;
  }
  const features = sample.features;
  let distance = task.modelId === sample.modelId ? 0 : 3;
  if (taskModel.variant && sample.modelVariant && taskModel.variant !== sample.modelVariant) distance += 1;
  const compareNumber = (key: string, value: number | undefined): void => {
    distance += numericDistance(value, typeof features[key] === "number" ? features[key] : undefined);
  };
  const compareText = (key: string, value: string | undefined): void => {
    const historical = features[key];
    if (value && typeof historical === "string" && value !== historical) distance += 1.5;
  };
  const compareBoolean = (key: string, value: boolean | undefined): void => {
    const historical = features[key];
    if (value != null && typeof historical === "boolean" && value !== historical) distance += 1;
  };

  if (task.taskType === "image-generation") {
    compareText("qualityProfile", task.qualityProfile);
    compareText("aspectRatio", task.aspectRatio);
    compareText("targetResolution", String(task.targetResolution ?? ""));
    compareNumber("width", task.outputWidth);
    compareNumber("height", task.outputHeight);
    compareNumber("pictureCount", task.pictures.length);
    compareNumber("outputCount", task.outputCount);
  } else if (task.taskType === "upscale") {
    compareNumber("targetHeight", task.targetHeight);
    compareNumber("duration", task.duration);
    compareNumber("fps", task.fps);
    compareText("tileMode", task.tileMode);
    compareBoolean("faceRestore", task.faceRestore);
  } else {
    compareNumber("resolution", task.resolution);
    compareNumber("duration", task.duration);
    compareNumber("steps", task.steps);
    compareNumber("fps", task.fps);
    compareText("frameInterpolation", task.frameInterpolation);
    compareText("spectrumMode", task.spectrumMode);
    compareText("spectrumModelAwareMode", task.spectrumModelAwareMode);
    compareText("loras", loraSignature(task.videoLoras));
    compareText("sourceMode", task.taskType === "extension" ? "video" : "image");
    compareNumber(
      "referenceCount",
      task.taskType === "generation"
        ? (task.h3ReferenceSlots?.filter((slot) => Boolean(slot.mediaPath)).length || (task.startImagePath ? 1 : 0))
        : 0
    );
    compareBoolean("hasEndImage", task.taskType === "generation" && Boolean(task.endImagePath));
  }
  return distance;
}

function weightedMedian(samples: ReadonlyArray<{ seconds: number; weight: number }>): number | null {
  if (!samples.length) return null;
  const ordered = [...samples].sort((left, right) => left.seconds - right.seconds);
  const totalWeight = ordered.reduce((sum, sample) => sum + sample.weight, 0);
  let accumulated = 0;
  for (const sample of ordered) {
    accumulated += sample.weight;
    if (accumulated >= totalWeight / 2) return sample.seconds;
  }
  return ordered.at(-1)?.seconds ?? null;
}

function nearestSamples(
  task: QueueTask,
  history: QueueEstimateHistory
): EstimateSample[] {
  const samples = [
    ...videoHistorySamples(history.video),
    ...imageHistorySamples(history.image ?? [])
  ]
    .map((sample) => ({ sample, distance: featureDistance(task, sample) }))
    .filter((item) => Number.isFinite(item.distance))
    .sort((left, right) => {
      const distance = left.distance - right.distance;
      if (distance !== 0) return distance;
      const leftTime = left.sample.recordedAt ? Date.parse(left.sample.recordedAt) : Number.NaN;
      const rightTime = right.sample.recordedAt ? Date.parse(right.sample.recordedAt) : Number.NaN;
      if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
        return rightTime - leftTime;
      }
      return 0;
    });
  if (!samples.length) return [];
  // Exact parameter matches are the strongest signal. If none exist, use a
  // small nearest-neighbour window for the same model and task type instead
  // of averaging unrelated resolutions or workflows.
  const exact = samples.filter((item) => item.distance === 0);
  return (exact.length ? exact : samples.slice(0, 8)).map((item) => item.sample);
}

function taskRunCount(task: QueueTask): number {
  if (task.taskType !== "image-generation") return 1;
  // The task-level progress already includes completed runs (the executor
  // advances it after each output). Keep the total estimate for the whole
  // batch so the running-task progress calculation does not subtract completed
  // outputs twice.
  return Math.max(1, task.outputCount || task.runs.length || 1);
}

/** Estimated total seconds for a task, based on matching completed history. */
export function estimateQueueTaskSeconds(
  task: QueueTask,
  history: QueueEstimateHistory
): number | null {
  const samples = nearestSamples(task, history);
  if (!samples.length) return null;
  const estimate = weightedMedian(samples.map((sample, index) => ({
    seconds: scaledSampleSeconds(sample, task),
    // The nearest sample is more representative than later fallbacks.
    weight: 1 / (1 + index * 0.35)
  })));
  return estimate == null ? null : estimate * taskRunCount(task);
}

function clampProgress(value: number | undefined): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value as number : 0));
}

/** Estimated seconds still remaining for one queued task. */
export function estimateQueueTaskRemainingSeconds(
  task: QueueTask,
  history: QueueEstimateHistory,
  now = Date.now()
): number | null {
  const total = estimateQueueTaskSeconds(task, history);
  const progress = clampProgress(task.progress);
  if (task.status !== "running") return total;

  const startedAt = task.startedAt ? Date.parse(task.startedAt) : Number.NaN;
  const elapsed = Number.isFinite(startedAt) ? Math.max(0, (now - startedAt) / 1000) : 0;
  if (total == null) {
    if (progress < 2 || elapsed <= 0) return null;
    return Math.max(0, elapsed * (100 - progress) / progress);
  }
  if (progress < 2 || elapsed <= 0) return total;

  const knownTotal = total;
  const historyRemaining = knownTotal * (1 - progress / 100);
  const observedTotal = elapsed / (progress / 100);
  const observedRemaining = Math.max(0, observedTotal - elapsed);
  const ratio = observedTotal / Math.max(1, knownTotal);
  // Progress is pipeline-level and not perfectly linear. Trust the observed
  // slope gradually, and damp it when a load/offload stage produces an
  // implausible outlier rather than replacing the historical signal outright.
  let observedWeight = Math.min(0.65, Math.max(0.12, progress / 100 * 0.65));
  if (ratio < 0.35 || ratio > 3.5) observedWeight *= 0.25;
  return Math.max(0, historyRemaining * (1 - observedWeight) + observedRemaining * observedWeight);
}

/** Estimated remaining seconds for all waiting/running work in queue order. */
export function estimateQueueRemainingSeconds(
  tasks: ReadonlyArray<QueueTask>,
  history: QueueEstimateHistory,
  now = Date.now()
): number | null {
  const active = tasks.filter((task) => task.status === "waiting" || task.status === "running");
  const estimates = active.map((task) => estimateQueueTaskRemainingSeconds(task, history, now));
  const knownEstimates = estimates.filter((value): value is number => value != null);
  // Do not hide the total just because one newly introduced model has no
  // history yet. The known portion is still useful, and the unknown task will
  // switch to an observed slope as soon as it starts. If nothing is known,
  // retain the explicit “waiting for history” state.
  if (!knownEstimates.length) return estimates.length ? null : 0;
  return knownEstimates.reduce((total, value) => total + value, 0);
}
