// Real desktop cold-cover queue, page departure, durable cache and restart. CPU-only fixture.
import fs from "node:fs/promises";
import { openSync, closeSync } from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { connectApp, pollUntil } from "../app-harness.mjs";
import { createDefaultState } from "../../dist/electron/src/core/defaults.js";
const root=path.resolve(import.meta.dirname,"../.."), seed=path.resolve(process.argv[2]??"");
if(!/^lan-smoke-[^\\/]+$/.test(path.relative(path.join(root,"temp"),seed)))throw Error("Expected owned LAN seed fixture");
const source=JSON.parse(await fs.readFile(path.join(seed,"launch.json"),"utf8"));
if(source.evidence!=="isolated-real-app-and-browser"||path.resolve(source.directory)!==seed)throw Error("Mismatched seed");
const directory=await fs.mkdtemp(path.join(root,"temp","lan-smoke-cover-queue-"));
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,"127.0.0.1",r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
const port=await freePort(),webPort=await freePort(),browserPort=await freePort();
const userData=path.join(directory,"user-data"), videoDir=path.join(directory,"video");
await fs.mkdir(userData,{recursive:true});await fs.mkdir(videoDir,{recursive:true});
for(const name of ["portrait","landscape","square"])await fs.copyFile(path.join(seed,"video",`${name}.mp4`),path.join(videoDir,`${name}.mp4`));
const state=createDefaultState();Object.assign(state.settings,{comfyUrl:"http://192.0.2.1:9",comfyDirectory:"",comfyPythonPath:"",uiLocale:"zh-CN",lanBrowserEnabled:false,lanBrowserPort:webPort,outputDirectory:videoDir,autoRetryFailedTasks:false});
const seeded=JSON.parse(await fs.readFile(path.join(seed,"user-data","studio-state.json"),"utf8"));
state.history=seeded.history.slice(0,18).map(asset=>{const a=structuredClone(asset);a.files.forEach(f=>{f.absolutePath=path.join(videoDir,f.filename);});a.versions.forEach(v=>v.files.forEach(f=>{f.absolutePath=path.join(videoDir,f.filename);}));return a;});
await fs.writeFile(path.join(userData,"studio-state.json"),JSON.stringify(state));
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;
for(const key of ["APPDATA","LOCALAPPDATA","TEMP","TMP"]){env[key]=path.join(directory,key.toLowerCase());await fs.mkdir(env[key],{recursive:true});}
const execute=promisify(execFile), electron=createRequire(import.meta.url)("electron");
async function launch(){const log=openSync(path.join(directory,"app.log"),"a");const p=spawn(electron,["--remote-debugging-address=127.0.0.1",`--remote-debugging-port=${port}`,`--user-data-dir=${userData}`,root],{cwd:root,env,detached:true,windowsHide:true,stdio:["ignore",log,log]});closeSync(log);p.unref();await fs.writeFile(path.join(directory,"launch.json"),JSON.stringify({evidence:"isolated-real-app-and-browser",directory,appPid:p.pid,port,webPort,browserPort},null,2));return pollUntil(async()=>{try{return await connectApp({port,timeout:2000,target:""});}catch{return null;}},Boolean,30000,"Queue fixture app");}
async function click(client,selector){await pollUntil(()=>client.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return !!e&&!e.disabled&&e.getClientRects().length>0})()`),Boolean,15000,`Available ${selector}`);const rect=await client.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await client.send("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,...rect});await client.send("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",clickCount:1,...rect});}
const hook='window.__historyMediaBenchmark={metrics:{},count(n,d=1){this.metrics[n]=(this.metrics[n]||0)+d},set(n,v){this.metrics[n]=v},max(n,v){this.metrics[n]=Math.max(this.metrics[n]||0,v)}}';
async function cacheSnapshot(){const dir=path.join(userData,"history-covers","v3");const names=(await fs.readdir(dir)).filter(n=>/\.(jpg|json)$/.test(n));return Object.fromEntries(await Promise.all(names.map(async n=>{const s=await fs.stat(path.join(dir,n));return[n,[s.size,s.mtimeMs]];})));}
const report={ok:false,directory,physicalDevices:false,focusEmulation:true};let client;
try{
  client=await launch();await client.send("Emulation.setFocusEmulationEnabled",{enabled:true});await client.evaluate(hook);
  await click(client,'button.nav-button[data-page="history"]');
  await pollUntil(()=>client.evaluate('window.__historyMediaBenchmark.metrics.sourceVideoLoads||0'),Boolean,15000,"Cold producer starts",30);
  await client.evaluate('window.scrollTo(0,document.documentElement.scrollHeight)');
  await client.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  await click(client,'button.nav-button[data-page="create"]');
  report.departed=await client.evaluate('!document.querySelector("[data-history-media]")');assert.equal(report.departed,true);
  report.atDeparture=await client.evaluate('({...window.__historyMediaBenchmark.metrics})');
  const accepted=report.atDeparture.coverLookups||0;assert(accepted>=2);assert((report.atDeparture.coverSaves||0)<accepted);
  report.background=await pollUntil(()=>client.evaluate('({...window.__historyMediaBenchmark.metrics,historyVisible:!!document.querySelector("[data-history-media]")})'),m=>(m.coverSaves||0)>=accepted,45000,"Off-page covers finish and save",100);
  assert.equal(report.background.historyVisible,false);assert.equal(report.background.canceledRequests??0,0);assert.equal(report.background.sourceVideoLoads,report.background.coverSaves);
  const before=await cacheSnapshot();assert(Object.keys(before).filter(n=>n.endsWith(".jpg")).length>=accepted);
  await click(client,'button.nav-button[data-page="history"]');
  await pollUntil(()=>client.evaluate('document.querySelectorAll("[data-history-cover-cached=true]").length'),n=>n>=2,15000,"Return reuses covers");
  report.returned=await client.evaluate('window.__historyMediaBenchmark.metrics');assert(report.returned.coverHits>=2);
  // Let any newly visible cards also finish before comparing restart output.
  await pollUntil(()=>client.evaluate('window.__historyMediaBenchmark.metrics'),m=>(m.sourceVideoLoads||0)===(m.coverSaves||0),20000,"Queue drains");
  const durable=await cacheSnapshot();client.close();client=null;
  await execute(process.execPath,[path.join(root,"scripts/harness/close-lan-smoke.mjs"),directory]);
  client=await launch();await client.send("Emulation.setFocusEmulationEnabled",{enabled:true});await client.evaluate(hook);await click(client,'button.nav-button[data-page="history"]');
  await pollUntil(()=>client.evaluate('document.querySelectorAll("[data-history-cover-cached=true]").length'),n=>n>=2,15000,"Restart cached covers");
  report.restarted=await client.evaluate('window.__historyMediaBenchmark.metrics');assert.equal(report.restarted.sourceVideoLoads??0,0);assert(report.restarted.coverHits>=2);
  const after=await cacheSnapshot();assert(Object.entries(durable).every(([n,v])=>JSON.stringify(v)===JSON.stringify(after[n])));report.diskPreserved=true;
  await click(client,'[data-open-history]');await pollUntil(()=>client.evaluate('!!document.querySelector("#history-player video")'),Boolean,10000,"History detail");
  await pollUntil(()=>client.evaluate('document.querySelector("#history-player video").readyState>=3'),Boolean,10000,"Detail ready");
  await client.evaluate('new Promise(r=>setTimeout(r,200))');
  if(await client.evaluate('document.querySelector("#history-player video").paused'))await click(client,'#history-player media-play-button');
  report.detail=await pollUntil(()=>client.evaluate('(()=>{const v=document.querySelector("#history-player video");return {frames:v.getVideoPlaybackQuality().totalVideoFrames,paused:v.paused}})()'),v=>v.frames>2&&!v.paused,15000,"Detail decodes");
  await click(client,'button.nav-button[data-page="history"]');report.ok=true;
}catch(error){report.error=error.stack;process.exitCode=1;}
finally{await client?.send("Fetch.disable").catch(()=>{});client?.close();await fs.writeFile(path.join(directory,"cover-queue.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
