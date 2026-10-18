import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import type { StrataResourceProbe, StrataResourceRetryPolicy } from "./strata-resources.js";

export const AGENT_RESOURCE_RETRY: Readonly<StrataResourceRetryPolicy> = Object.freeze({ maxWaitMs: 30_000, retryUntilDeadline: true });

/** One lightweight owned Python process. Fresh request/response; no cached resource admission. */
export class AgentResourceSampler {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 0;
  private pending = new Map<number, { resolve(value: StrataResourceProbe): void; reject(error: Error): void }>();
  async start(python: string, script: string, track: (pid: number) => Promise<void>) {
    if (this.child) throw new Error("资源采样进程已存在");
    const child = spawn(python, ["-B", "-u", script], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    this.child = child;
    const fail = (message = "资源采样进程已退出") => {
      if (this.child !== child) return; // A previous child's delayed close cannot fail a new run.
      for (const item of this.pending.values()) item.reject(new Error(message));
      this.pending.clear();
    };
    child.on("error", () => fail()); child.on("close", () => fail()); child.stdin.on("error", () => fail());
    child.stderr.resume(); // Never relay arbitrary helper stderr/paths as a successful sample.
    const lines = createInterface({ input: child.stdout });
    child.once("close", () => lines.close());
    lines.on("line", line => {
      try {
        const message = JSON.parse(line), item = this.pending.get(message.id);
        if (!item) return; // Late/cancelled samples cannot satisfy another request.
        const r = message.resources;
        const number = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
        if (!r || ![r.memoryAvailableBytes, r.commitAvailableBytes, r.vramAvailableBytes, r.vramTotalBytes].every(v => v === null || number(v))
          || (number(r.vramAvailableBytes) && number(r.vramTotalBytes) && (r.vramTotalBytes === 0 || r.vramAvailableBytes > r.vramTotalBytes))) throw new Error();
        this.pending.delete(message.id);
        item.resolve({ memoryAvailableBytes: r.memoryAvailableBytes ?? NaN, commitAvailableBytes: r.commitAvailableBytes,
          vramAvailableBytes: r.vramAvailableBytes, vramTotalBytes: r.vramTotalBytes,
          probeIssues: [
            ...(r.memoryAvailableBytes === null || r.commitAvailableBytes === null ? [{ source: "windows-commit" as const, kind: "invalid" as const, durationMs: 0 }] : []),
            ...(r.vramAvailableBytes === null || r.vramTotalBytes === null ? [{ source: "gpu-memory" as const, kind: "invalid" as const, durationMs: 0 }] : [])
          ] });
      } catch { fail("资源采样响应无效"); }
    });
    try {
      await new Promise<void>((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
      await track(child.pid!);
    } catch (error) { await this.stop(); throw error; }
  }
  read = (signal?: AbortSignal): Promise<StrataResourceProbe> => {
    signal?.throwIfAborted();
    const child = this.child;
    if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.reject(new Error("资源采样进程未运行"));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const finish = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); this.pending.delete(id); };
      const abort = () => { finish(); reject(signal?.reason ?? new Error("资源采样取消")); };
      // Bound each request; Agent retries fresh requests throughout its 30s grace period.
      const timer = setTimeout(() => { finish(); reject(new Error("资源采样响应超时")); }, 3000);
      this.pending.set(id, { resolve: value => { finish(); resolve(value); }, reject: error => { finish(); reject(error); } });
      signal?.addEventListener("abort", abort, { once: true });
      child.stdin.write(JSON.stringify({ id }) + "\n", error => { if (error) { finish(); reject(new Error("资源采样通道关闭")); } });
    });
  };
  async stop() {
    const child = this.child;
    if (!child) return;
    for (const item of this.pending.values()) item.reject(new Error("资源采样停止"));
    this.pending.clear(); child.stdin.end();
    const deadline = Date.now() + 2000;
    while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) await delay(20);
    if (child.exitCode === null && child.signalCode === null) child.kill(); // Only this owned lightweight helper.
    const killedDeadline = Date.now() + 2000;
    while (child.exitCode === null && child.signalCode === null && Date.now() < killedDeadline) await delay(20);
    if (child.exitCode === null && child.signalCode === null) throw new Error("自有资源采样进程尚未退出，保留租约");
    this.child = null;
  }
}
