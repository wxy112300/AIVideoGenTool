import path from "node:path";
import type { AppState, Settings } from "../../src/types.js";
import { exportLibrary } from "../../src/infrastructure/nas-exporter.js";
import { publishNasCommit } from "../../src/infrastructure/nas-commit.js";

/** Coalesces only committed snapshots. Failure keeps the published pointer and retries later. */
export class NasPublisher {
  private pending?: AppState;
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private stopped = false;
  private relocationPaused = false;
  private lastKey = "";
  constructor(private options: { stateFile: string; coversDirectory: string; resolveOutputRoot(settings: Settings): Promise<string>; onError(error: unknown): void; delayMs?: number }) {}

  schedule(state: AppState): void {
    if (this.stopped) return;
    if (!state.libraryStorage) { this.pending = undefined; this.lastKey = ""; return; }
    const key = JSON.stringify([state.libraryStorage, state.settings.outputDirectory, state.settings.uiLocale]);
    if (key === this.lastKey && !this.pending) return;
    this.pending = structuredClone(state);
    if (this.timer || this.running || this.relocationPaused) return;
    this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, this.options.delayMs ?? 1500);
    this.timer.unref();
  }

  async flush(): Promise<void> {
    if (this.running) return this.running;
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    this.running = (async () => {
      while (this.pending) {
        const state = this.pending; this.pending = undefined;
        try {
          const root = state.libraryStorage!.directory, libraryId = state.libraryStorage!.libraryId;
          const outputRoot = await this.options.resolveOutputRoot(state.settings);
          if (!path.isAbsolute(root) || !path.isAbsolute(outputRoot)) throw new Error("NAS publishing requires absolute library and media roots");
          await exportLibrary({ stateFile: this.options.stateFile, outputRoot, libraryRoot: root, libraryDirectory: `StudioLibrary/${libraryId}`, coversDirectory: this.options.coversDirectory }, state,
            (target, catalog) => publishNasCommit(target, catalog, libraryId, new Map(state.history.map(asset => [asset.id, new Set(asset.versions.map(version => version.id))]))));
          this.lastKey = JSON.stringify([state.libraryStorage, state.settings.outputDirectory, state.settings.uiLocale]);
        } catch (error) {
          try { this.options.onError(error); } catch { /* Diagnostics cannot discard the retry snapshot. */ }
          this.pending ??= state;
          break;
        }
      }
    })().finally(() => {
      this.running = undefined;
      if (this.pending && !this.stopped && !this.relocationPaused) {
        this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, 30_000);
        this.timer.unref();
      }
    });
    return this.running;
  }

  async prepareLibraryMove(): Promise<() => void> {
    this.relocationPaused = true;
    await this.flush();
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    return () => {
      this.relocationPaused = false;
      if (this.pending && !this.stopped) this.schedule(this.pending);
    };
  }

  async close(): Promise<void> {
    this.stopped = true;
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    if (!this.relocationPaused) await this.flush();
  }
}
