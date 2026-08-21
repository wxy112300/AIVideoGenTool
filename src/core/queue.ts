import type {
  AppState,
  HistoryAsset,
  ImageGenerationQueueTask,
  QueueTask,
  UpscaleQueueTask
} from "../types.js";
import { createOutputFilename } from "./filename.js";
import { uniqueUpscaleFilename } from "./upscale.js";

export function isImageGenerationQueueTask(
  task: QueueTask
): task is ImageGenerationQueueTask {
  return task.taskType === "image-generation";
}

const videoExtensions = new Set([".mp4", ".webm", ".mov", ".m4v", ".mkv"]);

function videoFilePathForVersion(
  history: HistoryAsset[],
  assetId: string | undefined,
  versionId: string | undefined
): string | undefined {
  if (!assetId || !versionId) return undefined;
  const asset = history.find((item) => item.id === assetId);
  const version = asset?.versions.find((item) => item.id === versionId);
  return version?.files.find((file) =>
    Boolean(file.absolutePath) && videoExtensions.has(file.filename.slice(file.filename.lastIndexOf(".")).toLowerCase())
  )?.absolutePath;
}

export function syncQueueVideoInputPaths(
  queue: QueueTask[],
  history: HistoryAsset[]
): QueueTask[] {
  return queue.map((task) => {
    if (task.taskType === "extension") {
      const sourceVideoPath = videoFilePathForVersion(
        history,
        task.sourceAssetId,
        task.sourceVersionId
      );
      return sourceVideoPath && sourceVideoPath !== task.sourceVideoPath
        ? { ...task, sourceVideoPath, updatedAt: new Date().toISOString() }
        : task;
    }
    if (task.taskType === "upscale") {
      const sourceFilePath = videoFilePathForVersion(
        history,
        task.sourceAssetId,
        task.sourceVersionId
      );
      return sourceFilePath && sourceFilePath !== task.sourceFilePath
        ? { ...task, sourceFilePath, updatedAt: new Date().toISOString() }
        : task;
    }
    return task;
  });
}

export function moveWaitingTask(
  queue: QueueTask[],
  taskId: string,
  direction: -1 | 1
): QueueTask[] {
  const next = [...queue];
  const index = next.findIndex((task) => task.id === taskId);
  if (index < 0 || next[index]?.status !== "waiting") return next;

  // The currently running task is a hard execution boundary. A persisted or
  // concurrently updated queue can temporarily contain waiting items on both
  // sides of it, but a reorder must never move an item across that boundary:
  // the executor always consumes the first waiting item it finds and the
  // active task must remain the one already in flight.
  const runningIndex = next.findIndex((task) => task.status === "running");
  if (runningIndex >= 0 && index < runningIndex) return next;

  let target = index + direction;
  while (target >= 0 && target < next.length && next[target]?.status !== "waiting") {
    target += direction;
  }
  if (target < 0 || target >= next.length) return next;
  if (runningIndex >= 0 && target < runningIndex) return next;
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export type UpscaleTaskPatch = Pick<
  UpscaleQueueTask,
  "targetWidth" | "targetHeight" | "modelId" | "workflowPath" |
  "tileMode" | "faceRestore" | "outputFilename"
>;

export function updateQueuedUpscaleTask(
  queue: QueueTask[],
  taskId: string,
  patch: UpscaleTaskPatch,
  updatedAt = new Date().toISOString()
): QueueTask[] {
  return queue.map((task) => {
    if (
      task.id !== taskId ||
      task.taskType !== "upscale" ||
      !["waiting", "failed", "cancelled"].includes(task.status)
    ) return task;
    const resetFailure = task.status === "failed" || task.status === "cancelled";
    return {
      ...task,
      ...patch,
      seedVr2Checkpoint: undefined,
      seedVr2Progress: undefined,
      tileMode: patch.tileMode ?? task.tileMode,
      ...(resetFailure ? {
        status: "waiting" as const,
        error: undefined,
        progress: 0,
        stage: undefined,
        startedAt: undefined,
        comfyPromptId: undefined,
        automaticRetryAttempt: undefined
      } : {}),
      updatedAt
    };
  });
}

export function removeQueueTask(queue: QueueTask[], taskId: string): QueueTask[] {
  return queue.filter((task) => task.id !== taskId || task.status === "running");
}

export interface QueueMutationClock {
  now(): Date;
  id(): string;
  random(): number;
}

const defaultClock: QueueMutationClock = {
  now: () => new Date(),
  id: () => crypto.randomUUID(),
  random: () => Math.random()
};

export function duplicateQueueTask(
  state: AppState,
  taskId: string,
  clock: QueueMutationClock = defaultClock
): QueueTask[] {
  const source = state.queue.find((task) => task.id === taskId);
  if (!source) return state.queue;
  if (isImageGenerationQueueTask(source)) {
    throw new Error("图片批次复制将在图片编辑页面接入。");
  }
  const now = clock.now().toISOString();
  const names = [
    ...state.queue.map((task) => task.outputFilename),
    ...state.history.map((asset) => asset.outputFilename)
  ];
  const outputFilename = source.taskType === "generation" || source.taskType === "extension"
    ? createOutputFilename(source.modelId, source.resolution, source.duration, names)
    : uniqueUpscaleFilename(source.sourceFilename, source.targetHeight, names);
  return [...state.queue, {
    ...source,
    id: clock.id(),
    status: "waiting",
    createdAt: now,
    updatedAt: now,
    outputFilename,
    seed: source.keepSeedOnCopy
      ? source.seed
      : Math.floor(clock.random() * Number.MAX_SAFE_INTEGER),
    comfyPromptId: undefined,
    progress: 0,
    error: undefined,
    stage: undefined,
    automaticRetryAttempt: undefined,
    ...(source.taskType === "upscale"
      ? { seedVr2Checkpoint: undefined, seedVr2Progress: undefined }
      : {})
  }];
}

export function resetQueueTask(
  queue: QueueTask[],
  taskId: string,
  updatedAt = new Date().toISOString()
): { queue: QueueTask[]; reset: boolean } {
  let reset = false;
  const next = queue.map((task) => {
    if (task.id !== taskId || (task.status !== "failed" && task.status !== "cancelled")) {
      return task;
    }
    reset = true;
    return {
      ...task,
      status: "waiting" as const,
      updatedAt,
      comfyPromptId: undefined,
      progress: 0,
      error: undefined,
      stage: undefined,
      startedAt: undefined,
      automaticRetryAttempt: undefined,
      ...(task.taskType === "upscale" ? { seedVr2Progress: undefined } : {})
    };
  });
  return { queue: next, reset };
}
