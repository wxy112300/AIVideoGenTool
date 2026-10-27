import type { EnvironmentScanProgress } from "../../src/types.js";

/** Share real scan checkpoints with callers that join an already-running scan. */
export class EnvironmentScanProgressHub {
  private readonly listeners = new Map<string, Set<(progress: EnvironmentScanProgress) => void>>();
  private readonly latest = new Map<string, EnvironmentScanProgress>();

  subscribe(key: string, listener: (progress: EnvironmentScanProgress) => void): () => void {
    const listeners = this.listeners.get(key) ?? new Set();
    listeners.add(listener);
    this.listeners.set(key, listeners);
    const latest = this.latest.get(key);
    if (latest) { try { listener({ ...latest }); } catch { /* Observers do not own the scan. */ } }
    return () => {
      listeners.delete(listener);
      if (!listeners.size) { this.listeners.delete(key); this.latest.delete(key); }
    };
  }

  publish(key: string, progress: EnvironmentScanProgress): void {
    const listeners = this.listeners.get(key);
    if (!listeners) return;
    this.latest.set(key, { ...progress });
    for (const listener of listeners) {
      try { listener({ ...progress }); } catch { /* A closed window must not fail a scan. */ }
    }
  }
}
