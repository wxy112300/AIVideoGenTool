import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { connectApp, parseAppHarnessArgs, pollUntil, runAppAction } from "../app-harness.mjs";

// Run only against launch-create-smoke's empty, stopped Create fixture.
const options = parseAppHarnessArgs(["enqueue-ui", ...process.argv.slice(2)]);
if (options.help) {
  console.log("node scripts/harness/prepare-create-smoke.mjs --port <port> [--output report.json]\nRequires launch-create-smoke's empty fixture. Types via CDP, clicks enqueue, verifies frozen snapshot. Does not start queue. Uses focus emulation for background windows.");
  process.exit(0);
}
const prompt = "A red balloon rises slowly above a quiet green field. Static camera, soft daylight. A gentle breeze is audible. No speech or music.";
let client;
let report;
let taskId;
try {
  client = await connectApp(options);
  await client.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  const initial = await runAppAction(client, { ...options, action: "inspect" });
  assert.equal(initial.queue.length, 0, "Expected empty isolated queue");
  assert.equal(initial.queueRunning, false);
  assert.deepEqual(initial.historyCounts, { video: 0, image: 0 }, "Expected empty isolated History");
  assert.equal(initial.draft.modelId, "minimax_h3_fl2va");
  assert.equal(initial.draft.hasStart || initial.draft.hasEnd || initial.draft.hasVideo || initial.draft.hasPrompt, false);
  const gate = initial.controls.find(b => b.selector === "#enqueue");
  assert.ok(gate?.visible && gate.disabled && gate.reason, "Missing prompt must visibly block enqueue");
  await client.evaluate("document.querySelector('#enqueue').click()");
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(await client.evaluate("window.studio.getState().then(s => s.queue.length)"), 0);
  await client.evaluate("document.querySelector('#prompt-input').focus()");
  await client.send("Input.insertText", { text: prompt });
  await pollUntil(() => client.evaluate("!document.querySelector('#enqueue').disabled"),
    Boolean, options.timeout, "Prompt recovery");
  const added = await runAppAction(client, options);
  taskId = added.task.id;
  const snapshot = await client.evaluate(`window.studio.getState().then(s => s.queue.find(t => t.id === ${JSON.stringify(taskId)}))`);
  assert.equal(snapshot.prompt, prompt);
  assert.match(snapshot.workflowPath, /t2va/i, "No image must resolve T2VA");
  // Main state can expose the ID before renderer's enqueue finally/re-render.
  // Interact only after its real control is ready; never override disabled.
  await pollUntil(() => client.evaluate("!document.querySelector('#enqueue').disabled"),
    Boolean, options.timeout, "Post-enqueue UI readiness");
  await client.evaluate("document.querySelector('#prompt-input').focus(); document.querySelector('#prompt-input').select()");
  await client.send("Input.insertText", { text: "A different scene for the next task." });
  await pollUntil(() => client.evaluate(`window.studio.getState().then(s => s.draft.promptVersions[s.draft.activePromptVersion].text !== ${JSON.stringify(prompt)})`),
    Boolean, options.timeout, "Persisted draft edit");
  const after = await client.evaluate(`window.studio.getState().then(s => s.queue.find(t => t.id === ${JSON.stringify(taskId)}))`);
  assert.deepEqual(after, snapshot, "Editing the draft changed the queued snapshot");
  report = { ok: true, evidence: "real-ui-enqueue-and-snapshot", taskId, focusEmulation: true,
    missingInputBlocked: true, recoveredByTyping: true, actualButtonClicked: true,
    taskSnapshotUnchanged: true, workflow: path.basename(snapshot.workflowPath),
    duration: snapshot.duration, resolution: snapshot.resolution, generationVerified: false };
} catch (error) {
  report = { ok: false, taskId, error: error.message };
  process.exitCode = 1;
} finally {
  client?.close();
}
if (options.output) {
  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(options.output, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
