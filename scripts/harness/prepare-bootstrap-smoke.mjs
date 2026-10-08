import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { connectApp, parseAppHarnessArgs, pollUntil, runAppAction } from "../app-harness.mjs";

// The source state supplies a real FL2VA AV pair; only fixture copies are used.
const sourceState = process.argv[2];
const options = parseAppHarnessArgs(["enqueue-ui", ...process.argv.slice(3)]);
if (!sourceState || sourceState === "--help") {
  console.log("prepare-bootstrap-smoke.mjs <prior-create-state.json> --port <port> [--output report.json]\nUse launch-create-smoke --motion-source-state first. Tests missing AV then copies paired AV via AppApi fixture setup and clicks real enqueue. No GPU execution; file-picker interaction is not tested.");
  process.exit(sourceState ? 0 : 1);
}
let client, taskId;
const report = { ok: false, evidence: "real-bootstrap-ui-enqueue", focusEmulation: true,
  sourceInputSetup: "copied-files-and-AppApi-saveDraft", nativeFilePickerVerified: false, generationVerified: false };
try {
  client = await connectApp(options);
  await client.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  const initial = await client.evaluate("window.studio.getState()");
  assert.equal(initial.queue.length, 0); assert.equal(initial.queueRunning, false);
  const directory = path.dirname(initial.settings.outputDirectory);
  const launch = JSON.parse(await fs.readFile(path.join(directory, "launch.json"), "utf8"));
  assert.equal(launch.port, options.port);
  assert.equal(launch.scenario, "motion-context-pixel-source");
  await client.evaluate("document.querySelector('button[data-page=history]').click()");
  await pollUntil(() => client.evaluate("!!document.querySelector('[data-open-history]')"), Boolean, options.timeout, "Source card");
  await client.evaluate("document.querySelector('[data-open-history]').click()");
  await pollUntil(() => client.evaluate("document.querySelector('.history-player video')?.readyState>=2 && !!document.querySelector('media-play-button[role=button]')"), Boolean, options.timeout, "Bound detail");
  await client.evaluate("document.querySelector('[data-continue-history]').click()");
  await pollUntil(() => client.evaluate("!!document.querySelector('#model') && document.querySelector('#source-video')?.readyState>=1"), Boolean, options.timeout, "Source loaded");
  await client.evaluate("(()=>{const e=document.querySelector('#model');e.value='minimax_h3_continuum';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await client.evaluate("window.studio.getState().then(s=>window.studio.saveDraft({...s.draft,h3ContinuumMode:'bootstrap',extensionPromptVersions:[{...s.draft.extensionPromptVersions[0],text:'The red balloon continues rising gently above the green field. Preserve the camera and lighting.'}],extensionActivePromptVersion:0}))");
  await client.send("Page.reload");
  await pollUntil(() => client.evaluate("!!document.querySelector('[data-drop-h3-continuum-av]') && document.querySelector('#enqueue').disabled"), Boolean, options.timeout, "Missing AV gate");
  const blockedReason = await client.evaluate("document.querySelector('#enqueue').dataset.enqueueBlockReason");
  assert.match(blockedReason, /AV|续写|数据/i, "Block must be caused by missing AV, not an empty prompt");
  report.blockedReason = blockedReason;
  await client.evaluate("document.querySelector('#enqueue').click()");
  assert.equal(await client.evaluate("window.studio.getState().then(s=>s.queue.length)"), 0);
  report.missingAvBlocked = true;
  const source = JSON.parse(await fs.readFile(sourceState, "utf8"));
  assert.equal(source.history.length, 1);
  const version = source.history[0].versions[0];
  assert.equal(version.modelId, "minimax_h3_fl2va");
  const artifact = structuredClone(version.h3ContinuationData?.artifact);
  assert.ok(artifact?.payload?.absolutePath && artifact?.manifest?.absolutePath, "Need real paired AV");
  for (const key of ["payload", "manifest"]) {
    const file = artifact[key];
    const target = path.resolve(directory, "h3-native-av", path.basename(file.filename));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(file.absolutePath, target);
    file.absolutePath = target;
  }
  await client.evaluate(`window.studio.getState().then(s => window.studio.saveDraft({
    ...s.draft, h3ContinuumMode: 'bootstrap', h3ContinuumArtifact: ${JSON.stringify(artifact)},
    h3ContinuumArtifactPath: ${JSON.stringify(artifact.payload.absolutePath)}, h3ContextLatentPath: undefined
  }))`);
  await client.send("Page.reload");
  await pollUntil(async () => {
    try { return await client.evaluate("!!document.querySelector('#enqueue') && !document.querySelector('#enqueue').disabled"); }
    catch { return false; }
  }, Boolean, options.timeout, "Real AV inspection recovery");
  const added = await runAppAction(client, options);
  taskId = added.task.id;
  const task = await client.evaluate(`window.studio.getState().then(s=>s.queue.find(t=>t.id===${JSON.stringify(taskId)}))`);
  assert.equal(task.modelId, "minimax_h3_continuum");
  assert.equal(task.h3ContinuumMode, "bootstrap");
  assert.equal(task.h3ContinuumArtifactPath, artifact.payload.absolutePath);
  assert.ok(task.sourceAssetId && task.sourceVersionId);
  Object.assign(report, { ok: true, taskId, recoveredAfterRealInspection: true, actualButtonClicked: true,
    mode: task.h3ContinuumMode, duration: task.duration, sourceAssetId: task.sourceAssetId, sourceVersionId: task.sourceVersionId,
    workflow: path.basename(task.workflowPath) });
} catch (error) { Object.assign(report, { taskId, error: error.message }); process.exitCode = 1; }
finally { client?.close(); }
if (options.output) {
  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(options.output, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
