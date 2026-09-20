import type {
  AssetVersion,
  HistoryAsset,
  HistoryFile,
  HistoryItem,
  ImageAssetVersion,
  ImageHistoryProject
} from "../types.js";
import { historyTagKey, normalizeHistoryTags } from "./history-filter.js";

export type HistoryBatchTagOperation =
  | { kind: "add"; tag: string }
  | { kind: "remove"; tag: string }
  | { kind: "rename"; from: string; to: string };

export interface HistoryBatchTagSummary {
  tag: string;
  count: number;
}

function historyItemTags(item: HistoryItem): string[] {
  return item.tags ?? [];
}

function historyTimestamp(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareStableId(left: string, right: string): number {
  return left.localeCompare(right);
}

function versionShortEdge(version: Pick<AssetVersion | ImageAssetVersion, "width" | "height">): number {
  return Math.min(
    Number.isFinite(version.width) && version.width > 0 ? version.width : 0,
    Number.isFinite(version.height) && version.height > 0 ? version.height : 0
  );
}

function looksLikeVideoFile(file: HistoryFile): boolean {
  return /\.(?:mp4|webm|mov|mkv|avi|m4v)$/i.test(file.filename) ||
    /video/i.test(file.type) ||
    /video/i.test(file.format ?? "");
}

function versionVideoFile(version: AssetVersion): HistoryFile | undefined {
  return version.files.find(looksLikeVideoFile) ?? version.files[0];
}

/** Select the highest-resolution playable video file for clipboard copy. */
export function historyBatchVideoFile(asset: HistoryAsset): HistoryFile | undefined {
  const versions = [...asset.versions].sort((left, right) =>
    versionShortEdge(right) - versionShortEdge(left) ||
    historyTimestamp(right.createdAt) - historyTimestamp(left.createdAt) ||
    compareStableId(right.id, left.id)
  );
  return versions.map(versionVideoFile).find((file): file is HistoryFile => Boolean(file));
}

/** Select the newest image version, including the original source version. */
export function historyBatchImageFile(project: ImageHistoryProject): HistoryFile | undefined {
  const versions = [...project.versions].sort((left, right) =>
    right.versionNumber - left.versionNumber ||
    historyTimestamp(right.createdAt) - historyTimestamp(left.createdAt) ||
    compareStableId(right.id, left.id)
  );
  return versions[0]?.file;
}

export function historyBatchTagSummaries(items: ReadonlyArray<HistoryItem>): HistoryBatchTagSummary[] {
  const entries = new Map<string, HistoryBatchTagSummary>();
  items.forEach((item) => {
    const seen = new Set<string>();
    historyItemTags(item).forEach((tag) => {
      const normalized = tag.trim();
      const key = historyTagKey(normalized);
      if (!normalized || seen.has(key)) return;
      seen.add(key);
      const current = entries.get(key);
      if (current) current.count += 1;
      else entries.set(key, { tag: normalized, count: 1 });
    });
  });
  return [...entries.values()].sort((left, right) => left.tag.localeCompare(right.tag));
}

export function historyBatchCommonTags(items: ReadonlyArray<HistoryItem>): string[] {
  if (!items.length) return [];
  return historyBatchTagSummaries(items)
    .filter((entry) => entry.count === items.length)
    .map((entry) => entry.tag);
}

export function historyBatchUnionTags(items: ReadonlyArray<HistoryItem>): string[] {
  return historyBatchTagSummaries(items).map((entry) => entry.tag);
}

export function applyHistoryBatchTagOperation(
  tags: ReadonlyArray<string>,
  operation: HistoryBatchTagOperation
): string[] {
  const current = normalizeHistoryTags([...tags]);
  if (operation.kind === "add") {
    return normalizeHistoryTags([...current, operation.tag]);
  }
  if (operation.kind === "remove") {
    const key = historyTagKey(operation.tag);
    return current.filter((tag: string) => historyTagKey(tag) !== key);
  }
  const fromKey = historyTagKey(operation.from);
  const next = current.map((tag: string) => historyTagKey(tag) === fromKey ? operation.to : tag);
  return normalizeHistoryTags(next);
}

export function toggleHistoryBatchSelection(selectedIds: ReadonlyArray<string>, assetId: string): string[] {
  const selected = new Set(selectedIds);
  if (selected.has(assetId)) selected.delete(assetId);
  else selected.add(assetId);
  return [...selected];
}

export function selectHistoryBatchIds(
  selectedIds: ReadonlyArray<string>,
  visibleIds: ReadonlyArray<string>
): string[] {
  const visible = new Set(visibleIds);
  const current = new Set(selectedIds);
  const allSelected = visible.size > 0 && [...visible].every((id) => current.has(id));
  if (allSelected) return [...current].filter((id) => !visible.has(id));
  return [...new Set([...current, ...visible])];
}

export function pruneHistoryBatchSelection(
  selectedIds: ReadonlyArray<string>,
  visibleIds: ReadonlyArray<string>
): string[] {
  const visible = new Set(visibleIds);
  return [...new Set(selectedIds)].filter((id) => visible.has(id));
}
