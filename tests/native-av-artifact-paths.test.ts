import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveNativeAvArtifactFilePath } from "../src/core/native-av-artifact-paths.js";

describe("AV recorded path resolution", () => {
  const root = path.resolve("output");
  const file = { filename: "h3av_artifact-001.json", subfolder: "h3-native-av", type: "output" };
  const canonical = path.join(root, file.subfolder, file.filename);

  it("restores references without cached paths", () => {
    expect(resolveNativeAvArtifactFilePath(root, file)).toBe(canonical);
  });

  it.each([
    path.resolve("outside", "h3-native-av", file.filename),
    path.join(root, "wrong-folder", file.filename),
    path.join(root, "h3-native-av", "another.json"),
    path.join("relative", "h3-native-av", file.filename)
  ])("does not trust a recorded path outside the AV location: %s", (absolutePath) => {
    expect(resolveNativeAvArtifactFilePath(root, { ...file, absolutePath })).toBe(canonical);
  });

  it("rejects unsafe relative descriptors", () => {
    expect(resolveNativeAvArtifactFilePath(root, { ...file, filename: "../escape.json" })).toBeUndefined();
    expect(resolveNativeAvArtifactFilePath(root, { ...file, subfolder: "../other" })).toBeUndefined();
    expect(resolveNativeAvArtifactFilePath("", file)).toBeUndefined();
  });
});
