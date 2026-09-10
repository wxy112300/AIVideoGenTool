import type { HistoryFile } from "../types.js";

/**
 * Managed output naming for the upstream Motion Context cache.
 *
 * This is deliberately a sibling of `h3-native-av`, not a Native AV
 * artifact itself. The two safetensors formats have different contracts.
 */
export const H3_MOTION_CONTEXT_SUBFOLDER = "h3-motion-context";
export const H3_MOTION_CONTEXT_FILENAME = "clip_00001.safetensors";

const legacyMotionContextSubfolder = "h3_context";

export function isH3MotionContextHistoryFile(
  file: Pick<HistoryFile, "filename" | "subfolder" | "type">
): boolean {
  const subfolder = file.subfolder.trim().replaceAll("\\", "/").toLowerCase();
  const root = H3_MOTION_CONTEXT_SUBFOLDER.toLowerCase();
  const legacyRoot = legacyMotionContextSubfolder.toLowerCase();
  return file.type === "output" &&
    (subfolder === root || subfolder.startsWith(`${root}/`) ||
      subfolder === legacyRoot || subfolder.startsWith(`${legacyRoot}/`)) &&
    file.filename.trim().toLowerCase().endsWith(".safetensors") &&
    !file.filename.includes("/") &&
    !file.filename.includes("\\");
}

/**
 * Reconstruct the managed Motion Context output descriptor from its persisted
 * absolute path. Existing file metadata wins when the path has already been
 * restored, so the renderer keeps the recorded size and current location.
 */
export function h3MotionContextHistoryFileForPath(
  value: string | undefined,
  knownFiles: readonly HistoryFile[] = []
): HistoryFile | undefined {
  const normalized = value?.trim().replaceAll("\\", "/");
  if (!normalized) return undefined;
  const parts = normalized.split("/").filter(Boolean);
  const filename = parts.at(-1);
  if (!filename || !filename.toLowerCase().endsWith(".safetensors")) return undefined;
  let folderIndex = -1;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]!.toLowerCase();
    if (part === H3_MOTION_CONTEXT_SUBFOLDER.toLowerCase() || part === legacyMotionContextSubfolder) {
      folderIndex = index;
    }
  }
  if (folderIndex < 0) return undefined;
  const subfolder = parts.slice(folderIndex, -1).join("/");
  const known = knownFiles.find((file) =>
    isH3MotionContextHistoryFile(file) &&
    file.filename.toLowerCase() === filename.toLowerCase() &&
    file.subfolder.replaceAll("\\", "/").toLowerCase() === subfolder.toLowerCase()
  );
  return known ?? {
    filename,
    subfolder,
    type: "output",
    format: "safetensors",
    absolutePath: value
  };
}

export function h3MotionContextSavePrefixForTask(taskId: string): string {
  return `${H3_MOTION_CONTEXT_SUBFOLDER}/${taskId}/clip`;
}
