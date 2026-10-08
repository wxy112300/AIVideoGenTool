import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { connectApp, parseAppHarnessArgs, pollUntil } from "../app-harness.mjs";
import { fixtureUi } from "./fixture-ui.mjs";

if(process.argv.includes("--help")) {
  console.log("version-delete-smoke.mjs <fixture-dir> [--exercise] --port <port> [--output report.json]\nUse launch-create-smoke --version-source-state (queue guard + remove waiting task + delete version) or --shared-version-source-state (shared file guard). Default audits the saved outcome after restart. Synthetic versions use real copied media; no GPU or API enqueue.");
  process.exit(0);
}
const directory=path.resolve(process.argv[2]);
const exercise=process.argv.includes("--exercise");
const options=parseAppHarnessArgs(["inspect",...process.argv.slice(3).filter(arg=>arg!=="--exercise")]);
const report={ok:false,evidence:"real-ui-version-delete",exercise,focusEmulation:true};
let client;
const within=(root,p)=>{const r=path.relative(root,p);return r!==".."&&!r.startsWith(`..${path.sep}`)&&!path.isAbsolute(r);};
const hash=async p=>createHash("sha256").update(await fs.readFile(p)).digest("hex");
try {
  const repository=fileURLToPath(new URL("../../",import.meta.url));
  const relative=path.relative(path.join(repository,"temp"),directory);
  assert.match(relative,/^create-smoke-[^\\/]+$/u);
  assert.ok(within(await fs.realpath(path.join(repository,"temp")),await fs.realpath(directory)));
  const launch=JSON.parse(await fs.readFile(path.join(directory,"launch.json"),"utf8"));
  assert.equal(path.resolve(launch.directory).toLowerCase(),directory.toLowerCase());
  assert.equal(launch.evidence,"fixture-launched-only");
  assert.equal(launch.port,options.port);
  const f=JSON.parse(await fs.readFile(path.join(directory,"version-fixture.json"),"utf8"));
  assert.equal(launch.scenario,f.shared?"history-version-shared":"history-version-queue");
  client=await connectApp(options);
  await client.send("Emulation.setFocusEmulationEnabled",{enabled:true});
  const ui=fixtureUi(client,options.timeout,report);
  async function selectVersion(id) {
    const expression=`document.querySelector('.history-player video')?.dataset.historyVersion===${JSON.stringify(id)}`;
    if(!await client.evaluate(expression)) await ui.click(`[data-version-id="${id}"]`);
    await pollUntil(()=>client.evaluate(`(${expression}) && (document.querySelector('.history-player video')?.readyState??0)>=2`),Boolean,options.timeout,"Selected version media loaded");
  }
  const baselinePath=path.join(directory,"version-delete-baseline.json");
  let baseline;
  const get=()=>client.evaluate("window.studio.getState()");
  function assetOf(s) {
    assert.equal(s.queueRunning,false);
    assert.equal(s.history.length,1);
    assert.equal(s.history[0].id,f.assetId);
    assert.equal(s.history[0].taskId,f.taskId);
    return s.history[0];
  }
  if(exercise) {
    assert.equal(await fs.stat(baselinePath).then(()=>true,()=>false),false,"Use a fresh version fixture");
    const s=await get(),a=assetOf(s);
    assert.equal(a.versions.length,2);
    assert.equal(a.defaultVersionId,f.targetVersionId);
    assert.equal(s.queue.length,f.shared?0:1);
    if(!f.shared) {
      assert.equal(s.queue[0].id,f.queueTaskId);
      assert.equal(s.queue[0].status,"waiting");
      assert.equal(s.queue[0].sourceVersionId,f.targetVersionId);
      assert.equal(s.queue[0].sourceFilePath,f.targetPath);
    }
    assert.ok(!s.draft.sourceVideoPath&&!s.videoExtensionDraft?.sourceVideoPath);
    const paths=new Set([f.originalPath,f.targetPath]);
    function collect(value,key="") {
      if(typeof value==="string"&&path.isAbsolute(value)&&key!=="workflowPath") paths.add(value);
      else if(Array.isArray(value)) value.forEach(item=>collect(item,key));
      else if(value&&typeof value==="object") for(const [name,item] of Object.entries(value)) collect(item,name);
    }
    for(const key of ["history","queue","draft","imageToVideoDraft","videoExtensionDraft","imageDraft"]) collect(s[key]);
    const files=[];
    for(const p of paths) {
      assert.ok(within(directory,p),"External fixture reference");
      assert.ok(within(await fs.realpath(directory),await fs.realpath(p)),"External fixture link");
      files.push({path:p,sha256:await hash(p)});
    }
    baseline={...f,files};
    await fs.writeFile(baselinePath,JSON.stringify(baseline,null,2));
    await ui.openHistory(f.assetId);
    await selectVersion(f.originalVersionId);
    await selectVersion(f.targetVersionId);
    report.actualVersionSwitchVerified=true;
    await ui.click(`[data-history-version-delete-id="${f.targetVersionId}"]`);
    await ui.click("#accept-confirmation");
    report.protectionMessage=await pollUntil(()=>client.evaluate("document.querySelector('#app-flash.visible[data-kind=error] [data-flash-message]')?.textContent??''"),
      text=>text.includes("拒绝物理删除")&&text.includes(f.shared?`history:${f.assetId}:${f.originalVersionId}`:`queue:${f.queueTaskId}`),options.timeout,"Exact shared reference protection");
    assert.equal(assetOf(await get()).versions.length,2);
    for(const file of files) assert.equal(await hash(file.path),file.sha256);
    report.protectedFilesUnchanged=true;
    await ui.click("#cancel-confirmation");
    await ui.click("#dismiss-app-flash");
    if(!f.shared) {
      await ui.click("button[data-page=queue]");
      await ui.click(`[data-remove="${f.queueTaskId}"]`);
      await ui.click("#accept-confirmation");
      await pollUntil(async()=> (await get()).queue.length===0,Boolean,options.timeout,"Waiting task removed");
      for(const file of files) assert.equal(await hash(file.path),file.sha256);
      report.actualQueueRemoveClicked=true;
      await ui.openHistory(f.assetId);
      await selectVersion(f.targetVersionId);
      await ui.click(`[data-history-version-delete-id="${f.targetVersionId}"]`);
      await ui.click("#accept-confirmation");
      await pollUntil(async()=>assetOf(await get()).versions.length===1,Boolean,options.timeout,"Target version removed");
      await pollUntil(()=>client.evaluate(`document.querySelector('.history-player video')?.dataset.historyVersion===${JSON.stringify(f.originalVersionId)}`),Boolean,options.timeout,"Automatic selection of remaining version");
      report.actualVersionDeleteClicked=true;
      report.automaticSelectionVerified=true;
    }
  } else baseline=JSON.parse(await fs.readFile(baselinePath,"utf8"));
  const s=await get(),a=assetOf(s);
  assert.equal(s.queue.length,0);
  assert.equal(a.versions.length,f.shared?2:1);
  assert.equal(a.defaultVersionId,f.shared?f.targetVersionId:f.originalVersionId);
  assert.equal(a.files[0].absolutePath,f.shared?f.targetPath:f.originalPath);
  for(const file of baseline.files) {
    assert.ok(within(directory,file.path));
    if(!f.shared&&file.path===f.targetPath) assert.equal(await fs.stat(file.path).then(()=>true,()=>false),false);
    else assert.equal(await hash(file.path),file.sha256);
  }
  await ui.openHistory(f.assetId);
  const expected=f.shared?f.targetVersionId:f.originalVersionId;
  await pollUntil(()=>client.evaluate(`document.querySelector('.history-player video')?.dataset.historyVersion===${JSON.stringify(expected)}`),Boolean,options.timeout,"Persisted default version");
  if(!f.shared) assert.equal(await client.evaluate("!!document.querySelector('[data-delete-history-version]')"),false,"Only version must not expose version deletion");
  report.shared=f.shared;
  report.defaultVersionId=a.defaultVersionId;
  report.remainingVersions=a.versions.map(v=>v.id);
  report.survivingFilesPreserved=true;
  report.queueStopped=true;
  report.ok=true;
} catch(error) {report.error=error.message;process.exitCode=1;}
finally {client?.close();}
if(options.output) await fs.writeFile(options.output,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
