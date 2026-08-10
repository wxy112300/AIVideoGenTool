import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import {
  freeMemory,
  interrupt,
  submitTask,
  waitForTask
} from "../dist/electron/electron/services/comfy-ui.js";
import { finalizeExtensionOutput } from "../dist/electron/electron/services/extension-media.js";
import {
  extractComfyOutputFiles
} from "../dist/electron/src/core/comfy-output.js";
import { attachAbsoluteOutputPaths } from "../dist/electron/src/core/comfy-output-paths.js";
import { createDefaultSettings } from "../dist/electron/src/core/defaults.js";
import { startAdaptiveVramWatchdog } from "../dist/electron/electron/services/vram-watchdog.js";

const execFileAsync = promisify(execFile);
const sourceVideoPath = process.argv[2];
if (!sourceVideoPath) {
  throw new Error("Usage: node scripts/smoke-extension.mjs <source-video>");
}

const statePath = path.join(
  process.env.APPDATA ?? "",
  "ai-video-gen-tool",
  "studio-state.json"
);
const saved = JSON.parse(readFileSync(statePath, "utf8"));
const settings = { ...createDefaultSettings(), ...saved.settings };
const modelProfile = settings.ltxExtensionModelProfile;
const workflowVariant = modelProfile === "q2_distilled" ? "q2" : "dev";
const probe = JSON.parse((await execFileAsync("ffprobe", [
  "-v", "error",
  "-select_streams", "v:0",
  "-show_entries", "stream=width,height:format=duration",
  "-of", "json",
  sourceVideoPath
], { encoding: "utf8", windowsHide: true })).stdout);
const stream = probe.streams?.[0];
const sourceDuration = Number(probe.format?.duration);
if (!stream?.width || !stream?.height || !Number.isFinite(sourceDuration)) {
  throw new Error("Unable to read source video dimensions or duration");
}

const id = `sulphur-extension-smoke-${crypto.randomUUID()}`;
const task = {
  id,
  taskType: "extension",
  status: "running",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  outputFilename: `AIVideoGenTool-Benchmark/Sulphur-Extend-Smoke-${Date.now()}.mp4`,
  prompt: "The camera continues smoothly as the existing motion carries forward naturally.",
  promptVersion: 1,
  sourceVideoPath,
  sourceVideoDuration: sourceDuration,
  trimStartSeconds: 0,
  trimEndSeconds: Math.min(5, sourceDuration),
  sourceWidth: stream.width,
  sourceHeight: stream.height,
  modelId: "sulphur2",
  workflowPath: path.resolve(
    `workflows/sulphur2_ltx23_extend_gguf_${workflowVariant}_api.json`
  ),
  ratio: "source",
  resolution: 360,
  duration: 1,
  fps: 24,
  frameInterpolation: "rife4x",
  motion: "natural",
  modelProfile,
  seed: 42,
  keepSeedOnCopy: true,
  maxGeneratedFrames: 49,
  overlapFrames: 16,
  unloadBetweenStages: true
};

const controller = new AbortController();
const monitor = startAdaptiveVramWatchdog(controller, (pressure) => {
  const usedMiB = pressure.state.previousSample?.usedMiB ?? 0;
  const totalMiB = pressure.state.previousSample?.totalMiB ?? 0;
  console.log(
    `[VRAM] ${usedMiB}/${totalMiB} MiB, ` +
      `动态安全线 ${Math.round(pressure.requiredReserveMiB)} MiB`
  );
});

try {
  const submitted = await submitTask(task, settings, controller.signal);
  console.log(`[PROMPT] ${submitted.promptId}`);
  const result = await waitForTask(
    submitted.promptId,
    submitted.clientId,
    submitted.nodeTypes,
    settings,
    settings.ltxExtensionTimeoutMinutes,
    controller.signal,
    (progress, stage) => console.log(`[${progress}%] ${stage}`),
    () => undefined
  );
  const files = attachAbsoluteOutputPaths(
    extractComfyOutputFiles(result),
    settings.outputDirectory
  );
  const output = files.find(
    (file) => file.absolutePath && /\.(mp4|webm|mov|m4v|mkv)$/i.test(file.filename)
  );
  if (!output?.absolutePath) throw new Error("ComfyUI returned no video output");
  console.log("[99%] FFmpeg overlap removal and splice");
  await finalizeExtensionOutput(task, output.absolutePath, controller.signal);
  console.log(`[DONE] ${output.absolutePath}`);
} catch (error) {
  await interrupt(settings).catch(() => undefined);
  await freeMemory(settings).catch(() => undefined);
  throw error;
} finally {
  monitor.stop();
}
