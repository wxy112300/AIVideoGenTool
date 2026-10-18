// CPU-only isolated App + external browser journey. No user library is written.
import fs from "node:fs/promises";
import { openSync, closeSync } from "node:fs";
import path from "node:path";
import net from "node:net";
import { createRequire } from "node:module";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { AppCdpClient, connectApp, pollUntil } from "../app-harness.mjs";
import { createDefaultState } from "../../dist/electron/src/core/defaults.js";
const root = path.resolve(import.meta.dirname, "../..");
const execute = promisify(execFile);
const electron = createRequire(import.meta.url)("electron");
async function freePort() {
  const server = net.createServer(); await new Promise((resolve) => server.listen(0,"127.0.0.1",resolve));
  const port = server.address().port; await new Promise((resolve) => server.close(resolve)); return port;
}
await fs.mkdir(path.join(root,"temp"),{recursive:true});
const directory = await fs.mkdtemp(path.join(root, "temp", "lan-smoke-"));
const port = await freePort(), webPort = await freePort(), browserPort = await freePort();
const state = createDefaultState();
Object.assign(state.settings, { comfyUrl: "http://192.0.2.1:9", comfyDirectory: "", comfyPythonPath: "", uiLocale: "zh-CN", lanBrowserEnabled: false, lanBrowserPort: webPort, autoRetryFailedTasks: false, outputDirectory: path.join(directory,"video"), imageOutputDirectory: path.join(directory,"images"), imageInputLibraryDirectory: path.join(directory,"inputs") });
await fs.mkdir(state.settings.outputDirectory,{ recursive:true });
for (const [name,size] of [["landscape","640x360"],["portrait","360x640"],["square","480x480"]]) {
  await execute("ffmpeg",["-nostdin","-hide_banner","-loglevel","error","-f","lavfi","-i",`testsrc2=size=${size}:rate=12`,"-t","12","-an","-c:v","libx264","-threads","1","-pix_fmt","yuv420p","-movflags","+faststart",path.join(state.settings.outputDirectory,`${name}.mp4`)]);
}
for (let i=0;i<120;i++) {
  const name = ["portrait","landscape","square"][i%3], filename=`${name}.mp4`;
  const [width,height] = name==="portrait"?[360,640]:name==="square"?[480,480]:[640,360];
  const file={filename,subfolder:"",type:"output",absolutePath:path.join(state.settings.outputDirectory,filename)};
  const createdAt=new Date(Date.UTC(2026,9,18,0,0,120-i)).toISOString();
  const version={id:`version-${i}`,kind:"original",createdAt,outputFilename:filename,modelId:"minimax_h3_fl2va",width,height,duration:12,fps:12,workflowPath:"private",comfyPromptId:"",comfyOutputs:{},files:[file]};
  const prompt = i===0 ? 'PRIVATE PROMPT\n<script>window.__lanPromptExecuted=true</script>\n'+"A calm scene with natural lighting.\n".repeat(200) : i===1 ? "" : "PRIVATE PROMPT";
  state.history.push({mediaKind:"video",id:`lan-${i}`,taskId:`task-${i}`,title:`Video ${i+1}`,outputFilename:filename,createdAt,updatedAt:createdAt,modelId:version.modelId,favorite:i%4===0,rating:i%5===0?4.5:null,tags:[i%2?"city":"nature"],duration:12,resolution:Math.min(width,height),fps:12,prompt,seed:i,comfyPromptId:"",comfyOutputs:{},files:[file],defaultVersionId:version.id,versions:[version]});
}
const userData=path.join(directory,"user-data"); await fs.mkdir(userData,{recursive:true});
const statePath=path.join(userData,"studio-state.json"); await fs.writeFile(statePath,JSON.stringify(state));
const env={...process.env}; delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
for(const key of ["APPDATA","LOCALAPPDATA","TEMP","TMP"]) { env[key]=path.join(directory,key.toLowerCase()); await fs.mkdir(env[key],{recursive:true}); }
function launch(args,name) {
  const log=openSync(path.join(directory,`${name}.log`),"a");
  const child=spawn(electron,args,{cwd:root,env,detached:true,windowsHide:true,stdio:["ignore",log,log]}); closeSync(log); child.unref(); return child;
}
const app=launch(["--remote-debugging-address=127.0.0.1",`--remote-debugging-port=${port}`,`--user-data-dir=${userData}`,root],"app");
const report={ok:false,directory,appPid:app.pid,port,webPort,browserPort,evidence:"isolated-real-app-and-browser",focusEmulation:true,physicalDevices:false};
await fs.writeFile(path.join(directory,"launch.json"),JSON.stringify(report,null,2));
let studio,browser,browserProcess;
async function wait(test,label) { return pollUntil(test,Boolean,30000,label); }
async function browserClient() {
  return wait(async()=>{
    try { const targets=await(await fetch(`http://127.0.0.1:${browserPort}/json/list`)).json(); const target=targets.find(t=>t.type==="page"&&t.url.startsWith(`http://127.0.0.1:${webPort}`)); if(!target)return null; const c=new AppCdpClient(target.webSocketDebuggerUrl); await c.connect(); return c; } catch { return null; }
  },"standalone browser");
}
async function click(client,selector) {
  await wait(()=>client.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return !!e&&!e.disabled})()`),`Available control: ${selector}`);
  await client.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
  const rect=await client.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Unavailable control: '+${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await client.send("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,...rect});
  await client.send("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",clickCount:1,...rect});
}
try {
  studio=await wait(async()=>{ try{return await connectApp({port,timeout:3000,target:""});}catch{return null;} },"App preload");
  await studio.send("Emulation.setFocusEmulationEnabled",{enabled:true});
  await wait(()=>studio.evaluate('!!document.querySelector("button[data-page=settings]")'),"App shell");
  await click(studio,'button[data-page="settings"]');
  await wait(()=>studio.evaluate('!!document.querySelector("[data-settings-tab=system]")'),"Settings tabs");
  await click(studio,'[data-settings-tab="system"]');
  await wait(()=>studio.evaluate('!!document.querySelector("#lan-browser-enabled")'),"LAN switch");
  assert.equal((await studio.evaluate("window.studio.getLanBrowserStatus()")).state,"off");
  await click(studio,"#lan-browser-enabled");
  report.service=await pollUntil(()=>studio.evaluate("window.studio.getLanBrowserStatus()"),v=>v.state==="running",30000,"Switch starts LAN service");
  await wait(()=>studio.evaluate('!document.querySelector("[data-lan-open]").disabled'),"Open URL control");
  report.settings=await studio.evaluate('({enabled:document.querySelector("#lan-browser-enabled").checked,addresses:[...document.querySelectorAll("[data-lan-address]")].map(o=>o.value),copyEnabled:!document.querySelector("[data-lan-copy]").disabled,openEnabled:!document.querySelector("[data-lan-open]").disabled})');
  report.settingsLayout=[];
  for(const [width,height] of [[1280,800],[1440,900]]){
    await studio.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:false});
    await studio.evaluate('document.querySelector("[data-lan-panel]").scrollIntoView({block:"center"});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    const layout=await studio.evaluate('(()=>{const p=document.querySelector("[data-lan-panel]"),grid=p.querySelector(".settings-grid.two"),a=grid.children[0].getBoundingClientRect(),b=grid.children[1].getBoundingClientRect();const rows=[...p.querySelectorAll("[data-lan-address-row]")].map(row=>{const input=row.querySelector("input"),copy=row.querySelector("[data-lan-copy]"),open=row.querySelector("[data-lan-open]"),r=input.getBoundingClientRect(),c=copy.getBoundingClientRect(),o=open.getBoundingClientRect();return{readonly:input.readOnly,type:input.type,inputWidth:r.width,inline:Math.abs(r.y+r.height/2-c.y-c.height/2)<2&&Math.abs(c.y+c.height/2-o.y-o.height/2)<2,right:o.right}});return{width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,afterCache:p.previousElementSibling.classList.contains("app-cache-panel"),beforeProxy:!!p.nextElementSibling.querySelector("#proxy-enabled"),twoColumns:b.x>=a.right&&Math.abs(a.y-b.y)<2,rows}})()');
    assert.equal(layout.afterCache,true);assert.equal(layout.beforeProxy,true);assert.equal(layout.twoColumns,true);assert.equal(layout.overflow,false);
    assert(layout.rows.every(row=>row.readonly&&row.type==="text"&&row.inline&&row.inputWidth>160&&row.right<=width));
    report.settingsLayout.push(layout);
    const shot=await studio.send("Page.captureScreenshot",{format:"png"});await fs.writeFile(path.join(directory,`settings-lan-${width}.png`),Buffer.from(shot.data,"base64"));
  }
  const local=`http://127.0.0.1:${webPort}/`;
  report.lanInterfaceReachable=[];
  for(const url of report.service.urls) { try { report.lanInterfaceReachable.push({url,status:(await fetch(url,{signal:AbortSignal.timeout(3000)})).status}); } catch { report.lanInterfaceReachable.push({url,status:0}); } }
  browserProcess=launch(["--remote-debugging-address=127.0.0.1",`--remote-debugging-port=${browserPort}`,`--user-data-dir=${path.join(directory,"browser-data")}`,path.join(root,"scripts/harness/lan-browser-window.cjs"),local],"browser");
  report.browserPid=browserProcess.pid;
  browser=await browserClient(); await browser.send("Emulation.setFocusEmulationEnabled",{enabled:true});
  await browser.send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await browser.send("Emulation.setTouchEmulationEnabled",{enabled:true,maxTouchPoints:1});
  await wait(()=>browser.evaluate('document.querySelectorAll(".media-tile").length>0'),"Media wall");
  assert.equal(await browser.evaluate("typeof window.studio"),"undefined");
  report.phoneLayout=await browser.evaluate('({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,tiles:document.querySelectorAll(".media-tile").length,columns:new Set([...document.querySelectorAll(".media-tile")].map(e=>Math.round(e.getBoundingClientRect().x))).size})');
  assert.equal(report.phoneLayout.columns,2); assert.equal(report.phoneLayout.overflow,false);
  await wait(()=>browser.evaluate('[...document.querySelectorAll(".media-tile img")].slice(0,2).every(i=>i.complete&&i.naturalWidth>0)'),"Cold covers");
  report.coldCovers=true;
  async function screenshot(name) { const shot=await browser.send("Page.captureScreenshot",{format:"png"}); await fs.writeFile(path.join(directory,`${name}.png`),Buffer.from(shot.data,"base64")); }
  await screenshot("phone-wall");
  await click(browser,'.media-tile[data-index="0"]');
  await wait(()=>browser.evaluate('!document.querySelector("#watch").hidden&&document.querySelector("#watch video").readyState>=2'),"Video decode");
  report.playback=await pollUntil(()=>browser.evaluate('(()=>{const v=document.querySelector("#watch video");return {frames:v.getVideoPlaybackQuality().totalVideoFrames,paused:v.paused,fit:getComputedStyle(v).objectFit,width:v.videoWidth,height:v.videoHeight,loop:v.loop,muted:v.muted,error:v.error?.message}})()'),v=>v.frames>2&&!v.paused,30000,"Playback frames advance");
  assert.equal(report.playback.fit,"contain"); assert.equal(report.playback.loop,true);
  report.safeAreas=[];
  for(const [width,height,bottom,left,right,name]of [[390,844,34,0,0,"phone-player"],[844,390,21,44,44,"phone-player-landscape"]]){
    await browser.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:true});
    await browser.send("Emulation.setSafeAreaInsetsOverride",{insets:{top:0,bottom,left,right}});
    await browser.evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
    const safe=await browser.evaluate('(()=>{const r=document.querySelector(".watch-progress").getBoundingClientRect();return{width:innerWidth,height:innerHeight,safeBottom:parseFloat(getComputedStyle(document.querySelector("#watch")).getPropertyValue("--watch-safe-bottom")),progressBottom:r.bottom,progressLeft:r.left,progressRight:r.right,hitHeight:r.height}})()');
    assert.equal(safe.safeBottom,bottom);assert(safe.progressBottom<=height-bottom-18);assert(safe.hitHeight>=44);
    assert(safe.progressLeft>=left);assert(safe.progressRight<=width-right);
    report.safeAreas.push(safe);await screenshot(name);
  }
  await browser.send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await browser.send("Emulation.setSafeAreaInsetsOverride",{insets:{top:0,bottom:34,left:0,right:0}});
  await browser.evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
  const pointer=(type,x,y)=>browser.send("Input.dispatchTouchEvent",{type:type==="mousePressed"?"touchStart":type==="mouseMoved"?"touchMove":"touchEnd",touchPoints:type==="mouseReleased"?[]:[{x,y,id:7}]});
  const tap=(x,y)=>Promise.all([pointer("mousePressed",x,y),pointer("mouseReleased",x,y)]);
  report.minimalControls=await browser.evaluate('({progressBackground:getComputedStyle(document.querySelector(".watch-bottom")).backgroundImage,ratingButtons:document.querySelectorAll(".watch-actions [data-action=rating]").length,scoreInsideButton:!!document.querySelector(".watch-actions [data-action=rating] .watch-rating"),detachedScores:document.querySelectorAll(".watch-actions > .watch-rating").length})');
  assert.equal(report.minimalControls.progressBackground,"none");assert.equal(report.minimalControls.ratingButtons,1);assert.equal(report.minimalControls.scoreInsideButton,true);assert.equal(report.minimalControls.detachedScores,0);
  await click(browser,'.watch-actions [data-action="info"]');
  await wait(()=>browser.evaluate('document.querySelector(".watch-prompt")?.textContent.startsWith("PRIVATE PROMPT")'),"Prompt info loads");
  report.promptInfo=await browser.evaluate('({literalText:document.querySelector(".watch-prompt").textContent.includes("<script>"),noScript:!document.querySelector(".prompt-body script")&&typeof window.__lanPromptExecuted==="undefined",scrollable:document.querySelector(".watch-prompt").scrollHeight>document.querySelector(".watch-prompt").clientHeight,paused:document.querySelector("#watch video").paused})');
  assert.equal(report.promptInfo.literalText,true);assert.equal(report.promptInfo.noScript,true);assert.equal(report.promptInfo.scrollable,true);assert.equal(report.promptInfo.paused,true);
  await screenshot("phone-prompt");
  await click(browser,'dialog [data-action="close"]');
  await wait(()=>browser.evaluate('!document.querySelector("dialog[open]")&&!document.querySelector("#watch video").paused'),"Prompt close restores playback");
  await tap(195,834);
  assert.equal(await browser.evaluate('document.querySelector("#watch").classList.contains("immersive")'),false);
  await tap(195,422);
  await wait(()=>browser.evaluate('document.querySelector("#watch video").paused'),"Center pause");
  await click(browser,'[data-action="play"]');
  await wait(()=>browser.evaluate('!document.querySelector("#watch video").paused&&!document.querySelector("#watch").classList.contains("paused")'),"Resume before hold");
  await browser.evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
  await pointer("mousePressed",195,422);
  await wait(()=>browser.evaluate('document.querySelector("#watch video").playbackRate===2'),"Hold fast-forward");
  await pointer("mouseReleased",195,422);
  assert.equal(await browser.evaluate('document.querySelector("#watch video").playbackRate'),1);
  await tap(80,250);
  assert.equal(await browser.evaluate('document.querySelector("#watch").classList.contains("immersive")'),true);
  assert.equal(await browser.evaluate('[...document.querySelectorAll(".watch-chrome")].every(e=>e.inert)'),true);
  await tap(80,250);
  await click(browser,'.watch-actions [data-action="favorite"]');
  await wait(()=>studio.evaluate('window.studio.getState().then(s=>s.history[0].favorite===false)'),"Favorite persists into desktop");
  await click(browser,'.watch-actions [data-action="rating"]');
  assert.equal(await browser.evaluate('!!document.querySelector("dialog.rating-popover[open]")'),true);
  await screenshot("phone-rating");
  await click(browser,'dialog label:has(input[value="3.5"])'); await click(browser,'dialog [type="submit"]');
  await wait(()=>studio.evaluate('window.studio.getState().then(s=>s.history[0].rating===3.5)'),"Half-star persists");
  await wait(()=>browser.evaluate('!document.querySelector("dialog[open]")'),"Rating sheet closes");
  await click(browser,'.watch-actions [data-action="tags"]');
  await click(browser,'dialog .tag-entry'); await browser.send("Input.insertText",{text:"LAN checked"}); await click(browser,'dialog [type="submit"]');
  await wait(()=>studio.evaluate('window.studio.getState().then(s=>s.history[0].tags.includes("LAN checked"))'),"Tags persist");
  await wait(()=>browser.evaluate('!document.querySelector("dialog[open]")'),"Tag sheet closes");
  // Queue ordered events together: hidden Chromium acknowledgements can take
  // >350ms per event, which would otherwise turn a synthetic swipe into a hold.
  await Promise.all([pointer("mousePressed",195,650),pointer("mouseMoved",195,350),pointer("mouseReleased",195,350)]);
  await wait(()=>browser.evaluate('document.querySelector(".watch-count").textContent==="2 / 120"'),"Swipe next");
  await click(browser,'.watch-actions [data-action="info"]');
  await wait(()=>browser.evaluate('document.querySelector(".watch-prompt")?.textContent==="未保存 Prompt 文本"'),"Empty prompt state");
  await click(browser,'dialog [data-action="close"]');
  await wait(()=>browser.evaluate('!document.querySelector("dialog[open]")'),"Empty prompt closes");
  assert.equal(await browser.evaluate('document.querySelectorAll("#watch video").length'),1);
  report.gesturesAndCuration=true;
  await click(browser,'.watch-top [data-action="back"]');
  await wait(()=>browser.evaluate('document.querySelector("#watch").hidden'),"Back to wall");
  await click(browser,'.library-tools [data-action="filter"]');
  await click(browser,'dialog input[name="favorite"]'); await click(browser,'dialog [type="submit"]');
  await wait(()=>browser.evaluate('document.querySelector("#library-status").textContent===""&&document.querySelectorAll(".media-tile").length>0'),"Filtered wall");
  await click(browser,'.media-tile[data-index="0"]');
  await wait(()=>browser.evaluate('document.querySelector(".watch-count").textContent==="1 / 29"'),"Favorite filter changes sequence");
  await click(browser,'.watch-top [data-action="back"]'); await wait(()=>browser.evaluate('document.querySelector("#watch").hidden'),"Filtered return");
  report.filter=true;
  await click(browser,'.library-tools [data-action="layout"]');
  await wait(()=>browser.evaluate('document.querySelector(".media-tile").classList.contains("album")'),"Album layout frame");
  report.phoneAlbum=await browser.evaluate('({columns:new Set([...document.querySelectorAll(".media-tile")].map(e=>Math.round(e.getBoundingClientRect().x))).size,fit:getComputedStyle(document.querySelector(".media-tile img")).objectFit})');
  assert.equal(report.phoneAlbum.columns,4);assert.equal(report.phoneAlbum.fit,"cover");
  await screenshot("phone-album");
  await browser.send("Emulation.setDeviceMetricsOverride",{width:320,height:700,deviceScaleFactor:1,mobile:true});
  await browser.evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
  report.narrowAlbum=await browser.evaluate('({columns:new Set([...document.querySelectorAll(".media-tile")].map(e=>Math.round(e.getBoundingClientRect().x))).size,overflow:document.documentElement.scrollWidth>innerWidth})');
  assert.equal(report.narrowAlbum.columns,3);assert.equal(report.narrowAlbum.overflow,false);
  await browser.send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await click(browser,'.library-tools [data-action="layout"]');
  await wait(()=>browser.evaluate('!document.querySelector(".media-tile").classList.contains("album")'),"Return to masonry");
  const restored=await browser.evaluate('({columns:new Set([...document.querySelectorAll(".media-tile")].map(e=>Math.round(e.getBoundingClientRect().x))).size,fit:getComputedStyle(document.querySelector(".media-tile img")).objectFit})');
  assert.equal(restored.columns,2);assert.equal(restored.fit,"contain");
  await click(browser,'.library-tools [data-action="layout"]');
  await wait(()=>browser.evaluate('document.querySelector(".media-tile").classList.contains("album")'),"Switch to album again");
  report.sizes=[];
  for(const [width,height,name]of [[820,1180,"ipad-portrait"],[1180,820,"ipad-landscape"],[1440,900,"desktop"]]) {
    await browser.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<1400});
    await wait(()=>browser.evaluate(`innerWidth===${width}`),"Resize");
    await browser.evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
    const size=await browser.evaluate('({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,columns:new Set([...document.querySelectorAll(".media-tile")].map(e=>Math.round(e.getBoundingClientRect().x))).size})');
    assert.equal(size.overflow,false); report.sizes.push(size); await screenshot(name);
  }
  await studio.evaluate('document.querySelector("[data-lan-panel]").scrollIntoView()');
  await click(studio,"#lan-browser-enabled");
  await pollUntil(()=>studio.evaluate("window.studio.getLanBrowserStatus()"),v=>v.state==="off",30000,"Switch stops listener");
  await assert.rejects(fetch(local)); report.stop=true;
  await click(studio,"#lan-browser-enabled"); await pollUntil(()=>studio.evaluate("window.studio.getLanBrowserStatus()"),v=>v.state==="running",30000,"Restart listener");
  const persisted=JSON.parse(await fs.readFile(statePath,"utf8"));
  assert.equal(persisted.history[0].rating,3.5); assert.equal(persisted.history[0].favorite,false); assert(persisted.history[0].tags.includes("LAN checked")); assert.equal(persisted.queue.length,0);
  report.persisted=true;
  // Leave the owned app available for an explicit native-close verification step.
  report.ok=true;
} catch(error) { report.error=error.stack; process.exitCode=1; }
finally {
  browser?.close(); studio?.close();
  await fs.writeFile(path.join(directory,"report.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}
