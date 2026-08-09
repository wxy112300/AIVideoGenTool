import path from "node:path";
import type { HistoryFile, Settings } from "../types.js";

type HistoryPathSettings = Pick<
  Settings,
  "outputDirectory" | "modelDirectory" | "comfyInstallDirectory"
>;

export function historyFileCandidates(
  file: HistoryFile,
  settings: HistoryPathSettings
): string[] {
  const relativeParts = [file.subfolder, file.filename].filter(Boolean);
  const roots = [
    settings.outputDirectory,
    settings.modelDirectory
      ? path.join(path.dirname(settings.modelDirectory), "output")
      : "",
    settings.comfyInstallDirectory
      ? path.join(settings.comfyInstallDirectory, "output")
      : "",
    settings.comfyInstallDirectory
      ? path.join(settings.comfyInstallDirectory, "ComfyUI", "output")
      : ""
  ].filter((value) => value.trim());

  return [...new Set([
    file.absolutePath ? path.resolve(file.absolutePath) : "",
    ...roots.map((root) => path.resolve(root, ...relativeParts))
  ].filter(Boolean))];
}
