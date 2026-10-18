import type { AssetVersion, HistoryAsset } from "../types.js";

/** Shared by desktop History and the LAN library. Auxiliary files are never video sources. */
export function versionVideoIndex(version: AssetVersion): number {
  return version.files.findIndex((file) => /\.(mp4|webm|mov|m4v|mkv)$/i.test(file.filename));
}

export function versionShortEdge(version: AssetVersion): number {
  const width = Number.isFinite(version.width) && version.width > 0 ? version.width : 0;
  const height = Number.isFinite(version.height) && version.height > 0 ? version.height : 0;
  return Math.max(0, Math.round(Math.min(width || height, height || width)));
}

export function preferredVersion(asset: HistoryAsset): AssetVersion {
  return asset.versions.find((version) => version.id === asset.defaultVersionId) ??
    [...asset.versions].sort((left, right) => versionShortEdge(right) - versionShortEdge(left))[0]!;
}

export function currentHistoryVersion(asset: HistoryAsset, selectedVersionId?: string): AssetVersion {
  return asset.versions.find((version) => version.id === selectedVersionId) ?? preferredVersion(asset);
}
