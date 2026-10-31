import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonStore } from "../electron/store.js";
import { MigratingUserDataRepository, relocateUserDataReferences, UserDataMigration } from "../electron/services/user-data-migration.js";
import { studioDataDirectory, studioStorageLocation } from "../electron/services/studio-data-location.js";
import { createDefaultState } from "../src/core/defaults.js";
import { queueTaskFromDraft } from "../src/core/queue-task-factory.js";
import { createHistoryPerformanceFixture } from "./fixtures/history-performance.js";

const directories: string[] = [], stores: MigratingUserDataRepository[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const store of stores.splice(0)) await store.close();
  for (const directory of directories.splice(0)) await fs.rm(directory, { recursive: true, force: true });
});
async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studio-user-data-")); directories.push(directory);
  const source = path.join(directory, "AppData", "profile"), destination = studioDataDirectory(path.join(directory, "重定向文档"));
  const libraryDirectory = path.join(directory, "custom-library"), state = createDefaultState();
  const sourceImage = path.join(source, "clipboard-inputs", "picture.png");
  await fs.mkdir(path.dirname(sourceImage), { recursive: true }); await fs.writeFile(sourceImage, "original-picture");
  state.draft.startImagePath = sourceImage;
  state.draft.promptVersions[0]!.text = `Keep literal text ${sourceImage}`;
  const task = queueTaskFromDraft(state.draft, state); state.queue.push(task);
  const history = createHistoryPerformanceFixture(2);
  state.history = history.videos; state.imageHistory = history.images;
  for (const asset of state.imageHistory) for (const version of asset.versions) version.file.filename ||= "source.png";
  const repository = () => {
    const result = new MigratingUserDataRepository(new JsonStore(path.join(destination, "studio-state.json"), { libraryDirectory }), new UserDataMigration(source, destination));
    stores.push(result); return result;
  };
  const writeState = async () => { const raw = JSON.stringify(state); await fs.writeFile(path.join(source, "studio-state.json"), raw); return raw; };
  return { directory, source, destination, libraryDirectory, state, sourceImage, task, repository, writeState, migration: new UserDataMigration(source, destination) };
}

describe("Documents user data migration", () => {
  it("uses the actual Documents folder, leaving explicit profiles isolated", () => {
    const user = path.resolve("profile"), documents = path.resolve("redirected-documents");
    expect(studioStorageLocation(user, documents, false)).toEqual({ data: studioDataDirectory(documents), documents, migrate: true });
    expect(studioStorageLocation(user, documents, true)).toEqual({ data: user, documents: path.join(user, "Documents"), migrate: false });
    expect(studioStorageLocation(user, documents, true, true).data).toBe(studioDataDirectory(path.join(user, "Documents")));
  });
  it("allows the isolated Documents subtree while rejecting overlapping owned folders", async () => {
    const f = await fixture(); await f.writeState();
    const destination = studioDataDirectory(path.join(f.source, "Documents"));
    const migration = new UserDataMigration(f.source, destination);
    await migration.prepare();
    expect(await fs.readFile(path.join(destination, "clipboard-inputs", "picture.png"), "utf8")).toBe("original-picture");
    expect(() => new UserDataMigration(f.source, path.join(f.source, "clipboard-inputs", "nested"))).toThrow("non-overlapping");
    expect(() => new UserDataMigration(f.source, path.dirname(f.source))).toThrow("non-overlapping");
  });
  it("preserves drafts, queue IDs, history and covers through migration and restart", async () => {
    const f = await fixture(), raw = await f.writeState();
    await fs.mkdir(path.join(f.source, "history-covers", "v3"), { recursive: true });
    await fs.writeFile(path.join(f.source, "history-covers", "v3", "cached.jpg"), "cached-cover");
    await fs.mkdir(path.join(f.source, "image-masks"), { recursive: true });
    await fs.writeFile(path.join(f.source, "image-masks", "mask.fabric.json"), JSON.stringify({ sourcePath: f.sourceImage, text: f.sourceImage }));
    await fs.writeFile(path.join(f.source, "Cookies"), "electron-session-do-not-touch");
    const before = await fs.stat(f.sourceImage), repository = f.repository(), loaded = await repository.load();
    const newImage = path.join(f.destination, "clipboard-inputs", "picture.png");
    expect(loaded.draft.startImagePath).toBe(newImage);
    expect(loaded.draft.promptVersions[0]!.text).toBe(f.state.draft.promptVersions[0]!.text);
    expect(loaded.queue[0]).toMatchObject({ id: f.task.id, startImagePath: newImage });
    expect(loaded.history.map(x => x.id)).toEqual(f.state.history.map(x => x.id));
    expect(loaded.imageHistory.map(x => x.id)).toEqual(f.state.imageHistory.map(x => x.id));
    expect(loaded.libraryStorage?.directory).toBe(f.libraryDirectory);
    expect(await fs.readFile(path.join(f.destination, "history-covers", "v3", "cached.jpg"), "utf8")).toBe("cached-cover");
    expect(Math.abs((await fs.stat(newImage)).mtimeMs - before.mtimeMs)).toBeLessThanOrEqual(1);
    expect(JSON.parse(await fs.readFile(path.join(f.destination, "image-masks", "mask.fabric.json"), "utf8"))).toEqual({ sourcePath: newImage, text: f.sourceImage });
    expect(await fs.readFile(path.join(f.destination, "migration-backup", "studio-state.json"), "utf8")).toBe(raw);
    expect(await fs.readdir(f.source)).toEqual(["Cookies"]);
    expect(JSON.parse(await fs.readFile(path.join(f.destination, "user-data-migration.json"), "utf8")).phase).toBe("complete");
    await repository.update(state => { state.draft.promptVersions[0]!.text = "Edited after migration"; });
    await repository.close();
    const restarted = await f.repository().load();
    expect(restarted.draft.promptVersions[0]!.text).toBe("Edited after migration");
    expect(restarted.queue[0]!.id).toBe(f.task.id);
    expect(restarted.draft.startImagePath).toBe(newImage);
  });
  it("resumes a prepared copy after interruption without creating empty state", async () => {
    const f = await fixture(); await f.writeState(); await f.migration.prepare();
    expect(await fs.readFile(f.sourceImage, "utf8")).toBe("original-picture");
    const loaded = await f.repository().load();
    expect(loaded.queue[0]!.id).toBe(f.task.id);
    await expect(fs.stat(f.sourceImage)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("retains an existing library ID/location and persists auxiliary references in immutable records", async () => {
    const f = await fixture();
    f.state.imageHistory[0]!.versions[0]!.file.absolutePath = f.sourceImage;
    const versionId = f.state.imageHistory[0]!.versions[0]!.id;
    await f.writeState();
    const previous = new JsonStore(path.join(f.source, "studio-state.json"), { libraryDirectory: f.libraryDirectory });
    const before = await previous.load(); await previous.close();
    const repository = f.repository(), loaded = await repository.load();
    expect(loaded.libraryStorage?.libraryId).toBe(before.libraryStorage?.libraryId);
    expect(loaded.libraryStorage?.directory).toBe(f.libraryDirectory);
    expect(loaded.imageHistory[0]!.versions.find(version => version.id === versionId)!.file.absolutePath).toBe(path.join(f.destination, "clipboard-inputs", "picture.png"));
    await repository.close();
    const restarted = await f.repository().load();
    expect(restarted.imageHistory[0]!.versions.find(version => version.id === versionId)!.file.absolutePath).toBe(path.join(f.destination, "clipboard-inputs", "picture.png"));
    expect(restarted.imageHistory[0]!.id).toBe(before.imageHistory[0]!.id);
  });
  it("retains originals if the prepared active copy loses an auxiliary file", async () => {
    const f = await fixture(), raw = await f.writeState(); await f.migration.prepare();
    await fs.unlink(path.join(f.destination, "clipboard-inputs", "picture.png"));
    await expect(f.repository().load()).rejects.toThrow();
    expect(await fs.readFile(path.join(f.source, "studio-state.json"), "utf8")).toBe(raw);
    expect(await fs.readFile(f.sourceImage, "utf8")).toBe("original-picture");
  });
  it("does not delete corrupt legacy state when loading the new copy fails", async () => {
    const f = await fixture(); await fs.writeFile(path.join(f.source, "studio-state.json"), "{broken");
    await expect(f.repository().load()).rejects.toThrow();
    expect(await fs.readFile(path.join(f.source, "studio-state.json"), "utf8")).toBe("{broken");
    expect(await fs.readFile(path.join(f.destination, "migration-backup", "studio-state.json"), "utf8")).toBe("{broken");
  });
  it("stops rather than overwriting an existing Documents profile", async () => {
    const f = await fixture(), raw = await f.writeState();
    await fs.mkdir(f.destination, { recursive: true }); await fs.writeFile(path.join(f.destination, "studio-state.json"), "other-profile");
    await expect(f.migration.prepare()).rejects.toThrow("Both legacy and Documents");
    expect(await fs.readFile(path.join(f.source, "studio-state.json"), "utf8")).toBe(raw);
    expect(await fs.readFile(path.join(f.destination, "studio-state.json"), "utf8")).toBe("other-profile");
  });
  it("validates all originals and backups before removing any source", async () => {
    const f = await fixture(), raw = await f.writeState(); await f.migration.prepare();
    await fs.writeFile(f.sourceImage, "changed by another writer");
    await expect(f.migration.finish()).rejects.toThrow("changed during migration");
    expect(await fs.readFile(path.join(f.source, "studio-state.json"), "utf8")).toBe(raw);
    await fs.writeFile(f.sourceImage, "original-picture");
    await fs.writeFile(path.join(f.destination, "migration-backup", "clipboard-inputs", "picture.png"), "broken-backup");
    await expect(f.migration.finish()).rejects.toThrow("verification failed");
    expect(await fs.readFile(path.join(f.source, "studio-state.json"), "utf8")).toBe(raw);
  });
  it("preserves the legacy files when a copy fails and can retry", async () => {
    const f = await fixture(), raw = await f.writeState(), copy = fs.copyFile.bind(fs);
    const failure = vi.spyOn(fs, "copyFile").mockRejectedValueOnce(new Error("disk full"));
    await expect(f.migration.prepare()).rejects.toThrow("disk full");
    expect(await fs.readFile(path.join(f.source, "studio-state.json"), "utf8")).toBe(raw);
    expect(JSON.parse(await fs.readFile(path.join(f.destination, "user-data-migration.json"), "utf8")).phase).toBe("copying");
    failure.mockImplementation(copy); await f.repository().load();
    expect(await fs.readFile(path.join(f.destination, "clipboard-inputs", "picture.png"), "utf8")).toBe("original-picture");
  });
  it("does not rename directories even when Windows refuses directory rename with EPERM", async () => {
    const f = await fixture(); await f.writeState();
    const rename = fs.rename.bind(fs), directoryAttempts: string[] = [];
    vi.spyOn(fs, "rename").mockImplementation(async (source, destination) => {
      if ((await fs.lstat(source)).isDirectory()) {
        directoryAttempts.push(String(source)); throw Object.assign(new Error("directory held by indexer"), { code: "EPERM" });
      }
      return rename(source, destination);
    });
    const loaded = await f.repository().load();
    expect(loaded.queue[0]!.id).toBe(f.task.id); expect(directoryAttempts).toEqual([]);
    expect(await fs.readFile(path.join(f.destination, "clipboard-inputs", "picture.png"), "utf8")).toBe("original-picture");
  });
  it("resumes a partial installation without recopying already verified files", async () => {
    const f = await fixture(), raw = await f.writeState(), copy = fs.copyFile.bind(fs);
    const stateCandidate = path.join(f.destination, "studio-state.json.user-migration-");
    const copied = vi.spyOn(fs, "copyFile").mockImplementation(async (source, destination, flags) => {
      if (String(destination).startsWith(stateCandidate)) throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
      return copy(source, destination, flags);
    });
    await expect(f.migration.prepare()).rejects.toThrow("disk full");
    expect(await fs.readFile(path.join(f.source, "studio-state.json"), "utf8")).toBe(raw);
    expect(await fs.readFile(path.join(f.destination, "clipboard-inputs", "picture.png"), "utf8")).toBe("original-picture");
    copied.mockImplementation(copy); copied.mockClear();
    const loaded = await f.repository().load();
    expect(loaded.queue[0]!.id).toBe(f.task.id);
    expect(copied.mock.calls.some(([, destination]) => String(destination).includes("picture.png.user-migration-"))).toBe(false);
    expect(JSON.parse(await fs.readFile(path.join(f.destination, "user-data-migration.json"), "utf8")).phase).toBe("complete");
  });
  it("retries transient file rename EPERM and reports real copy/verify/cleanup progress", async () => {
    const f = await fixture(); await f.writeState();
    const rename = fs.rename.bind(fs), events: import("../src/core/library-storage-progress.js").LibraryStorageProgress[] = [];
    let attempts = 0;
    vi.spyOn(fs, "rename").mockImplementation(async (source, destination) => {
      if (attempts++ < 2) throw Object.assign(new Error("file busy"), { code: "EPERM" });
      return rename(source, destination);
    });
    const repository = new MigratingUserDataRepository(new JsonStore(path.join(f.destination, "studio-state.json"), { libraryDirectory: f.libraryDirectory }), new UserDataMigration(f.source, f.destination, value => events.push(value)));
    stores.push(repository); await repository.load();
    expect(events.map(event => event.stage)).toEqual(expect.arrayContaining(["scan", "backup", "write", "commit", "verify", "cleanup", "complete"]));
    expect(events.every(event => event.scope === "user-data" && event.operation === "migration")).toBe(true);
    expect(events.filter(event => event.stage === "write").at(-1)).toMatchObject({ completed: 2, total: 2 });
    expect(events.at(-1)!.stage).toBe("complete");
    events.splice(0); await repository.close();
    await f.repository().load(); expect(events).toEqual([]);
  });
  it("does not follow linked auxiliary directories", async () => {
    const f = await fixture(); await f.writeState();
    const outside = path.join(f.directory, "external"); await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, "precious.txt"), "keep");
    await fs.symlink(outside, path.join(f.source, "image-guides"), process.platform === "win32" ? "junction" : "dir");
    await expect(f.migration.prepare()).rejects.toThrow("contains a link");
    expect(await fs.readFile(path.join(outside, "precious.txt"), "utf8")).toBe("keep");
  });
  it("never rewrites prompt text, unrelated absolute paths or sibling-prefix paths", () => {
    const source = path.resolve("old"), destination = path.resolve("new"), input = path.join(source, "clipboard-files", "input.png");
    const value = { prompt: input, sourcePath: input, nested: { maskPath: path.resolve("old-extra", "image-masks", "mask.png") }, outputDirectory: path.resolve("comfy-output") };
    expect(relocateUserDataReferences(value, source, destination)).toBe(true);
    expect(value).toEqual({ prompt: input, sourcePath: path.join(destination, "clipboard-files", "input.png"), nested: { maskPath: path.resolve("old-extra", "image-masks", "mask.png") }, outputDirectory: path.resolve("comfy-output") });
  });
});
