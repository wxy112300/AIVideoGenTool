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
});
