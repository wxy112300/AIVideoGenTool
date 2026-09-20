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
  memoryAvailableBytes: number;
  committedBytes: number | null;
  commitLimitBytes: number | null;
  pagesInputPerSec: number | null;
  pagesOutputPerSec: number | null;
  hardFaultsPerSec: number | null;
  samplerTickLatenessMs: number | null;
  nvidiaSmiDurationMs: number | null;
  counterReadDurationMs: number | null;
  comfyRoundTripMs: number | null;
}

export interface TaskResourceSample {
  sampledAtMs: number;
  vram: VramSample | null;
  gpuPercent: number | null;
  vramUsedBytes: number | null;
  vramTotalBytes: number | null;
  gpuTemperatureC: number | null;
  sharedGpuMemoryBytes: number | null;
  memoryTotalBytes: number;
  memoryAvailableBytes: number;
  committedBytes: number | null;
  commitLimitBytes: number | null;
  pagesInputPerSec: number | null;
  pagesOutputPerSec: number | null;
  hardFaultsPerSec: number | null;
  samplerTickLatenessMs: number;
  nvidiaSmiDurationMs: number;
  counterReadDurationMs: number | null;
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

interface WindowsMemoryPressure {
  sharedGpuMemoryBytes: number | null;
  committedBytes: number | null;
  commitLimitBytes: number | null;
  pagesInputPerSec: number | null;
  pagesOutputPerSec: number | null;
  hardFaultsPerSec: number | null;
  counterReadDurationMs: number | null;
}

function finiteCounter(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

async function readWindowsMemoryPressure(): Promise<WindowsMemoryPressure> {
  if (process.platform !== "win32") {
    return {
      sharedGpuMemoryBytes: null,
      committedBytes: null,
      commitLimitBytes: null,
      pagesInputPerSec: null,
      pagesOutputPerSec: null,
      hardFaultsPerSec: null,
      counterReadDurationMs: null
    };
  }
  const startedAt = Date.now();
  // One bounded helper call batches the counters. Shared Usage is summed only
  // when Windows exposes one adapter instance; multi-GPU attribution is left
  // missing for the task detector until a stable adapter mapping is available.
  const script = [
    "$c = Get-Counter -Counter '\\GPU Adapter Memory(*)\\Shared Usage','\\Memory\\Committed Bytes','\\Memory\\Commit Limit','\\Memory\\Pages Input/sec','\\Memory\\Pages Output/sec','\\Memory\\Page Faults/sec' -ErrorAction Stop",
    "$shared = @($c.CounterSamples | Where-Object {$_.Path -like '*GPU Adapter Memory*Shared Usage*'})",
    "$singleShared = if ($shared.Count -eq 1) {[math]::Round($shared[0].CookedValue)} else {$null}",
    "$find = { param($path) $c.CounterSamples | Where-Object {$_.Path -eq $path} | Select-Object -First 1 -ExpandProperty CookedValue }",
    "[pscustomobject]@{sharedGpuMemoryBytes=$singleShared; committedBytes=&$find '\\Memory\\Committed Bytes'; commitLimitBytes=&$find '\\Memory\\Commit Limit'; pagesInputPerSec=&$find '\\Memory\\Pages Input/sec'; pagesOutputPerSec=&$find '\\Memory\\Pages Output/sec'; hardFaultsPerSec=&$find '\\Memory\\Page Faults/sec'} | ConvertTo-Json -Compress"
  ].join("; ");
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { encoding: "utf8", timeout: 5_000, windowsHide: true }
    );
    const parsed = JSON.parse(stdout.trim()) as Record<string, unknown>;
    return {
      sharedGpuMemoryBytes: finiteCounter(parsed.sharedGpuMemoryBytes),
      committedBytes: finiteCounter(parsed.committedBytes),
      commitLimitBytes: finiteCounter(parsed.commitLimitBytes),
      pagesInputPerSec: finiteCounter(parsed.pagesInputPerSec),
      pagesOutputPerSec: finiteCounter(parsed.pagesOutputPerSec),
      hardFaultsPerSec: finiteCounter(parsed.hardFaultsPerSec),
      counterReadDurationMs: Date.now() - startedAt
    };
  } catch {
    return {
      sharedGpuMemoryBytes: null,
      committedBytes: null,
      commitLimitBytes: null,
      pagesInputPerSec: null,
      pagesOutputPerSec: null,
      hardFaultsPerSec: null,
      counterReadDurationMs: Date.now() - startedAt
    };
  }
}

async function nvidiaMetrics(): Promise<{
  gpuPercent: number | null;
  vramUsedBytes: number | null;
  vramTotalBytes: number | null;
  gpuTemperature: number | null;
  durationMs: number;
}> {
  const startedAt = Date.now();
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
      gpuTemperature: values[3]!,
      durationMs: Date.now() - startedAt
    };
  } catch {
    return {
      gpuPercent: null,
      vramUsedBytes: null,
      vramTotalBytes: null,
      gpuTemperature: null,
      durationMs: Date.now() - startedAt
    };
  }
}

export async function readTaskResourceSample(
  includeWindowsCounters = false,
  previousSampledAtMs?: number
): Promise<TaskResourceSample> {
  const [gpu, windows] = await Promise.all([
    nvidiaMetrics(),
    includeWindowsCounters
      ? readWindowsMemoryPressure()
      : Promise.resolve<WindowsMemoryPressure>({
          sharedGpuMemoryBytes: null,
          committedBytes: null,
          commitLimitBytes: null,
          pagesInputPerSec: null,
          pagesOutputPerSec: null,
          hardFaultsPerSec: null,
          counterReadDurationMs: null
        })
  ]);
  const sampledAtMs = Date.now();
  const memoryTotalBytes = os.totalmem();
  const memoryAvailableBytes = os.freemem();
  const usedMiB = gpu.vramUsedBytes == null ? null : gpu.vramUsedBytes / 1024 ** 2;
  const totalMiB = gpu.vramTotalBytes == null ? null : gpu.vramTotalBytes / 1024 ** 2;
  return {
    sampledAtMs,
    vram: usedMiB != null && totalMiB != null
      ? {
          usedMiB,
          totalMiB,
          sampledAtMs,
          ...(gpu.gpuPercent == null ? {} : { gpuUtilization: gpu.gpuPercent }),
          ...(gpu.gpuTemperature == null ? {} : { gpuTemperatureC: gpu.gpuTemperature })
        }
      : null,
    gpuPercent: gpu.gpuPercent,
    vramUsedBytes: gpu.vramUsedBytes,
    vramTotalBytes: gpu.vramTotalBytes,
    gpuTemperatureC: gpu.gpuTemperature,
    sharedGpuMemoryBytes: windows.sharedGpuMemoryBytes,
    memoryTotalBytes,
    memoryAvailableBytes,
    committedBytes: windows.committedBytes,
    commitLimitBytes: windows.commitLimitBytes,
    pagesInputPerSec: windows.pagesInputPerSec,
    pagesOutputPerSec: windows.pagesOutputPerSec,
    hardFaultsPerSec: windows.hardFaultsPerSec,
    samplerTickLatenessMs: previousSampledAtMs == null
      ? 0
      : Math.max(0, sampledAtMs - previousSampledAtMs - 1_000),
    nvidiaSmiDurationMs: gpu.durationMs,
    counterReadDurationMs: windows.counterReadDurationMs
  };
}

export async function getComputeResourceSnapshot(): Promise<{
  systemMemoryTotalBytes: number;
  systemMemoryAvailableBytes: number;
  vramTotalBytes: number | null;
  vramAvailableBytes: number | null;
}> {
  const gpu = await nvidiaMetrics();
  return {
    systemMemoryTotalBytes: os.totalmem(),
    systemMemoryAvailableBytes: os.freemem(),
    vramTotalBytes: gpu.vramTotalBytes,
    vramAvailableBytes: gpu.vramTotalBytes != null && gpu.vramUsedBytes != null
      ? Math.max(0, gpu.vramTotalBytes - gpu.vramUsedBytes)
      : null
  };
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
  recordResourceSample?(sample: TaskResourceSample): void;
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
  let latestMemoryAvailableBytes = os.freemem();
  let latestCommittedBytes: number | null = null;
  let latestCommitLimitBytes: number | null = null;
  let latestPagesInputPerSec: number | null = null;
  let latestPagesOutputPerSec: number | null = null;
  let latestHardFaultsPerSec: number | null = null;
  let latestSamplerTickLatenessMs: number | null = null;
  let latestNvidiaSmiDurationMs: number | null = null;
  let latestCounterReadDurationMs: number | null = null;
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
    latestMemoryAvailableBytes = os.freemem();
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
    recordResourceSample(sample) {
      if (stopped) return;
      latestMemoryAvailableBytes = sample.memoryAvailableBytes;
      latestMemoryTotalBytes = sample.memoryTotalBytes;
      latestMemoryUsedBytes = Math.max(0, sample.memoryTotalBytes - sample.memoryAvailableBytes);
      memoryTotal = sample.memoryTotalBytes;
      latestCommittedBytes = sample.committedBytes;
      latestCommitLimitBytes = sample.commitLimitBytes;
      latestPagesInputPerSec = sample.pagesInputPerSec;
      latestPagesOutputPerSec = sample.pagesOutputPerSec;
      latestHardFaultsPerSec = sample.hardFaultsPerSec;
      latestSamplerTickLatenessMs = sample.samplerTickLatenessMs;
      latestNvidiaSmiDurationMs = sample.nvidiaSmiDurationMs;
      latestCounterReadDurationMs = sample.counterReadDurationMs;
      if (sample.sharedGpuMemoryBytes != null) {
        latestSharedGpuMemoryBytes = sample.sharedGpuMemoryBytes;
        sharedGpuMemoryPeakBytes = sharedGpuMemoryPeakBytes == null
          ? sample.sharedGpuMemoryBytes
          : Math.max(sharedGpuMemoryPeakBytes, sample.sharedGpuMemoryBytes);
      }
    },
    async snapshot() {
      // When the task sampler is enabled, its single-flight resource sample is
      // already the source of truth. Retain the legacy shared-memory fallback
      // only for tasks where the watchdog sampler is disabled.
      if (latestSharedGpuMemoryBytes == null) {
        latestSharedGpuMemoryBytes = await readSharedGpuMemoryBytes();
      }
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
        memoryAvailableBytes: latestMemoryAvailableBytes,
        gpuPercent: latestGpuPercent,
        vramUsedBytes: latestVramUsedBytes,
        vramTotalBytes: latestVramTotalBytes,
        sharedGpuMemoryBytes: latestSharedGpuMemoryBytes,
        sharedGpuMemoryPeakBytes,
        gpuTemperatureC: latestGpuTemperatureC,
        committedBytes: latestCommittedBytes,
        commitLimitBytes: latestCommitLimitBytes,
        pagesInputPerSec: latestPagesInputPerSec,
        pagesOutputPerSec: latestPagesOutputPerSec,
        hardFaultsPerSec: latestHardFaultsPerSec,
        samplerTickLatenessMs: latestSamplerTickLatenessMs,
        nvidiaSmiDurationMs: latestNvidiaSmiDurationMs,
        counterReadDurationMs: latestCounterReadDurationMs,
        comfyRoundTripMs: null
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
