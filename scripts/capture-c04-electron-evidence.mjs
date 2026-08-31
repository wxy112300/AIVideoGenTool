import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import WebSocket from "ws";

const execFileAsync = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceDirectory = path.resolve(scriptDirectory, "..");
const require = createRequire(import.meta.url);
const electronExecutable = require("electron");

const DEFAULT_SAMPLE_COUNT = 3;
const DEFAULT_STARTUP_TIMEOUT_MS = 45_000;
const DEFAULT_OPERATION_TIMEOUT_MS = 8_000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 8_000;
const TRACE_CATEGORIES = [
  "devtools.timeline",
  "blink.user_timing",
  "loading"
];

function parseArgs(argv) {
  const options = {
    scenario: "all",
    samples: DEFAULT_SAMPLE_COUNT,
    output: "",
    skipTrace: false,
    skipDevelopment: false,
    startupTimeoutMs: DEFAULT_STARTUP_TIMEOUT_MS
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (argument === "--skip-trace") {
      options.skipTrace = true;
      continue;
    }
    if (argument === "--skip-development") {
      options.skipDevelopment = true;
      continue;
    }
    if (argument === "--scenario") {
      options.scenario = argv[index + 1] ?? options.scenario;
      index += 1;
      continue;
    }
    if (argument === "--samples") {
      options.samples = positiveInteger(argv[index + 1], options.samples);
      index += 1;
      continue;
    }
    if (argument === "--output") {
      options.output = argv[index + 1] ?? options.output;
      index += 1;
      continue;
    }
    if (argument === "--startup-timeout-ms") {
      options.startupTimeoutMs = positiveInteger(argv[index + 1], options.startupTimeoutMs);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function printUsage() {
  console.log(`Usage: node --experimental-strip-types scripts/capture-c04-electron-evidence.mjs [options]

Options:
  --scenario <all|empty|history-500|legacy>  Scenario to run (default: all)
  --samples <n>                              Cold and warm samples per scenario (default: 3)
  --output <directory>                       Evidence output directory
  --skip-trace                               Do not collect Chromium trace events
  --skip-development                         Do not attempt the development launcher
  --startup-timeout-ms <n>                   Per-run startup timeout (default: 45000)
`);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function stamp() {
  return new Date().toISOString().replace(/[^0-9]/gu, "").slice(0, 17);
}

function safeFilePart(value) {
  return String(value).replace(/[^A-Za-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "value";
}

async function ensureDirectory(directory) {
  await fs.mkdir(directory, { recursive: true });
  return directory;
}

async function findFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  if (!port) throw new Error("Unable to allocate a local CDP port");
  return port;
}

async function getJsonTargets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) throw new Error(`CDP endpoint returned HTTP ${response.status}`);
  const targets = await response.json();
  return Array.isArray(targets) ? targets : [];
}

async function waitForPageTarget(port, timeoutMs) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const targets = await getJsonTargets(port);
      const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
      if (page) return page;
    } catch (error) {
      lastError = error;
    }
    await sleep(120);
  }
  throw new Error(`Timed out waiting for Electron CDP page${lastError ? `: ${lastError.message}` : ""}`);
}

class CdpClient {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.webSocketUrl);
    await new Promise((resolve, reject) => {
      const socket = this.socket;
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    this.socket.on("message", (data) => {
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) {
          pending.reject(new Error(`${message.error.message ?? "CDP error"} (${message.error.code ?? "unknown"})`));
        } else {
          pending.resolve(message.result ?? {});
        }
        return;
      }
      const callbacks = this.listeners.get(message.method) ?? [];
      for (const callback of callbacks) callback(message.params ?? {});
    });
    this.socket.on("close", () => {
      for (const pending of this.pending.values()) pending.reject(new Error("CDP socket closed"));
      this.pending.clear();
    });
    return this;
  }

  on(method, callback) {
    const callbacks = this.listeners.get(method) ?? [];
    callbacks.push(callback);
    this.listeners.set(method, callbacks);
    return () => {
      const current = this.listeners.get(method) ?? [];
      this.listeners.set(method, current.filter((candidate) => candidate !== callback));
    };
  }

  waitForEvent(method, timeoutMs = 5_000) {
    return new Promise((resolve, reject) => {
      let timer;
      const remove = this.on(method, (params) => {
        clearTimeout(timer);
        remove();
        resolve(params);
      });
      timer = setTimeout(() => {
        remove();
        reject(new Error(`Timed out waiting for CDP event ${method}`));
      }, timeoutMs);
    });
  }

  send(method, params = {}, timeoutMs = 10_000) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("CDP socket is not open"));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out sending CDP command ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (!this.socket) return;
    try {
      this.socket.close();
    } catch {
      // The browser may already have closed the socket after Browser.close.
    }
  }
}

async function evaluate(client, expression, options = {}) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
    ...options
  });
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "Runtime evaluation failed";
    throw new Error(description);
  }
  return result.result?.value ?? null;
}

async function waitForDom(client, expression, timeoutMs = DEFAULT_OPERATION_TIMEOUT_MS) {
  const startedAt = Date.now();
  let lastValue = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      lastValue = await evaluate(client, expression);
      if (lastValue) return true;
    } catch (error) {
      lastValue = { error: error.message };
    }
    await sleep(80);
  }
  return false;
}

async function clickAndWait(client, selector, readyExpression, timeoutMs = DEFAULT_OPERATION_TIMEOUT_MS) {
  const clicked = await evaluate(client, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!(element instanceof HTMLElement)) return false;
    element.click();
    return true;
  })()`);
  if (!clicked) return { clicked: false, ready: false };
  if (!readyExpression) return { clicked: true, ready: true };
  const ready = await waitForDom(client, readyExpression, timeoutMs);
  await sleep(120);
  return { clicked: true, ready };
}

async function installLongTaskObserver(client) {
  try {
    return await evaluate(client, `(() => {
      if (!window.__c04LongTasks) {
        window.__c04LongTasks = [];
        if (typeof PerformanceObserver === "function") {
          try {
            const observer = new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                window.__c04LongTasks.push({ name: entry.name, startTime: entry.startTime, duration: entry.duration });
              }
            });
            observer.observe({ type: "longtask", buffered: true });
            window.__c04LongTaskObserver = observer;
          } catch {
            window.__c04LongTaskObserver = null;
          }
        }
      }
      return { supported: typeof PerformanceObserver === "function", buffered: window.__c04LongTasks.length };
    })()`);
  } catch (error) {
    return { supported: false, error: error.message };
  }
}

async function collectPageSnapshot(client) {
  return evaluate(client, `(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const paints = performance.getEntriesByType("paint").map((entry) => ({ name: entry.name, startTime: entry.startTime, duration: entry.duration }));
    const longTasks = performance.getEntriesByType("longtask").map((entry) => ({ name: entry.name, startTime: entry.startTime, duration: entry.duration }));
    const observedLongTasks = Array.isArray(window.__c04LongTasks) ? window.__c04LongTasks : [];
    const shell = document.querySelector(".app-shell");
    const main = document.querySelector("main");
    return {
      readyState: document.readyState,
      url: location.href,
      title: document.title,
      viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
      shell: Boolean(shell),
      main: Boolean(main),
      navigation: navigation ? {
        type: navigation.type,
        startTime: navigation.startTime,
        duration: navigation.duration,
        domInteractive: navigation.domInteractive,
        domContentLoadedEventEnd: navigation.domContentLoadedEventEnd,
        loadEventEnd: navigation.loadEventEnd,
        responseEnd: navigation.responseEnd
      } : null,
      paints,
      longTasks,
      observedLongTasks,
      layout: {
        documentClientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyClientWidth: document.body?.clientWidth ?? 0,
        bodyScrollWidth: document.body?.scrollWidth ?? 0,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 || (document.body?.scrollWidth ?? 0) > (document.body?.clientWidth ?? 0) + 1
      },
      dom: {
        elements: document.querySelectorAll("*").length,
        historyCards: document.querySelectorAll(".history-gallery-item").length,
        videoHistoryCards: document.querySelectorAll('.history-gallery-item[data-history-kind="video"]').length,
        imageHistoryCards: document.querySelectorAll('.history-gallery-item[data-history-kind="image"]').length,
        textInputs: document.querySelectorAll("input, textarea, select").length,
        navButtons: document.querySelectorAll(".nav-button[data-page]").length
      }
    };
  })()`);
}

function summarizeAppState(state) {
  if (!state || typeof state !== "object") return state;
  return {
    schemaVersion: state.schemaVersion ?? null,
    historyCount: Array.isArray(state.history) ? state.history.length : null,
    imageHistoryCount: Array.isArray(state.imageHistory) ? state.imageHistory.length : null,
    queueCount: Array.isArray(state.queue) ? state.queue.length : null,
    queueRunning: state.queueRunning ?? null,
    queueLifecycle: state.queueLifecycle ?? null,
    comfyUrl: state.settings?.comfyUrl ?? null,
    imageInputLibraryDirectoryConfigured: Boolean(state.settings?.imageInputLibraryDirectory)
  };
}

function makeElectronHistoryFixture(fixture) {
  return {
    videos: fixture.videos,
    images: fixture.images.map((project, projectIndex) => ({
      ...project,
      versions: project.versions.map((version, versionIndex) => {
        const filename = version.file.filename || `history-image-${projectIndex}-v${versionIndex + 1}.png`;
        return {
          ...version,
          file: {
            ...version.file,
            filename,
            absolutePath: version.file.absolutePath || `C:\\fixtures\\${filename}`
          }
        };
      })
    }))
  };
}

async function collectPerformanceMetrics(client) {
  try {
    const response = await client.send("Performance.getMetrics");
    return Object.fromEntries((response.metrics ?? []).map((metric) => [metric.name, metric.value]));
  } catch (error) {
    return { error: error.message };
  }
}

async function startTrace(client) {
  const events = [];
  const removeDataListener = client.on("Tracing.dataCollected", (params) => {
    if (Array.isArray(params.value)) events.push(...params.value);
  });
  try {
    await client.send("Tracing.start", {
      transferMode: "ReportEvents",
      traceConfig: {
        recordMode: "recordUntilFull",
        includedCategories: TRACE_CATEGORIES
      }
    });
  } catch (error) {
    removeDataListener();
    return { supported: false, error: error.message, events: [] };
  }
  return {
    supported: true,
    events,
    async stop() {
      const complete = client.waitForEvent("Tracing.tracingComplete", 15_000).catch((error) => ({ error: error.message }));
      try {
        await client.send("Tracing.end", {}, 15_000);
      } catch (error) {
        // tracingComplete may still contain the usable events.
        events.push({ name: "c04-tracing-end-error", args: { message: error.message } });
      }
      const completion = await complete;
      removeDataListener();
      return {
        supported: true,
        eventCount: events.length,
        completion,
        events,
        summary: summarizeTrace(events)
      };
    }
  };
}

function summarizeTrace(events) {
  const taskEvents = events.filter((event) =>
    typeof event?.dur === "number" &&
    event.dur >= 0 &&
    ["RunTask", "Task", "ThreadControllerImpl::RunTask", "FunctionCall"].includes(event.name)
  );
  const durations = taskEvents.map((event) => event.dur / 1_000);
  return {
    taskEventCount: taskEvents.length,
    maxTaskDurationMs: durations.length ? Math.max(...durations) : null,
    taskOver50msCount: durations.filter((duration) => duration > 50).length,
    taskOver100msCount: durations.filter((duration) => duration > 100).length
  };
}

async function captureScreenshot(client, outputPath) {
  try {
    const result = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await fs.writeFile(outputPath, Buffer.from(result.data, "base64"));
    return { status: "actual", path: outputPath };
  } catch (error) {
    return { status: "blocked", error: error.message };
  }
}

async function collectOperation(client, label, action, readyExpression) {
  const started = await evaluate(client, `(() => {
    const start = performance.now();
    window.__c04OperationStart = start;
    performance.mark(${JSON.stringify(`c04-${label}-start`)});
    return start;
  })()`);
  const actionResult = await action();
  if (readyExpression) await waitForDom(client, readyExpression);
  await sleep(160);
  const snapshot = await evaluate(client, `(() => {
    const end = performance.now();
    performance.mark(${JSON.stringify(`c04-${label}-end`)});
    const entries = performance.getEntriesByType("longtask").map((entry) => ({ name: entry.name, startTime: entry.startTime, duration: entry.duration }));
    const observed = Array.isArray(window.__c04LongTasks) ? window.__c04LongTasks : [];
    const operationLongTasks = [...entries, ...observed]
      .filter((entry) => entry.startTime >= Number(window.__c04OperationStart) - 1 && entry.startTime <= end + 1)
      .filter((entry, index, list) => list.findIndex((candidate) => candidate.startTime === entry.startTime && candidate.duration === entry.duration) === index);
    return { end, duration: end - Number(window.__c04OperationStart), longTasks: operationLongTasks };
  })()`);
  return {
    label,
    status: actionResult?.clicked === false ? "blocked" : "actual",
    action: actionResult,
    durationMs: snapshot.duration,
    longTasks: snapshot.longTasks,
    maxLongTaskMs: snapshot.longTasks.length ? Math.max(...snapshot.longTasks.map((entry) => entry.duration)) : null,
    budget: snapshot.longTasks.length
      ? { thresholdMs: 50, passed: snapshot.longTasks.every((entry) => entry.duration <= 50) }
      : { thresholdMs: 50, passed: null, reason: "No Chromium longtask entry was exposed for this operation" },
    page: await collectPageSnapshot(client),
    metrics: await collectPerformanceMetrics(client)
  };
}

async function runHistoryPerformance(client, runDirectory, stateCounts) {
  const evidence = {
    status: "actual",
    stateCounts,
    route: null,
    variants: [],
    details: [],
    screenshot: null,
    limitations: []
  };
  const route = await clickAndWait(client, '.nav-button[data-page="history"]', "Boolean(document.querySelector('.history-heading'))");
  evidence.route = route;
  if (!route.clicked || !route.ready) {
    evidence.status = "blocked";
    evidence.limitations.push("History route did not settle in the real Electron renderer.");
    return evidence;
  }

  for (const kind of ["video", "image"]) {
    const tab = await clickAndWait(
      client,
      `[data-history-kind="${kind}"]`,
      `Boolean(document.querySelector('[data-history-kind="${kind}"][aria-selected="true"]'))`
    );
    for (const layout of ["masonry", "album"]) {
      const operation = await collectOperation(
        client,
        `history-${kind}-${layout}`,
        () => clickAndWait(
          client,
          `[data-history-layout="${layout}"]`,
          `document.querySelector('.history-gallery')?.classList.contains(${JSON.stringify(layout)})`
        ),
        `document.querySelector('[data-history-kind="${kind}"][aria-selected="true"]') && document.querySelector('.history-gallery')?.classList.contains(${JSON.stringify(layout)})`
      );
      operation.kind = kind;
      operation.layout = layout;
      operation.tab = tab;
      evidence.variants.push(operation);
      if (!evidence.screenshot && operation.status === "actual") {
        evidence.screenshot = await captureScreenshot(
          client,
          path.join(runDirectory, `history-${kind}-${layout}.png`)
        );
      }
    }
    const detailSelector = kind === "image" ? ".image-history-detail-layout" : ".history-detail-hero";
    const cardSelector = kind === "image" ? "[data-open-image-history]" : "[data-open-history]";
    const detail = await collectOperation(
      client,
      `history-${kind}-detail-return`,
      async () => {
        const beforeScroll = await evaluate(client, `(() => {
          const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
          const target = Math.min(420, maxScroll);
          window.scrollTo(0, target);
          return { target, before: window.scrollY };
        })()`);
        const opened = await clickAndWait(client, cardSelector, `Boolean(document.querySelector(${JSON.stringify(detailSelector)}))`);
        const detailState = await evaluate(client, `({ opened: Boolean(document.querySelector(${JSON.stringify(detailSelector)})), scrollY: window.scrollY })`);
        const back = await clickAndWait(client, ".history-detail-back-button", "Boolean(document.querySelector('.history-heading'))");
        const after = await evaluate(client, `({
          returned: Boolean(document.querySelector('.history-heading')),
          scrollY: window.scrollY,
          target: ${JSON.stringify(beforeScroll.target)},
          horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
        })`);
        return { clicked: opened.clicked && back.clicked, beforeScroll, detailState, back, after };
      },
      "Boolean(document.querySelector('.history-heading'))"
    );
    detail.kind = kind;
    evidence.details.push(detail);
  }

  const finalSnapshot = await collectPageSnapshot(client);
  if (finalSnapshot.layout.horizontalOverflow) {
    evidence.limitations.push("Real Chromium reported horizontal overflow during the 500-record page run.");
  }
  return evidence;
}

async function collectCoreSurfaceSmoke(client) {
  const evidence = {
    status: "actual",
    routes: {},
    create: {},
    queue: {},
    history: {},
    settings: {},
    destructiveActions: "not-tested"
  };
  for (const [page, heading] of [
    ["create", ".create-page-heading"],
    ["queue", ".queue-page-heading"],
    ["history", ".history-heading"],
    ["settings", ".settings-layout"]
  ]) {
    const result = await clickAndWait(client, `.nav-button[data-page="${page}"]`, `Boolean(document.querySelector(${JSON.stringify(heading)}))`);
    evidence.routes[page] = result;
  }
  const createRoute = await clickAndWait(client, '.nav-button[data-page="create"]', "Boolean(document.querySelector('.create-page-heading'))");
  evidence.create = {
    route: createRoute,
    inputModes: await evaluate(client, `([...document.querySelectorAll('[data-input-mode]')]).map((element) => ({ value: element.dataset.inputMode ?? "", pressed: element.getAttribute("aria-pressed") }))`),
    promptFields: await evaluate(client, "document.querySelectorAll('textarea, input[type=text]').length"),
    undoRedoControls: await evaluate(client, "document.querySelectorAll('[data-undo], [data-redo], button[aria-label*=撤销], button[aria-label*=重做]').length")
  };
  const queueRoute = await clickAndWait(client, '.nav-button[data-page="queue"]', "Boolean(document.querySelector('.queue-page-heading'))");
  evidence.queue = {
    route: queueRoute,
    controls: await evaluate(client, `({
      start: Boolean(document.querySelector('#start-queue, [data-start-queue]')),
      pause: Boolean(document.querySelector('#pause-queue, [data-pause-queue]')),
      continue: Boolean(document.querySelector('#continue-queue, [data-continue-queue]')),
      taskCards: document.querySelectorAll('.task-card').length
    })`),
    note: "Queue start/pause/cancel were not invoked because no ComfyUI runtime was provisioned for this isolated evidence run."
  };
  const historyRoute = await clickAndWait(client, '.nav-button[data-page="history"]', "Boolean(document.querySelector('.history-heading'))");
  evidence.history = {
    route: historyRoute,
    tabs: await evaluate(client, "document.querySelectorAll('[data-history-kind][role=tab]').length"),
    layouts: await evaluate(client, "document.querySelectorAll('[data-history-layout]').length"),
    cards: await evaluate(client, "document.querySelectorAll('.history-gallery-item').length")
  };
  const settingsRoute = await clickAndWait(client, '.nav-button[data-page="settings"]', "Boolean(document.querySelector('.settings-layout'))");
  evidence.settings = {
    route: settingsRoute,
    tabs: await evaluate(client, "document.querySelectorAll('[data-settings-tab]').length"),
    saveControls: await evaluate(client, "document.querySelectorAll('#save-settings, [data-save-settings]').length")
  };
  return evidence;
}

async function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null) return { exited: true, code: child.exitCode, signal: child.signalCode };
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish({ exited: false, code: child.exitCode, signal: child.signalCode }), timeoutMs);
    child.once("exit", (code, signal) => finish({ exited: true, code, signal }));
  });
}

async function terminateTree(child) {
  if (!child?.pid || child.exitCode !== null) return false;
  if (process.platform === "win32") {
    try {
      await execFileAsync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
    } catch {
      try {
        child.kill();
      } catch {
        // The process exited between the two attempts.
      }
    }
  } else {
    try {
      child.kill("SIGTERM");
    } catch {
      // The process exited between the two attempts.
    }
  }
  return true;
}

function parseLogTimestamp(value) {
  const match = String(value).match(/^(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2}):(\d{3})$/u);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, millisecond] = match;
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}.${millisecond}`).getTime();
}

function normalizeEvent(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/gu, "$1-$2")
    .replace(/[^A-Za-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .toLowerCase();
}

function parseAppLog(text, startedAt) {
  const records = [];
  for (const line of String(text).split(/\r?\n/u)) {
    const match = line.match(/^\[([^\]]+)\]\[([^\]]+)\]\s+([^:]+):\s+/u);
    if (!match) continue;
    const timestamp = parseLogTimestamp(match[1]);
    if (timestamp == null) continue;
    const target = match[3].trim().split(".");
    records.push({
      timestamp: match[1],
      timestampMs: timestamp,
      relativeMs: timestamp - startedAt,
      level: match[2].toLowerCase(),
      scope: normalizeEvent(target[0] ?? "unknown"),
      event: normalizeEvent(target.slice(1).join("-") || "unknown")
    });
  }
  return records;
}

async function readFilesByName(rootDirectory, predicate, result = [], depth = 0) {
  if (depth > 7 || result.length >= 50) return result;
  let entries;
  try {
    entries = await fs.readdir(rootDirectory, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const entry of entries) {
    if (result.length >= 50) break;
    const entryPath = path.join(rootDirectory, entry.name);
    if (entry.isDirectory()) {
      if (["Cache", "Code Cache", "GPUCache", "DawnCache", "GrShaderCache"].includes(entry.name)) continue;
      await readFilesByName(entryPath, predicate, result, depth + 1);
    } else if (predicate(entry.name, entryPath)) {
      result.push(entryPath);
    }
  }
  return result;
}

async function collectRunFiles(rootDirectory) {
  const stateFiles = await readFilesByName(rootDirectory, (name) => name === "studio-state.json");
  const logFiles = await readFilesByName(rootDirectory, (name) => /^app-\d{4}-\d{2}-\d{2}\.log$/u.test(name));
  return { stateFiles, logFiles };
}

async function readTextFileIfPresent(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function buildFixtureState(kind, fixture, createDefaultState, rootDirectory) {
  const state = createDefaultState();
  state.settings.comfyUrl = "http://127.0.0.1:9";
  state.settings.outputDirectory = "";
  state.settings.imageOutputDirectory = "";
  state.settings.imageInputLibraryDirectory = path.join(rootDirectory, "media", "input");
  if (kind === "history-500") {
    state.history = fixture.videos;
    state.imageHistory = fixture.images;
    return state;
  }
  if (kind === "legacy") {
    const source = fixture.videos[0];
    state.schemaVersion = 2;
    state.history = source
      ? [{
          ...source,
          updatedAt: undefined,
          versions: undefined,
          ratio: "16:9"
        }]
      : [];
    state.imageHistory = [];
    state.queue = [];
    return state;
  }
  return state;
}

async function writeFixtureState(rootDirectory, state) {
  const appDataRoot = path.join(rootDirectory, "appdata");
  const localAppDataRoot = path.join(rootDirectory, "localappdata");
  const userDataDirectory = path.join(rootDirectory, "electron-user-data");
  await ensureDirectory(userDataDirectory);
  await fs.writeFile(path.join(userDataDirectory, "studio-state.json"), JSON.stringify(state, null, 2), "utf8");
  await ensureDirectory(localAppDataRoot);
  return { appDataRoot, localAppDataRoot, userDataDirectory };
}

async function getGitCommit() {
  try {
    const result = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: workspaceDirectory, windowsHide: true });
    return result.stdout.trim();
  } catch {
    return "unknown";
  }
}

async function getPackageMetadata() {
  const packageJson = JSON.parse(await fs.readFile(path.join(workspaceDirectory, "package.json"), "utf8"));
  return { name: packageJson.name, version: packageJson.version };
}

async function runElectronSession({ scenario, phase, sample, fixtureState, rootDirectory, outputRoot, options, launchKind = "packaged" }) {
  const runDirectory = await ensureDirectory(path.join(
    outputRoot,
    "runs",
    safeFilePart(scenario.id),
    safeFilePart(phase),
    `sample-${sample}`
  ));
  const appDataRoot = path.join(rootDirectory, "appdata");
  const localAppDataRoot = path.join(rootDirectory, "localappdata");
  const userDataDirectory = path.join(rootDirectory, "electron-user-data");
  const tempRoot = await ensureDirectory(path.join(rootDirectory, "temp"));
  const logRoot = await ensureDirectory(path.join(tempRoot, "ai-video-gen-tool", "logs"));
  const port = await findFreePort();
  const launchStartedAt = Date.now();
  const traceRequested = !options.skipTrace && phase === "cold" && sample === 1;
  const output = { stdout: [], stderr: [] };
  const environment = {
    ...process.env,
    APPDATA: appDataRoot,
    LOCALAPPDATA: localAppDataRoot,
    TEMP: tempRoot,
    TMP: tempRoot,
    ELECTRON_ENABLE_LOGGING: "1",
    ELECTRON_ENABLE_STACK_DUMPING: "1",
    C04_DISABLE_HARDWARE_ACCELERATION: "1"
  };
  delete environment.VITE_DEV_SERVER_URL;
  const command = launchKind === "packaged"
    ? electronExecutable
    : process.execPath;
  const args = launchKind === "packaged"
    ? ["--no-sandbox", "--disable-gpu", "--disable-gpu-compositing", "--in-process-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDirectory}`, workspaceDirectory]
    : [path.join(workspaceDirectory, "scripts", "dev.mjs")];
  if (launchKind === "development") environment.C04_REMOTE_DEBUGGING_PORT = String(port);
  const child = require("node:child_process").spawn(command, args, {
    cwd: workspaceDirectory,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  child.stdout.on("data", (chunk) => output.stdout.push(chunk.toString()));
  child.stderr.on("data", (chunk) => output.stderr.push(chunk.toString()));

  const result = {
    scenario: scenario.id,
    phase,
    sample,
    launchKind,
    runDirectory,
    isolation: {
      appDataRoot,
      localAppDataRoot,
      userDataDirectory,
      tempRoot,
      logRoot,
      stateFixture: fixtureState ? "written" : "empty"
    },
    process: { pid: child.pid, startedAt: new Date(launchStartedAt).toISOString() },
    startup: {
      status: "blocked",
      endpointWaitMs: null,
      firstUsableAtMs: null,
      firstUsableStatus: "not-tested",
      milestones: [],
      state: null,
      page: null,
      metrics: null
    },
    coreSurface: "not-tested",
    historyPerformance: "not-tested",
    traces: [],
    traceSupport: null,
    screenshots: [],
    limitations: []
  };
  let client = null;
  let startupTrace = null;
  let historyTrace = null;
  let startupTraceStopped = false;
  let historyTraceStopped = false;
  const persistTrace = async (trace, label) => {
    if (!trace?.supported) return;
    const traceResult = await trace.stop();
    const tracePath = path.join(runDirectory, `${safeFilePart(label)}.trace.json`);
    await fs.writeFile(
      tracePath,
      JSON.stringify({ traceEvents: traceResult.events ?? [] }),
      "utf8"
    );
    const { events: _events, ...traceMetadata } = traceResult;
    result.traces.push({ ...traceMetadata, label, path: tracePath });
  };
  try {
    const endpointWaitStartedAt = Date.now();
    const target = await waitForPageTarget(port, options.startupTimeoutMs);
    result.startup.endpointWaitMs = Date.now() - endpointWaitStartedAt;
    client = await new CdpClient(target.webSocketDebuggerUrl).connect();
    await client.send("Page.enable").catch(() => undefined);
    await client.send("Runtime.enable").catch(() => undefined);
    await client.send("Performance.enable").catch(() => undefined);
    await installLongTaskObserver(client);
    if (traceRequested) startupTrace = await startTrace(client);
    result.traceSupport = {
      requested: traceRequested,
      startup: startupTrace ? { supported: startupTrace.supported, error: startupTrace.error ?? null } : { supported: false, error: "not-requested" }
    };
    const firstUsablePollStartedAt = Date.now();
    const firstUsable = await waitForDom(
      client,
      "Boolean(document.querySelector('.app-shell')) && Boolean(document.querySelector('main'))",
      options.startupTimeoutMs
    );
    result.startup.firstUsableAtMs = Date.now() - launchStartedAt;
    result.startup.firstUsableStatus = firstUsable ? "actual" : "blocked";
    result.startup.firstUsablePollMs = Date.now() - firstUsablePollStartedAt;
    result.startup.status = firstUsable ? "actual" : "blocked";
    result.startup.page = await collectPageSnapshot(client);
    result.startup.metrics = await collectPerformanceMetrics(client);
    try {
      const startupState = await evaluate(client, "window.studio?.getState ? window.studio.getState() : null");
      result.startup.state = summarizeAppState(startupState);
    } catch (error) {
      result.startup.state = { error: error.message };
    }
    if (startupTrace?.supported) {
      await persistTrace(startupTrace, "startup");
      startupTraceStopped = true;
    }
    if (!firstUsable) {
      result.limitations.push("The app shell/main element did not become usable before the startup timeout.");
    } else {
      result.coreSurface = await collectCoreSurfaceSmoke(client);
      if (scenario.id === "history-500") {
        if (traceRequested) historyTrace = await startTrace(client);
        result.traceSupport.history = historyTrace
          ? { supported: historyTrace.supported, error: historyTrace.error ?? null }
          : { supported: false, error: "not-requested" };
        result.historyPerformance = await runHistoryPerformance(
          client,
          runDirectory,
          {
            video: result.startup.state?.historyCount ?? null,
            image: result.startup.state?.imageHistoryCount ?? null
          }
        );
      }
    }
    if (historyTrace?.supported) {
      await persistTrace(historyTrace, "history");
      historyTraceStopped = true;
    }
  } catch (error) {
    result.limitations.push(error.message);
    if (startupTrace?.supported && !startupTraceStopped) {
      try {
        await persistTrace(startupTrace, "startup");
        startupTraceStopped = true;
      } catch {}
    }
    if (historyTrace?.supported && !historyTraceStopped) {
      try {
        await persistTrace(historyTrace, "history");
        historyTraceStopped = true;
      } catch {}
    }
  } finally {
    if (client) {
      try {
        await client.send("Browser.close", {}, 2_000);
        result.shutdown = { requested: "Browser.close", fallback: false };
      } catch {
        result.shutdown = { requested: "Browser.close", fallback: false, response: "not-confirmed" };
      }
      client.close();
    }
    const gracefulExit = await waitForChildExit(child, DEFAULT_SHUTDOWN_TIMEOUT_MS);
    if (!gracefulExit.exited) {
      await terminateTree(child);
      result.shutdown = { ...(result.shutdown ?? {}), requested: "Browser.close", fallback: true, fallbackReason: "Electron did not exit within the bounded shutdown window" };
    }
    const exit = await waitForChildExit(child, 3_000);
    result.process.endedAt = new Date().toISOString();
    result.process.exit = exit;
    await fs.writeFile(path.join(runDirectory, "stdout.log"), output.stdout.join(""), "utf8");
    await fs.writeFile(path.join(runDirectory, "stderr.log"), output.stderr.join(""), "utf8");
    const files = await collectRunFiles(rootDirectory);
    result.files = files;
    const logTexts = [];
    for (const filePath of files.logFiles) {
      const text = await readTextFileIfPresent(filePath);
      if (text) logTexts.push({ path: filePath, text });
    }
    result.logs = {
      files: logTexts.map((entry) => entry.path),
      records: logTexts.flatMap((entry) => parseAppLog(entry.text, launchStartedAt))
    };
    const milestoneKeys = [
      ["process-ready", "app.ready"],
      ["state-loaded", "app.state-loaded"],
      ["initial-state-ready", "app.initial-state-ready"],
      ["window-created", "window.created"],
      ["dom-ready", "renderer.dom-ready"],
      ["background-started", "app.startup-background-started"],
      ["background-settled", "app.startup-background-settled"]
    ];
    result.startup.milestones = milestoneKeys.map(([name, key]) => {
      const [scope, event] = key.split(".");
      const record = result.logs.records.find((candidate) => candidate.scope === scope && candidate.event === event);
      return {
        name,
        status: record ? "actual" : "not-observed",
        relativeMs: record?.relativeMs ?? null,
        timestamp: record?.timestamp ?? null
      };
    });
    const migratedStatePaths = files.stateFiles.filter((filePath) => filePath.startsWith(userDataDirectory));
    result.migration = scenario.id === "legacy"
      ? {
          status: "actual",
          stateFiles: migratedStatePaths,
          postRunSchemaVersions: await Promise.all(migratedStatePaths.map(async (filePath) => {
            try {
              const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
              return { path: filePath, schemaVersion: parsed.schemaVersion, historyCount: parsed.history?.length ?? null };
            } catch (error) {
              return { path: filePath, error: error.message };
            }
          }))
        }
      : "not-applicable";
  }
  if (traceRequested && !startupTrace?.supported) result.limitations.push("Chromium startup tracing was unavailable.");
  return result;
}

async function runDevelopmentAttempt(outputRoot, options) {
  const runDirectory = await ensureDirectory(path.join(outputRoot, "development-attempt"));
  const rootDirectory = await ensureDirectory(path.join(runDirectory, "isolated"));
  const tempRoot = await ensureDirectory(path.join(rootDirectory, "temp"));
  const port = await findFreePort();
  const startedAt = Date.now();
  const output = { stdout: [], stderr: [] };
  const child = require("node:child_process").spawn(process.execPath, [path.join(workspaceDirectory, "scripts", "dev.mjs")], {
    cwd: workspaceDirectory,
    env: {
      ...process.env,
      APPDATA: path.join(rootDirectory, "appdata"),
      LOCALAPPDATA: path.join(rootDirectory, "localappdata"),
      TEMP: tempRoot,
      TMP: tempRoot,
      C04_REMOTE_DEBUGGING_PORT: String(port),
      C04_USER_DATA_DIR: path.join(rootDirectory, "electron-user-data"),
      C04_DISABLE_HARDWARE_ACCELERATION: "1",
      ELECTRON_ENABLE_LOGGING: "1"
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  child.stdout.on("data", (chunk) => output.stdout.push(chunk.toString()));
  child.stderr.on("data", (chunk) => output.stderr.push(chunk.toString()));
  const result = {
    mode: "development",
    status: "blocked",
    startedAt: new Date(startedAt).toISOString(),
    timeoutMs: Math.min(options.startupTimeoutMs, 35_000),
    cdp: "not-tested",
    files: {
      stdout: path.join(runDirectory, "stdout.log"),
      stderr: path.join(runDirectory, "stderr.log")
    },
    limitations: []
  };
  try {
    const target = await waitForPageTarget(port, result.timeoutMs);
    result.cdp = { status: "actual", url: target.url };
    result.status = "actual";
  } catch (error) {
    result.limitations.push(`Development launcher did not expose a CDP page: ${error.message}`);
  } finally {
    await terminateTree(child);
    await waitForChildExit(child, 5_000);
    await fs.writeFile(result.files.stdout, output.stdout.join(""), "utf8");
    await fs.writeFile(result.files.stderr, output.stderr.join(""), "utf8");
    result.endedAt = new Date().toISOString();
    result.elapsedMs = Date.now() - startedAt;
  }
  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }
  const validScenarios = new Set(["empty", "history-500", "legacy"]);
  if (options.scenario !== "all" && !validScenarios.has(options.scenario)) {
    throw new Error(`Unsupported scenario: ${options.scenario}`);
  }
  const packageMetadata = await getPackageMetadata();
  const outputRoot = path.resolve(
    options.output || path.join(workspaceDirectory, "temp", "c04-evidence", `${stamp()}-${process.pid}`)
  );
  await ensureDirectory(outputRoot);
  const fixtureModule = await import(pathToFileURL(path.join(workspaceDirectory, "tests", "fixtures", "history-performance.ts")).href);
  const defaultsModule = await import(pathToFileURL(path.join(workspaceDirectory, "dist", "electron", "src", "core", "defaults.js")).href);
  const fixture = makeElectronHistoryFixture(fixtureModule.createHistoryPerformanceFixture(500));
  const selectedScenarios = options.scenario === "all"
    ? ["empty", "history-500", "legacy"]
    : [options.scenario];
  const scenarioDefinitions = selectedScenarios.map((id) => ({
    id,
    description: id === "empty" ? "fresh default state" : id === "history-500" ? "500 video and 500 image history records" : "schema v2 history state requiring current migration"
  }));
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    repository: {
      commit: await getGitCommit(),
      package: packageMetadata,
      workspace: workspaceDirectory
    },
    runtime: {
      node: process.version,
      electron: packageMetadata ? (await fs.readFile(path.join(workspaceDirectory, "node_modules", "electron", "package.json"), "utf8").then((text) => JSON.parse(text).version).catch(() => "unknown")) : "unknown",
      platform: process.platform,
      arch: process.arch,
      osRelease: os.release(),
      cpu: os.cpus()[0]?.model ?? "unknown",
      cpuCount: os.cpus().length,
      totalMemoryGb: Math.round(os.totalmem() / 1024 / 1024 / 102.4) / 10,
      viewport: "BrowserWindow default 1280x860; viewport override is not applied by the production launcher"
    },
    mode: "packaged",
    gpuMode: "disabled-by-harness",
    sandboxMode: "disabled-by-harness",
    evidencePolicy: {
      actual: "Captured through the production Electron entry with a real BrowserWindow and CDP.",
      static: "Derived from existing repository contracts/tests; not substituted for runtime evidence.",
      notTested: "The runner intentionally avoids destructive dialogs, real generation, and unprovisioned ComfyUI process operations.",
      blocked: "The required runtime endpoint or renderer state did not become available within a bounded timeout."
    },
    development: options.skipDevelopment ? { status: "not-tested", reason: "--skip-development" } : await runDevelopmentAttempt(outputRoot, options),
    scenarios: [],
    limitations: [
      "This harness measures the current production renderer and does not claim a before/after performance improvement without a matching pre-C04 baseline.",
      "No ComfyUI service or GPU generation was started by the harness; process ownership and real generation remain Not tested unless separately provisioned.",
      "The production launcher uses its normal 1280x860 BrowserWindow. The full UX viewport matrix remains a manual/capture responsibility; this run records the actual default viewport."
    ]
  };
  for (const scenario of scenarioDefinitions) {
    const scenarioEvidence = {
      id: scenario.id,
      description: scenario.description,
      cold: [],
      warm: []
    };
    const warmRoot = await ensureDirectory(path.join(outputRoot, "isolated", scenario.id, "warm"));
    const warmState = await buildFixtureState(scenario.id, fixture, defaultsModule.createDefaultState, warmRoot);
    await writeFixtureState(warmRoot, warmState);
    for (let sample = 1; sample <= options.samples; sample += 1) {
      const coldRoot = await ensureDirectory(path.join(outputRoot, "isolated", scenario.id, "cold", `sample-${sample}`));
      const coldState = await buildFixtureState(scenario.id, fixture, defaultsModule.createDefaultState, coldRoot);
      await writeFixtureState(coldRoot, coldState);
      console.log(`[c04] ${scenario.id} cold sample ${sample}/${options.samples}`);
      scenarioEvidence.cold.push(await runElectronSession({
        scenario,
        phase: "cold",
        sample,
        fixtureState: coldState,
        rootDirectory: coldRoot,
        outputRoot,
        options
      }));
      console.log(`[c04] ${scenario.id} warm sample ${sample}/${options.samples}`);
      scenarioEvidence.warm.push(await runElectronSession({
        scenario,
        phase: "warm",
        sample,
        fixtureState: warmState,
        rootDirectory: warmRoot,
        outputRoot,
        options
      }));
    }
    manifest.scenarios.push(scenarioEvidence);
  }
  manifest.summary = {
    runCount: manifest.scenarios.reduce((total, scenario) => total + scenario.cold.length + scenario.warm.length, 0),
    actualStartupRuns: manifest.scenarios.flatMap((scenario) => [...scenario.cold, ...scenario.warm]).filter((run) => run.startup.status === "actual").length,
    blockedStartupRuns: manifest.scenarios.flatMap((scenario) => [...scenario.cold, ...scenario.warm]).filter((run) => run.startup.status !== "actual").length,
    historyPerformanceRuns: manifest.scenarios.flatMap((scenario) => [...scenario.cold, ...scenario.warm]).filter((run) => run.historyPerformance !== "not-tested").length,
    migrationRuns: manifest.scenarios.flatMap((scenario) => [...scenario.cold, ...scenario.warm]).filter((run) => run.migration && run.migration !== "not-applicable").length
  };
  const manifestPath = path.join(outputRoot, "manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`[c04] evidence written to ${manifestPath}`);
  console.log(`[c04] summary ${JSON.stringify(manifest.summary)}`);
}

main().catch((error) => {
  console.error(`[c04] fatal: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 1;
});
