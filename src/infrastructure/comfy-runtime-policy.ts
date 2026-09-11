import path from "node:path";
import type {
  QueueTask,
  Settings
} from "../types.js";

export type ComfyUiRuntimeProfile =
  | "standard"
  | "prompt-resident"
  | "qwen-image"
  | "h3-native"
  | "h3-q3-3080";

type RuntimeProfileSettings = Partial<
  Pick<Settings, "defaultImageModel" | "defaultVideoModel" | "vramReserveGb" | "h3RuntimeMode" | "h3ComfyCompilerMode">
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
    h3SparseAttentionMode?: Settings["h3SparseAttentionMode"];
    h3RuntimeMode?: Settings["h3RuntimeMode"];
    h3ComfyCompilerMode?: Settings["h3ComfyCompilerMode"];
    upscaleMode?: "pixel" | "h3-native";
  }) | undefined,
  settings: Settings
): Settings {
  const isImageTask = task?.taskType === "image-generation";
  const isVideoTask = task?.taskType === "generation" ||
    task?.taskType === "extension" ||
    (task?.taskType === "upscale" && task.upscaleMode === "h3-native");
  const isH3VideoTask = isVideoTask && task?.modelId.startsWith("minimax_h3_");
  return {
    ...settings,
    defaultImageModel: isImageTask ? task.modelId : "",
    defaultVideoModel: isVideoTask
      ? task.modelId
      : task
        ? ""
        : settings.defaultVideoModel,
    ...(isH3VideoTask
      ? {
          // Legacy queue records predate the execution-policy snapshot. A
          // waiting legacy task follows the current saved settings when it is
          // claimed, matching the settings contract for unfinished work.
          h3AttentionMode: task.attentionMode ?? settings.h3AttentionMode,
          h3SparseAttentionMode: task.h3SparseAttentionMode ?? settings.h3SparseAttentionMode,
          h3RuntimeMode: task.h3RuntimeMode ?? settings.h3RuntimeMode,
          h3ComfyCompilerMode: task.h3ComfyCompilerMode ?? settings.h3ComfyCompilerMode
        }
      : {})
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
  } else if (runtimeProfile === "h3-native") {
    args.push("--enable-dynamic-vram", "--async-offload", "2");
  }
  if (
    settings.h3ComfyCompilerMode === "disabled" &&
    typeof settings.defaultVideoModel === "string" &&
    settings.defaultVideoModel.startsWith("minimax_h3_")
  ) {
    args.push("--disable-comfy-compiler");
  }
  return args;
}

export function comfyUiRuntimeProfileForSettings(
  settings: RuntimeProfileSettings
): ComfyUiRuntimeProfile {
  if (settings.comfyRuntimeProfileOverride) return settings.comfyRuntimeProfileOverride;
  if (settings.defaultVideoModel === "minimax_h3_fl2va_q3_gguf") return "h3-q3-3080";
  if (typeof settings.defaultVideoModel === "string" && settings.defaultVideoModel.startsWith("minimax_h3_")) {
    return settings.h3RuntimeMode === "native" ? "h3-native" : "standard";
  }
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
    return "h3-native";
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
