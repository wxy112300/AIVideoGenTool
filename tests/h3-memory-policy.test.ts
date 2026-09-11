import { describe, expect, it } from "vitest";
import {
  H3_MEMORY_DEFAULT_ENABLED,
  H3_MEMORY_PRODUCT_ENABLED,
  normalizeH3MemoryChunkRows,
  normalizeH3MemoryOptimizationMode,
  normalizeH3MemoryOptions
} from "../src/core/h3-memory-policy.js";

describe("withdrawn H3 Memory compatibility fields", () => {
  it("keeps the withdrawn route disabled and preserves readable defaults", () => {
    expect(H3_MEMORY_DEFAULT_ENABLED).toBe(false);
    expect(H3_MEMORY_PRODUCT_ENABLED).toBe(false);
    expect(normalizeH3MemoryOptions({})).toEqual({
      h3MemoryOptimizationMode: "off",
      h3MemoryOptimizationUserSet: false,
      h3MemoryChunkRows: 4096
    });
  });

  it("normalizes legacy values without allowing them to reactivate the route", () => {
    for (const value of ["preserve-native", "auto", "force-quant", "legacy-mode"]) {
      expect(normalizeH3MemoryOptimizationMode(value)).toBe("off");
    }
    expect(normalizeH3MemoryOptions({
      h3MemoryOptimizationMode: "auto",
      h3MemoryOptimizationUserSet: true,
      h3MemoryChunkRows: 4097
    })).toEqual({
      h3MemoryOptimizationMode: "off",
      h3MemoryOptimizationUserSet: false,
      h3MemoryChunkRows: 4096
    });
    expect(normalizeH3MemoryChunkRows(257)).toBe(256);
    expect(normalizeH3MemoryChunkRows(70000)).toBe(65536);
    expect(normalizeH3MemoryChunkRows("4096")).toBe(4096);
  });
});
