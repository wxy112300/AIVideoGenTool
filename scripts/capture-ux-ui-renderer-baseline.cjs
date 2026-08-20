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
  --locale      Capture with zh-CN, zh-TW, or en-US UI copy (default: zh-CN).
  --zoom       Capture at page zoom 1, 1.25, or 1.5 (default: 1).
  --diagnose    Print document overflow and the widest renderer elements.
  --smoke       Run the isolated Create, Queue, History, or History detail interaction smoke check.
  --history-count Capture History fixtures with 1 or 8 mixed-ratio records (default: 1).
  --queue-state Override a queue-state fixture: mixed, running, paused, failed, recoverable, empty, or multiple-pending.
  --settings-states Capture the P16 Settings offline/scanning/installing/partial/error evidence matrix.
`);
}

function parseArgs(argv) {
  const options = { dryRun: false, output: null, fixture: null, viewport: null, locale: "zh-CN", zoom: 1, diagnose: false, smoke: false, historyCount: 1, queueState: null, settingsStates: false };
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
    } else if (argument === "--locale") {
      options.locale = argv[++index];
      if (!options.locale || !["zh-CN", "zh-TW", "en-US"].includes(options.locale)) {
        throw new Error("--locale must be zh-CN, zh-TW, or en-US");
      }
    } else if (argument === "--zoom") {
      options.zoom = Number(argv[++index]);
      if (![1, 1.25, 1.5].includes(options.zoom)) {
        throw new Error("--zoom must be 1, 1.25, or 1.5");
      }
    } else if (argument === "--history-count") {
      options.historyCount = Number(argv[++index]);
      if (![1, 8].includes(options.historyCount)) {
        throw new Error("--history-count must be 1 or 8");
      }
    } else if (argument === "--queue-state") {
      options.queueState = argv[++index];
      if (!options.queueState || !["mixed", "running", "paused", "failed", "recoverable", "empty", "multiple-pending"].includes(options.queueState)) {
        throw new Error("--queue-state must be mixed, running, paused, failed, recoverable, empty, or multiple-pending");
      }
    } else if (argument === "--settings-states") options.settingsStates = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

function uniqueViewports(fixture) {
  const ids = [...new Set(fixture.viewportGroups.flatMap((group) => manifest.viewportGroups[group] ?? []))];
  return ids.map((id) => manifest.viewports.find((viewport) => viewport.id === id)).filter(Boolean);
}

function captureEntries(options = {}) {
  const fixtures = options.settingsStates ? (manifest.settingsStateFixtures ?? []) : manifest.fixtures;
  return fixtures.flatMap((fixture) => uniqueViewports(fixture).map((viewport) => ({ fixture, viewport })));
}

function selectedEntries(options) {
  return captureEntries(options).filter(({ fixture, viewport }) =>
    (!options.fixture || fixture.id === options.fixture) &&
    (!options.viewport || viewport.id === options.viewport)
  );
}

function outputRoot(options) {
  const defaultRoot = options.settingsStates
    ? path.join(manifest.captureOutputRoot, "settings-states")
    : manifest.captureOutputRoot;
  return path.resolve(workspace, options.output ?? defaultRoot);
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
    diagnostics = JSON.stringify(await executeJavaScript(window, "({ url: location.href, readyState: document.readyState, hasStudio: Boolean(window.studio), activeId: document.activeElement?.id ?? '', activeTag: document.activeElement?.tagName ?? '', selectedTab: document.querySelector('[role=tab][aria-selected=true]')?.id ?? '', body: document.body?.innerText?.slice(0, 300) })"));
  } catch (error) {
    diagnostics = error instanceof Error ? error.message : String(error);
  }
  console.error(`[renderer-capture] diagnostics for ${label}: ${diagnostics}`);
  throw new Error(`Renderer did not become ready: ${label}`);
}

async function prepareSyntheticState(locale = "zh-CN", historyCount = 1) {
  await fsp.mkdir(userDataRoot, { recursive: true });
  const defaultsPath = path.join(workspace, "dist", "electron", "src", "core", "defaults.js");
  if (!fs.existsSync(defaultsPath)) {
    throw new Error(`Missing compiled defaults: ${defaultsPath}. Run npm.cmd run build first.`);
  }
  const { createDefaultState } = await import(pathToFileURL(defaultsPath).href);
  const state = createDefaultState();
  state.settings.uiLocale = locale;
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
  if (historyCount > 1) {
    const cloneFixture = (value) => JSON.parse(JSON.stringify(value));
    const fixtureRatios = [
      { width: 848, height: 480 },
      { width: 480, height: 848 },
      { width: 1024, height: 576 },
      { width: 640, height: 640 },
      { width: 1280, height: 720 },
      { width: 720, height: 1280 },
      { width: 1024, height: 768 },
      { width: 768, height: 1024 }
    ];
    const videoSeed = state.history[0];
    state.history = Array.from({ length: historyCount }, (_, index) => {
      const suffix = index + 1;
      const ratio = fixtureRatios[index % fixtureRatios.length];
      const asset = cloneFixture(videoSeed);
      asset.id = `${videoSeed.id}-${suffix}`;
      asset.taskId = `${videoSeed.taskId}-${suffix}`;
      asset.title = `${videoSeed.title} ${suffix}`;
      asset.comfyPromptId = `${videoSeed.comfyPromptId}-${suffix}`;
      asset.defaultVersionId = `${videoSeed.defaultVersionId}-${suffix}`;
      asset.sourceWidth = ratio.width;
      asset.sourceHeight = ratio.height;
      asset.versions = asset.versions.map((version) => ({
        ...version,
        id: `${version.id}-${suffix}`,
        taskId: `${version.taskId}-${suffix}`,
        comfyPromptId: `${version.comfyPromptId}-${suffix}`,
        width: ratio.width,
        height: ratio.height
      }));
      return asset;
    });
    const imageSeed = state.imageHistory[0];
    state.imageHistory = Array.from({ length: historyCount }, (_, index) => {
      const suffix = index + 1;
      const ratio = fixtureRatios[index % fixtureRatios.length];
      const project = cloneFixture(imageSeed);
      const versionIds = new Map(imageSeed.versions.map((version) => [version.id, `${version.id}-${suffix}`]));
      project.id = `${imageSeed.id}-${suffix}`;
      project.title = `${imageSeed.title} ${suffix}`;
      project.versions = project.versions.map((version) => ({
        ...version,
        id: `${version.id}-${suffix}`,
        parentVersionId: version.parentVersionId ? versionIds.get(version.parentVersionId) : undefined,
        taskId: version.taskId ? `${version.taskId}-${suffix}` : version.taskId,
        runId: version.runId ? `${version.runId}-${suffix}` : version.runId,
        comfyPromptId: version.comfyPromptId ? `${version.comfyPromptId}-${suffix}` : version.comfyPromptId,
        width: ratio.width,
        height: ratio.height,
        references: version.references?.map((reference) => ({
          ...reference,
          width: ratio.width,
          height: ratio.height
        }))
      }));
      return project;
    });
  }
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
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await wait(attempt === 0 ? 120 : 220);
    await executeJavaScript(window, `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return false; element.click(); return true; })()`);
    if (!expression) return;
    try {
      await waitForDom(window, expression, label);
      await wait(80);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
}

async function setupFixture(window, fixture, options) {
  const setup = fixture.setup ?? { kind: "static" };
  const routeSelectors = {
    create: [".nav-button[data-page=\"create\"]", ".create-page-heading"],
    queue: [".nav-button[data-page=\"queue\"]", ".queue-page-heading"],
    history: [".nav-button[data-page=\"history\"]", ".history-heading"],
    settings: [".nav-button[data-page=\"settings\"]", ".settings-layout"]
  };
  if (fixture.settingsState) {
    const selectedSettingsFixture = await executeJavaScript(window, `window.studio.setSettingsFixture?.(${JSON.stringify(fixture.settingsState)}) ?? "missing"`);
    console.log(`[renderer-capture] settings fixture ${fixture.id}: ${selectedSettingsFixture}`);
  }
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
  if (setup.kind === "queue-state") {
    const queueState = options.queueState ?? setup.value;
    await executeJavaScript(window, `window.studio.setQueueFixture?.(${JSON.stringify(queueState)}); true`);
    await wait(180);
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
  if (fixture.settingsState === "partial" || fixture.settingsState === "installing") {
    await waitForDom(window, "Boolean(document.querySelector('.environment-summary')) || document.querySelectorAll('.custom-node-card').length > 2", `${fixture.id} scan complete`);
  }
  if (fixture.settingsState === "error") {
    await waitForDom(window, "Boolean(document.querySelector('.settings-content .environment-issues.error, .settings-content .comfy-compatibility.missing')) && !document.querySelector('#scan-environment[disabled]')", `${fixture.id} scan error settled`);
  }
  if (fixture.settingsState === "installing") {
    const clicked = await executeJavaScript(window, `(() => {
      const button = document.querySelector('[data-install-node]');
      if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
      button.click();
      return true;
    })()`);
    if (!clicked) throw new Error(`${fixture.id} did not expose an installable node`);
    await waitForDom(window, "Boolean(document.querySelector('[data-install-node][disabled]'))", `${fixture.id} node installing`);
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
      historyGalleries: [...document.querySelectorAll('.history-gallery')].map((gallery) => ({
        className: gallery.className,
        cardCount: gallery.querySelectorAll('.history-gallery-item').length,
        clientWidth: gallery.clientWidth,
        gridTemplateColumns: getComputedStyle(gallery).gridTemplateColumns
      })),
      overflowing: elements
        .filter((item) => item.right > viewportWidth + 1 || item.left < -1 || item.scrollWidth > item.clientWidth + 1)
        .sort((left, right) => Math.max(right.right - viewportWidth, right.scrollWidth - right.clientWidth) - Math.max(left.right - viewportWidth, left.scrollWidth - left.clientWidth))
        .slice(0, 30)
    };
  })()`);
}

async function runQueueInteractionSmoke(window, fixture, viewport) {
  const queueState = await executeJavaScript(window, "window.studio.getFixtureQueueState?.() ?? null");
  if (queueState !== "running") return;
  const before = await executeJavaScript(window, `(() => ({
    runningCard: Boolean(document.querySelector(".task-card.running.expanded")),
    progress: document.querySelector("#running-progress-label")?.textContent ?? "",
    stage: document.querySelector("#running-stage")?.textContent ?? "",
    elapsed: document.querySelector("#running-elapsed")?.textContent ?? "",
    previewActive: document.querySelector("[data-live-preview-image]")?.dataset.livePreviewActive === "true",
    metricCpu: document.querySelector("#metric-cpu")?.textContent ?? ""
  }))()`);
  const emitted = await executeJavaScript(window, "window.studio.emitFixtureRunningSmoke?.() === true");
  await waitForDom(
    window,
    "document.querySelector('[data-live-preview-image]')?.dataset.livePreviewActive === 'true' && document.querySelector('#running-progress-label')?.textContent === '67%' && document.querySelector('#running-stage')?.textContent === '渲染关键帧'",
    "queue running progress and preview patch"
  );
  await wait(2_250);
  const after = await executeJavaScript(window, `(() => ({
    runningCard: Boolean(document.querySelector(".task-card.running.expanded")),
    progress: document.querySelector("#running-progress-label")?.textContent ?? "",
    stage: document.querySelector("#running-stage")?.textContent ?? "",
    elapsed: document.querySelector("#running-elapsed")?.textContent ?? "",
    previewActive: document.querySelector("[data-live-preview-image]")?.dataset.livePreviewActive === "true",
    previewSource: document.querySelector("[data-live-preview-image]")?.dataset.livePreviewSource ?? "",
    metricCpu: document.querySelector("#metric-cpu")?.textContent ?? "",
    pause: Boolean(document.querySelector("#pause-queue")),
    cancel: Boolean(document.querySelector("[data-cancel]"))
  }))()`);
  const checks = {
    runningStateEmitted: emitted,
    runningCard: before.runningCard && after.runningCard,
    progressPatched: after.progress === "67%",
    stagePatched: after.stage === "渲染关键帧",
    elapsedVisible: after.elapsed !== "" && after.elapsed !== "等待中",
    previewPatched: after.previewActive && after.previewSource === "h3-tae",
    telemetryUpdated: after.metricCpu !== "" && after.metricCpu !== "—",
    pauseReachable: after.pause,
    cancelReachable: after.cancel
  };
  const passed = Object.values(checks).every(Boolean);
  console.log(`[renderer-smoke] ${fixture.id} ${viewport.id} queue-running ${JSON.stringify({ before, after, checks, passed })}`);
  if (!passed) throw new Error(`Queue running interaction smoke failed: ${JSON.stringify({ before, after, checks })}`);
}

async function runHistoryInteractionSmoke(window, fixture, viewport) {
  const isImage = fixture.id === "history-image-album";
  const cardSelector = isImage ? "[data-open-image-history]" : "[data-open-history]";
  const cardSelectorLiteral = JSON.stringify(cardSelector);
  const detailSelector = isImage ? ".image-history-detail-layout" : ".history-detail-hero";
  const detailSelectorLiteral = JSON.stringify(detailSelector);
  const initialKind = isImage ? "image" : "video";
  const oppositeKind = isImage ? "video" : "image";
  const tabDirection = isImage ? "ArrowLeft" : "ArrowRight";
  const tabToOpposite = await executeJavaScript(window, `(() => {
    const active = document.querySelector('[role="tab"][aria-selected="true"]');
    if (!active) return { found: false, defaultPrevented: false };
    active.focus();
    const event = new KeyboardEvent("keydown", { key: ${JSON.stringify(tabDirection)}, bubbles: true, cancelable: true });
    active.dispatchEvent(event);
    return { found: true, defaultPrevented: event.defaultPrevented };
  })()`);
  await waitForDom(window, `Boolean(document.querySelector('[data-history-kind="${oppositeKind}"][role="tab"][aria-selected="true"]')) && document.activeElement?.id === 'history-tab-${oppositeKind}'`, `${fixture.id} tab arrow`);
  const oppositeTab = await executeJavaScript(window, `({
    activeId: document.activeElement?.id ?? "",
    tabStops: document.querySelectorAll('[role="tab"][tabindex="0"]').length,
    panel: document.querySelector('[role="tabpanel"]')?.getAttribute("aria-labelledby") ?? ""
  })`);
  const tabHome = await executeJavaScript(window, `(() => {
    const active = document.querySelector('[role="tab"][aria-selected="true"]');
    if (!active) return false;
    const event = new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true });
    active.dispatchEvent(event);
    return event.defaultPrevented;
  })()`);
  await waitForDom(window, `Boolean(document.querySelector('[data-history-kind="video"][role="tab"][aria-selected="true"]')) && document.activeElement?.id === 'history-tab-video'`, `${fixture.id} tab home`);
  const tabEnd = await executeJavaScript(window, `(() => {
    const active = document.querySelector('[role="tab"][aria-selected="true"]');
    if (!active) return false;
    const event = new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true });
    active.dispatchEvent(event);
    return event.defaultPrevented;
  })()`);
  await waitForDom(window, `Boolean(document.querySelector('[data-history-kind="image"][role="tab"][aria-selected="true"]')) && document.activeElement?.id === 'history-tab-image'`, `${fixture.id} tab end`);
  if (initialKind === "video") {
    await executeJavaScript(window, `(() => {
      const active = document.querySelector('[role="tab"][aria-selected="true"]');
      if (!active) return false;
      active.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }));
      return true;
    })()`);
    await waitForDom(window, `Boolean(document.querySelector('[data-history-kind="video"][role="tab"][aria-selected="true"]')) && document.activeElement?.id === 'history-tab-video'`, `${fixture.id} tab restore`);
  }
  const tabRestored = await executeJavaScript(window, `({
    activeKind: document.querySelector('[role="tab"][aria-selected="true"]')?.dataset.historyKind ?? "",
    activeId: document.activeElement?.id ?? "",
    tabStops: document.querySelectorAll('[role="tab"][tabindex="0"]').length,
    panel: document.querySelector('[role="tabpanel"]')?.getAttribute("aria-labelledby") ?? ""
  })`);
  const openFilter = await executeJavaScript(window, `(() => {
    const button = document.querySelector("[data-history-filter-toggle]");
    if (!button) return false;
    button.click();
    return true;
  })()`);
  await waitForDom(window, "Boolean(document.querySelector('[data-history-filter-panel]:not([hidden])'))", `${fixture.id} filter panel`);
  const filterApplied = await executeJavaScript(window, `(() => {
    const field = document.querySelector('[data-history-filter-field="minRating"]');
    if (!field) return false;
    field.value = "5";
    field.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  await waitForDom(window, "Boolean(document.querySelector('.history-gallery .empty'))", `${fixture.id} no results`);
  const noResults = await executeJavaScript(window, `(() => ({
    empty: Boolean(document.querySelector('.history-gallery .empty')),
    result: document.querySelector('.history-filter-result')?.textContent?.trim() ?? ""
  }))()`);
  const clearFilter = await executeJavaScript(window, `(() => {
    const button = document.querySelector("[data-history-filter-clear]");
    if (!button) return false;
    button.click();
    return true;
  })()`);
  await waitForDom(window, `Boolean(document.querySelector(${cardSelectorLiteral}))`, `${fixture.id} clear filter`);
  const filterCleared = await executeJavaScript(window, `(() => ({
    card: Boolean(document.querySelector(${cardSelectorLiteral})),
    activeDot: Boolean(document.querySelector('.history-filter-active-dot'))
  }))()`);
  const closeFilter = await executeJavaScript(window, `(() => {
    const panel = document.querySelector('[data-history-filter-panel]');
    const button = document.querySelector('[data-history-filter-toggle]');
    if (!panel || !button || panel.hidden) return true;
    button.click();
    return true;
  })()`);
  await waitForDom(window, "Boolean(document.querySelector('[data-history-filter-panel][hidden]'))", `${fixture.id} filter panel close`);

  const switchLayout = async (layout) => {
    const clicked = await executeJavaScript(window, `(() => {
      const button = document.querySelector('[data-history-layout="${layout}"]');
      if (!button) return false;
      button.click();
      return true;
    })()`);
    await waitForDom(window, `document.querySelector('.history-gallery')?.classList.contains(${JSON.stringify(layout)})`, `${fixture.id} ${layout} layout`);
    return clicked;
  };
  const masonryClicked = await switchLayout("masonry");
  const albumClicked = await switchLayout("album");
  let imageMediaReady = true;
  let imageMediaFailure = true;
  let imageMediaRetry = true;
  let imageMediaDetailError = true;
  let imageMediaLightboxError = true;
  let imageLightboxFocus = true;
  let lightboxFocusState = { opened: true, backgroundInert: true, forwardLoop: true, backwardLoop: true, versionFocus: true };
  let lightboxEscape = { dispatched: true, defaultPrevented: true };
  let lightboxReturnedFocus = true;
  if (isImage) {
    await waitForDom(window, `document.querySelector('[data-image-media-surface="gallery"]')?.dataset.imageMediaState === 'ready'`, `${fixture.id} gallery image media ready`);
    imageMediaReady = await executeJavaScript(window, `(() => {
      const surface = document.querySelector('[data-image-media-surface="gallery"]');
      const image = surface?.querySelector('[data-image-media-image]');
      return Boolean(surface && image && surface.dataset.imageMediaState === 'ready' && surface.dataset.imageMediaHasReady === 'true');
    })()`);
    const galleryFailure = await executeJavaScript(window, `(() => {
      const surface = document.querySelector('[data-image-media-surface="gallery"]');
      const image = surface?.querySelector('[data-image-media-image]');
      if (!surface || !(image instanceof HTMLImageElement)) return { failed: false, restored: false };
      image.dispatchEvent(new Event('error'));
      const status = surface.querySelector('[data-image-media-status]');
      const failed = surface.dataset.imageMediaState === 'error' &&
        surface.dataset.imageMediaHasReady === 'true' &&
        status instanceof HTMLElement && !status.hidden;
      image.dispatchEvent(new Event('load'));
      return { failed, restored: surface.dataset.imageMediaState === 'ready' && status?.hidden === true };
    })()`);
    imageMediaFailure = galleryFailure.failed && galleryFailure.restored;
    const retryClicked = await executeJavaScript(window, `(() => {
      const button = document.querySelector('[data-image-media-surface="gallery"] [data-image-media-retry]');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return document.querySelector('[data-image-media-surface="gallery"]')?.dataset.imageMediaState === 'loading';
    })()`);
    await waitForDom(window, `document.querySelector('[data-image-media-surface="gallery"]')?.dataset.imageMediaState === 'ready'`, `${fixture.id} gallery image media retry`);
    imageMediaRetry = retryClicked && await executeJavaScript(window, `document.querySelector('[data-image-media-surface="gallery"]')?.dataset.imageMediaState === 'ready'`);
  }

  const moreMenuOpened = await executeJavaScript(window, `(() => {
    const button = document.querySelector('[data-history-more]');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  await waitForDom(window, "Boolean(document.querySelector('.history-context-menu[role=menu]'))", `${fixture.id} More menu`);
  const menuNavigation = await executeJavaScript(window, `(() => {
    const menu = document.querySelector('.history-context-menu[role=menu]');
    const items = [...(menu?.querySelectorAll('button[role="menuitem"]:not(:disabled)') ?? [])];
    const first = items[0];
    if (!first || items.length < 2) return { count: items.length, down: false, home: false, end: false };
    first.focus();
    const down = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true });
    first.dispatchEvent(down);
    const downTarget = document.activeElement === items[1];
    const home = new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true });
    document.activeElement?.dispatchEvent(home);
    const homeTarget = document.activeElement === first;
    const end = new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true });
    document.activeElement?.dispatchEvent(end);
    const endTarget = document.activeElement === items[items.length - 1];
    return { count: items.length, down: down.defaultPrevented && downTarget, home: home.defaultPrevented && homeTarget, end: end.defaultPrevented && endTarget };
  })()`);
  const moreMenuEscape = await executeJavaScript(window, `(() => {
    const item = document.activeElement;
    if (!(item instanceof HTMLElement)) return false;
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    item.dispatchEvent(event);
    return event.defaultPrevented;
  })()`);
  await waitForDom(window, "!document.querySelector('.history-context-menu')", `${fixture.id} More menu close`);
  const moreFocus = await executeJavaScript(window, "document.activeElement?.matches('[data-history-more]') === true");

  const cardMenuOpened = await executeJavaScript(window, `(() => {
    const card = document.querySelector(${cardSelectorLiteral});
    if (!card) return false;
    card.focus();
    const event = new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true });
    card.dispatchEvent(event);
    return event.defaultPrevented;
  })()`);
  await waitForDom(window, "Boolean(document.querySelector('.history-context-menu[role=menu]'))", `${fixture.id} Shift F10 menu`);
  const cardMenuEscape = await executeJavaScript(window, `(() => {
    const item = document.querySelector('.history-context-menu button[role="menuitem"]');
    if (!item) return false;
    item.focus();
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    item.dispatchEvent(event);
    return event.defaultPrevented;
  })()`);
  await waitForDom(window, "!document.querySelector('.history-context-menu')", `${fixture.id} Shift F10 menu close`);
  const cardMenuFocus = await executeJavaScript(window, `document.activeElement?.matches(${JSON.stringify(cardSelector)}) === true`);

  const spaceOpened = await executeJavaScript(window, `(() => {
    const card = document.querySelector(${cardSelectorLiteral});
    if (!card) return { found: false, keydownPrevented: false, keyupPrevented: false };
    card.focus();
    const keydown = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    card.dispatchEvent(keydown);
    const keyup = new KeyboardEvent("keyup", { key: " ", bubbles: true, cancelable: true });
    card.dispatchEvent(keyup);
    return { found: true, keydownPrevented: keydown.defaultPrevented, keyupPrevented: keyup.defaultPrevented };
  })()`);
  await waitForDom(window, `Boolean(document.querySelector(${detailSelectorLiteral}))`, `${fixture.id} Space card activation`);
  const spaceDetailOpened = await executeJavaScript(window, `Boolean(document.querySelector(${detailSelectorLiteral}))`);
  const spaceReturned = await executeJavaScript(window, `(() => {
    const button = document.querySelector('.history-detail-back-button');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  await waitForDom(window, `Boolean(document.querySelector(${cardSelectorLiteral}))`, `${fixture.id} Space card return`);

  const opened = await executeJavaScript(window, `(() => {
    const card = document.querySelector(${cardSelectorLiteral});
    if (!card) return { found: false, defaultPrevented: false };
    card.focus();
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    card.dispatchEvent(event);
    return { found: true, defaultPrevented: event.defaultPrevented };
  })()`);
  await waitForDom(window, `Boolean(document.querySelector(${detailSelectorLiteral}))`, `${fixture.id} detail`);
  const detailOpened = await executeJavaScript(window, `Boolean(document.querySelector(${detailSelectorLiteral}))`);
  const versionSelection = await executeJavaScript(window, `Boolean(document.querySelector(${JSON.stringify(isImage ? ".image-history-version-list [aria-pressed=\"true\"]" : ".history-summary-version-switcher [aria-pressed=\"true\"]")}))`);
  if (isImage) {
    imageMediaDetailError = await executeJavaScript(window, `(() => {
      const surface = document.querySelector('.image-history-stage[data-image-media]');
      const image = surface?.querySelector('[data-image-media-image]');
      if (!surface || !(image instanceof HTMLImageElement)) return false;
      image.dispatchEvent(new Event('error'));
      const status = surface.querySelector('[data-image-media-status]');
      const retry = surface.querySelector('[data-image-media-retry]');
      const locate = surface.querySelector('[data-image-media-locate]');
      return surface.dataset.imageMediaState === 'error' &&
        status instanceof HTMLElement && !status.hidden &&
        retry instanceof HTMLButtonElement && !retry.hidden &&
        locate instanceof HTMLButtonElement && !locate.hidden;
    })()`);
    const lightboxOpened = await executeJavaScript(window, `(() => {
      const button = document.querySelector('[data-open-image-lightbox]');
      if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
      button.click();
      return true;
    })()`);
    await waitForDom(window, "Boolean(document.querySelector('[data-image-lightbox]:not([hidden])'))", `${fixture.id} image lightbox open`);
    await wait(80);
    lightboxFocusState = await executeJavaScript(window, `(() => {
      const lightbox = document.querySelector('[data-image-lightbox]');
      const dialog = lightbox?.querySelector('[role="dialog"]');
      const close = lightbox?.querySelector('button[data-image-lightbox-close]');
      const focusables = [...(dialog?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])') ?? [])]
        .filter((element) => element instanceof HTMLElement && element.getClientRects().length > 0);
      const first = focusables[0];
      const last = focusables.at(-1);
      if (!(lightbox instanceof HTMLElement) || !(dialog instanceof HTMLElement) || !(close instanceof HTMLElement) || !first || !last || focusables.length < 2) {
        return { opened: false, backgroundInert: false, forwardLoop: false, backwardLoop: false, versionFocus: false };
      }
      const opened = document.activeElement === close;
      const backgroundInert = document.querySelector('.topbar')?.inert === true && lightbox.inert === false;
      last.focus();
      const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      last.dispatchEvent(forward);
      const forwardLoop = forward.defaultPrevented && document.activeElement === first;
      first.focus();
      const backward = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
      first.dispatchEvent(backward);
      const backwardLoop = backward.defaultPrevented && document.activeElement === last;
      const versionButton = [...dialog.querySelectorAll('[data-image-lightbox-version-navigation]:not(:disabled)')][0];
      if (versionButton instanceof HTMLElement) {
        versionButton.focus();
        versionButton.click();
      }
      const versionFocus = versionButton instanceof HTMLElement &&
        [...dialog.querySelectorAll('[data-image-lightbox-version-navigation]:not(:disabled)')].some((element) => document.activeElement === element) &&
        lightbox.hidden === false;
      return { opened, backgroundInert, forwardLoop, backwardLoop, versionFocus };
    })()`);
    imageMediaLightboxError = lightboxOpened && await executeJavaScript(window, `(() => {
      const surface = document.querySelector('[data-image-media-surface="lightbox"]');
      const image = surface?.querySelector('[data-image-media-image]');
      if (!surface || !(image instanceof HTMLImageElement)) return false;
      image.dispatchEvent(new Event('error'));
      const status = surface.querySelector('[data-image-media-status]');
      const retry = surface.querySelector('[data-image-media-retry]');
      const locate = surface.querySelector('[data-image-media-locate]');
      return surface.dataset.imageMediaState === 'error' &&
        status instanceof HTMLElement && !status.hidden &&
        retry instanceof HTMLButtonElement && !retry.hidden &&
        locate instanceof HTMLButtonElement && !locate.hidden;
    })()`);
    lightboxEscape = await executeJavaScript(window, `(() => {
      const dialog = document.querySelector('[data-image-lightbox] [role="dialog"]');
      if (!(dialog instanceof HTMLElement)) return { dispatched: false, defaultPrevented: false };
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      dialog.dispatchEvent(event);
      return { dispatched: true, defaultPrevented: event.defaultPrevented };
    })()`);
    await waitForDom(window, "Boolean(document.querySelector('[data-image-lightbox][hidden]'))", `${fixture.id} image lightbox close`);
    await wait(80);
    lightboxReturnedFocus = await executeJavaScript(window, "document.activeElement?.matches('[data-open-image-lightbox]') === true");
    imageLightboxFocus = lightboxOpened && lightboxFocusState.opened && lightboxFocusState.backgroundInert &&
      lightboxFocusState.forwardLoop && lightboxFocusState.backwardLoop && lightboxFocusState.versionFocus &&
      lightboxEscape.dispatched && lightboxEscape.defaultPrevented && lightboxReturnedFocus;
    imageMediaLightboxError = imageMediaLightboxError && lightboxEscape.dispatched;
  }
  const deleteRequested = await executeJavaScript(window, `(() => {
    const button = document.querySelector("[data-delete-history]");
    if (!button) return false;
    button.click();
    return true;
  })()`);
  await waitForDom(window, "Boolean(document.querySelector('#confirm-backdrop'))", `${fixture.id} delete confirmation`);
  const deleteConfirmation = await executeJavaScript(window, `Boolean(document.querySelector('#confirm-backdrop') && document.querySelector('#accept-confirmation'))`);
  const deleteCancelled = await executeJavaScript(window, `(() => {
    const button = document.querySelector("#cancel-confirmation");
    if (!button) return false;
    button.click();
    return true;
  })()`);
  await waitForDom(window, `Boolean(document.querySelector(${detailSelectorLiteral})) && !document.querySelector('#confirm-backdrop')`, `${fixture.id} delete cancel`);
  const returned = await executeJavaScript(window, `(() => {
    const button = document.querySelector(".history-detail-back-button");
    if (!button) return false;
    button.click();
    return true;
  })()`);
  await waitForDom(window, "Boolean(document.querySelector('.history-heading')) && Boolean(document.querySelector('.nav-button[data-page=\"history\"][aria-current=\"page\"]'))", `${fixture.id} detail return`);
  const after = await executeJavaScript(window, `({
    heading: Boolean(document.querySelector('.history-heading')),
    historyNavSelected: Boolean(document.querySelector('.nav-button[data-page="history"][aria-current="page"]')),
    card: Boolean(document.querySelector(${cardSelectorLiteral})),
    layout: document.querySelector('.history-gallery')?.classList.contains('album') === true,
    layoutPressed: document.querySelector('[data-history-layout="album"]')?.getAttribute('aria-pressed') === 'true'
  })`);
  const checks = {
    tabsArrow: tabToOpposite.found && tabToOpposite.defaultPrevented && oppositeTab.activeId === `history-tab-${oppositeKind}` && oppositeTab.tabStops === 1 && oppositeTab.panel === `history-tab-${oppositeKind}`,
    tabsHomeEnd: tabHome === true && tabEnd === true && tabRestored.activeKind === initialKind && tabRestored.activeId === `history-tab-${initialKind}` && tabRestored.tabStops === 1 && tabRestored.panel === `history-tab-${initialKind}`,
    filterPanelOpened: openFilter === true,
    filterApplied: filterApplied === true,
    noResults: noResults.empty && noResults.result.startsWith("0/"),
    filterCleared: clearFilter === true && filterCleared.card && filterCleared.activeDot === false,
    filterClosed: closeFilter === true,
    masonryLayout: masonryClicked === true,
    albumLayout: albumClicked === true && after.layoutPressed,
    moreMenu: moreMenuOpened === true && menuNavigation.count >= 2 && menuNavigation.down && menuNavigation.home && menuNavigation.end && moreMenuEscape === true && moreFocus,
    cardMenu: cardMenuOpened === true && cardMenuEscape === true && cardMenuFocus,
    cardSpace: spaceOpened.found && spaceOpened.keydownPrevented && spaceOpened.keyupPrevented && spaceDetailOpened && spaceReturned === true,
    cardEnter: opened.found && opened.defaultPrevented && detailOpened,
    versionSelection,
    imageMediaReady,
    imageMediaFailure,
    imageMediaRetry,
    imageMediaDetailError,
    imageMediaLightboxError,
    imageLightboxFocus,
    deleteConfirmation: deleteRequested === true && deleteConfirmation,
    deleteCancelled: deleteCancelled === true,
    detailReturned: returned === true && after.heading && after.historyNavSelected && after.card && after.layout
  };
  const passed = Object.values(checks).every(Boolean);
  const lightboxEvidence = isImage ? { focus: lightboxFocusState, escape: lightboxEscape, returnedFocus: lightboxReturnedFocus } : null;
  console.log(`[renderer-smoke] ${fixture.id} ${viewport.id} history ${JSON.stringify({ noResults, filterCleared, after, tabs: { tabToOpposite, oppositeTab, tabHome, tabEnd, tabRestored }, menus: { menuNavigation, moreMenuEscape, moreFocus, cardMenuOpened, cardMenuEscape, cardMenuFocus }, cards: { spaceOpened, spaceDetailOpened, spaceReturned, opened }, versionSelection, lightbox: lightboxEvidence, checks, passed })}`);
  if (!passed) throw new Error(`History interaction smoke failed: ${JSON.stringify({ noResults, filterCleared, after, tabs: { tabToOpposite, oppositeTab, tabHome, tabEnd, tabRestored }, menus: { menuNavigation, moreMenuEscape, moreFocus, cardMenuOpened, cardMenuEscape, cardMenuFocus }, cards: { spaceOpened, spaceDetailOpened, spaceReturned, opened }, versionSelection, lightbox: lightboxEvidence, checks })}`);
}

async function runHistoryDetailInteractionSmoke(window, fixture, viewport) {
  const isImage = fixture.id === "image-detail";
  const evidence = await executeJavaScript(window, `(() => {
    const isImage = ${JSON.stringify(isImage)};
    const visible = (element) => element instanceof HTMLElement && element.getClientRects().length > 0;
    const root = document.querySelector(${JSON.stringify(isImage ? ".image-history-detail-layout" : ".history-detail-hero")});
    const compact = root?.querySelector(".history-detail-compact-actions");
    const more = root?.querySelector(".history-detail-more");
    const summary = more?.querySelector("summary");
    const recordSection = document.querySelector(".history-record-section");
    const main = document.querySelector("main");
    const actionSelectors = ${JSON.stringify(isImage
      ? ["[data-image-continue-video-project]", "[data-image-continue-edit-project]", "[data-copy-image]", "[data-copy-file]", "[data-show-file]", "[data-image-set-cover]", "[data-delete-image-version]", "[data-delete-history]", "[data-image-version-id]"]
      : ["[data-continue-history]", "[data-edit-history]", "[data-copy-file]", "[data-show-file]", "[data-open-upscale]", "[data-delete-history]", ".history-summary-version-switcher [data-version-id]"])};
    const selectorsPresent = Object.fromEntries(actionSelectors.map((selector) => [selector, Boolean(document.querySelector(selector))]));
    const compactBefore = {
      present: Boolean(compact),
      visible: visible(compact),
      actionCount: compact?.querySelectorAll("button").length ?? 0,
      primary: visible(compact?.querySelector("button.primary"))
    };
    const summaryFocusable = summary instanceof HTMLElement && summary.tabIndex >= 0;
    if (more instanceof HTMLDetailsElement) more.open = false;
    if (summary instanceof HTMLElement) {
      summary.focus();
      summary.click();
    }
    const moreAfterOpen = {
      present: more instanceof HTMLDetailsElement,
      open: more instanceof HTMLDetailsElement && more.open,
      actionVisible: visible(more?.querySelector(".history-detail-more-actions button")),
      focusOnSummary: document.activeElement === summary
    };
    const stage = isImage ? document.querySelector(".image-history-stage[data-image-media]") : null;
    return {
      compact: compactBefore,
      summaryFocusable,
      more: moreAfterOpen,
      records: {
        present: Boolean(recordSection),
        grid: Boolean(recordSection?.querySelector(".history-record-grid")),
        articleCount: recordSection?.querySelectorAll(".history-record").length ?? 0
      },
      selectorsPresent,
      versionCount: document.querySelectorAll(isImage ? "[data-image-version-id]" : ".history-summary-version-switcher [data-version-id]").length,
      mediaState: stage?.dataset.imageMediaState ?? "not-applicable",
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 && (!main || main.scrollWidth <= main.clientWidth + 1)
    };
  })()`);
  const selectorValues = Object.values(evidence.selectorsPresent);
  const checks = {
    compactPresent: evidence.compact.present,
    compactVisible: evidence.compact.visible,
    compactActions: evidence.compact.actionCount >= 2 && evidence.compact.primary,
    summaryFocusable: evidence.summaryFocusable,
    moreDisclosure: evidence.more.present && evidence.more.open && evidence.more.actionVisible && evidence.more.focusOnSummary,
    generationRecord: evidence.records.present && evidence.records.grid && evidence.records.articleCount >= (isImage ? 4 : 6),
    actionSelectors: selectorValues.length > 0 && selectorValues.every(Boolean),
    multipleVersions: evidence.versionCount >= (isImage ? 2 : 1),
    imageMediaState: !isImage || ["ready", "error", "loading", "unavailable"].includes(evidence.mediaState),
    noHorizontalOverflow: evidence.noHorizontalOverflow
  };
  const passed = Object.values(checks).every(Boolean);
  console.log(`[renderer-smoke] ${fixture.id} ${viewport.id} history-detail ${JSON.stringify({ evidence, checks, passed })}`);
  if (!passed) throw new Error(`History detail interaction smoke failed: ${JSON.stringify({ evidence, checks })}`);
}

async function runSettingsInteractionSmoke(window, fixture, viewport) {
  const initial = await executeJavaScript(window, `(() => {
    const tabs = [...document.querySelectorAll('[role="tab"][data-settings-tab]')];
    const sidebar = document.querySelector('.settings-sidebar');
    const rows = tabs.map((tab) => Math.round(tab.getBoundingClientRect().top));
    const environmentSection = document.querySelector('#settings-environment-section')?.closest('.settings-section');
    const scanButton = document.querySelector('#scan-environment');
    return {
      tabCount: tabs.length,
      tabStops: tabs.filter((tab) => tab.getAttribute('tabindex') === '0').length,
      selectedCount: tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true').length,
      activeId: document.querySelector('[role="tab"][aria-selected="true"]')?.id ?? '',
      panelLabel: document.querySelector('[role="tabpanel"]')?.getAttribute('aria-labelledby') ?? '',
      rows: [...new Set(rows)],
      sidebarDisplay: sidebar ? getComputedStyle(sidebar).display : '',
      sidebarWrap: sidebar ? getComputedStyle(sidebar).flexWrap : '',
      scanInEnvironment: Boolean(environmentSection && scanButton && environmentSection.contains(scanButton)),
      scanInHeading: Boolean(document.querySelector('.settings-heading #scan-environment')),
      environmentEvidenceList: Boolean(document.querySelector('.environment-evidence-list')),
      connectionStatus: document.querySelector('#connection-result')?.getAttribute('role') ?? '',
      forceStopSecondary: Boolean(document.querySelector('#force-stop-comfy.secondary.destructive:not(.primary)')),
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth
    };
  })()`);
  const arrow = await executeJavaScript(window, `(() => {
    const active = document.querySelector('[role="tab"][aria-selected="true"]');
    if (!active) return { found: false, defaultPrevented: false };
    active.focus();
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    active.dispatchEvent(event);
    return { found: true, defaultPrevented: event.defaultPrevented };
  })()`);
  await waitForDom(window, "Boolean(document.querySelector('#settings-tab-acceleration[aria-selected=\"true\"]')) && document.activeElement?.id === 'settings-tab-acceleration'", `${fixture.id} settings arrow`);
  const home = await executeJavaScript(window, `(() => {
    const active = document.querySelector('[role="tab"][aria-selected="true"]');
    if (!active) return false;
    const event = new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true });
    active.dispatchEvent(event);
    return event.defaultPrevented;
  })()`);
  await waitForDom(window, "Boolean(document.querySelector('#settings-tab-system[aria-selected=\"true\"]')) && document.activeElement?.id === 'settings-tab-system'", `${fixture.id} settings home`);
  const end = await executeJavaScript(window, `(() => {
    const active = document.querySelector('[role="tab"][aria-selected="true"]');
    if (!active) return false;
    const event = new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true });
    active.dispatchEvent(event);
    return event.defaultPrevented;
  })()`);
  await waitForDom(window, "Boolean(document.querySelector('#settings-tab-logs[aria-selected=\"true\"]')) && document.activeElement?.id === 'settings-tab-logs'", `${fixture.id} settings end`);
  await executeJavaScript(window, `(() => {
    const active = document.querySelector('[role="tab"][aria-selected="true"]');
    if (!active) return false;
    active.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    return true;
  })()`);
  await waitForDom(window, "Boolean(document.querySelector('#settings-tab-system[aria-selected=\"true\"]')) && document.activeElement?.id === 'settings-tab-system'", `${fixture.id} settings restore`);
  await wait(160);
  const final = await executeJavaScript(window, `({
    activeId: document.querySelector('[role="tab"][aria-selected="true"]')?.id ?? '',
    panelLabel: document.querySelector('[role="tabpanel"]')?.getAttribute('aria-labelledby') ?? '',
    tabStops: document.querySelectorAll('[role="tab"][tabindex="0"]').length,
    sidebarDisplay: getComputedStyle(document.querySelector('.settings-sidebar')).display,
    sidebarWrap: getComputedStyle(document.querySelector('.settings-sidebar')).flexWrap,
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth
  })`);
  const compact = viewport.width <= 900;
  const checks = {
    semantics: initial.tabCount === 9 && initial.tabStops === 1 && initial.selectedCount === 1 && initial.panelLabel === initial.activeId,
    compactSingleRow: !compact || (initial.sidebarDisplay === 'flex' && initial.sidebarWrap !== 'wrap' && initial.rows.length === 1),
    actionContext: initial.scanInEnvironment && !initial.scanInHeading,
    arrow: arrow.found && arrow.defaultPrevented,
    home: home === true,
    end: end === true,
    focusRestored: final.activeId === 'settings-tab-system' && final.panelLabel === 'settings-tab-system' && final.tabStops === 1,
    evidenceAndActions: initial.environmentEvidenceList && initial.connectionStatus === 'status' && initial.forceStopSecondary,
    noHorizontalOverflow: final.documentScrollWidth <= final.documentClientWidth + 1
  };
  const passed = Object.values(checks).every(Boolean);
  console.log(`[renderer-smoke] ${fixture.id} ${viewport.id} settings ${JSON.stringify({ initial, arrow, home, end, final, checks, passed })}`);
  if (!passed) throw new Error(`Settings interaction smoke failed: ${JSON.stringify({ initial, arrow, home, end, final, checks })}`);
}

async function runInteractionSmoke(window, fixture, viewport) {
  if (fixture.route === "queue" && viewport.id === "900x800") {
    await runQueueInteractionSmoke(window, fixture, viewport);
    return;
  }
  if ((fixture.id === "history-video-album" || fixture.id === "history-image-album") && viewport.id === "900x800") {
    await runHistoryInteractionSmoke(window, fixture, viewport);
    return;
  }
  if ((fixture.id === "video-detail" || fixture.id === "image-detail") && (viewport.id === "900x800" || viewport.id === "760x800")) {
    await runHistoryDetailInteractionSmoke(window, fixture, viewport);
    return;
  }
  if (fixture.id === "settings-system" && (viewport.id === "900x800" || viewport.id === "760x800")) {
    await runSettingsInteractionSmoke(window, fixture, viewport);
    return;
  }
  if (fixture.id !== "create-image-edit" || viewport.id !== "900x800") return;
  const settle = async (expression, label) => {
    await waitForDom(window, expression, label);
    await wait(180);
  };
  const dispatchDrop = (selector, filename, type) => executeJavaScript(window, `(() => {
    const zone = document.querySelector(${JSON.stringify(selector)});
    if (!zone) return { found: false, dragOver: false };
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(["fixture"], ${JSON.stringify(filename)}, { type: ${JSON.stringify(type)} }));
    zone.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer }));
    const dragOver = zone.classList.contains("drag-over");
    zone.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
    return { found: true, dragOver };
  })()`);
  const submitTwice = (selector) => executeJavaScript(window, `(() => {
    const button = document.querySelector(${JSON.stringify(selector)});
    if (!button) return false;
    button.disabled = false;
    button.removeAttribute("disabled");
    const dispatch = () => button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    dispatch();
    dispatch();
    return true;
  })()`);
  const shortcut = (selector, key, shiftKey = false) => executeJavaScript(window, `(() => {
    const field = document.querySelector(${JSON.stringify(selector)});
    if (!field) return false;
    field.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)}, ctrlKey: true, shiftKey: ${JSON.stringify(shiftKey)}, bubbles: true, cancelable: true }));
    return true;
  })()`);
  const imageEditMarker = " [renderer smoke]";
  const imageEditBefore = await executeJavaScript(window, `(() => {
    const field = document.querySelector("#image-edit-prompt-input");
    if (!field) return null;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
    const initial = field.value;
    field.setRangeText(${JSON.stringify(imageEditMarker)}, field.selectionStart, field.selectionEnd, "end");
    field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: ${JSON.stringify(imageEditMarker)} }));
    return { initial, expected: initial + ${JSON.stringify(imageEditMarker)}, activeElement: document.activeElement?.id ?? "" };
  })()`);
  if (!imageEditBefore) throw new Error("Create Image Edit prompt field was not found during smoke check");
  await wait(240);
  const imageEditAfter = await executeJavaScript(window, `(() => {
    const field = document.querySelector("#image-edit-prompt-input");
    return { value: field?.value ?? "", activeElement: document.activeElement?.id ?? "" };
  })()`);
  const imageEditClear = await executeJavaScript(window, `(() => {
    const button = document.querySelector("#clear-image-prompt");
    if (!button) return false;
    button.click();
    return true;
  })()`);
  await settle("document.querySelector('#image-edit-prompt-input')?.value === ''", "image edit clear");
  const imageEditUndo = await shortcut("#image-edit-prompt-input", "z");
  await settle(`document.querySelector("#image-edit-prompt-input")?.value === ${JSON.stringify(imageEditBefore.expected)}`, "image edit undo");
  const imageEditRedo = await shortcut("#image-edit-prompt-input", "y");
  await settle("document.querySelector('#image-edit-prompt-input')?.value === ''", "image edit redo");
  const imageEditUndoAgain = await shortcut("#image-edit-prompt-input", "z");
  await settle(`document.querySelector("#image-edit-prompt-input")?.value === ${JSON.stringify(imageEditBefore.expected)}`, "image edit undo again");
  const imageEditShiftRedo = await shortcut("#image-edit-prompt-input", "z", true);
  await settle("document.querySelector('#image-edit-prompt-input')?.value === ''", "image edit shift redo");

  await executeJavaScript(window, "window.studio.setFixturePickerEnabled?.(true); true");
  await executeJavaScript(window, "document.querySelector('#image-picture-drop-zone')?.click(); true");
  await settle("Boolean(document.querySelector('[data-image-picture-card].has-picture'))", "image edit click-to-select");
  const imageEditClickSelect = await executeJavaScript(window, "Boolean(document.querySelector('[data-image-picture-card].has-picture'))");
  const imageEditDrop = await dispatchDrop("#image-picture-drop-zone", "fixture-image.png", "image/png");
  await settle("document.querySelectorAll('[data-image-picture-card]').length >= 2", "image edit drag/drop");
  const imageEditSubmit = await submitTwice("#enqueue-image-edit");
  await wait(260);

  await clickAndWait(window, '[data-input-mode="image"]', "Boolean(document.querySelector('[data-input-mode=\"image\"][aria-pressed=\"true\"]'))", "renderer smoke image mode");
  await executeJavaScript(window, "document.querySelector('#pick-start')?.click(); true");
  await settle("Boolean(document.querySelector('#pick-start.has-image'))", "image click-to-select");
  const imageClickSelect = await executeJavaScript(window, "Boolean(document.querySelector('#pick-start.has-image'))");
  const imageDrop = await dispatchDrop("#pick-start", "fixture-image.png", "image/png");
  await settle("Boolean(document.querySelector('#pick-start.has-image'))", "image drag/drop");
  const imagePromptMarker = " [image prompt smoke]";
  const imagePromptBefore = await executeJavaScript(window, `(() => {
    const field = document.querySelector("#prompt-input");
    if (!field) return null;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
    const initial = field.value;
    field.setRangeText(${JSON.stringify(imagePromptMarker)}, field.selectionStart, field.selectionEnd, "end");
    field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: ${JSON.stringify(imagePromptMarker)} }));
    return { expected: initial + ${JSON.stringify(imagePromptMarker)}, activeElement: document.activeElement?.id ?? "" };
  })()`);
  await wait(240);
  const imagePromptAfter = await executeJavaScript(window, "({ value: document.querySelector('#prompt-input')?.value ?? '', activeElement: document.activeElement?.id ?? '' })");
  const imageSubmit = await submitTwice("#enqueue");
  await wait(260);

  await clickAndWait(window, '[data-input-mode="video"]', "Boolean(document.querySelector('[data-input-mode=\"video\"][aria-pressed=\"true\"]'))", "renderer smoke video mode");
  const videoDrop = await dispatchDrop("[data-drop-video]", "fixture-video.mp4", "video/mp4");
  await settle("Boolean(document.querySelector('#source-video'))", "video drag/drop");
  const videoSubmit = await submitTwice("#enqueue");
  await wait(260);
  await clickAndWait(window, '[data-input-mode="image-edit"]', "Boolean(document.querySelector('[data-input-mode=\"image-edit\"][aria-pressed=\"true\"]'))", "renderer smoke image edit return");
  const modeReturn = await executeJavaScript(window, "Boolean(document.querySelector('[data-input-mode=\"image-edit\"][aria-pressed=\"true\"]'))");
  const stats = await executeJavaScript(window, "window.studio.getFixtureStats?.() ?? null");
  const checks = {
    imageEditInputFocus: imageEditAfter.value === imageEditBefore.expected && imageEditAfter.activeElement === "image-edit-prompt-input",
    imageEditClear: imageEditClear === true,
    imageEditUndo: imageEditUndo === true,
    imageEditRedo: imageEditRedo === true,
    imageEditUndoAgain: imageEditUndoAgain === true,
    imageEditShiftRedo: imageEditShiftRedo === true,
    imageEditClickSelect,
    imageEditDragDrop: imageEditDrop.found === true && imageEditDrop.dragOver === true,
    imageEditSubmitOnce: imageEditSubmit === true && stats?.imageEdit === 1,
    imageModeInputFocus: imagePromptBefore?.activeElement === "prompt-input" && imagePromptAfter.value === imagePromptBefore.expected && imagePromptAfter.activeElement === "prompt-input",
    imageClickSelect,
    imageDragDrop: imageDrop.dragOver === true,
    imageSubmitOnce: imageSubmit === true && stats?.enqueue === 1,
    videoDragDrop: videoDrop.found === true && videoDrop.dragOver === true,
    videoSubmitOnce: videoSubmit === true && stats?.enqueueExtension === 1,
    modeReturn
  };
  const passed = Object.values(checks).every(Boolean);
  console.log(`[renderer-smoke] ${fixture.id} ${viewport.id} ${JSON.stringify({ checks, stats, passed })}`);
  if (!passed) throw new Error(`Create interaction smoke failed: ${JSON.stringify({ checks, stats })}`);
}

async function writeMockPreload(state) {
  const preloadPath = path.join(userDataRoot, "renderer-fixture-preload.cjs");
  const imageDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const fixtureImagePath = state.imageHistory?.[0]?.versions?.[0]?.file?.absolutePath ?? "";
  const fixtureVideoPath = state.history?.[0]?.files?.[0]?.absolutePath ?? "";
  const source = `const { contextBridge } = require("electron");
let currentState = ${JSON.stringify(state)};
const imageDataUrl = ${JSON.stringify(imageDataUrl)};
const fixtureImagePath = ${JSON.stringify(fixtureImagePath)};
const fixtureVideoPath = ${JSON.stringify(fixtureVideoPath)};
const clone = (value) => JSON.parse(JSON.stringify(value));
const stateListeners = new Set();
const runtimeListeners = new Set();
const taskPreviewListeners = new Set();
const fixtureStats = { enqueue: 0, enqueueExtension: 0, imageEdit: 0 };
let fixturePickerEnabled = false;
let currentQueueFixture = "mixed";
const initialSettingsFixture = (() => {
  try {
    return new URL(globalThis.location?.href || "http://fixture.local/").searchParams.get("uxSettingsState") || "offline";
  } catch {
    return "offline";
  }
})();
let currentSettingsFixture = initialSettingsFixture;
let metricSample = 0;
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let runtimeState = { phase: "stopped", ownership: "none", endpoint: "", message: "ComfyUI 未运行", updatedAt: new Date().toISOString(), operationId: 0 };
const result = (message = "capture fixture") => ({ ok: true, message });
const emitState = () => stateListeners.forEach((listener) => listener(clone(currentState)));
const metrics = () => {
  metricSample += 1;
  return { sampledAt: new Date().toISOString(), cpuPercent: 12 + metricSample, memoryUsedBytes: 4 * 1024 * 1024 * 1024, memoryTotalBytes: 16 * 1024 * 1024 * 1024, gpuPercent: 28 + metricSample, vramUsedBytes: 3 * 1024 * 1024 * 1024, vramTotalBytes: 12 * 1024 * 1024 * 1024, gpuTemperature: 56, comfyConnected: currentQueueFixture === "running" };
};
const fixtureQueueBase = clone(currentState.queue);
const queueTask = (id, status, overrides = {}) => Object.assign({}, clone(fixtureQueueBase.find((task) => task.id === id) || fixtureQueueBase[0] || {}), { id, status, updatedAt: new Date().toISOString() }, overrides);
const setQueueFixture = (kind) => {
  const waiting = queueTask("fixture-waiting-task", "waiting");
  const failed = queueTask("fixture-failed-task", "failed");
  const running = Object.assign({}, waiting, {
    id: "fixture-running-task",
    status: "running",
    outputFilename: "city-night-running.mp4",
    prompt: "A slow cinematic camera move through a rainy city street with changing light.",
    progress: 42,
    stage: "加载模型",
    stageStartedAt: new Date(Date.now() - 8_000).toISOString(),
    startedAt: new Date(Date.now() - 75_000).toISOString(),
    updatedAt: new Date().toISOString(),
    h3LivePreview: true,
    comfyPromptId: "fixture-running-prompt"
  });
  const pendingTwo = Object.assign({}, waiting, { id: "fixture-pending-task-2", outputFilename: "portrait-window-queued.mp4", seed: 1844 });
  const pendingThree = Object.assign({}, waiting, { id: "fixture-pending-task-3", outputFilename: "wide-establishing-shot.mp4", seed: 1845 });
  const queueByKind = {
    mixed: [waiting, failed],
    running: [running, waiting],
    paused: [running, waiting],
    failed: [failed],
    recoverable: [failed, waiting],
    empty: [],
    "multiple-pending": [waiting, pendingTwo, pendingThree]
  };
  currentQueueFixture = queueByKind[kind] ? kind : "mixed";
  currentState.queue = clone(queueByKind[currentQueueFixture]);
  currentState.queueRunning = currentQueueFixture === "running";
  currentState.queueStartedAt = currentQueueFixture === "running" || currentQueueFixture === "paused" ? new Date(Date.now() - 75_000).toISOString() : undefined;
  currentState.queueLifecycle = currentQueueFixture === "running" ? "running" : currentQueueFixture === "failed" ? "error" : "idle";
  currentState.queueLifecycleTaskId = undefined;
  currentState.queueLifecycleStartedAt = undefined;
  currentState.settings.h3LivePreview = currentQueueFixture === "running";
  runtimeState = Object.assign({}, runtimeState, {
    phase: currentQueueFixture === "running" ? "ready" : "stopped",
    ownership: currentQueueFixture === "running" ? "app" : "none",
    message: currentQueueFixture === "running" ? "Fixture ComfyUI ready" : "ComfyUI 未运行",
    updatedAt: new Date().toISOString()
  });
  emitState();
  runtimeListeners.forEach((listener) => listener(clone(runtimeState)));
  return currentQueueFixture;
};
const emitFixtureRunningSmoke = () => {
  const runningTask = currentState.queue.find((task) => task.status === "running");
  if (!runningTask) return false;
  currentState.queue = currentState.queue.map((task) => task.id === runningTask.id
    ? Object.assign({}, task, { progress: 67, stage: "渲染关键帧", stageStartedAt: new Date(Date.now() - 5_000).toISOString(), updatedAt: new Date().toISOString() })
    : task);
  emitState();
  taskPreviewListeners.forEach((listener) => listener({ taskId: runningTask.id, dataUrl: imageDataUrl, source: "h3-tae", step: 12, totalSteps: 20, sequence: 1 }));
  return true;
};
const emptyScan = (settings) => ({
  scannedAt: new Date().toISOString(), userHome: "", comfyRoot: "", comfyUrl: settings.comfyUrl, comfyInstallDirectory: settings.comfyInstallDirectory, comfySourceDirectory: "", comfyInstallType: "", comfyInstallations: [], pythonRuntimes: [], gpus: [], modelDirectory: settings.modelDirectory, outputDirectory: settings.outputDirectory, llamaServer: { found: false, path: "", directory: "", source: "" }, llamaCppPython: { packageName: "llama-cpp-python", pythonPath: "", pythonVersion: "", packageVersion: "", torchVersion: "", cudaVersion: "", installed: false, importable: false, gpuOffload: null, ready: false, detail: "", error: "" }, comfyCompatibility: { version: "", revision: "", h3MinimumVersion: "", h3MinimumRevision: "", h3RecommendedVersion: "", h3CoreSupported: false, coreNodes: [], promptCoreSupported: false, promptCoreNodes: [], checkedFrom: "", updateMode: "unsupported", updateHint: "", compatibilityState: "unknown" }, attentionAcceleration: { pythonPath: "", pythonVersion: "", torchVersion: "", cudaVersion: "", gpuName: "", gpuArchitecture: "", sageAttentionVersion: "", tritonVersion: "", kjNodesInstalled: false, kjNodesCompatible: false, recommendedSageVersion: "", recommendedWheel: "", supported: false, ready: false, detail: "" }, items: [], modelProfiles: [], customNodes: [], workflowDependencies: [], issues: []
});
const settingsScan = (settings) => {
  const scan = emptyScan(settings);
  if (currentSettingsFixture !== "partial" && currentSettingsFixture !== "installing" && currentSettingsFixture !== "error") return scan;
  const root = "C:/Fixture/ComfyUI";
  const errorFixture = currentSettingsFixture === "error";
  const modelDirectory = settings.modelDirectory || root + "/models";
  const installGuide = { sourceLabel: "Hugging Face fixture", downloadUrl: "https://huggingface.co/fixture/model", targetSubdirectory: "text_encoders", recommendedFilename: "fixture-model.safetensors", notes: "Synthetic P16 evidence only." };
  const missingNode = { id: "comfyui-qwenvl-lora", name: "Qwen VL LoRA Nodes", purpose: "H3 提示词增强节点", repositoryUrl: "https://github.com/fixture/ComfyUI-QwenVL-LoRA", installed: false, loaded: false, runtimeVerified: false, loadError: "", directory: root + "/custom_nodes/ComfyUI-QwenVL-LoRA", required: true, version: "", versionSource: "", minimumVersion: "1.0.0", recommendedVersion: "1.2.0", latestVersion: "1.2.0", updateAvailable: false, compatibilityState: "unknown", bulkInstall: true };
  const videoProfile = { id: "minimax_h3_fl2va", name: "MiniMax H3", category: "video", managedBy: "comfyui", badge: "GGUF", description: "H3 视频模型 fixture", vram: "约 12 GB", available: true, integrated: true, components: [{ label: "Transformer", found: true, expected: "fixture-h3.safetensors", matches: [modelDirectory + "/diffusion_models/fixture-h3.safetensors"], installGuide }] };
  const promptProfile = { id: "qwen-vl", name: "Qwen VL Prompt", category: "prompt", managedBy: "comfyui", badge: "Prompt", description: "提示词增强 fixture", vram: "约 8 GB", available: false, integrated: true, requiredCustomNodeIds: [missingNode.id], missingCustomNodeIds: [missingNode.id], missingCustomNodeNames: [missingNode.name], customNodeCompatibility: "warning", runtimeVerified: false, runtimeReady: false, components: [{ label: "Text encoder", found: false, expected: "fixture-text-encoder.safetensors", matches: [], installGuide }] };
  const imageProfile = { id: "qwen-image-edit-2511", name: "Qwen Image Edit", category: "image", managedBy: "comfyui", badge: "Image", description: "图片编辑 fixture", vram: "约 12 GB", available: true, integrated: true, components: [{ label: "Diffusion model", found: true, expected: "fixture-image.safetensors", matches: [modelDirectory + "/diffusion_models/fixture-image.safetensors"], installGuide }] };
  const upscaleProfile = { id: "realesrgan", name: "Real-ESRGAN", category: "upscale", managedBy: "comfyui", badge: "Upscale", description: "超分 fixture", vram: "约 6 GB", available: false, integrated: true, components: [{ label: "Upscaler model", found: false, expected: "fixture-upscale.pth", matches: [], installGuide }] };
  return Object.assign(scan, {
    userHome: "C:/Users/Fixture",
    comfyRoot: root,
    comfyUrl: "http://127.0.0.1:8188",
    comfyInstallDirectory: root,
    comfySourceDirectory: root + "/core",
    comfyInstallType: "manual",
    comfyInstallations: [
      { type: "manual", directory: root, sourceDirectory: root + "/core", executable: root + "/run_nvidia_gpu.bat", desktopVersion: "", version: "0.33.1", revision: "fixture-main", selected: true },
      { type: "portable", directory: "D:/ComfyUI-Portable", sourceDirectory: "D:/ComfyUI-Portable/ComfyUI", executable: "D:/ComfyUI-Portable/run_nvidia_gpu.bat", desktopVersion: "", version: "0.32.2", revision: "fixture-portable", selected: false }
    ],
    pythonRuntimes: [{ path: root + "/venv/Scripts/python.exe", version: "3.12.4", source: "comfy-venv", selected: true }],
    gpus: [{ name: "NVIDIA GeForce RTX 4090", index: 0, driverVersion: "560.94", vramTotalBytes: 24 * 1024 * 1024 * 1024 }],
    items: [
      { id: "comfyui-api", label: "ComfyUI 服务", ok: !errorFixture, detail: errorFixture ? "无法连接 · http://127.0.0.1:8188/system_stats" : "运行中 · http://127.0.0.1:8188/system_stats", path: "http://127.0.0.1:8188", status: errorFixture ? "missing" : "available" },
      { id: "nvidia", label: "NVIDIA GPU", ok: !errorFixture, detail: errorFixture ? "驱动检测失败" : "RTX 4090 · 24 GB", path: "NVIDIA", status: errorFixture ? "missing" : "available" },
      { id: "ffmpeg", label: "FFmpeg", ok: false, detail: "未找到可选媒体工具", optional: true, status: "warning", downloadUrl: "https://ffmpeg.org/download.html" }
    ],
    modelDirectory,
    outputDirectory: settings.outputDirectory || root + "/output",
    llamaServer: { found: true, path: root + "/llama-server.exe", directory: root, source: "fixture" },
    comfyCompatibility: { version: errorFixture ? "0.29.0" : "0.33.1", revision: errorFixture ? "fixture-broken" : "fixture-main", h3MinimumVersion: "0.31.0", h3MinimumRevision: "fixture-min", h3RecommendedVersion: "0.33.1", h3RecommendedRevision: "fixture-rec", h3CoreSupported: !errorFixture, coreNodes: [{ id: "LoadDiffusionModel", label: "LoadDiffusionModel", available: !errorFixture }], promptCoreSupported: false, promptCoreNodes: [{ id: "TextGenerate", label: "TextGenerate", available: false }], checkedFrom: "source", updateMode: "git", updateHint: errorFixture ? "Fixture 兼容性检查失败，请修复或更新后重新扫描。" : "Fixture 可演示更新入口和版本证据。", compatibilityState: errorFixture ? "error" : "supported", compatibilityNotice: errorFixture ? "Fixture compatibility check failed." : "" },
    attentionAcceleration: { pythonPath: root + "/venv/Scripts/python.exe", pythonVersion: "3.12.4", torchVersion: "2.7.0+cu128", cudaVersion: "12.8", gpuName: "RTX 4090", gpuArchitecture: "sm_89", sageAttentionVersion: "2.2.0", tritonVersion: "3.3.0", kjNodesInstalled: true, kjNodesCompatible: true, recommendedSageVersion: "2.2.0", recommendedWheel: "fixture-wheel", supported: true, ready: true, detail: "Fixture acceleration ready" },
    modelProfiles: [videoProfile, promptProfile, imageProfile, upscaleProfile],
    customNodes: [missingNode],
    workflowDependencies: [{ id: "minimax_h3_i2v", name: "H3 Image-to-Video Workflow", purpose: "H3 图生视频工作流", installed: false, path: "", sourceUrl: "https://github.com/fixture/h3-workflow" }],
    issues: [{ id: "comfy-database", label: errorFixture ? "ComfyUI compatibility check failed" : "ComfyUI database needs attention", detail: errorFixture ? "Fixture error: selected core is below the supported range; update or choose another installation." : "Fixture warning: database migration can be repaired from Settings.", severity: errorFixture ? "error" : "warning", repairable: true, repairLabel: errorFixture ? "Repair compatibility" : "Repair fixture" }]
  });
};
const setSettingsFixture = (kind) => {
  currentSettingsFixture = ["offline", "scanning", "installing", "partial", "error"].includes(kind) ? kind : "offline";
  return currentSettingsFixture;
};
const emptyLibraryScan = { libraryDirectory: "", totalReferences: 0, managedReferences: 0, archiveCandidates: 0, missingReferences: [], orphanFiles: [], archiveBytes: 0, orphanBytes: 0 };
const api = {
  getState: async () => clone(currentState), getComfyRuntimeState: async () => clone(runtimeState), getAppVersion: async () => ${JSON.stringify(packageJson.version)}, setSettingsDirty: async () => {}, respondWindowClose: async () => {},
  getFixtureQueueState: () => currentQueueFixture, setQueueFixture, emitFixtureRunningSmoke, setSettingsFixture,
  saveDraft: async (draft) => { currentState.draft = clone(draft); emitState(); return clone(currentState); }, saveImageDraft: async (draft) => { currentState.imageDraft = clone(draft); emitState(); return clone(currentState); }, saveSettings: async (settings) => { currentState.settings = clone(settings); emitState(); return clone(currentState); }, setQueueH3LivePreview: async (enabled) => { currentState.settings.h3LivePreview = enabled; emitState(); return clone(currentState); },
  pickImage: async () => fixturePickerEnabled ? fixtureImagePath : null, pickVideo: async () => fixturePickerEnabled ? fixtureVideoPath : null, setFixturePickerEnabled: (enabled) => { fixturePickerEnabled = Boolean(enabled); return fixturePickerEnabled; }, getFixtureStats: () => clone(fixtureStats), getDroppedFilePath: (file) => file?.path || (file?.name === "fixture-image.png" ? fixtureImagePath : file?.name === "fixture-video.mp4" ? fixtureVideoPath : ""), saveClipboardImage: async () => "", readImageMarkup: async () => null, saveImageMarkup: async () => ({}), saveImageMask: async () => ({}), saveImageCrop: async () => null, pickWorkflow: async () => null, pickPython: async () => null, inspectWorkflow: async () => ({ supportsEndImage: false, supportsVideoExtension: false }), getBundledWorkflow: async () => null,
  getPerformanceMetrics: async () => metrics(), readAppLogs: async () => ({ directory: "", retentionDays: 7, records: [], text: "" }), openAppLogDirectory: async () => true, reportRendererError: async () => {}, reportUserAction: async () => {}, reportNotification: async () => {}, pickDirectory: async () => null, readImage: async () => imageDataUrl, readHistoryCover: async () => imageDataUrl, saveHistoryCover: async () => true, showItemInFolder: async () => true, openDirectory: async () => true, copyFile: async () => result(), openExternal: async () => true,
  enhancePrompt: async () => "", cancelPrompt: async () => result(), startPromptModel: async () => result(), releasePromptModel: async () => result(), testConnection: async () => result(), scanEnvironment: async (settings) => currentSettingsFixture === "scanning" ? new Promise(() => {}) : settingsScan(settings), startLocalService: async () => result(), restartLocalService: async () => result(), forceStopComfyProcesses: async () => result(), updateComfyUi: async () => result(), repairEnvironmentIssue: async () => result(), installCustomNode: async () => currentSettingsFixture === "installing" ? new Promise(() => {}) : result(), installWorkflowDependency: async () => result(), installLlamaCppPython: async () => result(), installAttentionAcceleration: async () => result(),
  enqueue: async () => { fixtureStats.enqueue += 1; await delay(80); return clone(currentState); }, enqueueExtension: async () => { fixtureStats.enqueueExtension += 1; await delay(80); return clone(currentState); }, enqueueImageEdit: async () => { fixtureStats.imageEdit += 1; await delay(80); return clone(currentState); }, enqueueUpscale: async () => clone(currentState), updateUpscaleTask: async () => clone(currentState), removeTask: async () => clone(currentState), startQueue: async () => clone(currentState), pauseQueue: async () => clone(currentState), cancelTask: async () => clone(currentState), moveTask: async () => clone(currentState), duplicateTask: async () => clone(currentState), resetTask: async () => clone(currentState), deleteHistoryAsset: async () => clone(currentState), updateHistoryMetadata: async () => clone(currentState), setImageHistoryCover: async () => clone(currentState), deleteImageHistoryVersion: async () => clone(currentState),
  onStateChanged: (listener) => { stateListeners.add(listener); return () => stateListeners.delete(listener); }, onComfyRuntimeStateChanged: (listener) => { runtimeListeners.add(listener); return () => runtimeListeners.delete(listener); }, onTaskPreview: (listener) => { taskPreviewListeners.add(listener); return () => taskPreviewListeners.delete(listener); }, onPromptProgress: () => () => {}, onWindowCloseRequest: () => () => {}, onAttentionInstallLog: () => () => {}, onDependencyInstallLog: () => () => {}, onHistoryMigrationProgress: () => () => {}, scanImageAssetLibrary: async () => clone(emptyLibraryScan), organizeImageAssetLibrary: async () => ({ scan: clone(emptyLibraryScan), archivedFiles: 0, reorganizedFiles: 0, updatedReferences: 0, cleanedFiles: 0, cleanedDirectories: 0, cleanedBytes: 0 }), cleanupImageAssetLibrary: async () => ({ scan: clone(emptyLibraryScan), archivedFiles: 0, reorganizedFiles: 0, updatedReferences: 0, cleanedFiles: 0, cleanedDirectories: 0, cleanedBytes: 0 }), onImageAssetLibraryProgress: () => () => {}
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
      show: options.smoke,
      webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: false }
    });
    if (options.smoke) window.focus();
    window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
      console.log(`[renderer-console:${level}] ${message} (${sourceId}:${line})`);
    });
    window.webContents.on("render-process-gone", (_event, details) => {
      console.error(`[renderer-capture] render process gone: ${JSON.stringify(details)}`);
    });
    window.webContents.on("unresponsive", () => console.error("[renderer-capture] renderer unresponsive"));
    window.webContents.on("responsive", () => console.log("[renderer-capture] renderer responsive"));
    window.setMinimumSize(320, 320);
    try {
      for (const { fixture } of viewportEntries) {
        console.log(`[renderer-capture] loading ${fixture.id} ${viewport.id}`);
        const rendererUrl = new URL(process.env.UX_UI_RENDERER_URL || "http://127.0.0.1:5173/");
        if (fixture.settingsState) rendererUrl.searchParams.set("uxSettingsState", fixture.settingsState);
        await window.loadURL(rendererUrl.toString());
        window.webContents.setZoomFactor(options.zoom);
        await waitForDom(window, "Boolean(document.querySelector('.app-shell'))", `${fixture.id} initial shell`);
        if (options.smoke) {
          window.show();
          window.focus();
          window.focusOnWebView();
          window.webContents.focus();
        }
        await setupFixture(window, fixture, options);
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
  console.log(`Fixtures: ${(options.settingsStates ? manifest.settingsStateFixtures ?? [] : manifest.fixtures).length}`);
  console.log(`Screenshots: ${entries.length}`);
  for (const { fixture, viewport } of entries) console.log(`${fixture.id}\t${viewport.id}\t${fixture.route}`);
  app.quit();
} else {
  (async () => {
    try {
      console.log("[renderer-capture] preparing state");
      const state = await prepareSyntheticState(options.locale, options.historyCount);
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
