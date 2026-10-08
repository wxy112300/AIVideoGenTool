import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectApp, parseAppHarnessArgs, pollUntil } from "../app-harness.mjs";
import { fixtureUi } from "./fixture-ui.mjs";

const directory = path.resolve(process.argv[2] || ".");
const args = process.argv.slice(3);
const auditIndex = args.indexOf("--audit");
const auditReport = auditIndex >= 0 ? args.splice(auditIndex, 2)[1] : undefined;
const duringCleanup = args.includes("--during-cleanup");
const options = parseAppHarnessArgs(["inspect", ...args.filter(arg => arg !== "--during-cleanup")]);
if (!process.argv[2] || process.argv[2] === "--help") {
  console.log("image-library-smoke.mjs <fresh-create-fixture> --port <port> [--output report.json]\nSeeds tiny physical PNGs and draft references only inside a fresh empty fixture. Real Settings buttons archive a source and clean a stale orphan selection after a new draft reference. Preserves external source and newly referenced file; deletes only the remaining fixture orphan. No GPU. One attempt per fixture.");
  console.log("After closing and --resume, use --audit <successful-report.json> for read-only persisted references/files/scan checks. The prior report must be inside this fixture. Wait for CDP readiness before connecting.");
  console.log("--during-cleanup adds the reference through the real progress/AppApi channel after cleanup scanning starts; verifies it committed before file deletion, then checks saved-draft protection via a real mode switch. No test hooks or GPU.");
  process.exit(process.argv[2] ? 0 : 1);
}
let client;
const report = { ok: false, evidence: auditIndex >= 0 ? "real-image-library-restart-audit" : "real-image-library-ui", focusEmulation: true,
  ...(auditIndex >= 0 ? { readOnly: true } : { inputSetup: "fixture-PNG-and-AppApi-draft" }) };
const inside = (root, value) => { const relative = path.relative(root, value); return relative && !relative.startsWith("..") && !path.isAbsolute(relative); };
try {
  assert.ok(!(duringCleanup && auditIndex >= 0), "Choose exercise or audit mode");
  const root = fileURLToPath(new URL("../../", import.meta.url));
  assert.match(path.relative(path.join(root, "temp"), directory), /^create-smoke-[^\\/]+$/);
  assert.equal((await fs.realpath(directory)).toLowerCase(), directory.toLowerCase());
  const launch = JSON.parse(await fs.readFile(path.join(directory, "launch.json"), "utf8"));
  assert.equal(launch.scenario, "create-t2va"); assert.equal(launch.port, options.port);
  assert.equal(path.resolve(launch.directory).toLowerCase(), directory.toLowerCase());
  client = await connectApp(options);
  await client.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  const { click } = fixtureUi(client, options.timeout, report);
  const state = await client.evaluate("window.studio.getState()");
  assert.equal(state.queue.length, 0); assert.equal(state.queueRunning, false); assert.equal(state.history.length, 0);
  if (auditIndex >= 0) {
    assert.ok(auditReport && !auditReport.startsWith("--"), "--audit requires a prior successful report");
    const filename = path.resolve(directory, auditReport);
    assert.ok(inside(directory, await fs.realpath(filename)));
    const prior = JSON.parse(await fs.readFile(filename, "utf8"));
    assert.equal(prior.ok, true); assert.equal(prior.evidence, "real-image-library-ui");
    for (const key of ["library", "original", "protectedFile", "archived", "orphan"]) assert.ok(inside(directory, prior[key]));
    assert.equal(path.resolve(state.settings.imageInputLibraryDirectory), prior.library);
    assert.equal(state.draft.startImagePath, prior.archived); assert.equal(state.draft.endImagePath, prior.protectedFile);
    assert.equal(state.imageToVideoDraft.startImagePath, prior.archived); assert.equal(state.imageToVideoDraft.endImagePath, prior.protectedFile);
    for (const file of [prior.original, prior.protectedFile, prior.archived]) assert.ok(inside(directory, await fs.realpath(file)));
    const originalBytes = await fs.readFile(prior.original);
    assert.ok(originalBytes.length > 0);
    assert.deepEqual(await fs.readFile(prior.protectedFile), originalBytes);
    assert.deepEqual(await fs.readFile(prior.archived), originalBytes);
    assert.equal(await fs.stat(prior.orphan).catch(() => null), null);
    const scan = await client.evaluate("window.studio.scanImageAssetLibrary()");
    assert.equal(scan.libraryDirectory, prior.library);
    // The newly referenced flat library file is protected, but still needs canonical organization.
    assert.equal(scan.archiveCandidates, 1); assert.equal(scan.managedReferences, 2);
    assert.equal(scan.missingReferences.length, 0);
    assert.equal(scan.orphanFiles.length, 0);
    Object.assign(report, { ok: true, persistedDraftReferences: true, persistedSnapshotReferences: true,
      originalAndReferencedFilesPreserved: true, deletedOrphanStillAbsent: true,
      managedReferences: scan.managedReferences, remainingArchiveCandidates: scan.archiveCandidates });
  } else {
    const library = path.resolve(state.settings.imageInputLibraryDirectory);
    assert.ok(inside(directory, library));
    await fs.mkdir(library, { recursive: true });
    assert.equal((await fs.realpath(library)).toLowerCase(), library.toLowerCase());
    const original = path.join(directory, "external-source.png");
    const protectedFile = path.join(library, "protected-after-scan.png");
    const orphan = path.join(library, "unused-orphan.png");
    const baseline = { original, library, protectedFile, orphan };
    await fs.writeFile(path.join(directory, "image-library-baseline.json"), JSON.stringify(baseline, null, 2), { flag: "wx" });
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9ioAAAAASUVORK5CYII=", "base64");
    for (const filename of [original, protectedFile, orphan]) await fs.writeFile(filename, png, { flag: "wx" });
    if (duringCleanup) {
      // Empty fixture directories keep the real asynchronous scan open long
      // enough to observe and acknowledge the separate renderer IPC update.
      for (let i = 0; i < 256; i += 1) await fs.mkdir(path.join(library, "scan-padding", String(i)), { recursive: true });
    }
    await client.evaluate(`window.studio.getState().then(s=>window.studio.saveDraft({...s.draft,startImagePath:${JSON.stringify(original)},endImagePath:''}))`);
    await client.send("Page.reload");
    await click("button[data-page=settings]"); await click("#settings-tab-system");
    if (await client.evaluate("!!document.querySelector('#save-settings') && !document.querySelector('#save-settings').disabled")) await click("#save-settings");
    await click("#open-image-asset-library");
    await click("#image-assets-organize");
    const archived = await pollUntil(() => client.evaluate("window.studio.getState().then(s=>s.draft.startImagePath)"),
      value => value && value !== original, options.timeout, "Archived draft reference");
    assert.ok(inside(library, archived));
    assert.deepEqual(await fs.readFile(original), png); assert.deepEqual(await fs.readFile(archived), png);
    const scan = await client.evaluate("window.studio.scanImageAssetLibrary()");
    assert.ok(scan.orphanFiles.some(f => f.absolutePath === protectedFile));
    assert.ok(scan.orphanFiles.some(f => f.absolutePath === orphan));
    for (const filename of [protectedFile, orphan]) {
      const selector = `[data-orphan-path=${JSON.stringify(filename)}]`;
      if (!await client.evaluate(`document.querySelector(${JSON.stringify(selector)})?.checked`)) await click(selector);
    }
    // Keep the dialog's old selection. The service must recheck the new reference.
    if (!duringCleanup) await client.evaluate(`window.studio.getState().then(s=>window.studio.saveDraft({...s.draft,endImagePath:${JSON.stringify(protectedFile)}}))`);
    const selected = await client.evaluate("[...document.querySelectorAll('[data-orphan-path]:checked')].map(e=>e.dataset.orphanPath)");
    assert.ok(selected.includes(protectedFile) && selected.includes(orphan));
    await click("#image-assets-cleanup");
    if (duringCleanup) await client.evaluate(`(() => {
      const race = window.__imageLibraryRace = { started: false, saved: false, cleaningSeen: false, cleaningBeforeSave: false };
      race.dispose = window.studio.onImageAssetLibraryProgress(progress => {
        if (progress.phase === 'cleaning') { race.cleaningSeen = true; if (!race.saved) race.cleaningBeforeSave = true; }
        if (progress.phase !== 'scanning' || race.started) return;
        race.started = true;
        window.studio.getState().then(s => window.studio.saveDraft({...s.draft,endImagePath:${JSON.stringify(protectedFile)}}))
          .then(() => { race.saved = true; }).catch(error => { race.error = error.message; });
      });
    })()`);
    await click("#image-assets-cleanup");
    await pollUntil(async () => !(await fs.stat(orphan).catch(() => null)), Boolean, options.timeout, "Only unused orphan removed");
    if (duringCleanup) {
      const race = await pollUntil(() => client.evaluate("({...window.__imageLibraryRace,dispose:undefined})"), value => value.saved || value.error, options.timeout, "Concurrent draft save");
      assert.equal(race.error, undefined); assert.equal(race.started, true); assert.equal(race.cleaningSeen, true);
      assert.equal(race.cleaningBeforeSave, false, "Inconclusive interleaving: draft save must finish during the scan");
      report.concurrentReference = race;
    }
    assert.deepEqual(await fs.readFile(original), png); assert.deepEqual(await fs.readFile(protectedFile), png);
    assert.deepEqual(await fs.readFile(archived), png);
    const final = await client.evaluate("window.studio.getState()");
    assert.equal(final.draft.startImagePath, archived); assert.equal(final.draft.endImagePath, protectedFile);
    assert.equal(final.queue.length, 0); assert.equal(final.queueRunning, false);
    await click("#image-assets-close");
    // The concurrent input was injected through AppApi, outside the renderer's
    // draft controller. Reload its view before testing a separate mode switch.
    if (duringCleanup) await client.send("Page.reload");
    await click("button[data-page=create]");
    if (duringCleanup) {
      await click('[data-input-mode="video"]');
      await pollUntil(() => client.evaluate("window.studio.getState().then(s=>s.draft.inputMode==='video')"), Boolean, options.timeout, "Inactive image draft");
      const inactive = await client.evaluate("window.studio.getState()");
      assert.equal(inactive.draft.startImagePath, ""); assert.equal(inactive.draft.endImagePath, "");
      assert.equal(inactive.imageToVideoDraft.startImagePath, archived);
      assert.equal(inactive.imageToVideoDraft.endImagePath, protectedFile);
      const inactiveScan = await client.evaluate("window.studio.scanImageAssetLibrary()");
      assert.equal(inactiveScan.orphanFiles.length, 0); assert.equal(inactiveScan.missingReferences.length, 0);
      await click('[data-input-mode="image"]');
      await pollUntil(() => client.evaluate(`window.studio.getState().then(s=>s.draft.startImagePath===${JSON.stringify(archived)}&&s.draft.endImagePath===${JSON.stringify(protectedFile)})`), Boolean, options.timeout, "Saved image draft restored");
      report.inactiveDraftProtectedAndRestored = true;
    }
    Object.assign(report, { ok: true, ...baseline, archived, externalOriginalPreserved: true,
      staleSelectionProtected: true, actualOrphanRemoved: true, actualUiArchiveAndCleanup: true });
  }
} catch (error) {
  report.error = error.message; process.exitCode = 1;
  if (client) report.flash = await client.evaluate("document.querySelector('#app-flash.visible [data-flash-message]')?.textContent").catch(() => null);
} finally {
  if (client && duringCleanup) await client.evaluate("window.__imageLibraryRace?.dispose?.();delete window.__imageLibraryRace").catch(() => undefined);
  client?.close();
}
if (options.output) await fs.writeFile(options.output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
