import { STRATA_Q4_MODEL, STRATA_Q4_MODEL_ID } from "./catalog/models/strata.js";
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
}

/** IQ3_XXS arena size and low-RAM split follow pinned Strata setup.py (0.1.44.1).
 * These are admission estimates, NOT a hard CUDA allocation cap. Keep cache=auto.
 * Reserve additionally covers the GPU image encoder, WDDM reporting error and workspace.
 */
export function planStrataResources(resources: StrataResources, requestedReserveMiB: number,
  options: { commitTrial?: boolean; allowFileReadFallback?: boolean; modelId?: string; contextTokens?: number } = {}): StrataResourcePlan {
  const { memoryAvailableBytes: ram, commitAvailableBytes: commit, vramAvailableBytes: free, vramTotalBytes: total } = resources;
  if (![ram, commit, free, total, requestedReserveMiB].every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0)
    || !total || free! > total) throw new Error("无法确认 Strata 的可用 RAM、Windows 提交余量或显存，未加载模型。请重新检查资源。");
  const available = ram;
  const reserve = Math.max(5120, Math.ceil(requestedReserveMiB));
  // Dense/native weights, MTP, KV and prefill staging are budgeted separately from reserve.
  const minimumFreeVramBytes = (reserve / 1024 + 15) * GiB;
  if (free! < minimumFreeVramBytes) throw new Error(`Strata 安全加载需要约 ${(minimumFreeVramBytes / GiB).toFixed(1)}GiB 空闲显存，目前 ${(free! / GiB).toFixed(1)}GiB；未加载模型。请释放其他 GPU 程序后重试。`);
  if (options.modelId === STRATA_Q4_MODEL_ID) {
    const context = options.contextTokens ?? 32768;
    if (!Number.isSafeInteger(context) || context < 1024 || context > 262144) throw new Error("Q4 上下文预算无效。");
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
    if (!options.allowFileReadFallback || budget < 16) throw new Error("Strata Q4 可用内存或 Windows 提交余量不足，无法在保留安全余量时分配专家预算；未加载模型。");
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
  const hostMode = available >= full ? "arena" : "resident";
  const requiredMemoryBytes = hostMode === "arena" ? full : complement;
  if (available < requiredMemoryBytes) throw new Error(`Strata 完整专家驻留预计需要约 ${(requiredMemoryBytes / GiB).toFixed(1)}GiB 可用内存与提交余量，目前只有 ${(available / GiB).toFixed(1)}GiB；未加载模型。请释放内存后重试，不会静默改用文件回读。`);
  // Windows CUDA/WDDM loading also consumes commit independently of physical RAM.
  // Measured on 4090: ~19GiB commit disappeared before the RAM complement allocation.
  // Budget one adapter's capacity rather than assuming free RAM == free commit.
  const estimatedCommitBytes = requiredMemoryBytes + total;
  // Explicit Agent validation only: measure WDDM overhead instead of treating the
  // entire adapter capacity as an observed allocation. RAM/VRAM and live floors remain.
  // The Agent accepts upstream's bounded file tier instead of demanding the full
  // complement allocation. Real 32K/64K/128K/262144 runs on this 24GiB Windows
  // adapter retained >=7.9GiB commit; native auto-cache/file-tier selects its own
  // bounded complement. Retain a 42GiB admission estimate for explicit file-tier
  // launches, including H3 after user-authorized adoption. Arena stays strict.
  const fallbackCommitBytes = Math.max(requiredMemoryBytes, total + 18 * GiB);
  const requiredCommitBytes = options.commitTrial ? requiredMemoryBytes
    : options.allowFileReadFallback && hostMode === "resident" ? fallbackCommitBytes : estimatedCommitBytes;
  if (commit! < requiredCommitBytes) throw new Error(`Strata Windows 加载预计需要约 ${(requiredMemoryBytes / GiB).toFixed(1)}GiB 可用 RAM、${(requiredCommitBytes / GiB).toFixed(1)}GiB 提交余量（含 CUDA 加载预留），目前提交余量 ${(commit! / GiB).toFixed(1)}GiB；未加载模型。请释放程序占用，或检查系统分页文件容量后重试；应用不会修改系统设置。`);
  return { hostMode, vramReserveMiB: reserve, requiredMemoryBytes, requiredCommitBytes, availableMemoryBytes: available, minimumFreeVramBytes, headroomGiB,
    ...(options.commitTrial ? { commitTrial: true, estimatedCommitBytes } : {}) };
}

/** Apply only a session overlay; base pack/config identity remains unchanged. */
export function applyStrataResourcePlan(args: string[], plan: StrataResourcePlan, modelId: string): string[] {
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

/** A known dangerous metric wins even if a different sensor is temporarily unavailable. */
export function knownStrataResourcePressure(resources: StrataResources): string | null {
  const valid = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
  if (valid(resources.vramAvailableBytes) && resources.vramAvailableBytes < 2 * GiB) return "Strata 空闲显存低于 2GiB 安全线，已中止自有模型。";
  if ([resources.memoryAvailableBytes, resources.commitAvailableBytes].some((v) => valid(v) && v < 3 * GiB))
    return "Strata 可用内存或提交余量低于 3GiB 安全线，已中止自有模型。";
  return null;
}

export function strataResourcePressure(resources: StrataResources): string | null {
  return knownStrataResourcePressure(resources) ?? (missingStrataResourceMetrics(resources).length
    ? "Strata 资源监测不可用，已中止自有模型以保护资源。" : null);
}
