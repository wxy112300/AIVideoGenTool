import type {
  AssetVersion,
  HistoryAsset,
  ImageAssetVersion,
  ImageHistoryProject
} from "../../src/types";

export interface HistoryPerformanceFixture {
  videos: HistoryAsset[];
  images: ImageHistoryProject[];
}

function fixtureTime(index: number, versionIndex = 0): string {
  const base = Date.parse("2026-08-01T12:00:00.000Z");
  return new Date(base - (index * 7 + versionIndex) * 60_000).toISOString();
}

function dimensions(index: number, versionIndex = 0): { width: number; height: number } {
  const variant = (index + versionIndex) % 4;
  if (variant === 0) return { width: 1920, height: 1080 };
  if (variant === 1) return { width: 1080, height: 1920 };
  if (variant === 2) return { width: 1536, height: 1536 };
  return { width: 1280, height: 960 };
}

function videoVersion(index: number, versionIndex: number): AssetVersion {
  const { width, height } = dimensions(index, versionIndex);
  const hasFile = (index + versionIndex) % 11 !== 0;
  const filename = hasFile ? `history-video-${index}-v${versionIndex + 1}.mp4` : "";
  const createdAt = fixtureTime(index, versionIndex);
  return {
    id: `history-video-${index}-version-${versionIndex + 1}`,
    taskId: `history-video-task-${index}`,
    kind: versionIndex === 0 ? "original" : "upscale",
    createdAt,
    outputFilename: filename || `missing-history-video-${index}.mp4`,
    modelId: versionIndex === 0 ? "minimax_h3_fl2va" : "seedvr2",
    width,
    height,
    duration: 4 + (index % 13),
    fps: 24,
    promptVersion: 1,
    steps: 8,
    seed: 10_000 + index + versionIndex,
    workflowPath: "C:\\fixtures\\history-workflow.json",
    comfyPromptId: `history-prompt-${index}`,
    comfyOutputs: { fixture: true, index, versionIndex },
    startedAt: new Date(Date.parse(createdAt) - 2_000).toISOString(),
    files: filename
      ? [{
        filename,
        subfolder: "",
        type: "output",
        absolutePath: `C:\\fixtures\\${filename}`
      }]
      : []
  };
}

function videoAsset(index: number): HistoryAsset {
  const versionCount = index % 4 === 0 ? 2 : 1;
  const versions = Array.from({ length: versionCount }, (_, versionIndex) =>
    videoVersion(index, versionIndex)
  );
  const currentVersion = versions[versions.length - 1]!;
  return {
    mediaKind: "video",
    id: `history-video-${index}`,
    taskId: `history-video-task-${index}`,
    title: index % 17 === 0 ? "" : `Synthetic history video ${index}`,
    outputFilename: currentVersion.outputFilename,
    createdAt: versions[0]!.createdAt,
    updatedAt: currentVersion.createdAt,
    modelId: currentVersion.modelId,
    favorite: index % 9 === 0,
    rating: index % 6 === 0 ? 4 : null,
    tags: index % 3 === 0 ? ["fixture", "wide"] : ["fixture"],
    duration: currentVersion.duration,
    resolution: Math.min(currentVersion.width, currentVersion.height),
    fps: currentVersion.fps,
    prompt: `Synthetic video prompt ${index}`,
    seed: 10_000 + index,
    promptVersion: 1,
    comfyPromptId: currentVersion.comfyPromptId,
    comfyOutputs: currentVersion.comfyOutputs,
    files: currentVersion.files,
    defaultVersionId: currentVersion.id,
    versions
  };
}

function imageVersion(index: number, versionIndex: number): ImageAssetVersion {
  const { width, height } = dimensions(index, versionIndex);
  const hasFile = (index + versionIndex * 2) % 9 !== 0;
  const filename = hasFile ? `history-image-${index}-v${versionIndex + 1}.png` : "";
  const createdAt = fixtureTime(index, versionIndex);
  return {
    id: `history-image-${index}-version-${versionIndex + 1}`,
    versionNumber: versionIndex + 1,
    kind: versionIndex === 0 ? "source" : "edit",
    parentVersionId: versionIndex > 0 ? `history-image-${index}-version-1` : undefined,
    createdAt,
    modelId: versionIndex === 0 ? "source" : "qwen-image-edit-2511",
    workflowPath: "C:\\fixtures\\history-image-workflow.json",
    prompt: versionIndex === 0 ? "" : `Synthetic image edit prompt ${index}`,
    promptVersion: 1,
    references: [],
    steps: versionIndex === 0 ? undefined : 8,
    cfg: versionIndex === 0 ? undefined : 3,
    seed: 20_000 + index + versionIndex,
    width,
    height,
    format: "png",
    file: {
      filename,
      subfolder: "",
      type: versionIndex === 0 ? "input" : "output",
      ...(filename ? { absolutePath: `C:\\fixtures\\${filename}` } : {})
    },
    comfyPromptId: `history-image-prompt-${index}`,
    comfyOutputs: { fixture: true, index, versionIndex },
    performanceStats: versionIndex === 0 ? undefined : { durationSeconds: 3 }
  };
}

function imageProject(index: number): ImageHistoryProject {
  const versionCount = index % 5 === 0 ? 2 : 1;
  const versions = Array.from({ length: versionCount }, (_, versionIndex) =>
    imageVersion(index, versionIndex)
  );
  const pinned = index % 8 === 0;
  return {
    mediaKind: "image",
    id: `history-image-${index}`,
    title: index % 19 === 0 ? "" : `Synthetic history image ${index}`,
    createdAt: versions[0]!.createdAt,
    updatedAt: versions[versions.length - 1]!.createdAt,
    favorite: index % 10 === 0,
    rating: index % 7 === 0 ? 4.5 : null,
    tags: index % 2 === 0 ? ["fixture", "portrait"] : ["fixture"],
    coverMode: pinned ? "pinned" : "auto",
    coverVersionId: pinned ? versions[0]!.id : undefined,
    nextVersionNumber: versionCount + 1,
    versions
  };
}

export function createHistoryPerformanceFixture(count = 500): HistoryPerformanceFixture {
  const safeCount = Math.max(0, Math.floor(count));
  return {
    videos: Array.from({ length: safeCount }, (_, index) => videoAsset(index)),
    images: Array.from({ length: safeCount }, (_, index) => imageProject(index))
  };
}