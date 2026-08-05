import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { ExtensionQueueTask } from "../../src/types.js";
import {
  extensionContextDuration,
  extensionOutputDimensions,
  frameInterpolationMultiplier,
  isMiniMaxH3Fl2vaModel
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
        "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"
      );
    }
    retainedArgs.push(
      "-t", String(retainedDuration),
      "-map", "0:v:0",
      "-map", sourceHasAudio ? "0:a:0" : "1:a:0",
      "-vf", filter,
      "-c:v", "libx264", "-preset", "fast", "-crf", "17", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-ar", "48000", "-ac", "2",
      "-shortest", retainedPath
    );
    await run("ffmpeg", retainedArgs, signal);

    const continuationArgs = [
      "-hide_banner", "-loglevel", "error", "-y",
      "-ss", String(
        isMiniMaxH3Fl2vaModel(task.modelId) ? 1 / 24 : contextDuration
      ),
      "-i", generatedPath
    ];
    if (!generatedHasAudio) {
      continuationArgs.push(
        "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"
      );
    }
    if (isMiniMaxH3Fl2vaModel(task.modelId)) {
      continuationArgs.push("-t", String(task.duration));
    }
    continuationArgs.push(
      "-map", "0:v:0", "-map", generatedHasAudio ? "0:a:0" : "1:a:0",
      "-vf", filter,
      "-c:v", "libx264", "-preset", "fast", "-crf", "17", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-ar", "48000", "-ac", "2",
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
