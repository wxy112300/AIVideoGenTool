import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { ExtensionQueueTask, PromptExtensionSource } from "../../src/types.js";
import {
  extensionContextDuration,
  extensionOutputDimensions,
  frameInterpolationMultiplier,
  continuumVisibleFrameCountForTask,
  isMiniMaxH3ContinuumModel,
  isMiniMaxH3Fl2vaModel,
  isMiniMaxH3R2vModel
} from "../../src/core/workflow.js";

const execFileAsync = promisify(execFile);

async function run(
  executable: "ffmpeg" | "ffprobe",
  args: string[],
  signal?: AbortSignal
): Promise<string> {
  const result = await execFileAsync(executable, args, {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
    signal
  });
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function scaleFilter(width: number, height: number, fps: number): string {
  return [
    `fps=${fps}`,
    `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
    "setsar=1"
  ].join(",");
}

function temporaryDirectory(taskId: string): string {
  return path.join(os.tmpdir(), "local-video-studio", taskId);
}

export async function prepareExtensionContext(
  task: ExtensionQueueTask,
  signal: AbortSignal
): Promise<{ filePath: string; cleanup(): Promise<void> }> {
  const directory = temporaryDirectory(task.id);
  await fs.rm(directory, { recursive: true, force: true });
  await fs.mkdir(directory, { recursive: true });
  const filePath = path.join(directory, "context.mp4");
  const contextDuration = extensionContextDuration(task);
  const contextStart = Math.max(
    task.trimStartSeconds,
    task.trimEndSeconds - contextDuration
  );
  const sourceFps = task.fps / frameInterpolationMultiplier(task);
  const [width, height] = extensionOutputDimensions(task);
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    String(contextStart),
    "-i",
    task.sourceVideoPath,
    "-t",
    String(contextDuration),
    "-vf",
    scaleFilter(width, height, sourceFps),
    "-frames:v",
    String(task.overlapFrames),
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "17",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    filePath
  ], signal);
  const stat = await fs.stat(filePath);
  if (stat.size <= 0) throw new Error("FFmpeg 没有生成可用的续写上下文视频");
  return {
    filePath,
    cleanup: () => fs.rm(directory, { recursive: true, force: true })
  };
}

export async function prepareH3BoundaryFrame(
  task: ExtensionQueueTask,
  signal: AbortSignal
): Promise<{ filePath: string; cleanup(): Promise<void> }> {
  const directory = temporaryDirectory(task.id);
  await fs.rm(directory, { recursive: true, force: true });
  await fs.mkdir(directory, { recursive: true });
  const filePath = path.join(directory, "h3-boundary.png");
  const [width, height] = extensionOutputDimensions(task);
  const frameTime = Math.max(
    task.trimStartSeconds,
    task.trimEndSeconds - 1 / 24
  );
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-ss", String(frameTime),
    "-i", task.sourceVideoPath,
    "-frames:v", "1",
    "-vf", [
      `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
      "setsar=1"
    ].join(","),
    filePath
  ], signal);
  const stat = await fs.stat(filePath);
  if (stat.size <= 0) throw new Error("FFmpeg 没有提取出可用的 H3 接续边界帧");
  return {
    filePath,
    cleanup: () => fs.rm(directory, { recursive: true, force: true })
  };
}

export async function preparePromptExtensionFrame(
  source: PromptExtensionSource,
  operationId: string,
  signal: AbortSignal
): Promise<{ filePath: string; cleanup(): Promise<void> }> {
  if (!source.filePath.trim()) throw new Error("续写提示词增强缺少源视频路径");
  if (!Number.isFinite(source.trimStartSeconds) ||
      !Number.isFinite(source.trimEndSeconds) ||
      source.trimEndSeconds <= source.trimStartSeconds) {
    throw new Error("续写提示词增强的裁剪区间无效");
  }
  const sourceStat = await fs.stat(source.filePath).catch(() => null);
  if (!sourceStat?.isFile()) throw new Error("续写提示词增强找不到源视频文件");
  const directory = temporaryDirectory(`prompt-${operationId}`);
  await fs.rm(directory, { recursive: true, force: true });
  await fs.mkdir(directory, { recursive: true });
  const filePath = path.join(directory, "extension-boundary.png");
  try {
    const sourceDuration = await probeVideoDuration(source.filePath, signal);
    if (sourceDuration != null && source.trimStartSeconds >= sourceDuration) {
      throw new Error("续写提示词增强的裁剪起点已超出源视频时长");
    }
    const frameTime = promptExtensionFrameTime(source, sourceDuration);
    // Some containers report a duration that is a little later than their
    // last decodable frame. Try the requested boundary first, then move
    // backwards without ever crossing the selected trim start. This keeps
    // the fallback tied to the user's trim end instead of accidentally
    // sampling the physical end of a longer source video.
    const candidateTimes = [
      frameTime,
      frameTime - 1 / 48,
      frameTime - 1 / 24,
      frameTime - 3 / 24,
      frameTime - 8 / 24,
      frameTime - 0.5
    ].map((value) => Math.max(source.trimStartSeconds, value))
      .filter((value, index, values) =>
        Number.isFinite(value) && values.indexOf(value) === index
      );
    let lastError: unknown;
    for (const [index, candidateTime] of candidateTimes.entries()) {
      const seekModes = index === 0 ? ["fast", "accurate"] as const : ["accurate"] as const;
      for (const seekMode of seekModes) {
        await fs.rm(filePath, { force: true }).catch(() => undefined);
        try {
          await run("ffmpeg", [
            "-hide_banner", "-loglevel", "error", "-y",
            ...(seekMode === "fast"
              ? ["-ss", String(candidateTime), "-i", source.filePath]
              : ["-i", source.filePath, "-ss", String(candidateTime)]),
            "-map", "0:v:0",
            "-frames:v", "1",
            "-an",
            filePath
          ], signal);
        } catch (error) {
          if (signal.aborted) throw error;
          lastError = error;
          continue;
        }
        const stat = await fs.stat(filePath).catch(() => null);
        if (stat?.isFile() && stat.size > 0) {
          return {
            filePath,
            cleanup: () => fs.rm(directory, { recursive: true, force: true })
          };
        }
        lastError = new Error(`FFmpeg 未在 ${candidateTime.toFixed(3)} 秒生成边界帧`);
      }
    }
    throw new Error(
      "FFmpeg 没有提取出可用的续写末帧；请确认源视频包含可解码的视频轨道，且裁剪范围没有超出视频时长。",
      lastError instanceof Error ? { cause: lastError } : undefined
    );
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

async function probeVideoDuration(
  filename: string,
  signal: AbortSignal
): Promise<number | null> {
  try {
    const output = await run("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filename
    ], signal);
    const duration = Number.parseFloat(output.trim().split(/\s+/u)[0] ?? "");
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  } catch (error) {
    if (signal.aborted) throw error;
    return null;
  }
}

export function promptExtensionFrameTime(
  source: Pick<PromptExtensionSource, "trimStartSeconds" | "trimEndSeconds">,
  sourceDuration?: number | null
): number {
  const end = Number.isFinite(sourceDuration) && (sourceDuration ?? 0) > 0
    ? Math.min(source.trimEndSeconds, sourceDuration!)
    : source.trimEndSeconds;
  return Math.max(source.trimStartSeconds, end - 1 / 24);
}

export async function prepareH3MotionContext(
  task: ExtensionQueueTask,
  signal: AbortSignal
): Promise<{ filePath: string; cleanup(): Promise<void> }> {
  const directory = temporaryDirectory(task.id);
  await fs.rm(directory, { recursive: true, force: true });
  await fs.mkdir(directory, { recursive: true });
  const filePath = path.join(directory, "h3-motion-context.mp4");
  const contextFrames = 22;
  const contextDuration = contextFrames / 24;
  const contextStart = Math.max(
    task.trimStartSeconds,
    task.trimEndSeconds - contextDuration
  );
  const [width, height] = extensionOutputDimensions(task);
  const sourceHasAudio = await hasAudioStream(task.sourceVideoPath, signal);
  const args = [
    "-hide_banner", "-loglevel", "error", "-y",
    "-ss", String(contextStart),
    "-i", task.sourceVideoPath
  ];
  if (!sourceHasAudio) {
    args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=32000");
  }
  args.push(
    "-t", String(contextDuration),
    "-map", "0:v:0",
    "-map", sourceHasAudio ? "0:a:0" : "1:a:0",
    "-vf", scaleFilter(width, height, 24),
    "-frames:v", String(contextFrames),
    "-c:v", "libx264", "-preset", "fast", "-crf", "17", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-ar", "32000", "-ac", "2",
    "-shortest", "-movflags", "+faststart",
    filePath
  );
  await run("ffmpeg", args, signal);
  const stat = await fs.stat(filePath);
  if (stat.size <= 0) throw new Error("FFmpeg 没有生成可用的 H3 运动与音频上下文");
  return {
    filePath,
    cleanup: () => fs.rm(directory, { recursive: true, force: true })
  };
}

async function hasAudioStream(filename: string, signal: AbortSignal): Promise<boolean> {
  try {
    const output = await run("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=index",
      "-of",
      "csv=p=0",
      filename
    ], signal);
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

function concatEntry(filename: string): string {
  return `file '${filename.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`;
}

export async function finalizeExtensionOutput(
  task: ExtensionQueueTask,
  generatedPath: string,
  signal: AbortSignal
): Promise<void> {
  const directory = temporaryDirectory(`${task.id}-finalize`);
  await fs.rm(directory, { recursive: true, force: true });
  await fs.mkdir(directory, { recursive: true });
  const retainedPath = path.join(directory, "retained.mp4");
  const continuationPath = path.join(directory, "continuation.mp4");
  const concatPath = path.join(directory, "concat.txt");
  const finalPath = path.join(directory, "final.mp4");
  const retainedDuration = task.trimEndSeconds - task.trimStartSeconds;
  const contextDuration = extensionContextDuration(task);
  const h3Continuum = isMiniMaxH3ContinuumModel(task.modelId);
  const h3MotionContext = isMiniMaxH3R2vModel(task.modelId);
  const audioRate = h3MotionContext || h3Continuum ? "32000" : "48000";
  const [width, height] = extensionOutputDimensions(task);
  const filter = scaleFilter(width, height, task.fps);
  const sourceHasAudio = await hasAudioStream(task.sourceVideoPath, signal);
  const generatedHasAudio = await hasAudioStream(generatedPath, signal);

  try {
    const retainedArgs = [
      "-hide_banner", "-loglevel", "error", "-y",
      "-ss", String(task.trimStartSeconds),
      "-i", task.sourceVideoPath
    ];
    if (!sourceHasAudio) {
      retainedArgs.push(
        "-f", "lavfi", "-i", `anullsrc=channel_layout=stereo:sample_rate=${audioRate}`
      );
    }
    retainedArgs.push(
      "-t", String(retainedDuration),
      "-map", "0:v:0",
      "-map", sourceHasAudio ? "0:a:0" : "1:a:0",
      "-vf", filter,
      "-c:v", "libx264", "-preset", "fast", "-crf", "17", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-ar", audioRate, "-ac", "2",
      "-shortest", retainedPath
    );
    await run("ffmpeg", retainedArgs, signal);

    const continuationArgs = [
      "-hide_banner", "-loglevel", "error", "-y",
      "-ss", String(
        h3MotionContext || h3Continuum
          ? 0
          : isMiniMaxH3Fl2vaModel(task.modelId)
            ? 1 / 24
            : contextDuration
      ),
      "-i", generatedPath
    ];
    if (!generatedHasAudio) {
      continuationArgs.push(
        "-f", "lavfi", "-i", `anullsrc=channel_layout=stereo:sample_rate=${audioRate}`
      );
    }
    if (isMiniMaxH3Fl2vaModel(task.modelId) || h3MotionContext || h3Continuum) {
      continuationArgs.push(
        "-t",
        String(h3Continuum ? continuumVisibleFrameCountForTask(task) / 24 : task.duration)
      );
    }
    continuationArgs.push(
      "-map", "0:v:0", "-map", generatedHasAudio ? "0:a:0" : "1:a:0",
      "-vf", filter,
      "-c:v", "libx264", "-preset", "fast", "-crf", "17", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-ar", audioRate, "-ac", "2",
      "-shortest", continuationPath
    );
    await run("ffmpeg", continuationArgs, signal);

    await fs.writeFile(
      concatPath,
      `${concatEntry(retainedPath)}\n${concatEntry(continuationPath)}\n`,
      "utf8"
    );
    await run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "concat", "-safe", "0", "-i", concatPath,
      "-c", "copy", "-movflags", "+faststart", finalPath
    ], signal);

    const replacement = `${generatedPath}.${task.id}.replacement.mp4`;
    const backup = `${generatedPath}.${task.id}.generated.mp4`;
    await fs.copyFile(finalPath, replacement);
    await fs.rename(generatedPath, backup);
    try {
      await fs.rename(replacement, generatedPath);
      await fs.rm(backup, { force: true });
    } catch (error) {
      await fs.rename(backup, generatedPath).catch(() => undefined);
      await fs.rm(replacement, { force: true }).catch(() => undefined);
      throw error;
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
