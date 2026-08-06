import { describe, expect, it } from "vitest";
import { startTaskPerformanceMonitor } from "../electron/services/performance";

describe("task performance monitor", () => {
  it("aggregates GPU and VRAM samples without retaining raw points", () => {
    const monitor = startTaskPerformanceMonitor(60_000);
    monitor.recordGpuSample({
      usedMiB: 1_000,
      totalMiB: 24_000,
      sampledAtMs: 0,
      gpuUtilization: 50,
      gpuTemperatureC: 60
    });
    monitor.recordGpuSample({
      usedMiB: 2_000,
      totalMiB: 24_000,
      sampledAtMs: 1_000,
      gpuUtilization: 90,
      gpuTemperatureC: 70
    });

    const stats = monitor.stop();

    expect(stats.sampleCount).toBe(1);
    expect(stats.gpuSampleCount).toBe(2);
    expect(stats.gpuAveragePercent).toBe(70);
    expect(stats.gpuPeakPercent).toBe(90);
    expect(stats.gpuTemperaturePeak).toBe(70);
    expect(stats.vramBaselineBytes).toBe(1_000 * 1024 ** 2);
    expect(stats.vramAverageBytes).toBe(1_500 * 1024 ** 2);
    expect(stats.vramPeakBytes).toBe(2_000 * 1024 ** 2);
    expect(stats.vramTotalBytes).toBe(24_000 * 1024 ** 2);
    expect(JSON.stringify(stats)).not.toContain("sampledAtMs");
  });
});
