import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { durableCandidate, readOptionalFile, stateDigest, StateRecoveryError } from "./state-file-safety.js";
import { LIBRARY_DESTINATION_CONFLICT, LIBRARY_DESTINATION_OCCUPIED } from "../../src/core/library-storage-errors.js";

export interface LibraryPointer { format: 1; directory: string; libraryId: string; commit: string }
export interface LibraryCollections { history: unknown[]; imageHistory: unknown[] }
export interface LibraryRecordProgress { phase: "write" | "verify" | "read"; completed: number; total: number }
function progress(listener: ((value: LibraryRecordProgress) => void) | undefined, value: LibraryRecordProgress): void {
  try { listener?.(value); } catch { /* Display failures must never interrupt storage. */ }
}
interface RecordRef { id: string; hash: string }
interface LibraryCommit {
  format: 1; libraryId: string; parent: string | null;
  history: RecordRef[]; imageHistory: RecordRef[];
  deleted: Array<{ collection: "history" | "imageHistory"; id: string }>;
}
// Every value is tagged, so user extension fields can never collide with text references.
type Encoded = ["value", null | boolean | number | string] | ["text", string] | ["array", Encoded[]] | ["object", Array<[string, Encoded]>];
const hashPattern = /^[a-f0-9]{64}$/;
const identityPattern = /^[a-f0-9-]{36}$/;

export class LibraryRecordStore {
  private verified = new Map<string, { source: string; ref: RecordRef }>();
  private constructor(readonly directory: string, readonly libraryId: string) {}

  static async create(directory: string, sourceHash: string, desiredId?: string): Promise<LibraryRecordStore> {
    await fs.mkdir(directory, { recursive: true });
    const identityFile = path.join(directory, "library.json");
    const existing = await readOptionalFile(identityFile);
    if (existing !== undefined) {
      const identity = JSON.parse(existing);
      if (identity.format !== 1 || identity.sourceHash !== sourceHash || !identityPattern.test(identity.libraryId) || (desiredId && identity.libraryId !== desiredId)) throw new StateRecoveryError(`${LIBRARY_DESTINATION_CONFLICT}: Destination contains a different library; it was not overwritten`);
      return new LibraryRecordStore(directory, identity.libraryId);
    }
    if ((await fs.readdir(directory)).some(name => !/^library\.json\.\d+\.[a-f0-9-]{36}\.tmp$/.test(name))) throw new StateRecoveryError(`${LIBRARY_DESTINATION_OCCUPIED}: Destination is not empty; select a separate library directory`);
    const libraryId = desiredId ?? randomUUID();
    // Exclusive creation makes an existing library's identity immutable.
    const candidate = await durableCandidate(identityFile, JSON.stringify({ format: 1, libraryId, sourceHash }));
    await fs.rename(candidate, identityFile);
    return new LibraryRecordStore(directory, libraryId);
  }

  static async open(pointer: LibraryPointer): Promise<LibraryRecordStore> {
    if (pointer.format !== 1 || !path.isAbsolute(pointer.directory) || !identityPattern.test(pointer.libraryId) || !hashPattern.test(pointer.commit)) throw new StateRecoveryError("Invalid library locator");
    const identity = JSON.parse(await fs.readFile(path.join(pointer.directory, "library.json"), "utf8"));
    if (identity.format !== 1 || identity.libraryId !== pointer.libraryId) throw new StateRecoveryError("Library identity mismatch");
    return new LibraryRecordStore(pointer.directory, pointer.libraryId);
  }

  private async filename(kind: "records" | "texts" | "commits", hash: string, create = false): Promise<string> {
    if (!hashPattern.test(hash)) throw new StateRecoveryError("Invalid content address");
    const root = await fs.realpath(this.directory), directory = path.join(root, kind);
    if (create) await fs.mkdir(directory, { recursive: true });
    const actual = await fs.realpath(directory);
    if (actual !== directory) throw new StateRecoveryError("Library subdirectory must not be a symbolic link");
    const filename = path.join(directory, `${hash}.json`);
    try { if ((await fs.lstat(filename)).isSymbolicLink()) throw new StateRecoveryError("Library object must not be a symbolic link"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    return filename;
  }

  private async put(kind: "records" | "texts" | "commits", raw: string): Promise<string> {
    const hash = stateDigest(raw), filename = await this.filename(kind, hash, true);
    const existing = await readOptionalFile(filename);
    if (existing !== undefined) {
      if (existing !== raw) throw new StateRecoveryError("An immutable library object is damaged; original preserved");
      return hash;
    }
    const candidate = await durableCandidate(filename, raw);
    // The application owns the sole writer; objects are immutable and content addressed.
    await fs.rename(candidate, filename);
    return hash;
  }

  private async read(kind: "records" | "texts" | "commits", hash: string): Promise<string> {
    const raw = await fs.readFile(await this.filename(kind, hash), "utf8");
    if (stateDigest(raw) !== hash) throw new StateRecoveryError(`Damaged library ${kind} object ${hash}`);
    return raw;
  }

  private async encode(value: unknown): Promise<Encoded> {
    if (typeof value === "string" && value.length >= 2048) return ["text", await this.put("texts", JSON.stringify(value))];
    if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return ["value", value];
    if (Array.isArray(value)) { const values: Encoded[] = []; for (const item of value) values.push(await this.encode(item)); return ["array", values]; }
    if (typeof value === "object" && value) {
      const entries: Array<[string, Encoded]> = [];
      for (const key of Object.keys(value).sort()) entries.push([key, await this.encode((value as Record<string, unknown>)[key])]);
      return ["object", entries];
    }
    throw new StateRecoveryError("Library records must contain JSON values");
  }

  private async decode(value: Encoded): Promise<unknown> {
    if (!Array.isArray(value) || value.length !== 2) throw new StateRecoveryError("Invalid encoded record");
    switch (value[0]) {
      case "value": return value[1];
      case "text": { const text: unknown = JSON.parse(await this.read("texts", value[1])); if (typeof text !== "string") throw new StateRecoveryError("Invalid text object"); return text; }
      case "array": { const values: unknown[] = []; for (const item of value[1]) values.push(await this.decode(item)); return values; }
      case "object": { const entries: Array<[string, unknown]> = []; for (const [key, item] of value[1]) entries.push([key, await this.decode(item)]); return Object.fromEntries(entries); }
      default: throw new StateRecoveryError("Invalid record encoding");
    }
  }

  private async manifest(hash: string): Promise<LibraryCommit> {
    const commit = JSON.parse(await this.read("commits", hash)) as LibraryCommit;
    if (commit.format !== 1 || commit.libraryId !== this.libraryId || !Array.isArray(commit.history) || !Array.isArray(commit.imageHistory) || !Array.isArray(commit.deleted)) throw new StateRecoveryError("Invalid library commit");
    for (const key of ["history", "imageHistory"] as const) {
      const ids = new Set<string>();
      for (const ref of commit[key]) {
        if (!ref || typeof ref.id !== "string" || !ref.id || ids.has(ref.id) || !hashPattern.test(ref.hash)) throw new StateRecoveryError("Invalid library record reference");
        ids.add(ref.id);
      }
    }
    return commit;
  }

  async load(commitHash: string, onProgress?: (value: LibraryRecordProgress) => void): Promise<LibraryCollections> {
    const commit = await this.manifest(commitHash);
    const result: LibraryCollections = { history: [], imageHistory: [] };
    const total = commit.history.length + commit.imageHistory.length;
    let completed = 0;
    progress(onProgress, { phase: "read", completed, total });
    for (const key of ["history", "imageHistory"] as const) {
      for (const ref of commit[key]) {
        const record = await this.decode(JSON.parse(await this.read("records", ref.hash)));
        if (!record || typeof record !== "object" || (record as { id?: unknown }).id !== ref.id) throw new StateRecoveryError("Record identity does not match commit");
        result[key].push(record);
        this.verified.set(`${key}:${ref.id}`, { source: canonical(record), ref });
        progress(onProgress, { phase: "read", completed: ++completed, total });
      }
    }
    return result;
  }

  async prepare(collections: LibraryCollections, parent: string | null, onProgress?: (value: LibraryRecordProgress) => void): Promise<LibraryPointer> {
    const previous = parent ? await this.manifest(parent) : undefined;
    const changed: Array<{ key: "history" | "imageHistory"; ref: RecordRef; source: string }> = [];
    const commit: LibraryCommit = { format: 1, libraryId: this.libraryId, parent, history: [], imageHistory: [], deleted: [] };
    const total = collections.history.length + collections.imageHistory.length;
    let completed = 0;
    progress(onProgress, { phase: "write", completed, total });
    for (const key of ["history", "imageHistory"] as const) {
      const ids = new Set<string>();
      for (const record of collections[key]) {
        const id = (record as { id?: unknown })?.id;
        if (typeof id !== "string" || !id || ids.has(id)) throw new StateRecoveryError("Invalid or duplicate record identity");
        ids.add(id);
        const source = canonical(record), cached = this.verified.get(`${key}:${id}`);
        const ref = cached?.source === source ? cached.ref : { id, hash: await this.put("records", JSON.stringify(await this.encode(record))) };
        commit[key].push(ref);
        if (cached?.source !== source) changed.push({ key, ref, source });
        progress(onProgress, { phase: "write", completed: ++completed, total });
      }
      for (const old of previous?.[key] ?? []) if (!ids.has(old.id)) commit.deleted.push({ collection: key, id: old.id });
    }
    // A no-op does not produce a new generation or rewrite objects.
    if (previous && JSON.stringify(previous.history) === JSON.stringify(commit.history) && JSON.stringify(previous.imageHistory) === JSON.stringify(commit.imageHistory)) return { format: 1, directory: this.directory, libraryId: this.libraryId, commit: parent! };
    const hash = await this.put("commits", JSON.stringify(commit));
    completed = 0;
    progress(onProgress, { phase: "verify", completed, total: changed.length });
    // Independent disk reopen checks object, text, identities and semantic content before activation.
    for (const item of changed) {
      const record = await this.decode(JSON.parse(await this.read("records", item.ref.hash)));
      if (canonical(record) !== item.source) throw new StateRecoveryError("Library round-trip verification failed");
      this.verified.set(`${item.key}:${item.ref.id}`, { source: item.source, ref: item.ref });
      progress(onProgress, { phase: "verify", completed: ++completed, total: changed.length });
    }
    return { format: 1, directory: this.directory, libraryId: this.libraryId, commit: hash };
  }
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
