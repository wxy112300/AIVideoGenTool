import { describe, expect, it } from "vitest";
import type { PerformanceMetrics } from "../src/types";
import {
  renderResourceMonitor,
  resourceMonitorValues
} from "../src/renderer/shell/resource-monitor";

const gib = 1024 ** 3;

function metrics(patch: Partial<PerformanceMetrics> = {}): PerformanceMetrics {
  return {
    sampledAt: "2026-08-28T00:00:00.000Z",
    cpuPercent: 13,
    memoryUsedBytes: 34.7 * gib,
    memoryTotalBytes: 63.8 * gib,
    gpuPercent: 2,
    vramUsedBytes: 3.2 * gib,
    vramTotalBytes: 24 * gib,
    gpuTemperature: 42,
    comfyConnected: true,
    ...patch
  };
}

describe("global resource monitor", () => {
  it("formats utilization and real memory occupancy for the compact topbar", () => {
    const values = resourceMonitorValues(metrics());

    expect(values).toMatchObject({
      cpu: "13%",
      memory: "54%",
      memoryUsage: "34.7/63.8G",
      gpu: "2%",
      gpuTemperature: "42°C",
      vram: "13%",
      vramUsage: "3.2/24.0G"
    });
    const html = renderResourceMonitor(metrics(), "性能监控");
    expect(html).toContain('aria-label="性能监控"');
    expect(html).toContain("34.7/63.8G");
    expect(html).toContain("3.2/24.0G");
  });

  it("raises warning and critical pressure without changing the displayed values", () => {
    expect(resourceMonitorValues(metrics({ memoryUsedBytes: 52 * gib })).memoryPressure).toBe("warning");
    expect(resourceMonitorValues(metrics({ vramUsedBytes: 22 * gib })).vramPressure).toBe("critical");
  });
});
