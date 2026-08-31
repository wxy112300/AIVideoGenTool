import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type {
  AppState,
  HistoryFile,
  SeedVr2UpscaleCheckpoint,
  Settings,
  UpscaleQueueTask
} from "../../src/types.js";
import {
  nativeSeedVr2SegmentPlan,
  upscaleDimensions,
  type NativeSeedVr2SegmentPlan
} from "../../src/core/upscale.js";
import { isVideoOutputFilename } from "../../src/core/comfy-output.js";
import { submitTask, waitForTask, type PreviewFrameMetadata } from "./comfy-ui.js";
import type { AppLogger } from "../../src/infrastructure/app-logger.js";
import { getComputeResourceSnapshot } from "./performance.js";

const execFileAsync = promisify(execFile);
const segmentMarker = ".__lvs-segment-";

function segmentOutputFilename(filename: string, index: number): string {
  const marker = `${segmentMarker}${String(index + 1).padStart(4, "0")}`;
  return filename.replace(/\.mp4$/iu, `${marker}.mp4`);
}

function finalOutputPath(segmentPath: string): string {
  return segmentPath.replace(/\.__lvs-segment-\d{4}/iu, "");
}

function concatEntry(filename: string): string {
  return `file '${filename.replace(/\\/gu, "/").replace(/'/gu, "'\\''")}'`;
}

async function usableFile(file: HistoryFile | undefined): Promise<boolean> {
  if (!file?.absolutePath || !isVideoOutputFilename(file.filename)) return false;
  const stat = await fs.stat(file.absolutePath).catch(() => null);
  return Boolean(stat?.isFile() && stat.size > 0);
}

function matchingCheckpoint(
  checkpoint: SeedVr2UpscaleCheckpoint | undefined,
  plan: NativeSeedVr2SegmentPlan
): SeedVr2UpscaleCheckpoint {
  if (
    checkpoint?.planVersion === plan.planVersion &&
    checkpoint.framesPerSegment === plan.framesPerSegment &&
    checkpoint.totalFrames === plan.totalFrames &&
    checkpoint.totalSegments === plan.segments.length
  ) {
    return checkpoint;
  }
  return {
    planVersion: 2,
    framesPerSegment: plan.framesPerSegment,
    totalFrames: plan.totalFrames,
    totalSegments: plan.segments.length,
    targetWidth: plan.targetWidth,
    targetHeight: plan.targetHeight,
    systemMemoryTotalBytes: plan.systemMemoryTotalBytes,
    systemMemoryAvailableBytes: plan.systemMemoryAvailableBytes,
    vramTotalBytes: plan.vramTotalBytes,
    vramAvailableBytes: plan.vramAvailableBytes,
    preprocessingBudgetBytes: plan.preprocessingBudgetBytes,
    vramFrameLimit: plan.vramFrameLimit,
    completed: []
  };
}

async function concatSeedVr2Segments(
  taskId: string,
  files: HistoryFile[],
  signal: AbortSignal
): Promise<{ file: HistoryFile; intermediatePaths: string[] }> {
  const paths = files.map((file) => file.absolutePath).filter((value): value is string => Boolean(value));
  if (paths.length !== files.length || paths.length < 2) {
    throw new Error("SeedVR2 分段输出不完整，无法合并最终视频。");
  }
  const outputPath = finalOutputPath(paths[0]!);
  if (outputPath === paths[0]) throw new Error("SeedVR2 分段输出文件名无效，无法确定最终文件名。");
  const directory = path.join(os.tmpdir(), "local-video-studio", `${taskId}-seedvr2-concat`);
  const concatPath = path.join(directory, "segments.txt");
  const temporaryOutput = path.join(directory, path.basename(outputPath));
  await fs.rm(directory, { recursive: true, force: true });
  await fs.mkdir(directory, { recursive: true });
  try {
    await fs.writeFile(concatPath, `${paths.map(concatEntry).join("\n")}\n`, "utf8");
    await execFileAsync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "concat", "-safe", "0", "-i", concatPath,
      "-c", "copy", "-fflags", "+genpts", "-avoid_negative_ts", "make_zero",
      "-movflags", "+faststart", temporaryOutput
    ], {
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
      signal
    });
    const stat = await fs.stat(temporaryOutput).catch(() => null);
    if (!stat?.isFile() || stat.size <= 0) throw new Error("FFmpeg 没有生成可用的 SeedVR2 合并视频。");
    const replacement = `${outputPath}.${taskId}.replacement.mp4`;
    const backup = `${outputPath}.${taskId}.backup.mp4`;
    await fs.copyFile(temporaryOutput, replacement);
    const existing = await fs.stat(outputPath).catch(() => null);
    if (existing?.isFile()) await fs.rename(outputPath, backup);
    try {
      await fs.rename(replacement, outputPath);
      await fs.rm(backup, { force: true });
    } catch (error) {
      if (existing?.isFile()) await fs.rename(backup, outputPath).catch(() => undefined);
      await fs.rm(replacement, { force: true }).catch(() => undefined);
      throw error;
    }
    return {
      file: {
        ...files[0]!,
        filename: path.basename(outputPath),
        absolutePath: outputPath
      },
      intermediatePaths: paths
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

export interface ExecuteNativeSeedVr2UpscaleDependencies {
  settings: Settings;
  logger: AppLogger;
  signal: AbortSignal;
  updateTask(taskId: string, patch: Partial<UpscaleQueueTask>): Promise<AppState>;
  getTask(taskId: string): UpscaleQueueTask | undefined;
  requireExistingVideoOutput(result: unknown, alternateRoots?: string[]): Promise<HistoryFile[]>;
  isComputeActive(): boolean;
  onPreview(dataUrl: string, source?: "h3-tae" | "comfy", metadata?: PreviewFrameMetadata): void;
}

export interface NativeSeedVr2UpscaleResult {
  promptId: string;
  comfyOutputs: unknown;
  files: HistoryFile[];
  intermediatePaths: string[];
}

export async function executeNativeSeedVr2Upscale(
  task: UpscaleQueueTask,
  deps: ExecuteNativeSeedVr2UpscaleDependencies
): Promise<NativeSeedVr2UpscaleResult | null> {
  if (task.modelId !== "seedvr2-native-int8") return null;
  await deps.updateTask(task.id, {
    seedVr2Progress: {
      phase: "planning",
      currentSegment: 0,
      totalSegments: 0,
      completedSegments: 0,
      segmentProgress: 0
    },
    progress: 1,
    stage: "根据物理内存、显存与目标分辨率规划 SeedVR2 切片"
  });
  const measuredResources = await getComputeResourceSnapshot().catch(() => undefined);
  const resources = measuredResources
    ? {
        ...measuredResources,
        vramAvailableBytes: measuredResources.vramAvailableBytes == null
          ? null
          : Math.max(
              0,
              measuredResources.vramAvailableBytes - Math.max(0.5, deps.settings.vramReserveGb) * 1024 ** 3
            )
      }
    : undefined;
  const reusableFrames = task.seedVr2Checkpoint?.planVersion === 2
    ? task.seedVr2Checkpoint.framesPerSegment
    : undefined;
  const plan = nativeSeedVr2SegmentPlan(task, resources, reusableFrames);
  if (!plan) {
    await deps.updateTask(task.id, { seedVr2Progress: undefined });
    return null;
  }
  let checkpoint = matchingCheckpoint(task.seedVr2Checkpoint, plan);
  const validCompleted = [];
  for (const completed of checkpoint.completed) {
    const segment = plan.segments[completed.index];
    if (
      segment &&
      segment.startFrame === completed.startFrame &&
      segment.frameCount === completed.frameCount &&
      await usableFile(completed.file)
    ) validCompleted.push(completed);
  }
  checkpoint = { ...checkpoint, completed: validCompleted };
  const completedFrameCount = (): number => checkpoint.completed.reduce(
    (sum, segment) => sum + segment.frameCount,
    0
  );
  const firstIncompleteIndex = plan.segments.findIndex(
    (segment) => !checkpoint.completed.some((item) => item.index === segment.index)
  );
  const [targetWidth, targetHeight] = upscaleDimensions(
    task.sourceWidth,
    task.sourceHeight,
    task.targetHeight
  );
  await deps.updateTask(task.id, {
    seedVr2Checkpoint: checkpoint,
    seedVr2Progress: {
      phase: "segments",
      currentSegment: firstIncompleteIndex < 0 ? plan.segments.length : firstIncompleteIndex + 1,
      totalSegments: plan.segments.length,
      completedSegments: checkpoint.completed.length,
      segmentProgress: 0
    },
    progress: Math.min(94, completedFrameCount() / plan.totalFrames * 94),
    stage: `SeedVR2 自动分段 · ${checkpoint.completed.length}/${plan.segments.length}`
  });
  deps.logger.info("queue", "seedvr2-segment-plan", "Native SeedVR2 long video will run in resource-adaptive bounded segments", {
    taskId: task.id,
    totalFrames: plan.totalFrames,
    framesPerSegment: plan.framesPerSegment,
    totalSegments: plan.segments.length,
    targetWidth,
    targetHeight,
    tileMode: task.tileMode,
    resumedSegments: checkpoint.completed.length,
    systemMemoryTotalBytes: plan.systemMemoryTotalBytes ?? null,
    systemMemoryAvailableBytes: plan.systemMemoryAvailableBytes ?? null,
    vramTotalBytes: plan.vramTotalBytes ?? null,
    vramAvailableBytes: plan.vramAvailableBytes ?? null,
    preprocessingBudgetBytes: plan.preprocessingBudgetBytes,
    vramFrameLimit: plan.vramFrameLimit
  });

  let uploadedUpscaleSource: string | undefined;
  let lastPromptId = checkpoint.completed.at(-1)?.promptId ?? "";
  const outputSummaries: Array<{ index: number; promptId: string; output: unknown }> = [];
  for (const segment of plan.segments) {
    const existing = checkpoint.completed.find((item) => item.index === segment.index);
    if (existing && await usableFile(existing.file)) continue;
    const currentTask = deps.getTask(task.id) ?? task;
    const segmentTask: UpscaleQueueTask = {
      ...currentTask,
      outputFilename: segmentOutputFilename(task.outputFilename, segment.index),
      duration: segment.duration,
      seedVr2Checkpoint: checkpoint
    };
    await deps.updateTask(task.id, {
      seedVr2Progress: {
        phase: "segments",
        currentSegment: segment.index + 1,
        totalSegments: plan.segments.length,
        completedSegments: checkpoint.completed.length,
        segmentProgress: 0
      },
      progress: Math.min(94, segment.startFrame / plan.totalFrames * 94),
      stage: `SeedVR2 片段 ${segment.index + 1}/${plan.segments.length} · 提交工作流`
    });
    const submitted = await submitTask(segmentTask, deps.settings, deps.signal, {
      uploadedUpscaleSource,
      nativeSeedVr2Segment: {
        startTime: segment.startTime,
        duration: segment.duration
      }
    });
    uploadedUpscaleSource = submitted.uploadedUpscaleSource ?? uploadedUpscaleSource;
    lastPromptId = submitted.promptId;
    await deps.updateTask(task.id, {
      comfyPromptId: submitted.promptId,
      stage: `SeedVR2 片段 ${segment.index + 1}/${plan.segments.length} · 等待 ComfyUI`
    });
    deps.logger.info("comfy", "prompt-submitted", "SeedVR2 segment workflow submitted to ComfyUI", {
      taskId: task.id,
      modelId: task.modelId,
      promptId: submitted.promptId,
      segment: segment.index + 1,
      totalSegments: plan.segments.length,
      startFrame: segment.startFrame,
      frameCount: segment.frameCount
    });
    const result = await waitForTask(
      submitted.promptId,
      submitted.clientId,
      submitted.nodeTypes,
      deps.settings,
      90,
      deps.signal,
      (progress, stage) => {
        const localProgress = Math.max(0, Math.min(100, progress));
        const aggregate = (
          (segment.startFrame + segment.frameCount * localProgress / 100) /
          plan.totalFrames
        ) * 94;
        void deps.updateTask(task.id, {
          seedVr2Progress: {
            phase: "segments",
            currentSegment: segment.index + 1,
            totalSegments: plan.segments.length,
            completedSegments: checkpoint.completed.length,
            segmentProgress: localProgress
          },
          progress: Math.min(94, aggregate),
          stage: `SeedVR2 片段 ${segment.index + 1}/${plan.segments.length} · ${stage}`
        });
      },
      deps.onPreview,
      deps.isComputeActive,
      { taskId: task.id, modelId: task.modelId }
    );
    const files = await deps.requireExistingVideoOutput(result, [deps.settings.outputDirectory]);
    const file = files.find((candidate) => candidate.absolutePath && isVideoOutputFilename(candidate.filename));
    if (!file || !await usableFile(file)) {
      throw new Error(`SeedVR2 第 ${segment.index + 1} 段没有返回可用视频文件。`);
    }
    checkpoint = {
      ...checkpoint,
      completed: [
        ...checkpoint.completed.filter((item) => item.index !== segment.index),
        {
          index: segment.index,
          startFrame: segment.startFrame,
          frameCount: segment.frameCount,
          promptId: submitted.promptId,
          file
        }
      ].sort((a, b) => a.index - b.index)
    };
    outputSummaries.push({ index: segment.index, promptId: submitted.promptId, output: result });
    await deps.updateTask(task.id, {
      seedVr2Checkpoint: checkpoint,
      seedVr2Progress: {
        phase: "segments",
        currentSegment: Math.min(plan.segments.length, segment.index + 2),
        totalSegments: plan.segments.length,
        completedSegments: checkpoint.completed.length,
        segmentProgress: checkpoint.completed.length === plan.segments.length ? 100 : 0
      },
      progress: Math.min(94, completedFrameCount() / plan.totalFrames * 94),
      stage: `SeedVR2 自动分段 · 已完成 ${checkpoint.completed.length}/${plan.segments.length}`
    });
    deps.logger.info("queue", "seedvr2-segment-completed", "Native SeedVR2 segment completed and checkpointed", {
      taskId: task.id,
      segment: segment.index + 1,
      totalSegments: plan.segments.length,
      promptId: submitted.promptId
    });
  }

  const orderedFiles = plan.segments.map((segment) =>
    checkpoint.completed.find((item) => item.index === segment.index)?.file
  );
  if (orderedFiles.some((file) => !file)) throw new Error("SeedVR2 分段检查点不完整，无法合并最终视频。");
  await deps.updateTask(task.id, {
    seedVr2Progress: {
      phase: "merging",
      currentSegment: plan.segments.length,
      totalSegments: plan.segments.length,
      completedSegments: plan.segments.length,
      segmentProgress: 100
    },
    progress: 95,
    stage: "全部切片完成 · 合并 SeedVR2 分段并保留原音轨"
  });
  const merged = await concatSeedVr2Segments(task.id, orderedFiles as HistoryFile[], deps.signal);
  await deps.updateTask(task.id, { progress: 98 });
  deps.logger.info("queue", "seedvr2-segments-merged", "Native SeedVR2 segments were merged into the final video", {
    taskId: task.id,
    totalSegments: plan.segments.length,
    totalFrames: plan.totalFrames
  });
  return {
    promptId: lastPromptId,
    comfyOutputs: {
      segmentedSeedVr2: true,
      plan: {
        framesPerSegment: plan.framesPerSegment,
        totalFrames: plan.totalFrames,
        totalSegments: plan.segments.length
      },
      outputs: outputSummaries
    },
    files: [merged.file],
    intermediatePaths: merged.intermediatePaths
  };
}

export async function cleanupNativeSeedVr2Intermediates(
  paths: string[]
): Promise<{ removed: number; failed: number }> {
  const results = await Promise.all(paths.map(async (filename) => {
    try {
      await fs.rm(filename, { force: true });
      return true;
    } catch {
      return false;
    }
  }));
  const removed = results.filter(Boolean).length;
  return { removed, failed: results.length - removed };
}
