import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { connectApp, parseAppHarnessArgs } from "../app-harness.mjs";
import { promptOperationIsActive, promptModelStartupIsActive } from "../../dist/electron/src/core/prompt-runtime-state.js";

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("close-fixture-smoke.mjs <fixture> --port <port> [--output report.json]\nOnly matching isolated launch/state, stopped queue and idle Prompt. Stops app-owned local ComfyUI via AppApi before CDP window.close. Refuses external/remote runtime. This is Harness resource cleanup, not native window-close lifecycle verification. Check recorded PIDs/ports afterward.");
  process.exit(0);
}
const directory = path.resolve(args.shift() || "");
const options = parseAppHarnessArgs(["inspect", ...args]);
const report = { ok: false, evidence: "isolated-harness-api-cleanup", nativeWindowCloseVerified: false };
let client;
try {
  assert.match(path.relative(path.resolve("temp"), directory), /^create-smoke-[^\\/]+$/);
  const launch = JSON.parse(await fs.readFile(path.join(directory, "launch.json"), "utf8"));
  assert.equal(path.resolve(launch.directory).toLowerCase(), directory.toLowerCase());
  assert.equal(launch.evidence, "fixture-launched-only");
  assert.equal(launch.port, options.port);
  client = await connectApp(options);
  const snapshot = await client.evaluate("Promise.all([window.studio.getState(),window.studio.getPromptRuntimeState(),window.studio.getComfyRuntimeState()]).then(([state,prompt,runtime])=>({state,prompt,runtime}))");
  const { state, prompt, runtime } = snapshot;
  assert.equal(state.queueRunning, false);
  assert.ok(!state.queue.some(t => t.status === "running"));
  assert.equal(promptOperationIsActive(prompt), false);
  assert.equal(promptModelStartupIsActive(prompt), false);
  const outputRelative = path.relative(directory, path.resolve(state.settings.outputDirectory));
  assert.ok(!outputRelative.startsWith("..") && !path.isAbsolute(outputRelative), "State output must belong to fixture");
  const endpoint = new URL(state.settings.comfyUrl);
  assert.equal(endpoint.protocol, "http:");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname));
  assert.equal(Number(endpoint.port || 80), launch.comfyPort);
  assert.equal(runtime.endpoint.replace(/\/+$/, ""), state.settings.comfyUrl.replace(/\/+$/, ""));
  report.runtimeBefore = { phase: runtime.phase, ownership: runtime.ownership };
  if (runtime.ownership === "app") {
    const stopped = await client.evaluate("window.studio.getState().then(s=>window.studio.forceStopComfyProcesses(s.settings))");
    assert.equal(stopped.ok, true, stopped.message);
    report.ownedRuntimeStoppedViaAppApi = true;
  } else {
    assert.ok(["none", "unknown"].includes(runtime.ownership) && runtime.phase === "stopped", "Refuse external or unowned runtime");
    report.ownedRuntimeStoppedViaAppApi = false;
  }
  report.pid = launch.pid;
  report.ports = { cdp: launch.port, comfy: launch.comfyPort };
  // Browser JS close can destroy the window without Electron's native close hook.
  // The owned runtime was already stopped explicitly; do not claim native exit.
  await client.evaluate("window.close();true").catch(() => undefined);
  report.windowCloseRequested = true;
  report.ok = true;
} catch (error) { report.error = error.message; process.exitCode = 1; }
finally { client?.close(); }
if (options.output) await fs.writeFile(options.output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
