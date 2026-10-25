import { estimateHistoryCardHeight, historyAlbumColumnCount, historyMasonryColumnCount } from "./helpers";

export interface HistoryVirtualItem { id: string; ratio: number }
export interface HistoryVirtualBox { left: number; top: number; width: number; height: number }
export interface HistoryVirtualLayout { boxes: HistoryVirtualBox[]; height: number }

/** Same widths, gaps and caption height as the non-windowed gallery. */
export function layoutHistoryWindow(items: readonly HistoryVirtualItem[], width: number, mode: "masonry" | "album", copyHeight = 47): HistoryVirtualLayout {
  const gap = mode === "album" ? 8 : 10;
  const columns = Math.max(1, mode === "album" ? historyAlbumColumnCount(width, gap) : historyMasonryColumnCount(width, gap));
  const cardWidth = Math.max(1, (width - gap * (columns - 1)) / columns);
  const heights = Array<number>(columns).fill(0);
  const boxes = items.map((item, index) => {
    let column = mode === "album" ? index % columns : 0;
    if (mode === "masonry") for (let i = 1; i < columns; i++) if (heights[i]! < heights[column]!) column = i;
    const height = estimateHistoryCardHeight(Math.max(1, cardWidth - 2), item.ratio, copyHeight, mode) + 2;
    const box = { left: column * (cardWidth + gap), top: heights[column]!, width: cardWidth, height };
    heights[column] = box.top + height + gap;
    return box;
  });
  return { boxes, height: Math.max(0, ...heights) - (items.length ? gap : 0) };
}

export function historyWindowIndexes(layout: HistoryVirtualLayout, top: number, bottom: number, pinned = -1): number[] {
  return layout.boxes.flatMap((box, index) => index === pinned || box.top + box.height >= top && box.top <= bottom ? [index] : []);
}
