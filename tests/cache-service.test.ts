import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppCacheService } from "../electron/services/cache-service";
import type { AppCacheProgress } from "../src/types";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })
  ));
});

async function createTemporaryRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "local-video-studio-cache-test-"));
  temporaryRoots.push(root);
  return root;
}

async function writeCacheFile(directory: string, name: string, size: number): Promise<string> {
  await fs.mkdir(directory, { recursive: true });
  const filename = path.join(directory, name);
  await fs.writeFile(filename, Buffer.alloc(size, 1));
  return filename;
}

async function setMtime(filename: string, modifiedAt: Date): Promise<void> {
  await fs.utimes(filename, modifiedAt, modifiedAt);
}

describe("app cache service", () => {
  it("measures only app-owned temporary directories alongside the current session cache", async () => {
    const root = await createTemporaryRoot();
    await writeCacheFile(path.join(root, "local-video-studio", "task-1"), "frame.bin", 12);
    await writeCacheFile(path.join(root, "local-video-studio-ux-renderer", "run-1"), "cache.bin", 8);
    await writeCacheFile(path.join(root, "local-video-studio-p05-probe-1"), "probe.bin", 5);
    await writeCacheFile(path.join(root, "not-owned-by-studio"), "ignored.bin", 100);

    const session = {
      getCacheSize: vi.fn(async () => 20),
      clearCache: vi.fn(async () => undefined)
    };
    const service = createAppCacheService({ temporaryRoot: root, session });

    await expect(service.inspect()).resolves.toMatchObject({
      currentSessionBytes: 20,
      temporaryBytes: 25,
      temporaryDirectoryCount: 3,
      totalBytes: 45
    });
  });

  it("clears the current session and stale temporary targets but keeps recent work", async () => {
    const root = await createTemporaryRoot();
    const oldTarget = path.join(root, "local-video-studio", "old-task");
    const recentTarget = path.join(root, "local-video-studio", "recent-task");
    await writeCacheFile(oldTarget, "old.bin", 4);
    await writeCacheFile(recentTarget, "recent.bin", 6);

    const now = new Date("2026-09-10T00:00:00.000Z");
    await setMtime(path.join(oldTarget, "old.bin"), new Date(now.getTime() - 60 * 60 * 1000));
    await setMtime(oldTarget, new Date(now.getTime() - 60 * 60 * 1000));
    await setMtime(path.join(recentTarget, "recent.bin"), new Date(now.getTime() - 60 * 1000));
    await setMtime(recentTarget, new Date(now.getTime() - 60 * 1000));

    const session = {
      getCacheSize: vi.fn(async () => 100),
      clearCache: vi.fn(async () => undefined),
      clearCodeCaches: vi.fn(async () => undefined)
    };
    const progress: AppCacheProgress[] = [];
    const service = createAppCacheService({
      temporaryRoot: root,
      session,
      now: () => now,
      staleAfterMs: 10 * 60 * 1000
    });

    const result = await service.clear({ onProgress: (update) => progress.push(update) });

    expect(session.clearCache).toHaveBeenCalledOnce();
    expect(session.clearCodeCaches).toHaveBeenCalledWith({ urls: [] });
    expect(result.currentSessionCleared).toBe(true);
    expect(result.skippedTemporaryDirectories).toBe(1);
    expect(result.clearedBytes).toBe(4);
    expect(progress.map((update) => update.phase)).toEqual([
      "scanning",
      "clearing-session",
      "clearing-temporary",
      "clearing-temporary",
      "clearing-temporary",
      "rescanning",
      "completed"
    ]);
    expect(progress[2]).toMatchObject({ current: 0, total: 2, totalBytes: 10 });
    expect(progress[4]).toMatchObject({ current: 2, total: 2, processedBytes: 10 });
    await expect(fs.stat(oldTarget)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(recentTarget)).resolves.toBeTruthy();
  });

  it("does not remove temporary targets while the caller reports active work", async () => {
    const root = await createTemporaryRoot();
    const target = path.join(root, "local-video-studio", "running-task");
    await writeCacheFile(target, "frame.bin", 7);
    const old = new Date("2026-09-09T00:00:00.000Z");
    await setMtime(path.join(target, "frame.bin"), old);
    await setMtime(target, old);

    const session = {
      getCacheSize: vi.fn(async () => 0),
      clearCache: vi.fn(async () => undefined)
    };
    const service = createAppCacheService({
      temporaryRoot: root,
      session,
      canClearTemporary: () => false,
      now: () => new Date("2026-09-10T00:00:00.000Z")
    });

    const result = await service.clear();

    expect(result.skippedTemporaryDirectories).toBe(1);
    await expect(fs.stat(target)).resolves.toBeTruthy();
  });
});
