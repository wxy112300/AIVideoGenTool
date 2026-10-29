// Isolated CPU/browser journey. Requires a built tool, repository Electron and ffmpeg; never reads user state.
import fs from "node:fs/promises";
import { openSync, closeSync } from "node:fs";
import path from "node:path";
import net from "node:net";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { AppCdpClient, pollUntil } from "../../scripts/app-harness.mjs";

const execute = promisify(execFile), root = path.resolve(import.meta.dirname, "../..");
const v2 = process.argv.includes("--v2"), libraryId = randomUUID();
const libraryDirectory = v2 ? `StudioLibrary/${libraryId}` : "StudioLibrary";
const directory = path.join(root, "temp", `nas-browser-smoke-${Date.now()}`);
const pc = path.join(directory, "pc"), nas = path.join(directory, "nas"), cache = path.join(directory, "history-covers/v3");
const pcLibrary = path.join(directory, "pc-documents"), nasLibrary = path.join(directory, "nas-documents");
await Promise.all([pc, nas, cache, pcLibrary, nasLibrary].map((p) => fs.mkdir(p, { recursive: true })));
const sha = (v) => createHash("sha256").update(v).digest("hex");
const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer(); s.on("error", reject); s.listen(0, "127.0.0.1", () => { const port = s.address().port; s.close(() => resolve(port)); });
});
const port = await freePort(); let browserPort = await freePort(); while (browserPort === port) browserPort = await freePort();
const base = `http://127.0.0.1:${port}`, state = { history: [], settings: { uiLocale: "zh-CN" } };
for (const [name, size] of [["portrait", "360x640"], ["landscape", "640x360"], ["square", "480x480"]]) {
  await execute("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `testsrc2=size=${size}:rate=12`, "-t", "4", "-an", "-c:v", "libx264", "-threads", "1", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path.join(pc, `${name}.mp4`)]);
  await execute("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-i", path.join(pc, `${name}.mp4`), "-frames:v", "1", path.join(directory, `${name}.jpg`)]);
}
for (let i = 0; i < 18; i++) {
  const name = ["portrait", "landscape", "square"][i % 3], filename = `${name}.mp4`, absolutePath = path.join(pc, filename);
  const [width, height] = name === "portrait" ? [360, 640] : name === "landscape" ? [640, 360] : [480, 480];
  const createdAt = new Date(Date.UTC(2026, 9, 27, 0, 0, 100 - i)).toISOString();
  const file = { filename, absolutePath, subfolder: "", type: "output" };
  const version = { id: `v${i}`, createdAt, width, height, duration: 4, files: [file] };
  state.history.push({ id: `a${i}`, title: `Fixture ${i}`, createdAt, updatedAt: createdAt, modelId: "minimax_h3_fl2va", tags: [i % 2 ? "city" : "nature"], duration: 4,
    defaultVersionId: version.id, versions: [version], prompt: "<script>window.__nasPromptExecuted=true</script>\n" + "A scene in natural light.\n".repeat(20), favorite: i % 2 === 0, rating: i % 2 === 0 ? 4.5 : 2 });
  const key = ["history-cover-v3", `a${i}`, version.id, createdAt, filename, absolutePath].join(":"), stat = await fs.stat(absolutePath);
  await fs.copyFile(path.join(directory, `${name}.jpg`), path.join(cache, `${sha(key)}.jpg`));
  await fs.writeFile(path.join(cache, `${sha(key)}.json`), JSON.stringify({ sourceSize: stat.size, sourceMtimeMs: stat.mtimeMs }));
}
const stateFile = path.join(directory, "studio-state.json"), exportConfig = path.join(directory, "export.json"), config = path.join(directory, "server.json");
await fs.writeFile(stateFile, JSON.stringify(state));
await fs.writeFile(exportConfig, JSON.stringify({ stateFile, outputRoot: pc, libraryRoot: pcLibrary, libraryDirectory, coversDirectory: cache }));
await fs.writeFile(config, JSON.stringify({ mediaRoot: nas, libraryRoot: nasLibrary, libraryDirectory, ...(v2 ? { dataDirectory: path.join(directory, "nas-data") } : {}), host: "127.0.0.1", port, pollSeconds: 1, allowedOrigins: [base] }));
const processes = [], env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
function launch(command, args, name) {
  const fd = openSync(path.join(directory, `${name}.log`), "a");
  const child = spawn(command, args, { cwd: root, env, windowsHide: true, stdio: ["ignore", fd, fd] }); closeSync(fd);
  processes.push(child); return child;
}
const report = { ok: false, directory, protocol: v2 ? 2 : 1, physicalDevices: false, docker: false, focusEmulation: true, checks: [] };
let browser;
const wait = (expression, label) => pollUntil(() => browser.evaluate(expression), Boolean, 15000, label, 80);
async function click(selector) {
  const p = await browser.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled||!e.getClientRects().length)throw Error('Unavailable: '+${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await browser.send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...p });
  await browser.send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...p });
}
async function screenshot(name) { const shot = await browser.send("Page.captureScreenshot", { format: "png" }); await fs.writeFile(path.join(directory, `${name}.png`), Buffer.from(shot.data, "base64")); }
try {
  launch(process.execPath, ["Tools/NasBrowser/dist/runtime/server.mjs", "--config", config], "server");
  await pollUntil(async () => { try { return (await fetch(`${base}/healthz`)).status === 503; } catch { return false; } }, Boolean, 10000, "Waiting for library");
  const electron = createRequire(import.meta.url)("electron");
  launch(electron, ["--remote-debugging-address=127.0.0.1", `--remote-debugging-port=${browserPort}`, `--user-data-dir=${path.join(directory, "browser-profile")}`, "scripts/harness/lan-browser-window.cjs", base], "browser");
  browser = await pollUntil(async () => {
    try { const targets = await (await fetch(`http://127.0.0.1:${browserPort}/json/list`)).json(); const target = targets.find((t) => t.type === "page" && t.url.startsWith(base)); if (!target) return null; const c = new AppCdpClient(target.webSocketDebuggerUrl); await c.connect(); return c; } catch { return null; }
  }, Boolean, 15000, "Owned browser");
  await browser.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await browser.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await browser.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, bottom: 34, left: 0, right: 0 } });
  await wait('!!document.querySelector("#boot-retry")', "Missing-index recovery button");
  if (v2) {
    const { exportLibrary } = await import("../../dist/electron/src/infrastructure/nas-exporter.js");
    const { publishNasCommit } = await import("../../dist/electron/src/infrastructure/nas-commit.js");
    const exported = await exportLibrary(JSON.parse(await fs.readFile(exportConfig, "utf8")), state, (target, catalog) => publishNasCommit(target, catalog, libraryId));
    assert.equal(exported.covers, 18);
  } else {
    const exported = await execute(process.execPath, ["Tools/NasBrowser/dist/runtime/export.mjs", "--config", exportConfig], { cwd: root });
    assert.equal(JSON.parse(exported.stdout).covers, 18);
  }
  await fs.cp(path.join(pcLibrary, "StudioLibrary"), path.join(nasLibrary, "StudioLibrary"), { recursive: true });
  await pollUntil(async () => { const r = await fetch(`${base}/healthz`); return r.ok && (await r.json()).count === 0; }, Boolean, 10000, "Index arrived before video");
  for (const name of ["portrait", "landscape", "square"]) await fs.copyFile(path.join(pc, `${name}.mp4`), path.join(nas, `${name}.mp4`));
  await pollUntil(async () => { const r = await fetch(`${base}/healthz`); return r.ok && (await r.json()).count === 18; }, Boolean, 10000, "Media completed sync");
  await click("#boot-retry");
  await wait('document.querySelectorAll(".media-tile").length>0&&document.querySelector(".media-tile img").naturalWidth>0', "Warm cached cover");
  assert.equal(await browser.evaluate("typeof window.studio"), "undefined");
  assert.equal(await browser.evaluate('document.querySelectorAll(".library-header select").length'), 0);
  assert.ok(await browser.evaluate('document.querySelector(".media-tile .tile-meta").textContent.includes("4.5")'));
  assert.equal(await browser.evaluate('(()=>{const es=[...document.querySelectorAll(".media-tile")];return new Set(es.slice(0,2).map(e=>e.style.transform)).size})()'), 2);
  const ratio = await browser.evaluate('(()=>{const e=document.querySelector(".media-tile");return e.offsetHeight/e.offsetWidth})()');
  assert.ok(Math.abs(ratio - 640 / 360) < .03);
  await screenshot("phone-masonry");
  report.checks.push("independent Documents/media roots on PC/NAS; missing index → actual retry → sync completes → cached covers; original-ratio phone masonry");
  await click('[data-action="filter"]');
  await wait('!!document.querySelector("dialog[open]")', "Filters");
  const footerPosition = await browser.evaluate('(()=>{const d=document.querySelector(".filter-sheet"),f=d.querySelector("footer"),b=d.querySelector(".filter-fields");return {top:f.getBoundingClientRect().top,bottom:f.getBoundingClientRect().bottom,dialogBottom:d.getBoundingClientRect().bottom,scrollable:b.scrollHeight>b.clientHeight,paddingBottom:parseFloat(getComputedStyle(f).paddingBottom)}})()');
  assert.ok(footerPosition.scrollable); assert.ok(footerPosition.bottom <= 844); assert.ok(footerPosition.paddingBottom >= 54);
  for (const fraction of [0, .5, 1]) {
    const pinned = await browser.evaluate(`(()=>{const d=document.querySelector('.filter-sheet'),b=d.querySelector('.filter-fields');b.scrollTop=(b.scrollHeight-b.clientHeight)*${fraction};const r=d.querySelector('footer').getBoundingClientRect();return {top:r.top,buttons:[...d.querySelectorAll('footer button')].every(e=>{const b=e.getBoundingClientRect();return e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))})}})()`);
    assert.ok(Math.abs(pinned.top-footerPosition.top)<1); assert.ok(pinned.buttons);
  }
  await screenshot("phone-filter-actions");
  assert.equal(await browser.evaluate('document.querySelectorAll("dialog [name=favorite],dialog [name=minRating],dialog [name=maxRating],dialog option[value^=rating]").length'), 5);
  await click('dialog [name="favorite"]');
  await browser.evaluate('document.querySelector("dialog [name=minRating]").value="4";document.querySelector("dialog [name=sort]").value="rating-desc"');
  await click('dialog button[type="submit"]');
  await wait('document.querySelectorAll(".media-tile").length>0&&new URL(location.href).searchParams.get("q")?.includes("rating-desc")', "Favorite/rating filter applied");
  const filtered = await browser.evaluate('fetch("/api/v1/videos?q="+encodeURIComponent(new URL(location.href).searchParams.get("q"))).then(r=>r.json())');
  assert.equal(filtered.total, 9); assert.ok(filtered.items.every(item => item.favorite && item.rating === 4.5));
  await click('[data-action="filter"]');
  await screenshot("phone-filters");
  await browser.evaluate('document.querySelector("dialog [name=minDuration]").value="9"');
  await click('dialog button[type="submit"]'); await wait('document.querySelectorAll(".media-tile").length===0', "No results");
  await click('[data-action="filter"]'); await click("dialog [data-reset]"); await click('dialog button[type="submit"]');
  await wait('document.querySelectorAll(".media-tile").length>0', "Filter recovery");
  await click('[data-action="layout"]');
  await wait('!!document.querySelector(".media-tile.album")', "Album");
  const albumColumns = await browser.evaluate('(()=>{const wall=document.querySelector("#media-wall"),tile=wall.querySelector(".media-tile");return Math.round((wall.clientWidth+6)/(parseFloat(tile.style.width)+6))})()');
  assert.equal(albumColumns, 4); await screenshot("phone-album");
  await click('.media-tile[data-index="0"]');
  await wait('document.querySelector("#watch video").videoWidth>0&&!document.querySelector("#watch video").paused', "Decoded playback");
  assert.equal(await browser.evaluate('document.querySelectorAll(".watch-actions [data-action=favorite]:disabled,.watch-actions [data-action=rating]:disabled").length'), 2);
  assert.equal(await browser.evaluate('document.querySelectorAll(".watch-actions [data-action=tags]").length'), 0);
  assert.equal(await browser.evaluate('document.querySelector(".watch-actions [data-action=favorite]").getAttribute("aria-pressed")'), "true");
  assert.equal(await browser.evaluate('document.querySelector(".watch-rating").textContent'), "4.5");
  assert.ok(await browser.evaluate('document.querySelector(".watch-tags").textContent.includes("nature")'));
  await browser.evaluate('document.querySelector(".watch-actions [data-action=favorite]").click();document.querySelector(".watch-actions [data-action=rating]").click()');
  assert.equal(await browser.evaluate('document.querySelectorAll("dialog[open]").length'), 0);
  assert.equal(await browser.evaluate('getComputedStyle(document.querySelector("#watch video")).objectFit'), "contain");
  const frames = await browser.evaluate('document.querySelector("#watch video").getVideoPlaybackQuality().totalVideoFrames');
  await wait(`document.querySelector("#watch video").getVideoPlaybackQuality().totalVideoFrames>${frames+3}`, "Frames advance");
  await wait('(()=>{const r=document.querySelector("[data-seek]").getBoundingClientRect();return innerHeight-r.bottom>=52})()', "Safe area after player enter transition");
  const safe = await browser.evaluate('(()=>{const r=document.querySelector("[data-seek]").getBoundingClientRect();return innerHeight-r.bottom})()'); assert.ok(safe >= 52);
  await screenshot("phone-player"); await click('[data-action="info"]');
  await wait('document.querySelector(".info-sheet")?.textContent.includes("<script>")', "Prompt plaintext");
  assert.equal(await browser.evaluate("window.__nasPromptExecuted===true"), false);
  await screenshot("prompt"); await click('.info-sheet [data-action="close"]');
  await click('.watch-top [data-action="back"]'); await wait('document.querySelector("#watch").hidden', "Return to album");
  assert.equal(await browser.evaluate('!!document.querySelector(".media-tile.album")'), true);
  await click('[data-action="layout"]');
  for (const [width, height, label] of [[768, 1024, "ipad-portrait"], [1024, 768, "ipad-landscape"], [1440, 900, "desktop"]]) {
    await browser.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true });
    await wait('document.querySelector("#media-wall").clientWidth>600', label);
    await browser.evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
    const columns = await browser.evaluate('(()=>{const wall=document.querySelector("#media-wall"),tile=wall.querySelector(".media-tile");return Math.round((wall.clientWidth+6)/(parseFloat(tile.style.width)+6))})()');
    assert.ok(columns >= 3); await screenshot(label);
    await click('[data-action="filter"]');
    const footerVisible = await browser.evaluate('(()=>{const d=document.querySelector(".filter-sheet"),b=d.querySelector(".filter-fields");b.scrollTop=b.scrollHeight;return [...d.querySelectorAll("footer button")].every(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})})()');
    assert.ok(footerVisible); await click('dialog [data-action="cancel"]');
  }
  report.checks.push("actual favorite/rating filters and rating sort in Filter only; empty/reset; favorite/rating badges and disabled player status; tags visible with no editing; four-column album; contain playback with advancing frames; safe area; plain-text Prompt; return; iPad orientations");
  report.ok = true;
} catch (error) {
  report.error = error.stack;
  if (browser) {
    try {
      report.diagnostic = await browser.evaluate('(()=>{const v=document.querySelector("#watch video");return {url:location.href,watchHidden:document.querySelector("#watch")?.hidden,video:v&&{src:v.currentSrc,readyState:v.readyState,networkState:v.networkState,paused:v.paused,error:v.error?.message},body:document.body.innerText.slice(-1200)}})()');
      await screenshot("failure");
    } catch { /* Preserve the original failure if the browser has exited. */ }
  }
  throw error;
} finally {
  if (browser) { try { await browser.send("Browser.close"); } catch {} browser.close(); }
  for (const child of processes.reverse()) {
    if (child.exitCode !== null) continue;
    child.kill();
    await Promise.race([new Promise((r) => child.once("exit", r)), new Promise((r) => setTimeout(r, 3000))]);
    if (child.exitCode === null && child.signalCode === null) throw new Error(`Owned process did not exit: ${child.pid}`);
  }
  await fs.writeFile(path.join(directory, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
