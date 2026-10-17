import { knownStrataResourcePressure, missingStrataResourceMetrics, strataResourcePressure, type StrataResources } from "./strata-resource-policy.js";
const GiB = 1024 ** 3;

/** A per-model phase policy, never a substitute for admission or fresh telemetry.
 * File-backed source/cache can temporarily occupy RAM without exhausting commit.
 * Only explicitly allowed loading or a confirmed native file tier gets this exception.
 */
export class FileReadResourcePressure {
  private loading = false;
  private fileRead = false;
  private lowSince: number | null = null;
  constructor(private readonly now = Date.now, private readonly minimumRamGiB = 2) {}
  setLoading(value: boolean) { this.loading = value; this.lowSince = null; }
  setFileRead(value: boolean) { this.fileRead = value; this.lowSince = null; }
  /** Partial readings must retry unless an actually known, mode-specific hard limit is crossed. */
  knownPressure(resources: StrataResources): string | null {
    if (!this.loading && !this.fileRead) return knownStrataResourcePressure(resources);
    if (!missingStrataResourceMetrics(resources).length) return this.check(resources);
    const valid = (v: number | null) => typeof v === "number" && Number.isFinite(v) && v >= 0;
    if ((valid(resources.vramAvailableBytes) && resources.vramAvailableBytes! < 2 * GiB)
      || (valid(resources.commitAvailableBytes) && resources.commitAvailableBytes! < 3 * GiB)
      || (valid(resources.memoryAvailableBytes) && resources.memoryAvailableBytes < this.minimumRamGiB * GiB)
      || (valid(resources.memoryAvailableBytes) && resources.memoryAvailableBytes < 3 * GiB
        && valid(resources.commitAvailableBytes) && resources.commitAvailableBytes! < 6 * GiB)) return knownStrataResourcePressure(resources);
    return null;
  }
  check(resources: StrataResources): string | null {
    const reason = strataResourcePressure(resources);
    if (!reason || (!this.loading && !this.fileRead)) { this.lowSince = null; return reason; }
    if (missingStrataResourceMetrics(resources).length || resources.memoryAvailableBytes < this.minimumRamGiB * GiB
      || resources.commitAvailableBytes! < 6 * GiB || resources.vramAvailableBytes! < 2 * GiB) return reason;
    if (this.fileRead) return null;
    this.lowSince ??= this.now();
    return this.now() - this.lowSince < 30000 ? null : reason;
  }
}
