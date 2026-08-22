import { describe, expect, it } from "vitest";
import {
  assignHistoryMasonryColumns,
  historyAlbumColumnCount,
  historyMasonryColumnCount
} from "../src/renderer/pages/history/helpers.ts";

describe("history gallery layout calculations", () => {
  it("assigns every card once using stable shortest-column tie breaking", () => {
    expect(assignHistoryMasonryColumns([100, 100, 100, 100], 2, 10)).toEqual([
      [0, 2],
      [1, 3]
    ]);
    expect(assignHistoryMasonryColumns([100, 240, 80], 1)).toEqual([[0, 1, 2]]);
    expect(assignHistoryMasonryColumns([100, 240, 80], 0)).toEqual([]);
  });

  it("keeps extreme aspect-ratio heights distributed across three columns", () => {
    const columns = assignHistoryMasonryColumns([1200, 80, 80, 1200, 80, 80], 3);
    expect(columns.flat().sort((left, right) => left - right)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(columns).toEqual([[0], [1, 3], [2, 4, 5]]);
  });

  it("handles a 500-card input without losing order or assignments", () => {
    const columns = assignHistoryMasonryColumns(
      Array.from({ length: 500 }, (_, index) => (index % 17) + 1),
      5
    );
    const assigned = columns.flat();
    expect(assigned).toHaveLength(500);
    expect(new Set(assigned).size).toBe(500);
    expect(assigned.every((index) => index >= 0 && index < 500)).toBe(true);
  });

  it("keeps album columns tied to container width rather than record count", () => {
    const wide = historyAlbumColumnCount(1200);
    const compact = historyAlbumColumnCount(528);

    expect(wide).toBe(5);
    expect(compact).toBe(2);
    expect(historyAlbumColumnCount(806)).toBe(4);
    expect(historyAlbumColumnCount(1200, 8)).toBe(wide);
    expect(historyAlbumColumnCount(1200, 32)).toBe(5);
  });

  it("keeps album cards inside the adaptive width range", () => {
    const width = 1200;
    const gap = 8;
    const columns = historyAlbumColumnCount(width, gap);
    const cardWidth = (width - gap * (columns - 1)) / columns;

    expect(cardWidth).toBeGreaterThanOrEqual(180);
    expect(cardWidth).toBeLessThanOrEqual(240);
    expect((width - gap * 2) / 3).toBeGreaterThan(240);
    expect(historyAlbumColumnCount(360)).toBe(1);
  });

  it("keeps the narrow album fallback readable", () => {
    expect(historyAlbumColumnCount(328)).toBe(1);
    expect(historyAlbumColumnCount(0)).toBe(0);
    expect(historyAlbumColumnCount(-1)).toBe(0);
  });

  it("retains width-based masonry breakpoints", () => {
    expect(historyMasonryColumnCount(448)).toBe(1);
    expect(historyMasonryColumnCount(712)).toBe(2);
    expect(historyMasonryColumnCount(852)).toBe(2);
  });
});
