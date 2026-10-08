import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { connectApp, parseAppHarnessArgs, pollUntil, taskEvidence } from "../app-harness.mjs";
import { fixtureUi } from "./fixture-ui.mjs";
import { normalizeH3MemoryOptions } from "../../dist/electron/src/core/h3-memory-policy.js";

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("settings-running-smoke.mjs <fixture> --port <port> [--audit|--finish] [--timeout 900000] [--output report.json]\nRequires one real UI-enqueued waiting H3 task and ready app-owned ComfyUI. Clicks Queue Start, saves different Attention while genuinely running, checks frozen execution inputs/policy, waits for real output. --finish resumes only a recorded running-save baseline without starting another task; --audit compares persisted content after restart. Use verify-video-smoke for actual History playback; never manufacture running status.");
  process.exit(0);
}
const directory = path.resolve(args.shift() || ""), audit = args.includes("--audit"), finish = args.includes("--finish");
assert.ok(!(audit && finish), "Choose audit or finish");
const options = parseAppHarnessArgs(["inspect", ...args.filter(x => !["--audit", "--finish"].includes(x))]);
const baselinePath = path.join(directory, "settings-running-baseline.json");
const report = { ok: false, evidence: audit ? "real-running-settings-restart" : finish ? "real-running-save-output-followup" : "real-running-settings-ui", focusEmulation: true, inferenceVerified: false };
const drafts = s => Object.fromEntries(["draft", "imageToVideoDraft", "videoExtensionDraft"].filter(k => s[k] !== undefined).map(k => [k, s[k]]));
const content = s => ({ drafts: drafts(s), queue: s.queue, history: s.history, imageHistory: s.imageHistory });
// These fields report runtime progress/results, rather than queued execution inputs.
const mutable = new Set(["status", "updatedAt", "comfyPromptId", "progress", "stage", "stageStartedAt", "workProgress", "startedAt", "error", "performanceStats", "h3MemoryExecutionPlan", "h3MemoryRuntimeEvidence", "h3VideoVaeMode", "vramStallWatchdogMinutesApplied"]);
const execution = (task, keys) => Object.fromEntries(keys.filter(k => !mutable.has(k)).map(k => [k, task[k]]));
let client;
try {
  assert.match(path.relative(path.resolve("temp"), directory), /^create-smoke-[^\\/]+$/);
  const launch = JSON.parse(await fs.readFile(path.join(directory, "launch.json"), "utf8"));
  assert.equal(path.resolve(launch.directory).toLowerCase(), directory.toLowerCase());
  assert.equal(launch.evidence, "fixture-launched-only"); assert.equal(launch.scenario, "create-t2va"); assert.equal(launch.port, options.port);
  client = await connectApp(options); await client.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  const state = () => client.evaluate("window.studio.getState()");
  const initial = await state();
  if (!finish) assert.equal(initial.queueRunning, false);
  let baseline;
  if (audit) {
    baseline = JSON.parse(await fs.readFile(baselinePath, "utf8"));
    assert.ok(baseline.finalContent && baseline.inferenceVerified, "Require successful running save and real output first");
    const expected = structuredClone(baseline.finalContent);
    // Store recovery supplies retired memory fields; HistoryQueryService restores
    // file-size caches from stat. Preserve all identities, paths and other fields.
    report.restartCompatibility = { historyMemoryDefaults: true, addedSizeCaches: [] };
    for (const asset of expected.history) {
      Object.assign(asset, normalizeH3MemoryOptions(asset, "off"));
      for (const version of asset.versions) {
        Object.assign(version, normalizeH3MemoryOptions(version, "off"));
        const artifact = version.h3ContinuationData?.artifact;
        for (const file of [...version.files, ...(artifact ? [artifact.manifest, artifact.payload] : [])]) {
          assert.ok(file.absolutePath, "Require owned physical output");
          const relative = path.relative(directory, path.resolve(file.absolutePath));
          assert.ok(!relative.startsWith("..") && !path.isAbsolute(relative), "Output must remain in fixture");
          const stat = await fs.stat(file.absolutePath);
          assert.ok(stat.isFile() && stat.size > 0);
          if (file.sizeBytes === undefined) {
            file.sizeBytes = stat.size; report.restartCompatibility.addedSizeCaches.push(file.filename);
          } else assert.equal(stat.size, file.sizeBytes, "Physical output size changed");
        }
      }
    }
    assert.deepEqual(content(initial), expected, "Task/output/history/drafts changed on restart");
    assert.equal(initial.settings.h3AttentionMode, baseline.target);
    report.restartPreserved = true; report.inferenceVerified = true;
  } else {
    const ui = fixtureUi(client, options.timeout, report);
    if (finish) {
      baseline = JSON.parse(await fs.readFile(baselinePath, "utf8"));
      const enqueue = JSON.parse(await fs.readFile(path.join(directory, "ui-enqueue.json"), "utf8"));
      assert.equal(enqueue.ok, true); assert.equal(enqueue.taskId, baseline.taskId);
      assert.equal(baseline.runningTask?.status, "running"); assert.equal(baseline.afterSaveTask?.status, "running");
      const keys = Object.keys(baseline.runningTask);
      assert.deepEqual(execution(baseline.afterSaveTask, keys), execution(baseline.runningTask, keys));
      assert.equal(initial.settings.h3AttentionMode, baseline.target);
      assert.deepEqual(drafts(initial), baseline.drafts);
      report.runningSaveEvidenceReused = true; report.runningPolicyPreserved = true;
      report.runningAtSave = { before: baseline.runningTask.status, after: baseline.afterSaveTask.status };
    } else {
    assert.equal(initial.history.length, 0); assert.equal(initial.queue.length, 1);
    const waiting = initial.queue[0]; assert.equal(waiting.status, "waiting"); assert.equal(waiting.taskType, "generation");
    const enqueue = JSON.parse(await fs.readFile(path.join(directory, "ui-enqueue.json"), "utf8"));
    assert.equal(enqueue.ok, true); assert.equal(enqueue.taskId, waiting.id);
    const runtime = await client.evaluate("window.studio.getComfyRuntimeState()");
    assert.equal(runtime.phase, "ready"); assert.equal(runtime.ownership, "app");
    baseline = { taskId: waiting.id, drafts: drafts(initial), oldAttention: initial.settings.h3AttentionMode, target: initial.settings.h3AttentionMode === "pytorch" ? "sage-triton" : "pytorch" };
    await fs.writeFile(baselinePath, JSON.stringify(baseline, null, 2), { flag: "wx" });
    await ui.click("button[data-page=queue]"); await ui.click("#queue-primary-action");
    const running = await pollUntil(state, s => s.queueRunning && s.queue.find(t => t.id === baseline.taskId)?.status === "running", options.timeout, "Real queue claim reaches running");
    baseline.runningTask = running.queue.find(t => t.id === baseline.taskId);
    assert.equal(baseline.runningTask.attentionMode, baseline.oldAttention);
    const keys = Object.keys(baseline.runningTask);
    report.actualQueueStartClicked = true;
    await ui.click("button[data-page=settings]"); await ui.click('[data-settings-tab="acceleration"]');
    const enabled = await pollUntil(() => client.evaluate("[...document.querySelector('#h3-attention-mode').options].filter(o=>!o.disabled).map(o=>o.value)"), a => a.includes(baseline.target), options.timeout, "Available Attention target");
    await client.evaluate("document.querySelector('#h3-attention-mode').focus()");
    for (const key of ["Home", ...Array(enabled.indexOf(baseline.target)).fill("ArrowDown"), "Enter"]) {
      const code = { Home: 36, ArrowDown: 40, Enter: 13 }[key];
      await client.send("Input.dispatchKeyEvent", { type: "keyDown", key, windowsVirtualKeyCode: code });
      await client.send("Input.dispatchKeyEvent", { type: "keyUp", key, windowsVirtualKeyCode: code });
    }
    await pollUntil(() => client.evaluate("document.querySelector('#h3-attention-mode')?.value"), v => v === baseline.target, options.timeout, "New Attention selected");
    const beforeSave = await state();
    assert.equal(beforeSave.queue.find(t => t.id === baseline.taskId)?.status, "running", "Task must still be running before save");
    await ui.click("#save-settings");
    const saved = await pollUntil(state, s => s.settings.h3AttentionMode === baseline.target, options.timeout, "Settings saved during execution");
    const task = saved.queue.find(t => t.id === baseline.taskId);
    assert.equal(task?.status, "running", "Do not claim running-save evidence if task already finished");
    assert.deepEqual(execution(task, keys), execution(baseline.runningTask, keys), "Running execution inputs/policy changed");
    assert.deepEqual(drafts(saved), baseline.drafts, "Settings changed drafts");
    baseline.afterSaveTask = task;
    report.actualSettingsSave = true; report.runningPolicyPreserved = true; report.runningAtSave = { before: beforeSave.queue.find(t => t.id === baseline.taskId).status, after: task.status };
    await fs.writeFile(baselinePath, JSON.stringify(baseline, null, 2));
    }
    const ended = await pollUntil(state, s => taskEvidence(s, baseline.taskId).status !== "running", options.timeout, "Real generation reaches terminal state");
    report.completion = taskEvidence(ended, baseline.taskId);
    assert.equal(report.completion.status, "completed", "Settings route passed, but real generation did not complete");
    assert.equal(report.completion.outputs.length, 1);
    assert.deepEqual(drafts(ended), baseline.drafts, "Execution changed drafts");
    assert.equal(ended.settings.h3AttentionMode, baseline.target);
    if (ended.queueRunning) {
      assert.ok(!ended.queue.some(t => t.status === "running" || t.status === "waiting"), "Do not stop a queue with another eligible task");
      await ui.click("button[data-page=queue]"); await ui.click("#queue-primary-action");
    }
    const stopped = await pollUntil(state, s => !s.queueRunning, options.timeout, "Completed queue stopped via UI");
    assert.deepEqual(content(stopped), content(ended), "Stopping empty queue changed durable content");
    report.emptyQueueStoppedViaUi = ended.queueRunning;
    baseline.inferenceVerified = true; baseline.finalContent = content(stopped);
    await fs.writeFile(baselinePath, JSON.stringify(baseline, null, 2));
    report.inferenceVerified = true;
  }
  report.taskId = baseline.taskId; report.attention = { execution: baseline.oldAttention, saved: baseline.target };
  report.draftsPreserved = true; report.ok = true;
} catch (error) { report.error = error.message; process.exitCode = 1; }
finally { client?.close(); }
if (options.output) await fs.writeFile(options.output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
