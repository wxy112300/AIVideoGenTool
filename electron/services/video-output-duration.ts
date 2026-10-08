import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { HistoryFile } from "../../src/types.js";

const execFileAsync = promisify(execFile);

export function videoDurationFromProbe(output: string): number | null {
  const stream = JSON.parse(output).streams?.[0];
  const duration = Number(stream?.duration);
  if (Number.isFinite(duration) && duration > 0) return duration;
  const [numerator, denominator = "1"] = String(stream?.avg_frame_rate ?? "").split("/");
  const fps = Number(numerator) / Number(denominator);
  const frames = Number(stream?.nb_frames);
  const derived = frames / fps;
  return Number.isFinite(fps) && fps > 0 && Number.isFinite(derived) && derived > 0
    ? derived : null;
}

// Probe the delivered video, not an AV segment or the longer audio/container track.
// A missing probe must not discard an otherwise successful generation.
export async function probeVideoOutputDuration(files: HistoryFile[]): Promise<number | null> {
  const file = files.find(item => /\.(mp4|webm|mov|mkv)$/iu.test(item.filename));
  if (!file?.absolutePath) return null;
  try {
    if (!(await fs.stat(file.absolutePath)).isFile()) return null;
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=duration,nb_frames,avg_frame_rate", "-of", "json", file.absolutePath
    ], { encoding: "utf8", windowsHide: true, timeout: 5_000, maxBuffer: 64 * 1024 });
    return videoDurationFromProbe(stdout);
  } catch {
    return null;
  }
}
