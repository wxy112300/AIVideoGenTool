import { describe, expect, it } from "vitest";
import { structurallyEqual } from "../src/core/structural-equal";

describe("structurallyEqual", () => {
  it("ignores object insertion order at every level", () => {
    expect(structurallyEqual(
      { locale: "zh-CN", nested: { enabled: true, url: "http://127.0.0.1:8188" } },
      { nested: { url: "http://127.0.0.1:8188", enabled: true }, locale: "zh-CN" }
    )).toBe(true);
  });

  it("preserves array order and detects real value changes", () => {
    expect(structurallyEqual({ values: ["a", "b"] }, { values: ["b", "a"] })).toBe(false);
    expect(structurallyEqual({ enabled: false }, { enabled: true })).toBe(false);
  });

  it("treats omitted and undefined object properties consistently", () => {
    expect(structurallyEqual({ locale: "zh-CN", draft: undefined }, { locale: "zh-CN" })).toBe(true);
  });

  it("matches canonical JSON state comparison across nested values and nullable array entries", () => {
    const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
      : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])) : value;
    const values: unknown[] = [null, undefined, false, true, 0, -0, 1, NaN, Infinity, "", "same", "不同",
      [], [undefined], [null], [NaN], [1, 2], [2, 1], {}, { missing: undefined }, { x: null },
      { x: [1, { z: "value", a: false }] }, { x: [1, { a: false, z: "value" }] }, { x: [1, { a: true, z: "value" }] }];
    for (const left of values) for (const right of values) {
      expect(structurallyEqual(left, right)).toBe(JSON.stringify(canonical(left)) === JSON.stringify(canonical(right)));
    }
  });
});
