import { describe, expect, it } from "vitest";
import {
  clampHistoryScrollPosition,
  historyScrollAnchorIsValid,
  type HistoryScrollSnapshot
} from "../src/renderer/pages/history/layout-controller.ts";

const snapshot: HistoryScrollSnapshot = {
  scrollY: 4200,
  assetId: "asset-300",
  offsetFromViewportCenter: -14,
  historyKind: "video",
  layout: "masonry",
  filterSignature: "filter-a"
};

describe("history scroll restoration", () => {
  it("accepts an unchanged anchor and rejects changed route context", () => {
    expect(historyScrollAnchorIsValid(snapshot, "video", "masonry", "filter-a", true)).toBe(true);
    expect(historyScrollAnchorIsValid(snapshot, "image", "masonry", "filter-a", true)).toBe(false);
    expect(historyScrollAnchorIsValid(snapshot, "video", "album", "filter-a", true)).toBe(false);
    expect(historyScrollAnchorIsValid(snapshot, "video", "masonry", "filter-b", true)).toBe(false);
    expect(historyScrollAnchorIsValid(snapshot, "video", "masonry", "filter-a", false)).toBe(false);
  });

  it("clamps fallback positions to the available document range", () => {
    expect(clampHistoryScrollPosition(1400, 1600, 900)).toBe(700);
    expect(clampHistoryScrollPosition(-20, 1600, 900)).toBe(0);
    expect(clampHistoryScrollPosition(Number.NaN, 1600, 900)).toBe(0);
    expect(clampHistoryScrollPosition(200, 400, 900)).toBe(0);
  });
});