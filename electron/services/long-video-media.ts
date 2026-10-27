import { promises as fs, createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type { HistoryFile } from "../../src/types.js";
import { assertLongVideoMediaEvidence, type LongVideoExecutionSnapshot, type LongVideoMediaEvidence } from "../../src/core/long-video/execution.js";

const exec = promisify(execFile);
export async function hashLongVideoFile(filename: string, signal: AbortSignal) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename, { signal })) hash.update(chunk);
  return hash.digest("hex");
}
async function decodedAudioBytes(filename: string, signal: AbortSignal): Promise<number> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-v", "error", "-xerror", "-i", filename, "-map", "0:a:0", "-vn", "-c:a", "pcm_s16le", "-f", "s16le", "pipe:1"], { windowsHide: true, signal, stdio: ["ignore", "pipe", "pipe"] });
    let bytes = 0, error = "";
    child.stdout.on("data", (chunk: Buffer) => { bytes += chunk.length; });
    child.stderr.on("data", (chunk: Buffer) => { error = (error + chunk.toString()).slice(-8192); });
    child.on("error", reject);
    child.on("close", code => code === 0 && !error.trim() ? resolve(bytes) : reject(new Error(`Audio full decode failed: ${error}`)));
  });
}
/** Decode video with ffprobe -count_frames, audio to a counted PCM stream; never infer completion from requested seconds. */
export async function inspectLongVideoMedia(snapshot: LongVideoExecutionSnapshot, files: HistoryFile[], signal: AbortSignal): Promise<LongVideoMediaEvidence> {
  const file = files.find(file => /\.(mp4|mov|mkv|webm)$/iu.test(file.filename));
  if (!file?.absolutePath) throw new Error("Full-prefix output video is missing");
  const filename = file.absolutePath;
  const before = await fs.stat(filename);
  const { stdout, stderr } = await exec("ffprobe", ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,avg_frame_rate,nb_read_frames,duration_ts,time_base,sample_rate,channels", "-of", "json", filename], { windowsHide: true, signal, encoding: "utf8", maxBuffer: 128 * 1024 });
  if (stderr.trim()) throw new Error(`Video full decode failed: ${stderr}`);
  const streams = (JSON.parse(stdout) as { streams: Array<Record<string, string | number>> }).streams;
  const video = streams.find(stream => stream.codec_type === "video"), audio = streams.find(stream => stream.codec_type === "audio");
  if (!video || !audio) throw new Error("Full-prefix movie requires video and audio streams");
  const rational = (value: unknown) => { const [n, d = "1"] = String(value).split("/"); return Number(n) / Number(d); };
  const sampleRate = Number(audio.sample_rate), channels = Number(audio.channels);
  if (Number(video.width) !== snapshot.profile.width || Number(video.height) !== snapshot.profile.height || rational(video.avg_frame_rate) !== 24 ||
      !Number.isSafeInteger(channels) || channels < 1 || channels > 8 || !Number.isSafeInteger(sampleRate) || sampleRate < 1) throw new Error("Unexpected output geometry/audio format");
  const audioBytes = await decodedAudioBytes(filename, signal);
  const decodedSamples = audioBytes / (2 * channels);
  const contentSamples = Math.round(Number(audio.duration_ts) * rational(audio.time_base) * sampleRate);
  const padding = decodedSamples - contentSamples;
  if (!Number.isSafeInteger(decodedSamples) || !Number.isSafeInteger(padding) || padding < 0 || padding > sampleRate) throw new Error("Unproven audio content/padding boundary");
  const sha256 = await hashLongVideoFile(filename, signal);
  const after = await fs.stat(filename);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error("Movie changed during validation");
  const evidence: LongVideoMediaEvidence = { files: [{ path: filename, bytes: after.size, sha256 }], videoFrames: Number(video.nb_read_frames),
    audioContentSamples: contentSamples, audioSampleRate: sampleRate, codecPaddingSamples: padding, fullDecode: true };
  assertLongVideoMediaEvidence(snapshot, evidence);
  return evidence;
}
