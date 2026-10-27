import { promises as fs } from "node:fs";
import path from "node:path";
import type { AppState } from "../../src/types.js";
import { LibraryRecordStore, canonical, type LibraryPointer } from "./library-record-store.js";
import { acquireLibraryLease, durableCandidate, readOptionalFile, stateDigest, StateRecoveryError } from "./state-file-safety.js";
import type { LibraryStorageProgress } from "../../src/core/library-storage-progress.js";
import { normalizeAppearance } from "../../src/core/appearance.js";
import { normalizeUiLocale } from "../../src/core/i18n.js";
import { LIBRARY_DESTINATION_OCCUPIED } from "../../src/core/library-storage-errors.js";
import { finishRelocation, planRelocation, prepareRelocation, relocationFiles, relocationJournal, rollbackRelocation, type FileRelocation, type RelocationProgress } from "./file-relocation.js";

/** Coordinates immutable library commits with the single atomic AppData commit. */
export class LibraryStateStorage {
  private records?: LibraryRecordStore;
  private pointer?: LibraryPointer;
  private migratingSource?: string;
  private release?: () => Promise<void>;
  private pending?: { records: LibraryRecordStore; release?: () => Promise<void>; relocation?: FileRelocation };
  private progressContext?: Pick<LibraryStorageProgress, "operation" | "locale" | "appearance">;
  constructor(private filename: string, private defaultDirectory: string, private onProgress?: (value: LibraryStorageProgress) => void, private onMoveProgress?: RelocationProgress, private onWarning?: (error: unknown) => void) {}

  async hydrate(raw: string): Promise<string> {
    const state = JSON.parse(raw) as AppState;
    this.progressContext = { operation: state.libraryStorage ? "opening" : "migration", locale: normalizeUiLocale(state.settings.uiLocale), appearance: normalizeAppearance(state.settings.appearance) };
    if (state.libraryStorage) {
      this.report("loading");
      this.pointer = state.libraryStorage;
      this.release ??= await acquireLibraryLease(this.pointer.directory, this.filename);
      this.records = await LibraryRecordStore.open(this.pointer);
      const collections = await this.records.load(this.pointer.commit, value => this.report("loading", value.completed, value.total));
      await this.journal("switched");
      return JSON.stringify({ ...state, ...collections });
    }
    const journal = await readOptionalFile(`${this.filename}.library-migration.json`);
    if (journal && JSON.parse(journal).phase === "switched") throw new StateRecoveryError("The library has already been migrated. Refusing to fall back to the pre-migration state; restore a matching library locator.");
    const directory = state.settings.libraryDirectory?.trim() || this.defaultDirectory;
    this.report("backup");
    if (!path.isAbsolute(directory)) throw new StateRecoveryError("Library directory must be absolute");
    this.release ??= await acquireLibraryLease(directory, this.filename, true);
    const hash = stateDigest(raw), backup = `${this.filename}.pre-library-${hash}.json`;
    const existing = await readOptionalFile(backup);
    if (existing !== undefined && existing !== raw) throw new StateRecoveryError("Migration backup mismatch");
    if (existing === undefined) {
      const candidate = await durableCandidate(backup, raw); await fs.rename(candidate, backup);
    }
    if (await fs.readFile(backup, "utf8") !== raw) throw new StateRecoveryError("Migration backup read-back failed");
    this.records = await LibraryRecordStore.create(directory, hash);
    this.pointer = await this.records.prepare({ history: state.history ?? [], imageHistory: state.imageHistory ?? [] }, null, value => {
      if (value.phase === "write") this.report("write", value.completed, value.total);
      else this.report("verify");
    });
    const reopened = await LibraryRecordStore.open(this.pointer);
    if (canonical(await reopened.load(this.pointer.commit, value => this.report("verify", value.completed, value.total))) !== canonical({ history: state.history ?? [], imageHistory: state.imageHistory ?? [] })) throw new StateRecoveryError("Independent migration verification failed");
    if (await fs.readFile(this.filename, "utf8") !== raw) throw new StateRecoveryError("Source changed during migration; no locator was switched");
    this.migratingSource = raw;
    await this.journal("prepared");
    return JSON.stringify({ ...state, libraryStorage: this.pointer, settings: { ...state.settings, libraryDirectory: directory } });
  }

  get pendingMigration(): boolean { return this.migratingSource !== undefined; }

  async prepare(state: AppState): Promise<{ raw: string; pointer: LibraryPointer }> {
    if (!this.records || !this.pointer || !this.release) throw new StateRecoveryError("Library writer is closed or has not been opened");
    if (this.migratingSource !== undefined && await fs.readFile(this.filename, "utf8") !== this.migratingSource) throw new StateRecoveryError("Source changed before migration commit");
    if (this.migratingSource !== undefined) this.report("finalize");
    let records = this.records, parent: string | null = this.pointer.commit;
    const directory = state.settings.libraryDirectory?.trim() || this.defaultDirectory;
    if (path.resolve(directory).toLowerCase() !== path.resolve(records.directory).toLowerCase()) {
      const release = await acquireLibraryLease(directory, this.filename, true);
      this.pending = { records, release };
      const occupied = await fs.readdir(directory).catch(error => { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; });
      if (occupied.length) throw new StateRecoveryError(`${LIBRARY_DESTINATION_OCCUPIED}: Destination is not empty`);
      const tx = await planRelocation("library", records.directory, directory, await relocationFiles(records.directory), relocationJournal(this.filename, "library"), this.onMoveProgress);
      await prepareRelocation(tx, this.onMoveProgress);
      this.pending.relocation = tx;
      records = await LibraryRecordStore.open({ ...this.pointer, directory });
    }
    this.pending = { records, release: this.pending?.release, relocation: this.pending?.relocation };
    // JSON removes optional undefined fields exactly as the legacy serializer did.
    const collections = JSON.parse(JSON.stringify({ history: state.history, imageHistory: state.imageHistory }));
    const pointer = await records.prepare(collections, parent);
    const raw = JSON.stringify({ ...state, history: undefined, imageHistory: undefined, libraryStorage: pointer, settings: { ...state.settings, libraryDirectory: directory } }, null, 2);
    if (this.migratingSource !== undefined) this.report("commit");
    return { raw, pointer };
  }

  async committed(pointer: LibraryPointer): Promise<void> {
    this.pointer = pointer;
    const relocation = this.pending?.relocation;
    if (this.pending?.release) {
      await this.release?.(); this.release = this.pending.release;
    }
    this.records = this.pending?.records ?? this.records;
    this.pending = undefined;
    if (relocation) await finishRelocation(relocation, this.onMoveProgress).catch(error => { try { this.onWarning?.(error); } catch { /* The locator is already committed. */ } });
    if (this.migratingSource !== undefined) {
      // The AppData locator is already authoritative. A journal failure must not
      // report the successful commit as a failed save or roll memory back.
      await this.journal("switched").catch(() => undefined);
      this.migratingSource = undefined;
    }
  }

  async abortPrepare(): Promise<void> {
    if (this.pending?.relocation) await rollbackRelocation(this.pending.relocation);
    await this.pending?.release?.(); this.pending = undefined;
  }
  async close(): Promise<void> { await this.abortPrepare(); await this.release?.(); this.release = undefined; this.progressContext = undefined; }

  finishStartup(): void { this.report("complete"); this.progressContext = undefined; }
  private report(stage: LibraryStorageProgress["stage"], completed?: number, total?: number): void {
    if (!this.progressContext) return;
    try { this.onProgress?.({ ...this.progressContext, stage, completed, total }); } catch { /* UI cannot reject a storage transaction. */ }
  }

  private async journal(phase: "prepared" | "switched"): Promise<void> {
    const filename = `${this.filename}.library-migration.json`;
    const candidate = await durableCandidate(filename, JSON.stringify({ format: 1, phase, pointer: this.pointer, sourceHash: this.migratingSource && stateDigest(this.migratingSource) }));
    await fs.rename(candidate, filename);
  }
}
