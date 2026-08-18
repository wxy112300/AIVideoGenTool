import type { HistoryAsset, HistoryRating, ImageHistoryProject } from "../types.js";

export type HistorySort =
  | "newest"
  | "oldest"
  | "rating-desc"
  | "rating-asc"
  | "duration-desc"
  | "duration-asc";

export interface HistoryFilterState {
  favoriteOnly: boolean;
  minRating: HistoryRating | null;
  maxRating: HistoryRating | null;
  minDuration: number | null;
  modelId: string;
  /** Tags are matched as an intersection; every selected tag must be present. */
  tags: string[];
  sort: HistorySort;
}

export const defaultHistoryFilter: HistoryFilterState = {
  favoriteOnly: false,
  minRating: null,
  maxRating: null,
  minDuration: null,
  modelId: "",
  tags: [],
  sort: "newest"
};

const sortValues: HistorySort[] = [
  "newest",
  "oldest",
  "rating-desc",
  "rating-asc",
  "duration-desc",
  "duration-asc"
];

export function isHistoryRating(value: unknown): value is HistoryRating {
  return typeof value === "number" && value >= 0.5 && value <= 5 && Number.isInteger(value * 2);
}

/**
 * Tags are user-facing strings, but their identity is case-insensitive and
 * whitespace-normalized so `H3`, `h3`, and ` H3 ` cannot become duplicates.
 */
export function normalizeHistoryTag(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  return normalized ? normalized : null;
}

export function historyTagKey(value: unknown): string {
  return normalizeHistoryTag(value)?.toLowerCase() ?? "";
}

export function normalizeHistoryTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of value) {
    const tag = normalizeHistoryTag(candidate);
    const key = historyTagKey(tag);
    if (!tag || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}

function validSort(value: unknown): value is HistorySort {
  return typeof value === "string" && sortValues.includes(value as HistorySort);
}

function normalizedNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  return null;
}

export function normalizeHistoryFilter(value: Partial<HistoryFilterState> | null | undefined): HistoryFilterState {
  let minRating = isHistoryRating(value?.minRating) ? value!.minRating : null;
  let maxRating = isHistoryRating(value?.maxRating) ? value!.maxRating : null;
  if (minRating !== null && maxRating !== null && minRating > maxRating) {
    [minRating, maxRating] = [maxRating, minRating];
  }
  return {
    favoriteOnly: value?.favoriteOnly === true,
    minRating,
    maxRating,
    minDuration: normalizedNumber(value?.minDuration),
    modelId: typeof value?.modelId === "string" ? value.modelId.trim() : "",
    tags: normalizeHistoryTags(value?.tags),
    sort: validSort(value?.sort) ? value!.sort : "newest"
  };
}

export function historyFilterIsActive(filter: HistoryFilterState): boolean {
  return filter.favoriteOnly ||
    filter.minRating !== null ||
    filter.maxRating !== null ||
    filter.minDuration !== null ||
    Boolean(filter.modelId) ||
    filter.tags.length > 0 ||
    filter.sort !== "newest";
}

function dateValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ratingValue(value: number | null | undefined): number {
  return typeof value === "number" && isHistoryRating(value) ? value : 0;
}

function compareNumbers(left: number, right: number, direction: 1 | -1): number {
  if (left === right) return 0;
  return left > right ? direction : -direction;
}

function compareHistoryItems(
  left: { id: string; updatedAt: string; createdAt: string; rating?: HistoryRating | null; duration?: number },
  right: { id: string; updatedAt: string; createdAt: string; rating?: HistoryRating | null; duration?: number },
  sort: HistorySort
): number {
  const leftTime = dateValue(left.updatedAt || left.createdAt);
  const rightTime = dateValue(right.updatedAt || right.createdAt);
  let result = 0;
  if (sort === "oldest") result = compareNumbers(leftTime, rightTime, 1);
  else if (sort === "rating-desc" || sort === "rating-asc") {
    const leftRated = isHistoryRating(left.rating);
    const rightRated = isHistoryRating(right.rating);
    if (leftRated !== rightRated) result = leftRated ? -1 : 1;
    else result = compareNumbers(ratingValue(left.rating), ratingValue(right.rating), sort === "rating-desc" ? -1 : 1);
  }
  else if (sort === "duration-desc") result = compareNumbers(left.duration ?? 0, right.duration ?? 0, -1);
  else if (sort === "duration-asc") result = compareNumbers(left.duration ?? 0, right.duration ?? 0, 1);
  else result = compareNumbers(leftTime, rightTime, -1);
  if (result !== 0) return result;
  // Keep ties deterministic, so detail Page Up/Page Down never jumps around.
  return left.id.localeCompare(right.id);
}

function matchesCommon(
  item: { favorite?: boolean; rating?: HistoryRating | null; modelId?: string; tags?: string[] },
  filter: HistoryFilterState
): boolean {
  if (filter.favoriteOnly && item.favorite !== true) return false;
  const rating = ratingValue(item.rating);
  if (filter.minRating !== null && rating < filter.minRating) return false;
  if (filter.maxRating !== null && (rating === 0 || rating > filter.maxRating)) return false;
  if (filter.modelId && item.modelId !== filter.modelId) return false;
  if (filter.tags.length > 0) {
    const itemTags = new Set(normalizeHistoryTags(item.tags).map(historyTagKey));
    if (!filter.tags.every((tag) => itemTags.has(historyTagKey(tag)))) return false;
  }
  return true;
}

export function filterHistoryAssets(
  history: ReadonlyArray<HistoryAsset>,
  rawFilter?: Partial<HistoryFilterState>
): HistoryAsset[] {
  const filter = normalizeHistoryFilter(rawFilter);
  return history
    .filter((asset) => matchesCommon(asset, filter))
    .filter((asset) => filter.minDuration === null || asset.duration >= filter.minDuration)
    .sort((left, right) => compareHistoryItems(left, right, filter.sort));
}

export function filterImageHistoryProjects(
  projects: ReadonlyArray<ImageHistoryProject>,
  rawFilter?: Partial<HistoryFilterState>
): ImageHistoryProject[] {
  const filter = normalizeHistoryFilter(rawFilter);
  return projects
    .filter((project) => {
      if (!matchesCommon({ favorite: project.favorite, rating: project.rating, tags: project.tags }, filter)) return false;
      return !filter.modelId || project.versions.some((version) =>
        version.kind !== "source" && version.modelId === filter.modelId
      );
    })
    .sort((left, right) => compareHistoryItems({
      id: left.id,
      updatedAt: left.updatedAt,
      createdAt: left.createdAt,
      rating: left.rating
    }, {
      id: right.id,
      updatedAt: right.updatedAt,
      createdAt: right.createdAt,
      rating: right.rating
    }, filter.sort));
}

export function historyTagNames(
  history: ReadonlyArray<HistoryAsset>,
  imageHistory: ReadonlyArray<ImageHistoryProject>,
  kind: "video" | "image"
): string[] {
  const values = kind === "video"
    ? history.flatMap((asset) => asset.tags ?? [])
    : imageHistory.flatMap((project) => project.tags ?? []);
  const byKey = new Map<string, string>();
  for (const value of values) {
    const tag = normalizeHistoryTag(value);
    const key = historyTagKey(tag);
    if (tag && key && !byKey.has(key)) byKey.set(key, tag);
  }
  return [...byKey.values()].sort((left, right) => left.localeCompare(right));
}

export function historyFilterModelIds(
  history: ReadonlyArray<HistoryAsset>,
  imageHistory: ReadonlyArray<ImageHistoryProject>,
  kind: "video" | "image"
): string[] {
  const values = kind === "video"
    ? history.map((asset) => asset.modelId)
    : imageHistory.flatMap((project) => project.versions
        .filter((version) => version.kind !== "source")
        .map((version) => version.modelId));
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((left, right) => left.localeCompare(right));
}
