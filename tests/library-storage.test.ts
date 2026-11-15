import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonStore } from "../electron/store.js";
import { canonical, LibraryRecordStore } from "../electron/services/library-record-store.js";
import { createDefaultState } from "../src/core/defaults.js";
import { stateDigest } from "../electron/services/state-file-safety.js";
import { createHistoryPerformanceFixture } from "./fixtures/history-performance.js";
import { recoverLibraryLocation } from "../electron/services/library-location-recovery.js";
import type { LibraryStorageProgress } from "../src/core/library-storage-progress.js";

const directories: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const dir of directories.splice(0)) await fs.rm(dir, { recursive: true, force: true }); });
async function fixture(count = 0) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studio-library-")); directories.push(directory);
  const filename = path.join(directory, "profile", "studio-state.json"), libraryDirectory = path.join(directory, "重定向文档", "Local Video Studio", "Library");
  const history = createHistoryPerformanceFixture(count), state = createDefaultState();
  state.history = history.videos; state.imageHistory = history.images;
  // A missing physical file still has a persisted filename and must remain discoverable.
  for (const project of state.imageHistory) for (const version of project.versions) version.file.filename ||= "missing.png";
  const raw = JSON.stringify(state);
  await fs.mkdir(path.dirname(filename), { recursive: true }); await fs.writeFile(filename, raw);
  return { filename, libraryDirectory, directory, state, raw, options: { libraryDirectory } };
}

describe("library migration and immutable records", () => {
  it("keeps newer transient progress in memory when a workspace checkpoint fails", async () => {
    const { filename, options } = await fixture(1), store = new JsonStore(filename, options);
    await store.load(); store.mutateTransient(state => { state.draft.seed = 100; });
    const rename = vi.spyOn(fs, "rename").mockImplementationOnce(async () => {
      store.mutateTransient(state => { state.draft.seed = 200; });
      throw Error("checkpoint failed");
    });
    await expect(store.flushWorkspace()).rejects.toThrow("checkpoint failed");
    rename.mockRestore(); expect(store.get().draft.seed).toBe(200);
    await store.flushWorkspace(); await store.close();
    const reopened = new JsonStore(filename, options);
    expect((await reopened.load()).draft.seed).toBe(200);
    await reopened.close();
  });

  it("saves workspace edits without cloning history and restores them on failed writes", async () => {
    const { filename, options } = await fixture(4), committed = vi.fn();
    const store = new JsonStore(filename, { ...options, onCommitted: committed, onCommittedNeeded: () => false });
    const before = await store.load(); committed.mockClear();
    const clone = vi.spyOn(globalThis, "structuredClone");
    await store.updateWorkspaceWithoutSnapshot(state => { state.draft.seed = 1234; state.settings.appearance.historyMasonryColumns = 6; });
    expect(clone.mock.calls.every(([value]) => !(value as { history?: unknown[] })?.history?.length)).toBe(true);
    clone.mockRestore();
    expect(committed).not.toHaveBeenCalled();
    expect(store.get().libraryStorage).toEqual(before.libraryStorage);
    expect(store.get().history).toEqual(before.history);
    await expect(store.updateWorkspaceWithoutSnapshot(state => { (state as unknown as { history: unknown[] }).history = []; })).rejects.toThrow();
    const rename = vi.spyOn(fs, "rename").mockRejectedValueOnce(Error("disk failure"));
    await expect(store.updateWorkspaceWithoutSnapshot(state => { state.draft.seed = 999; })).rejects.toThrow("disk failure");
    rename.mockRestore();
    expect(store.get().draft.seed).toBe(1234);
    await store.close();
    const reopened = new JsonStore(filename, options), next = await reopened.load();
    expect(next.draft.seed).toBe(1234);
    expect(next.settings.appearance.historyMasonryColumns).toBe(6);
    expect(next.history).toEqual(before.history);
    await reopened.close();
  });

  it("persists scoped video/image metadata without changing unrelated record identities", async () => {
    const { filename, options } = await fixture(3);
    const store = new JsonStore(filename, options), before = await store.load();
    const disk = await LibraryRecordStore.open(before.libraryStorage!);
    const previous = JSON.parse(await fs.readFile(path.join(before.libraryStorage!.directory, "commits", `${before.libraryStorage!.commit}.json`), "utf8"));
    const ids = [before.history[0]!.id, before.imageHistory[0]!.id];
    const next = await store.updateHistoryItems(ids, items => {
      items[0]!.favorite = true; items[0]!.rating = 4.5;
      items[1]!.tags = ["scene", "new"];
    });
    const commit = JSON.parse(await fs.readFile(path.join(next.libraryStorage!.directory, "commits", `${next.libraryStorage!.commit}.json`), "utf8"));
    expect(commit.history.slice(1)).toEqual(previous.history.slice(1));
    expect(commit.imageHistory.slice(1)).toEqual(previous.imageHistory.slice(1));
    expect(next.queue).toEqual(before.queue);
    await store.close();
    const reopened = new JsonStore(filename, options), loaded = await reopened.load();
    expect(loaded.history[0]).toMatchObject({ favorite: true, rating: 4.5 });
    expect(loaded.imageHistory[0]!.tags).toEqual(["scene", "new"]);
    await reopened.close();
  });

  it("rolls back scoped edits after validation or durable-write failure and allows retry", async () => {
    const { filename, options } = await fixture(2);
    const store = new JsonStore(filename, options), before = await store.load(), id = before.history[0]!.id;
    await expect(store.updateHistoryItems([id], items => { items[0]!.favorite = true; throw Error("invalid edit"); })).rejects.toThrow("invalid edit");
    expect(store.get().history).toEqual(before.history);
    const rename = vi.spyOn(fs, "rename").mockRejectedValueOnce(Error("disk write failed"));
    await expect(store.updateHistoryItems([id], items => { items[0]!.tags = ["failed"]; })).rejects.toThrow("disk write failed");
    rename.mockRestore();
    expect(store.get().history).toEqual(before.history);
    const next = await store.updateHistoryItems([id], items => { items[0]!.tags = ["retry"]; });
    expect(next.history[0]!.tags).toEqual(["retry"]);
    await expect(store.updateHistoryItems([id, "missing"], () => undefined)).rejects.toThrow();
    expect(store.get().history[0]!.tags).toEqual(["retry"]);
    await store.close();
  });

  it("skips untouched record bodies only when their verified hash belongs to the parent", async () => {
    const { filename, options } = await fixture(2);
    const store = new JsonStore(filename, options), state = await store.load(); await store.close();
    const pointer = state.libraryStorage!, disk = await LibraryRecordStore.open(pointer);
    const collections = await disk.load(pointer.commit);
    const first = collections.history[0] as Record<string, unknown>;
    const second = collections.history[1] as Record<string, unknown>;
    const guarded = new Proxy(first, { ownKeys() { throw Error("untouched body traversed"); } });
    const candidate = await disk.prepare({ ...collections, history: [guarded, { ...second, rating: 3.5 }] }, pointer.commit, undefined, new Set([second.id as string]));
    const loaded = await disk.load(candidate.commit);
    expect(loaded.history[0]).toEqual(first);
    expect(loaded.history[1]).toMatchObject({ rating: 3.5 });
    // A prepared but uncommitted generation must never leak through cache reuse.
    const original = await disk.prepare(collections, pointer.commit, undefined, new Set([first.id as string]));
    expect((await disk.load(original.commit)).history).toEqual(collections.history);
    const cold = await LibraryRecordStore.open(pointer);
    const fallback = await cold.prepare({ ...collections, history: [{ ...first, optional: undefined }, second] }, pointer.commit, undefined, new Set([first.id as string]));
    expect((await cold.load(fallback.commit)).history).toEqual(collections.history);
  });

  it("reports durable write/read counts, finishes only after switching, and distinguishes reopening", async () => {
    const { filename, options, state } = await fixture(3), events: LibraryStorageProgress[] = [];
    const store = new JsonStore(filename, { ...options, onProgress: value => events.push(value) });
    const loaded = await store.load();
    expect(events[0].stage).toBe("backup");
    const written = events.filter(event => event.stage === "write");
    expect(written.map(event => event.completed)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(written.every(event => event.total === state.history.length + state.imageHistory.length)).toBe(true);
    expect(events.some(event => event.stage === "verify" && event.completed === 6 && event.total === 6)).toBe(true);
    expect(events.at(-1)?.stage).toBe("complete");
    expect(JSON.parse(await fs.readFile(filename, "utf8")).libraryStorage).toEqual(loaded.libraryStorage);
    await store.close();
    const reopened: LibraryStorageProgress[] = [], next = new JsonStore(filename, { onProgress: value => reopened.push(value) });
    await next.load();
    expect(reopened.every(event => event.operation === "opening")).toBe(true);
    expect(reopened.some(event => event.stage === "loading" && event.completed === 6 && event.total === 6)).toBe(true);
    expect(reopened.at(-1)?.stage).toBe("complete"); await next.close();
  });

  it("never reports completion for a failed switch, and progress callbacks cannot corrupt or reject a migration", async () => {
    const { filename, options, raw } = await fixture(2), events: LibraryStorageProgress[] = [];
    const rename = fs.rename.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (to === filename) throw Object.assign(new Error("ENOSPC"), { code: "ENOSPC" });
      return rename(from, to);
    });
    await expect(new JsonStore(filename, { ...options, onProgress: value => events.push(value) }).load()).rejects.toThrow("ENOSPC");
    expect(events.some(event => event.stage === "complete")).toBe(false);
    expect(await fs.readFile(filename, "utf8")).toBe(raw);
    vi.restoreAllMocks();
    const store = new JsonStore(filename, { ...options, onProgress: () => { throw new Error("Unavailable display"); } });
    expect((await store.load()).history).toHaveLength(2); await store.close();
  });

  it.each([0, 137, 1200])("migrates %i videos and images once with stable IDs, versions and missing media references", async count => {
    const { filename, options, raw, state } = await fixture(count);
    if (count) {
      Object.assign(state.history[0], { futureField: { unknown: true }, prompt: "长提示词".repeat(1000) });
      Object.assign(state.imageHistory[0], { futureField: { unknown: true } });
      Object.assign(state.imageHistory[0].versions[0], { futureVersionField: ["unchanged"] });
      Object.assign(state.imageHistory[0].versions[0].file, { futureFileField: { preserved: true } });
      await fs.writeFile(filename, JSON.stringify(state));
    }
    const source = await fs.readFile(filename, "utf8");
    const store = new JsonStore(filename, options), loaded = await store.load();
    expect(loaded.history.map(item => item.id)).toEqual(state.history.map(item => item.id));
    expect(loaded.imageHistory.map(item => item.id)).toEqual(state.imageHistory.map(item => item.id));
    expect(loaded.history.flatMap(item => item.versions.map(version => version.id))).toEqual(state.history.flatMap(item => item.versions.map(version => version.id)));
    expect(loaded.imageHistory.flatMap(item => item.versions.map(version => version.id)).sort()).toEqual(state.imageHistory.flatMap(item => item.versions.map(version => version.id)).sort());
    if (count) {
      expect(loaded.history[0]).toHaveProperty("futureField.unknown", true);
      expect(loaded.imageHistory[0]).toHaveProperty("futureField.unknown", true);
      expect(loaded.imageHistory[0].versions.find(version => version.id === state.imageHistory[0].versions[0].id)).toHaveProperty("futureVersionField", ["unchanged"]);
      expect(loaded.imageHistory[0].versions.find(version => version.id === state.imageHistory[0].versions[0].id)).toHaveProperty("file.futureFileField.preserved", true);
    }
    const primary = JSON.parse(await fs.readFile(filename, "utf8"));
    expect(primary.history).toBeUndefined(); expect(primary.imageHistory).toBeUndefined();
    expect(primary.libraryStorage).toEqual(loaded.libraryStorage);
    expect(await fs.readFile(`${filename}.pre-library-${stateDigest(source)}.json`, "utf8")).toBe(count ? source : raw);
    const disk = await LibraryRecordStore.open(loaded.libraryStorage!);
    expect(canonical(await disk.load(loaded.libraryStorage!.commit))).toBe(canonical(JSON.parse(JSON.stringify({ history: loaded.history, imageHistory: loaded.imageHistory }))));
    const restarted = await new JsonStore(filename, options).load();
    expect(restarted.libraryStorage).toEqual(loaded.libraryStorage);
    expect(restarted.history).toEqual(loaded.history); expect(restarted.imageHistory).toEqual(loaded.imageHistory);
  }, 120_000);

  it("changes only one record, deduplicates text, retains tombstones and never scans deleted objects back into history", async () => {
    const { filename, options, libraryDirectory } = await fixture(3);
    const store = new JsonStore(filename, options); await store.load();
    const recordsDirectory = path.join(libraryDirectory, "records");
    const before = new Set(await fs.readdir(recordsDirectory));
    await store.update(state => { state.history[0].title = "Only this record changes"; });
    expect((await fs.readdir(recordsDirectory)).filter(name => !before.has(name))).toHaveLength(1);
    await store.update(state => { state.history.splice(0, 1); });
    const pointer = store.get().libraryStorage!;
    const commit = JSON.parse(await fs.readFile(path.join(libraryDirectory, "commits", `${pointer.commit}.json`), "utf8"));
    expect(commit.deleted).toEqual([{ collection: "history", id: "history-video-0" }]);
    expect((await new JsonStore(filename, options).load()).history.map(item => item.id)).toEqual(["history-video-1", "history-video-2"]);
    expect((await fs.readdir(recordsDirectory)).length).toBeGreaterThan(5);
  });

  it("retries an interrupted locator switch without duplicate libraries or media changes", async () => {
    const { filename, options, raw, libraryDirectory } = await fixture(3);
    const rename = fs.rename.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (to === filename) throw Object.assign(new Error("ENOSPC"), { code: "ENOSPC" });
      return rename(from, to);
    });
    await expect(new JsonStore(filename, options).load()).rejects.toThrow("ENOSPC");
    expect(await fs.readFile(filename, "utf8")).toBe(raw);
    const identity = await fs.readFile(path.join(libraryDirectory, "library.json"), "utf8");
    vi.restoreAllMocks();
    const loaded = await new JsonStore(filename, options).load();
    expect(loaded.history).toHaveLength(3);
    expect(await fs.readFile(path.join(libraryDirectory, "library.json"), "utf8")).toBe(identity);
  });

  it("refuses occupied destinations and preserves the old source", async () => {
    const { filename, options, libraryDirectory, raw } = await fixture(1);
    await fs.mkdir(libraryDirectory, { recursive: true }); await fs.writeFile(path.join(libraryDirectory, "precious.txt"), "keep");
    await expect(new JsonStore(filename, options).load()).rejects.toThrow("目标目录非空");
    expect(await fs.readFile(filename, "utf8")).toBe(raw);
    expect(await fs.readFile(path.join(libraryDirectory, "precious.txt"), "utf8")).toBe("keep");
  });

  it("keeps a missing or damaged active library from falling back to the old history", async () => {
    const { filename, options, libraryDirectory } = await fixture(2);
    const store = new JsonStore(filename, options); const loaded = await store.load();
    await store.update(state => { state.history[0].title = "New work after migration"; });
    await fs.rename(libraryDirectory, `${libraryDirectory}-offline`);
    const raw = await fs.readFile(filename, "utf8"), restarted = new JsonStore(filename, options);
    await expect(restarted.load()).rejects.toThrow("未被默认值替换");
    await expect(restarted.flush()).rejects.toThrow("必须先恢复资料");
    expect(await fs.readFile(filename, "utf8")).toBe(raw);
    expect(loaded.libraryStorage!.libraryId).toBeTruthy();
  });

  it("moves a library location with the same library ID and removes the original files", async () => {
    const { filename, options, libraryDirectory, directory } = await fixture(2);
    const store = new JsonStore(filename, options); const original = await store.load();
    const next = path.join(directory, "另一磁盘位置");
    await store.update(state => { state.settings.libraryDirectory = next; });
    const current = store.get();
    expect(current.libraryStorage!.libraryId).toBe(original.libraryStorage!.libraryId);
    expect(current.libraryStorage!.directory).toBe(next);
    await expect(fs.stat(path.join(libraryDirectory, "library.json"))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await new JsonStore(filename, options).load()).history).toEqual(current.history);
  });

  it("uses a temporary writer lease without permanently binding the library to a profile", async () => {
    const { filename, options, directory } = await fixture(1);
    const first = new JsonStore(filename, options); const original = await first.load();
    const other = path.join(directory, "other-profile.json");
    await fs.copyFile(filename, other);
    await expect(new JsonStore(other, options).load()).rejects.toThrow("另一个配置");
    await first.close();
    await expect(first.update(state => { state.history[0].title = "Closed writer"; })).rejects.toThrow("资料库写入器已关闭或尚未打开。");
    const next = new JsonStore(other, options);
    expect((await next.load()).libraryStorage!.libraryId).toBe(original.libraryStorage!.libraryId);
    await next.close();
  });

  it("recovers only an explicitly selected matching complete library and never initializes a wrong folder", async () => {
    const { filename, options, libraryDirectory, directory } = await fixture(2);
    const store = new JsonStore(filename, options); const original = await store.load(); await store.close();
    const moved = path.join(directory, "恢复位置"); await fs.rename(libraryDirectory, moved);
    const raw = await fs.readFile(filename, "utf8"), wrong = path.join(directory, "错误库");
    await fs.mkdir(wrong);
    await expect(recoverLibraryLocation(filename, wrong)).rejects.toThrow();
    expect(await fs.readFile(filename, "utf8")).toBe(raw); expect(await fs.readdir(wrong)).toEqual([]);
    await recoverLibraryLocation(filename, moved);
    const reopened = new JsonStore(filename); const loaded = await reopened.load();
    expect(loaded.history).toEqual(original.history); expect(loaded.libraryStorage!.directory).toBe(moved);
    await reopened.close();
  });

  it("lets an explicit empty destination recover a blocked first migration without discarding the source history", async () => {
    const { filename, options, directory, state } = await fixture(1);
    const chosen = path.join(directory, "selected-empty-directory"); await fs.mkdir(chosen);
    await recoverLibraryLocation(filename, chosen);
    const prepared = JSON.parse(await fs.readFile(filename, "utf8"));
    expect(prepared.history).toEqual(JSON.parse(JSON.stringify(state.history)));
    expect(prepared.settings.libraryDirectory).toBe(chosen);
    const store = new JsonStore(filename, options), loaded = await store.load();
    expect(loaded.history[0].id).toBe(state.history[0].id); expect(loaded.libraryStorage!.directory).toBe(chosen);
    await store.close();
  });
});
