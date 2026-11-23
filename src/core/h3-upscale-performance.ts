/** Execution-only hardware policy for the two dense H3 pixel-refinement families. */
export interface H3UpscaleHardware {
  vramTotalBytes?: number;
  /** Free memory plus reclaimable allocations owned by this ComfyUI process. */
  vramAvailableBytes?: number;
  ramAvailableBytes?: number;
}

export function isH3PixelRefiner(modelId: string | undefined): boolean {
  return modelId === "minimax_h3_kijai_refiner" || modelId === "minimax_h3_tessera";
}

const GiB = 1024 ** 3;

export function h3UpscaleHardwareFromStats(stats: unknown): H3UpscaleHardware {
  const devices = (stats as { devices?: Array<Record<string, unknown>> } | undefined)?.devices;
  // ComfyUI reports its execution device first. Do not borrow a second GPU's capacity.
  const device = Array.isArray(devices) ? devices.find(d => d && typeof d === "object" && d.type !== "cpu" && !String(d.name ?? "").toLowerCase().includes("cpu")) : undefined;
  const valid = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
  if (!device || !valid(device.vram_total) || device.vram_total <= 0) return {};
  const total = device.vram_total;
  const allocated = valid(device.torch_vram_total) && valid(device.torch_vram_free)
    ? Math.max(0, device.torch_vram_total - device.torch_vram_free) : 0;
  return {
    vramTotalBytes: total,
    // vram_free already includes the allocator's unused cache. Only add live
    // allocations, which ComfyUI may unload between the serialized GPU stages.
    ...(valid(device.vram_free) ? { vramAvailableBytes: Math.min(total, device.vram_free + allocated) } : {}),
    ...(valid((stats as { system?: { ram_free?: number } }).system?.ram_free)
      ? { ramAvailableBytes: (stats as { system: { ram_free: number } }).system.ram_free } : {})
  };
}

export function h3UpscalePerformanceProfile(hardware: H3UpscaleHardware = {}) {
  const total = hardware.vramTotalBytes;
  const available = hardware.vramAvailableBytes;
  const known = typeof total === "number" && Number.isFinite(total) && total > 0;
  const usable = known ? Math.max(0, Math.min(total, typeof available === "number" && Number.isFinite(available) && available >= 0 ? available : total) - GiB) : 0;
  // Large tiles and pinned transfers can crowd out the 20GB model's host
  // pages. A 4090's capacity alone is not evidence of adequate host memory.
  const hostRoom = typeof hardware.ramAvailableBytes === "number" && Number.isFinite(hardware.ramAvailableBytes) && hardware.ramAvailableBytes >= 32 * GiB;
  const tier = !known ? "unknown" : total >= 22 * GiB && usable >= 20 * GiB && hostRoom ? "24gb" : usable >= 11 * GiB ? "balanced" : "low-vram";
  const large = tier === "24gb";
  const low = tier === "low-vram";
  return {
    tier,
    tessera: { spatialTile: large ? "high_vram" : "low_vram", temporalTile: tier === "unknown" || large ? "high_vram" : "low_vram", encodeFrames: large ? 56 : 39 },
    refiner: { tileWidth: large ? 1024 : low ? 640 : 768, tileHeight: large ? 768 : low ? 512 : 576, temporalFrames: low ? 68 : tier === "balanced" ? 85 : 136 }
  } as const;
}
