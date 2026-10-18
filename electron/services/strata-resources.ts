import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import { getApplicationLogger } from "../../src/infrastructure/app-logger.js";
import { knownStrataResourcePressure, missingStrataResourceMetrics, strataResourcePressure, type StrataResources } from "../../src/core/strata-resource-policy.js";
const exec = promisify(execFile);

interface ProbeIssue { source: "gpu-memory" | "windows-commit" | "sampler"; kind: "timeout" | "exit" | "invalid" | "unsupported" | "exception"; durationMs: number }
export interface StrataResourceProbe extends StrataResources { probeIssues?: ProbeIssue[] }
export interface StrataResourceDiagnostic {
  event: "retry" | "recovered" | "unavailable" | "pressure";
  attempt: number; elapsedMs: number; missingMetrics: string[]; sources: string[];
  memoryAvailableBytes: number; commitAvailableBytes: number | null; vramAvailableBytes: number | null;
}
export interface StrataResourceRetryPolicy { maxWaitMs?: number; retryUntilDeadline?: boolean }
interface RetryOptions extends StrataResourceRetryPolicy { signal?: AbortSignal; onDiagnostic?(event: StrataResourceDiagnostic): void; retryDelayMs?: number;
  knownPressure?: (sample: StrataResources) => string | null }
const probeTimeoutMs = 5000;

function probeFailure(source: ProbeIssue["source"], error: unknown, started: number): ProbeIssue {
  const failure = error as { killed?: boolean; name?: string; code?: unknown } | null;
  return { source, kind: failure?.killed || failure?.name === "AbortError" || failure?.name === "TimeoutError" ? "timeout"
    : failure?.code !== undefined ? "exit" : "exception", durationMs: Date.now() - started };
}

async function readGpuMemory(signal?: AbortSignal): Promise<Pick<StrataResourceProbe, "vramAvailableBytes" | "vramTotalBytes" | "probeIssues">> {
  const started = Date.now();
  try {
    // Safety needs memory, not utilization or temperature: N/A in those must not invalidate VRAM.
    const { stdout } = await exec("nvidia-smi", ["--query-gpu=memory.free,memory.total", "--format=csv,noheader,nounits"],
      { windowsHide: true, encoding: "utf8", timeout: probeTimeoutMs, signal });
    const columns = stdout.trim().split(/\r?\n/, 1)[0]?.split(",").map((v) => v.trim());
    const values = columns?.map((v) => v ? Number(v) : NaN);
    if (!values || values.length !== 2 || values.some((v) => !Number.isFinite(v) || v < 0)
      || values[1]! <= 0 || values[0]! > values[1]!) return { vramAvailableBytes: null, vramTotalBytes: null,
        probeIssues: [{ source: "gpu-memory", kind: "invalid", durationMs: Date.now() - started }] };
    return { vramAvailableBytes: values[0]! * 1024 ** 2, vramTotalBytes: values[1]! * 1024 ** 2 };
  } catch (error) {
    return { vramAvailableBytes: null, vramTotalBytes: null, probeIssues: [probeFailure("gpu-memory", error, started)] };
  }
}

/** Fresh, locale-independent Windows physical/commit availability. Never infer free commit from pagefile size. */
export async function readStrataResources(signal?: AbortSignal): Promise<StrataResourceProbe> {
  signal?.throwIfAborted();
  const gpuPromise = readGpuMemory(signal);
  const issues: ProbeIssue[] = [];
  let commitAvailableBytes: number | null = null;
  if (process.platform === "win32") {
    const started = Date.now();
    try {
      const { stdout } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
        "(Get-CimInstance Win32_OperatingSystem).FreeVirtualMemory"], { windowsHide: true, encoding: "utf8", timeout: probeTimeoutMs, signal });
      const value = Number(stdout.trim());
      if (stdout.trim() && Number.isFinite(value) && value >= 0) commitAvailableBytes = value * 1024;
      else issues.push({ source: "windows-commit", kind: "invalid", durationMs: Date.now() - started });
    } catch (error) { issues.push(probeFailure("windows-commit", error, started)); }
  } else issues.push({ source: "windows-commit", kind: "unsupported", durationMs: 0 });
  // Join both helpers even on cancellation, so no old probe leaks into the next operation.
  const gpu = await gpuPromise;
  signal?.throwIfAborted();
  return { memoryAvailableBytes: os.freemem(), commitAvailableBytes,
    vramAvailableBytes: gpu.vramAvailableBytes, vramTotalBytes: gpu.vramTotalBytes,
    probeIssues: [...issues, ...(gpu.probeIssues ?? [])] };
}

function diagnostic(event: StrataResourceDiagnostic): void {
  try {
    const logger = getApplicationLogger();
    const level = event.event === "recovered" ? "info" : event.event === "retry" ? "warn" : "error";
    logger[level]("prompt", `strata-resource-${event.event}`, "Strata resource telemetry", { ...event });
  } catch { /* Logging must not own inference or leak raw helper output/commands. */ }
}

/** Abort the wait (and native helpers via signal) without accepting a late sample. */
function cancellable<T>(run: () => Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(signal.reason); };
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(() => { signal.throwIfAborted(); return run(); }).then((value) => { signal.removeEventListener("abort", abort); resolve(value); },
      (error) => { signal.removeEventListener("abort", abort); reject(error); });
  });
}

/** Default: three fresh probes within 12s. Callers may keep retrying until their deadline. */
export async function readReliableStrataResources(read = readStrataResources, options: RetryOptions = {}): Promise<StrataResourceProbe> {
  const budget = new AbortController(), started = Date.now();
  const signal = AbortSignal.any([budget.signal, ...(options.signal ? [options.signal] : [])]);
  const timer = setTimeout(() => budget.abort(new DOMException("resource-probe-deadline", "TimeoutError")), options.maxWaitMs ?? 12_000);
  let last: StrataResourceProbe = { memoryAvailableBytes: NaN, commitAvailableBytes: null, vramAvailableBytes: null, vramTotalBytes: null };
  let nativeProbe: Promise<StrataResourceProbe> | undefined;
  let attempt = 0;
  const report = (event: StrataResourceDiagnostic["event"]) => {
    try { (options.onDiagnostic ?? diagnostic)({ event, attempt, elapsedMs: Date.now() - started,
      missingMetrics: missingStrataResourceMetrics(last), sources: (last.probeIssues ?? []).map((i) => `${i.source}:${i.kind}:${i.durationMs}ms`),
      memoryAvailableBytes: last.memoryAvailableBytes, commitAvailableBytes: last.commitAvailableBytes, vramAvailableBytes: last.vramAvailableBytes }); } catch { /* Observer only. */ }
  };
  try {
    for (attempt = 1; options.retryUntilDeadline || attempt <= 3; attempt++) {
      options.signal?.throwIfAborted();
      try { last = await cancellable(() => {
        const probe = read(signal);
        if (read === readStrataResources) nativeProbe = probe;
        return probe;
      }, signal); }
      catch (error) {
        options.signal?.throwIfAborted();
        last = { memoryAvailableBytes: NaN, commitAvailableBytes: null, vramAvailableBytes: null, vramTotalBytes: null,
          probeIssues: [probeFailure("sampler", error, started)] };
      }
      options.signal?.throwIfAborted();
      if ((options.knownPressure ?? knownStrataResourcePressure)(last)) { report("pressure"); return last; }
      if (!missingStrataResourceMetrics(last).length && !budget.signal.aborted) {
        if (attempt > 1) report("recovered");
        return last;
      }
      if ((!options.retryUntilDeadline && attempt === 3) || budget.signal.aborted) break;
      report("retry");
      try { await cancellable(() => new Promise<void>((resolve) => {
        const finish = () => { clearTimeout(wait); signal.removeEventListener("abort", finish); resolve(); };
        const wait = setTimeout(finish, (options.retryDelayMs ?? 500) * attempt);
        signal.addEventListener("abort", finish, { once: true });
      }), signal); } catch { options.signal?.throwIfAborted(); break; }
    }
    report("unavailable");
    throw new Error(`Strata 资源监测持续不可用（${missingStrataResourceMetrics(last).join(", ")}；${attempt} 次采样，${Date.now() - started}ms），本次操作已中止以保护资源。`);
  } finally {
    clearTimeout(timer); budget.abort();
    // Native child callbacks acknowledge cancellation before a later operation can sample.
    // Non-cooperative injected readers are deadline-bounded and their late results ignored.
    await nativeProbe?.catch(() => undefined);
  }
}

/** Poll non-overlapping probes; dispose waits for the in-flight probe, so none leak into a later run. */
export function watchStrataResources(abort: (reason: Error) => void, read = readStrataResources, intervalMs = 1000,
  options: Omit<RetryOptions, "signal"> & { pressure?: (sample: StrataResources) => string | null } = {}): () => Promise<void> {
  let closed = false, failed = false, pending: Promise<void> | undefined;
  const controller = new AbortController();
  const fail = (error: Error) => { if (!closed && !failed) { failed = true; clearInterval(timer); abort(error); } };
  const timer = setInterval(() => {
    if (closed || failed || pending) return;
    pending = readReliableStrataResources(read, { ...options, signal: controller.signal }).then((sample) => {
      if (!closed) { const reason = (options.pressure ?? strataResourcePressure)(sample); if (reason) fail(new Error(reason)); }
    }).catch((error) => { fail(error instanceof Error ? error : new Error("Strata 资源监测持续失败，已中止自有模型。")); })
      .finally(() => { pending = undefined; });
  }, intervalMs);
  return async () => { closed = true; clearInterval(timer); controller.abort(new Error("resource-watch-disposed")); await pending; };
}
