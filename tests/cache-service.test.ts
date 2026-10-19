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
  it("keeps a protected first backup and continues clearing the next software target", async () => {
    const root = await createTemporaryRoot();
    const protectedPath = path.join(root, "protected"), disposablePath = path.join(root, "disposable");
    await writeCacheFile(protectedPath, "user.mp4", 11);
    await writeCacheFile(disposablePath, "runtime.dll", 7);
    const targets = [protectedPath, disposablePath].map(target => ({ path: target, identity: target }));
    const clear = vi.fn(async (target: typeof targets[number]) => {
      if (target.path === protectedPath) throw new Error("contains user media");
      await fs.rm(target.path, { recursive: true });
    });
    const software = { inspect: vi.fn(async () => await Promise.all(targets.map(async target =>
      await fs.stat(target.path).then(() => target, () => null))).then(found => found.filter(target => target !== null))), clear,
      withCleanup: async <T>(work: () => Promise<T>) => work() };
    const cache = createAppCacheService({ temporaryRoot: root,
      session: { getCacheSize: async () => 0, clearCache: async () => {} }, software });
    const result = await cache.clear();
    expect(result.errors).toEqual(["contains user media"]);
    expect(clear.mock.calls.map(([target]) => target.path)).toEqual([protectedPath, disposablePath]);
    expect(await fs.stat(protectedPath)).toBeTruthy();
    await expect(fs.stat(disposablePath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(result.clearedBytes).toBe(7);
  });
  it("counts and clears old software through the same cache operation and reports protected leftovers", async () => {
    const root = await createTemporaryRoot(), softwarePath = path.join(root, "old-software");
    await writeCacheFile(softwarePath, "runtime.dll", 19);
    const target = { path: softwarePath, identity: "owned-fixture" };
    const software = { inspect: vi.fn(async () => await fs.stat(softwarePath).then(() => [target], () => [])),
      clear: vi.fn(async () => { await fs.rm(softwarePath, { recursive: true }); }),
      withCleanup: async <T>(work: () => Promise<T>) => work() };
    const service = createAppCacheService({ temporaryRoot: root, session: { getCacheSize: async () => 0, clearCache: async () => {} }, software });
    expect((await service.inspect()).temporaryBytes).toBe(19);
    const result = await service.clear();
    expect(software.clear).toHaveBeenCalledWith(target);
    expect(result.clearedBytes).toBe(19); expect(result.after.temporaryDirectoryCount).toBe(0);
    await writeCacheFile(softwarePath, "runtime.dll", 19);
    software.clear.mockRejectedValueOnce(new Error("contains user data"));
    expect((await service.clear()).errors).toContain("contains user data");
    expect(await fs.stat(softwarePath)).toBeTruthy();
  });
  it("does not clean software or request a handoff when software maintenance is busy", async () => {
    const root = await createTemporaryRoot(), file = await writeCacheFile(path.join(root, "backup"), "old.dll", 7);
    const software = { inspect: async () => [{ path: path.dirname(file), identity: "fixture" }], clear: vi.fn(),
      withCleanup: async <T>(_work: () => Promise<T>): Promise<T> => { throw new Error("Agent is using the software; no handoff"); } };
    const service = createAppCacheService({ temporaryRoot: root, session: { getCacheSize: async () => 0, clearCache: async () => {} }, software });
    const result = await service.clear();
    expect(result.errors[0]).toContain("no handoff"); expect(result.skippedTemporaryDirectories).toBe(1);
    expect(software.clear).not.toHaveBeenCalled(); expect(await fs.stat(file)).toBeTruthy();
  });
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
