import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { connectApp, parseAppHarnessArgs, pollUntil } from "../app-harness.mjs";
import { fixtureUi } from "./fixture-ui.mjs";
const args=process.argv.slice(2);
if(args.includes("--help")){console.log("settings-draft-smoke.mjs <fresh-empty-fixture> --port <port> [--audit] [--output report.json]\nPrepares two edited drafts via AppApi, changes default video model with real Settings controls, saves and checks both drafts. --audit only verifies persisted baseline after restart. No queue/GPU; one baseline per fixture.");process.exit(0)}
const directory=path.resolve(args.shift()||"");
const audit=args.includes("--audit");
const options=parseAppHarnessArgs(["inspect",...args.filter(x=>x!=="--audit")]);
const baselinePath=path.join(directory,"settings-draft-baseline.json");
const report={ok:false,evidence:audit?"real-settings-draft-restart":"real-settings-draft-ui",focusEmulation:true};
const drafts=s=>({draft:s.draft,imageToVideoDraft:s.imageToVideoDraft,videoExtensionDraft:s.videoExtensionDraft});
let client;
try{
  assert.match(path.relative(path.resolve("temp"),directory),/^create-smoke-[^\\/]+$/);
  const launch=JSON.parse(await fs.readFile(path.join(directory,"launch.json"),"utf8"));
  assert.equal(path.resolve(launch.directory).toLowerCase(),directory.toLowerCase());
  assert.equal(launch.port,options.port);assert.equal(launch.scenario,"create-t2va");
  client=await connectApp(options);await client.send("Emulation.setFocusEmulationEnabled",{enabled:true});
  const state=()=>client.evaluate("window.studio.getState()");
  const initial=await state();assert.equal(initial.queue.length,0);assert.equal(initial.history.length,0);assert.equal(initial.queueRunning,false);
  let baseline;
  if(audit)baseline=JSON.parse(await fs.readFile(baselinePath,"utf8"));
  else{
    assert.equal(await fs.stat(baselinePath).catch(()=>null),null,"Use a new fixture; baseline already exists");
    // video-policy excludes Spectrum for video-input R2V. Prepare a valid
    // extension draft instead of inheriting the I2V-only balanced preference.
    await client.evaluate(`(async()=>{
      const s=await window.studio.getState();
      await window.studio.saveDraft({...s.draft,inputMode:'video',modelId:'minimax_h3_ref2va',
        spectrumMode:'off',spectrumModeUserSet:false,seed:6102,
        promptVersions:s.draft.promptVersions.map(p=>({...p,text:'6B extension draft stays edited'}))});
      await window.studio.saveDraft({...s.draft,inputMode:'image',seed:6101,
        promptVersions:s.draft.promptVersions.map(p=>({...p,text:'6B image-to-video draft stays edited'}))});
    })()`);
    baseline={drafts:drafts(await state()),oldDefault:initial.settings.defaultVideoModel};
    await client.send("Page.reload");
    await pollUntil(()=>client.evaluate("!!window.studio && !!document.querySelector('button[data-page=settings]')"),Boolean,options.timeout,"Renderer reload");
    await client.evaluate("window.studio.getState().then(s=>window.studio.scanEnvironment(s.settings,'full')).then(()=>true)");
    const ui=fixtureUi(client,options.timeout,report);
    await ui.click("button[data-page=settings]");await ui.click('[data-settings-tab="video"]');
    await pollUntil(()=>client.evaluate("!!document.querySelector('#default-video-model')"),Boolean,options.timeout,"Default model");
    await pollUntil(()=>client.evaluate("[...document.querySelector('#default-video-model').options].filter(o=>!o.disabled).length>1"),Boolean,options.timeout,"Offline model availability");
    const enabled=await client.evaluate("[...document.querySelector('#default-video-model').options].filter(o=>!o.disabled).map(o=>o.value)");
    baseline.target=enabled.find(v=>v==="minimax_h3_ref2va"&&v!==baseline.oldDefault)||enabled.find(v=>v!==baseline.oldDefault);
    assert.ok(baseline.target,"An installed alternative default is required");
    await fs.writeFile(baselinePath,JSON.stringify(baseline,null,2),{flag:"wx"});
    await client.evaluate("document.querySelector('#default-video-model').focus()");
    for(const key of ["Home",...Array(enabled.indexOf(baseline.target)).fill("ArrowDown"),"Enter"]){
      const code={Home:36,ArrowDown:40,Enter:13}[key];
      await client.send("Input.dispatchKeyEvent",{type:"keyDown",key,windowsVirtualKeyCode:code});
      await client.send("Input.dispatchKeyEvent",{type:"keyUp",key,windowsVirtualKeyCode:code});
    }
    await pollUntil(()=>client.evaluate("document.querySelector('#default-video-model')?.value==="+JSON.stringify(baseline.target)),Boolean,options.timeout,"Changed default");
    await ui.click("#save-settings");
    await pollUntil(async()=>(await state()).settings.defaultVideoModel,v=>v===baseline.target,options.timeout,"Settings saved");
    report.actualSettingsSave=true;
  }
  const result=await state();
  assert.equal(result.settings.defaultVideoModel,baseline.target);
  assert.deepEqual(drafts(result),baseline.drafts,"Settings save changed edited drafts");
  assert.equal(result.queue.length,0);assert.equal(result.queueRunning,false);
  report.defaultModel={before:baseline.oldDefault,after:baseline.target};
  report.activeAndSavedDraftsPreserved=true;report.ok=true;
}catch(error){report.error=error.message;process.exitCode=1}finally{client?.close()}
if(options.output)await fs.writeFile(options.output,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
