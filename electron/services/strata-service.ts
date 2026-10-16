import { execFile, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { Settings } from "../../src/types.js";
import { validStrataPort } from "../../src/core/strata-preparation.js";
import { resolvedStrataDirectory, strataManagedReceipt } from "./strata-installation.js";
import { isLocalPortInUse } from "./local-service-process.js";
import { validatePreparedStrataRuntime } from "./strata-model-preparation.js";
import { StrataChatStream } from "../../src/core/strata-chat-stream.js";
import { strataTokenBudget } from "../../src/core/strata-token-budget.js";
import { planStrataResources, strataResourcePressure, type StrataResourcePlan } from "../../src/core/strata-resource-policy.js";
import { readStrataResources, watchStrataResources } from "./strata-resources.js";
import { supportsStrataUncensored, type StrataUncensoredFacts } from "../../src/core/strata-uncensored.js";
import { assertStrataControlVectorLog, verifyStrataControlVector, type StrataControlVector } from "./strata-uncensored.js";

export type StrataContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

/** Qwen3.8-Flash-Next official non-thinking profile; not shared with other backends.
 * https://huggingface.co/Qwen/Qwen3.8-Flash-Next#best-practices */
export const STRATA_NON_THINKING_SAMPLING = Object.freeze({
  temperature: 0.7, top_p: 0.8, top_k: 20, min_p: 0,
  presence_penalty: 1.5, repetition_penalty: 1
});

export const STRATA_THINKING_SAMPLING = Object.freeze({
  temperature: 1, top_p: 0.95, top_k: 20, min_p: 0,
  presence_penalty: 0, repetition_penalty: 1
});

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
  /** Expand only this request's output allowance inside its already-loaded context. */
  automaticOutputBudget?: boolean;
  uncensored?: boolean;
  /** Internal bounded evaluation; not a persisted setting or automatic mode switch. */
  reasoning?: { effort: "low" | "medium" | "high"; budgetTokens: number };
}

function validateChatRequest(request: StrataChatRequest): void {
  if (request.uncensored !== undefined && typeof request.uncensored !== "boolean") throw new Error("Strata uncensored 请求参数无效。");
  if (request.uncensored && !supportsStrataUncensored(request.modelId)) throw new Error("当前 Strata 模型不支持 uncensored 控制向量。");
  if (!request.modelId.trim() || !Number.isSafeInteger(request.maxTokens) || request.maxTokens < 1
    || request.maxTokens > 32768 || !Number.isFinite(request.temperature) || request.temperature < 0 || request.temperature > 2
    || !request.messages.length || request.messages.some((message) =>
      !["system", "user", "assistant"].includes(message.role) || !validContent(message.content))
    || (request.reasoning && (!["low", "medium", "high"].includes(request.reasoning.effort)
      || !Number.isSafeInteger(request.reasoning.budgetTokens) || request.reasoning.budgetTokens < 1
      || request.reasoning.budgetTokens > request.maxTokens - 1024))) {
    throw new Error("Strata 提示词请求参数无效。");
  }
  if ((request.automaticOutputBudget !== undefined && typeof request.automaticOutputBudget !== "boolean")
    || (request.automaticOutputBudget && request.contextSize === undefined)) throw new Error("Strata 自动输出预算需要显式上下文。");
}

export interface StrataChatDiagnostics extends ReturnType<StrataChatStream["diagnostics"]> {
  modelId: string; inputTokens: number | null; maxTokens: number; contextSize: number | null;
  uncensored?: StrataUncensoredFacts;
}

export interface StrataLaunchPlan {
  executable: string;
  args: string[];
  cwd: string;
  port: number;
  apiKey: string;
  modelId?: string;
  residentEngineLog?: string;
  resourcePlan?: StrataResourcePlan;
  temporaryConfig?: string;
  env?: Record<string, string>;
  controlVector?: StrataControlVector;
  engineLog?: string;
  uncensoredRequested?: boolean;
}

/** Internal only: accepts a completed, coherently verified pack/config preparation. */
export async function prepareStrataLaunch(
  settings: Pick<Settings, "strataInstallDirectory" | "strataPort"> & Partial<Pick<Settings, "strataUncensored">>,
  configPath: string,
  options: { adaptive?: boolean; readResources?: typeof readStrataResources } = {}
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
  const runtimeConfig = JSON.parse(await fs.readFile(config, "utf8"));
  const monitorAvailable = (await fs.readFile(path.join(cwd, "serve", "server.py"), "utf8")).includes('"--api-monitor"') &&
    (await Promise.all(["monitor.html", "monitor.js", "tokens.css"].map((name) =>
      fs.stat(path.join(cwd, "serve", "web", name)).then((stat) => stat.isFile() && stat.size > 0).catch(() => false)
    ))).every(Boolean);
  let launchConfig = config;
  let resourcePlan: StrataResourcePlan | undefined;
  const controlVector = settings.strataUncensored && supportsStrataUncensored(modelId)
    ? await verifyStrataControlVector(cwd) : undefined;
  if (controlVector) {
    runtimeConfig.args.push("--control-vector-scaled", `${controlVector.filename}:1.0`, "--control-vector-layer-range",
      String(controlVector.firstLayer), String(controlVector.lastLayer), "--cvec-mode", "project", "--cvec-dir", "per-layer");
    // Upstream defaults a loaded vector ON. Always override it, even for non-app callers.
    runtimeConfig.sampling = { ...(runtimeConfig.sampling ?? {}), experimental_speed_projection: false };
  }
  if (options.adaptive) {
    const reserveIndex = runtimeConfig.args.indexOf("--vram-reserve-mib");
    if (reserveIndex < 0) throw new Error("Strata 准备配置缺少显存策略。");
    resourcePlan = planStrataResources(await (options.readResources ?? readStrataResources)(), Number(runtimeConfig.args[reserveIndex + 1]));
    runtimeConfig.args[reserveIndex + 1] = String(resourcePlan.vramReserveMiB);
    if (resourcePlan.hostMode === "arena") runtimeConfig.args = runtimeConfig.args.filter((arg: string) => arg !== "--resident-experts");
  }
  if (options.adaptive || controlVector) {
    launchConfig = path.join(path.dirname(config), `runtime-session-${randomUUID()}.json`);
    await fs.writeFile(launchConfig, JSON.stringify(runtimeConfig, null, 2), { flag: "wx" });
  }
  const apiKey = randomBytes(32).toString("hex");
  return {
    executable, cwd, port: settings.strataPort, apiKey, modelId,
    engineLog: runtimeConfig.log, uncensoredRequested: settings.strataUncensored === true,
    ...(controlVector ? { controlVector } : {}),
    ...(launchConfig !== config ? { temporaryConfig: launchConfig } : {}),
    ...(resourcePlan ? { resourcePlan,
      env: { STRATA_RESIDENT_HEADROOM_GIB: String(resourcePlan.headroomGiB) } } : {}),
    ...(runtimeConfig.args.includes("--resident-experts") ? { residentEngineLog: runtimeConfig.log } : {}),
    args: ["-B", "-u", "-m", "serve.server", "--engine", "strata", "--config", launchConfig,
      "--host", "127.0.0.1", "--port", String(settings.strataPort), "--lazy", ...(monitorAvailable ? ["--api-monitor"] : []), "--api-key", apiKey]
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
    cwd: plan.cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...plan.env }
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
  uncensored?: StrataUncensoredFacts;
}

/** Main-process-only capability. Never include this in snapshots, IPC or logs. */
export interface StrataMonitorConnection {
  origin: string;
  apiKey: string;
}

interface StrataServiceDependencies {
  launch?: typeof launchStrataProcess;
  portInUse?: typeof isLocalPortInUse;
  fetch?: typeof fetch;
  startupTimeoutMs?: number;
  pollMs?: number;
  requestTimeoutMs?: number;
  readResources?: typeof readStrataResources;
  onDiagnostics?(diagnostics: StrataChatDiagnostics): void;
}

/** App-owned lifecycle. HTTP readiness, confirmed vector load and completed requests are distinct facts. */
export class StrataService {
  private vectorLoaded = false;
  private modeRequested = false;
  private modeApplied: boolean | null = null;
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
    return { ...this.state, uncensored: {
      requested: this.modeRequested, supported: supportsStrataUncensored(this.plan?.modelId ?? ""),
      vectorId: this.plan?.controlVector?.id ?? null, vectorSha256: this.plan?.controlVector?.sha256 ?? null,
      vectorLoaded: this.vectorLoaded && this.state.modelLoaded === true, applied: this.state.modelLoaded ? this.modeApplied : null
    } };
  }

  async hasVerifiedControlVector(): Promise<boolean> {
    if (!this.plan?.controlVector || !this.vectorLoaded) return false;
    try {
      const current = await verifyStrataControlVector(this.plan.cwd);
      return current.sha256 === this.plan.controlVector.sha256 && current.id === this.plan.controlVector.id;
    } catch { return false; }
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
      this.vectorLoaded = false; this.modeApplied = null; this.modeRequested = plan.uncensoredRequested === true;
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
    }).catch(async (error) => {
      // Startup can reject before adopting the plan (cancel, occupied port, old process).
      if (plan.temporaryConfig && this.plan?.temporaryConfig !== plan.temporaryConfig)
        await fs.unlink(plan.temporaryConfig).catch(() => undefined);
      throw error;
    });
  }

  monitorConnection(): StrataMonitorConnection | null {
    return this.plan?.args.includes("--api-monitor") && this.child?.running() && this.state.phase === "ready"
      ? { origin: `http://127.0.0.1:${this.plan.port}`, apiKey: this.plan.apiKey }
      : null;
  }

  inspect(): Promise<StrataServiceSnapshot> { return this.exclusive(() => this.inspectImpl()); }

  /** Explicit authenticated warmup; a lazy HTTP listener is not a resident model. */
  load(signal?: AbortSignal): Promise<StrataServiceSnapshot> {
    return this.exclusive(async () => {
      signal?.throwIfAborted();
      if (!this.plan || !this.child?.running()) throw new Error("Strata 服务尚未就绪。");
      const plan = this.plan;
      const safety = new AbortController();
      signal = AbortSignal.any([...(signal ? [signal] : []), safety.signal]);
      let disposeWatch = async () => {};
      try {
        if (plan.resourcePlan) {
          const resources = await (this.deps.readResources ?? readStrataResources)();
          const pressure = strataResourcePressure(resources);
          if (pressure) throw new Error(pressure);
          if (resources.memoryAvailableBytes < plan.resourcePlan.requiredMemoryBytes
            || resources.commitAvailableBytes! < plan.resourcePlan.requiredCommitBytes
            || resources.vramAvailableBytes! < plan.resourcePlan.minimumFreeVramBytes) throw new Error("Strata 加载前资源已变化，安全预算不再满足；未加载模型，请释放资源后重试。");
          signal.throwIfAborted();
          disposeWatch = watchStrataResources((reason) => safety.abort(reason), this.deps.readResources);
        }
        const logStart = plan.residentEngineLog ? (await fs.stat(plan.residentEngineLog).catch(() => null))?.size ?? 0 : 0;
        const vectorLogStart = plan.controlVector && plan.engineLog ? (await fs.stat(plan.engineLog).catch(() => null))?.size ?? 0 : 0;
        const response = await (this.deps.fetch ?? fetch)(`http://127.0.0.1:${plan.port}/v1/load`, {
          method: "POST", redirect: "error",
          signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(this.deps.requestTimeoutMs ?? 600_000)]),
          headers: { Authorization: `Bearer ${plan.apiKey}`, "Content-Type": "application/json", Origin: `http://127.0.0.1:${plan.port}` },
          body: JSON.stringify({ model: plan.modelId })
        });
        const acknowledgement = await response.json().catch(() => null);
        if (!response.ok) {
          const reason = typeof acknowledgement?.error?.message === "string"
            ? acknowledgement.error.message.replaceAll(plan.apiKey, "[redacted]").slice(0, 2000) : "未返回有效加载错误";
          throw new Error(`Strata 模型加载失败（HTTP ${response.status}）：${reason}。详情见派生目录 engine.log。`);
        }
        if (acknowledgement?.status !== "loaded" || !await this.probe()) {
          throw new Error("Strata 模型加载未确认，请检查内存、显存和 CUDA 驱动后重试。");
        }
        if (plan.residentEngineLog) await assertStrataResidentLog(plan.residentEngineLog, logStart);
        if (plan.controlVector) {
          if (!plan.engineLog) throw new Error("Strata uncensored 缺少引擎确认日志。");
          await assertStrataControlVectorLog(plan.engineLog, vectorLogStart, plan.controlVector);
          this.vectorLoaded = true;
        }
        signal?.throwIfAborted();
        this.state = { ...this.state, phase: "ready", modelLoaded: true, message: plan.controlVector
          ? "Strata 模型已加载 · uncensored 向量就绪，下次增强启用。" : "Strata 模型已加载 · uncensored 未启用。" };
        return this.snapshot();
      } catch (error) {
        try { await this.stopChild(); }
        catch { this.state = { ...this.state, phase: "error", modelLoaded: null, message: "Strata 加载中止后进程未退出，请重试停止。" }; throw new Error(this.state.message); }
        this.state = { ...this.state, phase: "stopped", port: null, modelLoaded: null };
        if (signal?.aborted) throw signal.reason;
        throw new Error((error instanceof Error ? error.message : "Strata 加载失败。").replaceAll(plan.apiKey, "[redacted]"));
      } finally { await disposeWatch(); }
    });
  }

  /** CPU tokenizer only, including the selected thinking template. Safe before /v1/load. */
  preflight(request: StrataChatRequest, signal?: AbortSignal): Promise<void> {
    return this.exclusive(async () => { await this.checkContext(request, signal); });
  }

  private async checkContext(request: StrataChatRequest, signal?: AbortSignal): Promise<{ inputTokens: number | null; maxTokens: number }> {
    validateChatRequest(request);
    signal?.throwIfAborted();
    if (!this.plan || !this.child?.running() || this.snapshot().phase !== "ready") throw new Error("Strata 服务尚未就绪。");
    if (request.contextSize === undefined) return { inputTokens: null, maxTokens: request.maxTokens };
    if (!Number.isSafeInteger(request.contextSize) || request.contextSize < 1024 || request.contextSize > 32768
      || !Number.isSafeInteger(request.visionTokensPerImage) || request.visionTokensPerImage! < 1) throw new Error("Strata 上下文策略无效。");
    const plan = this.plan;
    const textOf = (message: StrataChatRequest["messages"][number]) => typeof message.content === "string" ? message.content
      : message.content.filter((part) => part.type === "text").map((part) => (part as { text: string }).text).join("");
    const response = await (this.deps.fetch ?? fetch)(`http://127.0.0.1:${plan.port}/v1/messages/count_tokens`, {
      method: "POST", redirect: "error",
      signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(30_000)]),
      headers: { Authorization: `Bearer ${plan.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: request.modelId,
        thinking: request.reasoning ? { type: "enabled" } : { type: "disabled" },
        ...(request.reasoning ? { output_config: { effort: request.reasoning.effort } } : {}),
        system: request.messages.filter((message) => message.role === "system").map(textOf).join("\n"),
        messages: request.messages.filter((message) => message.role !== "system").map((message) => ({ role: message.role, content: textOf(message) })) })
    });
    const count = response.ok ? (await response.json()).input_tokens : null;
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("Strata tokenizer 计数失败，未提交推理。");
    const imageCount = request.messages.reduce((total, message) => total + (Array.isArray(message.content)
      ? message.content.filter((part) => part.type === "image_url").length : 0), 0);
    signal?.throwIfAborted();
    return strataTokenBudget({ inputTokens: count, imageCount, visionTokensPerImage: request.visionTokensPerImage!,
      contextSize: request.contextSize, requestedMaxTokens: request.maxTokens, automatic: request.automaticOutputBudget });
  }

  /** Caller owns GPU arbitration. A failed/aborted stream stops the owned process, not just HTTP. */
  chat(request: StrataChatRequest, signal?: AbortSignal, onText?: (delta: string) => void, onBudget?: (tokens: number) => void): Promise<string> {
    return this.exclusive(async () => {
      validateChatRequest(request);
      signal?.throwIfAborted();
      if (!this.plan || !this.child?.running() || this.snapshot().phase !== "ready") throw new Error("Strata 服务尚未就绪。");
      const plan = this.plan;
      const safety = new AbortController();
      const requestSignal = AbortSignal.any([
        ...(signal ? [signal] : []), safety.signal, AbortSignal.timeout(this.deps.requestTimeoutMs ?? 600_000)
      ]);
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let disposeWatch = async () => {};
      const stream = new StrataChatStream();
      let budget: { inputTokens: number | null; maxTokens: number } = { inputTokens: null, maxTokens: request.maxTokens };
      const vectorLoadedAtRequest = this.vectorLoaded;
      try {
        this.modeRequested = request.uncensored === true;
        this.modeApplied = null;
        if (request.uncensored && (!this.vectorLoaded || !plan.controlVector))
          throw new Error("Strata uncensored 向量尚未确认加载，请重新启动所选模型；未发送推理请求。");
        if (plan.resourcePlan) {
          const pressure = strataResourcePressure(await (this.deps.readResources ?? readStrataResources)());
          if (pressure) throw new Error(pressure);
          disposeWatch = watchStrataResources((reason) => safety.abort(reason), this.deps.readResources);
        }
        budget = await this.checkContext(request, requestSignal);
        requestSignal.throwIfAborted();
        onBudget?.(budget.maxTokens);
        const response = await (this.deps.fetch ?? fetch)(`http://127.0.0.1:${plan.port}/v1/chat/completions`, {
          method: "POST", redirect: "error", signal: requestSignal,
          headers: { Authorization: `Bearer ${plan.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: request.modelId, messages: request.messages, max_tokens: budget.maxTokens,
            experimental_speed_projection: request.uncensored === true,
            ...(request.reasoning ? STRATA_THINKING_SAMPLING : STRATA_NON_THINKING_SAMPLING), temperature: request.temperature,
            ...(request.reasoning ? { reasoning_effort: request.reasoning.effort, reasoning_budget_tokens: request.reasoning.budgetTokens } : {}),
            stream: true, chat_template_kwargs: { enable_thinking: Boolean(request.reasoning) } })
        });
        if (!response.ok || !response.headers.get("content-type")?.startsWith("text/event-stream") || !response.body) {
          await response.body?.cancel().catch(() => undefined);
          throw new Error(response.status === 400
            ? "Strata 拒绝输入或上下文预算，请缩短提示词或减少参考图；原始指令未截断。"
            : `Strata 提示词请求失败（HTTP ${response.status} 或流式协议不兼容）。`);
        }
        reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8", { fatal: true });
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
        this.modeApplied = request.uncensored === true;
        this.state.message = this.modeApplied ? "Strata 模型已加载 · uncensored 已启用。" : "Strata 模型已加载 · uncensored 未启用。";
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
        if (safety.signal.aborted) throw safety.signal.reason;
        // Do not expose server bodies, model text or per-launch credentials in errors.
        throw new Error((error instanceof Error ? error.message : "Strata 提示词请求失败。").replaceAll(plan.apiKey, "[redacted]"));
      } finally {
        await disposeWatch();
        await reader?.cancel().catch(() => undefined);
        reader?.releaseLock();
        try { this.deps.onDiagnostics?.({ modelId: request.modelId, ...budget,
          contextSize: request.contextSize ?? null, ...stream.diagnostics(), uncensored: {
            requested: request.uncensored === true, supported: supportsStrataUncensored(request.modelId),
            vectorId: plan.controlVector?.id ?? null, vectorSha256: plan.controlVector?.sha256 ?? null,
            vectorLoaded: vectorLoadedAtRequest, applied: this.modeApplied
          } }); } catch { /* Diagnostics never own inference. */ }
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
      this.state = { ...this.state, phase: "ready", modelLoaded: loaded };
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
    this.vectorLoaded = false; this.modeApplied = null;
    if (this.plan?.temporaryConfig) await fs.unlink(this.plan.temporaryConfig).catch(() => undefined);
    this.plan = null;
    this.state.pid = null;
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.serial.then(operation);
    this.serial = result.catch(() => undefined);
    return result;
  }
}

/** Do not accept the engine's implicit partial/file-tier fallback as the requested resident mode. */
export async function assertStrataResidentLog(filename: string, offset: number): Promise<void> {
  const file = await fs.open(filename, "r");
  try {
    const stat = await file.stat();
    const length = Math.min(Math.max(0, stat.size - offset), 256 * 1024);
    if (!length) throw new Error("未取得本次 Strata 专家驻留日志，未开始推理。");
    const bytes = Buffer.alloc(length);
    await file.read(bytes, 0, length, Math.max(offset, stat.size - length));
    if (/WARNING: the (?:whole )?resident RAM mode does not fit/u.test(bytes.toString("utf8")))
      throw new Error("Strata 非GPU专家未能完整驻留 RAM（可用内存或 Windows 提交容量不足），已停止文件回读降速路径。请释放内存后重试，详情见 engine.log。");
  } finally { await file.close(); }
}
