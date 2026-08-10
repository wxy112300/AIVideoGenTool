import type { HistoryAsset, ImageGenerationQueueTask, QueueTask } from "../types.js";

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
  let target = index + direction;
  while (target >= 0 && target < next.length && next[target]?.status !== "waiting") {
    target += direction;
  }
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}
