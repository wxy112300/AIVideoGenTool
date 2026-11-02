import type { BrowseLibraryInfo } from "../core/lan-browser";

/** One check at a time; a manual scan requested during polling still reaches disk. */
export class LibraryRefresh {
  private pending: Promise<void> | null = null;
  private forced = false;
  constructor(private revision: string, private deps: {
    info(force: boolean): Promise<BrowseLibraryInfo>;
    load(): Promise<boolean>;
    accept(info: BrowseLibraryInfo): void;
    failed(syncPending: boolean): void;
    canRefresh(): boolean;
  }) {}
  check(force = false): Promise<void> {
    if (!force && !this.deps.canRefresh()) return Promise.resolve();
    if (this.pending) { this.forced ||= force; return this.pending; }
    const run = async () => {
      let scan = force;
      do {
        this.forced = false;
        try {
          const next = await this.deps.info(scan);
          // A dialog/player may have opened while the request was in flight.
          if ((scan || this.deps.canRefresh()) && (scan || next.revision !== this.revision)) {
            if (await this.deps.load()) { this.revision = next.revision; this.deps.accept(next); }
          }
          if (scan && next.refreshError) this.deps.failed(true);
        } catch { if (scan) this.deps.failed(false); }
        scan = this.forced;
      } while (scan);
    };
    this.pending = run().finally(() => { this.pending = null; });
    return this.pending;
  }
}
