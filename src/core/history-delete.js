import path from "node:path";
const videoExtensions = new Set([".mp4", ".webm", ".mov", ".m4v", ".mkv"]);
export function historyVideoVersionPaths(version, outputDirectory) {
    const results = new Set();
    for (const file of version.files) {
        if (!videoExtensions.has(path.extname(file.filename).toLowerCase()))
            continue;
        const filename = file.absolutePath ||
            (outputDirectory.trim()
                ? path.resolve(outputDirectory, file.subfolder, file.filename)
                : "");
        if (filename)
            results.add(path.resolve(filename));
    }
    return [...results];
}
export function historyVideoPaths(asset, outputDirectory) {
    const versions = asset.versions?.length
        ? asset.versions
        : [{ files: asset.files }];
    return [...new Set(versions.flatMap((version) => historyVideoVersionPaths(version, outputDirectory)))];
}
export function removeHistoryVideoVersion(asset, versionId) {
    if (!asset.versions?.some((version) => version.id === versionId)) {
        throw new Error("视频记录或版本不存在。");
    }
    if (asset.versions.length <= 1) {
        throw new Error("视频记录至少需要保留一个版本；如需全部删除，请删除整条记录。");
    }
    const versions = asset.versions.filter((version) => version.id !== versionId);
    const defaultVersion = versions.find((version) => version.id === asset.defaultVersionId) ??
        [...versions].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    const updatedAt = [...versions].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0].createdAt;
    return {
        ...asset,
        outputFilename: defaultVersion.outputFilename,
        files: defaultVersion.files,
        updatedAt,
        defaultVersionId: defaultVersion.id,
        versions
    };
}
