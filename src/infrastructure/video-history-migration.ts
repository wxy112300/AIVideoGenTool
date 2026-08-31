import { createHash, randomUUID } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import type {
  HistoryAsset,
  HistoryFile,
  HistoryMigrationProgress,
  QueueTask
} from "../types.js";

const videoExtensions = new Set([".mp4", ".webm", ".mov", ".m4v", ".mkv"]);

export type MigrationReference =
  | {
      kind: "history";
      assetId: string;
      versionId?: string;
      fileIndex: number;
    }
  | {
      kind: "queue";
      taskId: string;
      field: "sourceVideoPath" | "sourceFilePath";
    };

export interface VideoHistoryMigrationEntry {
  sourcePath: string;
  targetPath: string;
  size: number;
  hash: string;
  references: MigrationReference[];
  targetReady: boolean;
  createdTarget: boolean;
}

export interface VideoHistoryMigrationPlan {
  oldDirectory: string;
  newDirectory: string;
  entries: VideoHistoryMigrationEntry[];
  missing: string[];
  conflicts: string[];
  totalBytes: number;
}

export interface PreparedVideoHistoryMigration {
  plan: VideoHistoryMigrationPlan;
  journalFilename: string;
}

interface MigrationJournal {
  version: 1;
  mediaKind: "video";
  phase: "moving" | "verifying" | "committed" | "cleaning";
  plan: VideoHistoryMigrationPlan;
}

export function isPathWithinDirectory(rootDirectory: string, candidate: string): boolean {
  if (!rootDirectory.trim() || !candidate.trim()) return false;
  const root = path.resolve(rootDirectory);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(root, resolvedCandidate);
  return relative === "" || (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function safeOutputPath(
  rootDirectory: string,
  subfolder: string,
  filename: string
): string | null {
  if (!rootDirectory.trim() || !filename.trim()) return null;
  const root = path.resolve(rootDirectory);
  const candidate = path.resolve(root, subfolder, filename);
  return isPathWithinDirectory(root, candidate) ? candidate : null;
}

function fileIsVideo(file: HistoryFile): boolean {
  return videoExtensions.has(path.extname(file.filename).toLowerCase());
}

function normalizedPath(filename: string): string {
  return path.resolve(filename).toLowerCase();
}

async function hashFile(filename: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(filename);
  for await (const chunk of stream) hash.update(chunk as Uint8Array);
  return hash.digest("hex");
}

async function writeJournal(filename: string, journal: MigrationJournal): Promise<void> {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(filename), { recursive: true });
  try {
    await fs.writeFile(temporary, JSON.stringify(journal, null, 2), "utf8");
    await fs.rename(temporary, filename);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}

async function removeSourceWithRetry(filename: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      await fs.rm(filename, { force: false });
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      lastError = error;
      if (attempt < 4) {
        await new Promise<void>((resolve) => setTimeout(resolve, attempt * 250));
      }
    }
  }
  throw lastError;
}

function addFileReference(
  entries: Map<string, VideoHistoryMigrationEntry>,
  history: HistoryAsset[],
  asset: HistoryAsset,
  file: HistoryFile,
  fileIndex: number,
  versionId: string | undefined,
  oldDirectory: string,
  newDirectory: string,
  missing: string[],
  conflicts: string[]
): void {
  if (!fileIsVideo(file)) return;
  const sourcePath = file.absolutePath?.trim()
    ? path.resolve(file.absolutePath)
    : safeOutputPath(oldDirectory, file.subfolder, file.filename);
  const targetPath = safeOutputPath(newDirectory, file.subfolder, file.filename);
  if (!sourcePath) {
    missing.push(`${asset.id}:${versionId ?? "asset"}:${file.filename}（缺少可解析的旧路径）`);
    return;
  }
  if (!targetPath) {
    conflicts.push(`${file.filename}（目标路径越界）`);
    return;
  }
  const key = normalizedPath(sourcePath);
  const reference: MigrationReference = {
    kind: "history",
    assetId: asset.id,
    ...(versionId ? { versionId } : {}),
    fileIndex
  };
  const existing = entries.get(key);
  if (existing) {
    if (normalizedPath(existing.targetPath) !== normalizedPath(targetPath)) {
      conflicts.push(`${sourcePath}（同一源文件对应多个目标路径）`);
      return;
    }
    existing.references.push(reference);
    return;
  }
  entries.set(key, {
    sourcePath,
    targetPath,
    size: 0,
    hash: "",
    references: [reference],
    targetReady: false,
    createdTarget: false
  });
}

function queueVideoSource(task: QueueTask): {
  field: "sourceVideoPath" | "sourceFilePath";
  path: string;
  assetId?: string;
  versionId?: string;
} | null {
  if (task.taskType === "extension") {
    return {
      field: "sourceVideoPath",
      path: task.sourceVideoPath,
      assetId: task.sourceAssetId,
      versionId: task.sourceVersionId
    };
  }
  if (task.taskType === "upscale") {
    return {
      field: "sourceFilePath",
      path: task.sourceFilePath,
      assetId: task.sourceAssetId,
      versionId: task.sourceVersionId
    };
  }
  return null;
}

function historyVersionFilePath(
  history: HistoryAsset[],
  assetId: string | undefined,
  versionId: string | undefined
): string | undefined {
  if (!assetId || !versionId) return undefined;
  const asset = history.find((item) => item.id === assetId);
  const version = asset?.versions.find((item) => item.id === versionId);
  return version?.files.find((file) => file.absolutePath && fileIsVideo(file))?.absolutePath;
}

function addQueueReference(
  entries: Map<string, VideoHistoryMigrationEntry>,
  task: QueueTask,
  history: HistoryAsset[],
  oldDirectory: string,
  newDirectory: string,
  conflicts: string[]
): void {
  const source = queueVideoSource(task);
  if (!source?.path.trim()) return;
  const linkedHistoryPath = historyVersionFilePath(history, source.assetId, source.versionId);
  const sourcePath = linkedHistoryPath || path.resolve(source.path);
  const existing = entries.get(normalizedPath(sourcePath));
  const reference: MigrationReference = {
    kind: "queue",
    taskId: task.id,
    field: source.field
  };
  if (existing) {
    existing.references.push(reference);
    return;
  }
  if (!isPathWithinDirectory(oldDirectory, sourcePath)) return;
  const relative = path.relative(path.resolve(oldDirectory), sourcePath);
  const targetPath = path.resolve(newDirectory, relative);
  if (!isPathWithinDirectory(newDirectory, targetPath)) {
    conflicts.push(`${sourcePath}（队列目标路径越界）`);
    return;
  }
  entries.set(normalizedPath(sourcePath), {
    sourcePath,
    targetPath,
    size: 0,
    hash: "",
    references: [reference],
    targetReady: false,
    createdTarget: false
  });
}

export async function planVideoHistoryMigration(
  history: HistoryAsset[],
  oldDirectory: string,
  newDirectory: string,
  queue: QueueTask[] = []
): Promise<VideoHistoryMigrationPlan> {
  const entries = new Map<string, VideoHistoryMigrationEntry>();
  const missing: string[] = [];
  const conflicts: string[] = [];
  for (const asset of history) {
    for (const [fileIndex, file] of asset.files.entries()) {
      addFileReference(
        entries,
        history,
        asset,
        file,
        fileIndex,
        undefined,
        oldDirectory,
        newDirectory,
        missing,
        conflicts
      );
    }
    for (const version of asset.versions) {
      for (const [fileIndex, file] of version.files.entries()) {
        addFileReference(
          entries,
          history,
          asset,
          file,
          fileIndex,
          version.id,
          oldDirectory,
          newDirectory,
          missing,
          conflicts
        );
      }
    }
  }
  for (const task of queue) {
    addQueueReference(entries, task, history, oldDirectory, newDirectory, conflicts);
  }

  let totalBytes = 0;
  for (const entry of entries.values()) {
    const sourceStat = await fs.stat(entry.sourcePath).catch(() => null);
    if (!sourceStat?.isFile()) {
      missing.push(entry.sourcePath);
      continue;
    }
    entry.size = sourceStat.size;
    entry.hash = await hashFile(entry.sourcePath);
    totalBytes += sourceStat.size;
    const targetStat = await fs.stat(entry.targetPath).catch(() => null);
    if (!targetStat) continue;
    if (!targetStat.isFile()) {
      conflicts.push(`${entry.targetPath}（目标不是文件）`);
      continue;
    }
    const targetHash = await hashFile(entry.targetPath);
    if (targetStat.size === entry.size && targetHash === entry.hash) {
      entry.targetReady = true;
    } else {
      conflicts.push(`${entry.targetPath}（目标文件内容不同）`);
    }
  }
  return {
    oldDirectory: path.resolve(oldDirectory),
    newDirectory: path.resolve(newDirectory),
    entries: [...entries.values()],
    missing: [...new Set(missing)],
    conflicts: [...new Set(conflicts)],
    totalBytes
  };
}

function progress(
  phase: HistoryMigrationProgress["phase"],
  current: number,
  total: number,
  message: string,
  migratedFiles: number,
  warningCount = 0
): HistoryMigrationProgress {
  return { phase, current, total, message, migratedFiles, warningCount };
}

export async function prepareVideoHistoryMigration(
  plan: VideoHistoryMigrationPlan,
  journalFilename: string,
  onProgress: (value: HistoryMigrationProgress) => void
): Promise<PreparedVideoHistoryMigration> {
  if (plan.missing.length || plan.conflicts.length) {
    throw new Error(
      `迁移预检未通过：${plan.missing.length} 个文件缺失，${plan.conflicts.length} 个目标冲突。`
    );
  }
  const journal: MigrationJournal = {
    version: 1,
    mediaKind: "video",
    phase: "moving",
    plan
  };
  await writeJournal(journalFilename, journal);
  const preparation = { plan, journalFilename };
  try {
    const total = plan.entries.length;
    let migratedFiles = 0;
    for (const [index, entry] of plan.entries.entries()) {
      onProgress(progress(
        "moving",
        index,
        total,
        `正在准备第 ${index + 1} / ${total} 个视频文件`,
        migratedFiles
      ));
      if (normalizedPath(entry.sourcePath) === normalizedPath(entry.targetPath) || entry.targetReady) {
        entry.targetReady = true;
        migratedFiles += 1;
        onProgress(progress(
          "moving",
          index + 1,
          total,
          `已准备第 ${index + 1} / ${total} 个视频文件`,
          migratedFiles
        ));
        continue;
      }
      await fs.mkdir(path.dirname(entry.targetPath), { recursive: true });
      const temporary = `${entry.targetPath}.${randomUUID()}.migration.tmp`;
      try {
        await fs.copyFile(entry.sourcePath, temporary);
        const copiedStat = await fs.stat(temporary);
        const copiedHash = await hashFile(temporary);
        if (copiedStat.size !== entry.size || copiedHash !== entry.hash) {
          throw new Error(`复制后校验失败：${entry.sourcePath}`);
        }
        await fs.rename(temporary, entry.targetPath);
        entry.targetReady = true;
        entry.createdTarget = true;
        migratedFiles += 1;
      } finally {
        await fs.rm(temporary, { force: true }).catch(() => undefined);
      }
      await writeJournal(journalFilename, journal);
      onProgress(progress(
        "moving",
        index + 1,
        total,
        `已准备第 ${index + 1} / ${total} 个视频文件`,
        migratedFiles
      ));
    }
    journal.phase = "verifying";
    await writeJournal(journalFilename, journal);
    onProgress(progress("verifying", 0, total, "正在复核目标视频文件", migratedFiles));
    for (const [index, entry] of plan.entries.entries()) {
      const targetStat = await fs.stat(entry.targetPath).catch(() => null);
      if (!targetStat?.isFile() || targetStat.size !== entry.size || await hashFile(entry.targetPath) !== entry.hash) {
        throw new Error(`目标视频复核失败：${entry.targetPath}`);
      }
      onProgress(progress(
        "verifying",
        index + 1,
        total,
        `已复核第 ${index + 1} / ${total} 个目标文件`,
        migratedFiles
      ));
    }
    return preparation;
  } catch (error) {
    await rollbackVideoHistoryMigration(preparation);
    throw error;
  }
}

export async function markVideoHistoryMigrationCommitted(
  preparation: PreparedVideoHistoryMigration
): Promise<void> {
  await writeJournal(preparation.journalFilename, {
    version: 1,
    mediaKind: "video",
    phase: "committed",
    plan: preparation.plan
  });
}

export async function cleanupVideoHistoryMigration(
  preparation: PreparedVideoHistoryMigration,
  onProgress: (value: HistoryMigrationProgress) => void
): Promise<string[]> {
  const { plan, journalFilename } = preparation;
  await writeJournal(journalFilename, {
    version: 1,
    mediaKind: "video",
    phase: "cleaning",
    plan
  });
  const warnings: string[] = [];
  const total = plan.entries.length;
  let cleaned = 0;
  for (const entry of plan.entries) {
    onProgress(progress(
      "cleaning",
      cleaned,
      total,
      `正在清理旧文件 ${cleaned + 1} / ${total}`,
      total,
      warnings.length
    ));
    if (normalizedPath(entry.sourcePath) === normalizedPath(entry.targetPath)) {
      cleaned += 1;
      continue;
    }
    try {
      await removeSourceWithRetry(entry.sourcePath);
    } catch (error) {
      warnings.push(`${entry.sourcePath}：${error instanceof Error ? error.message : String(error)}`);
    }
    cleaned += 1;
  }
  await fs.rm(journalFilename, { force: true }).catch(() => undefined);
  return warnings;
}

export async function rollbackVideoHistoryMigration(
  preparation: PreparedVideoHistoryMigration
): Promise<void> {
  for (const entry of preparation.plan.entries) {
    if (!entry.createdTarget) continue;
    await fs.rm(entry.targetPath, { force: true }).catch(() => undefined);
  }
  await fs.rm(preparation.journalFilename, { force: true }).catch(() => undefined);
}
