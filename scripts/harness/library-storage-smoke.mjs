// Real Electron UI, physically isolated metadata/media, no GPU or user settings.
import fs from "node:fs/promises";
import { openSync, closeSync } from "node:fs";
import path from "node:path";
import net from "node:net";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { AppCdpClient, connectApp, loopbackWebSocket, pollUntil } from "../app-harness.mjs";
import { fixtureUi } from "./fixture-ui.mjs";
import { createDefaultState } from "../../dist/electron/src/core/defaults.js";
import { H3_VIDEO_VAE_FP16_FILENAME } from "../../dist/electron/src/core/h3-video-vae.js";
import { normalizeH3MemoryOptions } from "../../dist/electron/src/core/h3-memory-policy.js";

const root = path.resolve(import.meta.dirname, "../.."), execute = promisify(execFile), electron = createRequire(import.meta.url)("electron");
const migrateUserData = process.argv.includes("--migrate-user-data");
const checkMigrationWindow = process.argv.includes("--migration-window");
if (checkMigrationWindow && !migrateUserData) throw new Error("--migration-window requires --migrate-user-data");
await fs.mkdir(path.join(root, "temp"), { recursive: true });
const directory = await fs.mkdtemp(path.join(root, "temp", "library-ui-")), userData = path.join(directory, "user-data"), output = path.join(directory, "comfy", "output");
const legacyStateFile = path.join(userData, "studio-state.json");
const dataDirectory = migrateUserData ? path.join(userData, "Documents", "Local Video Studio", "Data") : userData;
const stateFile = path.join(dataDirectory, "studio-state.json"), moved = path.join(directory, "chosen-library"), occupied = path.join(directory, "occupied");
for (const name of [userData, output, occupied]) await fs.mkdir(name, { recursive: true });
await fs.writeFile(path.join(occupied, "precious.txt"), "Do not overwrite");
const models = path.join(directory, "models"), core = path.join(directory, "comfy");
await fs.mkdir(path.join(models, "vae"), { recursive: true }); await fs.mkdir(core, { recursive: true });
// Scanner-only placeholders; queue is never started and these are not usable weights.
await fs.writeFile(path.join(models, "vae", H3_VIDEO_VAE_FP16_FILENAME), "FILE-SCAN-FIXTURE-NOT-A-MODEL");
await fs.writeFile(path.join(core, "main.py"), "# fixture, never executed\n");
await fs.writeFile(path.join(core, "comfyui_version.py"), "__version__ = '0.35.0'\n");
let media = path.join(output, "old-video.mp4");
const image = path.join(directory, "old-image.png"), generatedImage = path.join(output, "old-result.png");
await execute("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=12", "-t", "4", "-an", "-c:v", "libx264", "-threads", "1", "-pix_fmt", "yuv420p", "-movflags", "+faststart", media]);
await execute("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-i", media, "-frames:v", "1", image]);
await fs.copyFile(image, generatedImage);
const digest = raw => createHash("sha256").update(raw).digest("hex"), mediaHash = digest(await fs.readFile(media));
const state = createDefaultState(), time = "2026-10-27T01:00:00.000Z", file = { filename: "old-video.mp4", type: "output", subfolder: "", absolutePath: media };
Object.assign(state.settings, { comfyUrl: "http://192.0.2.1:9", comfyInstallDirectory: core, modelDirectory: models, comfyPythonPath: "", h3AttentionMode: "pytorch", h3SparseAttentionMode: "off", h3RuntimeMode: "compatibility", h3ComfyCompilerMode: "off", outputDirectory: output, imageOutputDirectory: output, imageInputLibraryDirectory: path.join(directory, "inputs"), autoRetryFailedTasks: false, uiLocale: "zh-CN" });
state.draft.promptVersions[0].text = ""; state.draft.workflowPath = path.join(root, "workflows", "minimax_h3_t2va_api.json"); state.draft.ratio = "16:9"; state.draft.duration = 1; state.draft.seed = 42;
state.imageToVideoDraft = structuredClone(state.draft);
const version = { id: "old-version", kind: "original", createdAt: time, modelId: "minimax_h3_fl2va", outputFilename: file.filename, width: 640, height: 360, duration: 4, fps: 12, workflowPath: state.draft.workflowPath, comfyPromptId: "", comfyOutputs: { untouched: true }, files: [file] };
state.history = [{ mediaKind: "video", id: "old-asset", taskId: "old-task", title: "Precious old history", outputFilename: file.filename, createdAt: time, updatedAt: time, modelId: "minimax_h3_fl2va", favorite: false, rating: null, tags: [], duration: 4, resolution: 360, prompt: "Old prompt retained verbatim.", seed: 1, comfyPromptId: "", comfyOutputs: {}, files: [file], versions: [version], futureExtension: { preserve: true } }];
state.imageHistory = [{ mediaKind: "image", id: "old-image", title: "Old source image", createdAt: time, updatedAt: time, favorite: false, rating: null, tags: [], coverMode: "auto", nextVersionNumber: 2,
  versions: [{ id: "old-image-version", versionNumber: 1, kind: "source", createdAt: time, modelId: "source", workflowPath: "", prompt: "", promptVersion: 0, references: [], width: 640, height: 360, format: "png", file: { filename: "old-image.png", absolutePath: image, type: "input", subfolder: "" }, futureField: { preserve: true } }] }];
state.imageHistory[0].versions.push({ ...structuredClone(state.imageHistory[0].versions[0]), id: "generated-image-version", versionNumber: 2, kind: "edit", parentVersionId: "old-image-version", file: { filename: "old-result.png", absolutePath: generatedImage, type: "output", subfolder: "" } });
state.imageHistory[0].nextVersionNumber = 3;
let pastedImage, migratedImage;
const cachedCoverKey = "migration-existing-cover", cachedCoverDigest = digest(cachedCoverKey);
if (migrateUserData) {
  pastedImage = path.join(userData, "clipboard-inputs", "source.png"); migratedImage = path.join(dataDirectory, "clipboard-inputs", "source.png");
  await fs.mkdir(path.dirname(pastedImage), { recursive: true }); await fs.copyFile(image, pastedImage);
  state.imageToVideoDraft.startImagePath = pastedImage;
  const coverDirectory = path.join(userData, "history-covers", "v3"); await fs.mkdir(coverDirectory, { recursive: true });
  await execute("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-i", media, "-frames:v", "1", path.join(coverDirectory, `${cachedCoverDigest}.jpg`)]);
  const stat = await fs.stat(media);
  await fs.writeFile(path.join(coverDirectory, `${cachedCoverDigest}.json`), JSON.stringify({ sourceSize: stat.size, sourceMtimeMs: stat.mtimeMs, generatedAt: time }));
  if (checkMigrationWindow) {
    const fixtureFiles = path.join(userData, "clipboard-files", "migration-fixture"); await fs.mkdir(fixtureFiles, { recursive: true });
    for (let index = 0; index < 512; index++) await fs.writeFile(path.join(fixtureFiles, `${index}.bin`), Buffer.alloc(2048, index % 256));
  }
}
const originalRaw = JSON.stringify(state); await fs.writeFile(legacyStateFile, originalRaw);
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
for (const key of ["APPDATA", "LOCALAPPDATA", "TEMP", "TMP"]) { env[key] = path.join(directory, key.toLowerCase()); await fs.mkdir(env[key], { recursive: true }); }
const report = { ok: false, directory, realApp: true, focusEmulation: true, userLibraryAccessed: false, gpu: false, scannerPlaceholders: true, processes: [], checks: [] };
let child, client;
const wait = (test, label) => pollUntil(test, Boolean, 30000, label, 100);
const freePort = async () => { const server = net.createServer(); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port; };
async function observeMigrationWindow(port) {
  await pollUntil(async () => {
    let progressClient;
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const target = targets.find(item => item.type === "page" && item.url.startsWith("data:text/html"));
      if (!target) return false;
      progressClient = new AppCdpClient(loopbackWebSocket(target.webSocketDebuggerUrl, port), 3000); await progressClient.connect();
      const value = await progressClient.evaluate(`(() => {
        const pane=document.querySelector('#library-startup-progress');
        return pane ? {title:document.title,visible:!document.hidden,...pane.dataset,heading:document.querySelector('#heading').textContent,stageText:document.querySelector('#stage').textContent,count:document.querySelector('#count').textContent} : null;
      })()`);
      if (!value?.visible || value.scope !== "user-data" || !(Number(value.completed) > 0) || !(Number(value.total) >= 512) || Number(value.completed) >= Number(value.total)) return false;
      assert.equal(value.heading, "正在迁移用户资料"); assert.ok(value.count.includes("/"));
      report.migrationWindow = { ...value, targetId: target.id };
      const screenshot = await progressClient.send("Page.captureScreenshot", { format: "png" });
      await fs.writeFile(path.join(directory, "user-data-migration.png"), Buffer.from(screenshot.data, "base64"));
      return true;
    } catch (error) { report.migrationWindowProbe = error.message; return false; }
    finally { progressClient?.close(); }
  }, Boolean, 120000, "Visible user-data migration window with actual file counts", 50);
}
async function launch() {
  const port = await freePort(), log = openSync(path.join(directory, "app.log"), "a");
  child = spawn(electron, ["--remote-debugging-address=127.0.0.1", `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`, ...(migrateUserData ? ["--migrate-profile-data"] : []), root], { cwd: root, env, windowsHide: true, stdio: ["ignore", log, log] }); closeSync(log);
  report.processes.push({ pid: child.pid, port });
  if (checkMigrationWindow && report.processes.length === 1) await observeMigrationWindow(port);
  client = await pollUntil(async () => {
    try { return await connectApp({ port, timeout: 3000, target: "" }); }
    catch (error) { report.discoveryError = error.message; return null; }
  }, Boolean, 120000, "Isolated App", 100);
  // Discovery retries are short; renderer commands need the normal UI timeout.
  client.timeout = 30000;
  await wait(() => client.evaluate('!!document.querySelector("button[data-page=history]")'), "Shell");
  if (checkMigrationWindow) {
    await wait(async () => !(await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).some(target => target.type === "page" && target.url.startsWith("data:text/html")), "Migration progress window closes on handoff");
    report.migrationWindowClosed = true;
  }
  await client.send("Emulation.setFocusEmulationEnabled", { enabled: true });
}
async function nativeClose() {
  const pid = child.pid;
  const title = await wait(() => client.evaluate("document.title.includes(' v')?document.title:null"), "Versioned app title");
  const ownedWindow = close => `
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class LibrarySmokeWindow {
  public delegate bool EnumProc(IntPtr window, IntPtr parameter);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr parameter);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr window, StringBuilder text, int max);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr w, IntPtr l);
  public static IntPtr Find(uint process, string title) {
    IntPtr found=IntPtr.Zero;
    EnumWindows((window, parameter) => {
      uint owner; GetWindowThreadProcessId(window, out owner);
      if(owner!=process || !IsWindowVisible(window)) return true;
      var text=new StringBuilder(1024); GetWindowText(window,text,text.Capacity);
      if(text.ToString()!=title) return true;
      found=window; return false;
    },IntPtr.Zero);
    return found;
  }
}
'@
$librarySmokeHandle=[LibrarySmokeWindow]::Find(${pid},'${title.replaceAll("'", "''")}');
${close ? "if($librarySmokeHandle -eq [IntPtr]::Zero){throw 'Owned visible window missing'}; if(-not [LibrarySmokeWindow]::PostMessage($librarySmokeHandle,16,[IntPtr]::Zero,[IntPtr]::Zero)){throw 'Native close rejected'}" : "@{handle=$librarySmokeHandle.ToInt64()}|ConvertTo-Json -Compress"}`;
  // The production second-instance handler restores/shows the exact same profile.
  const show = spawn(electron, [`--user-data-dir=${userData}`, root], { cwd: root, env, windowsHide: true, stdio: "ignore" });
  await new Promise(resolve => show.once("exit", resolve));
  await wait(async () => {
    const result = await execute("powershell.exe", ["-NoProfile", "-Command", ownedWindow(false)]);
    const window = JSON.parse(result.stdout); report.nativeWindow = window;
    return window.handle !== 0;
  }, "Owned visible native window");
  client?.close(); client = undefined;
  const result = await execute("powershell.exe", ["-NoProfile", "-Command", ownedWindow(true)]);
  await wait(async () => { try { process.kill(pid, 0); return false; } catch { return true; } }, "Native app exit");
  return result;
}
async function type(selector, text) {
  await client.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});e.focus();e.select();})()`);
  await client.send("Input.insertText", { text });
}
const savedState = () => client.evaluate("window.studio.getState()");
async function dismissErrors(ui) {
  for (let i = 0; i < 8; i++) {
    const count = await client.evaluate("document.querySelectorAll('.ui-notice-error').length");
    if (!count) return;
    await ui.click(".ui-notice-error .ui-notice-close");
    await wait(() => client.evaluate(`document.querySelectorAll('.ui-notice-error').length<${count}`), "Persistent error dismissed");
  }
}
try {
  await launch(); let ui = fixtureUi(client, 30000, report);
  const migrated = await savedState();
  assert.equal(migrated.history.length, 1); assert.equal(migrated.imageHistory.length, 1); assert.ok(migrated.history[0].futureExtension.preserve);
  assert.equal(await fs.readFile(`${stateFile}.pre-library-${digest(originalRaw)}.json`, "utf8"), originalRaw);
  assert.ok(migrated.settings.libraryDirectory.startsWith(userData)); report.libraryId = migrated.libraryStorage.libraryId;
  if (migrateUserData) {
    assert.equal(migrated.imageToVideoDraft.startImagePath, migratedImage);
    assert.deepEqual(await fs.readFile(migratedImage), await fs.readFile(image));
    assert.equal(await fs.readFile(path.join(dataDirectory, "migration-backup", "studio-state.json"), "utf8"), originalRaw);
    assert.equal(JSON.parse(await fs.readFile(path.join(dataDirectory, "user-data-migration.json"), "utf8")).phase, "complete");
    assert.equal(await fs.stat(legacyStateFile).then(() => true, () => false), false);
    assert.equal(await fs.stat(path.join(userData, "history-covers")).then(() => true, () => false), false);
    assert.equal((await client.evaluate(`window.studio.lookupHistoryCover(${JSON.stringify(cachedCoverKey)}, ${JSON.stringify(media)})`)).state, "hit");
    report.checks.push("real startup: owned files leave legacy profile, exact original retained in Documents, pasted input relinked and cached cover hits without generation; Electron profile remains in place");
  }
  await ui.openHistory("old-asset");
  await client.evaluate("document.querySelector('.history-player video').play();window.__libraryVideo=document.querySelector('.history-player video');true");
  const frames = await client.evaluate("window.__libraryVideo.getVideoPlaybackQuality().totalVideoFrames");
  await wait(() => client.evaluate(`window.__libraryVideo.getVideoPlaybackQuality().totalVideoFrames>${frames + 3}`), "Decoded frames");
  await ui.click('.history-detail-curation [data-history-favorite="old-asset"]');
  await wait(() => client.evaluate("window.studio.getState().then(s=>s.history[0].favorite)"), "Favorite committed");
  await ui.click('[data-history-rating-star="old-asset"][data-history-rating-value="4"]');
  await type("[data-history-tag-input]", "Migration checked");
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", windowsVirtualKeyCode: 13 });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", windowsVirtualKeyCode: 13 });
  await wait(() => client.evaluate("window.studio.getState().then(s=>s.history[0].tags.includes('Migration checked'))"), "Tag committed");
  assert.equal(await client.evaluate("window.__libraryVideo===document.querySelector('.history-player video')"), true);
  await ui.click(".history-detail-back-button"); report.checks.push("migration preserves video/image IDs and unknown fields; decoded playback; favorite/rating/tag persist without replacing player; return");
  await ui.click("button[data-page=settings]"); await ui.click('[data-settings-tab="system"]');
  assert.equal(await client.evaluate("document.querySelector('#nas-sync-directory')===null"), true);
  await type("#library-directory", occupied); await ui.click("#save-settings");
  await wait(() => client.evaluate("!!document.querySelector('#directory-apply-migrate')"), "Library confirmation");
  assert.equal(await client.evaluate("!!document.querySelector('#directory-apply')"), false);
  await ui.click("#directory-cancel");
  assert.equal((await savedState()).libraryStorage.directory, migrated.libraryStorage.directory);
  await type("#library-directory", occupied); await ui.click("#save-settings"); await ui.click("#directory-apply-migrate");
  await wait(() => client.evaluate("document.body.textContent.includes('目标目录不是空目录')"), "Occupied destination error");
  assert.equal(await client.evaluate("document.body.textContent.includes('settings:save')"), false);
  assert.equal((await savedState()).libraryStorage.directory, migrated.libraryStorage.directory);
  await ui.click("#directory-cancel");
  await type("#library-directory", moved); await ui.click("#save-settings");
  await ui.click("#directory-apply-migrate");
  await wait(() => client.evaluate(`window.studio.getState().then(s=>s.libraryStorage.directory===${JSON.stringify(moved)})`), "Location committed");
  await wait(() => client.evaluate("!document.querySelector('#directory-apply-migrate')"), "Library migration finished");
  assert.equal((await savedState()).libraryStorage.libraryId, report.libraryId);
  await assert.rejects(fs.stat(path.join(migrated.libraryStorage.directory, "library.json")), { code: "ENOENT" });
  await wait(() => client.evaluate("!document.querySelector('#save-settings')||document.querySelector('.settings-heading-actions')?.hidden"), "Save settled");
  await dismissErrors(ui);
  await type("#image-output-directory", path.join(directory, "outside-output")); await ui.click("#save-settings"); await ui.click("#directory-apply-migrate");
  await wait(() => client.evaluate("document.body.textContent.includes('必须位于当前 ComfyUI output')"), "Image output confinement");
  assert.equal((await savedState()).settings.imageOutputDirectory, output);
  assert.equal(digest(await fs.readFile(media)), mediaHash);
  await ui.click("#directory-cancel"); await dismissErrors(ui);
  const videoTarget = path.join(output, "Videos New"), imageTarget = path.join(output, "Images New"), oldMedia = media;
  await client.evaluate(`(()=>{
    window.__mediaMigrationEvents=[];window.__sawMediaProgress=false;
    window.studio.onHistoryMigrationProgress(p=>window.__mediaMigrationEvents.push(p));
    new MutationObserver(()=>{if(document.querySelector('.directory-migration-dialog [role=progressbar]'))window.__sawMediaProgress=true}).observe(document.body,{childList:true,subtree:true});
  })()`);
  await type("#output-directory", videoTarget); await type("#image-output-directory", imageTarget); await ui.click("#save-settings");
  await wait(() => client.evaluate("!!document.querySelector('#directory-apply-migrate')"), "Media migration confirmation");
  await client.evaluate("Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))");
  const confirmation = await client.send("Page.captureScreenshot", { format: "png" }); await fs.writeFile(path.join(directory, "media-confirmation.png"), Buffer.from(confirmation.data, "base64"));
  await ui.click("#directory-apply-migrate");
  await wait(() => client.evaluate(`window.studio.getState().then(s=>s.settings.outputDirectory===${JSON.stringify(videoTarget)}&&s.settings.imageOutputDirectory===${JSON.stringify(imageTarget)})`), "Media paths committed");
  await wait(() => client.evaluate("!document.querySelector('#directory-apply-migrate')"), "Media migration finished");
  const movedState = await savedState(); media = movedState.history[0].files[0].absolutePath;
  assert.equal(digest(await fs.readFile(media)), mediaHash);
  assert.equal(digest(await fs.readFile(movedState.imageHistory[0].versions[1].file.absolutePath)), digest(await fs.readFile(image)));
  await assert.rejects(fs.stat(oldMedia), { code: "ENOENT" }); await assert.rejects(fs.stat(generatedImage), { code: "ENOENT" });
  assert.equal(await client.evaluate("window.__sawMediaProgress"), true);
  report.mediaProgress = await client.evaluate("window.__mediaMigrationEvents");
  assert.ok(report.mediaProgress.some(p=>p.phase==='moving'&&p.total>0)); assert.equal(report.mediaProgress.at(-1).phase,"completed");
  await ui.openHistory("old-asset");
  await client.evaluate("document.querySelector('.history-player video').play();window.__movedVideo=document.querySelector('.history-player video');true");
  const movedFrames = await client.evaluate("window.__movedVideo.getVideoPlaybackQuality().totalVideoFrames");
  await wait(() => client.evaluate(`window.__movedVideo.getVideoPlaybackQuality().totalVideoFrames>${movedFrames+3}`), "Moved video decodes");
  await ui.click(".history-detail-back-button"); await ui.click("button[data-page=settings]"); await ui.click('[data-settings-tab="system"]');
  report.checks.push("library cancel and real confirmation; video/image output confinement; real media moves with progress; SHA256 preserved; old files absent; moved video decodes");
  for (let i = 0; i < 6; i++) {
    const count = await client.evaluate("document.querySelectorAll('.ui-notice-error').length");
    if (!count) break;
    await ui.click(".ui-notice-error .ui-notice-close");
    await wait(() => client.evaluate(`document.querySelectorAll('.ui-notice-error').length<${count}`), "Persistent error dismissed");
  }
  for (const [width, height] of [[1280, 800], [1440, 900], [900, 800]]) {
    await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await client.evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
    assert.equal(await client.evaluate("document.documentElement.scrollWidth>innerWidth"), false);
    await client.evaluate("document.querySelector('#library-directory').scrollIntoView({block:'center'})");
    const shot = await client.send("Page.captureScreenshot", { format: "png" }); await fs.writeFile(path.join(directory, `settings-${width}.png`), Buffer.from(shot.data, "base64"));
  }
  await wait(async () => { try { await fs.access(path.join(moved, "StudioLibrary", report.libraryId, "current.json")); return true; } catch { return false; } }, "Automatic NAS publication");
  report.checks.push("occupied destination fails safely → corrected path → real Save → stable library ID; two-column path controls and breakpoints; automatic v2 publishing");
  await ui.click("button[data-page=create]");
  await wait(() => client.evaluate('!!document.querySelector("#enqueue")'), "Create");
  assert.equal(await client.evaluate("document.querySelector('#enqueue').disabled"), true);
  await type("#prompt-input", "A balloon rises slowly above an empty green field.");
  await wait(() => client.evaluate("!document.querySelector('#enqueue').disabled"), "Missing prompt recovered");
  await ui.click("#enqueue");
  await wait(() => client.evaluate("window.studio.getState().then(s=>s.queue.length===1)"), "Real enqueue ID");
  const task = (await savedState()).queue[0]; report.taskId = task.id;
  await wait(() => client.evaluate("!!document.querySelector('#prompt-input')&&!document.querySelector('#enqueue').disabled"), "Post-enqueue control ready");
  await type("#prompt-input", "A different scene for the next task.");
  await wait(() => client.evaluate("window.studio.getState().then(s=>s.draft.promptVersions[s.draft.activePromptVersion].text.includes('different scene'))"), "Draft persisted");
  assert.deepEqual((await savedState()).queue[0], task);
  assert.equal((await savedState()).queueRunning, false);
  // The real Create journey above edits the active draft. Compare restart with
  // that accepted UI state, rather than the inactive input from the old fixture.
  const imageToVideoBeforeRestart = (await savedState()).imageToVideoDraft;
  await nativeClose(); await launch(); ui = fixtureUi(client, 30000, report);
  const restarted = await savedState();
  // Existing schema-16 startup fills the withdrawn H3 memory fields with inert
  // defaults. All original snapshot fields must still compare exactly.
  assert.deepEqual(restarted.queue[0], { ...task, ...normalizeH3MemoryOptions(task, "off") });
  assert.equal(restarted.history[0].favorite, true); assert.ok(restarted.history[0].tags.includes("Migration checked"));
  assert.equal(restarted.libraryStorage.libraryId, report.libraryId); assert.equal(restarted.libraryStorage.directory, moved);
  if (migrateUserData) {
    assert.deepEqual(restarted.imageToVideoDraft, imageToVideoBeforeRestart);
    assert.deepEqual(await fs.readFile(migratedImage), await fs.readFile(image));
    assert.equal((await client.evaluate(`window.studio.lookupHistoryCover(${JSON.stringify(cachedCoverKey)}, ${JSON.stringify(media)})`)).state, "hit");
    assert.equal(await fs.stat(legacyStateFile).then(() => true, () => false), false);
  }
  assert.equal(digest(await fs.readFile(media)), mediaHash); assert.equal(await fs.readFile(path.join(occupied, "precious.txt"), "utf8"), "Do not overwrite");
  await ui.openHistory("old-asset"); await ui.click(".history-detail-back-button");
  await nativeClose(); report.checks.push("missing prompt → keyboard recovery → actual enqueue button → new task ID; later draft edit and native restart preserve frozen task; old video and parent return remain reachable");
  report.nativeClose = true; report.ok = true;
} catch (error) {
  report.error = error.stack; process.exitCode = 1;
  if (client) {
    try {
      const shot = await client.send("Page.captureScreenshot", { format: "png" }); await fs.writeFile(path.join(directory, "failure.png"), Buffer.from(shot.data, "base64"));
      await fs.writeFile(path.join(directory, "failure.txt"), await client.evaluate("document.body.innerText"));
    } catch {}
  }
}
finally {
  if (client) { try { await client.send("Browser.close"); } catch {} client.close(); }
  if (child && child.exitCode === null && child.signalCode === null) { child.kill(); await new Promise(resolve => child.once("exit", resolve)); }
  await fs.writeFile(path.join(directory, "report.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
}
