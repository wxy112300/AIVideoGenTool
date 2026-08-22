import path from "node:path";
import { safeOutputFilePath } from "./comfy-output-paths.js";
export function historyFileCandidates(file, settings) {
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
                .filter((candidate) => candidate !== null)
        ].filter(Boolean))];
}
