// Reuse one completed isolated Create Run; permit only one newly sampled extension group.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { connectApp, parseAppHarnessArgs, pollUntil } from "../app-harness.mjs";

const directory = path.resolve(process.argv[2] ?? ""), mode = process.argv[3];
assert.match(path.relative(path.resolve("temp"), directory), /^create-smoke-[^\\/]+$/u);
assert.ok(["prepare", "finish"].includes(mode), "Use <fixture> prepare|finish --port <port>");
const options = parseAppHarnessArgs(["inspect", ...process.argv.slice(4)]);
const launch = JSON.parse(await fs.readFile(path.join(directory, "launch.json"), "utf8")); assert.equal(Number(options.port), launch.port);
const reportPath = path.join(directory, `long-video-extend-${mode}.json`);
const report = { ok: false, mode, layer: "real-electron-history-extend-ui-ipc", focusEmulation: true };
await fs.writeFile(reportPath, JSON.stringify(report), { flag: "wx" });
let client;
try {
  await pollUntil(async () => { try { client = await connectApp(options); return true; } catch { return false; } }, Boolean, 30000, "AppApi", 500);
  await client.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  const state = () => client.evaluate("window.studio.getState()");
  const wait = (read, label, timeout = 30000) => pollUntil(read, Boolean, timeout, label, 250);
  const click = async selector => {
    assert.equal(await client.evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});return Boolean(b&&!b.disabled&&!b.closest('[hidden]'));})()`), true, selector);
    await client.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  };
  const initial = await state(); assert.equal(initial.queueRunning, false);
  assert.equal(initial.settings.outputDirectory.toLowerCase(), path.join(directory, "video").toLowerCase());
  if (mode === "prepare") {
    assert.equal(initial.queue.length, 0); assert.equal(initial.history.length, 1);
    const asset = initial.history[0], version = asset.versions[0], source = version.longVideoExecution;
    assert.equal(version.longVideoReceipt.accepted_chunks, 3); assert.equal(version.longVideoReceipt.final_output, true);
    await wait(() => client.evaluate("Boolean(document.querySelector('button[data-page=history]'))"), "Navigation");
    await click("button[data-page=history]");
    await wait(() => client.evaluate(`Boolean(document.querySelector('[data-open-history="${asset.id}"]'))`), "Source History card");
    await click(`[data-open-history="${asset.id}"]`);
    const selector = `[data-continue-history="${asset.id}"][data-source-version="${version.id}"]`;
    await wait(() => client.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`), "Source Continue");
    await wait(() => client.evaluate("document.querySelector('.history-player video')?.readyState >= 2 && Boolean(document.querySelector('media-play-button[role=button]'))"), "Bound History player/actions");
    await click(selector);
    await wait(async () => (await state()).draft.longVideoRunSource?.sourceVersionId === version.id && await client.evaluate("document.querySelector('#generation-mode')?.value==='preview'"), "Group Extend draft");
    const draft = (await state()).draft;
    assert.equal(draft.seed, source.profile.seed); assert.equal(draft.steps, source.profile.steps); assert.equal(draft.inputMode, "video");
    assert.equal(await client.evaluate("document.querySelector('#enqueue').disabled"), true);
    assert.equal(await client.evaluate("document.querySelector('[data-preview-count-number]').disabled"), true);
    assert.equal(await client.evaluate("Boolean(document.querySelector('.continuum-source-check'))"), false);
    await click("[data-confirm-layout]"); assert.equal(await client.evaluate("document.querySelector('#enqueue').disabled"), true);
    await click('.create-long-tabs [role="tab"]:nth-child(2)');
    await client.evaluate("document.querySelector('.create-long-editor textarea').focus()");
    await client.send("Input.insertText", { text: "The same red toy block remains on the same blue table. The camera slowly moves closer and settles. Gentle room tone. No speech or music." });
    await wait(() => client.evaluate("!document.querySelector('#enqueue').disabled"), "Future prompt recovery");
    // Owned stopped fixture only: prove stale-head rejection through the actual button, then restore exact bytes.
    const project = path.resolve(version.longVideoReceipt.run_storage_path, "..", "..", "project.json");
    const relative = path.relative(directory, project); assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
    const original = await fs.readFile(project), changed = Buffer.from(JSON.stringify({ ...JSON.parse(original), canonical_storage_revision_id: "probe-stale-head" }));
    try {
      await fs.writeFile(project, changed); await click("#enqueue");
      await wait(() => client.evaluate("document.body.innerText.includes('source head is stale')"), "Stale source error");
      assert.equal((await state()).queue.length, 0); report.staleHeadRejected = true;
    } finally {
      const current = await fs.readFile(project);
      assert.ok(current.equals(changed) || current.equals(original), "Owned source head changed unexpectedly; do not overwrite it");
      if (current.equals(changed)) await fs.writeFile(project, original);
    }
    await wait(() => client.evaluate("!document.querySelector('#enqueue').disabled"), "Post-error recovery");
    await click("#enqueue"); await wait(async () => (await state()).queue.length === 1, "Actual Extend button task ID");
    const task = (await state()).queue[0];
    assert.equal(task.taskType, "extension"); assert.equal(task.duration, 5); assert.equal(task.seed, source.profile.seed);
    assert.equal(task.longVideoPlan.layout.prefixChunks, 3); assert.equal(task.longVideoPlan.layout.totalChunks, 4);
    assert.equal(task.longVideoRunSource.receipt.revision_id, version.longVideoReceipt.revision_id);
    assert.deepEqual(task.longVideoRunSource.profile, source.profile);
    report.taskId = task.id; report.sourceAssetId = asset.id; report.sourceVersionId = version.id;
    report.sourceReceipt = version.longVideoReceipt; report.originalSeedInherited = true; report.actualButtonClicked = true;
    const shot = await client.send("Page.captureScreenshot", { format: "png" });
    await fs.writeFile(path.join(directory, "long-video-extend-ready.png"), Buffer.from(shot.data, "base64"));
  } else {
    const prior = JSON.parse(await fs.readFile(path.join(directory, "long-video-extend-prepare.json"), "utf8")); assert.equal(prior.ok, true);
    assert.equal(initial.queue.length, 1); assert.equal(initial.history.length, 1);
    const task = initial.queue[0]; assert.equal(task.id, prior.taskId); assert.equal(task.status, "waiting");
    assert.equal(task.longVideoPlan.layout.chunks, 1); assert.equal(task.longVideoPlan.layout.totalChunks, 4);
    report.taskId = task.id;
    await client.evaluate("window.studio.startQueue()");
    await wait(async () => { const s = await state(); const current = s.queue.find(t => t.id === task.id); if (current?.status === "failed") throw Error(current.error); return s.queue.length === 0 && s.history.length === 2 && s.queueLifecycle === "idle"; }, "One-group same Run extension", 1200000);
    const completed = await state(), asset = completed.history.find(asset => asset.taskId === task.id), version = asset?.versions[0];
    assert.ok(version); assert.equal(asset.versions.length, 1); assert.equal(version.duration, 20);
    assert.equal(version.longVideoExecution.runName, prior.sourceReceipt.run_name);
    const receipt = version.longVideoReceipt; assert.equal(receipt.accepted_chunks, 4); assert.equal(receipt.reused_count, 3); assert.equal(receipt.generated_count, 1); assert.equal(receipt.final_output, true);
    for (let i = 0; i < 3; i++) for (const key of ["storage_revision_id", "record_filename", "payload_path", "payload_bytes", "payload_sha256"]) assert.equal(receipt.chunk_records[i][key], prior.sourceReceipt.chunk_records[i][key]);
    const journal = path.join(task.longVideoRoot, task.id, "journal");
    const events = await Promise.all((await fs.readdir(journal)).filter(n => /^\d{6}\.json$/u.test(n)).sort().map(async n => JSON.parse(await fs.readFile(path.join(journal, n), "utf8")).event));
    const submissions = events.filter(e => e.kind === "submitted"); assert.equal(submissions.length, 1); assert.equal(submissions[0].submission.request.expected_prefix_chunks, 3);
    report.samples = 1; report.originalPrefixUnchanged = true; report.receipt = receipt; report.media = events.find(e => e.kind === "validated").media;
    report.originalMoviePreserved = completed.history.find(asset => asset.id === prior.sourceAssetId).versions[0].duration === 15;
  }
  report.ok = true;
} catch (error) { report.error = error.message; process.exitCode = 1; }
finally { client?.close(); }
await fs.writeFile(reportPath, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
