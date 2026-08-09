import { describe, expect, it } from "vitest";
import {
  createHistoryCoverCacheKey,
  HISTORY_COVER_CACHE_VERSION
} from "../src/core/history-cover.js";

describe("history cover cache keys", () => {
  it("stays stable for the same history version and changes with the source identity", () => {
    const input = {
      assetId: "asset-1",
      versionId: "version-1",
      createdAt: "2026-08-09T12:00:00.000Z",
      filename: "result.mp4",
      absolutePath: "D:\\Videos\\result.mp4"
    };

    const key = createHistoryCoverCacheKey(input);
    expect(key).toBe(createHistoryCoverCacheKey(input));
    expect(key.startsWith(`${HISTORY_COVER_CACHE_VERSION}:`)).toBe(true);
    expect(createHistoryCoverCacheKey({ ...input, absolutePath: "D:\\Videos\\moved.mp4" }))
      .not.toBe(key);
  });
});
