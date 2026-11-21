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
 * Cache estimates guide the session configuration, not a minimum GPU requirement. Keep cache=auto.
 * Reserve additionally covers the GPU image encoder, WDDM reporting error and workspace.
 */
export function planStrataResources(resources: StrataResources, requestedReserveMiB: number,
  options: { commitTrial?: boolean; allowFileReadFallback?: boolean; modelId?: string; contextTokens?: number; accountForOccupiedVram?: boolean; nativeFileReadAdmission?: boolean } = {}, t: Translate = createTranslator().t): StrataResourcePlan {
  const { memoryAvailableBytes: ram, commitAvailableBytes: commit, vramAvailableBytes: free, vramTotalBytes: total } = resources;
  if (![ram, commit, free, total, requestedReserveMiB].every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0)
    || !total || free! > total) throw new Error(t(uiKeys.strataCore.metricsUnknown));
  const available = ram;
  const reserve = isStrataDeepSeek(options.modelId ?? "") ? Math.ceil(requestedReserveMiB) : Math.max(5120, Math.ceil(requestedReserveMiB));
  if (isStrataDeepSeek(options.modelId ?? "")) {
    const context = options.contextTokens ?? 32768;
    if (!Number.isSafeInteger(context) || context < 8192 || context > 32768) throw new Error(t(uiKeys.strataService.invalidContext));
    // Separate from Qwen's 42.9GB arena: bound DeepSeek's host expert store
    // against BOTH fresh RAM and Windows commit, reserving WDDM + host headroom.
    const headroomGiB = 8, minimumFreeVramBytes = 0;
    // Cache capacity and headroom are performance choices, not minimum hardware
    // requirements. With no cache budget, let the native mapped-file lane try.
    const budget = Math.max(0, Math.floor(Math.min(138.24e9, ram - headroomGiB * GiB, commit! - total - headroomGiB * GiB) / GiB));
    // WDDM's CUDA free-memory view can omit other processes' residency. Keep
    // the desired adapter headroom using the freshly measured global occupancy.
    // This reduces the expert cache, not the admission floor or other programs.
    const occupiedMiB = options.accountForOccupiedVram ? Math.ceil((total - free!) / 1024 ** 2) : 0;
    return { hostMode: "resident", residentBudgetGiB: budget, vramReserveMiB: reserve + occupiedMiB,
      requiredMemoryBytes: 0, requiredCommitBytes: 0,
      availableMemoryBytes: ram, minimumFreeVramBytes, headroomGiB };
  }
  // The engine sizes its automatic cache from actual CUDA availability. A fixed
  // dense+workspace estimate is not proof that a smaller cache cannot run.
  // Preserve the reserve, real allocation errors and cancellation instead.
  const minimumFreeVramBytes = 0;
  // WDDM's CUDA view can omit other applications' residency. Reduce our own
  // automatic cache through a session reserve; do not terminate those programs.
  const sessionReserve = reserve + (options.accountForOccupiedVram ? Math.ceil((total - free!) / 1024 ** 2) : 0);
  if (options.modelId === STRATA_Q4_MODEL_ID) {
    const context = options.contextTokens ?? 32768;
    if (!Number.isSafeInteger(context) || context < 1024 || context > 262144) throw new Error(t(uiKeys.strataCore.q4Context));
    // Larger Agent contexts use upstream KV streaming; count its host allocation
    // before sizing experts. Available memory already excludes other processes.
    const kvBytes = context >= 65536 ? context * 13.7 * 1024 : 0;
    const headroomGiB = 10;
    const full = STRATA_Q4_MODEL.expertBytes + headroomGiB * GiB + kvBytes;
    if (ram >= full && commit! >= full + total) return { hostMode: "arena", vramReserveMiB: sessionReserve,
      requiredMemoryBytes: full, requiredCommitBytes: full + total, availableMemoryBytes: ram,
      minimumFreeVramBytes, headroomGiB };
    // Unlike native IQ packs, Q4 uses the official bounded mapped-expert tier.
    // Never borrow IQ3's measured 42GiB commit exception or bypass Q4 commit.
    const budget = Math.floor(Math.min(STRATA_Q4_MODEL.expertBytes,
      ram - 16 * GiB - kvBytes, commit! - total - 16 * GiB - kvBytes) / GiB);
    if (!options.allowFileReadFallback || budget < 16) throw new Error(t(uiKeys.strataCore.q4Memory));
    const requiredMemoryBytes = (budget + 12) * GiB + kvBytes;
    return { hostMode: "resident", residentBudgetGiB: budget, vramReserveMiB: sessionReserve,
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
  // The resident target controls how much the engine keeps in RAM. Native
  // file readback can start with the upstream 4 GiB host allowance and read
  // misses from disk even when the separate resident target is 6 GiB.
  const fileReadMemoryGiB = options.nativeFileReadAdmission ? 4 : headroomGiB;
  const requiredMemoryBytes = fileReadAllowed ? fileReadMemoryGiB * GiB : estimatedResidentMemoryBytes;
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
  return { hostMode, vramReserveMiB: sessionReserve, requiredMemoryBytes, requiredCommitBytes, availableMemoryBytes: available, minimumFreeVramBytes, headroomGiB,
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
