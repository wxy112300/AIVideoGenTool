import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { connectApp, parseAppHarnessArgs, pollUntil } from "../app-harness.mjs";

if (process.argv.includes("--help")) {
  console.log("asset-migration-smoke.mjs <asset-fixture-dir> [--migrate] --port <port> [--output report.json]\nDefault: audit persisted media/AV/draft references. --migrate: click Settings > Application/paths > Save > Apply and migrate, then audit. Only accepts launch-create-smoke --asset-source-state fixtures. No GPU, enqueue or deletion outside that fixture. Resume and run again without --migrate to audit restart.");
  process.exit(0);
}
const directory = path.resolve(process.argv[2]);
const migrate = process.argv.includes("--migrate");
const options = parseAppHarnessArgs(["inspect", ...process.argv.slice(3).filter(arg => arg !== "--migrate")]);
const report = { ok: false, evidence: "real-app-asset-references", migrate };
let client;
function owned(filename) {
  const relative = path.relative(directory, filename);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
async function audit(state) {
  const references = [];
  function visit(value, role, key = "") {
    if (typeof value === "string" && path.isAbsolute(value) && key !== "workflowPath") {
      references.push({ role, path: value });
    } else if (Array.isArray(value)) value.forEach((item, index) => visit(item, `${role}[${index}]`, key));
    else if (value && typeof value === "object") Object.entries(value).forEach(([name, item]) => visit(item, `${role}.${name}`, name));
  }
  for (const key of ["history", "draft", "imageToVideoDraft", "videoExtensionDraft", "imageDraft", "queue"]) visit(state[key], key);
  const files = [];
  for (const filename of new Set(references.map(ref => ref.path))) {
    assert.ok(owned(filename), "Refuse external asset references");
    const stat = await fs.stat(filename).catch(() => null);
    if (stat) assert.ok(owned(await fs.realpath(filename)), "Refuse links outside fixture");
    files.push({ path: filename, present: !!stat?.isFile() && stat.size > 0,
      sha256: stat?.isFile() ? createHash("sha256").update(await fs.readFile(filename)).digest("hex") : undefined });
  }
  return { outputDirectory: state.settings.outputDirectory, references, files,
    missing: references.filter(ref => !files.find(file => file.path === ref.path)?.present) };
}
try {
  const manifest = JSON.parse(await fs.readFile(path.join(directory, "launch.json"), "utf8"));
  assert.equal(path.resolve(manifest.directory).toLowerCase(), directory.toLowerCase());
  assert.equal(manifest.scenario, "asset-migration-canonical");
  assert.equal(manifest.evidence, "fixture-launched-only");
  assert.equal(manifest.port, options.port);
  client = await connectApp(options);
  const before = await client.evaluate("window.studio.getState()");
  assert.equal(before.queueRunning, false);
  assert.equal(before.queue.length, 0);
  report.before = await audit(before);
  if (migrate) {
    assert.equal(path.resolve(before.settings.outputDirectory).toLowerCase(), directory.toLowerCase(), "Migrate only a fresh fixture's root layout");
    assert.equal(report.before.missing.length, 0, "Fix fixture baseline before migration");
    const destination = path.join(directory, "migrated");
    await client.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await client.evaluate("window.__assetMigrationEvents=[];window.__assetMigrationOff=window.studio.onHistoryMigrationProgress(p=>window.__assetMigrationEvents.push(p));document.querySelector('button[data-page=settings]').click()");
    await pollUntil(() => client.evaluate("!!document.querySelector('#settings-tab-system')"), Boolean, options.timeout, "Settings system tab");
    await client.evaluate("document.querySelector('#settings-tab-system').click()");
    await pollUntil(() => client.evaluate("!!document.querySelector('#output-directory')"), Boolean, options.timeout, "Output directory input");
    await client.evaluate("document.querySelector('#output-directory').focus();document.querySelector('#output-directory').select()");
    await client.send("Input.insertText", { text: destination });
    await client.evaluate("document.querySelector('#output-directory').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#save-settings').click()");
    await pollUntil(() => client.evaluate("!!document.querySelector('#directory-apply-migrate') && !document.querySelector('#directory-apply-migrate').disabled"), Boolean, options.timeout, "Migration choice enabled");
    await client.evaluate("document.querySelector('#directory-apply-migrate').click()");
    report.actualMigrationButtonClicked = true;
    await pollUntil(() => client.evaluate("window.__assetMigrationEvents.at(-1)"), event => ["completed", "failed"].includes(event?.phase), options.timeout, "Migration terminal progress");
    report.progress = await client.evaluate("window.__assetMigrationEvents");
    const after = await client.evaluate("window.studio.getState()");
    report.after = await audit(after);
    assert.equal(report.progress.at(-1).phase, "completed", "Migration failed");
    assert.equal(after.settings.outputDirectory, destination);
    assert.deepEqual(after.history.map(asset => [asset.id, asset.versions.map(v => v.id)]), before.history.map(asset => [asset.id, asset.versions.map(v => v.id)]), "Migration changed identities");
    const knownHashes = new Set(report.before.files.map(file => file.sha256));
    assert.ok(report.after.files.filter(file => file.present).every(file => knownHashes.has(file.sha256)), "Asset bytes changed");
    report.contentPreserved = true;
    assert.equal(report.after.missing.length, 0, "Migration left missing asset/draft references");
  } else {
    assert.equal(report.before.missing.length, 0, "Missing asset/draft references");
  }
  report.ok = true;
} catch (error) { report.error = error.message; process.exitCode = 1; }
finally {
  if (client) await client.evaluate("window.__assetMigrationOff?.()").catch(() => {});
  client?.close();
}
if (options.output) await fs.writeFile(options.output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
