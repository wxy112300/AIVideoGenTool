import path from "node:path";
import type {
  QueueTask,
  Settings
} from "../types.js";

export type ComfyUiRuntimeProfile =
  | "standard"
  | "prompt-resident"
  | "qwen-image"
  | "h3-memory"
  | "h3-q3-3080";

type RuntimeProfileSettings = Partial<
  Pick<Settings, "defaultImageModel" | "defaultVideoModel" | "vramReserveGb">
> & {
  comfyRuntimeProfileOverride?: ComfyUiRuntimeProfile;
};

export function comfyUiSettingsForPromptRuntime(settings: Settings): Settings {
  return {
    ...settings,
    comfyRuntimeProfileOverride: "prompt-resident"
  } as Settings;
}

export function comfyUiSettingsForQueueTask(
  task: (Pick<QueueTask, "taskType" | "modelId"> & {
    attentionMode?: Settings["h3AttentionMode"];
    upscaleMode?: "pixel" | "h3-native";
  }) | undefined,
  settings: Settings
): Settings {
  const isImageTask = task?.taskType === "image-generation";
  const isVideoTask = task?.taskType === "generation" ||
    task?.taskType === "extension" ||
    (task?.taskType === "upscale" && task.upscaleMode === "h3-native");
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
  settings: RuntimeProfileSettings
): string[] {
  const requestedReserve = settings.vramReserveGb;
  const configuredReserve = typeof requestedReserve === "number" && Number.isFinite(requestedReserve)
    ? requestedReserve
    : 1;
  const runtimeProfile = comfyUiRuntimeProfileForSettings(settings);
  const args = [
    runtimeProfile === "prompt-resident" ? "--cache-lru" : "--cache-none",
    ...(runtimeProfile === "prompt-resident" ? ["1"] : []),
    "--reserve-vram",
    String(Math.max(0.5, Math.min(1, configuredReserve)))
  ];
  if (runtimeProfile === "qwen-image") {
    args.push(
      "--disable-smart-memory",
      "--vram-headroom",
      "0.5"
    );
  } else if (runtimeProfile === "h3-q3-3080") {
    args.push(
      "--lowvram",
      "--cpu-vae",
      "--disable-smart-memory",
      "--disable-pinned-memory",
      "--disable-async-offload"
    );
  } else if (runtimeProfile === "standard") {
    args.push("--disable-pinned-memory", "--disable-async-offload");
  } else if (runtimeProfile === "h3-memory") {
    args.push("--enable-dynamic-vram", "--async-offload", "2");
  }
  return args;
}

export function comfyUiRuntimeProfileForSettings(
  settings: RuntimeProfileSettings
): ComfyUiRuntimeProfile {
  if (settings.comfyRuntimeProfileOverride) return settings.comfyRuntimeProfileOverride;
  if (settings.defaultVideoModel === "minimax_h3_fl2va_q3_gguf") return "h3-q3-3080";
  return settings.defaultImageModel === "qwen-image-edit-2511"
    ? "qwen-image"
    : "standard";
}

export function comfyUiRuntimeProfileFromCommandLine(
  commandLine: string
): ComfyUiRuntimeProfile | "unknown" {
  const normalized = commandLine.toLowerCase();
  if (normalized.includes("--cache-lru")) return "prompt-resident";
  if (
    normalized.includes("--lowvram") &&
    normalized.includes("--cpu-vae") &&
    normalized.includes("--disable-smart-memory")
  ) {
    return "h3-q3-3080";
  }
  if (
    !normalized.includes("--cpu-vae") &&
    normalized.includes("--disable-smart-memory") &&
    normalized.includes("--vram-headroom")
  ) {
    return "qwen-image";
  }
  if (
    normalized.includes("--enable-dynamic-vram") &&
    normalized.includes("--async-offload") &&
    !normalized.includes("--disable-pinned-memory")
  ) {
    return "h3-memory";
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
