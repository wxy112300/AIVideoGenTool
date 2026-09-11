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
  "toplevel",
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
  --scenario <all|empty|history-500|history-media|legacy>  Scenario to run (default: all)
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

async function pointerClickAndWait(client, selector, readyExpression, timeoutMs = DEFAULT_OPERATION_TIMEOUT_MS) {
  const clicked = await evaluate(client, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!(element instanceof HTMLElement)) return false;
    const init = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerType: "mouse" };
    if (typeof PointerEvent === "function") element.dispatchEvent(new PointerEvent("pointerdown", init));
    element.dispatchEvent(new MouseEvent("mousedown", init));
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

const HISTORY_MEDIA_DEFINITION = Object.freeze({
  fixtureId: "history-media-v1",
  images: [
    { id: "image-01", category: "missing", filename: "missing-image.png", width: 1280, height: 720 },
    { id: "image-02", category: "regular", filename: "regular-wide.png", width: 1280, height: 720 },
    { id: "image-03", category: "regular", filename: "regular-square.jpg", width: 1024, height: 1024 },
    { id: "image-04", category: "regular", filename: "regular-tall.png", width: 720, height: 1080 },
    { id: "image-05", category: "regular", filename: "regular-small.png", width: 800, height: 600 },
    { id: "image-06", category: "large", filename: "large-wide.png", width: 2400, height: 1600 },
    { id: "image-07", category: "large", filename: "large-square.png", width: 2048, height: 2048 },
    { id: "image-08", category: "large", filename: "large-tall.png", width: 1800, height: 2400 },
    { id: "image-09", category: "transparent", filename: "transparent-wide.png", width: 1200, height: 900 },
    { id: "image-10", category: "transparent", filename: "transparent-tall.png", width: 900, height: 1200 },
    { id: "image-11", category: "duplicate", filename: "regular-wide.png", width: 1280, height: 720, sharedWith: "image-02" },
    { id: "image-12", category: "vertical", filename: "vertical-extra.png", width: 720, height: 1280 }
  ],
  videos: [
    { id: "video-01", category: "short-wide", filename: "short-wide-01.mp4", width: 640, height: 360, duration: 3 },
    { id: "video-02", category: "short-vertical", filename: "short-vertical-01.mp4", width: 360, height: 640, duration: 3 },
    { id: "video-03", category: "short-wide", filename: "short-wide-02.mp4", width: 640, height: 360, duration: 4 },
    { id: "video-04", category: "duplicate", filename: "short-wide-02.mp4", width: 640, height: 360, duration: 4, sharedWith: "video-03" },
    { id: "video-05", category: "long-wide", filename: "long-wide.mp4", width: 960, height: 540, duration: 8 },
    { id: "video-06", category: "long-vertical", filename: "long-vertical.mp4", width: 540, height: 960, duration: 8 },
    { id: "video-07", category: "black-intro", filename: "black-intro.mp4", width: 640, height: 360, duration: 3 },
    { id: "video-08", category: "short-wide", filename: "short-wide-03.mp4", width: 640, height: 360, duration: 3 },
    { id: "video-09", category: "short-wide", filename: "short-wide-04.mp4", width: 640, height: 360, duration: 3 },
    { id: "video-10", category: "short-wide", filename: "short-wide-05.mp4", width: 640, height: 360, duration: 3 },
    { id: "video-11", category: "short-wide", filename: "short-wide-06.mp4", width: 640, height: 360, duration: 3 },
    { id: "video-12", category: "missing", filename: "missing-video.mp4", width: 640, height: 360, duration: 3 }
  ]
});

async function runMediaTool(command, args, cwd) {
  try {
    await execFileAsync(command, args, { cwd, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
  } catch (error) {
    const detail = error?.stderr?.trim() || error?.message || String(error);
    throw new Error(`${path.basename(command)} failed: ${detail}`);
  }
}

async function createHistoryMediaFixture(rootDirectory, baseFixture) {
  const mediaDirectory = await ensureDirectory(path.join(rootDirectory, "media", "history-media"));
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  const ffprobe = process.env.FFPROBE_PATH || "ffprobe";
  const generatedImages = new Set();
  const imageColor = [
    ["regular-wide.png", "testsrc2=size=1280x720:rate=1"],
    ["regular-square.jpg", "testsrc2=size=1024x1024:rate=1"],
    ["regular-tall.png", "testsrc2=size=720x1080:rate=1"],
    ["regular-small.png", "testsrc2=size=800x600:rate=1"],
    ["large-wide.png", "testsrc2=size=2400x1600:rate=1"],
    ["large-square.png", "testsrc2=size=2048x2048:rate=1"],
    ["large-tall.png", "testsrc2=size=1800x2400:rate=1"],
    ["vertical-extra.png", "testsrc2=size=720x1280:rate=1"]
  ];
  for (const [filename, source] of imageColor) {
    const destination = path.join(mediaDirectory, filename);
    await runMediaTool(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", source,
      "-frames:v", "1", ...(filename.endsWith(".jpg") ? ["-q:v", "3"] : []), destination
    ], rootDirectory);
    generatedImages.add(filename);
  }
  for (const [filename, source] of [
    ["transparent-wide.png", "color=c=black@0.0:s=1200x900:d=1"],
    ["transparent-tall.png", "color=c=black@0.0:s=900x1200:d=1"]
  ]) {
    const destination = path.join(mediaDirectory, filename);
    await runMediaTool(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", source,
      "-frames:v", "1", "-vf", "format=rgba", "-pix_fmt", "rgba", destination
    ], rootDirectory);
    generatedImages.add(filename);
  }

  const generatedVideos = new Set();
  const videoDefinitions = HISTORY_MEDIA_DEFINITION.videos.filter((item) => item.category !== "missing" && !item.sharedWith);
  for (const item of videoDefinitions) {
    const destination = path.join(mediaDirectory, item.filename);
    const common = [
      "-hide_banner", "-loglevel", "error", "-y", "-an", "-c:v", "libx264", "-preset", "ultrafast",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", destination
    ];
    if (item.category === "black-intro") {
      await runMediaTool(ffmpeg, [
        "-f", "lavfi", "-i", `color=c=black:s=${item.width}x${item.height}:r=24:d=0.8`,
        "-f", "lavfi", "-i", `testsrc2=size=${item.width}x${item.height}:rate=24:duration=${Math.max(0.2, item.duration - 0.8)}`,
        "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0,format=yuv420p", ...common
      ], rootDirectory);
    } else {
      await runMediaTool(ffmpeg, [
        "-f", "lavfi", "-i", `testsrc2=size=${item.width}x${item.height}:rate=24:duration=${item.duration}`,
        ...common
      ], rootDirectory);
    }
    generatedVideos.add(item.filename);
  }

  const actualMetadata = { images: {}, videos: {} };
  for (const filename of generatedImages) {
    try {
      const result = await execFileAsync(ffprobe, [
        "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,pix_fmt",
        "-of", "json", path.join(mediaDirectory, filename)
      ], { cwd: rootDirectory, windowsHide: true });
      actualMetadata.images[filename] = JSON.parse(result.stdout).streams?.[0] ?? {};
    } catch {
      actualMetadata.images[filename] = {};
    }
  }
  for (const filename of generatedVideos) {
    try {
      const result = await execFileAsync(ffprobe, [
        "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height,duration",
        "-of", "json", path.join(mediaDirectory, filename)
      ], { cwd: rootDirectory, windowsHide: true });
      actualMetadata.videos[filename] = JSON.parse(result.stdout).streams?.[0] ?? {};
    } catch {
      actualMetadata.videos[filename] = {};
    }
  }

  const fixture = {
    videos: baseFixture.videos.slice(0, HISTORY_MEDIA_DEFINITION.videos.length).map((asset, index) => {
      const definition = HISTORY_MEDIA_DEFINITION.videos[index];
      const absolutePath = path.join(mediaDirectory, definition.filename);
      const versions = asset.versions.map((version) => ({
        ...version,
        width: definition.width,
        height: definition.height,
        duration: definition.duration,
        outputFilename: definition.filename,
        files: [{
          ...(version.files[0] ?? {}),
          filename: definition.filename,
          subfolder: "",
          type: "output",
          absolutePath
        }]
      }));
      const currentVersion = versions.find((version) => version.id === asset.defaultVersionId) ?? versions.at(-1);
      return {
        ...asset,
        outputFilename: definition.filename,
        width: definition.width,
        height: definition.height,
        duration: definition.duration,
        resolution: Math.min(definition.width, definition.height),
        files: currentVersion?.files ?? [],
        versions
      };
    }),
    images: baseFixture.images.slice(0, HISTORY_MEDIA_DEFINITION.images.length).map((project, index) => {
      const definition = HISTORY_MEDIA_DEFINITION.images[index];
      const absolutePath = path.join(mediaDirectory, definition.filename);
      return {
        ...project,
        versions: project.versions.map((version) => ({
          ...version,
          width: definition.width,
          height: definition.height,
          format: definition.filename.endsWith(".jpg") ? "jpg" : "png",
          file: {
            ...version.file,
            filename: definition.filename,
            subfolder: "",
            absolutePath
          }
        }))
      };
    })
  };
  return { fixture: makeElectronHistoryFixture(fixture), mediaDirectory, actualMetadata };
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
    window.__c04OperationLongTaskIndex = Array.isArray(window.__c04LongTasks)
      ? window.__c04LongTasks.length
      : 0;
    performance.mark(${JSON.stringify(`c04-${label}-start`)});
    return start;
  })()`);
  const actionResult = await action();
  if (readyExpression) await waitForDom(client, readyExpression);
  const snapshot = await evaluate(client, `(async () => {
    await new Promise((resolve) => {
      let remainingFrames = 40;
      const advance = () => {
        remainingFrames -= 1;
        if (remainingFrames <= 0) resolve();
        else window.requestAnimationFrame(advance);
      };
      window.requestAnimationFrame(advance);
    });
    await new Promise((resolve) => {
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(() => resolve(), { timeout: 250 });
      } else {
        window.setTimeout(resolve, 0);
      }
    });
    const end = performance.now();
    performance.mark(${JSON.stringify(`c04-${label}-end`)});
    const observed = Array.isArray(window.__c04LongTasks) ? window.__c04LongTasks : [];
    const operationLongTasks = observed
      .slice(Number(window.__c04OperationLongTaskIndex) || 0)
      .filter((entry) => entry.startTime + entry.duration >= Number(window.__c04OperationStart) - 1 && entry.startTime <= end + 1);
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
    const beforeScroll = await evaluate(client, `(() => {
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const target = Math.min(420, maxScroll);
      window.scrollTo(0, target);
      return { target, before: window.scrollY };
    })()`);
    await sleep(250);
    const opened = await collectOperation(
      client,
      `history-${kind}-detail-open`,
      () => pointerClickAndWait(client, cardSelector, `Boolean(document.querySelector(${JSON.stringify(detailSelector)}))`),
      `Boolean(document.querySelector(${JSON.stringify(detailSelector)}))`
    );
    const detailState = await evaluate(client, `({ opened: Boolean(document.querySelector(${JSON.stringify(detailSelector)})), scrollY: window.scrollY })`);
    const returned = await collectOperation(
      client,
      `history-${kind}-detail-return`,
      () => clickAndWait(client, ".history-detail-back-button", "Boolean(document.querySelector('.history-heading'))"),
      "Boolean(document.querySelector('.history-heading'))"
    );
    const after = await evaluate(client, `({
      returned: Boolean(document.querySelector('.history-heading')),
      scrollY: window.scrollY,
      target: ${JSON.stringify(beforeScroll.target)},
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    })`);
    const detail = {
      label: `history-${kind}-detail-round-trip`,
      status: opened.status === "actual" && returned.status === "actual" ? "actual" : "blocked",
      kind,
      beforeScroll,
      detailState,
      after,
      phases: { open: opened, return: returned },
      maxLongTaskMs: Math.max(opened.maxLongTaskMs ?? 0, returned.maxLongTaskMs ?? 0) || null,
      budget: {
        thresholdMs: 50,
        passed: [opened, returned].every((phase) => phase.maxLongTaskMs === null || phase.maxLongTaskMs <= 50)
      }
    };
    detail.kind = kind;
    evidence.details.push(detail);
  }

  const finalSnapshot = await collectPageSnapshot(client);
  if (finalSnapshot.layout.horizontalOverflow) {
    evidence.limitations.push("Real Chromium reported horizontal overflow during the 500-record page run.");
  }
  return evidence;
}

async function installHistoryMediaBenchmarkHook(client) {
  return evaluate(client, [
    "(() => {",
    "const counters = Object.create(null);",
    "const values = Object.create(null);",
    "const maxima = Object.create(null);",
    "const hook = {",
    "count(name, delta = 1) { counters[name] = (Number(counters[name]) || 0) + Number(delta || 0); },",
    "set(name, value) { values[name] = Number(value) || 0; },",
    "max(name, value) { maxima[name] = Math.max(Number(maxima[name]) || 0, Number(value) || 0); },",
    "begin(label) {",
    "  for (const key of Object.keys(counters)) delete counters[key];",
    "  for (const key of Object.keys(values)) delete values[key];",
    "  for (const key of Object.keys(maxima)) delete maxima[key];",
    "  values.label = label; values.startedAt = performance.now(); values.readImageIpcBytes = 0; performance.clearResourceTimings?.();",
    "},",
    "snapshot() { return { ...counters, ...values, ...maxima }; }",
    "};",
    "window.__historyMediaBenchmark = hook; hook.begin('startup'); return { installed: true };",
    "})()"
  ].join("\n"));
}

function historyMediaStateExpression(kind) {
  return [
    "(() => {",
    "const kind = " + JSON.stringify(kind) + ";",
    "const cards = [...document.querySelectorAll(kind === 'image' ? '.history-gallery-item.image-history-gallery-item' : '.history-gallery-item[data-history-kind=\"video\"]')];",
    "const stateFor = (card) => {",
    "  const surface = kind === 'image' ? card.querySelector('[data-image-media]') : card.querySelector('[data-history-media]');",
    "  const image = surface?.querySelector('img');",
    "  const ready = kind === 'image' ? Boolean(surface?.classList.contains('image-media-ready') && image?.complete && image?.naturalWidth > 0) : Boolean(surface?.classList.contains('has-history-cover') && image?.complete && image?.naturalWidth > 0);",
    "  const terminal = Boolean(surface?.classList.contains('media-error') || surface?.classList.contains('image-media-error') || surface?.classList.contains('image-media-unavailable'));",
    "  const rect = card.getBoundingClientRect();",
    "  const visible = rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;",
    "  return { ready, terminal, visible };",
    "};",
    "const states = cards.map(stateFor);",
    "return { now: performance.now(), total: states.length, ready: states.filter((state) => state.ready).length, visibleReady: states.filter((state) => state.ready && state.visible).length, terminal: states.filter((state) => state.terminal).length, visibleTerminal: states.filter((state) => state.terminal && state.visible).length, horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, gallery: Boolean(document.querySelector('.history-gallery')) };",
    "})()"
  ].join("\n");
}

async function measureHistoryMediaKind(client, kind, expectedAvailable, expectedMissing) {
  const startedAt = await evaluate(
    client,
    "window.__historyMediaBenchmark?.begin(" + JSON.stringify(kind) + "); performance.now()"
  );
  const route = kind === "video"
    ? await clickAndWait(client, '.nav-button[data-page="history"]', "Boolean(document.querySelector('.history-heading'))")
    : await clickAndWait(client, '[role="tab"][data-history-kind="image"]', 'Boolean(document.querySelector(\'[role="tab"][data-history-kind="image"][aria-selected="true"]\'))');
  let firstVisibleMs = null;
  let allAvailableVisibleMs = null;
  let missingTerminalMs = null;
  let lastState = null;
  let maxReady = 0;
  let maxTerminal = 0;
  let scrollSweepStarted = false;
  let scrollSweepReturned = false;
  const waitStartedAt = Date.now();
  while (Date.now() - waitStartedAt < 20_000) {
    lastState = await evaluate(client, historyMediaStateExpression(kind));
    maxReady = Math.max(maxReady, Number(lastState?.ready) || 0);
    maxTerminal = Math.max(maxTerminal, Number(lastState?.terminal) || 0);
    const elapsed = Math.max(0, Number(lastState?.now) - Number(startedAt));
    if (firstVisibleMs === null && Number(lastState?.visibleReady) > 0) firstVisibleMs = elapsed;
    if (!scrollSweepStarted && elapsed >= 500) {
      await evaluate(client, "window.scrollTo(0, Math.max(0, document.documentElement.scrollHeight - window.innerHeight))");
      scrollSweepStarted = true;
    } else if (scrollSweepStarted && !scrollSweepReturned && elapsed >= 5_000) {
      await evaluate(client, "window.scrollTo(0, 0)");
      scrollSweepReturned = true;
    }
    if (allAvailableVisibleMs === null && Number(lastState?.ready) >= expectedAvailable) allAvailableVisibleMs = elapsed;
    if (missingTerminalMs === null && Number(lastState?.terminal) >= expectedMissing) missingTerminalMs = elapsed;
    if (route.ready && maxReady >= expectedAvailable && maxTerminal >= expectedMissing) break;
    await sleep(80);
  }
  const metrics = await evaluate(client, "window.__historyMediaBenchmark?.snapshot?.() ?? {}");
  const resourceSummary = await evaluate(client, [
    "(() => {",
    "const resources = performance.getEntriesByType('resource').filter((entry) => typeof entry.name === 'string');",
    "const source = resources.filter((entry) => entry.name.startsWith('studio-media://history/'));",
    "const covers = resources.filter((entry) => entry.name.startsWith('studio-media://cover/'));",
    "return { sourceRequests: source.length, coverRequests: covers.length, sourceTransferBytes: source.reduce((total, entry) => total + (Number(entry.transferSize) || 0), 0), coverTransferBytes: covers.reduce((total, entry) => total + (Number(entry.transferSize) || 0), 0) };",
    "})()"
  ].join("\n"));
  const longTasks = await evaluate(client, [
    "(() => {",
    "const start = " + JSON.stringify(startedAt) + ";",
    "const end = performance.now();",
    "const entries = Array.isArray(window.__c04LongTasks) ? window.__c04LongTasks : [];",
    "return entries.filter((entry) => entry.startTime + entry.duration >= start - 1 && entry.startTime <= end + 1).map((entry) => ({ name: entry.name, startTime: entry.startTime, duration: entry.duration }));",
    "})()"
  ].join("\n"));
  return {
    kind,
    status: route.ready && maxReady >= expectedAvailable && maxTerminal >= expectedMissing ? "actual" : "incomplete",
    route,
    firstVisibleMs,
    allAvailableVisibleMs,
    missingTerminalMs,
    state: lastState,
    peakReady: maxReady,
    peakTerminal: maxTerminal,
    metrics: {
      ...metrics,
      readImageIpcBytes: Number(metrics.readImageIpcBytes) || 0,
      coverLookups: Number(metrics.coverLookups) || 0,
      coverHits: Number(metrics.coverHits) || 0,
      sourceImageLoads: Number(metrics.sourceImageLoads) || 0,
      sourceVideoLoads: Number(metrics.sourceVideoLoads) || 0,
      protocolSourceRequests: Number(resourceSummary.sourceRequests) || 0,
      protocolCoverRequests: Number(resourceSummary.coverRequests) || 0,
      protocolSourceTransferBytes: Number(resourceSummary.sourceTransferBytes) || 0,
      protocolCoverTransferBytes: Number(resourceSummary.coverTransferBytes) || 0,
      counterSource: Number(metrics.sourceImageLoads || metrics.sourceVideoLoads || metrics.coverLookups || metrics.objectUrlsCreated)
        ? "renderer-hook"
        : "protocol-dom-only",
      sourceDecodes: Number(metrics.sourceDecodes) || 0,
      seeks: Number(metrics.seeks) || 0,
      canceledRequests: Number(metrics.canceledRequests) || 0,
      objectUrlsCreated: Number(metrics.objectUrlsCreated) || 0,
      objectUrlsRevoked: Number(metrics.objectUrlsRevoked) || 0,
      liveObjectUrls: Number(metrics.liveObjectUrls) || 0,
      unreferencedBlobBytes: Number(metrics.unreferencedBlobBytes) || 0,
      activeOwnedVideoPeak: Number(metrics.activeOwnedVideoPeak) || 0
    },
    longTaskMaxMs: longTasks.length ? Math.max(...longTasks.map((entry) => entry.duration)) : null,
    longTaskCount: longTasks.length
  };
}

async function measureHistoryHover(client) {
  const started = await evaluate(client, [
    "(() => { const media = document.querySelector('[data-history-media]');",
    "if (!media) return null; const start = performance.now();",
    "media.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false })); return { start }; })()"
  ].join("\n"));
  if (!started) return { status: "not-tested", hoverFromEnterMs: null, retainedMs: null };
  let playingAt = null;
  const waitStartedAt = Date.now();
  while (Date.now() - waitStartedAt < 2_000) {
    const state = await evaluate(client, [
      "(() => { const media = document.querySelector('[data-history-media]');",
      "return media ? { playing: media.classList.contains('playing'), now: performance.now() } : null; })()"
    ].join("\n"));
    if (state?.playing) {
      playingAt = Number(state.now) - Number(started.start);
      break;
    }
    await sleep(30);
  }
  await evaluate(client, "document.querySelector('[data-history-media]')?.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }))");
  await sleep(650);
  return { status: playingAt === null ? "incomplete" : "actual", hoverFromEnterMs: playingAt, retainedMs: playingAt === null ? null : 500 };
}

async function measureHistoryDetailFirstFrame(client) {
  const started = await evaluate(client, "window.__historyMediaBenchmark?.begin('detail'); performance.now()");
  const opened = await pointerClickAndWait(client, '.history-gallery-item[data-history-kind="video"]', "Boolean(document.querySelector('.history-detail-hero'))");
  if (!opened.ready) return { status: "blocked", opened, detailFirstFrameMs: null };
  const frame = await evaluate(client, [
    "(() => {",
    "const video = document.querySelector('.history-player video');",
    "if (!(video instanceof HTMLVideoElement)) return { status: 'missing', detailFirstFrameMs: null };",
    "const start = " + JSON.stringify(started) + ";",
    "return new Promise((resolve) => {",
    "  let settled = false;",
    "  const finish = (status, fallback = false) => { if (settled) return; settled = true; resolve({ status, fallback, detailFirstFrameMs: performance.now() - start, readyState: video.readyState, currentTime: video.currentTime }); };",
    "  video.muted = true;",
    "  if (typeof video.requestVideoFrameCallback === 'function') video.requestVideoFrameCallback(() => finish('actual'));",
    "  else video.addEventListener('loadeddata', () => requestAnimationFrame(() => finish('actual', true)), { once: true });",
    "  void video.play().catch(() => finish('play-rejected'));",
    "  if (video.readyState >= 2 && typeof video.requestVideoFrameCallback !== 'function') requestAnimationFrame(() => finish('actual', true));",
    "  setTimeout(() => finish('timeout'), 8_000);",
    "});",
    "})()"
  ].join("\n"));
  const returned = await clickAndWait(client, ".history-detail-back-button", "Boolean(document.querySelector('.history-heading'))");
  return { ...frame, opened, returned };
}

async function runHistoryMediaViewportSmoke(client, runDirectory) {
  const viewports = [];
  for (const [width, height] of [[1280, 800], [1440, 900]]) {
    const override = { width, height, deviceScaleFactor: 1, mobile: false };
    try {
      await client.send("Emulation.setDeviceMetricsOverride", override);
      await clickAndWait(client, '.nav-button[data-page="history"]', "Boolean(document.querySelector('.history-heading'))");
      const snapshot = await evaluate(client, [
        "(() => ({",
        "viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },",
        "cards: document.querySelectorAll('.history-gallery-item').length,",
        "videoCards: document.querySelectorAll('.history-gallery-item[data-history-kind=\"video\"]').length,",
        "imageCards: document.querySelectorAll('.image-history-gallery-item').length,",
        "horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,",
        "galleryOriginalSrcs: [...document.querySelectorAll('.image-history-gallery-item img')].filter((image) => image.src.startsWith('studio-media://history/')).length",
        "}))()"
      ].join("\n"));
      const screenshotPath = path.join(runDirectory, "history-media-" + width + "x" + height + ".png");
      const screenshot = await captureScreenshot(client, screenshotPath);
      viewports.push({ status: "actual", requested: { width, height }, snapshot, screenshot });
    } catch (error) {
      viewports.push({ status: "blocked", requested: { width, height }, error: error.message });
    }
  }
  await client.send("Emulation.clearDeviceMetricsOverride").catch(() => undefined);
  return viewports;
}

async function runHistoryMediaPerformance(client, runDirectory, phase, stateCounts, expected) {
  const result = {
    status: "actual",
    stateCounts,
    phase,
    cacheMode: phase === "cold" ? "cold-disk" : phase === "warm" ? "warm-disk" : "warmup",
    rounds: {},
    warmMemory: "not-tested",
    hover: "not-tested",
    detail: "not-tested",
    uiSmoke: "not-tested",
    limitations: [
      "Metrics are from the controlled fixture and software-rendered isolated Electron session.",
      "activeOwnedVideoPeak counts app-created cover videos, not Chromium's hardware decoder process.",
      "No pre-change build was available in this run, so this is an after/current measurement rather than a before/after improvement claim."
    ]
  };
  result.rounds.video = await measureHistoryMediaKind(client, "video", expected.video, 1);
  result.rounds.image = await measureHistoryMediaKind(client, "image", expected.image, 1);
  if (phase !== "warmup") {
    await clickAndWait(client, '.nav-button[data-page="history"]', "Boolean(document.querySelector('.history-heading'))");
    await clickAndWait(client, '[role="tab"][data-history-kind="video"]', 'Boolean(document.querySelector(\'[role="tab"][data-history-kind="video"][aria-selected="true"]\'))');
    result.hover = await measureHistoryHover(client);
    result.detail = await measureHistoryDetailFirstFrame(client);
    result.uiSmoke = await runHistoryMediaViewportSmoke(client, runDirectory);
    await clickAndWait(client, '.nav-button[data-page="create"]', "Boolean(document.querySelector('.create-page-heading'))");
    result.warmMemory = {
      video: await measureHistoryMediaKind(client, "video", expected.video, 1),
      image: await measureHistoryMediaKind(client, "image", expected.image, 1)
    };
  }
  result.status = [result.rounds.video, result.rounds.image].every((round) => round.status === "actual") ? "actual" : "incomplete";
  return result;
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
  if (kind === "history-media") {
    const mediaFixture = await createHistoryMediaFixture(rootDirectory, fixture);
    state.history = mediaFixture.fixture.videos;
    state.imageHistory = mediaFixture.fixture.images;
    return state;
  }
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
    if (scenario.id === "history-media") await installHistoryMediaBenchmarkHook(client);
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
      } else if (scenario.id === "history-media") {
        result.historyPerformance = await runHistoryMediaPerformance(
          client,
          runDirectory,
          phase,
          {
            video: result.startup.state?.historyCount ?? null,
            image: result.startup.state?.imageHistoryCount ?? null
          },
          { video: 11, image: 11 }
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
  const vitePort = await findFreePort();
  const cdpPort = await findFreePort();
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
      VITE_DEV_SERVER_PORT: String(vitePort),
      C04_REMOTE_DEBUGGING_PORT: String(cdpPort),
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
    ports: { vite: vitePort, cdp: cdpPort },
    files: {
      stdout: path.join(runDirectory, "stdout.log"),
      stderr: path.join(runDirectory, "stderr.log")
    },
    limitations: []
  };
  try {
    const target = await waitForPageTarget(cdpPort, result.timeoutMs);
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
  const validScenarios = new Set(["empty", "history-500", "history-media", "legacy"]);
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
    ? ["empty", "history-500", "history-media", "legacy"]
    : [options.scenario];
  const scenarioDefinitions = selectedScenarios.map((id) => ({
    id,
    description: id === "empty"
      ? "fresh default state"
      : id === "history-500"
        ? "500 video and 500 image history records"
        : id === "history-media"
          ? "12 generated image/video history records with controlled cache and missing-file cases"
          : "schema v2 history state requiring current migration"
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
    historyMediaFixture: selectedScenarios.includes("history-media")
      ? {
          fixtureId: HISTORY_MEDIA_DEFINITION.fixtureId,
          expected: { videoCards: 12, imageCards: 12, availablePerKind: 11, missingPerKind: 1 },
          images: HISTORY_MEDIA_DEFINITION.images,
          videos: HISTORY_MEDIA_DEFINITION.videos
        }
      : null,
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
    if (scenario.id === "history-media") {
      console.log("[c04] history-media prewarming disk cache");
      await runElectronSession({
        scenario,
        phase: "warmup",
        sample: 0,
        fixtureState: warmState,
        rootDirectory: warmRoot,
        outputRoot,
        options
      });
    }
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
