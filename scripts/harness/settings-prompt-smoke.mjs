import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { connectApp, parseAppHarnessArgs, pollUntil } from "../app-harness.mjs";
import { fixtureUi } from "./fixture-ui.mjs";
import { promptModelBackend } from "../../dist/electron/src/core/prompt-models.js";
import { normalizeH3MemoryOptions } from "../../dist/electron/src/core/h3-memory-policy.js";

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("settings-prompt-smoke.mjs <fixture> --port <port> [--resident|--history] [--audit] [--timeout 240000] [--output report.json]\nDefault requires one real prepare-create-smoke waiting task and selects installed qwen/qwen3.5-2b. --resident first loads the old model via the real runtime button, then selects qwen/qwen3.5-4b. --history instead requires a physical asset-source-state copy with one canonical-AV video and empty queue; no new queue task is submitted. Checks empty-input recovery, actual enhancement, immutable content/files and restart. May start app-owned ComfyUI/use GPU. --audit is read-only. One baseline per fixture.");
  process.exit(0);
}
const directory = path.resolve(args.shift() || "");
const audit = args.includes("--audit");
const resident = args.includes("--resident");
const history = args.includes("--history");
assert.ok(!(resident && history), "Choose one bounded scenario");
const options = parseAppHarnessArgs(["inspect", ...args.filter(v => !["--audit", "--resident", "--history"].includes(v))]);
const baselinePath = path.join(directory, "settings-prompt-baseline.json");
const report = { ok: false, evidence: audit ? "real-prompt-settings-restart" : "real-prompt-settings-ui", focusEmulation: true, inferenceVerified: false };
const drafts = s => JSON.parse(JSON.stringify({ draft: s.draft, imageToVideoDraft: s.imageToVideoDraft, videoExtensionDraft: s.videoExtensionDraft }));
const content = s => ({ drafts: drafts(s), queue: s.queue, history: s.history, imageHistory: s.imageHistory });
async function ownedFiles(state) {
  const files = state.history.flatMap(a => a.versions.flatMap(v => [...v.files, ...(v.h3ContinuationData?.artifact ? [v.h3ContinuationData.artifact.manifest, v.h3ContinuationData.artifact.payload] : [])]));
  return Promise.all(files.map(async file => {
    assert.ok(file.absolutePath);
    const relative = path.relative(directory, await fs.realpath(file.absolutePath));
    assert.ok(!relative.startsWith("..") && !path.isAbsolute(relative), "History files must remain owned by fixture");
    const stat = await fs.stat(file.absolutePath); assert.ok(stat.isFile() && stat.size > 0);
    return { path: file.absolutePath, size: stat.size };
  }));
}
let client;
try {
  assert.match(path.relative(path.resolve("temp"), directory), /^create-smoke-[^\\/]+$/);
  const launch = JSON.parse(await fs.readFile(path.join(directory, "launch.json"), "utf8"));
  assert.equal(path.resolve(launch.directory).toLowerCase(), directory.toLowerCase());
  assert.equal(launch.evidence, "fixture-launched-only");
  assert.equal(launch.port, options.port);
  assert.equal(launch.scenario, history ? "asset-migration-canonical" : "create-t2va");
  client = await connectApp(options);
  await client.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  const state = () => client.evaluate("window.studio.getState()");
  const runtime = () => client.evaluate("window.studio.getPromptRuntimeState()");
  const logs = () => client.evaluate("window.studio.readAppLogs(500).then(s=>s.records.filter(r=>r.scope==='prompt'))");
  const initial = await state();
  assert.equal(initial.queueRunning, false);
  assert.equal(initial.queue.length, history ? 0 : 1);
  if (!history) assert.equal(initial.queue[0].status, "waiting");
  assert.equal(initial.history.length, history ? 1 : 0);
  if (history) {
    assert.equal(initial.history[0].versions.length, 1);
    assert.equal(initial.history[0].versions[0].h3AvAsset?.storageKind, "app-canonical");
  }
  assert.equal(initial.imageHistory.length, 0);
  let baseline;
  if (audit) {
    baseline = JSON.parse(await fs.readFile(baselinePath, "utf8"));
    assert.ok(baseline.finalContent, "Only audit a completed UI report");
    const expected = structuredClone(baseline.finalContent);
    expected.queue = expected.queue.map(t => ({ ...t, ...normalizeH3MemoryOptions(t) }));
    assert.deepEqual(content(initial), expected, "Prompt/draft/task/history changed on restart");
    assert.equal(initial.settings.promptModelId, baseline.target);
    report.restartPreserved = true;
    report.inferenceVerified = baseline.inferenceVerified;
    if (baseline.history) assert.deepEqual(await ownedFiles(initial), baseline.files, "Owned History files changed on restart");
  } else {
    assert.equal(await fs.stat(baselinePath).catch(() => null), null, "Use a new fixture; baseline exists");
    if (!history) {
      const enqueue = JSON.parse(await fs.readFile(path.join(directory, "ui-enqueue.json"), "utf8"));
      assert.equal(enqueue.ok, true);
      assert.equal(enqueue.taskId, initial.queue[0].id);
    }
    await client.evaluate(`(async()=>{
      const s=await window.studio.getState();
      const versions=[...s.draft.promptVersions,{...s.draft.promptVersions[0],id:crypto.randomUUID(),label:'6B preserved version',text:'A red balloon rises slowly. Static camera. No speech or music.'}];
      await window.studio.saveDraft({...s.draft,inputMode:'video',modelId:'minimax_h3_ref2va',spectrumMode:'off',spectrumModeUserSet:false,seed:6302,promptVersions:versions,activePromptVersion:1});
      await window.studio.saveDraft({...s.draft,inputMode:'image',seed:6301,promptVersions:versions,activePromptVersion:1});
    })()`);
    await client.send("Page.reload");
    await pollUntil(() => client.evaluate("!!window.studio && !!document.querySelector('button[data-page=settings]')"), Boolean, options.timeout, "Renderer ready");
    await client.evaluate("window.studio.getState().then(s=>window.studio.scanEnvironment(s.settings,'full')).then(()=>true)");
    baseline = { target: resident ? "qwen/qwen3.5-4b" : "qwen/qwen3.5-2b", oldModel: initial.settings.promptModelId, before: content(await state()), resident, history };
    if (history) baseline.files = await ownedFiles(initial);
    assert.notEqual(baseline.target, baseline.oldModel);
    await fs.writeFile(baselinePath, JSON.stringify(baseline, null, 2), { flag: "wx" });
    const ui = fixtureUi(client, options.timeout, report);
    await ui.click("button[data-page=settings]");
    await ui.click('[data-settings-tab="prompt"]');
    if (resident) {
      assert.equal((await runtime()).model.phase, "unloaded", "Resident fixture must start with no loaded model");
      await ui.click("#release-prompt-model");
      const loaded = await pollUntil(runtime, r => r.model.phase === "resident" && r.model.modelId === baseline.oldModel, options.timeout, "Old selected model actually resident");
      baseline.residency = { beforeSave: loaded.model };
      report.oldModelLoadedViaUi = true;
      assert.deepEqual(content(await state()), baseline.before, "Loading Prompt model changed drafts/task/history");
    }
    const enabled = await client.evaluate("[...document.querySelector('#prompt-model-id').options].filter(o=>!o.disabled).map(o=>o.value)");
    assert.ok(enabled.includes(baseline.target), "Target model must be installed; do not bypass disabled options");
    await client.evaluate("document.querySelector('#prompt-model-id').focus()");
    for (const key of ["Home", ...Array(enabled.indexOf(baseline.target)).fill("ArrowDown"), "Enter"]) {
      const code = { Home: 36, ArrowDown: 40, Enter: 13 }[key];
      await client.send("Input.dispatchKeyEvent", { type: "keyDown", key, windowsVirtualKeyCode: code });
      await client.send("Input.dispatchKeyEvent", { type: "keyUp", key, windowsVirtualKeyCode: code });
    }
    await pollUntil(() => client.evaluate("document.querySelector('#prompt-model-id')?.value"), v => v === baseline.target, options.timeout, "Selected Prompt model");
    await ui.click("#save-settings");
    const saved = await pollUntil(state, s => s.settings.promptModelId === baseline.target, options.timeout, "Prompt settings saved");
    assert.deepEqual(content(saved), baseline.before, "Saving Prompt settings changed drafts/versions/task/history");
    if (resident) baseline.residency.afterSave = (await runtime()).model;
    report.settingsContentPreserved = true;
    await ui.click("button[data-page=create]");
    const type = async text => {
      await client.evaluate("document.querySelector('#prompt-input').focus(); document.querySelector('#prompt-input').select()");
      if (text) await client.send("Input.insertText", { text });
      else for (const event of ["keyDown", "keyUp"]) await client.send("Input.dispatchKeyEvent", { type: event, key: "Backspace", windowsVirtualKeyCode: 8 });
      await pollUntil(() => client.evaluate("document.querySelector('#prompt-input')?.value"), v => v === text, options.timeout, "Typed prompt");
    };
    await type("");
    await pollUntil(state, s => !s.draft.promptVersions[s.draft.activePromptVersion].text, options.timeout, "Empty prompt saved");
    const beforeEmpty = content(await state());
    const operationsBefore = (await logs()).filter(r => r.event === "enhance-started").length;
    await ui.click("#enhance-prompt");
    report.missingInputMessage = await pollUntil(() => client.evaluate("document.querySelector('#app-flash.visible[data-kind=error] [data-flash-message]')?.textContent || ''"), Boolean, options.timeout, "Visible missing-input reason");
    assert.deepEqual(content(await state()), beforeEmpty);
    assert.equal((await logs()).filter(r => r.event === "enhance-started").length, operationsBefore);
    report.missingInputBlocked = true;
    const text = "A red balloon rises slowly above a quiet green field. Static camera, soft daylight. A gentle breeze is audible. No speech or music.";
    await type(text);
    const beforeEnhance = await pollUntil(state, s => s.draft.promptVersions[s.draft.activePromptVersion].text === text, options.timeout, "Recovered prompt saved");
    await ui.click("#enhance-prompt");
    const started = await pollUntil(logs, records => records.filter(r => r.event === "enhance-started").length > operationsBefore, options.timeout, "Actual application enhancement");
    const operation = started.filter(r => r.event === "enhance-started").at(-1);
    assert.equal(operation.meta.promptModelId, baseline.target);
    assert.equal(operation.meta.promptBackend, promptModelBackend(baseline.target));
    assert.equal(operation.meta.modelId, beforeEnhance.draft.modelId, "Request modelId means generation model, not Prompt backend");
    report.operation = { operationId: operation.meta.operationId, promptModelId: operation.meta.promptModelId, promptBackend: operation.meta.promptBackend, generationModelId: operation.meta.modelId };
    report.actualEnhanceClicked = true;
    report.savedModelUsedOnNextRequest = true;
    const terminalEvents = ["enhance-finished", "enhance-failed", "enhance-cancelled"];
    const ended = await pollUntil(logs, records => records.some(r => terminalEvents.includes(r.event) && r.meta?.operationId === operation.meta.operationId), options.timeout, "Enhancement terminal event");
    const terminal = ended.find(r => terminalEvents.includes(r.event) && r.meta?.operationId === operation.meta.operationId);
    report.terminal = { event: terminal.event, message: terminal.message };
    const final = await pollUntil(state, s => terminal.event !== "enhance-finished" || s.draft.promptVersions.length === beforeEnhance.draft.promptVersions.length + 1, options.timeout, "Prompt version writeback");
    assert.deepEqual(final.queue, baseline.before.queue, "Enhancement changed waiting task");
    assert.deepEqual(final.history, baseline.before.history);
    assert.deepEqual(final.imageHistory, baseline.before.imageHistory);
    assert.deepEqual(final.videoExtensionDraft, beforeEnhance.videoExtensionDraft, "Enhancement changed saved Extend draft");
    if (terminal.event !== "enhance-finished") {
      assert.deepEqual(drafts(final), drafts(beforeEnhance), "Failed enhancement changed prompt/drafts");
      throw new Error(`Route reached selected model, but inference did not complete: ${terminal.message}`);
    }
    assert.deepEqual(final.draft.promptVersions.slice(0, -1), beforeEnhance.draft.promptVersions, "Existing prompt versions overwritten");
    assert.ok(final.draft.promptVersions.at(-1).text.trim());
    assert.equal(final.draft.activePromptVersion, final.draft.promptVersions.length - 1);
    report.inferenceVerified = true;
    report.outputLength = final.draft.promptVersions.at(-1).text.length;
    report.appendedPromptVersion = true;
    if (history) assert.deepEqual(await ownedFiles(final), baseline.files, "Settings/enhancement changed physical History files");
    if (resident) {
      const after = await pollUntil(runtime, r => r.model.phase === "resident" && r.model.modelId === baseline.target, options.timeout, "New model resident after actual enhancement");
      baseline.residency.afterEnhance = after.model;
      report.residency = baseline.residency;
    }
    baseline.inferenceVerified = true;
    baseline.finalContent = content(final);
    await fs.writeFile(baselinePath, JSON.stringify(baseline, null, 2));
  }
  report.model = { before: baseline.oldModel, after: baseline.target };
  if (audit && baseline.resident) report.residency = baseline.residency;
  report.taskId = initial.queue[0]?.id;
  if (history) {
    report.protectedHistory = { assetId: initial.history[0].id, versionId: initial.history[0].versions[0].id, taskId: initial.history[0].versions[0].taskId || initial.history[0].taskId };
    report.ownedFilesPreserved = true;
  }
  report.ok = true;
} catch (error) { report.error = error.message; process.exitCode = 1; }
finally { client?.close(); }
if (options.output) await fs.writeFile(options.output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
