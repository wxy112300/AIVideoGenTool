import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import {connectApp,parseAppHarnessArgs,pollUntil} from "../app-harness.mjs";
import {fixtureUi} from "./fixture-ui.mjs";
const args=process.argv.slice(2);
if(args.includes("--help")){console.log("settings-queue-smoke.mjs <create-fixture> --port <port> [--audit] [--output report.json]\nRequires one real UI-enqueued waiting H3 generation. Changes attention via Settings, checks immediate waiting-policy update and immutable task content/drafts. --audit checks the exact saved task after restart. Never starts queue/GPU; one baseline per fixture.");process.exit(0)}
const directory=path.resolve(args.shift()||""),audit=args.includes("--audit");
const options=parseAppHarnessArgs(["inspect",...args.filter(x=>x!=="--audit")]);
const baselinePath=path.join(directory,"settings-queue-baseline.json");
const report={ok:false,evidence:audit?"real-settings-waiting-restart":"real-settings-waiting-ui",focusEmulation:true};
const drafts=s=>Object.fromEntries(["draft","imageToVideoDraft","videoExtensionDraft"].filter(k=>s[k]!==undefined).map(k=>[k,s[k]]));
let client;
try{
  assert.match(path.relative(path.resolve("temp"),directory),/^create-smoke-[^\\/]+$/);
  const launch=JSON.parse(await fs.readFile(path.join(directory,"launch.json"),"utf8"));
  assert.equal(path.resolve(launch.directory).toLowerCase(),directory.toLowerCase());
  assert.equal(launch.port,options.port);assert.equal(launch.scenario,"create-t2va");
  client=await connectApp(options);await client.send("Emulation.setFocusEmulationEnabled",{enabled:true});
  const state=()=>client.evaluate("window.studio.getState()");
  const initial=await state();assert.equal(initial.queueRunning,false);assert.equal(initial.history.length,0);
  assert.equal(initial.queue.length,1);assert.equal(initial.queue[0].status,"waiting");
  assert.equal(initial.queue[0].taskType,"generation");
  let baseline;
  if(audit){
    baseline=JSON.parse(await fs.readFile(baselinePath,"utf8"));assert.ok(baseline.acceptedTask,"Run successful UI save first");
    // Store recovery fills three retired H3 memory compatibility fields.
    // Apply that exact production migration; compare every remaining field.
    const {normalizeH3MemoryOptions}=await import('../../dist/electron/src/core/h3-memory-policy.js');
    report.compatibilityDefaults=normalizeH3MemoryOptions(baseline.acceptedTask);
    assert.deepEqual(initial.queue[0],{...baseline.acceptedTask,...report.compatibilityDefaults},"Waiting task changed on restart");
    assert.deepEqual(drafts(initial),baseline.drafts,"Drafts changed on restart");
    assert.equal(initial.settings.h3AttentionMode,baseline.target);
  }else{
    const enqueue=JSON.parse(await fs.readFile(path.join(directory,"ui-enqueue.json"),"utf8"));assert.equal(enqueue.ok,true);
    baseline={task:initial.queue[0],drafts:drafts(initial),oldAttention:initial.settings.h3AttentionMode,target:"pytorch"};
    assert.notEqual(baseline.oldAttention,baseline.target);
    await fs.writeFile(baselinePath,JSON.stringify(baseline,null,2),{flag:"wx"});
    const ui=fixtureUi(client,options.timeout,report);await ui.click("button[data-page=settings]");await ui.click('[data-settings-tab="acceleration"]');
    await pollUntil(()=>client.evaluate("!!document.querySelector('#h3-attention-mode')"),Boolean,options.timeout,"Attention selector");
    const enabled=await client.evaluate("[...document.querySelector('#h3-attention-mode').options].filter(o=>!o.disabled).map(o=>o.value)");
    const index=enabled.indexOf(baseline.target);assert.ok(index>=0);
    await client.evaluate("document.querySelector('#h3-attention-mode').focus()");
    for(const key of ["Home",...Array(index).fill("ArrowDown"),"Enter"]){
      const code={Home:36,ArrowDown:40,Enter:13}[key];
      await client.send("Input.dispatchKeyEvent",{type:"keyDown",key,windowsVirtualKeyCode:code});
      await client.send("Input.dispatchKeyEvent",{type:"keyUp",key,windowsVirtualKeyCode:code});
    }
    await pollUntil(()=>client.evaluate("document.querySelector('#h3-attention-mode')?.value==='pytorch'"),Boolean,options.timeout,"Attention selected");
    await ui.click("#save-settings");
    const saved=await pollUntil(state,s=>s.settings.h3AttentionMode===baseline.target,options.timeout,"Saved attention");
    assert.equal(saved.queueRunning,false);assert.equal(saved.queue.length,1);
    const task=saved.queue[0];assert.equal(task.status,"waiting");assert.equal(task.attentionMode,baseline.target);
    report.changedTaskFields=Object.keys({...baseline.task,...task}).filter(k=>JSON.stringify(baseline.task[k])!==JSON.stringify(task[k]));
    const allowed=new Set(["attentionMode","h3SparseAttentionMode","h3RuntimeMode","h3ComfyCompilerMode","h3ExecutionPolicy","updatedAt"]);
    assert.ok(report.changedTaskFields.includes("attentionMode"));
    assert.deepEqual(report.changedTaskFields.filter(k=>!allowed.has(k)),[],"Non-policy task snapshot changed");
    assert.deepEqual(drafts(saved),baseline.drafts,"Saving execution settings changed drafts");
    baseline.acceptedTask=task;await fs.writeFile(baselinePath,JSON.stringify(baseline,null,2));
    report.actualSettingsSave=true;
  }
  report.taskId=baseline.task.id;report.attention={before:baseline.oldAttention,after:baseline.target};
  report.waitingPolicyUpdated=true;report.taskContentAndDraftsPreserved=true;report.ok=true;
}catch(error){report.error=error.message;process.exitCode=1}finally{client?.close()}
if(options.output)await fs.writeFile(options.output,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
