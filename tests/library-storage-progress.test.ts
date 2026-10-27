import { describe, expect, it } from "vitest";
import { libraryStorageProgressView, type LibraryStorageProgress } from "../src/core/library-storage-progress.js";
import { normalizeAppearance } from "../src/core/appearance.js";

const progress: LibraryStorageProgress = { operation: "migration", stage: "write", locale: "zh-CN", appearance: normalizeAppearance(undefined) };
describe("startup library progress", () => {
  it("shows only counted stage work, without a made-up percentage for backup or switch", () => {
    expect(libraryStorageProgressView({ ...progress, stage: "backup" }).percent).toBeUndefined();
    expect(libraryStorageProgressView({ ...progress, completed: 1199, total: 1200 })).toMatchObject({ percent: 99, count: "1,199 / 1,200 项" });
    expect(libraryStorageProgressView({ ...progress, completed: 1200, total: 1200 }).percent).toBe(100);
    expect(libraryStorageProgressView({ ...progress, stage: "commit" }).percent).toBeUndefined();
    expect(libraryStorageProgressView({ ...progress, completed: 0, total: 0 }).percent).toBeUndefined();
  });
  it.each(["zh-CN", "zh-TW", "en-US"] as const)("uses saved locale %s and separates loading from migration", locale => {
    const migration = libraryStorageProgressView({ ...progress, locale });
    const loading = libraryStorageProgressView({ ...progress, locale, operation: "opening", stage: "loading" });
    expect(migration.title).not.toBe(loading.title); expect(migration.hint).not.toBe(""); expect(loading.hint).toBe("");
  });
});
