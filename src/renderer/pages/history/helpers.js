import { createTranslator } from "../../../core/i18n";
import { uiKeys } from "../../../core/i18n-keys";
import { createHistoryCoverCacheKey } from "../../../core/history-cover";
import { imageModelCapabilityFor } from "../../../core/image-workflow";
import { imageProjectCoverVersion } from "../../../core/image-project";
import { defaultHistoryFilter, filterHistoryAssets, filterImageHistoryProjects, historyFilterModelIds } from "../../../core/history-filter";
export function versionVideoIndex(version) {
    const videoPattern = /\.(mp4|webm|mov|m4v|mkv)$/i;
    return version.files.findIndex((file) => videoPattern.test(file.filename));
}
export function versionShortEdge(version) {
    const width = Number.isFinite(version.width) && version.width > 0 ? version.width : 0;
    const height = Number.isFinite(version.height) && version.height > 0 ? version.height : 0;
    return Math.max(0, Math.round(Math.min(width || height, height || width)));
}
export function resolutionLabel(value, t = createTranslator("zh-CN").t) {
    const rounded = Math.max(0, Math.round(value));
    return rounded === 2160 ? "4K" : rounded > 0 ? `${rounded}p` : t(uiKeys.history.media.unknownResolution);
}
export function historyResolutionLabel(asset, version, t = createTranslator("zh-CN").t) {
    const requestedResolution = version.kind === "original" &&
        [360, 480, 540, 720, 768, 1080, 1440, 2160].includes(asset.resolution)
        ? asset.resolution
        : versionShortEdge(version);
    return resolutionLabel(requestedResolution, t);
}
export function preferredVersion(asset) {
    return asset.versions.find((version) => version.id === asset.defaultVersionId) ??
        [...asset.versions].sort((left, right) => versionShortEdge(right) - versionShortEdge(left))[0];
}
export function currentHistoryVersion(asset, selectedVersionId) {
    return asset.versions.find((version) => version.id === selectedVersionId) ??
        preferredVersion(asset);
}
export function historyMediaUrl(asset, version = preferredVersion(asset)) {
    const index = versionVideoIndex(version);
    return index < 0
        ? ""
        : `studio-media://history/${encodeURIComponent(asset.id)}/${encodeURIComponent(version.id)}/${index}`;
}
export function historyAssetsByNewest(history, filter = defaultHistoryFilter) {
    return filterHistoryAssets(history, filter);
}
export function imageProjectsByNewest(imageHistory, filter = defaultHistoryFilter) {
    return filterImageHistoryProjects(imageHistory, filter);
}
export { historyFilterModelIds };
export function preferredImageVersion(project) {
    return imageProjectCoverVersion(project) ??
        [...project.versions].sort((left, right) => right.versionNumber - left.versionNumber)[0];
}
export function currentImageHistoryVersion(project, selectedVersionId) {
    return project.versions.find((version) => version.id === selectedVersionId) ??
        preferredImageVersion(project);
}
export function imageHistoryMediaUrl(project, version = preferredImageVersion(project)) {
    return version.file.filename
        ? `studio-media://history/${encodeURIComponent(project.id)}/${encodeURIComponent(version.id)}/0`
        : "";
}
export function imageHistoryThumbnailCacheKey(project, version) {
    return `image-history:${createHistoryCoverCacheKey({
        assetId: project.id,
        versionId: version.id,
        createdAt: version.createdAt,
        filename: version.file.filename,
        absolutePath: version.file.absolutePath ?? ""
    })}`;
}
export function historyCoverCacheKey(asset, version) {
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
export function historyCoverSeed(assetId, versionId) {
    let hash = 2166136261;
    for (const character of `${assetId}:${versionId}`) {
        hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    }
    return hash >>> 0;
}
export function historyInitialCoverTime(duration, seed) {
    const safeDuration = Math.max(0, Number.isFinite(duration) ? duration : 0);
    if (safeDuration <= 0.5)
        return safeDuration / 2;
    const positions = [0.2, 0.31, 0.43, 0.56, 0.68, 0.79];
    const position = positions[seed % positions.length] ?? 0.43;
    return Math.min(safeDuration - 0.1, Math.max(0.1, safeDuration * position));
}
export function historyCoverCandidates(duration, seed) {
    const safeDuration = Math.max(0, Number.isFinite(duration) ? duration : 0);
    if (safeDuration <= 0.5)
        return [safeDuration / 2];
    const positions = [0.18, 0.28, 0.38, 0.49, 0.6, 0.71, 0.82];
    const start = seed % positions.length;
    return Array.from({ length: 4 }, (_, index) => {
        const position = positions[(start + index) % positions.length] ?? 0.49;
        return Math.min(safeDuration - 0.1, Math.max(0.1, safeDuration * position));
    });
}
export function historyRenderSeconds(version) {
    if (!version.startedAt)
        return null;
    const startedAt = Date.parse(version.startedAt);
    const createdAt = Date.parse(version.createdAt);
    if (!Number.isFinite(startedAt) || !Number.isFinite(createdAt))
        return null;
    return Math.max(0, (createdAt - startedAt) / 1000);
}
export function imageHistoryGenerationSummary(version, t = createTranslator("zh-CN").t) {
    const imageCapability = imageModelCapabilityFor(version.modelId);
    const imageQuality = imageCapability.qualityProfiles.find((profile) => profile.id === version.qualityProfile);
    return {
        steps: version.steps ?? imageQuality?.steps,
        cfg: version.cfg ?? imageQuality?.cfg,
        qualityLabel: imageQuality?.label ?? version.qualityProfile ?? t(uiKeys.history.detail.qualityNotSaved),
        loraLabel: imageQuality?.lightning
            ? t(uiKeys.history.detail.imageLoraAutoLoaded)
            : t(uiKeys.history.detail.noImageLora)
    };
}
export function historyCardsByOrder(gallery) {
    return [...gallery.querySelectorAll(".history-gallery-item")].sort((left, right) => Number(left.dataset.historyOrder ?? Number.MAX_SAFE_INTEGER) -
        Number(right.dataset.historyOrder ?? Number.MAX_SAFE_INTEGER));
}
export function assignHistoryMasonryColumns(cardHeights, columnCount, gap = 10) {
    const safeColumnCount = Math.max(0, Math.floor(columnCount));
    const columns = Array.from({ length: safeColumnCount }, () => []);
    if (!safeColumnCount)
        return columns;
    const columnHeights = Array.from({ length: safeColumnCount }, () => 0);
    const safeGap = Number.isFinite(gap) ? Math.max(0, gap) : 0;
    cardHeights.forEach((value, cardIndex) => {
        let shortestColumn = 0;
        for (let columnIndex = 1; columnIndex < safeColumnCount; columnIndex += 1) {
            if (columnHeights[columnIndex] < columnHeights[shortestColumn]) {
                shortestColumn = columnIndex;
            }
        }
        const column = columns[shortestColumn];
        const height = Number.isFinite(value) ? Math.max(0, value) : 0;
        columnHeights[shortestColumn] = columnHeights[shortestColumn] + height + (column.length ? safeGap : 0);
        column.push(cardIndex);
    });
    return columns;
}
export function historyMasonryColumnCount(width, gap = 10) {
    if (width <= 480)
        return 1;
    const minimumCardWidth = 300;
    const maximumCardWidth = 520;
    const minimumColumns = 3;
    const maximumColumns = 5;
    let columns = minimumColumns;
    const cardWidth = (columnCount) => (width - gap * (columnCount - 1)) / columnCount;
    while (columns < maximumColumns && cardWidth(columns) > maximumCardWidth) {
        columns += 1;
    }
    while (columns > 2 && cardWidth(columns) < minimumCardWidth) {
        columns -= 1;
    }
    return columns;
}
/**
 * Album tracks belong to the available gallery width, never to the number of
 * records currently visible. Keeping this calculation independent from the
 * card collection prevents filtering or deleting a record from widening the
 * remaining cards.
 */
export function historyAlbumColumnCount(width, gap = 8) {
    if (!Number.isFinite(width) || width <= 0)
        return 0;
    const safeGap = Number.isFinite(gap) ? Math.max(0, gap) : 8;
    const minimumCardWidth = 180;
    const maximumCardWidth = 240;
    let columns = Math.max(1, Math.floor((width + safeGap) / (maximumCardWidth + safeGap)));
    const cardWidth = (columnCount) => (width - safeGap * (columnCount - 1)) / columnCount;
    while (cardWidth(columns) > maximumCardWidth)
        columns += 1;
    while (columns > 1 && cardWidth(columns) < minimumCardWidth)
        columns -= 1;
    return columns;
}
function historyStateChangedInternal(previous, next, includeCuration) {
    if (!previous || previous.length !== next.length)
        return true;
    return next.some((asset, index) => {
        const previousAsset = previous[index];
        if (!previousAsset)
            return true;
        if (previousAsset.id !== asset.id ||
            previousAsset.updatedAt !== asset.updatedAt ||
            previousAsset.defaultVersionId !== asset.defaultVersionId ||
            previousAsset.versions.length !== asset.versions.length) {
            return true;
        }
        if (includeCuration && (previousAsset.favorite !== asset.favorite ||
            previousAsset.rating !== asset.rating ||
            JSON.stringify(previousAsset.tags ?? []) !== JSON.stringify(asset.tags ?? []))) {
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
export function historyStateChanged(previous, next) {
    return historyStateChangedInternal(previous, next, true);
}
/**
 * Return whether the visible history media/details changed. Curation metadata
 * is deliberately excluded so a favorite/rating write can update its small
 * control in place without replacing a playing detail-page video.
 */
export function historyContentStateChanged(previous, next) {
    return historyStateChangedInternal(previous, next, false);
}
function imageHistoryStateChangedInternal(previous, next, includeCuration) {
    if (!previous || previous.length !== next.length)
        return true;
    return next.some((project, index) => {
        const previousProject = previous[index];
        if (!previousProject)
            return true;
        if (previousProject.id !== project.id ||
            previousProject.updatedAt !== project.updatedAt ||
            previousProject.coverMode !== project.coverMode ||
            previousProject.coverVersionId !== project.coverVersionId ||
            previousProject.versions.length !== project.versions.length) {
            return true;
        }
        if (includeCuration && (previousProject.favorite !== project.favorite ||
            previousProject.rating !== project.rating ||
            JSON.stringify(previousProject.tags ?? []) !== JSON.stringify(project.tags ?? []))) {
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
export function imageHistoryStateChanged(previous, next) {
    return imageHistoryStateChangedInternal(previous, next, true);
}
/** See {@link historyContentStateChanged} for why curation is excluded. */
export function imageHistoryContentStateChanged(previous, next) {
    return imageHistoryStateChangedInternal(previous, next, false);
}
