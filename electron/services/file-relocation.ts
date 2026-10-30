import { createHash, randomUUID } from "node:crypto";
import { createNativeTranslator } from "../ui-translator.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
import type { Translate } from "../../src/core/i18n.js";
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import type { AppState, HistoryMigrationProgress } from "../../src/types.js";
import { durableCandidate, readOptionalFile, StateRecoveryError } from "./state-file-safety.js";

export type RelocationKind = "library" | "video" | "image";
export interface RelocationEntry { source: string; target: string; hash: string; size: number; existing: boolean }
export interface FileRelocation {
  format: 1; kind: RelocationKind; sourceRoot: string; targetRoot: string;
  entries: RelocationEntry[]; journal: string;
  sourceSetting?: string; targetSetting?: string;
}
export type RelocationProgress = (value: HistoryMigrationProgress) => void;
export const relocationJournal = (stateFile: string, kind: RelocationKind) => `${stateFile}.relocation-${kind}.json`;
const key = (value: string) => path.resolve(value).toLowerCase();
function within(root: string, filename: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(filename));
  return Boolean(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
async function exists(filename: string): Promise<boolean> {
  try { await fs.lstat(filename); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}
async function hash(filename: string): Promise<string> {
  const sum = createHash("sha256");
  for await (const chunk of createReadStream(filename)) sum.update(chunk as Buffer);
  return sum.digest("hex");
}
async function noLinks(filename: string, t: Translate): Promise<void> {
  for (let current = path.resolve(filename);;) {
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw new StateRecoveryError(t(uiKeys.storageMigration.linkPath, { path: current })); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const parent = path.dirname(current); if (parent === current) return; current = parent;
  }
}
async function verify(filename: string, entry: RelocationEntry, t: Translate): Promise<void> {
  await noLinks(filename, t);
  const stat = await fs.stat(filename);
  if (!stat.isFile() || stat.size !== entry.size || await hash(filename) !== entry.hash) throw new StateRecoveryError(t(uiKeys.storageMigration.verifyFailed, { path: filename }));
}
async function journal(tx: FileRelocation): Promise<void> {
  const candidate = await durableCandidate(tx.journal, JSON.stringify(tx));
  await fs.rename(candidate, tx.journal);
}
function emit(onProgress: RelocationProgress | undefined, phase: HistoryMigrationProgress["phase"], current: number, total: number, message: string): void {
  try { onProgress?.({ phase, current, total, message, migratedFiles: phase === "scanning" ? 0 : current, warningCount: 0 }); }
  catch { /* Progress observers do not control file ownership. */ }
}

/** Enumerate a selected owned directory without following links or deleting unknown files. */
export async function relocationFiles(directory: string, t: Translate = createNativeTranslator(undefined).t): Promise<string[]> {
  if (!await exists(directory)) return [];
  await noLinks(directory, t);
  const result: string[] = [];
  async function walk(folder: string): Promise<void> {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      const filename = path.join(folder, entry.name);
      if (entry.isSymbolicLink()) throw new StateRecoveryError(t(uiKeys.storageMigration.directoryLink, { path: filename }));
      if (entry.isDirectory()) await walk(filename);
      else if (entry.isFile()) result.push(filename);
      else throw new StateRecoveryError(t(uiKeys.storageMigration.unsupportedFile, { path: filename }));
    }
  }
  await walk(directory); return result;
}

export async function planRelocation(kind: RelocationKind, sourceRoot: string, targetRoot: string, files: string[], journalFile: string, onProgress?: RelocationProgress, t: Translate = createNativeTranslator(undefined).t): Promise<FileRelocation> {
  if (!path.isAbsolute(sourceRoot) || !path.isAbsolute(targetRoot) || key(sourceRoot) === key(targetRoot) || (kind === "library" && (within(sourceRoot, targetRoot) || within(targetRoot, sourceRoot)))) throw new StateRecoveryError(t(uiKeys.storageMigration.rootsInvalid));
  await noLinks(sourceRoot, t); await noLinks(targetRoot, t);
  const tx: FileRelocation = { format: 1, kind, sourceRoot: path.resolve(sourceRoot), targetRoot: path.resolve(targetRoot), entries: [], journal: journalFile };
  const targets = new Set<string>();
  const uniqueFiles = [...new Set(files.map(filename => path.resolve(filename)))];
  for (const [index, source] of uniqueFiles.entries()) {
    if (!within(sourceRoot, source)) throw new StateRecoveryError(t(uiKeys.storageMigration.sourceOutside, { path: source }));
    await noLinks(source, t);
    const stat = await fs.stat(source); if (!stat.isFile()) throw new StateRecoveryError(t(uiKeys.storageMigration.sourceUnreadable, { path: source }));
    const target = path.join(tx.targetRoot, path.relative(tx.sourceRoot, source));
    if (targets.has(key(target))) throw new StateRecoveryError(t(uiKeys.storageMigration.targetDuplicate, { path: target })); targets.add(key(target));
    const entry = { source, target, hash: await hash(source), size: stat.size, existing: await exists(target) };
    if (entry.existing) await verify(target, entry, t);
    tx.entries.push(entry);
    emit(onProgress, "scanning", index + 1, uniqueFiles.length, t(uiKeys.storageMigration.scanningFiles, { current: index + 1, total: uniqueFiles.length }));
  }
  const sources = new Set(tx.entries.map(entry => key(entry.source)));
  if (tx.entries.some(entry => sources.has(key(entry.target)))) throw new StateRecoveryError(t(uiKeys.storageMigration.overlap));
  return tx;
}

async function transfer(source: string, target: string, entry: RelocationEntry, removeSource: boolean, onBytes: ((value: number) => void) | undefined, t: Translate): Promise<void> {
  await verify(source, entry, t); await noLinks(target, t);
  if (await exists(target)) throw new StateRecoveryError(t(uiKeys.storageMigration.targetOccupiedPreserved, { path: target }));
  await fs.mkdir(path.dirname(target), { recursive: true });
  if (removeSource) {
    try { await fs.rename(source, target); await verify(target, entry, t); return; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error; }
  }
  // Cross-volume moves cannot rename. Keep the source until the durable state commits.
  const temporary = `${target}.${randomUUID()}.relocation-partial`;
  try {
    let transferred = 0, lastReport = 0;
    const meter = new Transform({ transform(chunk, _encoding, callback) {
      transferred += chunk.length;
      if (Date.now() - lastReport >= 100) { onBytes?.(transferred); lastReport = Date.now(); }
      callback(null, chunk);
    } });
    await pipeline(createReadStream(source), meter, createWriteStream(temporary, { flags: "wx" }));
    onBytes?.(transferred);
    const handle = await fs.open(temporary, "r+"); try { await handle.sync(); } finally { await handle.close(); }
    await verify(temporary, entry, t);
    // Exclusive installation prevents overwriting a target created during transfer.
    await fs.link(temporary, target); await fs.unlink(temporary);
    if (removeSource) { await verify(source, entry, t); await fs.unlink(source); }
  } finally { await fs.rm(temporary, { force: true }).catch(() => undefined); }
}

export async function prepareRelocation(tx: FileRelocation, onProgress?: RelocationProgress, t: Translate = createNativeTranslator(undefined).t): Promise<void> {
  if (await exists(tx.journal)) throw new StateRecoveryError(t(uiKeys.storageMigration.pending));
  await journal(tx);
  try {
    await fs.mkdir(tx.targetRoot, { recursive: true }); await noLinks(tx.targetRoot, t);
    for (const [index, entry] of tx.entries.entries()) {
      emit(onProgress, "moving", index, tx.entries.length, t(uiKeys.storageMigration.movingFiles, { current: index + 1, total: tx.entries.length }));
      if (entry.existing) await verify(entry.target, entry, t);
      else {
        // Same-volume moves preserve the inode. EXDEV uses verified transfer,
        // retaining source data until the locator/settings commit succeeds.
        await verify(entry.source, entry, t); await noLinks(entry.target, t);
        await fs.mkdir(path.dirname(entry.target), { recursive: true });
        if (await exists(entry.target)) throw new StateRecoveryError(t(uiKeys.storageMigration.targetOccupied, { path: entry.target }));
        try { await fs.rename(entry.source, entry.target); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
          await transfer(entry.source, entry.target, entry, false, bytes => emit(onProgress, "moving", index, tx.entries.length, t(uiKeys.storageMigration.crossVolume, { bytes: bytes.toLocaleString(), total: entry.size.toLocaleString(), filename: path.basename(entry.source) })), t);
        }
      }
      emit(onProgress, "moving", index + 1, tx.entries.length, t(uiKeys.storageMigration.movedFiles, { current: index + 1, total: tx.entries.length }));
    }
    for (const [index, entry] of tx.entries.entries()) {
      await verify(entry.target, entry, t);
      emit(onProgress, "verifying", index + 1, tx.entries.length, t(uiKeys.storageMigration.verifiedFiles, { current: index + 1, total: tx.entries.length }));
    }
  } catch (error) { await rollbackRelocation(tx, t); throw error; }
}

async function pruneEmpty(tx: FileRelocation, t: Translate): Promise<void> {
  const directories = new Set<string>();
  async function walk(folder: string): Promise<void> {
    await noLinks(folder, t);
    const entries = await fs.readdir(folder, { withFileTypes: true }).catch(error => { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; });
    for (const entry of entries) if (entry.isDirectory() && !entry.isSymbolicLink()) {
      const nested = path.join(folder, entry.name); directories.add(nested); await walk(nested);
    }
  }
  if (tx.kind === "library") await walk(tx.sourceRoot);
  for (const entry of tx.entries) for (let folder = path.dirname(entry.source); within(tx.sourceRoot, folder); folder = path.dirname(folder)) directories.add(folder);
  for (const folder of [...directories].sort((a, b) => b.length - a.length).concat(tx.sourceRoot)) {
    try { await fs.rmdir(folder); } catch (error) { if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error; }
  }
}
export async function finishRelocation(tx: FileRelocation, onProgress?: RelocationProgress, t: Translate = createNativeTranslator(undefined).t): Promise<void> {
  // Verify the entire destination before removing any cross-volume source.
  for (const entry of tx.entries) await verify(entry.target, entry, t);
  for (const [index, entry] of tx.entries.entries()) {
    if (await exists(entry.source)) { await verify(entry.source, entry, t); await fs.unlink(entry.source); }
    emit(onProgress, "cleaning", index + 1, tx.entries.length, t(uiKeys.storageMigration.finishedFiles, { current: index + 1, total: tx.entries.length }));
  }
  await pruneEmpty(tx, t); await fs.unlink(tx.journal);
}
export async function rollbackRelocation(tx: FileRelocation, t: Translate = createNativeTranslator(undefined).t): Promise<void> {
  for (const entry of [...tx.entries].reverse()) {
    const source = await exists(entry.source), target = await exists(entry.target);
    if (!source && !target) throw new StateRecoveryError(t(uiKeys.storageMigration.recoveryFilesMissing));
    if (!source) await transfer(entry.target, entry.source, entry, true, undefined, t);
    else {
      await verify(entry.source, entry, t);
      if (target && !entry.existing) { await verify(entry.target, entry, t); await fs.unlink(entry.target); }
    }
  }
  await pruneEmpty({ ...tx, sourceRoot: tx.targetRoot, entries: tx.entries.map(entry => ({ ...entry, source: entry.target })) }, t);
  await fs.unlink(tx.journal);
}

/** A durable state is the authority, including a crash between state commit and cleanup. */
export async function recoverRelocations(stateFile: string, state: Pick<AppState, "settings" | "libraryStorage">, t: Translate = createNativeTranslator(state.settings.uiLocale).t): Promise<void> {
  for (const kind of ["library", "video", "image"] as const) {
    const filename = relocationJournal(stateFile, kind), raw = await readOptionalFile(filename); if (raw === undefined) continue;
    const tx = JSON.parse(raw) as FileRelocation;
    if (tx.format !== 1 || tx.kind !== kind || tx.journal !== filename || !Array.isArray(tx.entries) || !path.isAbsolute(tx.sourceRoot) || !path.isAbsolute(tx.targetRoot) || (kind === "library" && (within(tx.sourceRoot, tx.targetRoot) || within(tx.targetRoot, tx.sourceRoot))) || key(tx.sourceRoot) === key(tx.targetRoot) || tx.entries.some(entry => !within(tx.sourceRoot, entry.source) || !within(tx.targetRoot, entry.target) || !/^[a-f0-9]{64}$/.test(entry.hash) || !Number.isSafeInteger(entry.size) || entry.size < 0)) throw new StateRecoveryError(t(uiKeys.storageMigration.journalInvalid));
    const active = kind === "library" ? state.libraryStorage?.directory : kind === "video" ? state.settings.outputDirectory : state.settings.imageOutputDirectory;
    if ((active && key(active) === key(tx.targetRoot)) || (kind !== "library" && tx.targetSetting !== undefined && active === tx.targetSetting)) await finishRelocation(tx, undefined, t);
    else if ((active && key(active) === key(tx.sourceRoot)) || (kind !== "library" && tx.sourceSetting !== undefined && active === tx.sourceSetting)) await rollbackRelocation(tx, t);
    else throw new StateRecoveryError(t(uiKeys.storageMigration.journalMismatch));
  }
}
