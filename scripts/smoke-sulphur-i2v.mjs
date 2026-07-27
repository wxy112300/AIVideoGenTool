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
import {
  attachAbsoluteOutputPaths,
  extractComfyOutputFiles
} from "../dist/electron/src/core/comfy-output.js";
import { createDefaultSettings } from "../dist/electron/src/core/defaults.js";
import { startAdaptiveVramWatchdog } from "../dist/electron/electron/services/vram-watchdog.js";

const execFileAsync = promisify(execFile);
const inputImagePath = process.argv[2];
if (!inputImagePath) {
  throw new Error("Usage: node scripts/smoke-sulphur-i2v.mjs <input-image>");
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
const queue = await fetch(`${settings.comfyUrl}/queue`).then((response) => {
  if (!response.ok) throw new Error(`Unable to read ComfyUI queue: ${response.status}`);
  return response.json();
});
if (queue.queue_running.length || queue.queue_pending.length) {
  throw new Error("ComfyUI queue is not empty; refusing to mix the smoke test with another task");
}

const task = {
  id: `sulphur-i2v-smoke-${crypto.randomUUID()}`,
  taskType: "generation",
  status: "running",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  outputFilename: `AIVideoGenTool-Benchmark/Sulphur-I2V-Smoke-${Date.now()}.mp4`,
  prompt: "A still red square moves slightly to the right, static camera.",
  promptVersion: 1,
  startImagePath: path.resolve(inputImagePath),
  sourceWidth: 64,
  sourceHeight: 64,
  endImagePath: "",
  modelId: "sulphur2",
  workflowPath: path.resolve(
    `workflows/sulphur2_ltx23_i2v_gguf_${workflowVariant}_api.json`
  ),
  ratio: "1:1",
  resolution: 480,
  duration: 1,
  fps: 24,
  frameInterpolation: "rife4x",
  motion: "subtle",
  modelProfile,
  seed: 42,
  keepSeedOnCopy: true
};

const controller = new AbortController();
const monitor = startAdaptiveVramWatchdog(
  controller,
  (pressure, utilization) => {
    const usedMiB = pressure.state.previousSample?.usedMiB ?? 0;
    const totalMiB = pressure.state.previousSample?.totalMiB ?? 0;
    console.log(
      `[VRAM] ${usedMiB}/${totalMiB} MiB, GPU ${utilization ?? "?"}%, ` +
        `动态安全线 ${Math.round(pressure.requiredReserveMiB)} MiB`
    );
  }
);

try {
  console.log(`[PROFILE] ${modelProfile}`);
  console.log("[WORKLOAD] 480x480, 1 second, RIFE 4x, 9 model frames");
  const submitted = await submitTask(task, settings, controller.signal);
  console.log(`[PROMPT] ${submitted.promptId}`);
  const result = await waitForTask(
    submitted.promptId,
    submitted.clientId,
    submitted.nodeTypes,
    settings,
    settings.ltxExtensionTimeoutMinutes,
    controller.signal,
    (progress, stage) => console.log(`[${Math.round(progress)}%] ${stage}`),
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
  const probe = await execFileAsync("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height,avg_frame_rate,nb_frames:format=duration",
    "-of", "json",
    output.absolutePath
  ], { encoding: "utf8", windowsHide: true });
  console.log(`[PEAK_VRAM] ${monitor.peakUsedMiB()} MiB`);
  console.log(`[OUTPUT] ${output.absolutePath}`);
  console.log(`[FFPROBE] ${probe.stdout.trim()}`);
} catch (error) {
  await interrupt(settings).catch(() => undefined);
  await freeMemory(settings).catch(() => undefined);
  throw error;
} finally {
  monitor.stop();
}