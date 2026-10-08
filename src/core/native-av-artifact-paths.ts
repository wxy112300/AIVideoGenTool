import path from "node:path";
import type { HistoryFile } from "../types.js";
import { H3_CONTINUATION_ARTIFACT_SUBFOLDER } from "./h3-continuation-artifact.js";

/** Keep migrated AV references inside the shared output root; rebase legacy references. */
export function resolveNativeAvArtifactFilePath(outputDirectory: string, file: HistoryFile): string | undefined {
  if (!outputDirectory.trim() || file.type !== "output" ||
      file.subfolder !== H3_CONTINUATION_ARTIFACT_SUBFOLDER || !file.filename ||
      path.basename(file.filename) !== file.filename || file.filename.includes("..")) return undefined;
  const root = path.resolve(outputDirectory);
  if (file.absolutePath && path.isAbsolute(file.absolutePath)) {
    const recorded = path.resolve(file.absolutePath);
    const relative = path.relative(root, recorded);
    if (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) &&
        path.basename(recorded) === file.filename &&
        path.basename(path.dirname(recorded)) === H3_CONTINUATION_ARTIFACT_SUBFOLDER) return recorded;
  }
  return path.resolve(root, H3_CONTINUATION_ARTIFACT_SUBFOLDER, file.filename);
}
