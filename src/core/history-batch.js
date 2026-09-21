import { historyTagKey, normalizeHistoryTags } from "./history-filter.js";
function historyItemTags(item) {
    return item.tags ?? [];
}
function historyTimestamp(value) {
    const parsed = value ? Date.parse(value) : NaN;
    return Number.isFinite(parsed) ? parsed : 0;
}
function compareStableId(left, right) {
    return left.localeCompare(right);
}
function versionShortEdge(version) {
    return Math.min(Number.isFinite(version.width) && version.width > 0 ? version.width : 0, Number.isFinite(version.height) && version.height > 0 ? version.height : 0);
}
function looksLikeVideoFile(file) {
    return /\.(?:mp4|webm|mov|mkv|avi|m4v)$/i.test(file.filename) ||
        /video/i.test(file.type) ||
        /video/i.test(file.format ?? "");
}
function versionVideoFile(version) {
    return version.files.find(looksLikeVideoFile) ?? version.files[0];
}
/** Select the highest-resolution playable video file for clipboard copy. */
export function historyBatchVideoFile(asset) {
    const versions = [...asset.versions].sort((left, right) => versionShortEdge(right) - versionShortEdge(left) ||
        historyTimestamp(right.createdAt) - historyTimestamp(left.createdAt) ||
        compareStableId(right.id, left.id));
    return versions.map(versionVideoFile).find((file) => Boolean(file));
}
/** Select the newest image version, including the original source version. */
export function historyBatchImageFile(project) {
    const versions = [...project.versions].sort((left, right) => right.versionNumber - left.versionNumber ||
        historyTimestamp(right.createdAt) - historyTimestamp(left.createdAt) ||
        compareStableId(right.id, left.id));
    return versions[0]?.file;
}
export function historyBatchTagSummaries(items) {
    const entries = new Map();
    items.forEach((item) => {
        const seen = new Set();
        historyItemTags(item).forEach((tag) => {
            const normalized = tag.trim();
            const key = historyTagKey(normalized);
            if (!normalized || seen.has(key))
                return;
            seen.add(key);
            const current = entries.get(key);
            if (current)
                current.count += 1;
            else
                entries.set(key, { tag: normalized, count: 1 });
        });
    });
    return [...entries.values()].sort((left, right) => left.tag.localeCompare(right.tag));
}
export function historyBatchCommonTags(items) {
    if (!items.length)
        return [];
    return historyBatchTagSummaries(items)
        .filter((entry) => entry.count === items.length)
        .map((entry) => entry.tag);
}
export function historyBatchUnionTags(items) {
    return historyBatchTagSummaries(items).map((entry) => entry.tag);
}
export function applyHistoryBatchTagOperation(tags, operation) {
    const current = normalizeHistoryTags([...tags]);
    if (operation.kind === "add") {
        return normalizeHistoryTags([...current, operation.tag]);
    }
    if (operation.kind === "remove") {
        const key = historyTagKey(operation.tag);
        return current.filter((tag) => historyTagKey(tag) !== key);
    }
    const fromKey = historyTagKey(operation.from);
    const next = current.map((tag) => historyTagKey(tag) === fromKey ? operation.to : tag);
    return normalizeHistoryTags(next);
}
export function toggleHistoryBatchSelection(selectedIds, assetId) {
    const selected = new Set(selectedIds);
    if (selected.has(assetId))
        selected.delete(assetId);
    else
        selected.add(assetId);
    return [...selected];
}
export function selectHistoryBatchIds(selectedIds, visibleIds) {
    const visible = new Set(visibleIds);
    const current = new Set(selectedIds);
    const allSelected = visible.size > 0 && [...visible].every((id) => current.has(id));
    if (allSelected)
        return [...current].filter((id) => !visible.has(id));
    return [...new Set([...current, ...visible])];
}
/** Add every visible item between the anchor and target, preserving existing selections. */
export function selectHistoryBatchRange(selectedIds, visibleIds, anchorId, targetId) {
    const anchorIndex = visibleIds.indexOf(anchorId);
    const targetIndex = visibleIds.indexOf(targetId);
    if (anchorIndex < 0 || targetIndex < 0) {
        return [...new Set([...selectedIds, targetId])];
    }
    const start = Math.min(anchorIndex, targetIndex);
    const end = Math.max(anchorIndex, targetIndex);
    return [...new Set([...selectedIds, ...visibleIds.slice(start, end + 1)])];
}
export function pruneHistoryBatchSelection(selectedIds, visibleIds) {
    const visible = new Set(visibleIds);
    return [...new Set(selectedIds)].filter((id) => visible.has(id));
}
