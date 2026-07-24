import path from "node:path";
import type { HistoryAsset } from "../types.js";

const videoExtensions = new Set([".mp4", ".webm", ".mov", ".m4v", ".mkv"]);

export function historyVideoPaths(
  asset: HistoryAsset,
  outputDirectory: string
): string[] {
  const results = new Set<string>();
  for (const file of asset.files) {
    if (!videoExtensions.has(path.extname(file.filename).toLowerCase())) continue;
    const filename =
      file.absolutePath ||
      (outputDirectory.trim()
        ? path.resolve(outputDirectory, file.subfolder, file.filename)
        : "");
    if (filename) results.add(path.resolve(filename));
  }
  return [...results];
}
