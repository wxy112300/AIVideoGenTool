import { createHash, randomUUID } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import type {
  AppState,
  ImageAssetLibraryProgress,
  ImageAssetLibraryResult,
  ImageAssetLibraryScan,
  ImageReference
} from "../../src/types.js";

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tif", ".tiff"]);

type ProgressReporter = (progress: ImageAssetLibraryProgress) => void;

interface ReferenceHandle {
  path: string;
  update(nextPath: string, hash: string, relativePath: string): void;
}

function normalizedPath(value: string): string {
  return path.resolve(value).replace(/[\\/]+$/u, "").toLowerCase();
}

function isCanonicalManagedImage(libraryDirectory: string, candidate: string): boolean {
  if (!isPathInsideImageLibrary(libraryDirectory, candidate)) return false;
  const relative = path.relative(libraryDirectory, candidate).replaceAll(path.sep, "/");
  return /^sources\/[a-f0-9]{64}\.(?:png|jpe?g|webp|bmp|gif|tiff?)$/iu.test(relative);
}

export function isPathInsideImageLibrary(libraryDirectory: string, candidate: string): boolean {
  const root = normalizedPath(libraryDirectory);
  const resolved = normalizedPath(candidate);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`);
}

export async function hashImageFile(filename: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filename);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

function referenceHandles(state: AppState): ReferenceHandle[] {
  const handles: ReferenceHandle[] = [];
  const addPathReference = (
    sourcePath: string | undefined,
    updatePath: (nextPath: string) => void
  ) => {
    if (!sourcePath?.trim()) return;
    handles.push({
      path: sourcePath,
      update(nextPath) {
        updatePath(nextPath);
      }
    });
  };
  const addVideoInputReferences = (target: {
    startImagePath?: string;
    endImagePath?: string;
    h3ReferenceSlots?: Array<{ mediaType: "image" | "video"; mediaPath: string }>;
  }) => {
    addPathReference(target.startImagePath, (nextPath) => {
      target.startImagePath = nextPath;
    });
    addPathReference(target.endImagePath, (nextPath) => {
      target.endImagePath = nextPath;
    });
    target.h3ReferenceSlots?.forEach((slot) => {
      if (slot.mediaType !== "image") return;
      addPathReference(slot.mediaPath, (nextPath) => {
        slot.mediaPath = nextPath;
      });
    });
  };
  const addReference = (reference: ImageReference) => {
    if (!reference.absolutePath?.trim()) return;
    handles.push({
      path: reference.absolutePath,
      update(nextPath, hash, relativePath) {
        if (!reference.originalPath && normalizedPath(reference.absolutePath) !== normalizedPath(nextPath)) {
          reference.originalPath = reference.absolutePath;
        }
        reference.absolutePath = nextPath;
        reference.contentHash = hash;
        reference.managedRelativePath = relativePath.replaceAll(path.sep, "/");
      }
    });
    if (reference.markup?.renderedPath?.trim()) {
      handles.push({
        path: reference.markup.renderedPath,
        update(nextPath) {
          if (reference.markup) reference.markup.renderedPath = nextPath;
        }
      });
    }
    if (reference.crop?.croppedPath?.trim()) {
      handles.push({
        path: reference.crop.croppedPath,
        update(nextPath) {
          if (reference.crop) reference.crop.croppedPath = nextPath;
        }
      });
    }
  };

  state.imageDraft.pictures.forEach(addReference);
  addVideoInputReferences(state.draft);
  for (const task of state.queue) {
    if (task.taskType === "image-generation") task.pictures.forEach(addReference);
    else if (task.taskType === "generation") addVideoInputReferences(task);
  }
  for (const project of state.imageHistory) {
    for (const version of project.versions) {
      version.references.forEach(addReference);
      if (version.kind !== "source" || !version.file.absolutePath?.trim()) continue;
      const sourceFile = version.file;
      const sourcePath = sourceFile.absolutePath!;
      handles.push({
        path: sourcePath,
        update(nextPath, _hash, relativePath) {
          sourceFile.absolutePath = nextPath;
          sourceFile.filename = path.basename(nextPath);
          sourceFile.subfolder = path.dirname(relativePath).replaceAll(path.sep, "/");
          sourceFile.type = "input";
        }
      });
    }
  }
  state.history.forEach(addVideoInputReferences);
  return handles;
}

async function walkImages(directory: string): Promise<string[]> {
  const result: string[] = [];
  const visit = async (current: string) => {
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase())) result.push(absolute);
    }
  };
  await visit(directory);
  return result;
}

export async function scanImageAssetLibrary(
  state: AppState,
  libraryDirectory: string,
  report?: ProgressReporter
): Promise<ImageAssetLibraryScan> {
  const library = path.resolve(libraryDirectory);
  const handles = referenceHandles(state);
  const unique = new Map<string, string>();
  handles.forEach((handle) => unique.set(normalizedPath(handle.path), handle.path));
  const referencedManaged = new Set<string>();
  let managedReferences = 0;
  let archiveCandidates = 0;
  let archiveBytes = 0;
  const missingReferences: string[] = [];
  let current = 0;

  for (const sourcePath of unique.values()) {
    current += 1;
    report?.({ phase: "scanning", current, total: unique.size, message: `正在检查 ${path.basename(sourcePath)}` });
    const stat = await fs.stat(sourcePath).catch(() => null);
    if (!stat?.isFile()) {
      missingReferences.push(sourcePath);
      continue;
    }
    if (isPathInsideImageLibrary(library, sourcePath)) {
      managedReferences += 1;
      referencedManaged.add(normalizedPath(sourcePath));
      if (!isCanonicalManagedImage(library, sourcePath)) {
        archiveCandidates += 1;
        archiveBytes += stat.size;
      }
    } else {
      archiveCandidates += 1;
      archiveBytes += stat.size;
    }
  }

  const libraryFiles = await walkImages(library);
  const orphanFiles = [];
  let orphanBytes = 0;
  for (const filename of libraryFiles) {
    if (referencedManaged.has(normalizedPath(filename))) continue;
    const stat = await fs.stat(filename).catch(() => null);
    if (!stat?.isFile()) continue;
    const size = stat.size;
    orphanBytes += size;
    orphanFiles.push({
      absolutePath: filename,
      relativePath: path.relative(library, filename).replaceAll(path.sep, "/"),
      size
    });
  }
  return {
    libraryDirectory: library,
    totalReferences: unique.size,
    managedReferences,
    archiveCandidates,
    missingReferences,
    orphanFiles,
    archiveBytes,
    orphanBytes
  };
}

async function archiveFile(sourcePath: string, library: string): Promise<{
  absolutePath: string;
  hash: string;
  relativePath: string;
}> {
  const hash = await hashImageFile(sourcePath);
  const extension = imageExtensions.has(path.extname(sourcePath).toLowerCase())
    ? path.extname(sourcePath).toLowerCase()
    : ".png";
  const relativePath = path.join("sources", `${hash}${extension}`);
  const destination = path.join(library, relativePath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const existing = await fs.stat(destination).catch(() => null);
  if (existing?.isFile() && await hashImageFile(destination) !== hash) {
    throw new Error(`素材库中的哈希文件校验失败，请先保留该文件并重新扫描：${destination}`);
  }
  if (!existing?.isFile()) {
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await fs.copyFile(sourcePath, temporary);
    if (await hashImageFile(temporary) !== hash) {
      await fs.rm(temporary, { force: true });
      throw new Error(`素材复制校验失败：${sourcePath}`);
    }
    await fs.rename(temporary, destination).catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
      if (await hashImageFile(destination) !== hash) {
        await fs.rm(temporary, { force: true });
        throw new Error(`素材归档发生哈希冲突：${destination}`);
      }
      await fs.rm(temporary, { force: true });
    });
  }
  return { absolutePath: destination, hash, relativePath };
}

export async function archiveImagePaths(
  sourcePaths: readonly string[],
  libraryDirectory: string
): Promise<string[]> {
  const library = path.resolve(libraryDirectory);
  await fs.mkdir(library, { recursive: true });
  const archivedByPath = new Map<string, Awaited<ReturnType<typeof archiveFile>>>();
  const archivedPaths: string[] = [];
  for (const sourcePath of sourcePaths) {
    const stat = await fs.stat(sourcePath).catch(() => null);
    if (!stat?.isFile()) throw new Error(`图片素材不存在：${sourcePath}`);
    const key = normalizedPath(sourcePath);
    let archived = archivedByPath.get(key);
    if (!archived) {
      archived = await archiveFile(sourcePath, library);
      archivedByPath.set(key, archived);
    }
    archivedPaths.push(archived.absolutePath);
  }
  return archivedPaths;
}

export async function archiveImageReferences(
  references: ImageReference[],
  libraryDirectory: string
): Promise<ImageReference[]> {
  const next = structuredClone(references);
  const library = path.resolve(libraryDirectory);
  await fs.mkdir(library, { recursive: true });
  const archivedByPath = new Map<string, Awaited<ReturnType<typeof archiveFile>>>();
  for (const reference of next) {
    const sourcePath = reference.absolutePath;
    const stat = await fs.stat(sourcePath).catch(() => null);
    if (!stat?.isFile()) throw new Error(`图片素材不存在：${sourcePath}`);
    const key = normalizedPath(sourcePath);
    let archived = archivedByPath.get(key);
    if (!archived) {
      archived = await archiveFile(sourcePath, library);
      archivedByPath.set(key, archived);
    }
    if (!reference.originalPath && normalizedPath(sourcePath) !== normalizedPath(archived.absolutePath)) {
      reference.originalPath = sourcePath;
    }
    reference.absolutePath = archived.absolutePath;
    reference.contentHash = archived.hash;
    reference.managedRelativePath = archived.relativePath.replaceAll(path.sep, "/");
    if (reference.markup?.renderedPath?.trim()) {
      const rendered = await archiveFile(reference.markup.renderedPath, library);
      reference.markup.renderedPath = rendered.absolutePath;
    }
    if (reference.crop?.croppedPath?.trim()) {
      const cropped = await archiveFile(reference.crop.croppedPath, library);
      reference.crop.croppedPath = cropped.absolutePath;
    }
  }
  return next;
}

export async function organizeImageAssetLibrary(
  state: AppState,
  libraryDirectory: string,
  report?: ProgressReporter
): Promise<{ state: AppState; result: ImageAssetLibraryResult }> {
  const next = structuredClone(state);
  const library = path.resolve(libraryDirectory);
  await fs.mkdir(library, { recursive: true });
  const handles = referenceHandles(next);
  const groups = new Map<string, ReferenceHandle[]>();
  for (const handle of handles) {
    const key = normalizedPath(handle.path);
    groups.set(key, [...(groups.get(key) ?? []), handle]);
  }
  let archivedFiles = 0;
  let reorganizedFiles = 0;
  let updatedReferences = 0;
  let current = 0;
  for (const group of groups.values()) {
    current += 1;
    const sourcePath = group[0]!.path;
    report?.({ phase: "archiving", current, total: groups.size, message: `正在归档 ${path.basename(sourcePath)}` });
    const stat = await fs.stat(sourcePath).catch(() => null);
    if (!stat?.isFile()) continue;
    const archived = await archiveFile(sourcePath, library);
    if (!isPathInsideImageLibrary(library, sourcePath)) archivedFiles += 1;
    else if (normalizedPath(sourcePath) !== normalizedPath(archived.absolutePath)) reorganizedFiles += 1;
    for (const handle of group) {
      handle.update(archived.absolutePath, archived.hash, archived.relativePath);
      updatedReferences += 1;
    }
  }
  report?.({ phase: "verifying", current: groups.size, total: groups.size, message: "正在校验素材库与历史引用" });
  const scan = await scanImageAssetLibrary(next, library);
  report?.({ phase: "committing", current: 1, total: 1, message: "正在保存历史引用" });
  return {
    state: next,
    result: { scan, archivedFiles, reorganizedFiles, updatedReferences, cleanedFiles: 0, cleanedDirectories: 0, cleanedBytes: 0 }
  };
}

async function removeEmptySourceDirectories(libraryDirectory: string): Promise<number> {
  const sourcesRoot = path.join(path.resolve(libraryDirectory), "sources");
  let removed = 0;
  const visit = async (directory: string): Promise<void> => {
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      await visit(path.join(directory, entry.name));
    }
    if (normalizedPath(directory) === normalizedPath(sourcesRoot)) return;
    const remaining = await fs.readdir(directory).catch(() => ["unavailable"]);
    if (remaining.length) return;
    await fs.rmdir(directory).catch(() => undefined);
    const stillExists = await fs.stat(directory).catch(() => null);
    if (!stillExists) removed += 1;
  };
  await visit(sourcesRoot);
  return removed;
}

export async function cleanupImageAssetLibrary(
  state: AppState,
  libraryDirectory: string,
  requestedPaths: string[],
  report?: ProgressReporter
): Promise<ImageAssetLibraryResult> {
  const before = await scanImageAssetLibrary(state, libraryDirectory);
  const validOrphans = new Map(before.orphanFiles.map((file) => [normalizedPath(file.absolutePath), file]));
  let cleanedFiles = 0;
  let cleanedBytes = 0;
  let current = 0;
  for (const requested of [...new Set(requestedPaths)]) {
    current += 1;
    report?.({ phase: "cleaning", current, total: requestedPaths.length, message: `正在清理 ${path.basename(requested)}` });
    const orphan = validOrphans.get(normalizedPath(requested));
    if (!orphan || !isPathInsideImageLibrary(libraryDirectory, orphan.absolutePath)) continue;
    await fs.rm(orphan.absolutePath, { force: true });
    cleanedFiles += 1;
    cleanedBytes += orphan.size;
  }
  const cleanedDirectories = await removeEmptySourceDirectories(libraryDirectory);
  const scan = await scanImageAssetLibrary(state, libraryDirectory);
  return { scan, archivedFiles: 0, reorganizedFiles: 0, updatedReferences: 0, cleanedFiles, cleanedDirectories, cleanedBytes };
}
