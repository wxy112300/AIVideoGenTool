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
}

/** IQ3_XXS arena size and low-RAM split follow pinned Strata setup.py (0.1.44.1).
 * These are admission estimates, NOT a hard CUDA allocation cap. Keep cache=auto.
 * Reserve additionally covers the GPU image encoder, WDDM reporting error and workspace.
 */
export function planStrataResources(resources: StrataResources, requestedReserveMiB: number): StrataResourcePlan {
  const { memoryAvailableBytes: ram, commitAvailableBytes: commit, vramAvailableBytes: free, vramTotalBytes: total } = resources;
  if (![ram, commit, free, total, requestedReserveMiB].every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0)
    || !total || free! > total) throw new Error("无法确认 Strata 的可用 RAM、Windows 提交余量或显存，未加载模型。请重新检查资源。");
  const available = ram;
  const reserve = Math.max(5120, Math.ceil(requestedReserveMiB));
  // Dense/native weights, MTP, KV and prefill staging are budgeted separately from reserve.
  const minimumFreeVramBytes = (reserve / 1024 + 15) * GiB;
  if (free! < minimumFreeVramBytes) throw new Error(`Strata 安全加载需要约 ${(minimumFreeVramBytes / GiB).toFixed(1)}GiB 空闲显存，目前 ${(free! / GiB).toFixed(1)}GiB；未加载模型。请释放其他 GPU 程序后重试。`);
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
  const requiredCommitBytes = requiredMemoryBytes + total;
  if (commit! < requiredCommitBytes) throw new Error(`Strata Windows 加载预计需要约 ${(requiredMemoryBytes / GiB).toFixed(1)}GiB 可用 RAM、${(requiredCommitBytes / GiB).toFixed(1)}GiB 提交余量（含 CUDA 加载预留），目前提交余量 ${(commit! / GiB).toFixed(1)}GiB；未加载模型。请释放程序占用，或检查系统分页文件容量后重试；应用不会修改系统设置。`);
  return { hostMode, vramReserveMiB: reserve, requiredMemoryBytes, requiredCommitBytes, availableMemoryBytes: available, minimumFreeVramBytes, headroomGiB };
}

/** Last-resort early stop in addition to admission and auto-cache reserve, not an OOM guarantee. */
export function strataResourcePressure(resources: StrataResources): string | null {
  if (![resources.vramAvailableBytes, resources.commitAvailableBytes, resources.memoryAvailableBytes].every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0)) return "Strata 资源监测不可用，已中止自有模型以保护资源。";
  if (resources.vramAvailableBytes! < 2 * GiB) return "Strata 空闲显存低于 2GiB 安全线，已中止自有模型。";
  if (Math.min(resources.memoryAvailableBytes, resources.commitAvailableBytes!) < 3 * GiB) return "Strata 可用内存或提交余量低于 3GiB 安全线，已中止自有模型。";
  return null;
}
