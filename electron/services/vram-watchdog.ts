import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  evaluateVramPressure,
  type VramPressure,
  type VramWatchdogState
} from "../../src/core/vram-watchdog.js";

const execFileAsync = promisify(execFile);

export class VramWatchdogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VramWatchdogError";
  }
}

export interface VramWatchdogMonitor {
  stop(): void;
  peakUsedMiB(): number;
}

export function startAdaptiveVramWatchdog(
  controller: AbortController,
  onSample?: (pressure: VramPressure, utilization: number | null) => void
): VramWatchdogMonitor {
  let checking = false;
  let stopped = false;
  let peakUsed = 0;
  let state: VramWatchdogState = {};

  const check = async () => {
    if (checking || stopped || controller.signal.aborted) return;
    checking = true;
    try {
      const { stdout } = await execFileAsync(
        "nvidia-smi",
        [
          "--query-gpu=memory.used,memory.total,utilization.gpu",
          "--format=csv,noheader,nounits"
        ],
        { encoding: "utf8", windowsHide: true }
      );
      const values = stdout
        .trim()
        .split(/\r?\n/, 1)[0]
        ?.split(",")
        .map((value) => Number(value.trim()));
      if (!values || values.length < 2 || values.slice(0, 2).some(Number.isNaN)) {
        return;
      }
      const [usedMiB, totalMiB, utilization] = values;
      peakUsed = Math.max(peakUsed, usedMiB!);
      const pressure = evaluateVramPressure(state, {
        usedMiB: usedMiB!,
        totalMiB: totalMiB!,
        sampledAtMs: Date.now()
      });
      state = pressure.state;
      onSample?.(
        pressure,
        utilization !== undefined && Number.isFinite(utilization)
          ? utilization
          : null
      );
      if (pressure.shouldAbort && !controller.signal.aborted) {
        controller.abort(
          new VramWatchdogError(`显存保护已停止任务：${pressure.reason}`)
        );
      }
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