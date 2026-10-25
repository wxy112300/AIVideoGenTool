import { describe, expect, it } from "vitest";
import {
  compareReleaseVersions,
  releaseVersionAtLeast
} from "../src/core/release-version";

describe("release version comparison", () => {
  it("does not treat a CUDA wheel build suffix as a lower package release", () => {
    expect(compareReleaseVersions("0.4.2+cu130", "0.4.2")).toBe(0);
    expect(compareReleaseVersions("0.4.3+cu130", "0.4.2+cu128")).toBeGreaterThan(0);
  });
  it("compares prefixed semantic release versions", () => {
    expect(compareReleaseVersions("v0.2.7", "0.2.6")).toBeGreaterThan(0);
    expect(compareReleaseVersions("0.2.6", "v0.2.6")).toBe(0);
    expect(releaseVersionAtLeast("0.2.5", "0.2.6")).toBe(false);
    expect(releaseVersionAtLeast("", "0.2.1")).toBe(false);
  });
});
