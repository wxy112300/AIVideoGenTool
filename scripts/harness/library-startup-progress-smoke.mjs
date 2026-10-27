// Actual startup progress and crash/retry. Entirely synthetic, no user library/runtime.
import fs from "node:fs/promises";
import { openSync, closeSync } from "node:fs";
import path from "node:path";
import net from "node:net";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { AppCdpClient, connectApp, pollUntil } from "../app-harness.mjs";
import { createDefaultState } from "../../dist/electron/src/core/defaults.js";

const root = path.resolve(import.meta.dirname, "../.."), execute = promisify(execFile), electron = createRequire(import.meta.url)("electron");
await fs.mkdir(path.join(root, "temp"), { recursive: true });
const directory = await fs.mkdtemp(path.join(root, "temp", "library-progress-")), profile = path.join(directory, "user-data"), output = path.join(directory, "output");
for (const name of [profile, output]) await fs.mkdir(name);
const filename = path.join(profile, "studio-state.json"), state = createDefaultState(), count = 600;
Object.assign(state.settings, { comfyUrl: "http://192.0.2.1:9", comfyInstallDirectory: path.join(directory, "missing-core"), modelDirectory: path.join(directory, "models"), outputDirectory: output, imageOutputDirectory: output, imageInputLibraryDirectory: path.join(directory, "inputs"), uiLocale: "zh-CN", autoRetryFailedTasks: false });
for (let i = 0; i < count; i++) {
  const createdAt = new Date(Date.UTC(2026, 9, 27, 0, 0, i)).toISOString(), version = { id: `version-${i}`, kind: "original", createdAt, outputFilename: `missing-${i}.mp4`, modelId: "minimax_h3_fl2va", width: 640, height: 360, duration: 4, fps: 24, workflowPath: "", comfyPromptId: "", comfyOutputs: {}, files: [] };
  state.history.push({ mediaKind: "video", id: `asset-${i}`, taskId: `task-${i}`, title: `History ${i}`, createdAt, updatedAt: createdAt, outputFilename: version.outputFilename, modelId: version.modelId, favorite: false, rating: null, tags: [], duration: 4, resolution: 360, prompt: `Retained prompt ${i}`, seed: i, comfyPromptId: "", comfyOutputs: {}, files: [], versions: [version], extensionField: { keep: i } });
}
const original = JSON.stringify(state), hash = createHash("sha256").update(original).digest("hex"); await fs.writeFile(filename, original);
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
for (const key of ["APPDATA", "LOCALAPPDATA", "TEMP", "TMP"]) { env[key] = path.join(directory, key.toLowerCase()); await fs.mkdir(env[key], { recursive: true }); }
const report = { ok: false, directory, records: count, userLibraryAccessed: false, gpu: false, processes: [], samples: [] };
let child, port, progress, client;
const wait = (test, label, timeout = 60000) => pollUntil(test, Boolean, timeout, label, 100);
async function launch() {
  const server = net.createServer(); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); port = server.address().port; await new Promise(resolve => server.close(resolve));
  const log = openSync(path.join(directory, "app.log"), "a");
  child = spawn(electron, ["--remote-debugging-address=127.0.0.1", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, root], { cwd: root, env, windowsHide: true, stdio: ["ignore", log, log] }); closeSync(log);
  report.processes.push({ pid: child.pid, port });
}
async function progressClient() {
  return wait(async () => {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const target = targets.find(target => target.type === "page" && target.url.startsWith("data:text/html") && target.url.includes("library-startup-progress"));
      if (!target) return null;
      const c = new AppCdpClient(target.webSocketDebuggerUrl, 5000); await c.connect();
      await pollUntil(() => c.evaluate("!!document.querySelector('#library-startup-progress')"), Boolean, 5000, "Progress DOM"); return c;
    } catch { return null; }
  }, "Visible startup progress");
}
const snapshot = () => progress.evaluate(`(()=>{const pane=document.querySelector('#library-startup-progress'),bar=document.querySelector('progress');return{...pane.dataset,visible:document.visibilityState==='visible',width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,title:document.querySelector('#heading').textContent,stageLabel:document.querySelector('#stage').textContent,countLabel:document.querySelector('#count').textContent,value:bar.hasAttribute('value')?bar.value:null,preload:typeof window.studio}})()`);
async function terminateOwned() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  // This PID is the exact Electron child launched above, never discovered globally.
  const exited = new Promise(resolve => child.once("exit", resolve));
  try { await execute("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"]); }
  catch (error) {
    let gone = false; try { process.kill(child.pid, 0); } catch { gone = true; }
    if (!gone) throw error;
    return;
  }
  await exited;
}
async function nativeClose() {
  const title = await wait(() => client.evaluate("document.title.includes(' v')?document.title:null"), "Versioned app title", 10000), pid = child.pid;
  const show = spawn(electron, [`--user-data-dir=${profile}`, root], { cwd: root, env, windowsHide: true, stdio: "ignore" }); await new Promise(resolve => show.once("exit", resolve));
  await wait(async () => {
    const result = await execute("powershell.exe", ["-NoProfile", "-Command", `$libraryProgressProcess=Get-Process -Id ${pid}; @{title=$libraryProgressProcess.MainWindowTitle;handle=$libraryProgressProcess.MainWindowHandle.ToInt64()}|ConvertTo-Json -Compress`]);
    const window = JSON.parse(result.stdout); return window.handle !== 0 && window.title === title;
  }, "Owned visible native window", 10000);
  const exited = child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise(resolve => child.once("exit", resolve));
  client.close(); client = undefined;
  await execute("powershell.exe", ["-NoProfile", "-Command", `$libraryProgressProcess=Get-Process -Id ${pid}; if($libraryProgressProcess.MainWindowHandle -eq 0 -or $libraryProgressProcess.MainWindowTitle -ne '${title.replaceAll("'", "''")}'){throw 'Owned window mismatch'}; if(-not $libraryProgressProcess.CloseMainWindow()){throw 'Close failed'}`]);
  await wait(async () => { try { process.kill(pid, 0); return false; } catch { return true; } }, "Native close", 30000);
  await exited;
}
try {
  await launch(); progress = await progressClient();
  const first = await wait(async () => { const value = await snapshot(); return value.visible && value.stage === "write" && Number(value.completed) > 0 && Number(value.completed) < count ? value : null; }, "Counted write progress");
  assert.equal(first.preload, "undefined"); assert.equal(first.overflow, false); assert.equal(Number(first.total), count);
  assert.equal(first.value, Math.floor(Number(first.completed) / count * 100)); assert.ok(first.value < 100); report.samples.push(first);
  const second = await wait(async () => { const value = await snapshot(); return value.stage === "write" && Number(value.completed) > Number(first.completed) && Number(value.completed) < count ? value : null; }, "Advancing actual record count");
  report.samples.push(second);
  const shot = await progress.send("Page.captureScreenshot", { format: "png" }); await fs.writeFile(path.join(directory, "migration-progress.png"), Buffer.from(shot.data, "base64"));
  progress.close(); progress = undefined; await terminateOwned();
  assert.equal(await fs.readFile(filename, "utf8"), original);
  assert.equal(await fs.readFile(`${filename}.pre-library-${hash}.json`, "utf8"), original);
  report.interruptedSourcePreserved = true;
  await launch(); progress = await progressClient();
  report.retryProgress = await snapshot();
  await wait(async () => {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      if (targets.some(target => target.type === "page" && target.url.startsWith("file:"))) return true;
      const value = await snapshot();
      if (!report.samples.some(sample => sample.stage === value.stage)) report.samples.push(value);
      return false;
    } catch { return false; }
  }, "Migration switches to main window", 120000);
  progress.close(); progress = undefined;
  client = await connectApp({ port, timeout: 30000, target: "" });
  const loaded = await client.evaluate("window.studio.getState().then(s=>({ids:s.history.map(a=>a.id),versions:s.history.flatMap(a=>a.versions.map(v=>v.id)),extension:s.history.map(a=>a.extensionField.keep),queue:s.queue.length}))");
  assert.deepEqual(loaded.ids, state.history.map(asset => asset.id)); assert.deepEqual(loaded.versions, state.history.map(asset => asset.versions[0].id));
  assert.deepEqual(loaded.extension, Array.from({ length: count }, (_, index) => index)); assert.equal(loaded.queue, 0);
  await wait(async () => !(await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).some(target => target.url.startsWith("data:text/html") && target.url.includes("library-startup-progress")), "Progress window closes after main readiness");
  await nativeClose(); report.nativeClose = true; report.ok = true;
} catch (error) { report.error = error.stack; process.exitCode = 1; }
finally {
  progress?.close(); client?.close(); await terminateOwned();
  await fs.writeFile(path.join(directory, "report.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
}
