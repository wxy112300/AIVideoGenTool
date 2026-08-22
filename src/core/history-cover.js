export const HISTORY_COVER_CACHE_VERSION = "history-cover-v3";
export function createHistoryCoverCacheKey(input) {
    return [
        HISTORY_COVER_CACHE_VERSION,
        input.assetId,
        input.versionId,
        input.createdAt,
        input.filename,
        input.absolutePath
    ].join(":");
}
