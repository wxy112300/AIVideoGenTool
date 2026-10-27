// Bounded synthetic scale evidence; never reads userData or existing libraries.
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { LibraryRecordStore } from "../../dist/electron/electron/services/library-record-store.js";
import { stateDigest } from "../../dist/electron/electron/services/state-file-safety.js";
const root = path.resolve(import.meta.dirname, "../.."), temp = path.join(root, "temp");
await fs.mkdir(temp, { recursive: true });
const directory = await fs.mkdtemp(path.join(temp, "library-scale-")), libraryDirectory = path.join(directory, "Library");
const prompt = "A detailed scene with a calm camera. ".repeat(100);
const history = Array.from({ length: 10000 }, (_, i) => ({ id: `video-${i}`, prompt, title: `Video ${i}`, modelId: "minimax_h3_fl2va", tags: [i % 2 ? "city" : "nature"],
  sourceAssetId: i ? `video-${i - 1}` : null, versions: [{ id: `version-${i}`, file: `missing-${i}.mp4`, run: { owner: `run-${i}`, payload: `external-${i}.pt` } }], futureExtension: { keep: true } }));
const report = { ok: false, directory, count: history.length, physicalMedia: false, timingsMs: {}, memoryMiB: {} };
try {
  const start = performance.now(), store = await LibraryRecordStore.create(libraryDirectory, stateDigest("scale fixture"));
  const pointer = await store.prepare({ history, imageHistory: [] }, null); report.timingsMs.initialWrite = performance.now() - start;
  const cold = performance.now(), reopened = await LibraryRecordStore.open(pointer), loaded = await reopened.load(pointer.commit);
  report.timingsMs.coldRead = performance.now() - cold; assert.equal(loaded.history.length, 10000);
  report.memoryMiB.afterColdRead = process.memoryUsage().rss / 1024 ** 2;
  const query = performance.now();
  for (let i = 0; i < 1000; i++) assert.ok(loaded.history.find(item => item.id === `video-${i * 7}`));
  report.timingsMs.averageIdentityQuery = (performance.now() - query) / 1000;
  const before = new Set(await fs.readdir(path.join(libraryDirectory, "records"))), edit = performance.now();
  loaded.history[4321].title = "One changed item";
  const updated = await reopened.prepare(loaded, pointer.commit); report.timingsMs.oneRecordChange = performance.now() - edit;
  report.newRecordObjects = (await fs.readdir(path.join(libraryDirectory, "records"))).filter(name => !before.has(name)).length;
  assert.equal(report.newRecordObjects, 1); assert.notEqual(updated.commit, pointer.commit);
  const noop = performance.now(); assert.equal((await reopened.prepare(loaded, updated.commit)).commit, updated.commit);
  report.timingsMs.noop = performance.now() - noop;
  report.textObjects = (await fs.readdir(path.join(libraryDirectory, "texts"))).length; assert.equal(report.textObjects, 1);
  report.memoryMiB.final = process.memoryUsage().rss / 1024 ** 2; report.ok = true;
} finally {
  await fs.writeFile(path.join(directory, "report.json"), JSON.stringify(report, null, 2));
  // This exact directory was created above; keep the compact report, remove only its synthetic objects.
  assert.equal(path.dirname(libraryDirectory), directory); assert.ok(directory.startsWith(`${temp}${path.sep}`));
  await fs.rm(libraryDirectory, { recursive: true, force: true });
  console.log(JSON.stringify(report, null, 2));
}
