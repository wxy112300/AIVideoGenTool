import net from "node:net";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { localStateBase, privateLocalDirectory, processIdentity, writePrivateJson } from "./private-local-state.js";

interface Identity { pid: number; started: string }
interface LeaseRecord { schema: 1; epoch: string; owner: "studio" | "agent"; process: Identity; children: Identity[]; secret: string }
export interface GpuLeaseOptions {
  allowHandoff?: boolean;
  directory?: string;
  identity?: typeof processIdentity;
  protect?: typeof privateLocalDirectory;
}

/** Kernel-held singleton + authenticated handoff. Stale records never authorize killing a PID.
 * Held through residency, cleanup failures and software mutations, not just requests. */
export class GpuResourceLease {
  private server: net.Server | null = null;
  private record: LeaseRecord | null = null;
  private acquiring: Promise<void> | null = null;
  private handoffPending = false;
  readonly directory: string;
  private readonly filename: string;
  private readonly endpoint: string;
  constructor(readonly owner: "studio" | "agent", private readonly relinquish: () => Promise<boolean>, private readonly options: GpuLeaseOptions = {}) {
    this.directory = options.directory ?? path.join(localStateBase(), "resource-coordination");
    this.filename = path.join(this.directory, "gpu-owner.json");
    const key = createHash("sha256").update(path.resolve(this.directory).toLowerCase()).digest("hex").slice(0, 24);
    this.endpoint = process.platform === "win32" ? `\\\\.\\pipe\\lvs-gpu-${key}` : path.join(this.directory, "gpu.sock");
  }
  get held(): boolean { return this.server !== null && this.record !== null; }
  acquire(): Promise<void> {
    if (this.handoffPending) return Promise.reject(new Error("正在交接 GPU，未启动新任务。"));
    if (this.held) return Promise.resolve();
    return this.acquiring ??= this.claim().finally(() => { this.acquiring = null; });
  }
  private async claim(): Promise<void> {
    await (this.options.protect ?? privateLocalDirectory)(this.directory);
    let server = await this.listen();
    if (!server) {
      if (this.options.allowHandoff === false) throw new Error("Strata／Agent 正在使用软件，已跳过旧软件清理；请在原窗口停止服务后重试。未请求卸载或交接模型。");
      await this.requestHandoff();
      // Windows keeps a pipe instance until the acknowledged handoff socket closes.
      for (let attempt = 0; attempt < 10 && !server; attempt++) {
        server = await this.listen();
        if (!server) await new Promise<void>((resolve) => setTimeout(resolve, 25));
      }
      if (!server) throw new Error("GPU 仍由另一进程持有；请等待或在持有者窗口停止任务后重试。");
    }
    try {
      const old = await this.readRecord();
      if (old) for (const identity of [old.process, ...old.children]) {
        if (await this.identity(identity.pid) === identity.started) throw new Error("上次 GPU owner 或其服务仍存活，未接管；请在原窗口停止，或检查崩溃后遗留的自有进程。");
      }
      const started = await this.identity(process.pid);
      if (!started) throw new Error("无法确认启动进程身份。");
      this.record = { schema: 1, epoch: randomUUID(), owner: this.owner, process: { pid: process.pid, started }, children: [], secret: randomBytes(32).toString("hex") };
      await writePrivateJson(this.filename, this.record);
      this.server = server;
    } catch (error) { server.close(); this.record = null; throw error; }
  }
  async track(pid: number): Promise<void> {
    if (!this.record) throw new Error("未持有 GPU 租约。");
    const started = await this.identity(pid);
    if (!started) throw new Error("子进程启动身份未确认。");
    this.record.children = [...this.record.children.filter((p) => p.pid !== pid), { pid, started }];
    await writePrivateJson(this.filename, this.record);
  }
  async untrackExited(): Promise<void> {
    if (!this.record) return;
    const live: Identity[] = [];
    for (const child of this.record.children) if (await this.identity(child.pid) === child.started) live.push(child);
    this.record.children = live;
    await writePrivateJson(this.filename, this.record);
  }
  async release(): Promise<void> {
    if (!this.record || !this.server) return;
    await this.untrackExited();
    if (this.record.children.length) throw new Error("自有 GPU 子进程仍存活，保留租约。请重试停止。");
    const current = await this.readRecord();
    if (current?.epoch !== this.record.epoch) throw new Error("GPU owner 记录改变，拒绝清理其他进程资源。");
    await fs.unlink(this.filename);
    const server = this.server;
    this.server = null; this.record = null;
    if (this.handoffPending) server.close(); // The client still needs its acknowledgement.
    else await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  private identity(pid: number) { return (this.options.identity ?? processIdentity)(pid); }
  private async readRecord(): Promise<LeaseRecord | null> {
    try {
      const record = JSON.parse(await fs.readFile(this.filename, "utf8"));
      if (record.schema !== 1 || !record.epoch || !record.process?.started || !Array.isArray(record.children) || !/^[a-f0-9]{64}$/u.test(record.secret)) throw new Error("GPU owner 记录损坏，需检查，未接管。");
      return record;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }
  private listen(): Promise<net.Server | null> {
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => {
        socket.setTimeout(15_000, () => socket.destroy());
        let buffer = "", handled = false;
        socket.on("error", () => undefined);
        socket.on("data", (chunk) => {
          buffer += chunk.toString();
          if (buffer.length > 2048) return socket.destroy();
          if (handled || !buffer.includes("\n")) return;
          handled = true;
          void (async () => {
            let reply = { ok: false };
            try {
              const request = JSON.parse(buffer);
              const expected = this.record?.secret ?? "";
              if (request.action !== "handoff" || typeof request.secret !== "string" || request.secret.length !== expected.length
                || !expected || !timingSafeEqual(Buffer.from(request.secret), Buffer.from(expected)) || this.handoffPending) throw new Error("拒绝交接请求。");
              this.handoffPending = true;
              try { if (await this.relinquish()) { await this.release(); reply = { ok: true }; } }
              finally { this.handoffPending = false; }
            } catch { /* No credentials or untrusted error strings on the channel. */ }
            socket.end(JSON.stringify(reply) + "\n");
          })();
        });
      });
      server.once("error", (error: NodeJS.ErrnoException) => { if (["EADDRINUSE", "EACCES"].includes(error.code ?? "")) resolve(null); else reject(error); });
      server.listen(this.endpoint, () => { server.unref(); resolve(server); });
    });
  }
  private async requestHandoff(): Promise<void> {
    const record = await this.readRecord();
    if (!record || await this.identity(record.process.pid) !== record.process.started) throw new Error("GPU 控制通道归属未确认，未接管。");
    await new Promise<void>((resolve, reject) => {
      const socket = net.connect(this.endpoint);
      let buffer = "";
      socket.setTimeout(15_000, () => socket.destroy(new Error("GPU 交接超时，未接管。")));
      socket.on("error", reject);
      socket.on("connect", () => socket.write(JSON.stringify({ action: "handoff", secret: record.secret }) + "\n"));
      socket.on("data", (chunk) => {
        buffer += chunk.toString();
        if (buffer.length > 2048) return socket.destroy(new Error("GPU 控制响应无效。"));
        if (!buffer.includes("\n")) return;
        try { const reply = JSON.parse(buffer); socket.end(); reply.ok ? resolve() : reject(new Error("GPU 被另一窗口占用，请在原窗口等待或停止任务后重试；未中止活跃 Agent。")); }
        catch (error) { socket.destroy(); reject(error); }
      });
      socket.on("end", () => { if (!buffer.includes("\n")) reject(new Error("GPU 交接未确认。")); });
    });
  }
}
