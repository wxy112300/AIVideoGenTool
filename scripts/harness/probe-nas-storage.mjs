// Synthetic v2 import/query scale. Real HTTP/SQLite, no GPU or real media/library.
import fs from "node:fs/promises";
import { openSync, closeSync } from "node:fs";
import path from "node:path";
import net from "node:net";
import { randomUUID, createHash } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { performance } from "node:perf_hooks";
import assert from "node:assert/strict";
import { pollUntil } from "../app-harness.mjs";

const root = path.resolve(import.meta.dirname, "../.."), execute = promisify(execFile), temp = path.join(root, "temp");
await fs.mkdir(temp, { recursive: true });
const directory = await fs.mkdtemp(path.join(temp, "nas-scale-")), archive = path.join(directory, "archive"), media = path.join(directory, "media"), data = path.join(directory, "data"), source = path.join(archive, "StudioLibrary", randomUUID());
for (const target of [media, source, path.join(source, "records"), path.join(source, "texts"), path.join(source, "commits")]) await fs.mkdir(target, { recursive: true });
const digest = raw => createHash("sha256").update(raw).digest("hex"), prompt = "A long on-demand prompt. ".repeat(200), promptRaw = JSON.stringify(prompt), promptRef = digest(promptRaw), libraryId = path.basename(source);
await fs.writeFile(path.join(source, "texts", `${promptRef}.json`), promptRaw);
await fs.writeFile(path.join(media, "fixture.mp4"), "metadata-only fixture");
const refs = [], assets = [];
const writeStart = performance.now();
// Parallel fixture writes intentionally do not benchmark production durable publishing.
for (let batch = 0; batch < 10000; batch += 16) await Promise.all(Array.from({ length: Math.min(16, 10000 - batch) }, async (_, offset) => {
  const i = batch + offset, id = `asset-${i}`, createdAt = new Date(Date.UTC(2026, 9, 27) - i * 1000).toISOString();
  const asset = { id, title: `Asset ${i}`, createdAt, updatedAt: createdAt, modelId: "minimax_h3_fl2va", tags: [i % 2 ? "city" : "nature"], duration: 4,
    versions: [{ id: `version-${i}`, createdAt, width: 640, height: 360, duration: 4, media: { path: "fixture.mp4", size: 21 }, prompt: "", promptRef }] };
  const raw = JSON.stringify(asset), hash = digest(raw); assets[i] = asset; refs[i] = { id, hash };
  await fs.writeFile(path.join(source, "records", `${hash}.json`), raw);
}));
let pointer;
async function commit(generation) {
  const manifest = { schemaVersion: 2, libraryId, generation, parent: pointer?.commit ?? null, locale: "zh-CN", models: [{ id: "minimax_h3_fl2va", name: "H3" }], records: refs, deleted: [] };
  const raw = JSON.stringify(manifest), hash = digest(raw);
  await fs.writeFile(path.join(source, "commits", `${hash}.json`), raw);
  pointer = { schemaVersion: 2, libraryId, commit: hash };
  await fs.writeFile(path.join(source, "current.json"), JSON.stringify(pointer));
}
await commit(1);
const report = { ok: false, directory, records: 10000, realHttp: true, sqlite: true, mediaDecoded: false, productionPublishBenchmark: false, sourceFixtureWriteMs: performance.now() - writeStart, timingsMs: {} };
let child, base;
const config = path.join(directory, "server.json"), serverLog = path.join(directory, "server.log");
async function start() {
  const reservation = net.createServer(); await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve)); const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  base = `http://127.0.0.1:${port}`;
  await fs.writeFile(config, JSON.stringify({ mediaRoot: media, libraryRoot: archive, libraryDirectory: `StudioLibrary/${libraryId}`, dataDirectory: data, host: "127.0.0.1", port, pollSeconds: 86400, allowedOrigins: [base] }));
  const log = openSync(serverLog, "a"); child = spawn(process.execPath, ["Tools/NasBrowser/dist/runtime/server.mjs", "--config", config], { cwd: root, windowsHide: true, stdio: ["ignore", log, log] }); closeSync(log);
  const started = performance.now();
  await pollUntil(async () => { try { const response = await fetch(`${base}/healthz`); return response.ok && (await response.json()).count === 10000; } catch { return false; } }, Boolean, 120000, "10k NAS index", 200);
  return performance.now() - started;
}
async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once("exit", resolve)); child.kill(); await exited;
}
try {
  report.timingsMs.coldImportAndMediaCheck = await start();
  const queryStart = performance.now(), query = await (await fetch(`${base}/api/v1/videos`)).json();
  report.timingsMs.createQuery = performance.now() - queryStart; assert.equal(query.total, 10000); assert.equal(query.items.length, 48);
  const times = [];
  for (let i = 0; i < 30; i++) {
    const startTime = performance.now(), page = await (await fetch(`${base}/api/v1/queries/${query.queryId}/items?offset=${i * 97}&limit=48`)).json();
    times.push(performance.now() - startTime); assert.equal(page.items.length, 48); assert.equal(page.total, 10000);
  }
  times.sort((a, b) => a - b); report.timingsMs.pageP50 = times[15]; report.timingsMs.pageP95 = times[28];
  const promptStart = performance.now(), text = await (await fetch(`${base}/api/v1/videos/asset-4321/versions/version-4321/prompt`)).json();
  assert.equal(text.prompt, prompt); report.timingsMs.onDemandPrompt = performance.now() - promptStart;
  try { report.serverRssMiB = Number((await execute("powershell.exe", ["-NoProfile", "-Command", `(Get-Process -Id ${child.pid}).WorkingSet64`])).stdout.trim()) / 1024 ** 2; } catch { report.serverRssMiB = null; }
  await stop();
  assets[4321].title = "One incremental change";
  const raw = JSON.stringify(assets[4321]), hash = digest(raw); refs[4321] = { id: "asset-4321", hash };
  await fs.writeFile(path.join(source, "records", `${hash}.json`), raw); await commit(2);
  report.timingsMs.restartWithOneChangedRecord = await start();
  assert.equal((await (await fetch(`${base}/api/v1/videos/asset-4321`)).json()).title, "One incremental change");
  const db = new DatabaseSync(path.join(data, "library.sqlite"), { readOnly: true });
  assert.equal(Number(db.prepare("SELECT count(*) AS n FROM records").get().n), 10000);
  assert.equal(Number(db.prepare("SELECT count(*) AS n FROM texts").get().n), 1); db.close();
  await stop(); await fs.writeFile(path.join(source, "current.json"), "{truncated");
  report.timingsMs.restartWithIncompleteSource = await start();
  assert.equal((await (await fetch(`${base}/api/v1/videos/asset-4321`)).json()).title, "One incremental change");
  assert.equal((await (await fetch(`${base}/healthz`)).json()).refreshError, true);
  report.ok = true;
} catch (error) { report.error = error.stack; process.exitCode = 1; }
finally {
  await stop();
  await fs.writeFile(path.join(directory, "report.json"), JSON.stringify(report, null, 2));
  assert.ok(directory.startsWith(`${temp}${path.sep}`));
  for (const target of [archive, media, data]) { assert.equal(path.dirname(target), directory); await fs.rm(target, { recursive: true, force: true }); }
  console.log(JSON.stringify(report, null, 2));
}
