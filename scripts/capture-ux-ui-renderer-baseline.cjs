const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const workspace = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(workspace, "package.json"), "utf8"));
const manifestPath = path.join(workspace, "docs", "ux-ui-renderer-baseline.manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const userDataRoot = path.join(os.tmpdir(), "local-video-studio-ux-renderer", `run-${process.pid}`);

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("in-process-gpu");
app.setPath("userData", userDataRoot);

function printHelp() {
  console.log(`Usage: electron scripts/capture-ux-ui-renderer-baseline.cjs [options]

Options:
  --help       Show this help.
  --dry-run    Print the capture matrix without starting Electron.
  --output     Override the output directory (default: temp/ux-ui-baseline/renderer).
  --fixture     Capture only the named fixture.
  --viewport    Capture only the named viewport.
  --diagnose    Print document overflow and the widest renderer elements.
  --smoke       Run the isolated Create prompt focus/input smoke check.
`);
}

function parseArgs(argv) {
  const options = { dryRun: false, output: null, fixture: null, viewport: null, diagnose: false, smoke: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--diagnose") options.diagnose = true;
    else if (argument === "--smoke") options.smoke = true;
    else if (argument === "--output") {
      options.output = argv[++index];
      if (!options.output) throw new Error("--output requires a directory");
    } else if (argument === "--fixture") {
      options.fixture = argv[++index];
      if (!options.fixture) throw new Error("--fixture requires an id");
    } else if (argument === "--viewport") {
      options.viewport = argv[++index];
      if (!options.viewport) throw new Error("--viewport requires an id");
    } else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

function uniqueViewports(fixture) {
  const ids = [...new Set(fixture.viewportGroups.flatMap((group) => manifest.viewportGroups[group] ?? []))];
  return ids.map((id) => manifest.viewports.find((viewport) => viewport.id === id)).filter(Boolean);
}

function captureEntries() {
  return manifest.fixtures.flatMap((fixture) => uniqueViewports(fixture).map((viewport) => ({ fixture, viewport })));
}

function selectedEntries(options) {
  return captureEntries().filter(({ fixture, viewport }) =>
    (!options.fixture || fixture.id === options.fixture) &&
    (!options.viewport || viewport.id === options.viewport)
  );
}

function outputRoot(options) {
  return path.resolve(workspace, options.output ?? manifest.captureOutputRoot);
}

function outputPath(root, fixture, viewport) {
  return path.join(root, viewport.id, `${fixture.id}.png`);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function executeJavaScript(window, code, timeoutMs = 5000) {
  return Promise.race([
    window.webContents.executeJavaScript(code),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`executeJavaScript timed out after ${timeoutMs}ms`)), timeoutMs))
  ]);
}

async function waitForWindow() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const window = BrowserWindow.getAllWindows()[0];
    if (window && !window.isDestroyed()) return window;
    await wait(50);
  }
  throw new Error("Renderer BrowserWindow did not become ready");
}

async function waitForDom(window, expression, label) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      if (await executeJavaScript(window, expression)) return;
    } catch (error) {
      if (attempt === 0) console.error(`[renderer-capture] ${label} first DOM check: ${error instanceof Error ? error.message : String(error)}`);
    }
    await wait(50);
  }
  let diagnostics = "unavailable";
  try {
    diagnostics = JSON.stringify(await executeJavaScript(window, "({ url: location.href, readyState: document.readyState, hasStudio: Boolean(window.studio), body: document.body?.innerText?.slice(0, 300) })"));
  } catch (error) {
    diagnostics = error instanceof Error ? error.message : String(error);
  }
  console.error(`[renderer-capture] diagnostics for ${label}: ${diagnostics}`);
  throw new Error(`Renderer did not become ready: ${label}`);
}

async function prepareSyntheticState() {
  await fsp.mkdir(userDataRoot, { recursive: true });
  const defaultsPath = path.join(workspace, "dist", "electron", "src", "core", "defaults.js");
  if (!fs.existsSync(defaultsPath)) {
    throw new Error(`Missing compiled defaults: ${defaultsPath}. Run npm.cmd run build first.`);
  }
  const { createDefaultState } = await import(pathToFileURL(defaultsPath).href);
  const state = createDefaultState();
  const fixtureMediaRoot = path.join(userDataRoot, "fixture-media");
  await fsp.mkdir(fixtureMediaRoot, { recursive: true });
  const imagePath = path.join(fixtureMediaRoot, "fixture-image.png");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
  await fsp.writeFile(imagePath, png);
  const videoPath = path.join(fixtureMediaRoot, "fixture-video.mp4");
  await fsp.writeFile(videoPath, Buffer.alloc(0));
  const now = new Date().toISOString();
  const earlier = new Date(Date.now() - 12 * 60 * 1000).toISOString();
  const videoVersionId = "fixture-video-version";
  const videoAssetId = "fixture-video-asset";
  const imageSourceVersionId = "fixture-image-source";
  const imageEditVersionId = "fixture-image-edit";
  const imageProjectId = "fixture-image-project";
  const imageReference = {
    id: "fixture-picture-1",
    pictureNumber: 1,
    absolutePath: imagePath,
    width: 1024,
    height: 576,
    role: "base"
  };
  state.history = [{
    mediaKind: "video",
    id: videoAssetId,
    taskId: "fixture-video-task",
    title: "夜色中的城市镜头",
    outputFilename: "fixture-video.mp4",
    createdAt: earlier,
    updatedAt: now,
    modelId: "minimax_h3_fl2va",
    favorite: true,
    rating: 4.5,
    tags: ["城市", "夜景"],
    duration: 5,
    resolution: 480,
    steps: 20,
    fps: 24,
    frameInterpolation: "off",
    ratio: "16:9",
    promptVersion: 0,
    attentionMode: "sage",
    spectrumMode: "off",
    spectrumModelAwareMode: "off",
    motion: "natural",
    prompt: "A cinematic night city street with soft reflections and a slow camera push.",
    seed: 1842,
    inputMode: "image",
    sourceWidth: 1024,
    sourceHeight: 576,
    startImagePath: imagePath,
    workflowPath: "fixture-workflow.json",
    startedAt: earlier,
    comfyPromptId: "fixture-comfy-prompt",
    comfyOutputs: {},
    files: [{ filename: "fixture-video.mp4", subfolder: "", type: "output", absolutePath: videoPath }],
    defaultVersionId: videoVersionId,
    versions: [{
      id: videoVersionId,
      taskId: "fixture-video-task",
      kind: "original",
      createdAt: earlier,
      outputFilename: "fixture-video.mp4",
      modelId: "minimax_h3_fl2va",
      width: 848,
      height: 480,
      duration: 5,
      promptVersion: 0,
      steps: 20,
      attentionMode: "sage",
      spectrumMode: "off",
      spectrumModelAwareMode: "off",
      fps: 24,
      frameInterpolation: "off",
      ratio: "16:9",
      motion: "natural",
      seed: 1842,
      workflowPath: "fixture-workflow.json",
      comfyPromptId: "fixture-comfy-prompt",
      comfyOutputs: {},
      files: [{ filename: "fixture-video.mp4", subfolder: "", type: "output", absolutePath: videoPath }],
      startedAt: earlier
    }]
  }];
  state.imageHistory = [{
    mediaKind: "image",
    id: imageProjectId,
    title: "雨后玻璃窗的人像",
    createdAt: earlier,
    updatedAt: now,
    favorite: false,
    rating: 4,
    tags: ["人像"],
    coverMode: "auto",
    nextVersionNumber: 3,
    versions: [
      {
        id: imageSourceVersionId,
        versionNumber: 1,
        kind: "source",
        createdAt: earlier,
        modelId: "source",
        workflowPath: "",
        prompt: "",
        promptVersion: 0,
        references: [imageReference],
        width: 1024,
        height: 576,
        format: "png",
        file: { filename: "fixture-image.png", subfolder: "", type: "input", absolutePath: imagePath }
      },
      {
        id: imageEditVersionId,
        versionNumber: 2,
        kind: "edit",
        parentVersionId: imageSourceVersionId,
        taskId: "fixture-image-task",
        runId: "fixture-image-run",
        createdAt: now,
        startedAt: earlier,
        modelId: "qwen-image-edit-2511",
        workflowPath: "fixture-image-workflow.json",
        prompt: "Add soft rain reflections and preserve the subject's expression.",
        promptVersion: 0,
        references: [imageReference],
        qualityProfile: "balanced-20",
        steps: 20,
        cfg: 4,
        targetResolution: "source",
        outputCount: 1,
        diffusionModelFilename: "fixture-model.safetensors",
        seed: 2811,
        width: 1024,
        height: 576,
        format: "png",
        file: { filename: "fixture-image.png", subfolder: "", type: "output", absolutePath: imagePath },
        comfyPromptId: "fixture-image-prompt",
        comfyOutputs: {}
      }
    ]
  }];
  state.queue = [
    {
      id: "fixture-waiting-task",
      taskType: "generation",
      status: "waiting",
      createdAt: now,
      updatedAt: now,
      outputFilename: "city-night-queued.mp4",
      modelId: "minimax_h3_fl2va",
      workflowPath: "fixture-workflow.json",
      duration: 5,
      steps: 20,
      fps: 24,
      seed: 1843,
      keepSeedOnCopy: false,
      attentionMode: "sage",
      spectrumMode: "off",
      spectrumModelAwareMode: "off",
      h3LivePreview: false,
      prompt: "A slow cinematic camera move through a rainy city street.",
      promptVersion: 0,
      h3ReferenceSlots: [],
      startImagePath: imagePath,
      sourceWidth: 1024,
      sourceHeight: 576,
      endImagePath: "",
      ratio: "16:9",
      resolution: 480,
      frameInterpolation: "off",
      motion: "natural",
      videoLoras: []
    },
    {
      id: "fixture-failed-task",
      taskType: "generation",
      status: "failed",
      createdAt: earlier,
      updatedAt: now,
      outputFilename: "portrait-retry.mp4",
      modelId: "minimax_h3_fl2va",
      workflowPath: "fixture-workflow.json",
      duration: 5,
      steps: 20,
      fps: 24,
      seed: 2910,
      keepSeedOnCopy: false,
      attentionMode: "sage",
      spectrumMode: "off",
      spectrumModelAwareMode: "off",
      h3LivePreview: false,
      prompt: "A portrait subject turns toward a warm window light.",
      promptVersion: 0,
      h3ReferenceSlots: [],
      startImagePath: imagePath,
      sourceWidth: 1024,
      sourceHeight: 576,
      endImagePath: "",
      ratio: "16:9",
      resolution: 480,
      frameInterpolation: "off",
      motion: "natural",
      videoLoras: [],
      error: "ComfyUI 连接在执行阶段中断，可调整参数后重试。"
    }
  ];
  state.queueRunning = false;
  state.queueLifecycle = "idle";
  await fsp.writeFile(path.join(userDataRoot, "studio-state.json"), JSON.stringify(state, null, 2), "utf8");
  return state;
}

async function clickAndWait(window, selector, expression, label) {
  const alreadyActive = await executeJavaScript(window, `(() => { const element = document.querySelector(${JSON.stringify(selector)}); return Boolean(element && (element.classList.contains("active") || element.classList.contains("secondary") || element.getAttribute("aria-pressed") === "true" || element.getAttribute("aria-selected") === "true")); })()`);
  if (alreadyActive) return;
  console.log(`[renderer-capture] action ${label}`);
  await executeJavaScript(window, `setTimeout(() => document.querySelector(${JSON.stringify(selector)})?.click(), 0); true`);
  if (expression) await waitForDom(window, expression, label);
  await wait(80);
}

async function setupFixture(window, fixture) {
  const setup = fixture.setup ?? { kind: "static" };
  const routeSelectors = {
    create: [".nav-button[data-page=\"create\"]", ".create-page-heading"],
    queue: [".nav-button[data-page=\"queue\"]", ".queue-page-heading"],
    history: [".nav-button[data-page=\"history\"]", ".history-heading"],
    settings: [".nav-button[data-page=\"settings\"]", ".settings-layout"]
  };
  if (fixture.route === "create" || fixture.route === "queue" || fixture.route === "history" || fixture.route === "settings") {
    const [selector, ready] = routeSelectors[fixture.route];
    await clickAndWait(window, selector, `Boolean(document.querySelector(${JSON.stringify(ready)}))`, `${fixture.id} route`);
  }
  if (setup.kind === "create-mode") {
    await clickAndWait(
      window,
      `[data-input-mode="${setup.value}"]`,
      `Boolean(document.querySelector('[data-input-mode="${setup.value}"][aria-pressed="true"]'))`,
      `${fixture.id} mode`
    );
  }
  if (setup.kind === "history") {
    await clickAndWait(
      window,
      `[data-history-kind="${setup.historyKind}"]`,
      `Boolean(document.querySelector('[data-history-kind="${setup.historyKind}"][aria-selected="true"]'))`,
      `${fixture.id} kind`
    );
    await clickAndWait(
      window,
      `[data-history-layout="${setup.layout}"]`,
      `Boolean(document.querySelector('[data-history-layout="${setup.layout}"].secondary'))`,
      `${fixture.id} layout`
    );
  }
  if (setup.kind === "history-detail") {
    await clickAndWait(window, ".nav-button[data-page=\"history\"]", "Boolean(document.querySelector('.history-heading'))", `${fixture.id} history route`);
    await clickAndWait(
      window,
      `[data-history-kind="${setup.historyKind}"]`,
      `Boolean(document.querySelector('[data-history-kind="${setup.historyKind}"][aria-selected="true"]'))`,
      `${fixture.id} kind`
    );
    const cardSelector = setup.historyKind === "image" ? "[data-open-image-history]" : "[data-open-history]";
    const detailSelector = setup.historyKind === "image" ? ".image-history-detail-layout" : ".history-detail-hero";
    await clickAndWait(window, cardSelector, `Boolean(document.querySelector(${JSON.stringify(detailSelector)}))`, `${fixture.id} detail`);
  }
  if (setup.kind === "settings-tab") {
    await clickAndWait(window, `[data-settings-tab="${setup.value}"]`, `Boolean(document.querySelector('[data-settings-tab="${setup.value}"].active'))`, `${fixture.id} tab`);
  }
  const selectors = {
    create: ".create-page-heading",
    queue: ".queue-page-heading",
    history: ".history-heading",
    "history-detail": ".history-detail-hero",
    "image-history-detail": ".image-history-detail-layout",
    settings: ".settings-layout"
  };
  await waitForDom(window, `Boolean(document.querySelector(${JSON.stringify(selectors[fixture.route])}))`, fixture.id);
  await executeJavaScript(window, "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await wait(160);
}

async function diagnoseLayout(window) {
  return executeJavaScript(window, `(() => {
    const rectFor = (element) => {
      const rect = element.getBoundingClientRect();
      const styles = getComputedStyle(element);
      return {
        tag: element.tagName.toLowerCase(),
        id: element.id,
        className: typeof element.className === "string" ? element.className : "",
        left: Math.round(rect.left * 10) / 10,
        right: Math.round(rect.right * 10) / 10,
        width: Math.round(rect.width * 10) / 10,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        display: styles.display,
        widthCss: styles.width,
        minWidth: styles.minWidth,
        gridTemplateColumns: styles.gridTemplateColumns,
        overflowX: styles.overflowX
      };
    };
    const viewportWidth = document.documentElement.clientWidth;
    const elements = [...document.querySelectorAll("*")].map(rectFor);
    return {
      viewportWidth,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      overflowing: elements
        .filter((item) => item.right > viewportWidth + 1 || item.left < -1 || item.scrollWidth > item.clientWidth + 1)
        .sort((left, right) => Math.max(right.right - viewportWidth, right.scrollWidth - right.clientWidth) - Math.max(left.right - viewportWidth, left.scrollWidth - left.clientWidth))
        .slice(0, 30)
    };
  })()`);
}

async function runInteractionSmoke(window, fixture, viewport) {
  if (fixture.id !== "create-image-edit" || viewport.id !== "900x800") return;
  const marker = " [renderer smoke]";
  const before = await executeJavaScript(window, `(() => {
    const field = document.querySelector("#image-edit-prompt-input");
    if (!field) return null;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
    const initial = field.value;
    field.setRangeText(${JSON.stringify(marker)}, field.selectionStart, field.selectionEnd, "end");
    field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: ${JSON.stringify(marker)} }));
    return { initial, expected: initial + ${JSON.stringify(marker)}, activeElement: document.activeElement?.id ?? "" };
  })()`);
  if (!before) throw new Error("Create Image Edit prompt field was not found during smoke check");
  await wait(240);
  const after = await executeJavaScript(window, `(() => {
    const field = document.querySelector("#image-edit-prompt-input");
    return { value: field?.value ?? "", activeElement: document.activeElement?.id ?? "" };
  })()`);
  const passed = after.value === before.expected && after.activeElement === "image-edit-prompt-input";
  console.log(`[renderer-smoke] ${fixture.id} ${viewport.id} ${JSON.stringify({ ...before, ...after, passed })}`);
  if (!passed) throw new Error(`Create prompt focus/input smoke failed: ${JSON.stringify({ ...before, ...after })}`);
}

async function writeMockPreload(state) {
  const preloadPath = path.join(userDataRoot, "renderer-fixture-preload.cjs");
  const imageDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const source = `const { contextBridge } = require("electron");
let currentState = ${JSON.stringify(state)};
const imageDataUrl = ${JSON.stringify(imageDataUrl)};
const clone = (value) => JSON.parse(JSON.stringify(value));
const stateListeners = new Set();
const runtimeState = { phase: "stopped", ownership: "none", endpoint: "", message: "ComfyUI 未运行", updatedAt: new Date().toISOString(), operationId: 0 };
const result = (message = "capture fixture") => ({ ok: true, message });
const emitState = () => stateListeners.forEach((listener) => listener(clone(currentState)));
const metrics = () => ({ sampledAt: new Date().toISOString(), cpuPercent: 12, memoryUsedBytes: 0, memoryTotalBytes: 0, gpuPercent: null, vramUsedBytes: null, vramTotalBytes: null, gpuTemperature: null, comfyConnected: false });
const emptyScan = (settings) => ({
  scannedAt: new Date().toISOString(), userHome: "", comfyRoot: "", comfyUrl: settings.comfyUrl, comfyInstallDirectory: settings.comfyInstallDirectory, comfySourceDirectory: "", comfyInstallType: "", comfyInstallations: [], pythonRuntimes: [], gpus: [], modelDirectory: settings.modelDirectory, outputDirectory: settings.outputDirectory, llamaServer: { found: false, path: "", directory: "", source: "" }, llamaCppPython: { packageName: "llama-cpp-python", pythonPath: "", pythonVersion: "", packageVersion: "", torchVersion: "", cudaVersion: "", installed: false, importable: false, gpuOffload: null, ready: false, detail: "", error: "" }, comfyCompatibility: { version: "", revision: "", h3MinimumVersion: "", h3MinimumRevision: "", h3RecommendedVersion: "", h3CoreSupported: false, coreNodes: [], promptCoreSupported: false, promptCoreNodes: [], checkedFrom: "", updateMode: "unsupported", updateHint: "", compatibilityState: "unknown" }, attentionAcceleration: { pythonPath: "", pythonVersion: "", torchVersion: "", cudaVersion: "", gpuName: "", gpuArchitecture: "", sageAttentionVersion: "", tritonVersion: "", kjNodesInstalled: false, kjNodesCompatible: false, recommendedSageVersion: "", recommendedWheel: "", supported: false, ready: false, detail: "" }, items: [], modelProfiles: [], customNodes: [], workflowDependencies: [], issues: []
});
const emptyLibraryScan = { libraryDirectory: "", totalReferences: 0, managedReferences: 0, archiveCandidates: 0, missingReferences: [], orphanFiles: [], archiveBytes: 0, orphanBytes: 0 };
const api = {
  getState: async () => clone(currentState), getComfyRuntimeState: async () => clone(runtimeState), getAppVersion: async () => ${JSON.stringify(packageJson.version)}, setSettingsDirty: async () => {}, respondWindowClose: async () => {},
  saveDraft: async (draft) => { currentState.draft = clone(draft); emitState(); return clone(currentState); }, saveImageDraft: async (draft) => { currentState.imageDraft = clone(draft); emitState(); return clone(currentState); }, saveSettings: async (settings) => { currentState.settings = clone(settings); emitState(); return clone(currentState); }, setQueueH3LivePreview: async (enabled) => { currentState.settings.h3LivePreview = enabled; emitState(); return clone(currentState); },
  pickImage: async () => null, pickVideo: async () => null, getDroppedFilePath: (file) => file?.path ?? "", saveClipboardImage: async () => "", readImageMarkup: async () => null, saveImageMarkup: async () => ({}), saveImageMask: async () => ({}), saveImageCrop: async () => null, pickWorkflow: async () => null, pickPython: async () => null, inspectWorkflow: async () => ({ supportsEndImage: false, supportsVideoExtension: false }), getBundledWorkflow: async () => null,
  getPerformanceMetrics: async () => metrics(), readAppLogs: async () => ({ directory: "", retentionDays: 7, records: [], text: "" }), openAppLogDirectory: async () => true, reportRendererError: async () => {}, reportUserAction: async () => {}, reportNotification: async () => {}, pickDirectory: async () => null, readImage: async () => imageDataUrl, readHistoryCover: async () => imageDataUrl, saveHistoryCover: async () => true, showItemInFolder: async () => true, openDirectory: async () => true, copyFile: async () => result(), openExternal: async () => true,
  enhancePrompt: async () => "", cancelPrompt: async () => result(), startPromptModel: async () => result(), releasePromptModel: async () => result(), testConnection: async () => result(), scanEnvironment: async (settings) => emptyScan(settings), startLocalService: async () => result(), restartLocalService: async () => result(), forceStopComfyProcesses: async () => result(), updateComfyUi: async () => result(), repairEnvironmentIssue: async () => result(), installCustomNode: async () => result(), installWorkflowDependency: async () => result(), installLlamaCppPython: async () => result(), installAttentionAcceleration: async () => result(),
  enqueue: async () => clone(currentState), enqueueExtension: async () => clone(currentState), enqueueImageEdit: async () => clone(currentState), enqueueUpscale: async () => clone(currentState), updateUpscaleTask: async () => clone(currentState), removeTask: async () => clone(currentState), startQueue: async () => clone(currentState), pauseQueue: async () => clone(currentState), cancelTask: async () => clone(currentState), moveTask: async () => clone(currentState), duplicateTask: async () => clone(currentState), resetTask: async () => clone(currentState), deleteHistoryAsset: async () => clone(currentState), updateHistoryMetadata: async () => clone(currentState), setImageHistoryCover: async () => clone(currentState), deleteImageHistoryVersion: async () => clone(currentState),
  onStateChanged: (listener) => { stateListeners.add(listener); return () => stateListeners.delete(listener); }, onComfyRuntimeStateChanged: () => () => {}, onTaskPreview: () => () => {}, onPromptProgress: () => () => {}, onWindowCloseRequest: () => () => {}, onAttentionInstallLog: () => () => {}, onDependencyInstallLog: () => () => {}, onHistoryMigrationProgress: () => () => {}, scanImageAssetLibrary: async () => clone(emptyLibraryScan), organizeImageAssetLibrary: async () => ({ scan: clone(emptyLibraryScan), archivedFiles: 0, reorganizedFiles: 0, updatedReferences: 0, cleanedFiles: 0, cleanedDirectories: 0, cleanedBytes: 0 }), cleanupImageAssetLibrary: async () => ({ scan: clone(emptyLibraryScan), archivedFiles: 0, reorganizedFiles: 0, updatedReferences: 0, cleanedFiles: 0, cleanedDirectories: 0, cleanedBytes: 0 }), onImageAssetLibraryProgress: () => () => {}
};
contextBridge.exposeInMainWorld("studio", api);`;
  await fsp.writeFile(preloadPath, source, "utf8");
  return preloadPath;
}

async function captureAll(options, preloadPath) {
  const entries = selectedEntries(options);
  const root = outputRoot(options);
  await fsp.mkdir(root, { recursive: true });
  for (const viewport of manifest.viewports) {
    const viewportEntries = entries.filter((entry) => entry.viewport.id === viewport.id);
    if (!viewportEntries.length) continue;
    const window = new BrowserWindow({
      width: viewport.width,
      height: viewport.height,
      show: false,
      webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: false }
    });
    window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
      console.log(`[renderer-console:${level}] ${message} (${sourceId}:${line})`);
    });
    window.webContents.on("render-process-gone", (_event, details) => {
      console.error(`[renderer-capture] render process gone: ${JSON.stringify(details)}`);
    });
    window.webContents.on("unresponsive", () => console.error("[renderer-capture] renderer unresponsive"));
    window.webContents.on("responsive", () => console.log("[renderer-capture] renderer responsive"));
    window.setMinimumSize(320, 320);
    window.show();
    try {
      for (const { fixture } of viewportEntries) {
        console.log(`[renderer-capture] loading ${fixture.id} ${viewport.id}`);
        await window.loadURL(process.env.UX_UI_RENDERER_URL || "http://127.0.0.1:5173/");
        await waitForDom(window, "Boolean(document.querySelector('.app-shell'))", `${fixture.id} initial shell`);
        await setupFixture(window, fixture);
        if (options.diagnose) console.log(`[renderer-diagnose] ${fixture.id} ${viewport.id} ${JSON.stringify(await diagnoseLayout(window))}`);
        if (options.smoke) await runInteractionSmoke(window, fixture, viewport);
        const screenshot = await window.webContents.capturePage();
        const target = outputPath(root, fixture, viewport);
        await fsp.mkdir(path.dirname(target), { recursive: true });
        await fsp.writeFile(target, screenshot.toPNG());
        console.log(`${fixture.id} ${viewport.id} -> ${path.relative(workspace, target)}`);
      }
    } finally {
      window.destroy();
    }
  }
  console.log(`Captured ${entries.length} current-renderer screenshots in ${path.relative(workspace, root)}`);
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  printHelp();
  app.quit();
} else if (options.dryRun) {
  const entries = selectedEntries(options);
  console.log(`Baseline source: ${manifest.sourceKind}`);
  console.log(`Fixtures: ${manifest.fixtures.length}`);
  console.log(`Screenshots: ${entries.length}`);
  for (const { fixture, viewport } of entries) console.log(`${fixture.id}\t${viewport.id}\t${fixture.route}`);
  app.quit();
} else {
  (async () => {
    try {
      console.log("[renderer-capture] preparing state");
      const state = await prepareSyntheticState();
      console.log("[renderer-capture] state ready");
      const preloadPath = await writeMockPreload(state);
      console.log("[renderer-capture] preload ready");
      await app.whenReady();
      console.log("[renderer-capture] app ready");
      app.on("window-all-closed", (event) => event.preventDefault());
      await captureAll(options, preloadPath);
    } catch (error) {
      console.error(error instanceof Error ? error.stack : String(error));
      process.exitCode = 1;
    } finally {
      app.exit(process.exitCode ?? 0);
    }
  })();
}
