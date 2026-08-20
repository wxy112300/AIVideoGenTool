const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const workspace = path.resolve(__dirname, "..");
const manifestPath = path.join(workspace, "docs", "ux-ui-baseline.manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

// Baseline capture must be deterministic on machines whose Electron GPU process
// cannot start. This affects only the hidden screenshot window, not the app.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("in-process-gpu");

function printHelp() {
  console.log(`Usage: electron scripts/capture-ux-ui-baseline.cjs [options]

Options:
  --help       Show this help.
  --dry-run    Print the capture matrix without starting Electron.
  --theme      Capture theme: current (default) or graphite.
  --output     Override the output directory (default: temp/ux-ui-baseline).
`);
}

function parseArgs(argv) {
  const options = { dryRun: false, output: null, theme: "current" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--dry-run") {
      options.dryRun = true;
    } else if (argument === "--theme") {
      options.theme = argv[++index];
      if (!options.theme || !["current", "graphite"].includes(options.theme)) {
        throw new Error("--theme must be current or graphite");
      }
    } else if (argument === "--output") {
      options.output = argv[++index];
      if (!options.output) throw new Error("--output requires a directory");
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  return options;
}

function uniqueViewports(capture) {
  const ids = [...new Set(capture.viewportGroups.flatMap((group) => manifest.viewportGroups[group] ?? []))];
  return ids.map((id) => manifest.viewports.find((viewport) => viewport.id === id)).filter(Boolean);
}

function captureEntries() {
  return manifest.fixtures.flatMap((fixture) => uniqueViewports(fixture).map((viewport) => ({ fixture, viewport })));
}

function outputRoot(options) {
  const configuredRoot = options.output ?? path.join(manifest.captureOutputRoot, options.theme === "current" ? "" : options.theme);
  return path.resolve(workspace, configuredRoot);
}

function outputPath(root, fixture, viewport) {
  return path.join(root, viewport.id, `${fixture.id}.png`);
}

function fixtureScript(fixture, theme) {
  const setup = fixture.setup ?? { kind: "static" };
  return `(() => {
    const root = document.querySelector('.studio-prototype');
    if (${JSON.stringify(theme)} === 'graphite') root?.setAttribute('data-theme', 'cinematic-graphite');
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const click = (selector) => document.querySelector(selector)?.click();
    const setQueueHeader = (label, bad) => {
      const badge = document.querySelector('main > .page-head .page-title .badge');
      if (!badge) return;
      badge.textContent = label;
      badge.classList.toggle('ok', !bad);
      badge.classList.toggle('bad', bad);
    };
    const queueSections = () => [...document.querySelectorAll('main > section')].filter((section) => !section.classList.contains('page-head'));
    const makeEmptyQueue = () => {
      queueSections().forEach((section) => { section.hidden = true; section.style.display = 'none'; });
      setQueueHeader('队列为空', false);
      const empty = document.createElement('section');
      empty.className = 'panel';
      empty.dataset.baselineSynthetic = 'queue-empty';
      empty.innerHTML = '<div class="empty-state" style="text-align:center;padding:48px 20px"><strong>还没有排队任务</strong><p class="muted">从创建页提交一个任务后，它会出现在这里。</p><a class="btn primary" href="./create.html">创建任务</a></div>';
      document.querySelector('main')?.append(empty);
    };
    const isolateFailedQueue = () => {
      const sections = queueSections();
      sections.forEach((section, index) => {
        const hidden = index !== sections.length - 1;
        section.hidden = hidden;
        section.style.display = hidden ? 'none' : '';
      });
      setQueueHeader('需要处理', true);
    };
    const setup = async () => {
      if (${JSON.stringify(setup.kind)} === 'create-mode') click('[data-input-mode="${setup.value}"]');
      if (${JSON.stringify(setup.kind)} === 'history') {
        click('[data-history-kind="${setup.historyKind}"]');
        click('[data-layout="${setup.layout}"]');
      }
      if (${JSON.stringify(setup.kind)} === 'settings-tab') click('[data-settings-tab="${setup.value}"]');
      if (${JSON.stringify(setup.kind)} === 'queue-state' && ${JSON.stringify(setup.value)} === 'failed') isolateFailedQueue();
      if (${JSON.stringify(setup.kind)} === 'queue-state' && ${JSON.stringify(setup.value)} === 'empty') makeEmptyQueue();
      await nextFrame();
      return { ready: Boolean(root), synthetic: document.querySelector('[data-baseline-synthetic]')?.dataset.baselineSynthetic ?? null };
    };
    return setup();
  })()`;
}

async function waitForPage(window) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const ready = await window.webContents.executeJavaScript("Boolean(document.querySelector('.studio-prototype'))");
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Prototype page did not become ready");
}

async function captureAll(options) {
  const entries = captureEntries();
  const root = outputRoot(options);
  await fsp.mkdir(root, { recursive: true });
  const window = new BrowserWindow({ width: 1280, height: 800, show: false, webPreferences: { sandbox: false } });
  try {
    for (const { fixture, viewport } of entries) {
      const sourcePath = path.join(workspace, manifest.prototypeRoot, fixture.prototypeFile);
      if (!fs.existsSync(sourcePath)) throw new Error(`Missing prototype: ${sourcePath}`);
      window.setContentSize(viewport.width, viewport.height);
      await window.loadFile(sourcePath);
      await waitForPage(window);
      await window.webContents.executeJavaScript(fixtureScript(fixture, options.theme));
      const screenshot = await window.webContents.capturePage();
      const target = outputPath(root, fixture, viewport);
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.writeFile(target, screenshot.toPNG());
      console.log(`${fixture.id} ${viewport.id} -> ${path.relative(workspace, target)}`);
    }
  } finally {
    window.destroy();
  }
  console.log(`Captured ${entries.length} baseline screenshots in ${path.relative(workspace, root)}`);
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  printHelp();
  app.quit();
} else if (options.dryRun) {
  const entries = captureEntries();
  console.log(`Baseline source: ${manifest.sourceCommit}`);
  console.log(`Theme: ${options.theme}`);
  console.log(`Fixtures: ${manifest.fixtures.length}`);
  console.log(`Screenshots: ${entries.length}`);
  for (const { fixture, viewport } of entries) console.log(`${fixture.id}\t${viewport.id}\t${fixture.prototypeFile}`);
  app.quit();
} else {
  app.whenReady().then(async () => {
    try {
      await captureAll(options);
    } catch (error) {
      console.error(error instanceof Error ? error.stack : String(error));
      process.exitCode = 1;
    } finally {
      app.quit();
    }
  });
}
