import { createHash, randomUUID } from "node:crypto";
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
async function noLinks(filename: string): Promise<void> {
  for (let current = path.resolve(filename);;) {
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw new StateRecoveryError(`迁移路径不能包含链接：${current}`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const parent = path.dirname(current); if (parent === current) return; current = parent;
  }
}
async function verify(filename: string, entry: RelocationEntry): Promise<void> {
  await noLinks(filename);
  const stat = await fs.stat(filename);
  if (!stat.isFile() || stat.size !== entry.size || await hash(filename) !== entry.hash) throw new StateRecoveryError(`迁移校验失败，文件已保留：${filename}`);
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
export async function relocationFiles(directory: string): Promise<string[]> {
  if (!await exists(directory)) return [];
  await noLinks(directory);
  const result: string[] = [];
  async function walk(folder: string): Promise<void> {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      const filename = path.join(folder, entry.name);
      if (entry.isSymbolicLink()) throw new StateRecoveryError(`目录包含链接，未开始迁移：${filename}`);
      if (entry.isDirectory()) await walk(filename);
      else if (entry.isFile()) result.push(filename);
      else throw new StateRecoveryError(`目录包含不支持的文件：${filename}`);
    }
  }
  await walk(directory); return result;
}

export async function planRelocation(kind: RelocationKind, sourceRoot: string, targetRoot: string, files: string[], journalFile: string, onProgress?: RelocationProgress): Promise<FileRelocation> {
  if (!path.isAbsolute(sourceRoot) || !path.isAbsolute(targetRoot) || key(sourceRoot) === key(targetRoot) || (kind === "library" && (within(sourceRoot, targetRoot) || within(targetRoot, sourceRoot)))) throw new StateRecoveryError("新旧目录必须是不同的绝对路径，资料库目录不能互相包含。");
  await noLinks(sourceRoot); await noLinks(targetRoot);
  const tx: FileRelocation = { format: 1, kind, sourceRoot: path.resolve(sourceRoot), targetRoot: path.resolve(targetRoot), entries: [], journal: journalFile };
  const targets = new Set<string>();
  const uniqueFiles = [...new Set(files.map(filename => path.resolve(filename)))];
  for (const [index, source] of uniqueFiles.entries()) {
    if (!within(sourceRoot, source)) throw new StateRecoveryError(`文件不属于选定旧目录：${source}`);
    await noLinks(source);
    const stat = await fs.stat(source); if (!stat.isFile()) throw new StateRecoveryError(`源文件不可读：${source}`);
    const target = path.join(tx.targetRoot, path.relative(tx.sourceRoot, source));
    if (targets.has(key(target))) throw new StateRecoveryError(`迁移目标重名：${target}`); targets.add(key(target));
    const entry = { source, target, hash: await hash(source), size: stat.size, existing: await exists(target) };
    if (entry.existing) await verify(target, entry);
    tx.entries.push(entry);
    emit(onProgress, "scanning", index + 1, uniqueFiles.length, `正在检查迁移文件 ${index + 1} / ${uniqueFiles.length}`);
  }
  const sources = new Set(tx.entries.map(entry => key(entry.source)));
  if (tx.entries.some(entry => sources.has(key(entry.target)))) throw new StateRecoveryError("迁移路径相互覆盖，未开始移动。");
  return tx;
}

async function transfer(source: string, target: string, entry: RelocationEntry, removeSource: boolean, onBytes?: (value: number) => void): Promise<void> {
  await verify(source, entry); await noLinks(target);
  if (await exists(target)) throw new StateRecoveryError(`目标已被占用，未覆盖：${target}`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  if (removeSource) {
    try { await fs.rename(source, target); await verify(target, entry); return; }
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
    await verify(temporary, entry);
    // Exclusive installation prevents overwriting a target created during transfer.
    await fs.link(temporary, target); await fs.unlink(temporary);
    if (removeSource) { await verify(source, entry); await fs.unlink(source); }
  } finally { await fs.rm(temporary, { force: true }).catch(() => undefined); }
}

export async function prepareRelocation(tx: FileRelocation, onProgress?: RelocationProgress): Promise<void> {
  if (await exists(tx.journal)) throw new StateRecoveryError("存在未完成的迁移，请先恢复。");
  await journal(tx);
  try {
    await fs.mkdir(tx.targetRoot, { recursive: true }); await noLinks(tx.targetRoot);
    for (const [index, entry] of tx.entries.entries()) {
      emit(onProgress, "moving", index, tx.entries.length, `正在移动文件 ${index + 1} / ${tx.entries.length}`);
      if (entry.existing) await verify(entry.target, entry);
      else {
        // Same-volume moves preserve the inode. EXDEV uses verified transfer,
        // retaining source data until the locator/settings commit succeeds.
        await verify(entry.source, entry); await noLinks(entry.target);
        await fs.mkdir(path.dirname(entry.target), { recursive: true });
        if (await exists(entry.target)) throw new StateRecoveryError(`目标已被占用：${entry.target}`);
        try { await fs.rename(entry.source, entry.target); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
          await transfer(entry.source, entry.target, entry, false, bytes => emit(onProgress, "moving", index, tx.entries.length, `跨盘传输 ${bytes.toLocaleString()} / ${entry.size.toLocaleString()} 字节：${path.basename(entry.source)}`));
        }
      }
      emit(onProgress, "moving", index + 1, tx.entries.length, `已移动 ${index + 1} / ${tx.entries.length}`);
    }
    for (const [index, entry] of tx.entries.entries()) {
      await verify(entry.target, entry);
      emit(onProgress, "verifying", index + 1, tx.entries.length, `已校验 ${index + 1} / ${tx.entries.length}`);
    }
  } catch (error) { await rollbackRelocation(tx); throw error; }
}

async function pruneEmpty(tx: FileRelocation): Promise<void> {
  const directories = new Set<string>();
  async function walk(folder: string): Promise<void> {
    await noLinks(folder);
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
export async function finishRelocation(tx: FileRelocation, onProgress?: RelocationProgress): Promise<void> {
  // Verify the entire destination before removing any cross-volume source.
  for (const entry of tx.entries) await verify(entry.target, entry);
  for (const [index, entry] of tx.entries.entries()) {
    if (await exists(entry.source)) { await verify(entry.source, entry); await fs.unlink(entry.source); }
    emit(onProgress, "cleaning", index + 1, tx.entries.length, `已完成移动 ${index + 1} / ${tx.entries.length}`);
  }
  await pruneEmpty(tx); await fs.unlink(tx.journal);
}
export async function rollbackRelocation(tx: FileRelocation): Promise<void> {
  for (const entry of [...tx.entries].reverse()) {
    const source = await exists(entry.source), target = await exists(entry.target);
    if (!source && !target) throw new StateRecoveryError("迁移文件缺失，已停止自动恢复。");
    if (!source) await transfer(entry.target, entry.source, entry, true);
    else {
      await verify(entry.source, entry);
      if (target && !entry.existing) { await verify(entry.target, entry); await fs.unlink(entry.target); }
    }
  }
  await pruneEmpty({ ...tx, sourceRoot: tx.targetRoot, entries: tx.entries.map(entry => ({ ...entry, source: entry.target })) });
  await fs.unlink(tx.journal);
}

/** A durable state is the authority, including a crash between state commit and cleanup. */
export async function recoverRelocations(stateFile: string, state: Pick<AppState, "settings" | "libraryStorage">): Promise<void> {
  for (const kind of ["library", "video", "image"] as const) {
    const filename = relocationJournal(stateFile, kind), raw = await readOptionalFile(filename); if (raw === undefined) continue;
    const tx = JSON.parse(raw) as FileRelocation;
    if (tx.format !== 1 || tx.kind !== kind || tx.journal !== filename || !Array.isArray(tx.entries) || !path.isAbsolute(tx.sourceRoot) || !path.isAbsolute(tx.targetRoot) || (kind === "library" && (within(tx.sourceRoot, tx.targetRoot) || within(tx.targetRoot, tx.sourceRoot))) || key(tx.sourceRoot) === key(tx.targetRoot) || tx.entries.some(entry => !within(tx.sourceRoot, entry.source) || !within(tx.targetRoot, entry.target) || !/^[a-f0-9]{64}$/.test(entry.hash) || !Number.isSafeInteger(entry.size) || entry.size < 0)) throw new StateRecoveryError("迁移日志无效，原件已保留。");
    const active = kind === "library" ? state.libraryStorage?.directory : kind === "video" ? state.settings.outputDirectory : state.settings.imageOutputDirectory;
    if ((active && key(active) === key(tx.targetRoot)) || (kind !== "library" && tx.targetSetting !== undefined && active === tx.targetSetting)) await finishRelocation(tx);
    else if ((active && key(active) === key(tx.sourceRoot)) || (kind !== "library" && tx.sourceSetting !== undefined && active === tx.sourceSetting)) await rollbackRelocation(tx);
    else throw new StateRecoveryError("迁移日志与当前目录不匹配，原件已保留。");
  }
}
