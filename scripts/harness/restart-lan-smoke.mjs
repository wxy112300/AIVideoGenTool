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
  await fs.writeFile(path.join(directory,"restart.json"),JSON.stringify({ok:true,state,serviceRunning:true},null,2));console.log(JSON.stringify({ok:true,restarted:true,directory,pid:child.pid}));
}finally{client?.close();}
