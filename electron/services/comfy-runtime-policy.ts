import path from "node:path";
import type { QueueTask, Settings } from "../../src/types.js";

export function comfyUiSettingsForQueueTask(
  task: Pick<QueueTask, "taskType" | "modelId"> | undefined,
  settings: Settings
): Settings {
  const isImageTask = task?.taskType === "image-generation";
  const isVideoTask = task?.taskType === "generation" || task?.taskType === "extension";
  return {
    ...settings,
    defaultImageModel: isImageTask ? task.modelId : "",
    defaultVideoModel: isVideoTask
      ? task.modelId
      : task
        ? ""
        : settings.defaultVideoModel
  };
}

export function comfyUiMemoryArgs(
  settings: Pick<Settings, "vramReserveGb"> &
    Partial<Pick<Settings, "defaultImageModel" | "defaultVideoModel">>
): string[] {
  const configuredReserve = Number.isFinite(settings.vramReserveGb)
    ? settings.vramReserveGb
    : 1;
  const isQwenImage = settings.defaultImageModel === "qwen-image-edit-2511";
  const isH3Q3 = settings.defaultVideoModel === "minimax_h3_fl2va_q3_gguf";
  const args = [
    "--cache-none",
    "--reserve-vram",
    String(Math.max(0.5, Math.min(1, configuredReserve)))
  ];
  if (isQwenImage) {
    args.push(
      "--cpu-vae",
      "--disable-smart-memory",
      "--vram-headroom",
      "0.5"
    );
  } else if (isH3Q3) {
    args.push(
      "--lowvram",
      "--cpu-vae",
      "--disable-smart-memory",
      "--disable-pinned-memory",
      "--disable-async-offload"
    );
  } else {
    args.push("--disable-pinned-memory", "--disable-async-offload");
  }
  return args;
}

export type ComfyUiRuntimeProfile = "standard" | "qwen-image" | "h3-q3-3080";

export function comfyUiRuntimeProfileForSettings(
  settings: Partial<Pick<Settings, "defaultImageModel" | "defaultVideoModel">>
): ComfyUiRuntimeProfile {
  if (settings.defaultVideoModel === "minimax_h3_fl2va_q3_gguf") return "h3-q3-3080";
  return settings.defaultImageModel === "qwen-image-edit-2511"
    ? "qwen-image"
    : "standard";
}

export function comfyUiRuntimeProfileFromCommandLine(
  commandLine: string
): ComfyUiRuntimeProfile | "unknown" {
  const normalized = commandLine.toLowerCase();
  if (
    normalized.includes("--lowvram") &&
    normalized.includes("--cpu-vae") &&
    normalized.includes("--disable-smart-memory")
  ) {
    return "h3-q3-3080";
  }
  if (
    normalized.includes("--cpu-vae") ||
    normalized.includes("--disable-smart-memory")
  ) {
    return "qwen-image";
  }
  if (
    normalized.includes("--disable-pinned-memory") &&
    normalized.includes("--disable-async-offload")
  ) {
    return "standard";
  }
  return "unknown";
}

export function availableVramBytesForReserve(
  totalBytes: number,
  reserveGb: number
): number {
  const configuredReserve = Number.isFinite(reserveGb)
    ? Math.max(0.5, Math.min(1, reserveGb))
    : 1;
  return Math.max(0, totalBytes - configuredReserve * 1024 ** 3);
}

export function comfyUiBundledFrontendArgs(
  sourceRoot: string,
  bundledFrontendAvailable: boolean
): string[] {
  return bundledFrontendAvailable
    ? [
        "--front-end-root",
        path.join(sourceRoot, "web_custom_versions", "desktop_app")
      ]
    : [];
}
