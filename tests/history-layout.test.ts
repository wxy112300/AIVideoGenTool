import { describe, expect, it } from "vitest";
import {
  historyAlbumColumnCount,
  historyMasonryColumnCount
} from "../src/renderer/pages/history/helpers";

describe("history gallery layout calculations", () => {
  it("keeps album columns tied to container width rather than record count", () => {
    const wide = historyAlbumColumnCount(1200);
    const compact = historyAlbumColumnCount(528);

    expect(wide).toBe(6);
    expect(compact).toBe(2);
    expect(historyAlbumColumnCount(1200, 8)).toBe(wide);
    expect(historyAlbumColumnCount(1200, 32)).toBe(5);
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
