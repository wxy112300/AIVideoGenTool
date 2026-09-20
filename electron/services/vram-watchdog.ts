import {
  evaluateVramPressure,
  type VramPressure,
  type VramWatchdogState
} from "../../src/core/vram-watchdog.js";
import type { VramSample } from "../../src/core/vram-watchdog.js";
import {
  readTaskResourceSample,
  type TaskResourceSample
} from "./performance.js";

export interface VramWatchdogMonitor {
  stop(): void;
  peakUsedMiB(): number;
}

export interface AdaptiveVramWatchdogOptions {
  /** Enables the bounded Windows shared/commit/page counter batch. */
  includeWindowsCounters?: boolean;
  /** Counter batch cadence; the sampler itself remains at roughly one second. */
  windowsCounterIntervalMs?: number;
  /** Receives the same single-flight sample used by the VRAM telemetry path. */
  onResourceSample?(sample: TaskResourceSample): void;
}

export function startAdaptiveVramWatchdog(
  controller: AbortController,
  onSample?: (
    pressure: VramPressure,
    utilization: number | null,
    sample: VramSample
  ) => void,
  options: AdaptiveVramWatchdogOptions = {}
): VramWatchdogMonitor {
  let checking = false;
  let stopped = false;
  let peakUsed = 0;
  let state: VramWatchdogState = {};
  let lastSampledAtMs: number | undefined;
  let nextWindowsCounterReadAtMs = 0;
  let cachedWindowsCounters: Pick<
    TaskResourceSample,
    | "sharedGpuMemoryBytes"
    | "committedBytes"
    | "commitLimitBytes"
    | "pagesInputPerSec"
    | "pagesOutputPerSec"
    | "hardFaultsPerSec"
  > | undefined;

  const check = async () => {
    if (checking || stopped || controller.signal.aborted) return;
    checking = true;
    try {
      const now = Date.now();
      const shouldReadWindowsCounters = options.includeWindowsCounters === true &&
        now >= nextWindowsCounterReadAtMs;
      if (shouldReadWindowsCounters) {
        nextWindowsCounterReadAtMs = now + (options.windowsCounterIntervalMs ?? 5_000);
      }
      const rawResource = await readTaskResourceSample(
        shouldReadWindowsCounters,
        lastSampledAtMs
      );
      const resource = !shouldReadWindowsCounters && cachedWindowsCounters
        ? { ...rawResource, ...cachedWindowsCounters, counterReadDurationMs: null }
        : rawResource;
      if (shouldReadWindowsCounters) {
        cachedWindowsCounters = {
          sharedGpuMemoryBytes: resource.sharedGpuMemoryBytes,
          committedBytes: resource.committedBytes,
          commitLimitBytes: resource.commitLimitBytes,
          pagesInputPerSec: resource.pagesInputPerSec,
          pagesOutputPerSec: resource.pagesOutputPerSec,
          hardFaultsPerSec: resource.hardFaultsPerSec
        };
      }
      lastSampledAtMs = resource.sampledAtMs;
      options.onResourceSample?.(resource);
      const sample = resource.vram;
      if (!sample) return;
      peakUsed = Math.max(peakUsed, sample.usedMiB);
      const pressure = evaluateVramPressure(state, { ...sample });
      state = pressure.state;
      onSample?.(pressure, resource.gpuPercent, sample);
    } catch {
      // Monitoring is best-effort on systems without nvidia-smi.
    } finally {
      checking = false;
    }
  };

  void check();
  const timer = setInterval(() => void check(), 1_000);
  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
    peakUsedMiB() {
      return peakUsed;
    }
  };
}
