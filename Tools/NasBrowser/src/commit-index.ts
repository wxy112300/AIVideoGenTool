import { DatabaseSync } from "node:sqlite";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { atomicWrite, confinedFile, digest, parseCatalog, type PortableAsset, type PortableCatalog } from "./catalog.js";
import { parseNasPointer, parseNasCommit, readNasObject, type NasCommit, type NasPointer } from "../../../src/infrastructure/nas-commit.js";

interface Saved { pointer: NasPointer; commit: NasCommit }
interface Indexed { hash: string; asset: PortableAsset }
class IndexIntegrityError extends Error {}

/** Local, rebuildable index. Never writes into the read-only Drive mount. */
export class NasCommitIndex {
  private db?: DatabaseSync;
  private saved?: Saved;
  private assets = new Map<string, Indexed>();
  lastError = "";
  constructor(private dataDirectory: string, private protectedRoots: string[] = []) {}

  private async open(): Promise<void> {
    if (this.db) return;
    if (!path.isAbsolute(this.dataDirectory)) throw new Error("NAS dataDirectory must be an absolute local path");
    const canonicalDestination = async (directory: string): Promise<string> => {
      try { return await fs.realpath(directory); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT" || path.dirname(directory) === directory) throw error;
        return path.join(await canonicalDestination(path.dirname(directory)), path.basename(directory));
      }
    };
    const destination = await canonicalDestination(this.dataDirectory);
    const within = (parent: string, child: string) => { const suffix = path.relative(parent, child); return !suffix || (suffix !== ".." && !suffix.startsWith(`..${path.sep}`) && !path.isAbsolute(suffix)); };
    for (const configured of this.protectedRoots) {
      const source = await canonicalDestination(path.resolve(configured));
      if (within(source, destination) || within(destination, source)) throw new Error("NAS dataDirectory must be separate from synchronized library and media roots");
    }
    await fs.mkdir(this.dataDirectory, { recursive: true });
    const filename = path.join(this.dataDirectory, "library.sqlite");
    try {
      this.db = new DatabaseSync(filename);
      const check = this.db.prepare("PRAGMA quick_check").get();
      if (check?.quick_check !== "ok") throw Object.assign(new Error("Damaged SQLite index"), { errcode: 11 });
    } catch (error) {
      this.db?.close(); this.db = undefined;
      const code = (error as { errcode?: number }).errcode;
      if (code !== 11 && code !== 26) throw error;
      await fs.rename(filename, `${filename}.corrupt-${randomUUID()}`);
      this.db = new DatabaseSync(filename);
    }
    this.db.exec("PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, hash TEXT NOT NULL, json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS texts (hash TEXT PRIMARY KEY, text TEXT NOT NULL);");
    try {
      const row = this.db.prepare("SELECT value FROM metadata WHERE key='commit'").get();
      if (row) {
        const envelope = JSON.parse(String(row.value));
        if (envelope.format !== 1 || !envelope.saved || envelope.sha256 !== digest(JSON.stringify(envelope.saved))) throw new IndexIntegrityError("Invalid local index checkpoint");
        const saved = envelope.saved as Saved;
        parseNasPointer(JSON.stringify(saved.pointer));
        if (!Array.isArray(saved.commit?.records)) throw new IndexIntegrityError("Invalid local index record list");
        const refs = new Map(saved.commit.records.map(ref => [ref.id, ref.hash]));
        for (const record of this.db.prepare("SELECT id,hash,json FROM records").all()) {
          const raw = String(record.json), id = String(record.id), hash = String(record.hash);
          if (refs.get(id) !== hash || digest(raw) !== hash) throw new IndexIntegrityError("Local record checksum mismatch");
          const asset = JSON.parse(raw) as PortableAsset;
          parseCatalog(JSON.stringify({ schemaVersion: 1, locale: saved.commit.locale, models: saved.commit.models, assets: [asset] }));
          if (asset.id !== id) throw new IndexIntegrityError("Local record identity mismatch");
          for (const version of asset.versions) if (version.promptRef) {
            const text = this.db.prepare("SELECT text FROM texts WHERE hash=?").get(version.promptRef);
            if (!text || digest(JSON.stringify(String(text.text))) !== version.promptRef) throw new IndexIntegrityError("Local prompt checksum mismatch");
          }
          this.assets.set(id, { hash, asset });
        }
        if (this.assets.size !== refs.size) throw new IndexIntegrityError("Local index has missing records");
        this.saved = saved;
      }
    } catch (error) {
      if (!(error instanceof SyntaxError) && !(error instanceof IndexIntegrityError)) throw error;
      this.db.close(); this.db = undefined; this.saved = undefined; this.assets.clear();
      await fs.rename(filename, `${filename}.corrupt-${randomUUID()}`);
      await this.open();
    }
  }

  async refresh(root: string | undefined, recoveryPointer?: NasPointer): Promise<{ catalog: PortableCatalog; revision: string }> {
    await this.open();
    this.lastError = "";
    try {
      if (!root) throw new Error("Synchronized library directory is unavailable");
      const pointer = recoveryPointer ?? parseNasPointer(await fs.readFile(await confinedFile(root, "current.json"), "utf8"));
      if (this.saved && pointer.libraryId !== this.saved.pointer.libraryId) throw new Error("NAS library identity changed; use a separate dataDirectory");
      if (pointer.commit !== this.saved?.pointer.commit) {
        const commit = parseNasCommit(await readNasObject(root, "commits", pointer.commit), pointer);
        if (this.saved && commit.generation <= this.saved.commit.generation) throw new Error("Refusing an older or conflicting NAS generation");
        const changed = new Map<string, Indexed>(), texts = new Map<string, string>();
        for (const ref of commit.records) {
          if (this.assets.get(ref.id)?.hash === ref.hash) continue;
          const raw = await readNasObject(root, "records", ref.hash);
          const candidate = JSON.parse(raw) as PortableAsset;
          parseCatalog(JSON.stringify({ schemaVersion: 1, locale: commit.locale, models: commit.models, assets: [candidate] }));
          if (candidate.id !== ref.id) throw new Error("NAS record identity mismatch");
          for (const version of candidate.versions) if (version.promptRef && !this.db!.prepare("SELECT 1 FROM texts WHERE hash=?").get(version.promptRef) && !texts.has(version.promptRef)) {
            const text: unknown = JSON.parse(await readNasObject(root, "texts", version.promptRef));
            if (typeof text !== "string") throw new Error("Invalid NAS prompt text");
            texts.set(version.promptRef, text);
          }
          changed.set(ref.id, { hash: ref.hash, asset: candidate });
        }
        // Empty commits still validate model/locale headers.
        parseCatalog(JSON.stringify({ schemaVersion: 1, locale: commit.locale, models: commit.models, assets: [] }));
        const next: Saved = { pointer, commit };
        this.db!.exec("BEGIN IMMEDIATE");
        try {
          const save = this.db!.prepare("INSERT INTO records(id,hash,json) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET hash=excluded.hash,json=excluded.json");
          for (const [id, item] of changed) save.run(id, item.hash, JSON.stringify(item.asset));
          const textSave = this.db!.prepare("INSERT OR IGNORE INTO texts(hash,text) VALUES(?,?)");
          for (const [hash, text] of texts) textSave.run(hash, text);
          this.db!.exec("CREATE TEMP TABLE IF NOT EXISTS active_ids(id TEXT PRIMARY KEY); DELETE FROM active_ids;");
          const active = this.db!.prepare("INSERT INTO active_ids(id) VALUES(?)");
          for (const ref of commit.records) active.run(ref.id);
          this.db!.exec("DELETE FROM records WHERE NOT EXISTS (SELECT 1 FROM active_ids WHERE active_ids.id=records.id)");
          this.db!.prepare("INSERT INTO metadata(key,value) VALUES('commit',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({ format: 1, sha256: digest(JSON.stringify(next)), saved: next }));
          this.db!.exec("COMMIT");
        } catch (error) { this.db!.exec("ROLLBACK"); throw error; }
        for (const [id, item] of changed) this.assets.set(id, item);
        const active = new Set(commit.records.map(ref => ref.id));
        for (const id of this.assets.keys()) if (!active.has(id)) this.assets.delete(id);
        this.saved = next;
        await atomicWrite(path.join(this.dataDirectory, "last-valid.json"), JSON.stringify(pointer)).catch(() => undefined);
      }
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      if (!this.saved) {
        if (!recoveryPointer && root) {
          let fallback: NasPointer | undefined;
          try { fallback = parseNasPointer(await fs.readFile(path.join(this.dataDirectory, "last-valid.json"), "utf8")); } catch { /* No local checkpoint. */ }
          if (fallback) {
            const result = await this.refresh(root, fallback);
            this.lastError = error instanceof Error ? error.message : String(error);
            return result;
          }
        }
        throw error;
      }
    }
    const saved = this.saved!;
    return { revision: saved.pointer.commit, catalog: { schemaVersion: 1, locale: saved.commit.locale, models: saved.commit.models,
      assets: saved.commit.records.map(ref => this.assets.get(ref.id)!.asset) } };
  }

  prompt(hash: string): string {
    const row = this.db?.prepare("SELECT text FROM texts WHERE hash=?").get(hash);
    if (!row) throw new Error("Prompt is unavailable in the last verified index");
    return String(row.text);
  }

  close(): void { this.db?.close(); this.db = undefined; this.saved = undefined; this.assets.clear(); }
}
