import type {
  AssetVersion,
  HistoryAsset,
  ImageAssetVersion,
  ImageHistoryProject
} from "../../../types";
import { createHistoryCoverCacheKey } from "../../../core/history-cover";
import { imageModelCapabilityFor } from "../../../core/image-workflow";
import { imageProjectCoverVersion } from "../../../core/image-project";

export function versionVideoIndex(version: AssetVersion): number {
  const videoPattern = /\.(mp4|webm|mov|m4v|mkv)$/i;
  return version.files.findIndex((file) => videoPattern.test(file.filename));
}

export function versionShortEdge(version: AssetVersion): number {
  const width = Number.isFinite(version.width) && version.width > 0 ? version.width : 0;
  const height = Number.isFinite(version.height) && version.height > 0 ? version.height : 0;
  return Math.max(0, Math.round(Math.min(width || height, height || width)));
}

export function resolutionLabel(value: number): string {
  const rounded = Math.max(0, Math.round(value));
  return rounded === 2160 ? "4K" : rounded > 0 ? `${rounded}p` : "未知";
}

export function historyResolutionLabel(
  asset: HistoryAsset,
  version: AssetVersion
): string {
  const requestedResolution = version.kind === "original" &&
    [360, 480, 540, 720, 768, 1080, 1440, 2160].includes(asset.resolution)
    ? asset.resolution
    : versionShortEdge(version);
  return resolutionLabel(requestedResolution);
}

export function preferredVersion(asset: HistoryAsset): AssetVersion {
  return asset.versions.find((version) => version.id === asset.defaultVersionId) ??
    [...asset.versions].sort((left, right) => versionShortEdge(right) - versionShortEdge(left))[0]!;
}

export function currentHistoryVersion(
  asset: HistoryAsset,
  selectedVersionId?: string
): AssetVersion {
  return asset.versions.find((version) => version.id === selectedVersionId) ??
    preferredVersion(asset);
}

export function historyMediaUrl(
  asset: HistoryAsset,
  version = preferredVersion(asset)
): string {
  const index = versionVideoIndex(version);
  return index < 0
    ? ""
    : `studio-media://history/${encodeURIComponent(asset.id)}/${encodeURIComponent(version.id)}/${index}`;
}

export function historyAssetsByNewest(history: ReadonlyArray<HistoryAsset>): HistoryAsset[] {
  return [...history].sort((left, right) => {
    const leftTime = Date.parse(left.updatedAt || left.createdAt);
    const rightTime = Date.parse(right.updatedAt || right.createdAt);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return 0;
  });
}

export function imageProjectsByNewest(
  imageHistory: ReadonlyArray<ImageHistoryProject>
): ImageHistoryProject[] {
  return [...imageHistory].sort((left, right) => {
    const leftTime = Date.parse(left.updatedAt || left.createdAt);
    const rightTime = Date.parse(right.updatedAt || right.createdAt);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return 0;
  });
}

export function preferredImageVersion(project: ImageHistoryProject): ImageAssetVersion {
  return imageProjectCoverVersion(project) ??
    [...project.versions].sort((left, right) => right.versionNumber - left.versionNumber)[0]!;
}

export function currentImageHistoryVersion(
  project: ImageHistoryProject,
  selectedVersionId?: string
): ImageAssetVersion {
  return project.versions.find((version) => version.id === selectedVersionId) ??
    preferredImageVersion(project);
}

export function imageHistoryMediaUrl(
  project: ImageHistoryProject,
  version = preferredImageVersion(project)
): string {
  return version.file.filename
    ? `studio-media://history/${encodeURIComponent(project.id)}/${encodeURIComponent(version.id)}/0`
    : "";
}

export function imageHistoryThumbnailCacheKey(
  project: ImageHistoryProject,
  version: ImageAssetVersion
): string {
  return `image-history:${createHistoryCoverCacheKey({
    assetId: project.id,
    versionId: version.id,
    createdAt: version.createdAt,
    filename: version.file.filename,
    absolutePath: version.file.absolutePath ?? ""
  })}`;
}

export function historyCoverCacheKey(
  asset: HistoryAsset,
  version: AssetVersion
): string {
  const videoIndex = versionVideoIndex(version);
  const file = videoIndex >= 0 ? version.files[videoIndex] : undefined;
  return createHistoryCoverCacheKey({
    assetId: asset.id,
    versionId: version.id,
    createdAt: version.createdAt,
    filename: file?.filename ?? version.outputFilename,
    absolutePath: file?.absolutePath ?? ""
  });
}

export function historyCoverSeed(assetId: string, versionId: string): number {
  let hash = 2166136261;
  for (const character of `${assetId}:${versionId}`) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return hash >>> 0;
}

export function historyInitialCoverTime(duration: number, seed: number): number {
  const safeDuration = Math.max(0, Number.isFinite(duration) ? duration : 0);
  if (safeDuration <= 0.5) return safeDuration / 2;
  const positions = [0.2, 0.31, 0.43, 0.56, 0.68, 0.79];
  const position = positions[seed % positions.length] ?? 0.43;
  return Math.min(safeDuration - 0.1, Math.max(0.1, safeDuration * position));
}

export function historyCoverCandidates(duration: number, seed: number): number[] {
  const safeDuration = Math.max(0, Number.isFinite(duration) ? duration : 0);
  if (safeDuration <= 0.5) return [safeDuration / 2];
  const positions = [0.18, 0.28, 0.38, 0.49, 0.6, 0.71, 0.82];
  const start = seed % positions.length;
  return Array.from({ length: 4 }, (_, index) => {
    const position = positions[(start + index) % positions.length] ?? 0.49;
    return Math.min(safeDuration - 0.1, Math.max(0.1, safeDuration * position));
  });
}

export function historyRenderSeconds(version: AssetVersion): number | null {
  if (!version.startedAt) return null;
  const startedAt = Date.parse(version.startedAt);
  const createdAt = Date.parse(version.createdAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(createdAt)) return null;
  return Math.max(0, (createdAt - startedAt) / 1000);
}

export function imageHistoryGenerationSummary(version: ImageAssetVersion) {
  const imageCapability = imageModelCapabilityFor(version.modelId);
  const imageQuality = imageCapability.qualityProfiles.find(
    (profile) => profile.id === version.qualityProfile
  );
  return {
    steps: version.steps ?? imageQuality?.steps,
    cfg: version.cfg ?? imageQuality?.cfg,
    qualityLabel: imageQuality?.label ?? version.qualityProfile ?? "旧记录未保存",
    loraLabel: imageQuality?.lightning
      ? "Qwen Image Edit Lightning LoRA · 由质量档自动加载"
      : "未使用图片 LoRA"
  };
}

export function historyCardsByOrder(gallery: HTMLElement): HTMLElement[] {
  return [...gallery.querySelectorAll<HTMLElement>(".history-gallery-item")].sort(
    (left, right) =>
      Number(left.dataset.historyOrder ?? Number.MAX_SAFE_INTEGER) -
      Number(right.dataset.historyOrder ?? Number.MAX_SAFE_INTEGER)
  );
}

export function historyMasonryColumnCount(width: number, gap = 10): number {
  if (width <= 480) return 1;
  const minimumCardWidth = 300;
  const maximumCardWidth = 520;
  const minimumColumns = 3;
  const maximumColumns = 5;
  let columns = minimumColumns;
  const cardWidth = (columnCount: number) =>
    (width - gap * (columnCount - 1)) / columnCount;

  while (columns < maximumColumns && cardWidth(columns) > maximumCardWidth) {
    columns += 1;
  }
  while (columns > 2 && cardWidth(columns) < minimumCardWidth) {
    columns -= 1;
  }
  return columns;
}

export function historyStateChanged(
  previous: ReadonlyArray<HistoryAsset> | undefined,
  next: ReadonlyArray<HistoryAsset>
): boolean {
  if (!previous || previous.length !== next.length) return true;
  return next.some((asset, index) => {
    const previousAsset = previous[index];
    if (!previousAsset) return true;
    if (
      previousAsset.id !== asset.id ||
      previousAsset.updatedAt !== asset.updatedAt ||
      previousAsset.defaultVersionId !== asset.defaultVersionId ||
      previousAsset.versions.length !== asset.versions.length
    ) {
      return true;
    }
    return asset.versions.some((version, versionIndex) => {
      const previousVersion = previousAsset.versions[versionIndex];
      return !previousVersion ||
        previousVersion.id !== version.id ||
        previousVersion.createdAt !== version.createdAt ||
        previousVersion.files.length !== version.files.length;
    });
  });
}

export function imageHistoryStateChanged(
  previous: ReadonlyArray<ImageHistoryProject> | undefined,
  next: ReadonlyArray<ImageHistoryProject>
): boolean {
  if (!previous || previous.length !== next.length) return true;
  return next.some((project, index) => {
    const previousProject = previous[index];
    if (!previousProject) return true;
    if (
      previousProject.id !== project.id ||
      previousProject.updatedAt !== project.updatedAt ||
      previousProject.coverMode !== project.coverMode ||
      previousProject.coverVersionId !== project.coverVersionId ||
      previousProject.versions.length !== project.versions.length
    ) {
      return true;
    }
    return project.versions.some((version, versionIndex) => {
      const previousVersion = previousProject.versions[versionIndex];
      return !previousVersion ||
        previousVersion.id !== version.id ||
        previousVersion.versionNumber !== version.versionNumber ||
        previousVersion.createdAt !== version.createdAt ||
        previousVersion.file.filename !== version.file.filename ||
        previousVersion.file.absolutePath !== version.file.absolutePath;
    });
  });
}
