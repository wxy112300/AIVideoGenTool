import { createReadStream, constants } from "node:fs";
import { promises as fs } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import type { AppState } from "../../src/types.js";
import type { StateRepository, StateMutator } from "../ports/state-repository.js";
import { readOptionalFile, StateRecoveryError, withStateFileLock } from "./state-file-safety.js";
import type { LibraryStorageProgress } from "../../src/core/library-storage-progress.js";
import { normalizeAppearance } from "../../src/core/appearance.js";
import { normalizeUiLocale } from "../../src/core/i18n.js";

const folders = ["history-covers", "image-guides", "image-masks", "image-crops", "clipboard-inputs", "clipboard-files"];
const owned = (name: string) => folders.includes(name) || name === "video-history-migration.json" || name === "studio-state.json" || name.startsWith("studio-state.json.");
const marker = "user-data-migration.json", backup = "migration-backup";
interface Entry { relative: string; sha256: string; size: number; installedSha256?: string }
interface Manifest { format: 1; source: string; phase: "copying" | "prepared" | "complete"; files: Entry[] }
const samePath = (a: string, b: string) => process.platform === "win32" ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);
const within = (root: string, value: string) => { const relative = path.relative(root, value); return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)); };
const exists = async (value: string) => { try { await fs.lstat(value); return true; } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return false; throw e; } };
async function digest(filename: string) {
  const hash = createHash("sha256");
  for await (const data of createReadStream(filename)) hash.update(data);
  return hash.digest("hex");
}
async function syncFile(filename: string) {
  const handle = await fs.open(filename, "r+");
  try { await handle.sync(); } finally { await handle.close(); }
}
/** Windows indexers can briefly hold a newly written file. Never fall back to truncating a destination. */
async function renameFile(source: string, destination: string) {
  for (let attempt = 0; ; attempt++) {
    try { await fs.rename(source, destination); return; }
    catch (error) {
      if (attempt >= 7 || !["EPERM", "EACCES", "EBUSY"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.min(100 * 2 ** attempt, 800)));
    }
  }
}
async function inventory(root: string): Promise<Entry[]> {
  const result: Entry[] = [];
  async function visit(relative: string) {
    const filename = path.join(root, relative), stat = await fs.lstat(filename);
    if (stat.isSymbolicLink()) throw new StateRecoveryError(`User data contains a link; original preserved: ${filename}`);
    if (stat.isDirectory()) { for (const name of (await fs.readdir(filename)).sort()) await visit(path.join(relative, name)); }
    else if (stat.isFile()) result.push({ relative, size: stat.size, sha256: await digest(filename) });
    else throw new StateRecoveryError(`Unsupported user data file: ${filename}`);
  }
  if (await exists(root)) for (const name of (await fs.readdir(root)).filter(owned).sort()) await visit(name);
  return result;
}
async function checkedFile(filename: string, entry: Entry) {
  const stat = await fs.lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== entry.size || await digest(filename) !== entry.sha256)
    throw new StateRecoveryError(`User data verification failed; original preserved: ${filename}`);
}

/** Only path-bearing fields are rewritten: prompt text and user labels stay byte-for-byte intact. */
export function relocateUserDataReferences(value: unknown, source: string, destination: string): boolean {
  let changed = false;
  const relocate = (text: string) => {
    if (!path.isAbsolute(text) || !within(source, text)) return text;
    const relative = path.relative(source, text), first = relative.split(path.sep)[0];
    return folders.includes(first) ? path.join(destination, relative) : text;
  };
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node)) {
      if (typeof child === "string" && (/(?:path|directory)$/iu.test(key) || key === "src")) {
        const next = relocate(child);
        if (next !== child) { (node as Record<string, unknown>)[key] = next; changed = true; }
      } else visit(child);
    }
  };
  visit(value); return changed;
}

/** Copy-first, resumable transition. Never moves Electron's own profile or external media. */
export class UserDataMigration {
  private pending = false;
  private context = { locale: normalizeUiLocale(undefined), appearance: normalizeAppearance(undefined) };
  constructor(readonly source: string, readonly destination: string, private readonly onProgress?: (value: LibraryStorageProgress) => void) {
    const nestedOwnedRoot = within(source, destination) && owned(path.relative(source, destination).split(path.sep)[0]);
    if (!path.isAbsolute(source) || !path.isAbsolute(destination) || nestedOwnedRoot || within(destination, source))
      throw new Error("User data migration requires non-overlapping owned roots");
  }
  private async manifest(): Promise<Manifest | undefined> {
    const raw = await readOptionalFile(path.join(this.destination, marker));
    if (!raw) return;
    const value = JSON.parse(raw) as Manifest;
    if (value.format !== 1 || !samePath(value.source, this.source) || !["copying", "prepared", "complete"].includes(value.phase) || !Array.isArray(value.files))
      throw new StateRecoveryError("Invalid user data migration record; no source files were removed");
    const seen = new Set<string>();
    for (const entry of value.files) {
      if (typeof entry.relative !== "string" || path.isAbsolute(entry.relative) || path.normalize(entry.relative) !== entry.relative || !within(this.destination, path.resolve(this.destination, entry.relative)) || !owned(entry.relative.split(path.sep)[0]) || seen.has(entry.relative) || !/^[a-f0-9]{64}$/u.test(entry.sha256) || (entry.installedSha256 !== undefined && !/^[a-f0-9]{64}$/u.test(entry.installedSha256)) || !Number.isSafeInteger(entry.size) || entry.size < 0)
        throw new StateRecoveryError("Invalid user data migration file record");
      seen.add(entry.relative);
    }
    return value;
  }
  private async writeManifest(directory: string, value: Manifest) {
    const filename = path.join(directory, marker), candidate = `${filename}.${randomUUID()}.tmp`, raw = JSON.stringify(value, null, 2);
    await fs.mkdir(directory, { recursive: true });
    try {
      const handle = await fs.open(candidate, "wx");
      try { await handle.writeFile(raw, "utf8"); await handle.sync(); } finally { await handle.close(); }
      if (await fs.readFile(candidate, "utf8") !== raw) throw new StateRecoveryError("User data migration record read-back failed");
      await renameFile(candidate, filename);
    } finally { await fs.unlink(candidate).catch(error => { if (error.code !== "ENOENT") throw error; }); }
  }
  private report(stage: LibraryStorageProgress["stage"], completed?: number, total?: number) {
    this.onProgress?.({ ...this.context, operation: "migration", scope: "user-data", stage, completed, total });
  }
  private async readContext() {
    try {
      const raw = await readOptionalFile(path.join(this.source, "studio-state.json")) ?? await readOptionalFile(path.join(this.destination, "studio-state.json"));
      const settings = raw ? JSON.parse(raw).settings : undefined;
      this.context = { locale: normalizeUiLocale(settings?.uiLocale), appearance: normalizeAppearance(settings?.appearance) };
    } catch { /* The repository performs authoritative validation and recovery. */ }
  }
  /** Stage one file next to its final path; a failed copy never leaves a truncated active file. */
  private async installFile(original: string, filename: string, entry: Entry, transform: boolean): Promise<string> {
    if (await exists(filename) && (!transform || !entry.relative.endsWith(".json"))) {
      await checkedFile(filename, entry); return entry.sha256;
    }
    const candidate = `${filename}.user-migration-${randomUUID()}.tmp`;
    await fs.mkdir(path.dirname(filename), { recursive: true });
    try {
      const stat = await fs.stat(original);
      await fs.copyFile(original, candidate, constants.COPYFILE_EXCL); await checkedFile(candidate, entry);
      await fs.utimes(candidate, stat.atimeMs / 1000, stat.mtimeMs / 1000);
      if (transform && entry.relative.endsWith(".json")) {
        let document: unknown;
        try { document = JSON.parse(await fs.readFile(candidate, "utf8")); } catch { /* Keep opaque auxiliary documents verbatim. */ }
        if (relocateUserDataReferences(document, this.source, this.destination)) await fs.writeFile(candidate, JSON.stringify(document));
      }
      await syncFile(candidate);
      const sha256 = await digest(candidate);
      if (await exists(filename)) {
        const installed = await fs.lstat(filename);
        if (!installed.isFile() || installed.isSymbolicLink() || await digest(filename) !== sha256)
          throw new StateRecoveryError(`Conflicting migrated file; original preserved: ${filename}`);
      } else await renameFile(candidate, filename);
      return sha256;
    } finally { await fs.unlink(candidate).catch(error => { if (error.code !== "ENOENT") throw error; }); }
  }
  committing(): void {
    if (this.pending) this.report("commit");
  }
  async prepare(): Promise<void> {
    let manifest = await this.manifest();
    if (manifest && manifest.phase !== "copying") {
      if (manifest.files.some(entry => entry.relative === "studio-state.json") && !await exists(path.join(this.destination, "studio-state.json")) && !await exists(path.join(this.destination, "studio-state.json.backups")))
        throw new StateRecoveryError(`Migrated state is missing. Restore the original from ${path.join(this.destination, backup)}; an empty profile was not created.`);
      this.pending = manifest.phase !== "complete";
      if (this.pending) { await this.readContext(); this.report("verify"); }
      return;
    }
    if (!manifest && (!await exists(this.source) || !(await fs.readdir(this.source)).some(owned))) return;
    this.pending = true;
    await this.readContext(); this.report("scan");
    // Keep original files intact until both installation and repository transactions finish.
    await withStateFileLock(path.join(this.source, "studio-state.json"), async () => {
      const current = await inventory(this.source);
      if (!manifest) {
        if (!current.length) { this.pending = false; this.report("complete"); return; }
        if (await exists(this.destination) && (await fs.readdir(this.destination)).length)
          throw new StateRecoveryError(`Both legacy and Documents user data exist. Nothing was overwritten. Review ${this.destination} and ${this.source}`);
        manifest = { format: 1, source: this.source, phase: "copying", files: current };
        // Publish intent before any business file. Startup resumes this phase instead of opening partial data.
        await this.writeManifest(this.destination, manifest);
      } else if (current.length !== manifest.files.length || current.some((entry, index) => entry.relative !== manifest!.files[index].relative || entry.sha256 !== manifest!.files[index].sha256 || entry.size !== manifest!.files[index].size)) {
        throw new StateRecoveryError("Legacy user data changed during copying; original and partial copy preserved");
      }
      let completed = 0;
      this.report("backup", completed, manifest.files.length);
      for (const entry of manifest.files) {
        const original = path.join(this.source, entry.relative), saved = path.join(this.destination, backup, entry.relative), active = path.join(this.destination, entry.relative);
        if (await exists(saved)) await checkedFile(saved, entry);
        else await this.installFile(original, saved, entry, false);
        this.report("write", completed, manifest.files.length);
        const sha256 = await this.installFile(saved, active, entry, folders.includes(entry.relative.split(path.sep)[0]));
        if (sha256 !== entry.sha256) entry.installedSha256 = sha256;
        this.report("write", ++completed, manifest.files.length);
      }
      await this.writeManifest(this.destination, { ...manifest, phase: "prepared" });
    });
  }
  async finish(): Promise<void> {
    const manifest = await this.manifest();
    if (!manifest || manifest.phase === "complete") return;
    if (manifest.phase !== "prepared") throw new StateRecoveryError("User data copying has not completed");
    await withStateFileLock(path.join(this.source, "studio-state.json"), async () => {
      const remaining = await inventory(this.source), expected = new Map(manifest.files.map(entry => [entry.relative, entry]));
      // Check every original and every backup BEFORE removing even one source file.
      for (const entry of remaining) if (entry.size !== expected.get(entry.relative)?.size || entry.sha256 !== expected.get(entry.relative)?.sha256)
        throw new StateRecoveryError(`Legacy user data changed during migration: ${entry.relative}. Original preserved.`);
      let verified = 0;
      this.report("verify", verified, manifest.files.length);
      for (const entry of manifest.files) {
        await checkedFile(path.join(this.destination, backup, entry.relative), entry);
        if (folders.includes(entry.relative.split(path.sep)[0])) {
          const active = path.join(this.destination, entry.relative), stat = await fs.lstat(active);
          if (!stat.isFile() || stat.isSymbolicLink() || await digest(active) !== (entry.installedSha256 ?? entry.sha256))
            throw new StateRecoveryError(`Migrated auxiliary file is missing or changed; original preserved: ${active}`);
        }
        this.report("verify", ++verified, manifest.files.length);
      }
      const directories = new Set<string>();
      let removed = 0;
      this.report("cleanup", removed, remaining.length);
      for (const entry of remaining) {
        const filename = path.join(this.source, entry.relative);
        await checkedFile(filename, entry); await fs.unlink(filename);
        for (let parent = path.dirname(filename); within(this.source, parent) && !samePath(parent, this.source); parent = path.dirname(parent)) directories.add(parent);
        this.report("cleanup", ++removed, remaining.length);
      }
      for (const directory of [...directories].sort((a, b) => b.length - a.length)) {
        try { await fs.rmdir(directory); } catch (e) { if (!["ENOTEMPTY", "ENOENT"].includes((e as NodeJS.ErrnoException).code ?? "")) throw e; }
      }
      await this.writeManifest(this.destination, { ...manifest, phase: "complete" });
      this.pending = false; this.report("complete");
    });
  }
}

/** Startup owns the transition; JsonStore still owns all schema/Library transactions and leases. */
export class MigratingUserDataRepository implements StateRepository {
  constructor(private readonly repository: StateRepository, private readonly migration?: UserDataMigration) {}
  async load(): Promise<AppState> {
    await this.migration?.prepare();
    this.migration?.committing();
    let state = await this.repository.load();
    if (this.migration && relocateUserDataReferences(state, this.migration.source, this.migration.destination)) {
      state = await this.repository.update(target => { relocateUserDataReferences(target, this.migration!.source, this.migration!.destination); });
    }
    await this.migration?.finish();
    return state;
  }
  get() { return this.repository.get(); }
  getSettings() { return this.repository.getSettings(); }
  getHistoryAsset(id: string) { return this.repository.getHistoryAsset?.(id); }
  update(mutator: StateMutator) { return this.repository.update(mutator); }
  updateWithoutSnapshot(mutator: StateMutator) { return this.repository.updateWithoutSnapshot ? this.repository.updateWithoutSnapshot(mutator) : this.repository.update(mutator).then(() => undefined); }
  mutateTransient(mutator: StateMutator) { if (!this.repository.mutateTransient) throw new Error("Transient state is unavailable"); this.repository.mutateTransient(mutator); }
  async flush() { await this.repository.flush?.(); }
  async close() { await this.repository.close?.(); }
}
