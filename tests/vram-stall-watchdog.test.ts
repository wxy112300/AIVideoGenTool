import { describe, expect, it } from "vitest";
import {
  evaluateVramStallWatchdog,
  replayVramStallWatchdogTrace,
  type VramStallWatchdogEvent,
  type VramStallWatchdogPolicy,
  type VramStallWatchdogSample
} from "../src/core/vram-stall-watchdog";

const policy: VramStallWatchdogPolicy = {
  enabledMinutes: 5,
  windowMs: 1_000,
  baselineWarmupMs: 300,
  pressureHysteresisMs: 100,
  maxClockJumpMs: 5_000,
  pressureSampleQuorum: 0.75,
  minimumPressureSamples: 3,
  adapterId: "gpu-a"
};

function sample(
  sampledAtMs: number,
  overrides: Partial<VramStallWatchdogSample> = {}
): VramStallWatchdogSample {
  return {
    sampledAtMs,
    adapterId: "gpu-a",
    sharedGpuMemoryBytes: 1_000,
    hostMemory: {
      totalBytes: 16_000,
      availableBytes: 8_000,
      committedBytes: 8_000,
      commitLimitBytes: 16_000,
      pagesInputPerSec: 1,
      pagesOutputPerSec: 1,
      hardFaultsPerSec: 1
    },
    latency: {
      samplerTickLatenessMs: 10,
      nvidiaSmiDurationMs: 20,
      counterReadDurationMs: 10,
      comfyRoundTripMs: 50
    },
    gpuUtilization: 5,
    ...overrides
  };
}

function baselineEvents(): VramStallWatchdogEvent[] {
  return [
    { type: "start", atMs: 0, adapterId: "gpu-a" },
    { type: "sample", sample: sample(0) },
    { type: "sample", sample: sample(100) },
    { type: "sample", sample: sample(200) },
    { type: "sample", sample: sample(300) }
  ];
}

function pressureSample(sampledAtMs: number): VramStallWatchdogSample {
  return sample(sampledAtMs, {
    wddm: { currentUsageMiB: 10_000, budgetMiB: 9_000 },
    sharedGpuMemoryBytes: 4_000,
    hostMemory: {
      totalBytes: 16_000,
      availableBytes: 500,
      committedBytes: 15_500,
      commitLimitBytes: 16_000,
      pagesInputPerSec: 100,
      pagesOutputPerSec: 80,
      hardFaultsPerSec: 120
    },
    latency: {
      samplerTickLatenessMs: 800,
      nvidiaSmiDurationMs: 600,
      counterReadDurationMs: 700,
      comfyRoundTripMs: 1_000
    },
    gpuUtilization: 80
  });
}

function dedicatedVramPressureSample(sampledAtMs: number): VramStallWatchdogSample {
  return sample(sampledAtMs, {
    vram: {
      usedMiB: 23_800,
      totalMiB: 24_564,
      remainingMiB: 764
    },
    gpuUtilization: 100
  });
}

describe("VRAM stall watchdog state machine", () => {
  it("does not kill a healthy near-full GPU while productive progress continues", () => {
    const events: VramStallWatchdogEvent[] = [
      ...baselineEvents(),
      { type: "sample", sample: sample(400, { gpuUtilization: 95 }) },
      { type: "progress", atMs: 450, nodeId: "KSampler", value: 1, max: 10 },
      { type: "sample", sample: sample(500, { gpuUtilization: 98 }) },
      { type: "progress", atMs: 550, nodeId: "KSampler", value: 2, max: 10 },
      { type: "sample", sample: sample(1_500, { gpuUtilization: 99 }) }
    ];
    const result = replayVramStallWatchdogTrace(events, policy);

    expect(result.triggerCount).toBe(0);
    expect(result.state.status).toBe("observing");
  });

  it("does not treat a long GPU-busy node as a stall without memory pressure", () => {
    const events: VramStallWatchdogEvent[] = [
      ...baselineEvents(),
      { type: "sample", sample: sample(400, { gpuUtilization: 80 }) },
      { type: "sample", sample: sample(800, { gpuUtilization: 90 }) },
      { type: "sample", sample: sample(1_200, { gpuUtilization: 88 }) },
      { type: "sample", sample: sample(1_400, { gpuUtilization: 85 }) }
    ];
    const result = replayVramStallWatchdogTrace(events, policy);

    expect(result.triggerCount).toBe(0);
    expect(result.state.status).toBe("observing");
  });

  it("triggers only after shared memory and host paging pressure persist without progress", () => {
    const events: VramStallWatchdogEvent[] = [
      ...baselineEvents(),
      { type: "sample", sample: pressureSample(400) },
      { type: "sample", sample: pressureSample(800) },
      { type: "sample", sample: pressureSample(1_200) },
      { type: "sample", sample: pressureSample(1_400) }
    ];
    const result = replayVramStallWatchdogTrace(events, policy);
    const trigger = result.evaluations.at(-1);

    expect(result.triggerCount).toBe(1);
    expect(result.state.status).toBe("triggered");
    expect(trigger?.action).toBe("triggered");
    expect(trigger?.evidence?.memoryFamilies).toEqual(
      expect.arrayContaining(["shared-gpu-memory", "host-memory"])
    );
  });

  it("triggers on dedicated VRAM headroom below 800 MiB without waiting for a host counter", () => {
    const events: VramStallWatchdogEvent[] = [
      ...baselineEvents(),
      { type: "sample", sample: dedicatedVramPressureSample(400) },
      { type: "sample", sample: dedicatedVramPressureSample(800) },
      { type: "sample", sample: dedicatedVramPressureSample(1_200) },
      { type: "sample", sample: dedicatedVramPressureSample(1_400) }
    ];
    const result = replayVramStallWatchdogTrace(events, policy);
    const trigger = result.evaluations.at(-1);

    expect(result.triggerCount).toBe(1);
    expect(result.state.status).toBe("triggered");
    expect(trigger?.evidence?.memoryFamilies).toContain("dedicated-vram");
  });

  it("does not treat 800 MiB or more of dedicated VRAM headroom as emergency pressure", () => {
    const events: VramStallWatchdogEvent[] = [
      ...baselineEvents(),
      { type: "sample", sample: sample(400, { vram: { usedMiB: 23_700, totalMiB: 24_564, remainingMiB: 864 }, gpuUtilization: 100 }) },
      { type: "sample", sample: sample(800, { vram: { usedMiB: 23_700, totalMiB: 24_564, remainingMiB: 864 }, gpuUtilization: 100 }) },
      { type: "sample", sample: sample(1_200, { vram: { usedMiB: 23_700, totalMiB: 24_564, remainingMiB: 864 }, gpuUtilization: 100 }) },
      { type: "sample", sample: sample(1_400, { vram: { usedMiB: 23_700, totalMiB: 24_564, remainingMiB: 864 }, gpuUtilization: 100 }) }
    ];
    const result = replayVramStallWatchdogTrace(events, policy);

    expect(result.triggerCount).toBe(0);
    expect(result.state.status).toBe("observing");
  });

  it("clears a candidate after a transient pressure spike recovers", () => {
    const events: VramStallWatchdogEvent[] = [
      ...baselineEvents(),
      { type: "sample", sample: pressureSample(400) },
      { type: "sample", sample: sample(450) },
      { type: "sample", sample: sample(550) },
      { type: "sample", sample: sample(1_200) },
      { type: "sample", sample: pressureSample(1_300) }
    ];
    const result = replayVramStallWatchdogTrace(events, policy);

    expect(result.triggerCount).toBe(0);
    expect(result.state.status).toBe("suspect");
    expect(result.evaluations[5]?.action).toBe("suspect-started");
    expect(result.evaluations[7]?.action).toBe("suspect-cleared");
  });

  it("resets the candidate on a real productive step but ignores duplicate progress", () => {
    const events: VramStallWatchdogEvent[] = [
      ...baselineEvents(),
      { type: "sample", sample: pressureSample(400) },
      { type: "progress", atMs: 450, nodeId: "KSampler", value: 2, max: 10 },
      { type: "progress", atMs: 500, nodeId: "KSampler", value: 2, max: 10 },
      { type: "sample", sample: pressureSample(600) }
    ];
    const result = replayVramStallWatchdogTrace(events, policy);

    expect(result.triggerCount).toBe(0);
    expect(result.state.lastProductiveProgressAtMs).toBe(450);
    expect(result.state.status).toBe("suspect");
    expect(result.evaluations[6]?.action).toBe("suspect-cleared");
  });

  it("does not treat a repeated active-node notification as progress", () => {
    const events: VramStallWatchdogEvent[] = [
      ...baselineEvents(),
      { type: "active-node", atMs: 400, nodeId: "KSampler" },
      { type: "active-node", atMs: 500, nodeId: "KSampler" },
      { type: "sample", sample: pressureSample(600) }
    ];
    const result = replayVramStallWatchdogTrace(events, policy);

    expect(result.state.lastProductiveProgressAtMs).toBe(400);
    expect(result.evaluations[5]?.action).toBe("none");
  });

  it("fails open on missing telemetry, sleep jumps, and out-of-order samples", () => {
    const missingAdapter = sample(400, { adapterId: "gpu-b" });
    const events: VramStallWatchdogEvent[] = [
      ...baselineEvents(),
      { type: "sample", sample: missingAdapter },
      { type: "sample", sample: pressureSample(500) },
      { type: "sample", sample: pressureSample(6_000) },
      { type: "sample", sample: pressureSample(5_000) }
    ];
    const result = replayVramStallWatchdogTrace(events, policy);
    const actions = result.evaluations.map((evaluation) => evaluation.action);

    expect(actions).toContain("telemetry-gap");
    expect(result.triggerCount).toBe(0);
    expect(result.state.status).not.toBe("triggered");
    expect(result.state.telemetryGapCount).toBe(3);
  });

  it("emits at most one trigger for an attempt and starts a fresh baseline after recovery", () => {
    const events: VramStallWatchdogEvent[] = [
      ...baselineEvents(),
      { type: "sample", sample: pressureSample(400) },
      { type: "sample", sample: pressureSample(800) },
      { type: "sample", sample: pressureSample(1_200) },
      { type: "sample", sample: pressureSample(1_400) },
      { type: "sample", sample: pressureSample(1_500) },
      { type: "recovering", atMs: 1_600 },
      { type: "recovered", atMs: 1_700, nextAttempt: 1 },
      { type: "sample", sample: sample(1_700) }
    ];
    const result = replayVramStallWatchdogTrace(events, policy);

    expect(result.triggerCount).toBe(1);
    expect(result.state.status).toBe("observing");
    expect(result.state.attempt).toBe(1);
    expect(result.state.baseline.sampleCount).toBe(1);
  });

  it("does not attribute pressure on a non-target adapter to the task", () => {
    const events: VramStallWatchdogEvent[] = [
      ...baselineEvents(),
      { type: "sample", sample: { ...pressureSample(400), adapterId: "gpu-b" } },
      { type: "sample", sample: { ...pressureSample(800), adapterId: "gpu-b" } },
      { type: "sample", sample: { ...pressureSample(1_200), adapterId: "gpu-b" } },
      { type: "sample", sample: { ...pressureSample(1_400), adapterId: "gpu-b" } }
    ];
    const result = replayVramStallWatchdogTrace(events, policy);

    expect(result.triggerCount).toBe(0);
    expect(result.state.status).toBe("observing");
    expect(result.state.telemetryGapCount).toBe(4);
  });
});
