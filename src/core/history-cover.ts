export const HISTORY_COVER_CACHE_VERSION = "history-cover-v3";

export interface HistoryCoverKeyInput {
  assetId: string;
  versionId: string;
  createdAt: string;
  filename: string;
  absolutePath: string;
}

export function createHistoryCoverCacheKey(input: HistoryCoverKeyInput): string {
  return [
    HISTORY_COVER_CACHE_VERSION,
    input.assetId,
    input.versionId,
    input.createdAt,
    input.filename,
    input.absolutePath
  ].join(":");
}
