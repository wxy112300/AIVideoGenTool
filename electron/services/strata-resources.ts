import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import { getComputeResourceSnapshot } from "./performance.js";
import { strataResourcePressure, type StrataResources } from "../../src/core/strata-resource-policy.js";
const exec = promisify(execFile);

/** Fresh, locale-independent Windows physical/commit availability. Never infer free commit from pagefile size. */
export async function readStrataResources(): Promise<StrataResources> {
  const gpuPromise = getComputeResourceSnapshot();
  let commitAvailableBytes: number | null = null;
  if (process.platform === "win32") {
    try {
      const { stdout } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
        "(Get-CimInstance Win32_OperatingSystem).FreeVirtualMemory"], { windowsHide: true, encoding: "utf8", timeout: 5000 });
      const value = Number(stdout.trim());
      if (stdout.trim() && Number.isFinite(value) && value >= 0) commitAvailableBytes = value * 1024;
    } catch { /* Unknown must fail closed, not count as unlimited commit. */ }
  }
  const gpu = await gpuPromise;
  return { memoryAvailableBytes: os.freemem(), commitAvailableBytes,
    vramAvailableBytes: gpu.vramAvailableBytes, vramTotalBytes: gpu.vramTotalBytes };
}

/** Poll non-overlapping probes; dispose waits for the in-flight probe, so none leak into a later run. */
export function watchStrataResources(abort: (reason: Error) => void, read = readStrataResources, intervalMs = 1000): () => Promise<void> {
  let closed = false, pending: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (closed || pending) return;
    pending = read().then((sample) => {
      if (!closed) { const reason = strataResourcePressure(sample); if (reason) abort(new Error(reason)); }
    }).catch(() => { if (!closed) abort(new Error("Strata 资源监测失败，已中止自有模型。")); })
      .finally(() => { pending = undefined; });
  }, intervalMs);
  return async () => { closed = true; clearInterval(timer); await pending; };
}
