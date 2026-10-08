import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { journeys, journeyGuide } from "./harness/journeys.mjs";

const actions = new Set(["list", "guide", "inspect", "scan", "start-comfy", "enqueue-ui", "start-queue", "wait-task"]);

export function parseAppHarnessArgs(args) {
  const argv = [...args];
  const options = { action: "list", port: 9333, timeout: 30_000, target: "", task: "", output: "", journey: "", help: false };
  if (argv[0] && !argv[0].startsWith("-")) options.action = argv.shift();
  if (options.action === "guide" && argv[0] && !argv[0].startsWith("-")) options.journey = argv.shift();
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === "--help" || flag === "-h") { options.help = true; continue; }
    const key = { "--port": "port", "--timeout": "timeout", "--target": "target", "--task": "task", "--output": "output" }[flag];
    if (!key || !argv[index + 1] || argv[index + 1].startsWith("--")) throw new Error(`Invalid option: ${flag}`);
    options[key] = ["port", "timeout"].includes(key) ? Number(argv[++index]) : argv[++index];
  }
  if (!actions.has(options.action)) throw new Error(`Unknown action: ${options.action}`);
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) throw new Error("Invalid --port");
  if (!Number.isInteger(options.timeout) || options.timeout < 1 || options.timeout > 3_600_000) throw new Error("--timeout must be 1..3600000 ms");
  if (!options.help && options.action === "wait-task" && !options.task) throw new Error("wait-task requires --task <id>");
  return options;
}

export function loopbackWebSocket(value, port) {
  const url = new URL(value);
  if (url.protocol !== "ws:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      Number(url.port) !== port || url.username || url.password) throw new Error("CDP target must use the selected loopback port");
  return url.href;
}

export class AppCdpClient {
  constructor(url, timeout = 30_000) { this.url = url; this.timeout = timeout; this.nextId = 1; this.pending = new Map(); }
  async connect() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
    this.socket.addEventListener("close", () => this.rejectPending("CDP closed"));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.socket.close(); reject(new Error("CDP connect timeout")); }, this.timeout);
      this.socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      this.socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("CDP connection failed")); }, { once: true });
    });
  }
  rejectPending(reason) {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(reason)); }
    this.pending.clear();
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timeout; inspect app before retrying a mutation`)); }, this.timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const response = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result?.value;
  }
  close() { this.rejectPending("CDP client closed"); this.socket?.close(); }
}

export async function connectApp(options) {
  const response = await fetch(`http://127.0.0.1:${options.port}/json/list`, { signal: AbortSignal.timeout(Math.min(options.timeout, 5_000)), redirect: "error" });
  if (!response.ok) throw new Error(`CDP HTTP ${response.status}`);
  const targets = (await response.json()).filter((target) => target.type === "page" && (!options.target || target.id === options.target));
  const matches = [];
  for (const target of targets) {
    const client = new AppCdpClient(loopbackWebSocket(target.webSocketDebuggerUrl, options.port), options.timeout);
    try {
      await client.connect();
      if (await client.evaluate("typeof window.studio?.getState === 'function' && typeof window.studio?.enqueue === 'function'")) matches.push({ client, id: target.id });
      else client.close();
    } catch (error) { client.close(); if (options.target) throw error; }
  }
  if (matches.length !== 1) {
    matches.forEach(({ client }) => client.close());
    throw new Error(matches.length ? `Multiple Studio targets; select --target: ${matches.map((item) => item.id).join(", ")}` : "No Studio AppApi found. Launch built Electron with loopback CDP; see docs/AGENT_ELECTRON_API_RUNBOOK.md.");
  }
  return matches[0].client;
}

// Serialized into the actual Electron renderer. Deliberately no prompt text or full state in output.
export function inspectAppInRenderer() {
  const activePromptPresent = (draft) => {
    const extending = draft.inputMode === "video";
    const versions = extending ? draft.extensionPromptVersions : draft.promptVersions;
    const index = extending ? draft.extensionActivePromptVersion : draft.activePromptVersion;
    return Boolean((versions?.[index] ?? versions?.at(-1))?.text?.trim());
  };
  const buttonState = (selector) => {
    const element = document.querySelector(selector);
    return element ? { selector, disabled: element.disabled, visible: element.getClientRects().length > 0,
      reason: element.dataset.enqueueBlockReason || element.title || "" } : null;
  };
  return Promise.all([window.studio.getState(), window.studio.getComfyRuntimeState(), window.studio.getPromptRuntimeState()]).then(([state, runtime, promptRuntime]) => ({
    evidence: "real-app-api-inspection", runtime, promptRuntime,
    draft: { modelId: state.draft.modelId, inputMode: state.draft.inputMode, hasStart: Boolean(state.draft.startImagePath), hasEnd: Boolean(state.draft.endImagePath),
      references: state.draft.h3ReferenceSlots.length, hasVideo: Boolean(state.draft.sourceVideoPath), hasPrompt: activePromptPresent(state.draft),
      duration: state.draft.duration, resolution: state.draft.resolution, spectrumMode: state.draft.spectrumMode, h3LatentSaveMode: state.draft.h3LatentSaveMode },
    queueRunning: state.queueRunning,
    queue: state.queue.map((task) => ({ id: task.id, type: task.taskType, status: task.status, modelId: task.modelId, progress: task.progress, stage: task.stage })),
    historyCounts: { video: state.history.length, image: state.imageHistory.length },
    controls: ["#enqueue", "#enqueue-image-edit", "#enhance-prompt", "#enqueue-upscale"].map(buttonState).filter(Boolean)
  }));
}

export function taskEvidence(state, taskId) {
  const task = state.queue.find((item) => item.id === taskId);
  const videos = state.history.flatMap((asset) => asset.versions.filter((version) => version.taskId === taskId || (!version.taskId && asset.taskId === taskId && version.kind === "original")).map((version) => ({ assetId: asset.id, versionId: version.id, files: version.files })));
  const images = state.imageHistory.flatMap((project) => project.versions.filter((version) => version.taskId === taskId).map((version) => ({ assetId: project.id, versionId: version.id, files: [version.file] })));
  const outputs = [...videos, ...images];
  // Completion removes active tasks. Durable history, never array position, is
  // the completion receipt after that atomic transition.
  if (!task && !outputs.length) throw new Error(`Task not found in queue or history: ${taskId}`);
  return { taskId, status: task?.status ?? "completed", completionSource: task ? "queue" : "history",
    progress: task?.progress, stage: task?.stage, error: task?.error, queueRunning: state.queueRunning, outputs };
}

export async function pollUntil(read, accept, timeout, label, delay = 250) {
  const started = Date.now();
  let last;
  do {
    last = await read();
    if (accept(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, Math.min(delay, Math.max(1, timeout - (Date.now() - started)))));
  } while (Date.now() - started < timeout);
  throw new Error(`${label} timed out. Last: ${JSON.stringify(last)}`);
}

export async function runAppAction(client, options) {
  const inspect = () => client.evaluate(`(${inspectAppInRenderer.toString()})()`);
  if (options.action === "inspect") return inspect();
  if (options.action === "start-comfy") {
    const result = await client.evaluate(`(async () => {
      const state = await window.studio.getState();
      if (state.queueRunning) throw new Error('Queue active; do not change its runtime');
      const result = await window.studio.startLocalService('comfy', state.settings);
      return { result, runtime: await window.studio.getComfyRuntimeState() };
    })()`);
    if (!result.result.ok || result.runtime.phase !== "ready") throw new Error(JSON.stringify(result));
    return { evidence: "real-app-service-start", ...result };
  }
  if (options.action === "scan") return client.evaluate(`(async () => {
    const state = await window.studio.getState();
    const scan = await window.studio.scanEnvironment(state.settings, 'full');
    return { evidence: 'real-app-environment-scan', runtime: await window.studio.getComfyRuntimeState(),
      models: scan.modelProfiles.map(p => ({ id: p.id, available: p.available, runtimeReady: p.runtimeReady, runtimeVerified: p.runtimeVerified })),
      nodes: scan.customNodes.map(n => ({ id: n.id, installed: n.installed, loaded: n.loaded, runtimeVerified: n.runtimeVerified })) };
  })()`);
  if (options.action === "enqueue-ui") {
    const before = await client.evaluate(`(async () => {
      const state = await window.studio.getState();
      if (state.queueRunning) throw new Error('Pause queue before enqueue smoke; it could execute immediately');
      const modal = document.querySelector('#enqueue-upscale');
      const buttons = (modal && modal.getClientRects().length ? [modal] : ['#enqueue', '#enqueue-image-edit'].map(s => document.querySelector(s))).filter(b => b && b.getClientRects().length);
      if (buttons.length !== 1) throw new Error('Open one Create or Upscale form; expected exactly one visible submit control');
      const button = buttons[0];
      if (button.disabled) throw new Error('UI enqueue blocked: ' + (button.dataset.enqueueBlockReason || button.title || 'disabled'));
      return { ids: state.queue.map(t => t.id), selector: '#' + button.id };
    })()`);
    // Re-check in the same operation as the click. Never remove disabled or bypass the UI with AppApi.enqueue.
    await client.evaluate(`(() => { const b = document.querySelector(${JSON.stringify(before.selector)}); if (!b || b.disabled || !b.getClientRects().length) throw new Error('Submit became unavailable'); b.click(); })()`);
    const added = await pollUntil(async () => client.evaluate(`(async () => {
      const s = await window.studio.getState();
      return s.queue.filter(t => !${JSON.stringify(before.ids)}.includes(t.id)).map(t => ({ id: t.id, type: t.taskType, status: t.status, modelId: t.modelId }));
    })()`), (items) => items.length > 0, options.timeout, "UI enqueue (inspect toast/App logs for backend rejection)");
    if (added.length !== 1) throw new Error(`Expected one task; found ${added.length}. Inspect concurrent submissions.`);
    return { evidence: "real-ui-enqueue", task: added[0], generationVerified: false };
  }
  if (options.action === "start-queue") {
    // Explicit command: all waiting tasks can run. The runbook requires an isolated queue.
    await client.evaluate("window.studio.startQueue().then(s => ({ queueRunning: s.queueRunning }))");
    return inspect();
  }
  if (options.action === "wait-task") {
    const result = await pollUntil(() => client.evaluate(`window.studio.getState().then(s => (${taskEvidence.toString()})(s, ${JSON.stringify(options.task)}))`),
      (item) => ["completed", "failed", "cancelled"].includes(item.status), options.timeout, `Task ${options.task}`, 1_000);
    if (result.status !== "completed") throw new Error(JSON.stringify(result));
    if (!result.outputs.length) throw new Error(`Completed task ${options.task} has no matching history version`);
    const files = result.outputs.flatMap((output) => output.files).filter((file) => /\.(mp4|webm|mov|mkv|png|jpe?g|webp)$/iu.test(file.filename || file.absolutePath || ""));
    if (!files.length) throw new Error("No media file associated with completed task");
    for (const file of files) {
      if (!file.absolutePath) throw new Error("History file has no resolved absolutePath; inspect output path resolution");
      const stat = await fs.stat(file.absolutePath);
      if (!stat.isFile() || stat.size === 0) throw new Error(`Empty or invalid output: ${file.absolutePath}`);
      file.sizeBytes = stat.size;
    }
    return { evidence: "real-app-task-and-files", playbackVerified: false, ...result };
  }
  throw new Error(`Unsupported app action: ${options.action}`);
}

const usage = `Local Video Studio journey harness (Node 22+)
  npm.cmd run harness:app -- list
  npm.cmd run harness:app -- guide <journey>
  npm.cmd run harness:app -- inspect --port 9333
  npm.cmd run harness:app -- start-comfy --port 9333 --timeout 180000
  npm.cmd run harness:app -- scan --port 9333 --timeout 180000
  npm.cmd run harness:app -- enqueue-ui --port 9333
  npm.cmd run harness:app -- start-queue --port 9333
  npm.cmd run harness:app -- wait-task --task <id> --port 9333 --timeout 600000
Options: --target <CDP id> --output <JSON file> --timeout <ms>
start-comfy and enqueue/start-queue mutate the selected app. Use an isolated state and owned runtime.
No implicit restart, install, generation, or deletion. Timeout does not cancel the app operation.
Launch/cleanup: docs/AGENT_ELECTRON_API_RUNBOOK.md; scenarios: docs/runbooks/PRODUCT_JOURNEYS.md`;

async function main() {
  const options = parseAppHarnessArgs(process.argv.slice(2));
  if (options.help) return console.log(usage);
  let client;
  let report;
  try {
    const result = options.action === "list" ? journeys.map(({ id, title }) => ({ id, title }))
      : options.action === "guide" ? journeyGuide(options.journey)
      : await runAppAction(client = await connectApp(options), options);
    report = { ok: true, action: options.action, at: new Date().toISOString(), result };
  } catch (error) {
    report = { ok: false, action: options.action, at: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) };
    process.exitCode = 1;
  } finally { client?.close(); }
  if (options.output) {
    await fs.mkdir(path.dirname(path.resolve(options.output)), { recursive: true });
    await fs.writeFile(options.output, JSON.stringify(report, null, 2) + "\n");
  }
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
