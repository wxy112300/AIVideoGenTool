// One user-authorized 120s Run. prepare -> review -> enqueue -> render; never auto-resubmit.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { connectApp, parseAppHarnessArgs, pollUntil } from "../app-harness.mjs";

const directory = path.resolve(process.argv[2] ?? ""), mode = process.argv[3];
assert.match(path.relative(path.resolve("temp"), directory), /^create-smoke-[^\\/]+$/u);
assert.ok(["prepare", "enqueue", "render"].includes(mode));
const options = parseAppHarnessArgs(["inspect", ...process.argv.slice(4)]);
const launch = JSON.parse(await fs.readFile(path.join(directory, "launch.json"), "utf8")); assert.equal(Number(options.port), launch.port);
const spec = JSON.parse(await fs.readFile(path.join(directory, "story-spec.json"), "utf8"));
assert.equal(spec.seconds, 120); assert.equal(spec.chunks, 12);
const output = path.join(directory, `story-${mode}.json`);
const report = { ok: false, mode, layer: "real-electron-story-package", focusEmulation: true, startedAt: new Date().toISOString() };
await fs.writeFile(output, JSON.stringify(report), { flag: "wx" });
let client;
try {
  await pollUntil(async () => { try { client = await connectApp(options); return true; } catch { return false; } }, Boolean, 30000, "AppApi", 500);
  await client.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  const state = () => client.evaluate("window.studio.getState()");
  const wait = (read, label, timeout = 30000) => pollUntil(read, Boolean, timeout, label, 500);
  const click = async selector => {
    assert.equal(await client.evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});return Boolean(b&&!b.disabled&&!b.closest('[hidden]'));})()`), true, selector);
    await client.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  };
  const input = async (selector, value, event = "input") => client.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(e?.value===${JSON.stringify(value)})return;if(!e||e.disabled)throw Error(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));})()`);
  const initial = await state(); assert.equal(initial.queueRunning, false);
  assert.equal(initial.settings.outputDirectory.toLowerCase(), path.join(directory, "video").toLowerCase());
  if (mode === "prepare") {
    assert.equal(initial.queue.length, 0); assert.equal(initial.history.length, 0);
    await wait(() => client.evaluate("Boolean(document.querySelector('#generation-mode'))"), "Create");
    await input("#spectrum-mode", "off", "change"); await input("#resolution", String(spec.resolution), "change");
    await input("#ratio", "16:9", "change");
    const image = path.join(directory, "story-source.png");
    const imageBytes = await fs.readFile(image); report.sourceSha256 = crypto.createHash("sha256").update(imageBytes).digest("hex");
    assert.equal(report.sourceSha256, spec.sourceSha256);
    assert.equal(await client.evaluate("document.querySelector('#enqueue').disabled"), true);
    const point = await client.evaluate("(()=>{const e=document.querySelector('#pick-start');e.scrollIntoView();const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
    for (const type of ["dragEnter", "dragOver", "drop"]) await client.send("Input.dispatchDragEvent", { type, ...point, data: { items: [], files: [image], dragOperationsMask: 1 } });
    await wait(async () => Boolean((await state()).draft.startImagePath), "History source image drop");
    await input("#generation-mode", "preview", "change");
    await input("[data-preview-duration-number]", "120"); await input("[data-preview-count-number]", "12");
    await click("[data-confirm-layout]");
    await input("[data-preview-writing]", "automatic", "change");
    await input("#long-preview-preset", "detailed-cinematic", "change");
    await client.evaluate("document.querySelector('.create-long-editor textarea').focus(); document.querySelector('.create-long-editor textarea').select()");
    await client.send("Input.insertText", { text: spec.brief });
    assert.equal(await client.evaluate("document.querySelector('#enqueue').disabled"), true);
    await wait(() => client.evaluate("!document.querySelector('[data-enhance-long-video]').disabled"), "Enhance enabled");
    await wait(async () => (await state()).draft.longVideoScript?.layout.chunks === 12, "Persisted layout identity");
    const before = (await state()).draft.longVideoScript; report.scriptId = before.brief.id;
    await click("[data-enhance-long-video]"); report.actualEnhanceClick = true;
    await wait(async () => {
      const s = await state(), script = s.draft.longVideoScript;
      if (script?.segments.every(p => p.versions.some(v => v.source === "model") && !p.stale)) return true;
      const runtime = await client.evaluate("window.studio.getPromptRuntimeState()");
      if (["failed", "cancelled"].includes(runtime.operation?.terminalStatus)) throw Error(JSON.stringify(runtime.operation));
      return false;
    }, "Planner plus twelve real model details", 1200000);
    const prepared = await state(); const script = prepared.draft.longVideoScript;
    assert.equal(script.brief.id, report.scriptId); assert.equal(script.layout.chunks, 12); assert.equal(script.layout.chunkSeconds, 10);
    assert.equal(prepared.queue.length, 0); report.missingDetailsBlocked = true; report.script = script; report.sourceAssetId = spec.sourceAssetId;
    assert.equal(await client.evaluate("document.querySelector('#enqueue').disabled"), false);
    await fs.writeFile(path.join(directory, "story-enhanced-script.json"), JSON.stringify(script, null, 2));
    const png = await client.send("Page.captureScreenshot", { format: "png" }); await fs.writeFile(path.join(directory, "story-enhanced.png"), Buffer.from(png.data, "base64"));
  } else if (mode === "enqueue") {
    const prior = JSON.parse(await fs.readFile(path.join(directory, "story-prepare.json"), "utf8")); assert.equal(prior.ok, true);
    assert.equal(initial.queue.length, 0); assert.equal(initial.history.length, 0);
    assert.deepEqual(initial.draft.longVideoScript, prior.script);
    await wait(() => client.evaluate("Boolean(document.querySelector('#enqueue'))"), "Create submit");
    await click("#enqueue");
    await wait(async () => (await state()).queue.length === 1, "One package task ID");
    const queued = (await state()).queue[0]; assert.equal(queued.taskType, "generation"); assert.equal(queued.duration, 120);
    assert.equal(queued.longVideoPlan.layout.chunks, 12); assert.equal(queued.longVideoPlan.layout.chunkSeconds, 10);
    assert.deepEqual(queued.longVideoPlan.pages.slice(1).map(p => p.text), prior.script.segments.map(p => p.versions.find(v => v.id === p.activeVersionId).text));
    report.taskId = queued.id; report.actualEnqueueClick = true; report.task = queued;
  } else {
    const prior = JSON.parse(await fs.readFile(path.join(directory, "story-enqueue.json"), "utf8")); assert.equal(prior.ok, true);
    assert.equal(initial.queue.length, 1); assert.equal(initial.queue[0].id, prior.taskId); assert.equal(initial.queue[0].status, "waiting");
    report.taskId = prior.taskId; report.progress = []; let lastLog = 0;
    await wait(() => client.evaluate("Boolean(document.querySelector('button[data-page=queue]'))"), "Queue navigation");
    await click("button[data-page=queue]");
    await wait(() => client.evaluate("Boolean(document.querySelector('#queue-primary-action'))"), "Queue start");
    await click("#queue-primary-action"); report.actualStartClick = true;
    await wait(async () => {
      const s = await state(), current = s.queue.find(t => t.id === prior.taskId);
      if (current?.status === "failed" || current?.status === "cancelled") throw Error(current.error ?? current.status);
      if (Date.now() - lastLog > 10000) {
        lastLog = Date.now(); const sample = { at: new Date().toISOString(), progress: current?.progress, local: current?.longVideoGroupProgress, stage: current?.stage };
        if (current?.longVideoGroupProgress !== undefined) {
          const ui = await client.evaluate(`(()=>{const root=document.querySelector('[data-queue-task-id="${prior.taskId}"]');const group=root?.querySelector('#continuum-group-progress');const page=root?.querySelector('[data-queue-prompt-page="2"]');if(!root||!group||!page)return null;
            if(!window.__storyQueuePromptElement){page.focus();page.click();window.__storyQueuePromptElement=root.querySelector('[data-queue-prompt]');}
            return {visible:!group.hidden,local:root.querySelector('#continuum-group-progress-bar')?.parentElement.getAttribute('aria-valuenow'),total:root.querySelector('#running-progress-label')?.textContent,page:root.querySelector('[data-queue-prompt-page][aria-pressed=true]')?.dataset.queuePromptPage,samePrompt:window.__storyQueuePromptElement===root.querySelector('[data-queue-prompt]')};})()`);
          if (ui) { assert.equal(ui.page, "2"); assert.equal(ui.samePrompt, true); report.promptBrowsingPreserved = true;
            report.dualProgressObserved ||= ui.visible && Number.isFinite(Number(ui.local)); sample.ui = ui;
            if (!report.runningScreenshot) { const png = await client.send("Page.captureScreenshot", { format: "png" }); await fs.writeFile(path.join(directory, "story-running.png"), Buffer.from(png.data, "base64")); report.runningScreenshot = true; }
          }
        }
        const metrics = await client.evaluate("window.studio.getState().then(s=>window.studio.getPerformanceMetrics(s.settings))");
        sample.metrics = metrics;
        report.progress.push(sample); console.log(JSON.stringify(sample));
        await fs.writeFile(path.join(directory, "story-progress.json"), JSON.stringify(report.progress, null, 2));
      }
      return !current && s.history.some(a => a.taskId === prior.taskId) && s.queueLifecycle === "idle";
    }, "One complete 120-second Run", 10800000);
    const completed = await state(), asset = completed.history.find(a => a.taskId === prior.taskId), version = asset.versions[0];
    assert.equal(asset.versions.length, 1); assert.equal(version.duration, 120);
    assert.equal(version.longVideoReceipt.accepted_chunks, 12); assert.equal(version.longVideoReceipt.final_output, true);
    const journal = path.join(prior.task.longVideoRoot, prior.taskId, "journal");
    const events = await Promise.all((await fs.readdir(journal)).filter(n => /^\d{6}\.json$/u.test(n)).sort().map(async n => JSON.parse(await fs.readFile(path.join(journal, n), "utf8")).event));
    const submitted = events.filter(e => e.kind === "submitted"), accepted = events.filter(e => e.kind === "accepted");
    assert.equal(submitted.length, accepted.length); assert.ok(submitted.length <= 12);
    assert.equal(submitted[0].submission.request.expected_prefix_chunks, 0);
    for (let i = 1; i < submitted.length; i++) assert.equal(submitted[i].submission.request.expected_prefix_chunks, accepted[i - 1].result.receipt.accepted_chunks);
    report.submissions = submitted.length; report.media = events.find(e => e.kind === "validated").media;
    report.assetId = asset.id; report.versionId = version.id; report.receipt = version.longVideoReceipt;
    report.files = version.files; report.samplesWereNotRepeated = true;
    assert.equal(report.dualProgressObserved, true); assert.equal(report.promptBrowsingPreserved, true);
  }
  report.ok = true;
} catch (error) { report.error = error.stack ?? String(error); process.exitCode = 1; }
finally { client?.close(); report.finishedAt = new Date().toISOString(); await fs.writeFile(output, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ ok: report.ok, mode, taskId: report.taskId, error: report.error })); }
