import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { connectApp, parseAppHarnessArgs, pollUntil } from "../app-harness.mjs";
import { fixtureUi } from "./fixture-ui.mjs";

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("upscale-smoke.mjs <asset-fixture> --port <port> [--output report.json] [--audit <enqueue-report.json>]\nFresh --asset-source-state fixture only: real History/model/720p controls, temporarily rename the fixture MP4 to prove missing-source rejection, restore, then click enqueue. Does not start GPU. One baseline per fixture. --audit checks completed lineage/original files after generation or restart; use verify-video-smoke separately for playback. Focus emulation; no native-picker evidence.");
  process.exit(0);
}
const directory = path.resolve(args.shift() || "");
const auditIndex = args.indexOf("--audit");
if (auditIndex >= 0) assert.ok(args[auditIndex + 1] && !args[auditIndex + 1].startsWith("--"), "--audit requires an enqueue report path");
const auditPath = auditIndex < 0 ? undefined : args.splice(auditIndex, 2)[1];
const options = parseAppHarnessArgs(["inspect", ...args]);
const report = { ok: false, evidence: auditPath ? "real-upscale-persisted-audit" : "real-upscale-ui-enqueue", focusEmulation: true };
const baselinePath = path.join(directory, "upscale-baseline.json");
const inside = filename => {
  const relative = path.relative(directory, path.resolve(filename));
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "Outside isolated fixture: " + filename);
  return path.resolve(filename);
};
const digest = async filename => createHash("sha256").update(await fs.readFile(inside(filename))).digest("hex");
let client, moved;
try {
  assert.match(path.relative(path.resolve("temp"), directory), /^create-smoke-[^\\/]+$/);
  const launch = JSON.parse(await fs.readFile(path.join(directory, "launch.json"), "utf8"));
  assert.equal(path.resolve(launch.directory).toLowerCase(), directory.toLowerCase());
  assert.equal(launch.port, options.port);
  assert.equal(launch.scenario, "asset-migration-canonical");
  client = await connectApp(options);
  await client.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  const getState = () => client.evaluate("window.studio.getState()");
  const state = await getState();
  assert.equal(state.queueRunning, false);
  if (auditPath) {
    const preparation = JSON.parse(await fs.readFile(inside(auditPath), "utf8"));
    assert.equal(preparation.ok, true);
    const baseline = JSON.parse(await fs.readFile(baselinePath, "utf8"));
    assert.equal(state.history.length, 1);
    const asset = state.history.find(a => a.id === baseline.assetId);
    assert.ok(asset);
    assert.equal(asset.versions.length, 2);
    const original = asset.versions.find(v => v.id === baseline.version.id);
    assert.deepEqual(original, baseline.version, "Upscale mutated original version");
    for (const source of baseline.sources) assert.equal(await digest(source.path), source.sha256);
    const version = asset.versions.find(v => v.taskId === preparation.task.id);
    assert.ok(version, "Expected completed Upscale version");
    assert.notEqual(version.id, original.id);
    assert.equal(version.kind, "upscale");
    assert.equal(version.sourceAssetId, asset.id);
    assert.equal(version.sourceVersionId, original.id);
    assert.equal(version.modelId, preparation.task.modelId);
    assert.equal(asset.defaultVersionId, version.id);
    assert.equal(version.width, preparation.task.targetWidth);
    assert.equal(version.height, preparation.task.targetOutputHeight);
    assert.equal(version.fps, original.fps);
    assert.equal(version.duration, original.duration);
    assert.equal(state.queue.length, 0);
    const output = version.files.find(f => /\.mp4$/i.test(f.filename));
    assert.ok(output?.absolutePath);
    assert.notEqual(path.resolve(output.absolutePath).toLowerCase(), path.resolve(baseline.sourcePath).toLowerCase());
    assert.ok((await fs.stat(inside(output.absolutePath))).size > 0);
    report.lineage = { assetId: asset.id, sourceVersionId: original.id, versionId: version.id, taskId: version.taskId };
    report.media = { path: output.absolutePath, width: version.width, height: version.height, fps: version.fps, duration: version.duration };
    report.originalVersionAndBytesPreserved = true;
  } else {
    assert.equal(state.queue.length, 0);
    assert.equal(state.history.length, 1);
    const asset = state.history[0];
    assert.equal(asset.versions.length, 1);
    const version = asset.versions[0];
    assert.ok(Math.min(version.width, version.height) < 720, "This bounded smoke requires a source below 720p");
    const sourcePath = inside(version.files.find(f => /\.mp4$/i.test(f.filename))?.absolutePath || "");
    const paths = new Set([sourcePath, ...[version.h3ContinuationData?.artifact?.payload?.absolutePath,
      version.h3ContinuationData?.artifact?.manifest?.absolutePath].filter(Boolean)]);
    const sources = await Promise.all([...paths].map(async filename => ({ path: inside(filename), sha256: await digest(filename) })));
    await fs.writeFile(baselinePath, JSON.stringify({ assetId: asset.id, version, sourcePath, sources }, null, 2), { flag: "wx" });
    const ui = fixtureUi(client, options.timeout, report);
    if (await client.evaluate("!!document.querySelector('#cancel-upscale')")) await ui.click("#cancel-upscale");
    await ui.openHistory(asset.id);
    await pollUntil(() => client.evaluate("document.querySelector('.history-player video')?.dataset.historyVersion === " + JSON.stringify(version.id)), Boolean, options.timeout, "Exact source version");
    await ui.click("[data-open-upscale]");
    await pollUntil(() => client.evaluate("!!document.querySelector('#upscale-model')"), Boolean, options.timeout, "Upscale dialog mount");
    async function selectModel(value) {
      const index = await client.evaluate("[...document.querySelector('#upscale-model').options].findIndex(o=>o.value===" + JSON.stringify(value) + " && !o.disabled)");
      assert.ok(index >= 0, "Selectable provider " + value);
      await client.evaluate("document.querySelector('#upscale-model').focus()");
      for (const key of ["Home", ...Array(index).fill("ArrowDown"), "Enter"]) {
        const virtualKeyCode = { Home: 36, ArrowDown: 40, Enter: 13 }[key];
        await client.send("Input.dispatchKeyEvent", { type: "keyDown", key, windowsVirtualKeyCode: virtualKeyCode });
        await client.send("Input.dispatchKeyEvent", { type: "keyUp", key, windowsVirtualKeyCode: virtualKeyCode });
      }
      await pollUntil(() => client.evaluate("document.querySelector('#upscale-model')?.value===" + JSON.stringify(value)), Boolean, options.timeout, "Model keyboard selection");
    }
    await selectModel("seedvr2");
    report.pixelControls = await client.evaluate("[...document.querySelectorAll('.upscale-dialog select')].map(e=>e.id)");
    await selectModel("seedvr2-native-int8");
    report.nativeControls = await client.evaluate("[...document.querySelectorAll('.upscale-dialog select')].map(e=>e.id)");
    assert.ok(report.pixelControls.includes("upscale-tile"));
    assert.ok(!report.nativeControls.includes("upscale-tile"));
    await ui.click('[data-upscale-height="720"]');
    report.source = { assetId: asset.id, versionId: version.id, sourcePath };
    const temporary = inside(sourcePath + ".upscale-smoke-hold");
    assert.equal(await fs.stat(temporary).catch(() => null), null);
    await fs.rename(sourcePath, temporary);
    moved = { sourcePath, temporary };
    try {
      await ui.click("#enqueue-upscale");
      report.missingSourceError = await pollUntil(() => client.evaluate("document.querySelector('#app-flash.visible[data-kind=error] [data-flash-message]')?.textContent"),
        text => text?.includes("源视频文件不存在"), options.timeout, "Missing source rejects real enqueue");
      assert.equal((await getState()).queue.length, 0);
      report.missingSourceRejected = true;
    } finally {
      await fs.rename(temporary, sourcePath);
      moved = undefined;
    }
    assert.equal(await digest(sourcePath), sources[0].sha256);
    await ui.click("#enqueue-upscale");
    report.task = await pollUntil(async () => (await getState()).queue[0], task => !!task, options.timeout, "Real button produces task ID");
    const final = await getState();
    assert.equal(final.queue.length, 1);
    assert.equal(final.queueRunning, false);
    assert.equal(report.task.taskType, "upscale");
    assert.equal(report.task.status, "waiting");
    assert.equal(report.task.sourceAssetId, asset.id);
    assert.equal(report.task.sourceVersionId, version.id);
    assert.equal(report.task.sourceFilePath, sourcePath);
    assert.equal(report.task.modelId, "seedvr2-native-int8");
    assert.equal(report.task.upscaleMode, "pixel");
    assert.equal(report.task.targetHeight, 720);
    assert.deepEqual(final.history[0].versions[0], version);
    report.actualUiEnqueue = true;
  }
  report.ok = true;
} catch (error) {
  report.error = error.message;
  if (moved) report.restoreRequired = moved;
  process.exitCode = 1;
} finally { client?.close(); }
if (options.output) await fs.writeFile(options.output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
