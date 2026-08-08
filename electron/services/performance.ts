import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
import type {
  PerformanceMetrics,
  Settings,
  TaskPerformanceStats
} from "../../src/types.js";
import type { VramSample } from "../../src/core/vram-watchdog.js";

const execFileAsync = promisify(execFile);
interface CpuSampleState {
  previous?: {
    idle: number;
    total: number;
  };
}

export interface TaskPerformanceTelemetry {
  elapsedSeconds: number;
  cpuPercent: number | null;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  gpuPercent: number | null;
  vramUsedBytes: number | null;
  vramTotalBytes: number | null;
  sharedGpuMemoryBytes: number | null;
  sharedGpuMemoryPeakBytes: number | null;
  gpuTemperatureC: number | null;
}

function readCpuPercent(state: CpuSampleState): number | null {
  const totals = os.cpus().reduce(
    (result, cpu) => {
      const total = Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
      result.idle += cpu.times.idle;
      result.total += total;
      return result;
    },
    { idle: 0, total: 0 }
  );
  if (!state.previous) {
    state.previous = totals;
    return null;
  }
  const idle = totals.idle - state.previous.idle;
  const total = totals.total - state.previous.total;
  state.previous = totals;
  return total > 0 ? Math.max(0, Math.min(100, ((total - idle) / total) * 100)) : null;
}

const uiCpuState: CpuSampleState = {};

async function readSharedGpuMemoryBytes(): Promise<number | null> {
  if (process.platform !== "win32") return null;
  const script = [
    "$sum = (Get-Counter -Counter '\\GPU Adapter Memory(*)\\Shared Usage' -ErrorAction Stop).CounterSamples | Measure-Object -Property CookedValue -Sum",
    "[math]::Round($sum.Sum)"
  ].join("; ");
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { encoding: "utf8", timeout: 5_000, windowsHide: true }
    );
    const value = Number(stdout.trim());
    return Number.isFinite(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

async function nvidiaMetrics(): Promise<{
  gpuPercent: number | null;
  vramUsedBytes: number | null;
  vramTotalBytes: number | null;
  gpuTemperature: number | null;
}> {
  try {
    const { stdout } = await execFileAsync("nvidia-smi", [
      "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu",
      "--format=csv,noheader,nounits"
    ]);
    const values = stdout
      .trim()
      .split(/\r?\n/, 1)[0]
      ?.split(",")
      .map((value) => Number(value.trim()));
    if (!values || values.length < 4 || values.some(Number.isNaN)) throw new Error();
    return {
      gpuPercent: values[0]!,
      vramUsedBytes: values[1]! * 1024 * 1024,
      vramTotalBytes: values[2]! * 1024 * 1024,
      gpuTemperature: values[3]!
    };
  } catch {
    return {
      gpuPercent: null,
      vramUsedBytes: null,
      vramTotalBytes: null,
      gpuTemperature: null
    };
  }
}

export async function getPerformanceMetrics(
  settings: Settings
): Promise<PerformanceMetrics> {
  const [gpu, comfyConnected] = await Promise.all([
    nvidiaMetrics(),
    fetch(`${settings.comfyUrl.replace(/\/+$/, "")}/system_stats`, {
      signal: AbortSignal.timeout(2_000)
    })
      .then((response) => response.ok)
      .catch(() => false)
  ]);
  const memoryTotalBytes = os.totalmem();
  return {
    sampledAt: new Date().toISOString(),
    cpuPercent: readCpuPercent(uiCpuState) ?? 0,
    memoryUsedBytes: memoryTotalBytes - os.freemem(),
    memoryTotalBytes,
    ...gpu,
    comfyConnected
  };
}

export interface TaskPerformanceMonitor {
  recordGpuSample(sample: VramSample): void;
  snapshot(): Promise<TaskPerformanceTelemetry>;
  stop(): TaskPerformanceStats;
}

export function startTaskPerformanceMonitor(
  intervalMs = 2_000
): TaskPerformanceMonitor {
  const startedAt = Date.now();
  const cpuState: CpuSampleState = {};
  let stopped = false;
  let result: TaskPerformanceStats | undefined;
  let sampleCount = 0;
  let cpuSampleCount = 0;
  let cpuSum = 0;
  let cpuPeak = 0;
  let memorySum = 0;
  let memoryPeak = 0;
  let memoryTotal = os.totalmem();
  let gpuSampleCount = 0;
  let gpuSum = 0;
  let gpuPeak: number | null = null;
  let gpuTemperaturePeak: number | null = null;
  let vramSum = 0;
  let vramBaseline: number | null = null;
  let vramPeak: number | null = null;
  let vramTotal: number | null = null;
  let latestCpuPercent: number | null = null;
  let latestMemoryUsedBytes = 0;
  let latestMemoryTotalBytes = os.totalmem();
  let latestGpuPercent: number | null = null;
  let latestVramUsedBytes: number | null = null;
  let latestVramTotalBytes: number | null = null;
  let latestGpuTemperatureC: number | null = null;
  let latestSharedGpuMemoryBytes: number | null = null;
  let sharedGpuMemoryPeakBytes: number | null = null;

  const sampleHost = (): void => {
    if (stopped) return;
    const cpu = readCpuPercent(cpuState);
    const total = os.totalmem();
    const used = total - os.freemem();
    sampleCount += 1;
    latestCpuPercent = cpu;
    latestMemoryUsedBytes = used;
    latestMemoryTotalBytes = total;
    memoryTotal = total;
    memorySum += used;
    memoryPeak = Math.max(memoryPeak, used);
    if (cpu != null) {
      cpuSampleCount += 1;
      cpuSum += cpu;
      cpuPeak = Math.max(cpuPeak, cpu);
    }
  };

  sampleHost();
  const timer = setInterval(sampleHost, Math.max(1_000, intervalMs));

  return {
    recordGpuSample(sample) {
      if (stopped) return;
      gpuSampleCount += 1;
      const usedBytes = sample.usedMiB * 1024 ** 2;
      const totalBytes = sample.totalMiB * 1024 ** 2;
      latestGpuPercent = sample.gpuUtilization ?? null;
      latestVramUsedBytes = usedBytes;
      latestVramTotalBytes = totalBytes;
      latestGpuTemperatureC = sample.gpuTemperatureC ?? null;
      vramBaseline ??= usedBytes;
      vramSum += usedBytes;
      vramPeak = vramPeak == null ? usedBytes : Math.max(vramPeak, usedBytes);
      vramTotal = totalBytes;
      if (sample.gpuUtilization != null && Number.isFinite(sample.gpuUtilization)) {
        gpuSum += sample.gpuUtilization;
        gpuPeak = gpuPeak == null
          ? sample.gpuUtilization
          : Math.max(gpuPeak, sample.gpuUtilization);
      }
      if (sample.gpuTemperatureC != null && Number.isFinite(sample.gpuTemperatureC)) {
        gpuTemperaturePeak = gpuTemperaturePeak == null
          ? sample.gpuTemperatureC
          : Math.max(gpuTemperaturePeak, sample.gpuTemperatureC);
      }
    },
    async snapshot() {
      latestSharedGpuMemoryBytes = await readSharedGpuMemoryBytes();
      if (latestSharedGpuMemoryBytes != null) {
        sharedGpuMemoryPeakBytes = sharedGpuMemoryPeakBytes == null
          ? latestSharedGpuMemoryBytes
          : Math.max(sharedGpuMemoryPeakBytes, latestSharedGpuMemoryBytes);
      }
      return {
        elapsedSeconds: Math.max(0, (Date.now() - startedAt) / 1000),
        cpuPercent: latestCpuPercent,
        memoryUsedBytes: latestMemoryUsedBytes,
        memoryTotalBytes: latestMemoryTotalBytes,
        gpuPercent: latestGpuPercent,
        vramUsedBytes: latestVramUsedBytes,
        vramTotalBytes: latestVramTotalBytes,
        sharedGpuMemoryBytes: latestSharedGpuMemoryBytes,
        sharedGpuMemoryPeakBytes,
        gpuTemperatureC: latestGpuTemperatureC
      };
    },
    stop() {
      if (result) return result;
      stopped = true;
      clearInterval(timer);
      const durationSeconds = Math.max(0, (Date.now() - startedAt) / 1000);
      result = {
        durationSeconds,
        sampleCount,
        gpuSampleCount,
        cpuAveragePercent: cpuSampleCount ? cpuSum / cpuSampleCount : 0,
        cpuPeakPercent: cpuSampleCount ? cpuPeak : 0,
        memoryAverageBytes: sampleCount ? memorySum / sampleCount : 0,
        memoryPeakBytes: memoryPeak,
        memoryTotalBytes: memoryTotal,
        gpuAveragePercent: gpuPeak == null ? null : gpuSum / gpuSampleCount,
        gpuPeakPercent: gpuPeak,
        gpuTemperaturePeak,
        vramBaselineBytes: vramBaseline,
        vramAverageBytes: vramPeak == null ? null : vramSum / gpuSampleCount,
        vramPeakBytes: vramPeak,
        vramTotalBytes: vramTotal,
        sharedGpuMemoryPeakBytes
      };
      return result;
    }
  };
}
