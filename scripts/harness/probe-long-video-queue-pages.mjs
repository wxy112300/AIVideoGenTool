// Read-only Queue browsing on a stopped isolated long-video fixture; never starts sampling.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { connectApp, parseAppHarnessArgs, pollUntil } from "../app-harness.mjs";

const directory = path.resolve(process.argv[2] ?? "");
assert.match(path.relative(path.resolve("temp"), directory), /^create-smoke-[^\\/]+$/u);
const options = parseAppHarnessArgs(["inspect", ...process.argv.slice(3)]);
const launch = JSON.parse(await fs.readFile(path.join(directory, "launch.json"), "utf8"));
assert.equal(options.port, launch.port);
const report = { ok: false, layer: "real-electron-queue-pages", focusEmulation: true };
let client;
try {
  await pollUntil(async () => { try { client = await connectApp(options); return true; } catch { return false; } }, Boolean, 30000, "AppApi", 500);
  await client.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  const before = await client.evaluate("window.studio.getState()");
  assert.equal(before.queueRunning, false);
  assert.ok(!before.queue.some(task => task.status === "running"));
  const task = before.queue.find(task => task.longVideoPlan);
  assert.ok(task, "Use an already prepared long-video task");
  await pollUntil(() => client.evaluate("Boolean(document.querySelector('button[data-page=queue]'))"), Boolean, 30000, "Queue navigation");
  await client.evaluate("document.querySelector('button[data-page=queue]').click()");
  const scope = `[data-queue-task-id="${task.id}"] [data-queue-prompt]`;
  await pollUntil(() => client.evaluate(`Boolean(document.querySelector(${JSON.stringify(scope)}))`), Boolean, 30000, "Queue prompt");
  const read = () => client.evaluate(`(()=>{const block=document.querySelector(${JSON.stringify(scope)});return {
    text:block.querySelector('.task-description:not([hidden])')?.textContent,
    visible:[...block.querySelectorAll('.task-description')].filter(p=>getComputedStyle(p).display!=='none').length,
    labels:[...block.querySelectorAll('[data-queue-prompt-page]')].map(b=>b.textContent),
    selected:block.querySelector('[aria-pressed=true]')?.dataset.queuePromptPage
  };})()`);
  const page = async index => client.evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(scope)}).querySelector('[data-queue-prompt-page="${index}"]');b.focus();b.click();return document.activeElement===b;})()`);
  const plan = task.longVideoExecution?.script ?? task.longVideoPlan;
  assert.equal((await read()).labels.length, plan.layout.chunks + 2);
  for (let index = 0; index < plan.layout.chunks; index++) {
    assert.equal(await page(index + 2), true);
    const result = await read();
    const preamble = plan.sharedPreamble ? plan.pages[0].text.trim() : "";
    assert.equal(result.text, preamble ? `${preamble}\n\n${plan.pages[index + 1].text}` : plan.pages[index + 1].text);
    assert.equal(result.labels[index + 2], String(plan.layout.prefixChunks + index + 1));
    assert.equal(result.visible, 1);
  }
  await page(1); assert.equal((await read()).text, plan.pages[0].text);
  await page(0);
  report.sizes = [];
  for (const [width, height] of [[1280, 800], [1440, 900], [960, 800], [480, 800]]) {
    await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await new Promise(resolve => setTimeout(resolve, 400));
    const layout = await client.evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(scope)});return {overflow:b.scrollWidth>b.clientWidth+1,visible:[...b.querySelectorAll('.task-description')].filter(p=>getComputedStyle(p).display!=='none').length};})()`);
    assert.equal(layout.overflow, false, `${width}px prompt overflow`); assert.equal(layout.visible, 1);
    const screenshot = await client.send("Page.captureScreenshot", { format: "png" });
    const filename = `long-video-queue-pages-${width}.png`;
    await fs.writeFile(path.join(directory, filename), Buffer.from(screenshot.data, "base64"));
    report.sizes.push({ width, height, filename, ...layout });
  }
  const after = await client.evaluate("window.studio.getState()");
  assert.deepEqual(after.queue, before.queue); assert.equal(after.queueRunning, false);
  report.taskId = task.id; report.frozenQueueUnchanged = true; report.ok = true;
} catch (error) { report.error = error.stack ?? String(error); process.exitCode = 1; }
finally {
  if (client) await client.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
  client?.close();
  await fs.writeFile(path.join(directory, "long-video-queue-pages.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
