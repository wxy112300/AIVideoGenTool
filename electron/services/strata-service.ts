import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { Settings } from "../../src/types.js";
import { validStrataPort } from "../../src/core/strata-preparation.js";
import { resolvedStrataDirectory, strataManagedReceipt } from "./strata-installation.js";
import { isLocalPortInUse } from "./local-service-process.js";
import { validatePreparedStrataRuntime } from "./strata-model-preparation.js";
import { StrataChatStream } from "../../src/core/strata-chat-stream.js";

export type StrataContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

function validContent(content: unknown): boolean {
  if (typeof content === "string") return content.length <= 131072;
  return Array.isArray(content) && content.length > 0 && content.length <= 25 && content.every((part) =>
    part?.type === "text" ? typeof part.text === "string" && part.text.length <= 131072
      : part?.type === "image_url" && typeof part.image_url?.url === "string"
        && part.image_url.url.length <= 45 * 1024 ** 2
        && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/u.test(part.image_url.url));
}

export interface StrataChatRequest {
  modelId: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string | StrataContentPart[] }>;
  maxTokens: number;
  temperature: number;
  contextSize?: number;
  visionTokensPerImage?: number;
}

export interface StrataLaunchPlan {
  executable: string;
  args: string[];
  cwd: string;
  port: number;
  apiKey: string;
  modelId?: string;
}

/** Internal only: accepts a completed, coherently verified pack/config preparation. */
export async function prepareStrataLaunch(
  settings: Pick<Settings, "strataInstallDirectory" | "strataPort">,
  configPath: string
): Promise<StrataLaunchPlan> {
  if (!validStrataPort(settings.strataPort)) throw new Error("Strata 端口无效（不能使用 8080）。");
  const cwd = path.resolve(resolvedStrataDirectory(settings));
  if (!await strataManagedReceipt(cwd)) throw new Error("Strata 管理安装未完成，请重新扫描或重装。");
  const executable = path.join(cwd, ".venv", "Scripts", "python.exe");
  const config = path.resolve(configPath);
  for (const filename of [executable, path.join(cwd, "serve", "server.py"), config]) {
    if (!(await fs.stat(filename).catch(() => null))?.isFile()) throw new Error(`Strata 启动文件缺失：${filename}`);
  }
  const modelId = await validatePreparedStrataRuntime(config, cwd);
  const apiKey = randomBytes(32).toString("hex");
  return {
    executable, cwd, port: settings.strataPort, apiKey, modelId,
    args: ["-B", "-u", "-m", "serve.server", "--engine", "strata", "--config", config,
      "--host", "127.0.0.1", "--port", String(settings.strataPort), "--lazy", "--api-key", apiKey]
  };
}

export interface StrataOwnedProcess {
  pid: number;
  running(): boolean;
  stop(): Promise<void>;
}

/** No detached server or adopted PID: retain the child until its tree has exited. */
export async function launchStrataProcess(plan: StrataLaunchPlan, output: (chunk: string) => void): Promise<StrataOwnedProcess> {
  const child = spawn(plan.executable, plan.args, {
    cwd: plan.cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (chunk: Buffer) => output(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => output(chunk.toString()));
  let alive = true;
  let exited!: () => void;
  const closed = new Promise<void>((resolve) => { exited = resolve; });
  child.once("close", () => { alive = false; exited(); });
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("spawn", resolve);
  });
  const pid = child.pid!;
  return {
    pid, running: () => alive,
    async stop() {
      if (!alive) return;
      if (process.platform === "win32") {
        try { await promisify(execFile)("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, timeout: 10_000 }); }
        catch (error) { if (alive) throw error; }
      } else {
        child.kill("SIGTERM");
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([closed, new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("Strata 进程尚未退出，保留占用状态。")), 10_000);
        })]);
      } finally { if (timer) clearTimeout(timer); }
    }
  };
}

export interface StrataServiceSnapshot {
  phase: "stopped" | "starting" | "ready" | "stopping" | "error";
  port: number | null;
  pid: number | null;
  modelLoaded: boolean | null;
  message: string;
  log: string;
}

interface StrataServiceDependencies {
  launch?: typeof launchStrataProcess;
  portInUse?: typeof isLocalPortInUse;
  fetch?: typeof fetch;
  startupTimeoutMs?: number;
  pollMs?: number;
  requestTimeoutMs?: number;
}

/** Service readiness is not model readiness. Not yet exposed through AppApi or model routing. */
export class StrataService {
  private child: StrataOwnedProcess | null = null;
  private plan: StrataLaunchPlan | null = null;
  private serial: Promise<unknown> = Promise.resolve();
  private state: StrataServiceSnapshot = {
    phase: "stopped", port: null, pid: null, modelLoaded: null, message: "", log: ""
  };

  constructor(private readonly deps: StrataServiceDependencies = {}) {}

  snapshot(): StrataServiceSnapshot {
    if (this.child && !this.child.running() && this.state.phase === "ready") {
      this.state = { ...this.state, phase: "error", modelLoaded: null, message: "Strata 服务已退出。" };
    }
    return { ...this.state };
  }

  start(plan: StrataLaunchPlan, signal?: AbortSignal): Promise<StrataServiceSnapshot> {
    return this.exclusive(async () => {
      signal?.throwIfAborted();
      if (!validStrataPort(plan.port) || !plan.apiKey) throw new Error("Strata 启动端口或认证配置无效。");
      if (this.child?.running()) {
        if (this.state.phase === "ready" && this.plan && this.plan.executable === plan.executable
          && this.plan.cwd === plan.cwd && this.plan.port === plan.port && this.plan.apiKey === plan.apiKey
          && JSON.stringify(this.plan.args) === JSON.stringify(plan.args)) return this.inspectImpl();
        throw new Error("Strata 仍占用旧配置，请先停止服务。");
      }
      this.child = null;
      this.plan = null;
      if (await (this.deps.portInUse ?? isLocalPortInUse)(plan.port)) {
        throw new Error(`Strata 端口 ${plan.port} 已占用；不会接管或终止其他服务，请更换端口。`);
      }
      signal?.throwIfAborted();
      this.plan = { ...plan, args: [...plan.args] };
      this.state = { phase: "starting", port: plan.port, pid: null, modelLoaded: null, message: "正在启动 Strata 服务（延迟加载模型）。", log: "" };
      try {
        this.child = await (this.deps.launch ?? launchStrataProcess)(this.plan, (chunk) => {
          this.state.log = `${this.state.log}${chunk}`.replaceAll(plan.apiKey, "[redacted]").slice(-8_000);
        });
        this.state.pid = this.child.pid;
        const deadline = Date.now() + (this.deps.startupTimeoutMs ?? 30_000);
        while (Date.now() < deadline) {
          signal?.throwIfAborted();
          if (!this.child.running()) throw new Error("Strata 在启动完成前退出，请查看服务日志。");
          try {
            const loaded = await this.probe();
            signal?.throwIfAborted();
            this.state = { ...this.state, phase: "ready", modelLoaded: loaded, message: "Strata HTTP 服务就绪；模型推理尚需单独验证。" };
            return this.snapshot();
          } catch { signal?.throwIfAborted(); /* A port opening before HTTP handlers are ready is not readiness. */ }
          await new Promise<void>((resolve) => setTimeout(resolve, this.deps.pollMs ?? 200));
        }
        throw new Error("Strata 服务启动超时。");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        try { await this.stopChild(); }
        catch { this.state = { ...this.state, phase: "error", modelLoaded: null, message: `${message}；清理未完成，请重试停止。` }; throw new Error(this.state.message); }
        this.state = { ...this.state, phase: "error", modelLoaded: null, message };
        throw error;
      }
    });
  }

  inspect(): Promise<StrataServiceSnapshot> { return this.exclusive(() => this.inspectImpl()); }

  /** Explicit authenticated warmup; a lazy HTTP listener is not a resident model. */
  load(signal?: AbortSignal): Promise<StrataServiceSnapshot> {
    return this.exclusive(async () => {
      signal?.throwIfAborted();
      if (!this.plan || !this.child?.running()) throw new Error("Strata 服务尚未就绪。");
      const plan = this.plan;
      try {
        const response = await (this.deps.fetch ?? fetch)(`http://127.0.0.1:${plan.port}/v1/load`, {
          method: "POST", redirect: "error",
          signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(this.deps.requestTimeoutMs ?? 600_000)]),
          headers: { Authorization: `Bearer ${plan.apiKey}`, "Content-Type": "application/json", Origin: `http://127.0.0.1:${plan.port}` },
          body: JSON.stringify({ model: plan.modelId })
        });
        if (!response.ok || (await response.json()).status !== "loaded" || !await this.probe()) {
          throw new Error("Strata 模型加载未确认，请检查内存、显存和 CUDA 驱动后重试。");
        }
        signal?.throwIfAborted();
        this.state = { ...this.state, phase: "ready", modelLoaded: true, message: "Strata 模型已加载。" };
        return this.snapshot();
      } catch (error) {
        try { await this.stopChild(); }
        catch { this.state = { ...this.state, phase: "error", modelLoaded: null, message: "Strata 加载中止后进程未退出，请重试停止。" }; throw new Error(this.state.message); }
        this.state = { ...this.state, phase: "stopped", port: null, modelLoaded: null };
        if (signal?.aborted) throw signal.reason;
        throw new Error((error instanceof Error ? error.message : "Strata 加载失败。").replaceAll(plan.apiKey, "[redacted]"));
      }
    });
  }

  /** Caller owns GPU arbitration. A failed/aborted stream stops the owned process, not just HTTP. */
  chat(request: StrataChatRequest, signal?: AbortSignal, onText?: (delta: string) => void): Promise<string> {
    return this.exclusive(async () => {
      if (!request.modelId.trim() || !Number.isSafeInteger(request.maxTokens) || request.maxTokens < 1
      || request.maxTokens > 32768 || !Number.isFinite(request.temperature) || request.temperature < 0 || request.temperature > 2
        || !request.messages.length || request.messages.some((message) =>
          !["system", "user", "assistant"].includes(message.role) || !validContent(message.content))) {
        throw new Error("Strata 提示词请求参数无效。");
      }
      signal?.throwIfAborted();
      if (!this.plan || !this.child?.running() || this.snapshot().phase !== "ready") throw new Error("Strata 服务尚未就绪。");
      const plan = this.plan;
      const requestSignal = AbortSignal.any([
        ...(signal ? [signal] : []), AbortSignal.timeout(this.deps.requestTimeoutMs ?? 600_000)
      ]);
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        if (request.contextSize !== undefined) {
          if (!Number.isSafeInteger(request.contextSize) || request.contextSize < 1024 || request.contextSize > 32768
            || !Number.isSafeInteger(request.visionTokensPerImage) || request.visionTokensPerImage! < 1) throw new Error("Strata 上下文策略无效。");
          const textOf = (message: StrataChatRequest["messages"][number]) => typeof message.content === "string" ? message.content
            : message.content.filter((part) => part.type === "text").map((part) => (part as { text: string }).text).join("");
          const response = await (this.deps.fetch ?? fetch)(`http://127.0.0.1:${plan.port}/v1/messages/count_tokens`, {
            method: "POST", redirect: "error", signal: requestSignal,
            headers: { Authorization: `Bearer ${plan.apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: request.modelId, thinking: { type: "disabled" },
              system: request.messages.filter((message) => message.role === "system").map(textOf).join("\n"),
              messages: request.messages.filter((message) => message.role !== "system").map((message) => ({ role: message.role, content: textOf(message) })) })
          });
          const count = response.ok ? (await response.json()).input_tokens : null;
          if (!Number.isSafeInteger(count) || count < 0) throw new Error("Strata tokenizer 计数失败，未提交推理。");
          const imageCount = request.messages.reduce((count, message) => count + (Array.isArray(message.content)
            ? message.content.filter((part) => part.type === "image_url").length : 0), 0);
          if (count + imageCount * (request.visionTokensPerImage! + 4) + request.maxTokens + 256 > request.contextSize) {
            throw new Error(`Strata 输入约 ${count} 文本 tokens，加上视觉与输出预算超过 ${request.contextSize} 上下文；请缩短输入或减少参考图。原始指令未截断。`);
          }
          requestSignal.throwIfAborted();
        }
        const response = await (this.deps.fetch ?? fetch)(`http://127.0.0.1:${plan.port}/v1/chat/completions`, {
          method: "POST", redirect: "error", signal: requestSignal,
          headers: { Authorization: `Bearer ${plan.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: request.modelId, messages: request.messages, max_tokens: request.maxTokens,
            temperature: request.temperature, stream: true, chat_template_kwargs: { enable_thinking: false } })
        });
        if (!response.ok || !response.headers.get("content-type")?.startsWith("text/event-stream") || !response.body) {
          await response.body?.cancel().catch(() => undefined);
          throw new Error(response.status === 400
            ? "Strata 拒绝输入或上下文预算，请缩短提示词或减少参考图；原始指令未截断。"
            : `Strata 提示词请求失败（HTTP ${response.status} 或流式协议不兼容）。`);
        }
        reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8", { fatal: true });
        const stream = new StrataChatStream();
        while (!stream.done) {
          requestSignal.throwIfAborted();
          const part = await reader.read();
          if (part.done) { stream.push(decoder.decode()); break; }
          for (const delta of stream.push(decoder.decode(part.value, { stream: true }))) {
            requestSignal.throwIfAborted();
            onText?.(delta);
          }
        }
        requestSignal.throwIfAborted();
        const result = stream.result();
        if (!this.child.running()) throw new Error("Strata 服务在请求完成前退出。");
        this.state.modelLoaded = await this.probe();
        if (!this.state.modelLoaded) throw new Error("Strata 请求结束后模型加载状态丢失，结果未保存。");
        requestSignal.throwIfAborted();
        return result;
      } catch (error) {
        try {
          await this.stopChild();
          this.state = { ...this.state, phase: "stopped", port: null, modelLoaded: null, message: "Strata 请求已中止，自有服务已退出。" };
        } catch {
          this.state = { ...this.state, phase: "error", modelLoaded: null, message: "Strata 请求中止后进程未退出，禁止继续使用或卸载，请重试停止。" };
          throw new Error(this.state.message);
        }
        if (signal?.aborted) throw signal.reason;
        // Do not expose server bodies, model text or per-launch credentials in errors.
        throw new Error((error instanceof Error ? error.message : "Strata 提示词请求失败。").replaceAll(plan.apiKey, "[redacted]"));
      } finally {
        await reader?.cancel().catch(() => undefined);
        reader?.releaseLock();
      }
    });
  }

  stop(): Promise<StrataServiceSnapshot> {
    return this.exclusive(async () => {
      this.state = { ...this.state, phase: "stopping", modelLoaded: null };
      try {
        await this.stopChild();
        this.state = { ...this.state, phase: "stopped", port: null, message: "Strata 服务已停止。" };
      } catch (error) {
        this.state = { ...this.state, phase: "error", message: "Strata 进程未退出，请重试停止。" };
        throw error;
      }
      return this.snapshot();
    });
  }

  private async probe(): Promise<boolean> {
    if (!this.plan || !this.child?.running()) throw new Error("Strata 服务未运行。");
    const plan = this.plan;
    const request = async (endpoint: string) => {
      const response = await (this.deps.fetch ?? fetch)(`http://127.0.0.1:${plan.port}${endpoint}`, {
        redirect: "error", signal: AbortSignal.timeout(1_000),
        headers: { Authorization: `Bearer ${plan.apiKey}` }
      });
      if (!response.ok) throw new Error("Strata 状态请求失败。");
      return response.json();
    };
    const health = await request("/health");
    if (health.service !== "strata" || health.status !== "ok" || typeof health.loaded !== "boolean" || health.api_key !== true) {
      throw new Error("端点不是受认证的 Strata 服务。");
    }
    // /health is public upstream; verify our per-launch secret against a protected endpoint too.
    const models = await request("/v1/models");
    if (models.object !== "list" || !Array.isArray(models.data)) throw new Error("Strata 模型状态协议不兼容。");
    if (!this.child?.running()) throw new Error("Strata 服务已退出。");
    return health.loaded;
  }

  private async inspectImpl(): Promise<StrataServiceSnapshot> {
    if (!this.child) return this.snapshot();
    try {
      const loaded = await this.probe();
      this.state = { ...this.state, phase: "ready", modelLoaded: loaded, message: "Strata HTTP 服务就绪；模型推理尚需单独验证。" };
    } catch {
      this.state = { ...this.state, phase: "error", modelLoaded: null, message: "Strata 服务状态检查失败，请停止后重试。" };
    }
    return this.snapshot();
  }

  private async stopChild(): Promise<void> {
    if (this.child) {
      await this.child.stop();
      if (this.child.running()) throw new Error("Strata 进程仍在运行。");
    }
    this.child = null;
    this.plan = null;
    this.state.pid = null;
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.serial.then(operation);
    this.serial = result.catch(() => undefined);
    return result;
  }
}
