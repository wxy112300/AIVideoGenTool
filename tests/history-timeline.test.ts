import { describe, expect, it } from "vitest";
import {
  clampHistoryTimelineProgress,
  closestHistoryTimelineMarker,
  groupHistoryTimelineEntries,
  historyTimelineEntries,
  historyTimelineMarkerLabel,
  historyTimelineProgress,
  historyTimelineScrollY
} from "../src/renderer/pages/history/timeline.ts";

function localTimestamp(year: number, month: number, day: number): string {
  return new Date(year, month - 1, day, 12, 0, 0, 0).toISOString();
}

describe("history timeline model", () => {
  it("only creates entries for time sorting and keeps the list order", () => {
    const records = [
      { id: "new", updatedAt: localTimestamp(2026, 8, 12), createdAt: localTimestamp(2026, 8, 1) },
      { id: "same-day", updatedAt: localTimestamp(2026, 8, 12), createdAt: localTimestamp(2026, 8, 2) },
      { id: "old", updatedAt: localTimestamp(2026, 8, 11), createdAt: localTimestamp(2026, 8, 3) }
    ];

    expect(historyTimelineEntries(records, "rating-desc")).toEqual([]);
    expect(historyTimelineEntries(records, "newest", "zh-CN").map((entry) => entry.id)).toEqual([
      "new",
      "same-day",
      "old"
    ]);
    expect(historyTimelineEntries(records, "newest", "zh-CN").map((entry) => entry.dateKey)).toEqual([
      "2026-08-12",
      "2026-08-12",
      "2026-08-11"
    ]);
  });

  it("groups same-day records without losing the representative target", () => {
    const entries = historyTimelineEntries([
      { id: "a", updatedAt: localTimestamp(2026, 8, 12) },
      { id: "b", updatedAt: localTimestamp(2026, 8, 12) },
      { id: "c", updatedAt: localTimestamp(2026, 8, 11) },
      { id: "unknown", updatedAt: "not-a-date" }
    ], "newest", "zh-CN");
    const groups = groupHistoryTimelineEntries(entries);

    expect(groups.map((group) => group.dateKey)).toEqual([
      "2026-08-12",
      "2026-08-11",
      "unknown"
    ]);
    expect(groups[0]).toMatchObject({ targetId: "a", ids: ["a", "b"], label: "2026.08.12" });
    expect(groups[2]).toMatchObject({ targetId: "unknown", validDate: false, label: "—" });
  });

  it("clamps scroll mapping and selects the nearest marker", () => {
    expect(clampHistoryTimelineProgress(-1)).toBe(0);
    expect(clampHistoryTimelineProgress(2)).toBe(1);
    expect(historyTimelineProgress(50, 100)).toBe(0.5);
    expect(historyTimelineProgress(50, 0)).toBe(0);
    expect(historyTimelineScrollY(-1, 1000)).toBe(0);
    expect(historyTimelineScrollY(0.75, 1000)).toBe(750);
    expect(historyTimelineScrollY(2, 1000)).toBe(1000);
    expect(closestHistoryTimelineMarker([
      { index: 0, top: 0 },
      { index: 1, top: 0.5 },
      { index: 2, top: 1 }
    ], 0.62)).toBe(1);
  });

  it("keeps one visible date when nearby markers merge", () => {
    expect(historyTimelineMarkerLabel(["2026.08.12", "2026.08.11"])).toBe("2026.08.12");
    expect(historyTimelineMarkerLabel(["08/12/2026", "08/11/2026"])).toBe("08/12/2026");
    expect(historyTimelineMarkerLabel([])).toBe("—");
  });
});
