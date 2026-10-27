import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { connectApp, parseAppHarnessArgs, pollUntil as harnessPollUntil } from "../app-harness.mjs";

const pollUntil = (read, { timeoutMs, intervalMs }) => harnessPollUntil(read, Boolean, timeoutMs, "long-video editor", intervalMs);

// UI/IPC/persistence only. Never starts Queue, Prompt or ComfyUI.
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("probe-long-video-editor.mjs <temp/create-smoke-fixture> --port <port> [--resume]\nUses the isolated empty fixture; --resume checks its saved editor after a real app restart. No GPU stages.");
  process.exit(0);
}
const directory = path.resolve(args.shift() || "");
const resume = args.includes("--resume");
const options = parseAppHarnessArgs(["inspect", ...args.filter(arg => arg !== "--resume")]);
const report = { ok: false, layer: "real-electron-ui-ipc-persistence", resume, gpuSamples: 0 };
let client;
try {
  assert.match(path.relative(path.resolve("temp"), directory), /^create-smoke-[^\\/]+$/);
  const launch = JSON.parse(await fs.readFile(path.join(directory, "launch.json"), "utf8"));
  assert.equal(Number(options.port), launch.port);
  client = await connectApp(options);
  await client.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await pollUntil(() => client.evaluate("Boolean(document.querySelector('#generation-mode'))"), { timeoutMs: 30000, intervalMs: 200 });
  const state = () => client.evaluate("window.studio.getState()");
  const click = async selector => {
    assert.equal(await client.evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});return Boolean(b&&!b.disabled&&!b.closest('[hidden]'));})()`), true, `Visible enabled button: ${selector}`);
    await client.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  };
  const initial = await state();
  assert.equal(initial.queueRunning, false);
  assert.equal(initial.history.length, 0);
  assert.equal(initial.settings.outputDirectory.toLowerCase().startsWith(directory.toLowerCase() + path.sep), true);
  if (resume) {
    const prior = JSON.parse(await fs.readFile(path.join(directory, "long-video-editor.json"), "utf8"));
    assert.equal(prior.ok, true);
    assert.equal(initial.draft.longVideoScript.brief.id, prior.briefId);
    assert.equal(initial.draft.longVideoScript.segments[0].id, prior.segmentId);
    assert.equal(initial.draft.longVideoScript.segments[0].locked, true);
    assert.equal(initial.draft.longVideoScript.segments[0].versions.at(-1).text, "A single continuous action.\nThe person slowly turns toward the window.");
    assert.equal(await client.evaluate("document.querySelector('#generation-mode').value"), "preview");
    assert.equal(await client.evaluate("document.querySelector('.create-long-editor textarea').readOnly"), true);
    assert.equal(initial.queue[0].id, prior.nativeTaskId);
    report.briefId = prior.briefId; report.segmentId = prior.segmentId;
    report.nativeTaskId = prior.nativeTaskId;
  } else {
    assert.equal(initial.queue.length, 0);
    assert.equal(await client.evaluate("document.querySelector('#enqueue').disabled"), true);
    await client.evaluate("document.querySelector('#prompt-input').focus()");
    await client.send("Input.insertText", { text: "A red balloon rises slowly over a quiet field. Static camera, soft daylight." });
    await pollUntil(() => client.evaluate("!document.querySelector('#enqueue').disabled"), { timeoutMs: 10000, intervalMs: 100 });
    await client.evaluate("(()=>{const s=document.querySelector('#generation-mode');s.value='preview';s.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await click("[data-confirm-layout]");
    await click('.create-long-tabs [role="tab"]:nth-child(2)');
    await client.evaluate("document.querySelector('.create-long-editor textarea').focus()");
    await client.send("Input.insertText", { text: "A single continuous action.\nThe person slowly turns toward the window." });
    await click("[data-preview-lock]");
    assert.equal(await client.evaluate("document.querySelector('#enqueue').disabled"), true);
    await client.evaluate("(()=>{const s=document.querySelector('#generation-mode');s.value='native';s.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await pollUntil(() => client.evaluate("!document.querySelector('#enqueue').disabled"), { timeoutMs: 10000, intervalMs: 100 });
    await click("#enqueue");
    await pollUntil(async () => (await state()).queue.length === 1, { timeoutMs: 10000, intervalMs: 100 });
    const queued = await state();
    assert.equal(queued.queue[0].duration, initial.draft.duration);
    assert.equal(queued.queue[0].prompt, "A red balloon rises slowly over a quiet field. Static camera, soft daylight.");
    report.nativeTaskId = queued.queue[0].id;
    await client.evaluate("(()=>{const s=document.querySelector('#generation-mode');s.value='preview';s.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await pollUntil(async () => (await state()).draft.longVideoEditor?.active === true, { timeoutMs: 10000, intervalMs: 100 });
    const saved = await state();
    assert.equal(saved.draft.longVideoScript.brief.versions.at(-1).text, "A red balloon rises slowly over a quiet field. Static camera, soft daylight.");
    report.briefId = saved.draft.longVideoScript.brief.id;
    report.segmentId = saved.draft.longVideoScript.segments[0].id;
    report.layout = saved.draft.longVideoScript.layout;
  }
  report.screenshots = [];
  for (const [width, height] of [[1280, 800], [1440, 900], [960, 800], [480, 800]]) {
    await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await click("[data-preview-whole]");
    const name = `long-editor-${resume ? "restart-" : ""}${width}.png`;
    const shot = await client.send("Page.captureScreenshot", { format: "png" });
    await fs.writeFile(path.join(directory, name), Buffer.from(shot.data, "base64"));
    report.screenshots.push(name);
    await click("[data-preview-pages]");
  }
  report.queueStarted = false;
  report.ok = true;
} catch (error) { report.error = error.message; process.exitCode = 1; }
finally { client?.close(); }
await fs.writeFile(path.join(directory, resume ? "long-video-editor-restart.json" : "long-video-editor.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
