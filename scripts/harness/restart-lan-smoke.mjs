// Verify saved sharing and curation after a genuine process restart.
import fs from "node:fs/promises";
import path from "node:path";
import { openSync, closeSync } from "node:fs";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { connectApp, pollUntil } from "../app-harness.mjs";
const root=path.resolve(import.meta.dirname,"../..");
const directory=path.resolve(process.argv[2]??"");
if(!/^lan-smoke-[^\\/]+$/.test(path.relative(path.join(root,"temp"),directory)))throw Error("Expected LAN smoke fixture");
const manifest=JSON.parse(await fs.readFile(path.join(directory,"launch.json"),"utf8"));
if(manifest.evidence!=="isolated-real-app-and-browser"||path.resolve(manifest.directory)!==directory)throw Error("Mismatched fixture");
async function coverSnapshot(){
  const cache=path.join(directory,"user-data","history-covers","v3");
  const files=(await fs.readdir(cache).catch(()=>[])).filter(name=>/\.(jpg|json)$/.test(name));
  return Object.fromEntries(await Promise.all(files.map(async name=>{const s=await fs.stat(path.join(cache,name));return[name,[s.size,s.mtimeMs]];})));
}
const before=await coverSnapshot();
await promisify(execFile)(process.execPath,[path.join(root,"scripts/harness/close-lan-smoke.mjs"),directory]);
const env={...process.env}; delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
for(const key of ["APPDATA","LOCALAPPDATA","TEMP","TMP"])env[key]=path.join(directory,key.toLowerCase());
const log=openSync(path.join(directory,"app.log"),"a");
const child=spawn(createRequire(import.meta.url)("electron"),["--remote-debugging-address=127.0.0.1",`--remote-debugging-port=${manifest.port}`,`--user-data-dir=${path.join(directory,"user-data")}`,root],{cwd:root,env,detached:true,windowsHide:true,stdio:["ignore",log,log]}); closeSync(log);child.unref();
await fs.writeFile(path.join(directory,"launch.json"),JSON.stringify({...manifest,appPid:child.pid,previousPid:manifest.appPid,restartedAt:new Date().toISOString()},null,2));
let client;
try{
  client=await pollUntil(async()=>{try{return await connectApp({port:manifest.port,timeout:3000,target:""});}catch{return null;}},Boolean,30000,"Restarted app");
  const status=await pollUntil(()=>client.evaluate("window.studio.getLanBrowserStatus()"),s=>s.state==="running",30000,"Saved enabled switch starts listener");
  const state=await client.evaluate('window.studio.getState().then(s=>({enabled:s.settings.lanBrowserEnabled,port:s.settings.lanBrowserPort,first:{favorite:s.history[0].favorite,rating:s.history[0].rating,tags:s.history[0].tags},count:s.history.length,queue:s.queue.length}))');
  assert.equal(state.enabled,true);assert.equal(state.port,manifest.webPort);assert.equal(state.first.favorite,false);assert.equal(state.first.rating,3.5);assert(state.first.tags.includes("LAN checked"));assert.equal(state.count,120);assert.equal(state.queue,0);
  assert.equal((await fetch(status.localUrl)).status,200);
  const library=await(await fetch(new URL("api/v1/videos",status.localUrl))).json();
  const coverResponses=await Promise.all(library.items.slice(0,2).map(async item=>{const r=await fetch(new URL(item.coverUrl,status.localUrl));await r.arrayBuffer();return r.status;}));
  assert.deepEqual(coverResponses,[200,200]);
  await client.send("Emulation.setFocusEmulationEnabled",{enabled:true});
  await client.evaluate('window.__historyMediaBenchmark={metrics:{},count(name,n=1){this.metrics[name]=(this.metrics[name]||0)+n},set(name,n){this.metrics[name]=n},max(name,n){this.metrics[name]=Math.max(this.metrics[name]||0,n)}}');
  const point=await client.evaluate('(()=>{const r=document.querySelector("button.nav-button[data-page=history]").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');
  await client.send("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,...point});
  await client.send("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",clickCount:1,...point});
  await pollUntil(()=>client.evaluate('document.querySelectorAll("[data-history-cover-cached=true]").length'),n=>n>=2,20000,"Restarted desktop cache hits");
  const desktopCache=await client.evaluate('window.__historyMediaBenchmark.metrics');
  const after=await coverSnapshot();
  const diskUnchanged=Object.entries(before).every(([name,value])=>JSON.stringify(value)===JSON.stringify(after[name]));
  assert.equal(diskUnchanged,true);assert(desktopCache.coverHits>=2);assert.equal(desktopCache.sourceVideoLoads??0,0);
  await fs.writeFile(path.join(directory,"restart.json"),JSON.stringify({ok:true,state,serviceRunning:true,coverResponses,diskUnchanged,desktopCache},null,2));console.log(JSON.stringify({ok:true,restarted:true,directory,pid:child.pid,coverResponses,diskUnchanged,desktopCache}));
}finally{client?.close();}
