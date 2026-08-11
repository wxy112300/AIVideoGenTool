import path from "node:path";
import type { HistoryFile, Settings } from "../types.js";
import { safeOutputFilePath } from "./comfy-output-paths.js";

type HistoryPathSettings = Pick<
  Settings,
  "outputDirectory" | "modelDirectory" | "comfyInstallDirectory"
> & Partial<Pick<Settings, "imageOutputDirectory">>;

export function historyFileCandidates(
  file: HistoryFile,
  settings: HistoryPathSettings
): string[] {
  const roots = [
    settings.imageOutputDirectory ?? "",
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
    ...roots
      .map((root) => safeOutputFilePath(root, file.subfolder, file.filename))
      .filter((candidate): candidate is string => candidate !== null)
  ].filter(Boolean))];
}
