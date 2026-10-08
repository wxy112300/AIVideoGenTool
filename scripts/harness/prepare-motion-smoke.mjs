import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { connectApp, parseAppHarnessArgs, pollUntil, runAppAction } from "../app-harness.mjs";

const options = parseAppHarnessArgs(["enqueue-ui", ...process.argv.slice(2)]);
if (options.help) {
  console.log("prepare-motion-smoke.mjs --port <port> [--output report.json]\nRequires launch-create-smoke --motion-source-state. Verifies missing video, History continue, locked source and actual UI enqueue. Does not start queue.");
  process.exit(0);
}
let client, taskId;
const report = { ok: false, evidence: "real-motion-context-ui", focusEmulation: true, generationVerified: false };
try {
  client = await connectApp(options);
  await client.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  const initial = await runAppAction(client, { ...options, action: "inspect" });
  assert.equal(initial.queue.length, 0);
  assert.equal(initial.queueRunning, false);
  assert.equal(initial.historyCounts.video, 1, "Use the one-source isolated fixture");
  await client.evaluate("document.querySelector('button[data-page=create]').click()");
  await pollUntil(() => client.evaluate("!!document.querySelector('[data-input-mode=video]')"),
    Boolean, options.timeout, "Create page");
  await client.evaluate("document.querySelector('[data-input-mode=video]').click()");
  await pollUntil(() => client.evaluate("window.studio.getState().then(s=>s.draft.inputMode==='video')"),
    Boolean, options.timeout, "Extend mode");
  const gate = await runAppAction(client, { ...options, action: "inspect" });
  assert.equal(gate.draft.hasVideo, false);
  assert.ok(gate.controls.find(b => b.selector === "#enqueue")?.disabled, "Missing video must block enqueue");
  await client.evaluate("document.querySelector('#enqueue').click()");
  assert.equal(await client.evaluate("window.studio.getState().then(s=>s.queue.length)"), 0);
  report.missingVideoBlocked = true;
  await client.evaluate("document.querySelector('button[data-page=history]').click()");
  await pollUntil(() => client.evaluate("!!document.querySelector('[data-open-history]')"),
    Boolean, options.timeout, "Source History card");
  await client.evaluate("document.querySelector('[data-open-history]').click()");
  await pollUntil(() => client.evaluate("!!document.querySelector('[data-continue-history]') && document.querySelector('.history-player video')?.readyState>=2 && !!document.querySelector('media-play-button[role=button]')"),
    Boolean, options.timeout, "Bound History detail/player");
  await client.evaluate("document.querySelector('[data-continue-history]').click()");
  await pollUntil(() => client.evaluate("!!document.querySelector('#source-video') && !!document.querySelector('#prompt-input')"),
    Boolean, options.timeout, "Motion Context Create");
  await pollUntil(() => client.evaluate("document.querySelector('#source-video').readyState>=1"),
    Boolean, options.timeout, "Source metadata");
  await client.evaluate("document.querySelector('#prompt-input').focus();document.querySelector('#prompt-input').select()");
  await client.send("Input.insertText", { text: "The same red balloon continues rising gently above the green field. Preserve the camera and light; continue the breeze, no speech or music." });
  await client.evaluate("(()=>{const e=document.querySelector('#duration-number');e.value='1';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await pollUntil(() => client.evaluate("!document.querySelector('#enqueue').disabled"),
    Boolean, options.timeout, "Input recovery");
  const draft = await client.evaluate("window.studio.getState().then(s=>s.draft)");
  assert.equal(draft.modelId, "minimax_h3_ref2va");
  assert.equal(draft.inputMode, "video");
  assert.equal(draft.spectrumMode, "off");
  assert.ok(draft.sourceVideoDuration > 0 && draft.trimEndSeconds > draft.trimStartSeconds);
  assert.equal(draft.h3ReferenceSlots[0]?.mediaPath, draft.sourceVideoPath);
  assert.ok(!draft.h3ContextLatentPath, "This fixture tests pixel video context without latent");
  const sourceVideoDuration = await client.evaluate("document.querySelector('#source-video').duration");
  assert.ok(Math.abs(sourceVideoDuration - draft.sourceVideoDuration) < 0.05);
  const submitted = await runAppAction(client, options);
  taskId = submitted.task.id;
  const task = await client.evaluate(`window.studio.getState().then(s=>s.queue.find(t=>t.id===${JSON.stringify(taskId)}))`);
  assert.equal(task.taskType, "extension");
  assert.equal(task.modelId, "minimax_h3_ref2va");
  assert.equal(task.duration, 1);
  assert.equal(task.sourceVideoPath, draft.sourceVideoPath);
  assert.ok(task.sourceAssetId && task.sourceVersionId, "History continuation must retain both source IDs");
  assert.equal(task.sourceVersionId, draft.sourceVersionId);
  assert.equal(task.spectrumMode, "off");
  assert.ok(!task.h3ContextLatentPath);
  Object.assign(report, { ok: true, taskId, recoveredViaHistory: true, actualButtonClicked: true,
    sourceAssetId: task.sourceAssetId, sourceVersionId: task.sourceVersionId,
    sourceVideoDuration, trimEndSeconds: task.trimEndSeconds, duration: task.duration,
    spectrumMode: task.spectrumMode, workflow: path.basename(task.workflowPath), pixelContext: true });
} catch (error) {
  Object.assign(report, { taskId, error: error.message });
  process.exitCode = 1;
} finally { client?.close(); }
if (options.output) {
  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(options.output, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
