import path from "node:path";
import type { HistoryFile } from "../types.js";

const outputCollectionKeys = new Set([
  "images",
  "gifs",
  "videos",
  "audio",
  "files"
]);

export function extractComfyOutputFiles(value: unknown): HistoryFile[] {
  const results: HistoryFile[] = [];
  const seen = new Set<string>();

  const add = (candidate: Record<string, unknown>) => {
    if (typeof candidate.filename !== "string" || !candidate.filename.trim()) return;
    const file: HistoryFile = {
      filename: candidate.filename,
      subfolder:
        typeof candidate.subfolder === "string" ? candidate.subfolder : "",
      type: typeof candidate.type === "string" ? candidate.type : "output",
      format: typeof candidate.format === "string" ? candidate.format : undefined
    };
    const key = `${file.type}\0${file.subfolder}\0${file.filename}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push(file);
    }
  };

  const visit = (node: unknown, collectionKey = ""): void => {
    if (Array.isArray(node)) {
      for (const item of node) {
        if (
          outputCollectionKeys.has(collectionKey) &&
          item &&
          typeof item === "object"
        ) {
          add(item as Record<string, unknown>);
        }
        visit(item, collectionKey);
      }
      return;
    }
    if (!node || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      visit(child, key);
    }
  };

  visit(value);
  return results;
}

export function attachAbsoluteOutputPaths(
  files: HistoryFile[],
  outputDirectory: string
): HistoryFile[] {
  if (!outputDirectory.trim()) return files;
  return files.map((file) => ({
    ...file,
    absolutePath: path.resolve(outputDirectory, file.subfolder, file.filename)
  }));
}
