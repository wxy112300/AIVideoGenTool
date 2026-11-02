import { createNativeTranslator } from "../ui-translator.js";
import type { Translate } from "../../src/core/i18n.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
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
import { applyStrataResourcePlan, knownStrataResourcePressure, planStrataResources, strataResourcePressure, type StrataResourcePlan } from "../../src/core/strata-resource-policy.js";
import { readReliableStrataResources, readStrataResources, watchStrataResources, type StrataResourceRetryPolicy } from "./strata-resources.js";
import { FileReadResourcePressure } from "../../src/core/strata-residency-pressure.js";
import { getApplicationLogger } from "../../src/infrastructure/app-logger.js";
import { supportsStrataUncensored, strataUncensoredMode, normalizeStrataUncensoredMode, isStrataUncensoredMode, strataVectorForMode, type StrataUncensoredMode, type StrataUncensoredFacts } from "../../src/core/strata-uncensored.js";
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
  uncensoredMode?: StrataUncensoredMode;
  /** Per-request thinking; budget 0 delegates to upstream answer_room, not a persisted setting. */
  reasoning?: { effort: "low" | "medium" | "high"; budgetTokens: number };
}

function validateChatRequest(request: StrataChatRequest, t: Translate = createNativeTranslator(undefined).t): void {
  if (request.uncensoredMode !== undefined && !isStrataUncensoredMode(request.uncensoredMode)) throw new Error(t(uiKeys.strataService.invalidMode));
  if (request.uncensored !== undefined && typeof request.uncensored !== "boolean") throw new Error(t(uiKeys.strataService.invalidVectorRequest));
  if (normalizeStrataUncensoredMode(request.uncensoredMode, request.uncensored) !== "off" && !supportsStrataUncensored(request.modelId)) throw new Error(t(uiKeys.strataService.unsupportedVector));
  if (!request.modelId.trim() || !Number.isSafeInteger(request.maxTokens) || request.maxTokens < 1
    || request.maxTokens > 32768 || !Number.isFinite(request.temperature) || request.temperature < 0 || request.temperature > 2
    || !request.messages.length || request.messages.some((message) =>
      !["system", "user", "assistant"].includes(message.role) || !validContent(message.content))
    || (request.reasoning && (!["low", "medium", "high"].includes(request.reasoning.effort)
      || !Number.isSafeInteger(request.reasoning.budgetTokens) || request.reasoning.budgetTokens < 0
      || request.reasoning.budgetTokens > request.maxTokens - 1024))) {
    throw new Error(t(uiKeys.strataService.invalidRequest));
  }
  if ((request.automaticOutputBudget !== undefined && typeof request.automaticOutputBudget !== "boolean")
    || (request.automaticOutputBudget && request.contextSize === undefined)) throw new Error(t(uiKeys.strataService.explicitContext));
}

export interface StrataChatDiagnostics extends ReturnType<StrataChatStream["diagnostics"]> {
  modelId: string; inputTokens: number | null; maxTokens: number; contextSize: number | null;
  requestedMaxTokens: number; automaticOutputBudget: boolean;
  reasoningRequested: boolean; reasoningEffort: string | null; reasoningBudgetTokens: number | null;
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
  allowResidentFallback?: boolean;
  resourcePlan?: StrataResourcePlan;
  temporaryConfig?: string;
  env?: Record<string, string>;
  controlVector?: StrataControlVector;
  engineLog?: string;
  uncensoredRequested?: boolean;
  uncensoredMode?: StrataUncensoredMode;
}

/** Internal only: accepts a completed, coherently verified pack/config preparation. */
export async function prepareStrataLaunch(
  settings: Pick<Settings, "strataInstallDirectory" | "strataPort"> & Partial<Pick<Settings, "strataUncensored" | "strataUncensoredMode" | "uiLocale">>,
  configPath: string,
  options: { adaptive?: boolean; readResources?: typeof readStrataResources } = {}
): Promise<StrataLaunchPlan> {
  const t = createNativeTranslator(settings.uiLocale).t;
  if (!validStrataPort(settings.strataPort)) throw new Error(t(uiKeys.strataService.invalidPort));
  const cwd = path.resolve(resolvedStrataDirectory(settings));
  if (!await strataManagedReceipt(cwd)) throw new Error(t(uiKeys.strataService.installIncomplete));
  const executable = path.join(cwd, ".venv", "Scripts", "python.exe");
  const config = path.resolve(configPath);
  for (const filename of [executable, path.join(cwd, "serve", "server.py"), config]) {
    if (!(await fs.stat(filename).catch(() => null))?.isFile()) throw new Error(t(uiKeys.strataService.launchFileMissing, { file: filename }));
  }
  const modelId = await validatePreparedStrataRuntime(config, cwd, undefined, t);
  const runtimeConfig = JSON.parse(await fs.readFile(config, "utf8"));
  const monitorAvailable = (await fs.readFile(path.join(cwd, "serve", "server.py"), "utf8")).includes('"--api-monitor"') &&
    (await Promise.all(["monitor.html", "monitor.js", "tokens.css"].map((name) =>
      fs.stat(path.join(cwd, "serve", "web", name)).then((stat) => stat.isFile() && stat.size > 0).catch(() => false)
    ))).every(Boolean);
  let launchConfig = config;
  let resourcePlan: StrataResourcePlan | undefined;
  const mode = strataUncensoredMode(settings);
  const controlVector = mode !== "off" && supportsStrataUncensored(modelId)
    ? await verifyStrataControlVector(cwd, mode, t) : undefined;
  if (controlVector) {
    runtimeConfig.args.push("--control-vector-scaled", `${controlVector.filename}:1.0`, "--control-vector-layer-range",
      String(controlVector.firstLayer), String(controlVector.lastLayer), "--cvec-mode", "project", "--cvec-dir", "per-layer");
    // Upstream defaults a loaded vector ON. Always override it, even for non-app callers.
    runtimeConfig.sampling = { ...(runtimeConfig.sampling ?? {}), experimental_speed_projection: false };
  }
  if (options.adaptive) {
    const reserveIndex = runtimeConfig.args.indexOf("--vram-reserve-mib");
    if (reserveIndex < 0) throw new Error(t(uiKeys.strataService.vramPolicyMissing));
    resourcePlan = planStrataResources(await readReliableStrataResources(options.readResources, undefined, t), Number(runtimeConfig.args[reserveIndex + 1]), {
      allowFileReadFallback: true, modelId, contextTokens: Number(runtimeConfig.args[runtimeConfig.args.indexOf("--max-context") + 1]) }, t);
    runtimeConfig.args[reserveIndex + 1] = String(resourcePlan.vramReserveMiB);
    runtimeConfig.args = applyStrataResourcePlan(runtimeConfig.args, resourcePlan, modelId);
  }
  if (options.adaptive || controlVector) {
    launchConfig = path.join(path.dirname(config), `runtime-session-${randomUUID()}.json`);
    await fs.writeFile(launchConfig, JSON.stringify(runtimeConfig, null, 2), { flag: "wx" });
  }
  const apiKey = randomBytes(32).toString("hex");
  return {
    executable, cwd, port: settings.strataPort, apiKey, modelId,
    engineLog: runtimeConfig.log, uncensoredRequested: mode !== "off", uncensoredMode: mode,
    ...(controlVector ? { controlVector } : {}),
    ...(launchConfig !== config ? { temporaryConfig: launchConfig } : {}),
    ...(resourcePlan ? { resourcePlan, allowResidentFallback: resourcePlan.hostMode === "resident",
      env: { STRATA_RESIDENT_HEADROOM_GIB: String(resourcePlan.headroomGiB),
        // Keep this working-set opt-in OFF pending the interrupted long-input
        // trial's kernel-dump investigation. Short trials are not full validation.
        ...(process.platform === "win32" && resourcePlan.hostMode === "resident" ? { STRATA_FILE_RELEASE: "0" } : {}) } } : {}),
    ...(runtimeConfig.args.includes("--resident-experts") || runtimeConfig.args.includes("--resident-budget-gib") ? { residentEngineLog: runtimeConfig.log } : {}),
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
export async function launchStrataProcess(plan: StrataLaunchPlan, output: (chunk: string) => void, t: Translate = createNativeTranslator(undefined).t): Promise<StrataOwnedProcess> {
  const child = spawn(plan.executable, plan.args, {
    cwd: plan.cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...plan.env }
  });
  child.stdout.on("data", (chunk: Buffer) => output(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => output(chunk.toString()));
  let alive = true;
  let exited!: () => void;
  const closed = new Promise<void>((resolve) => { exited = resolve; });
  child.once("close", (code, signal) => {
    alive = false;
    output(`\n[Strata process exited] code=${code ?? "null"} signal=${signal ?? "none"}\n`);
    exited();
  });
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
          timer = setTimeout(() => reject(new Error(t(uiKeys.strataService.processStillExiting))), 10_000);
        })]);
      } finally { if (timer) clearTimeout(timer); }
    }
  };
}

export interface StrataServiceSnapshot {
  hostMemoryMode?: "arena" | "resident" | "file-read" | null;
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
  getUiLocale?(): Settings["uiLocale"] | undefined;
  onSpawn?(pid: number): Promise<void> | undefined;
  launch?: typeof launchStrataProcess;
  portInUse?: typeof isLocalPortInUse;
  fetch?: typeof fetch;
  startupTimeoutMs?: number;
  pollMs?: number;
  requestTimeoutMs?: number;
  readResources?: typeof readStrataResources;
  resourceRetry?: StrataResourceRetryPolicy;
  resourcePressure?: typeof strataResourcePressure;
  knownResourcePressure?: typeof knownStrataResourcePressure;
  onDiagnostics?(diagnostics: StrataChatDiagnostics): void;
  /** Private diagnostics sink; callers must redact credentials and protect its files. */
  onOutput?(chunk: string): void;
}

/** App-owned lifecycle. HTTP readiness, confirmed vector load and completed requests are distinct facts. */
export class StrataService {
  private readonly t: Translate = (key, params, fallback) => createNativeTranslator(this.deps.getUiLocale?.()).t(key, params, fallback);
  private readonly residencyPressure = new FileReadResourcePressure(Date.now, event => {
    const message = this.t(uiKeys.strataService.pressure, { state: event.event === "recovered" ? this.t(uiKeys.strataService.recovered) : event.event === "critical" ? this.t(uiKeys.strataService.critical) : this.t(uiKeys.strataService.warning), ram: (event.memoryAvailableBytes / 1024 ** 3).toFixed(2), commit: ((event.commitAvailableBytes ?? 0) / 1024 ** 3).toFixed(2), vram: ((event.vramAvailableBytes ?? 0) / 1024 ** 3).toFixed(2), loading: String(event.loading), fileRead: String(event.fileRead), duration: event.elapsedMs });
    this.state.log = `${this.state.log}\n[Strata] ${message}\n`.slice(-65536);
    try {
      const logger = getApplicationLogger();
      logger[event.event === "recovered" ? "info" : event.event === "critical" ? "error" : "warn"]("prompt", `strata-host-${event.event}`, message, { ...event });
    } catch { /* Observability cannot cancel generation. */ }
  }, this.t);
  private hostMemoryMode: StrataServiceSnapshot["hostMemoryMode"] = null;
  private pressure = (sample: Parameters<typeof strataResourcePressure>[0]) =>
    (this.deps.resourcePressure ?? this.residencyPressure.check.bind(this.residencyPressure))(sample);
  private knownPressure = (sample: Parameters<typeof strataResourcePressure>[0]) => this.deps.knownResourcePressure
    ? this.deps.knownResourcePressure(sample) : this.deps.resourcePressure
      ? knownStrataResourcePressure(sample, this.t) : this.residencyPressure.knownPressure(sample);
  private vectorLoaded = false;
  private modeRequested = false;
  private selectedMode: StrataUncensoredMode = "off";
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
      this.state = { ...this.state, phase: "error", modelLoaded: null, message: this.t(uiKeys.strataService.exited) };
    }
    return { ...this.state, hostMemoryMode: this.state.modelLoaded ? this.hostMemoryMode : null, uncensored: {
      mode: this.selectedMode,
      requested: this.modeRequested, supported: supportsStrataUncensored(this.plan?.modelId ?? ""),
      vectorId: this.plan?.controlVector?.id ?? null, vectorSha256: this.plan?.controlVector?.sha256 ?? null,
      vectorLoaded: this.vectorLoaded && this.state.modelLoaded === true, applied: this.state.modelLoaded ? this.modeApplied : null
    } };
  }

  async hasVerifiedControlVector(mode: Exclude<StrataUncensoredMode, "off"> = "builtin"): Promise<boolean> {
    if (!this.plan?.controlVector || !this.vectorLoaded) return false;
    try {
      const current = await verifyStrataControlVector(this.plan.cwd, mode, this.t);
      return current.sha256 === this.plan.controlVector.sha256 && current.id === this.plan.controlVector.id;
    } catch { return false; }
  }

  start(plan: StrataLaunchPlan, signal?: AbortSignal): Promise<StrataServiceSnapshot> {
    return this.exclusive(async () => {
      signal?.throwIfAborted();
      if (!validStrataPort(plan.port) || !plan.apiKey) throw new Error(this.t(uiKeys.strataService.invalidLaunch));
      if (this.child?.running()) {
        if (this.state.phase === "ready" && this.plan && this.plan.executable === plan.executable
          && this.plan.cwd === plan.cwd && this.plan.port === plan.port && this.plan.apiKey === plan.apiKey
          && JSON.stringify(this.plan.args) === JSON.stringify(plan.args)) return this.inspectImpl();
        throw new Error(this.t(uiKeys.strataService.oldPlanBusy));
      }
      this.child = null;
      this.plan = null;
      if (await (this.deps.portInUse ?? isLocalPortInUse)(plan.port)) {
        throw new Error(this.t(uiKeys.strataService.portBusy, { port: plan.port }));
      }
      signal?.throwIfAborted();
      this.plan = { ...plan, args: [...plan.args] };
      this.residencyPressure.setLoading(false); this.residencyPressure.setFileRead(false); this.hostMemoryMode = null;
      this.vectorLoaded = false; this.modeApplied = null;
      this.selectedMode = normalizeStrataUncensoredMode(plan.uncensoredMode, plan.uncensoredRequested);
      this.modeRequested = this.selectedMode !== "off";
      this.state = { phase: "starting", port: plan.port, pid: null, modelLoaded: null, message: this.t(uiKeys.strataService.starting), log: "" };
      try {
        const onOutput = (chunk: string) => {
          this.state.log = `${this.state.log}${chunk}`.replaceAll(plan.apiKey, "[redacted]").slice(-8_000);
          try { this.deps.onOutput?.(chunk.replaceAll(plan.apiKey, "[redacted]")); } catch { /* Diagnostics cannot own process lifetime. */ }
        };
        this.child = await (this.deps.launch ? this.deps.launch(this.plan, onOutput) : launchStrataProcess(this.plan, onOutput, this.t));
        this.state.pid = this.child.pid;
        await this.deps.onSpawn?.(this.child.pid);
        const deadline = Date.now() + (this.deps.startupTimeoutMs ?? 30_000);
        while (Date.now() < deadline) {
          signal?.throwIfAborted();
          if (!this.child.running()) throw new Error(this.t(uiKeys.strataService.startupExited));
          try {
            const loaded = await this.probe();
            signal?.throwIfAborted();
            this.state = { ...this.state, phase: "ready", modelLoaded: loaded, message: this.t(uiKeys.strataService.httpReady) };
            return this.snapshot();
          } catch { signal?.throwIfAborted(); /* A port opening before HTTP handlers are ready is not readiness. */ }
          await new Promise<void>((resolve) => setTimeout(resolve, this.deps.pollMs ?? 200));
        }
        throw new Error(this.t(uiKeys.strataService.startupTimeout));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        try { await this.stopChild(); }
        catch { this.state = { ...this.state, phase: "error", modelLoaded: null, message: this.t(uiKeys.strataService.cleanupIncomplete, { detail: message }) }; throw new Error(this.state.message); }
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
      if (!this.plan || !this.child?.running()) throw new Error(this.t(uiKeys.strataService.notReady));
      const plan = this.plan;
      const safety = new AbortController();
      signal = AbortSignal.any([...(signal ? [signal] : []), safety.signal]);
      let disposeWatch = async () => {};
      try {
        this.residencyPressure.setLoading(plan.allowResidentFallback === true);
        if (plan.resourcePlan) {
          const resources = await readReliableStrataResources(this.deps.readResources, { ...this.deps.resourceRetry, signal, knownPressure: this.knownPressure }, this.t);
          const pressure = this.pressure(resources);
          if (pressure) throw new Error(pressure);
          if (resources.memoryAvailableBytes < plan.resourcePlan.requiredMemoryBytes
            || resources.commitAvailableBytes! < plan.resourcePlan.requiredCommitBytes
            || resources.vramAvailableBytes! < plan.resourcePlan.minimumFreeVramBytes) throw new Error(this.t(uiKeys.strataService.resourcesChanged, { ram: (resources.memoryAvailableBytes / 1024 ** 3).toFixed(1), requiredRam: (plan.resourcePlan.requiredMemoryBytes / 1024 ** 3).toFixed(1), commit: (resources.commitAvailableBytes! / 1024 ** 3).toFixed(1), requiredCommit: (plan.resourcePlan.requiredCommitBytes / 1024 ** 3).toFixed(1), vram: (resources.vramAvailableBytes! / 1024 ** 3).toFixed(1), requiredVram: (plan.resourcePlan.minimumFreeVramBytes / 1024 ** 3).toFixed(1) }));
          signal.throwIfAborted();
          disposeWatch = watchStrataResources((reason) => safety.abort(reason), this.deps.readResources, 1000, { ...this.deps.resourceRetry, pressure: this.pressure, knownPressure: this.knownPressure }, this.t);
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
            ? acknowledgement.error.message.replaceAll(plan.apiKey, "[redacted]").slice(0, 2000) : this.t(uiKeys.strataService.noLoadError);
          throw new Error(this.t(uiKeys.strataService.loadHttp, { status: response.status, reason: reason }));
        }
        if (acknowledgement?.status !== "loaded" || !await this.probe()) {
          throw new Error(this.t(uiKeys.strataService.loadUnconfirmed));
        }
        const fileRead = Boolean(plan.residentEngineLog && await assertStrataResidentLog(plan.residentEngineLog, logStart, plan.allowResidentFallback, this.t));
        this.residencyPressure.setFileRead(fileRead);
        this.hostMemoryMode = fileRead ? "file-read" : plan.resourcePlan?.hostMode ?? null;
        if (fileRead) this.state.log += this.deps.resourcePressure
          ? this.t(uiKeys.strataService.agentFileRead)
          : this.t(uiKeys.strataService.studioFileRead);
        if (plan.controlVector) {
          if (!plan.engineLog) throw new Error(this.t(uiKeys.strataService.vectorLogMissing));
          await assertStrataControlVectorLog(plan.engineLog, vectorLogStart, plan.controlVector, this.t);
          this.vectorLoaded = true;
        }
        signal?.throwIfAborted();
        this.state = { ...this.state, phase: "ready", modelLoaded: true, message: plan.controlVector
          ? this.t(uiKeys.strataService.vectorReady) : this.t(uiKeys.strataService.vectorOff) };
        return this.snapshot();
      } catch (error) {
        try { await this.stopChild(); }
        catch { this.state = { ...this.state, phase: "error", modelLoaded: null, message: this.t(uiKeys.strataService.loadCleanupFailed) }; throw new Error(this.state.message); }
        this.state = { ...this.state, phase: "stopped", port: null, modelLoaded: null };
        if (signal?.aborted) throw signal.reason;
        throw new Error((error instanceof Error ? error.message : this.t(uiKeys.strataService.loadFailed)).replaceAll(plan.apiKey, "[redacted]"));
      } finally { this.residencyPressure.setLoading(false); await disposeWatch(); }
    });
  }

  /** CPU tokenizer only, including the selected thinking template. Safe before /v1/load. */
  preflight(request: StrataChatRequest, signal?: AbortSignal): Promise<void> {
    return this.exclusive(async () => { await this.checkContext(request, signal); });
  }

  private async checkContext(request: StrataChatRequest, signal?: AbortSignal): Promise<{ inputTokens: number | null; maxTokens: number }> {
    validateChatRequest(request, this.t);
    signal?.throwIfAborted();
    if (!this.plan || !this.child?.running() || this.snapshot().phase !== "ready") throw new Error(this.t(uiKeys.strataService.notReady));
    if (request.contextSize === undefined) return { inputTokens: null, maxTokens: request.maxTokens };
    if (!Number.isSafeInteger(request.contextSize) || request.contextSize < 1024 || request.contextSize > 32768
      || !Number.isSafeInteger(request.visionTokensPerImage) || request.visionTokensPerImage! < 1) throw new Error(this.t(uiKeys.strataService.invalidContext));
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
    if (!Number.isSafeInteger(count) || count < 0) throw new Error(this.t(uiKeys.strataService.tokenizerFailed));
    const imageCount = request.messages.reduce((total, message) => total + (Array.isArray(message.content)
      ? message.content.filter((part) => part.type === "image_url").length : 0), 0);
    signal?.throwIfAborted();
    return strataTokenBudget({ inputTokens: count, imageCount, visionTokensPerImage: request.visionTokensPerImage!,
      contextSize: request.contextSize, requestedMaxTokens: request.maxTokens, automatic: request.automaticOutputBudget }, this.t);
  }

  /** Caller owns GPU arbitration. A failed/aborted stream stops the owned process, not just HTTP. */
  chat(request: StrataChatRequest, signal?: AbortSignal, onText?: (delta: string) => void, onBudget?: (tokens: number) => void,
    onReasoning?: (characters: number) => void): Promise<string> {
    return this.exclusive(async () => {
      validateChatRequest(request, this.t);
      signal?.throwIfAborted();
      if (!this.plan || !this.child?.running() || this.snapshot().phase !== "ready") throw new Error(this.t(uiKeys.strataService.notReady));
      const plan = this.plan;
      const mode = normalizeStrataUncensoredMode(request.uncensoredMode, request.uncensored);
      const safety = new AbortController();
      const requestSignal = AbortSignal.any([
        ...(signal ? [signal] : []), safety.signal, AbortSignal.timeout(this.deps.requestTimeoutMs ?? 600_000)
      ]);
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let disposeWatch = async () => {};
      const stream = new StrataChatStream(this.t);
      let budget: { inputTokens: number | null; maxTokens: number } = { inputTokens: null, maxTokens: request.maxTokens };
      const vectorLoadedAtRequest = this.vectorLoaded;
      try {
        this.selectedMode = mode;
        this.modeRequested = mode !== "off";
        this.modeApplied = null;
        if (mode !== "off" && (!this.vectorLoaded || plan.controlVector?.id !== strataVectorForMode(mode).id))
          throw new Error(this.t(uiKeys.strataService.vectorUnconfirmed));
        if (plan.resourcePlan) {
          const pressure = this.pressure(await readReliableStrataResources(this.deps.readResources, { ...this.deps.resourceRetry, signal: requestSignal, knownPressure: this.knownPressure }, this.t));
          if (pressure) throw new Error(pressure);
          disposeWatch = watchStrataResources((reason) => safety.abort(reason), this.deps.readResources, 1000, { ...this.deps.resourceRetry, pressure: this.pressure, knownPressure: this.knownPressure }, this.t);
        }
        budget = await this.checkContext(request, requestSignal);
        requestSignal.throwIfAborted();
        onBudget?.(budget.maxTokens);
        const response = await (this.deps.fetch ?? fetch)(`http://127.0.0.1:${plan.port}/v1/chat/completions`, {
          method: "POST", redirect: "error", signal: requestSignal,
          headers: { Authorization: `Bearer ${plan.apiKey}`, "Content-Type": "application/json" },
          // Upstream monitor captures only the first 256K characters. Keep diagnostics before image base64.
          body: JSON.stringify({ model: request.modelId, max_tokens: budget.maxTokens,
            experimental_speed_projection: mode !== "off",
            ...(request.reasoning ? STRATA_THINKING_SAMPLING : STRATA_NON_THINKING_SAMPLING), temperature: request.temperature,
            ...(request.reasoning ? { reasoning_effort: request.reasoning.effort, reasoning_budget_tokens: request.reasoning.budgetTokens } : {}),
            stream: true, chat_template_kwargs: { enable_thinking: Boolean(request.reasoning) }, messages: request.messages })
        });
        if (!response.ok || !response.headers.get("content-type")?.startsWith("text/event-stream") || !response.body) {
          await response.body?.cancel().catch(() => undefined);
          throw new Error(response.status === 400
            ? this.t(uiKeys.strataService.inputRejected)
            : this.t(uiKeys.strataService.requestHttp, { status: response.status }));
        }
        reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8", { fatal: true });
        while (!stream.done) {
          requestSignal.throwIfAborted();
          const part = await reader.read();
          if (part.done) { stream.push(decoder.decode()); break; }
          const previousThinking = stream.diagnostics().reasoningCharacters;
          const deltas = stream.push(decoder.decode(part.value, { stream: true }));
          const thinking = stream.diagnostics().reasoningCharacters;
          if (thinking > previousThinking) onReasoning?.(thinking);
          for (const delta of deltas) {
            requestSignal.throwIfAborted();
            onText?.(delta);
          }
        }
        requestSignal.throwIfAborted();
        const result = stream.result();
        if (!this.child.running()) throw new Error(this.t(uiKeys.strataService.requestExited));
        this.state.modelLoaded = await this.probe();
        if (!this.state.modelLoaded) throw new Error(this.t(uiKeys.strataService.modelLost));
        requestSignal.throwIfAborted();
        this.modeApplied = mode !== "off";
        this.state.message = this.modeApplied ? this.t(uiKeys.strataService.vectorOn) : this.t(uiKeys.strataService.vectorOff);
        return result;
      } catch (error) {
        try {
          await this.stopChild();
          this.state = { ...this.state, phase: "stopped", port: null, modelLoaded: null, message: this.t(uiKeys.strataService.requestAborted) };
        } catch {
          this.state = { ...this.state, phase: "error", modelLoaded: null, message: this.t(uiKeys.strataService.requestCleanupFailed) };
          throw new Error(this.state.message);
        }
        if (signal?.aborted) throw signal.reason;
        if (safety.signal.aborted) throw safety.signal.reason;
        // Do not expose server bodies, model text or per-launch credentials in errors.
        throw new Error((error instanceof Error ? error.message : this.t(uiKeys.strataService.requestFailed)).replaceAll(plan.apiKey, "[redacted]"));
      } finally {
        await disposeWatch();
        await reader?.cancel().catch(() => undefined);
        reader?.releaseLock();
        try { this.deps.onDiagnostics?.({ modelId: request.modelId, ...budget,
          requestedMaxTokens: request.maxTokens, automaticOutputBudget: request.automaticOutputBudget === true,
          reasoningRequested: Boolean(request.reasoning), reasoningEffort: request.reasoning?.effort ?? null,
          reasoningBudgetTokens: request.reasoning?.budgetTokens ?? null,
          contextSize: request.contextSize ?? null, ...stream.diagnostics(), uncensored: {
            mode, requested: mode !== "off", supported: supportsStrataUncensored(request.modelId),
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
        this.state = { ...this.state, phase: "stopped", port: null, message: this.t(uiKeys.strataService.stopped) };
      } catch (error) {
        this.state = { ...this.state, phase: "error", message: this.t(uiKeys.strataService.stopFailed) };
        throw error;
      }
      return this.snapshot();
    });
  }

  private async probe(): Promise<boolean> {
    if (!this.plan || !this.child?.running()) throw new Error(this.t(uiKeys.strataService.notRunning));
    const plan = this.plan;
    const request = async (endpoint: string) => {
      const response = await (this.deps.fetch ?? fetch)(`http://127.0.0.1:${plan.port}${endpoint}`, {
        redirect: "error", signal: AbortSignal.timeout(1_000),
        headers: { Authorization: `Bearer ${plan.apiKey}` }
      });
      if (!response.ok) throw new Error(this.t(uiKeys.strataService.statusFailed));
      return response.json();
    };
    const health = await request("/health");
    if (health.service !== "strata" || health.status !== "ok" || typeof health.loaded !== "boolean" || health.api_key !== true) {
      throw new Error(this.t(uiKeys.strataService.notAuthenticated));
    }
    // /health is public upstream; verify our per-launch secret against a protected endpoint too.
    const models = await request("/v1/models");
    if (models.object !== "list" || !Array.isArray(models.data)) throw new Error(this.t(uiKeys.strataService.modelProtocol));
    if (!this.child?.running()) throw new Error(this.t(uiKeys.strataService.exited));
    return health.loaded;
  }

  private async inspectImpl(): Promise<StrataServiceSnapshot> {
    if (!this.child) return this.snapshot();
    try {
      const loaded = await this.probe();
      this.state = { ...this.state, phase: "ready", modelLoaded: loaded };
    } catch {
      this.state = { ...this.state, phase: "error", modelLoaded: null, message: this.t(uiKeys.strataService.inspectFailed) };
    }
    return this.snapshot();
  }

  private async stopChild(): Promise<void> {
    if (this.child) {
      await this.child.stop();
      if (this.child.running()) throw new Error(this.t(uiKeys.strataService.processRunning));
    }
    this.child = null;
    this.residencyPressure.setLoading(false); this.residencyPressure.setFileRead(false); this.hostMemoryMode = null;
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
export async function assertStrataResidentLog(filename: string, offset: number, allowFallback = false, t: Translate = createNativeTranslator(undefined).t): Promise<true | void> {
  const file = await fs.open(filename, "r");
  try {
    const stat = await file.stat();
    const length = Math.min(Math.max(0, stat.size - offset), 256 * 1024);
    if (!length) throw new Error(t(uiKeys.strataService.residentLogMissing));
    const bytes = Buffer.alloc(length);
    await file.read(bytes, 0, length, Math.max(offset, stat.size - length));
    if (/WARNING: the (?:whole )?resident RAM mode does not fit/u.test(bytes.toString("utf8"))) {
      if (allowFallback) return true;
      throw new Error(t(uiKeys.strataService.residentFailed));
    }
  } finally { await file.close(); }
}
