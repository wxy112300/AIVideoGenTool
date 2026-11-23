import { describe, expect, it } from "vitest";
import { h3UpscaleHardwareFromStats, h3UpscalePerformanceProfile } from "../src/core/h3-upscale-performance";

const GiB = 1024 ** 3;
describe("H3 Upscale execution hardware", () => {
  it("selects the 4090/24GB budget while reserving desktop headroom", () => {
    const profile = h3UpscalePerformanceProfile({ vramTotalBytes: 24564 * 1024 ** 2, vramAvailableBytes: 23 * GiB, ramAvailableBytes: 40 * GiB });
    expect(profile.tier).toBe("24gb");
    expect(profile.tessera).toMatchObject({ spatialTile: "high_vram", temporalTile: "high_vram", encodeFrames: 56 });
    expect(profile.refiner).toMatchObject({ tileWidth: 1024, tileHeight: 768, temporalFrames: 136 });
  });
  it("reduces the budget when another process occupies a large GPU", () => {
    expect(h3UpscalePerformanceProfile({ vramTotalBytes: 24 * GiB, vramAvailableBytes: 13 * GiB }).tier).toBe("balanced");
    expect(h3UpscalePerformanceProfile({ vramTotalBytes: 24 * GiB, vramAvailableBytes: 8 * GiB }).tier).toBe("low-vram");
    expect(h3UpscalePerformanceProfile({ vramTotalBytes: 16 * GiB }).tier).toBe("balanced");
    expect(h3UpscalePerformanceProfile({ vramTotalBytes: 12 * GiB }).refiner.temporalFrames).toBe(85);
    const pressured = h3UpscalePerformanceProfile({ vramTotalBytes: 24 * GiB, vramAvailableBytes: 23 * GiB, ramAvailableBytes: 8 * GiB });
    expect(pressured.tier).toBe("balanced");
    expect(pressured.tessera.temporalTile).toBe("low_vram");
  });
  it("does not add the cached free allocator memory twice or borrow another GPU", () => {
    const hardware = h3UpscaleHardwareFromStats({ devices: [
      { type: "cpu", vram_total: 128 * GiB },
      { type: "cuda", vram_total: 24 * GiB, vram_free: 6 * GiB, torch_vram_total: 14 * GiB, torch_vram_free: 2 * GiB },
      { type: "cuda", vram_total: 80 * GiB, vram_free: 80 * GiB }
    ] });
    expect(hardware).toEqual({ vramTotalBytes: 24 * GiB, vramAvailableBytes: 18 * GiB });
    expect(h3UpscalePerformanceProfile(hardware).tier).toBe("balanced");
  });
  it("keeps legacy geometry if telemetry is missing or invalid, without blocking", () => {
    for (const stats of [undefined, {}, { devices: [{ type: "cpu", vram_total: 64 * GiB }] }, { devices: [{ vram_total: NaN }] }]) {
      const profile = h3UpscalePerformanceProfile(h3UpscaleHardwareFromStats(stats));
      expect(profile.tier).toBe("unknown");
      expect(profile.refiner.tileWidth).toBe(768);
      expect(profile.tessera.temporalTile).toBe("high_vram");
    }
    expect(h3UpscalePerformanceProfile({ vramTotalBytes: 24 * GiB, vramAvailableBytes: 0 }).tier).toBe("low-vram");
  });
});
