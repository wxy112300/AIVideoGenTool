// Additional touch/performance checks against an owned LAN fixture; no user library writes.
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { AppCdpClient, connectApp, pollUntil } from "../app-harness.mjs";
const root = path.resolve(import.meta.dirname, "../..");
const directory = path.resolve(process.argv[2] ?? "");
if (!/^lan-smoke-[^\\/]+$/.test(path.relative(path.join(root,"temp"),directory))) throw Error("Expected LAN fixture");
const manifest = JSON.parse(await fs.readFile(path.join(directory,"launch.json"),"utf8"));
if (manifest.evidence !== "isolated-real-app-and-browser" || path.resolve(manifest.directory) !== directory) throw Error("Mismatched fixture");
const base = `http://127.0.0.1:${manifest.webPort}/`;
const targets = await (await fetch(`http://127.0.0.1:${manifest.browserPort}/json/list`)).json();
const target = targets.find(t => t.type === "page" && t.url.startsWith(base));
if (!target) throw Error("Owned browser unavailable");
const browser = new AppCdpClient(target.webSocketDebuggerUrl); await browser.connect();
const report = { ok:false, physicalDevices:false, focusEmulation:true };
let studio;
const wait = (expression,label) => pollUntil(() => browser.evaluate(expression),Boolean,20000,label,80);
async function click(selector,client=browser) {
  const rect = await client.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled||!e.getClientRects().length)throw Error('Control unavailable');const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await client.send("Input.dispatchMouseEvent", {type:"mousePressed",button:"left",clickCount:1,...rect});
  await client.send("Input.dispatchMouseEvent", {type:"mouseReleased",button:"left",clickCount:1,...rect});
}
const touch = (type,x=195,y=422) => browser.send("Input.dispatchTouchEvent",{type,touchPoints:type==="touchEnd"?[]:[{x,y,id:12}]});
const tap = async(x,y) => { await touch("touchStart",x,y); await touch("touchEnd"); };
async function screenshot(name) { const shot=await browser.send("Page.captureScreenshot",{format:"png"});await fs.writeFile(path.join(directory,`${name}.png`),Buffer.from(shot.data,"base64")); }
async function cacheSnapshot() {
  const cache=path.join(directory,"user-data","history-covers","v3");
  const files=(await fs.readdir(cache)).filter(f=>/\.(jpg|json)$/.test(f));
  return Object.fromEntries(await Promise.all(files.map(async f=>{const s=await fs.stat(path.join(cache,f));return[f,[s.size,s.mtimeMs]];})));
}
try {
  await browser.send("Emulation.setFocusEmulationEnabled",{enabled:true});
  await browser.send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await browser.send("Emulation.setSafeAreaInsetsOverride",{insets:{top:0,bottom:34,left:0,right:0}});
  await browser.send("Emulation.setTouchEmulationEnabled",{enabled:true,maxTouchPoints:1});
  await browser.send("Page.navigate",{url:base});
  await wait('document.querySelectorAll(".media-tile").length>0',"Fresh library");
  await wait('[...document.querySelectorAll(".media-tile img")].slice(0,2).every(i=>i.naturalWidth>0)',"Warm covers");
  await browser.send("Network.enable"); await browser.send("Network.setCacheDisabled",{cacheDisabled:true});
  const paused=[];
  const intercept=event=>{const message=JSON.parse(String(event.data));if(message.method==="Fetch.requestPaused")paused.push(message.params.requestId);};
  browser.socket.addEventListener("message",intercept);
  await browser.send("Fetch.enable",{patterns:[{urlPattern:"*/media",requestStage:"Request"}]});
  await click('.media-tile[data-index="0"]');
  await pollUntil(()=>paused.length,Boolean,10000,"Delayed media request",50);
  report.loading=await browser.evaluate('({visible:!document.querySelector(".watch-loading").hidden,ring:!!document.querySelector(".loading-ring"),icon:!!document.querySelector("[data-action=sound] svg"),label:document.querySelector("[data-action=sound]").textContent.trim()})');
  assert.equal(report.loading.visible,true);assert.equal(report.loading.ring,true);assert.equal(report.loading.icon,true);assert.equal(report.loading.label,"");
  await screenshot("polish-loading");
  for(const requestId of paused)await browser.send("Fetch.continueRequest",{requestId});
  await browser.send("Fetch.disable"); browser.socket.removeEventListener("message",intercept);
  await browser.send("Network.setCacheDisabled",{cacheDisabled:false});
  await wait('document.querySelector("#watch video").readyState>=3&&!document.querySelector("#watch video").paused&&!document.querySelector("#watch").classList.contains("loading")',"Decoded playback");
  await browser.evaluate(`(()=>{const v=document.querySelector('#watch video');window.__polishEvents=[];window.__polishFrames=[];for(const n of ['seeking','loadstart','emptied','ratechange'])v.addEventListener(n,()=>window.__polishEvents.push({event:n,time:v.currentTime,at:performance.now(),rate:v.playbackRate}));let previous=performance.now();const frame=()=>{const now=performance.now();window.__polishFrames.push(now-previous);previous=now;if(window.__polishFrames.length<100)v.requestVideoFrameCallback(frame)};v.requestVideoFrameCallback(frame);})()`);
  await touch("touchStart");
  await wait('document.querySelector("#watch video").playbackRate===2',"Hold 2x");
  report.speed=await browser.evaluate(`new Promise(resolve=>{const v=document.querySelector('#watch video');const time=v.currentTime,at=performance.now();setTimeout(()=>resolve({timeBefore:time,timeDuring:v.currentTime,elapsed:(performance.now()-at)/1000,rate:v.playbackRate}),650)})`);
  await touch("touchEnd");
  const released=await browser.evaluate('(()=>{const v=document.querySelector("#watch video");return{timeAfter:v.currentTime,rateAfter:v.playbackRate,events:window.__polishEvents,frameGapMaxMs:Math.max(...window.__polishFrames)}})()');
  Object.assign(report.speed,released);
  assert.equal(released.rateAfter,1);assert.equal(report.speed.rate,2);
  assert(report.speed.timeDuring-report.speed.timeBefore>report.speed.elapsed*1.5);
  assert(released.timeAfter>=report.speed.timeDuring&&released.timeAfter-report.speed.timeDuring<.7);
  assert.equal(released.events.filter(e=>e.event!=="ratechange").length,0);
  await tap(195,422);await wait('document.querySelector("#watch video").paused',"Pause");
  await wait('document.querySelector("#watch").classList.contains("pause-hidden")',"Pause icon auto hides");
  await wait('getComputedStyle(document.querySelector(".play-button")).opacity==="0"',"Pause icon fade completes");
  await tap(80,250);
  assert.equal(await browser.evaluate('document.querySelector("#watch video").paused&&document.querySelector("#watch").classList.contains("immersive")'),true);
  await screenshot("polish-paused-clean");await tap(80,250);
  const rail=await browser.evaluate('(()=>{const r=document.querySelector(".watch-progress").getBoundingClientRect();return{x:r.x,y:r.y+r.height/2,width:r.width}})()');
  await touch("touchStart",rail.x+rail.width*.15,rail.y);
  await touch("touchMove",rail.x+rail.width*.74,rail.y);
  report.scrub=await browser.evaluate('({value:Number(document.querySelector(".watch-progress").value),active:document.querySelector("#watch").classList.contains("scrubbing"),label:document.querySelector(".watch-time").textContent})');
  assert.equal(report.scrub.active,true);assert(Math.abs(report.scrub.value-740)<3);
  await screenshot("polish-scrub");
  await touch("touchEnd");
  await wait('!document.querySelector("#watch video").seeking',"Exact final seek");
  report.scrub.final=await browser.evaluate('({time:document.querySelector("#watch video").currentTime,duration:document.querySelector("#watch video").duration,paused:document.querySelector("#watch video").paused})');
  assert(Math.abs(report.scrub.final.time/report.scrub.final.duration-.74)<.01);assert.equal(report.scrub.final.paused,true);
  await tap(195,422);await wait('!document.querySelector("#watch video").paused',"Resume after paused scrub");
  await touch("touchStart",rail.x+rail.width*.2,rail.y);await touch("touchMove",rail.x+rail.width*.4,rail.y);await touch("touchEnd");
  await wait('!document.querySelector("#watch video").paused',"Playing scrub restores playback");
  // Drag uses real touch events. The media follows before the release commits the next item.
  await Promise.all([touch("touchStart",195,650),touch("touchMove",195,440)]);
  report.swipe=await browser.evaluate('({transform:getComputedStyle(document.querySelector(".watch-stage")).transform,count:document.querySelector(".watch-count").textContent})');
  assert.equal(report.swipe.count,"1 / 120");assert(report.swipe.transform.includes("-210"));
  await screenshot("polish-swipe-drag");
  const animation=browser.evaluate('new Promise(resolve=>{const end=performance.now()+1500;const frame=()=>{if(document.querySelector(".watch-stage").getAnimations().some(a=>a.playState==="running"))resolve(true);else if(performance.now()>end)resolve(false);else requestAnimationFrame(frame)};requestAnimationFrame(frame)})');
  const ending=touch("touchEnd"); await ending;
  // Frame acknowledgements may arrive after the 240ms animation, so capture drag+final separately.
  report.swipe.animationObserved=await animation;
  assert.equal(report.swipe.animationObserved,true);
  await wait('document.querySelector(".watch-count").textContent==="2 / 120"',"Swipe commits next video");
  await wait('!document.querySelector("#watch video").paused',"Next playback");
  // Escape remains available in immersive mode; reopening starts with reachable controls.
  await tap(80,250);
  await browser.send("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
  await browser.send("Input.dispatchKeyEvent",{type:"keyUp",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
  await wait('document.querySelector("#watch").hidden',"Immersive escape returns");
  await click('.media-tile[data-index="0"]');
  await wait('!document.querySelector("#watch").hidden&&!document.querySelector("#watch").classList.contains("immersive")',"Reopened controls visible");
  assert.equal(await browser.evaluate('getComputedStyle(document.querySelector(".watch-stage")).transform'),"none");
  const returnAnimation=browser.evaluate('new Promise(resolve=>{const end=performance.now()+1500;const frame=()=>{if(document.querySelector("#watch").getAnimations().some(a=>a.playState==="running"))resolve(true);else if(performance.now()>end)resolve(false);else requestAnimationFrame(frame)};requestAnimationFrame(frame)})');
  await click('.watch-top [data-action="back"]');
  report.returnAnimation=await returnAnimation;assert.equal(report.returnAnimation,true);
  await wait('document.querySelector("#watch").hidden',"Animated return");
  report.returned=true;
  await browser.evaluate('window.scrollTo(0,innerHeight*1.5)');
  await wait('!document.querySelector(".return-top").hidden',"Back-to-top appears");
  await click('[data-action="top"]');await wait('scrollY<1',"Back-to-top scrolls");report.top=true;
  await click('[data-action="filter"]');
  report.switch=await browser.evaluate('(()=>{const e=document.querySelector("input[role=switch]");return{role:e.role,width:document.querySelector(".switch-track").getBoundingClientRect().width,checked:e.checked}})()');
  assert.equal(report.switch.width,51);await click('input[role="switch"]');
  assert.equal(await browser.evaluate('document.querySelector("input[role=switch]").checked'),true);
  await screenshot("polish-switch");await click('dialog [data-action="cancel"]');
  // Warm reads must leave the existing JPEG and metadata files untouched.
  const page=await(await fetch(`${base}api/v1/videos`)).json();
  const sample=page.items.slice(0,2);
  await pollUntil(async()=>Promise.all(sample.map(async item=>(await fetch(new URL(item.coverUrl,base))).status)).then(s=>s.every(v=>v===200)),Boolean,30000,"Saved sample covers");
  const before=await cacheSnapshot(); const started=performance.now();
  const responses=await Promise.all(sample.map(async item=>{const r=await fetch(new URL(item.coverUrl,base));await r.arrayBuffer();return r.status;}));
  const after=await cacheSnapshot();
  report.cache={warmResponses:responses,warmReadMs:performance.now()-started,existingFilesUntouched:Object.entries(before).every(([name,value])=>JSON.stringify(value)===JSON.stringify(after[name]))};
  assert.equal(report.cache.existingFilesUntouched,true);
  // Real desktop History uses the same warmed v3 cache. Count actual producer invocations.
  studio=await connectApp({port:manifest.port,timeout:10000,target:""});
  await studio.send("Emulation.setFocusEmulationEnabled",{enabled:true});
  await click('button.nav-button[data-page="create"]',studio);
  await studio.evaluate('window.__historyMediaBenchmark={metrics:{},count(name,n=1){this.metrics[name]=(this.metrics[name]||0)+n},set(name,n){this.metrics[name]=n},max(name,n){this.metrics[name]=Math.max(this.metrics[name]||0,n)}}');
  await click('button.nav-button[data-page="history"]',studio);
  await pollUntil(()=>studio.evaluate('document.querySelectorAll("[data-history-cover-cached=true]").length'),n=>n>=2,20000,"Desktop cached covers",100);
  report.desktopCache=await studio.evaluate('({...window.__historyMediaBenchmark.metrics,cached:document.querySelectorAll("[data-history-cover-cached=true]").length})');
  assert(report.desktopCache.coverHits>=2);
  report.ok=true;
} catch(error) { report.error=error.stack;process.exitCode=1; }
finally {
  await browser.send("Fetch.disable").catch(()=>{}); browser.close();studio?.close();
  await fs.writeFile(path.join(directory,"polish.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
