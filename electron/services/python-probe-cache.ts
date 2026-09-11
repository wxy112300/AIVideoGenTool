import type {
  LlamaCppPythonStatus,
  PythonProbeEvidence,
  PythonProbeEvidenceReason
} from "../../src/types.js";
import type { AttentionPythonProbe } from "./attention-python-probe.js";
import {
  createPythonProbeFingerprintReader,
  probeIdentityKey,
  probeResourceKey,
  type ProbeIdentity,
  type PythonFingerprintSnapshot,
  type PythonLayoutManifest,
  type PythonProbeFingerprintReader
} from "./python-probe-fingerprint.js";

export type ProbeFamily = "attention" | "llama";
export type ProbeMode = "auto" | "live";

export interface PythonProbeFamilyMap {
  attention: AttentionPythonProbe;
  llama: LlamaCppPythonStatus;
}

export interface PythonProbeRunOutput<T> {
  value: T;
  cacheable: boolean;
  state?: "valid" | "failed";
  reason?: PythonProbeEvidenceReason;
}

export interface PythonProbeCacheMetrics {
  nativeStarted: boolean;
  nativeDurationMs?: number;
  fingerprintDurationMs: number;
  source: PythonProbeEvidence["source"];
}

export interface PythonProbeCacheResult<T> {
  value?: T;
  evidence: PythonProbeEvidence;
  metrics: PythonProbeCacheMetrics;
}

export interface PythonProbeValidationCycle {
  readonly identity: ProbeIdentity;
  readonly resourceKey: string;
  readonly token: string;
}

export interface PythonProbeMutationTarget {
  identity?: ProbeIdentity;
  resourceKey?: string;
}

export interface PythonProbeCacheOptions {
  ttlMs?: number;
  maxIdentities?: number;
  now?: () => number;
  wallNow?: () => number;
  fingerprintReader?: PythonProbeFingerprintReader;
}

interface CacheEntry<T> {
  value: T;
  identityKey: string;
  family: ProbeFamily;
  resourceKey: string;
  manifest: PythonLayoutManifest;
  signature: string;
  epochToken: string;
  verifiedAt: string;
  completedAt: number;
  probeDurationMs?: number;
}

interface ResourceState {
  epoch: number;
  mutationDepth: number;
}

interface PendingProbe<T> {
  promise: Promise<PythonProbeCacheResult<T>>;
  mode: ProbeMode;
  resourceKey: string;
}

type CacheKey = `${string}\u0000${ProbeFamily}`;

const DEFAULT_TTL_MS = 5 * 60 * 1_000;
const DEFAULT_MAX_IDENTITIES = 4;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function reasonFor(value: string | undefined): PythonProbeEvidenceReason | undefined {
  if (!value) return undefined;
  const allowed: readonly PythonProbeEvidenceReason[] = [
    "empty",
    "expired",
    "identity-changed",
    "fingerprint-changed",
    "uncacheable",
    "forced",
    "mutation",
    "inflight-invalidated",
    "probe-failed",
    "no-python",
    "runtime-previous"
  ];
  return allowed.includes(value as PythonProbeEvidenceReason)
    ? value as PythonProbeEvidenceReason
    : "uncacheable";
}

function evidence(
  source: PythonProbeEvidence["source"],
  state: PythonProbeEvidence["state"],
  reason?: string,
  extras: Pick<PythonProbeEvidence, "verifiedAt" | "ageMs"> = {}
): PythonProbeEvidence {
  return {
    source,
    state,
    ...(extras.verifiedAt ? { verifiedAt: extras.verifiedAt } : {}),
    ...(extras.ageMs !== undefined ? { ageMs: extras.ageMs } : {}),
    ...(reasonFor(reason) ? { reason: reasonFor(reason) } : {})
  };
}

function cacheKey(identity: ProbeIdentity, family: ProbeFamily): CacheKey {
  return `${probeIdentityKey(identity)}\u0000${family}`;
}

export class PythonProbeCache<
  FamilyMap extends Record<ProbeFamily, unknown> = PythonProbeFamilyMap
> {
  private readonly ttlMs: number;
  private readonly maxIdentities: number;
  private readonly now: () => number;
  private readonly wallNow: () => number;
  private readonly fingerprintReader: PythonProbeFingerprintReader;
  private readonly entries = new Map<CacheKey, CacheEntry<unknown>>();
  private readonly identityLru = new Map<string, number>();
  private readonly resourceStates = new Map<string, ResourceState>();
  private readonly pending = new Map<CacheKey, PendingProbe<unknown>>();
  private readonly livePending = new Map<string, Set<CacheKey>>();
  private sequence = 0;
  private globalEpoch = 0;
  private globalMutationDepth = 0;

  constructor(options: PythonProbeCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxIdentities = options.maxIdentities ?? DEFAULT_MAX_IDENTITIES;
    this.now = options.now ?? (() => Date.now());
    this.wallNow = options.wallNow ?? (() => Date.now());
    this.fingerprintReader = options.fingerprintReader ?? createPythonProbeFingerprintReader();
  }

  beginValidationCycle(
    identity: ProbeIdentity,
    reason: PythonProbeEvidenceReason = "forced"
  ): PythonProbeValidationCycle {
    void reason;
    const normalizedResource = probeResourceKey(identity);
    const state = this.resourceState(normalizedResource);
    state.epoch += 1;
    this.deleteResourceEntries(normalizedResource);
    return {
      identity,
      resourceKey: normalizedResource,
      token: this.epochToken(normalizedResource)
    };
  }

  beginMutation(target?: PythonProbeMutationTarget): () => void {
    const resourceKey = target?.resourceKey ||
      (target?.identity ? probeResourceKey(target.identity) : "");
    if (!resourceKey) {
      this.globalMutationDepth += 1;
      this.globalEpoch += 1;
      this.entries.clear();
      this.identityLru.clear();
      return this.finishMutation("", true);
    }
    const state = this.resourceState(resourceKey);
    state.mutationDepth += 1;
    state.epoch += 1;
    this.deleteResourceEntries(resourceKey);
    return this.finishMutation(resourceKey, false);
  }

  invalidate(target: PythonProbeMutationTarget | ProbeIdentity | undefined, _reason: PythonProbeEvidenceReason): void {
    const identity = target && "pythonPath" in target ? target : target?.identity;
    const resourceKey = target && "resourceKey" in target && target.resourceKey
      ? target.resourceKey
      : identity ? probeResourceKey(identity) : "";
    if (!resourceKey) {
      this.globalEpoch += 1;
      this.entries.clear();
      this.identityLru.clear();
      return;
    }
    const state = this.resourceState(resourceKey);
    state.epoch += 1;
    this.deleteResourceEntries(resourceKey);
  }

  isMutating(identity: ProbeIdentity): boolean {
    return this.globalMutationDepth > 0 ||
      (this.resourceStates.get(probeResourceKey(identity))?.mutationDepth ?? 0) > 0;
  }

  currentEpochToken(identity: ProbeIdentity): string {
    return this.epochToken(probeResourceKey(identity));
  }

  async readOrRun<F extends ProbeFamily>(
    identity: ProbeIdentity,
    family: F,
    mode: ProbeMode,
    runRaw: () => Promise<PythonProbeRunOutput<FamilyMap[F]>>,
    options: { cycle?: PythonProbeValidationCycle } = {}
  ): Promise<PythonProbeCacheResult<FamilyMap[F]>> {
    const identityKey = probeIdentityKey(identity);
    const key = cacheKey(identity, family);
    const resourceKey = probeResourceKey(identity);
    if (!identity.pythonPath.trim() || !identityKey || !resourceKey) {
      return this.emptyResult("no-python", "none");
    }
    if (this.isMutating(identity)) {
      return this.emptyResult("mutation", "none");
    }

    if (mode === "auto") {
      const liveSet = this.livePending.get(resourceKey);
      if (liveSet?.size) return this.emptyResult("inflight-invalidated", "none");
      const cached = await this.validEntry(identity, family);
      if (cached) {
        const ageMs = Math.max(0, this.now() - cached.completedAt);
        this.touchIdentity(identityKey);
        return {
          value: clone(cached.value) as FamilyMap[F],
          evidence: evidence("cache", "valid", undefined, {
            verifiedAt: cached.verifiedAt,
            ageMs
          }),
          metrics: {
            nativeStarted: false,
            nativeDurationMs: cached.probeDurationMs,
            fingerprintDurationMs: 0,
            source: "cache"
          }
        };
      }
      const pending = this.pending.get(key);
      if (pending && pending.mode === "auto") {
        return pending.promise as Promise<PythonProbeCacheResult<FamilyMap[F]>>;
      }
    }

    const priorAuto = mode === "live" ? this.pending.get(key) : undefined;
    if (mode === "live" && priorAuto?.mode === "auto") {
      await priorAuto.promise.catch(() => undefined);
    }
    let cycle = options.cycle;
    if (mode === "live" && !cycle) cycle = this.beginValidationCycle(identity, "forced");
    if (this.isMutating(identity)) {
      return this.emptyResult("mutation", "none");
    }
    if (mode === "live" && cycle) {
      const existing = this.pending.get(key);
      if (existing && existing.mode === "live") {
        return existing.promise as Promise<PythonProbeCacheResult<FamilyMap[F]>>;
      }
    }

    const capturedToken = cycle?.token ?? this.epochToken(resourceKey);
    const run = this.execute(identity, family, runRaw, capturedToken);
    const pending: PendingProbe<FamilyMap[F]> = {
      promise: run,
      mode,
      resourceKey
    };
    this.pending.set(key, pending as PendingProbe<unknown>);
    if (mode === "live") {
      const set = this.livePending.get(resourceKey) ?? new Set<CacheKey>();
      set.add(key);
      this.livePending.set(resourceKey, set);
    }
    run.then(
      () => this.clearPending(key, mode, resourceKey),
      () => this.clearPending(key, mode, resourceKey)
    );
    return run;
  }

  async projectPrevious<T extends { probeEvidence?: PythonProbeEvidence }>(
    identity: ProbeIdentity,
    family: ProbeFamily,
    previous: T
  ): Promise<PythonProbeCacheResult<T>> {
    const entry = this.entries.get(cacheKey(identity, family));
    if (!entry) {
      return {
        value: clone(previous),
        evidence: evidence("previous", "unknown", "empty"),
        metrics: { nativeStarted: false, fingerprintDurationMs: 0, source: "previous" }
      };
    }
    const ageMs = Math.max(0, this.now() - entry.completedAt);
    const valid = entry.epochToken === this.epochToken(entry.resourceKey) && ageMs < this.ttlMs;
    return {
      value: clone(previous),
      evidence: evidence(
        "previous",
        valid ? "valid" : "expired",
        valid ? "runtime-previous" : "expired",
        { verifiedAt: entry.verifiedAt, ageMs }
      ),
      metrics: { nativeStarted: false, fingerprintDurationMs: 0, source: "previous" }
    };
  }

  projectPreviousSync<T extends { probeEvidence?: PythonProbeEvidence }>(
    identity: ProbeIdentity,
    family: ProbeFamily,
    previous: T
  ): PythonProbeCacheResult<T> {
    const entry = this.entries.get(cacheKey(identity, family));
    if (!entry) {
      return {
        value: clone(previous),
        evidence: evidence("previous", "unknown", "empty"),
        metrics: { nativeStarted: false, fingerprintDurationMs: 0, source: "previous" }
      };
    }
    const ageMs = Math.max(0, this.now() - entry.completedAt);
    const valid = entry.epochToken === this.epochToken(entry.resourceKey) && ageMs < this.ttlMs;
    return {
      value: clone(previous),
      evidence: evidence("previous", valid ? "valid" : "expired", valid ? "runtime-previous" : "expired", {
        verifiedAt: entry.verifiedAt,
        ageMs
      }),
      metrics: { nativeStarted: false, fingerprintDurationMs: 0, source: "previous" }
    };
  }

  clear(): void {
    this.entries.clear();
    this.identityLru.clear();
    this.pending.clear();
    this.livePending.clear();
    this.resourceStates.clear();
    this.globalEpoch += 1;
  }

  size(): number {
    return this.identityLru.size;
  }

  private async validEntry<F extends ProbeFamily>(
    identity: ProbeIdentity,
    family: F
  ): Promise<CacheEntry<FamilyMap[F]> | null> {
    const key = cacheKey(identity, family);
    const entry = this.entries.get(key) as CacheEntry<FamilyMap[F]> | undefined;
    if (!entry) return null;
    const ageMs = this.now() - entry.completedAt;
    if (ageMs < 0 || ageMs >= this.ttlMs) {
      this.entries.delete(key);
      this.removeIdentityIfEmpty(entry.identityKey);
      return null;
    }
    if (entry.epochToken !== this.epochToken(entry.resourceKey)) {
      this.entries.delete(key);
      this.removeIdentityIfEmpty(entry.identityKey);
      return null;
    }
    const snapshot = await this.fingerprintReader.read(identity, entry.manifest);
    if (!snapshot.cacheable || snapshot.signature !== entry.signature) {
      this.entries.delete(key);
      this.removeIdentityIfEmpty(entry.identityKey);
      return null;
    }
    if (this.isMutating(identity) || entry.epochToken !== this.epochToken(entry.resourceKey)) {
      return null;
    }
    return entry;
  }

  private async execute<F extends ProbeFamily>(
    identity: ProbeIdentity,
    family: F,
    runRaw: () => Promise<PythonProbeRunOutput<FamilyMap[F]>>,
    capturedToken: string
  ): Promise<PythonProbeCacheResult<FamilyMap[F]>> {
    const startedAt = this.now();
    const before = await this.fingerprintReader.read(identity);
    if (this.isMutating(identity)) {
      return {
        evidence: evidence("none", "mutating", "mutation"),
        metrics: {
          nativeStarted: false,
          fingerprintDurationMs: before.durationMs,
          source: "none"
        }
      };
    }
    let output: PythonProbeRunOutput<FamilyMap[F]>;
    try {
      output = await runRaw();
    } catch (error) {
      return {
        evidence: evidence("live", "failed", "probe-failed"),
        metrics: {
          nativeStarted: true,
          nativeDurationMs: Math.max(0, this.now() - startedAt),
          fingerprintDurationMs: before.durationMs,
          source: "live"
        }
      };
    }
    const after = await this.fingerprintReader.read(identity, before.manifest);
    const currentToken = this.epochToken(probeResourceKey(identity));
    const invalidated = currentToken !== capturedToken || this.isMutating(identity) ||
      (before.cacheable && after.cacheable && before.signature !== after.signature);
    const fingerprintUnavailable = !before.cacheable || !after.cacheable;
    const rawState = output.state ?? "valid";
    const verifiedAt = new Date(this.wallNow()).toISOString();
    if (output.cacheable && rawState === "valid" && !invalidated && !fingerprintUnavailable && before.manifest && after.manifest) {
      const key = cacheKey(identity, family);
      const entry: CacheEntry<FamilyMap[F]> = {
        value: clone(output.value),
        identityKey: probeIdentityKey(identity),
        family,
        resourceKey: probeResourceKey(identity),
        manifest: after.manifest,
        signature: after.signature,
        epochToken: capturedToken,
        verifiedAt,
        completedAt: this.now(),
        probeDurationMs: Math.max(0, this.now() - startedAt)
      };
      this.entries.set(key, entry as CacheEntry<unknown>);
      this.touchIdentity(entry.identityKey);
      this.evictIfNeeded();
      return {
        value: clone(output.value),
        evidence: evidence("live", "valid", undefined, { verifiedAt, ageMs: 0 }),
        metrics: {
          nativeStarted: true,
          nativeDurationMs: entry.probeDurationMs,
          fingerprintDurationMs: before.durationMs + after.durationMs,
          source: "live"
        }
      };
    }
    const state = invalidated ? "invalidated" : rawState;
    if (invalidated) this.entries.delete(cacheKey(identity, family));
    return {
      value: clone(output.value),
      evidence: evidence("live", state, invalidated ? "inflight-invalidated" : output.reason ?? (state === "failed" ? "probe-failed" : "uncacheable"), {
        verifiedAt
      }),
      metrics: {
        nativeStarted: true,
        nativeDurationMs: Math.max(0, this.now() - startedAt),
        fingerprintDurationMs: before.durationMs + after.durationMs,
        source: "live"
      }
    };
  }

  private emptyResult<F extends ProbeFamily>(
    reason: PythonProbeEvidenceReason,
    source: PythonProbeEvidence["source"]
  ): PythonProbeCacheResult<FamilyMap[F]> {
    return {
      evidence: evidence(source, reason === "mutation" ? "mutating" : "unknown", reason),
      metrics: { nativeStarted: false, fingerprintDurationMs: 0, source }
    };
  }

  private resourceState(resourceKey: string): ResourceState {
    const current = this.resourceStates.get(resourceKey);
    if (current) return current;
    const created = { epoch: 0, mutationDepth: 0 };
    this.resourceStates.set(resourceKey, created);
    return created;
  }

  private epochToken(resourceKey: string): string {
    return `${this.globalEpoch}:${this.resourceState(resourceKey).epoch}`;
  }

  private finishMutation(resourceKey: string, global: boolean): () => void {
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      if (global) {
        this.globalMutationDepth = Math.max(0, this.globalMutationDepth - 1);
      } else {
        const state = this.resourceStates.get(resourceKey);
        if (state) state.mutationDepth = Math.max(0, state.mutationDepth - 1);
      }
    };
  }

  private deleteResourceEntries(resourceKey: string): void {
    for (const [key, entry] of this.entries) {
      if (entry.resourceKey === resourceKey) this.entries.delete(key);
    }
    for (const identityKey of [...this.identityLru.keys()]) this.removeIdentityIfEmpty(identityKey);
  }

  private touchIdentity(identityKey: string): void {
    this.identityLru.delete(identityKey);
    this.identityLru.set(identityKey, ++this.sequence);
  }

  private removeIdentityIfEmpty(identityKey: string): void {
    if (![...this.entries.values()].some((entry) => entry.identityKey === identityKey)) {
      this.identityLru.delete(identityKey);
    }
  }

  private evictIfNeeded(): void {
    while (this.identityLru.size > this.maxIdentities) {
      const oldest = this.identityLru.keys().next().value;
      if (typeof oldest !== "string") return;
      for (const [key, entry] of this.entries) {
        if (entry.identityKey === oldest) this.entries.delete(key);
      }
      this.identityLru.delete(oldest);
    }
  }

  private clearPending(key: CacheKey, mode: ProbeMode, resourceKey: string): void {
    const current = this.pending.get(key);
    if (current?.mode === mode) this.pending.delete(key);
    if (mode === "live") {
      const set = this.livePending.get(resourceKey);
      set?.delete(key);
      if (set && set.size === 0) this.livePending.delete(resourceKey);
    }
  }
}

export const pythonProbeCache = new PythonProbeCache();
