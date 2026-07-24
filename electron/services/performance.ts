import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
import type { PerformanceMetrics, Settings } from "../../src/types.js";

const execFileAsync = promisify(execFile);
let previousCpu:
  | {
      idle: number;
      total: number;
    }
  | undefined;

function cpuPercent(): number {
  const totals = os.cpus().reduce(
    (result, cpu) => {
      const total = Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
      result.idle += cpu.times.idle;
      result.total += total;
      return result;
    },
    { idle: 0, total: 0 }
  );
  if (!previousCpu) {
    previousCpu = totals;
    return 0;
  }
  const idle = totals.idle - previousCpu.idle;
  const total = totals.total - previousCpu.total;
  previousCpu = totals;
  return total > 0 ? Math.max(0, Math.min(100, ((total - idle) / total) * 100)) : 0;
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
    cpuPercent: cpuPercent(),
    memoryUsedBytes: memoryTotalBytes - os.freemem(),
    memoryTotalBytes,
    ...gpu,
    comfyConnected
  };
}
