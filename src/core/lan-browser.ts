import type { HistoryRating, UiLocale } from "../types.js";
import { normalizeHistoryFilter, type HistoryFilterInput, type HistoryFilterState } from "./history-filter.js";

export const LAN_BROWSER_DEFAULT_PORT = 8790;
export interface LanBrowserStatus {
  state: "off" | "starting" | "running" | "error";
  port: number;
  localUrl: string;
  urls: string[];
  error: string;
}

/** Deliberately excludes prompts, paths, execution graphs, run data and settings. */
export interface BrowseVideo {
  id: string;
  versionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  modelId: string;
  width: number;
  height: number;
  duration: number;
  favorite: boolean;
  rating: HistoryRating | null;
  tags: string[];
  revision: string;
  coverUrl: string;
  mediaUrl: string;
}

export interface BrowsePage {
  queryId: string;
  total: number;
  offset: number;
  items: BrowseVideo[];
  filter: HistoryFilterState;
}

export interface BrowseLibraryInfo {
  /** Independent replicas never expose desktop metadata mutations. Absent means desktop behavior. */
  readOnly?: boolean;
  revision: string;
  count: number;
  locale: UiLocale;
  tags: string[];
  models: Array<{ id: string; name: string }>;
}

export function normalizeBrowseFilter(value: HistoryFilterInput | null | undefined): HistoryFilterState {
  return normalizeHistoryFilter(value);
}

/** Loaded only when the viewer opens its read-only information panel. */
export interface BrowseVideoPrompt {
  id: string;
  versionId: string;
  prompt: string;
}

export interface BrowseTile {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Position in data order; the DOM/keyboard/feed order never follows CSS columns. */
export function layoutBrowseTiles(
  items: ReadonlyArray<Pick<BrowseVideo, "width" | "height">>,
  width: number,
  mode: "masonry" | "album"
): { tiles: BrowseTile[]; height: number; columns: number } {
  const gap = 6;
  const safeWidth = Math.max(1, width);
  const columns = mode === "album"
    ? Math.min(12, Math.max(1, Math.floor((safeWidth + gap) / 96)))
    : safeWidth < 280 ? 1 : safeWidth < 600 ? 2
      : Math.min(8, Math.max(3, Math.floor((safeWidth + gap) / 230)));
  const tileWidth = (safeWidth - gap * (columns - 1)) / columns;
  const heights = Array.from({ length: columns }, () => 0);
  const tiles = items.map((item, index) => {
    const column = mode === "album" ? index % columns
      : heights.indexOf(Math.min(...heights));
    const ratio = Number.isFinite(item.width) && Number.isFinite(item.height) && item.width > 0 && item.height > 0
      ? item.width / item.height : 3 / 4;
    const height = mode === "album" ? tileWidth * 4 / 3
      : tileWidth / ratio;
    const tile = { index, x: column * (tileWidth + gap), y: heights[column]!, width: tileWidth, height };
    heights[column] = tile.y + height + gap;
    return tile;
  });
  return { tiles, height: Math.max(0, ...heights) - (items.length ? gap : 0), columns };
}
