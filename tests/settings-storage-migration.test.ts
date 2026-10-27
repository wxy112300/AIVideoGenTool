import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { JsonStore } from "../electron/store.js";
import { SettingsService } from "../electron/services/settings-service.js";
import { AppLogger } from "../src/infrastructure/app-logger.js";
import { createDefaultState } from "../src/core/defaults.js";
import { createHistoryPerformanceFixture } from "./fixtures/history-performance.js";
import type { HistoryMigrationProgress } from "../src/types.js";
import { planRelocation, prepareRelocation, relocationFiles, relocationJournal } from "../electron/services/file-relocation.js";

const roots: string[] = [], stores: JsonStore[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const store of stores.splice(0)) await store.close(); for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-storage-settings-")); roots.push(root);
  const output = path.join(root, "Comfy", "output"), video = path.join(output, "Videos"), image = path.join(output, "Images");
  await fs.mkdir(video, { recursive: true }); await fs.mkdir(image);
  const stateFile = path.join(root, "state.json"), library = path.join(root, "Documents", "Library"), state = createDefaultState();
  Object.assign(state.settings, { outputDirectory: video, imageOutputDirectory: image, imageInputLibraryDirectory: path.join(root, "Input") });
  const items = createHistoryPerformanceFixture(2);
  state.history = [items.videos[1]]; state.imageHistory = [items.images[1]];
  for (const file of [...state.history[0].files, ...state.history[0].versions.flatMap(version => version.files)]) {
    file.absolutePath = path.join(video, file.filename); file.subfolder = ""; await fs.writeFile(file.absolutePath, `video:${file.filename}`);
  }
  for (const version of state.imageHistory[0].versions) {
    version.file.filename ||= `${version.id}.png`; version.file.absolutePath = path.join(image, version.file.filename); version.file.subfolder = "";
    await fs.writeFile(version.file.absolutePath, `image:${version.id}`);
  }
  const oldVideo = state.history[0].files[0].absolutePath!;
  state.draft.sourceVideoPath = oldVideo;
  await fs.writeFile(stateFile, JSON.stringify(state));
  const progress: HistoryMigrationProgress[] = [], options = { libraryDirectory: library, onMoveProgress: (value: HistoryMigrationProgress) => progress.push(value) };
  const store = new JsonStore(stateFile, options); stores.push(store); await store.load();
  const service = new SettingsService({ store, stateFile, logger: new AppLogger({ directory: path.join(root, "logs") }),
    videoHistoryMigrationJournal: path.join(root, "legacy-migration.json"), resolveComfyOutputDirectory: async () => output,
    sendState: vi.fn(), sendHistoryMigrationProgress: value => progress.push(value), clearRendererDirty: vi.fn() });
  return { root, output, video, image, oldVideo, stateFile, library, store, service, progress, options };
}
describe("confirmed settings storage migration", () => {
  it("moves metadata, video and image bytes, remaps consumers and survives restart", async () => {
    const f = await fixture(), before = f.store.get(), inode = (await fs.stat(f.oldVideo)).ino;
    const settings = { ...before.settings, libraryDirectory: path.join(f.root, "Moved Library"), outputDirectory: path.join(f.output, "Videos New"), imageOutputDirectory: path.join(f.output, "Images New") };
    const next = await f.service.save(settings, "migrate-storage");
    expect(next.libraryStorage!.libraryId).toBe(before.libraryStorage!.libraryId);
    expect(next.history[0].id).toBe(before.history[0].id); expect(next.imageHistory[0].id).toBe(before.imageHistory[0].id);
    expect(next.draft.sourceVideoPath).toBe(next.history[0].files[0].absolutePath);
    expect((await fs.stat(next.history[0].files[0].absolutePath!)).ino).toBe(inode);
    await expect(fs.stat(f.oldVideo)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(path.join(f.library, "library.json"))).rejects.toMatchObject({ code: "ENOENT" });
    for (const version of next.imageHistory[0].versions) {
      expect(version.file.absolutePath?.startsWith(settings.imageOutputDirectory)).toBe(true);
      expect(await fs.readFile(version.file.absolutePath!, "utf8")).toBe(`image:${version.id}`);
    }
    expect(f.progress.some(value => value.phase === "moving" && value.total > 0)).toBe(true);
    expect(f.progress.at(-1)?.phase).toBe("completed");
    await f.store.close(); const restarted = new JsonStore(f.stateFile, f.options); stores.push(restarted);
    const loaded = await restarted.load(); expect(loaded.history).toEqual(next.history); expect(loaded.imageHistory).toEqual(next.imageHistory);
  });
  it("requires confirmation instead of changing any storage path with apply", async () => {
    const f = await fixture();
    for (const field of ["libraryDirectory", "outputDirectory", "imageOutputDirectory"] as const) {
      await expect(f.service.save({ ...f.store.get().settings, [field]: path.join(f.output, "New") })).rejects.toThrow("确认");
    }
    expect(await fs.stat(f.oldVideo)).toBeTruthy();
  });
  it("rejects out-of-root image and video targets before moving any data", async () => {
    const f = await fixture(), original = f.store.get();
    for (const field of ["outputDirectory", "imageOutputDirectory"] as const) {
      await expect(f.service.save({ ...original.settings, [field]: path.join(f.root, "Outside") }, "migrate-storage")).rejects.toThrow("ComfyUI output");
    }
    expect(f.store.get().libraryStorage).toEqual(original.libraryStorage); expect(await fs.stat(f.oldVideo)).toBeTruthy();
  });
  it("restores real moved media when the durable state commit fails", async () => {
    const f = await fixture(), original = f.store.get(), rename = fs.rename.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (source, target) => { if (target === f.stateFile) throw Object.assign(new Error("ENOSPC"), { code: "ENOSPC" }); return rename(source, target); });
    await expect(f.service.save({ ...original.settings, libraryDirectory: path.join(f.root, "New Library"), outputDirectory: path.join(f.output, "New"), imageOutputDirectory: path.join(f.output, "New Images") }, "migrate-storage")).rejects.toThrow("ENOSPC");
    expect(f.store.get().settings).toEqual(original.settings); expect(await fs.stat(f.oldVideo)).toBeTruthy();
    expect(await fs.stat(path.join(f.library, "library.json"))).toBeTruthy();
    for (const version of original.imageHistory[0].versions) expect(await fs.stat(version.file.absolutePath!)).toBeTruthy();
  });
  it("reports incomplete cleanup instead of success, preserves both verified copies and resumes", async () => {
    const f = await fixture(), settings = { ...f.store.get().settings, outputDirectory: path.join(f.output, "New") }, rename = fs.rename.bind(fs), unlink = fs.unlink.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (source, target) => {
      if (source === f.oldVideo) throw Object.assign(new Error("EXDEV"), { code: "EXDEV" }); return rename(source, target);
    });
    vi.spyOn(fs, "unlink").mockImplementation(async filename => { if (filename === f.oldVideo) throw new Error("EACCES"); return unlink(filename); });
    await expect(f.service.save(settings, "migrate-storage")).rejects.toThrow("尚未完成");
    expect(f.progress.some(value => value.phase === "completed")).toBe(false);
    expect(await fs.stat(f.oldVideo)).toBeTruthy(); expect(await fs.stat(f.store.get().history[0].files[0].absolutePath!)).toBeTruthy();
    vi.restoreAllMocks(); await f.service.save(settings, "migrate-storage");
    await expect(fs.stat(f.oldVideo)).rejects.toMatchObject({ code: "ENOENT" });
    expect(f.progress.at(-1)?.phase).toBe("completed");
  });
  it("refuses migration while a queue is running", async () => {
    const f = await fixture(); await f.store.update(state => { state.queueRunning = true; });
    await expect(f.service.save({ ...f.store.get().settings, outputDirectory: path.join(f.output, "New") }, "migrate-storage")).rejects.toThrow("停止队列");
    expect(await fs.stat(f.oldVideo)).toBeTruthy();
  });
  it("reopens the original metadata library after an interruption before locator commit", async () => {
    const f = await fixture(), original = f.store.get(); await f.store.close();
    const target = path.join(f.root, "Interrupted Library");
    const tx = await planRelocation("library", f.library, target, await relocationFiles(f.library), relocationJournal(f.stateFile, "library"));
    await prepareRelocation(tx);
    // Deliberately leave the durable old locator and journal without rollback.
    const reopened = new JsonStore(f.stateFile, f.options); stores.push(reopened);
    const recovered = await reopened.load();
    expect(recovered.libraryStorage!.directory).toBe(f.library);
    expect(recovered.history).toEqual(original.history); expect(recovered.imageHistory).toEqual(original.imageHistory);
    await expect(fs.stat(tx.journal)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("keeps independent managed Run chunks in place while moving normal video output", async () => {
    const f = await fixture(), chunk = path.join(f.video, "h3_continuum", "runs", "run-1", "chunk.mp4");
    await fs.mkdir(path.dirname(chunk), { recursive: true }); await fs.writeFile(chunk, "managed run");
    await f.service.save({ ...f.store.get().settings, outputDirectory: path.join(f.output, "New") }, "migrate-storage");
    expect(await fs.readFile(chunk, "utf8")).toBe("managed run");
    await expect(fs.stat(f.oldVideo)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("does not move an input archive nested under the old output directory", async () => {
    const f = await fixture(), inputs = path.join(f.image, "input-archive"), input = path.join(inputs, "reference.png");
    await fs.mkdir(inputs); await fs.writeFile(input, "input reference");
    await f.store.update(state => { state.settings.imageInputLibraryDirectory = inputs; });
    await f.service.save({ ...f.store.get().settings, imageOutputDirectory: path.join(f.output, "New Images") }, "migrate-storage");
    expect(await fs.readFile(input, "utf8")).toBe("input reference");
    expect(f.store.get().settings.imageInputLibraryDirectory).toBe(inputs);
  });
});
