import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";
import { request } from "node:http";
import { JsonStore } from "../electron/store.js";
import { NasPublisher } from "../electron/services/nas-publisher.js";
import { NasLibrary } from "../Tools/NasBrowser/src/library.js";
import { startServer } from "../Tools/NasBrowser/src/server.js";
import { HistoryQueryService } from "../electron/services/history-query-service.js";
import { nativeHistoryFileSystem } from "../electron/services/native-history-file-system.js";
import type { AppLogger } from "../src/infrastructure/app-logger.js";
import { createDefaultState } from "../src/core/defaults.js";
import { createHistoryPerformanceFixture } from "./fixtures/history-performance.js";

const roots: string[] = [], publishers: NasPublisher[] = [], libraries: NasLibrary[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const publisher of publishers.splice(0)) await publisher.close();
  for (const library of libraries.splice(0)) library.clear();
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
async function fixture(delayMs = 60000) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-nas-v2-")); roots.push(root);
  const output = path.join(root, "PC Output"), archive = path.join(root, "PC Documents"), nas = path.join(root, "NAS Media"), nasArchive = path.join(root, "NAS Library"), data = path.join(root, "NAS Data");
  for (const directory of [output, archive, nas, nasArchive]) await fs.mkdir(directory);
  const stateFile = path.join(root, "studio-state.json"), state = createDefaultState();
  const asset = createHistoryPerformanceFixture(2).videos[1];
  asset.prompt = "on demand prompt\n".repeat(500); asset.versions[0].files[0].absolutePath = path.join(output, asset.versions[0].files[0].filename);
  await fs.writeFile(asset.versions[0].files[0].absolutePath, "synthetic media");
  state.history = [asset];
  await fs.writeFile(stateFile, JSON.stringify(state));
  const errors: unknown[] = [];
  const publisher = new NasPublisher({ stateFile, coversDirectory: path.join(root, "covers"), resolveOutputRoot: async () => output, onError: error => errors.push(error), delayMs }); publishers.push(publisher);
  const store = new JsonStore(stateFile, { libraryDirectory: archive, beforeLibraryMove: () => publisher.prepareLibraryMove(), onCommitted: state => publisher.schedule(state) });
  const loaded = await store.load(); await publisher.flush();
  const relative = `StudioLibrary/${loaded.libraryStorage!.libraryId}`, source = path.join(archive, relative), destination = path.join(nasArchive, relative);
  const sync = async () => { await fs.cp(path.join(store.get().libraryStorage!.directory, relative), destination, { recursive: true, force: true }); await fs.cp(output, nas, { recursive: true, force: true }); };
  const open = () => { const library = new NasLibrary(nas, relative, nasArchive, data); libraries.push(library); return library; };
  return { root, archive, nasArchive, data, source, destination, store, publisher, errors, sync, open, asset };
}

describe("committed automatic NAS projection", () => {
  it("publishes a cover saved after the initial export without a new desktop metadata commit", async () => {
    const f = await fixture(10); await f.sync(); const library = f.open(); await library.reload();
    expect(library.detail(f.asset.id).coverUrl).toBe("");
    const desktopCommit = f.store.get().libraryStorage!.commit;
    const pointer = () => fs.readFile(path.join(f.source, "current.json"), "utf8");
    const initial = await pointer();
    const query = new HistoryQueryService({ store: f.store, logger: {} as AppLogger,
      paths: { historyCoverDirectory: path.join(f.root, "covers") }, fileSystem: nativeHistoryFileSystem,
      resolveTaskOutputDirectory: async () => path.join(f.root, "PC Output") });
    f.publisher.observeCovers(query);
    const version = f.asset.versions[0], sourcePath = version.files[0].absolutePath!;
    const key = query.coverCacheKeyForVideoVersion(f.asset, version);
    const lookup = await query.lookupHistoryCover(key, sourcePath);
    expect(lookup.state).toBe("miss"); if (lookup.state !== "miss") throw new Error("Expected uncached fixture");
    expect(await query.saveHistoryCoverIfCurrent({ key, sourcePath, sourceRevision: lookup.sourceRevision,
      data: new TextEncoder().encode("first saved jpeg").buffer })).toMatchObject({ state: "saved" });
    await vi.waitFor(async () => { expect(await pointer()).not.toBe(initial); }, { timeout: 3000 });
    expect(f.store.get().libraryStorage!.commit).toBe(desktopCommit);
    await f.sync(); await library.reload(); const firstCover = library.detail(f.asset.id).coverUrl;
    expect(firstCover).not.toBe("");
    expect(await fs.readFile(await library.source(f.asset.id, version.id, "cover"), "utf8")).toBe("first saved jpeg");
    const published = await pointer();
    await query.saveHistoryCoverIfCurrent({ key, sourcePath, sourceRevision: lookup.sourceRevision,
      data: new TextEncoder().encode("refined saved jpeg").buffer });
    await vi.waitFor(async () => { expect(await pointer()).not.toBe(published); }, { timeout: 3000 });
    await f.sync(); await library.reload();
    expect(await fs.readFile(await library.source(f.asset.id, version.id, "cover"), "utf8")).toBe("refined saved jpeg");
    expect(f.errors).toEqual([]);
  });
  it("automatically publishes added works and polls past pointer-first sync and late media without restart", async () => {
    const f = await fixture(10); await f.sync();
    const web = path.join(f.root, "web"); await fs.mkdir(web); await fs.writeFile(path.join(web, "index.html"), "<!doctype html>");
    const refreshErrors: string[] = [];
    const server = await startServer({ mediaRoot: path.join(f.root, "NAS Media"), libraryRoot: f.nasArchive,
      libraryDirectory: `StudioLibrary/${f.store.get().libraryStorage!.libraryId}`, dataDirectory: f.data,
      host: "127.0.0.1", port: 0, pollSeconds: 1, allowedOrigins: ["http://nas.test:8790"] }, web, message => refreshErrors.push(message));
    const base = `http://127.0.0.1:${(server.server.address() as { port: number }).port}`;
    const health = () => new Promise<{ count: number; revision: string; refreshError: boolean }>((resolve, reject) => {
      const req = request(`${base}/healthz`, { headers: { Host: "nas.test:8790" } }, response => {
        const chunks: Buffer[] = []; response.on("data", chunk => chunks.push(Buffer.from(chunk)));
        response.on("end", () => { try { expect(response.statusCode).toBe(200); resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch (error) { reject(error); } });
        response.on("error", reject);
      }); req.on("error", reject); req.end();
    });
    const waitFor = (check: () => Promise<void>) => vi.waitFor(check, { timeout: 6000, interval: 80 });
    try {
      const original = await health(); expect(original.count).toBe(1);
      const previous = await fs.readFile(path.join(f.source, "current.json"), "utf8");
      const added = structuredClone(f.asset), source = path.join(f.root, "PC Output", "late-media.mp4");
      added.id = "added-work"; added.title = "New batch"; added.versions[0].files[0] = { ...added.versions[0].files[0], filename: "late-media.mp4", absolutePath: source };
      await fs.writeFile(source, "new synchronized video");
      await f.store.update(state => { state.history.push(added); });
      // No manual publisher.flush: the committed-state callback and debounce must run themselves.
      await waitFor(async () => { expect(await fs.readFile(path.join(f.source, "current.json"), "utf8")).not.toBe(previous); });
      await fs.copyFile(path.join(f.source, "current.json"), path.join(f.destination, "current.json"));
      await waitFor(async () => { expect(refreshErrors.length).toBeGreaterThan(0); expect((await health()).count).toBe(1); });
      await fs.cp(f.source, f.destination, { recursive: true, force: true });
      await waitFor(async () => { expect(await health()).toMatchObject({ count: 1, refreshError: false }); });
      await fs.copyFile(source, path.join(f.root, "NAS Media", "late-media.mp4"));
      await waitFor(async () => { const next = await health(); expect(next.count).toBe(2); expect(next.revision).not.toBe(original.revision); });
      expect(f.errors).toEqual([]);
    } finally { await server.close(); }
  }, 20000);
  it("moves metadata while media is offline and resumes pending publication at the new library", async () => {
    const f = await fixture(), media = path.join(f.root, "PC Output"), offline = `${media}-offline`, moved = path.join(f.root, "Moved Offline Library");
    await f.sync(); const library = f.open(); await library.reload();
    await fs.rename(media, offline);
    await f.store.update(state => { state.history[0].title = "Edited offline"; });
    await f.publisher.flush(); expect(f.errors.length).toBeGreaterThan(0);
    await f.store.update(state => { state.settings.libraryDirectory = moved; });
    expect(f.store.get().libraryStorage!.directory).toBe(moved);
    await expect(fs.stat(f.source)).rejects.toMatchObject({ code: "ENOENT" });
    await fs.rename(offline, media); await f.publisher.flush(); await f.sync(); await library.reload();
    expect(library.detail(f.asset.id).title).toBe("Edited offline");
  });
  it("ignores a legacy publishing path and preserves NAS generations across library relocation", async () => {
    const f = await fixture(), oldDirectory = path.join(f.root, "old-publish"), moved = path.join(f.root, "moved-library");
    await f.sync(); const library = f.open(); await library.reload();
    await fs.mkdir(oldDirectory); await fs.writeFile(path.join(oldDirectory, "precious.txt"), "keep");
    await f.store.update(state => { Object.assign(state.settings, { nasSyncDirectory: oldDirectory }); state.history[0].title = "Before move"; });
    // The move must drain a pending publication before moving its generation.
    await f.store.update(state => { state.settings.libraryDirectory = moved; });
    await f.publisher.flush(); await f.sync(); await library.reload();
    expect(library.detail(f.asset.id).title).toBe("Before move");
    await expect(fs.stat(f.source)).rejects.toMatchObject({ code: "ENOENT" });
    await f.store.update(state => { state.history[0].title = "After move"; });
    await f.publisher.flush(); await f.sync(); await library.reload();
    expect(library.detail(f.asset.id).title).toBe("After move");
    await expect(fs.stat(f.source)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.readdir(oldDirectory)).toEqual(["precious.txt"]);
    expect(f.errors).toEqual([]);
  });

  it("publishes automatically after durable edits, keeps private fields out, and does not rewrite a no-op", async () => {
    const f = await fixture(); expect(f.errors).toEqual([]);
    const current = path.join(f.source, "current.json"), before = await fs.readFile(current, "utf8"), stat = await fs.stat(current);
    expect(before).not.toContain("prompt");
    const records = await fs.readdir(path.join(f.source, "records"));
    const record = await fs.readFile(path.join(f.source, "records", records[0]), "utf8");
    expect(record).not.toMatch(/absolutePath|comfyOutputs|workflowPath/);
    expect(JSON.parse(record)).toMatchObject({ favorite: f.asset.favorite, rating: f.asset.rating ?? null });
    expect(record).not.toContain(f.asset.prompt);
    await f.store.update(state => { state.draft.seed = 12345; }); await f.publisher.flush();
    expect((await fs.stat(current)).mtimeMs).toBe(stat.mtimeMs);
    await f.store.update(state => { state.history[0].title = "New title"; }); await f.publisher.flush();
    expect(await fs.readFile(current, "utf8")).not.toBe(before);
    await f.sync(); const library = f.open(); await library.reload();
    expect(library.detail(f.asset.id).title).toBe("New title");
    expect(library.prompt(f.asset.id, f.asset.versions[0].id).prompt).toBe(f.asset.prompt.trim());
  });

  it("publishes favorite/rating edits to the read-only replica and keeps them across index restart", async () => {
    const f = await fixture(); await f.sync(); let library = f.open(); await library.reload();
    const before = library.info().revision;
    await f.store.update(state => { state.history[0].favorite = true; state.history[0].rating = 4.5; state.history[0].tags = ["Synced"]; });
    await f.publisher.flush(); await f.sync(); await library.reload();
    expect(library.info().revision).not.toBe(before);
    expect(library.detail(f.asset.id)).toMatchObject({ favorite: true, rating: 4.5, tags: ["Synced"] });
    expect(library.createQuery({ favoriteOnly: true, minRating: 4.5, tags: ["Synced"], sort: "rating-desc" }).total).toBe(1);
    expect(library.createQuery({ minRating: 5 }).total).toBe(0);
    library.clear(); library = f.open(); await library.reload();
    expect(library.detail(f.asset.id)).toMatchObject({ favorite: true, rating: 4.5, tags: ["Synced"] });
    await f.store.update(state => { state.history[0].favorite = false; state.history[0].rating = null; });
    await f.publisher.flush(); await f.sync(); await library.reload();
    expect(library.createQuery({ favoriteOnly: true }).total).toBe(0);
    expect(library.detail(f.asset.id)).toMatchObject({ favorite: false, rating: null });
  });

  it("preserves the last committed generation during out-of-order upload, truncation and process restart", async () => {
    const f = await fixture(); await f.sync(); let library = f.open(); await library.reload();
    const previous = await fs.readFile(path.join(f.source, "current.json"), "utf8");
    await f.store.update(state => { state.history[0].title = "Arrives later"; }); await f.publisher.flush();
    await fs.copyFile(path.join(f.source, "current.json"), path.join(f.destination, "current.json"));
    await fs.cp(path.join(f.source, "commits"), path.join(f.destination, "commits"), { recursive: true, force: true });
    await expect(library.reload()).rejects.toThrow();
    expect(library.detail(f.asset.id).title).toBe(f.asset.title);
    library.clear(); library = f.open();
    await expect(library.reload()).rejects.toThrow();
    expect(library.info().count).toBe(1);
    expect(library.prompt(f.asset.id, f.asset.versions[0].id).prompt).toBe(f.asset.prompt.trim());
    await f.sync(); await library.reload(); expect(library.detail(f.asset.id).title).toBe("Arrives later");
    await fs.writeFile(path.join(f.destination, "current.json"), previous);
    await expect(library.reload()).rejects.toThrow("older");
    expect(library.detail(f.asset.id).title).toBe("Arrives later");
    await fs.writeFile(path.join(f.destination, "current.json"), "{truncated");
    library.clear(); library = f.open(); await expect(library.reload()).rejects.toThrow();
    expect(library.detail(f.asset.id).title).toBe("Arrives later");
  });

  it("retains missing media metadata, commits explicit deletion and does not revive deleted records after index rebuild", async () => {
    const f = await fixture(); await f.sync(); let library = f.open(); await library.reload();
    await fs.rename(f.asset.versions[0].files[0].absolutePath!, `${f.asset.versions[0].files[0].absolutePath}.offline`);
    await f.store.update(state => { state.history[0].title = "Media temporarily offline"; }); await f.publisher.flush();
    await f.sync(); await library.reload(); expect(library.info().count).toBe(1);
    await f.store.update(state => { state.history = []; }); await f.publisher.flush();
    await f.sync(); await library.reload(); expect(library.info().count).toBe(0);
    library.clear(); await fs.writeFile(path.join(f.data, "library.sqlite"), "damaged sqlite");
    library = f.open(); await library.reload(); expect(library.info().count).toBe(0);
    expect((await fs.readdir(f.data)).some(name => name.startsWith("library.sqlite.corrupt-"))).toBe(true);
  });

  it("keeps the published pointer when a local publication write fails and retries later", async () => {
    const f = await fixture(), current = path.join(await fs.realpath(f.source), "current.json"), before = await fs.readFile(current, "utf8");
    const rename = fs.rename.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (to === current) throw Object.assign(new Error("ENOSPC"), { code: "ENOSPC" });
      return rename(from, to);
    });
    await f.store.update(state => { state.history[0].title = "Pending upload"; }); await f.publisher.flush();
    expect(f.errors).toHaveLength(1); expect(await fs.readFile(current, "utf8")).toBe(before);
    expect(f.store.get().history[0].title).toBe("Pending upload");
    vi.restoreAllMocks(); await f.publisher.flush();
    expect(await fs.readFile(current, "utf8")).not.toBe(before);
  });

  it("refuses an index directory inside a synchronized source before writing any SQLite files", async () => {
    const f = await fixture(); await f.sync();
    const library = new NasLibrary(path.join(f.root, "NAS Media"), `StudioLibrary/${f.store.get().libraryStorage!.libraryId}`, f.nasArchive, f.nasArchive); libraries.push(library);
    await expect(library.reload()).rejects.toThrow("must be separate");
    await expect(fs.stat(path.join(f.nasArchive, "library.sqlite"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rebuilds a logically damaged SQLite record from verified source objects", async () => {
    const f = await fixture(); await f.sync(); let library = f.open(); await library.reload(); library.clear();
    const db = new DatabaseSync(path.join(f.data, "library.sqlite"));
    db.exec("UPDATE records SET json='{}'"); db.close();
    library = f.open(); await library.reload();
    expect(library.detail(f.asset.id).title).toBe(f.asset.title);
    expect(library.prompt(f.asset.id, f.asset.versions[0].id).prompt).toBe(f.asset.prompt.trim());
    expect((await fs.readdir(f.data)).some(name => name.startsWith("library.sqlite.corrupt-"))).toBe(true);
  });
});
