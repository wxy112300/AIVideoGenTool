import type { Settings } from "../../src/types.js";

export interface ComfyRuntimeMemory {
  devices: Array<{ allocatedBytes: number; totalBytes: number }>;
}

/** ComfyUI's Torch allocation belongs to its process; adapter-wide usage does not. */
export function parseComfyRuntimeMemory(stats: unknown): ComfyRuntimeMemory | null {
  const devices = (stats as { devices?: unknown[] } | null)?.devices;
  if (!Array.isArray(devices)) return null;
  const gpuDevices = devices.filter(d => d && typeof d === "object" && (d as { type?: string }).type !== "cpu");
  if (!gpuDevices.length) return null;
  const parsed: ComfyRuntimeMemory["devices"] = [];
  for (const device of gpuDevices) {
    const d = device as Record<string, unknown>;
    const { torch_vram_total: reserved, torch_vram_free: free, vram_total: total } = d;
    if (typeof reserved !== "number" || typeof free !== "number" || typeof total !== "number" ||
      ![reserved, free, total].every(Number.isFinite) || reserved < 0 || free < 0 || free > reserved || total <= 0) return null;
    parsed.push({ allocatedBytes: reserved - free, totalBytes: total });
  }
  return { devices: parsed };
}

export async function readComfyRuntimeMemory(settings: Settings): Promise<ComfyRuntimeMemory | null> {
  const response = await fetch(`${settings.comfyUrl.replace(/\/+$/, "")}/system_stats`, { signal: AbortSignal.timeout(2_000) });
  if (!response.ok) throw new Error(`ComfyUI memory telemetry HTTP ${response.status}`);
  return parseComfyRuntimeMemory(await response.json());
}
