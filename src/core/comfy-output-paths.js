import path from "node:path";
import { isVideoOutputFilename } from "./comfy-output.js";
const seedVr2SegmentMarker = /\.__lvs-segment-\d{4}/iu;
export function isSegmentedSeedVr2Output(value) {
    return Boolean(value &&
        typeof value === "object" &&
        value.segmentedSeedVr2 === true);
}
export function safeOutputFilePath(outputDirectory, subfolder, filename) {
    if (!outputDirectory.trim() || !filename.trim())
        return null;
    const root = path.resolve(outputDirectory);
    const candidate = path.resolve(root, subfolder, filename);
    const relative = path.relative(root, candidate);
    if (!relative ||
        relative === ".." ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative))
        return null;
    return candidate;
}
export function attachAbsoluteOutputPaths(files, outputDirectory) {
    return files.map((file) => {
        const absolutePath = safeOutputFilePath(outputDirectory, file.subfolder, file.filename);
        return absolutePath
            ? { ...file, absolutePath }
            : { ...file, absolutePath: undefined };
    });
}
function mergedSeedVr2File(file, outputDirectory) {
    const merged = {
        ...file,
        filename: file.filename.replace(seedVr2SegmentMarker, ""),
        absolutePath: file.absolutePath?.replace(seedVr2SegmentMarker, "")
    };
    if (merged.absolutePath)
        return merged;
    return attachAbsoluteOutputPaths([merged], outputDirectory)[0] ?? merged;
}
/**
 * SeedVR2's segmented workflow stores the raw ComfyUI segment responses for
 * diagnostics, but the durable history artifact is the merged video. Prefer
 * the recorded merged file and repair records that an older startup path
 * accidentally expanded back into already-cleaned segment files.
 */
export function restoreSegmentedSeedVr2OutputPaths(recordedFiles, reportedFiles, outputDirectory) {
    const source = recordedFiles.length ? recordedFiles : reportedFiles;
    const videos = source.filter((file) => isVideoOutputFilename(file.filename));
    if (!videos.length)
        return recordedFiles.length ? recordedFiles : reportedFiles;
    const restored = [];
    const seen = new Set();
    for (const file of videos) {
        const merged = mergedSeedVr2File(file, outputDirectory);
        const key = merged.absolutePath
            ? path.resolve(merged.absolutePath).toLowerCase()
            : `${merged.type}\0${merged.subfolder}\0${merged.filename}`.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        restored.push(merged);
    }
    return restored;
}
