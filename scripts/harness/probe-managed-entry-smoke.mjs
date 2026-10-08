import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectApp, parseAppHarnessArgs, pollUntil } from "../app-harness.mjs";
import { fixtureUi } from "./fixture-ui.mjs";

const directory = path.resolve(process.argv[2] || ".");
const options = parseAppHarnessArgs(["inspect", ...process.argv.slice(3)]);
if (!process.argv[2] || process.argv[2] === "--help") {
  console.log("probe-managed-entry-smoke.mjs <asset-fixture-dir> --port <port> [--output report.json]\nUse a fresh launch-create-smoke --asset-source-state fixture. AppApi seeds managed mode without an accepted prefix: missing video and missing Run prefix must both block. Real keyboard model switch to Motion Context must recover, then real mouse enqueue yields a waiting task. Does not start the queue or prove managed generation. Use a new fixture after any attempt.");
  process.exit(process.argv[2] ? 0 : 1);
}
const report = { ok: false, evidence: "real-managed-prefix-gate-and-motion-recovery", focusEmulation: true,
  inputSetup: "isolated-AppApi-saveDraft", userManagedEntryVerified: false, generationVerified: false };
let client;
try {
  const repository = fileURLToPath(new URL("../../", import.meta.url));
  assert.match(path.relative(path.join(repository, "temp"), directory), /^create-smoke-[^\\/]+$/);
  assert.equal((await fs.realpath(directory)).toLowerCase(), directory.toLowerCase());
  const launch = JSON.parse(await fs.readFile(path.join(directory, "launch.json"), "utf8"));
  assert.equal(launch.scenario, "asset-migration-canonical");
  assert.equal(launch.evidence, "fixture-launched-only");
  assert.equal(launch.port, options.port);
  assert.equal(path.resolve(launch.directory).toLowerCase(), directory.toLowerCase());
  client = await connectApp(options);
  await client.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  const { click } = fixtureUi(client, options.timeout, report);
  const state = await client.evaluate("window.studio.getState()");
  assert.equal(state.queueRunning, false); assert.equal(state.queue.length, 0);
  assert.equal(state.history.length, 1); assert.equal(state.history[0].versions.length, 1);
  assert.equal(path.resolve(state.settings.outputDirectory).toLowerCase(), directory.toLowerCase());
  const asset = state.history[0], version = asset.versions[0];
  const video = version.files.find(f => /\.mp4$/i.test(f.filename));
  assert.ok(video?.absolutePath);
  const physicalSource = await fs.realpath(video.absolutePath);
  const relativeSource = path.relative(directory, physicalSource);
  assert.ok(relativeSource && !relativeSource.startsWith("..") && !path.isAbsolute(relativeSource));
  assert.ok((await fs.stat(physicalSource)).isFile());
  assert.ok(version.duration > 0 && version.width > 0 && version.height > 0);
  const workflowPath = path.join(repository, "workflows", "minimax_h3_continuum_v38_managed_extend_api.json");
  await fs.access(workflowPath);
  // Only mode/input setup bypasses the UI. Enqueue and its disabled gate never do.
  const draft = { ...state.draft, inputMode: "video", modelId: "minimax_h3_continuum", workflowPath,
    h3ContinuumMode: "managed", sourceVideoPath: physicalSource, sourceVideoDuration: version.duration,
    sourceWidth: version.width, sourceHeight: version.height, trimStartSeconds: 0, trimEndSeconds: version.duration,
    sourceAssetId: asset.id, sourceVersionId: version.id, duration: 4, resolution: 480, seed: 42,
    h3ReferenceSlots: [], h3LatentSaveMode: "all", h3SaveJointAv: true,
    extensionPromptVersions: [{ ...state.draft.extensionPromptVersions[0], text: "A red balloon rises slowly above a green field. The camera stays still. Soft wind, no speech or music." }],
    extensionActivePromptVersion: 0 };
  for (const key of ["h3ContinuumArtifact", "h3ContinuumArtifactPath", "h3ContinuumSequence", "h3ContextLatentPath", "h3MotionContextAsset", "h3ContinuumReviewAction"]) delete draft[key];
  await fs.writeFile(path.join(directory, "managed-input-baseline.json"), JSON.stringify({ assetId: asset.id, versionId: version.id, sourcePath: physicalSource }, null, 2), { flag: "wx" });
  async function saveAndReload(value) {
    await client.evaluate(`window.studio.saveDraft(${JSON.stringify(value)})`);
    await client.send("Page.reload");
    await pollUntil(() => client.evaluate("!!document.querySelector('#enqueue')"), Boolean, options.timeout, "Create ready");
  }
  await saveAndReload({ ...draft, sourceVideoPath: "", sourceVideoDuration: 0, sourceAssetId: undefined, sourceVersionId: undefined });
  const missing = await client.evaluate("({disabled:document.querySelector('#enqueue').disabled,reason:document.querySelector('#enqueue').dataset.enqueueBlockReason})");
  assert.equal(missing.disabled, true); assert.match(missing.reason, /视频|video/i);
  report.missingSource = missing;
  await saveAndReload(draft);
  const prefixGate = await pollUntil(() => client.evaluate("({mediaReady:document.querySelector('#source-video')?.readyState>=1,disabled:document.querySelector('#enqueue')?.disabled,reason:document.querySelector('#enqueue')?.dataset.enqueueBlockReason})"),
    value => value.mediaReady && value.disabled && /已接受.*Continuum.*Run/.test(value.reason || ""), options.timeout, "Accepted Run prefix protection");
  const inspection = await client.evaluate("window.studio.getState().then(s=>window.studio.inspectVideoExtensionSource(s.draft))");
  assert.equal(inspection.route, "managed"); assert.equal(inspection.status, "missing");
  assert.equal(await client.evaluate("window.studio.getState().then(s=>s.queue.length)"), 0);
  Object.assign(report, { prefixGate, inspection, managedEnqueueBlocked: true });
  // Select the next enabled model with real keyboard input; never clear disabled.
  const nextModel = await client.evaluate("(()=>{const e=document.querySelector('#model');return [...e.options].slice(e.selectedIndex+1).find(o=>!o.disabled)?.value})()");
  assert.equal(nextModel, "minimax_h3_ref2va", "Fixture expects Motion Context after Continuum in the catalog");
  await click("#model");
  for (const [key, code] of [["ArrowDown", 40], ["Enter", 13]]) {
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key, windowsVirtualKeyCode: code });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key, windowsVirtualKeyCode: code });
  }
  await pollUntil(() => client.evaluate("document.querySelector('#model')?.value==='minimax_h3_ref2va' && !document.querySelector('#enqueue')?.disabled"), Boolean, options.timeout, "Motion Context recovery");
  await click("#enqueue");
  const task = await pollUntil(() => client.evaluate("window.studio.getState().then(s=>s.queue[0])"), Boolean, options.timeout, "Recovered Motion Context task ID");
  report.taskId = task.id;
  assert.equal(task.modelId, "minimax_h3_ref2va");
  assert.equal(task.sourceAssetId, asset.id); assert.equal(task.sourceVersionId, version.id);
  assert.match(task.workflowPath, /minimax_h3_r2v_extend_api\.json$/);
  assert.equal(task.h3ContinuumSequence, undefined);
  assert.equal(task.sourceVideoPath, physicalSource);
  assert.equal(task.status, "waiting");
  assert.equal(await client.evaluate("window.studio.getState().then(s=>s.queueRunning)"), false);
  Object.assign(report, { ok: true, actualMouseEnqueue: true, recoveryModel: task.modelId,
    sourceAssetId: asset.id, sourceVersionId: version.id, duration: task.duration, workflow: path.basename(task.workflowPath) });
} catch (error) {
  report.error = error.message; process.exitCode = 1;
  if (client) report.ui = await client.evaluate("({gate:document.querySelector('#enqueue')?.dataset.enqueueBlockReason,flash:document.querySelector('#app-flash.visible [data-flash-message]')?.textContent})").catch(() => null);
} finally { client?.close(); }
if (options.output) await fs.writeFile(options.output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
