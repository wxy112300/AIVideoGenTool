import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { StringDecoder } from "node:string_decoder";
export function localEndpoint(rawUrl: string, fallbackPort: number): {
  host: string;
  port: number;
} | null {
  try {
    const url = new URL(rawUrl);
    if (
      url.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    ) {
      return null;
    }
    const port = Number(url.port || fallbackPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    return { host: "127.0.0.1", port };
  } catch {
    return null;
  }
}

export async function isLocalPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (value: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(1_000, () => finish(false));
  });
}

export async function launchDetached(
  executable: string,
  args: string[],
  cwd?: string,
  env: NodeJS.ProcessEnv = process.env,
  onExit?: (processId: number, code: number | null, signal: NodeJS.Signals | null) => void
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env,
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (child.pid) onExit?.(child.pid, code, signal);
    });
    child.once("spawn", () => {
      if (!child.pid) {
        reject(new Error(`无法获取已启动进程 PID：${executable}`));
        return;
      }
      child.unref();
      resolve(child.pid);
    });
  });
}

/**
 * Start app-owned ComfyUI Python with stable, captured output streams.
 *
 * The generic detached launcher intentionally discards stdio for background
 * helpers. ComfyUI is different: startup, import, and model-loading output is
 * required diagnostics. Keep this separate so its pipes are continuously
 * drained while unrelated helpers retain their hidden-process behavior.
 */
export async function launchComfyUiVisible(
  executable: string,
  args: string[],
  cwd?: string,
  env: NodeJS.ProcessEnv = process.env,
  onExit?: (processId: number, code: number | null, signal: NodeJS.Signals | null) => void,
  onOutput?: (processId: number, stream: "stdout" | "stderr", line: string) => void
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    const remainders = { stdout: "", stderr: "" };
    const decoders = {
      stdout: new StringDecoder("utf8"),
      stderr: new StringDecoder("utf8")
    };
    const forward = (stream: "stdout" | "stderr", chunk: Buffer): void => {
      const text = remainders[stream] + decoders[stream].write(chunk);
      const lines = text.split(/\r\n|[\r\n]/u);
      remainders[stream] = lines.pop() ?? "";
      if (!child.pid) return;
      for (const line of lines) onOutput?.(child.pid, stream, line);
    };
    child.stdout?.on("data", (chunk: Buffer) => forward("stdout", chunk));
    child.stderr?.on("data", (chunk: Buffer) => forward("stderr", chunk));
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (child.pid) {
        for (const stream of ["stdout", "stderr"] as const) {
          remainders[stream] += decoders[stream].end();
          if (remainders[stream]) onOutput?.(child.pid, stream, remainders[stream]);
        }
        onExit?.(child.pid, code, signal);
      }
    });
    child.once("spawn", () => {
      if (!child.pid) {
        reject(new Error(`无法获取已启动进程 PID：${executable}`));
        return;
      }
      child.unref();
      resolve(child.pid);
    });
  });
}

export async function waitForService(
  url: string,
  timeoutMs = 120_000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(1500)
      });
      if (response.ok) return true;
    } catch {
      // The process may still be importing models and custom nodes.
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return false;
}
