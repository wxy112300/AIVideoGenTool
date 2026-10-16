import type { Settings } from "../../src/types.js";
import { findPreparedStrataRuntime, prepareStrataModelRuntime, preparedStrataMtpMatchesSelection, validatePreparedStrataRuntime, type StrataModelPreparationRuntime, type StrataRuntimePolicy } from "./strata-model-preparation.js";
import { prepareStrataLaunch, StrataService, type StrataChatRequest, type StrataServiceSnapshot } from "./strata-service.js";

interface StrataRuntimeOwnerDependencies {
  run: StrataModelPreparationRuntime["run"];
  isResourcesBusy(signal?: AbortSignal): boolean;
  beforeInference?(): Promise<void>;
  service?: StrataService;
  prepare?: typeof prepareStrataModelRuntime;
  prepareLaunch?: typeof prepareStrataLaunch;
  findPrepared?: typeof findPreparedStrataRuntime;
}

/** One application owner for preparation, software mutations, requests and process cleanup. No persisted lease. */
export class StrataRuntimeOwner {
  private readonly service: StrataService;
  private controller: AbortController | null = null;
  private worker: Promise<unknown> | null = null;
  private stopping: Promise<StrataServiceSnapshot> | null = null;
  private closing = false;
  private modelId: string | null = null;
  private selectionKey: string | null = null;

  constructor(private readonly deps: StrataRuntimeOwnerDependencies) {
    this.service = deps.service ?? new StrataService();
  }

  isBusy(): boolean { return Boolean(this.worker || this.stopping); }
  get runningWorker(): Promise<unknown> | null { return this.worker; }
  snapshot(): StrataServiceSnapshot { return this.service.snapshot(); }
  monitorConnection() { return this.service.monitorConnection(); }
  abort(reason: Error): void { this.controller?.abort(reason); }

  /** Product entry: prepare/reuse, bind the selected files and explicitly load, under one owner lease. */
  ensurePromptReady(
    settings: Settings, policy: StrataRuntimePolicy,
    options: { resolvedModelDirectory?: string; signal?: AbortSignal; onLog?: (message: string) => void;
      onStage?: (stage: "checking" | "preparing" | "loading-model") => void; request?: StrataChatRequest } = {}
  ): Promise<StrataServiceSnapshot> {
    return this.run(async (signal) => {
      const key = JSON.stringify([settings.promptModelId, settings.strataInstallDirectory,
        options.resolvedModelDirectory ?? settings.modelDirectory, settings.strataModelDirectory, settings.strataPort, policy]);
      if (this.selectionKey === key && this.snapshot().phase === "ready" && this.snapshot().modelLoaded) {
        // Stat/receipt checks catch changed weights/pack without hashing them on every enhancement.
        let valid = false;
        try {
          valid = Boolean(this.configPath && await validatePreparedStrataRuntime(this.configPath, this.installDirectory!) === settings.promptModelId);
          if (valid) valid = await preparedStrataMtpMatchesSelection(this.configPath!, settings, options.resolvedModelDirectory);
        } catch { /* Changed sources invalidate residency and the completion cache. */ }
        if (valid) {
          if (options.request) await this.service.preflight(options.request, signal);
          return this.snapshot();
        }
      }
      if (this.snapshot().pid !== null) await this.service.stop();
      this.modelId = null; this.selectionKey = null;
      options.onStage?.("checking");
      options.onLog?.("检查模型与已准备缓存");
      const cached = await (this.deps.findPrepared ?? findPreparedStrataRuntime)(settings, settings.promptModelId, policy, { ...options, signal, run: this.deps.run });
      if (!cached) {
        options.onStage?.("preparing");
        options.onLog?.("首次准备：校验共享权重并生成 CPU pack/tokenizer；此阶段尚未启动 Strata 服务，不占用模型显存");
      }
      const configPath = cached ?? (await (this.deps.prepare ?? prepareStrataModelRuntime)(
        settings, settings.promptModelId, policy, { run: this.deps.run }, { ...options, signal }
      )).configPath;
      signal.throwIfAborted();
      let plan = await (this.deps.prepareLaunch ?? prepareStrataLaunch)(settings, configPath);
      if (plan.modelId !== settings.promptModelId) throw new Error("Strata 已准备模型与所选模型不一致。");
      try {
        options.onLog?.(cached ? "复用已验证 pack/tokenizer" : "pack/tokenizer 准备完成");
        options.onStage?.("preparing");
        options.onLog?.("正在启动 Strata 本机 HTTP 服务；就绪后打开只读监视页");
        await this.service.start(plan, signal);
        if (options.request) {
          options.onLog?.("使用官方 tokenizer 检查完整上下文预算");
          await this.service.preflight(options.request, signal);
        }
        options.onLog?.("正在确认 ComfyUI 已释放 GPU 资源");
        await this.deps.beforeInference?.();
        signal.throwIfAborted();
        // Count the unchanged full request before releasing ComfyUI. Only then measure the
        // resources we actually own; restart the CPU-only lazy server with a session overlay.
        options.onLog?.("正在检查当前 RAM、Windows 提交余量与显存预算");
        const adaptivePlan = await (this.deps.prepareLaunch ?? prepareStrataLaunch)(settings, configPath, { adaptive: true });
        if (adaptivePlan.resourcePlan) {
          await this.service.stop();
          plan = adaptivePlan;
          if (plan.modelId !== settings.promptModelId) throw new Error("Strata 自适应配置模型身份改变。");
          options.onLog?.(`内存自适应：${plan.resourcePlan!.hostMode === "arena" ? "完整专家 RAM" : "GPU 外专家 RAM 驻留"}，可用 ${(plan.resourcePlan!.availableMemoryBytes / 1024 ** 3).toFixed(1)}GiB，显存预留 ${plan.resourcePlan!.vramReserveMiB}MiB`);
          await this.service.start(plan, signal);
        }
        options.onStage?.("loading-model");
        options.onLog?.("正在加载 Strata GPU 模型；加载请求上限 10 分钟，可取消并停止自有进程");
        const state = await this.service.load(signal);
        this.modelId = settings.promptModelId; this.selectionKey = key; this.configPath = configPath; this.installDirectory = plan.cwd;
        return state;
      } catch (error) { await this.service.stop(); throw error; }
    }, options.signal);
  }

  private configPath: string | null = null;
  private installDirectory: string | null = null;

  startPrepared(settings: Settings, configPath: string, signal?: AbortSignal): Promise<StrataServiceSnapshot> {
    if (this.snapshot().pid !== null) return Promise.reject(new Error("请先停止 Strata，再准备或切换模型。"));
    return this.run(async (ownedSignal) => {
      const plan = await (this.deps.prepareLaunch ?? prepareStrataLaunch)(settings, configPath);
      if (!plan.modelId?.trim()) throw new Error("Strata 启动计划缺少已验证模型身份。");
      try {
        const state = await this.service.start(plan, ownedSignal);
        ownedSignal.throwIfAborted();
        this.modelId = plan.modelId;
        return state;
      } catch (error) {
        await this.service.stop();
        throw error;
      }
    }, signal);
  }

  prepareAndStart(
    settings: Settings, modelId: string, policy: StrataRuntimePolicy,
    options: { resolvedModelDirectory?: string; signal?: AbortSignal; onLog?: (message: string) => void } = {}
  ): Promise<StrataServiceSnapshot> {
    if (this.snapshot().pid !== null) return Promise.reject(new Error("请先停止 Strata，再准备或切换模型。"));
    return this.run(async (signal) => {
      const prepared = await (this.deps.prepare ?? prepareStrataModelRuntime)(
        settings, modelId, policy, { run: this.deps.run }, { ...options, signal }
      );
      signal.throwIfAborted();
      const plan = await (this.deps.prepareLaunch ?? prepareStrataLaunch)(settings, prepared.configPath);
      signal.throwIfAborted();
      try {
        const state = await this.service.start(plan, signal);
        signal.throwIfAborted();
        this.modelId = prepared.modelId;
        return state;
      } catch (error) {
        await this.service.stop();
        throw error;
      }
    }, options.signal);
  }

  chat(request: StrataChatRequest, signal?: AbortSignal, onText?: (delta: string) => void): Promise<string> {
    return this.run(async (ownedSignal) => {
      if (!this.modelId || request.modelId !== this.modelId) throw new Error("Strata 请求模型与已准备模型不一致，请先准备所选模型。");
      await this.deps.beforeInference?.();
      ownedSignal.throwIfAborted();
      return this.service.chat(request, ownedSignal, onText);
    }, signal);
  }

  withSoftwareChange<T>(change: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.snapshot().pid !== null) return Promise.reject(new Error("Strata 服务仍占用软件目录，请先停止服务再安装或卸载。"));
    return this.run(change);
  }

  stop(): Promise<StrataServiceSnapshot> {
    if (this.stopping) return this.stopping;
    this.abort(new Error("Strata 操作已取消"));
    const worker = this.worker;
    const stopped = Promise.resolve().then(async () => {
      // The operation includes owned subprocess termination and installer recovery.
      await worker?.catch(() => undefined);
      const state = await this.service.stop();
      this.modelId = null;
      this.selectionKey = null;
      return state;
    }).finally(() => { if (this.stopping === stopped) this.stopping = null; });
    this.stopping = stopped;
    return stopped;
  }

  shutdown(): Promise<StrataServiceSnapshot> {
    this.closing = true;
    return this.stop();
  }

  private run<T>(operation: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (this.closing) return Promise.reject(new Error("应用正在退出，不能启动 Strata 操作。"));
    if (this.isBusy() || this.deps.isResourcesBusy(signal)) return Promise.reject(new Error("当前有生成、提示词或 Strata 操作，请完成或取消后重试。"));
    const controller = new AbortController();
    const ownedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    this.controller = controller;
    const worker = Promise.resolve().then(async () => {
      ownedSignal.throwIfAborted();
      return operation(ownedSignal);
    });
    this.worker = worker;
    return worker.finally(() => {
      if (this.worker === worker) this.worker = null;
      if (this.controller === controller) this.controller = null;
    });
  }
}
