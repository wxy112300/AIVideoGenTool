import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { inspectLongVideoMedia } from "../electron/services/long-video-media";
import type { LongVideoExecutionSnapshot } from "../src/core/long-video/execution";

it.each([2, 4] as const)("validates real %sx delivered frames without multiplying audio duration", async multiplier => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "long-delivery-"));
  try {
    const filename = path.join(root, "delivery.mp4");
    await promisify(execFile)("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `color=c=blue:s=1344x768:r=${24 * multiplier}`, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "1", "-c:v", "libx264", "-threads", "2", "-preset", "ultrafast", "-c:a", "aac", filename], { windowsHide: true });
    const snapshot = { profile: { width: 1344, height: 768, delivery: { frameInterpolation: multiplier === 2 ? "rife2x" : "rife4x" } }, script: { layout: { targetFrames: 24 } } } as LongVideoExecutionSnapshot;
    const files = [{ filename: "delivery.mp4", absolutePath: filename, subfolder: "", type: "output" as const }];
    const result = await inspectLongVideoMedia(snapshot, files, new AbortController().signal);
    expect(result.videoFrames).toBe(24 * multiplier); expect(result.videoFps).toBe(24 * multiplier); expect(result.audioContentSamples).toBe(48000);
    await expect(inspectLongVideoMedia({ ...snapshot, profile: { ...snapshot.profile, delivery: { frameInterpolation: "off" } } }, files, new AbortController().signal)).rejects.toThrow();
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

it("fully decodes actual video/audio and measures codec padding separately from the target", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "long-media-"));
  try {
    const filename = path.join(root, "test.mp4");
    await promisify(execFile)("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=256x256:r=24", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "2", "-c:v", "libx264", "-threads", "2", "-preset", "ultrafast", "-c:a", "aac", filename], { windowsHide: true });
    const snapshot = { profile: { width: 256, height: 256 }, script: { layout: { targetFrames: 48 } } } as LongVideoExecutionSnapshot;
    const files = [{ filename: "test.mp4", absolutePath: filename, subfolder: "", type: "output" as const }];
    const result = await inspectLongVideoMedia(snapshot, files, new AbortController().signal);
    expect(result.videoFrames).toBe(48); expect(result.audioContentSamples).toBe(96000);
    expect(result.codecPaddingSamples).toBeGreaterThanOrEqual(0); expect(result.files[0]!.sha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(inspectLongVideoMedia({ ...snapshot, script: { ...snapshot.script, layout: { ...snapshot.script.layout, targetFrames: 96 } } }, files, new AbortController().signal)).rejects.toThrow(/evidence/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
