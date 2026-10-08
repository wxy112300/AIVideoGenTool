import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { connectApp, parseAppHarnessArgs, pollUntil } from "../app-harness.mjs";
import { fixtureUi } from "./fixture-ui.mjs";

if (process.argv.includes("--help")) {
  console.log("asset-delete-smoke.mjs <asset-fixture-dir> [--delete [--whole-asset]] --port <port> [--output report.json]\n--delete: verify draft protection, clear the Extend draft through UI, then delete AV through History confirmation. --whole-asset also deletes the copied video and History record. Default: audit the saved deletion kind after restart. Only accepts physical launch-create-smoke --asset-source-state fixtures. Never starts GPU; original fixture is untouched.");
  process.exit(0);
}
const directory = path.resolve(process.argv[2]);
const execute = process.argv.includes("--delete");
const wholeAsset = process.argv.includes("--whole-asset");
const options = parseAppHarnessArgs(["inspect", ...process.argv.slice(3).filter(arg => !["--delete", "--whole-asset"].includes(arg))]);
const baselinePath = path.join(directory, "delete-baseline.json");
const report = { ok: false, evidence: "real-ui-canonical-asset-delete", execute, focusEmulation: true };
let client, click, openHistory;
function inside(root, filename) {
  const relative = path.relative(root, filename);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
async function digest(filename) {
  return createHash("sha256").update(await fs.readFile(filename)).digest("hex");
}
function version(state, baseline) {
  assert.equal(state.queueRunning, false);
  assert.equal(state.queue.length, 0);
  assert.equal(state.history.length, 1);
  const asset = state.history[0];
  assert.equal(asset.id, baseline.assetId);
  assert.equal(asset.taskId, baseline.taskId);
  assert.equal(asset.versions.length, 1);
  assert.equal(asset.versions[0].id, baseline.versionId);
  return asset.versions[0];
}
try {
  const repository = fileURLToPath(new URL("../../", import.meta.url));
  assert.ok(inside(path.join(repository, "temp"), directory) && path.basename(directory).startsWith("create-smoke-"));
  assert.ok(inside(await fs.realpath(path.join(repository, "temp")), await fs.realpath(directory)));
  const launch = JSON.parse(await fs.readFile(path.join(directory, "launch.json"), "utf8"));
  assert.equal(path.resolve(launch.directory).toLowerCase(), directory.toLowerCase());
  assert.equal(launch.scenario, "asset-migration-canonical");
  assert.equal(launch.port, options.port);
  client = await connectApp(options);
  ({ click, openHistory } = fixtureUi(client, options.timeout, report));
  await client.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  const initial = await client.evaluate("window.studio.getState()");
  let baseline;
  if (execute) {
    assert.equal(await fs.stat(baselinePath).then(() => true, () => false), false, "Use a fresh fixture for deletion");
    const asset = initial.history[0];
    const av = asset?.versions[0]?.h3ContinuationData?.artifact;
    assert.ok(av, "Expected canonical AV pair");
    baseline = { kind: wholeAsset ? "asset" : "av", assetId: asset.id, taskId: asset.taskId, versionId: asset.versions[0].id,
      sourceDraft: initial.draft, avFiles: [av.manifest.absolutePath, av.payload.absolutePath],
      videoPath: asset.versions[0].files.find(f => /\.mp4$/iu.test(f.filename))?.absolutePath };
    const v = version(initial, baseline);
    assert.equal(v.h3AvAsset?.storageKind, "app-canonical");
    assert.equal(v.h3ContinuationData.status, "available");
    assert.ok(!v.h3AvAsset.aliasPaths?.length, "Aliases need a separate fixture");
    assert.equal(v.h3AvAsset.ownerPath.absolutePath, baseline.avFiles[1]);
    assert.equal(initial.draft.sourceVideoPath, baseline.videoPath);
    const references = [];
    function collect(value, key = "") {
      if (typeof value === "string" && path.isAbsolute(value) && key !== "workflowPath") references.push(value);
      else if (Array.isArray(value)) value.forEach(item => collect(item, key));
      else if (value && typeof value === "object") for (const [name, item] of Object.entries(value)) collect(item, name);
    }
    for (const key of ["history", "draft", "imageToVideoDraft", "videoExtensionDraft", "imageDraft", "queue"]) collect(initial[key]);
    for (const filename of [...new Set([...references, baseline.videoPath, ...baseline.avFiles])]) {
      assert.ok(filename && inside(directory, filename), "Refuse external file reference");
      assert.ok(inside(await fs.realpath(directory), await fs.realpath(filename)), "Refuse external symlink");
    }
    baseline.files = await Promise.all([baseline.videoPath, ...baseline.avFiles].map(async filename => ({ path: filename, sha256: await digest(filename) })));
    await fs.writeFile(baselinePath, JSON.stringify(baseline, null, 2));
    if (await client.evaluate("!!document.querySelector('#cancel-confirmation')")) await click("#cancel-confirmation");
    if (await client.evaluate("!!document.querySelector('#app-flash.visible')")) await click("#dismiss-app-flash");
    await openHistory(baseline.assetId);
    const deleteSelector = wholeAsset ? `[data-delete-history="${baseline.assetId}"]` : "[data-delete-joint-av]";
    await click(deleteSelector);
    await click("#accept-confirmation");
    // Read the production notification surface without replacing AppApi or its handlers.
    report.protectionMessage = await pollUntil(() => client.evaluate(`(() => {
      const flash=document.querySelector('#app-flash.visible[data-kind=error]');
      return flash?.querySelector('[data-flash-message]')?.textContent ?? '';
    })()`), text => text.includes("拒绝物理删除"), options.timeout, "Shared draft deletion guard");
    assert.equal(version(await client.evaluate("window.studio.getState()"), baseline).h3ContinuationData.status, "available");
    for (const f of baseline.files) assert.equal(await digest(f.path), f.sha256);
    report.protectedFilesUnchanged = true;
    await click("#cancel-confirmation");
    await click("#dismiss-app-flash");
    await click("button[data-page=create]");
    await click("#clear-draft");
    await click("#accept-confirmation");
    await pollUntil(() => client.evaluate("window.studio.getState().then(s=>!s.draft.sourceVideoPath&&!s.videoExtensionDraft?.sourceVideoPath)"), Boolean, options.timeout, "Saved cleared Extend draft");
    report.actualClearDraftClicked = true;
    await openHistory(baseline.assetId);
    await click(deleteSelector);
    await click("#accept-confirmation");
    await pollUntil(() => client.evaluate(`window.studio.getState().then(s=>${wholeAsset
      ? `!s.history.some(a=>a.id===${JSON.stringify(baseline.assetId)})`
      : "s.history[0]?.versions[0]?.h3ContinuationData?.status==='missing'"})`), Boolean, options.timeout, "Deletion persisted");
    report.actualDeleteClicked = true;
  } else baseline = JSON.parse(await fs.readFile(baselinePath, "utf8"));
  const kind = baseline.kind ?? "av";
  assert.ok(["av", "asset"].includes(kind), "Unknown baseline deletion kind");
  if (wholeAsset) assert.equal(kind, "asset", "Baseline belongs to AV-only deletion");
  report.kind = kind;
  for (const filename of [baseline.videoPath, ...baseline.avFiles]) assert.ok(inside(directory, filename));
  const after = await client.evaluate("window.studio.getState()");
  assert.ok(!after.draft.sourceVideoPath && !after.videoExtensionDraft?.sourceVideoPath, "Cleared draft source returned");
  for (const filename of baseline.avFiles) assert.equal(await fs.stat(filename).then(() => true, () => false), false);
  if (kind === "asset") {
    assert.equal(after.queueRunning, false);
    assert.equal(after.queue.length, 0);
    assert.equal(after.history.length, 0, "Deleted History record returned");
    assert.equal(await fs.stat(baseline.videoPath).then(() => true, () => false), false);
    // After execution, confirm automatic navigation; restart audit explicitly opens the list.
    if (!execute) await click("button[data-page=history]");
    await pollUntil(() => client.evaluate(`!!document.querySelector('button[data-page=history][aria-current=page]') &&
      !document.querySelector('.history-player video') && !document.querySelector('[data-open-history]')`),
      Boolean, options.timeout, "Empty History list after deletion");
    report.recordAndFilesRemoved = true;
    report.historyListReachable = true;
  } else {
    const v = version(after, baseline);
    assert.equal(v.h3ContinuationData.status, "missing");
    assert.ok(!v.h3AvAsset && !v.h3ContinuationData.asset && !v.h3ContextLatentPath, "Deleted AV owner or Motion reference survived");
    assert.equal(await digest(baseline.videoPath), baseline.files[0].sha256);
    report.avStatus = v.h3ContinuationData.status;
    report.videoPreserved = true;
    report.identityPreserved = true;
  }
  const inspection = await client.evaluate(`window.studio.inspectVideoExtensionSource(${JSON.stringify(baseline.sourceDraft)})`);
  assert.equal(inspection.status, "missing");
  assert.equal(inspection.route, "bootstrap");
  report.oldSourceInspection = { route: inspection.route, status: inspection.status, reason: inspection.reason };
  report.ownerAndDraftReferencesCleared = true;
  report.ok = true;
} catch (error) { report.error = error.message; process.exitCode = 1; }
finally { client?.close(); }
if (options.output) await fs.writeFile(options.output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
