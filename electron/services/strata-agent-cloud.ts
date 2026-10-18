import { spawn, execFile, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { localClaudeRoute } from "../../src/core/strata-agent-routing.js";
import { privateLocalDirectory, writePrivateJson, processIdentity } from "./private-local-state.js";
import { agentSdkEntrySha256, cloudPackageDirectory, identifyClaudeEntry, inspectAgentSoftware, inspectedAgentSdk } from "./strata-agent-software.js";
import { isLocalPortInUse } from "./local-service-process.js";

const exec = promisify(execFile);
export async function verifyCloudAdapter(toolDirectory: string, packageDirectory: string) {
  if (process.env.CLAUDE_CONFIG_DIR && !path.isAbsolute(process.env.CLAUDE_CONFIG_DIR)) throw new Error("已有CLAUDE_CONFIG_DIR为相对路径，跨项目不能安全复用；请以绝对目录配置后重试。启动器未改原配置。");
  const manifest: Record<string, string> = JSON.parse(await fs.readFile(path.join(toolDirectory, "cloudcli-reviewed.json"), "utf8"));
  for (const [relative, expected] of Object.entries(manifest)) {
    const contents = await fs.readFile(path.join(packageDirectory, "dist-server", "server", relative));
    if (createHash("sha256").update(contents).digest("hex") !== expected) throw new Error("CloudCLI 文件与已审核版本不同，未启动；请更新适配或修复共享安装。");
  }
}
export class AgentCloud {
  private child: ChildProcess | null = null;
  private identity: string | null = null;
  private routeFile = "";
  private port: number | null = null;
  private startupError: Error | null = null;
  get running() { return this.child !== null; } // Includes an exited/failed supervisor pending explicit cleanup.
  get alive() { return this.child !== null && !this.startupError && this.child.exitCode === null && this.child.signalCode === null; }
  constructor(private readonly toolDirectory: string, private readonly directory: string, private readonly track: (pid: number) => Promise<void>) {}
  async start(input: { software: string; sdkDirectory: string; cli: string; token: string; strataPort: number; guiPort: number; contextTokens?: number }, signal: AbortSignal) {
    if (this.child) throw new Error("GUI 已由此窗口管理，请先停止全部。");
    if (!(await inspectAgentSoftware(input.software)).available) throw new Error("共享 CloudCLI/SDK 安装不完整。");
    const sdk = await inspectedAgentSdk(input.sdkDirectory), cli = await identifyClaudeEntry(input.cli);
    if (!sdk.available || !cli.available || !cli.compatible) throw new Error("所选共享 SDK/Claude 身份发生变化；未回退另一套 harness，请重新检测。");
    const pkg = cloudPackageDirectory(input.software);
    await verifyCloudAdapter(this.toolDirectory, pkg);
    if (await isLocalPortInUse(input.guiPort)) throw new Error("GUI 端口被占用，未接管未知监听。");
    const origin = `http://127.0.0.1:${input.guiPort}`, instance = randomUUID();
    const contextTokens = input.contextTokens ?? 32768;
    const routing = localClaudeRoute(process.env, input.token, input.strataPort, "claude-sonnet-4-6", contextTokens);
    const routes = await privateLocalDirectory(path.join(this.directory, "routes"));
    this.routeFile = path.join(routes, `${instance}.json`);
    await writePrivateJson(this.routeFile, routing.settings);
    const data = await privateLocalDirectory(path.join(this.directory, "cloudcli-data"));
    const env = { ...routing.env, NODE_OPTIONS: "", HOST: "127.0.0.1", SERVER_PORT: String(input.guiPort), PORT: String(input.guiPort),
      NODE_ENV: "production", VITE_IS_PLATFORM: "false", API_KEY: "", DATABASE_PATH: path.join(data, "auth.db"), CONTEXT_WINDOW: String(contextTokens), VITE_CONTEXT_WINDOW: String(contextTokens),
      CLAUDE_CLI_PATH: input.cli, STRATA_CLAUDE_MODEL: "claude-sonnet-4-6", STRATA_CLAUDE_SETTINGS: this.routeFile,
      STRATA_AGENT_SDK_ENTRY: sdk.entry, STRATA_AGENT_SDK_SHA256: agentSdkEntrySha256,
      STRATA_CLOUD_PACKAGE: pkg, STRATA_CLOUD_DATA_ROOT: data, STRATA_GUI_ORIGIN: origin, STRATA_GUI_INSTANCE: instance, STRATA_NODE: process.execPath };
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-File", path.join(this.toolDirectory, "cloudcli-supervisor.ps1")], {
      windowsHide: true, env, stdio: ["pipe", "pipe", "ignore"]
    });
    this.child = child; this.port = input.guiPort; this.startupError = null;
    child.stdin?.on("error", () => { /* A closed supervisor input is expected during owned Job shutdown. */ });
    // Never forward upstream stdout/stderr. Supervisor emits only its owned Node PID.
    child.on("error", () => { this.startupError = new Error("GUI supervisor 启动失败。"); });
    const lines = createInterface({ input: child.stdout! });
    try {
      const pid = await new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("GUI Job 准备超时。")), 15000);
        const exit = () => { clearTimeout(timer); reject(new Error("GUI supervisor 在准备阶段退出。")); };
        child.once("exit", exit); child.once("error", exit);
        lines.once("line", (line) => {
          clearTimeout(timer); child.off("exit", exit); child.off("error", exit);
          try { const value = JSON.parse(line).pid; if (!Number.isSafeInteger(value) || value < 1) throw new Error(); resolve(value); }
          catch { reject(new Error("GUI Job 身份响应无效。")); }
        });
      });
      if (!child.pid) throw new Error("GUI supervisor PID 缺失。");
      this.identity = await processIdentity(child.pid);
      if (!this.identity) throw new Error("GUI supervisor 身份无法验证。");
      await this.track(child.pid); await this.track(pid);
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        signal.throwIfAborted();
        if (this.startupError || child.exitCode !== null || child.signalCode !== null) throw this.startupError ?? new Error("CloudCLI 提前退出，请复检私有依赖/原生模块。");
        try {
          const response = await fetch(`${origin}/health`, { redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]) });
          const health = await response.json();
          if (health.strataInstance !== instance) throw new Error("GUI 实例身份不匹配，拒绝复用监听。");
          const { stdout } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Get-NetTCPConnection -State Listen -LocalPort ${input.guiPort} -ErrorAction Stop | Select-Object LocalAddress,OwningProcess | ConvertTo-Json -Compress`], { windowsHide: true, timeout: 5000 });
          const parsed = JSON.parse(stdout), listeners = Array.isArray(parsed) ? parsed : [parsed];
          if (!listeners.length || listeners.some((listener) => listener.OwningProcess !== pid || listener.LocalAddress !== "127.0.0.1")) throw new Error("GUI 监听 PID/loopback 绑定不属于本工具。");
          if (response.ok && health.status === "ok") return { origin, pid };
        } catch (error) {
          if (error instanceof Error && /身份|PID/u.test(error.message)) throw error;
        }
        await delay(250, undefined, { signal });
      }
      throw new Error("CloudCLI HTTP 准备超时；未宣称 Agent 工具成功。");
    } catch (error) { await this.stop(); throw error; }
    finally { lines.close(); }
  }
  async stop() {
    const child = this.child;
    if (child) {
      // End supervisor input => its nested Job closes, including orphaned MCP/shell grandchildren.
      if (child.stdin && !child.stdin.destroyed && !child.stdin.writableEnded) child.stdin.end();
      const deadline = Date.now() + 15000;
      while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) await delay(100);
      if (child.pid && this.identity && await processIdentity(child.pid) === this.identity) throw new Error("GUI Job 尚未退出；保留 GPU 租约，请重试停止全部。");
    }
    if (this.port && await isLocalPortInUse(this.port)) throw new Error("GUI 端口仍有监听；未终止未知进程，保留资源归属。");
    if (this.routeFile) await fs.unlink(this.routeFile).catch((error) => { if (error.code !== "ENOENT") throw error; });
    this.child = null; this.identity = null; this.routeFile = ""; this.port = null;
  }
}
