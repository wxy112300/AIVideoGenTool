import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";
import type { Settings } from "../../src/types.js";
import { getApplicationLogger, safeLogErrorMessage } from "./app-logger.js";
import { localEndpoint } from "./local-service-process.js";

const execFileAsync = promisify(execFile);
const appLogger = getApplicationLogger();

export interface ComfyShutdownDependencies {
  findComfyPython(settings: Settings): Promise<string>;
  ownedProcessIds?: () => readonly number[];
  ownedOnly?: boolean;
}

async function exists(filename: string): Promise<boolean> {
  return Boolean(await fs.stat(filename).catch(() => null));
}

export function listeningPid(netstatOutput: string, port: number): number | null {
  for (const line of netstatOutput.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 5 || fields[0]?.toUpperCase() !== "TCP") continue;
    if (fields[3]?.toUpperCase() !== "LISTENING") continue;
    const localAddress = fields[1] ?? "";
    if (!localAddress.endsWith(`:${port}`)) continue;
    const pid = Number(fields[4]);
    if (Number.isInteger(pid) && pid > 0) return pid;
  }
  return null;
}

async function processIdsForExecutable(executable: string): Promise<number[]> {
  if (!executable || !(await exists(executable))) return [];
  const script = [
    "$target = (Resolve-Path -LiteralPath $env:AIVIDEO_COMFY_EXE).Path.ToLower()",
    "$ids = Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.ToLower() -eq $target } | Select-Object -ExpandProperty ProcessId",
    "$ids | ConvertTo-Json -Compress"
  ].join("; ");
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        encoding: "utf8",
        timeout: 10_000,
        windowsHide: true,
        env: { ...process.env, AIVIDEO_COMFY_EXE: executable }
      }
    );
    const parsed = JSON.parse(stdout.trim()) as unknown;
    const values = Array.isArray(parsed) ? parsed : [parsed];
    return values.filter((value): value is number =>
      typeof value === "number" && Number.isInteger(value) && value > 0
    );
  } catch {
    return [];
  }
}

export function parseComfyProcessIds(output: string): number[] {
  try {
    const parsed = JSON.parse(output.trim()) as unknown;
    const values = Array.isArray(parsed) ? parsed : [parsed];
    return [...new Set(values.flatMap((value) => {
      if (typeof value === "number") return [value];
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const processId = (value as { ProcessId?: unknown; processId?: unknown }).ProcessId ??
        (value as { processId?: unknown }).processId;
      return typeof processId === "number" ? [processId] : [];
    }).filter((value) => Number.isInteger(value) && value > 0))];
  } catch {
    return [];
  }
}

export interface ComfyProcessInfo {
  processId: number;
  parentProcessId: number;
  name: string;
  executablePath: string;
  commandLine: string;
}

export function collectComfyProcessIds(
  processes: readonly ComfyProcessInfo[],
  listenerProcessId: number | null
): Set<number> {
  const processIds = new Set(processes.map((item) => item.processId));
  if (listenerProcessId) processIds.add(listenerProcessId);
  return processIds;
}

export function collectOwnedComfyProcessIds(
  processes: readonly ComfyProcessInfo[],
  ownedProcessIds: readonly number[]
): Set<number> {
  const processById = new Map(processes.map((item) => [item.processId, item]));
  const selected = new Set(
    ownedProcessIds.filter((processId) =>
      Number.isInteger(processId) && processId > 0 && processById.has(processId)
    )
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const process of processById.values()) {
      if (selected.has(process.processId) || !selected.has(process.parentProcessId)) continue;
      selected.add(process.processId);
      changed = true;
    }
  }
  return selected;
}

export function parseComfyProcessInfo(output: string): ComfyProcessInfo[] {
  try {
    const parsed = JSON.parse(output.trim()) as unknown;
    const values = Array.isArray(parsed) ? parsed : [parsed];
    return values.flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const item = value as Record<string, unknown>;
      const processId = Number(item.ProcessId ?? item.processId);
      if (!Number.isInteger(processId) || processId <= 0) return [];
      return [{
        processId,
        parentProcessId: Number(item.ParentProcessId ?? item.parentProcessId) || 0,
        name: String(item.Name ?? item.name ?? ""),
        executablePath: String(item.ExecutablePath ?? item.executablePath ?? ""),
        commandLine: String(item.CommandLine ?? item.commandLine ?? "")
      }];
    });
  } catch {
    return [];
  }
}

export async function allComfyProcessInfo(settings: Settings, dependencies: ComfyShutdownDependencies): Promise<ComfyProcessInfo[]> {
  const python = await dependencies.findComfyPython(settings).catch(() => "");
  const script = [
    "$python = $env:AIVIDEO_COMFY_PYTHON.ToLower();",
    "$items = Get-CimInstance Win32_Process | Where-Object {",
    "  $_.Name -ieq 'ComfyUI.exe' -or",
    "  ($_.Name -match '^(python|pythonw)(\\.exe)?$' -and (",
    "    ($python -and $_.ExecutablePath -and $_.ExecutablePath.ToLower() -eq $python -and $_.CommandLine -match '(?i)main\\.py') -or",
    "    $_.CommandLine -match '(?i)ComfyUI'",
    "  ))",
    "} | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine;",
    "$items | ConvertTo-Json -Compress"
  ].join(" ");
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        encoding: "utf8",
        timeout: 10_000,
        windowsHide: true,
        env: { ...process.env, AIVIDEO_COMFY_PYTHON: python }
      }
    );
    return parseComfyProcessInfo(stdout);
  } catch (error) {
    appLogger.warn("comfy", "process-inventory-failed", "Unable to inspect the ComfyUI process tree", {
      error: safeLogErrorMessage(error)
    });
    return [];
  }
}

export async function forceStopComfyProcesses(
  settings: Settings,
  dependencies: ComfyShutdownDependencies
): Promise<{ ok: boolean; message: string }> {
  if (process.platform !== "win32") {
    return { ok: false, message: "强制终止目前只支持 Windows。" };
  }
  const processes = await allComfyProcessInfo(settings, dependencies);
  let listenerProcessId: number | null = null;
  const endpoint = localEndpoint(settings.comfyUrl, 8188);
  if (endpoint) {
    const netstat = await execFileAsync(
      "netstat.exe",
      ["-ano", "-p", "tcp"],
      { encoding: "utf8", timeout: 5000, windowsHide: true }
    ).catch(() => ({ stdout: "" }));
    listenerProcessId = listeningPid(netstat.stdout, endpoint.port);
  }
  const ownedProcessIds = dependencies.ownedProcessIds?.() ?? [];
  const ownedComfyProcessIds = collectOwnedComfyProcessIds(processes, ownedProcessIds);
  const processIds = dependencies.ownedOnly
    ? ownedComfyProcessIds
    : collectComfyProcessIds(processes, listenerProcessId);
  appLogger.info("comfy", "force-stop-discovered", "ComfyUI processes selected for termination", {
    processIds: [...processIds],
    parentProcessIds: processes.map((item) => item.parentProcessId),
    processNames: processes.map((item) => item.name),
    commandLines: processes.map((item) => item.commandLine)
  });
  for (const processId of processIds) {
    try {
      const result = await execFileAsync(
        "taskkill.exe",
        ["/PID", String(processId), "/T", "/F"],
        { encoding: "utf8", timeout: 10_000, windowsHide: true }
      );
      appLogger.info("comfy", "process-terminated", "ComfyUI process tree termination completed", {
        processId,
        exitCode: 0,
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim()
      });
    } catch (error) {
      appLogger.warn("comfy", "process-termination-error", "ComfyUI process tree termination command failed", {
        processId,
        error: safeLogErrorMessage(error),
        exitCode: error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "unknown",
        stdout: error && typeof error === "object" && "stdout" in error
          ? String(error.stdout ?? "").trim()
          : "",
        stderr: error && typeof error === "object" && "stderr" in error
          ? String(error.stderr ?? "").trim()
          : ""
      });
      try {
        process.kill(processId, "SIGKILL");
        appLogger.info("comfy", "process-terminated-fallback", "ComfyUI process was terminated with the Node fallback", {
          processId
        });
      } catch (fallbackError) {
        appLogger.warn("comfy", "process-termination-fallback-error", "Node fallback could not terminate the ComfyUI process", {
          processId,
          error: safeLogErrorMessage(fallbackError)
        });
      }
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  const survivingProcesses = await allComfyProcessInfo(settings, dependencies);
  const survivingOwnedIds = collectOwnedComfyProcessIds(survivingProcesses, ownedProcessIds);
  const survivingIds = dependencies.ownedOnly
    ? survivingOwnedIds
    : new Set(survivingProcesses.map((item) => item.processId));
  if (endpoint) {
    const netstat = await execFileAsync(
      "netstat.exe",
      ["-ano", "-p", "tcp"],
      { encoding: "utf8", timeout: 5000, windowsHide: true }
    ).catch(() => ({ stdout: "" }));
    const listening = listeningPid(netstat.stdout, endpoint.port);
    if (listening && (!dependencies.ownedOnly || survivingOwnedIds.has(listening))) {
      survivingIds.add(listening);
    }
  }
  if (survivingIds.size) {
    appLogger.warn("comfy", "force-stop-survivors", "ComfyUI processes survived forced termination", {
      processIds: [...survivingIds],
      parentProcessIds: survivingProcesses.map((item) => item.parentProcessId),
      processNames: survivingProcesses.map((item) => item.name),
      commandLines: survivingProcesses.map((item) => item.commandLine)
    });
    return {
      ok: false,
      message: `强制终止 ComfyUI 失败：进程 PID ${[...survivingIds].join("、")} 仍在运行。`
    };
  }
  return {
    ok: true,
    message: processIds.size
      ? `已强制终止 ${processIds.size} 个 ComfyUI 进程树。`
      : "未发现正在运行的 ComfyUI 进程。"
  };
}

async function stopOrphanedComfyProcesses(
  settings: Settings,
  dependencies: ComfyShutdownDependencies
): Promise<void> {
  const result = await forceStopComfyProcesses(settings, dependencies);
  if (!result.ok) throw new Error(result.message);
}

export async function stopComfyUiService(
  settings: Settings,
  dependencies: ComfyShutdownDependencies
): Promise<void> {
  const endpoint = localEndpoint(settings.comfyUrl, 8188);
  if (!endpoint) {
    throw new Error("重启只支持本机 ComfyUI 地址（localhost 或 127.0.0.1）。");
  }
  const ownedProcessIds = dependencies.ownedProcessIds?.() ?? [];
  if (dependencies.ownedOnly && !ownedProcessIds.length) {
    throw new Error("当前 ComfyUI 由外部进程管理，应用不会自动终止它。");
  }
  const initialProcesses = await allComfyProcessInfo(settings, dependencies);
  const ownedProcessSet = collectOwnedComfyProcessIds(initialProcesses, ownedProcessIds);
  const initialStop = await forceStopComfyProcesses(settings, dependencies);
  appLogger.info(
    "comfy",
    initialStop.ok ? "stop-initial-succeeded" : "stop-initial-incomplete",
    initialStop.message,
    { ok: initialStop.ok, port: endpoint.port }
  );
  // An overloaded ComfyUI often stops answering /system_stats while its process
  // and CUDA allocation are still alive. Port ownership is the authoritative
  // signal here; requiring HTTP health made automatic recovery unable to kill
  // exactly the process it was intended to recover.
  const deadline = Date.now() + 20_000;
  let portClearSince = 0;
  while (Date.now() < deadline) {
    const { stdout } = await execFileAsync(
      "netstat.exe",
      ["-ano", "-p", "tcp"],
      { encoding: "utf8", timeout: 5000, windowsHide: true }
    );
    const pid = listeningPid(stdout, endpoint.port);
    if (!pid) {
      if (!portClearSince) portClearSince = Date.now();
      // ComfyUI Desktop can briefly re-spawn its worker after the listener is
      // killed. Require a stable free-port window before starting a replacement.
      if (Date.now() - portClearSince >= 1_500) {
        await stopOrphanedComfyProcesses(settings, dependencies);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      continue;
    }
    if (dependencies.ownedOnly && !ownedProcessSet.has(pid)) {
      throw new Error("检测到外部 ComfyUI 正在占用端口，应用不会自动终止它。");
    }
    portClearSince = 0;
    appLogger.warn("comfy", "listener-reappeared", "ComfyUI listener is still present during shutdown", {
      processId: pid,
      port: endpoint.port
    });
    try {
      const result = await execFileAsync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
        encoding: "utf8",
        timeout: 10_000,
        windowsHide: true
      });
      appLogger.info("comfy", "listener-terminated", "ComfyUI listener process tree was terminated", {
        processId: pid,
        port: endpoint.port,
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim()
      });
    } catch (error) {
      // The process may have exited between netstat and taskkill. Re-check the
      // port instead of turning that harmless race into a failed restart.
      appLogger.warn("comfy", "listener-termination-error", "Failed to terminate ComfyUI listener process tree", {
        processId: pid,
        port: endpoint.port,
        error: safeLogErrorMessage(error),
        exitCode: error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "unknown"
      });
      try {
        process.kill(pid, "SIGKILL");
        appLogger.info("comfy", "listener-terminated-fallback", "ComfyUI listener was terminated with the Node fallback", {
          processId: pid,
          port: endpoint.port
        });
      } catch (fallbackError) {
        appLogger.warn("comfy", "listener-termination-fallback-error", "Node fallback could not terminate the ComfyUI listener", {
          processId: pid,
          port: endpoint.port,
          error: safeLogErrorMessage(fallbackError)
        });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const remaining = await allComfyProcessInfo(settings, dependencies);
  appLogger.error("comfy", "stop-timeout", "ComfyUI did not stop before the shutdown deadline", {
    port: endpoint.port,
    processIds: remaining.map((item) => item.processId),
    parentProcessIds: remaining.map((item) => item.parentProcessId),
    processNames: remaining.map((item) => item.name),
    commandLines: remaining.map((item) => item.commandLine)
  });
  throw new Error(`端口 ${endpoint.port} 的 ComfyUI 进程仍未退出。`);
}
