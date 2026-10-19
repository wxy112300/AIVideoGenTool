import { promises as nodeFs } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import type {
  AppCacheClearResult,
  AppCacheProgress,
  AppCacheSnapshot
} from "../../src/types.js";

const DEFAULT_STALE_AFTER_MS = 10 * 60 * 1000;
const TEMPORARY_DIRECTORY_PREFIX = "local-video-studio";
const fs: typeof nodeFs = process.versions.electron
  ? createRequire(import.meta.url)("original-fs").promises : nodeFs;

export interface AppCacheSession {
  getCacheSize(): Promise<number>;
  clearCache(): Promise<void>;
  clearCodeCaches?(options: { urls?: string[] }): Promise<void>;
}

export interface AppCacheServiceOptions {
  session: AppCacheSession;
  temporaryRoot?: string;
  canClearTemporary?: () => boolean;
  now?: () => Date;
  staleAfterMs?: number;
  software?: AppSoftwareCache;
}
export interface SoftwareCacheTarget { path: string; identity: string }
export interface AppSoftwareCache {
  inspect(): Promise<SoftwareCacheTarget[]>;
  clear(target: SoftwareCacheTarget): Promise<void>;
  withCleanup<T>(work: () => Promise<T>): Promise<T>;
}

interface TemporaryCacheTarget {
  path: string;
  bytes: number;
  latestModifiedAtMs: number;
  software?: SoftwareCacheTarget;
}

interface DirectoryMeasure {
  bytes: number;
  latestModifiedAtMs: number;
}

interface AppCacheInspection {
  snapshot: AppCacheSnapshot;
  targets: TemporaryCacheTarget[];
}

function isManagedTemporaryDirectory(name: string): boolean {
  return name === TEMPORARY_DIRECTORY_PREFIX ||
    name.startsWith(`${TEMPORARY_DIRECTORY_PREFIX}-`);
}

function isDirectoryEntry(entry: import("node:fs").Dirent): boolean {
  return entry.isDirectory() && !entry.isSymbolicLink();
}

async function readDirectoryEntries(directory: string): Promise<import("node:fs").Dirent[]> {
  try {
    return await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function measureDirectory(directory: string): Promise<DirectoryMeasure> {
  let rootStat: import("node:fs").Stats;
  try {
    rootStat = await fs.lstat(directory);
  } catch {
    return { bytes: 0, latestModifiedAtMs: 0 };
  }
  if (!rootStat.isDirectory()) return { bytes: rootStat.isFile() ? rootStat.size : 0, latestModifiedAtMs: rootStat.mtimeMs };

  const entries = await readDirectoryEntries(directory);
  const children = await Promise.all(entries.map(async (entry) => {
    const childPath = path.join(directory, entry.name);
    if (isDirectoryEntry(entry)) return measureDirectory(childPath);
    if (!entry.isFile()) return { bytes: 0, latestModifiedAtMs: 0 };
    try {
      const stat = await fs.lstat(childPath);
      return stat.isFile()
        ? { bytes: stat.size, latestModifiedAtMs: stat.mtimeMs }
        : { bytes: 0, latestModifiedAtMs: stat.mtimeMs };
    } catch {
      return { bytes: 0, latestModifiedAtMs: 0 };
    }
  }));

  return {
    bytes: children.reduce((total, child) => total + child.bytes, 0),
    latestModifiedAtMs: children.reduce(
      (latest, child) => Math.max(latest, child.latestModifiedAtMs),
      rootStat.mtimeMs
    )
  };
}

async function temporaryCacheTargets(
  temporaryRoot: string
): Promise<TemporaryCacheTarget[]> {
  const entries = await readDirectoryEntries(temporaryRoot);
  const targets: TemporaryCacheTarget[] = [];
  for (const entry of entries) {
    if (!isDirectoryEntry(entry) || !isManagedTemporaryDirectory(entry.name)) continue;
    const directory = path.join(temporaryRoot, entry.name);
    const nestedTargets = entry.name === TEMPORARY_DIRECTORY_PREFIX ||
      entry.name === `${TEMPORARY_DIRECTORY_PREFIX}-ux-renderer`
      ? (await readDirectoryEntries(directory))
        .filter(isDirectoryEntry)
        .map((child) => path.join(directory, child.name))
      : [];
    const paths = nestedTargets.length ? nestedTargets : [directory];
    for (const targetPath of paths) {
      const measured = await measureDirectory(targetPath);
      targets.push({
        path: targetPath,
        bytes: measured.bytes,
        latestModifiedAtMs: measured.latestModifiedAtMs
      });
    }
  }
  return targets;
}

export function createAppCacheService(options: AppCacheServiceOptions) {
  const temporaryRoot = options.temporaryRoot ?? os.tmpdir();
  const now = options.now ?? (() => new Date());
  const staleAfterMs = Math.max(0, options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS);

  async function inspectDetailed(): Promise<AppCacheInspection> {
    const [currentSessionBytes, temporary, software] = await Promise.all([
      options.session.getCacheSize(),
      temporaryCacheTargets(temporaryRoot),
      options.software?.inspect() ?? []
    ]);
    const targets = [...temporary, ...await Promise.all(software.map(async target => ({
      path: target.path, ...await measureDirectory(target.path), software: target
    })))];
    const temporaryBytes = targets.reduce((total, target) => total + target.bytes, 0);
    const snapshot = {
      currentSessionBytes: Math.max(0, currentSessionBytes),
      temporaryBytes,
      temporaryDirectoryCount: targets.length,
      totalBytes: Math.max(0, currentSessionBytes) + temporaryBytes,
      scannedAt: now().toISOString()
    };
    return { snapshot, targets };
  }

  async function inspect(): Promise<AppCacheSnapshot> {
    return (await inspectDetailed()).snapshot;
  }

  let clearing = false;
  async function clearUnlocked(clearOptions: {
    onProgress?: (progress: AppCacheProgress) => void;
  } = {}): Promise<AppCacheClearResult> {
    const startedAt = now().toISOString();
    const emitProgress = (
      phase: AppCacheProgress["phase"],
      current: number,
      total: number,
      processedBytes: number,
      totalBytes: number
    ): void => {
      clearOptions.onProgress?.({
        phase,
        current,
        total,
        processedBytes,
        totalBytes,
        startedAt
      });
    };

    emitProgress("scanning", 0, 0, 0, 0);
    const beforeInspection = await inspectDetailed();
    const before = beforeInspection.snapshot;
    const errors: string[] = [];
    let currentSessionCleared = false;
    emitProgress("clearing-session", 0, 0, 0, 0);
    try {
      await options.session.clearCache();
      currentSessionCleared = true;
      await options.session.clearCodeCaches?.({ urls: [] });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    const targets = beforeInspection.targets;
    const canClearTemporary = options.canClearTemporary?.() ?? true;
    const cutoff = now().getTime() - staleAfterMs;
    let skippedTemporaryDirectories = 0;
    const totalBytes = targets.reduce((total, target) => total + target.bytes, 0);
    let processedBytes = 0;
    emitProgress("clearing-temporary", 0, targets.length, 0, totalBytes);
    if (!canClearTemporary) {
      skippedTemporaryDirectories = targets.length;
    } else {
      for (let index = 0; index < targets.length; index += 1) {
        const target = targets[index];
        if (target.software) continue;
        if (!(options.canClearTemporary?.() ?? true) || target.latestModifiedAtMs > cutoff) {
          skippedTemporaryDirectories += 1;
        } else {
          try {
            await fs.rm(target.path, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
          } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
          }
        }
        processedBytes += target.bytes;
        emitProgress("clearing-temporary", index + 1, targets.length, processedBytes, totalBytes);
      }
    }
    const softwareTargets = targets.filter(target => target.software);
    if (canClearTemporary && softwareTargets.length && options.software) {
      try {
        await options.software.withCleanup(async () => {
          for (const target of softwareTargets) {
            if (!(options.canClearTemporary?.() ?? true)) { skippedTemporaryDirectories++; continue; }
            try { await options.software!.clear(target.software!); }
            catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
            processedBytes += target.bytes;
            emitProgress("clearing-temporary", targets.indexOf(target) + 1, targets.length, processedBytes, totalBytes);
          }
        });
      } catch (error) {
        skippedTemporaryDirectories += softwareTargets.length;
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (!canClearTemporary) {
      processedBytes = totalBytes;
      emitProgress("clearing-temporary", targets.length, targets.length, processedBytes, totalBytes);
    }

    emitProgress("rescanning", 0, 0, 0, 0);
    const after = await inspect();
    emitProgress("completed", targets.length, targets.length, totalBytes, totalBytes);
    return {
      before,
      after,
      clearedBytes: Math.max(0, before.totalBytes - after.totalBytes),
      currentSessionCleared,
      skippedTemporaryDirectories,
      errors
    };
  }

  async function clear(clearOptions: Parameters<typeof clearUnlocked>[0] = {}): Promise<AppCacheClearResult> {
    if (clearing) throw new Error("缓存清理正在进行，请等待完成。");
    clearing = true;
    try { return await clearUnlocked(clearOptions); } finally { clearing = false; }
  }
  return { inspect, clear };
}
