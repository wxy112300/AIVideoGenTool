import { createNativeTranslator } from "../ui-translator.js";
import type { Translate } from "../../src/core/i18n.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
import type { Settings } from "../../src/types.js";
import { findPreparedStrataRuntime, prepareStrataModelRuntime, preparedStrataMtpMatchesSelection, validatePreparedStrataRuntime, type StrataModelPreparationRuntime, type StrataRuntimePolicy } from "./strata-model-preparation.js";
import { prepareStrataLaunch, StrataService, type StrataChatRequest, type StrataServiceSnapshot, type StrataChatDiagnostics } from "./strata-service.js";
import { supportsStrataUncensored, strataUncensoredMode } from "../../src/core/strata-uncensored.js";

interface StrataRuntimeOwnerDependencies {
  getUiLocale?(): Settings["uiLocale"] | undefined;
  resourceGate?: { acquire(): Promise<void>; track(pid: number): Promise<void> };
  run: StrataModelPreparationRuntime["run"];
  isResourcesBusy(signal?: AbortSignal): boolean;
  beforeInference?(): Promise<void>;
  service?: StrataService;
  prepare?: typeof prepareStrataModelRuntime;
  prepareLaunch?: typeof prepareStrataLaunch;
  findPrepared?: typeof findPreparedStrataRuntime;
  onDiagnostics?(diagnostics: StrataChatDiagnostics): void;
}

/** Application operation owner; production composes the shared cross-process resource gate. */
export class StrataRuntimeOwner {
  private readonly t: Translate = (key, params, fallback) => createNativeTranslator(this.deps.getUiLocale?.()).t(key, params, fallback);
  private readonly service: StrataService;
  private controller: AbortController | null = null;
  private worker: Promise<unknown> | null = null;
  private stopping: Promise<StrataServiceSnapshot> | null = null;
  private closing = false;
  private modelId: string | null = null;
  private selectionKey: string | null = null;

  constructor(private readonly deps: StrataRuntimeOwnerDependencies) {
    this.service = deps.service ?? new StrataService({ getUiLocale: deps.getUiLocale, onDiagnostics: deps.onDiagnostics, onSpawn: (pid) => deps.resourceGate?.track(pid) });
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
      const mode = strataUncensoredMode(settings);
      const wantsUncensored = mode !== "off" && supportsStrataUncensored(settings.promptModelId);
      options.onLog?.(`uncensored: mode=${mode} requested=${mode !== "off"} supported=${supportsStrataUncensored(settings.promptModelId)}`);
      const key = JSON.stringify([settings.promptModelId, settings.strataInstallDirectory,
        options.resolvedModelDirectory ?? settings.modelDirectory, settings.strataModelDirectory, settings.strataPort, policy]);
      if (this.selectionKey === key && this.snapshot().phase === "ready" && this.snapshot().modelLoaded) {
        // Stat/receipt checks catch changed weights/pack without hashing them on every enhancement.
        let valid = false;
        try {
          valid = Boolean(this.configPath && await validatePreparedStrataRuntime(this.configPath, this.installDirectory!, undefined, this.t) === settings.promptModelId);
          if (valid) valid = await preparedStrataMtpMatchesSelection(this.configPath!, settings, options.resolvedModelDirectory);
          if (valid && wantsUncensored) valid = await this.service.hasVerifiedControlVector(mode);
        } catch { /* Changed sources invalidate residency and the completion cache. */ }
        if (valid) {
          options.onLog?.(`uncensored: retained vectorLoaded=${this.snapshot().uncensored?.vectorLoaded === true}; nextRequest=${wantsUncensored}`);
          if (options.request) await this.service.preflight(options.request, signal);
          return this.snapshot();
        }
      }
      if (this.snapshot().pid !== null) await this.service.stop();
      this.modelId = null; this.selectionKey = null;
      options.onStage?.("checking");
      options.onLog?.(this.t(uiKeys.strataPreparation.checking));
      const cached = await (this.deps.findPrepared ?? findPreparedStrataRuntime)(settings, settings.promptModelId, policy, { ...options, signal, run: this.deps.run });
      if (!cached) {
        options.onStage?.("preparing");
        options.onLog?.(this.t(uiKeys.strataPreparation.firstUse));
      }
      const configPath = cached ?? (await (this.deps.prepare ?? prepareStrataModelRuntime)(
        settings, settings.promptModelId, policy, { run: this.deps.run }, { ...options, signal }
      )).configPath;
      signal.throwIfAborted();
      let plan = await (this.deps.prepareLaunch ?? prepareStrataLaunch)(settings, configPath);
      if (plan.modelId !== settings.promptModelId) throw new Error(this.t(uiKeys.strataPreparation.modelMismatch));
      try {
        if (plan.controlVector) options.onLog?.(`uncensored: verified vector=${plan.controlVector.id} sha256=${plan.controlVector.sha256} layers=${plan.controlVector.firstLayer}..${plan.controlVector.lastLayer}; first activation reloads model only, not weights/pack`);
        options.onLog?.(cached ? this.t(uiKeys.strataPreparation.cacheReused) : this.t(uiKeys.strataPreparation.packPrepared));
        options.onStage?.("preparing");
        options.onLog?.(this.t(uiKeys.strataPreparation.starting));
        await this.service.start(plan, signal);
        if (options.request) {
          options.onLog?.(this.t(uiKeys.strataPreparation.tokenizerCheck));
          await this.service.preflight(options.request, signal);
        }
        options.onLog?.(this.t(uiKeys.strataPreparation.gpuRelease));
        await this.deps.beforeInference?.();
        signal.throwIfAborted();
        // Count the unchanged full request before releasing ComfyUI. Only then measure the
        // resources we actually own; restart the CPU-only lazy server with a session overlay.
        options.onLog?.(this.t(uiKeys.strataPreparation.resourcesCheck));
        const adaptivePlan = await (this.deps.prepareLaunch ?? prepareStrataLaunch)(settings, configPath, { adaptive: true });
        if (adaptivePlan.resourcePlan) {
          const resourcePlan = adaptivePlan.resourcePlan;
          await this.service.stop();
          plan = adaptivePlan;
          if (plan.modelId !== settings.promptModelId) throw new Error(this.t(uiKeys.strataPreparation.adaptiveMismatch));
          options.onLog?.(this.t(uiKeys.strataPreparation.adaptive, { mode: plan.resourcePlan!.hostMode === "arena" ? this.t(uiKeys.strataPreparation.arena) : plan.resourcePlan!.residentBudgetGiB !== undefined ? this.t(uiKeys.strataPreparation.budgetResident) : this.t(uiKeys.strataPreparation.outsideGpu), model: settings.promptModelId, budget: plan.resourcePlan!.residentBudgetGiB ?? "none", available: (plan.resourcePlan!.availableMemoryBytes / 1024 ** 3).toFixed(1), reserve: plan.resourcePlan!.vramReserveMiB }));
          options.onLog?.(this.t(uiKeys.strataPreparation.admission, { commit: (plan.resourcePlan!.requiredCommitBytes / 1024 ** 3).toFixed(1), fallback: String(plan.allowResidentFallback === true) }));
          if (resourcePlan.estimatedCommitBytes !== undefined && plan.allowResidentFallback) options.onLog?.(this.t(uiKeys.strataPreparation.commitEstimate, { size: (resourcePlan.estimatedCommitBytes / 1024 ** 3).toFixed(1) }));
          if (resourcePlan.estimatedResidentMemoryBytes !== undefined) {
            options.onLog?.(this.t(uiKeys.strataPreparation.residentTarget, { target: (resourcePlan.estimatedResidentMemoryBytes / 1024 ** 3).toFixed(1), reserve: (resourcePlan.requiredMemoryBytes / 1024 ** 3).toFixed(1), policy: plan.allowResidentFallback ? this.t(uiKeys.strataPreparation.fallbackPolicy) : this.t(uiKeys.strataPreparation.fullPolicy) }));
          }
          options.onLog?.(this.t(uiKeys.strataPreparation.fileRelease, { value: plan.env?.STRATA_FILE_RELEASE ?? "unset" }));
          await this.service.start(plan, signal);
        }
        options.onStage?.("loading-model");
        options.onLog?.(this.t(uiKeys.strataPreparation.loading));
        const state = await this.service.load(signal);
        options.onLog?.(this.t(uiKeys.strataPreparation.loaded, { mode: state.hostMemoryMode ?? "unknown", context: policy.maxContext }));
        options.onLog?.(`uncensored: engineConfirmed=${state.uncensored?.vectorLoaded === true} vector=${state.uncensored?.vectorId ?? "none"}; nextRequest=${wantsUncensored}`);
        this.modelId = settings.promptModelId; this.selectionKey = key; this.configPath = configPath; this.installDirectory = plan.cwd;
        return state;
      } catch (error) { await this.service.stop(); throw error; }
    }, options.signal);
  }

  private configPath: string | null = null;
  private installDirectory: string | null = null;

  startPrepared(settings: Settings, configPath: string, signal?: AbortSignal): Promise<StrataServiceSnapshot> {
    if (this.snapshot().pid !== null) return Promise.reject(new Error(this.t(uiKeys.strataPreparation.stopFirst)));
    return this.run(async (ownedSignal) => {
      const plan = await (this.deps.prepareLaunch ?? prepareStrataLaunch)(settings, configPath);
      if (!plan.modelId?.trim()) throw new Error(this.t(uiKeys.strataPreparation.identityMissing));
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
    if (this.snapshot().pid !== null) return Promise.reject(new Error(this.t(uiKeys.strataPreparation.stopFirst)));
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

  chat(request: StrataChatRequest, signal?: AbortSignal, onText?: (delta: string) => void, onBudget?: (tokens: number) => void,
    onReasoning?: (characters: number) => void): Promise<string> {
    return this.run(async (ownedSignal) => {
      if (!this.modelId || request.modelId !== this.modelId) throw new Error(this.t(uiKeys.strataPreparation.requestMismatch));
      await this.deps.beforeInference?.();
      ownedSignal.throwIfAborted();
      return this.service.chat(request, ownedSignal, onText, onBudget, onReasoning);
    }, signal);
  }

  withSoftwareChange<T>(change: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.snapshot().pid !== null) return Promise.reject(new Error(this.t(uiKeys.strataPreparation.softwareBusy)));
    return this.run(change);
  }

  stop(): Promise<StrataServiceSnapshot> {
    if (this.stopping) return this.stopping;
    this.abort(new Error(this.t(uiKeys.strataPreparation.cancelled)));
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
    if (this.closing) return Promise.reject(new Error(this.t(uiKeys.strataPreparation.closing)));
    if (this.isBusy() || this.deps.isResourcesBusy(signal)) return Promise.reject(new Error(this.t(uiKeys.strataPreparation.busy)));
    const controller = new AbortController();
    const ownedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    this.controller = controller;
    const worker = Promise.resolve().then(async () => {
      ownedSignal.throwIfAborted();
      await this.deps.resourceGate?.acquire();
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
