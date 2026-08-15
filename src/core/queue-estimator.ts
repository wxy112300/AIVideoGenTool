import type {
  AssetVersion,
  HistoryAsset,
  ImageAssetVersion,
  ImageHistoryProject,
  QueueTask
} from "../types.js";

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
  seconds: number;
  features: Record<string, string | number | boolean | undefined>;
}

const MAX_REASONABLE_SECONDS = 24 * 60 * 60;

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
  loras: ReadonlyArray<{ id: string }> | undefined
): string {
  return (loras ?? []).map((lora) => lora.id).sort().join(",");
}

function videoSample(
  asset: HistoryAsset,
  version: AssetVersion,
  seconds: number
): EstimateSample {
  const taskType: QueueTask["taskType"] = version.kind === "upscale"
    ? "upscale"
    : asset.inputMode === "video" ? "extension" : "generation";
  return {
    taskType,
    modelId: version.modelId || asset.modelId,
    seconds,
    features: taskType === "upscale"
      ? {
          targetHeight: version.height,
          duration: version.duration,
          fps: version.fps,
          tileMode: version.tileMode,
          faceRestore: version.faceRestore
        }
      : {
          resolution: asset.resolution,
          duration: version.duration,
          steps: version.steps ?? asset.steps,
          fps: version.fps,
          frameInterpolation: version.frameInterpolation ?? asset.frameInterpolation,
          spectrumMode: version.spectrumMode ?? asset.spectrumMode,
          spectrumModelAwareMode: version.spectrumModelAwareMode ?? asset.spectrumModelAwareMode,
          loras: loraSignature(version.videoLoras ?? asset.videoLoras),
          sourceMode: asset.inputMode
        }
  };
}

function imageSample(
  version: ImageAssetVersion,
  seconds: number
): EstimateSample {
  return {
    taskType: "image-generation",
    modelId: version.modelId,
    seconds,
    features: {
      qualityProfile: version.qualityProfile,
      targetResolution: version.targetResolution,
      width: version.width,
      height: version.height,
      pictureCount: version.references.length,
      outputCount: version.outputCount
    }
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
  if (task.taskType !== sample.taskType || task.modelId !== sample.modelId) return Number.POSITIVE_INFINITY;
  const features = sample.features;
  let distance = 0;
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
    .sort((left, right) => left.distance - right.distance);
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
    seconds: sample.seconds,
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
  if (knownEstimates.length !== estimates.length) return null;
  return knownEstimates.reduce((total, value) => total + value, 0);
}
