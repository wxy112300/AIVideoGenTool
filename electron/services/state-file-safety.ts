import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import os from "node:os";
import { APP_SCHEMA_VERSION } from "../../src/core/defaults.js";

export class StateRecoveryError extends Error {
  constructor(message: string, options?: ErrorOptions) { super(message, options); this.name = "StateRecoveryError"; }
}

export const stateDigest = (raw: string): string => createHash("sha256").update(raw).digest("hex");
/** OS-owned pipe lock releases on crash; no stale lock file can block recovery. */
export async function withStateFileLock<T>(filename: string, operation: () => Promise<T>): Promise<T> {
  const key = stateDigest(path.resolve(filename).toLowerCase());
  const address = process.platform === "win32" ? `\\\\.\\pipe\\lvs-state-${key}` : path.join(os.tmpdir(), `lvs-${key}.sock`);
  const server = createServer(); server.unref();
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(address, resolve); });
  try { return await operation(); }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

const libraryLeases = new Map<string, { writer: string; references: number; close(): Promise<void> }>();
/** Temporary local exclusion only; neither host identity nor paths are stored in the library. */
export async function acquireLibraryLease(directory: string, writer: string, create = false): Promise<() => Promise<void>> {
  if (create) await fs.mkdir(directory, { recursive: true });
  const key = stateDigest((await fs.realpath(directory)).toLowerCase());
  const existing = libraryLeases.get(key);
  if (existing && existing.writer !== writer) throw new StateRecoveryError("Another profile is currently writing this library");
  let lease = existing;
  if (!lease) {
    const server = createServer(); server.unref();
    const address = process.platform === "win32" ? `\\\\.\\pipe\\lvs-library-${key}` : path.join(os.tmpdir(), `lvs-library-${key}.sock`);
    await new Promise<void>((resolve, reject) => {
      server.once("error", error => reject(new StateRecoveryError("Another application is currently writing this library; close it before retrying", { cause: error })));
      server.listen(address, resolve);
    });
    lease = { writer, references: 0, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
    libraryLeases.set(key, lease);
  }
  lease.references++;
  let released = false;
  return async () => {
    if (released) return; released = true;
    if (--lease!.references === 0) { libraryLeases.delete(key); await lease!.close(); }
  };
}
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Validate the envelope before any migrations can fill missing fields or drop records. */
export function validateStateFile(raw: string): void {
  const value: unknown = JSON.parse(raw);
  if (!object(value) || !object(value.settings) || !object(value.draft)) throw new StateRecoveryError("Invalid state envelope");
  if (value.schemaVersion !== undefined && (!Number.isInteger(value.schemaVersion) || Number(value.schemaVersion) < 1)) throw new StateRecoveryError("Invalid state schema");
  if (Number(value.schemaVersion) > APP_SCHEMA_VERSION) throw new StateRecoveryError("State was written by a newer application; use that version to open it");
  const locator = value.libraryStorage;
  if (locator !== undefined && (!object(locator) || locator.format !== 1 || typeof locator.directory !== "string" || !path.isAbsolute(locator.directory) ||
      typeof locator.libraryId !== "string" || !/^[a-f0-9-]{36}$/.test(locator.libraryId) || typeof locator.commit !== "string" || !/^[a-f0-9]{64}$/.test(locator.commit))) throw new StateRecoveryError("Invalid library locator");
  if (!Array.isArray(value.queue) || (!locator && !Array.isArray(value.history)) || (!locator && Number(value.schemaVersion) >= 5 && !Array.isArray(value.imageHistory))) throw new StateRecoveryError("Missing persisted collections; refusing to initialize empty history");
  for (const key of ["queue", "history", "imageHistory"]) {
    if (value[key] === undefined) continue; // Legacy states predate these collections.
    if (!Array.isArray(value[key])) throw new StateRecoveryError(`Invalid ${key} collection`);
    const ids = new Set<string>();
    for (const record of value[key]) {
      if (!object(record) || typeof record.id !== "string" || !record.id || ids.has(record.id)) throw new StateRecoveryError(`Invalid or duplicate ${key} identity`);
      ids.add(record.id);
      if (record.versions !== undefined) {
        if (!Array.isArray(record.versions)) throw new StateRecoveryError(`Invalid ${key} versions`);
        const versions = new Set<string>();
        for (const version of record.versions) {
          if (!object(version) || typeof version.id !== "string" || !version.id || versions.has(version.id)) throw new StateRecoveryError(`Invalid or duplicate ${key} version`);
          versions.add(version.id);
        }
      }
    }
  }
}

export async function readOptionalFile(filename: string): Promise<string | undefined> {
  try { return await fs.readFile(filename, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}

/** Exclusive candidate, flush, read-back. A failed replacement never truncates the destination. */
export async function durableCandidate(filename: string, raw: string): Promise<string> {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const candidate = `${filename}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await fs.open(candidate, "wx");
  try { await handle.writeFile(raw, "utf8"); await handle.sync(); }
  finally { await handle.close(); }
  if (await fs.readFile(candidate, "utf8") !== raw) throw new StateRecoveryError("Candidate read-back mismatch");
  return candidate;
}

interface Backup { format: 1; savedAt: string; sha256: string; raw: string }

/** Only this directory's verified snapshots are managed; legacy .corrupt/.bak files are never removed. */
export class StateFileSafety {
  readonly directory: string;
  constructor(private filename: string) { this.directory = `${filename}.backups`; }

  async backup(raw: string): Promise<void> {
    validateStateFile(raw);
    const sha256 = stateDigest(raw);
    await fs.mkdir(this.directory, { recursive: true });
    const filename = path.join(this.directory, `${sha256}.json`);
    const existing = await readOptionalFile(filename);
    if (existing !== undefined) {
      const backup = this.parse(existing);
      if (backup.sha256 !== sha256 || backup.raw !== raw) throw new StateRecoveryError("Existing backup does not match source");
      return;
    }
    const backup: Backup = { format: 1, savedAt: new Date().toISOString(), sha256, raw };
    const candidate = await durableCandidate(filename, JSON.stringify(backup));
    await fs.rename(candidate, filename);
    this.parse(await fs.readFile(filename, "utf8"));
  }

  private parse(raw: string): Backup {
    const value = JSON.parse(raw) as Backup;
    if (value.format !== 1 || typeof value.raw !== "string" || value.sha256 !== stateDigest(value.raw) || !Number.isFinite(Date.parse(value.savedAt))) throw new StateRecoveryError("Invalid backup integrity");
    validateStateFile(value.raw);
    return value;
  }

  private async backups(): Promise<Array<Backup & { filename: string }>> {
    let names: string[];
    try { names = await fs.readdir(this.directory); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
    const valid: Array<Backup & { filename: string }> = [];
    for (const name of names.filter(name => /^[a-f0-9]{64}\.json$/.test(name))) {
      // Read errors (permissions, offline storage) must not masquerade as corrupt data.
      const raw = await fs.readFile(path.join(this.directory, name), "utf8");
      try {
        const backup = this.parse(raw);
        if (name !== `${backup.sha256}.json`) continue;
        valid.push({ ...backup, filename: path.join(this.directory, name) });
      } catch { /* Preserve invalid backups as evidence, never use or prune them. */ }
    }
    return valid.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  async read(): Promise<string | undefined> {
    const raw = await readOptionalFile(this.filename);
    let invalid: unknown;
    if (raw !== undefined) {
      try { validateStateFile(raw); return raw; } catch (error) { invalid = error; }
      // A future version is not corruption and must never be downgraded from a backup.
      try { if (Number(JSON.parse(raw).schemaVersion) > APP_SCHEMA_VERSION) throw invalid; }
      catch (error) { if (error === invalid) throw error; }
    }
    const backups = await this.backups();
    if (!backups.length) {
      // A backup directory is evidence of a previous installation, even if every file is invalid.
      const evidence = await fs.stat(this.directory).then(() => true, error => {
        if (error.code === "ENOENT") return false; throw error;
      });
      const siblingEvidence = (await fs.readdir(path.dirname(this.filename)).catch(error => {
        if (error.code === "ENOENT") return [] as string[]; throw error;
      })).some(name => name.startsWith(`${path.basename(this.filename)}.`));
      if (raw === undefined && !evidence && !siblingEvidence) return undefined;
      throw new StateRecoveryError(`Cannot read ${this.filename}. Original data was preserved; no verified backup is available.`, { cause: invalid });
    }
    const source = backups[0];
    // Preserve the original bytes before replacing; no rename-away window for the primary.
    if (raw !== undefined) {
      const evidence = `${this.filename}.corrupt-${Date.now()}-${randomUUID()}`;
      const handle = await fs.open(evidence, "wx");
      try { await handle.writeFile(raw, "utf8"); await handle.sync(); } finally { await handle.close(); }
    }
    const candidate = await durableCandidate(this.filename, source.raw);
    await fs.rename(candidate, this.filename);
    await fs.appendFile(`${this.filename}.recovery.jsonl`, `${JSON.stringify({ at: new Date().toISOString(), source: path.basename(source.filename), restored: source.sha256 })}\n`, "utf8");
    return source.raw;
  }

  /** Keep eight recent unique snapshots plus one per day for fourteen days, only after a successful commit. */
  async prune(activeHash?: string): Promise<void> {
    const backups = await this.backups();
    const active = backups.find(item => item.sha256 === activeHash);
    const keep = new Set(backups.filter(item => item !== active).slice(0, active ? 7 : 8).map(item => item.filename));
    if (active) keep.add(active.filename);
    const days = new Set<string>();
    for (const item of backups) {
      const day = item.savedAt.slice(0, 10);
      if (!days.has(day) && days.size < 14) { days.add(day); keep.add(item.filename); }
    }
    for (const item of backups) if (!keep.has(item.filename)) await fs.unlink(item.filename);
  }
}
