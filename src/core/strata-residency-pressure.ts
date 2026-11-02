import { createTranslator } from "./i18n.js";
import type { Translate } from "./i18n.js";
import { uiKeys } from "./i18n-keys.js";
import { knownStrataResourcePressure, missingStrataResourceMetrics, type StrataResources } from "./strata-resource-policy.js";
const GiB = 1024 ** 3;

export interface StrataHostPressureDiagnostic {
  event: "warning" | "recovered" | "critical";
  loading: boolean; fileRead: boolean; elapsedMs: number;
  memoryAvailableBytes: number; commitAvailableBytes: number | null; vramAvailableBytes: number | null;
}

/** Windows mapped source pages can make Available RAM briefly approach zero (#1571).
 * 3GiB RAM / 6GiB commit are observations, NOT kill thresholds. Let the engine and
 * OS manage the file tier; retain the GPU guard and a debounced last-resort commit
 * guard (512MiB for 10s). The latter is an app emergency policy, not an upstream
 * minimum or a guarantee against allocation failures. Missing telemetry still retries.
 */
export class FileReadResourcePressure {
  private loading = false;
  private fileRead = false;
  private lowSince: number | null = null;
  private warningAt: number | null = null;
  private sampledAt: number | null = null;
  constructor(private readonly now = Date.now, private readonly onDiagnostic?: (event: StrataHostPressureDiagnostic) => void, private readonly t: Translate = createTranslator().t) {}
  setLoading(value: boolean) { this.loading = value; this.lowSince = null; }
  setFileRead(value: boolean) { this.fileRead = value; this.lowSince = null; }
  /** Do not advance host-pressure timers during probe retries or on partial samples. */
  knownPressure(resources: StrataResources): string | null {
    if (missingStrataResourceMetrics(resources).length) { this.lowSince = null; this.sampledAt = null; }
    if (typeof resources.vramAvailableBytes === "number" && Number.isFinite(resources.vramAvailableBytes)
      && resources.vramAvailableBytes >= 0 && resources.vramAvailableBytes < 2 * GiB) return knownStrataResourcePressure(resources, this.t);
    return null;
  }
  check(resources: StrataResources): string | null {
    const gpu = this.knownPressure(resources);
    if (gpu) return gpu;
    if (missingStrataResourceMetrics(resources).length) {
      this.lowSince = null; // Unknown readings cannot prove continuous pressure.
      this.sampledAt = null;
      return this.t(uiKeys.strataCore.probeUnavailable);
    }
    const now = this.now(), warning = resources.memoryAvailableBytes < 3 * GiB || resources.commitAvailableBytes! < 6 * GiB;
    if (this.sampledAt !== null && now - this.sampledAt > 5000) this.lowSince = null;
    this.sampledAt = now;
    const emit = (event: StrataHostPressureDiagnostic["event"], elapsedMs = 0) => {
      try { this.onDiagnostic?.({ event, loading: this.loading, fileRead: this.fileRead, elapsedMs,
        memoryAvailableBytes: resources.memoryAvailableBytes, commitAvailableBytes: resources.commitAvailableBytes, vramAvailableBytes: resources.vramAvailableBytes }); } catch { /* Observer only. */ }
    };
    if (warning && (this.warningAt === null || now - this.warningAt >= 30000)) { emit("warning"); this.warningAt = now; }
    else if (!warning && this.warningAt !== null) { emit("recovered"); this.warningAt = null; }
    if (resources.commitAvailableBytes! >= 0.5 * GiB) { this.lowSince = null; return null; }
    this.lowSince ??= now;
    const elapsed = now - this.lowSince;
    if (elapsed < 10000) return null;
    emit("critical", elapsed);
    return this.t(uiKeys.strataCore.commitCritical, { seconds: Math.floor(elapsed / 1000), commit: (resources.commitAvailableBytes! / GiB).toFixed(2), ram: (resources.memoryAvailableBytes / GiB).toFixed(2) });
  }
}
