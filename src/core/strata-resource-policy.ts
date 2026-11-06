import { createTranslator } from "./i18n.js";
import type { Translate } from "./i18n.js";
import { uiKeys } from "./i18n-keys.js";
import { STRATA_Q4_MODEL, STRATA_Q4_MODEL_ID } from "./catalog/models/strata.js";
import { isStrataDeepSeek } from "./catalog/models/strata-deepseek.js";
const GiB = 1024 ** 3;
export interface StrataResources {
  memoryAvailableBytes: number;
  commitAvailableBytes: number | null;
  vramAvailableBytes: number | null;
  vramTotalBytes: number | null;
}
export interface StrataResourcePlan {
  hostMode: "arena" | "resident";
  vramReserveMiB: number;
  requiredMemoryBytes: number;
  requiredCommitBytes: number;
  availableMemoryBytes: number;
  minimumFreeVramBytes: number;
  headroomGiB: number;
  estimatedCommitBytes?: number;
  commitTrial?: boolean;
  residentBudgetGiB?: number;
  /** Performance target, not the admission floor when native file readback is allowed. */
  estimatedResidentMemoryBytes?: number;
}

/** IQ3_XXS arena size and low-RAM split follow pinned Strata setup.py (0.1.44.1).
 * These are admission estimates, NOT a hard CUDA allocation cap. Keep cache=auto.
 * Reserve additionally covers the GPU image encoder, WDDM reporting error and workspace.
 */
export function planStrataResources(resources: StrataResources, requestedReserveMiB: number,
  options: { commitTrial?: boolean; allowFileReadFallback?: boolean; modelId?: string; contextTokens?: number } = {}, t: Translate = createTranslator().t): StrataResourcePlan {
  const { memoryAvailableBytes: ram, commitAvailableBytes: commit, vramAvailableBytes: free, vramTotalBytes: total } = resources;
  if (![ram, commit, free, total, requestedReserveMiB].every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0)
    || !total || free! > total) throw new Error(t(uiKeys.strataCore.metricsUnknown));
  const available = ram;
  const reserve = Math.max(5120, Math.ceil(requestedReserveMiB));
  if (isStrataDeepSeek(options.modelId ?? "")) {
    const context = options.contextTokens ?? 32768;
    if (!Number.isSafeInteger(context) || context < 8192 || context > 32768) throw new Error(t(uiKeys.strataService.invalidContext));
    // Separate from Qwen's 42.9GB arena: bound DeepSeek's host expert store
    // against BOTH fresh RAM and Windows commit, reserving WDDM + host headroom.
    const headroomGiB = 8, minimumFreeVramBytes = (reserve / 1024 + 10) * GiB;
    if (free! < minimumFreeVramBytes) throw new Error(t(uiKeys.strataCore.vram, { required: (minimumFreeVramBytes / GiB).toFixed(1), available: (free! / GiB).toFixed(1) }));
    const budget = Math.floor(Math.min(138.24e9, ram - headroomGiB * GiB, commit! - total - headroomGiB * GiB) / GiB);
    if (budget < 8) throw new Error(t(uiKeys.strataCore.fileReadMemory, { required: 16, available: (Math.min(ram, commit! - total) / GiB).toFixed(1) }));
    return { hostMode: "resident", residentBudgetGiB: budget, vramReserveMiB: reserve,
      requiredMemoryBytes: (budget + headroomGiB) * GiB, requiredCommitBytes: (budget + headroomGiB) * GiB + total,
      availableMemoryBytes: ram, minimumFreeVramBytes, headroomGiB };
  }
  // Dense/native weights, MTP, KV and prefill staging are budgeted separately from reserve.
  const minimumFreeVramBytes = (reserve / 1024 + 15) * GiB;
  if (free! < minimumFreeVramBytes) throw new Error(t(uiKeys.strataCore.vram, { required: (minimumFreeVramBytes / GiB).toFixed(1), available: (free! / GiB).toFixed(1) }));
  if (options.modelId === STRATA_Q4_MODEL_ID) {
    const context = options.contextTokens ?? 32768;
    if (!Number.isSafeInteger(context) || context < 1024 || context > 262144) throw new Error(t(uiKeys.strataCore.q4Context));
    // Larger Agent contexts use upstream KV streaming; count its host allocation
    // before sizing experts. Available memory already excludes other processes.
    const kvBytes = context >= 65536 ? context * 13.7 * 1024 : 0;
    const headroomGiB = 10;
    const full = STRATA_Q4_MODEL.expertBytes + headroomGiB * GiB + kvBytes;
    if (ram >= full && commit! >= full + total) return { hostMode: "arena", vramReserveMiB: reserve,
      requiredMemoryBytes: full, requiredCommitBytes: full + total, availableMemoryBytes: ram,
      minimumFreeVramBytes, headroomGiB };
    // Unlike native IQ packs, Q4 uses the official bounded mapped-expert tier.
    // Never borrow IQ3's measured 42GiB commit exception or bypass Q4 commit.
    const budget = Math.floor(Math.min(STRATA_Q4_MODEL.expertBytes,
      ram - 16 * GiB - kvBytes, commit! - total - 16 * GiB - kvBytes) / GiB);
    if (!options.allowFileReadFallback || budget < 16) throw new Error(t(uiKeys.strataCore.q4Memory));
    const requiredMemoryBytes = (budget + 12) * GiB + kvBytes;
    return { hostMode: "resident", residentBudgetGiB: budget, vramReserveMiB: reserve,
      requiredMemoryBytes, requiredCommitBytes: requiredMemoryBytes + total,
      availableMemoryBytes: ram, minimumFreeVramBytes, headroomGiB };
  }
  // Available RAM already excludes the OS/other apps: upstream's native 4GiB
  // resident headroom plus 2GiB for our server/vision and admission-to-load drift.
  const arena = 42.9e9, headroomGiB = 6;
  const full = arena + headroomGiB * GiB;
  // Conservative lower estimate of cache capacity, not an explicit expert slot count.
  const cache = Math.max(0, free! - (6 + reserve / 1024) * GiB);
  const complement = Math.max(0, arena - cache) + headroomGiB * GiB;
  const hostMode = available >= full && (!options.allowFileReadFallback || options.commitTrial || commit! >= full + total) ? "arena" : "resident";
  const estimatedResidentMemoryBytes = hostMode === "arena" ? full : complement;
  const fileReadAllowed = options.allowFileReadFallback === true && !options.commitTrial && hostMode === "resident";
  // --resident-experts is upstream's soft mode: it checks the whole complement before
  // allocating, then keeps only what fits after its headroom and reads misses from disk.
  // Use the configured engine headroom, not a full-complement or adapter-sized
  // hard gate. Upstream #403/#467 clamps residency and falls back to mapped files.
  // The larger estimates below are diagnostics, not an allocation/peak guarantee.
  const requiredMemoryBytes = fileReadAllowed ? headroomGiB * GiB : estimatedResidentMemoryBytes;
  if (available < requiredMemoryBytes) throw new Error(fileReadAllowed
    ? t(uiKeys.strataCore.fileReadMemory, { required: (requiredMemoryBytes / GiB).toFixed(1), available: (available / GiB).toFixed(1) })
    : t(uiKeys.strataCore.fullMemory, { required: (requiredMemoryBytes / GiB).toFixed(1), available: (available / GiB).toFixed(1) }));
  // Windows CUDA/WDDM loading also consumes commit independently of physical RAM.
  // Measured on 4090: ~19GiB commit disappeared before the RAM complement allocation.
  // Budget one adapter's capacity rather than assuming free RAM == free commit.
  const estimatedCommitBytes = estimatedResidentMemoryBytes + total;
  // Explicit Agent validation only: measure WDDM overhead instead of treating the
  // entire adapter capacity as an observed allocation. RAM/VRAM and live floors remain.
  const requiredCommitBytes = options.commitTrial ? requiredMemoryBytes
    : fileReadAllowed ? headroomGiB * GiB : estimatedCommitBytes;
  if (commit! < requiredCommitBytes) throw new Error(t(uiKeys.strataCore.commit, { ram: (requiredMemoryBytes / GiB).toFixed(1), commit: (requiredCommitBytes / GiB).toFixed(1), available: (commit! / GiB).toFixed(1) }));
  return { hostMode, vramReserveMiB: reserve, requiredMemoryBytes, requiredCommitBytes, availableMemoryBytes: available, minimumFreeVramBytes, headroomGiB,
    estimatedResidentMemoryBytes, estimatedCommitBytes,
    ...(options.commitTrial ? { commitTrial: true } : {}) };
}

/** Apply only a session overlay; base pack/config identity remains unchanged. */
export function applyStrataResourcePlan(args: string[], plan: StrataResourcePlan, modelId: string): string[] {
  if (isStrataDeepSeek(modelId)) {
    const result = args.filter((arg, index) => arg !== "--ssd-cache" && args[index - 1] !== "--ssd-cache");
    if (plan.residentBudgetGiB === undefined) throw new Error("DeepSeek: missing host cache budget");
    result.push("--ssd-cache", String(plan.residentBudgetGiB));
    return result;
  }
  const result = args.filter((arg, index) => arg !== "--resident-budget-gib" && args[index - 1] !== "--resident-budget-gib"
    && !(arg === "--resident-experts" && (plan.hostMode === "arena" || modelId === STRATA_Q4_MODEL_ID))
    && !(arg === "--mmap-experts" && modelId === STRATA_Q4_MODEL_ID));
  if (plan.residentBudgetGiB !== undefined) result.push("--resident-budget-gib", String(plan.residentBudgetGiB));
  return result;
}

/** Last-resort early stop in addition to admission and auto-cache reserve, not an OOM guarantee. */
export function missingStrataResourceMetrics(resources: StrataResources): string[] {
  return (["vramAvailableBytes", "commitAvailableBytes", "memoryAvailableBytes"] as const)
    .filter((key) => { const value = resources[key]; return typeof value !== "number" || !Number.isFinite(value) || value < 0; });
}

/** Stateless GPU guard. Host pressure needs the shared warning/debounce policy,
 * never an immediate RAM/commit kill from a single reading. */
export function knownStrataResourcePressure(resources: StrataResources, t: Translate = createTranslator().t): string | null {
  const valid = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
  if (valid(resources.vramAvailableBytes) && resources.vramAvailableBytes < 2 * GiB) return t(uiKeys.strataCore.gpuFloor);
  return null;
}

export function strataResourcePressure(resources: StrataResources, t: Translate = createTranslator().t): string | null {
  return knownStrataResourcePressure(resources, t) ?? (missingStrataResourceMetrics(resources).length
    ? t(uiKeys.strataCore.metricsLost) : null);
}
