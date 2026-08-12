import path from "node:path";
import type { Settings } from "../../src/types.js";

export function comfyUiMemoryArgs(
  settings: Pick<Settings, "vramReserveGb"> &
    Partial<Pick<Settings, "defaultImageModel">>
): string[] {
  const configuredReserve = Number.isFinite(settings.vramReserveGb)
    ? settings.vramReserveGb
    : 1;
  const isQwenImage = settings.defaultImageModel === "qwen-image-edit-2511";
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
  } else {
    args.push("--disable-pinned-memory", "--disable-async-offload");
  }
  return args;
}

export type ComfyUiRuntimeProfile = "standard" | "qwen-image";

export function comfyUiRuntimeProfileForSettings(
  settings: Partial<Pick<Settings, "defaultImageModel">>
): ComfyUiRuntimeProfile {
  return settings.defaultImageModel === "qwen-image-edit-2511"
    ? "qwen-image"
    : "standard";
}

export function comfyUiRuntimeProfileFromCommandLine(
  commandLine: string
): ComfyUiRuntimeProfile | "unknown" {
  const normalized = commandLine.toLowerCase();
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
