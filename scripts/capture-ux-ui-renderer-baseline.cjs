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
  --smoke       Run the isolated Create, Queue, or History interaction smoke check.
  --history-count Capture History fixtures with 1 or 8 records (default: 1).
  --queue-state Override a queue-state fixture: mixed, running, paused, failed, recoverable, empty, or multiple-pending.
`);
}

function parseArgs(argv) {
  const options = { dryRun: false, output: null, fixture: null, viewport: null, locale: "zh-CN", zoom: 1, diagnose: false, smoke: false, historyCount: 1, queueState: null };
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
    const videoSeed = state.history[0];
    state.history = Array.from({ length: historyCount }, (_, index) => {
      const suffix = index + 1;
      const asset = cloneFixture(videoSeed);
      asset.id = `${videoSeed.id}-${suffix}`;
      asset.taskId = `${videoSeed.taskId}-${suffix}`;
      asset.title = `${videoSeed.title} ${suffix}`;
      asset.comfyPromptId = `${videoSeed.comfyPromptId}-${suffix}`;
      asset.defaultVersionId = `${videoSeed.defaultVersionId}-${suffix}`;
      asset.versions = asset.versions.map((version) => ({
        ...version,
        id: `${version.id}-${suffix}`,
        taskId: `${version.taskId}-${suffix}`,
        comfyPromptId: `${version.comfyPromptId}-${suffix}`
      }));
      return asset;
    });
    const imageSeed = state.imageHistory[0];
    state.imageHistory = Array.from({ length: historyCount }, (_, index) => {
      const suffix = index + 1;
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
        comfyPromptId: version.comfyPromptId ? `${version.comfyPromptId}-${suffix}` : version.comfyPromptId
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
  await executeJavaScript(window, `setTimeout(() => document.querySelector(${JSON.stringify(selector)})?.click(), 0); true`);
  if (expression) await waitForDom(window, expression, label);
  await wait(80);
}

async function setupFixture(window, fixture, options) {
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

  const opened = await executeJavaScript(window, `(() => {
    const card = document.querySelector(${cardSelectorLiteral});
    if (!card) return false;
    card.click();
    return true;
  })()`);
  await waitForDom(window, `Boolean(document.querySelector(${detailSelectorLiteral}))`, `${fixture.id} detail`);
  const detailOpened = await executeJavaScript(window, `Boolean(document.querySelector(${detailSelectorLiteral}))`);
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
    layout: document.querySelector('.history-gallery')?.classList.contains('album') === true
  })`);
  const checks = {
    filterPanelOpened: openFilter === true,
    filterApplied: filterApplied === true,
    noResults: noResults.empty && noResults.result.startsWith("0/"),
    filterCleared: clearFilter === true && filterCleared.card && filterCleared.activeDot === false,
    filterClosed: closeFilter === true,
    masonryLayout: masonryClicked === true,
    albumLayout: albumClicked === true,
    detailOpened: opened === true && detailOpened,
    deleteConfirmation: deleteRequested === true && deleteConfirmation,
    deleteCancelled: deleteCancelled === true,
    detailReturned: returned === true && after.heading && after.historyNavSelected && after.card && after.layout
  };
  const passed = Object.values(checks).every(Boolean);
  console.log(`[renderer-smoke] ${fixture.id} ${viewport.id} history ${JSON.stringify({ noResults, filterCleared, after, checks, passed })}`);
  if (!passed) throw new Error(`History interaction smoke failed: ${JSON.stringify({ noResults, filterCleared, after, checks })}`);
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
const emptyLibraryScan = { libraryDirectory: "", totalReferences: 0, managedReferences: 0, archiveCandidates: 0, missingReferences: [], orphanFiles: [], archiveBytes: 0, orphanBytes: 0 };
const api = {
  getState: async () => clone(currentState), getComfyRuntimeState: async () => clone(runtimeState), getAppVersion: async () => ${JSON.stringify(packageJson.version)}, setSettingsDirty: async () => {}, respondWindowClose: async () => {},
  getFixtureQueueState: () => currentQueueFixture, setQueueFixture, emitFixtureRunningSmoke,
  saveDraft: async (draft) => { currentState.draft = clone(draft); emitState(); return clone(currentState); }, saveImageDraft: async (draft) => { currentState.imageDraft = clone(draft); emitState(); return clone(currentState); }, saveSettings: async (settings) => { currentState.settings = clone(settings); emitState(); return clone(currentState); }, setQueueH3LivePreview: async (enabled) => { currentState.settings.h3LivePreview = enabled; emitState(); return clone(currentState); },
  pickImage: async () => fixturePickerEnabled ? fixtureImagePath : null, pickVideo: async () => fixturePickerEnabled ? fixtureVideoPath : null, setFixturePickerEnabled: (enabled) => { fixturePickerEnabled = Boolean(enabled); return fixturePickerEnabled; }, getFixtureStats: () => clone(fixtureStats), getDroppedFilePath: (file) => file?.path || (file?.name === "fixture-image.png" ? fixtureImagePath : file?.name === "fixture-video.mp4" ? fixtureVideoPath : ""), saveClipboardImage: async () => "", readImageMarkup: async () => null, saveImageMarkup: async () => ({}), saveImageMask: async () => ({}), saveImageCrop: async () => null, pickWorkflow: async () => null, pickPython: async () => null, inspectWorkflow: async () => ({ supportsEndImage: false, supportsVideoExtension: false }), getBundledWorkflow: async () => null,
  getPerformanceMetrics: async () => metrics(), readAppLogs: async () => ({ directory: "", retentionDays: 7, records: [], text: "" }), openAppLogDirectory: async () => true, reportRendererError: async () => {}, reportUserAction: async () => {}, reportNotification: async () => {}, pickDirectory: async () => null, readImage: async () => imageDataUrl, readHistoryCover: async () => imageDataUrl, saveHistoryCover: async () => true, showItemInFolder: async () => true, openDirectory: async () => true, copyFile: async () => result(), openExternal: async () => true,
  enhancePrompt: async () => "", cancelPrompt: async () => result(), startPromptModel: async () => result(), releasePromptModel: async () => result(), testConnection: async () => result(), scanEnvironment: async (settings) => emptyScan(settings), startLocalService: async () => result(), restartLocalService: async () => result(), forceStopComfyProcesses: async () => result(), updateComfyUi: async () => result(), repairEnvironmentIssue: async () => result(), installCustomNode: async () => result(), installWorkflowDependency: async () => result(), installLlamaCppPython: async () => result(), installAttentionAcceleration: async () => result(),
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
    try {
      for (const { fixture } of viewportEntries) {
        console.log(`[renderer-capture] loading ${fixture.id} ${viewport.id}`);
        await window.loadURL(process.env.UX_UI_RENDERER_URL || "http://127.0.0.1:5173/");
        window.webContents.setZoomFactor(options.zoom);
        await waitForDom(window, "Boolean(document.querySelector('.app-shell'))", `${fixture.id} initial shell`);
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
  console.log(`Fixtures: ${manifest.fixtures.length}`);
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
