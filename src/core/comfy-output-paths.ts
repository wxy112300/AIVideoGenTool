import path from "node:path";
import type { HistoryFile } from "../types.js";

export function safeOutputFilePath(
  outputDirectory: string,
  subfolder: string,
  filename: string
): string | null {
  if (!outputDirectory.trim() || !filename.trim()) return null;
  const root = path.resolve(outputDirectory);
  const candidate = path.resolve(root, subfolder, filename);
  const relative = path.relative(root, candidate);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) return null;
  return candidate;
}

export function attachAbsoluteOutputPaths(
  files: HistoryFile[],
  outputDirectory: string
): HistoryFile[] {
  return files.map((file) => {
    const absolutePath = safeOutputFilePath(
      outputDirectory,
      file.subfolder,
      file.filename
    );
    return absolutePath
      ? { ...file, absolutePath }
      : { ...file, absolutePath: undefined };
  });
}