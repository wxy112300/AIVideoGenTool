// Real renderer/IPC/Queue probe. Three new physical groups maximum in one isolated fixture.
// A failed/uncertain run is inspected, never automatically resubmitted.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { connectApp, parseAppHarnessArgs, pollUntil } from "../app-harness.mjs";

const directory = path.resolve(process.argv[2] ?? "");
const mode = process.argv[3];
assert.ok(["prepare", "pause", "resume"].includes(mode), "Use <fixture> prepare|pause|resume --port <port>");
assert.match(path.relative(path.resolve("temp"), directory), /^create-smoke-[^\\/]+$/u);
const options = parseAppHarnessArgs(["inspect", ...process.argv.slice(4)]);
const launch = JSON.parse(await fs.readFile(path.join(directory, "launch.json"), "utf8"));
assert.equal(Number(options.port), launch.port);
const reportPath = path.join(directory, `long-video-queue-${mode}.json`);
const report = { ok: false, mode, layer: "real-electron-ui-ipc-queue", focusEmulation: true };
await fs.writeFile(reportPath, JSON.stringify(report), { flag: "wx" });
let client;
try {
  await pollUntil(async () => {
    try { client = await connectApp(options); return true; }
    catch (error) { if (!/No Studio AppApi|ECONNREFUSED/u.test(error.message)) throw error; return false; }
  }, Boolean, 30000, "AppApi startup", 500);
  await client.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  const state = () => client.evaluate("window.studio.getState()");
  const wait = (read, label, timeout = 30000) => pollUntil(read, Boolean, timeout, label, 250);
  const click = async selector => {
    assert.equal(await client.evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});return Boolean(b&&!b.disabled&&!b.closest('[hidden]'));})()`), true, selector);
    await client.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  };
  const input = async (selector, value, event = "input") => {
    report.lastAction = `input ${selector}`;
    await client.evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});if(b?.value===${JSON.stringify(value)})return;if(!b||b.disabled)throw Error('Unavailable control: '+${JSON.stringify(selector)});b.value=${JSON.stringify(value)};b.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));})()`);
  };
  const initial = await state();
  assert.equal(initial.settings.outputDirectory.toLowerCase(), path.join(directory, "video").toLowerCase());
  const dataRoot = path.dirname(path.resolve(initial.settings.modelDirectory));
  assert.ok(path.relative(path.resolve("temp"), dataRoot) && !path.relative(path.resolve("temp"), dataRoot).startsWith(".."));
  assert.equal((await fs.realpath(dataRoot)).toLowerCase(), dataRoot.toLowerCase());
  if (mode === "prepare") {
    assert.equal(initial.queueRunning, false); assert.equal(initial.queue.length, 0); assert.equal(initial.history.length, 0);
    assert.equal(initial.settings.h3AttentionMode, "pytorch");
    await wait(() => client.evaluate("Boolean(document.querySelector('#generation-mode'))"), "Create ready");
    await input("#spectrum-mode", "off", "change");
    await input("#ratio", "1:1", "change");
    await input("#resolution", "480", "change");
    await input("#generation-mode", "preview", "change");
    await input("[data-preview-duration-number]", "15");
    await input("[data-preview-count-number]", "3");
    await click("[data-confirm-layout]");
    const prompts = [
      "A red toy block stands on a flat blue table. The block slowly slides to the right. Static camera. Gentle room tone, no speech or music.",
      "The same red toy block continues sliding to the right, then stops. The same blue table and static camera. Gentle room tone, no speech or music.",
      "The same red toy block stays still on the same blue table. Static camera and gentle room tone. No speech or music."
    ];
    for (let i = 0; i < 3; i++) {
      await click(`.create-long-tabs [role=tab]:nth-child(${i + 2})`);
      await client.evaluate("document.querySelector('.create-long-editor textarea').focus()");
      await client.send("Input.insertText", { text: prompts[i] });
    }
    assert.equal(await client.evaluate("document.querySelector('#enqueue').disabled"), true);
    const image = path.join(directory, "first.png");
    await promisify(execFile)("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "color=c=lightblue:s=480x480", "-vf", "drawbox=x=160:y=150:w=160:h=200:color=red:t=fill", "-frames:v", "1", image], { windowsHide: true });
    const position = await client.evaluate("(()=>{const e=document.querySelector('#pick-start');e.scrollIntoView();const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()");
    for (const type of ["dragEnter", "dragOver", "drop"]) await client.send("Input.dispatchDragEvent", { type, ...position, data: { items: [], files: [image], dragOperationsMask: 1 } });
    await wait(async () => Boolean((await state()).draft.startImagePath), "First image dropped");
    await wait(() => client.evaluate("!document.querySelector('#enqueue').disabled"), "Recovered enqueue");
    await click("#enqueue");
    await wait(async () => (await state()).queue.length === 1, "Real button task ID");
    const queued = await state(); const task = queued.queue[0];
    assert.equal(task.longVideoPlan.layout.chunks, 3); assert.equal(task.duration, 15);
    assert.deepEqual(task.longVideoPlan.pages.slice(1).map(p => p.text), prompts);
    report.taskId = task.id; report.missingInputBlocked = true; report.recoveredByDrop = true; report.actualButtonClicked = true;
    await wait(() => client.evaluate("Boolean(document.querySelector('.create-long-editor textarea'))"), "Editor after enqueue");
    await client.evaluate("document.querySelector('.create-long-editor textarea').focus()");
    await client.send("Input.insertText", { text: " Later draft only." });
    assert.deepEqual((await state()).queue[0].longVideoPlan, task.longVideoPlan);
    report.frozenScript = true;
    const shot = await client.send("Page.captureScreenshot", { format: "png" });
    await fs.writeFile(path.join(directory, "long-video-queue-ready.png"), Buffer.from(shot.data, "base64"));
  } else {
    const prior = JSON.parse(await fs.readFile(path.join(directory, "long-video-queue-prepare.json"), "utf8"));
    assert.equal(prior.ok, true); report.taskId = prior.taskId;
    assert.equal(initial.queue.length, 1); assert.equal(initial.queue[0].id, prior.taskId); assert.equal(initial.history.length, 0);
    assert.equal(initial.queue[0].status, "waiting");
    if (mode === "resume") {
      assert.ok(initial.queue[0].longVideoExecution);
      await client.evaluate(`window.studio.cancelTask(${JSON.stringify(prior.taskId)})`);
      await client.evaluate(`window.studio.resetTask(${JSON.stringify(prior.taskId)})`);
      assert.deepEqual((await state()).queue[0].longVideoExecution, initial.queue[0].longVideoExecution);
      report.cancelResetPreservesRun = true;
    }
    await client.evaluate("window.studio.startQueue()");
    if (mode === "pause") {
      await wait(async () => Boolean((await state()).queue[0]?.comfyPromptId), "First submitted group", 180000);
      await client.evaluate("window.studio.pauseQueue()");
      await wait(async () => { const s = await state(); if (s.queue[0]?.status === "failed") throw Error(s.queue[0].error); return s.queue[0]?.status === "waiting" && s.queueLifecycle === "idle"; }, "Pause after accepted physical group", 1200000);
      const paused = await state(); assert.equal(paused.history.length, 0);
      const task = paused.queue[0]; const journal = path.join(task.longVideoRoot, task.longVideoExecution.executionId, "journal");
      const events = await Promise.all((await fs.readdir(journal)).filter(n => /^\d{6}\.json$/u.test(n)).sort().map(async n => JSON.parse(await fs.readFile(path.join(journal, n), "utf8")).event));
      assert.equal(events.filter(e => e.kind === "submitted").length, 1);
      report.acceptedChunks = events.findLast(e => e.kind === "accepted").result.receipt.accepted_chunks;
      assert.equal(report.acceptedChunks, 1); report.executionId = task.longVideoExecution.executionId;
    } else {
      await wait(async () => { const s = await state(); if (s.queue[0]?.status === "failed") throw Error(s.queue[0].error); return s.history.length === 1 && s.queue.length === 0 && s.queueLifecycle === "idle"; }, "Validated single History movie", 1800000);
      const completed = await state(); const asset = completed.history[0];
      assert.equal(asset.taskId, prior.taskId); assert.equal(asset.versions.length, 1);
      const version = asset.versions[0]; assert.equal(version.longVideoReceipt.accepted_chunks, 3); assert.equal(version.longVideoReceipt.final_output, true);
      assert.equal(version.duration, 15); report.receipt = version.longVideoReceipt; report.files = version.files;
      const task = initial.queue[0]; const journal = path.join(task.longVideoRoot, task.longVideoExecution.executionId, "journal");
      const events = await Promise.all((await fs.readdir(journal)).filter(n => /^\d{6}\.json$/u.test(n)).sort().map(async n => JSON.parse(await fs.readFile(path.join(journal, n), "utf8")).event));
      assert.equal(events.filter(e => e.kind === "submitted").length, 3);
      assert.deepEqual(events.filter(e => e.kind === "submitted").map(e => e.submission.request.expected_prefix_chunks), [0, 1, 2]);
      report.media = events.find(e => e.kind === "validated").media;
      report.totalSamples = 3; report.noRepeatedAcceptedGroups = true;
    }
  }
  report.ok = true;
} catch (error) { report.error = error.message; process.exitCode = 1; }
finally { client?.close(); }
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
